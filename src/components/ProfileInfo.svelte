<script lang="ts">
  import { link } from '@napplet/sdk';
  import type { ProfileContent } from 'applesauce-core/helpers/profile';
  import { pubkeyColorStyle } from '@hyprgate/utils';
  import { displayNip05, profileDisplayName, websiteLink } from '../lib/profile-identity';
  import ProfileIdentityShare from './ProfileIdentityShare.svelte';

  interface Props {
    metadata: ProfileContent | null;
    followingCount: number | null;
    isOwnProfile: boolean;
    profilePubkey?: string;
    metadataLoading?: boolean;
  }

  let { metadata, followingCount, isOwnProfile, profilePubkey = '', metadataLoading = false }: Props = $props();

  const displayName = $derived(profileDisplayName(metadata, profilePubkey));
  const nip05 = $derived(displayNip05(metadata?.nip05));
  const website = $derived(websiteLink(metadata?.website));
  const lightning = $derived(typeof metadata?.lud16 === 'string' && metadata.lud16.trim() ? metadata.lud16.trim() : null);

  async function openWebsite(event: MouseEvent, href: string): Promise<void> {
    event.preventDefault();
    await link.open(href);
  }
</script>

<div class="profile-info">
  <h2 style={pubkeyColorStyle(profilePubkey)}>{displayName}</h2>
  {#if isOwnProfile}<span class="you-tag">This is you</span>{/if}

  {#if nip05}
    <!-- The sandbox can't fetch nostr.json, so this is what the profile claims, not a verified address. -->
    <div class="meta-line" title="Address from this profile. It hasn't been verified.">{nip05}</div>
  {/if}

  {#if metadata?.about}
    <p class="about">{metadata.about}</p>
  {:else if !metadata && !metadataLoading}
    <p class="about muted">{isOwnProfile ? "You haven't" : "This person hasn't"} published a profile yet.</p>
  {/if}

  {#if website || lightning}
    <div class="links">
      {#if website}
        <a href={website.href} target="_blank" rel="noopener noreferrer" onclick={(event) => void openWebsite(event, website.href)}>{website.label}</a>
      {/if}
      {#if lightning}
        <span title="Lightning address">⚡ {lightning}</span>
      {/if}
    </div>
  {/if}

  {#if followingCount !== null}
    <div class="stats"><strong>{followingCount}</strong> following</div>
  {/if}

  <ProfileIdentityShare {profilePubkey} />
</div>

<style>
  .profile-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .you-tag {
    padding: 1px 6px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 999px;
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 10px;
  }

  .meta-line,
  .links,
  .stats {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .about {
    margin: 2px 0;
    color: var(--hg-text-secondary, #c8c2b5);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .about.muted {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 12px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .links a {
    color: var(--hg-accent-cyan, #82d8f7);
    text-decoration: none;
  }

  .links a:hover {
    text-decoration: underline;
  }

  .stats strong {
    color: var(--hg-text-primary, #f2efe7);
    font-weight: 600;
  }
</style>
