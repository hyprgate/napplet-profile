<script lang="ts">
  import { onMount } from 'svelte';
  import { inc as ipc, identity, relay, type Subscription } from '@napplet/sdk';
  import {
    KIND_METADATA,
    IDENTITY_CHANGED_TOPIC,
    LEGACY_AUTH_IDENTITY_CHANGED_TOPIC,
    PROFILE_READY_TOPIC,
    isCanonicalHexPubkey,
    parseNoteContent,
    parseIdentityChangedPayload,
    parseProfileOpenPayload,
    waitForPublicKey,
  } from '@hyprgate/utils';
  import type { EngagementCounts, ProfileContent } from './lib/profile-store';
  import type { NostrEvent } from '@hyprgate/types';
  import { createProfileStore } from './lib/profile-store';
  import { createEmojiSetStore, type EmojiOption } from './lib/emoji-sets';
  import ProfileLayout from './components/ProfileLayout.svelte';

  // ── Reactive state bridged from the profile store ───────────────────────────
  let metadata = $state<ProfileContent | null>(null);
  let notes = $state<NostrEvent[]>([]);
  let engagement = $state<Map<string, EngagementCounts>>(new Map());
  let engagementVersion = $state(0);
  let followingCount = $state(0);
  let isFollowing = $state(false);
  let isFollowPending = $state(false);
  let showReplies = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let profilePubkey = $state('');
  let referencedProfileVersion = $state(0);
  const referencedProfiles = new Map<string, ProfileContent>();
  const loadingReferencedPubkeys = new Set<string>();
  const referencedProfileSubscriptions = new Set<Subscription>();

  // Race condition guard: buffer profile:open events until component is mounted
  let ready = $state(false);
  let pendingPubkey = $state<string | null>(null);

  // ── Sync from store.state to Svelte $state ──────────────────────────────────
  // Profile store uses plain mutable state; call syncState() after every mutation
  // via the onUpdate callback so Svelte 5 tracks the assignments.
  function syncState(): void {
    const s = store.state;
    metadata = s.metadata;
    notes = s.notes;
    engagement = s.engagement;
    engagementVersion = s.engagementVersion;
    followingCount = s.followingCount;
    isFollowing = s.isFollowing;
    isFollowPending = s.isFollowPending;
    showReplies = s.showReplies;
    loading = s.loading;
    error = s.error;
    profilePubkey = s.pubkey ?? '';
  }

  // Store instance — created once, with onUpdate wired to syncState
  let store = createProfileStore(syncState);

  // Reaction palette (the logged-in user's emoji list/sets), shared with the feed.
  let reactionOptions = $state<EmojiOption[]>([]);
  const emojiStore = createEmojiSetStore(() => {
    reactionOptions = [...emojiStore.state.options];
  });

  function initReactionPalette(pubkey: string): void {
    if (isCanonicalHexPubkey(pubkey)) emojiStore.init(pubkey);
  }

  // ── Inter-pane event subscriptions ──────────────────────────────────────────
  // Use onMount (not $effect) to avoid Svelte 5 reactivity loops —
  // on() callbacks write to $state which must not re-trigger the subscription setup.
  onMount(() => {
    const subProfileOpen = ipc.on('profile:open', (payload) => {
      const profileOpen = parseProfileOpenPayload(payload);
      if (!profileOpen) return;
      const targetPubkey = profileOpen.pubkey;
      if (ready) {
        store.loadProfile(targetPubkey);
      } else {
        pendingPubkey = targetPubkey;
      }
    });
    ipc.emit(PROFILE_READY_TOPIC);

    const handleIdentityChanged = (payload: unknown) => {
      const identityChange = parseIdentityChangedPayload(payload);
      if (isCanonicalHexPubkey(identityChange?.pubkey)) {
        initReactionPalette(identityChange.pubkey);
        if (!store.state.pubkey) {
          store.loadProfile(identityChange.pubkey);
        } else {
          store.loadProfile(store.state.pubkey);
        }
      }
    };
    const subIdentity = ipc.on(IDENTITY_CHANGED_TOPIC, handleIdentityChanged);
    const legacySubIdentity = ipc.on(LEGACY_AUTH_IDENTITY_CHANGED_TOPIC, handleIdentityChanged);

    return () => {
      subProfileOpen.close();
      subIdentity.close();
      legacySubIdentity.close();
    };
  });

  onMount(() => {
    const controller = new AbortController();

    // The reaction palette always follows the logged-in user, regardless of
    // which profile is being viewed.
    void waitForPublicKey(identity, {
      signal: controller.signal,
      isValidPubkey: isCanonicalHexPubkey,
    }).then((pk) => {
      if (!controller.signal.aborted && isCanonicalHexPubkey(pk)) initReactionPalette(pk);
    });

    // Determine which pubkey to show
    const params = new URLSearchParams(window.location.search);
    const urlPubkey = params.get('pubkey');

    if (isCanonicalHexPubkey(urlPubkey)) {
      store.loadProfile(urlPubkey);
    } else if (pendingPubkey) {
      store.loadProfile(pendingPubkey);
      pendingPubkey = null;
    } else {
      void waitForPublicKey(identity, {
        signal: controller.signal,
        isValidPubkey: isCanonicalHexPubkey,
      }).then((pk) => {
        if (!controller.signal.aborted && pk && !store.state.pubkey) {
          store.loadProfile(pk);
        }
      });
    }

    ready = true;
    if (pendingPubkey) {
      store.loadProfile(pendingPubkey);
      pendingPubkey = null;
    }

    return () => {
      controller.abort();
      store.destroy();
      emojiStore.destroy();
      for (const subscription of referencedProfileSubscriptions) subscription.close();
      referencedProfileSubscriptions.clear();
      loadingReferencedPubkeys.clear();
    };
  });

  // ── Follow / unfollow handlers ──────────────────────────────────────────────
  function handleFollowClick() {
    if (isFollowing) {
      store.unfollowUser();
    } else {
      store.followUser();
    }
  }

  function shortProfileLabel(pubkey: string): string {
    return pubkey.length > 12 ? `${pubkey.slice(0, 8)}...` : pubkey;
  }

  function profileLabel(pubkey: string): string {
    referencedProfileVersion;
    const referencedProfile = referencedProfiles.get(pubkey);
    return referencedProfile?.display_name
      ?? referencedProfile?.name
      ?? (pubkey === profilePubkey ? metadata?.display_name ?? metadata?.name : undefined)
      ?? shortProfileLabel(pubkey);
  }

  function collectReferencedProfilePubkeys(): string[] {
    const pubkeys = new Set<string>();
    for (const note of notes) {
      for (const block of parseNoteContent(note.content)) {
        if (block.type === 'profile') pubkeys.add(block.value);
      }
    }
    if (profilePubkey) pubkeys.add(profilePubkey);
    return [...pubkeys];
  }

  function parseReferencedProfileEvent(profileEvent: NostrEvent): ProfileContent | null {
    if (profileEvent.kind !== KIND_METADATA) return null;
    try {
      return JSON.parse(profileEvent.content) as ProfileContent;
    } catch {
      return null;
    }
  }

  function loadReferencedProfiles(pubkeys: string[]): void {
    const missingPubkeys = pubkeys.filter((pubkey) =>
      isCanonicalHexPubkey(pubkey)
      && !referencedProfiles.has(pubkey)
      && !loadingReferencedPubkeys.has(pubkey)
    );
    if (missingPubkeys.length === 0) return;
    for (const pubkey of missingPubkeys) loadingReferencedPubkeys.add(pubkey);

    let subscription: Subscription | null = null;
    subscription = relay.subscribe(
      [{ kinds: [KIND_METADATA], authors: missingPubkeys, limit: Math.max(missingPubkeys.length, 20) }],
      (profileEvent) => {
        if (!missingPubkeys.includes(profileEvent.pubkey)) return;
        const parsed = parseReferencedProfileEvent(profileEvent as NostrEvent);
        if (!parsed) return;
        referencedProfiles.set(profileEvent.pubkey, parsed);
        referencedProfileVersion++;
      },
      () => {
        for (const pubkey of missingPubkeys) loadingReferencedPubkeys.delete(pubkey);
        if (subscription) referencedProfileSubscriptions.delete(subscription);
      },
    );
    referencedProfileSubscriptions.add(subscription);
  }

  $effect(() => {
    loadReferencedProfiles(collectReferencedProfilePubkeys());
  });
</script>

<main
  class="bg-bg-base h-screen w-screen text-text-primary font-mono overflow-hidden"
  data-profile-pubkey={profilePubkey}
>
  {#if error}
    <!-- Error state -->
    <div class="flex flex-col items-center justify-center h-full gap-3">
      <div class="text-accent-red text-sm font-mono text-center max-w-xs px-4">
        <p class="font-bold mb-1">Failed to load profile</p>
        <p class="text-text-muted">{error}</p>
      </div>
    </div>
  {:else if loading && notes.length === 0 && !metadata}
    <!-- Loading skeleton -->
    <div class="flex flex-col h-full animate-pulse">
      <!-- Banner skeleton -->
      <div class="w-full h-[120px] bg-bg-surface"></div>
      <!-- Avatar skeleton -->
      <div class="px-4 -mt-8 mb-3">
        <div class="w-20 h-20 rounded-full bg-bg-elevated border-2 border-bg-base"></div>
      </div>
      <!-- Name skeleton -->
      <div class="px-4 flex flex-col gap-2">
        <div class="h-5 w-40 bg-bg-surface rounded"></div>
        <div class="h-3 w-32 bg-bg-surface rounded"></div>
        <div class="h-3 w-56 bg-bg-surface rounded"></div>
      </div>
    </div>
  {:else}
    <!-- Profile layout (responsive) -->
    <ProfileLayout
      {metadata}
      {notes}
      {followingCount}
      {isFollowing}
      {isFollowPending}
      {engagement}
      {engagementVersion}
      {reactionOptions}
      {showReplies}
      {profileLabel}
      onfollowclick={handleFollowClick}
      {profilePubkey}
      onloadmore={() => store.loadMore()}
      onshowreplieschange={(next) => store.setShowReplies(next)}
    />
  {/if}
</main>
