/**
 * Profile store — pure TypeScript module (no Svelte runes) for testability.
 * Manages profile metadata, recent notes, and follow state for a single viewed pubkey.
 * All relay operations route through the shell pseudo-relay via @napplet/sdk.
 */
import type { NostrEvent } from '@hyprgate/types';
import {
  createProfileContext,
  closeSubs,
  followUser,
  loadMore,
  loadProfile,
  setShowReplies,
  unfollowUser,
} from './profile-engine.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileContent {
  name?: string;
  display_name?: string;
  picture?: string;
  banner?: string;
  about?: string;
  nip05?: string;
  lud06?: string;
  lud16?: string;
  website?: string;
  [key: string]: unknown;
}

export interface ProfileState {
  pubkey: string | null;
  metadata: ProfileContent | null;
  notes: NostrEvent[];
  engagement: Map<string, EngagementCounts>;
  engagementVersion: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowPending: boolean;
  showReplies: boolean;
  loading: boolean;
  error: string | null;
}

export interface EngagementCounts {
  reactions: number;
  reactionGroups: ReactionGroup[];
  comments: number;
  zaps: number;
  zapMillisats: number;
}

export interface ReactionGroup {
  content: string;
  count: number;
  imageUrl?: string;
  shortcode?: string;
}

export interface ProfileStore {
  state: ProfileState;
  loadProfile(pubkey: string): void;
  setShowReplies(showReplies: boolean): void;
  followUser(): void;
  unfollowUser(): void;
  loadMore(): void;
  destroy(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a profile store instance.
 *
 * @param onUpdate - Called after every state mutation so the caller (e.g. a
 *   Svelte component) can sync its own reactive `$state` variables.  Svelte 5
 *   plain-object mutations are not auto-tracked, so the component must
 *   manually copy `store.state.*` into its `$state` vars inside this callback.
 */
export function createProfileStore(onUpdate?: () => void): ProfileStore {
  // Mutable plain-object state — NOT reactive on its own.
  // Consumers must provide `onUpdate` and copy fields into their own $state.
  const ctx = createProfileContext(() => onUpdate?.());

  return {
    state: ctx.state,
    loadProfile: (pubkey) => loadProfile(ctx, pubkey),
    setShowReplies: (showReplies) => setShowReplies(ctx, showReplies),
    followUser: () => followUser(ctx),
    unfollowUser: () => unfollowUser(ctx),
    loadMore: () => loadMore(ctx),
    destroy: () => closeSubs(ctx),
  };
}
