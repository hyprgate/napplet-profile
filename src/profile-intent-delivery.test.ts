// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { profileTargetFromIncEvent, type IncEvent } from './profile-intent-delivery.js';

const pubkey = 'a'.repeat(64);
function event(payload?: unknown): IncEvent {
  return {
    topic: 'profile:open',
    sender: 'hyprgate-shell',
    ...(arguments.length > 0 ? { payload } : {}),
  };
}

describe('profile canonical INC delivery adapter', () => {
  it.each(['warm direct', 'cold post-ready replay'])('extracts one target for a valid %s IncEvent', (delivery) => {
    expect(delivery).toBeTruthy();
    expect(profileTargetFromIncEvent(event({ pubkey }))).toBe(pubkey);
  });

  it('rejects absent and malformed payloads before the App state transition', () => {
    expect(profileTargetFromIncEvent(event())).toBeNull();
    expect(profileTargetFromIncEvent(event({ pubkey: 'not-a-pubkey' }))).toBeNull();
  });
});
