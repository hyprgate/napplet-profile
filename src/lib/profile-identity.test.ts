import { describe, expect, it } from 'vitest';
import * as nip19 from 'nostr-tools/nip19';
import { displayNip05, profileDisplayName, shortNpub, websiteLink } from './profile-identity';

const PUBKEY = 'c'.repeat(64);

describe('profile identity display', () => {
  it('prefers metadata names and falls back to an npub, never hex', () => {
    expect(profileDisplayName({ display_name: 'Ada', name: 'ada' }, PUBKEY)).toBe('Ada');
    expect(profileDisplayName({ name: 'ada' }, PUBKEY)).toBe('ada');
    expect(profileDisplayName({ nip05: 'ada@example.com' }, PUBKEY)).toBe('ada@example.com');
    const fallback = profileDisplayName(null, PUBKEY);
    expect(fallback).toBe(shortNpub(PUBKEY));
    expect(nip19.npubEncode(PUBKEY).startsWith(fallback.slice(0, 12))).toBe(true);
    expect(fallback).not.toContain('cccc');
  });

  it('shows a root NIP-05 identifier as its domain', () => {
    expect(displayNip05('_@example.com')).toBe('example.com');
    expect(displayNip05('ada@example.com')).toBe('ada@example.com');
    expect(displayNip05(42)).toBeNull();
  });

  it('only links websites over http or https', () => {
    expect(websiteLink('example.com/me')).toEqual({ href: 'https://example.com/me', label: 'example.com/me' });
    expect(websiteLink('https://example.com')).toEqual({ href: 'https://example.com/', label: 'example.com' });
    expect(websiteLink('javascript:alert(1)')).toBeNull();
    expect(websiteLink('not a url')).toBeNull();
    expect(websiteLink(undefined)).toBeNull();
  });
});
