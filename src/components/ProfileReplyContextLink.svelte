<script lang="ts">
  import { intent } from '@napplet/sdk';
  import { parseIntentResult } from '@hyprgate/types';
  import { createNoteViewerOpenIntentRequest } from '@hyprgate/utils';
  import {
    createProfileReplyReferenceOpenPayload,
    type ProfileReplyContextReferenceDisplay,
  } from '../lib/profile-reply-context';

  interface Props {
    reference: ProfileReplyContextReferenceDisplay;
  }

  let { reference }: Props = $props();

  async function openReference(): Promise<void> {
    const payload = createProfileReplyReferenceOpenPayload(reference);
    if (!payload) return;
    const request = createNoteViewerOpenIntentRequest(payload);
    if (!request) return;
    try {
      const result = parseIntentResult(await intent.invoke(request));
      if (!result || result.archetype !== request.archetype || result.action !== (request.action ?? 'open')) return;
      if (!result.ok || !result.handled) return;
    } catch {
      // Keep the existing no-op failure behavior when navigation is unavailable.
    }
  }
</script>

{#if reference.target}
  <button type="button" class="reply-context-link" title={reference.title} onclick={openReference}>
    {reference.label}
  </button>
{:else}
  <span class="reply-context-link muted" title={reference.title}>{reference.label}</span>
{/if}

<style>
  .reply-context-link {
    display: inline;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--hg-accent-cyan, #82d8f7);
    font: inherit;
    line-height: inherit;
    cursor: pointer;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .reply-context-link:hover {
    color: var(--hg-text-primary, #f2efe7);
    text-decoration: underline;
  }

  .reply-context-link.muted {
    color: var(--hg-text-muted, #b8b1a4);
    cursor: default;
  }
</style>
