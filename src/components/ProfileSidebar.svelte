<script lang="ts">
  import type { ProfileContent } from 'applesauce-core/helpers/profile';
  import { resourceBackgroundImage, resourceImage } from '@hyprgate/utils';
  import FollowButton from './FollowButton.svelte';
  import ProfileInfo from './ProfileInfo.svelte';

  interface Props {
    metadata: ProfileContent | null;
    followingCount: number | null;
    isFollowing: boolean;
    isFollowPending: boolean;
    isOwnProfile: boolean;
    followError: string | null;
    metadataLoading: boolean;
    onfollowclick: () => void;
    profilePubkey?: string;
  }

  let {
    metadata,
    followingCount,
    isFollowing,
    isFollowPending,
    isOwnProfile,
    followError,
    metadataLoading,
    onfollowclick,
    profilePubkey = '',
  }: Props = $props();

  const avatarFallback = $derived(
    (metadata?.display_name || metadata?.name || profilePubkey || '?').slice(0, 2).toUpperCase(),
  );
</script>

<aside class="w-80 h-full flex flex-col bg-bg-surface border-r border-border-dim overflow-y-auto shrink-0">
  <div
    class="w-full h-28 bg-gradient-to-r from-accent-green/20 to-accent-cyan/20 shrink-0 overflow-hidden"
    use:resourceBackgroundImage={metadata?.banner}
  ></div>

  <div class="flex flex-col gap-2 px-4 pb-4">
    <div class="flex items-end justify-between gap-3 -mt-9">
      <div class="grid w-18 h-18 shrink-0">
        <div class="col-start-1 row-start-1 w-18 h-18 rounded-full border-2 border-bg-surface bg-bg-elevated flex items-center justify-center text-accent-green text-lg font-bold font-mono">
          {avatarFallback}
        </div>
        {#if metadata?.picture}
          <img
            use:resourceImage={metadata.picture}
            alt=""
            class="col-start-1 row-start-1 w-18 h-18 rounded-full border-2 border-bg-surface object-cover"
          />
        {/if}
      </div>

      {#if !isOwnProfile}
        <FollowButton {isFollowing} isPending={isFollowPending} onclick={onfollowclick} />
      {/if}
    </div>

    {#if followError}<p class="text-xs text-accent-red m-0" role="status">{followError}</p>{/if}
    <ProfileInfo {metadata} {followingCount} {isOwnProfile} {profilePubkey} {metadataLoading} />
  </div>
</aside>
