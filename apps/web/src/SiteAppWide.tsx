import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { IconCalendar, IconExternalLink, IconEye, IconLink, IconMessageCircle, IconSearch } from '@tabler/icons-react';
import type {
  ContentFrontmatter,
  GoatCounterConfig,
  GiscusConfig,
  InkNoteFrontmatter,
  MarkdownFrontmatter,
} from '@inknote/content-schema';
import {
  contentIndex,
  findCategory,
  findInkNote,
  findInkNoteProject,
  findMarkdownNote,
  findPage,
  getCategoryDocuments,
  getDocumentCategoryLabel,
  getDocumentCategorySlugForRoute,
  type RoutedDocument,
} from './lib/content';
import { InkNoteNotebookViewer } from './InkNoteNotebookViewer';
import { extractMarkdownHeadings, renderInlineMarkdown, renderMarkdown, type MarkdownHeading } from './lib/markdown';

type Route =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'archive' }
  | { type: 'notes-list' }
  | { type: 'inknote-list' }
  | { type: 'category'; slug: string }
  | { type: 'notes-detail'; slug: string }
  | { type: 'inknote-detail'; slug: string }
  | { type: 'page'; slug: string }
  | { type: 'not-found' };

type PortalEntry = {
  id: string;
  href: string;
  title: string;
  date: string;
  categoryLabel: string;
  typeLabel: string;
  accentClass: string;
  tags: string[];
  summary: string;
  bodyText: string;
  searchText: string;
};

type SearchMatchField = 'title' | 'tag' | 'category' | 'summary' | 'body';

type SearchResult = {
  entry: PortalEntry;
  score: number;
  terms: string[];
  matchedFields: SearchMatchField[];
  snippet: string;
};

type DetailMetaItem =
  | {
      type: 'date';
      label: string;
    }
  | {
      type: 'tag';
      label: string;
    };

type ResolvedGiscusConfig = Pick<
  GiscusConfig,
  | 'repo'
  | 'repoId'
  | 'category'
  | 'categoryId'
  | 'mapping'
  | 'strict'
  | 'reactionsEnabled'
  | 'emitMetadata'
  | 'inputPosition'
  | 'theme'
  | 'lang'
>;

type ResolvedGoatCounterConfig = {
  baseUrl: string;
  endpoint: string;
  scriptUrl: string;
};

type ResolvedCardImageConfig = {
  manifest: string;
};

type CardGalleryImage = {
  id: string;
  path: string;
  name: string;
};

type CardImageAssignment = Map<string, CardGalleryImage>;

type ResolvedGitHubRepo = {
  owner: string;
  name: string;
};

type GitHubDiscussionSummary = {
  title: string;
  body: string;
  comments: number;
  categoryId: string;
};

const CATEGORY_ACCENTS = ['orange', 'blue', 'green', 'amber', 'slate'] as const;

const DEFAULT_TOOL_LINKS = [
  { label: '搜索', href: '/search', description: '站内检索' },
  { label: '归档', href: '#', description: '文章归档' },
  { label: 'RSS', href: '#', description: '订阅更新' },
  { label: '友链', href: '#blog-links', description: '友情链接' },
  { label: '关于', href: '/about', description: '关于这个博客' },
];

const KNOWN_LABEL_FIXES: Record<string, string> = {
  '鏈哄櫒瀛︿範': '机器学习',
  '鍙ゅ吀鎽樺綍': '古典摘录',
};

const VISIBLE_MARKDOWN = contentIndex.notes.filter((note) => note.frontmatter.published);
const VISIBLE_INKNOTES = contentIndex.inknotes.filter((note) => note.frontmatter.published);
const ACTIVE_FRIEND_LINKS = (contentIndex.siteConfig.friendLinks ?? []).filter(
  (link) => link.label.trim() && link.href.trim(),
);

function resolveCardImageConfig(config: typeof contentIndex.siteConfig.cardImages): ResolvedCardImageConfig | null {
  if (!config?.enabled) {
    return null;
  }

  return {
    manifest: config.manifest?.trim() || '/card-images/gallery/manifest.json',
  };
}

const ACTIVE_CARD_IMAGE_CONFIG = resolveCardImageConfig(contentIndex.siteConfig.cardImages);

function FriendLinkAvatar({ label, icon }: { label: string; icon?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [icon]);

  const source = icon?.trim() ? toAssetPath(icon) : '';

  return (
    <span className="blog-link-avatar" aria-hidden="true">
      <span>{label.trim() ? label.trim().slice(0, 1).toUpperCase() : <IconLink />}</span>
      {source && !failed ? (
        <img
          key={source}
          src={source}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

function resolveGiscusConfig(config: GiscusConfig | undefined): ResolvedGiscusConfig | null {
  if (
    !config?.enabled ||
    !config.repo.trim() ||
    !config.repoId.trim() ||
    !config.category.trim() ||
    !config.categoryId.trim()
  ) {
    return null;
  }

  return {
    repo: config.repo.trim(),
    repoId: config.repoId.trim(),
    category: config.category.trim(),
    categoryId: config.categoryId.trim(),
    mapping: config.mapping || 'pathname',
    strict: Boolean(config.strict),
    reactionsEnabled: config.reactionsEnabled !== false,
    emitMetadata: Boolean(config.emitMetadata),
    inputPosition: config.inputPosition === 'top' ? 'top' : 'bottom',
    theme: config.theme?.trim() || 'noborder_light',
    lang: config.lang?.trim() || 'zh-CN',
  };
}

const ACTIVE_GISCUS_CONFIG = resolveGiscusConfig(contentIndex.siteConfig.giscus);

function resolveGoatCounterConfig(config: GoatCounterConfig | undefined): ResolvedGoatCounterConfig | null {
  if (!config?.enabled) {
    return null;
  }

  const rawEndpoint = config.endpoint.trim().replace(/\/+$/, '');
  if (!rawEndpoint) {
    return null;
  }

  const baseUrl = rawEndpoint.endsWith('/count') ? rawEndpoint.slice(0, -'/count'.length) : rawEndpoint;
  const endpoint = rawEndpoint.endsWith('/count') ? rawEndpoint : `${rawEndpoint}/count`;
  const scriptUrl = config.scriptUrl.trim() || 'https://gc.zgo.at/count.js';

  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl,
    endpoint,
    scriptUrl,
  };
}

const ACTIVE_GOATCOUNTER_CONFIG = resolveGoatCounterConfig(contentIndex.siteConfig.goatcounter);
const goatCounterCountCache = new Map<string, string>();
const goatCounterCountPending = new Map<string, Promise<string>>();
const goatCounterOptimisticCounts = new Map<string, number>();
const GOATCOUNTER_COUNT_UPDATED_EVENT = 'inknote:goatcounter-count-updated';
const gitHubDiscussionListCache = new Map<string, GitHubDiscussionSummary[]>();
const gitHubDiscussionListPending = new Map<string, Promise<GitHubDiscussionSummary[]>>();
const giscusCommentCountCache = new Map<string, string>();

function resolveGitHubRepo(value: string): ResolvedGitHubRepo | null {
  const [owner = '', name = ''] = value.split('/');
  if (!owner.trim() || !name.trim()) {
    return null;
  }

  return {
    owner: owner.trim(),
    name: name.trim(),
  };
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}

function normalizeBasePath(base: string): string {
  const trimmed = base.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const BASE_PATH = normalizeBasePath(new URL(document.baseURI).pathname);

function stripBasePath(pathname: string): string {
  const normalized = normalizePathname(pathname);
  if (!BASE_PATH) {
    return normalized;
  }

  if (normalized === BASE_PATH) {
    return '/';
  }

  return normalized.startsWith(`${BASE_PATH}/`) ? normalizePathname(normalized.slice(BASE_PATH.length)) : normalized;
}

function getDefaultCategoryPath(): string {
  const firstCategory = contentIndex.categories[0];
  return firstCategory ? `/category/${firstCategory.slug}` : '/notes';
}

function resolveDefaultPath(pathname: string): string {
  const normalized = normalizePathname(pathname);
  return normalized === '/' ? getDefaultCategoryPath() : normalized;
}

function parseInternalHref(href: string): URL {
  return new URL(href, window.location.origin);
}

function toBrowserPath(pathname: string): string {
  const normalized = resolveDefaultPath(stripBasePath(pathname));
  return BASE_PATH ? `${BASE_PATH}${normalized === '/' ? '' : normalized}` : normalized;
}

function toPublicHref(href: string): string {
  if (!href.startsWith('/')) {
    return href;
  }

  const target = parseInternalHref(href);
  return `${toBrowserPath(target.pathname)}${target.search}${target.hash}`;
}

function toAssetPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return BASE_PATH ? `${BASE_PATH}${normalized}` : normalized;
}

function normalizeCardGalleryImages(value: unknown): CardGalleryImage[] {
  const input = value && typeof value === 'object' ? (value as { images?: unknown }) : {};
  if (!Array.isArray(input.images)) {
    return [];
  }

  const seenPaths = new Set<string>();

  return input.images
    .map((image): CardGalleryImage | null => {
      if (!image || typeof image !== 'object') {
        return null;
      }
      const item = image as { id?: unknown; path?: unknown; name?: unknown };
      if (typeof item.path !== 'string' || !item.path.trim()) {
        return null;
      }

      const path = item.path.trim();
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : path,
        path,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'cover',
      };
    })
    .filter((image): image is CardGalleryImage => {
      if (!image) {
        return false;
      }

      const key = image.path.replace(/\\/g, '/');
      if (seenPaths.has(key)) {
        return false;
      }

      seenPaths.add(key);
      return true;
    });
}

function buildCardImageAssignments(entries: PortalEntry[], images: CardGalleryImage[]): CardImageAssignment {
  const assignments: CardImageAssignment = new Map();
  const assignableCount = Math.min(entries.length, images.length);

  for (let index = 0; index < assignableCount; index += 1) {
    assignments.set(entries[index].id, images[index]);
  }

  return assignments;
}

function resolveWebContentAssets(markdown: string): string {
  const imagePrefix = toAssetPath('/content-images/');
  const slidesPrefix = toAssetPath('/content-slides/');

  return markdown
    .replace(/(\]\(\s*)\/content-images\//g, `$1${imagePrefix}`)
    .replace(/(\bsrc\s*=\s*["'])\/content-images\//gi, `$1${imagePrefix}`)
    .replace(/(\]\(\s*)\/content-slides\//g, `$1${slidesPrefix}`)
    .replace(/(\bsrc\s*=\s*["'])\/content-slides\//gi, `$1${slidesPrefix}`)
    .replace(/(\boriginal\s*=\s*["'])\/content-slides\//gi, `$1${slidesPrefix}`)
    .replace(/(\bhref\s*=\s*["'])\/content-slides\//gi, `$1${slidesPrefix}`);
}

function getGoatCounterPathForRoute(route: Route): string | null {
  if (route.type === 'notes-detail') {
    return `/notes/${route.slug}`;
  }

  if (route.type === 'inknote-detail') {
    return `/inknote/${route.slug}`;
  }

  return null;
}

function getGoatCounterCacheKey(baseUrl: string, path: string): string {
  return `${baseUrl}::${path}`;
}

function getGiscusCommentCacheKey(repo: string, categoryId: string, path: string): string {
  return `${repo}::${categoryId}::${path}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDiscussionMatchPath(path: string): string {
  return normalizePathname(path);
}

function getDiscussionMatchCandidates(path: string): string[] {
  const normalized = normalizeDiscussionMatchPath(path);
  const candidates = new Set<string>();

  candidates.add(normalized);
  candidates.add(normalized.replace(/^\/+/, ''));

  return [...candidates].filter(Boolean).sort((left, right) => right.length - left.length);
}

function doesDiscussionMatchPath(discussion: GitHubDiscussionSummary, path: string): boolean {
  const candidates = getDiscussionMatchCandidates(path);
  const sources = [discussion.title, discussion.body];

  return candidates.some((candidate) => {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(candidate)}($|[^A-Za-z0-9])`);
    return sources.some((source) => pattern.test(source));
  });
}

async function fetchGitHubDiscussions(config: ResolvedGiscusConfig): Promise<GitHubDiscussionSummary[]> {
  const repo = resolveGitHubRepo(config.repo);
  if (!repo) {
    return [];
  }

  const cacheKey = `${config.repo}::${config.categoryId}`;
  const cached = gitHubDiscussionListCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = gitHubDiscussionListPending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const discussions: GitHubDiscussionSummary[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/discussions`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub discussions request failed: ${response.status}`);
      }

      const payload = (await response.json()) as Array<{
        title?: string;
        body?: string;
        comments?: number;
        category?: {
          node_id?: string;
        };
      }>;

      const pageItems = payload
        .filter((item) => (item.category?.node_id ?? '') === config.categoryId)
        .map((item) => ({
          title: item.title ?? '',
          body: item.body ?? '',
          comments: typeof item.comments === 'number' ? item.comments : 0,
          categoryId: item.category?.node_id ?? '',
        }));

      discussions.push(...pageItems);

      if (payload.length < 100) {
        break;
      }
    }

    gitHubDiscussionListCache.set(cacheKey, discussions);
    return discussions;
  })().finally(() => {
    gitHubDiscussionListPending.delete(cacheKey);
  });

  gitHubDiscussionListPending.set(cacheKey, request);
  return request;
}

function resolveGiscusCommentCountForPath(discussions: GitHubDiscussionSummary[], path: string): string {
  const discussion = discussions.find((item) => doesDiscussionMatchPath(item, path));
  return String(discussion?.comments ?? 0);
}

function parseGoatCounterCount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  // GoatCounter returns a locale-formatted string (for example "1,234" or
  // "1 234"), so it cannot be passed to Number() unchanged.
  const normalized = value.replace(/[^0-9]/g, '');
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatGoatCounterCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function getGoatCounterLookupPaths(path: string): string[] {
  const canonicalPath = normalizePathname(path.startsWith('/') ? path : `/${path}`);
  const paths = [canonicalPath];

  // Older GitHub Pages deployments were tracked with the repository base in
  // the path. Keep those views visible after moving to canonical SPA routes.
  if (BASE_PATH) {
    paths.push(normalizePathname(`${BASE_PATH}${canonicalPath === '/' ? '' : canonicalPath}`));
  }

  return [...new Set(paths)];
}

function canReadGoatCounterPublicCounts(config: ResolvedGoatCounterConfig): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return new URL(config.baseUrl).origin === window.location.origin;
  } catch {
    return false;
  }
}

function getGoatCounterDisplayCount(config: ResolvedGoatCounterConfig, path: string): string | undefined {
  const cacheKey = getGoatCounterCacheKey(config.baseUrl, path);
  const cachedCount = goatCounterCountCache.get(cacheKey);
  const optimisticCount = goatCounterOptimisticCounts.get(cacheKey) ?? 0;

  if (cachedCount === undefined) {
    return optimisticCount > 0 ? formatGoatCounterCount(optimisticCount) : undefined;
  }

  if (optimisticCount === 0) {
    return cachedCount;
  }

  const baseCount = parseGoatCounterCount(cachedCount);
  return baseCount === null ? cachedCount : formatGoatCounterCount(baseCount + optimisticCount);
}

function notifyGoatCounterCountUpdated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(GOATCOUNTER_COUNT_UPDATED_EVENT));
}

function applyOptimisticGoatCounterCount(config: ResolvedGoatCounterConfig, path: string) {
  const cacheKey = getGoatCounterCacheKey(config.baseUrl, path);
  goatCounterOptimisticCounts.set(cacheKey, (goatCounterOptimisticCounts.get(cacheKey) ?? 0) + 1);
  notifyGoatCounterCountUpdated();
}

async function fetchGoatCounterCount(config: ResolvedGoatCounterConfig, path: string): Promise<string> {
  const cacheKey = getGoatCounterCacheKey(config.baseUrl, path);
  const cachedBase = goatCounterCountCache.get(cacheKey);
  if (cachedBase !== undefined) {
    return getGoatCounterDisplayCount(config, path) ?? cachedBase;
  }

  const pending = goatCounterCountPending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = Promise.all(
    getGoatCounterLookupPaths(path).map(async (lookupPath) => {
      const response = await fetch(`${config.baseUrl}/counter/${encodeURIComponent(lookupPath)}.json`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 404) {
        return 0;
      }

      if (response.status === 403) {
        throw new Error('GoatCounter public visitor counter is disabled in site settings');
      }

      if (!response.ok) {
        throw new Error(`GoatCounter request failed: ${response.status}`);
      }

      const payload = (await response.json()) as { count?: number | string };
      const count = parseGoatCounterCount(payload.count === undefined ? undefined : String(payload.count));
      return count ?? 0;
    }),
  )
    .then((counts) => formatGoatCounterCount(counts.reduce((total, count) => total + count, 0)))
    .then((count) => {
      goatCounterCountCache.set(cacheKey, count);
      return getGoatCounterDisplayCount(config, path) ?? count;
    })
    .finally(() => {
      goatCounterCountPending.delete(cacheKey);
    });

  goatCounterCountPending.set(cacheKey, request);
  return request;
}

function getInitialPathname(): string {
  const search = new URLSearchParams(window.location.search);
  const redirected = search.get('p');
  if (redirected) {
    const target = parseInternalHref(redirected);
    const nextPath = resolveDefaultPath(stripBasePath(target.pathname));
    window.history.replaceState({}, '', `${toBrowserPath(nextPath)}${target.search}${target.hash}`);
    return nextPath;
  }

  const nextPath = resolveDefaultPath(stripBasePath(window.location.pathname));
  if (toBrowserPath(nextPath) !== normalizePathname(window.location.pathname)) {
    window.history.replaceState({}, '', `${toBrowserPath(nextPath)}${window.location.search}${window.location.hash}`);
  }

  return nextPath;
}

function getSearchQueryFromLocation(): string {
  const currentPath = resolveDefaultPath(stripBasePath(window.location.pathname));
  if (currentPath !== '/search') {
    return '';
  }

  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function matchRoute(pathname: string): Route {
  const normalized = resolveDefaultPath(pathname);

  if (normalized === '/') {
    return { type: 'home' };
  }

  if (normalized === '/search') {
    return { type: 'search' };
  }

  if (normalized === '/archive') {
    return { type: 'archive' };
  }

  if (normalized === '/notes' || normalized === '/projects') {
    return { type: 'notes-list' };
  }

  if (normalized.startsWith('/notes/')) {
    return { type: 'notes-detail', slug: normalized.slice('/notes/'.length) };
  }

  if (normalized === '/inknote') {
    return { type: 'inknote-list' };
  }

  if (normalized.startsWith('/inknote/')) {
    return { type: 'inknote-detail', slug: normalized.slice('/inknote/'.length) };
  }

  if (normalized.startsWith('/category/')) {
    return { type: 'category', slug: normalized.slice('/category/'.length) };
  }

  if (normalized === '/about') {
    return { type: 'page', slug: 'about' };
  }

  return { type: 'not-found' };
}

function getAccentClass(index: number): string {
  return CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length];
}

function getCategoryAccentBySlug(slug: string): string {
  const index = contentIndex.categories.findIndex((category) => category.slug === slug);
  return getAccentClass(index >= 0 ? index : 0);
}

function getRouteCategorySlug(route: Route): string | null {
  if (route.type === 'category') {
    return route.slug;
  }

  if (route.type === 'notes-detail') {
    const note = findMarkdownNote(route.slug);
    return note ? getDocumentCategorySlugForRoute(note.frontmatter) || null : null;
  }

  if (route.type === 'inknote-detail') {
    const note = findInkNote(route.slug);
    return note ? getDocumentCategorySlugForRoute(note.frontmatter) || null : null;
  }

  return null;
}

function stripMarkdown(source: string): string {
  return source
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$(.+?)\$/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTags(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? tags.join(' / ') : '未设置标签';
}

function normalizeLabel(label: string): string {
  return KNOWN_LABEL_FIXES[label] ?? label;
}

function toCategorySubtitle(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toPortalEntry(document: RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>): PortalEntry {
  const categorySlug = getDocumentCategorySlugForRoute(document.frontmatter);
  const categoryLabel = normalizeLabel(getDocumentCategoryLabel(document.frontmatter));
  const summary = document.frontmatter.summary?.trim() ?? '';
  const bodyText = stripMarkdown(document.body);

  return {
    id: document.id,
    href: document.href,
    title: document.frontmatter.title,
    date: document.frontmatter.date,
    categoryLabel,
    typeLabel: document.frontmatter.type === 'inknote' ? 'InkNote' : 'Markdown',
    accentClass: categorySlug ? getCategoryAccentBySlug(categorySlug) : getAccentClass(0),
    tags: document.frontmatter.tags ?? [],
    summary,
    bodyText,
    searchText: normalizeSearchText(
      `${document.frontmatter.title} ${summary} ${formatTags(document.frontmatter.tags)} ${categoryLabel} ${bodyText}`,
    ),
  };
}

const GLOBAL_ENTRIES = [...VISIBLE_MARKDOWN, ...VISIBLE_INKNOTES]
  .sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date))
  .map((document) => toPortalEntry(document));

function getArchiveGroupKey(date: string): string {
  const match = date.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) {
    return 'unknown';
  }

  return `${match[1]}-${Number(match[2])}`;
}

function getArchiveDateLabel(date: string): string {
  const match = date.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : date.trim();
}

function getArchiveGroupMeta(key: string): {
  title: string;
  year: string;
  month: string;
  summary: string;
} {
  if (key === 'unknown') {
    return {
      title: '未标注日期',
      year: '--',
      month: '--',
      summary: '日期缺失',
    };
  }

  const [year, monthValue] = key.split('-');
  const month = monthValue.padStart(2, '0');

  return {
    title: `${year} 年 ${month} 月`,
    year,
    month,
    summary: `${month} 月归档`,
  };
}

function buildArchiveGroups(entries: PortalEntry[]): Array<{ key: string; label: string; entries: PortalEntry[] }> {
  const groups = new Map<string, PortalEntry[]>();

  for (const entry of entries) {
    const key = getArchiveGroupKey(entry.date);
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  return [...groups.entries()].map(([key, groupedEntries]) => ({
    key,
    label: key === 'unknown' ? '未标注日期' : key,
    entries: groupedEntries,
  }));
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function parseSearchTerms(query: string): string[] {
  const matches = query.match(/“[^”]+”|"[^"]+"|\S+/g) ?? [];
  const uniqueTerms = new Set<string>();

  matches.forEach((match) => {
    const unquoted = match.replace(/^[“"]|[”"]$/g, '');
    const normalized = normalizeSearchText(unquoted);
    if (normalized) {
      uniqueTerms.add(normalized);
    }
  });

  return [...uniqueTerms];
}

function createSearchSnippet(entry: PortalEntry, terms: string[]): string {
  const sources = [entry.summary, entry.bodyText].filter(Boolean);
  const source =
    sources
      .map((candidate, index) => ({
        candidate,
        index,
        matches: terms.filter((term) => normalizeSearchText(candidate).includes(term)).length,
      }))
      .sort((left, right) => right.matches - left.matches || left.index - right.index)[0]?.candidate ?? '';
  if (!source) {
    return '';
  }

  const normalizedSource = normalizeSearchText(source);
  const matchIndexes = terms
    .map((term) => normalizedSource.indexOf(term))
    .filter((index) => index >= 0);
  const firstMatch = matchIndexes.length > 0 ? Math.min(...matchIndexes) : 0;
  const radiusBefore = 42;
  const maxLength = 168;
  let start = Math.max(0, firstMatch - radiusBefore);
  let end = Math.min(source.length, start + maxLength);

  if (start > 0) {
    const nextBoundary = source.slice(start, Math.min(start + 16, source.length)).search(/[，。！？；：,.!?;:\s]/);
    if (nextBoundary >= 0) {
      start += nextBoundary + 1;
    }
  }

  if (end < source.length) {
    const previousBoundary = source.slice(Math.max(start, end - 18), end).search(/[，。！？；：,.!?;:\s][^，。！？；：,.!?;:\s]*$/);
    if (previousBoundary >= 0) {
      end = Math.max(start + 60, end - 18 + previousBoundary + 1);
    }
  }

  const snippet = source.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < source.length ? '…' : ''}`;
}

function searchEntries(entries: PortalEntry[], query: string): SearchResult[] {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const fieldWeights: Record<SearchMatchField, number> = {
    title: 72,
    tag: 48,
    category: 28,
    summary: 18,
    body: 8,
  };
  const fieldOrder: SearchMatchField[] = ['title', 'tag', 'category', 'summary', 'body'];

  return entries
    .map((entry): SearchResult | null => {
      const normalizedTags = entry.tags.map(normalizeSearchText);
      const fields: Record<SearchMatchField, string> = {
        title: normalizeSearchText(entry.title),
        tag: normalizedTags.join(' '),
        category: normalizeSearchText(entry.categoryLabel),
        summary: normalizeSearchText(entry.summary),
        body: normalizeSearchText(entry.bodyText),
      };
      const matchedFields = new Set<SearchMatchField>();
      let score = 0;

      for (const term of terms) {
        let termScore = 0;

        for (const field of fieldOrder) {
          if (!fields[field].includes(term)) {
            continue;
          }

          matchedFields.add(field);
          termScore = Math.max(termScore, fieldWeights[field]);
        }

        if (termScore === 0) {
          return null;
        }

        if (fields.title === term) {
          termScore += 92;
        } else if (fields.title.startsWith(term)) {
          termScore += 34;
        }

        if (normalizedTags.some((tag) => tag === term)) {
          termScore += 54;
        }

        score += termScore + Math.min(term.length, 24);
      }

      const phrase = terms.join(' ');
      if (fields.title === phrase) {
        score += 160;
      } else if (fields.title.includes(phrase)) {
        score += 64;
      } else if (fields.summary.includes(phrase)) {
        score += 24;
      } else if (entry.searchText.includes(phrase)) {
        score += 10;
      }

      return {
        entry,
        score,
        terms,
        matchedFields: fieldOrder.filter((field) => matchedFields.has(field)),
        snippet: createSearchSnippet(entry, terms),
      };
    })
    .filter((result): result is SearchResult => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.entry.date.localeCompare(left.entry.date) ||
        left.entry.title.localeCompare(right.entry.title),
    );
}

function highlightSearchText(text: string, terms: string[]): ReactNode {
  if (!text || terms.length === 0) {
    return text;
  }

  const escapedTerms = [...terms]
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  return text.split(pattern).map((part, index) =>
    terms.includes(normalizeSearchText(part)) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
}

function buildTagCloud(entries: PortalEntry[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();

  entries.forEach((entry) => {
    entry.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, 24);
}

const GLOBAL_TAG_CLOUD = buildTagCloud(GLOBAL_ENTRIES);

function useGoatCounterCounts(entries: PortalEntry[]): Record<string, string> {
  const paths = useMemo(() => [...new Set(entries.map((entry) => entry.href))], [entries]);
  return useGoatCounterCountsForPaths(paths);
}

function useGoatCounterCountsForPaths(paths: string[]): Record<string, string> {
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ACTIVE_GOATCOUNTER_CONFIG) {
      setCounts({});
      return;
    }

    const nextCached: Record<string, string> = {};
    const missingPaths: string[] = [];

    paths.forEach((path) => {
      const cacheKey = getGoatCounterCacheKey(ACTIVE_GOATCOUNTER_CONFIG.baseUrl, path);
      const cachedBase = goatCounterCountCache.get(cacheKey);
      const cachedDisplay = getGoatCounterDisplayCount(ACTIVE_GOATCOUNTER_CONFIG, path);

      if (cachedDisplay !== undefined) {
        nextCached[path] = cachedDisplay;
      }

      if (cachedBase === undefined) {
        missingPaths.push(path);
      }
    });

    setCounts((current) => {
      const next = { ...current, ...nextCached };
      return next;
    });

    // GoatCounter's public counter endpoint is cross-origin on GitHub Pages and
    // does not expose permissive CORS headers, so the browser cannot read it
    // directly. In that case we still keep optimistic in-session counts and
    // avoid noisy console errors.
    if (!canReadGoatCounterPublicCounts(ACTIVE_GOATCOUNTER_CONFIG)) {
      return;
    }

    if (missingPaths.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingPaths.map(async (path) => {
        try {
          const count = await fetchGoatCounterCount(ACTIVE_GOATCOUNTER_CONFIG, path);
          return [path, count] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const resolvedEntries = results.filter((item): item is readonly [string, string] => item !== null);
      if (resolvedEntries.length === 0) {
        return;
      }

      setCounts((current) => {
        const next = { ...current };
        resolvedEntries.forEach(([path, count]) => {
          next[path] = count;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [paths]);

  useEffect(() => {
    if (!ACTIVE_GOATCOUNTER_CONFIG) {
      return;
    }

    const handleCountUpdated = () => {
      const nextCounts: Record<string, string> = {};
      paths.forEach((path) => {
        const count = getGoatCounterDisplayCount(ACTIVE_GOATCOUNTER_CONFIG, path);
        if (count !== undefined) {
          nextCounts[path] = count;
        }
      });

      setCounts((current) => ({ ...current, ...nextCounts }));
    };

    window.addEventListener(GOATCOUNTER_COUNT_UPDATED_EVENT, handleCountUpdated);
    return () => window.removeEventListener(GOATCOUNTER_COUNT_UPDATED_EVENT, handleCountUpdated);
  }, [paths]);

  return counts;
}

function useGiscusCommentCounts(entries: PortalEntry[]): Record<string, string> {
  const paths = useMemo(() => [...new Set(entries.map((entry) => entry.href))], [entries]);
  return useGiscusCommentCountsForPaths(paths);
}

function useGiscusCommentCountsForPaths(paths: string[]): Record<string, string> {
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ACTIVE_GISCUS_CONFIG) {
      setCounts({});
      return;
    }

    const nextCached: Record<string, string> = {};
    const missingPaths: string[] = [];

    paths.forEach((path) => {
      const cacheKey = getGiscusCommentCacheKey(ACTIVE_GISCUS_CONFIG.repo, ACTIVE_GISCUS_CONFIG.categoryId, path);
      const cached = giscusCommentCountCache.get(cacheKey);
      if (cached !== undefined) {
        nextCached[path] = cached;
      } else {
        missingPaths.push(path);
      }
    });

    setCounts((current) => ({ ...current, ...nextCached }));

    if (missingPaths.length === 0) {
      return;
    }

    let cancelled = false;

    void fetchGitHubDiscussions(ACTIVE_GISCUS_CONFIG)
      .then((discussions) => {
        if (cancelled) {
          return;
        }

        const resolvedCounts: Record<string, string> = {};
        paths.forEach((path) => {
          const count = resolveGiscusCommentCountForPath(discussions, path);
          const cacheKey = getGiscusCommentCacheKey(ACTIVE_GISCUS_CONFIG.repo, ACTIVE_GISCUS_CONFIG.categoryId, path);
          giscusCommentCountCache.set(cacheKey, count);
          resolvedCounts[path] = count;
        });

        setCounts((current) => ({ ...current, ...resolvedCounts }));
      })
      .catch((error) => {
        console.warn('GitHub discussion count fetch failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [paths]);

  return counts;
}

const TAG_TONES = ['blue', 'teal', 'green', 'amber', 'violet', 'cyan', 'olive', 'orange', 'rose', 'indigo'] as const;

function getTagTone(tag: string): (typeof TAG_TONES)[number] {
  let hash = 0;
  for (const character of tag) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return TAG_TONES[Math.abs(hash) % TAG_TONES.length];
}

function handleInternalLink(event: MouseEvent<HTMLAnchorElement>, href: string, navigate: (href: string) => void) {
  if (!href.startsWith('/') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  event.preventDefault();
  navigate(href);
}

function SiteLink({
  href,
  navigate,
  className,
  children,
}: {
  href: string;
  navigate: (href: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={toPublicHref(href)} onClick={(event) => handleInternalLink(event, href, navigate)}>
      {children}
    </a>
  );
}

function SmartLink({
  href,
  navigate,
  className,
  children,
}: {
  href: string;
  navigate: (href: string) => void;
  className?: string;
  children: ReactNode;
}) {
  if (href.startsWith('/')) {
    return (
      <SiteLink href={href} navigate={navigate} className={className}>
        {children}
      </SiteLink>
    );
  }

  const external = /^(https?:)?\/\//i.test(href);

  return (
    <a
      className={className}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      onClick={(event) => {
        if (href === '#') {
          event.preventDefault();
        }
      }}
    >
      {children}
    </a>
  );
}

function CategoryBar({ route, navigate }: { route: Route; navigate: (href: string) => void }) {
  const activeCategory = getRouteCategorySlug(route);

  return (
    <nav className="blog-category-bar" aria-label="Blog categories">
      {contentIndex.categories.map((category, index) => {
        const documents = getCategoryDocuments(category.slug).filter((document) => document.frontmatter.published);
        const accentClass = getAccentClass(index);
        const isActive = activeCategory === category.slug;

        return (
          <SiteLink
            key={category.slug}
            href={`/category/${category.slug}`}
            navigate={navigate}
            className={isActive ? `blog-category-pill ${accentClass} active` : `blog-category-pill ${accentClass}`}
          >
            <span className="blog-category-pill-label">{normalizeLabel(category.label)}</span>
            <span className="blog-category-pill-subtitle">
              {category.labelEn?.trim() || toCategorySubtitle(category.slug)}
            </span>
          </SiteLink>
        );
      })}
    </nav>
  );
}

function Shell({
  route,
  navigate,
  children,
}: {
  route: Route;
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  const configuredToolLinks = contentIndex.siteConfig.channels.length > 0 ? contentIndex.siteConfig.channels : DEFAULT_TOOL_LINKS;
  const toolLinks = configuredToolLinks.map((tool) => {
    if (tool.label === '搜索' && tool.href === '#blog-search') {
      return { ...tool, href: '/search' };
    }

    if (tool.label === '归档' && tool.href === '#') {
      return { ...tool, href: '/archive' };
    }

    return tool;
  });
  const headerStyle = {
    '--blog-header-image': `url("${toAssetPath('/blog-header-bg.png')}")`,
  } as CSSProperties;

  return (
    <div className="site-shell">
      <header className="blog-header" style={headerStyle}>
        <div className="blog-header-main">
          <SiteLink href={getDefaultCategoryPath()} navigate={navigate} className="blog-brand">
            <span className="blog-avatar" aria-hidden="true">
              <img src={toAssetPath('/blog-avatar.jpg')} alt="" />
            </span>
            <span className="blog-brand-copy">
              <h1>{contentIndex.siteConfig.title}</h1>
              <p>{contentIndex.siteConfig.tagline}</p>
            </span>
          </SiteLink>

          <nav className="blog-tool-nav" aria-label="Blog utilities">
            {toolLinks.map((tool) => (
              <SmartLink key={`${tool.label}-${tool.href}`} href={tool.href} navigate={navigate} className="blog-tool-link">
                {tool.label}
              </SmartLink>
            ))}
          </nav>
        </div>

        <CategoryBar route={route} navigate={navigate} />
      </header>

      <main className="page">{children}</main>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="blog-sidebar-card">
      <div className="blog-sidebar-card-head">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SearchForm({
  navigate,
  query,
  setQuery,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    navigate(normalizedQuery ? `/search?q=${encodeURIComponent(normalizedQuery)}` : '/search');
  };

  return (
    <form className="blog-search" onSubmit={handleSearchSubmit}>
      <label className="blog-search-input-wrap" htmlFor="blog-search">
        <input
          id="blog-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="检索标题、标签或正文"
          autoComplete="off"
        />
      </label>
      <button type="submit">搜索</button>
    </form>
  );
}

function SiteSidebar({
  navigate,
  query,
  setQuery,
  extra,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
  extra?: ReactNode;
}) {
  return (
    <aside className="blog-sidebar">
      {extra}

      <SidebarSection title="搜索">
        <SearchForm navigate={navigate} query={query} setQuery={setQuery} />
        <p className="blog-sidebar-note">多个关键词用空格分隔，结果会按相关度排序。</p>
      </SidebarSection>

      <SidebarSection title="标签云">
        <div className="blog-tag-cloud">
          {GLOBAL_TAG_CLOUD.length > 0 ? (
            GLOBAL_TAG_CLOUD.map((tag) => (
              <button
                key={tag.tag}
                type="button"
                className={`blog-tag-chip tone-${getTagTone(tag.tag)}`}
                onClick={() => {
                  setQuery(tag.tag);
                  navigate(`/search?q=${encodeURIComponent(tag.tag)}`);
                }}
              >
                <span>{tag.tag}</span>
                <em>{tag.count}</em>
              </button>
            ))
          ) : (
            <p className="blog-sidebar-note">标签会在发布更多文章后自动聚合到这里。</p>
          )}
        </div>
      </SidebarSection>

      {ACTIVE_FRIEND_LINKS.length > 0 ? (
        <SidebarSection title="友情链接">
          <ul className="blog-link-list" id="blog-links">
            {ACTIVE_FRIEND_LINKS.map((link) => (
              <li key={`${link.label}-${link.href}`}>
                <SmartLink href={link.href} navigate={navigate} className="blog-link-item">
                  <FriendLinkAvatar label={link.label} icon={link.icon} />
                  <span className="blog-link-content">
                    <strong>
                      <span>{link.label}</span>
                      <IconExternalLink aria-hidden="true" />
                    </strong>
                    {link.note?.trim() ? <span>{link.note}</span> : null}
                  </span>
                </SmartLink>
              </li>
            ))}
          </ul>
        </SidebarSection>
      ) : null}
    </aside>
  );
}

function ArticleTocSidebar({ headings, extra }: { headings: MarkdownHeading[]; extra?: ReactNode }) {
  const handleTocJump = (id: string) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const target = document.getElementById(id);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const url = new URL(window.location.href);
    url.hash = id;
    window.history.replaceState(null, '', url.toString());
  };

  return (
    <aside className="blog-sidebar blog-sidebar-toc">
      <SidebarSection title="目录">
        {headings.length > 0 ? (
          <ol className="blog-toc-list">
            {headings.map((heading) => (
              <li key={heading.id} className="blog-toc-item" style={{ '--toc-level': heading.level } as CSSProperties}>
                <button
                  type="button"
                  className="blog-toc-link"
                  onClick={() => handleTocJump(heading.id)}
                  aria-label={heading.text}
                >
                  <span className="blog-toc-link-label">{renderInlineMarkdown(heading.markdown)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="blog-sidebar-note">正文里还没有可加入目录的标题。</p>
        )}
      </SidebarSection>

      {extra}
    </aside>
  );
}

function GiscusThread({ threadKey }: { threadKey: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ACTIVE_GISCUS_CONFIG || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-repo', ACTIVE_GISCUS_CONFIG.repo);
    script.setAttribute('data-repo-id', ACTIVE_GISCUS_CONFIG.repoId);
    script.setAttribute('data-category', ACTIVE_GISCUS_CONFIG.category);
    script.setAttribute('data-category-id', ACTIVE_GISCUS_CONFIG.categoryId);
    script.setAttribute('data-mapping', ACTIVE_GISCUS_CONFIG.mapping);
    script.setAttribute('data-strict', ACTIVE_GISCUS_CONFIG.strict ? '1' : '0');
    script.setAttribute('data-reactions-enabled', ACTIVE_GISCUS_CONFIG.reactionsEnabled ? '1' : '0');
    script.setAttribute('data-emit-metadata', ACTIVE_GISCUS_CONFIG.emitMetadata ? '1' : '0');
    script.setAttribute('data-input-position', ACTIVE_GISCUS_CONFIG.inputPosition);
    script.setAttribute('data-theme', ACTIVE_GISCUS_CONFIG.theme);
    script.setAttribute('data-lang', ACTIVE_GISCUS_CONFIG.lang);
    script.setAttribute('data-loading', 'lazy');

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [threadKey]);

  if (!ACTIVE_GISCUS_CONFIG) {
    return null;
  }

  return (
    <section className="blog-comments-panel">
      <div className="blog-comments-head">
        <h3>评论</h3>
      </div>
      <div ref={containerRef} className="blog-comments-embed" />
    </section>
  );
}

function useCardGalleryImages(): CardGalleryImage[] {
  const [images, setImages] = useState<CardGalleryImage[]>([]);

  useEffect(() => {
    if (!ACTIVE_CARD_IMAGE_CONFIG) {
      setImages([]);
      return;
    }

    let cancelled = false;
    fetch(toAssetPath(ACTIVE_CARD_IMAGE_CONFIG.manifest), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest) => {
        if (!cancelled) {
          setImages(normalizeCardGalleryImages(manifest));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return images;
}

function ArticleCard({
  entry,
  navigate,
  viewCount,
  commentCount,
  cardImage,
  showCardCover,
}: {
  entry: PortalEntry;
  navigate: (href: string) => void;
  viewCount?: string;
  commentCount?: string;
  cardImage?: CardGalleryImage | null;
  showCardCover: boolean;
}) {
  return (
    <article className={`blog-card ${entry.accentClass}${showCardCover ? ' has-cover' : ''}`}>
      {showCardCover ? (
        <SiteLink href={entry.href} navigate={navigate} className="blog-card-cover" aria-label={entry.title}>
          {cardImage ? <img src={toAssetPath(cardImage.path)} alt="" loading="lazy" /> : <span aria-hidden="true" />}
        </SiteLink>
      ) : null}
      <div className="blog-card-body">
        <header className="blog-card-header">
          <SiteLink href={entry.href} navigate={navigate} className="blog-card-title">
            {entry.title}
          </SiteLink>
        </header>

        <div className="blog-card-meta-row">
          <span className="blog-card-meta-item">
            <IconCalendar className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
            <span>{entry.date}</span>
          </span>
          {ACTIVE_GOATCOUNTER_CONFIG && viewCount !== undefined ? (
            <span className="blog-card-meta-item">
              <IconEye className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
              <span>{viewCount} 阅读</span>
            </span>
          ) : null}
          {ACTIVE_GISCUS_CONFIG && commentCount !== undefined ? (
            <span className="blog-card-meta-item">
              <IconMessageCircle className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
              <span>{commentCount} 评论</span>
            </span>
          ) : null}
          {entry.tags.slice(0, 2).map((tag) => (
            <span key={tag} className={`blog-card-tag tone-${getTagTone(tag)}`}>
              {tag}
            </span>
          ))}
        </div>

        <div className="blog-card-divider" aria-hidden="true" />

        <div className="blog-card-footer">
          <SiteLink href={entry.href} navigate={navigate} className="blog-card-readmore">
            阅读全文
          </SiteLink>
          {entry.tags.length > 2 ? (
            <span className="blog-card-more-tags">+{entry.tags.length - 2} 个标签</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ArticleFeed({
  entries,
  navigate,
  emptyTitle,
  emptyCopy,
  cardGalleryImages,
}: {
  entries: PortalEntry[];
  navigate: (href: string) => void;
  emptyTitle: string;
  emptyCopy: string;
  cardGalleryImages: CardGalleryImage[];
}) {
  const viewCounts = useGoatCounterCounts(entries);
  const commentCounts = useGiscusCommentCounts(entries);
  const cardImageAssignments = useMemo(
    () => (ACTIVE_CARD_IMAGE_CONFIG ? buildCardImageAssignments(GLOBAL_ENTRIES, cardGalleryImages) : new Map()),
    [cardGalleryImages],
  );

  if (entries.length === 0) {
    return (
      <section className="blog-empty-state">
        <h3>{emptyTitle}</h3>
        <p>{emptyCopy}</p>
      </section>
    );
  }

  return (
    <section className="blog-feed">
      {entries.map((entry) => {
        const cardImage = cardImageAssignments.get(entry.id) ?? null;

        return (
          <ArticleCard
            key={entry.id}
            entry={entry}
            navigate={navigate}
            viewCount={ACTIVE_GOATCOUNTER_CONFIG ? viewCounts[entry.href] : undefined}
            commentCount={ACTIVE_GISCUS_CONFIG ? commentCounts[entry.href] : undefined}
            cardImage={cardImage}
            showCardCover={Boolean(cardImage)}
          />
        );
      })}
    </section>
  );
}

const SEARCH_FIELD_LABELS: Record<SearchMatchField, string> = {
  title: '标题',
  tag: '标签',
  category: '类目',
  summary: '摘要',
  body: '正文',
};

function SearchResultCard({
  result,
  navigate,
  viewCount,
  commentCount,
}: {
  result: SearchResult;
  navigate: (href: string) => void;
  viewCount?: string;
  commentCount?: string;
}) {
  const { entry, terms } = result;

  return (
    <article className={`blog-search-result ${entry.accentClass}`}>
      <div className="blog-search-result-main">
        <SiteLink href={entry.href} navigate={navigate} className="blog-search-result-title">
          {highlightSearchText(entry.title, terms)}
        </SiteLink>

        <div className="blog-search-result-meta">
          <span className="blog-card-meta-item">
            <IconCalendar className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
            <span>{entry.date}</span>
          </span>
          <span>{entry.categoryLabel}</span>
          {ACTIVE_GOATCOUNTER_CONFIG && viewCount !== undefined ? (
            <span className="blog-card-meta-item">
              <IconEye className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
              <span>{viewCount} 阅读</span>
            </span>
          ) : null}
          {ACTIVE_GISCUS_CONFIG && commentCount !== undefined ? (
            <span className="blog-card-meta-item">
              <IconMessageCircle className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
              <span>{commentCount} 评论</span>
            </span>
          ) : null}
        </div>

        {result.snippet ? (
          <p className="blog-search-result-snippet">{highlightSearchText(result.snippet, terms)}</p>
        ) : null}

        <footer className="blog-search-result-footer">
          <div className="blog-search-match-fields" aria-label="命中位置">
            {result.matchedFields.map((field) => (
              <span key={field}>{SEARCH_FIELD_LABELS[field]}</span>
            ))}
          </div>
          <SiteLink href={entry.href} navigate={navigate} className="blog-search-result-link">
            阅读全文
          </SiteLink>
        </footer>
      </div>
    </article>
  );
}

function SearchResultFeed({
  results,
  navigate,
}: {
  results: SearchResult[];
  navigate: (href: string) => void;
}) {
  const entries = useMemo(() => results.map((result) => result.entry), [results]);
  const viewCounts = useGoatCounterCounts(entries);
  const commentCounts = useGiscusCommentCounts(entries);

  return (
    <section className="blog-search-results" aria-live="polite">
      {results.map((result) => (
        <SearchResultCard
          key={result.entry.id}
          result={result}
          navigate={navigate}
          viewCount={ACTIVE_GOATCOUNTER_CONFIG ? viewCounts[result.entry.href] : undefined}
          commentCount={ACTIVE_GISCUS_CONFIG ? commentCounts[result.entry.href] : undefined}
        />
      ))}
    </section>
  );
}

function SearchPage({
  navigate,
  query,
  submittedQuery,
  setQuery,
}: {
  navigate: (href: string) => void;
  query: string;
  submittedQuery: string;
  setQuery: (value: string) => void;
}) {
  const deferredQuery = useDeferredValue(submittedQuery);
  const terms = useMemo(() => parseSearchTerms(deferredQuery), [deferredQuery]);
  const results = useMemo(() => searchEntries(GLOBAL_ENTRIES, deferredQuery), [deferredQuery]);

  return (
    <div className="blog-layout">
      <section className="blog-main-column">
        {terms.length === 0 ? (
          <section className="blog-empty-state blog-search-empty">
            <IconSearch aria-hidden="true" />
            <h3>输入关键词开始搜索</h3>
            <p>可检索文章标题、标签、类目、摘要和正文内容。</p>
          </section>
        ) : results.length > 0 ? (
          <SearchResultFeed results={results} navigate={navigate} />
        ) : (
          <section className="blog-empty-state blog-search-empty">
            <IconSearch aria-hidden="true" />
            <h3>没有找到相关内容</h3>
            <p>可以减少关键词数量，或换一个更简短的表达再试。</p>
          </section>
        )}
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} />
    </div>
  );
}

function HomePage({
  navigate,
  query,
  setQuery,
  cardGalleryImages,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
  cardGalleryImages: CardGalleryImage[];
}) {
    return (
      <div className="blog-layout">
        <section className="blog-main-column">
          <ArticleFeed
            entries={GLOBAL_ENTRIES}
            navigate={navigate}
            cardGalleryImages={cardGalleryImages}
          emptyTitle="没有找到匹配的文章"
          emptyCopy="换一个关键词试试，或者直接从上方类目栏进入相应分区。"
        />
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} />
    </div>
  );
}

function CollectionPage<TFrontmatter extends ContentFrontmatter>({
  documents,
  navigate,
  query,
  setQuery,
  cardGalleryImages,
}: {
  documents: RoutedDocument<TFrontmatter>[];
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
  cardGalleryImages: CardGalleryImage[];
}) {
  const publishedEntries = useMemo(
    () =>
      documents
        .filter((document) => document.frontmatter.published)
        .map((document) => toPortalEntry(document as RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>)),
    [documents],
  );

    return (
      <div className="blog-layout">
        <section className="blog-main-column">
          <ArticleFeed
            entries={publishedEntries}
            navigate={navigate}
            cardGalleryImages={cardGalleryImages}
          emptyTitle="当前列表没有匹配结果"
          emptyCopy="可以尝试清空搜索，或者切换到别的类目继续浏览。"
        />
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} />
    </div>
  );
}

function ArchivePage({
  navigate,
  query,
  setQuery,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const archiveGroups = useMemo(() => buildArchiveGroups(GLOBAL_ENTRIES), []);
  const archiveDescription = '按年月整理所有已发布文章，方便回顾与检索。';

  return (
    <div className="blog-layout">
      <section className="blog-main-column">
        <section className="blog-panel blog-archive-hero">
          <p className="blog-panel-eyebrow">Archive</p>
          <div className="blog-panel-head">
            <div>
              <h2>归档</h2>
              <p>{archiveDescription}</p>
            </div>
            <div className="blog-metrics">
              <span>{GLOBAL_ENTRIES.length} 篇文章</span>
              <span>{archiveGroups.length} 个归档月份</span>
            </div>
          </div>
        </section>

        <section className="blog-panel blog-archive-panel">
          {archiveGroups.length > 0 ? (
            <div className="blog-archive-groups">
              {archiveGroups.map((group) => {
                const meta = getArchiveGroupMeta(group.key);

                return (
                <section key={group.key} className="blog-archive-group">
                  <div className="blog-archive-group-head">
                    <div className="blog-archive-group-stamp" aria-hidden="true">
                      <span className="blog-archive-group-year">{meta.year}</span>
                      <span className="blog-archive-group-month">{meta.month}</span>
                    </div>
                    <div className="blog-archive-group-copy">
                      <h2>{meta.title}</h2>
                      <p>
                        {meta.summary}
                        <span> · {group.entries.length} 篇</span>
                      </p>
                    </div>
                  </div>
                  <ul className="blog-archive-list">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="blog-archive-item">
                        <span className="blog-archive-item-bullet" aria-hidden="true" />
                        <span className="blog-archive-item-date">{getArchiveDateLabel(entry.date)}</span>
                        <SiteLink href={entry.href} navigate={navigate} className="blog-archive-item-link">
                          {entry.title}
                        </SiteLink>
                      </li>
                    ))}
                  </ul>
                </section>
                );
              })}
            </div>
          ) : (
            <section className="blog-empty-state">
              <h3>当前没有可显示的归档内容</h3>
              <p>可以尝试清空搜索，或先发布文章后再回来查看归档。</p>
            </section>
          )}
        </section>
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} />
    </div>
  );
}

function InkNoteAside({ note }: { note: RoutedDocument<InkNoteFrontmatter> }) {
  return (
    <section className="blog-sidebar-card">
      <div className="blog-sidebar-card-head">
        <h3>InkNote 信息</h3>
      </div>
      <dl className="blog-info-list">
        <div>
          <dt>纸张</dt>
          <dd>{note.frontmatter.paperStyle}</dd>
        </div>
        <div>
          <dt>笔迹</dt>
          <dd>{note.frontmatter.handwritingStyle}</dd>
        </div>
        <div>
          <dt>工程文件</dt>
          <dd>{note.frontmatter.projectFile}</dd>
        </div>
        {note.frontmatter.previewImage ? (
          <div>
            <dt>预览图</dt>
            <dd>{note.frontmatter.previewImage}</dd>
          </div>
        ) : null}
        {note.frontmatter.pdfFile ? (
          <div>
            <dt>PDF</dt>
            <dd>{note.frontmatter.pdfFile}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function getInkNoteProjectContent(projectPayload: string | null): string | null {
  if (!projectPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(projectPayload) as { content?: unknown };
    return typeof parsed.content === 'string' ? parsed.content : null;
  } catch {
    return null;
  }
}

function getInkNoteHeadings(projectPayload: string | null, title: string): MarkdownHeading[] {
  const projectContent = getInkNoteProjectContent(projectPayload);
  const projectHeadings = projectContent
    ? extractMarkdownHeadings(projectContent, { minLevel: 1, maxLevel: 4 })
    : [];

  return projectHeadings.length > 0
    ? projectHeadings
    : extractMarkdownHeadings(`# ${title}`, { minLevel: 1, maxLevel: 4 });
}

function InkNoteTocAnchors({ headings }: { headings: MarkdownHeading[] }) {
  if (headings.length === 0) {
    return null;
  }

  return (
    <div className="blog-inknote-toc-anchors" aria-hidden="true">
      {headings.map((heading) => (
        <span key={heading.id} id={heading.id} />
      ))}
    </div>
  );
}

function DetailPage<TFrontmatter extends ContentFrontmatter>({
  eyebrow,
  document,
  meta,
  aside,
  content,
  contentClassName = 'markdown-body',
  headings,
  showComments = false,
}: {
  eyebrow: string;
  document: RoutedDocument<TFrontmatter>;
  meta: DetailMetaItem[];
  aside?: ReactNode;
  content?: ReactNode;
  contentClassName?: string;
  headings?: MarkdownHeading[];
  showComments?: boolean;
}) {
  const defaultHeadings = useMemo(
    () => extractMarkdownHeadings(document.body, { minLevel: 1, maxLevel: 4 }),
    [document.body],
  );
  const effectiveHeadings = headings ?? defaultHeadings;
  const statPaths = useMemo(() => [document.href], [document.href]);
  const viewCounts = useGoatCounterCountsForPaths(statPaths);
  const commentCounts = useGiscusCommentCountsForPaths(statPaths);
  const viewCount = ACTIVE_GOATCOUNTER_CONFIG ? viewCounts[document.href] : undefined;
  const commentCount = ACTIVE_GISCUS_CONFIG && showComments ? commentCounts[document.href] : undefined;
  const dateMeta = meta.filter((item) => item.type === 'date');
  const tagMeta = meta.filter((item) => item.type === 'tag');

  return (
    <div className="blog-layout detail">
      <section className="blog-main-column">
        <section className="blog-panel detail-header">
          <div className="blog-panel-head single">
            <div>
              <h2>{document.frontmatter.title}</h2>
              <div className="blog-detail-meta">
                {dateMeta.map((item, index) => (
                  <span key={`${item.type}-${item.label}-${index}`} className="blog-card-meta-item">
                    <IconCalendar className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
                    <span>{item.label}</span>
                  </span>
                ))}
                {viewCount !== undefined ? (
                  <span className="blog-card-meta-item">
                    <IconEye className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
                    <span>{viewCount} 阅读</span>
                  </span>
                ) : null}
                {commentCount !== undefined ? (
                  <span className="blog-card-meta-item">
                    <IconMessageCircle className="blog-card-meta-icon" aria-hidden="true" stroke={1.8} />
                    <span>{commentCount} 评论</span>
                  </span>
                ) : null}
                {tagMeta.map((item, index) => (
                  <span
                    key={`${item.type}-${item.label}-${index}`}
                    className={`blog-card-tag tone-${getTagTone(item.label)}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
              {document.frontmatter.summary ? <p>{document.frontmatter.summary}</p> : null}
            </div>
          </div>
        </section>

        <article className={contentClassName}>
          {content ?? renderMarkdown(resolveWebContentAssets(document.body))}
        </article>
        {showComments ? <GiscusThread key={document.href} threadKey={document.href} /> : null}
      </section>

      <ArticleTocSidebar headings={effectiveHeadings} extra={aside} />
    </div>
  );
}

function NotFoundPage({
  navigate,
  query,
  setQuery,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="blog-layout">
      <section className="blog-main-column">
        <section className="blog-panel">
          <p className="blog-panel-eyebrow">404</p>
          <div className="blog-panel-head single">
            <div>
              <h2>这个页面还没有准备好</h2>
              <p>当前路由存在，但内容仓里还没有与它对应的 Markdown 或 InkNote 条目。</p>
            </div>
          </div>
        </section>
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} />
    </div>
  );
}

export default function SiteAppWide() {
  const [pathname, setPathname] = useState(() => getInitialPathname());
  const [searchQuery, setSearchQuery] = useState(() => getSearchQueryFromLocation());
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState(() => getSearchQueryFromLocation());
  const [isGoatCounterReady, setIsGoatCounterReady] = useState(
    () => typeof window !== 'undefined' && typeof (window as { goatcounter?: { count?: unknown } }).goatcounter?.count === 'function',
  );
  const goatCounterTrackedPathRef = useRef<string | null>(null);
  const cardGalleryImages = useCardGalleryImages();
  const route = matchRoute(pathname);

  useEffect(() => {
    if (!ACTIVE_GOATCOUNTER_CONFIG) {
      return;
    }

    if (typeof (window as { goatcounter?: { count?: unknown } }).goatcounter?.count === 'function') {
      setIsGoatCounterReady(true);
      return;
    }

    const existingWindowConfig = (window as { goatcounter?: Record<string, unknown> }).goatcounter ?? {};
    (window as { goatcounter?: Record<string, unknown> }).goatcounter = {
      ...existingWindowConfig,
      allow_local: true,
      no_onload: true,
    };

    const existingScript = document.getElementById('goatcounter-script') as HTMLScriptElement | null;
    if (existingScript) {
      const handleLoad = () => setIsGoatCounterReady(true);
      existingScript.addEventListener('load', handleLoad);
      return () => existingScript.removeEventListener('load', handleLoad);
    }

    const script = document.createElement('script');
    script.id = 'goatcounter-script';
    script.async = true;
    script.src = ACTIVE_GOATCOUNTER_CONFIG.scriptUrl;
    script.dataset.goatcounter = ACTIVE_GOATCOUNTER_CONFIG.endpoint;
    script.dataset.goatcounterSettings = JSON.stringify({
      allow_local: true,
      no_onload: true,
    });
    script.addEventListener('load', () => setIsGoatCounterReady(true), { once: true });
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const nextPath = getGoatCounterPathForRoute(route);
    if (!nextPath) {
      goatCounterTrackedPathRef.current = null;
      return;
    }

    if (!ACTIVE_GOATCOUNTER_CONFIG || !isGoatCounterReady) {
      return;
    }

    if (goatCounterTrackedPathRef.current === nextPath) {
      return;
    }

    const counter = (window as {
      goatcounter?: {
        count?: (options?: { path?: string; no_session?: boolean; title?: string }) => void;
        filter?: () => string | false;
      };
    }).goatcounter;
    if (typeof counter?.count !== 'function') {
      return;
    }

    const filteredReason = typeof counter.filter === 'function' ? counter.filter() : false;
    if (filteredReason) {
      console.warn('GoatCounter skipped pageview:', filteredReason);
      return;
    }

    counter.count({
      path: nextPath,
      title: document.title,
      no_session: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    });
    applyOptimisticGoatCounterCount(ACTIVE_GOATCOUNTER_CONFIG, nextPath);
    goatCounterTrackedPathRef.current = nextPath;
  }, [isGoatCounterReady, route]);

  useEffect(() => {
    const blogTitle = contentIndex.siteConfig.title?.trim() || "Chty's Blog";
    let nextTitle = blogTitle;

    if (route.type === 'notes-detail') {
      const note = findMarkdownNote(route.slug);
      nextTitle = note?.frontmatter.title?.trim() || blogTitle;
    } else if (route.type === 'inknote-detail') {
      const note = findInkNote(route.slug);
      nextTitle = note?.frontmatter.title?.trim() || blogTitle;
    } else if (route.type === 'archive') {
      nextTitle = `归档 | ${blogTitle}`;
    } else if (route.type === 'search') {
      nextTitle = submittedSearchQuery.trim()
        ? `搜索：${submittedSearchQuery.trim()} | ${blogTitle}`
        : `搜索 | ${blogTitle}`;
    } else if (route.type === 'page') {
      const pageDocument = findPage(route.slug);
      nextTitle = pageDocument?.frontmatter.title?.trim() || blogTitle;
    } else if (route.type === 'not-found') {
      nextTitle = `404 | ${blogTitle}`;
    }

    document.title = nextTitle;
  }, [route, submittedSearchQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = resolveDefaultPath(stripBasePath(window.location.pathname));
      if (toBrowserPath(nextPath) !== normalizePathname(window.location.pathname)) {
        window.history.replaceState(
          {},
          '',
          `${toBrowserPath(nextPath)}${window.location.search}${window.location.hash}`,
        );
      }
      setPathname(nextPath);
      const nextSearchQuery = getSearchQueryFromLocation();
      setSearchQuery(nextSearchQuery);
      setSubmittedSearchQuery(nextSearchQuery);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (href: string) => {
    const target = parseInternalHref(href);
    const nextPath = resolveDefaultPath(stripBasePath(target.pathname));
    const nextQuery = target.searchParams.get('q') ?? '';
    const nextBrowserHref = `${toBrowserPath(nextPath)}${target.search}${target.hash}`;
    const currentBrowserHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextBrowserHref === currentBrowserHref) {
      return;
    }

    window.history.pushState({}, '', nextBrowserHref);
    setPathname(nextPath);
    setSearchQuery(nextQuery);
    setSubmittedSearchQuery(nextPath === '/search' ? nextQuery : '');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  let page: ReactNode;

  if (route.type === 'home') {
    page = (
      <HomePage
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
        cardGalleryImages={cardGalleryImages}
      />
    );
  } else if (route.type === 'search') {
    page = (
      <SearchPage
        navigate={navigate}
        query={searchQuery}
        submittedQuery={submittedSearchQuery}
        setQuery={setSearchQuery}
      />
    );
  } else if (route.type === 'archive') {
    page = <ArchivePage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />;
  } else if (route.type === 'notes-list') {
    page = (
      <CollectionPage
        documents={contentIndex.notes}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
        cardGalleryImages={cardGalleryImages}
      />
    );
  } else if (route.type === 'inknote-list') {
    page = (
      <CollectionPage
        documents={contentIndex.inknotes}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
        cardGalleryImages={cardGalleryImages}
      />
    );
  } else if (route.type === 'category') {
    const category = findCategory(route.slug);
    const documents = getCategoryDocuments(route.slug);
    page = category ? (
      <CollectionPage
        documents={documents}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
        cardGalleryImages={cardGalleryImages}
      />
    ) : (
      <NotFoundPage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />
    );
  } else if (route.type === 'notes-detail') {
    const note = findMarkdownNote(route.slug);
    page = note ? (
      <DetailPage
        eyebrow="Markdown"
        document={note}
        meta={[
          { type: 'date', label: note.frontmatter.date },
          ...(note.frontmatter.tags ?? []).map((tag) => ({ type: 'tag' as const, label: tag })),
        ]}
        showComments
      />
    ) : (
      <NotFoundPage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />
    );
  } else if (route.type === 'inknote-detail') {
    const note = findInkNote(route.slug);
    page = note ? (() => {
      const projectPayload = findInkNoteProject(note);
      const inknoteHeadings = getInkNoteHeadings(projectPayload, note.frontmatter.title);

      return (
        <DetailPage
          eyebrow="InkNote"
          document={note}
          meta={[
            { type: 'date', label: note.frontmatter.date },
            ...(note.frontmatter.tags ?? []).map((tag) => ({ type: 'tag' as const, label: tag })),
          ]}
          headings={inknoteHeadings}
          content={
            <>
              <InkNoteTocAnchors headings={inknoteHeadings} />
              <InkNoteNotebookViewer
                projectPayload={projectPayload}
                title={note.frontmatter.title}
                fallback={renderMarkdown(resolveWebContentAssets(note.body))}
              />
            </>
          }
          contentClassName="blog-inknote-detail"
          showComments
        />
      );
    })() : (
      <NotFoundPage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />
    );
  } else if (route.type === 'page') {
    const pageDocument = findPage(route.slug);
    page = pageDocument ? (
      <DetailPage
        eyebrow="Page"
        document={pageDocument}
        meta={[{ type: 'date', label: pageDocument.frontmatter.date }]}
      />
    ) : (
      <NotFoundPage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />
    );
  } else {
    page = <NotFoundPage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />;
  }

  return (
    <Shell route={route} navigate={navigate}>
      {page}
    </Shell>
  );
}
