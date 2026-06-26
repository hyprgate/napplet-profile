import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { profileIdentityOpenTargets, profileIdentityShareValues } from './profile-share';

const PUBKEY_A = 'a'.repeat(64);
const PUBKEY_B = 'b'.repeat(64);

describe('profile identity share values', () => {
  it('derives hex, npub, and nprofile for a canonical pubkey', () => {
    const values = profileIdentityShareValues(PUBKEY_A);

    expect(values.map((entry) => entry.kind)).toEqual(['hex', 'npub', 'nprofile']);
    expect(values.find((entry) => entry.kind === 'hex')?.value).toBe(PUBKEY_A);
    expect(values.find((entry) => entry.kind === 'npub')?.value).toBe(nip19.npubEncode(PUBKEY_A));

    const decoded = nip19.decode(values.find((entry) => entry.kind === 'nprofile')?.value ?? '');
    expect(decoded.type).toBe('nprofile');
    expect(decoded.data).toMatchObject({ pubkey: PUBKEY_A });
  });

  it('updates all encoded values when the profile target changes', () => {
    const first = profileIdentityShareValues(PUBKEY_A).map((entry) => entry.value);
    const second = profileIdentityShareValues(PUBKEY_B).map((entry) => entry.value);

    expect(first).not.toEqual(second);
    expect(second).toContain(PUBKEY_B);
    expect(second).toContain(nip19.npubEncode(PUBKEY_B));
  });

  it('does not expose stale values for invalid or missing profile targets', () => {
    expect(profileIdentityShareValues('')).toEqual([]);
    expect(profileIdentityShareValues('A'.repeat(64))).toEqual([]);
    expect(profileIdentityOpenTargets(null)).toEqual([]);
  });

  it('builds external open targets from the current npub', () => {
    expect(profileIdentityOpenTargets(PUBKEY_A)).toEqual([
      {
        id: 'njump',
        label: 'njump.to',
        url: `https://njump.to/${nip19.npubEncode(PUBKEY_A)}`,
      },
    ]);
  });
});
