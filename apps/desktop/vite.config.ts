import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(() => ({
  plugins: react(),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@inknote/site-builder': fileURLToPath(new URL('../../packages/site-builder/src', import.meta.url)),
      '@inknote/inknote-core': fileURLToPath(new URL('../../packages/inknote-core/src', import.meta.url)),
      '@inknote/content-schema': fileURLToPath(new URL('../../packages/content-schema/src', import.meta.url)),
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_DEBUG ? false : 'esbuild' as const,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}));
