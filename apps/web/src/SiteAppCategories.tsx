import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type {
  ContentFrontmatter,
  InkNoteFrontmatter,
  MarkdownFrontmatter,
  NavigationItem,
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
  summary: string;
  excerpt: string[];
  tags: string[];
};

const CATEGORY_ACCENTS = ['orange', 'blue', 'green', 'amber', 'slate'] as const;

const VISIBLE_MARKDOWN = contentIndex.notes.filter((note) => note.frontmatter.published);
const VISIBLE_INKNOTES = contentIndex.inknotes.filter((note) => note.frontmatter.published);

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}

function getInitialPathname(): string {
  const search = new URLSearchParams(window.location.search);
  const redirected = search.get('p');
  if (redirected) {
    const nextPath = normalizePathname(redirected);
    window.history.replaceState({}, '', nextPath);
    return nextPath;
  }

  return normalizePathname(window.location.pathname);
}

function matchRoute(pathname: string): Route {
  const normalized = normalizePathname(pathname);

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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toExcerptParagraphs(body: string, limit = 2): string[] {
  return stripMarkdown(body)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function toDateBadge(date: string): { day: string; month: string } {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      day: date.slice(-2) || '--',
      month: 'Date',
    };
  }

  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    month: parsed.toLocaleString('en-US', { month: 'short' }),
  };
}

function formatTags(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? tags.join(' / ') : 'untagged';
}

function getPrimaryNavigationLabel(item: NavigationItem): string {
  if (item.href === '/') {
    return '首页';
  }

  if (item.href === '/notes') {
    return 'Markdown';
  }

  if (item.href === '/projects') {
    return 'Markdown';
  }

  if (item.href === '/inknote') {
    return 'InkNote';
  }

  if (item.href === '/about') {
    return '关于';
  }

  return item.label;
}

function toPortalEntry(document: RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>): PortalEntry {
  const categorySlug = getDocumentCategorySlugForRoute(document.frontmatter);
  const excerpt = toExcerptParagraphs(document.body);

  return {
    id: document.id,
    href: document.href,
    title: document.frontmatter.title,
    date: document.frontmatter.date,
    categoryLabel: getDocumentCategoryLabel(document.frontmatter),
    typeLabel: document.frontmatter.type === 'inknote' ? 'InkNote' : 'Markdown',
    accentClass: categorySlug ? getCategoryAccentBySlug(categorySlug) : getAccentClass(0),
    summary: document.frontmatter.summary?.trim() || excerpt[0] || 'This entry is still being polished.',
    excerpt: excerpt.length > 0 ? excerpt : ['This entry is still being polished.'],
    tags: document.frontmatter.tags ?? [],
  };
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
    .slice(0, 18);
}

function handleInternalLink(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  navigate: (href: string) => void,
) {
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
    <a className={className} href={href} onClick={(event) => handleInternalLink(event, href, navigate)}>
      {children}
    </a>
  );
}

function CategoryBar({ route, navigate }: { route: Route; navigate: (href: string) => void }) {
  const activeCategory = getRouteCategorySlug(route);

  return (
    <nav className="portal-category-bar" aria-label="Blog categories">
      {contentIndex.categories.map((category, index) => {
        const documents = getCategoryDocuments(category.slug).filter((document) => document.frontmatter.published);
        const accentClass = getAccentClass(index);
        const isActive = activeCategory === category.slug;

        return (
          <SiteLink
            key={category.slug}
            href={`/category/${category.slug}`}
            navigate={navigate}
            className={isActive ? `portal-category-link ${accentClass} active` : `portal-category-link ${accentClass}`}
          >
            <span className="portal-category-title">{category.label}</span>
            <span className="portal-category-subtitle">{category.labelEn?.trim() || category.slug}</span>
            <span className="portal-category-count">{documents.length}</span>
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
  const utilityItems = contentIndex.navigation.map((item) => ({
    ...item,
    displayLabel: getPrimaryNavigationLabel(item),
  }));

  return (
    <div className="site-shell">
      <header className="portal-utility-bar">
        <p className="portal-utility-copy">{contentIndex.siteConfig.tagline}</p>
        <nav className="portal-utility-nav">
          {utilityItems.map((item) => (
            <SiteLink key={item.href} href={item.href} navigate={navigate} className="portal-utility-link">
              {item.displayLabel}
            </SiteLink>
          ))}
        </nav>
      </header>

      <section className="portal-masthead">
        <div className="portal-brand-panel">
          <SiteLink href="/" navigate={navigate} className="portal-brand-link">
            <span className="portal-brand-mark" aria-hidden="true">
              IN
            </span>
            <div>
              <h1>{contentIndex.siteConfig.title}</h1>
              <p>{contentIndex.siteConfig.hero.eyebrow}</p>
            </div>
          </SiteLink>
        </div>

        <div className="portal-feature-panel">
          {contentIndex.siteConfig.channels.map((channel) => (
            <SiteLink key={channel.href} href={channel.href} navigate={navigate} className="portal-feature-link">
              <span className="portal-feature-icon" aria-hidden="true">
                {channel.label.slice(0, 1)}
              </span>
              <span className="portal-feature-text">
                <strong>{channel.label}</strong>
                <em>{channel.description}</em>
              </span>
            </SiteLink>
          ))}
        </div>

        <aside className="portal-notice-panel">
          <h2>欢迎来到内容库</h2>
          <p>{contentIndex.siteConfig.description}</p>
          <SiteLink href="/about" navigate={navigate} className="portal-notice-link">
            了解这个站点
          </SiteLink>
        </aside>
      </section>

      <CategoryBar route={route} navigate={navigate} />

      <main className="page">{children}</main>
    </div>
  );
}

function PortalArticleCard({
  entry,
  navigate,
}: {
  entry: PortalEntry;
  navigate: (href: string) => void;
}) {
  const badge = toDateBadge(entry.date);

  return (
    <article className="portal-article-card">
      <div className="portal-article-top">
        <div className={`portal-date-badge ${entry.accentClass}`}>
          <strong>{badge.day}</strong>
          <span>{badge.month}</span>
        </div>

        <header className="portal-article-header">
          <p className="portal-article-meta">
            <span>{entry.categoryLabel}</span>
            <span>{entry.typeLabel}</span>
            <span>{entry.date}</span>
          </p>
          <SiteLink href={entry.href} navigate={navigate} className="portal-article-title-link">
            <h3>{entry.title}</h3>
          </SiteLink>
          <p className="portal-article-summary">{entry.summary}</p>
        </header>
      </div>

      <div className="portal-article-excerpt">
        {entry.excerpt.map((paragraph, index) => (
          <p key={`${entry.id}-${index}`}>{paragraph}</p>
        ))}
      </div>

      <footer className="portal-article-footer">
        <p>
          <strong>Category:</strong>
          <span>{entry.categoryLabel}</span>
          {entry.tags.length > 0 ? (
            <>
              <strong> Tags:</strong>
              <span>{entry.tags.join(', ')}</span>
            </>
          ) : null}
        </p>
        <SiteLink href={entry.href} navigate={navigate} className="portal-read-more">
          Read more...
        </SiteLink>
      </footer>
    </article>
  );
}

function SidebarCard({
  title,
  tone,
  navigate,
  children,
}: {
  title: string;
  tone: 'cool' | 'warm' | 'fresh';
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  return (
    <section className={`portal-sidebar-card ${tone}`}>
      <div className="portal-sidebar-card-head">
        <h3>{title}</h3>
        <SiteLink href="/" navigate={navigate}>
          Home
        </SiteLink>
      </div>
      {children}
    </section>
  );
}

function PortalCollectionList({
  documents,
  navigate,
}: {
  documents: Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>>;
  navigate: (href: string) => void;
}) {
  const entries = documents.map((document) => toPortalEntry(document));

  return (
    <div className="portal-feed">
      {entries.map((entry) => (
        <PortalArticleCard key={entry.id} entry={entry} navigate={navigate} />
      ))}
    </div>
  );
}

function HomePage({ navigate }: { navigate: (href: string) => void }) {
  const allEntries = useMemo(
    () =>
      [...VISIBLE_MARKDOWN, ...VISIBLE_INKNOTES]
        .sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date))
        .map((document) => toPortalEntry(document)),
    [],
  );
  const [query, setQuery] = useState('');

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return allEntries;
    }

    return allEntries.filter((entry) =>
      `${entry.title} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase().includes(normalized),
    );
  }, [allEntries, query]);

  const tagCloud = useMemo(() => buildTagCloud(allEntries), [allEntries]);
  const randomLinks = useMemo(
    () =>
      [...allEntries]
        .sort((left, right) => left.title.localeCompare(right.title))
        .slice(0, 6),
    [allEntries],
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <div className="portal-home">
      <section className="portal-feed">
        {filteredEntries.map((entry) => (
          <PortalArticleCard key={entry.id} entry={entry} navigate={navigate} />
        ))}

        {filteredEntries.length === 0 ? (
          <section className="portal-empty-state">
            <h3>No matching entries</h3>
            <p>Try another keyword or switch to a category from the bar above.</p>
          </section>
        ) : null}
      </section>

      <aside className="portal-sidebar">
        <SidebarCard title="About the site" tone="cool" navigate={navigate}>
          <div className="portal-author-card">
            <div className="portal-author-avatar" aria-hidden="true">
              <span>{contentIndex.siteConfig.author.slice(0, 1).toUpperCase() || 'I'}</span>
            </div>
            <p>
              <strong>{contentIndex.siteConfig.author}</strong> is using one shared repository for Markdown posts,
              InkNote projects, and the category structure managed from the desktop editor.
            </p>
          </div>
        </SidebarCard>

        <SidebarCard title="Quick search" tone="warm" navigate={navigate}>
          <form className="portal-search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, summary, or tags"
            />
            <button type="submit">Go</button>
          </form>
          <p className="portal-sidebar-copy">This search filters the current home feed instantly.</p>
        </SidebarCard>

        <SidebarCard title="Popular tags" tone="cool" navigate={navigate}>
          <div className="portal-tag-cloud">
            {tagCloud.map((tag) => (
              <span key={tag.tag} className="portal-tag-chip">
                {tag.tag}
              </span>
            ))}
          </div>
        </SidebarCard>

        <SidebarCard title="Random reads" tone="fresh" navigate={navigate}>
          <ul className="portal-article-list">
            {randomLinks.map((entry) => (
              <li key={entry.id}>
                <SiteLink href={entry.href} navigate={navigate}>
                  {entry.title}
                </SiteLink>
              </li>
            ))}
          </ul>
        </SidebarCard>
      </aside>
    </div>
  );
}

function CollectionPage<TFrontmatter extends ContentFrontmatter>({
  title,
  eyebrow,
  description,
  documents,
  metaFor,
  navigate,
}: {
  title: string;
  eyebrow: string;
  description: string;
  documents: RoutedDocument<TFrontmatter>[];
  metaFor: (document: RoutedDocument<TFrontmatter>) => string[];
  navigate: (href: string) => void;
}) {
  const visibleDocuments = documents.filter((document) => document.frontmatter.published);
  const tagCloud = buildTagCloud(
    visibleDocuments.map((document) => toPortalEntry(document as RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>)),
  );

  return (
    <section className="listing-page">
      <header className="portal-page-banner">
        <p className="portal-page-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>

      <div className="portal-home">
        <PortalCollectionList
          documents={visibleDocuments as Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>>}
          navigate={navigate}
        />

        <aside className="portal-sidebar">
          <SidebarCard title="Collection snapshot" tone="cool" navigate={navigate}>
            <p className="portal-sidebar-copy">
              {visibleDocuments.length} entries are currently published in this view.
            </p>
            <ul className="portal-meta-list">
              {visibleDocuments.slice(0, 4).map((document) => (
                <li key={document.id}>
                  <strong>{document.frontmatter.title}</strong>
                  <span>{metaFor(document).join(' / ')}</span>
                </li>
              ))}
            </ul>
          </SidebarCard>

          <SidebarCard title="Tag overview" tone="warm" navigate={navigate}>
            <div className="portal-tag-cloud">
              {tagCloud.map((tag) => (
                <span key={tag.tag} className="portal-tag-chip">
                  {tag.tag}
                </span>
              ))}
            </div>
          </SidebarCard>
        </aside>
      </div>
    </section>
  );
}

function DetailPage<TFrontmatter extends ContentFrontmatter>({
  eyebrow,
  backHref,
  backLabel,
  document,
  meta,
  navigate,
  aside,
}: {
  eyebrow: string;
  backHref: string;
  backLabel: string;
  document: RoutedDocument<TFrontmatter>;
  meta: string[];
  navigate: (href: string) => void;
  aside?: ReactNode;
}) {
  return (
    <article className="detail-page">
      <SiteLink className="portal-back-link" href={backHref} navigate={navigate}>
        Back to {backLabel}
      </SiteLink>

      <header className="portal-page-banner">
        <p className="portal-page-eyebrow">{eyebrow}</p>
        <h2>{document.frontmatter.title}</h2>
        <p className="portal-banner-meta">
          {meta.map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </p>
        {document.frontmatter.summary ? <p>{document.frontmatter.summary}</p> : null}
      </header>

      <div className="portal-detail-layout">
        <section className="markdown-body">{renderMarkdown(document.body)}</section>
        <aside className="portal-sidebar">
          {aside}

          <SidebarCard title="Reading note" tone="warm" navigate={navigate}>
            <p className="portal-sidebar-copy">
              This page is generated from the shared <code>content/</code> workspace, so the desktop editor and web
              site always stay in sync.
            </p>
          </SidebarCard>
        </aside>
      </div>
    </article>
  );
}

function InkNoteAside({ note }: { note: RoutedDocument<InkNoteFrontmatter> }) {
  return (
    <div className="portal-sidebar-card cool">
      <div className="portal-sidebar-card-head">
        <h3>InkNote Project</h3>
        <span>InkNote</span>
      </div>
      <dl className="portal-info-list">
        <div>
          <dt>Paper</dt>
          <dd>{note.frontmatter.paperStyle}</dd>
        </div>
        <div>
          <dt>Handwriting</dt>
          <dd>{note.frontmatter.handwritingStyle}</dd>
        </div>
        <div>
          <dt>Project File</dt>
          <dd>{note.frontmatter.projectFile}</dd>
        </div>
        {note.frontmatter.previewImage ? (
          <div>
            <dt>Preview Image</dt>
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
    </div>
  );
}

function NotFoundPage({ navigate }: { navigate: (href: string) => void }) {
  return (
    <section className="listing-page">
      <div className="portal-page-banner">
        <p className="portal-page-eyebrow">404</p>
        <h2>This page is not ready yet</h2>
        <p>The route exists, but there is no matching markdown or inknote entry for it yet.</p>
      </div>
      <SiteLink className="portal-standalone-button" href="/" navigate={navigate}>
        Return home
      </SiteLink>
    </section>
  );
}

export default function SiteAppCategories() {
  const [pathname, setPathname] = useState(() => getInitialPathname());
  const route = matchRoute(pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePathname(window.location.pathname));
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (href: string) => {
    const nextPath = normalizePathname(href);
    if (nextPath === pathname) {
      return;
    }

    window.history.pushState({}, '', nextPath);
    setPathname(nextPath);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  let page: ReactNode;

  if (route.type === 'home') {
    page = <HomePage navigate={navigate} />;
  } else if (route.type === 'notes-list') {
    page = (
      <CollectionPage
        title="Markdown Notes"
        eyebrow="Markdown collection"
        description="All published markdown posts managed from the desktop editor."
        documents={contentIndex.notes}
        metaFor={(note) => [note.frontmatter.date, note.frontmatter.readingTime ?? formatTags(note.frontmatter.tags)]}
        navigate={navigate}
      />
    );
  } else if (route.type === 'inknote-list') {
    page = (
      <CollectionPage
        title="InkNotes"
        eyebrow="InkNote collection"
        description="Published entries that stay linked to their notebook.inknote.json projects."
        documents={contentIndex.inknotes}
        metaFor={(note) => [note.frontmatter.date, note.frontmatter.paperStyle, note.frontmatter.handwritingStyle]}
        navigate={navigate}
      />
    );
  } else if (route.type === 'category') {
    const category = findCategory(route.slug);
    const documents = getCategoryDocuments(route.slug);
    page = category ? (
      <CollectionPage
        title={category.label}
        eyebrow={`Category / ${category.slug}`}
        description="This category is managed from the desktop editor and mapped directly to the web top bar."
        documents={documents}
        metaFor={(document) =>
          document.frontmatter.type === 'inknote'
            ? [document.frontmatter.date, 'InkNote']
            : [document.frontmatter.date, document.frontmatter.readingTime ?? 'Markdown']
        }
        navigate={navigate}
      />
    ) : (
      <NotFoundPage navigate={navigate} />
    );
  } else if (route.type === 'notes-detail') {
    const note = findMarkdownNote(route.slug);
    page = note ? (
      <DetailPage
        eyebrow="Markdown note"
        backHref={getDocumentCategorySlugForRoute(note.frontmatter) ? `/category/${getDocumentCategorySlugForRoute(note.frontmatter)}` : '/notes'}
        backLabel={getDocumentCategoryLabel(note.frontmatter)}
        document={note}
        meta={[note.frontmatter.date, getDocumentCategoryLabel(note.frontmatter), note.frontmatter.readingTime ?? formatTags(note.frontmatter.tags)]}
        navigate={navigate}
      />
    ) : (
      <NotFoundPage navigate={navigate} />
    );
  } else if (route.type === 'inknote-detail') {
    const note = findInkNote(route.slug);
    page = note ? (
      <DetailPage
        eyebrow="InkNote"
        backHref={getDocumentCategorySlugForRoute(note.frontmatter) ? `/category/${getDocumentCategorySlugForRoute(note.frontmatter)}` : '/inknote'}
        backLabel={getDocumentCategoryLabel(note.frontmatter)}
        document={note}
        meta={[note.frontmatter.date, getDocumentCategoryLabel(note.frontmatter), note.frontmatter.paperStyle, note.frontmatter.handwritingStyle]}
        navigate={navigate}
        aside={<InkNoteAside note={note} />}
      />
    ) : (
      <NotFoundPage navigate={navigate} />
    );
  } else if (route.type === 'page') {
    const pageDocument = findPage(route.slug);
    page = pageDocument ? (
      <DetailPage
        eyebrow="Page"
        backHref="/"
        backLabel="Home"
        document={pageDocument}
        meta={[pageDocument.frontmatter.date]}
        navigate={navigate}
      />
    ) : (
      <NotFoundPage navigate={navigate} />
    );
  } else {
    page = <NotFoundPage navigate={navigate} />;
  }

  return <Shell route={route} navigate={navigate}>{page}</Shell>;
}
