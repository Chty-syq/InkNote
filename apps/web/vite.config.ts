import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const pagesBase = process.env.VITE_PAGES_BASE?.trim() || '/';

export default defineConfig({
  base: pagesBase,
  plugins: [react()],
  server: {
    port: 4321,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
  resolve: {
    alias: {
      '@inknote/content-schema': fileURLToPath(new URL('../../packages/content-schema/src', import.meta.url)),
      '@inknote/site-builder': fileURLToPath(new URL('../../packages/site-builder/src', import.meta.url)),
    },
  },
});
