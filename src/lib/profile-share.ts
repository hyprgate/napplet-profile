import { isCanonicalHexPubkey } from '@hyprgate/utils';
import * as nip19 from 'nostr-tools/nip19';

export type ProfileIdentityShareKind = 'hex' | 'npub' | 'nprofile';

export interface ProfileIdentityShareValue {
  kind: ProfileIdentityShareKind;
  label: string;
  value: string;
}

export interface ProfileIdentityOpenTarget {
  id: string;
  label: string;
  url: string;
}

export function profileIdentityShareValues(pubkey: string | null | undefined): ProfileIdentityShareValue[] {
  if (!isCanonicalHexPubkey(pubkey)) return [];

  return [
    {
      kind: 'hex',
      label: 'hex',
      value: pubkey,
    },
    {
      kind: 'npub',
      label: 'npub',
      value: nip19.npubEncode(pubkey),
    },
    {
      kind: 'nprofile',
      label: 'nprofile',
      value: nip19.nprofileEncode({ pubkey }),
    },
  ];
}

export function profileIdentityOpenTargets(pubkey: string | null | undefined): ProfileIdentityOpenTarget[] {
  if (!isCanonicalHexPubkey(pubkey)) return [];
  const npub = nip19.npubEncode(pubkey);
  return [
    {
      id: 'njump',
      label: 'njump.to',
      url: `https://njump.to/${npub}`,
    },
  ];
}
