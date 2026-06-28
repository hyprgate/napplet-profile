import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import UnoCSS from '@unocss/vite';

export default defineConfig({
  plugins: [UnoCSS(), svelte()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
