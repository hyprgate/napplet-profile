import { isCanonicalHexPubkey } from '@hyprgate/utils';
import * as nip19 from 'nostr-tools/nip19';

interface ProfileNames {
  display_name?: unknown;
  displayName?: unknown;
  name?: unknown;
  nip05?: unknown;
}

export function shortNpub(pubkey: string): string {
  const hex: string = pubkey;
  if (!isCanonicalHexPubkey(pubkey)) return hex.slice(0, 8) || 'Unknown';
  const npub = nip19.npubEncode(hex);
  return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
}

/** Best-effort name for a person: profile metadata first, a short npub otherwise. */
export function profileDisplayName(metadata: ProfileNames | null | undefined, pubkey: string): string {
  for (const candidate of [metadata?.display_name, metadata?.displayName, metadata?.name, metadata?.nip05]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return shortNpub(pubkey);
}

/** NIP-05 writes the root identifier as `_@domain`, which reads as just the domain. */
export function displayNip05(nip05: unknown): string | null {
  if (typeof nip05 !== 'string' || !nip05.trim()) return null;
  return nip05.trim().replace(/^_@/, '');
}

/** Metadata is free text, so only ever link to a real web URL. */
export function websiteLink(website: unknown): { href: string; label: string } | null {
  if (typeof website !== 'string' || !website.trim()) return null;
  const value = website.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { href: url.href, label: `${url.host}${url.pathname === '/' ? '' : url.pathname}` };
  } catch {
    return null;
  }
}
