<script lang="ts">
  import type { ProfileContent } from 'applesauce-core/helpers/profile';
  import { pubkeyColorStyle, resourceBackgroundImage, resourceImage } from '@hyprgate/utils';
  import FollowButton from './FollowButton.svelte';

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

<aside class="w-64 h-full flex flex-col bg-bg-surface border-r border-border-dim overflow-y-auto shrink-0">
  <!-- Banner strip -->
  <div
    class="w-full h-20 bg-gradient-to-r from-accent-green/20 to-accent-cyan/20 shrink-0 overflow-hidden"
    use:resourceBackgroundImage={metadata?.banner}
  ></div>

  <!-- Content -->
  <div class="flex flex-col gap-2 px-4 py-3">
    <!-- Avatar -->
    <div class="-mt-10 mb-1">
      {#if metadata?.picture}
        <img
          use:resourceImage={metadata.picture}
          alt={displayName}
          class="w-16 h-16 rounded-full border-2 border-bg-base object-cover"
          onerror={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      {:else}
        <div class="w-16 h-16 rounded-full border-2 border-bg-base bg-bg-elevated flex items-center justify-center text-accent-green text-lg font-bold font-mono">
          {avatarFallback}
        </div>
      {/if}
    </div>

    <!-- Name -->
    <h2 class="text-base font-bold font-mono leading-tight" style={pubkeyColorStyle(profilePubkey)}>{displayName}</h2>

    <!-- NIP-05 -->
    {#if metadata?.nip05}
      <div class="flex items-center gap-1">
        <svg class="w-3 h-3 text-accent-cyan shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <span class="text-xs text-accent-cyan font-mono truncate">{metadata.nip05}</span>
      </div>
    {/if}

    <!-- Bio -->
    {#if metadata?.about}
      <p class="text-xs text-text-secondary font-mono line-clamp-4">{metadata.about}</p>
    {/if}

    <!-- Stats -->
    <div class="flex flex-col gap-0.5 text-xs text-text-muted font-mono">
      <span><span class="text-text-primary font-medium">{followingCount}</span> following</span>
      <span><span class="text-text-primary font-medium">--</span> followers</span>
    </div>

    <!-- Follow button -->
    <div class="mt-1">
      <FollowButton
        {isFollowing}
        isPending={isFollowPending}
        onclick={onfollowclick}
      />
    </div>
  </div>
</aside>
