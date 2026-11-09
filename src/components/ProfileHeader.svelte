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

<div class="relative w-full">
  <div
    class="w-full h-[104px] bg-gradient-to-r from-accent-green/20 to-accent-cyan/20 overflow-hidden"
    use:resourceBackgroundImage={metadata?.banner}
  ></div>

  <div class="flex items-end justify-between gap-3 px-4 -mt-9">
    <div class="grid w-18 h-18 shrink-0">
      <div class="col-start-1 row-start-1 w-18 h-18 rounded-full border-2 border-bg-base bg-bg-surface flex items-center justify-center text-accent-green text-xl font-bold font-mono">
        {avatarFallback}
      </div>
      {#if metadata?.picture}
        <img
          use:resourceImage={metadata.picture}
          alt=""
          class="col-start-1 row-start-1 w-18 h-18 rounded-full border-2 border-bg-base object-cover"
        />
      {/if}
    </div>

    {#if !isOwnProfile}
      <FollowButton {isFollowing} isPending={isFollowPending} onclick={onfollowclick} />
    {/if}
  </div>
</div>

<div class="px-4 pt-2 pb-3">
  {#if followError}<p class="text-xs text-accent-red mt-0 mb-2" role="status">{followError}</p>{/if}
  <ProfileInfo {metadata} {followingCount} {isOwnProfile} {profilePubkey} {metadataLoading} />
</div>
