// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { profileTargetFromIntentDelivery, type IntentDelivery } from './profile-intent-delivery.js';

const pubkey = 'a'.repeat(64);
function event(payload?: unknown): IntentDelivery {
  return {
    archetype: 'profile', action: 'open', convention: 'napplet:profile/open',
    sender: 'hyprgate-shell',
    ...(arguments.length > 0 ? { payload } : {}),
  };
}

describe('profile canonical INTENT delivery adapter', () => {
  it.each(['warm direct', 'cold buffered delivery'])('extracts one target for a valid %s IntentDelivery', (delivery) => {
    expect(delivery).toBeTruthy();
    expect(profileTargetFromIntentDelivery(event({ pubkey }))).toBe(pubkey);
  });

  it('rejects another role, action or convention even with a valid payload', () => {
    const valid = event({ pubkey });
    expect(profileTargetFromIntentDelivery({ ...valid, archetype: 'unrelated' })).toBeNull();
    expect(profileTargetFromIntentDelivery({ ...valid, action: 'edit' })).toBeNull();
    expect(profileTargetFromIntentDelivery({ ...valid, convention: 'napplet:unrelated/open' })).toBeNull();
  });

  it('rejects absent and malformed payloads before the App state transition', () => {
    expect(profileTargetFromIntentDelivery(event())).toBeNull();
    expect(profileTargetFromIntentDelivery(event({ pubkey: 'not-a-pubkey' }))).toBeNull();
  });
});
