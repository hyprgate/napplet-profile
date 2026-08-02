import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import UnoCSS from '@unocss/vite';
import { nip5aManifest } from '@napplet/vite-plugin';

export default defineConfig({
  plugins: [UnoCSS(), svelte(), nip5aManifest({
    nappletType: 'profile',
    requires: ['identity', 'relay', 'outbox', 'inc', 'storage', 'resource', 'theme'],
    artifactMode: 'single-file',
    archetypes: [{ slug: 'profile', convention: 'napplet:profile/open' }],
  })],
  resolve: {
    dedupe: ['svelte'],
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
