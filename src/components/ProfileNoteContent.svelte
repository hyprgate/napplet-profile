<script lang="ts">
  // Thin adapter over the shared @hyprgate/napplet-ui note renderer — supplies profile's
  // navigation wiring (open a profile via inter-pane message).
  import { intent, link } from '@napplet/sdk';
  import { parseIntentResult } from '@hyprgate/types';
  import { invokeNappletIntent, createProfileIntentRequest, isCanonicalHexPubkey } from '@hyprgate/utils';
  import NoteContent from '@hyprgate/napplet-ui/NoteContent.svelte';

  interface Props {
    content: string;
    emojiTags?: string[][];
    profileLabel?: (pubkey: string) => string;
  }

  let { content, emojiTags = [], profileLabel }: Props = $props();

  async function openProfile(pubkey: string): Promise<void> {
    if (!isCanonicalHexPubkey(pubkey)) return;
    const request = createProfileIntentRequest({ pubkey });
    if (!request) return;
    try {
      const result = parseIntentResult(await invokeNappletIntent(request));
      if (!result || result.archetype !== request.archetype || result.action !== (request.action ?? 'open')) return;
      if (!result.ok) return;
    } catch {
      // Keep the existing no-op failure behavior when navigation is unavailable.
    }
  }

  // NAP-LINK: route external links through the shell-owned opener so the new
  // browsing context does not inherit this napplet's origin.
  async function openLink(url: string): Promise<boolean> {
    const result = await link.open(url);
    return result.status === 'opened';
  }
</script>

<NoteContent {content} {emojiTags} {profileLabel} onProfileClick={openProfile} onOpenLink={openLink} />
