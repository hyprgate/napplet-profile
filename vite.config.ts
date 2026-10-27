import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import UnoCSS from '@unocss/vite';
import { nip5aManifest } from '@napplet/vite-plugin';

export default defineConfig({
  plugins: [UnoCSS(), svelte(), nip5aManifest({
    nappletType: 'profile',
    requires: ['intent', 'identity', 'relay', 'outbox', 'inc', 'storage', 'resource'],
    optional: ['theme'],
    icon: { data: readFileSync(new URL('./icon.png', import.meta.url)), mimeType: 'image/png' },
      artifactMode: 'single-file',
    archetypes: [{ slug: 'profile', convention: 'napplet:profile/open' }],
  })],
  resolve: {
    dedupe: ['svelte', 'nostr-tools'],
  },
  server: {
    port: 5175,
    cors: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
});
