import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const pagesBase = process.env.VITE_PAGES_BASE?.trim() || '/';
const contentRoot = fileURLToPath(new URL('../../content', import.meta.url));
const contentEntryPattern =
  /[\\/]content[\\/](?:markdown[\\/][^\\/]+[\\/]index\.md|inknotes[\\/][^\\/]+[\\/](?:index\.md|[^\\/]+\.inknote\.json))$/i;

function contentCollectionReloadPlugin(): Plugin {
  return {
    name: 'inknote-content-collection-reload',
    configureServer(server: ViteDevServer) {
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;

      const reloadContentIndex = (path: string) => {
        if (!contentEntryPattern.test(path)) {
          return;
        }

        if (reloadTimer !== null) {
          clearTimeout(reloadTimer);
        }

        reloadTimer = setTimeout(() => {
          server.moduleGraph.invalidateAll();
          server.ws.send({ type: 'full-reload', path: '*' });
          reloadTimer = null;
        }, 80);
      };

      server.watcher.add(contentRoot);
      server.watcher.on('add', reloadContentIndex);
      server.watcher.on('unlink', reloadContentIndex);
      server.httpServer?.once('close', () => {
        if (reloadTimer !== null) {
          clearTimeout(reloadTimer);
        }
        server.watcher.off('add', reloadContentIndex);
        server.watcher.off('unlink', reloadContentIndex);
      });
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [contentCollectionReloadPlugin(), react()],
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
      '@inknote/inknote-core': fileURLToPath(new URL('../../packages/inknote-core/src', import.meta.url)),
      '@inknote/site-builder': fileURLToPath(new URL('../../packages/site-builder/src', import.meta.url)),
    },
  },
});
