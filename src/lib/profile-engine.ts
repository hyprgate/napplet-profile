// napplets/profile/src/lib/profile-engine.ts
// Stateful profile logic, split out of profile-store's factory so neither the
// file nor createProfileStore grows unbounded. All functions operate on an
// explicit ProfileContext (the store's mutable state + tracking).

import { relay, outbox, identity, type Subscription } from "@napplet/sdk";
import type { NostrEvent, NostrFilter } from '@hyprgate/types';

/** Minimal shape of the shim-installed shell handshake we depend on. */
interface NappletShellHandle {
  ready(): Promise<unknown>;
  supports(domain: string, protocol?: string): boolean;
}

function getShell(): NappletShellHandle | null {
  return (globalThis as unknown as { napplet?: { shell?: NappletShellHandle } }).napplet?.shell ?? null;
}

/**
 * Resolve the outbox capability gate. MUST be awaited after shell.ready() —
 * supports() returns false until shell.init lands, so a synchronous read would
 * always be false and outbox would never be used.
 */
async function resolveOutboxGate(): Promise<boolean> {
  const shell = getShell();
  await shell?.ready();
  return shell?.supports('outbox') ?? false;
}

/**
 * Subscribe to author-addressed filters via outbox (shell-owned NIP-65 routing)
 * when supported, else via relay.subscribe. Returns a uniform { close } handle.
 */
function subscribeAuthor(
  useOutbox: boolean,
  filters: NostrFilter | NostrFilter[],
  onEvent: (event: NostrEvent) => void,
  onEose: () => void,
): Subscription {
  if (useOutbox) {
    const sub = outbox.subscribe(filters, { strategy: 'outbox' });
    sub.on('event', (event) => onEvent(event as NostrEvent));
    sub.on('eose', onEose);
    return { close: () => sub.close() };
  }
  return relay.subscribe(filters, onEvent, onEose);
}
import {
  KIND_NIP22_COMMENT,
  KIND_REACTION,
  KIND_TEXT_NOTE,
  KIND_ZAP_RECEIPT,
  parseNoteViewerReply,
  parseZapReceipt,
} from '@hyprgate/utils';
import type { EngagementCounts, ProfileContent, ProfileState, ReactionGroup } from './profile-store.js';

/** Subscribe, collect events, resolve on EOSE. */
export function collectOnEose(filters: NostrFilter | NostrFilter[]): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const sub = relay.subscribe(filters, (ev) => events.push(ev), () => { sub.close(); resolve(events); });
  });
}

interface SeenEngagementIds {
  reactions: Map<string, Set<string>>;
  comments: Map<string, Set<string>>;
  zaps: Map<string, Set<string>>;
}

export interface ProfileContext {
  state: ProfileState;
  notify(): void;
  subs: Subscription[];
  engagementSub: Subscription | null;
  engagementTargetsKey: string;
  engagementSyncQueued: boolean;
  engagementSyncRevision: number;
  seenEngagementIds: SeenEngagementIds;
  oldestNoteCreatedAt: number | null;
  /**
   * #244: bounded recovery timer for the metadata load. A reopen that lands
   * before the previous load's relay subscriptions settle can lose the new
   * metadata subscription's reply (and @napplet/nap has no reply timeout), so
   * the skeleton would otherwise hang forever. This re-issues the metadata
   * subscribe on a settled connection, then finally clears `loading`.
   */
  loadWatchdog: ReturnType<typeof setTimeout> | null;
}

export function createProfileContext(notify: () => void): ProfileContext {
  return {
    state: {
      pubkey: null,
      metadata: null,
      notes: [],
      engagement: new Map(),
      engagementVersion: 0,
      followingCount: 0,
      isFollowing: false,
      isFollowPending: false,
      showReplies: false,
      loading: false,
      error: null,
    },
    notify,
    subs: [],
    engagementSub: null,
    engagementTargetsKey: '',
    engagementSyncQueued: false,
    engagementSyncRevision: 0,
    seenEngagementIds: {
      reactions: new Map<string, Set<string>>(),
      comments: new Map<string, Set<string>>(),
      zaps: new Map<string, Set<string>>(),
    },
    oldestNoteCreatedAt: null,
    loadWatchdog: null,
  };
}

// #244: how long to wait for the metadata subscription's first event/EOSE before
// re-issuing it (a reopen relay-churn race can drop the reply), and how many
// times before giving up and clearing the skeleton.
const METADATA_LOAD_TIMEOUT_MS = 8_000;
const MAX_METADATA_RETRIES = 2;

function clearLoadWatchdog(ctx: ProfileContext): void {
  if (ctx.loadWatchdog !== null) {
    clearTimeout(ctx.loadWatchdog);
    ctx.loadWatchdog = null;
  }
}

export function closeSubs(ctx: ProfileContext): void {
  clearLoadWatchdog(ctx);
  ctx.subs.forEach((s) => s.close());
  ctx.subs.length = 0;
  ctx.engagementSub?.close();
  ctx.engagementSub = null;
  ctx.engagementTargetsKey = '';
  ctx.engagementSyncQueued = false;
  ctx.engagementSyncRevision++;
  ctx.oldestNoteCreatedAt = null;
}

function timelineKinds(ctx: ProfileContext): number[] {
  return ctx.state.showReplies ? [KIND_TEXT_NOTE, KIND_NIP22_COMMENT] : [KIND_TEXT_NOTE];
}

function noteFilter(ctx: ProfileContext, pubkey: string, extra: Partial<NostrFilter> = {}): NostrFilter {
  return { kinds: timelineKinds(ctx), authors: [pubkey], limit: 30, ...extra };
}

function addNote(ctx: ProfileContext, event: NostrEvent): void {
  if (!ctx.state.showReplies && parseNoteViewerReply(event)) return;
  if (ctx.state.notes.some((n) => n.id === event.id)) return;
  ctx.state.notes = [...ctx.state.notes, event].sort((a, b) => b.created_at - a.created_at);
  if (ctx.oldestNoteCreatedAt === null || event.created_at < ctx.oldestNoteCreatedAt) {
    ctx.oldestNoteCreatedAt = event.created_at;
  }
  ctx.notify();
  queueEngagementSubscription(ctx);
}

// ── Engagement helpers ────────────────────────────────────────────────────

type EngagementCategory = keyof SeenEngagementIds;

function resetEngagement(ctx: ProfileContext): void {
  ctx.state.engagement.clear();
  ctx.state.engagementVersion++;
  ctx.seenEngagementIds.reactions.clear();
  ctx.seenEngagementIds.comments.clear();
  ctx.seenEngagementIds.zaps.clear();
}

function getCounts(ctx: ProfileContext, noteId: string): EngagementCounts {
  let counts = ctx.state.engagement.get(noteId);
  if (!counts) {
    counts = { reactions: 0, reactionGroups: [], comments: 0, zaps: 0, zapMillisats: 0 };
    ctx.state.engagement.set(noteId, counts);
  }
  return counts;
}

function getSeenSet(ctx: ProfileContext, category: EngagementCategory, noteId: string): Set<string> {
  let seen = ctx.seenEngagementIds[category].get(noteId);
  if (!seen) {
    seen = new Set<string>();
    ctx.seenEngagementIds[category].set(noteId, seen);
  }
  return seen;
}

function normalizeReactionContent(content: string): string {
  const normalized = content.trim();
  return normalized.length > 0 ? normalized : '+';
}

function getCustomEmoji(content: string, tags: string[][]): Pick<ReactionGroup, 'imageUrl' | 'shortcode'> {
  const shortcode = /^:([A-Za-z0-9_-]+):$/.exec(content)?.[1];
  if (!shortcode) return {};
  const emojiTag = tags.find((tag) => tag[0] === 'emoji' && tag[1] === shortcode && typeof tag[2] === 'string');
  return {
    shortcode,
    ...(emojiTag?.[2] ? { imageUrl: emojiTag[2] } : {}),
  };
}

function matchingTargetIds(ctx: ProfileContext, event: NostrEvent): string[] {
  const loadedIds = new Set(ctx.state.notes.map((note) => note.id));
  const targetIds = event.kind === KIND_ZAP_RECEIPT
    ? (parseZapReceipt(event)?.targetEventIds ?? [])
    : event.tags
        .filter((tag) => (tag[0] === 'e' || (event.kind === KIND_NIP22_COMMENT && tag[0] === 'E')) && typeof tag[1] === 'string')
        .map((tag) => tag[1]!);
  return [...new Set(targetIds.filter((targetId) => loadedIds.has(targetId)))];
}

function engagementCategory(kind: number): EngagementCategory | null {
  if (kind === KIND_REACTION) return 'reactions';
  if (kind === KIND_TEXT_NOTE || kind === KIND_NIP22_COMMENT) return 'comments';
  if (kind === KIND_ZAP_RECEIPT) return 'zaps';
  return null;
}

function applyReaction(counts: EngagementCounts, event: NostrEvent): void {
  const content = normalizeReactionContent(event.content);
  let group = counts.reactionGroups.find((item) => item.content === content);
  if (!group) {
    group = { content, count: 0, ...getCustomEmoji(content, event.tags) };
    counts.reactionGroups.push(group);
  }
  group.count++;
}

function applyEngagementEvent(ctx: ProfileContext, event: NostrEvent): void {
  const targets = matchingTargetIds(ctx, event);
  if (targets.length === 0) return;
  const category = engagementCategory(event.kind);
  if (!category) return;

  let changed = false;
  for (const target of targets) {
    const seen = getSeenSet(ctx, category, target);
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const counts = getCounts(ctx, target);
    counts[category]++;
    if (category === 'zaps') counts.zapMillisats += parseZapReceipt(event)?.amountMillisats ?? 0;
    if (category === 'reactions') applyReaction(counts, event);
    changed = true;
  }
  if (changed) {
    ctx.state.engagementVersion++;
    ctx.notify();
  }
}

function syncEngagementSubscription(ctx: ProfileContext): void {
  const targetIds = ctx.state.notes.map((note) => note.id);
  const nextKey = targetIds.join(',');
  if (nextKey === ctx.engagementTargetsKey) return;
  ctx.engagementSub?.close();
  ctx.engagementSub = null;
  ctx.engagementTargetsKey = nextKey;
  if (targetIds.length === 0) return;
  ctx.engagementSub = relay.subscribe(
    [
      { kinds: [KIND_REACTION], '#e': targetIds },
      { kinds: [KIND_TEXT_NOTE], '#e': targetIds },
      { kinds: [KIND_NIP22_COMMENT], '#e': targetIds },
      { kinds: [KIND_NIP22_COMMENT], '#E': targetIds },
      { kinds: [KIND_ZAP_RECEIPT], '#e': targetIds },
    ],
    (event: NostrEvent) => applyEngagementEvent(ctx, event),
    () => {},
  );
}

function queueEngagementSubscription(ctx: ProfileContext): void {
  if (ctx.engagementSyncQueued) return;
  ctx.engagementSyncQueued = true;
  const revision = ctx.engagementSyncRevision;
  queueMicrotask(() => {
    if (ctx.engagementSyncRevision !== revision) return;
    ctx.engagementSyncQueued = false;
    syncEngagementSubscription(ctx);
  });
}

// ── Metadata / notes loading ──────────────────────────────────────────────

function subscribeMetadata(ctx: ProfileContext, pubkey: string, useOutbox: boolean): void {
  const metaSub = subscribeAuthor(
    useOutbox,
    { kinds: [0], authors: [pubkey] },
    (event) => {
      try {
        const parsed = JSON.parse(event.content) as ProfileContent;
        // Only apply if newer than current
        if (
          ctx.state.metadata === null ||
          event.created_at > ((ctx.state.metadata as { _created_at?: number })._created_at ?? 0)
        ) {
          ctx.state.metadata = { ...parsed, _created_at: event.created_at };
        }
      } catch {
        // Invalid kind 0 content — skip
      }
      clearLoadWatchdog(ctx);
      ctx.state.loading = false;
      ctx.notify();
    },
    () => {
      // EOSE — metadata subscription is live, mark loading done if not already
      clearLoadWatchdog(ctx);
      ctx.state.loading = false;
      ctx.notify();
    },
  );
  ctx.subs.push(metaSub);
}

/**
 * #244 recovery: if the metadata load hasn't resolved within the timeout, the
 * reply was likely lost in a reopen relay-churn race. Re-issue the metadata
 * subscribe on a now-settled connection (bounded retries); on the final attempt,
 * clear `loading` so the napplet shows the profile shell instead of an infinite
 * skeleton. A no-op if a newer load superseded this one or it already resolved.
 */
function armLoadWatchdog(ctx: ProfileContext, pubkey: string, useOutbox: boolean, attempt: number): void {
  clearLoadWatchdog(ctx);
  ctx.loadWatchdog = setTimeout(() => {
    ctx.loadWatchdog = null;
    if (ctx.state.pubkey !== pubkey || !ctx.state.loading) return;
    if (attempt < MAX_METADATA_RETRIES) {
      subscribeMetadata(ctx, pubkey, useOutbox);
      armLoadWatchdog(ctx, pubkey, useOutbox, attempt + 1);
    } else {
      ctx.state.loading = false;
      ctx.notify();
    }
  }, METADATA_LOAD_TIMEOUT_MS);
}

function subscribeFollowState(ctx: ProfileContext, pubkey: string): void {
  identity
    .getPublicKey()
    .then((selfPubkey: string) =>
      collectOnEose({ kinds: [3], authors: [selfPubkey] }).then((events) => {
        if (events.length === 0) return;
        const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
        const pTags = latest.tags.filter((t) => t[0] === 'p' && t[1]);
        ctx.state.followingCount = pTags.length;
        ctx.state.isFollowing = pTags.some((t) => t[1] === pubkey);
        ctx.notify();
      }),
    )
    .catch(() => {
      // identity not available — skip follow state
    });
}

export function loadProfile(ctx: ProfileContext, pubkey: string): void {
  closeSubs(ctx);

  ctx.state.pubkey = pubkey;
  ctx.state.loading = true;
  ctx.state.error = null;
  ctx.state.metadata = null;
  ctx.state.notes = [];
  resetEngagement(ctx);
  ctx.state.isFollowing = false;
  ctx.state.followingCount = 0;
  ctx.notify();

  // Resolve the outbox gate once for this load, then issue the author-addressed
  // (target-pubkey) subscriptions. Engagement (#e) and self kind-3 stay on relay.
  void resolveOutboxGate().then((useOutbox) => {
    // Guard against a newer load() having superseded this one.
    if (ctx.state.pubkey !== pubkey) return;

    subscribeMetadata(ctx, pubkey, useOutbox);
    // #244: guard the metadata load against a lost reply on rapid reopen.
    armLoadWatchdog(ctx, pubkey, useOutbox, 0);

    const notesSub = subscribeAuthor(
      useOutbox,
      noteFilter(ctx, pubkey),
      (event) => addNote(ctx, event),
      () => {
        // notes EOSE — initial burst complete
      },
    );
    ctx.subs.push(notesSub);
  });

  subscribeFollowState(ctx, pubkey);
}

export function setShowReplies(ctx: ProfileContext, showReplies: boolean): void {
  if (ctx.state.showReplies === showReplies) return;
  ctx.state.showReplies = showReplies;
  if (ctx.state.pubkey) loadProfile(ctx, ctx.state.pubkey);
  else ctx.notify();
}

/**
 * Fetch the user's latest kind-3 contact list, apply `transformTags`, and
 * republish. Shared by follow/unfollow which differ only in the transform.
 */
function publishContactListUpdate(transformTags: (existingTags: string[][]) => string[][]): Promise<unknown> {
  return identity.getPublicKey().then((selfPubkey: string) =>
    collectOnEose({ kinds: [3], authors: [selfPubkey] }).then((events) => {
      const now = Math.floor(Date.now() / 1000);
      const existingTags = events.length > 0
        ? events.reduce((a, b) => (b.created_at > a.created_at ? b : a)).tags
        : [];
      return relay.publish({
        kind: 3,
        content: '',
        tags: transformTags(existingTags),
        created_at: now,
      });
    }),
  );
}

export function followUser(ctx: ProfileContext): void {
  if (!ctx.state.pubkey || ctx.state.isFollowPending) return;
  const targetPubkey = ctx.state.pubkey;
  ctx.state.isFollowPending = true;
  ctx.notify();

  publishContactListUpdate((existingTags) =>
    existingTags.some((t) => t[0] === 'p' && t[1] === targetPubkey)
      ? existingTags
      : [...existingTags, ['p', targetPubkey]],
  )
    .then(() => {
      ctx.state.isFollowing = true;
      ctx.state.isFollowPending = false;
      ctx.notify();
    })
    .catch(() => {
      ctx.state.isFollowPending = false;
      ctx.notify();
    });
}

export function unfollowUser(ctx: ProfileContext): void {
  if (!ctx.state.pubkey || ctx.state.isFollowPending) return;
  const targetPubkey = ctx.state.pubkey;
  ctx.state.isFollowPending = true;
  ctx.notify();

  publishContactListUpdate((existingTags) =>
    existingTags.filter((t) => !(t[0] === 'p' && t[1] === targetPubkey)),
  )
    .then(() => {
      ctx.state.isFollowing = false;
      ctx.state.isFollowPending = false;
      ctx.notify();
    })
    .catch(() => {
      ctx.state.isFollowPending = false;
      ctx.notify();
    });
}

export function loadMore(ctx: ProfileContext): void {
  if (!ctx.state.pubkey || ctx.oldestNoteCreatedAt === null) return;
  const pubkey = ctx.state.pubkey;
  const until = ctx.oldestNoteCreatedAt - 1;
  void resolveOutboxGate().then((useOutbox) => {
    if (ctx.state.pubkey !== pubkey) return;
    const moreSub = subscribeAuthor(
      useOutbox,
      noteFilter(ctx, pubkey, { until }),
      (event) => addNote(ctx, event),
      () => {
        // EOSE — pagination batch complete
      },
    );
    ctx.subs.push(moreSub);
  });
}
