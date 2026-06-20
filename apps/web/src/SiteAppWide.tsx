import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
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
  findMarkdownNote,
  findPage,
  getCategoryDocuments,
  getDocumentCategoryLabel,
  getDocumentCategorySlugForRoute,
  type RoutedDocument,
} from './lib/content';
import { extractMarkdownHeadings, renderInlineMarkdown, renderMarkdown, type MarkdownHeading } from './lib/markdown';

type Route =
  | { type: 'home' }
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
  searchText: string;
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

const CATEGORY_ACCENTS = ['orange', 'blue', 'green', 'amber', 'slate'] as const;

const DEFAULT_TOOL_LINKS = [
  { label: '搜索', href: '#blog-search', description: '站内检索' },
  { label: '归档', href: '#', description: '文章归档' },
  { label: 'RSS', href: '#', description: '订阅更新' },
  { label: '友链', href: '#blog-links', description: '友情链接' },
  { label: '关于', href: '/about', description: '关于这个博客' },
];

const KNOWN_LABEL_FIXES: Record<string, string> = {
  '鏈哄櫒瀛︿範': '机器学习',
  '鍙ゅ吀鎽樺綍': '古典摘录',
};

const FRIEND_LINKS = [
  { label: '友链位置 A', href: '#', note: '后续可替换为常用博客或项目站点。' },
  { label: '友链位置 B', href: '#', note: '保留给技术写作者或朋友站点。' },
  { label: '友链位置 C', href: '#', note: '也可以改成资料库、论文索引或工具页。' },
];

const VISIBLE_MARKDOWN = contentIndex.notes.filter((note) => note.frontmatter.published);
const VISIBLE_INKNOTES = contentIndex.inknotes.filter((note) => note.frontmatter.published);
const ACTIVE_FRIEND_LINKS =
  contentIndex.siteConfig.friendLinks && contentIndex.siteConfig.friendLinks.length > 0
    ? contentIndex.siteConfig.friendLinks
    : FRIEND_LINKS;

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

const BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL ?? '/');

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

function toBrowserPath(pathname: string): string {
  const normalized = resolveDefaultPath(stripBasePath(pathname));
  return BASE_PATH ? `${BASE_PATH}${normalized === '/' ? '' : normalized}` : normalized;
}

function toPublicHref(href: string): string {
  return href.startsWith('/') ? toBrowserPath(href) : href;
}

function toAssetPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return BASE_PATH ? `${BASE_PATH}${normalized}` : normalized;
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

async function fetchGoatCounterCount(config: ResolvedGoatCounterConfig, path: string): Promise<string> {
  const cacheKey = getGoatCounterCacheKey(config.baseUrl, path);
  const cached = goatCounterCountCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const pending = goatCounterCountPending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = fetch(`${config.baseUrl}/counter/${encodeURIComponent(path)}.json`, {
    headers: {
      Accept: 'application/json',
    },
  })
    .then(async (response) => {
      if (response.status === 404) {
        return '0';
      }

      if (!response.ok) {
        throw new Error(`GoatCounter request failed: ${response.status}`);
      }

      const payload = (await response.json()) as { count?: number | string };
      if (typeof payload.count === 'number') {
        return String(payload.count);
      }

      if (typeof payload.count === 'string' && payload.count.trim()) {
        return payload.count.trim();
      }

      return '0';
    })
    .then((count) => {
      goatCounterCountCache.set(cacheKey, count);
      return count;
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
    const nextPath = resolveDefaultPath(stripBasePath(redirected));
    window.history.replaceState({}, '', toBrowserPath(nextPath));
    return nextPath;
  }

  const nextPath = resolveDefaultPath(stripBasePath(window.location.pathname));
  if (toBrowserPath(nextPath) !== normalizePathname(window.location.pathname)) {
    window.history.replaceState({}, '', toBrowserPath(nextPath));
  }

  return nextPath;
}

function matchRoute(pathname: string): Route {
  const normalized = resolveDefaultPath(pathname);

  if (normalized === '/') {
    return { type: 'home' };
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

  return {
    id: document.id,
    href: document.href,
    title: document.frontmatter.title,
    date: document.frontmatter.date,
    categoryLabel: normalizeLabel(getDocumentCategoryLabel(document.frontmatter)),
    typeLabel: document.frontmatter.type === 'inknote' ? 'InkNote' : 'Markdown',
    accentClass: categorySlug ? getCategoryAccentBySlug(categorySlug) : getAccentClass(0),
    tags: document.frontmatter.tags ?? [],
    searchText: `${document.frontmatter.title} ${document.frontmatter.summary ?? ''} ${formatTags(document.frontmatter.tags)} ${stripMarkdown(document.body)}`.toLowerCase(),
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

function filterEntries(entries: PortalEntry[], query: string): PortalEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => entry.searchText.includes(normalized));
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
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ACTIVE_GOATCOUNTER_CONFIG) {
      setCounts({});
      return;
    }

    const paths = [...new Set(entries.map((entry) => entry.href))];
    const nextCached: Record<string, string> = {};
    const missingPaths: string[] = [];

    paths.forEach((path) => {
      const cached = goatCounterCountCache.get(getGoatCounterCacheKey(ACTIVE_GOATCOUNTER_CONFIG.baseUrl, path));
      if (cached !== undefined) {
        nextCached[path] = cached;
      } else {
        missingPaths.push(path);
      }
    });

    setCounts((current) => {
      const next = { ...current, ...nextCached };
      return next;
    });

    if (missingPaths.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingPaths.map(async (path) => {
        try {
          const count = await fetchGoatCounterCount(ACTIVE_GOATCOUNTER_CONFIG, path);
          return [path, count] as const;
        } catch (error) {
          console.warn('GoatCounter count fetch failed', path, error);
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
  }, [entries]);

  return counts;
}

function getTagTone(tag: string): 'blue' | 'teal' | 'green' | 'amber' | 'violet' {
  const tones = ['blue', 'teal', 'green', 'amber', 'violet'] as const;
  let hash = 0;
  for (const character of tag) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
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

  return (
    <a
      className={className}
      href={href}
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
  const toolLinks = contentIndex.siteConfig.channels.length > 0 ? contentIndex.siteConfig.channels : DEFAULT_TOOL_LINKS;
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
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate('/');
  };

  return (
    <aside className="blog-sidebar">
      {extra}

      <SidebarSection title="搜索">
        <form className="blog-search" onSubmit={handleSearchSubmit}>
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="检索标题、标签、正文关键词"
          />
          <button type="submit">查找</button>
        </form>
        <p className="blog-sidebar-note">搜索会即时筛选首页和列表页中的已发布内容。</p>
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
                  navigate('/');
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

      <SidebarSection title="友情链接">
        <ul className="blog-link-list" id="blog-links">
          {ACTIVE_FRIEND_LINKS.map((link) => (
            <li key={link.label}>
              <SmartLink href={link.href} navigate={navigate} className="blog-link-item">
                <strong>{link.label}</strong>
                <span>{link.note}</span>
              </SmartLink>
            </li>
          ))}
        </ul>
      </SidebarSection>
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

function ArticleCard({
  entry,
  navigate,
  viewCount,
}: {
  entry: PortalEntry;
  navigate: (href: string) => void;
  viewCount?: string;
}) {
  return (
    <article className={`blog-card ${entry.accentClass}`}>
      <div className="blog-card-body">
        <header className="blog-card-header">
          <SiteLink href={entry.href} navigate={navigate} className="blog-card-title">
            {entry.title}
          </SiteLink>
        </header>

        <div className="blog-card-meta-row">
          <span className="blog-card-meta-item">
            <span className="blog-card-meta-icon clock" aria-hidden="true" />
            <span>{entry.date}</span>
          </span>
          {ACTIVE_GOATCOUNTER_CONFIG && viewCount !== undefined ? (
            <span className="blog-card-meta-item">
              <span className="blog-card-meta-icon views" aria-hidden="true" />
              <span>{viewCount} 阅读</span>
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
}: {
  entries: PortalEntry[];
  navigate: (href: string) => void;
  emptyTitle: string;
  emptyCopy: string;
}) {
  const viewCounts = useGoatCounterCounts(entries);

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
      {entries.map((entry) => (
        <ArticleCard
          key={entry.id}
          entry={entry}
          navigate={navigate}
          viewCount={ACTIVE_GOATCOUNTER_CONFIG ? (viewCounts[entry.href] ?? '0') : undefined}
        />
      ))}
    </section>
  );
}

function HomePage({
  navigate,
  query,
  setQuery,
}: {
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const filteredEntries = useMemo(() => filterEntries(GLOBAL_ENTRIES, query), [query]);

    return (
      <div className="blog-layout">
        <section className="blog-main-column">
          <ArticleFeed
            entries={filteredEntries}
            navigate={navigate}
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
}: {
  documents: RoutedDocument<TFrontmatter>[];
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const publishedEntries = useMemo(
    () =>
      documents
        .filter((document) => document.frontmatter.published)
        .map((document) => toPortalEntry(document as RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>)),
    [documents],
  );
  const filteredEntries = useMemo(() => filterEntries(publishedEntries, query), [publishedEntries, query]);

    return (
      <div className="blog-layout">
        <section className="blog-main-column">
          <ArticleFeed
            entries={filteredEntries}
            navigate={navigate}
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
  const filteredEntries = useMemo(() => filterEntries(GLOBAL_ENTRIES, query), [query]);
  const archiveGroups = useMemo(() => buildArchiveGroups(filteredEntries), [filteredEntries]);
  const archiveDescription = query.trim()
    ? '当前筛选结果会按年月归档展示。'
    : '按年月整理所有已发布文章，方便回顾与检索。';

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
              <span>{filteredEntries.length} 篇文章</span>
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

function DetailPage<TFrontmatter extends ContentFrontmatter>({
  eyebrow,
  document,
  meta,
  aside,
  showComments = false,
}: {
  eyebrow: string;
  document: RoutedDocument<TFrontmatter>;
  meta: DetailMetaItem[];
  aside?: ReactNode;
  showComments?: boolean;
}) {
  const headings = useMemo(() => extractMarkdownHeadings(document.body, { minLevel: 1, maxLevel: 4 }), [document.body]);

  return (
    <div className="blog-layout detail">
      <section className="blog-main-column">
        <section className="blog-panel detail-header">
          <div className="blog-panel-head single">
            <div>
              <h2>{document.frontmatter.title}</h2>
              <div className="blog-detail-meta">
                {meta.map((item, index) =>
                  item.type === 'date' ? (
                    <span key={`${item.type}-${item.label}-${index}`} className="blog-card-meta-item">
                      <span className="blog-card-meta-icon clock" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                  ) : (
                    <span
                      key={`${item.type}-${item.label}-${index}`}
                      className={`blog-card-tag tone-${getTagTone(item.label)}`}
                    >
                      {item.label}
                    </span>
                  ),
                )}
              </div>
              {document.frontmatter.summary ? <p>{document.frontmatter.summary}</p> : null}
            </div>
          </div>
        </section>

        <article className="markdown-body">{renderMarkdown(document.body)}</article>
        {showComments ? <GiscusThread key={document.href} threadKey={document.href} /> : null}
      </section>

      <ArticleTocSidebar headings={headings} extra={aside} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isGoatCounterReady, setIsGoatCounterReady] = useState(
    () => typeof window !== 'undefined' && typeof (window as { goatcounter?: { count?: unknown } }).goatcounter?.count === 'function',
  );
  const goatCounterTrackedPathRef = useRef<string | null>(null);
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

    const counter = (window as { goatcounter?: { count?: (options?: { path?: string }) => void } }).goatcounter;
    if (typeof counter?.count !== 'function') {
      return;
    }

    counter.count({ path: nextPath });
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
    } else if (route.type === 'page') {
      const pageDocument = findPage(route.slug);
      nextTitle = pageDocument?.frontmatter.title?.trim() || blogTitle;
    } else if (route.type === 'not-found') {
      nextTitle = `404 | ${blogTitle}`;
    }

    document.title = nextTitle;
  }, [route]);

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = resolveDefaultPath(stripBasePath(window.location.pathname));
      if (toBrowserPath(nextPath) !== normalizePathname(window.location.pathname)) {
        window.history.replaceState({}, '', toBrowserPath(nextPath));
      }
      setPathname(nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (href: string) => {
    const nextPath = resolveDefaultPath(stripBasePath(href));
    if (nextPath === pathname) {
      return;
    }

    window.history.pushState({}, '', toBrowserPath(nextPath));
    setPathname(nextPath);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  let page: ReactNode;

  if (route.type === 'home') {
    page = <HomePage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />;
  } else if (route.type === 'archive') {
    page = <ArchivePage navigate={navigate} query={searchQuery} setQuery={setSearchQuery} />;
  } else if (route.type === 'notes-list') {
    page = (
      <CollectionPage
        documents={contentIndex.notes}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
      />
    );
  } else if (route.type === 'inknote-list') {
    page = (
      <CollectionPage
        documents={contentIndex.inknotes}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
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
    page = note ? (
      <DetailPage
        eyebrow="InkNote"
        document={note}
        meta={[
          { type: 'date', label: note.frontmatter.date },
          { type: 'tag', label: note.frontmatter.paperStyle },
          { type: 'tag', label: note.frontmatter.handwritingStyle },
        ]}
        aside={<InkNoteAside note={note} />}
        showComments
      />
    ) : (
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
