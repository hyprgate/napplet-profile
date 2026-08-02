import { inc } from '@napplet/sdk';
import { parseProfileOpenPayload } from '@hyprgate/utils';

export type IncEvent = Parameters<Parameters<typeof inc.on>[1]>[0];

/** Extract the application payload from the released one-event INC callback. */
export function profileTargetFromIncEvent(event: IncEvent): string | null {
  return parseProfileOpenPayload(event.payload)?.pubkey ?? null;
}
