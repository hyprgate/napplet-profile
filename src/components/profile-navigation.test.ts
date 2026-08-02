// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { mount as mountType, tick as tickType, unmount as unmountType } from 'svelte';
import type { NostrEvent } from '@hyprgate/types';
import * as nip19 from 'nostr-tools/nip19';
import ProfileNoteContent from './ProfileNoteContent.svelte';
import ProfileNoteEmbeds from './ProfileNoteEmbeds.svelte';
import ProfileNotes from './ProfileNotes.svelte';
import ProfileReplyContextLink from './ProfileReplyContextLink.svelte';
import ProfileResourceEmbed from './ProfileResourceEmbed.svelte';

const mockIntentInvoke = vi.hoisted(() => vi.fn());
const mockLinkOpen = vi.hoisted(() => vi.fn());

vi.mock('@napplet/sdk', () => ({
  inc: { emit: vi.fn() },
  intent: { invoke: mockIntentInvoke },
  link: { open: mockLinkOpen },
  relay: { publish: vi.fn().mockResolvedValue({ id: 'reaction' }) },
}));

vi.mock('svelte', () => ({ onDestroy: vi.fn() }));

const svelteClient = await import(
  pathToFileURL(resolve(process.cwd(), 'node_modules/svelte/src/index-client.js')).href,
) as {
  mount: typeof mountType;
  tick: typeof tickType;
  unmount: typeof unmountType;
};
const { mount, tick, unmount } = svelteClient;

const PUBKEY = 'a'.repeat(64);
const EVENT_ID = 'b'.repeat(64);
const EVENT: NostrEvent = {
  id: EVENT_ID,
  kind: 1,
  pubkey: PUBKEY,
  created_at: 1780531200,
  tags: [],
  content: `nostr:${nip19.npubEncode(PUBKEY)}`,
  sig: 'sig',
};

let component: Record<string, never> | null = null;

async function flushAsync(): Promise<void> {
  await tick();
  await Promise.resolve();
  await tick();
}

function clickButton(label: string): void {
  const button = Array.from(document.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('Profile canonical navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockIntentInvoke.mockImplementation(async (request: { archetype: string; action?: string }) => ({
      ok: true,
      archetype: request.archetype,
      action: request.action ?? 'open',
      handled: true,
      handler: request.archetype,
    }));
    mockLinkOpen.mockResolvedValue({ status: 'opened' });
    vi.stubGlobal('IntersectionObserver', class {
      observe(): void {}
      disconnect(): void {}
    });
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps a metadata-present profile mention visible and invokes its archetype-led request once', async () => {
    component = mount(ProfileNoteContent, {
      target: document.body,
      props: {
        content: `nostr:${nip19.npubEncode(PUBKEY)}`,
        profileLabel: () => 'Alice',
      },
    }) as Record<string, never>;
    await flushAsync();

    clickButton('@Alice');
    await flushAsync();

    expect(mockIntentInvoke).toHaveBeenCalledTimes(1);
    expect(mockIntentInvoke).toHaveBeenCalledWith({ archetype: 'profile', payload: { pubkey: PUBKEY } });
  });

  it('opens an embedded note through a canonical note request', async () => {
    const note = nip19.noteEncode(EVENT_ID);
    component = mount(ProfileNoteEmbeds, {
      target: document.body,
      props: { content: `quoted nostr:${note}` },
    }) as Record<string, never>;
    await flushAsync();

    const noteButton = document.querySelector<HTMLButtonElement>('.reference-embed');
    expect(noteButton).not.toBeNull();
    noteButton?.click();
    await flushAsync();

    expect(mockIntentInvoke).toHaveBeenCalledTimes(1);
    expect(mockIntentInvoke).toHaveBeenCalledWith(expect.objectContaining({
      archetype: 'note',
      payload: expect.objectContaining({ target: { type: 'event', id: EVENT_ID, nip19: `nostr:${note}` } }),
    }));
  });

  it('opens a reply-context note through one canonical dispatch', async () => {
    component = mount(ProfileReplyContextLink, {
      target: document.body,
      props: {
        reference: {
          label: 'note1context',
          title: 'note1context',
          reference: { type: 'event', id: EVENT_ID },
          target: { type: 'event', id: EVENT_ID },
          relays: ['wss://relay.example'],
        },
      },
    }) as Record<string, never>;
    await flushAsync();

    clickButton('note1context');
    await flushAsync();

    expect(mockIntentInvoke).toHaveBeenCalledTimes(1);
    expect(mockIntentInvoke).toHaveBeenCalledWith(expect.objectContaining({
      archetype: 'note',
      payload: expect.objectContaining({
        target: expect.objectContaining({ type: 'event', id: EVENT_ID }),
      }),
    }));
  });

  it('keeps fallback identity text while the primary note and composer actions dispatch canonically', async () => {
    component = mount(ProfileNotes, {
      target: document.body,
      props: {
        notes: [EVENT],
        engagement: new Map(),
        engagementVersion: 0,
        reactionOptions: [],
        showReplies: true,
        profileLabel: (pubkey: string) => pubkey.slice(0, 8),
        onloadmore: () => {},
        onshowreplieschange: () => {},
      },
    }) as Record<string, never>;
    await flushAsync();

    expect(document.body.textContent).toContain(PUBKEY.slice(0, 8));
    clickButton('Open');
    await flushAsync();
    clickButton('Reply');
    await flushAsync();

    expect(mockIntentInvoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      archetype: 'note',
      payload: expect.objectContaining({
        target: expect.objectContaining({ type: 'event', id: EVENT_ID }),
      }),
    }));
    expect(mockIntentInvoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      archetype: 'composer',
      payload: expect.objectContaining({ replyTo: expect.objectContaining({ id: EVENT_ID }) }),
    }));
  });

  it('retains the shell-owned provider link policy for resource navigation', async () => {
    component = mount(ProfileResourceEmbed, {
      target: document.body,
      props: { source: 'https://www.youtube.com/watch?v=abc123', mediaType: 'video' },
    }) as Record<string, never>;
    await flushAsync();

    const providerLink = document.querySelector<HTMLAnchorElement>('a.provider-card');
    expect(providerLink).not.toBeNull();
    providerLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await flushAsync();

    expect(mockLinkOpen).toHaveBeenCalledTimes(1);
    expect(mockLinkOpen).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    expect(mockIntentInvoke).not.toHaveBeenCalled();
  });

});
