import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProfileStore } from './profile-store';
import type { NostrEvent } from '@hyprgate/types';

// ---- Mocks ----------------------------------------------------------------

vi.mock('@napplet/sdk', () => ({
  relay: {
    subscribe: vi.fn().mockReturnValue({ close: vi.fn() }),
    publish: vi.fn().mockResolvedValue({}),
    query: vi.fn().mockResolvedValue([]),
  },
  outbox: {
    subscribe: vi.fn(),
    query: vi.fn(),
  },
  identity: {
    getPublicKey: vi.fn().mockResolvedValue('deadbeef'),
  },
}));

// ---- Test setup -----------------------------------------------------------

import { relay, outbox, identity } from '@napplet/sdk';

const mockSubscribe = vi.mocked(relay.subscribe);
const mockOutboxSubscribe = vi.mocked(outbox.subscribe);
const mockOutboxQuery = vi.mocked(outbox.query);
const mockPublish = vi.mocked(relay.publish);

function makeCloseHandle(): { close: () => void } {
  return { close: vi.fn(() => {}) };
}

type RelayEventResult = { event: NostrEvent };

function makeOutboxSubscriptionHandle(
  registerEvent?: (listener: (result: RelayEventResult) => void) => void,
): ReturnType<typeof outbox.subscribe> {
  const handle = {
    close: vi.fn(() => {}),
    on: vi.fn(),
  };
  handle.on.mockImplementation((event: string, listener: (result: RelayEventResult) => void) => {
    if (event === 'event') registerEvent?.(listener);
    return handle;
  });
  return handle as unknown as ReturnType<typeof outbox.subscribe>;
}

/** Install window.napplet.shell with a toggleable outbox capability. */
function installShell(supportsOutbox: boolean): void {
  (globalThis as unknown as { napplet: unknown }).napplet = {
    shell: {
      ready: vi.fn().mockResolvedValue({}),
      supports: vi.fn((domain: string) => (domain === 'outbox' ? supportsOutbox : false)),
    },
  };
}

/** Flush microtasks so deferred (post-ready) subscriptions are issued. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'event',
    kind: 1,
    content: '',
    pubkey: 'deadbeef',
    created_at: 1,
    tags: [],
    sig: 'sig',
    ...overrides,
  };
}

function fireRelayEvent(callback: ((result: RelayEventResult) => void) | null, event: NostrEvent): void {
  callback?.({ event });
}

/**
 * Build a subscribe mock that:
 * - captures onEvent/onEose for a matching filter predicate
 * - fires EOSE immediately (via the returned handle) if triggerEose=true
 */
function captureSubscribe(
  predicate: (filter: import('@hyprgate/types').NostrFilter | import('@hyprgate/types').NostrFilter[]) => boolean,
): {
  onEvent: ((result: RelayEventResult) => void) | null;
  onEose: (() => void) | null;
  handle: { close: () => void };
} {
  const captured: {
    onEvent: ((result: RelayEventResult) => void) | null;
    onEose: (() => void) | null;
    handle: { close: () => void };
  } = { onEvent: null, onEose: null, handle: makeCloseHandle() };

  mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
    if (predicate(filters)) {
      captured.onEvent = onEvent ?? null;
      captured.onEose = onEose ?? null;
      return captured.handle;
    }
    return makeCloseHandle();
  });

  return captured;
}

function installIdentityMock(pubkey = 'deadbeef') {
  vi.mocked(identity.getPublicKey).mockResolvedValue(pubkey);
}

beforeEach(() => {
  vi.clearAllMocks();
  installIdentityMock();
  // Default: outbox unsupported (relay path), matching the live runtime before
  // shell.init delivers a capable environment.
  installShell(false);
  // Default: subscribe returns a closeable handle
  mockSubscribe.mockReturnValue(makeCloseHandle());
  mockOutboxSubscribe.mockReturnValue(makeOutboxSubscriptionHandle());
  mockOutboxQuery.mockResolvedValue({ events: [] });
  // Default: publish succeeds
  mockPublish.mockResolvedValue(makeEvent({ id: 'published' }));
});

afterEach(() => {
  delete (globalThis as unknown as { napplet?: unknown }).napplet;
});

// ---- Tests ----------------------------------------------------------------

describe('createProfileStore', () => {
  it('factory returns an object with loadProfile, followUser, unfollowUser, loadMore, destroy', () => {
    const store = createProfileStore();
    expect(typeof store.loadProfile).toBe('function');
    expect(typeof store.setShowReplies).toBe('function');
    expect(typeof store.followUser).toBe('function');
    expect(typeof store.unfollowUser).toBe('function');
    expect(typeof store.loadMore).toBe('function');
    expect(typeof store.destroy).toBe('function');
  });

  it('factory accepts an optional onUpdate callback without throwing', () => {
    const onUpdate = vi.fn();
    expect(() => createProfileStore(onUpdate)).not.toThrow();
  });

  it('loadProfile sets pubkey and subscribes for kind 0 metadata', async () => {
    const store = createProfileStore();
    store.loadProfile('pubkey123');
    expect(store.state.pubkey).toBe('pubkey123');
    expect(store.state.loading).toBe(true);

    await flush();
    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: [0], authors: ['pubkey123'] }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('loadProfile subscribes for kind 1 notes', async () => {
    const store = createProfileStore();
    store.loadProfile('pubkey123');

    await flush();
    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: [1], authors: ['pubkey123'], limit: 30 }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('onUpdate callback is called after loadProfile resets state', () => {
    const onUpdate = vi.fn();
    const store = createProfileStore(onUpdate);
    store.loadProfile('pubkey123');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('loadProfile populates metadata when kind 0 event arrives', async () => {
    let capturedOnEvent: ((result: RelayEventResult) => void) | null = null;

    mockSubscribe.mockImplementation((filters, onEvent) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (!capturedOnEvent && f?.kinds?.includes(0)) {
        capturedOnEvent = onEvent ?? null;
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();

    const profileContent = { name: 'Alice', about: 'Nostr user', picture: 'https://example.com/avatar.png' };
    const kind0Event: NostrEvent = {
      id: 'evt1',
      kind: 0,
      content: JSON.stringify(profileContent),
      pubkey: 'pubkey123',
      created_at: 1000000,
      tags: [],
      sig: 'sig',
    };

    fireRelayEvent(capturedOnEvent, kind0Event);

    expect(store.state.metadata).toBeDefined();
    expect((store.state.metadata as { name?: string })?.name).toBe('Alice');
    expect(store.state.loading).toBe(false);
  });

  it('loadProfile populates notes when kind 1 event arrives', async () => {
    const onEventCallbacks: ((result: RelayEventResult) => void)[] = [];

    mockSubscribe.mockImplementation((filters, onEvent) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(1)) {
        onEventCallbacks.push(onEvent!);
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();

    const noteEvent: NostrEvent = {
      id: 'note1',
      kind: 1,
      content: 'Hello nostr',
      pubkey: 'pubkey123',
      created_at: 1000000,
      tags: [],
      sig: 'sig',
    };

    onEventCallbacks.forEach((cb) => fireRelayEvent(cb, noteEvent));

    expect(store.state.notes).toContain(noteEvent);
  });

  it('hides kind 1 replies by default', async () => {
    const captured = captureSubscribe((filters) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      return Boolean(f?.kinds?.includes(1) && f.authors?.includes('pubkey123'));
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();

    fireRelayEvent(captured.onEvent, makeEvent({ id: 'root', tags: [] }));
    fireRelayEvent(captured.onEvent, makeEvent({ id: 'reply', tags: [['e', 'root'], ['p', 'pubkey123']] }));

    expect(store.state.showReplies).toBe(false);
    expect(store.state.notes.map((note) => note.id)).toEqual(['root']);
  });

  it('showReplies reloads notes with kind 1 and kind 1111 filters', async () => {
    let capturedNotesOnEvent: ((result: RelayEventResult) => void) | null = null;

    mockSubscribe.mockImplementation((filters, onEvent) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.authors?.includes('pubkey123') && f.kinds?.includes(1111)) {
        capturedNotesOnEvent = onEvent ?? null;
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();
    store.setShowReplies(true);
    await flush();

    const notesCall = mockSubscribe.mock.calls.find((call) => {
      const f = (Array.isArray(call[0]) ? call[0][0] : call[0]) as { kinds?: number[]; authors?: string[] };
      return f.authors?.includes('pubkey123') && f.kinds?.includes(1111);
    });
    expect(notesCall).toBeDefined();
    const notesFilter = (Array.isArray(notesCall![0]) ? notesCall![0][0] : notesCall![0]) as { kinds?: number[] };
    expect(notesFilter.kinds).toEqual([1, 1111]);

    fireRelayEvent(capturedNotesOnEvent, makeEvent({ id: 'kind1-reply', tags: [['e', 'root'], ['p', 'pubkey123']] }));
    fireRelayEvent(capturedNotesOnEvent, makeEvent({ id: 'kind1111-reply', kind: 1111, tags: [['E', 'root'], ['K', '1'], ['P', 'pubkey123']] }));

    expect(store.state.notes.map((note) => note.id)).toEqual(['kind1-reply', 'kind1111-reply']);
  });

  it('counts engagement events for profile notes', async () => {
    let notesOnEvent: ((result: RelayEventResult) => void) | null = null;
    let engagementOnEvent: ((result: RelayEventResult) => void) | null = null;

    mockSubscribe.mockImplementation((filters, onEvent) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.authors?.includes('pubkey123') && f.kinds?.includes(1)) notesOnEvent = onEvent ?? null;
      if (Array.isArray(filters) && filters.some((filter) => filter.kinds?.includes(7))) {
        engagementOnEvent = onEvent ?? null;
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();
    fireRelayEvent(notesOnEvent, makeEvent({ id: 'note1' }));
    await flush();

    fireRelayEvent(engagementOnEvent, makeEvent({ id: 'react1', kind: 7, pubkey: 'pk2', tags: [['e', 'note1']], content: '+' }));
    fireRelayEvent(engagementOnEvent, makeEvent({ id: 'comment1', kind: 1, pubkey: 'pk3', tags: [['e', 'note1']], content: 'reply' }));
    fireRelayEvent(engagementOnEvent, makeEvent({ id: 'comment2', kind: 1111, pubkey: 'pk4', tags: [['E', 'note1']], content: 'nip22' }));

    expect(store.state.engagement.get('note1')).toMatchObject({
      reactions: 1,
      reactionGroups: [{ content: '+', count: 1 }],
      comments: 2,
    });
  });

  it('batches engagement subscription retargeting during initial note bursts', async () => {
    let notesOnEvent: ((result: RelayEventResult) => void) | null = null;
    const engagementHandles = [makeCloseHandle(), makeCloseHandle(), makeCloseHandle()];

    mockSubscribe.mockImplementation((filters, onEvent) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.authors?.includes('pubkey123') && f.kinds?.includes(1)) {
        notesOnEvent = onEvent ?? null;
        return makeCloseHandle();
      }
      if (Array.isArray(filters) && filters.some((filter) => filter.kinds?.includes(7))) {
        return engagementHandles.shift() ?? makeCloseHandle();
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();

    fireRelayEvent(notesOnEvent, makeEvent({ id: 'note1', created_at: 3 }));
    fireRelayEvent(notesOnEvent, makeEvent({ id: 'note2', created_at: 2 }));
    fireRelayEvent(notesOnEvent, makeEvent({ id: 'note3', created_at: 1 }));
    await flush();

    const engagementCalls = mockSubscribe.mock.calls.filter((call) => (
      Array.isArray(call[0]) && call[0].some((filter) => filter.kinds?.includes(7))
    ));
    expect(engagementCalls).toHaveLength(1);
    const filters = engagementCalls[0]![0] as Array<{ '#e'?: string[] }>;
    expect(filters[0]!['#e']).toEqual(['note1', 'note2', 'note3']);
  });

  it('isFollowing reflects p-tags in kind 3 event delivered via subscribe', async () => {
    const kind3Event: NostrEvent = {
      id: 'contacts1',
      kind: 3,
      content: '',
      pubkey: 'deadbeef',
      created_at: 2000000,
      tags: [['p', 'targetPubkey'], ['p', 'otherPubkey']],
      sig: 'sig',
    };

    // collectOnEose uses relay.subscribe; deliver the event then trigger EOSE.
    // EOSE must fire asynchronously — collectOnEose assigns `const sub = relay.subscribe(...)`
    // and the EOSE callback calls `sub.close()`. If EOSE fires synchronously during
    // the subscribe call, `sub` is still in the temporal dead zone (TDZ) and throws.
    mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(3)) {
        queueMicrotask(() => {
          fireRelayEvent(onEvent ?? null, kind3Event);
          onEose?.();
        });
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');

    // Wait for: getPublicKey microtask + collectOnEose microtask + then() handler
    await new Promise((r) => setTimeout(r, 0));

    expect(store.state.isFollowing).toBe(true);
    expect(store.state.followingCount).toBe(2);
  });

  it('isFollowing is false when target pubkey not in kind 3 p-tags', async () => {
    const kind3Event: NostrEvent = {
      id: 'contacts1',
      kind: 3,
      content: '',
      pubkey: 'deadbeef',
      created_at: 2000000,
      tags: [['p', 'otherPubkey']],
      sig: 'sig',
    };

    mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(3)) {
        queueMicrotask(() => {
          fireRelayEvent(onEvent ?? null, kind3Event);
          onEose?.();
        });
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');

    await new Promise((r) => setTimeout(r, 0));

    expect(store.state.isFollowing).toBe(false);
  });

  it('followUser adds p-tag and calls publish', async () => {
    const existing3: NostrEvent = {
      id: 'k3',
      kind: 3,
      content: '',
      pubkey: 'deadbeef',
      created_at: 1000,
      tags: [['p', 'existingFollow']],
      sig: 'sig',
    };

    // First kind-3 subscribe (collectOnEose in loadProfile): return existing3 + EOSE
    // Second kind-3 subscribe (collectOnEose in followUser): return existing3 + EOSE
    // EOSE must fire asynchronously to avoid TDZ issue in collectOnEose.
    mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(3)) {
        queueMicrotask(() => {
          fireRelayEvent(onEvent ?? null, existing3);
          onEose?.();
        });
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');

    await new Promise((r) => setTimeout(r, 0));

    expect(store.state.isFollowPending).toBe(false);
    store.followUser();
    expect(store.state.isFollowPending).toBe(true);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        content: '',
        tags: expect.arrayContaining([['p', 'targetPubkey']]),
      }),
    );
    expect(store.state.isFollowing).toBe(true);
    expect(store.state.isFollowPending).toBe(false);
  });

  it('unfollowUser removes p-tag and calls publish', async () => {
    const existing3: NostrEvent = {
      id: 'k3',
      kind: 3,
      content: '',
      pubkey: 'deadbeef',
      created_at: 1000,
      tags: [['p', 'targetPubkey'], ['p', 'otherPubkey']],
      sig: 'sig',
    };

    mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(3)) {
        queueMicrotask(() => {
          fireRelayEvent(onEvent ?? null, existing3);
          onEose?.();
        });
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');

    await new Promise((r) => setTimeout(r, 0));

    store.unfollowUser();

    await new Promise((r) => setTimeout(r, 0));

    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        content: '',
        tags: expect.not.arrayContaining([['p', 'targetPubkey']]),
      }),
    );
    expect(store.state.isFollowing).toBe(false);
    expect(store.state.isFollowPending).toBe(false);
  });

  it('isFollowPending resets to false after followUser completes', async () => {
    mockSubscribe.mockImplementation((filters, _onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(3)) {
        queueMicrotask(() => onEose?.()); // No events, just EOSE (async to avoid TDZ)
      }
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');

    await new Promise((r) => setTimeout(r, 0));

    store.followUser();
    expect(store.state.isFollowPending).toBe(true);

    await new Promise((r) => setTimeout(r, 0));

    expect(store.state.isFollowPending).toBe(false);
  });

  it('destroy closes all active subscriptions', async () => {
    // metadata + notes are pushed to ctx.subs (the deferred, post-ready subs).
    const metaHandle = makeCloseHandle();
    const notesHandle = makeCloseHandle();
    mockSubscribe.mockImplementation((filters, _onEvent, onEose) => {
      const f = Array.isArray(filters) ? filters[0] : filters;
      if (f?.kinds?.includes(0)) return metaHandle;
      if (f?.kinds?.includes(1) && f.authors?.includes('pubkey123')) return notesHandle;
      if (f?.kinds?.includes(3)) queueMicrotask(() => onEose?.());
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('pubkey123');
    await flush();
    store.destroy();

    expect(metaHandle.close).toHaveBeenCalled();
    expect(notesHandle.close).toHaveBeenCalled();
  });
});

// ---- Outbox gating --------------------------------------------------------

describe('profile outbox gating', () => {
  function classifyFilter(
    filters: import('@hyprgate/types').NostrFilter | import('@hyprgate/types').NostrFilter[],
  ): 'metadata' | 'notes' | 'engagement' | 'self-kind3' | 'other' {
    if (Array.isArray(filters) && filters.length > 1) return 'engagement';
    const f = Array.isArray(filters) ? filters[0] : filters;
    if (f?.kinds?.includes(0) && f.authors?.includes('targetPubkey')) return 'metadata';
    if (f?.kinds?.includes(3) && f.authors?.includes('deadbeef')) return 'self-kind3';
    if (f?.kinds?.includes(1) && f.authors?.includes('targetPubkey')) return 'notes';
    return 'other';
  }

  it('routes target metadata/notes/loadMore via outbox when supported; engagement + self-kind3 stay on relay', async () => {
    installShell(true);

    const relayKinds: string[] = [];
    mockSubscribe.mockImplementation((filters, _onEvent, onEose) => {
      const kind = classifyFilter(filters);
      relayKinds.push(kind);
      if (kind === 'self-kind3') queueMicrotask(() => onEose?.());
      return makeCloseHandle();
    });
    const loadedNote = { id: 'n1', kind: 1, pubkey: 'targetPubkey', created_at: 500, tags: [], content: 'hi', sig: 's' };
    mockOutboxQuery.mockImplementation(async (filters) => {
      return classifyFilter(filters) === 'notes'
        ? { events: [{ event: loadedNote }] }
        : { events: [] };
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');
    await flush();
    await flush();

    // metadata + notes hydrate via the finite outbox query.
    const outboxFilters = mockOutboxQuery.mock.calls.map((c) => classifyFilter(c[0]));
    expect(outboxFilters).toContain('metadata');
    expect(outboxFilters).toContain('notes');

    // Initial metadata and notes also remain live while NIP-65 discovery settles.
    const streamFilters = mockOutboxSubscribe.mock.calls.map((c) => classifyFilter(c[0]));
    expect(streamFilters).toContain('metadata');
    expect(streamFilters).toContain('notes');

    // engagement + self-kind3 must NOT be on outbox
    expect(outboxFilters).not.toContain('engagement');
    expect(outboxFilters).not.toContain('self-kind3');

    // metadata/notes must NOT have been issued on relay
    expect(relayKinds).not.toContain('metadata');
    expect(relayKinds).not.toContain('notes');
    // self-kind3 stays on relay
    expect(relayKinds).toContain('self-kind3');

    expect(store.state.notes.map((event) => event.id)).toEqual(['n1']);

    mockOutboxQuery.mockClear();
    store.loadMore();
    await flush();
    await flush();
    const moreFilters = mockOutboxQuery.mock.calls.map((c) => classifyFilter(c[0]));
    expect(moreFilters).toContain('notes');
    expect(mockOutboxSubscribe).toHaveBeenCalledTimes(2);
  });

  it('streams initial metadata and notes after an empty outbox history query', async () => {
    installShell(true);

    const listeners: {
      metadata: ((result: RelayEventResult) => void) | null;
      notes: ((result: RelayEventResult) => void) | null;
    } = { metadata: null, notes: null };
    const handles: Array<ReturnType<typeof outbox.subscribe>> = [];
    mockOutboxSubscribe.mockImplementation((filters) => {
      const kind = classifyFilter(filters);
      const handle = makeOutboxSubscriptionHandle((listener) => {
        if (kind === 'metadata') listeners.metadata = listener;
        if (kind === 'notes') listeners.notes = listener;
      });
      handles.push(handle);
      return handle;
    });
    mockOutboxQuery.mockResolvedValue({ events: [] });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');
    await flush();
    await flush();

    expect(store.state.metadata).toBeNull();
    expect(store.state.notes).toEqual([]);
    expect(listeners.metadata).not.toBeNull();
    expect(listeners.notes).not.toBeNull();

    listeners.metadata?.({
      event: makeEvent({
        id: 'metadata',
        kind: 0,
        pubkey: 'targetPubkey',
        created_at: 10,
        content: JSON.stringify({ name: 'D2' }),
      }),
    });
    listeners.notes?.({
      event: makeEvent({
        id: 'late-note',
        kind: 1,
        pubkey: 'targetPubkey',
        created_at: 9,
        content: 'Arrived after the finite query.',
      }),
    });

    expect((store.state.metadata as { name?: string })?.name).toBe('D2');
    expect(store.state.notes.map((event) => event.id)).toEqual(['late-note']);

    // Pagination stays finite: it must not leave another live stream behind.
    store.loadMore();
    await flush();
    await flush();
    expect(mockOutboxSubscribe).toHaveBeenCalledTimes(2);

    store.destroy();
    for (const handle of handles) {
      expect(handle.close).toHaveBeenCalledOnce();
    }
  });

  it('falls back to relay.subscribe for metadata/notes/loadMore when outbox unsupported', async () => {
    installShell(false);

    const relayKinds: string[] = [];
    let notesOnEvent: ((result: RelayEventResult) => void) | null = null;
    mockSubscribe.mockImplementation((filters, onEvent, onEose) => {
      const kind = classifyFilter(filters);
      relayKinds.push(kind);
      if (kind === 'notes') notesOnEvent = onEvent ?? null;
      if (kind === 'self-kind3') queueMicrotask(() => onEose?.());
      return makeCloseHandle();
    });

    const store = createProfileStore();
    store.loadProfile('targetPubkey');
    await flush();

    expect(mockOutboxQuery).not.toHaveBeenCalled();
    expect(relayKinds).toContain('metadata');
    expect(relayKinds).toContain('notes');
    expect(relayKinds).toContain('self-kind3');

    fireRelayEvent(notesOnEvent, makeEvent({ id: 'n1', kind: 1, pubkey: 'targetPubkey', created_at: 500 }));
    relayKinds.length = 0;
    store.loadMore();
    await flush();
    expect(mockOutboxQuery).not.toHaveBeenCalled();
    expect(relayKinds).toContain('notes');
  });
});
