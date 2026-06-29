import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// @napplet/sdk is the postMessage transport to the shell. Mock it so relay
// subscriptions never reply, simulating the #244 reopen race where the metadata
// subscription's EOSE is lost (and @napplet/nap has no reply timeout).
vi.mock('@napplet/sdk', () => ({
  relay: { subscribe: vi.fn(() => ({ close: vi.fn() })), publish: vi.fn(), query: vi.fn().mockResolvedValue([]) },
  outbox: { subscribe: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })) },
  identity: { getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)) },
}));

import { relay } from '@napplet/sdk';
import { createProfileContext, loadProfile } from './profile-engine';

const mockSubscribe = vi.mocked(relay.subscribe);
const PK = 'b'.repeat(64);

function metadataSubscribeCount(): number {
  return mockSubscribe.mock.calls.filter((call) => {
    const filters = call[0] as { kinds?: number[] } | { kinds?: number[] }[];
    const list = Array.isArray(filters) ? filters : [filters];
    return list.some((f) => Array.isArray(f?.kinds) && f.kinds.includes(0));
  }).length;
}

describe('profile-engine load watchdog (#244)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSubscribe.mockClear();
    // No shell → resolveOutboxGate resolves to relay (non-outbox) path.
    (globalThis as unknown as { napplet?: unknown }).napplet = { shell: undefined };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { napplet?: unknown }).napplet;
  });

  it('re-issues the metadata subscribe and finally clears loading when no reply arrives', async () => {
    const ctx = createProfileContext(() => {});
    loadProfile(ctx, PK);
    expect(ctx.state.loading).toBe(true);

    // Flush the resolveOutboxGate().then microtask so the first metadata
    // subscribe is issued and the watchdog is armed.
    await vi.advanceTimersByTimeAsync(0);
    const firstCount = metadataSubscribeCount();
    expect(firstCount, 'metadata subscribe issued on load').toBeGreaterThanOrEqual(1);

    // Watchdog #1: still loading after the timeout → re-issue the subscribe.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(metadataSubscribeCount(), 'metadata subscribe retried after lost reply').toBeGreaterThan(firstCount);
    expect(ctx.state.loading).toBe(true);

    // Watchdog #2 then give-up: loading is cleared so the skeleton is bounded,
    // never permanent.
    await vi.advanceTimersByTimeAsync(8_000 * 2);
    expect(ctx.state.loading, 'skeleton cleared after bounded retries').toBe(false);
  });

  it('clears the watchdog when metadata EOSE arrives (no spurious retry)', async () => {
    let capturedOnEose: (() => void) | undefined;
    mockSubscribe.mockImplementation((filters: unknown, _onEvent: unknown, onEose: unknown) => {
      const list = Array.isArray(filters) ? filters : [filters];
      if (list.some((f: { kinds?: number[] }) => f?.kinds?.includes(0))) {
        capturedOnEose = onEose as () => void;
      }
      return { close: vi.fn() };
    });

    const ctx = createProfileContext(() => {});
    loadProfile(ctx, PK);
    await vi.advanceTimersByTimeAsync(0);
    const countAtEose = metadataSubscribeCount();

    // The shell replies EOSE → loading clears immediately.
    capturedOnEose?.();
    expect(ctx.state.loading).toBe(false);

    // The watchdog must NOT fire a retry after a successful load.
    await vi.advanceTimersByTimeAsync(8_000 * 3);
    expect(metadataSubscribeCount(), 'no retry after EOSE').toBe(countAtEose);
  });
});
