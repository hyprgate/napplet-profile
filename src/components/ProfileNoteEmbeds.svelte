<script lang="ts">
  import { intent } from '@napplet/sdk';
  import { parseIntentResult } from '@hyprgate/types';
  import {
    createNoteViewerOpenIntentRequest,
    createNoteViewerOpenPayload,
    createProfileIntentRequest,
    extractNoteContentEmbeds,
    pubkeyColorStyle,
  } from '@hyprgate/utils';
  import ProfileResourceEmbed from './ProfileResourceEmbed.svelte';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();
  let embeds = $derived(extractNoteContentEmbeds(content, 6, { includeImageUrls: false, includeResources: false }));

  async function invoke(request: ReturnType<typeof createProfileIntentRequest> | ReturnType<typeof createNoteViewerOpenIntentRequest>): Promise<void> {
    if (!request) return;
    try {
      const result = parseIntentResult(await intent.invoke(request));
      if (!result || result.archetype !== request.archetype || result.action !== (request.action ?? 'open')) return;
      if (!result.ok || !result.handled) return;
    } catch {
      // Keep the existing no-op failure behavior when navigation is unavailable.
    }
  }

  async function openProfile(pubkey: string): Promise<void> {
    await invoke(createProfileIntentRequest({ pubkey }));
  }

  async function openEvent(id: string, source: string): Promise<void> {
    const payload = createNoteViewerOpenPayload({
      target: { type: 'event', id, nip19: source },
      behavior: { focus: true },
      source: { napplet: 'profile' },
    });
    await invoke(payload ? createNoteViewerOpenIntentRequest(payload) : null);
  }

  async function openAddress(value: string, source: string): Promise<void> {
    const [kindValue, pubkey, ...identifierParts] = value.split(':');
    const kind = Number(kindValue);
    const identifier = identifierParts.join(':');
    if (!Number.isInteger(kind) || !pubkey || !identifier) return;
    const payload = createNoteViewerOpenPayload({
      target: { type: 'address', kind, pubkey, identifier, nip19: source },
      behavior: { focus: true },
      source: { napplet: 'profile' },
    });
    await invoke(payload ? createNoteViewerOpenIntentRequest(payload) : null);
  }

  function shortReference(source: string): string {
    const value = source.startsWith('nostr:') ? source.slice('nostr:'.length) : source;
    return value.length > 32 ? `${value.slice(0, 28)}...` : value;
  }
</script>

{#if embeds.length > 0}
  <div class="profile-note-embeds" aria-label="Resolved note references">
    {#each embeds as embed (`${embed.type}:${embed.value}`)}
      {#if embed.type === 'profile'}
        <button type="button" class="profile-embed" onclick={() => openProfile(embed.value)}>
          <span class="label">profile</span>
          <span class="value" style={pubkeyColorStyle(embed.value)}>{embed.value.slice(0, 12)}...</span>
        </button>
      {:else if embed.type === 'event'}
        <button type="button" class="reference-embed" onclick={() => openEvent(embed.value, embed.source)}>
          <span class="label">quoted note</span>
          <span class="value">{shortReference(embed.source)}</span>
        </button>
      {:else if embed.type === 'address'}
        <button type="button" class="reference-embed" onclick={() => openAddress(embed.value, embed.source)}>
          <span class="label">address</span>
          <span class="value">{embed.value}</span>
        </button>
      {:else if embed.type === 'media'}
        <ProfileResourceEmbed source={embed.value} mediaType={embed.mediaType} />
      {:else}
        <ProfileResourceEmbed source={embed.value} mediaType="image" />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .profile-note-embeds {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  .profile-embed,
  .reference-embed {
    max-width: 100%;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 6px;
    background: var(--hg-bg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .profile-embed {
    display: inline-grid;
    width: fit-content;
    min-width: min(18rem, 100%);
    gap: 2px;
    padding: 6px 8px;
  }

  .reference-embed {
    display: grid;
    gap: 4px;
    width: 100%;
    padding: 8px 10px;
    border-left: 3px solid var(--hg-accent-cyan, #82d8f7);
  }

  .profile-embed:hover,
  .reference-embed:hover {
    border-color: var(--hg-accent-cyan, #82d8f7);
  }

  .label {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 10px;
    text-transform: uppercase;
  }

  .value {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.4;
  }
</style>
