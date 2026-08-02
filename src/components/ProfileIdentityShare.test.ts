// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { mount as mountType, tick as tickType, unmount as unmountType } from 'svelte';
import * as nip19 from 'nostr-tools/nip19';
import ProfileIdentityShare from './ProfileIdentityShare.svelte';

const mockLinkOpen = vi.hoisted(() => vi.fn());
const mockQrToDataUrl = vi.hoisted(() => vi.fn());

vi.mock('@napplet/sdk', () => ({
  link: {
    open: mockLinkOpen,
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: mockQrToDataUrl,
  },
}));

const PUBKEY = 'c'.repeat(64);
const svelteClient = await import(
  pathToFileURL(resolve(process.cwd(), 'node_modules/svelte/src/index-client.js')).href
) as {
  mount: typeof mountType;
  tick: typeof tickType;
  unmount: typeof unmountType;
};
const { mount, tick, unmount } = svelteClient;

async function flushAsync(): Promise<void> {
  await tick();
  await Promise.resolve();
  await tick();
}

function buttonByText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

describe('ProfileIdentityShare', () => {
  let component: Record<string, never> | null = null;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    mockLinkOpen.mockResolvedValue({ status: 'opened' });
    mockQrToDataUrl.mockResolvedValue('data:image/png;base64,ZmFrZQ==');
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('copies each identity form and opens the current npub through link.open', async () => {
    const npub = nip19.npubEncode(PUBKEY);
    component = mount(ProfileIdentityShare, {
      target: document.body,
      props: { profilePubkey: PUBKEY },
    }) as Record<string, never>;
    await flushAsync();

    buttonByText('npub').click();
    await flushAsync();
    expect(writeText).toHaveBeenCalledWith(npub);
    expect(document.body.textContent).toContain('npub copied');

    buttonByText('Open in').click();
    await flushAsync();
    buttonByText('njump.to').click();
    await flushAsync();

    expect(mockLinkOpen).toHaveBeenCalledWith(`https://njump.to/${npub}`);
  });

  it('renders QR codes for the selected identity form', async () => {
    const npub = nip19.npubEncode(PUBKEY);
    component = mount(ProfileIdentityShare, {
      target: document.body,
      props: { profilePubkey: PUBKEY },
    }) as Record<string, never>;
    await flushAsync();

    buttonByText('QR npub').click();
    await flushAsync();

    expect(mockQrToDataUrl).toHaveBeenLastCalledWith(
      npub,
      expect.objectContaining({ width: 160, margin: 1 }),
    );
    const image = document.querySelector<HTMLImageElement>('img[alt="npub QR code"]');
    expect(image?.src).toBe('data:image/png;base64,ZmFrZQ==');
    expect(document.querySelector('[data-testid="profile-identity-qr"]')?.textContent).toContain(npub);
  });

  it('does not render stale controls for an invalid profile target', async () => {
    component = mount(ProfileIdentityShare, {
      target: document.body,
      props: { profilePubkey: 'C'.repeat(64) },
    }) as Record<string, never>;
    await flushAsync();

    expect(document.querySelector('.profile-identity-share')).toBeNull();
    expect(document.body.textContent).not.toContain('npub');
    expect(mockQrToDataUrl).not.toHaveBeenCalled();
  });
});
