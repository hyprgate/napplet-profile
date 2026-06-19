<script lang="ts">
  interface Props {
    isFollowing: boolean;
    isPending: boolean;
    onclick: () => void;
  }

  let { isFollowing, isPending, onclick }: Props = $props();

  let hovered = $state(false);
</script>

{#if isPending}
  <button
    disabled
    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-mono border border-border-dim text-text-muted cursor-not-allowed opacity-60"
    aria-label="Loading..."
  >
    <span class="w-3 h-3 border border-text-muted border-t-transparent rounded-full animate-spin"></span>
    Loading...
  </button>
{:else if isFollowing}
  <button
    {onclick}
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    class={[
      'inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-mono border transition-colors',
      hovered
        ? 'border-accent-red text-accent-red hover:bg-accent-red/10'
        : 'border-accent-green text-accent-green',
    ].join(' ')}
    aria-label={hovered ? 'Unfollow' : 'Following'}
  >
    {hovered ? 'Unfollow' : 'Following'}
  </button>
{:else}
  <button
    {onclick}
    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-mono bg-accent-green text-bg-base hover:bg-accent-green/80 transition-colors"
    aria-label="Follow"
  >
    Follow
  </button>
{/if}
