import type {
  ContentDocument,
  ContentFrontmatter,
  ContentType,
  CategorySlug,
  InkNoteFrontmatter,
  MarkdownFrontmatter,
} from '@inknote/content-schema';
import { parseMarkdownDocument } from '@inknote/site-builder';

export interface ContentLibraryItem<T extends ContentFrontmatter = ContentFrontmatter> extends ContentDocument<T> {
  relativePath: string;
  folderName: string;
}

export interface ContentDraft {
  type: ContentType;
  relativePath: string | null;
  sourceRelativePath: string | null;
  title: string;
  slug: string;
  order: number | null;
  date: string;
  updatedAt: string;
  summary: string;
  cover: string;
  tagsText: string;
  published: boolean;
  category: CategorySlug;
  permalink: string;
  readingTime: string;
  paperStyle: string;
  handwritingStyle: string;
  projectFile: string;
  previewImage: string;
  pdfFile: string;
  body: string;
  savedSnapshot: string;
}

export const CONTENT_TYPE_ORDER: ContentType[] = ['markdown', 'inknote'];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  markdown: 'Markdown',
  inknote: 'InkNotes',
};

export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentType, string> = {
  markdown: 'Markdown notes, project writeups, and static pages.',
  inknote: 'Blog entries linked to notebook.inknote.json projects.',
};

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function toBooleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toOrderValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

function normalizeInlineList(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((item) => toStringValue(item))
        .filter(Boolean)
        .join(', ')
    : '';
}

function splitInlineList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushScalar(lines: string[], key: string, value: string | number | boolean | undefined | null) {
  if (typeof value === 'boolean') {
    lines.push(`${key}: ${value ? 'true' : 'false'}`);
    return;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    lines.push(`${key}: ${value}`);
    return;
  }

  if (!value) {
    return;
  }

  lines.push(`${key}: ${value}`);
}

function pushList(lines: string[], key: string, values: string[]) {
  if (values.length === 0) {
    return;
  }

  lines.push(`${key}:`);
  for (const value of values) {
    lines.push(`  - ${value}`);
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildSnapshot(frontmatterLines: string[], body: string): string {
  const trimmedBody = body.trim();
  return ['---', ...frontmatterLines, '---', '', trimmedBody].join('\n').trimEnd() + '\n';
}

function isSafeRelativeContentPath(value: string): boolean {
  const normalized = normalizeRelativePath(value).trim();
  if (!normalized || normalized.startsWith('/')) {
    return false;
  }

  return normalized.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function toContentLibraryItem(relativePath: string, raw: string): ContentLibraryItem | null {
  const document = parseMarkdownDocument(raw, relativePath);
  const type = document.frontmatter.type;
  if (type !== 'markdown' && type !== 'inknote') {
    return null;
  }

  const normalizedPath = normalizeRelativePath(relativePath);
  const segments = normalizedPath.split('/');

  return {
    ...document,
    relativePath: normalizedPath,
    folderName: segments.length >= 2 ? segments[1] : document.frontmatter.slug,
  };
}

export function createDraftFromItem(item: ContentLibraryItem): ContentDraft {
  const base = item.frontmatter;
  const draft: Omit<ContentDraft, 'savedSnapshot'> = {
    type: base.type,
    relativePath: item.relativePath,
    sourceRelativePath: item.relativePath,
    title: toStringValue(base.title) || 'Untitled',
    slug: toStringValue(base.slug) || item.folderName,
    order: toOrderValue(base.order),
    date: toStringValue(base.date) || new Date().toISOString().slice(0, 10),
    updatedAt: toStringValue(base.updatedAt),
    summary: toStringValue(base.summary),
    cover: toStringValue(base.cover),
    tagsText: normalizeInlineList(base.tags),
    published: toBooleanValue(base.published, true),
    category: toStringValue(base.category),
    permalink: '',
    readingTime: '',
    paperStyle: '',
    handwritingStyle: '',
    projectFile: '',
    previewImage: '',
    pdfFile: '',
    body: item.body,
  };

  if (base.type === 'markdown') {
    const frontmatter = base as MarkdownFrontmatter;
    draft.category = toStringValue(frontmatter.category || frontmatter.section);
    draft.permalink = toStringValue(frontmatter.permalink);
    draft.readingTime = toStringValue(frontmatter.readingTime);
  } else if (base.type === 'inknote') {
    const frontmatter = base as InkNoteFrontmatter;
    draft.category = toStringValue(frontmatter.category);
    draft.paperStyle = toStringValue(frontmatter.paperStyle);
    draft.handwritingStyle = toStringValue(frontmatter.handwritingStyle);
    draft.projectFile = toStringValue(frontmatter.projectFile);
    draft.previewImage = toStringValue(frontmatter.previewImage);
    draft.pdfFile = toStringValue(frontmatter.pdfFile);
  }

  return {
    ...draft,
    savedSnapshot: serializeContentDraft(draft),
  };
}

export function createEmptyDraft(type: ContentType): ContentDraft {
  const today = new Date().toISOString().slice(0, 10);

  return {
    type,
    relativePath: null,
    sourceRelativePath: null,
    title: `Untitled ${type}`,
    slug: type === 'markdown' ? 'new-markdown' : 'new-inknote',
    order: null,
    date: today,
    updatedAt: today,
    summary: '',
    cover: '',
    tagsText: '',
    published: false,
    category: '',
    permalink: '',
    readingTime: '',
    paperStyle: type === 'inknote' ? 'school' : '',
    handwritingStyle: type === 'inknote' ? 'classical' : '',
    projectFile: type === 'inknote' ? 'notebook.inknote.json' : '',
    previewImage: '',
    pdfFile: '',
    body: '',
    savedSnapshot: '',
  };
}

export function getDraftSavePath(draft: ContentDraft): string {
  if (draft.relativePath) {
    return draft.relativePath;
  }

  const folder = draft.type === 'markdown' ? 'markdown' : 'inknotes';
  return `${folder}/${draft.slug}/index.md`;
}

export function resolveSiblingContentPath(markdownPath: string, relativePath: string): string {
  const baseSegments = normalizeRelativePath(markdownPath).split('/');
  baseSegments.pop();

  const segments = [...baseSegments];
  for (const part of normalizeRelativePath(relativePath).split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      if (segments.length > 0) {
        segments.pop();
      }
      continue;
    }

    segments.push(part);
  }

  return segments.join('/');
}

export function serializeContentDraft(draft: Omit<ContentDraft, 'savedSnapshot'> | ContentDraft): string {
  const lines: string[] = [];

  pushScalar(lines, 'type', draft.type);
  pushScalar(lines, 'title', draft.title);
  pushScalar(lines, 'slug', draft.slug);
  pushScalar(lines, 'order', draft.order);
  pushScalar(lines, 'date', draft.date);
  pushScalar(lines, 'updatedAt', draft.updatedAt);
  pushScalar(lines, 'summary', draft.summary);
  pushScalar(lines, 'cover', draft.cover);
  pushList(lines, 'tags', splitInlineList(draft.tagsText));
  pushScalar(lines, 'published', draft.published);

  if (draft.type === 'markdown') {
    pushScalar(lines, 'category', draft.category);
    pushScalar(lines, 'permalink', draft.permalink);
    pushScalar(lines, 'readingTime', draft.readingTime);
  }

  if (draft.type === 'inknote') {
    pushScalar(lines, 'category', draft.category);
    pushScalar(lines, 'paperStyle', draft.paperStyle);
    pushScalar(lines, 'handwritingStyle', draft.handwritingStyle);
    pushScalar(lines, 'projectFile', draft.projectFile);
    pushScalar(lines, 'previewImage', draft.previewImage);
    pushScalar(lines, 'pdfFile', draft.pdfFile);
  }

  return buildSnapshot(lines, draft.body);
}

export function patchDraft(draft: ContentDraft, patch: Partial<ContentDraft>): ContentDraft {
  return {
    ...draft,
    ...patch,
  };
}

export function isDraftDirty(draft: ContentDraft): boolean {
  return serializeContentDraft(draft) !== draft.savedSnapshot;
}

export function getDraftValidationError(draft: ContentDraft): string | null {
  if (!draft.title.trim()) {
    return 'Title is required.';
  }

  if (!draft.slug.trim()) {
    return 'Slug is required.';
  }

  if (!draft.date.trim()) {
    return 'Date is required.';
  }

  if (draft.type === 'markdown' && !draft.permalink.trim() && !draft.category.trim()) {
    return 'Markdown notes must choose a category unless they use a permalink page.';
  }

  if (draft.type === 'inknote') {
    if (!draft.category.trim()) {
      return 'InkNote entries must choose a category.';
    }

    if (!draft.projectFile.trim()) {
      return 'InkNote entries must point to a project file.';
    }

    if (!isSafeRelativeContentPath(draft.projectFile)) {
      return 'projectFile must stay inside the entry folder and use a relative path.';
    }
  }

  return null;
}
