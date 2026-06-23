import { describe, expect, it, vi } from 'vitest';
import {
  createCurrentUserPubkeyLoader,
  resolveInitialProfileTarget,
} from './profile-startup';

const PUBKEY = 'a'.repeat(64);

describe('profile startup target resolution', () => {
  it('loads current user once when startup and reaction palette share identity', async () => {
    const getPublicKey = vi.fn().mockResolvedValue(PUBKEY);
    const loader = createCurrentUserPubkeyLoader({ getPublicKey });

    const [first, second] = await Promise.all([loader.load(), loader.load()]);

    expect(first).toBe(PUBKEY);
    expect(second).toBe(PUBKEY);
    expect(getPublicKey).toHaveBeenCalledTimes(1);
  });

  it('uses explicit profile targets without waiting on current user identity', async () => {
    const currentUser = { load: vi.fn().mockResolvedValue(PUBKEY) };

    await expect(resolveInitialProfileTarget({
      urlPubkey: 'b'.repeat(64),
      pendingPubkey: null,
      currentUser,
    })).resolves.toEqual({ pubkey: 'b'.repeat(64), source: 'url' });

    expect(currentUser.load).not.toHaveBeenCalled();
  });

  it('reports unavailable when no target and identity never resolves', async () => {
    const currentUser = { load: vi.fn().mockResolvedValue(null) };

    await expect(resolveInitialProfileTarget({
      urlPubkey: null,
      pendingPubkey: null,
      currentUser,
    })).resolves.toEqual({ pubkey: null, source: 'unavailable' });
  });
});
