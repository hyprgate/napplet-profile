<script lang="ts">
  import type { ProfileContent } from 'applesauce-core/helpers/profile';
  import { pubkeyColorStyle, resourceBackgroundImage, resourceImage } from '@hyprgate/utils';
  import FollowButton from './FollowButton.svelte';
  import ProfileIdentityShare from './ProfileIdentityShare.svelte';

  interface Props {
    metadata: ProfileContent | null;
    followingCount: number;
    isFollowing: boolean;
    isFollowPending: boolean;
    onfollowclick: () => void;
    profilePubkey?: string;
  }

  let {
    metadata,
    followingCount,
    isFollowing,
    isFollowPending,
    onfollowclick,
    profilePubkey = '',
  }: Props = $props();

  const displayName = $derived.by(() => {
    if (!metadata) return profilePubkey.slice(0, 8) || 'Unknown';
    return metadata.display_name || metadata.name || profilePubkey.slice(0, 8) || 'Unknown';
  });

  const avatarFallback = $derived.by(() => {
    const name = metadata?.display_name || metadata?.name || profilePubkey || '?';
    return name.slice(0, 2).toUpperCase();
  });
</script>

<div class="relative w-full">
  <!-- Banner -->
  <div
    class="w-full h-[120px] bg-gradient-to-r from-accent-green/20 to-accent-cyan/20 overflow-hidden"
    use:resourceBackgroundImage={metadata?.banner}
  ></div>

  <!-- Avatar (overlapping banner) -->
  <div class="absolute left-4 top-[72px] grid w-20 h-20">
    <div class="col-start-1 row-start-1 w-20 h-20 rounded-full border-2 border-bg-base bg-bg-surface flex items-center justify-center text-accent-green text-xl font-bold font-mono">
      {avatarFallback}
    </div>
    {#if metadata?.picture}
      <img
        use:resourceImage={metadata.picture}
        alt=""
        class="col-start-1 row-start-1 w-20 h-20 rounded-full border-2 border-bg-base object-cover"
      />
    {/if}
  </div>

  <!-- Follow button top-right -->
  <div class="absolute right-4 top-[130px]">
    <FollowButton
      {isFollowing}
      isPending={isFollowPending}
      onclick={onfollowclick}
    />
  </div>
</div>

<!-- Profile info below banner -->
<div class="pt-12 px-4 pb-3">
  <div class="flex flex-col gap-1">
    <!-- Name -->
    <h2 class="text-xl font-bold font-mono" style={pubkeyColorStyle(profilePubkey)}>{displayName}</h2>

    <!-- NIP-05 -->
    {#if metadata?.nip05}
      <div class="flex items-center gap-1">
        <svg class="w-3 h-3 text-accent-cyan shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <span class="text-sm text-accent-cyan font-mono">{metadata.nip05}</span>
      </div>
    {/if}

    <!-- Bio -->
    {#if metadata?.about}
      <p class="text-sm text-text-secondary font-mono line-clamp-3 mt-1">{metadata.about}</p>
    {/if}

    <!-- Stats -->
    <div class="flex gap-4 mt-2 text-xs text-text-muted font-mono">
      <span><span class="text-text-primary font-medium">{followingCount}</span> following</span>
      <span><span class="text-text-primary font-medium">--</span> followers</span>
    </div>

    <ProfileIdentityShare {profilePubkey} />
  </div>
</div>
