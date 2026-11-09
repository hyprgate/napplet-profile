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
    followingCount: number | null;
    isFollowing: boolean;
    isFollowPending: boolean;
    isOwnProfile: boolean;
    followError: string | null;
    notesLoading: boolean;
    metadataLoading: boolean;
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
    isOwnProfile,
    followError,
    notesLoading,
    metadataLoading,
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

<!-- In a tall window the whole page scrolls together, so the header doesn't squeeze the notes. -->
<div use:bindResizeObserver class="h-full w-full flex {isWide ? 'flex-row overflow-hidden' : 'flex-col overflow-y-auto'}">
  {#if isWide}
    <ProfileSidebar
      {metadata}
      {followingCount}
      {isFollowing}
      {isFollowPending}
      {isOwnProfile}
      {followError}
      {metadataLoading}
      {onfollowclick}
      {profilePubkey}
    />
    <ProfileNotes {notes} {notesLoading} {engagement} {engagementVersion} {reactionOptions} {showReplies} {profileLabel} {onloadmore} {onshowreplieschange} />
  {:else}
    <div class="shrink-0">
      <ProfileHeader
        {metadata}
        {followingCount}
        {isFollowing}
        {isFollowPending}
        {isOwnProfile}
        {followError}
        {metadataLoading}
        {onfollowclick}
        {profilePubkey}
      />
    </div>
    <ProfileNotes ownScroll={false} {notes} {notesLoading} {engagement} {engagementVersion} {reactionOptions} {showReplies} {profileLabel} {onloadmore} {onshowreplieschange} />
  {/if}
</div>
