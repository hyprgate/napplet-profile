import { intent } from '@napplet/sdk';
import { parseProfileOpenPayload } from '@hyprgate/utils';

export type IntentDelivery = Parameters<Parameters<typeof intent.onDelivery>[0]>[0];

/** Validate the target contract before applying its application payload. */
export function profileTargetFromIntentDelivery(event: IntentDelivery): string | null {
  if (event.archetype !== 'profile' || event.action !== 'open' || event.convention !== 'napplet:profile/open') return null;
  return parseProfileOpenPayload(event.payload)?.pubkey ?? null;
}
