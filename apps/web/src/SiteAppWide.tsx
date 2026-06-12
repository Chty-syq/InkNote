import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { ContentFrontmatter, InkNoteFrontmatter, MarkdownFrontmatter } from '@inknote/content-schema';
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
import { renderMarkdown } from './lib/markdown';

type Route =
  | { type: 'home' }
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
            <span className="blog-category-pill-subtitle">{toCategorySubtitle(category.slug)}</span>
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
                className="blog-tag-chip"
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
          {FRIEND_LINKS.map((link) => (
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

function ArticleCard({ entry, navigate }: { entry: PortalEntry; navigate: (href: string) => void }) {
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
          <span className="blog-card-meta-item">
            <span className="blog-card-meta-icon folder" aria-hidden="true" />
            <span>{entry.categoryLabel}</span>
          </span>
          <span className={`blog-card-badge ${entry.accentClass}`}>{entry.typeLabel}</span>
          {entry.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="blog-card-tag">
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
        <ArticleCard key={entry.id} entry={entry} navigate={navigate} />
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
  navigate,
  query,
  setQuery,
  aside,
}: {
  eyebrow: string;
  document: RoutedDocument<TFrontmatter>;
  meta: string[];
  navigate: (href: string) => void;
  query: string;
  setQuery: (value: string) => void;
  aside?: ReactNode;
}) {
  return (
    <div className="blog-layout detail">
      <section className="blog-main-column">
        <section className="blog-panel detail-header">
          <p className="blog-panel-eyebrow">{eyebrow}</p>
          <div className="blog-panel-head single">
            <div>
              <h2>{document.frontmatter.title}</h2>
              <div className="blog-detail-meta">
                {meta.map((item, index) => (
                  <span key={`${item}-${index}`}>{item}</span>
                ))}
              </div>
              {document.frontmatter.summary ? <p>{document.frontmatter.summary}</p> : null}
            </div>
          </div>
        </section>

        <article className="markdown-body">{renderMarkdown(document.body)}</article>
      </section>

      <SiteSidebar navigate={navigate} query={query} setQuery={setQuery} extra={aside} />
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
  const route = matchRoute(pathname);

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
          note.frontmatter.date,
          normalizeLabel(getDocumentCategoryLabel(note.frontmatter)),
          note.frontmatter.readingTime ?? formatTags(note.frontmatter.tags),
        ]}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
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
          note.frontmatter.date,
          normalizeLabel(getDocumentCategoryLabel(note.frontmatter)),
          note.frontmatter.paperStyle,
          note.frontmatter.handwritingStyle,
        ]}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
        aside={<InkNoteAside note={note} />}
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
        meta={[pageDocument.frontmatter.date]}
        navigate={navigate}
        query={searchQuery}
        setQuery={setSearchQuery}
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
