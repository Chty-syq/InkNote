import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const pagesBase = process.env.VITE_PAGES_BASE?.trim() || '/';
const contentRoot = fileURLToPath(new URL('../../content', import.meta.url));
const contentEntryPattern =
  /[\\/]content[\\/](?:markdown[\\/][^\\/]+[\\/]index\.md|inknotes[\\/][^\\/]+[\\/](?:index\.md|[^\\/]+\.inknote\.json))$/i;

interface FeedDocument {
  type: 'markdown' | 'inknote';
  title: string;
  slug: string;
  href: string;
  date: string;
  updatedAt: string;
  summary: string;
  body: string;
  tags: string[];
  published: boolean;
}

function parseScalarValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalizedRaw = raw.replace(/^\uFEFF/, '');
  const match = normalizedRaw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: normalizedRaw.trim() };
  }

  const [, frontmatterBlock, body] = match;
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterBlock.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z][\w-]*):(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const [, key, rest] = keyMatch;
    const inlineValue = rest.trim();
    if (!inlineValue) {
      const items: unknown[] = [];
      while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(parseScalarValue(lines[index].replace(/^\s*-\s+/, '')));
      }
      frontmatter[key] = items;
      continue;
    }

    frontmatter[key] = parseScalarValue(inlineValue);
  }

  return { frontmatter, body: body.trim() };
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toBooleanValue(value: unknown): boolean {
  return value === true || value === 'true';
}

function toTagsValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((tag) => toStringValue(tag)).filter(Boolean) : [];
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#>*_\-~[\]()`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('example.github.io')) {
    return '';
  }

  return trimmed.replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, href: string): string {
  if (!baseUrl) {
    return href;
  }

  return `${baseUrl}${href.startsWith('/') ? href : `/${href}`}`;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function readFeedCollection(collection: 'markdown' | 'inknotes'): Promise<FeedDocument[]> {
  const collectionRoot = path.join(contentRoot, collection);
  let folders: string[] = [];

  try {
    folders = await fs.readdir(collectionRoot);
  } catch {
    return [];
  }

  const documents = await Promise.all(
    folders.map(async (folder) => {
      const filePath = path.join(collectionRoot, folder, 'index.md');
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { frontmatter, body } = parseFrontmatter(raw);
        const type = toStringValue(frontmatter.type);
        if (collection === 'markdown' && type !== 'markdown') {
          return null;
        }
        if (collection === 'inknotes' && type !== 'inknote') {
          return null;
        }

        const slug = toStringValue(frontmatter.slug) || folder;
        const permalink = collection === 'markdown' ? toStringValue(frontmatter.permalink) : '';
        return {
          type: collection === 'markdown' ? 'markdown' : 'inknote',
          title: toStringValue(frontmatter.title) || slug,
          slug,
          href:
            collection === 'markdown'
              ? permalink
                ? permalink.startsWith('/')
                  ? permalink
                  : `/${permalink}`
                : `/notes/${slug}`
              : `/inknote/${slug}`,
          date: toStringValue(frontmatter.date),
          updatedAt: toStringValue(frontmatter.updatedAt),
          summary: toStringValue(frontmatter.summary),
          body,
          tags: toTagsValue(frontmatter.tags),
          published: toBooleanValue(frontmatter.published),
        } satisfies FeedDocument;
      } catch {
        return null;
      }
    }),
  );

  return documents.filter((document): document is FeedDocument => Boolean(document));
}

async function generateRssFeed(): Promise<string> {
  const siteConfig = await readJsonFile(path.join(contentRoot, 'site', 'site.config.json'));
  const repository = siteConfig.repository && typeof siteConfig.repository === 'object'
    ? (siteConfig.repository as Record<string, unknown>)
    : {};
  const title = toStringValue(siteConfig.title) || "Chty's Blog";
  const description = toStringValue(siteConfig.description) || toStringValue(siteConfig.tagline) || title;
  const language = toStringValue(siteConfig.language) || 'zh-CN';
  const author = toStringValue(siteConfig.author);
  const siteUrl =
    normalizeSiteUrl(toStringValue(siteConfig.baseUrl)) ||
    normalizeSiteUrl(toStringValue(repository.pagesUrl));
  const documents = [...(await readFeedCollection('markdown')), ...(await readFeedCollection('inknotes'))]
    .filter((document) => document.published)
    .sort((left, right) => (right.updatedAt || right.date).localeCompare(left.updatedAt || left.date))
    .slice(0, 50);
  const buildDate = new Date().toUTCString();

  const items = documents
    .map((document) => {
      const link = joinUrl(siteUrl, document.href);
      const descriptionText = document.summary || stripMarkdown(document.body).slice(0, 240);
      const pubDate = new Date(document.updatedAt || document.date || Date.now()).toUTCString();
      const categories = document.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n');

      return [
        '    <item>',
        `      <title>${escapeXml(document.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `      <description>${escapeXml(descriptionText)}</description>`,
        categories,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(siteUrl || '/')}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <lastBuildDate>${escapeXml(buildDate)}</lastBuildDate>`,
    author ? `    <managingEditor>${escapeXml(author)}</managingEditor>` : '',
    `    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(joinUrl(siteUrl, '/rss.xml'))}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

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

function rssFeedPlugin(): Plugin {
  let outDir = fileURLToPath(new URL('dist', import.meta.url));

  return {
    name: 'inknote-rss-feed',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/rss.xml') {
          next();
          return;
        }

        try {
          const feed = await generateRssFeed();
          response.statusCode = 200;
          response.setHeader('content-type', 'application/rss+xml; charset=utf-8');
          response.end(feed);
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : 'Failed to generate RSS feed');
        }
      });
    },
    async writeBundle() {
      const feed = await generateRssFeed();
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'rss.xml'), feed, 'utf8');
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [contentCollectionReloadPlugin(), rssFeedPlugin(), react()],
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
