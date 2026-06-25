import type { PublicKeyIdentityClient } from '@hyprgate/utils';
import { isCanonicalHexPubkey, waitForPublicKey } from '@hyprgate/utils';

export const PROFILE_IDENTITY_TIMEOUT_MS = 2500;
export const PROFILE_IDENTITY_RETRY_INTERVAL_MS = 100;

export interface CurrentUserPubkeyLoader {
  load(): Promise<string | null>;
}

export function createCurrentUserPubkeyLoader(
  identity: PublicKeyIdentityClient,
  signal?: AbortSignal,
): CurrentUserPubkeyLoader {
  let promise: Promise<string | null> | null = null;
  return {
    load() {
      promise ??= waitForPublicKey(identity, {
        signal,
        timeoutMs: PROFILE_IDENTITY_TIMEOUT_MS,
        intervalMs: PROFILE_IDENTITY_RETRY_INTERVAL_MS,
        isValidPubkey: isCanonicalHexPubkey,
      });
      return promise;
    },
  };
}

export interface InitialProfileTargetInput {
  urlPubkey: string | null;
  pendingPubkey: string | null;
  currentUser: CurrentUserPubkeyLoader;
}

export interface InitialProfileTarget {
  pubkey: string | null;
  source: 'url' | 'pending' | 'current-user' | 'unavailable';
}

export async function resolveInitialProfileTarget(input: InitialProfileTargetInput): Promise<InitialProfileTarget> {
  if (isCanonicalHexPubkey(input.urlPubkey)) {
    return { pubkey: input.urlPubkey, source: 'url' };
  }
  if (isCanonicalHexPubkey(input.pendingPubkey)) {
    return { pubkey: input.pendingPubkey, source: 'pending' };
  }
  const pubkey = await input.currentUser.load();
  return isCanonicalHexPubkey(pubkey)
    ? { pubkey, source: 'current-user' }
    : { pubkey: null, source: 'unavailable' };
}
