import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  createProfileReplyReferenceOpenPayload,
  profileReplyContextForNote,
} from './profile-reply-context';

const ROOT_ID = '0'.repeat(63) + '1';
const PARENT_ID = '0'.repeat(63) + '2';
const PUBKEY = 'a'.repeat(64);

describe('profile reply context helpers', () => {
  it('renders relay-hinted reply references as clickable note-viewer nevents', () => {
    const context = profileReplyContextForNote({
      kind: 1,
      tags: [
        ['e', ROOT_ID, 'wss://relay.example', 'root'],
        ['e', PARENT_ID, 'wss://relay.example', 'reply'],
        ['p', PUBKEY],
      ],
    });

    expect(context).not.toBeNull();
    expect(context!.parent.title).toBe(nip19.neventEncode({ id: PARENT_ID, relays: ['wss://relay.example'] }));
    expect(context!.parent.label).toMatch(/^nevent1/);
    expect(context!.parent.label).not.toContain(PARENT_ID.slice(0, 8));

    const payload = createProfileReplyReferenceOpenPayload(context!.parent);
    expect(payload).toMatchObject({
      target: {
        type: 'event',
        id: PARENT_ID,
        nip19: context!.parent.title,
      },
      relays: ['wss://relay.example'],
      source: { napplet: 'profile' },
    });
  });

  it('uses note entities for event references without relay hints', () => {
    const context = profileReplyContextForNote({
      kind: 1,
      tags: [
        ['e', ROOT_ID, '', 'root'],
        ['e', PARENT_ID, '', 'reply'],
      ],
    });

    expect(context).not.toBeNull();
    expect(context!.parent.title).toBe(nip19.noteEncode(PARENT_ID));
    expect(context!.parent.label).toMatch(/^note1/);
    expect(context!.parent.relays).toEqual([]);
  });
});
