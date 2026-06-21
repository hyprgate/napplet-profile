<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { NostrEvent } from 'applesauce-core/helpers/event';
  import { format as timeago } from 'timeago.js';
  import { inc as ipc, relay } from '@napplet/sdk';
  import {
    NOTE_VIEWER_OPEN_TOPIC,
    clientTagValue,
    createNoteViewerOpenPayload,
    formatMillisatsAsSats,
    resourceImage,
  } from '@hyprgate/utils';
  import type { EngagementCounts, ReactionGroup } from '../lib/profile-store';
  import {
    customReactionInput,
    reactionInputFromEmojiOption,
    type EmojiOption,
  } from '../lib/emoji-sets';
  import { previewProfileNoteContent } from '../lib/profile-content';
  import { profileReplyContextForNote } from '../lib/profile-reply-context';
  import ProfileNoteContent from './ProfileNoteContent.svelte';
  import ProfileNoteEmbeds from './ProfileNoteEmbeds.svelte';
  import ProfileReplyContextLink from './ProfileReplyContextLink.svelte';
  import EmojiSelector from './EmojiSelector.svelte';

  interface Props {
    notes: NostrEvent[];
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

  function openNote(note: NostrEvent): void {
    const payload = createNoteViewerOpenPayload({
      target: { type: 'event', id: note.id, kind: note.kind, pubkey: note.pubkey },
      behavior: { focus: true },
      source: { napplet: 'profile' },
    });
    if (payload) ipc.emit(NOTE_VIEWER_OPEN_TOPIC, [], JSON.stringify(payload));
  }

  function replyTo(note: NostrEvent): void {
    ipc.emit('compose:open', [], JSON.stringify({
      source: { napplet: 'profile' },
      intent: 'reply',
      replyTo: {
        id: note.id,
        pubkey: note.pubkey,
        kind: note.kind,
        content: note.content,
        created_at: note.created_at,
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

<div class="profile-notes flex-1 overflow-y-auto">
  <div class="notes-toolbar">
    <button
      type="button"
      class="reply-toggle"
      class:active={showReplies}
      aria-pressed={showReplies}
      onclick={() => onshowreplieschange(!showReplies)}
    >
      Show replies
    </button>
  </div>

  {#if notes.length === 0}
    <div class="flex items-center justify-center h-32 text-text-muted text-sm font-mono">
      No notes yet
    </div>
  {:else}
    <ul class="divide-y divide-border-dim">
      {#each notes as note (note.id)}
        {@const counts = engagementMap.get(note.id)}
        {@const groups = sortReactionGroups(counts?.reactionGroups ?? [])}
        {@const ctx = profileReplyContextForNote(note)}
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
              <div>replying to <ProfileReplyContextLink reference={ctx.parent} /></div>
              {#if ctx.root}
                <div>root <ProfileReplyContextLink reference={ctx.root} /></div>
              {/if}
            </div>
          {/if}
          <div class="note-content">
            <ProfileNoteContent content={previewProfileNoteContent(note.content)} emojiTags={note.tags} {profileLabel} />
            <ProfileNoteEmbeds content={note.content} />
          </div>
          <div class="engagement-row" aria-label="Engagement counts">
            {#if groups.length > 0}
              {#each groups as group (group.content)}
                <button
                  type="button"
                  class="pill reaction"
                  class:hold-active={holdingKey === holdKey(note, group)}
                  class:send-complete={completedKey === holdKey(note, group)}
                  title="Hold to send {group.content}"
                  onpointerdown={() => startReactionHold(note, group)}
                  onpointerup={cancelReactionHold}
                  onpointerleave={cancelReactionHold}
                  onpointercancel={cancelReactionHold}
                >
                  {#if group.imageUrl}
                    <img use:resourceImage={group.imageUrl} alt={group.shortcode ?? group.content} loading="lazy" />
                  {:else}
                    <span>{group.content}</span>
                  {/if}
                  <span>{group.count}</span>
                </button>
              {/each}
            {:else}
              <span class="pill reaction">+ {counts?.reactions ?? 0}</span>
            {/if}
            <span class="pill reply">r {counts?.comments ?? 0}</span>
            <span class="pill zap">z {counts && counts.zaps > 0 ? formatMillisatsAsSats(counts.zapMillisats) : 0}</span>
          </div>
          <div class="note-actions">
            <button type="button" onclick={() => openNote(note)}>Open</button>
            <button type="button" onclick={() => replyTo(note)}>Reply</button>
            <div class="reaction-picker">
              <button
                type="button"
                disabled={reactingId === note.id}
                aria-expanded={openMenuNoteId === note.id}
                onclick={() => toggleReactionMenu(note.id)}
              >
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
                  <form class="custom-reaction" onsubmit={(submitEvent) => { submitEvent.preventDefault(); void reactCustom(note); }}>
                    <input bind:value={customReaction} placeholder="emoji or :code:" aria-label="Custom reaction" maxlength="32" />
                    <button type="submit" disabled={!customReaction.trim()}>Send</button>
                  </form>
                </div>
              {/if}
            </div>
            {#if reactionError && reactingId === null}
              <span class="error">{reactionError}</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    <div bind:this={sentinel} class="h-4"></div>
  {/if}
</div>

<style>
  .notes-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hg-border-dim, #303030);
  }

  .reply-toggle,
  .note-actions button {
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--hg-border-dim, #303030);
    border-radius: 4px;
    background: var(--hg-bg-surface, #101010);
    color: var(--hg-text-muted, #b8b1a4);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  .reply-toggle.active {
    border-color: var(--hg-accent-green, #9be564);
    color: var(--hg-accent-green, #9be564);
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 14%, transparent);
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  /* Engagement counts sit muted until the note is hovered. */
  .engagement-row {
    opacity: 0.5;
    transition: opacity 0.15s ease;
  }

  .note-row:hover .engagement-row {
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

  .note-row:hover .pill {
    border-color: var(--hg-border-dim, #303030);
    background: color-mix(in srgb, var(--hg-bg-surface, #101010) 88%, transparent);
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
