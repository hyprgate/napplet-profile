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

  interface Props {
    profilePubkey?: string;
  }

  let { profilePubkey = '' }: Props = $props();

  let copiedKind = $state<ProfileIdentityShareKind | null>(null);
  let error = $state<string | null>(null);
  let openMenu = $state(false);
  let qrKind = $state<ProfileIdentityShareKind | null>(null);
  let qrDataUrl = $state<string | null>(null);

  const shareValues = $derived(profileIdentityShareValues(profilePubkey));
  const openTargets = $derived(profileIdentityOpenTargets(profilePubkey));
  const activeQr = $derived.by(() => shareValues.find((entry) => entry.kind === qrKind) ?? null);

  $effect(() => {
    const validKinds = new Set(shareValues.map((entry) => entry.kind));
    if (qrKind == null || !validKinds.has(qrKind)) {
      qrKind = shareValues[0]?.kind ?? null;
    }
    copiedKind = null;
    error = null;
    openMenu = false;
  });

  $effect(() => {
    const value = activeQr?.value ?? null;
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

{#if shareValues.length > 0}
  <section class="profile-identity-share flex flex-col gap-2 font-mono" aria-label="Profile identity">
    <div class="flex flex-wrap items-center gap-1.5">
      {#each shareValues as entry}
        <button
          type="button"
          class="identity-chip"
          title="Copy {entry.label}"
          aria-label="Copy {entry.label}"
          onclick={() => { void copyValue(entry); }}
        >{entry.label}</button>
      {/each}

      <div class="relative">
        <button
          type="button"
          class="identity-chip"
          aria-haspopup="menu"
          aria-expanded={openMenu}
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

    <div class="flex flex-wrap gap-1.5" aria-label="QR identity format">
      {#each shareValues as entry}
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

    {#if copiedKind}
      <div class="identity-status" role="status">{labelFor(copiedKind)} copied</div>
    {:else if error}
      <div class="identity-error" role="status">{error}</div>
    {/if}
  </section>
{/if}

<style>
  .identity-chip,
  .qr-chip {
    min-height: 22px;
    padding: 0 7px;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 3px;
    background: rgb(255 255 255 / 0.04);
    color: var(--hg-text-secondary, #c8c2b5);
    font: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .identity-chip:hover,
  .identity-chip:focus-visible,
  .qr-chip:hover,
  .qr-chip:focus-visible,
  .qr-chip[aria-pressed='true'] {
    border-color: var(--hg-accent-green, #9be564);
    background: rgb(0 255 136 / 0.12);
    color: var(--hg-accent-green, #9be564);
    outline: none;
  }

  .open-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    min-width: 112px;
    padding: 4px;
    border: 1px solid rgb(255 255 255 / 0.16);
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

  .open-menu button:hover,
  .open-menu button:focus-visible {
    background: rgb(0 255 136 / 0.12);
    color: var(--hg-accent-green, #9be564);
    outline: none;
  }

  .qr-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 4px;
    background: rgb(255 255 255 / 0.04);
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
    border: 1px solid rgb(255 255 255 / 0.12);
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
