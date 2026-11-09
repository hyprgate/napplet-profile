<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { NostrEvent } from 'applesauce-core/helpers/event';
  import { format as timeago } from 'timeago.js';
  import { intent, relay } from '@napplet/sdk';
  import {
    invokeNappletIntent,
    clientTagValue,
    createNoteViewerOpenIntentRequest,
    createNoteViewerOpenPayload,
    formatMillisatsAsSats,
    resourceImage,
  } from '@hyprgate/utils';
  import { createIntentRequest, parseIntentResult, type IntentRequest } from '@hyprgate/types';
  import type { EngagementCounts, ReactionGroup } from '../lib/profile-store';
  import {
    customReactionInput,
    reactionInputFromEmojiOption,
    type EmojiOption,
  } from '../lib/emoji-sets';
  import { PROFILE_NOTE_PREVIEW_CHARS, previewProfileNoteContent, tightenImageSpacing } from '../lib/profile-content';
  import { profileReplyContextForNote, profileReplyTargetPubkey } from '../lib/profile-reply-context';
  import ProfileNoteContent from './ProfileNoteContent.svelte';
  import ProfileNoteEmbeds from './ProfileNoteEmbeds.svelte';
  import ProfileReplyContextLink from './ProfileReplyContextLink.svelte';
  import EmojiSelector from './EmojiSelector.svelte';

  interface Props {
    notes: NostrEvent[];
    notesLoading?: boolean;
    /** False when a parent scroller holds both the header and the notes. */
    ownScroll?: boolean;
    engagement: Map<string, EngagementCounts>;
    engagementVersion: number;
    reactionOptions: EmojiOption[];
    showReplies: boolean;
    profileLabel: (pubkey: string) => string;
    onloadmore: () => void;
    onshowreplieschange: (showReplies: boolean) => void;
  }

  let {
    notes,
    notesLoading = false,
    ownScroll = true,
    engagement,
    engagementVersion,
    reactionOptions,
    showReplies,
    profileLabel,
    onloadmore,
    onshowreplieschange,
  }: Props = $props();

  let openMenuNoteId = $state<string | null>(null);
  let customReaction = $state('');
  let expandedNotes = $state(new Set<string>());
  let root: HTMLDivElement | undefined = $state(undefined);

  function toggleExpanded(noteId: string): void {
    const next = new Set(expandedNotes);
    if (next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    expandedNotes = next;
  }

  $effect(() => {
    const noteId = openMenuNoteId;
    if (!noteId) return;
    const picker = () => root?.querySelector<HTMLElement>(`[data-reaction-picker="${noteId}"]`);
    const onPointerDown = (event: PointerEvent): void => {
      if (!picker()?.contains(event.target as Node)) openMenuNoteId = null;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const trigger = picker()?.querySelector<HTMLElement>('button');
      openMenuNoteId = null;
      trigger?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  function toggleReactionMenu(noteId: string): void {
    openMenuNoteId = openMenuNoteId === noteId ? null : noteId;
    customReaction = '';
  }

  async function reactWith(note: NostrEvent, input: { content: string; tags?: string[][] }): Promise<void> {
    if (!input.content) return;
    openMenuNoteId = null;
    await sendReaction(note, input.content, input.tags ?? []);
  }

  async function reactCustom(note: NostrEvent): Promise<void> {
    const input = customReactionInput(customReaction, reactionOptions);
    customReaction = '';
    await reactWith(note, input);
  }

  let sentinel: HTMLDivElement | undefined = $state(undefined);
  let reactingId = $state<string | null>(null);
  let reactionError = $state<string | null>(null);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdingKey = $state<string | null>(null);
  let completedKey = $state<string | null>(null);

  const HOLD_MS = 650;

  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onloadmore();
      },
      { rootMargin: '100px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  let engagementMap = $derived.by(() => {
    engagementVersion;
    return engagement;
  });

  function sortReactionGroups(groups: ReactionGroup[]): ReactionGroup[] {
    return [...groups].sort((a, b) => {
      if (a.content === '+' && b.content !== '+') return -1;
      if (b.content === '+' && a.content !== '+') return 1;
      if (a.content === '-' && b.content !== '-') return -1;
      if (b.content === '-' && a.content !== '-') return 1;
      return b.count - a.count || a.content.localeCompare(b.content);
    });
  }

  async function invoke(request: IntentRequest | null): Promise<void> {
    if (!request) return;
    try {
      const result = parseIntentResult(await invokeNappletIntent(request));
      if (!result || result.archetype !== request.archetype || result.action !== (request.action ?? 'open')) return;
      if (!result.ok) return;
    } catch {
      // Keep the existing no-op failure behavior when navigation is unavailable.
    }
  }

  async function openNote(note: NostrEvent): Promise<void> {
    const payload = createNoteViewerOpenPayload({
      target: { type: 'event', id: note.id, kind: note.kind, pubkey: note.pubkey },
      behavior: { focus: true },
      source: { napplet: 'profile' },
    });
    await invoke(payload ? createNoteViewerOpenIntentRequest(payload) : null);
  }

  async function replyTo(note: NostrEvent): Promise<void> {
    await invoke(createIntentRequest({
      archetype: 'composer',
      payload: {
        source: { napplet: 'profile' },
        intent: 'reply',
        replyTo: {
          id: note.id,
          pubkey: note.pubkey,
          kind: note.kind,
          content: note.content,
          created_at: note.created_at,
        },
      },
    }));
  }

  async function sendReaction(note: NostrEvent, content = '+', tags: string[][] = []): Promise<void> {
    if (reactingId) return;
    reactingId = note.id;
    reactionError = null;
    try {
      await relay.publish({
        kind: 7,
        content,
        tags: [
          ['e', note.id],
          ['p', note.pubkey],
          ['k', String(note.kind)],
          ...tags,
          ['client', '@hyprgate/profile/reaction'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      reactionError = error instanceof Error ? error.message : 'Reaction failed';
    } finally {
      reactingId = null;
    }
  }

  function resendReaction(note: NostrEvent, group: ReactionGroup): void {
    const tags = group.shortcode && group.imageUrl ? [['emoji', group.shortcode, group.imageUrl]] : [];
    void sendReaction(note, group.content, tags);
  }

  function holdKey(note: NostrEvent, group: ReactionGroup): string {
    return `${note.id}:${group.content}`;
  }

  function startReactionHold(note: NostrEvent, group: ReactionGroup): void {
    cancelReactionHold();
    const key = holdKey(note, group);
    holdingKey = key;
    holdTimer = setTimeout(() => {
      const tags = group.shortcode && group.imageUrl ? [['emoji', group.shortcode, group.imageUrl]] : [];
      void sendReaction(note, group.content, tags).then(() => {
        completedKey = key;
        setTimeout(() => {
          if (completedKey === key) completedKey = null;
        }, 520);
      });
      holdingKey = null;
      holdTimer = null;
    }, HOLD_MS);
  }

  function cancelReactionHold(): void {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdingKey = null;
  }

  onDestroy(cancelReactionHold);
</script>

{#snippet heart()}
  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" /></svg>
{/snippet}

<div class="profile-notes flex-1 {ownScroll ? 'overflow-y-auto' : ''}" bind:this={root}>
  <div class="notes-toolbar">
    <span class="toolbar-title">Notes</span>
    <button
      type="button"
      class="reply-toggle"
      class:active={showReplies}
      aria-pressed={showReplies}
      onclick={() => onshowreplieschange(!showReplies)}
    >
      <span class="toggle-box" aria-hidden="true"></span>
      Replies
    </button>
  </div>

  {#if notes.length === 0}
    <div class="notes-empty" role="status">
      {notesLoading ? 'Loading notes...' : 'No notes found on the relays we could reach.'}
    </div>
  {:else}
    <ul class="divide-y divide-border-dim">
      {#each notes as note (note.id)}
        {@const counts = engagementMap.get(note.id)}
        {@const groups = sortReactionGroups(counts?.reactionGroups ?? [])}
        {@const ctx = profileReplyContextForNote(note)}
        {@const replyTarget = ctx ? profileReplyTargetPubkey(note, ctx) : null}
        {@const body = tightenImageSpacing(note.content)}
        {@const expanded = expandedNotes.has(note.id)}
        <li class="note-row">
          <div class="note-meta">
            <span>{timeago(note.created_at * 1000)}</span>
            {#if clientTagValue(note)}
              {@const client = clientTagValue(note)}
              <span class="note-client" title="Published with {client}">via {client}</span>
            {/if}
            {#if ctx}
              <span class="reply-badge">{ctx.label}</span>
            {/if}
          </div>
          {#if ctx}
            <div class="reply-context" aria-label="Reply context">
              <div>Replying to <ProfileReplyContextLink reference={ctx.parent} text={replyTarget ? `${profileLabel(replyTarget)}'s note` : 'this note'} /></div>
              {#if ctx.root}
                <div>In <ProfileReplyContextLink reference={ctx.root} text="this thread" /></div>
              {/if}
            </div>
          {/if}
          <div class="note-content">
            <ProfileNoteContent content={expanded ? body : previewProfileNoteContent(body)} emojiTags={note.tags} {profileLabel} />
            {#if body.length > PROFILE_NOTE_PREVIEW_CHARS}
              <button type="button" class="more-toggle" aria-expanded={expanded} onclick={() => toggleExpanded(note.id)}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            {/if}
            <ProfileNoteEmbeds content={note.content} {profileLabel} />
          </div>
          <div class="note-footer">
            <div class="note-actions">
              <button type="button" onclick={() => openNote(note)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                Open
              </button>
              <button type="button" onclick={() => replyTo(note)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H4l2.5-3.5A8 8 0 1 1 21 12z" /></svg>
                Reply
              </button>
              <div class="reaction-picker" data-reaction-picker={note.id}>
                <button
                  type="button"
                  disabled={reactingId === note.id}
                  aria-haspopup="menu"
                  aria-expanded={openMenuNoteId === note.id}
                  onclick={() => toggleReactionMenu(note.id)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" /></svg>
                  {reactingId === note.id ? 'Reacting...' : 'React'}
                </button>
                {#if openMenuNoteId === note.id}
                  <div class="reaction-menu" role="menu" aria-label="Select reaction">
                    {#if reactionOptions.length > 0}
                      <div class="reaction-grid">
                        {#each reactionOptions as option (option.content)}
                          <button
                            type="button"
                            role="menuitem"
                            title={option.label}
                            onclick={() => void reactWith(note, reactionInputFromEmojiOption(option))}
                          >
                            {#if option.imageUrl}
                              <img use:resourceImage={option.imageUrl} alt={option.label} loading="lazy" />
                            {:else}
                              {option.content}
                            {/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                    <div class="emoji-library-row">
                      <EmojiSelector
                        buttonLabel="All emoji"
                        title="Search all Unicode emoji"
                        onselect={(emoji) => void reactWith(note, { content: emoji })}
                      />
                    </div>
                    <!-- Not a <form>: submit never fires under sandbox="allow-scripts". -->
                    <div class="custom-reaction">
                      <input
                        bind:value={customReaction}
                        placeholder="emoji or :code:"
                        aria-label="Custom reaction"
                        maxlength="32"
                        onkeydown={(key) => {
                          if (key.key !== 'Enter' || key.isComposing) return;
                          key.preventDefault();
                          void reactCustom(note);
                        }}
                      />
                      <button type="button" disabled={!customReaction.trim()} onclick={() => void reactCustom(note)}>Send</button>
                    </div>
                  </div>
                {/if}
              </div>
              {#if reactionError && reactingId === null}
                <span class="error" role="status">{reactionError}</span>
              {/if}
            </div>
            <div class="engagement-row" role="group" aria-label="Engagement counts">
              {#if groups.length > 0}
                {#each groups as group (group.content)}
                  <button
                    type="button"
                    class="pill reaction"
                    class:hold-active={holdingKey === holdKey(note, group)}
                    class:send-complete={completedKey === holdKey(note, group)}
                    title="{group.count} {group.content}. Hold to send one too"
                    aria-label="{group.count} {group.content} reactions, send one too"
                    onpointerdown={() => startReactionHold(note, group)}
                    onpointerup={cancelReactionHold}
                    onpointerleave={cancelReactionHold}
                    onpointercancel={cancelReactionHold}
                    onclick={(click) => { if (click.detail === 0) resendReaction(note, group); }}
                  >
                    {#if group.imageUrl}
                      <img use:resourceImage={group.imageUrl} alt={group.shortcode ?? group.content} loading="lazy" />
                    {:else if group.content === '+'}
                      {@render heart()}
                    {:else}
                      <span>{group.content}</span>
                    {/if}
                    <span>{group.count}</span>
                  </button>
                {/each}
              {:else}
                <span class="pill reaction" class:zero={!counts?.reactions} role="img" aria-label="{counts?.reactions ?? 0} reactions" title="{counts?.reactions ?? 0} reactions">
                  {@render heart()}
                  <span>{counts?.reactions ?? 0}</span>
                </span>
              {/if}
              <span class="pill reply" class:zero={!counts?.comments} role="img" aria-label="{counts?.comments ?? 0} replies" title="{counts?.comments ?? 0} replies">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H4l2.5-3.5A8 8 0 1 1 21 12z" /></svg>
                <span>{counts?.comments ?? 0}</span>
              </span>
              <span class="pill zap" class:zero={!counts?.zaps} role="img" aria-label="{counts && counts.zaps > 0 ? formatMillisatsAsSats(counts.zapMillisats) : '0 zaps'}" title="{counts && counts.zaps > 0 ? formatMillisatsAsSats(counts.zapMillisats) : '0 zaps'}">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" /></svg>
                <span>{counts && counts.zaps > 0 ? formatMillisatsAsSats(counts.zapMillisats) : 0}</span>
              </span>
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if !notesLoading}
      <p class="notes-end">That's everything we could find.</p>
    {/if}
    <div bind:this={sentinel} class="h-4"></div>
  {/if}
</div>

<style>
  .notes-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--hg-border-dim, #303030);
    background: var(--hg-bg-base, #050505);
  }

  .toolbar-title {
    color: var(--hg-text-primary, #f2efe7);
    font-size: 12px;
    font-weight: 600;
  }

  .profile-notes :global(button:focus-visible),
  .profile-notes :global(a:focus-visible),
  .profile-notes :global(input:focus-visible) {
    outline: 2px solid var(--hg-accent-focus, var(--hg-accent-primary, #9be564));
    outline-offset: 1px;
  }

  .reply-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
    background: transparent;
    color: var(--hg-text-muted, #b8b1a4);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  .note-actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--hg-text-muted, #b8b1a4);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  .note-actions button:hover:not(:disabled),
  .note-actions button[aria-expanded='true'] {
    border-color: var(--hg-border, #303030);
    background: var(--hg-bg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
  }

  .reply-toggle:hover {
    color: var(--hg-text-primary, #f2efe7);
  }

  .reply-toggle.active {
    border-color: var(--hg-accent-green, #9be564);
    color: var(--hg-text-primary, #f2efe7);
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 14%, transparent);
  }

  .toggle-box {
    width: 8px;
    height: 8px;
    border: 1px solid currentColor;
    border-radius: 2px;
  }

  .reply-toggle.active .toggle-box {
    border-color: var(--hg-accent-green, #9be564);
    background: var(--hg-accent-green, #9be564);
  }

  .notes-empty,
  .notes-end {
    margin: 0;
    padding: 24px 16px;
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 12px;
    text-align: center;
  }

  .notes-end {
    padding: 14px 16px 4px;
    font-size: 11px;
  }

  .note-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    margin-left: -6px;
  }

  svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .more-toggle {
    display: block;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--hg-accent-cyan, #82d8f7);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .more-toggle:hover {
    text-decoration: underline;
  }

  .note-content :global(.note-content img.media) {
    max-width: min(100%, 512px);
    max-height: 18rem;
  }

  .note-content :global(.note-content img.media.resource-pending) {
    width: min(100%, 512px);
  }

  .note-row {
    padding: 12px 16px;
    display: grid;
    gap: 7px;
  }

  .note-row:hover {
    background: color-mix(in srgb, var(--hg-bg-surface, #101010) 60%, transparent);
  }

  .note-meta,
  .engagement-row,
  .note-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 11px;
  }

  .note-client {
    opacity: 0.7;
  }

  .reply-badge {
    border: 1px solid var(--hg-accent-green, #9be564);
    border-radius: 999px;
    padding: 1px 6px;
    color: var(--hg-accent-green, #9be564);
    font-size: 10px;
  }

  .reply-context {
    display: grid;
    gap: 2px;
    padding: 6px 8px;
    border-left: 2px solid var(--hg-accent-green, #9be564);
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 8%, transparent);
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 11px;
    line-height: 1.35;
    word-break: break-word;
  }

  .note-content {
    color: var(--hg-text-primary, #f2efe7);
    font-size: 13px;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  /* Counts stay readable; only the empty ones recede until the note is active. */
  .pill.zero {
    opacity: 0.55;
    transition: opacity 0.15s ease;
  }

  .note-row:hover .pill.zero,
  .note-row:focus-within .pill.zero {
    opacity: 1;
  }

  .pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--hg-text-muted, #b8b1a4);
    font: inherit;
    font-size: 11px;
    overflow: hidden;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  button.pill {
    cursor: pointer;
  }

  button.pill::before {
    content: '';
    position: absolute;
    inset: 0;
    transform: scaleX(0);
    transform-origin: left center;
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 32%, transparent);
    pointer-events: none;
  }

  button.pill.hold-active::before {
    animation: hold-fill 650ms linear forwards;
  }

  button.pill.send-complete {
    animation: sent-pop 520ms ease-out;
  }

  .pill img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  .reply {
    color: var(--hg-accent-green, #9be564);
  }

  .zap {
    color: var(--hg-accent-yellow, #f7d774);
  }

  .error {
    color: var(--hg-accent-red, #ff6b6b);
    font-size: 11px;
  }

  .reaction-picker {
    position: relative;
  }

  .reaction-menu {
    position: absolute;
    left: 0;
    top: calc(100% + 4px);
    z-index: 10;
    width: min(280px, calc(100vw - 32px));
    display: grid;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--hg-border-dim, #303030);
    border-radius: 4px;
    background: var(--hg-bg-surface, #101010);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }

  .reaction-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .reaction-grid button {
    min-width: 28px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--hg-border-dim, #303030);
    border-radius: 4px;
    background: var(--hg-bg-base, #050505);
    color: var(--hg-text-primary, #f2efe7);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }

  .reaction-grid img {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .custom-reaction {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
  }

  .custom-reaction input {
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--hg-border-dim, #303030);
    border-radius: 4px;
    background: var(--hg-bg-base, #050505);
    color: var(--hg-text-primary, #f2efe7);
    font: inherit;
    font-size: 11px;
  }

  @keyframes hold-fill {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  @keyframes sent-pop {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--hg-accent-green, #9be564) 50%, transparent); transform: scale(1); }
    45% { box-shadow: 0 0 0 6px transparent; transform: scale(1.08); }
    100% { box-shadow: none; transform: scale(1); }
  }
</style>
