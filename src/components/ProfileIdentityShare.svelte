<script lang="ts">
  import { link } from '@napplet/sdk';
  import QRCode from 'qrcode';
  import {
    profileIdentityOpenTargets,
    profileIdentityShareValues,
    type ProfileIdentityOpenTarget,
    type ProfileIdentityShareKind,
    type ProfileIdentityShareValue,
  } from '../lib/profile-share';
  import { shortNpub } from '../lib/profile-identity';

  interface Props {
    profilePubkey?: string;
  }

  let { profilePubkey = '' }: Props = $props();

  let copiedKind = $state<ProfileIdentityShareKind | null>(null);
  let error = $state<string | null>(null);
  let openMenu = $state(false);
  let shareOpen = $state(false);
  let openMenuRoot: HTMLDivElement | undefined = $state(undefined);
  let openMenuTrigger: HTMLButtonElement | undefined = $state(undefined);
  let qrKind = $state<ProfileIdentityShareKind | null>(null);
  let qrDataUrl = $state<string | null>(null);

  const shareValues = $derived(profileIdentityShareValues(profilePubkey));
  const openTargets = $derived(profileIdentityOpenTargets(profilePubkey));
  const npubEntry = $derived(shareValues.find((entry) => entry.kind === 'npub') ?? null);
  const activeQr = $derived.by(() => shareValues.find((entry) => entry.kind === qrKind) ?? null);

  $effect(() => {
    const validKinds = new Set(shareValues.map((entry) => entry.kind));
    if (qrKind == null || !validKinds.has(qrKind)) {
      qrKind = shareValues.find((entry) => entry.kind === 'npub')?.kind ?? null;
    }
    copiedKind = null;
    error = null;
    openMenu = false;
  });

  $effect(() => {
    // A different person starts with the share panel closed again.
    profilePubkey;
    shareOpen = false;
  });

  $effect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!openMenuRoot?.contains(event.target as Node)) openMenu = false;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      openMenu = false;
      openMenuTrigger?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  $effect(() => {
    // Nothing to draw until someone opens Share.
    const value = shareOpen ? activeQr?.value ?? null : null;
    if (value == null) {
      qrDataUrl = null;
      return;
    }

    let cancelled = false;
    qrDataUrl = null;
    QRCode.toDataURL(value, {
      width: 160,
      margin: 1,
      color: {
        dark: themeColor('--hg-accent-green', '#9be564'),
        light: themeColor('--hg-bg-base', '#0a0a0a'),
      },
    })
      .then((url) => {
        if (!cancelled) qrDataUrl = url;
      })
      .catch(() => {
        if (!cancelled) qrDataUrl = null;
      });

    return () => {
      cancelled = true;
    };
  });

  async function copyValue(entry: ProfileIdentityShareValue): Promise<void> {
    copiedKind = null;
    error = null;
    try {
      await writeClipboard(entry.value);
      copiedKind = entry.kind;
    } catch {
      error = 'Copy failed';
    }
  }

  async function openTarget(target: ProfileIdentityOpenTarget): Promise<void> {
    openMenu = false;
    error = null;
    const result = await link.open(target.url);
    if (result.status !== 'opened') error = 'Open denied';
  }

  async function writeClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
  }

  function labelFor(kind: ProfileIdentityShareKind): string {
    return shareValues.find((entry) => entry.kind === kind)?.label ?? kind;
  }

  function themeColor(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  }
</script>

{#if shareValues.length > 0 && npubEntry}
  <section class="profile-identity-share" aria-label="Profile identity">
    <div class="identity-row">
      <code class="npub" title={npubEntry.value}>{shortNpub(profilePubkey)}</code>
      <button type="button" class="identity-chip" onclick={() => { void copyValue(npubEntry); }}>Copy npub</button>
      <button type="button" class="identity-chip" aria-expanded={shareOpen} onclick={() => (shareOpen = !shareOpen)}>Share</button>
    </div>

    {#if shareOpen}
      <div class="share-panel">
        <div class="identity-row">
          {#each shareValues.filter((entry) => entry.kind !== 'npub') as entry (entry.kind)}
            <button
              type="button"
              class="identity-chip"
              title="Copy {entry.label}"
              aria-label="Copy {entry.label}"
              onclick={() => { void copyValue(entry); }}
            >{entry.label}</button>
          {/each}

          <div class="relative" bind:this={openMenuRoot}>
            <button
              type="button"
              class="identity-chip"
              aria-haspopup="menu"
              aria-expanded={openMenu}
              bind:this={openMenuTrigger}
              onclick={() => (openMenu = !openMenu)}
            >Open in</button>
            {#if openMenu}
              <div class="open-menu" role="menu" aria-label="Open profile in">
                {#each openTargets as target}
                  <button
                    type="button"
                    role="menuitem"
                    onclick={() => { void openTarget(target); }}
                  >{target.label}</button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="identity-row" role="group" aria-label="QR identity format">
          {#each shareValues as entry (entry.kind)}
            <button
              type="button"
              class="qr-chip"
              aria-pressed={qrKind === entry.kind}
              onclick={() => (qrKind = entry.kind)}
            >QR {entry.label}</button>
          {/each}
        </div>

        {#if activeQr}
          <div class="qr-card" data-testid="profile-identity-qr">
            {#if qrDataUrl}
              <img src={qrDataUrl} alt="{activeQr.label} QR code" class="qr-image" />
            {:else}
              <div class="qr-loading">QR</div>
            {/if}
            <code title={activeQr.value}>{activeQr.value}</code>
          </div>
        {/if}
      </div>
    {/if}

    {#if copiedKind}
      <div class="identity-status" role="status">{labelFor(copiedKind)} copied</div>
    {:else if error}
      <div class="identity-error" role="status">{error}</div>
    {/if}
  </section>
{/if}

<style>
  .profile-identity-share,
  .share-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .identity-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .npub {
    color: var(--hg-text-muted, #8f887c);
    font-size: 11px;
  }

  .relative {
    position: relative;
  }

  .identity-chip,
  .qr-chip {
    min-height: 22px;
    padding: 0 7px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 3px;
    background: transparent;
    color: var(--hg-text-secondary, #c8c2b5);
    font: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .identity-chip:hover,
  .identity-chip[aria-expanded='true'],
  .qr-chip:hover,
  .qr-chip[aria-pressed='true'] {
    border-color: var(--hg-accent-green, #9be564);
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 12%, transparent);
    color: var(--hg-text-primary, #f2efe7);
  }

  .identity-chip:focus-visible,
  .qr-chip:focus-visible,
  .open-menu button:focus-visible {
    outline: 2px solid var(--hg-accent-focus, var(--hg-accent-primary, #9be564));
    outline-offset: 1px;
  }

  .open-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    min-width: 112px;
    padding: 4px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
    background: var(--hg-bg-elevated, #111827);
    box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
  }

  .open-menu button {
    display: block;
    width: 100%;
    min-height: 24px;
    padding: 0 7px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--hg-text-primary, #f2efe7);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .open-menu button:hover {
    background: color-mix(in srgb, var(--hg-accent-green, #9be564) 12%, transparent);
  }

  .qr-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
  }

  .qr-image,
  .qr-loading {
    width: 80px;
    height: 80px;
    border-radius: 3px;
  }

  .qr-loading {
    display: grid;
    place-items: center;
    border: 1px solid var(--hg-border, #303030);
    color: var(--hg-text-muted, #8f887c);
    font-size: 10px;
  }

  .qr-card code {
    min-width: 0;
    color: var(--hg-text-muted, #8f887c);
    font-size: 10px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .identity-status,
  .identity-error {
    font-size: 10px;
  }

  .identity-status {
    color: var(--hg-accent-green, #9be564);
  }

  .identity-error {
    color: var(--hg-accent-warning, #f59e0b);
  }
</style>
