<script lang="ts">
  import type { NostrEvent } from 'applesauce-core/helpers/event';
  import type { ProfileContent } from 'applesauce-core/helpers/profile';
  import type { EngagementCounts } from '../lib/profile-store';
  import type { EmojiOption } from '../lib/emoji-sets';
  import ProfileHeader from './ProfileHeader.svelte';
  import ProfileSidebar from './ProfileSidebar.svelte';
  import ProfileNotes from './ProfileNotes.svelte';

  interface Props {
    metadata: ProfileContent | null;
    notes: NostrEvent[];
    followingCount: number;
    isFollowing: boolean;
    isFollowPending: boolean;
    engagement: Map<string, EngagementCounts>;
    engagementVersion: number;
    reactionOptions: EmojiOption[];
    showReplies: boolean;
    profileLabel: (pubkey: string) => string;
    onfollowclick: () => void;
    profilePubkey?: string;
    onloadmore: () => void;
    onshowreplieschange: (showReplies: boolean) => void;
  }

  let {
    metadata,
    notes,
    followingCount,
    isFollowing,
    isFollowPending,
    engagement,
    engagementVersion,
    reactionOptions,
    showReplies,
    profileLabel,
    onfollowclick,
    profilePubkey = '',
    onloadmore,
    onshowreplieschange,
  }: Props = $props();

  let isWide = $state(false);

  // ResizeObserver via use: action for proper lifecycle (not $effect)
  function bindResizeObserver(el: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      isWide = width > height;
    });
    observer.observe(el);
    return { destroy: () => observer.disconnect() };
  }
</script>

<div use:bindResizeObserver class="h-full w-full overflow-hidden flex {isWide ? 'flex-row' : 'flex-col'}">
  {#if isWide}
    <!-- Wide layout: sidebar on left, notes on right -->
    <ProfileSidebar
      {metadata}
      {followingCount}
      {isFollowing}
      {isFollowPending}
      {onfollowclick}
      {profilePubkey}
    />
    <ProfileNotes {notes} {engagement} {engagementVersion} {reactionOptions} {showReplies} {profileLabel} {onloadmore} {onshowreplieschange} />
  {:else}
    <!-- Tall/square layout: header on top, notes below -->
    <div class="shrink-0 overflow-hidden">
      <ProfileHeader
        {metadata}
        {followingCount}
        {isFollowing}
        {isFollowPending}
        {onfollowclick}
        {profilePubkey}
      />
    </div>
    <ProfileNotes {notes} {engagement} {engagementVersion} {reactionOptions} {showReplies} {profileLabel} {onloadmore} {onshowreplieschange} />
  {/if}
</div>
