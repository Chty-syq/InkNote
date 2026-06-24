import type {
  ContentCategory,
  ContentDocument,
  ContentFrontmatter,
  InkNoteFrontmatter,
  MarkdownFrontmatter,
  NavigationItem,
  SiteConfig,
} from '@inknote/content-schema';
import {
  parseMarkdownDocument,
  sortDocumentsByDate,
  sortDocumentsByOrderAndDate,
} from '@inknote/site-builder';
import categoriesData from '../../../../content/site/categories.json';
import navigationData from '../../../../content/site/navigation.json';
import siteConfigData from '../../../../content/site/site.config.json';

export interface RoutedDocument<TFrontmatter extends ContentFrontmatter> extends ContentDocument<TFrontmatter> {
  href: string;
}

export interface ContentIndex {
  navigation: NavigationItem[];
  siteConfig: SiteConfig;
  categories: ContentCategory[];
  markdown: RoutedDocument<MarkdownFrontmatter>[];
  notes: RoutedDocument<MarkdownFrontmatter>[];
  pages: RoutedDocument<MarkdownFrontmatter>[];
  inknotes: RoutedDocument<InkNoteFrontmatter>[];
  categoryDocuments: Record<string, Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>>>;
}

export interface RuntimeContentPayload {
  navigation: NavigationItem[];
  siteConfig: SiteConfig;
  categories: ContentCategory[];
  markdown: Record<string, string>;
  inknotes: Record<string, string>;
}

const markdownModules = import.meta.glob('../../../../content/markdown/*/index.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const inknoteModules = import.meta.glob('../../../../content/inknotes/*/index.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

function slugifyCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanizeCategorySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function isMarkdownPage(frontmatter: MarkdownFrontmatter): boolean {
  return Boolean(frontmatter.permalink?.trim());
}

function getDocumentCategorySlug(frontmatter: ContentFrontmatter): string {
  if (typeof frontmatter.category === 'string' && frontmatter.category.trim()) {
    return frontmatter.category.trim();
  }

  if (frontmatter.type === 'markdown' && typeof frontmatter.section === 'string' && frontmatter.section.trim()) {
    return slugifyCategoryLabel(frontmatter.section);
  }

  return '';
}

function toMarkdownHref(frontmatter: MarkdownFrontmatter): string {
  const permalink = frontmatter.permalink?.trim();
  if (permalink) {
    return permalink.startsWith('/') ? permalink : `/${permalink}`;
  }

  return `/notes/${frontmatter.slug}`;
}

function parseMarkdownCollection(modules: Record<string, string>): RoutedDocument<MarkdownFrontmatter>[] {
  const documents = Object.entries(modules).map(([id, raw]) => {
    const document = parseMarkdownDocument<MarkdownFrontmatter>(raw, id);

    if (document.frontmatter.type !== 'markdown') {
      throw new Error(`Expected markdown content in ${id}, got ${document.frontmatter.type}`);
    }

    return {
      ...document,
      href: toMarkdownHref(document.frontmatter),
    };
  });

  return sortDocumentsByDate(documents);
}

function parseInkNoteCollection(modules: Record<string, string>): RoutedDocument<InkNoteFrontmatter>[] {
  const documents = Object.entries(modules).map(([id, raw]) => {
    const document = parseMarkdownDocument<InkNoteFrontmatter>(raw, id);

    if (document.frontmatter.type !== 'inknote') {
      throw new Error(`Expected inknote content in ${id}, got ${document.frontmatter.type}`);
    }

    return {
      ...document,
      href: `/inknote/${document.frontmatter.slug}`,
    };
  });

  return sortDocumentsByDate(documents);
}

function buildContentIndex(payload: RuntimeContentPayload): ContentIndex {
  const markdown = parseMarkdownCollection(payload.markdown);
  const notes = markdown.filter((document) => !isMarkdownPage(document.frontmatter));
  const pages = markdown.filter((document) => isMarkdownPage(document.frontmatter));
  const inknotes = parseInkNoteCollection(payload.inknotes);
  const configuredCategories = payload.categories
    .filter((category) => category.slug && category.label)
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER));
  const inferredCategories = [
    ...new Set(
      [...notes, ...inknotes]
        .map((document) => getDocumentCategorySlug(document.frontmatter))
        .filter(Boolean),
    ),
  ]
    .filter((slug) => !configuredCategories.some((category) => category.slug === slug))
    .map((slug, index) => ({
      slug,
      label: humanizeCategorySlug(slug),
      order: configuredCategories.length + index + 1,
    }));
  const categories = [...configuredCategories, ...inferredCategories];
  const categoryDocuments = Object.fromEntries(
    categories.map((category) => [
      category.slug,
      sortDocumentsByOrderAndDate(
        [...notes, ...inknotes].filter(
          (document) => getDocumentCategorySlug(document.frontmatter) === category.slug,
        ),
      ) as Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>>,
    ]),
  ) as Record<string, Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>>>;

  return {
    navigation: payload.navigation,
    siteConfig: payload.siteConfig,
    categories,
    markdown,
    notes,
    pages,
    inknotes,
    categoryDocuments,
  };
}

export let contentIndex: ContentIndex = buildContentIndex({
  navigation: navigationData as NavigationItem[],
  siteConfig: siteConfigData as SiteConfig,
  categories: categoriesData as ContentCategory[],
  markdown: markdownModules,
  inknotes: inknoteModules,
});

export async function initializeRuntimeContent(): Promise<void> {
  if (import.meta.env.DEV) {
    return;
  }

  const manifestUrl = new URL('inknote-content.json', document.baseURI);
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load runtime content: ${response.status}`);
  }

  const payload = (await response.json()) as RuntimeContentPayload;
  contentIndex = buildContentIndex(payload);
}

export function getCategoryDocuments(slug: string): Array<RoutedDocument<MarkdownFrontmatter | InkNoteFrontmatter>> {
  return contentIndex.categoryDocuments[slug] ?? [];
}

export function findCategory(slug: string): ContentCategory | null {
  return contentIndex.categories.find((category) => category.slug === slug) ?? null;
}

export function findMarkdownNote(slug: string): RoutedDocument<MarkdownFrontmatter> | null {
  return contentIndex.notes.find((note) => note.frontmatter.slug === slug) ?? null;
}

export function findPage(slug: string): RoutedDocument<MarkdownFrontmatter> | null {
  return contentIndex.pages.find((page) => page.frontmatter.slug === slug) ?? null;
}

export function findInkNote(slug: string): RoutedDocument<InkNoteFrontmatter> | null {
  return contentIndex.inknotes.find((note) => note.frontmatter.slug === slug) ?? null;
}

export function getDocumentCategoryLabel(frontmatter: ContentFrontmatter): string {
  const slug = getDocumentCategorySlug(frontmatter);
  if (!slug) {
    return frontmatter.type === 'inknote' ? 'InkNote' : 'Markdown';
  }

  return findCategory(slug)?.label ?? humanizeCategorySlug(slug);
}

export function getDocumentCategorySlugForRoute(frontmatter: ContentFrontmatter): string {
  return getDocumentCategorySlug(frontmatter);
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
