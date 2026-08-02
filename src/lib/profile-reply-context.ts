import type { NostrEvent } from 'applesauce-core/helpers/event';
import * as nip19 from 'nostr-tools/nip19';
import {
  createNoteViewerOpenPayload,
  parseNoteViewerReply,
  type NoteViewerOpenPayload,
  type NoteViewerOpenTarget,
  type NoteViewerTargetReference,
} from '@hyprgate/utils';

export interface ProfileReplyContextDisplay {
  label: string;
  parent: ProfileReplyContextReferenceDisplay;
  root: ProfileReplyContextReferenceDisplay | null;
}

export interface ProfileReplyContextReferenceDisplay {
  label: string;
  title: string;
  reference: NoteViewerTargetReference;
  target: NoteViewerOpenTarget | null;
  relays: string[];
}

export function profileReplyContextForNote(event: Pick<NostrEvent, 'kind' | 'tags'>): ProfileReplyContextDisplay | null {
  const reply = parseNoteViewerReply(event);
  if (!reply) return null;

  if (reply.type === 'kind1-reply') {
    const parent = eventReferenceDisplay(reply.parent);
    const root = eventReferenceDisplay(reply.root);
    return {
      label: reply.source === 'marked' ? 'kind 1 reply' : 'kind 1 reply (legacy tags)',
      parent,
      root: referenceKey(root.reference) !== referenceKey(parent.reference) ? root : null,
    };
  }

  const parent = targetReferenceDisplay(reply.parent, reply.parentKind, reply.parentPubkey);
  const root = targetReferenceDisplay(reply.root, reply.rootKind, reply.rootPubkey);
  return {
    label: 'kind 1111 reply',
    parent,
    root: referenceKey(root.reference) !== referenceKey(parent.reference) ? root : null,
  };
}

export function createProfileReplyReferenceOpenPayload(
  reference: ProfileReplyContextReferenceDisplay,
): NoteViewerOpenPayload | null {
  if (!reference.target) return null;
  return createNoteViewerOpenPayload({
    target: reference.target,
    relays: reference.relays,
    behavior: { focus: true },
    source: { napplet: 'profile' },
  });
}

function targetReferenceDisplay(
  reference: NoteViewerTargetReference,
  kind?: number,
  pubkey?: string,
): ProfileReplyContextReferenceDisplay {
  if (reference.type === 'address') return addressReferenceDisplay(reference, kind, pubkey);
  return eventReferenceDisplay({
    ...reference,
    ...(reference.kind !== undefined ? {} : kind !== undefined ? { kind } : {}),
    ...(reference.pubkey !== undefined ? {} : pubkey !== undefined ? { pubkey } : {}),
  });
}

function eventReferenceDisplay(
  reference: Extract<NoteViewerTargetReference, { type: 'event' }>,
): ProfileReplyContextReferenceDisplay {
  const relays = reference.relay ? [reference.relay] : [];
  const encoded = eventNip19(reference);
  return {
    label: compactNip19(encoded),
    title: encoded,
    reference,
    target: {
      type: 'event',
      id: reference.id,
      ...(reference.kind !== undefined ? { kind: reference.kind } : {}),
      ...(reference.pubkey !== undefined ? { pubkey: reference.pubkey } : {}),
      nip19: encoded,
    },
    relays,
  };
}

function addressReferenceDisplay(
  reference: Extract<NoteViewerTargetReference, { type: 'address' }>,
  kind?: number,
  pubkey?: string,
): ProfileReplyContextReferenceDisplay {
  const decoded = parseAddressReference(reference.address, kind, pubkey);
  const relays = reference.relay ? [reference.relay] : [];
  if (!decoded) {
    return {
      label: reference.address,
      title: reference.address,
      reference,
      target: null,
      relays,
    };
  }

  const encoded = addressNip19(reference, decoded);
  return {
    label: compactNip19(encoded),
    title: encoded,
    reference: {
      ...reference,
      kind: decoded.kind,
      pubkey: decoded.pubkey,
    },
    target: {
      type: 'address',
      kind: decoded.kind,
      pubkey: decoded.pubkey,
      identifier: decoded.identifier,
      nip19: encoded,
    },
    relays,
  };
}

function eventNip19(reference: Extract<NoteViewerTargetReference, { type: 'event' }>): string {
  try {
    if (reference.relay || reference.kind !== undefined || reference.pubkey) {
      return nip19.neventEncode({
        id: reference.id,
        ...(reference.relay ? { relays: [reference.relay] } : {}),
        ...(reference.pubkey ? { author: reference.pubkey } : {}),
        ...(reference.kind !== undefined ? { kind: reference.kind } : {}),
      });
    }
    return nip19.noteEncode(reference.id);
  } catch {
    return reference.id;
  }
}

function addressNip19(reference: Extract<NoteViewerTargetReference, { type: 'address' }>, decoded: AddressParts): string {
  try {
    return nip19.naddrEncode({
      kind: decoded.kind,
      pubkey: decoded.pubkey,
      identifier: decoded.identifier,
      ...(reference.relay ? { relays: [reference.relay] } : {}),
    });
  } catch {
    return reference.address;
  }
}

function compactNip19(value: string): string {
  return value.length > 28 ? `${value.slice(0, 18)}...${value.slice(-8)}` : value;
}

interface AddressParts {
  kind: number;
  pubkey: string;
  identifier: string;
}

function parseAddressReference(address: string, kind?: number, pubkey?: string): AddressParts | null {
  const [kindPart, pubkeyPart, ...identifierParts] = address.split(':');
  const parsedKind = kind ?? Number(kindPart);
  const parsedPubkey = pubkey ?? pubkeyPart;
  const identifier = identifierParts.join(':');
  if (!Number.isInteger(parsedKind) || !parsedPubkey || identifier.length === 0) return null;
  return {
    kind: parsedKind,
    pubkey: parsedPubkey,
    identifier,
  };
}

function referenceKey(reference: NoteViewerTargetReference): string {
  return reference.type === 'event'
    ? `event:${reference.id}`
    : `address:${reference.address}`;
}
