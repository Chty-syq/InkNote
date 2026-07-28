import {
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconAlignCenter,
  IconBlockquote,
  IconBold,
  IconBook2,
  IconBrandGithub,
  IconCheck,
  IconCircleCheck,
  IconCode,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconGripVertical,
  IconHistory,
  IconInfoCircle,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconLoader2,
  IconPencil,
  IconPhoto,
  IconPresentation,
  IconPlus,
  IconRefresh,
  IconRocket,
  IconSettings,
  IconTrash,
  IconUpload,
  IconWriting,
  IconX,
} from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { Update } from '@tauri-apps/plugin-updater';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import desktopPackage from '../package.json';
import desktopIconUrl from '../src-tauri/icons/icon.png';
import {
  createDefaultProject,
  deserializeProject,
  HANDWRITING_OPTIONS,
  PAPER_OPTIONS,
  randomSeed,
  serializeProject,
  type ProjectData,
} from '@inknote/inknote-core';
import {
  getFrontmatterOrderValue,
  sortDocumentsByOrderAndDate,
} from '@inknote/site-builder';
import type {
  CardImageConfig,
  ContentCategory,
  FriendLinkConfig,
  GoatCounterConfig,
  GiscusConfig,
  RepositoryConfig,
  SiteConfig,
} from '@inknote/content-schema';
import {
  createDraftFromItem,
  createEmptyDraft,
  getDraftSavePath,
  getDraftValidationError,
  isDraftDirty,
  patchDraft,
  resolveSiblingContentPath,
  serializeContentDraft,
  toContentLibraryItem,
  type ContentDraft,
  type ContentLibraryItem,
} from './lib/content-drafts';
import { InkNoteProjectPreviewPanel } from './InkNoteLinkedProjectPanel';
import {
  CATEGORY_CONFIG_PATH,
  ensureUniqueCategorySlug,
  normalizeCategoryOrder,
  parseCategoryConfig,
  serializeCategoryConfig,
  slugifyCategoryLabel,
} from './lib/category-config';
import { MarkdownPreview } from './lib/markdown-preview';
import {
  chooseFileToSave,
  chooseGalleryImageFiles,
  chooseSlidesFile,
  cacheExternalImage,
  clearLocalContentWorkspace,
  compressGalleryImageFile,
  copyFileToPath,
  deleteContentFile,
  deleteGalleryImageFile,
  downloadAndRunDesktopInstaller,
  ensureBlogPreviewServer,
  ensureExtension,
  fetchFriendLinkIcon,
  getContentIndex,
  getDesktopAppVersion,
  getPublishStatus,
  isTauri,
  listenToContentSyncProgress,
  listenToContentSyncPreview,
  listenToDesktopUpdateProgress,
  listenToPublishProgress,
  openExternalUrl,
  publishContentChanges,
  pullRemoteContent,
  readContentFile,
  readTextFile,
  resolveContentSyncPreview,
  syncContentChanges,
  writeBinaryFile,
  writeContentFile,
  writeTextFile,
  type PublishProgressEvent,
  type PublishStatusResponse,
  type ContentSyncArticleChange,
  type ContentSyncPreviewEvent,
} from './lib/platform';

type WorkspacePanel = 'write' | 'inknote';
type CategoryDialogState = { mode: 'create' } | { mode: 'edit'; slug: string };
type CategoryDeleteDialogState = { categorySlug: string; targetSlug: string };
type PullConflictStrategy = 'manual';
type ContentSyncConflictResolution = 'remote' | 'local';
type ContentSyncConflictResolutions = Record<string, ContentSyncConflictResolution>;
const DEFAULT_CONTENT_BRANCH = 'content';

interface ContentSyncConflictItem {
  path: string;
  kind: string;
  local: string;
  remote: string;
  localContent: string;
  remoteContent: string;
}

interface ContentSyncConflictDialogState {
  conflicts: ContentSyncConflictItem[];
  source: 'sync' | 'pull';
  resolutions: Partial<ContentSyncConflictResolutions>;
}

interface ContentSyncPreviewDialogState extends ContentSyncPreviewEvent {
  isSubmitting: boolean;
}

type ConflictDiffSide = 'local' | 'remote';
type ConflictDiffLineKind = 'same' | 'added' | 'removed' | 'changed' | 'empty';

interface ConflictDiffLine {
  kind: ConflictDiffLineKind;
  lineNumber: number | null;
  text: string;
  segments?: ConflictDiffSegment[];
}

interface ConflictDiffPair {
  local: ConflictDiffLine[];
  remote: ConflictDiffLine[];
}

interface ConflictDiffSegment {
  text: string;
  changed: boolean;
}

interface ContentSyncRiskReport {
  code: string;
  title: string;
  detail: string;
}

interface TextTransformResult {
  nextValue: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

interface NoteHistoryEntry {
  id: number;
  label: string;
  detail: string;
  timestamp: string;
}

type PublishRunState = 'idle' | 'running' | 'success' | 'error';
type ToastTone = 'info' | 'success' | 'error';

interface PublishLogEntry extends PublishProgressEvent {
  id: number;
  receivedAt: string;
}

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  expiresAt: number;
}

interface EditorSelectionState {
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
}

interface PendingEditorViewRestore {
  selection: EditorSelectionState;
  scrollTop: number;
  scrollRatio: number;
  attempts: number;
}

interface DraftUndoEntry {
  draft: ContentDraft;
  selection: EditorSelectionState | null;
}

interface NotebookUndoEntry {
  project: ProjectData;
  selection: EditorSelectionState | null;
}

interface DraftAutoSaveMetadata {
  sourceRelativePath: string;
  title?: string;
  tagsText?: string;
}

function getWorkspacePanelForDraft(draft: Pick<ContentDraft, 'type'> | null): WorkspacePanel {
  return draft?.type === 'inknote' ? 'inknote' : 'write';
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const DRAFT_UNDO_LIMIT = 100;
const DRAFT_TITLE_AUTOSAVE_DELAY = 350;
const NOTE_HISTORY_LIMIT = 24;
const BRAND_AVATAR_STORAGE_KEY = 'inknote.desktop.brandAvatar';
const SSH_KEY_PATH_STORAGE_KEY = 'inknote.desktop.sshKeyPath';
const SITE_CONFIG_PATH = 'site/site.config.json';
const LOCAL_BLOG_PREVIEW_PORT = import.meta.env.DEV ? 4322 : 4321;
const LOCAL_BLOG_PREVIEW_ORIGIN = `http://localhost:${LOCAL_BLOG_PREVIEW_PORT}`;
const DESKTOP_FALLBACK_VERSION = desktopPackage.version || '0.0.0';
const DESKTOP_RELEASE_REPOSITORY = 'Chty-syq/InkNote';
const DESKTOP_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${DESKTOP_RELEASE_REPOSITORY}/releases/latest`;
const DESKTOP_RELEASES_API_URL = `https://api.github.com/repos/${DESKTOP_RELEASE_REPOSITORY}/releases?per_page=1`;
const DESKTOP_TAGS_API_URL = `https://api.github.com/repos/${DESKTOP_RELEASE_REPOSITORY}/tags?per_page=1`;
const DESKTOP_REPOSITORY_URL = `https://github.com/${DESKTOP_RELEASE_REPOSITORY}`;
const DESKTOP_RELEASES_URL = `${DESKTOP_REPOSITORY_URL}/releases`;
const PASTED_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const PASTED_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const USER_GALLERY_MANIFEST_PUBLIC_PATH = '/card-images/gallery/manifest.json';
const USER_GALLERY_UPLOADS_PUBLIC_PREFIX = '/card-images/gallery/uploads/';
const LOCAL_PUBLIC_ASSET_PREFIXES = ['/content-images/', '/content-slides/', '/card-images/', '/generated/'];
const IMAGE_MANAGEMENT_PAGE_SIZE = 15;
const IMAGE_LOCALIZATION_CONCURRENCY = 4;
const GALLERY_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const SLIDES_FILE_EXTENSIONS = new Set(['pdf']);
const DEFAULT_SYNC_MESSAGE = 'Update blog content';
const TABLER_ICON_OVERRIDES = `
  .notes-settings-close::before,
  .notes-category-dialog-close::before,
  .notes-metadata-dialog-close::before,
  .notes-create-dialog-close::before { content: none; }
  .notes-settings-close svg,
  .notes-category-dialog-close svg,
  .notes-metadata-dialog-close svg,
  .notes-create-dialog-close svg { width: 16px; height: 16px; stroke-width: 1.9; }
  .notes-settings-category-create-plus svg,
  .notes-tag-picker-option-state svg { width: 15px; height: 15px; }
  .notes-editor-toolbar { padding-left: calc(0.75rem - 0.44rem); }
`;

type SettingsSection = 'basic' | 'images' | 'publish' | 'about';
type SettingsImageTab = 'references' | 'gallery';
type SiteIntegrationPanel = 'repository' | 'goatcounter' | 'giscus';
type SiteLinkDragKind = 'friend' | 'tool';

interface SiteLinkDragState {
  kind: SiteLinkDragKind;
  index: number;
}

type DesktopUpdateState =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'empty'
  | 'downloading'
  | 'installing'
  | 'error';

interface DesktopReleaseInfo {
  version: string;
  name: string;
  url: string;
  installerUrl?: string;
  publishedAt: string;
}

type ImageReferenceLocation = 'body' | 'cover' | 'previewImage';

interface ParsedImageReference {
  source: string;
  alt: string;
  start: number;
  end: number;
}

interface ManagedImageUsage {
  notePath: string;
  noteTitle: string;
  location: ImageReferenceLocation;
}

interface ManagedImageAsset {
  source: string;
  alt: string;
  kind: 'internal' | 'external';
  occurrences: number;
  usages: ManagedImageUsage[];
}

type ImageLocalizationStatus = 'processing' | 'success' | 'error';

interface GalleryImageFocus {
  x: number;
  y: number;
}

interface GalleryImageItem {
  id: string;
  path: string;
  name: string;
  size?: number;
  uploadedAt?: string;
  focus?: GalleryImageFocus;
}

interface GalleryImageManifest {
  updatedAt: string;
  count: number;
  images: GalleryImageItem[];
  assignments: Record<string, string>;
}

interface ImagePreviewState {
  src: string;
  title: string;
  galleryImageKey?: string;
  focus?: GalleryImageFocus;
}

interface GalleryDeleteDialogState {
  images: GalleryImageItem[];
  affectedCount: number;
  reassignedCount: number;
  unassignedCount: number;
}

interface GalleryDeletePlan {
  nextImages: GalleryImageItem[];
  nextAssignments: Record<string, string>;
  affectedArticleKeys: Set<string>;
  reassignedCount: number;
  unassignedCount: number;
}

interface ImagePageData<T> {
  items: T[];
  pageCount: number;
  safePage: number;
}

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

function paginateImageItems<T>(items: T[], page: number): ImagePageData<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / IMAGE_MANAGEMENT_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * IMAGE_MANAGEMENT_PAGE_SIZE;

  return {
    items: items.slice(start, start + IMAGE_MANAGEMENT_PAGE_SIZE),
    pageCount,
    safePage,
  };
}

function getPaginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < pageCount) {
      pages.add(page);
    }
  }
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= pageCount - 2) {
    pages.add(pageCount - 3);
    pages.add(pageCount - 2);
    pages.add(pageCount - 1);
  }

  const orderedPages = Array.from(pages).sort((left, right) => left - right);
  const items: PaginationItem[] = [];
  for (const page of orderedPages) {
    const previous = items[items.length - 1];
    if (typeof previous === 'number' && page - previous > 1) {
      items.push(previous === 1 ? 'ellipsis-start' : 'ellipsis-end');
    }
    items.push(page);
  }

  return items;
}

function waitForNextFrame(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
      }
    }),
  );
}

function padDatePart(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function createPastedImageFileName(date: Date, index: number, total: number, extension: string): string {
  const stamp = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    '-',
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
    '-',
    padDatePart(date.getMilliseconds(), 3),
  ].join('');
  const nonce = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  const sequence = total > 1 ? `-${padDatePart(index + 1)}` : '';
  return `image-${stamp}-${nonce}${sequence}.${extension}`;
}

function createAssetTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    '-',
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join('');
}

function getFileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop()?.trim() || 'slides';
}

function getSlidesFileExtension(path: string): string | null {
  const extension = getFileNameFromPath(path).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
  return SLIDES_FILE_EXTENSIONS.has(extension) ? extension : null;
}

function sanitizeAssetName(value: string): string {
  return value
    .replace(/\.[^.\\/]+$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createSlidesFileName(sourcePath: string, date: Date): string {
  const extension = getSlidesFileExtension(sourcePath) ?? 'pdf';
  const baseName = sanitizeAssetName(getFileNameFromPath(sourcePath)) || 'slides';
  const nonce = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `slides-${createAssetTimestamp(date)}-${nonce}-${baseName}.${extension}`;
}

function getPastedImageTargetPath(
  contentRoot: string,
  noteType: ContentDraft['type'],
  noteSlug: string,
  fileName: string,
): { filePath: string; publicPath: string } {
  const normalizedRoot = contentRoot.replace(/[\\/]+$/, '');
  const rootMatch = normalizedRoot.match(/^(.*)[\\/]content$/i);
  if (!rootMatch) {
    throw new Error('无法从内容仓路径定位项目目录。');
  }
  if (!/^[a-z0-9_-]+$/i.test(noteSlug)) {
    throw new Error('当前文章路由不适合用作图片目录。');
  }

  const separator = normalizedRoot.includes('\\') ? '\\' : '/';
  const collection = noteType === 'inknote' ? 'inknotes' : 'markdown';
  const relativeSegments = ['apps', 'web', 'public', 'content-images', collection, noteSlug, fileName];

  return {
    filePath: `${rootMatch[1]}${separator}${relativeSegments.join(separator)}`,
    publicPath: `/content-images/${collection}/${noteSlug}/${fileName}`,
  };
}

function getProjectRootFromContentRoot(contentRoot: string): { root: string; separator: string } {
  const normalizedRoot = contentRoot.replace(/[\\/]+$/, '');
  const rootMatch = normalizedRoot.match(/^(.*)[\\/]content$/i);
  if (!rootMatch) {
    throw new Error('Unable to locate project root from content directory.');
  }

  return {
    root: rootMatch[1],
    separator: normalizedRoot.includes('\\') ? '\\' : '/',
  };
}

function getProjectPath(contentRoot: string, segments: string[]): string {
  const { root, separator } = getProjectRootFromContentRoot(contentRoot);
  return `${root}${separator}${segments.join(separator)}`;
}

function getUserGalleryManifestPath(contentRoot: string): string {
  return getProjectPath(contentRoot, ['apps', 'web', 'public', 'card-images', 'gallery', 'manifest.json']);
}

function getUserGalleryUploadPath(contentRoot: string, fileName: string): string {
  return getProjectPath(contentRoot, ['apps', 'web', 'public', 'card-images', 'gallery', 'uploads', fileName]);
}

function getPublicAssetFilePath(contentRoot: string | null, publicPath: string): string | null {
  if (!contentRoot) {
    return null;
  }
  const normalized = publicPath.trim();
  if (
    !normalized.startsWith('/') ||
    normalized.includes('\\') ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    return null;
  }
  const allowed =
    LOCAL_PUBLIC_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    normalized === '/blog-avatar.jpg' ||
    normalized === '/blog-header-bg.png';
  if (!allowed) {
    return null;
  }

  return getProjectPath(contentRoot, ['apps', 'web', 'public', ...normalized.split('/').filter(Boolean)]);
}

function getDesktopPublicAssetSource(contentRoot: string | null, source: string, previewOrigin: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed) || /^(?:data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  const filePath = getPublicAssetFilePath(contentRoot, trimmed);
  if (filePath && isTauri()) {
    return `${previewOrigin}${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${previewOrigin}${trimmed}`;
  }
  return '';
}

function getImageFileExtension(path: string): string | null {
  const extension = getFileNameFromPath(path).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
  return GALLERY_IMAGE_EXTENSIONS.has(extension) ? extension : null;
}

function createGalleryImageFileName(sourcePath: string, date: Date, index: number): string {
  const baseName = sanitizeAssetName(getFileNameFromPath(sourcePath)) || 'image';
  const nonce = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  const stem = baseName.replace(/\.[a-z0-9]+$/i, '') || 'image';
  return `gallery-${createAssetTimestamp(date)}-${padDatePart(index + 1)}-${nonce}-${stem}.jpg`;
}

function clampImageFocusValue(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 50;
  return Math.min(100, Math.max(0, Math.round(numeric * 10) / 10));
}

function normalizeGalleryImageFocus(value: unknown): GalleryImageFocus {
  const input = value && typeof value === 'object' ? (value as Partial<GalleryImageFocus>) : {};
  return {
    x: clampImageFocusValue(input.x),
    y: clampImageFocusValue(input.y),
  };
}

function getGalleryImageFocus(image: GalleryImageItem): GalleryImageFocus {
  return normalizeGalleryImageFocus(image.focus);
}

function formatGalleryImagePosition(focus: GalleryImageFocus): string {
  const normalized = normalizeGalleryImageFocus(focus);
  return `${normalized.x}% ${normalized.y}%`;
}

function isSameGalleryImageFocus(left: GalleryImageFocus, right: GalleryImageFocus): boolean {
  const normalizedLeft = normalizeGalleryImageFocus(left);
  const normalizedRight = normalizeGalleryImageFocus(right);
  return normalizedLeft.x === normalizedRight.x && normalizedLeft.y === normalizedRight.y;
}

function normalizeGalleryAssignments(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, imageKey]) => [key.trim(), typeof imageKey === 'string' ? imageKey.trim() : ''] as const)
    .filter(([key, imageKey]) => key && imageKey);

  return Object.fromEntries(entries);
}

function normalizeGalleryManifest(value: unknown): GalleryImageManifest {
  const input = value && typeof value === 'object' ? (value as Partial<GalleryImageManifest>) : {};
  const images = Array.isArray(input.images)
    ? input.images
        .map<GalleryImageItem | null>((image) =>
          image && typeof image === 'object' && typeof image.path === 'string' && image.path.trim()
            ? {
                id:
                  typeof image.id === 'string' && image.id.trim()
                    ? image.id.trim()
                    : image.path.trim(),
                path: image.path.trim(),
                name:
                  typeof image.name === 'string' && image.name.trim()
                    ? image.name.trim()
                    : getFileNameFromPath(image.path),
                size: typeof image.size === 'number' ? image.size : undefined,
                uploadedAt: typeof image.uploadedAt === 'string' ? image.uploadedAt : '',
                focus: normalizeGalleryImageFocus((image as { focus?: unknown }).focus),
              }
            : null,
        )
        .filter((image): image is GalleryImageItem => Boolean(image))
    : [];

  return {
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    count: images.length,
    images,
    assignments: normalizeGalleryAssignments((input as { assignments?: unknown }).assignments),
  };
}

function getGalleryImagePreviewSource(path: string, contentRoot: string | null, previewOrigin: string): string {
  return getDesktopPublicAssetSource(contentRoot, path, previewOrigin);
}

function getGalleryImageKey(image: GalleryImageItem): string {
  return image.id || image.path;
}

function getArticleCardItems(items: ContentLibraryItem[]): ContentLibraryItem[] {
  return sortLibraryItems(
    items.filter((item) => {
      return !(
        item.frontmatter.type === 'markdown' &&
        typeof item.frontmatter.permalink === 'string' &&
        item.frontmatter.permalink.trim()
      );
    }),
  );
}

function getArticleCardAssignmentKey(item: ContentLibraryItem): string {
  return getPreviewPathFromItem(item) ?? item.relativePath;
}

function createSequentialGalleryAssignments(
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
): Record<string, string> {
  const entries = articleItems.slice(0, images.length);
  return Object.fromEntries(
    entries.map((item, index) => [getArticleCardAssignmentKey(item), getGalleryImageKey(images[index])]),
  );
}

function getGalleryAssignmentBaseline(
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
  assignments: Record<string, string>,
): Record<string, string> {
  return Object.keys(assignments).length > 0
    ? assignments
    : createSequentialGalleryAssignments(articleItems, images);
}

function includeArticleCardItem(
  articleItems: ContentLibraryItem[],
  item: ContentLibraryItem | null,
): ContentLibraryItem[] {
  if (!item) {
    return articleItems;
  }

  const itemKey = getArticleCardAssignmentKey(item);
  return articleItems.some((articleItem) => getArticleCardAssignmentKey(articleItem) === itemKey)
    ? articleItems
    : [...articleItems, item];
}

function getAssignedGalleryImageForArticle(
  item: ContentLibraryItem | null,
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
  assignments: Record<string, string>,
): GalleryImageItem | null {
  if (!item) {
    return null;
  }

  const normalizedAssignments = normalizeArticleGalleryAssignments(
    articleItems,
    images,
    getGalleryAssignmentBaseline(articleItems, images, assignments),
  );
  const imageKey = normalizedAssignments[getArticleCardAssignmentKey(item)];
  return images.find((image) => getGalleryImageKey(image) === imageKey) ?? null;
}

function areGalleryAssignmentsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function shuffleGalleryImages(images: GalleryImageItem[]): GalleryImageItem[] {
  const nextImages = [...images];
  for (let index = nextImages.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [nextImages[index], nextImages[targetIndex]] = [nextImages[targetIndex], nextImages[index]];
  }

  return nextImages;
}

function normalizeArticleGalleryAssignments(
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
  assignments: Record<string, string>,
): Record<string, string> {
  const articleKeys = new Set(articleItems.map(getArticleCardAssignmentKey));
  const imageKeys = new Set(images.map(getGalleryImageKey));
  const usedImageKeys = new Set<string>();
  const nextAssignments: Record<string, string> = {};

  for (const item of articleItems) {
    const articleKey = getArticleCardAssignmentKey(item);
    const imageKey = assignments[articleKey];
    if (!articleKeys.has(articleKey) || !imageKey || !imageKeys.has(imageKey) || usedImageKeys.has(imageKey)) {
      continue;
    }

    nextAssignments[articleKey] = imageKey;
    usedImageKeys.add(imageKey);
  }

  return nextAssignments;
}

function assignMissingGalleryCardImages(
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
  assignments: Record<string, string>,
  targetArticleKeys?: Set<string>,
): Record<string, string> {
  const nextAssignments = normalizeArticleGalleryAssignments(articleItems, images, assignments);
  const targetKeys = targetArticleKeys ?? new Set(articleItems.map(getArticleCardAssignmentKey));
  const usedImageKeys = new Set(Object.values(nextAssignments));
  const availableImages = shuffleGalleryImages(images).filter((image) => !usedImageKeys.has(getGalleryImageKey(image)));

  for (const item of articleItems) {
    const articleKey = getArticleCardAssignmentKey(item);
    if (!targetKeys.has(articleKey)) {
      continue;
    }

    if (nextAssignments[articleKey]) {
      continue;
    }

    const nextImage = availableImages.shift();
    if (!nextImage) {
      delete nextAssignments[articleKey];
      continue;
    }

    const imageKey = getGalleryImageKey(nextImage);
    nextAssignments[articleKey] = imageKey;
    usedImageKeys.add(imageKey);
  }

  return nextAssignments;
}

function createGalleryDeletePlan(
  articleItems: ContentLibraryItem[],
  images: GalleryImageItem[],
  assignments: Record<string, string>,
  selectedImages: GalleryImageItem[],
): GalleryDeletePlan {
  const selectedImageKeys = new Set(selectedImages.map(getGalleryImageKey));
  const baselineAssignments = getGalleryAssignmentBaseline(articleItems, images, assignments);
  const normalizedAssignments = normalizeArticleGalleryAssignments(
    articleItems,
    images,
    baselineAssignments,
  );
  const affectedArticleKeys = new Set(
    articleItems
      .map(getArticleCardAssignmentKey)
      .filter((articleKey) => selectedImageKeys.has(normalizedAssignments[articleKey] ?? '')),
  );
  const nextImages = images.filter((image) => !selectedImageKeys.has(getGalleryImageKey(image)));
  const keptAssignments = Object.fromEntries(
    Object.entries(normalizedAssignments).filter(
      ([articleKey, imageKey]) => !affectedArticleKeys.has(articleKey) && !selectedImageKeys.has(imageKey),
    ),
  );
  const nextAssignments = assignMissingGalleryCardImages(
    articleItems,
    nextImages,
    keptAssignments,
    affectedArticleKeys,
  );
  const reassignedCount = Array.from(affectedArticleKeys).filter((articleKey) => nextAssignments[articleKey]).length;

  return {
    nextImages,
    nextAssignments,
    affectedArticleKeys,
    reassignedCount,
    unassignedCount: affectedArticleKeys.size - reassignedCount,
  };
}

function getSlidesTargetPath(
  contentRoot: string,
  noteType: ContentDraft['type'],
  noteSlug: string,
  fileName: string,
): { filePath: string; publicPath: string } {
  const normalizedRoot = contentRoot.replace(/[\\/]+$/, '');
  const rootMatch = normalizedRoot.match(/^(.*)[\\/]content$/i);
  if (!rootMatch) {
    throw new Error('无法从内容仓路径定位项目目录。');
  }
  if (!/^[a-z0-9_-]+$/i.test(noteSlug)) {
    throw new Error('当前文章路由不适合作为 slides 目录。');
  }

  const separator = normalizedRoot.includes('\\') ? '\\' : '/';
  const collection = noteType === 'inknote' ? 'inknotes' : 'markdown';
  const relativeSegments = ['apps', 'web', 'public', 'content-slides', collection, noteSlug, fileName];

  return {
    filePath: `${rootMatch[1]}${separator}${relativeSegments.join(separator)}`,
    publicPath: `/content-slides/${collection}/${noteSlug}/${fileName}`,
  };
}

function normalizeDesktopVersion(version: string): string {
  return version.trim().replace(/^v/i, '') || '0.0.0';
}

function compareDesktopVersions(left: string, right: string): number {
  const leftParts = normalizeDesktopVersion(left).split(/[.-]/);
  const rightParts = normalizeDesktopVersion(right).split(/[.-]/);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.parseInt(leftParts[index] ?? '0', 10);
    const rightValue = Number.parseInt(rightParts[index] ?? '0', 10);
    const normalizedLeft = Number.isFinite(leftValue) ? leftValue : 0;
    const normalizedRight = Number.isFinite(rightValue) ? rightValue : 0;

    if (normalizedLeft > normalizedRight) return 1;
    if (normalizedLeft < normalizedRight) return -1;
  }

  return 0;
}

function formatDesktopReleaseDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

async function checkTauriDesktopUpdate(): Promise<Update | null> {
  const metadata = await invoke<{
    rid: number;
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
  } | null>('plugin:updater|check', { timeout: 30_000 });

  return metadata ? new Update({ ...metadata, available: true }) : null;
}

function resolveDesktopContentImages(markdown: string, contentRoot: string | null, previewOrigin: string): string {
  return markdown
    .replace(/(\]\(\s*)(\/(?:content-images|content-slides|card-images|generated)\/[^\s)\r\n]+)/g, (_match, prefix, source) => {
      const resolved = getDesktopPublicAssetSource(contentRoot, source, previewOrigin);
      return resolved ? `${prefix}${resolved}` : `${prefix}${source}`;
    })
    .replace(
      /(\b(?:src|original|href)\s*=\s*["'])(\/(?:content-images|content-slides|card-images|generated)\/[^"']+)/gi,
      (_match, prefix, source) => {
        const resolved = getDesktopPublicAssetSource(contentRoot, source, previewOrigin);
        return resolved ? `${prefix}${resolved}` : `${prefix}${source}`;
      },
    );
}

function parseImageReferences(markdown: string): ParsedImageReference[] {
  const references: ParsedImageReference[] = [];
  const markdownImagePattern = /!\[([^\]]*)\]\(\s*(?:<([^>\r\n]+)>|([^\s)\r\n]+))/g;
  const htmlImagePattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

  for (const match of markdown.matchAll(markdownImagePattern)) {
    const source = (match[2] || match[3] || '').trim();
    if (!source || match.index === undefined) {
      continue;
    }
    const sourceOffset = match[0].indexOf(source);
    references.push({
      source,
      alt: match[1].trim(),
      start: match.index + sourceOffset,
      end: match.index + sourceOffset + source.length,
    });
  }

  for (const match of markdown.matchAll(htmlImagePattern)) {
    const source = (match[1] || match[2] || match[3] || '').trim();
    if (!source || match.index === undefined) {
      continue;
    }
    const sourceOffset = match[0].indexOf(source);
    const altMatch = match[0].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    references.push({
      source,
      alt: (altMatch?.[1] || altMatch?.[2] || altMatch?.[3] || '').trim(),
      start: match.index + sourceOffset,
      end: match.index + sourceOffset + source.length,
    });
  }

  return references.sort((left, right) => left.start - right.start);
}

function replaceImageReferenceSources(markdown: string, replacements: Map<string, string>): string {
  const references = parseImageReferences(markdown)
    .filter((reference) => replacements.has(reference.source))
    .sort((left, right) => right.start - left.start);
  let nextMarkdown = markdown;

  for (const reference of references) {
    nextMarkdown = `${nextMarkdown.slice(0, reference.start)}${replacements.get(reference.source)}${nextMarkdown.slice(reference.end)}`;
  }

  return nextMarkdown;
}

function isExternalImageSource(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

function getManagedImagePreviewSource(source: string, contentRoot: string | null, previewOrigin: string): string {
  return getDesktopPublicAssetSource(contentRoot, source, previewOrigin);
}

function collectManagedImages(items: ContentLibraryItem[], draft: ContentDraft | null): ManagedImageAsset[] {
  const assets = new Map<string, ManagedImageAsset>();

  for (const item of items) {
    const itemDraft =
      draft?.sourceRelativePath === item.relativePath ? draft : createDraftFromItem(item);
    const usageBase = {
      notePath: item.relativePath,
      noteTitle: itemDraft.title,
    };
    const foundReferences: Array<{
      source: string;
      alt: string;
      location: ImageReferenceLocation;
    }> = [
      ...parseImageReferences(itemDraft.body).map((reference) => ({
        source: reference.source,
        alt: reference.alt,
        location: 'body' as const,
      })),
      ...(itemDraft.cover.trim()
        ? [{ source: itemDraft.cover.trim(), alt: '封面', location: 'cover' as const }]
        : []),
      ...(itemDraft.previewImage.trim()
        ? [{ source: itemDraft.previewImage.trim(), alt: '预览图', location: 'previewImage' as const }]
        : []),
    ];

    for (const reference of foundReferences) {
      const existing = assets.get(reference.source);
      const usage: ManagedImageUsage = { ...usageBase, location: reference.location };
      if (existing) {
        existing.occurrences += 1;
        if (
          !existing.usages.some(
            (current) => current.notePath === usage.notePath && current.location === usage.location,
          )
        ) {
          existing.usages.push(usage);
        }
        if (!existing.alt && reference.alt) {
          existing.alt = reference.alt;
        }
        continue;
      }

      assets.set(reference.source, {
        source: reference.source,
        alt: reference.alt,
        kind: isExternalImageSource(reference.source) ? 'external' : 'internal',
        occurrences: 1,
        usages: [usage],
      });
    }
  }

  return [...assets.values()].sort(
    (left, right) =>
      Number(right.kind === 'external') - Number(left.kind === 'external') ||
      left.source.localeCompare(right.source),
  );
}

function ManagedImageCard({
  asset,
  contentRoot,
  previewOrigin,
  localizationStatus,
  onPreview,
}: {
  asset: ManagedImageAsset;
  contentRoot: string | null;
  previewOrigin: string;
  localizationStatus?: ImageLocalizationStatus;
  onPreview?: (preview: ImagePreviewState) => void;
}) {
  const [failed, setFailed] = useState(false);
  const previewSource = getManagedImagePreviewSource(asset.source, contentRoot, previewOrigin);
  const title = asset.alt || getFileNameFromPath(asset.source) || '图片';

  useEffect(() => {
    setFailed(false);
  }, [previewSource]);

  return (
    <article className="notes-settings-image-card">
      <div
        className="notes-settings-image-preview"
        role={previewSource ? 'button' : undefined}
        tabIndex={previewSource ? 0 : undefined}
        title={previewSource ? '点击放大预览' : undefined}
        onClick={previewSource ? () => onPreview?.({ src: previewSource, title }) : undefined}
        onKeyDown={
          previewSource
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPreview?.({ src: previewSource, title });
                }
              }
            : undefined
        }
      >
        {previewSource && !failed ? (
          <img
            src={previewSource}
            alt={asset.alt || ''}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <IconPhoto aria-hidden="true" />
        )}
        <span className={`notes-settings-image-kind ${asset.kind}`}>
          {asset.kind === 'external' ? '外部' : '内部'}
        </span>
        {localizationStatus ? (
          <span
            className={`notes-settings-image-status ${localizationStatus}`}
            title={
              localizationStatus === 'processing'
                ? '正在保存'
                : localizationStatus === 'success'
                  ? '保存完成'
                  : '保存失败'
            }
            aria-label={
              localizationStatus === 'processing'
                ? '正在保存'
                : localizationStatus === 'success'
                  ? '保存完成'
                  : '保存失败'
            }
          >
            {localizationStatus === 'processing' ? (
              <IconLoader2 className="spinning" aria-hidden="true" />
            ) : localizationStatus === 'success' ? (
              <IconCheck aria-hidden="true" />
            ) : (
              <IconX aria-hidden="true" />
            )}
          </span>
        ) : null}
      </div>
      <div className="notes-settings-image-copy">
        <strong title={title}>{title}</strong>
      </div>
    </article>
  );
}

function GalleryImageCard({
  image,
  contentRoot,
  previewOrigin,
  selected,
  selectable,
  used,
  onToggle,
  onPreview,
}: {
  image: GalleryImageItem;
  contentRoot: string | null;
  previewOrigin: string;
  selected: boolean;
  selectable: boolean;
  used: boolean;
  onToggle: () => void;
  onPreview?: (preview: ImagePreviewState) => void;
}) {
  const [failed, setFailed] = useState(false);
  const previewSource = getGalleryImagePreviewSource(image.path, contentRoot, previewOrigin);
  const focus = getGalleryImageFocus(image);
  const objectPosition = formatGalleryImagePosition(focus);
  const title = image.name || getFileNameFromPath(image.path) || '图库图片';

  useEffect(() => {
    setFailed(false);
  }, [previewSource]);

  return (
    <article
      className={`notes-settings-image-card notes-settings-gallery-card${selectable ? ' selectable' : ''}${
        selected ? ' selected' : ''
      }`}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onToggle : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
    >
      <div
        className="notes-settings-image-preview"
        role={!selectable && previewSource ? 'button' : undefined}
        tabIndex={!selectable && previewSource ? 0 : undefined}
        title={!selectable && previewSource ? '点击放大预览' : undefined}
        onClick={
          !selectable && previewSource
            ? () =>
                onPreview?.({
                  src: previewSource,
                  title,
                  galleryImageKey: getGalleryImageKey(image),
                  focus,
                })
            : undefined
        }
        onKeyDown={
          !selectable && previewSource
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPreview?.({
                    src: previewSource,
                    title,
                    galleryImageKey: getGalleryImageKey(image),
                    focus,
                  });
                }
              }
            : undefined
        }
      >
        {previewSource && !failed ? (
          <img
            src={previewSource}
            alt={image.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ objectPosition }}
            onError={() => setFailed(true)}
          />
        ) : (
          <IconPhoto aria-hidden="true" />
        )}
        {selectable ? (
          <button
            type="button"
            className={`notes-settings-gallery-select${selected ? ' selected' : ''}`}
            aria-pressed={selected}
            aria-label={selected ? `取消选择 ${image.name || '图库图片'}` : `选择 ${image.name || '图库图片'}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {selected ? <IconCheck aria-hidden="true" /> : null}
          </button>
        ) : null}
        <span className={`notes-settings-image-kind gallery${used ? ' used' : ''}`}>
          {used ? '已用' : '图库'}
        </span>
      </div>
      <div className="notes-settings-image-copy">
        <strong title={title}>{title}</strong>
      </div>
    </article>
  );
}

function GalleryCropEditor({
  src,
  title,
  focus,
  onChange,
}: {
  src: string;
  title: string;
  focus: GalleryImageFocus;
  onChange: (focus: GalleryImageFocus) => void;
}) {
  const normalizedFocus = normalizeGalleryImageFocus(focus);

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    onChange(
      normalizeGalleryImageFocus({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      }),
    );
  };

  const updateAxis = (axis: keyof GalleryImageFocus, value: string) => {
    onChange(
      normalizeGalleryImageFocus({
        ...normalizedFocus,
        [axis]: Number(value),
      }),
    );
  };

  return (
    <div className="notes-image-crop-editor">
      <div
        className="notes-image-crop-stage"
        role="slider"
        tabIndex={0}
        aria-label="文章卡片裁剪位置"
        aria-valuetext={`水平 ${Math.round(normalizedFocus.x)}%，垂直 ${Math.round(normalizedFocus.y)}%`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event);
          }
        }}
      >
        <img
          src={src}
          alt={title}
          draggable={false}
          style={{ objectPosition: formatGalleryImagePosition(normalizedFocus) }}
        />
        <div className="notes-image-crop-shade" aria-hidden="true" />
        <span
          className="notes-image-crop-focus"
          style={{ left: `${normalizedFocus.x}%`, top: `${normalizedFocus.y}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="notes-image-crop-controls">
        <label>
          <span>水平</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={normalizedFocus.x}
            onChange={(event) => updateAxis('x', event.target.value)}
          />
        </label>
        <label>
          <span>垂直</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={normalizedFocus.y}
            onChange={(event) => updateAxis('y', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function ImagePagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const paginationItems = getPaginationItems(safePage, pageCount);

  return (
    <div className="notes-settings-image-pagination">
      <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
        上一页
      </button>
      <div className="notes-settings-image-page-numbers" aria-label={`第 ${safePage} 页，共 ${pageCount} 页`}>
        {paginationItems.map((item) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              className={`notes-settings-image-page-number${item === safePage ? ' active' : ''}`}
              onClick={() => onPageChange(item)}
              aria-current={item === safePage ? 'page' : undefined}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="notes-settings-image-page-ellipsis" aria-hidden="true">
              ...
            </span>
          ),
        )}
      </div>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        disabled={safePage >= pageCount}
      >
        下一页
      </button>
    </div>
  );
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  title: "Chty's Blog",
  tagline: '\u79cb\u9634\u4e0d\u6563\u971c\u98de\u665a\uff0c\u7559\u5f97\u6b8b\u8377\u542c\u96e8\u58f0',
  description:
    '\u8bb0\u5f55\u6280\u672f\u5b66\u4e60\u3001\u957f\u671f\u5199\u4f5c\u4e0e\u53e4\u5178\u6458\u5f55\u7684\u4e2a\u4eba\u535a\u5ba2\u3002',
  baseUrl: 'https://example.github.io/inknote',
  language: 'zh-CN',
  author: 'Chty',
  hero: {
    eyebrow: 'Personal Notebook',
    title: 'Markdown \u7b14\u8bb0\u4e0e InkNote \u6458\u5f55',
    description:
      '\u4ece\u684c\u9762\u7aef\u5199\u4f5c\u5de5\u4f5c\u53f0\u540c\u6b65\u5230\u9759\u6001\u535a\u5ba2\u7684\u4e00\u5957\u5185\u5bb9\u7cfb\u7edf\u3002',
    primaryLink: {
      label: '\u6d4f\u89c8\u6587\u7ae0',
      href: '/notes',
    },
    secondaryLink: {
      label: '\u6d4f\u89c8 InkNote',
      href: '/inknote',
    },
  },
  channels: [
    {
      label: '\u641c\u7d22',
      href: '#blog-search',
      description: '\u7ad9\u5185\u68c0\u7d22',
    },
    {
      label: '\u5f52\u6863',
      href: '#',
      description: '\u6587\u7ae0\u5f52\u6863',
    },
    {
      label: 'RSS',
      href: '#',
      description: '\u8ba2\u9605\u66f4\u65b0',
    },
    {
      label: '\u5173\u4e8e',
      href: '/about',
      description: '\u5173\u4e8e\u8fd9\u4e2a\u535a\u5ba2',
    },
  ],
  friendLinks: [
    {
      label: '\u53cb\u94fe\u4f4d\u7f6e A',
      href: '#',
      note: '\u540e\u7eed\u53ef\u66ff\u6362\u4e3a\u670b\u53cb\u6216\u5e38\u7528\u7ad9\u70b9\u3002',
    },
    {
      label: '\u53cb\u94fe\u4f4d\u7f6e B',
      href: '#',
      note: '\u4fdd\u7559\u7ed9\u6280\u672f\u535a\u5ba2\u6216\u9879\u76ee\u7ad9\u70b9\u3002',
    },
  ],
  toolLinks: [],
  repository: {
    remote: '',
    contentBranch: DEFAULT_CONTENT_BRANCH,
    branch: DEFAULT_CONTENT_BRANCH,
    pagesUrl: '',
    basePath: '/',
  },
  giscus: {
    enabled: true,
    repo: 'Chty-syq/InkNote',
    repoId: 'R_kgDOS4ofng',
    category: 'Announcements',
    categoryId: 'DIC_kwDOS4ofns4C_U79',
    mapping: 'pathname',
    strict: false,
    reactionsEnabled: false,
    emitMetadata: false,
    inputPosition: 'bottom',
    theme: 'noborder_light',
    lang: 'zh-CN',
  },
  goatcounter: {
    enabled: true,
    endpoint: 'https://chty.goatcounter.com/count',
    scriptUrl: 'https://gc.zgo.at/count.js',
  },
  cardImages: {
    enabled: false,
    manifest: USER_GALLERY_MANIFEST_PUBLIC_PATH,
  },
};

function sortLibraryItems(items: ContentLibraryItem[]): ContentLibraryItem[] {
  return [...items].sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date));
}

function patchItemOrder(item: ContentLibraryItem, order: number): ContentLibraryItem {
  const currentOrder = getFrontmatterOrderValue(item.frontmatter.order);
  if (currentOrder === order) {
    return item;
  }

  return {
    ...item,
    frontmatter: {
      ...item.frontmatter,
      order,
    },
  };
}

function sortCategoryItems(items: ContentLibraryItem[], categorySlug: string): ContentLibraryItem[] {
  return sortDocumentsByOrderAndDate(items.filter((item) => getItemCategorySlug(item) === categorySlug));
}

function categoryUsesManualOrder(items: ContentLibraryItem[], categorySlug: string): boolean {
  return items.some(
    (item) =>
      getItemCategorySlug(item) === categorySlug &&
      getFrontmatterOrderValue(item.frontmatter.order) !== null,
  );
}

function getNextCategoryOrder(items: ContentLibraryItem[], categorySlug: string): number | null {
  const orders = items
    .filter((item) => getItemCategorySlug(item) === categorySlug)
    .map((item) => getFrontmatterOrderValue(item.frontmatter.order))
    .filter((order): order is number => order !== null);

  if (orders.length === 0) {
    return null;
  }

  return Math.max(...orders) + 1;
}

function isInkNoteType(type: ContentDraft['type'] | ContentLibraryItem['frontmatter']['type']): boolean {
  return type === 'inknote';
}

function getNoteTypeLabel(type: ContentDraft['type'] | ContentLibraryItem['frontmatter']['type']): 'Markdown' | 'InkNote' {
  return isInkNoteType(type) ? 'InkNote' : 'Markdown';
}

function getBodySnippet(body: string): string {
  const normalized = body
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!normalized) {
    return 'Blank note';
  }

  return normalized
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .slice(0, 72);
}

function getTimestampValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getDatePart(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return getTimestampValue().slice(0, 10);
  }

  return match[1];
}

function parseGitHubRepository(remote: string): { owner: string; repo: string } | null {
  const normalized = remote.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/github\.com[:/]([^/:\s]+)\/([^/:\s]+)$/i);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function inferGitHubPagesBasePath(remote: string): string {
  const repository = parseGitHubRepository(remote);
  if (!repository) {
    return '/';
  }

  const ownerSiteName = `${repository.owner}.github.io`.toLowerCase();
  if (repository.repo.toLowerCase() === ownerSiteName) {
    return '/';
  }

  return `/${repository.repo}/`;
}

function getRepositoryContentBranch(repository?: RepositoryConfig): string {
  return repository?.contentBranch?.trim() || DEFAULT_CONTENT_BRANCH;
}

function parseContentSyncConflictError(detail: string): ContentSyncConflictItem[] | null {
  const marker = 'CONTENT_SYNC_CONFLICTS:';
  const markerIndex = detail.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(detail.slice(markerIndex + marker.length));
    if (!parsed || !Array.isArray(parsed.conflicts)) {
      return null;
    }
    return parsed.conflicts
      .map((item: Partial<ContentSyncConflictItem>) => ({
        path: typeof item.path === 'string' ? item.path : '',
        kind: typeof item.kind === 'string' ? item.kind : '内容冲突',
        local: typeof item.local === 'string' ? item.local : '',
        remote: typeof item.remote === 'string' ? item.remote : '',
        localContent: typeof item.localContent === 'string' ? item.localContent : item.local ?? '',
        remoteContent: typeof item.remoteContent === 'string' ? item.remoteContent : item.remote ?? '',
      }))
      .filter((item: ContentSyncConflictItem) => item.path.trim());
  } catch {
    return null;
  }
}

function parseContentSyncRiskError(detail: string): ContentSyncRiskReport | null {
  const marker = 'CONTENT_SYNC_RISK:';
  const markerIndex = detail.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(detail.slice(markerIndex + marker.length));
    return {
      code: typeof parsed?.code === 'string' ? parsed.code : 'content-sync-risk',
      title: typeof parsed?.title === 'string' ? parsed.title : '同步风险确认',
      detail: typeof parsed?.detail === 'string' ? parsed.detail : '继续操作可能覆盖或删除内容。',
    };
  } catch {
    return {
      code: 'content-sync-risk',
      title: '同步风险确认',
      detail: '继续操作可能覆盖或删除内容。',
    };
  }
}

function createContentSyncConflictResolutions(
  conflicts: ContentSyncConflictItem[],
): Partial<ContentSyncConflictResolutions> {
  return conflicts.reduce<Partial<ContentSyncConflictResolutions>>((resolutions, conflict) => {
    resolutions[conflict.path] = undefined;
    return resolutions;
  }, {});
}

function areContentSyncConflictsResolved(
  conflicts: ContentSyncConflictItem[],
  resolutions: Partial<ContentSyncConflictResolutions>,
): resolutions is ContentSyncConflictResolutions {
  return conflicts.every((conflict) => resolutions[conflict.path] === 'remote' || resolutions[conflict.path] === 'local');
}

function splitConflictPreviewLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.length ? normalized.split('\n') : [];
}

function createConflictDiffLine(
  kind: ConflictDiffLineKind,
  text: string,
  lineNumber: number | null,
  segments?: ConflictDiffSegment[],
): ConflictDiffLine {
  return { kind, lineNumber, text, segments };
}

function appendConflictDiffSegment(
  segments: ConflictDiffSegment[],
  text: string,
  changed: boolean,
): void {
  if (!text) {
    return;
  }
  const previous = segments[segments.length - 1];
  if (previous?.changed === changed) {
    previous.text += text;
    return;
  }
  segments.push({ text, changed });
}

function buildConflictInlineSegments(localText: string, remoteText: string): Pick<ConflictDiffPair, 'local' | 'remote'> {
  const localUnits = Array.from(localText);
  const remoteUnits = Array.from(remoteText);
  if (localUnits.length * remoteUnits.length > 18_000) {
    return {
      local: [createConflictDiffLine('changed', localText, null, [{ text: localText, changed: true }])],
      remote: [createConflictDiffLine('changed', remoteText, null, [{ text: remoteText, changed: true }])],
    };
  }

  const lcs = Array.from({ length: localUnits.length + 1 }, () => Array(remoteUnits.length + 1).fill(0) as number[]);
  for (let localIndex = localUnits.length - 1; localIndex >= 0; localIndex -= 1) {
    for (let remoteIndex = remoteUnits.length - 1; remoteIndex >= 0; remoteIndex -= 1) {
      lcs[localIndex][remoteIndex] =
        localUnits[localIndex] === remoteUnits[remoteIndex]
          ? lcs[localIndex + 1][remoteIndex + 1] + 1
          : Math.max(lcs[localIndex + 1][remoteIndex], lcs[localIndex][remoteIndex + 1]);
    }
  }

  const localSegments: ConflictDiffSegment[] = [];
  const remoteSegments: ConflictDiffSegment[] = [];
  let localIndex = 0;
  let remoteIndex = 0;
  while (localIndex < localUnits.length || remoteIndex < remoteUnits.length) {
    if (
      localIndex < localUnits.length &&
      remoteIndex < remoteUnits.length &&
      localUnits[localIndex] === remoteUnits[remoteIndex]
    ) {
      appendConflictDiffSegment(localSegments, localUnits[localIndex], false);
      appendConflictDiffSegment(remoteSegments, remoteUnits[remoteIndex], false);
      localIndex += 1;
      remoteIndex += 1;
      continue;
    }

    if (
      remoteIndex < remoteUnits.length &&
      (localIndex >= localUnits.length || lcs[localIndex][remoteIndex + 1] >= lcs[localIndex + 1][remoteIndex])
    ) {
      appendConflictDiffSegment(remoteSegments, remoteUnits[remoteIndex], true);
      remoteIndex += 1;
      continue;
    }

    appendConflictDiffSegment(localSegments, localUnits[localIndex] ?? '', true);
    localIndex += 1;
  }

  return {
    local: [createConflictDiffLine('changed', localText, null, localSegments)],
    remote: [createConflictDiffLine('changed', remoteText, null, remoteSegments)],
  };
}

function buildIndexedConflictDiff(localLines: string[], remoteLines: string[]): ConflictDiffPair {
  const local: ConflictDiffLine[] = [];
  const remote: ConflictDiffLine[] = [];
  const maxLineCount = Math.max(localLines.length, remoteLines.length);
  for (let index = 0; index < maxLineCount; index += 1) {
    const localText = localLines[index];
    const remoteText = remoteLines[index];
    if (localText !== undefined && remoteText !== undefined) {
      const kind: ConflictDiffLineKind = localText === remoteText ? 'same' : 'changed';
      local.push(createConflictDiffLine(kind, localText, index + 1));
      remote.push(createConflictDiffLine(kind, remoteText, index + 1));
      continue;
    }
    if (localText !== undefined) {
      local.push(createConflictDiffLine('removed', localText, index + 1));
      remote.push(createConflictDiffLine('empty', '', null));
      continue;
    }
    local.push(createConflictDiffLine('empty', '', null));
    remote.push(createConflictDiffLine('added', remoteText ?? '', index + 1));
  }
  return { local, remote };
}

function buildConflictDiff(localText: string, remoteText: string): ConflictDiffPair {
  const localLines = splitConflictPreviewLines(localText);
  const remoteLines = splitConflictPreviewLines(remoteText);
  if (!localLines.length && !remoteLines.length) {
    return { local: [], remote: [] };
  }

  if (localLines.length * remoteLines.length > 260_000) {
    return buildIndexedConflictDiff(localLines, remoteLines);
  }

  const lcs = Array.from({ length: localLines.length + 1 }, () => Array(remoteLines.length + 1).fill(0) as number[]);
  for (let localIndex = localLines.length - 1; localIndex >= 0; localIndex -= 1) {
    for (let remoteIndex = remoteLines.length - 1; remoteIndex >= 0; remoteIndex -= 1) {
      lcs[localIndex][remoteIndex] =
        localLines[localIndex] === remoteLines[remoteIndex]
          ? lcs[localIndex + 1][remoteIndex + 1] + 1
          : Math.max(lcs[localIndex + 1][remoteIndex], lcs[localIndex][remoteIndex + 1]);
    }
  }

  const local: ConflictDiffLine[] = [];
  const remote: ConflictDiffLine[] = [];
  let localIndex = 0;
  let remoteIndex = 0;
  while (localIndex < localLines.length || remoteIndex < remoteLines.length) {
    if (
      localIndex < localLines.length &&
      remoteIndex < remoteLines.length &&
      localLines[localIndex] === remoteLines[remoteIndex]
    ) {
      local.push(createConflictDiffLine('same', localLines[localIndex], localIndex + 1));
      remote.push(createConflictDiffLine('same', remoteLines[remoteIndex], remoteIndex + 1));
      localIndex += 1;
      remoteIndex += 1;
      continue;
    }

    if (
      localIndex < localLines.length &&
      remoteIndex < remoteLines.length &&
      lcs[localIndex + 1][remoteIndex + 1] >= lcs[localIndex + 1][remoteIndex] &&
      lcs[localIndex + 1][remoteIndex + 1] >= lcs[localIndex][remoteIndex + 1]
    ) {
      const inlineDiff = buildConflictInlineSegments(localLines[localIndex], remoteLines[remoteIndex]);
      local.push({ ...inlineDiff.local[0], lineNumber: localIndex + 1 });
      remote.push({ ...inlineDiff.remote[0], lineNumber: remoteIndex + 1 });
      localIndex += 1;
      remoteIndex += 1;
      continue;
    }

    if (
      remoteIndex < remoteLines.length &&
      (localIndex >= localLines.length || lcs[localIndex][remoteIndex + 1] >= lcs[localIndex + 1][remoteIndex])
    ) {
      local.push(createConflictDiffLine('empty', '', null));
      remote.push(createConflictDiffLine('added', remoteLines[remoteIndex], remoteIndex + 1));
      remoteIndex += 1;
      continue;
    }

    local.push(createConflictDiffLine('removed', localLines[localIndex] ?? '', localIndex + 1));
    remote.push(createConflictDiffLine('empty', '', null));
    localIndex += 1;
  }

  return { local, remote };
}

function getConflictDiffMarker(kind: ConflictDiffLineKind, side: ConflictDiffSide): string {
  if (kind === 'added') {
    return '+';
  }
  if (kind === 'removed') {
    return '-';
  }
  if (kind === 'changed') {
    return side === 'local' ? '-' : '+';
  }
  return '';
}

function renderConflictDiffLineText(line: ConflictDiffLine) {
  if (line.segments?.length) {
    return line.segments.map((segment, segmentIndex) => (
      <span
        className={segment.changed ? 'notes-content-conflict-inline-change' : undefined}
        key={`${segment.changed ? 'changed' : 'same'}-${segmentIndex}`}
      >
        {segment.text}
      </span>
    ));
  }
  return line.text || ' ';
}

function localizeToastMessage(message: string): string {
  const trimmed = message.trim();
  const exactMessages: Record<string, string> = {
    'Publishing requires the Tauri desktop app.': '发布需要在 Tauri 桌面端中执行。',
    'Failed to read publish status.': '读取发布状态失败。',
    'Enter a commit message before publishing.': '发布前请填写提交说明。',
    'Failed to publish site changes.': '发布站点变更失败。',
    'Failed to load the selected avatar.': '加载所选头像失败。',
    'Updated the blog avatar.': '已更新博客头像。',
    'Stayed on the current note.': '已返回当前笔记。',
    'Undid the latest editor change.': '已撤销最近一次编辑。',
    'Reapplied the latest editor change.': '已重做最近一次编辑。',
    'Undid the latest notebook editor change.': '已撤销最近一次手写笔记编辑。',
    'Reapplied the latest notebook editor change.': '已重做最近一次手写笔记编辑。',
    'Loading notes...': '正在加载笔记...',
    'Content management is only available in the Tauri desktop app.': '内容管理只能在 Tauri 桌面端中使用。',
    'Failed to load notes.': '加载笔记失败。',
    'Discarded the unsaved draft.': '已丢弃未保存的草稿。',
    'Original content could not be found, so the draft cannot be restored.': '找不到原始内容，无法恢复草稿。',
    'Reverted to the last saved version.': '已恢复到最近保存的版本。',
    'Writing to content/ requires the Tauri desktop app.': '写入 content/ 需要在 Tauri 桌面端中执行。',
    'Failed to save note.': '保存笔记失败。',
    'Exporting notes requires the Tauri desktop app.': '导出笔记需要在 Tauri 桌面端中执行。',
    'Export cancelled.': '已取消导出。',
    'Failed to export note.': '导出笔记失败。',
    'Deleting notes requires the Tauri desktop app.': '删除笔记需要在 Tauri 桌面端中执行。',
    'Failed to delete note.': '删除笔记失败。',
  };

  if (exactMessages[trimmed]) {
    return exactMessages[trimmed];
  }

  const loadedNotesMatch = trimmed.match(/^Loaded (\d+) notes\.$/);
  if (loadedNotesMatch) {
    return `已加载 ${loadedNotesMatch[1]} 篇笔记。`;
  }

  const savedContentMatch = trimmed.match(/^Saved to content\/(.+)$/);
  if (savedContentMatch) {
    return `已保存到 content/${savedContentMatch[1]}`;
  }

  const targetPathExistsMatch = trimmed.match(/^The target path content\/(.+) already exists\.$/);
  if (targetPathExistsMatch) {
    return `目标路径 content/${targetPathExistsMatch[1]} 已存在。`;
  }

  const exportedMarkdownMatch = trimmed.match(/^Exported Markdown and notebook project to (.+)$/);
  if (exportedMarkdownMatch) {
    return `已导出 Markdown 和手写笔记工程到 ${exportedMarkdownMatch[1]}`;
  }

  const exportedNoteMatch = trimmed.match(/^Exported note to (.+)$/);
  if (exportedNoteMatch) {
    return `已导出笔记到 ${exportedNoteMatch[1]}`;
  }

  const deletedNoteMatch = trimmed.match(/^Deleted "(.+)"\.$/);
  if (deletedNoteMatch) {
    return `已删除「${deletedNoteMatch[1]}」。`;
  }

  if (/^GitHub API \d+/.test(trimmed)) {
    return `GitHub API 请求失败：${trimmed.replace(/^GitHub API\s*/, '')}`;
  }

  const httpMatch = trimmed.match(/^HTTP\s+(\d+)(?:\s+.+)?$/i);
  if (httpMatch) {
    return `请求失败：HTTP ${httpMatch[1]}。`;
  }

  if (!/[\u3400-\u9fff]/.test(trimmed) && /[A-Za-z]/.test(trimmed)) {
    return '操作未完成，请查看详情。';
  }

  return trimmed;
}

function getToastTone(message: string): ToastTone {
  if (/失败|错误|无法|不能|请先|请填写|请输|取消|Failed|failed|Error|error|Forbidden|requires/i.test(message)) {
    return 'error';
  }
  if (/^已|成功|完成|Loaded|Saved|Updated|Exported|Deleted/i.test(message)) {
    return 'success';
  }
  return 'info';
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
}

function createHistoryEntry(label: string, detail = ''): NoteHistoryEntry {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    label,
    detail,
    timestamp: getTimestampValue(),
  };
}

function getDraftEditorSnapshot(draft: ContentDraft): string {
  const {
    savedSnapshot: _savedSnapshot,
    title: _title,
    tagsText: _tagsText,
    ...editorState
  } = draft;
  return JSON.stringify(editorState);
}

function preserveAutoSavedMetadata(target: ContentDraft, current: ContentDraft): ContentDraft {
  return patchDraft(target, {
    title: current.title,
    tagsText: current.tagsText,
    updatedAt: current.updatedAt,
    savedSnapshot: current.savedSnapshot,
  });
}

function cloneDefaultSiteConfig(): SiteConfig {
  return JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG)) as SiteConfig;
}

function normalizeSiteLinkList(value: unknown, fallback: FriendLinkConfig[] | undefined): FriendLinkConfig[] | undefined {
  return Array.isArray(value)
    ? value
        .map<FriendLinkConfig | null>((link) =>
          link && typeof link === 'object'
            ? {
                label: typeof link.label === 'string' ? link.label : '',
                href: typeof link.href === 'string' ? link.href : '',
                note: typeof link.note === 'string' ? link.note : '',
                icon: typeof link.icon === 'string' ? link.icon : '',
                iconSource: typeof link.iconSource === 'string' ? link.iconSource : '',
                iconTarget: typeof link.iconTarget === 'string' ? link.iconTarget : '',
                iconFetchedAt: typeof link.iconFetchedAt === 'string' ? link.iconFetchedAt : '',
              }
            : null,
        )
        .filter((link): link is FriendLinkConfig => Boolean(link?.label.trim() && link.href.trim()))
    : fallback;
}

function normalizeSiteConfig(value: unknown): SiteConfig {
  const input = value && typeof value === 'object' ? (value as Partial<SiteConfig>) : {};
  const fallback = cloneDefaultSiteConfig();
  const hero = input.hero && typeof input.hero === 'object' ? input.hero : fallback.hero;
  const primaryLink =
    hero.primaryLink && typeof hero.primaryLink === 'object' ? hero.primaryLink : fallback.hero.primaryLink;
  const secondaryLink =
    hero.secondaryLink && typeof hero.secondaryLink === 'object' ? hero.secondaryLink : fallback.hero.secondaryLink;
  const channels = Array.isArray(input.channels)
    ? input.channels
        .map((channel) =>
          channel && typeof channel === 'object'
            ? {
                label: typeof channel.label === 'string' ? channel.label : '',
                href: typeof channel.href === 'string' ? channel.href : '',
                description: typeof channel.description === 'string' ? channel.description : '',
              }
            : null,
        )
        .filter((channel): channel is SiteConfig['channels'][number] =>
          Boolean(channel?.label.trim() && channel.href.trim()),
        )
    : fallback.channels;
  const friendLinks = normalizeSiteLinkList(input.friendLinks, fallback.friendLinks);
  const toolLinks = normalizeSiteLinkList(input.toolLinks, fallback.toolLinks);
  const repositoryInput =
    input.repository && typeof input.repository === 'object'
      ? (input.repository as Partial<RepositoryConfig>)
      : {};
  const repositoryContentBranch =
    typeof repositoryInput.contentBranch === 'string'
      ? repositoryInput.contentBranch
      : typeof repositoryInput.branch === 'string'
        ? repositoryInput.branch
        : fallback.repository?.contentBranch ?? DEFAULT_CONTENT_BRANCH;
  const repository: RepositoryConfig = {
    remote:
      typeof repositoryInput.remote === 'string'
        ? repositoryInput.remote
        : fallback.repository?.remote ?? '',
    contentBranch: repositoryContentBranch,
    branch: repositoryContentBranch,
    pagesUrl:
      typeof repositoryInput.pagesUrl === 'string'
        ? repositoryInput.pagesUrl
        : fallback.repository?.pagesUrl ?? '',
    basePath:
      typeof repositoryInput.basePath === 'string'
        ? repositoryInput.basePath
        : fallback.repository?.basePath ?? '/',
  };
  const giscusInput =
    input.giscus && typeof input.giscus === 'object' ? (input.giscus as Partial<GiscusConfig>) : {};
  const giscus: GiscusConfig = {
    enabled: typeof giscusInput.enabled === 'boolean' ? giscusInput.enabled : fallback.giscus?.enabled ?? false,
    repo: typeof giscusInput.repo === 'string' ? giscusInput.repo : fallback.giscus?.repo ?? '',
    repoId: typeof giscusInput.repoId === 'string' ? giscusInput.repoId : fallback.giscus?.repoId ?? '',
    category:
      typeof giscusInput.category === 'string' ? giscusInput.category : fallback.giscus?.category ?? 'Announcements',
    categoryId:
      typeof giscusInput.categoryId === 'string' ? giscusInput.categoryId : fallback.giscus?.categoryId ?? '',
    mapping:
      giscusInput.mapping === 'url' ||
      giscusInput.mapping === 'title' ||
      giscusInput.mapping === 'og:title' ||
      giscusInput.mapping === 'specific' ||
      giscusInput.mapping === 'number' ||
      giscusInput.mapping === 'pathname'
        ? giscusInput.mapping
        : fallback.giscus?.mapping ?? 'pathname',
    strict: typeof giscusInput.strict === 'boolean' ? giscusInput.strict : fallback.giscus?.strict ?? false,
    reactionsEnabled:
      typeof giscusInput.reactionsEnabled === 'boolean'
        ? giscusInput.reactionsEnabled
        : fallback.giscus?.reactionsEnabled ?? false,
    emitMetadata:
      typeof giscusInput.emitMetadata === 'boolean'
        ? giscusInput.emitMetadata
        : fallback.giscus?.emitMetadata ?? false,
    inputPosition:
      giscusInput.inputPosition === 'top' || giscusInput.inputPosition === 'bottom'
        ? giscusInput.inputPosition
        : fallback.giscus?.inputPosition ?? 'bottom',
    theme: typeof giscusInput.theme === 'string' ? giscusInput.theme : fallback.giscus?.theme ?? 'noborder_light',
    lang: typeof giscusInput.lang === 'string' ? giscusInput.lang : fallback.giscus?.lang ?? 'zh-CN',
  };
  const goatcounterInput =
    input.goatcounter && typeof input.goatcounter === 'object'
      ? (input.goatcounter as Partial<GoatCounterConfig>)
      : {};
  const goatcounter: GoatCounterConfig = {
    enabled:
      typeof goatcounterInput.enabled === 'boolean' ? goatcounterInput.enabled : fallback.goatcounter?.enabled ?? false,
    endpoint:
      typeof goatcounterInput.endpoint === 'string'
        ? goatcounterInput.endpoint
        : fallback.goatcounter?.endpoint ?? '',
    scriptUrl:
      typeof goatcounterInput.scriptUrl === 'string'
        ? goatcounterInput.scriptUrl
        : fallback.goatcounter?.scriptUrl ?? 'https://gc.zgo.at/count.js',
  };
  const cardImagesInput =
    input.cardImages && typeof input.cardImages === 'object'
      ? (input.cardImages as Partial<CardImageConfig>)
      : {};
  const cardImages: CardImageConfig = {
    enabled:
      typeof cardImagesInput.enabled === 'boolean'
        ? cardImagesInput.enabled
        : fallback.cardImages?.enabled ?? false,
    manifest:
      typeof cardImagesInput.manifest === 'string' && cardImagesInput.manifest.trim()
        ? cardImagesInput.manifest
        : fallback.cardImages?.manifest ?? USER_GALLERY_MANIFEST_PUBLIC_PATH,
  };

  return {
    ...fallback,
    ...input,
    title: typeof input.title === 'string' && input.title.trim() ? input.title : fallback.title,
    tagline: typeof input.tagline === 'string' ? input.tagline : fallback.tagline,
    description: typeof input.description === 'string' ? input.description : fallback.description,
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl : fallback.baseUrl,
    language: typeof input.language === 'string' ? input.language : fallback.language,
    author: typeof input.author === 'string' ? input.author : fallback.author,
    hero: {
      ...fallback.hero,
      ...hero,
      primaryLink: {
        ...fallback.hero.primaryLink,
        ...primaryLink,
      },
      secondaryLink: secondaryLink
        ? {
            ...fallback.hero.secondaryLink,
            ...secondaryLink,
          }
        : undefined,
    },
    channels,
    friendLinks,
    toolLinks,
    repository,
    giscus,
    goatcounter,
    cardImages,
  };
}

function formatSiteChannels(channels: SiteConfig['channels']): string {
  return channels
    .map((channel) => [channel.label, channel.href, channel.description].map((part) => part.trim()).join(' | '))
    .join('\n');
}

function parseSiteChannelsText(value: string): SiteConfig['channels'] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = '', href = '', ...descriptionParts] = line.split('|').map((part) => part.trim());
      return {
        label,
        href,
        description: descriptionParts.join(' | '),
      };
    })
    .filter((channel) => channel.label && channel.href);
}

function getProjectSnapshot(project: ProjectData): string {
  return JSON.stringify(
    {
      version: 1,
      content: project.content,
      paperStyle: project.paperStyle,
      handwritingStyle: project.handwritingStyle,
      lineLayoutRules: project.lineLayoutRules,
      paragraphIndent: project.paragraphIndent,
      linesPerPage: project.linesPerPage,
      fontSize: project.fontSize,
      charSpacing: project.charSpacing,
      seed: project.seed,
    },
    null,
    2,
  );
}

function createLinkedNotebookProject(draft: ContentDraft, existing?: ProjectData | null): ProjectData {
  const base = existing ?? createDefaultProject();
  const title = draft.title.trim() || 'Untitled inknote';
  const draftBody = draft.body.trim();

  return {
    ...base,
    paperStyle:
      draft.type === 'inknote' && draft.paperStyle
        ? (draft.paperStyle as ProjectData['paperStyle'])
        : base.paperStyle,
    handwritingStyle:
      draft.type === 'inknote' && draft.handwritingStyle
        ? (draft.handwritingStyle as ProjectData['handwritingStyle'])
        : base.handwritingStyle,
    content: existing?.content?.trim() || draftBody || `# ${title}\n\nWrite the linked notebook content here.`,
    updatedAt: new Date().toISOString(),
  };
}

function shouldHydrateLinkedNotebookContent(project: ProjectData, draft: ContentDraft): boolean {
  const content = project.content.trim();
  return (
    draft.type === 'inknote' &&
    Boolean(draft.body.trim()) &&
    (!content || /Write the linked notebook content here\./i.test(content))
  );
}

function getItemCategorySlug(item: ContentLibraryItem): string {
  if (typeof item.frontmatter.category === 'string' && item.frontmatter.category.trim()) {
    return item.frontmatter.category.trim();
  }

  if (
    item.frontmatter.type === 'markdown' &&
    typeof item.frontmatter.section === 'string' &&
    item.frontmatter.section.trim()
  ) {
    return slugifyCategoryLabel(item.frontmatter.section);
  }

  return '';
}

function splitInlineList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const TAG_COLLATOR = new Intl.Collator(['zh-Hans-CN', 'en'], { numeric: true, sensitivity: 'base' });

function compareTags(left: string, right: string): number {
  return (
    TAG_COLLATOR.compare(left.trim().toLocaleLowerCase(), right.trim().toLocaleLowerCase()) ||
    left.localeCompare(right)
  );
}

function sortTagList(tags: string[]): string[] {
  return [...tags].sort(compareTags);
}

function toUniqueTagList(value: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of value) {
    const normalized = item.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }

    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(normalized);
  }

  return sortTagList(tags);
}

function getFrontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return toUniqueTagList(value.filter((item): item is string => typeof item === 'string'));
  }

  if (typeof value === 'string') {
    return toUniqueTagList(splitInlineList(value));
  }

  return [];
}

const TAG_TONES = ['blue', 'teal', 'green', 'amber', 'violet', 'cyan', 'olive', 'orange', 'rose', 'indigo'] as const;

function getTagTone(tag: string): (typeof TAG_TONES)[number] {
  let hash = 0;
  for (const character of tag) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return TAG_TONES[Math.abs(hash) % TAG_TONES.length];
}

function getCategoryLabel(categories: ContentCategory[], slug: string): string {
  return categories.find((category) => category.slug === slug)?.label ?? slug;
}

function humanizeCategorySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function getDraftCategoryLabel(draft: ContentDraft, categories: ContentCategory[]): string {
  if (!draft.category.trim()) {
    return draft.type === 'inknote' ? 'InkNote' : 'Uncategorized';
  }

  return getCategoryLabel(categories, draft.category);
}

function getPreviewPathFromItem(item: ContentLibraryItem | null): string | null {
  if (!item) {
    return null;
  }

  if (item.frontmatter.type === 'inknote') {
    return `/inknote/${item.frontmatter.slug || item.folderName}`;
  }

  const permalink =
    typeof item.frontmatter.permalink === 'string' ? item.frontmatter.permalink.trim() : '';
  if (permalink) {
    return permalink.startsWith('/') ? permalink : `/${permalink}`;
  }

  return `/notes/${item.frontmatter.slug || item.folderName}`;
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): TextTransformResult {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const inner = selectedText || placeholder;
  const inserted = `${prefix}${inner}${suffix}`;
  const nextValue = `${value.slice(0, selectionStart)}${inserted}${value.slice(selectionEnd)}`;
  const nextSelectionStart = selectionStart + prefix.length;
  const nextSelectionEnd = nextSelectionStart + inner.length;

  return {
    nextValue,
    nextSelectionStart,
    nextSelectionEnd,
  };
}

function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  formatter: (line: string, index: number) => string,
): TextTransformResult {
  const blockStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const blockEndIndex = value.indexOf('\n', selectionEnd);
  const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
  const block = value.slice(blockStart, blockEnd);
  const nextBlock = block
    .split('\n')
    .map((line, index) => (line.trim() ? formatter(line, index) : line))
    .join('\n');
  const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;

  return {
    nextValue,
    nextSelectionStart: blockStart,
    nextSelectionEnd: blockStart + nextBlock.length,
  };
}

function increaseMarkdownHeadingLevel(line: string): string {
  const match = /^(\s*)(#{1,6})(?:\s+)?(.*)$/.exec(line);
  if (!match) {
    const indent = line.match(/^\s*/)?.[0] ?? '';
    return `${indent}# ${line.slice(indent.length)}`;
  }

  const [, indent, hashes, content] = match;
  const nextLevel = Math.min(hashes.length + 1, 6);
  return `${indent}${'#'.repeat(nextLevel)} ${content.trimStart()}`;
}

function insertSnippet(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
  selectionOffsetStart = 0,
  selectionOffsetEnd = 0,
): TextTransformResult {
  const nextValue = `${value.slice(0, selectionStart)}${snippet}${value.slice(selectionEnd)}`;

  return {
    nextValue,
    nextSelectionStart: selectionStart + selectionOffsetStart,
    nextSelectionEnd: selectionStart + snippet.length - selectionOffsetEnd,
  };
}

function FriendLinkAvatar({
  label,
  icon,
  fetchedAt,
  previewOrigin,
}: {
  label: string;
  icon?: string;
  fetchedAt?: string;
  previewOrigin: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [fetchedAt, icon]);

  const cacheKey = fetchedAt?.trim() ? `?v=${encodeURIComponent(fetchedAt)}` : '';
  const source = icon?.trim()
    ? `${previewOrigin}${icon.startsWith('/') ? icon : `/${icon}`}${cacheKey}`
    : '';

  return (
    <span className="notes-settings-friend-avatar" aria-hidden="true">
      <span>{label.trim() ? label.trim().slice(0, 1).toUpperCase() : <IconLink />}</span>
      {source && !failed ? (
        <img key={source} src={source} alt="" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}

const CONTENT_SYNC_CHANGE_LABELS: Record<ContentSyncArticleChange['changeType'], string> = {
  added: '新增',
  deleted: '删除',
  modified: '修改',
};

function ContentSyncChangeColumn({
  title,
  description,
  changes,
}: {
  title: string;
  description: string;
  changes: ContentSyncArticleChange[];
}) {
  const count = (changeType: ContentSyncArticleChange['changeType']) =>
    changes.filter((change) => change.changeType === changeType).length;

  return (
    <section className="notes-content-sync-preview-column">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <em>{changes.length} 项</em>
      </header>
      <div className="notes-content-sync-preview-counts">
        <span className="added">新增 {count('added')}</span>
        <span className="deleted">删除 {count('deleted')}</span>
        <span className="modified">修改 {count('modified')}</span>
      </div>
      <div className="notes-content-sync-preview-list">
        {changes.length ? (
          changes.map((change) => (
            <article key={`${change.changeType}-${change.path}`}>
              <span className={`notes-content-sync-change-type ${change.changeType}`}>
                {CONTENT_SYNC_CHANGE_LABELS[change.changeType]}
              </span>
              <div>
                <strong>{change.title}</strong>
                <small>{change.path}</small>
              </div>
              <em>{change.noteType}</em>
            </article>
          ))
        ) : (
          <div className="notes-content-sync-preview-empty">没有文章变更</div>
        )}
      </div>
    </section>
  );
}

export default function NotesWorkbench() {
  const [libraryRoot, setLibraryRoot] = useState('content');
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isOpeningBlogPreview, setIsOpeningBlogPreview] = useState(false);
  const [draftSessionId, setDraftSessionId] = useState(0);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>('write');
  const [showPreview, setShowPreview] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [previewRenderBody, setPreviewRenderBody] = useState('');
  const [isPreviewRenderPending, setIsPreviewRenderPending] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<NoteHistoryEntry[]>([]);
  const [publishConnectionMessage, setPublishConnectionMessage] = useState('尚未测试远程仓库连接。');
  const [publishMessage, setPublishMessage] = useState(DEFAULT_SYNC_MESSAGE);
  const [isPublishingSite, setIsPublishingSite] = useState(false);
  const [isTestingRemote, setIsTestingRemote] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isClearLocalContentDialogOpen, setIsClearLocalContentDialogOpen] = useState(false);
  const [isClearingLocalContent, setIsClearingLocalContent] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishRunState, setPublishRunState] = useState<PublishRunState>('idle');
  const [publishLogs, setPublishLogs] = useState<PublishLogEntry[]>([]);
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [isPullingContent, setIsPullingContent] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullRunState, setPullRunState] = useState<PublishRunState>('idle');
  const [pullLogs, setPullLogs] = useState<PublishLogEntry[]>([]);
  const [contentSyncConflictDialog, setContentSyncConflictDialog] =
    useState<ContentSyncConflictDialogState | null>(null);
  const [contentSyncPreviewDialog, setContentSyncPreviewDialog] =
    useState<ContentSyncPreviewDialogState | null>(null);
  const [desktopVersion, setDesktopVersion] = useState(DESKTOP_FALLBACK_VERSION);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState>('idle');
  const [desktopUpdateMessage, setDesktopUpdateMessage] = useState('\u5c1a\u672a\u68c0\u67e5\u66f4\u65b0');
  const [desktopUpdateDetail, setDesktopUpdateDetail] = useState('');
  const [desktopUpdateProgress, setDesktopUpdateProgress] = useState(0);
  const [latestDesktopRelease, setLatestDesktopRelease] = useState<DesktopReleaseInfo | null>(null);
  const [brandAvatar, setBrandAvatar] = useState('');
  const [sshKeyPath, setSshKeyPath] = useState('');
  const [siteConfigDraft, setSiteConfigDraft] = useState<SiteConfig>(() => cloneDefaultSiteConfig());
  const [siteChannelsText, setSiteChannelsText] = useState(() => formatSiteChannels(DEFAULT_SITE_CONFIG.channels));
  const [isSiteConfigSaving, setIsSiteConfigSaving] = useState(false);
  const [friendIconLoadingIndex, setFriendIconLoadingIndex] = useState<number | null>(null);
  const [toolIconLoadingIndex, setToolIconLoadingIndex] = useState<number | null>(null);
  const [isLocalizingImages, setIsLocalizingImages] = useState(false);
  const [imageLocalizationStatus, setImageLocalizationStatus] = useState<Record<string, ImageLocalizationStatus>>({});
  const [localBlogPreviewOrigin, setLocalBlogPreviewOrigin] = useState(LOCAL_BLOG_PREVIEW_ORIGIN);
  const [imageSettingsTab, setImageSettingsTab] = useState<SettingsImageTab>('references');
  const [managedImagePage, setManagedImagePage] = useState(1);
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [galleryAssignments, setGalleryAssignments] = useState<Record<string, string>>({});
  const [galleryPage, setGalleryPage] = useState(1);
  const [selectedGalleryImageKeys, setSelectedGalleryImageKeys] = useState<string[]>([]);
  const [isGalleryMultiSelectMode, setIsGalleryMultiSelectMode] = useState(false);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isUploadingGalleryImages, setIsUploadingGalleryImages] = useState(false);
  const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
  const [galleryUploadTotal, setGalleryUploadTotal] = useState(0);
  const [isDeletingGalleryImages, setIsDeletingGalleryImages] = useState(false);
  const [galleryDeleteDialog, setGalleryDeleteDialog] = useState<GalleryDeleteDialogState | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [imagePreviewFocus, setImagePreviewFocus] = useState<GalleryImageFocus>({ x: 50, y: 50 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('basic');
  const [siteIntegrationPanel, setSiteIntegrationPanel] = useState<SiteIntegrationPanel | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
  const [categoryDeleteDialog, setCategoryDeleteDialog] = useState<CategoryDeleteDialogState | null>(null);
  const [categoryLabelValue, setCategoryLabelValue] = useState('');
  const [categoryLabelEnValue, setCategoryLabelEnValue] = useState('');
  const [draggingCategorySlug, setDraggingCategorySlug] = useState<string | null>(null);
  const [draggingSiteLink, setDraggingSiteLink] = useState<SiteLinkDragState | null>(null);
  const [draggingNotePath, setDraggingNotePath] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [createTitleValue, setCreateTitleValue] = useState('');
  const [createCategoryValue, setCreateCategoryValue] = useState('');
  const [createTypeValue, setCreateTypeValue] = useState<ContentDraft['type']>('markdown');
  const [metadataCategoryValue, setMetadataCategoryValue] = useState('');
  const [metadataDateValue, setMetadataDateValue] = useState('');
  const [pendingSwitchItem, setPendingSwitchItem] = useState<ContentLibraryItem | null>(null);
  const [isPendingSwitchSaving, setIsPendingSwitchSaving] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');

  const [linkedNotebook, setLinkedNotebook] = useState<ProjectData | null>(null);
  const [linkedNotebookPath, setLinkedNotebookPath] = useState<string | null>(null);
  const [linkedNotebookSavedSnapshot, setLinkedNotebookSavedSnapshot] = useState('');
  const [linkedNotebookStatus, setLinkedNotebookStatus] = useState('');
  const [isLinkedNotebookLoading, setIsLinkedNotebookLoading] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const tagPickerRef = useRef<HTMLDivElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const friendIconAutoRequestedRef = useRef(new Set<string>());
  const toolIconAutoRequestedRef = useRef(new Set<string>());
  const metadataDateInputRef = useRef<HTMLInputElement | null>(null);
  const brandAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const createTitleInputRef = useRef<HTMLInputElement | null>(null);
  const draftUndoStackRef = useRef<DraftUndoEntry[]>([]);
  const draftRedoStackRef = useRef<DraftUndoEntry[]>([]);
  const linkedNotebookUndoStackRef = useRef<NotebookUndoEntry[]>([]);
  const linkedNotebookRedoStackRef = useRef<NotebookUndoEntry[]>([]);
  const draftCacheRef = useRef<Map<string, { fingerprint: string; draft: ContentDraft }>>(new Map());
  const cleanDraftsRef = useRef<WeakSet<ContentDraft>>(new WeakSet());
  const editorSelectionRef = useRef<EditorSelectionState | null>(null);
  const pendingEditorViewRestoreRef = useRef<PendingEditorViewRestore | null>(null);
  const draftRef = useRef<ContentDraft | null>(null);
  const categoriesRef = useRef<ContentCategory[]>([]);
  const itemsRef = useRef<ContentLibraryItem[]>([]);
  const categoryDragSourceRef = useRef<string | null>(null);
  const categoryDragOriginalOrderRef = useRef<ContentCategory[] | null>(null);
  const pendingCategoryOrderRef = useRef<ContentCategory[] | null>(null);
  const siteLinkDragSourceRef = useRef<SiteLinkDragState | null>(null);
  const noteDragSourceRef = useRef<string | null>(null);
  const noteDragOriginalItemsRef = useRef<ContentLibraryItem[] | null>(null);
  const pendingNoteOrderRef = useRef<ContentLibraryItem[] | null>(null);
  const linkedNotebookRef = useRef<ProjectData | null>(null);
  const linkedNotebookSavedSnapshotRef = useRef('');
  const linkedNotebookSessionIdRef = useRef<number | null>(null);
  const previewSyncFrameRef = useRef<number | null>(null);
  const editorScrollRatioRef = useRef(0);
  const previewOnlyScrollRatioRef = useRef(0);
  const wasMarkdownPreviewOnlyRef = useRef(false);
  const siteConfigLoadedRef = useRef(false);
  const siteConfigSnapshotRef = useRef('');
  const siteConfigSaveTimerRef = useRef<number | null>(null);
  const draftMetadataSaveTimerRef = useRef<number | null>(null);
  const pendingDraftMetadataRef = useRef<DraftAutoSaveMetadata | null>(null);
  const draftMetadataSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const publishLogSequenceRef = useRef(0);
  const publishLogViewRef = useRef<HTMLDivElement | null>(null);
  const pullLogSequenceRef = useRef(0);
  const pullLogViewRef = useRef<HTMLDivElement | null>(null);
  const pendingDesktopUpdateRef = useRef<Update | null>(null);
  const toastIdRef = useRef(0);
  const toastSweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = (id: number) => {
    setToastMessages((current) => current.filter((toast) => toast.id !== id));
  };

  const setStatus = (message: string) => {
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedMessage) {
      return;
    }
    const localizedMessage = localizeToastMessage(normalizedMessage);

    const id = ++toastIdRef.current;
    setToastMessages((current) => [
      ...current.slice(-3),
      {
        id,
        message: localizedMessage,
        tone: getToastTone(localizedMessage),
        expiresAt: Date.now() + 5000,
      },
    ]);
  };

  useEffect(() => {
    if (toastSweepTimerRef.current !== null) {
      clearTimeout(toastSweepTimerRef.current);
      toastSweepTimerRef.current = null;
    }

    if (toastMessages.length === 0) {
      return;
    }

    const now = Date.now();
    const activeToasts = toastMessages.filter((toast) => toast.expiresAt > now);
    if (activeToasts.length !== toastMessages.length) {
      setToastMessages(activeToasts);
      return;
    }

    const nextExpiresAt = Math.min(...activeToasts.map((toast) => toast.expiresAt));
    toastSweepTimerRef.current = setTimeout(() => {
      const currentTime = Date.now();
      setToastMessages((current) => current.filter((toast) => toast.expiresAt > currentTime));
    }, Math.max(0, nextExpiresAt - now + 20));

    return () => {
      if (toastSweepTimerRef.current !== null) {
        clearTimeout(toastSweepTimerRef.current);
        toastSweepTimerRef.current = null;
      }
    };
  }, [toastMessages]);

  useEffect(() => {
    let cancelled = false;

    ensureBlogPreviewServer()
      .then((server) => {
        if (!cancelled && server.origin) {
          setLocalBlogPreviewOrigin(server.origin);
        }
      })
      .catch(() => {
        // Keep the default origin; opening preview will surface the actionable error.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const view = publishLogViewRef.current;
    if (view) {
      view.scrollTop = view.scrollHeight;
    }
  }, [publishLogs.length]);

  useEffect(() => {
    const view = pullLogViewRef.current;
    if (view) {
      view.scrollTop = view.scrollHeight;
    }
  }, [pullLogs.length]);

  const formatPublishLatency = (latencyMs: number): string => `${Math.max(0, Math.round(latencyMs))} ms`;

  const formatPublishErrorDetail = (detail: string): string => {
    const firstLine = detail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine || '没有收到可识别的错误信息。';
  };

  const formatPublishStatusDetail = (statusResponse: PublishStatusResponse): string => {
    const version = statusResponse.branchExists
      ? `远端：${statusResponse.branch}@${statusResponse.remoteCommit ? statusResponse.remoteCommit.slice(0, 7) : '未知'}`
      : '远端分支：尚未创建';
    return [
      '连接：正常',
      `耗时：${formatPublishLatency(statusResponse.latencyMs)}`,
      statusResponse.proxySummary,
      version,
    ].join('\n');
  };

  const upsertPublishFlowEntry = (event: PublishProgressEvent) => {
    const normalizedProgress = clampNumber(event.progress, 0, 100);
    setPublishProgress((current) => {
      const nextProgress = Math.max(current, normalizedProgress);
      setPublishRunState(
        event.level === 'error'
          ? 'error'
          : nextProgress >= 100
            ? 'success'
            : 'running',
      );
      return nextProgress;
    });
    setPublishLogs((current) => {
      const receivedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const nextEntry: PublishLogEntry = {
        ...event,
        progress: normalizedProgress,
        id: ++publishLogSequenceRef.current,
        receivedAt,
      };
      const existingIndex = current.findIndex((entry) => entry.stage === event.stage);
      if (existingIndex < 0) {
        return [...current, nextEntry].slice(-8);
      }
      return current.map((entry, index) =>
        index === existingIndex
          ? {
              ...nextEntry,
              id: entry.id,
              receivedAt: entry.receivedAt,
            }
          : entry,
      );
    });
  };

  const publishFlowTitle = (() => {
    const connectionOnly = publishLogs.length > 0 && publishLogs.every((entry) => entry.stage === 'connection');
    if (connectionOnly) {
      if (publishRunState === 'error') return '连接失败';
      if (publishRunState === 'running') return '正在测试连接';
      return '连接正常';
    }
    if (publishRunState === 'success') return '同步完成';
    if (publishRunState === 'error') return '同步失败';
    return '正在同步';
  })();

  useEffect(() => {
    let cancelled = false;

    getDesktopAppVersion(DESKTOP_FALLBACK_VERSION)
      .then((version) => {
        if (!cancelled) {
          setDesktopVersion(normalizeDesktopVersion(version));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesktopVersion(DESKTOP_FALLBACK_VERSION);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let stopListening: (() => void) | null = null;

    listenToDesktopUpdateProgress((event) => {
      if (cancelled) {
        return;
      }

      setDesktopUpdateProgress(clampNumber(event.progress, 0, 100));
      if (event.stage === 'install') {
        setDesktopUpdateState('installing');
      } else {
        setDesktopUpdateState('downloading');
      }
      if (event.message) {
        setDesktopUpdateMessage(event.message);
      }
      setDesktopUpdateDetail(event.detail);
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        stopListening = unlisten;
      })
      .catch(() => {
        // The update fallback still works without progress events.
      });

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    linkedNotebookRef.current = linkedNotebook;
  }, [linkedNotebook]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    linkedNotebookSavedSnapshotRef.current = linkedNotebookSavedSnapshot;
  }, [linkedNotebookSavedSnapshot]);

  useEffect(() => {
    const expectedPanel = getWorkspacePanelForDraft(draft);
    if (workspacePanel !== expectedPanel) {
      setWorkspacePanel(expectedPanel);
    }
  }, [draft, workspacePanel]);

  useEffect(() => {
    if (!isTagPickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const panel = tagPickerRef.current;
      if (panel && event.target instanceof Node && panel.contains(event.target)) {
        return;
      }

      setIsTagPickerOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTagPickerOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTagPickerOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedAvatar = window.localStorage.getItem(BRAND_AVATAR_STORAGE_KEY);
      if (storedAvatar) {
        setBrandAvatar(storedAvatar);
      }
      setSshKeyPath(window.localStorage.getItem(SSH_KEY_PATH_STORAGE_KEY) ?? '');
    } catch {
      // Ignore local storage access failures.
    }
  }, []);

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      createTitleInputRef.current?.focus();
      createTitleInputRef.current?.select();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreateDialogOpen]);

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    const fallbackCategory =
      selectedCategorySlug && categories.some((category) => category.slug === selectedCategorySlug)
        ? selectedCategorySlug
        : categories[0]?.slug ?? '';

    if (!fallbackCategory) {
      setCreateCategoryValue('');
      setIsCreateDialogOpen(false);
      setStatus('\u8bf7\u5148\u65b0\u5efa\u7c7b\u76ee\uff0c\u518d\u5728\u7c7b\u76ee\u4e0b\u65b0\u5efa\u7b14\u8bb0\u3002');
      return;
    }

    if (!categories.some((category) => category.slug === createCategoryValue)) {
      setCreateCategoryValue(fallbackCategory);
    }
  }, [categories, createCategoryValue, isCreateDialogOpen, selectedCategorySlug]);

  useEffect(() => {
    if (!isMetadataDialogOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMetadataDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMetadataDialogOpen]);

  useEffect(() => {
    if (!draft) {
      setIsMetadataDialogOpen(false);
      setIsDeleteDialogOpen(false);
    }
  }, [draft]);

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        setIsDeleteDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBusy, isDeleteDialogOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      setCategoryDialog(null);
      setSiteIntegrationPanel(null);
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (siteIntegrationPanel) {
          setSiteIntegrationPanel(null);
          return;
        }

        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, siteIntegrationPanel]);

  useEffect(() => {
    if (!categoryDialog) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        setCategoryDialog(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [categoryDialog, isBusy]);

  useEffect(() => {
    if (!draggingCategorySlug) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sourceSlug = categoryDragSourceRef.current;
      if (!sourceSlug) {
        return;
      }

      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      const targetRow =
        targetElement instanceof Element
          ? targetElement.closest<HTMLElement>('[data-category-slug]')
          : null;
      const targetSlug = targetRow?.dataset.categorySlug ?? '';

      if (targetSlug) {
        reorderCategoryLocally(sourceSlug, targetSlug);
      }
    };

    const handlePointerRelease = () => {
      void finishCategoryPointerDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerRelease);
    window.addEventListener('pointercancel', handlePointerRelease);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerRelease);
      window.removeEventListener('pointercancel', handlePointerRelease);
    };
  }, [draggingCategorySlug]);

  useEffect(() => {
    if (!draggingSiteLink) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      const targetRow =
        targetElement instanceof Element
          ? targetElement.closest<HTMLElement>('[data-site-link-kind][data-site-link-index]')
          : null;
      const targetKind = targetRow?.dataset.siteLinkKind;
      const targetIndex = Number(targetRow?.dataset.siteLinkIndex ?? Number.NaN);

      if ((targetKind === 'friend' || targetKind === 'tool') && Number.isInteger(targetIndex)) {
        reorderSiteLinkLocally(targetKind, targetIndex);
      }
    };

    const handlePointerRelease = () => {
      finishSiteLinkPointerDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerRelease);
    window.addEventListener('pointercancel', handlePointerRelease);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerRelease);
      window.removeEventListener('pointercancel', handlePointerRelease);
    };
  }, [draggingSiteLink]);

  useEffect(() => {
    if (!draggingNotePath) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sourcePath = noteDragSourceRef.current;
      if (!sourcePath) {
        return;
      }

      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      const targetRow =
        targetElement instanceof Element
          ? targetElement.closest<HTMLElement>('[data-note-path]')
          : null;
      const targetPath = targetRow?.dataset.notePath ?? '';

      if (targetPath) {
        reorderNoteLocally(sourcePath, targetPath);
      }
    };

    const handlePointerRelease = () => {
      void finishNotePointerDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerRelease);
    window.addEventListener('pointercancel', handlePointerRelease);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerRelease);
      window.removeEventListener('pointercancel', handlePointerRelease);
    };
  }, [draggingNotePath]);

  useEffect(() => {
    if (!pendingSwitchItem) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isPendingSwitchSaving) {
        setPendingSwitchItem(null);
        setStatus('\u5df2\u8fd4\u56de\u5f53\u524d\u7b14\u8bb0\u3002');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPendingSwitchSaving, pendingSwitchItem]);

  useEffect(() => {
    if (!isTagPickerOpen) {
      return;
    }

    requestAnimationFrame(() => {
      tagInputRef.current?.focus();
      tagInputRef.current?.select();
    });
  }, [isTagPickerOpen]);

  const draftDirty = useMemo(() => {
    if (!draft) {
      return false;
    }

    if (cleanDraftsRef.current.has(draft)) {
      return false;
    }

    return isDraftDirty(draft);
  }, [draft]);
  const linkedNotebookSnapshot = useMemo(
    () => (linkedNotebook ? getProjectSnapshot(linkedNotebook) : ''),
    [linkedNotebook],
  );
  const notebookDirty = useMemo(
    () =>
      draft?.type === 'inknote' && linkedNotebook
        ? linkedNotebookSnapshot !== linkedNotebookSavedSnapshot
        : false,
    [draft?.type, linkedNotebook, linkedNotebookSavedSnapshot, linkedNotebookSnapshot],
  );
  const dirty = draftDirty || notebookDirty;
  const unsavedChangesMessage = useMemo(() => {
    if (draft?.type === 'inknote' && notebookDirty && draftDirty) {
      return '\u5f53\u524d Markdown \u6761\u76ee\u548c\u5173\u8054\u624b\u5199\u672c\u90fd\u6709\u672a\u4fdd\u5b58\u7684\u4fee\u6539\u3002';
    }

    if (draft?.type === 'inknote' && notebookDirty) {
      return '\u5173\u8054\u624b\u5199\u672c\u6709\u672a\u4fdd\u5b58\u7684\u4fee\u6539\u3002';
    }

    return '\u5f53\u524d\u7b14\u8bb0\u6709\u672a\u4fdd\u5b58\u7684\u4fee\u6539\u3002';
  }, [draft?.type, draftDirty, notebookDirty]);

  const saveTarget = draft ? getDraftSavePath(draft) : '';
  const linkedNotebookTarget =
    draft && draft.type === 'inknote' && draft.projectFile.trim()
      ? resolveSiblingContentPath(saveTarget, draft.projectFile.trim())
      : null;
  const tagList = useMemo(() => (draft ? toUniqueTagList(splitInlineList(draft.tagsText)) : []), [draft]);
  const availableTags = useMemo(
    () =>
      toUniqueTagList([
        ...items.flatMap((item) => getFrontmatterTags(item.frontmatter.tags)),
        ...tagList,
      ]),
    [items, tagList],
  );
  const normalizedTagInput = tagInputValue.trim().replace(/\s+/g, ' ');
  const filteredAvailableTags = useMemo(() => {
    const keyword = normalizedTagInput.toLocaleLowerCase();
    if (!keyword) {
      return availableTags;
    }

    return availableTags.filter((tag) => tag.toLocaleLowerCase().includes(keyword));
  }, [availableTags, normalizedTagInput]);
  const previewBody = draft?.body ?? '';
  const deferredPreviewBody = useDeferredValue(previewRenderBody);
  const renderedPreview = useMemo(
    () => (
      <MarkdownPreview markdown={resolveDesktopContentImages(deferredPreviewBody, libraryRoot, localBlogPreviewOrigin)} />
    ),
    [deferredPreviewBody, libraryRoot, localBlogPreviewOrigin],
  );

  useEffect(() => {
    if (previewBody === previewRenderBody) {
      setIsPreviewRenderPending(false);
      return;
    }

    setIsPreviewRenderPending(true);

    const delay = previewBody.length > 2500 ? 220 : 120;
    const timeout = window.setTimeout(() => {
      startTransition(() => {
        setPreviewRenderBody(previewBody);
        setIsPreviewRenderPending(false);
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [previewBody, previewRenderBody]);

  const syncPreviewPosition = () => {
    previewSyncFrameRef.current = null;

    const editor = editorRef.current;
    const previewPane = previewPaneRef.current;
    const previewArticle = previewArticleRef.current;

    if (!previewPane || !previewArticle) {
      return;
    }

    if (!editor) {
      previewArticle.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    const sourceScrollable = editor.scrollHeight - editor.clientHeight;
    const targetScrollable = previewArticle.offsetHeight - previewPane.clientHeight;

    if (sourceScrollable <= 0 || targetScrollable <= 0) {
      previewArticle.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    const offset = (editor.scrollTop / sourceScrollable) * targetScrollable;
    previewArticle.style.transform = `translate3d(0, -${offset}px, 0)`;
  };

  const getScrollRatio = (element: HTMLElement): number => {
    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) {
      return 0;
    }

    return clampNumber(element.scrollTop / scrollable, 0, 1);
  };

  const applyScrollRatio = (element: HTMLElement, ratio: number) => {
    const scrollable = element.scrollHeight - element.clientHeight;
    element.scrollTop = scrollable > 0 ? clampNumber(ratio, 0, 1) * scrollable : 0;
  };

  const updateEditorScrollRatio = () => {
    const editor = editorRef.current;
    if (editor) {
      editorScrollRatioRef.current = getScrollRatio(editor);
    }
  };

  const updatePreviewOnlyScrollRatio = () => {
    const previewPane = previewPaneRef.current;
    if (previewPane) {
      previewOnlyScrollRatioRef.current = getScrollRatio(previewPane);
    }
  };

  const schedulePreviewPositionSync = () => {
    if (previewSyncFrameRef.current !== null) {
      return;
    }

    previewSyncFrameRef.current = window.requestAnimationFrame(syncPreviewPosition);
  };

  const handleEditorScroll = () => {
    updateEditorScrollRatio();
    schedulePreviewPositionSync();
  };

  const handlePreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    event.preventDefault();
    editor.scrollTop += event.deltaY;
    updateEditorScrollRatio();
    schedulePreviewPositionSync();
  };

  const handlePreviewOnlyScroll = () => {
    updatePreviewOnlyScrollRatio();
  };

  useEffect(() => {
    const isMarkdownPreviewOnly = Boolean(draft && draft.type !== 'inknote' && showPreview);
    const wasMarkdownPreviewOnly = wasMarkdownPreviewOnlyRef.current;
    wasMarkdownPreviewOnlyRef.current = isMarkdownPreviewOnly;

    const frame = window.requestAnimationFrame(() => {
      const previewPane = previewPaneRef.current;
      const previewArticle = previewArticleRef.current;

      if (isMarkdownPreviewOnly) {
        if (previewArticle) {
          previewArticle.style.transform = 'translate3d(0, 0, 0)';
        }

        if (previewPane) {
          applyScrollRatio(
            previewPane,
            wasMarkdownPreviewOnly ? previewOnlyScrollRatioRef.current : editorScrollRatioRef.current,
          );
          updatePreviewOnlyScrollRatio();
        }
        return;
      }

      if (wasMarkdownPreviewOnly) {
        const editor = editorRef.current;
        if (editor) {
          applyScrollRatio(editor, previewOnlyScrollRatioRef.current);
          updateEditorScrollRatio();
        }

        if (previewPane) {
          previewPane.scrollTop = 0;
        }
      }

      schedulePreviewPositionSync();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [draft?.type, showPreview, deferredPreviewBody]);

  useEffect(() => {
    const previewPane = previewPaneRef.current;
    const previewArticle = previewArticleRef.current;
    const editor = editorRef.current;

    if (!previewPane || !previewArticle || !editor || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(schedulePreviewPositionSync);

    observer.observe(previewPane);
    observer.observe(previewArticle);
    observer.observe(editor);

    return () => observer.disconnect();
  }, [showPreview, deferredPreviewBody]);

  useEffect(
    () => () => {
      if (previewSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(previewSyncFrameRef.current);
        previewSyncFrameRef.current = null;
      }
    },
    [],
  );

  const activateDraft = (nextDraft: ContentDraft | null) => {
    draftUndoStackRef.current = [];
    draftRedoStackRef.current = [];
    linkedNotebookUndoStackRef.current = [];
    linkedNotebookRedoStackRef.current = [];
    editorSelectionRef.current = null;
    setDraftSessionId((current) => current + 1);
    setDraft(nextDraft);
    setShowHistoryPanel(false);
    setHistoryEntries(
      nextDraft
        ? [createHistoryEntry(nextDraft.sourceRelativePath ? 'Opened note' : 'Started new draft', nextDraft.title)]
      : [],
    );
  };

  const readEditorSelection = (): EditorSelectionState | null => {
    const editor = editorRef.current;
    if (!editor) {
      return null;
    }

    return {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      direction: editor.selectionDirection,
    };
  };

  const clampEditorSelection = (selection: EditorSelectionState, maxLength: number): EditorSelectionState => {
    const start = Math.max(0, Math.min(selection.start, maxLength));
    const end = Math.max(0, Math.min(selection.end, maxLength));

    return {
      start,
      end,
      direction: selection.direction,
    };
  };

  const captureEditorSelection = () => {
    editorSelectionRef.current = readEditorSelection();
  };

  const restoreEditorSelection = (selection: EditorSelectionState | null) => {
    if (!selection) {
      return;
    }

    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const nextSelection = clampEditorSelection(selection, editor.value.length);
      editor.focus();
      editor.setSelectionRange(nextSelection.start, nextSelection.end, nextSelection.direction);
      editorSelectionRef.current = nextSelection;
    });
  };

  const applyPendingEditorViewRestore = () => {
    const pending = pendingEditorViewRestoreRef.current;
    const editor = editorRef.current;
    if (!pending || !editor) {
      return;
    }

    const nextSelection = clampEditorSelection(pending.selection, editor.value.length);

    editor.scrollTop = pending.scrollTop;
    editorScrollRatioRef.current = pending.scrollRatio;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(nextSelection.start, nextSelection.end, nextSelection.direction);
    editor.scrollTop = pending.scrollTop;
    editorSelectionRef.current = nextSelection;
    schedulePreviewPositionSync();

    if (pending.attempts <= 1) {
      pendingEditorViewRestoreRef.current = null;
      return;
    }

    pendingEditorViewRestoreRef.current = {
      ...pending,
      selection: nextSelection,
      attempts: pending.attempts - 1,
    };
    requestAnimationFrame(applyPendingEditorViewRestore);
  };

  const restoreEditorViewAfterTransform = (
    result: TextTransformResult,
    scrollTop: number,
    scrollRatio: number,
  ) => {
    pendingEditorViewRestoreRef.current = {
      selection: {
        start: result.nextSelectionStart,
        end: result.nextSelectionEnd,
        direction: 'none',
      },
      scrollTop,
      scrollRatio,
      attempts: 16,
    };
    requestAnimationFrame(applyPendingEditorViewRestore);
  };

  useLayoutEffect(() => {
    applyPendingEditorViewRestore();
  });

  const appendHistoryEntry = (label: string, detail = '') => {
    setHistoryEntries((current) => [createHistoryEntry(label, detail), ...current].slice(0, NOTE_HISTORY_LIMIT));
  };

  const checkGitHubReleaseUpdates = async (fallbackDetail = '') => {
    const releaseHeaders = {
      Accept: 'application/vnd.github+json',
    };
    const findInstallerUrl = (
      assets: Array<Partial<{ name: string; browser_download_url: string }>> | undefined,
    ): string | undefined => {
      const candidates = (assets ?? [])
        .map((asset) => ({
          name: asset.name?.trim() ?? '',
          url: asset.browser_download_url?.trim() ?? '',
        }))
        .filter((asset) => asset.name.toLocaleLowerCase().endsWith('.exe') && asset.url);

      return (
        candidates.find((asset) => /x64.*setup/i.test(asset.name)) ??
        candidates.find((asset) => /setup/i.test(asset.name)) ??
        candidates[0]
      )?.url;
    };
    const parseRelease = (data: Partial<{
      tag_name: string;
      name: string;
      html_url: string;
      published_at: string;
      assets: Array<Partial<{ name: string; browser_download_url: string }>>;
    }>): DesktopReleaseInfo => {
      const latestVersion = normalizeDesktopVersion(data.tag_name ?? data.name ?? '');

      if (!latestVersion) {
        throw new Error('\u672a\u8bfb\u53d6\u5230\u6700\u65b0\u7248\u672c\u53f7');
      }

      return {
        version: latestVersion,
        name: data.name?.trim() || `v${latestVersion}`,
        url: data.html_url?.trim() || DESKTOP_RELEASES_URL,
        installerUrl: findInstallerUrl(data.assets),
        publishedAt: data.published_at?.trim() || '',
      };
    };

    const latestResponse = await fetch(DESKTOP_LATEST_RELEASE_API_URL, {
      headers: {
        ...releaseHeaders,
      },
      cache: 'no-store',
    });

    let releaseInfo: DesktopReleaseInfo | null = null;

    if (latestResponse.ok) {
      releaseInfo = parseRelease(await latestResponse.json());
    } else if (latestResponse.status === 404) {
      const releasesResponse = await fetch(DESKTOP_RELEASES_API_URL, {
        headers: {
          ...releaseHeaders,
        },
        cache: 'no-store',
      });

      if (!releasesResponse.ok) {
        if (releasesResponse.status === 404) {
          throw new Error(`\u65e0\u6cd5\u8bbf\u95ee GitHub \u4ed3\u5e93 ${DESKTOP_RELEASE_REPOSITORY}`);
        }
        throw new Error(`GitHub API ${releasesResponse.status}`);
      }

      const releases = (await releasesResponse.json()) as Array<Partial<{
        tag_name: string;
        name: string;
        html_url: string;
        published_at: string;
      }>>;
      if (releases.length > 0) {
        releaseInfo = parseRelease(releases[0]);
      } else {
        const tagsResponse = await fetch(DESKTOP_TAGS_API_URL, {
          headers: {
            ...releaseHeaders,
          },
          cache: 'no-store',
        });
        const tagLabel = tagsResponse.ok
          ? ((await tagsResponse.json()) as Array<{ name?: string }>)[0]?.name?.trim()
          : '';

        setLatestDesktopRelease(
          tagLabel
            ? {
                version: normalizeDesktopVersion(tagLabel),
                name: tagLabel,
                url: DESKTOP_RELEASES_URL,
                publishedAt: '',
              }
            : null,
        );
        setDesktopUpdateState('empty');
        setDesktopUpdateMessage(
          tagLabel
            ? `\u5df2\u627e\u5230\u6807\u7b7e ${tagLabel}\uff0c\u4f46\u8fd8\u6ca1\u6709\u53d1\u5e03 Release`
            : '\u8fd8\u6ca1\u6709\u53d1\u5e03\u684c\u9762\u7aef\u7248\u672c',
        );
        setDesktopUpdateDetail(fallbackDetail);
        return;
      }
    } else {
      throw new Error(`GitHub API ${latestResponse.status}`);
    }

    setLatestDesktopRelease(releaseInfo);

    if (compareDesktopVersions(releaseInfo.version, desktopVersion) > 0) {
      setDesktopUpdateState('available');
      setDesktopUpdateMessage(`\u53d1\u73b0\u65b0\u7248\u672c v${releaseInfo.version}`);
      setDesktopUpdateDetail(
        fallbackDetail ||
          (releaseInfo.installerUrl
            ? '\u5b98\u65b9\u81ea\u52a8\u66f4\u65b0\u672a\u8fd4\u56de\u53ef\u5b89\u88c5\u5305\uff0c\u5df2\u63d0\u4f9b\u5b89\u88c5\u5305\u4e0b\u8f7d\u3002'
            : '\u81ea\u52a8\u66f4\u65b0\u4e0d\u53ef\u7528\uff0c\u53ef\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u3002'),
      );
      return;
    }

    setDesktopUpdateState('latest');
    setDesktopUpdateMessage(`\u5df2\u662f\u6700\u65b0\u7248\u672c v${desktopVersion}`);
    setDesktopUpdateDetail(fallbackDetail);
  };

  const checkDesktopUpdates = async () => {
    pendingDesktopUpdateRef.current = null;
    setDesktopUpdateProgress(0);
    setDesktopUpdateDetail('');
    setDesktopUpdateState('checking');
    setDesktopUpdateMessage(
      isTauri() ? '\u6b63\u5728\u68c0\u67e5\u81ea\u52a8\u66f4\u65b0...' : '\u6b63\u5728\u68c0\u67e5 GitHub Releases...',
    );

    try {
      if (isTauri()) {
        try {
          const update = await checkTauriDesktopUpdate();
          if (update) {
            pendingDesktopUpdateRef.current = update;
            const latestVersion = normalizeDesktopVersion(update.version);
            setLatestDesktopRelease({
              version: latestVersion,
              name: `v${latestVersion}`,
              url: DESKTOP_RELEASES_URL,
              publishedAt: update.date ?? '',
            });
            setDesktopUpdateState('available');
            setDesktopUpdateMessage(`\u53d1\u73b0\u65b0\u7248\u672c v${latestVersion}`);
            setDesktopUpdateDetail(update.body?.trim() || '\u53ef\u76f4\u63a5\u4e0b\u8f7d\u5e76\u5b89\u88c5\u66f4\u65b0\u3002');
            return;
          }

          await checkGitHubReleaseUpdates(
            '\u5b98\u65b9\u81ea\u52a8\u66f4\u65b0\u672a\u8fd4\u56de\u53ef\u5b89\u88c5\u5305\uff0c\u5df2\u5207\u6362\u5230\u5b89\u88c5\u5305\u4e0b\u8f7d\u3002',
          );
          return;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await checkGitHubReleaseUpdates(
            detail
              ? `\u81ea\u52a8\u66f4\u65b0\u4e0d\u53ef\u7528\uff1a${detail}\uff1b\u5df2\u5207\u6362\u5230\u5b89\u88c5\u5305\u4e0b\u8f7d\u3002`
              : '',
          );
          return;
        }
      }

      await checkGitHubReleaseUpdates();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setDesktopUpdateState('error');
      setDesktopUpdateMessage(`\u68c0\u67e5\u5931\u8d25\uff1a${detail}`);
      setDesktopUpdateDetail('');
      setLatestDesktopRelease(null);
    }
  };

  const installDesktopUpdate = async () => {
    const update = pendingDesktopUpdateRef.current;
    if (!update) {
      setDesktopUpdateState('error');
      setDesktopUpdateMessage('\u5f53\u524d\u7248\u672c\u65e0\u6cd5\u76f4\u63a5\u5b89\u88c5\u66f4\u65b0');
      setDesktopUpdateDetail('\u8bf7\u91cd\u65b0\u68c0\u67e5\u66f4\u65b0\uff0c\u6216\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u3002');
      return;
    }

    let downloaded = 0;
    let contentLength = 0;
    setDesktopUpdateState('downloading');
    setDesktopUpdateProgress(0);
    setDesktopUpdateMessage(`\u6b63\u5728\u4e0b\u8f7d v${normalizeDesktopVersion(update.version)}...`);
    setDesktopUpdateDetail('');

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          downloaded = 0;
          setDesktopUpdateProgress(0);
          setDesktopUpdateDetail(contentLength > 0 ? `0 / ${Math.round(contentLength / 1024 / 1024)} MB` : '');
          return;
        }

        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const nextProgress = Math.min(99, Math.round((downloaded / contentLength) * 100));
            setDesktopUpdateProgress(nextProgress);
            setDesktopUpdateDetail(
              `${Math.round(downloaded / 1024 / 1024)} / ${Math.round(contentLength / 1024 / 1024)} MB`,
            );
          }
          return;
        }

        if (event.event === 'Finished') {
          setDesktopUpdateProgress(100);
          setDesktopUpdateState('installing');
          setDesktopUpdateMessage('\u66f4\u65b0\u5df2\u4e0b\u8f7d\uff0c\u6b63\u5728\u5b89\u88c5...');
          setDesktopUpdateDetail('\u5b89\u88c5\u5b8c\u6210\u540e\u5c06\u91cd\u542f\u5e94\u7528\u3002');
        }
      });

      setDesktopUpdateProgress(100);
      setDesktopUpdateState('installing');
      setDesktopUpdateMessage('\u66f4\u65b0\u5b89\u88c5\u5b8c\u6210\uff0c\u6b63\u5728\u91cd\u542f...');
      await relaunch();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setDesktopUpdateState('error');
      setDesktopUpdateMessage(`\u66f4\u65b0\u5931\u8d25\uff1a${detail}`);
      setDesktopUpdateDetail('\u53ef\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u6700\u65b0\u7248\u672c\u3002');
    }
  };

  const installDesktopReleaseInstaller = async () => {
    const installerUrl = latestDesktopRelease?.installerUrl;
    if (!installerUrl) {
      setDesktopUpdateState('error');
      setDesktopUpdateMessage('\u672a\u627e\u5230 Windows \u5b89\u88c5\u5305');
      setDesktopUpdateDetail('\u8bf7\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u3002');
      return;
    }

    setDesktopUpdateState('downloading');
    setDesktopUpdateProgress(15);
    setDesktopUpdateMessage(`\u6b63\u5728\u4e0b\u8f7d v${latestDesktopRelease.version} \u5b89\u88c5\u5305...`);
    setDesktopUpdateDetail('\u5b98\u65b9\u81ea\u52a8\u66f4\u65b0\u4e0d\u53ef\u7528\uff0c\u6b63\u5728\u4f7f\u7528 GitHub Release \u5b89\u88c5\u5305\u5347\u7ea7\u3002');

    try {
      const installerPath = await downloadAndRunDesktopInstaller(installerUrl);
      setDesktopUpdateProgress(100);
      setDesktopUpdateState('installing');
      setDesktopUpdateMessage('\u5b89\u88c5\u5305\u5df2\u542f\u52a8');
      setDesktopUpdateDetail(`\u8bf7\u6309\u5b89\u88c5\u5668\u63d0\u793a\u5b8c\u6210\u66f4\u65b0\uff1a${installerPath}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setDesktopUpdateState('error');
      setDesktopUpdateProgress(0);
      setDesktopUpdateMessage(`\u4e0b\u8f7d\u5b89\u88c5\u5305\u5931\u8d25\uff1a${detail}`);
      setDesktopUpdateDetail('\u53ef\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u4e0b\u8f7d\u6700\u65b0\u7248\u672c\u3002');
    }
  };

  const refreshPublishStatus = async () => {
    if (!isTauri()) {
      setStatus('发布需要在 Tauri 桌面端中执行。');
      return;
    }

    const repository = siteConfigDraft.repository;
    const remote = repository?.remote.trim() ?? '';
    const branch = getRepositoryContentBranch(repository);
    const selectedSshKeyPath = sshKeyPath.trim();
    if (!remote || !branch) {
      setPublishConnectionMessage('请先填写远程仓库和内容分支。');
      setStatus('请先填写远程仓库和内容分支。');
      setPublishLogs([]);
      setPublishProgress(0);
      setPublishRunState('error');
      return;
    }

    setIsTestingRemote(true);
    setPublishConnectionMessage('正在连接远程仓库...');
    setPublishLogs([]);
    upsertPublishFlowEntry({
      taskId: `connection-${Date.now()}`,
      progress: 15,
      stage: 'connection',
      message: '正在测试远程连接',
      detail: `目标分支：${branch}`,
      level: 'info',
    });

    try {
      const nextStatus = await getPublishStatus(remote, branch, selectedSshKeyPath);
      setPublishConnectionMessage(nextStatus.shortStatus);
      setStatus(nextStatus.shortStatus);
      upsertPublishFlowEntry({
        taskId: `connection-${Date.now()}`,
        progress: 100,
        stage: 'connection',
        message: '连接测试通过',
        detail: formatPublishStatusDetail(nextStatus),
        level: 'success',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      const message = `连接失败：${detail || '未知错误'}`;
      setPublishConnectionMessage(message);
      setStatus(detail || '读取发布状态失败。');
      upsertPublishFlowEntry({
        taskId: `connection-${Date.now()}`,
        progress: 100,
        stage: 'connection',
        message: '连接测试失败',
        detail: formatPublishErrorDetail(detail),
        level: 'error',
      });
    } finally {
      setIsTestingRemote(false);
    }
  };

  const publishSiteChanges = async () => {
    setIsPublishDialogOpen(false);
    await syncSiteChanges();
    return;

    setIsPublishDialogOpen(true);
    if (!isTauri()) {
      setStatus('发布需要在 Tauri 桌面端中执行。');
      return;
    }

    const message = publishMessage.trim();
    if (!message) {
      setStatus('发布前请填写提交说明。');
      return;
    }

    const taskId = globalThis.crypto?.randomUUID?.() ?? `publish-${Date.now()}`;
    let currentProgress = 2;
    const recordProgress = (event: PublishProgressEvent) => {
      const normalizedProgress = Math.max(0, Math.min(100, event.progress));
      currentProgress = normalizedProgress;
      setPublishProgress(normalizedProgress);
      setPublishRunState(
        event.level === 'error'
          ? 'error'
          : normalizedProgress >= 100
            ? 'success'
            : 'running',
      );
      setPublishLogs((current) => [
        ...current,
        {
          ...event,
          progress: normalizedProgress,
          id: ++publishLogSequenceRef.current,
          receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        },
      ].slice(-120));
    };

    setPublishLogs([]);
    setPublishProgress(2);
    setPublishRunState('running');
    setIsPublishingSite(true);
    let stopListening: (() => void) | null = null;

    try {
      stopListening = await listenToPublishProgress((event) => {
        if (event.taskId === taskId) {
          recordProgress(event);
        }
      });
      recordProgress({
        taskId,
        progress: 2,
        stage: 'prepare',
        message: '正在准备发布',
        detail: '已创建发布任务，开始检查本地内容。',
        level: 'info',
      });
      if (draft && dirty) {
        recordProgress({
          taskId,
          progress: 5,
          stage: 'save',
          message: '正在保存当前文章',
          detail: draft?.title ?? '',
          level: 'info',
        });
        const savedItem = await saveDraft();
        if (!savedItem) {
          recordProgress({
            taskId,
            progress: 5,
            stage: 'save',
            message: '当前文章保存失败',
            detail: '发布已停止，请先修正文章保存错误。',
            level: 'error',
          });
          return;
        }
        recordProgress({
          taskId,
          progress: 8,
          stage: 'save',
          message: '当前文章已保存',
          detail: savedItem?.relativePath ?? '',
          level: 'success',
        });
      } else {
        recordProgress({
          taskId,
          progress: 8,
          stage: 'save',
          message: '本地文章已就绪',
          detail: '没有待保存的正文修改。',
          level: 'success',
        });
      }

      recordProgress({
        taskId,
        progress: 10,
        stage: 'config',
        message: '正在保存站点设置',
        detail: '同步仓库、分支和博客配置。',
        level: 'info',
      });
      const savedConfig = await saveSiteConfig();
      if (!savedConfig) {
        recordProgress({
          taskId,
          progress: 10,
          stage: 'config',
          message: '站点设置保存失败',
          detail: '发布已停止，请检查站点配置。',
          level: 'error',
        });
        return;
      }

      const normalizedLibraryRoot = libraryRoot.replace(/[\\/]+$/, '');
      const siteConfigDisplayPath = normalizedLibraryRoot
        ? `${normalizedLibraryRoot}/site/site.config.json`
        : 'site/site.config.json';
      recordProgress({
        taskId,
        progress: 12,
        stage: 'config',
        message: '已确认本次发布使用的内容库',
        detail: `内容库：${libraryRoot}\n配置：${siteConfigDisplayPath}\n标题：${savedConfig?.title ?? ''}`,
        level: 'success',
      });

      const repository = savedConfig?.repository;
      const remote = repository?.remote.trim() ?? '';
      const branch = getRepositoryContentBranch(repository);
      const basePath = inferGitHubPagesBasePath(remote);
      const selectedSshKeyPath = sshKeyPath.trim();
      if (!remote || !branch) {
        recordProgress({
          taskId,
          progress: 10,
          stage: 'config',
          message: '发布配置不完整',
          detail: '请填写远程仓库地址。',
          level: 'error',
        });
        setStatus('请先填写远程仓库。');
        return;
      }

      recordProgress({
        taskId,
        progress: 14,
        stage: 'config',
        message: '已自动推导站点基础路径',
        detail: `${remote} -> ${basePath}`,
        level: 'success',
      });

      const result = await publishContentChanges({
        taskId,
        remote,
        branch,
        basePath,
        sshKeyPath: selectedSshKeyPath,
        message,
      });
      appendHistoryEntry('Published site', message);
      setStatus(result.stdout || '\u5df2将静态站点发布到远程分支。');
      try {
        const nextStatus = await getPublishStatus(remote, branch, selectedSshKeyPath);
        setPublishConnectionMessage(nextStatus.shortStatus);
      } catch (error) {
        recordProgress({
          taskId,
          progress: 100,
          stage: 'status',
          message: '站点已发布，但状态刷新失败',
          detail: formatUnknownError(error),
          level: 'warning',
        });
      }
    } catch (error) {
      const detail = formatUnknownError(error);
      setStatus(detail || '发布站点变更失败。');
      recordProgress({
        taskId,
        progress: currentProgress,
        stage: 'failed',
        message: '发布任务已终止',
        detail: detail || '没有收到可识别的错误信息。',
        level: 'error',
      });
    } finally {
      stopListening?.();
      setIsPublishingSite(false);
    }
  };

  const openSitePublishDialog = () => {
    setIsPublishDialogOpen(true);
    if (!isPublishingSite) {
      void publishSiteChanges();
    }
  };

  const openPullRemoteContentDialog = () => {
    setIsPullDialogOpen(true);
  };

  const pullRemoteContentToLocal = async (
    strategyOverride?: PullConflictStrategy,
    conflictResolutions?: ContentSyncConflictResolutions,
    allowRiskyContentSync = false,
  ) => {
    setIsPullDialogOpen(true);
    if (isPullingContent && !allowRiskyContentSync) {
      return;
    }
    if (!isTauri()) {
      setStatus('远端同步需要在 Tauri 桌面端中执行。');
      return;
    }

    const configuredRepository = siteConfigDraft.repository;
    const configuredRemote = configuredRepository?.remote.trim() ?? '';
    const configuredBranch = getRepositoryContentBranch(configuredRepository);
    if (!configuredRemote || !configuredBranch) {
      setStatus('请先填写远程仓库和内容分支。');
      setPullLogs([]);
      setPullRunState('error');
      return;
    }

    const activeConflictStrategy: PullConflictStrategy = 'manual';
    const isResolvingConflicts = Boolean(conflictResolutions);
    const conflictLabel = '逐项选择';
    if (!strategyOverride) {
      const confirmed = window.confirm(
        `将从远端内容分支合并内容到本地；删除会按三方记录同步，冲突时使用“${conflictLabel}”。是否继续？`,
      );
      if (!confirmed) {
        setStatus('已取消远端内容同步。');
        return;
      }
    }

    const taskId = globalThis.crypto?.randomUUID?.() ?? `pull-${Date.now()}`;
    let currentProgress = isResolvingConflicts ? Math.max(pullProgress, 2) : 2;
    const recordProgress = (event: PublishProgressEvent) => {
      const normalizedEventProgress = Math.max(0, Math.min(100, event.progress));
      const normalizedProgress = isResolvingConflicts
        ? Math.max(currentProgress, normalizedEventProgress)
        : normalizedEventProgress;
      currentProgress = normalizedProgress;
      setPullProgress(normalizedProgress);
      setPullRunState(
        event.level === 'error'
          ? 'error'
          : normalizedProgress >= 100
            ? 'success'
            : 'running',
      );
      setPullLogs((current) => [
        ...current,
        {
          ...event,
          progress: normalizedProgress,
          id: ++pullLogSequenceRef.current,
          receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        },
      ].slice(-120));
    };

    if (!isResolvingConflicts) {
      setPullLogs([]);
      setPullProgress(2);
    }
    setPullRunState('running');
    setIsPullingContent(true);
    let stopListening: (() => void) | null = null;

    try {
      stopListening = await listenToContentSyncProgress((event) => {
        if (event.taskId === taskId) {
          recordProgress(event);
        }
      });
      if (isResolvingConflicts) {
        recordProgress({
          taskId,
          progress: currentProgress,
          stage: 'conflict',
          message: '已选择冲突处理',
          detail: '正在按选择继续同步。',
          level: 'info',
        });
      } else {
        recordProgress({
          taskId,
          progress: 2,
          stage: 'prepare',
          message: '正在准备远端同步',
          detail: `本次操作会合并远端内容分支；真实冲突会暂停并逐项选择保留哪一侧。`,
          level: 'info',
        });

        recordProgress({
          taskId,
          progress: 5,
          stage: 'config',
          message: '正在保存站点设置',
          detail: '确保仓库地址和分支配置已经写入本地。',
          level: 'info',
        });
      }
      const savedConfig = await saveSiteConfig();
      if (!savedConfig) {
        recordProgress({
          taskId,
          progress: 5,
          stage: 'config',
          message: '站点设置保存失败',
          detail: '远端同步已停止，请先修正站点设置。',
          level: 'error',
        });
        return;
      }

      const repository = savedConfig.repository;
      const remote = repository?.remote.trim() ?? '';
      const branch = getRepositoryContentBranch(repository);
      const selectedSshKeyPath = sshKeyPath.trim();
      if (!remote || !branch) {
        recordProgress({
          taskId,
          progress: 5,
          stage: 'config',
          message: '远端同步配置不完整',
          detail: '请填写远程仓库地址和内容分支。',
          level: 'error',
        });
        return;
      }

      const result = await pullRemoteContent({
        taskId,
        remote,
        branch,
        contentBranch: branch,
        sshKeyPath: selectedSshKeyPath,
        conflictStrategy: activeConflictStrategy,
        conflictResolutions,
        allowRiskyContentSync,
      });

      draftCacheRef.current.clear();
      cleanDraftsRef.current = new WeakSet();
      clearLinkedNotebookState();
      await loadSiteConfig();
      await loadLibrary(undefined, true);
      if (isSettingsOpen && settingsSection === 'images') {
        await loadUserGalleryManifest();
      }
      appendHistoryEntry('Pulled remote content', branch);
      setStatus(result.stdout || '已从远端同步内容到本地。');

      try {
        const nextStatus = await getPublishStatus(remote, branch, selectedSshKeyPath);
        setPublishConnectionMessage(nextStatus.shortStatus);
      } catch {
        setPublishConnectionMessage('远端内容已同步，但连接状态刷新失败。');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      const conflicts = parseContentSyncConflictError(detail);
      if (conflicts) {
        setContentSyncConflictDialog({
          conflicts,
          source: 'pull',
          resolutions: createContentSyncConflictResolutions(conflicts),
        });
        setStatus(`发现 ${conflicts.length} 个内容冲突，请逐项选择保留本地或远端版本。`);
        recordProgress({
          taskId,
          progress: currentProgress,
          stage: 'conflict',
          message: '发现内容冲突',
          detail: `共 ${conflicts.length} 个冲突，等待逐项选择。`,
          level: 'warning',
        });
        return;
      }
      const risk = parseContentSyncRiskError(detail);
      if (risk) {
        recordProgress({
          taskId,
          progress: currentProgress,
          stage: 'risk',
          message: risk.title,
          detail: risk.detail,
          level: 'warning',
        });
        const confirmed = window.confirm(`${risk.title}\n\n${risk.detail}\n\n确认继续吗？`);
        if (confirmed) {
          window.setTimeout(() => {
            void pullRemoteContentToLocal(strategyOverride, conflictResolutions, true);
          }, 0);
        } else {
          setStatus('已取消远端内容同步。');
        }
        return;
      }
      setStatus(detail || '远端内容同步失败。');
      recordProgress({
        taskId,
        progress: currentProgress,
        stage: 'failed',
        message: '远端同步任务已终止',
        detail: detail || '没有收到可识别的错误信息。',
        level: 'error',
      });
    } finally {
      stopListening?.();
      setIsPullingContent(false);
    }
  };

  const syncSiteChanges = async (
    strategyOverride?: PullConflictStrategy,
    conflictResolutions?: ContentSyncConflictResolutions,
    allowRiskyContentSync = false,
  ) => {
    if ((isPublishingSite || isPullingContent) && !allowRiskyContentSync) {
      return;
    }

    if (!isTauri()) {
      setStatus('站点同步需要在 Tauri 桌面端中执行。');
      return;
    }

    const message = publishMessage.trim() || DEFAULT_SYNC_MESSAGE;

    const configuredRepository = siteConfigDraft.repository;
    const configuredRemote = configuredRepository?.remote.trim() ?? '';
    const configuredContentBranch = getRepositoryContentBranch(configuredRepository);
    if (!configuredRemote || !configuredContentBranch) {
      setStatus('请先配置远程仓库和内容分支。');
      setPublishLogs([]);
      setPublishProgress(0);
      setPublishRunState('error');
      return;
    }

    const activeConflictStrategy: PullConflictStrategy = 'manual';
    const isResolvingConflicts = Boolean(conflictResolutions);
    const taskId = globalThis.crypto?.randomUUID?.() ?? `sync-${Date.now()}`;
    const conflictLabel = '逐项选择';
    const selectedSshKeyPath = sshKeyPath.trim();
    let currentProgress = isResolvingConflicts ? Math.max(publishProgress, 58) : 2;

    const updateRunProgress = (
      rawProgress: number,
      options: { offset?: number; scale?: number; forceRunState?: PublishRunState; level?: PublishProgressEvent['level'] } = {},
    ) => {
      const normalizedProgress = Math.max(0, Math.min(100, rawProgress));
      const nextMappedProgress = Math.max(
        0,
        Math.min(100, Math.round((options.offset ?? 0) + normalizedProgress * (options.scale ?? 1))),
      );
      const mappedProgress = isResolvingConflicts
        ? Math.max(currentProgress, nextMappedProgress)
        : nextMappedProgress;
      currentProgress = mappedProgress;
      setPublishProgress(mappedProgress);
      setPublishRunState(
        options.forceRunState ??
          (options.level === 'error'
            ? 'error'
            : mappedProgress >= 100
              ? 'success'
              : 'running'),
      );
    };

    const recordManualProgress = (
      progress: number,
      stage: string,
      messageText: string,
      detail: string,
      level: PublishProgressEvent['level'] = 'info',
    ) => {
      updateRunProgress(progress, {
        forceRunState: progress >= 100 && level !== 'error' ? 'success' : level === 'error' ? 'error' : 'running',
        level,
      });
      setPublishLogs((current) => {
        const receivedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const nextEntry: PublishLogEntry = {
          taskId,
          progress,
          stage,
          message: messageText,
          detail,
          level,
          id: ++publishLogSequenceRef.current,
          receivedAt,
        };
        const existingIndex = current.findIndex((entry) => entry.stage === stage);
        if (existingIndex < 0) {
          return [...current, nextEntry].slice(-8);
        }

        return current.map((entry, index) =>
          index === existingIndex
            ? {
                ...nextEntry,
                id: entry.id,
                receivedAt: entry.receivedAt,
              }
            : entry,
        );
      });
    };

    if (!isResolvingConflicts) {
      setPublishLogs([]);
      setPublishProgress(2);
    }
    setPublishRunState('running');
    setIsPullingContent(true);
    setIsPublishingSite(true);
    let stopPublishListening: (() => void) | null = null;
    let stopContentSyncPreviewListening: (() => void) | null = null;

    try {
      stopPublishListening = await listenToPublishProgress((event) => {
        if (event.taskId === taskId) {
          upsertPublishFlowEntry(event);
        }
      });
      stopContentSyncPreviewListening = await listenToContentSyncPreview((event) => {
        if (event.taskId !== taskId) {
          return;
        }
        setContentSyncPreviewDialog({ ...event, isSubmitting: false });
        recordManualProgress(
          61,
          'preview',
          '等待确认同步变更',
          `本地 ${event.localChanges.length} 项，远端 ${event.remoteChanges.length} 项。`,
          'warning',
        );
      });

      if (isResolvingConflicts) {
        recordManualProgress(
          currentProgress,
          'conflict',
          '已选择冲突处理',
          '正在按选择继续同步。',
        );
      } else {
        recordManualProgress(
          2,
          'connection',
          '测试远程连接',
          `内容分支：${configuredContentBranch}`,
        );
      }
      let remoteStatus: PublishStatusResponse;
      try {
        remoteStatus = await getPublishStatus(configuredRemote, configuredContentBranch, selectedSshKeyPath);
        setPublishConnectionMessage(remoteStatus.shortStatus);
        recordManualProgress(
          8,
          'connection',
          '连接测试通过',
          formatPublishStatusDetail(remoteStatus),
          'success',
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
        const messageText = `连接失败：${detail || '未知错误'}`;
        setPublishConnectionMessage(messageText);
        setStatus(detail || '读取发布状态失败。');
        recordManualProgress(
          8,
          'connection',
          '连接测试失败',
          formatPublishErrorDetail(detail),
          'error',
        );
        return;
      }

      recordManualProgress(
        10,
        'save',
        '准备本地内容',
        `冲突处理：${conflictLabel}`,
      );

      if (draft && dirty) {
        const savedItem = await saveDraft();
        if (!savedItem) {
          recordManualProgress(12, 'save', '当前文章保存失败', '同步已停止，请先修正文章保存错误。', 'error');
          return;
        }
      }

      const savedConfig = await saveSiteConfig();
      if (!savedConfig) {
        recordManualProgress(12, 'save', '站点设置保存失败', '同步已停止，请检查站点设置。', 'error');
        return;
      }
      recordManualProgress(16, 'save', '本地内容已保存', '文章、图库与站点设置已写入本地内容仓。', 'success');

      const repository = savedConfig.repository;
      const remote = repository?.remote.trim() ?? '';
      const contentBranch = getRepositoryContentBranch(repository);
      const basePath = inferGitHubPagesBasePath(remote);
      if (!remote || !contentBranch) {
        recordManualProgress(16, 'save', '同步配置不完整', '请配置远程仓库地址和内容分支。', 'error');
        return;
      }

      recordManualProgress(
        18,
        'fetch',
        remoteStatus.branchExists ? '准备拉取内容分支' : '准备创建内容分支',
        remoteStatus.branchExists
          ? '将使用内容分支与本地内容做三方合并，删除也会作为变更同步。'
          : '内容分支不存在，将以本地内容创建初始内容源。',
        remoteStatus.branchExists ? 'info' : 'warning',
      );
      const result = await syncContentChanges({
        taskId,
        remote,
        branch: contentBranch,
        contentBranch,
        basePath,
        sshKeyPath: selectedSshKeyPath,
        message,
        conflictStrategy: activeConflictStrategy,
        conflictResolutions,
        knownRemoteCommit: remoteStatus.remoteCommit,
        allowRiskyContentSync,
        verifyAfterPush: false,
      });
      const initializedFromRemote = result.stdout.includes('首次同步已从远端克隆');

      draftCacheRef.current.clear();
      cleanDraftsRef.current = new WeakSet();
      clearLinkedNotebookState();
      await loadSiteConfig();
      await loadLibrary(undefined, true);
      if (isSettingsOpen && settingsSection === 'images') {
        await loadUserGalleryManifest();
      }
      appendHistoryEntry('Synced site', message);
      recordManualProgress(
        84,
        initializedFromRemote ? 'pull' : 'push',
        initializedFromRemote ? '远端内容已拉取' : '内容已推送',
        result.stdout || (initializedFromRemote ? '远端内容已写入本地。' : `内容分支 ${contentBranch} 已更新。`),
        'success',
      );

      try {
        const nextStatus = await getPublishStatus(remote, contentBranch, selectedSshKeyPath);
        setPublishConnectionMessage(nextStatus.shortStatus);
      } catch (error) {
        recordManualProgress(
          88,
          'status',
          '远端状态刷新失败',
          formatPublishErrorDetail(formatUnknownError(error)),
          'warning',
        );
      }

      recordManualProgress(
        100,
        'done',
        '同步完成',
        initializedFromRemote
          ? '首次同步完成，远端内容已写入本地内容库。'
          : '内容分支已推送。远端构建与 Pages 发布将由仓库工作流继续处理。',
        'success',
      );
      setStatus(
        initializedFromRemote
          ? '远端内容已同步到本地。'
          : '内容已同步并推送，远端构建会自动继续。',
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      if (detail.includes('CONTENT_SYNC_CANCELLED')) {
        setStatus('已取消站点同步，本地和远端内容均未更改。');
        recordManualProgress(
          currentProgress,
          'cancelled',
          '同步已取消',
          '本地和远端内容均未更改。',
          'warning',
        );
        return;
      }
      const conflicts = parseContentSyncConflictError(detail);
      if (conflicts) {
        setContentSyncConflictDialog({
          conflicts,
          source: 'sync',
          resolutions: createContentSyncConflictResolutions(conflicts),
        });
        setStatus(`发现 ${conflicts.length} 个内容冲突，请逐项选择保留本地或远端版本。`);
        recordManualProgress(
          currentProgress,
          'conflict',
          '发现内容冲突',
          `共 ${conflicts.length} 个冲突，等待逐项选择。`,
          'warning',
        );
        return;
      }
      const risk = parseContentSyncRiskError(detail);
      if (risk) {
        recordManualProgress(
          currentProgress,
          'risk',
          risk.title,
          risk.detail,
          'warning',
        );
        const confirmed = window.confirm(`${risk.title}\n\n${risk.detail}\n\n确认继续吗？`);
        if (confirmed) {
          window.setTimeout(() => {
            void syncSiteChanges(strategyOverride, conflictResolutions, true);
          }, 0);
        } else {
          setStatus('已取消站点同步。');
        }
        return;
      }
      setStatus(detail || '站点同步失败。');
      recordManualProgress(
        currentProgress,
        'failed',
        '站点同步失败',
        detail || '没有收到可识别的错误信息。',
        'error',
      );
    } finally {
      stopPublishListening?.();
      stopContentSyncPreviewListening?.();
      setContentSyncPreviewDialog((current) => (current?.taskId === taskId ? null : current));
      setIsPullingContent(false);
      setIsPublishingSite(false);
    }
  };

  const continueContentSyncWithResolutions = () => {
    if (!contentSyncConflictDialog) {
      return;
    }

    const { conflicts, resolutions, source } = contentSyncConflictDialog;
    if (!areContentSyncConflictsResolved(conflicts, resolutions)) {
      setStatus('请先为每个冲突文件选择使用远端或本地版本。');
      return;
    }

    setContentSyncConflictDialog(null);
    if (source === 'pull') {
      void pullRemoteContentToLocal('manual', resolutions);
    } else {
      void syncSiteChanges('manual', resolutions);
    }
  };

  const submitContentSyncPreviewDecision = async (confirmed: boolean) => {
    const preview = contentSyncPreviewDialog;
    if (!preview || preview.isSubmitting) {
      return;
    }

    setContentSyncPreviewDialog({ ...preview, isSubmitting: true });
    try {
      await resolveContentSyncPreview(preview.taskId, confirmed);
      setContentSyncPreviewDialog(null);
      setStatus(
        confirmed
          ? '已确认同步变更，正在继续写入并推送。'
          : '正在取消同步，本地和远端内容不会更改。',
      );
    } catch (error) {
      setContentSyncPreviewDialog((current) =>
        current?.taskId === preview.taskId ? { ...current, isSubmitting: false } : current,
      );
      setStatus(formatUnknownError(error) || '提交同步确认失败。');
    }
  };

  const setContentSyncConflictResolution = (path: string, resolution: ContentSyncConflictResolution) => {
    setContentSyncConflictDialog((current) =>
      current
        ? {
            ...current,
            resolutions: {
              ...current.resolutions,
              [path]: resolution,
            },
          }
        : current,
    );
  };

  const handleBrandAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setStatus('加载所选头像失败。');
        return;
      }

      setBrandAvatar(result);
      try {
        window.localStorage.setItem(BRAND_AVATAR_STORAGE_KEY, result);
      } catch {
        // Ignore local storage write failures.
      }
      setStatus('已更新博客头像。');
    };
    reader.onerror = () => {
      setStatus('加载所选头像失败。');
    };
    reader.readAsDataURL(file);
  };

  const clearLinkedNotebookState = () => {
    linkedNotebookRef.current = null;
    linkedNotebookSavedSnapshotRef.current = '';
    linkedNotebookUndoStackRef.current = [];
    linkedNotebookRedoStackRef.current = [];
    setLinkedNotebook(null);
    setLinkedNotebookPath(null);
    setLinkedNotebookSavedSnapshot('');
    setLinkedNotebookStatus('');
    setIsLinkedNotebookLoading(false);
    linkedNotebookSessionIdRef.current = null;
  };

  const confirmDiscardUnsavedChanges = (nextAction: string): boolean => {
    if (!dirty) {
      return true;
    }

    const dirtyMessage =
      draft?.type === 'inknote' && notebookDirty && draftDirty
        ? 'The current Markdown entry and linked notebook both have unsaved changes.'
        : draft?.type === 'inknote' && notebookDirty
          ? 'The linked notebook has unsaved changes.'
          : 'The current note has unsaved changes.';

    const shouldProceed = window.confirm(`${dirtyMessage}\n\nDiscard them and ${nextAction}?`);
    if (!shouldProceed) {
      setStatus('已返回当前笔记。');
    }

    return shouldProceed;
  };

  const loadCategoryConfig = async (): Promise<ContentCategory[]> => {
    if (!isTauri()) {
      return [];
    }

    try {
      const raw = await readContentFile(CATEGORY_CONFIG_PATH);
      return parseCategoryConfig(raw);
    } catch {
      return [];
    }
  };

  const persistCategoryConfig = async (nextCategories: ContentCategory[]) => {
    const orderedCategories = normalizeCategoryOrder(nextCategories);
    await writeContentFile(CATEGORY_CONFIG_PATH, serializeCategoryConfig(orderedCategories));
    setCategories(orderedCategories);
  };

  const loadSiteConfig = async () => {
    const applyConfig = (nextConfig: SiteConfig) => {
      setSiteConfigDraft(nextConfig);
      setSiteChannelsText(formatSiteChannels(nextConfig.channels));
      siteConfigSnapshotRef.current = JSON.stringify(nextConfig);
      siteConfigLoadedRef.current = true;
    };

    siteConfigLoadedRef.current = false;

    if (!isTauri()) {
      applyConfig(cloneDefaultSiteConfig());
      return;
    }

    try {
      const raw = await readContentFile(SITE_CONFIG_PATH);
      applyConfig(normalizeSiteConfig(JSON.parse(raw)));
    } catch {
      applyConfig(cloneDefaultSiteConfig());
    }
  };

  const saveSiteConfig = async (): Promise<SiteConfig | null> => {
    if (!isTauri()) {
      setStatus('\u535a\u5ba2\u8bbe\u7f6e\u9700\u8981\u5728 Tauri \u684c\u9762\u7aef\u4e2d\u4fdd\u5b58\u3002');
      return null;
    }

    if (siteConfigSaveTimerRef.current !== null) {
      window.clearTimeout(siteConfigSaveTimerRef.current);
      siteConfigSaveTimerRef.current = null;
    }

    const nextConfig = normalizeSiteConfig({
      ...siteConfigDraft,
      channels: parseSiteChannelsText(siteChannelsText),
    });

    setIsSiteConfigSaving(true);
    try {
      await writeContentFile(SITE_CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`);
      siteConfigSnapshotRef.current = JSON.stringify(nextConfig);
      setStatus('\u8bbe\u7f6e\u5df2\u81ea\u52a8\u4fdd\u5b58\u3002');
      return nextConfig;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '\u4fdd\u5b58\u535a\u5ba2\u8bbe\u7f6e\u5931\u8d25\u3002');
      return null;
    } finally {
      setIsSiteConfigSaving(false);
    }
  };

  const updateSiteConfigDraft = (patch: Partial<SiteConfig>) => {
    setSiteConfigDraft((current) => ({ ...current, ...patch }));
  };

  const updateFriendLinkDraft = (index: number, patch: Partial<FriendLinkConfig>) => {
    setSiteConfigDraft((current) => ({
      ...current,
      friendLinks: (current.friendLinks ?? []).map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    }));
  };

  const addFriendLinkDraft = () => {
    setSiteConfigDraft((current) => ({
      ...current,
      friendLinks: [
        ...(current.friendLinks ?? []),
        { label: '', href: '', note: '' },
      ],
    }));
  };

  const removeFriendLinkDraft = (index: number) => {
    setSiteConfigDraft((current) => ({
      ...current,
      friendLinks: (current.friendLinks ?? []).filter((_, linkIndex) => linkIndex !== index),
    }));
  };

  const moveFriendLinkDraft = (index: number, direction: -1 | 1) => {
    setSiteConfigDraft((current) => {
      const links = [...(current.friendLinks ?? [])];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= links.length) {
        return current;
      }

      [links[index], links[targetIndex]] = [links[targetIndex], links[index]];
      return { ...current, friendLinks: links };
    });
  };

  const refreshFriendLinkIcon = async (index: number) => {
    if (friendIconLoadingIndex !== null) {
      return;
    }

    const link = siteConfigDraft.friendLinks?.[index];
    const target = link?.href.trim() ?? '';
    if (!target || target === '#') {
      setStatus('\u8bf7\u5148\u586b\u5199\u6709\u6548\u7684\u53cb\u94fe\u7f51\u5740\u3002');
      return;
    }
    if (!isTauri()) {
      setStatus('\u7ad9\u70b9\u56fe\u6807\u9700\u8981\u5728 Tauri \u684c\u9762\u7aef\u4e2d\u6293\u53d6\u3002');
      return;
    }

    setFriendIconLoadingIndex(index);
    try {
      const result = await fetchFriendLinkIcon(target);
      setSiteConfigDraft((current) => ({
        ...current,
        friendLinks: (current.friendLinks ?? []).map((currentLink, linkIndex) =>
          linkIndex === index && currentLink.href.trim() === target
            ? {
                ...currentLink,
                icon: result.iconPath,
                iconSource: result.sourceUrl,
                iconTarget: target,
                iconFetchedAt: new Date().toISOString(),
              }
            : currentLink,
        ),
      }));
      setStatus(`\u5df2\u4ece ${result.resolvedPageUrl} \u66f4\u65b0\u7ad9\u70b9\u56fe\u6807\u3002`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      setStatus(
        detail
          ? `\u672a\u80fd\u83b7\u53d6\u7ad9\u70b9\u56fe\u6807\uff1a${detail}`
          : '\u672a\u80fd\u83b7\u53d6\u7ad9\u56fe\u6807\uff0c\u5c06\u4f7f\u7528\u9996\u5b57\u6bcd\u3002',
      );
    } finally {
      setFriendIconLoadingIndex((current) => (current === index ? null : current));
    }
  };

  const refreshFriendLinkIconIfNeeded = (index: number) => {
    const link = siteConfigDraft.friendLinks?.[index];
    if (link?.href.trim() && (!link.icon?.trim() || link.iconTarget !== link.href.trim())) {
      void refreshFriendLinkIcon(index);
    }
  };

  const updateToolLinkDraft = (index: number, patch: Partial<FriendLinkConfig>) => {
    setSiteConfigDraft((current) => ({
      ...current,
      toolLinks: (current.toolLinks ?? []).map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    }));
  };

  const addToolLinkDraft = () => {
    setSiteConfigDraft((current) => ({
      ...current,
      toolLinks: [
        ...(current.toolLinks ?? []),
        { label: '', href: '', note: '' },
      ],
    }));
  };

  const removeToolLinkDraft = (index: number) => {
    setSiteConfigDraft((current) => ({
      ...current,
      toolLinks: (current.toolLinks ?? []).filter((_, linkIndex) => linkIndex !== index),
    }));
  };

  const moveToolLinkDraft = (index: number, direction: -1 | 1) => {
    setSiteConfigDraft((current) => {
      const links = [...(current.toolLinks ?? [])];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= links.length) {
        return current;
      }

      [links[index], links[targetIndex]] = [links[targetIndex], links[index]];
      return { ...current, toolLinks: links };
    });
  };

  const reorderSiteLinkLocally = (kind: SiteLinkDragKind, targetIndex: number) => {
    const source = siteLinkDragSourceRef.current;
    if (!source || source.kind !== kind || source.index === targetIndex || isBusy) {
      return;
    }

    const field = kind === 'friend' ? 'friendLinks' : 'toolLinks';
    const nextDragState = { kind, index: targetIndex };
    siteLinkDragSourceRef.current = nextDragState;
    setDraggingSiteLink(nextDragState);

    setSiteConfigDraft((current) => {
      const links = [...(current[field] ?? [])];
      if (source.index < 0 || source.index >= links.length || targetIndex < 0 || targetIndex >= links.length) {
        return current;
      }

      const [movedLink] = links.splice(source.index, 1);
      links.splice(targetIndex, 0, movedLink);
      return { ...current, [field]: links };
    });
  };

  const beginSiteLinkPointerDrag = (
    event: ReactPointerEvent<HTMLElement>,
    kind: SiteLinkDragKind,
    index: number,
  ) => {
    if (isBusy) {
      return;
    }

    event.preventDefault();
    const nextDragState = { kind, index };
    siteLinkDragSourceRef.current = nextDragState;
    setDraggingSiteLink(nextDragState);
  };

  const handleSiteLinkPointerEnter = (kind: SiteLinkDragKind, index: number) => {
    reorderSiteLinkLocally(kind, index);
  };

  const finishSiteLinkPointerDrag = () => {
    siteLinkDragSourceRef.current = null;
    setDraggingSiteLink(null);
  };

  const refreshToolLinkIcon = async (index: number) => {
    if (toolIconLoadingIndex !== null) {
      return;
    }

    const link = siteConfigDraft.toolLinks?.[index];
    const target = link?.href.trim() ?? '';
    if (!target || target === '#') {
      setStatus('请先填写有效的工具网址。');
      return;
    }
    if (!isTauri()) {
      setStatus('站点图标需要在 Tauri 桌面端中抓取。');
      return;
    }

    setToolIconLoadingIndex(index);
    try {
      const result = await fetchFriendLinkIcon(target);
      setSiteConfigDraft((current) => ({
        ...current,
        toolLinks: (current.toolLinks ?? []).map((currentLink, linkIndex) =>
          linkIndex === index && currentLink.href.trim() === target
            ? {
                ...currentLink,
                icon: result.iconPath,
                iconSource: result.sourceUrl,
                iconTarget: target,
                iconFetchedAt: new Date().toISOString(),
              }
            : currentLink,
        ),
      }));
      setStatus(`已从 ${result.resolvedPageUrl} 更新站点图标。`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      setStatus(
        detail
          ? `未能获取站点图标：${detail}`
          : '未能获取站点图标，将使用首字母。',
      );
    } finally {
      setToolIconLoadingIndex((current) => (current === index ? null : current));
    }
  };

  const refreshToolLinkIconIfNeeded = (index: number) => {
    const link = siteConfigDraft.toolLinks?.[index];
    if (link?.href.trim() && (!link.icon?.trim() || link.iconTarget !== link.href.trim())) {
      void refreshToolLinkIcon(index);
    }
  };

  const updateRepositoryConfigDraft = (patch: Partial<RepositoryConfig>) => {
    setPublishConnectionMessage('仓库配置已修改，请重新测试连接。');
    setSiteConfigDraft((current) => ({
      ...current,
      repository: {
        ...(current.repository ?? cloneDefaultSiteConfig().repository!),
        ...patch,
        branch: patch.contentBranch ?? current.repository?.contentBranch ?? DEFAULT_CONTENT_BRANCH,
      },
    }));
  };

  const updateGiscusConfigDraft = (patch: Partial<GiscusConfig>) => {
    setSiteConfigDraft((current) => ({
      ...current,
      giscus: {
        ...(current.giscus ?? cloneDefaultSiteConfig().giscus!),
        ...patch,
      },
    }));
  };

  const updateGoatCounterConfigDraft = (patch: Partial<GoatCounterConfig>) => {
    setSiteConfigDraft((current) => ({
      ...current,
      goatcounter: {
        ...(current.goatcounter ?? cloneDefaultSiteConfig().goatcounter!),
        ...patch,
      },
    }));
  };

  const updateCardImageConfigDraft = (patch: Partial<CardImageConfig>) => {
    setSiteConfigDraft((current) => ({
      ...current,
      cardImages: {
        ...(current.cardImages ?? cloneDefaultSiteConfig().cardImages!),
        ...patch,
      },
    }));
  };

  const createUniqueDraftSlug = (baseSlug: string, ignorePath?: string | null) => {
    const normalizedBase = slugifyCategoryLabel(baseSlug) || 'note-copy';
    let nextSlug = normalizedBase;
    let counter = 2;

    while (
      items.some((item) => item.frontmatter.slug === nextSlug && (!ignorePath || item.relativePath !== ignorePath))
    ) {
      nextSlug = `${normalizedBase}-${counter}`;
      counter += 1;
    }

    return nextSlug;
  };

  const createRandomDraftSlug = () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const nextSlug = String(Math.floor(1000000 + Math.random() * 9000000));
      if (!items.some((item) => item.frontmatter.slug === nextSlug)) {
        return nextSlug;
      }
    }

    return createUniqueDraftSlug(String(Date.now()).slice(-7));
  };

  const pushDraftUndoEntry = (entry: DraftUndoEntry) => {
    const entrySnapshot = getDraftEditorSnapshot(entry.draft);
    const lastEntry = draftUndoStackRef.current[draftUndoStackRef.current.length - 1];

    if (lastEntry && getDraftEditorSnapshot(lastEntry.draft) === entrySnapshot) {
      return;
    }

    draftUndoStackRef.current = [...draftUndoStackRef.current.slice(-(DRAFT_UNDO_LIMIT - 1)), entry];
    draftRedoStackRef.current = [];
  };

  const undoDraftChange = (): boolean => {
    if (!draft) {
      return false;
    }

    const previousDraft = draftUndoStackRef.current.pop();
    if (!previousDraft) {
      return false;
    }

    draftRedoStackRef.current = [
      ...draftRedoStackRef.current,
      {
        draft,
        selection: readEditorSelection() ?? editorSelectionRef.current,
      },
    ];
    setDraft(preserveAutoSavedMetadata(previousDraft.draft, draft));
    restoreEditorSelection(previousDraft.selection);
    appendHistoryEntry('Undo', draft.title);
    setStatus('已撤销最近一次编辑。');
    return true;
  };

  const redoDraftChange = (): boolean => {
    if (!draft) {
      return false;
    }

    const nextDraft = draftRedoStackRef.current.pop();
    if (!nextDraft) {
      return false;
    }

    draftUndoStackRef.current = [
      ...draftUndoStackRef.current,
      {
        draft,
        selection: readEditorSelection() ?? editorSelectionRef.current,
      },
    ];
    setDraft(preserveAutoSavedMetadata(nextDraft.draft, draft));
    restoreEditorSelection(nextDraft.selection);
    appendHistoryEntry('Redo', draft.title);
    setStatus('已重做最近一次编辑。');
    return true;
  };

  const pushLinkedNotebookUndoEntry = (entry: NotebookUndoEntry) => {
    const lastEntry = linkedNotebookUndoStackRef.current[linkedNotebookUndoStackRef.current.length - 1];

    if (lastEntry && lastEntry.project.content === entry.project.content) {
      return;
    }

    linkedNotebookUndoStackRef.current = [...linkedNotebookUndoStackRef.current.slice(-(DRAFT_UNDO_LIMIT - 1)), entry];
    linkedNotebookRedoStackRef.current = [];
  };

  const undoLinkedNotebookChange = (): boolean => {
    const currentProject = linkedNotebookRef.current;
    if (!currentProject) {
      return false;
    }

    const previousProject = linkedNotebookUndoStackRef.current.pop();
    if (!previousProject) {
      return false;
    }

    linkedNotebookRedoStackRef.current = [
      ...linkedNotebookRedoStackRef.current,
      {
        project: currentProject,
        selection: readEditorSelection() ?? editorSelectionRef.current,
      },
    ];
    handleLinkedNotebookChange(previousProject.project);
    restoreEditorSelection(previousProject.selection);
    appendHistoryEntry('Undo', draftRef.current?.title ?? 'InkNote');
    setStatus('已撤销最近一次手写笔记编辑。');
    return true;
  };

  const redoLinkedNotebookChange = (): boolean => {
    const currentProject = linkedNotebookRef.current;
    if (!currentProject) {
      return false;
    }

    const nextProject = linkedNotebookRedoStackRef.current.pop();
    if (!nextProject) {
      return false;
    }

    linkedNotebookUndoStackRef.current = [
      ...linkedNotebookUndoStackRef.current,
      {
        project: currentProject,
        selection: readEditorSelection() ?? editorSelectionRef.current,
      },
    ];
    handleLinkedNotebookChange(nextProject.project);
    restoreEditorSelection(nextProject.selection);
    appendHistoryEntry('Redo', draftRef.current?.title ?? 'InkNote');
    setStatus('已重做最近一次手写笔记编辑。');
    return true;
  };

  const getDraftFromItem = (item: ContentLibraryItem): ContentDraft => {
    const fingerprint = [
      item.relativePath,
      item.frontmatter.title,
      item.frontmatter.slug,
      String(getFrontmatterOrderValue(item.frontmatter.order) ?? ''),
      item.frontmatter.date,
      item.frontmatter.updatedAt ?? '',
      item.frontmatter.summary ?? '',
      item.frontmatter.category ?? '',
      item.frontmatter.published ? 'published' : 'draft',
      item.body.length,
    ].join('\u0000');
    const cached = draftCacheRef.current.get(item.relativePath);

    if (cached?.fingerprint === fingerprint) {
      return cached.draft;
    }

    const nextDraft = createDraftFromItem(item);
    draftCacheRef.current.set(item.relativePath, { fingerprint, draft: nextDraft });
    cleanDraftsRef.current.add(nextDraft);
    return nextDraft;
  };

  const loadLibrary = async (preferredPath?: string, replaceCurrentDraft = false) => {
    setIsBusy(true);
    setStatus('正在加载笔记...');

    try {
      if (!isTauri()) {
        setLibraryRoot('content');
        setCategories([]);
        setItems([]);
        setSelectedCategorySlug(null);
        activateDraft(null);
        clearLinkedNotebookState();
        setStatus('内容管理只能在 Tauri 桌面端中使用。');
        return;
      }

      const index = await getContentIndex();
      const configuredCategories = await loadCategoryConfig();
      const loadedItems = sortLibraryItems(
        (
          await Promise.all(
            index.files.map(async (file) => {
              const raw = await readContentFile(file.path);
              return toContentLibraryItem(file.path, raw);
            }),
          )
        ).filter((item): item is ContentLibraryItem => Boolean(item)),
      );
      const inferredCategories = [...new Set(loadedItems.map((item) => getItemCategorySlug(item)).filter(Boolean))]
        .filter((slug) => !configuredCategories.some((category) => category.slug === slug))
        .map((slug) => ({
          slug,
          label: humanizeCategorySlug(slug),
        }));
      const loadedCategories = [...configuredCategories, ...inferredCategories];

      setLibraryRoot(index.root);
      setCategories(loadedCategories);
      setItems(loadedItems);

      const nextItem =
        (preferredPath ? loadedItems.find((item) => item.relativePath === preferredPath) : null) ??
        (draft?.sourceRelativePath
          ? loadedItems.find((item) => item.relativePath === draft.sourceRelativePath)
          : null) ??
        loadedItems[0] ??
        null;
      const nextCategorySlug =
        (nextItem ? getItemCategorySlug(nextItem) : null) ??
        (draft?.category?.trim() ? draft.category : null) ??
        loadedCategories[0]?.slug ??
        null;

      setSelectedCategorySlug((current) => {
        if (nextCategorySlug) {
          return nextCategorySlug;
        }

        if (current && loadedCategories.some((category) => category.slug === current)) {
          return current;
        }

        return loadedCategories[0]?.slug ?? null;
      });

      if (nextItem && (!dirty || preferredPath || replaceCurrentDraft)) {
        activateDraft(getDraftFromItem(nextItem));
      } else if (!nextItem) {
        activateDraft(null);
      }

      setStatus(`已加载 ${loadedItems.length} 篇笔记。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载笔记失败。');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void loadLibrary();
    void loadSiteConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!siteConfigLoadedRef.current || !isTauri()) {
      return;
    }

    const nextConfig = normalizeSiteConfig({
      ...siteConfigDraft,
      channels: parseSiteChannelsText(siteChannelsText),
    });
    const nextSnapshot = JSON.stringify(nextConfig);

    if (nextSnapshot === siteConfigSnapshotRef.current) {
      return;
    }

    if (siteConfigSaveTimerRef.current !== null) {
      window.clearTimeout(siteConfigSaveTimerRef.current);
    }

    siteConfigSaveTimerRef.current = window.setTimeout(() => {
      siteConfigSaveTimerRef.current = null;
      void saveSiteConfig();
    }, 520);

    return () => {
      if (siteConfigSaveTimerRef.current !== null) {
        window.clearTimeout(siteConfigSaveTimerRef.current);
        siteConfigSaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteChannelsText, siteConfigDraft]);

  useEffect(() => {
    if (!isSettingsOpen || settingsSection !== 'basic' || !isTauri()) {
      return;
    }

    const missingIcons = (siteConfigDraft.friendLinks ?? [])
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => {
        const href = link.href.trim();
        return href && href !== '#' && !link.icon?.trim() && !friendIconAutoRequestedRef.current.has(href);
      });
    const missingToolIcons = (siteConfigDraft.toolLinks ?? [])
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => {
        const href = link.href.trim();
        return href && href !== '#' && !link.icon?.trim() && !toolIconAutoRequestedRef.current.has(href);
      });
    if (missingIcons.length === 0 && missingToolIcons.length === 0) {
      return;
    }

    for (const { link } of missingIcons) {
      friendIconAutoRequestedRef.current.add(link.href.trim());
    }
    for (const { link } of missingToolIcons) {
      toolIconAutoRequestedRef.current.add(link.href.trim());
    }

    const refreshMissingIcons = async () => {
      for (const { index } of missingIcons) {
        await refreshFriendLinkIcon(index);
      }
      for (const { index } of missingToolIcons) {
        await refreshToolLinkIcon(index);
      }
    };
    void refreshMissingIcons();
    // Opening the blog settings is the intentional refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen, settingsSection]);

  useEffect(() => {
    if (!isSettingsOpen || settingsSection !== 'images') {
      return;
    }

    void loadUserGalleryManifest();
    // Loading the gallery only when the image settings panel is visible keeps startup light.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen, settingsSection, libraryRoot]);

  useEffect(() => {
    const existingKeys = new Set(galleryImages.map(getGalleryImageKey));
    setSelectedGalleryImageKeys((current) => {
      const next = current.filter((key) => existingKeys.has(key));
      return next.length === current.length ? current : next;
    });
  }, [galleryImages]);

  useEffect(() => {
    if (!imagePreview?.galleryImageKey) {
      return;
    }

    setImagePreviewFocus(normalizeGalleryImageFocus(imagePreview.focus));
  }, [imagePreview]);

  useEffect(() => {
    if (!draft || draft.type !== 'inknote' || !linkedNotebookTarget) {
      clearLinkedNotebookState();
      return;
    }

    let cancelled = false;

    const loadLinkedNotebook = async () => {
      setLinkedNotebookPath(linkedNotebookTarget);
      setIsLinkedNotebookLoading(true);

      try {
        const raw = await readContentFile(linkedNotebookTarget);
        if (cancelled) {
          return;
        }

        const loadedProject = deserializeProject(raw);
        const nextProject = shouldHydrateLinkedNotebookContent(loadedProject, draft)
          ? {
              ...loadedProject,
              content: draft.body.trim(),
              updatedAt: new Date().toISOString(),
            }
          : loadedProject;
        setLinkedNotebook(nextProject);
        setLinkedNotebookSavedSnapshot(getProjectSnapshot(loadedProject));
        setLinkedNotebookStatus(
          nextProject === loadedProject
            ? `Loaded content/${linkedNotebookTarget}`
            : `Loaded content/${linkedNotebookTarget} and initialized notebook content from the entry body.`,
        );
        setDraft((current) =>
          current && current.type === 'inknote'
            ? patchDraft(current, {
                paperStyle: nextProject.paperStyle,
                handwritingStyle: nextProject.handwritingStyle,
              })
            : current,
        );
        linkedNotebookSessionIdRef.current = draftSessionId;
      } catch (error) {
        if (cancelled) {
          return;
        }

        const shouldReuseCurrent =
          linkedNotebookSessionIdRef.current === draftSessionId && linkedNotebookRef.current !== null;
        const nextProject = createLinkedNotebookProject(
          draft,
          shouldReuseCurrent ? linkedNotebookRef.current : null,
        );

        setLinkedNotebook(nextProject);
        setLinkedNotebookSavedSnapshot(shouldReuseCurrent ? linkedNotebookSavedSnapshotRef.current : '');
        setDraft((current) =>
          current && current.type === 'inknote'
            ? patchDraft(current, {
                paperStyle: nextProject.paperStyle,
                handwritingStyle: nextProject.handwritingStyle,
              })
            : current,
        );
        setLinkedNotebookStatus(
          error instanceof Error
            ? `${error.message}. The linked notebook project will be created on save.`
            : 'The linked notebook project will be created on save.',
        );
        linkedNotebookSessionIdRef.current = draftSessionId;
      } finally {
        if (!cancelled) {
          setIsLinkedNotebookLoading(false);
        }
      }
    };

    void loadLinkedNotebook();

    return () => {
      cancelled = true;
    };
  }, [draftSessionId, linkedNotebookTarget]);

  const rewriteItemCategory = async (
    item: ContentLibraryItem,
    nextCategorySlug: string,
  ): Promise<ContentLibraryItem> => {
    const nextDraft = patchDraft(getDraftFromItem(item), {
      category: nextCategorySlug,
    });
    const payload = serializeContentDraft(nextDraft);
    await writeContentFile(item.relativePath, payload);

    const savedItem = toContentLibraryItem(item.relativePath, payload);
    if (!savedItem) {
      throw new Error(`Failed to update the category for content/${item.relativePath}.`);
    }

    return savedItem;
  };

  const applyRewrittenItems = (rewrittenItems: ContentLibraryItem[]) => {
    if (rewrittenItems.length === 0) {
      return;
    }

    const rewrittenByPath = new Map(rewrittenItems.map((item) => [item.relativePath, item]));
    setItems((current) =>
      sortLibraryItems(current.map((item) => rewrittenByPath.get(item.relativePath) ?? item)),
    );

    if (!draft?.sourceRelativePath) {
      return;
    }

    const nextSelectedItem = rewrittenByPath.get(draft.sourceRelativePath);
    if (nextSelectedItem) {
      activateDraft(getDraftFromItem(nextSelectedItem));
    }
  };

  const clearLocalContent = async () => {
    if (!isTauri() || isClearingLocalContent || isPublishingSite || isPullingContent) {
      return;
    }

    setIsClearingLocalContent(true);
    try {
      const removedCount = await clearLocalContentWorkspace();
      draftCacheRef.current.clear();
      cleanDraftsRef.current = new WeakSet();
      clearLinkedNotebookState();
      activateDraft(null);
      setCategories([]);
      setItems([]);
      setSelectedCategorySlug(null);
      setGalleryImages([]);
      setGalleryAssignments({});
      setSelectedGalleryImageKeys([]);
      setGalleryPage(1);
      setManagedImagePage(1);
      setPublishLogs([]);
      setPublishProgress(0);
      setPublishRunState('idle');
      await loadSiteConfig();
      await loadLibrary(undefined, true);
      setIsClearLocalContentDialogOpen(false);
      setStatus(`本地内容已清空，共移除 ${removedCount} 个文件；远端仓库未受影响。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '清空本地内容失败。');
    } finally {
      setIsClearingLocalContent(false);
    }
  };

  const openCreateCategoryDialog = () => {
    setCategoryDialog({ mode: 'create' });
    setCategoryLabelValue('');
    setCategoryLabelEnValue('');
  };

  const openEditCategoryDialog = (category: ContentCategory) => {
    setCategoryDialog({ mode: 'edit', slug: category.slug });
    setCategoryLabelValue(category.label);
    setCategoryLabelEnValue(category.labelEn?.trim() ?? '');
  };

  const closeCategoryDialog = () => {
    if (isBusy) {
      return;
    }

    setCategoryDialog(null);
  };

  const saveCategoryDialog = async () => {
    if (!categoryDialog) {
      return;
    }

    const label = categoryLabelValue.trim().replace(/\s+/g, ' ');
    const labelEn = categoryLabelEnValue.trim().replace(/\s+/g, ' ');
    const requestedSlug = slugifyCategoryLabel(labelEn);

    if (!label) {
      setStatus('\u8bf7\u586b\u5199\u7c7b\u76ee\u540d\u79f0\u3002');
      return;
    }

    if (!labelEn) {
      setStatus('请填写类目英文名称。');
      return;
    }

    if (!requestedSlug) {
      setStatus('请填写有效的类目英文名称。');
      return;
    }

    setIsBusy(true);

    try {
      if (categoryDialog.mode === 'create') {
        if (categories.some((category) => category.slug === requestedSlug)) {
          setStatus(`英文名称生成的路由「${requestedSlug}」已存在，请更换英文名称。`);
          return;
        }

        const nextSlug = requestedSlug;
        const nextCategories = [
          ...categories,
          {
            slug: nextSlug,
            label,
            labelEn,
          },
        ];

        await persistCategoryConfig(nextCategories);
        setSelectedCategorySlug(nextSlug);
        setStatus(`\u5df2\u65b0\u5efa\u7c7b\u76ee\u300c${label}\u300d\u3002`);
      } else {
        const categoryToEdit = categories.find((category) => category.slug === categoryDialog.slug) ?? null;
        if (!categoryToEdit) {
          setStatus('\u8981\u7f16\u8f91\u7684\u7c7b\u76ee\u5df2\u4e0d\u5b58\u5728\u3002');
          return;
        }

        if (
          categories.some(
            (category) => category.slug === requestedSlug && category.slug !== categoryToEdit.slug,
          )
        ) {
          setStatus(`英文名称生成的路由「${requestedSlug}」已存在，请更换英文名称。`);
          return;
        }

        const nextSlug = requestedSlug;
        const affectedItems = items.filter((item) => getItemCategorySlug(item) === categoryToEdit.slug);
        const isChangingSlug = nextSlug !== categoryToEdit.slug;
        const currentDraftIsAffected =
          Boolean(draft?.sourceRelativePath) &&
          affectedItems.some((item) => item.relativePath === draft?.sourceRelativePath);

        if (isChangingSlug && currentDraftIsAffected && dirty) {
          const shouldContinue = window.confirm(
            '\u5f53\u524d\u6587\u7ae0\u6709\u672a\u4fdd\u5b58\u4fee\u6539\u3002\u4fee\u6539\u7c7b\u76ee\u8def\u7531\u4f1a\u540c\u6b65\u66f4\u65b0\u6587\u7ae0\u7684\u6240\u5c5e\u7c7b\u76ee\uff0c\u7ee7\u7eed\u5c06\u4e22\u5f03\u5f53\u524d\u672a\u4fdd\u5b58\u4fee\u6539\u3002\u662f\u5426\u7ee7\u7eed\uff1f',
          );

          if (!shouldContinue) {
            setStatus('\u5df2\u53d6\u6d88\u4fee\u6539\u7c7b\u76ee\u8def\u7531\u3002');
            return;
          }
        }

        const nextCategories = categories.map((category) =>
          category.slug === categoryToEdit.slug
            ? {
                ...category,
                slug: nextSlug,
                label,
                labelEn,
              }
            : category,
        );

        const rewrittenItems =
          isChangingSlug && affectedItems.length > 0
            ? await Promise.all(affectedItems.map((item) => rewriteItemCategory(item, nextSlug)))
            : [];

        applyRewrittenItems(rewrittenItems);
        await persistCategoryConfig(nextCategories);
        setSelectedCategorySlug((current) => (current === categoryToEdit.slug ? nextSlug : current));
        setCreateCategoryValue((current) => (current === categoryToEdit.slug ? nextSlug : current));
        setMetadataCategoryValue((current) => (current === categoryToEdit.slug ? nextSlug : current));
        setDraft((current) =>
          current && current.category === categoryToEdit.slug
            ? patchDraft(current, { category: nextSlug })
            : current,
        );
        setStatus(`\u5df2\u66f4\u65b0\u7c7b\u76ee\u300c${categoryToEdit.label}\u300d\u3002`);
      }

      setCategoryDialog(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '\u4fdd\u5b58\u7c7b\u76ee\u5931\u8d25\u3002');
    } finally {
      setIsBusy(false);
    }
  };

  const reorderCategoryToTarget = async (sourceSlug: string, targetSlug: string) => {
    if (sourceSlug === targetSlug) {
      return;
    }

    const sourceIndex = categories.findIndex((category) => category.slug === sourceSlug);
    const targetIndex = categories.findIndex((category) => category.slug === targetSlug);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextCategories = [...categories];
    const [movedCategory] = nextCategories.splice(sourceIndex, 1);
    nextCategories.splice(targetIndex, 0, movedCategory);

    setIsBusy(true);
    try {
      await persistCategoryConfig(nextCategories);
      setStatus(`\u5df2\u8c03\u6574\u7c7b\u76ee\u300c${movedCategory.label}\u300d\u7684\u987a\u5e8f\u3002`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '\u8c03\u6574\u7c7b\u76ee\u987a\u5e8f\u5931\u8d25\u3002');
    } finally {
      setIsBusy(false);
    }
  };

  const reorderCategoryLocally = (sourceSlug: string, targetSlug: string) => {
    if (sourceSlug === targetSlug || isBusy) {
      return;
    }

    setCategories((current) => {
      const sourceIndex = current.findIndex((category) => category.slug === sourceSlug);
      const targetIndex = current.findIndex((category) => category.slug === targetSlug);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const nextCategories = [...current];
      const [movedCategory] = nextCategories.splice(sourceIndex, 1);
      nextCategories.splice(targetIndex, 0, movedCategory);

      const orderedCategories = normalizeCategoryOrder(nextCategories);
      categoriesRef.current = orderedCategories;
      pendingCategoryOrderRef.current = orderedCategories;
      return orderedCategories;
    });

  };

  const beginCategoryPointerDrag = (event: ReactPointerEvent<HTMLElement>, categorySlug: string) => {
    if (isBusy) {
      return;
    }

    event.preventDefault();
    categoryDragSourceRef.current = categorySlug;
    categoryDragOriginalOrderRef.current = categoriesRef.current;
    pendingCategoryOrderRef.current = null;
    setDraggingCategorySlug(categorySlug);
  };

  const handleCategoryPointerEnter = (categorySlug: string) => {
    const sourceSlug = categoryDragSourceRef.current;
    if (!sourceSlug) {
      return;
    }

    reorderCategoryLocally(sourceSlug, categorySlug);
  };

  const finishCategoryPointerDrag = async () => {
    const nextOrder = pendingCategoryOrderRef.current;
    const originalOrder = categoryDragOriginalOrderRef.current;
    const sourceSlug = categoryDragSourceRef.current;

    categoryDragSourceRef.current = null;
    categoryDragOriginalOrderRef.current = null;
    pendingCategoryOrderRef.current = null;
    setDraggingCategorySlug(null);

    if (!sourceSlug || !nextOrder || isBusy) {
      return;
    }

    const movedCategory = nextOrder.find((category) => category.slug === sourceSlug);
    setIsBusy(true);
    try {
      await persistCategoryConfig(nextOrder);
      setStatus(
        movedCategory
          ? `\u5df2\u8c03\u6574\u7c7b\u76ee\u300c${movedCategory.label}\u300d\u7684\u987a\u5e8f\u3002`
          : '\u5df2\u8c03\u6574\u7c7b\u76ee\u987a\u5e8f\u3002',
      );
    } catch (error) {
      if (originalOrder) {
        categoriesRef.current = originalOrder;
        setCategories(originalOrder);
      }
      setStatus(error instanceof Error ? error.message : '\u8c03\u6574\u7c7b\u76ee\u987a\u5e8f\u5931\u8d25\u3002');
    } finally {
      setIsBusy(false);
    }
  };

  const ensureCanReorderNotes = () => {
    if (isBusy) {
      return false;
    }

    if (!selectedCategorySlug) {
      setStatus('\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u7c7b\u76ee\uff0c\u518d\u8c03\u6574\u6587\u7ae0\u987a\u5e8f\u3002');
      return false;
    }

    if (searchQuery.trim()) {
      setStatus('\u641c\u7d22\u7ed3\u679c\u5217\u8868\u6682\u4e0d\u652f\u6301\u62d6\u52a8\u6392\u5e8f\uff0c\u8bf7\u5148\u6e05\u7a7a\u641c\u7d22\u3002');
      return false;
    }

    if (dirty) {
      setStatus('\u8bf7\u5148\u4fdd\u5b58\u5f53\u524d\u7b14\u8bb0\uff0c\u518d\u8c03\u6574\u6587\u7ae0\u987a\u5e8f\u3002');
      return false;
    }

    return true;
  };

  const rewriteItemOrder = async (item: ContentLibraryItem, nextOrder: number): Promise<ContentLibraryItem> => {
    const nextDraft = patchDraft(getDraftFromItem(item), {
      order: nextOrder,
    });
    const payload = serializeContentDraft(nextDraft);
    await writeContentFile(item.relativePath, payload);

    const savedItem = toContentLibraryItem(item.relativePath, payload);
    if (!savedItem) {
      throw new Error(`Failed to update the order for content/${item.relativePath}.`);
    }

    return savedItem;
  };

  const persistReorderedNotes = async (
    sourcePath: string,
    originalItems: ContentLibraryItem[],
    orderedCategoryItems: ContentLibraryItem[],
  ) => {
    const originalByPath = new Map(originalItems.map((item) => [item.relativePath, item]));
    const changedItems = orderedCategoryItems.filter((item) => {
      const previous = originalByPath.get(item.relativePath);
      return getFrontmatterOrderValue(previous?.frontmatter.order) !== getFrontmatterOrderValue(item.frontmatter.order);
    });

    if (changedItems.length === 0) {
      return;
    }

    const movedItem = orderedCategoryItems.find((item) => item.relativePath === sourcePath) ?? null;

    setIsBusy(true);
    try {
      const rewrittenItems = await Promise.all(
        changedItems.map((item) =>
          rewriteItemOrder(item, getFrontmatterOrderValue(item.frontmatter.order) ?? orderedCategoryItems.indexOf(item) + 1),
        ),
      );
      const rewrittenByPath = new Map(rewrittenItems.map((item) => [item.relativePath, item]));
      const nextItems = itemsRef.current.map((item) => rewrittenByPath.get(item.relativePath) ?? item);

      itemsRef.current = nextItems;
      setItems(nextItems);

      if (draft?.sourceRelativePath) {
        const nextSelectedItem = rewrittenByPath.get(draft.sourceRelativePath);
        if (nextSelectedItem) {
          const nextDraft = getDraftFromItem(nextSelectedItem);
          cleanDraftsRef.current.add(nextDraft);
          setDraft(nextDraft);
        }
      }

      setStatus(
        movedItem
          ? `\u5df2\u8c03\u6574\u300a${movedItem.frontmatter.title}\u300b\u7684\u6392\u5e8f\u3002`
          : '\u5df2\u8c03\u6574\u6587\u7ae0\u987a\u5e8f\u3002',
      );
    } catch (error) {
      itemsRef.current = originalItems;
      setItems(originalItems);
      setStatus(error instanceof Error ? error.message : '\u8c03\u6574\u6587\u7ae0\u987a\u5e8f\u5931\u8d25\u3002');
    } finally {
      setIsBusy(false);
    }
  };

  const reorderNoteLocally = (sourcePath: string, targetPath: string) => {
    if (!selectedCategorySlug || sourcePath === targetPath || isBusy) {
      return;
    }

    setItems((current) => {
      const categoryItems = sortCategoryItems(current, selectedCategorySlug);
      const sourceIndex = categoryItems.findIndex((item) => item.relativePath === sourcePath);
      const targetIndex = categoryItems.findIndex((item) => item.relativePath === targetPath);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const nextCategoryItems = [...categoryItems];
      const [movedItem] = nextCategoryItems.splice(sourceIndex, 1);
      nextCategoryItems.splice(targetIndex, 0, movedItem);

      const normalizedCategoryItems = nextCategoryItems.map((item, index) => patchItemOrder(item, index + 1));
      const reorderedByPath = new Map(normalizedCategoryItems.map((item) => [item.relativePath, item]));
      const nextItems = current.map((item) => reorderedByPath.get(item.relativePath) ?? item);

      itemsRef.current = nextItems;
      pendingNoteOrderRef.current = normalizedCategoryItems;
      return nextItems;
    });
  };

  const reorderNoteToTarget = async (sourcePath: string, targetPath: string) => {
    if (!ensureCanReorderNotes()) {
      return;
    }

    const originalItems = itemsRef.current;
    reorderNoteLocally(sourcePath, targetPath);
    const nextOrder = pendingNoteOrderRef.current;

    if (!nextOrder) {
      return;
    }

    pendingNoteOrderRef.current = null;
    await persistReorderedNotes(sourcePath, originalItems, nextOrder);
  };

  const beginNotePointerDrag = (event: ReactPointerEvent<HTMLElement>, itemPath: string) => {
    if (!ensureCanReorderNotes()) {
      return;
    }

    event.preventDefault();
    noteDragSourceRef.current = itemPath;
    noteDragOriginalItemsRef.current = itemsRef.current;
    pendingNoteOrderRef.current = null;
    setDraggingNotePath(itemPath);
  };

  const handleNotePointerEnter = (itemPath: string) => {
    const sourcePath = noteDragSourceRef.current;
    if (!sourcePath) {
      return;
    }

    reorderNoteLocally(sourcePath, itemPath);
  };

  const finishNotePointerDrag = async () => {
    const nextOrder = pendingNoteOrderRef.current;
    const originalItems = noteDragOriginalItemsRef.current;
    const sourcePath = noteDragSourceRef.current;

    noteDragSourceRef.current = null;
    noteDragOriginalItemsRef.current = null;
    pendingNoteOrderRef.current = null;
    setDraggingNotePath(null);

    if (!sourcePath || !nextOrder || !originalItems || isBusy) {
      return;
    }

    await persistReorderedNotes(sourcePath, originalItems, nextOrder);
  };

  const openDeleteCategoryDialog = (categoryOverride?: ContentCategory | null) => {
    const categoryToDelete = categoryOverride ?? selectedCategory;
    if (!categoryToDelete) {
      setStatus('请选择要删除的类目。');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`delete "${categoryToDelete.label}"`)) {
      return;
    }

    const affectedItems = items.filter((item) => getItemCategorySlug(item) === categoryToDelete.slug);
    const otherCategories = categories.filter((category) => category.slug !== categoryToDelete.slug);

    if (affectedItems.length > 0 && otherCategories.length === 0) {
      setStatus('该类目下还有文章，请先新建另一个类目用于承接这些文章。');
      return;
    }

    setCategoryDeleteDialog({
      categorySlug: categoryToDelete.slug,
      targetSlug: affectedItems.length > 0 ? otherCategories[0]?.slug ?? '' : '',
    });
  };

  const closeCategoryDeleteDialog = () => {
    if (!isBusy) {
      setCategoryDeleteDialog(null);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryDeleteDialog) {
      return;
    }

    const categoryToDelete = categories.find((category) => category.slug === categoryDeleteDialog.categorySlug) ?? null;
    if (!categoryToDelete) {
      setCategoryDeleteDialog(null);
      setStatus('要删除的类目已不存在。');
      return;
    }

    const affectedItems = items.filter((item) => getItemCategorySlug(item) === categoryToDelete.slug);
    const otherCategories = categories.filter((category) => category.slug !== categoryToDelete.slug);
    const targetCategory =
      affectedItems.length > 0
        ? otherCategories.find((category) => category.slug === categoryDeleteDialog.targetSlug) ?? null
        : null;

    if (affectedItems.length > 0 && !targetCategory) {
      setStatus('请选择这些文章要迁移到的新类目。');
      return;
    }

    setIsBusy(true);
    try {
      const rewrittenItems =
        targetCategory && affectedItems.length > 0
          ? await Promise.all(affectedItems.map((item) => rewriteItemCategory(item, targetCategory.slug)))
          : [];
      const nextCategories = categories.filter((category) => category.slug !== categoryToDelete.slug);

      applyRewrittenItems(rewrittenItems);
      await persistCategoryConfig(nextCategories);
      setSelectedCategorySlug(targetCategory?.slug ?? nextCategories[0]?.slug ?? null);
      setDraft((current) =>
        current && current.category === categoryToDelete.slug
          ? patchDraft(current, { category: targetCategory?.slug ?? '' })
          : current,
      );
      setCategoryDeleteDialog(null);
      setStatus(
        targetCategory
          ? `已将 ${affectedItems.length} 篇文章迁移到「${targetCategory.label}」，并删除类目「${categoryToDelete.label}」。`
          : `已删除类目「${categoryToDelete.label}」。`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除类目失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const switchToItem = (item: ContentLibraryItem) => {
    const nextDraft = getDraftFromItem(item);

    startTransition(() => {
      activateDraft(nextDraft);
      setSelectedCategorySlug(getItemCategorySlug(item) || null);
      setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
      setIsTagPickerOpen(false);
      setStatus(`\u5df2\u6253\u5f00 "${item.frontmatter.title}"\u3002`);
    });
  };

  const openItem = (item: ContentLibraryItem) => {
    const isCurrentItem = draft?.sourceRelativePath === item.relativePath;

    if (isCurrentItem) {
      return;
    }

    if (dirty) {
      setPendingSwitchItem(item);
      setStatus('\u68c0\u6d4b\u5230\u672a\u4fdd\u5b58\u7684\u4fee\u6539\uff0c\u8bf7\u5148\u9009\u62e9\u5982\u4f55\u5904\u7406\u3002');
      return;
    }

    switchToItem(item);
  };

  /*
  const openCreateNoteDialog = () => {
    if (categories.length === 0) {
      setStatus('请先新建类目，再在类目下新建笔记。');
      return;
    }

    setCreateTitleValue('');
    setCreateCategoryValue(selectedCategorySlug ?? categories[0]?.slug ?? '');
    setCreateTypeValue('markdown');
    setIsCreateDialogOpen(true);
  };

  const confirmCreateNote = async () => {
    const normalizedTitle = createTitleValue.trim().replace(/\s+/g, ' ');
    if (!normalizedTitle) {
      setStatus('请输入笔记标题。');
      createTitleInputRef.current?.focus();
      return;
    }

    if (!createCategoryValue) {
      setStatus('请选择笔记所属类目。');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`新建 "${normalizedTitle}"`)) {
      return;
    }

    const nextDraft = patchDraft(createEmptyDraft(createTypeValue), {
      title: normalizedTitle,
      slug: createUniqueDraftSlug(normalizedTitle),
      category: createCategoryValue,
    });

    setIsCreateDialogOpen(false);
    setSelectedCategorySlug(createCategoryValue);
    setWorkspacePanel('write');
    setShowPreview(false);
    activateDraft(nextDraft);
    setStatus(`已新建 "${normalizedTitle}"。`);
  };

  */

  const openCreateNoteDialog = () => {
    const fallbackCategory =
      selectedCategorySlug && categories.some((category) => category.slug === selectedCategorySlug)
        ? selectedCategorySlug
        : categories[0]?.slug ?? '';

    if (!fallbackCategory) {
      setStatus('\u8bf7\u5148\u65b0\u5efa\u7c7b\u76ee\uff0c\u518d\u5728\u7c7b\u76ee\u4e0b\u65b0\u5efa\u7b14\u8bb0\u3002');
      return;
    }

    setCreateTitleValue('');
    setCreateCategoryValue(fallbackCategory);
    setCreateTypeValue('markdown');
    setIsCreateDialogOpen(true);
  };

  const confirmCreateNote = async () => {
    const normalizedTitle = createTitleValue.trim().replace(/\s+/g, ' ');
    if (!normalizedTitle) {
      setStatus('\u8bf7\u8f93\u5165\u7b14\u8bb0\u6807\u9898\u3002');
      createTitleInputRef.current?.focus();
      return;
    }

    const targetCategory = categories.find((category) => category.slug === createCategoryValue) ?? null;
    if (!targetCategory) {
      setStatus('\u8bf7\u5148\u65b0\u5efa\u7c7b\u76ee\uff0c\u518d\u5728\u7c7b\u76ee\u4e0b\u65b0\u5efa\u7b14\u8bb0\u3002');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`\u65b0\u5efa "${normalizedTitle}"`)) {
      return;
    }

    const nextDraft = patchDraft(createEmptyDraft(createTypeValue), {
      title: normalizedTitle,
      slug: createRandomDraftSlug(),
      order: categoryUsesManualOrder(items, targetCategory.slug) ? getNextCategoryOrder(items, targetCategory.slug) : null,
      category: targetCategory.slug,
    });

    setIsCreateDialogOpen(false);
    setSelectedCategorySlug(targetCategory.slug);
    setSearchQuery('');
    setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
    setShowPreview(false);
    setStatus(`\u6b63\u5728\u4fdd\u5b58 "${normalizedTitle}"...`);

    try {
      const savedItem = await persistDraft(nextDraft, {
        linkedProject: nextDraft.type === 'inknote' ? createLinkedNotebookProject(nextDraft, null) : undefined,
        successMessage: `\u5df2\u65b0\u5efa\u5e76\u4fdd\u5b58 "${normalizedTitle}"\u3002`,
        historyLabel: 'Created note',
        historyDetail: normalizedTitle,
        resetUndoStack: true,
      });

      if (!savedItem) {
        activateDraft(nextDraft);
      }
    } catch (error) {
      activateDraft(nextDraft);
      setStatus(error instanceof Error ? error.message : `\u65b0\u5efa "${normalizedTitle}" \u5931\u8d25\u3002`);
    }
  };

  const revertDraft = () => {
    if (!draft) {
      return;
    }

    if (!draft.sourceRelativePath) {
      activateDraft(null);
      setStatus('已丢弃未保存的草稿。');
      return;
    }

    const source = items.find((item) => item.relativePath === draft.sourceRelativePath);
    if (!source) {
      setStatus('找不到原始内容，无法恢复草稿。');
      return;
    }

    const nextDraft = getDraftFromItem(source);
    activateDraft(nextDraft);
    setSelectedCategorySlug(getItemCategorySlug(source) || null);
    setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
    setHistoryEntries([createHistoryEntry('Reverted note', source.frontmatter.title)]);
    setStatus('已恢复到最近保存的版本。');
  };

  const handleLinkedNotebookChange = (nextProject: ProjectData) => {
    linkedNotebookRef.current = nextProject;
    setLinkedNotebook(nextProject);
    setDraft((current) =>
      current && current.type === 'inknote'
        ? patchDraft(current, {
            paperStyle: nextProject.paperStyle,
            handwritingStyle: nextProject.handwritingStyle,
          })
        : current,
    );
    setLinkedNotebookStatus('Linked notebook project updated locally.');
    linkedNotebookSessionIdRef.current = draftSessionId;
  };

  const patchLinkedNotebook = (patch: Partial<ProjectData>) => {
    const currentProject = linkedNotebookRef.current;
    if (!currentProject) {
      return;
    }

    handleLinkedNotebookChange({
      ...currentProject,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateLinkedNotebookContent = (
    nextContent: string,
    options: { undoSelection?: EditorSelectionState | null } = {},
  ) => {
    const currentProject = linkedNotebookRef.current;
    if (!currentProject || currentProject.content === nextContent) {
      return;
    }

    pushLinkedNotebookUndoEntry({
      project: currentProject,
      selection: options.undoSelection ?? null,
    });

    handleLinkedNotebookChange({
      ...currentProject,
      content: nextContent,
      updatedAt: new Date().toISOString(),
    });
  };

  const applyLinkedNotebookTransform = (
    transform: (value: string, selectionStart: number, selectionEnd: number) => TextTransformResult,
  ) => {
    const currentProject = linkedNotebookRef.current;
    if (!currentProject) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const undoSelection = readEditorSelection();
    const scrollTop = editor.scrollTop;
    const scrollRatio = getScrollRatio(editor);
    const result = transform(currentProject.content, editor.selectionStart, editor.selectionEnd);
    updateLinkedNotebookContent(result.nextValue, { undoSelection });
    restoreEditorViewAfterTransform(result, scrollTop, scrollRatio);
  };

  const applyLinkedNotebookInlineWrap = (prefix: string, suffix: string, placeholder: string) => {
    applyLinkedNotebookTransform((value, selectionStart, selectionEnd) =>
      wrapSelection(value, selectionStart, selectionEnd, prefix, suffix, placeholder),
    );
  };

  const applyLinkedNotebookLinePrefix = (formatter: (line: string, index: number) => string) => {
    applyLinkedNotebookTransform((value, selectionStart, selectionEnd) =>
      prefixSelectedLines(value, selectionStart, selectionEnd, formatter),
    );
  };

  const persistDraftAutoMetadata = async (metadata: DraftAutoSaveMetadata) => {
    if (!isTauri()) {
      return;
    }

    const raw = await readContentFile(metadata.sourceRelativePath);
    const diskItem = toContentLibraryItem(metadata.sourceRelativePath, raw);
    if (!diskItem) {
      throw new Error(`无法读取 content/${metadata.sourceRelativePath} 的文章元数据。`);
    }

    const metadataPatch: Partial<ContentDraft> = {
      updatedAt: getTimestampValue(),
    };
    if (typeof metadata.title === 'string') {
      metadataPatch.title = metadata.title;
    }
    if (typeof metadata.tagsText === 'string') {
      metadataPatch.tagsText = metadata.tagsText;
    }

    const savedDraft = patchDraft(createDraftFromItem(diskItem), metadataPatch);
    const payload = serializeContentDraft(savedDraft);
    await writeContentFile(metadata.sourceRelativePath, payload);

    const savedItem = toContentLibraryItem(metadata.sourceRelativePath, payload);
    if (!savedItem) {
      throw new Error(`content/${metadata.sourceRelativePath} 的文章元数据保存后无法重新解析。`);
    }

    draftCacheRef.current.delete(metadata.sourceRelativePath);
    setItems((current) => {
      const nextItems = sortLibraryItems(
        current.map((item) => (item.relativePath === metadata.sourceRelativePath ? savedItem : item)),
      );
      itemsRef.current = nextItems;
      return nextItems;
    });

    setDraft((current) => {
      if (current?.sourceRelativePath !== metadata.sourceRelativePath) {
        return current;
      }

      const currentPatch: Partial<ContentDraft> = {
        updatedAt: savedDraft.updatedAt,
        savedSnapshot: payload,
      };
      if (typeof metadata.title === 'string' && current.title === diskItem.frontmatter.title) {
        currentPatch.title = metadata.title;
      }
      if (
        typeof metadata.tagsText === 'string' &&
        current.tagsText === getFrontmatterTags(diskItem.frontmatter.tags).join(', ')
      ) {
        currentPatch.tagsText = metadata.tagsText;
      }

      return patchDraft(current, currentPatch);
    });
  };

  const queueDraftMetadataSave = (metadata: DraftAutoSaveMetadata) => {
    draftMetadataSaveQueueRef.current = draftMetadataSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await persistDraftAutoMetadata(metadata);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '标题或标签自动保存失败。');
        }
      });

    return draftMetadataSaveQueueRef.current;
  };

  const scheduleDraftMetadataSave = (metadata: DraftAutoSaveMetadata, delay: number) => {
    const pending = pendingDraftMetadataRef.current;
    if (pending && pending.sourceRelativePath !== metadata.sourceRelativePath) {
      void queueDraftMetadataSave(pending);
    }

    pendingDraftMetadataRef.current =
      pending?.sourceRelativePath === metadata.sourceRelativePath
        ? { ...pending, ...metadata }
        : metadata;

    if (draftMetadataSaveTimerRef.current !== null) {
      window.clearTimeout(draftMetadataSaveTimerRef.current);
    }

    const nextMetadata = pendingDraftMetadataRef.current;
    const hasChanges = typeof nextMetadata.title === 'string' || typeof nextMetadata.tagsText === 'string';
    if (!hasChanges) {
      pendingDraftMetadataRef.current = null;
      draftMetadataSaveTimerRef.current = null;
      return;
    }

    draftMetadataSaveTimerRef.current = window.setTimeout(() => {
      const queuedMetadata = pendingDraftMetadataRef.current;
      pendingDraftMetadataRef.current = null;
      draftMetadataSaveTimerRef.current = null;
      if (queuedMetadata) {
        void queueDraftMetadataSave(queuedMetadata);
      }
    }, delay);
  };

  const flushDraftMetadataSave = async () => {
    if (draftMetadataSaveTimerRef.current !== null) {
      window.clearTimeout(draftMetadataSaveTimerRef.current);
      draftMetadataSaveTimerRef.current = null;
    }

    const pending = pendingDraftMetadataRef.current;
    pendingDraftMetadataRef.current = null;
    if (pending) {
      queueDraftMetadataSave(pending);
    }

    await draftMetadataSaveQueueRef.current;
  };

  const persistDraft = async (
    draftInput: ContentDraft,
    options?: {
      linkedProject?: ProjectData | null;
      successMessage?: string;
      failureMessage?: string;
      historyLabel?: string;
      historyDetail?: string;
      resetUndoStack?: boolean;
    },
  ): Promise<ContentLibraryItem | null> => {
    await flushDraftMetadataSave();

    const timestampedDraft = patchDraft(draftInput, { updatedAt: getTimestampValue() });
    const nextSaveTarget = getDraftSavePath(timestampedDraft);
    const nextLinkedNotebookTarget =
      timestampedDraft.type === 'inknote' && timestampedDraft.projectFile.trim()
        ? resolveSiblingContentPath(nextSaveTarget, timestampedDraft.projectFile.trim())
        : null;
    const nextValidationError = getDraftValidationError(timestampedDraft);
    const nextDuplicateItem =
      timestampedDraft.sourceRelativePath !== nextSaveTarget
        ? items.find((item) => item.relativePath === nextSaveTarget)
        : null;

    if (nextValidationError) {
      setStatus(nextValidationError);
      return null;
    }

    if (nextDuplicateItem) {
      setStatus(`目标路径 content/${nextSaveTarget} 已存在。`);
      return null;
    }

    if (!isTauri()) {
      setStatus('写入 content/ 需要在 Tauri 桌面端中执行。');
      return null;
    }

    setIsBusy(true);

    try {
      const linkedProject =
        timestampedDraft.type === 'inknote'
          ? options?.linkedProject ?? linkedNotebook ?? createLinkedNotebookProject(timestampedDraft, linkedNotebookRef.current)
          : null;

      const finalDraft =
        timestampedDraft.type === 'inknote' && linkedProject
          ? patchDraft(timestampedDraft, {
              paperStyle: linkedProject.paperStyle,
              handwritingStyle: linkedProject.handwritingStyle,
            })
          : timestampedDraft;

      const markdownPayload = serializeContentDraft(finalDraft);
      await writeContentFile(nextSaveTarget, markdownPayload);

      if (finalDraft.type === 'inknote' && linkedProject && nextLinkedNotebookTarget) {
        await writeContentFile(nextLinkedNotebookTarget, serializeProject(linkedProject));

        const savedProject: ProjectData = {
          ...linkedProject,
          version: 1,
          updatedAt: new Date().toISOString(),
        };

        setLinkedNotebook(savedProject);
        setLinkedNotebookPath(nextLinkedNotebookTarget);
        setLinkedNotebookSavedSnapshot(getProjectSnapshot(savedProject));
        setLinkedNotebookStatus(`Synced content/${nextLinkedNotebookTarget}`);
        linkedNotebookSessionIdRef.current = draftSessionId;
      }

      const savedItem = toContentLibraryItem(nextSaveTarget, markdownPayload);
      if (!savedItem) {
        throw new Error('Saved content could not be parsed again.');
      }

      const nextItems = sortLibraryItems([
        ...items.filter((item) => item.relativePath !== draftInput.sourceRelativePath),
        savedItem,
      ]);
      const isNewDraft = !draftInput.sourceRelativePath;

      setItems(nextItems);
      setSelectedCategorySlug(getItemCategorySlug(savedItem) || null);
      setWorkspacePanel(getWorkspacePanelForDraft(savedItem.frontmatter));

      if (options?.resetUndoStack) {
        const nextDraft = getDraftFromItem(savedItem);
        activateDraft(nextDraft);
        setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
        if (options.historyLabel) {
          setHistoryEntries([createHistoryEntry(options.historyLabel, options.historyDetail ?? savedItem.frontmatter.title)]);
        }
      } else {
        const nextDraft = getDraftFromItem(savedItem);
        setDraft(nextDraft);
        setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
        if (options?.historyLabel) {
          appendHistoryEntry(options.historyLabel, options.historyDetail ?? savedItem.frontmatter.title);
        }
      }

      setStatus(options?.successMessage ?? `已保存到 content/${nextSaveTarget}`);
      if (isNewDraft) {
        await assignMissingGalleryCardImagesForItems(nextItems, [savedItem]);
      }

      return savedItem;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : options?.failureMessage ?? '保存笔记失败。');
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const saveDraft = async (): Promise<ContentLibraryItem | null> => {
    if (!draft) {
      return null;
    }

    return persistDraft(draft, {
      successMessage: `已保存到 content/${getDraftSavePath(draft)}`,
      historyLabel: 'Saved note',
      historyDetail: draft.title,
    });
  };

  const returnToCurrentDraft = () => {
    if (isPendingSwitchSaving) {
      return;
    }

    setPendingSwitchItem(null);
    setStatus('\u5df2\u8fd4\u56de\u5f53\u524d\u7b14\u8bb0\u3002');
  };

  const discardAndSwitchItem = () => {
    if (!pendingSwitchItem || isPendingSwitchSaving) {
      return;
    }

    const targetItem = pendingSwitchItem;
    setPendingSwitchItem(null);
    setStatus('\u5df2\u4e22\u5f03\u672a\u4fdd\u5b58\u7684\u4fee\u6539\u3002');
    switchToItem(targetItem);
  };

  const saveAndSwitchItem = async () => {
    if (!pendingSwitchItem || isPendingSwitchSaving) {
      return;
    }

    const targetItem = pendingSwitchItem;
    setIsPendingSwitchSaving(true);

    try {
      const savedItem = await saveDraft();

      if (!savedItem) {
        setStatus('\u4fdd\u5b58\u672a\u5b8c\u6210\uff0c\u5df2\u7559\u5728\u5f53\u524d\u7b14\u8bb0\u3002');
        return;
      }

      setPendingSwitchItem(null);
      switchToItem(targetItem);
    } finally {
      setIsPendingSwitchSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!draft) {
      return;
    }

    const nextPublishedState = !draft.published;

    await persistDraft(patchDraft(draft, { published: nextPublishedState }), {
      successMessage: nextPublishedState
        ? `已将《${draft.title}》设为发布状态，本地博客将自动刷新；线上站点仍需执行“发布站点”。`
        : `已将《${draft.title}》切换为草稿，本地博客将自动刷新；线上站点仍需执行“发布站点”。`,
      historyLabel: nextPublishedState ? 'Published note' : 'Unpublished note',
      historyDetail: draft.title,
    });
  };

  const exportDraft = async () => {
    if (!draft) {
      return;
    }

    if (draft.type !== 'markdown') {
      setStatus('当前仅支持将 Markdown 笔记导出为 PDF。');
      return;
    }

    if (!isTauri()) {
      setStatus('导出笔记需要在 Tauri 桌面端中执行。');
      return;
    }

    const chosenPath = await chooseFileToSave(`${draft.slug || 'note'}.pdf`);
    if (!chosenPath) {
      setStatus('已取消导出。');
      return;
    }

    const pdfPath = ensureExtension(chosenPath, '.pdf');
    setIsBusy(true);
    setStatus('正在生成 PDF...');

    try {
      const { renderMarkdownPdf } = await import('./lib/markdown-pdf-export');
      const pdfBytes = await renderMarkdownPdf({
        title: draft.title.trim() || '未命名笔记',
        markdown: resolveDesktopContentImages(draft.body, libraryRoot, localBlogPreviewOrigin),
      });
      await writeBinaryFile(pdfPath, pdfBytes);
      appendHistoryEntry('Exported note', draft.title);
      setStatus(`PDF 已导出到 ${pdfPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setStatus(`导出 PDF 失败：${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const openMetadataDialog = () => {
    if (!draft) {
      return;
    }

    setMetadataCategoryValue(draft.category || categories[0]?.slug || '');
    setMetadataDateValue(getDatePart(draft.date));
    setIsMetadataDialogOpen(true);
  };

  const openMetadataDatePicker = () => {
    const input = metadataDateInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Some WebView versions only allow showPicker during a direct click.
    }
  };

  const saveMetadata = async () => {
    if (!draft) {
      return;
    }

    const nextCategory =
      metadataCategoryOptions.find((category) => category.slug === metadataCategoryValue) ??
      null;
    const nextDate = getDatePart(metadataDateValue);

    if (!nextCategory) {
      setStatus('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u6240\u5c5e\u7c7b\u76ee\u3002');
      return;
    }

    if (!nextDate) {
      setStatus('\u8bf7\u586b\u5199\u6587\u7ae0\u53d1\u5e03\u65f6\u95f4\u3002');
      return;
    }

    const savedItem = await persistDraft(patchDraft(draft, { category: nextCategory.slug, date: nextDate }), {
      successMessage: `\u5df2\u66f4\u65b0\u300a${draft.title}\u300b\u7684\u6587\u7ae0\u5143\u6570\u636e\u3002`,
      historyLabel: 'Edited metadata',
      historyDetail: `${nextCategory.label} | ${nextDate}`,
    });

    if (savedItem) {
      setIsMetadataDialogOpen(false);
    }
  };

  const openDeleteDialog = () => {
    if (!draft) {
      return;
    }

    setIsDeleteDialogOpen(true);
  };

  const deleteDraft = async () => {
    if (!draft) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setIsDeleteDialogOpen(false);

    if (!draft.sourceRelativePath) {
      activateDraft(null);
      clearLinkedNotebookState();
      setStatus('已丢弃未保存的草稿。');
      return;
    }

    if (!isTauri()) {
      setStatus('删除笔记需要在 Tauri 桌面端中执行。');
      return;
    }

    await flushDraftMetadataSave();
    setIsBusy(true);

    try {
      await deleteContentFile(draft.sourceRelativePath);

      if (draft.type === 'inknote' && linkedNotebookTarget) {
        try {
          await deleteContentFile(linkedNotebookTarget);
        } catch {
          // Ignore missing linked project files.
        }
      }

      const remainingItems = sortLibraryItems(items.filter((item) => item.relativePath !== draft.sourceRelativePath));
      setItems(remainingItems);

      const nextItem =
        remainingItems.find((item) => getItemCategorySlug(item) === draft.category) ?? remainingItems[0] ?? null;

      if (nextItem) {
        activateDraft(getDraftFromItem(nextItem));
        setSelectedCategorySlug(getItemCategorySlug(nextItem) || null);
        setStatus(`已删除「${draft.title}」。`);
      } else {
        activateDraft(null);
        clearLinkedNotebookState();
        setStatus(`已删除「${draft.title}」。`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除笔记失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const updateDraft = (
    patch: Partial<ContentDraft>,
    options: { undoSelection?: EditorSelectionState | null } = {},
  ) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextDraft = patchDraft(current, patch);
      if (getDraftEditorSnapshot(nextDraft) === getDraftEditorSnapshot(current)) {
        return current;
      }

      pushDraftUndoEntry({
        draft: current,
        selection: options.undoSelection ?? null,
      });
      return nextDraft;
    });

    if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
      setSelectedCategorySlug(typeof patch.category === 'string' && patch.category.trim() ? patch.category : null);
    }
  };

  const updateAutoSavedDraftMetadata = (
    patch: Pick<Partial<ContentDraft>, 'title' | 'tagsText'>,
    delay: number,
  ) => {
    if (!draft) {
      return;
    }

    const nextDraft = patchDraft(draft, patch);
    setDraft(nextDraft);

    if (!nextDraft.sourceRelativePath) {
      return;
    }

    const metadata: DraftAutoSaveMetadata = {
      sourceRelativePath: nextDraft.sourceRelativePath,
    };
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      metadata.title = nextDraft.title.trim() ? nextDraft.title : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tagsText')) {
      metadata.tagsText = nextDraft.tagsText;
    }

    scheduleDraftMetadataSave(metadata, delay);
  };

  const setDraftTags = (nextTags: string[]) => {
    updateAutoSavedDraftMetadata({ tagsText: nextTags.join(', ') }, 0);
  };

  const getLocalBlogPreviewPath = (): string => {
    if (draft) {
      if (draft.sourceRelativePath) {
        const savedItem = items.find((item) => item.relativePath === draft.sourceRelativePath) ?? null;
        const savedPath = getPreviewPathFromItem(savedItem);
        if (savedPath) {
          return savedPath;
        }
      }

      if (draft.type === 'inknote') {
        return `/inknote/${draft.slug || 'untitled-inknote'}`;
      }

      const permalink = draft.permalink.trim();
      if (permalink) {
        return permalink.startsWith('/') ? permalink : `/${permalink}`;
      }

      return `/notes/${draft.slug || 'untitled-markdown'}`;
    }

    const categorySlug = selectedCategorySlug ?? categories[0]?.slug ?? '';
    return categorySlug ? `/category/${categorySlug}` : '/notes';
  };

  const openLocalBlogPreview = async () => {
    if (isOpeningBlogPreview) {
      return;
    }

    setIsOpeningBlogPreview(true);
    let path = getLocalBlogPreviewPath();

    if (draft?.sourceRelativePath && isTauri()) {
      try {
        const raw = await readContentFile(draft.sourceRelativePath);
        const latestItem = toContentLibraryItem(draft.sourceRelativePath, raw);
        const latestPath = getPreviewPathFromItem(latestItem);
        if (latestPath) {
          path = latestPath;
        }
      } catch {
        // Fall back to the in-memory route when the content file cannot be re-read.
      }
    }

    try {
      const server = await ensureBlogPreviewServer();
      if (!server.ready) {
        throw new Error(server.message || '\u672c\u5730\u535a\u5ba2\u670d\u52a1\u5c1a\u672a\u5c31\u7eea\u3002');
      }

      const origin = server.origin || LOCAL_BLOG_PREVIEW_ORIGIN;
      setLocalBlogPreviewOrigin(origin);
      const url = `${origin}${path}`;
      await openExternalUrl(url);
      setStatus(`\u5df2\u6253\u5f00\u672c\u5730\u535a\u5ba2\u9884\u89c8\uff1a${url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const url = `${localBlogPreviewOrigin}${path}`;
      setStatus(`\u65e0\u6cd5\u6253\u5f00\u672c\u5730\u535a\u5ba2\u9884\u89c8\uff1a${url}\uff08${message}\uff09`);
    } finally {
      setIsOpeningBlogPreview(false);
    }
  };

  const hasTag = (tag: string) =>
    tagList.some((currentTag) => currentTag.toLocaleLowerCase() === tag.toLocaleLowerCase());

  const toggleTag = (tag: string) => {
    const normalized = tag.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return;
    }

    if (hasTag(normalized)) {
      setDraftTags(tagList.filter((currentTag) => currentTag.toLocaleLowerCase() !== normalized.toLocaleLowerCase()));
      return;
    }

    setDraftTags(toUniqueTagList([...tagList, normalized]));
  };

  const commitTagInput = () => {
    const normalized = normalizedTagInput;
    if (!normalized) {
      return;
    }

    toggleTag(normalized);
    setTagInputValue('');
  };

  const handleEditorKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 's') {
      event.preventDefault();
      void saveDraft();
      return;
    }

    if (activeWorkspacePanel === 'inknote') {
      if ((key === 'y' || (key === 'z' && event.shiftKey)) && redoLinkedNotebookChange()) {
        event.preventDefault();
        return;
      }

      if (key === 'z' && !event.shiftKey && undoLinkedNotebookChange()) {
        event.preventDefault();
      }
      return;
    }

    if (activeWorkspacePanel !== 'write') {
      return;
    }

    if ((key === 'y' || (key === 'z' && event.shiftKey)) && redoDraftChange()) {
      event.preventDefault();
      return;
    }

    if (key === 'z' && !event.shiftKey && undoDraftChange()) {
      event.preventDefault();
    }
  };

  const applyBodyTransform = (
    transform: (value: string, selectionStart: number, selectionEnd: number) => TextTransformResult,
  ) => {
    if (!draft || workspacePanel !== 'write') {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const undoSelection = readEditorSelection();
    const scrollTop = editor.scrollTop;
    const scrollRatio = getScrollRatio(editor);
    const result = transform(draft.body, editor.selectionStart, editor.selectionEnd);
    updateDraft({ body: result.nextValue }, { undoSelection });
    restoreEditorViewAfterTransform(result, scrollTop, scrollRatio);
  };

  const applyInlineWrap = (prefix: string, suffix: string, placeholder: string) => {
    applyBodyTransform((value, selectionStart, selectionEnd) =>
      wrapSelection(value, selectionStart, selectionEnd, prefix, suffix, placeholder),
    );
  };

  const applyLinePrefix = (formatter: (line: string, index: number) => string) => {
    applyBodyTransform((value, selectionStart, selectionEnd) =>
      prefixSelectedLines(value, selectionStart, selectionEnd, formatter),
    );
  };

  const insertMarkdownSnippet = (snippet: string, selectionOffsetStart = 0, selectionOffsetEnd = 0) => {
    applyBodyTransform((value, selectionStart, selectionEnd) =>
      insertSnippet(value, selectionStart, selectionEnd, snippet, selectionOffsetStart, selectionOffsetEnd),
    );
  };

  const insertPastedImageReferences = (
    markdown: string,
    selection: EditorSelectionState,
    expectedSlug: string,
    targetType: ContentDraft['type'],
  ) => {
    let nextSelection: EditorSelectionState | null = null;
    let viewRestoreResult: TextTransformResult | null = null;
    const editor = editorRef.current;
    const scrollTop = editor?.scrollTop ?? 0;
    const scrollRatio = editor ? getScrollRatio(editor) : editorScrollRatioRef.current;

    if (targetType === 'inknote') {
      const currentDraft = draftRef.current;
      const currentProject = linkedNotebookRef.current;
      if (!currentDraft || currentDraft.type !== 'inknote' || currentDraft.slug !== expectedSlug || !currentProject) {
        return;
      }

      const safeSelection = clampEditorSelection(selection, currentProject.content.length);
      const before = currentProject.content.slice(0, safeSelection.start);
      const after = currentProject.content.slice(safeSelection.end);
      const prefix = before && !before.endsWith('\n') ? '\n\n' : before.endsWith('\n\n') || !before ? '' : '\n';
      const suffix = after && !after.startsWith('\n') ? '\n\n' : after.startsWith('\n\n') || !after ? '' : '\n';
      const snippet = `${prefix}${markdown}${suffix}`;
      const result = insertSnippet(currentProject.content, safeSelection.start, safeSelection.end, snippet, snippet.length);

      updateLinkedNotebookContent(result.nextValue, { undoSelection: safeSelection });
      restoreEditorViewAfterTransform(result, scrollTop, scrollRatio);
      return;
    }

    setDraft((current) => {
      if (!current || current.slug !== expectedSlug) {
        return current;
      }

      const safeSelection = clampEditorSelection(selection, current.body.length);
      const before = current.body.slice(0, safeSelection.start);
      const after = current.body.slice(safeSelection.end);
      const prefix = before && !before.endsWith('\n') ? '\n\n' : before.endsWith('\n\n') || !before ? '' : '\n';
      const suffix = after && !after.startsWith('\n') ? '\n\n' : after.startsWith('\n\n') || !after ? '' : '\n';
      const snippet = `${prefix}${markdown}${suffix}`;
      const result = insertSnippet(current.body, safeSelection.start, safeSelection.end, snippet, snippet.length);

      pushDraftUndoEntry({ draft: current, selection: safeSelection });
      nextSelection = {
        start: result.nextSelectionStart,
        end: result.nextSelectionEnd,
        direction: 'none',
      };
      viewRestoreResult = result;
      return patchDraft(current, { body: result.nextValue });
    });

    requestAnimationFrame(() => {
      if (viewRestoreResult) {
        restoreEditorViewAfterTransform(viewRestoreResult, scrollTop, scrollRatio);
        return;
      }
      restoreEditorSelection(nextSelection);
    });
  };

  const insertSlidesDocument = async () => {
    if (!draft || workspacePanel !== 'write') {
      return;
    }
    if (!libraryRoot || !isTauri()) {
      setStatus('插入演示文稿需要在已加载内容仓的桌面应用中使用。');
      return;
    }
    if (!draft.sourceRelativePath) {
      setStatus('请先保存当前笔记，再插入演示文稿。');
      return;
    }

    const selection =
      readEditorSelection() ??
      editorSelectionRef.current ??
      ({
        start: draft.body.length,
        end: draft.body.length,
        direction: 'none',
      } satisfies EditorSelectionState);

    const selectedPath = await chooseSlidesFile();
    if (!selectedPath) {
      return;
    }

    const extension = getSlidesFileExtension(selectedPath);
    if (!extension) {
      setStatus('仅支持插入 PDF 文件。');
      return;
    }

    const noteSlug = draft.slug;
    const fileTitle = getFileNameFromPath(selectedPath).replace(/\.[^.\\/]+$/i, '') || 'Slides';

    try {
      setStatus(`正在处理演示文稿：${fileTitle}...`);
      const fileName = createSlidesFileName(selectedPath, new Date());
      const renderTarget = getSlidesTargetPath(libraryRoot, draft.type, noteSlug, fileName);

      await copyFileToPath(selectedPath, renderTarget.filePath);

      insertPastedImageReferences(
        [
          `<div data-inknote-slides src="${renderTarget.publicPath}"`,
          ` title="${escapeHtmlAttribute(fileTitle)}" type="pdf"></div>`,
        ].join(''),
        selection,
        noteSlug,
        draft.type,
      );
      appendHistoryEntry('Inserted slides', fileTitle);
      setStatus(`已插入 PDF 演示文稿：${fileTitle}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '插入演示文稿失败。');
    }
  };

  const handleEditorPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const itemImageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFiles =
      itemImageFiles.length > 0
        ? itemImageFiles
        : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      captureEditorSelection();
      return;
    }

    event.preventDefault();
    const selection: EditorSelectionState = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
      direction: event.currentTarget.selectionDirection,
    };
    editorSelectionRef.current = selection;

    if (!draft || !libraryRoot || !isTauri()) {
      setStatus('粘贴图片需要在已加载内容仓的桌面应用中使用。');
      return;
    }

    const noteType = draft.type;
    const noteSlug = draft.slug;
    const timestamp = new Date();

    void (async () => {
      const references: string[] = [];
      const failures: string[] = [];
      setStatus(`正在保存 ${imageFiles.length} 张图片...`);

      for (const [index, file] of imageFiles.entries()) {
        const extension = PASTED_IMAGE_EXTENSIONS[file.type.toLocaleLowerCase()];
        if (!extension) {
          failures.push(`${file.name || `图片 ${index + 1}`}：不支持的图片格式`);
          continue;
        }
        if (file.size > PASTED_IMAGE_MAX_BYTES) {
          failures.push(`${file.name || `图片 ${index + 1}`}：超过 25 MB`);
          continue;
        }

        try {
          const fileName = createPastedImageFileName(timestamp, index, imageFiles.length, extension);
          const target = getPastedImageTargetPath(libraryRoot, noteType, noteSlug, fileName);
          await writeBinaryFile(target.filePath, new Uint8Array(await file.arrayBuffer()));
          references.push(`<img src="${target.publicPath}" alt="图片">`);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `图片 ${index + 1} 保存失败`);
        }
      }

      if (references.length > 0) {
        insertPastedImageReferences(references.join('\n\n'), selection, noteSlug, noteType);
        appendHistoryEntry('Pasted image', `${references.length} image${references.length > 1 ? 's' : ''}`);
      }

      if (failures.length > 0) {
        setStatus(
          references.length > 0
            ? `已插入 ${references.length} 张图片，${failures.length} 张保存失败。`
            : `图片保存失败：${failures[0]}`,
        );
        return;
      }

      setStatus(`已保存并插入 ${references.length} 张图片。`);
    })();
  };

  const managedImages = useMemo(() => collectManagedImages(items, draft), [draft, items]);
  const externalManagedImages = useMemo(
    () => managedImages.filter((asset) => asset.kind === 'external'),
    [managedImages],
  );
  const internalManagedImages = useMemo(
    () => managedImages.filter((asset) => asset.kind === 'internal'),
    [managedImages],
  );
  const referencedManagedImages = useMemo(
    () => [...externalManagedImages, ...internalManagedImages],
    [externalManagedImages, internalManagedImages],
  );
  const managedImagePageData = useMemo(
    () => paginateImageItems(referencedManagedImages, managedImagePage),
    [referencedManagedImages, managedImagePage],
  );
  const usedGalleryImageKeys = useMemo(() => {
    const articleItems = getArticleCardItems(items);
    const baselineAssignments =
      Object.keys(galleryAssignments).length > 0
        ? galleryAssignments
        : createSequentialGalleryAssignments(articleItems, galleryImages);
    const normalizedAssignments = normalizeArticleGalleryAssignments(
      articleItems,
      galleryImages,
      baselineAssignments,
    );

    return new Set(Object.values(normalizedAssignments));
  }, [galleryAssignments, galleryImages, items]);
  const sortedGalleryImages = useMemo(
    () =>
      galleryImages
        .map((image, index) => ({
          image,
          index,
          used: usedGalleryImageKeys.has(getGalleryImageKey(image)),
        }))
        .sort((left, right) => Number(right.used) - Number(left.used) || left.index - right.index)
        .map((entry) => entry.image),
    [galleryImages, usedGalleryImageKeys],
  );
  const galleryImagePageData = useMemo(
    () => paginateImageItems(sortedGalleryImages, galleryPage),
    [sortedGalleryImages, galleryPage],
  );
  const selectedGalleryImageSet = useMemo(
    () => new Set(selectedGalleryImageKeys),
    [selectedGalleryImageKeys],
  );
  const isGalleryPageFullySelected =
    galleryImagePageData.items.length > 0 &&
    galleryImagePageData.items.every((image) => selectedGalleryImageSet.has(getGalleryImageKey(image)));

  const readUserGalleryManifest = async (): Promise<GalleryImageManifest> => {
    const manifestPath = getUserGalleryManifestPath(libraryRoot);
    try {
      const raw = await readTextFile(manifestPath);
      return normalizeGalleryManifest(JSON.parse(raw));
    } catch {
      return normalizeGalleryManifest({});
    }
  };

  const writeUserGalleryManifest = async (
    images: GalleryImageItem[],
    assignments: Record<string, string> = galleryAssignments,
  ) => {
    const manifestPath = getUserGalleryManifestPath(libraryRoot);
    const manifest = normalizeGalleryManifest({
      updatedAt: new Date().toISOString(),
      images,
      assignments,
    });
    await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    setGalleryImages(manifest.images);
    setGalleryAssignments(manifest.assignments);
  };

  const assignMissingGalleryCardImagesForItems = async (
    allItems: ContentLibraryItem[],
    targetItems: ContentLibraryItem[],
  ): Promise<boolean> => {
    if (!isTauri() || !libraryRoot || targetItems.length === 0) {
      return false;
    }

    try {
      const manifest = await readUserGalleryManifest();
      if (manifest.images.length === 0) {
        return false;
      }

      const articleItems = targetItems.reduce(
        (currentItems, targetItem) => includeArticleCardItem(currentItems, targetItem),
        getArticleCardItems(allItems),
      );
      const allTargetKeys = new Set(targetItems.map(getArticleCardAssignmentKey));
      const baselineAssignments = getGalleryAssignmentBaseline(articleItems, manifest.images, manifest.assignments);
      const persistedAssignments = normalizeArticleGalleryAssignments(
        articleItems,
        manifest.images,
        manifest.assignments,
      );
      const normalizedAssignments = normalizeArticleGalleryAssignments(
        articleItems,
        manifest.images,
        baselineAssignments,
      );
      const nextAssignments = assignMissingGalleryCardImages(
        articleItems,
        manifest.images,
        normalizedAssignments,
        allTargetKeys,
      );

      if (areGalleryAssignmentsEqual(persistedAssignments, nextAssignments)) {
        return false;
      }

      await writeUserGalleryManifest(manifest.images, nextAssignments);
      return true;
    } catch (error) {
      console.warn('Failed to assign gallery card image.', error);
      return false;
    }
  };

  const saveGalleryImageFocus = async () => {
    if (!imagePreview?.galleryImageKey) {
      return;
    }

    const nextFocus = normalizeGalleryImageFocus(imagePreviewFocus);
    const nextImages = galleryImages.map((image) =>
      getGalleryImageKey(image) === imagePreview.galleryImageKey ? { ...image, focus: nextFocus } : image,
    );

    await writeUserGalleryManifest(nextImages);
    setImagePreview((current) => {
      if (!current || current.galleryImageKey !== imagePreview.galleryImageKey) {
        return current;
      }

      return { ...current, focus: nextFocus };
    });
    setStatus('已保存文章卡片裁剪位置。');
  };

  const loadUserGalleryManifest = async () => {
    if (!isTauri() || !libraryRoot) {
      setGalleryImages([]);
      setGalleryAssignments({});
      return;
    }

    setIsGalleryLoading(true);
    try {
      const manifest = await readUserGalleryManifest();
      setGalleryImages(manifest.images);
      setGalleryAssignments(manifest.assignments);
      setGalleryPage(1);
    } catch (error) {
      setGalleryImages([]);
      setGalleryAssignments({});
      setStatus(error instanceof Error ? error.message : '读取图库失败。');
    } finally {
      setIsGalleryLoading(false);
    }
  };

  const uploadGalleryImages = async () => {
    if (!isTauri() || !libraryRoot) {
      setStatus('图库上传需要在 Tauri 桌面端中执行。');
      return;
    }

    const selectedFiles = await chooseGalleryImageFiles();
    if (selectedFiles.length === 0) {
      return;
    }

    setIsUploadingGalleryImages(true);
    setGalleryUploadProgress(0);
    setGalleryUploadTotal(selectedFiles.length);
    setIsBusy(true);
    try {
      const manifest = await readUserGalleryManifest();
      const existingPaths = new Set(manifest.images.map((image) => image.path));
      const nextImages = [...manifest.images];
      const now = new Date();

      for (const [index, sourcePath] of selectedFiles.entries()) {
        try {
          if (!getImageFileExtension(sourcePath)) {
            continue;
          }

          const fileName = createGalleryImageFileName(sourcePath, now, index);
          const publicPath = `${USER_GALLERY_UPLOADS_PUBLIC_PREFIX}${fileName}`;
          if (existingPaths.has(publicPath)) {
            continue;
          }

          const compressedSize = await compressGalleryImageFile(sourcePath, getUserGalleryUploadPath(libraryRoot, fileName));
          existingPaths.add(publicPath);
          nextImages.unshift({
            id: `${Date.now()}-${index}-${fileName}`,
            path: publicPath,
            name: getFileNameFromPath(sourcePath),
            size: compressedSize,
            uploadedAt: now.toISOString(),
            focus: { x: 50, y: 50 },
          });
        } finally {
          setGalleryUploadProgress(index + 1);
        }
      }

      const nextAssignments = assignMissingGalleryCardImages(
        getArticleCardItems(itemsRef.current),
        nextImages,
        manifest.assignments,
      );

      await writeUserGalleryManifest(nextImages, nextAssignments);
      setGalleryPage(1);
      setStatus(`已上传 ${nextImages.length - manifest.images.length} 张图片到图库。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图库图片上传失败。');
    } finally {
      setIsUploadingGalleryImages(false);
      window.setTimeout(() => {
        setGalleryUploadProgress(0);
        setGalleryUploadTotal(0);
      }, 650);
      setIsBusy(false);
    }
  };

  const toggleGalleryImageSelection = (image: GalleryImageItem) => {
    if (!isGalleryMultiSelectMode) {
      return;
    }

    const key = getGalleryImageKey(image);
    setSelectedGalleryImageKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const enterGalleryMultiSelectMode = () => {
    setIsGalleryMultiSelectMode(true);
  };

  const exitGalleryMultiSelectMode = () => {
    setIsGalleryMultiSelectMode(false);
    setSelectedGalleryImageKeys([]);
  };

  const toggleCurrentGalleryPageSelection = () => {
    const pageKeys = galleryImagePageData.items.map(getGalleryImageKey);
    if (pageKeys.length === 0) {
      return;
    }

    if (isGalleryPageFullySelected) {
      const pageKeySet = new Set(pageKeys);
      setSelectedGalleryImageKeys((current) => current.filter((key) => !pageKeySet.has(key)));
      return;
    }

    setSelectedGalleryImageKeys((current) => Array.from(new Set([...current, ...pageKeys])));
  };

  const reassignGalleryCardImages = async () => {
    if (!isTauri() || !libraryRoot) {
      setStatus('图库分配需要在 Tauri 桌面端中执行。');
      return;
    }

    if (galleryImages.length === 0) {
      setStatus('图库为空，无法分配文章配图。');
      return;
    }

    setIsBusy(true);
    try {
      const manifest = await readUserGalleryManifest();
      const articleItems = getArticleCardItems(itemsRef.current);
      const fallbackAssignments = getGalleryAssignmentBaseline(articleItems, manifest.images, manifest.assignments);
      const nextAssignments = assignMissingGalleryCardImages(
        articleItems,
        manifest.images,
        fallbackAssignments,
      );

      await writeUserGalleryManifest(manifest.images, nextAssignments);
      setGalleryPage(1);
      setStatus('已补齐缺失笔记配图。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重新分配文章配图失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const requestDeleteSelectedGalleryImages = async () => {
    if (!isTauri() || !libraryRoot) {
      setStatus('图库删除需要在 Tauri 桌面端中执行。');
      return;
    }

    const selectedSet = new Set(selectedGalleryImageKeys);
    const selectedImages = galleryImages.filter((image) => selectedSet.has(getGalleryImageKey(image)));
    if (selectedImages.length === 0) {
      setSelectedGalleryImageKeys([]);
      return;
    }

    try {
      const manifest = await readUserGalleryManifest();
      const plan = createGalleryDeletePlan(
        getArticleCardItems(itemsRef.current),
        manifest.images,
        manifest.assignments,
        selectedImages,
      );
      setGalleryDeleteDialog({
        images: selectedImages,
        affectedCount: plan.affectedArticleKeys.size,
        reassignedCount: plan.reassignedCount,
        unassignedCount: plan.unassignedCount,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图库图片删除预检失败。');
    }
  };

  const confirmDeleteSelectedGalleryImages = async () => {
    if (!isTauri() || !libraryRoot || !galleryDeleteDialog) {
      return;
    }

    setIsDeletingGalleryImages(true);
    setIsBusy(true);
    try {
      const manifest = await readUserGalleryManifest();
      const plan = createGalleryDeletePlan(
        getArticleCardItems(itemsRef.current),
        manifest.images,
        manifest.assignments,
        galleryDeleteDialog.images,
      );

      for (const image of galleryDeleteDialog.images) {
        if (image.path.startsWith(USER_GALLERY_UPLOADS_PUBLIC_PREFIX)) {
          await deleteGalleryImageFile(image.path);
        }
      }

      await writeUserGalleryManifest(plan.nextImages, plan.nextAssignments);
      setSelectedGalleryImageKeys([]);
      setIsGalleryMultiSelectMode(false);
      setGalleryDeleteDialog(null);
      setGalleryPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(plan.nextImages.length / IMAGE_MANAGEMENT_PAGE_SIZE))),
      );
      setStatus(
        plan.affectedArticleKeys.size > 0
          ? `已删除 ${galleryDeleteDialog.images.length} 张图库图片，并只为 ${plan.affectedArticleKeys.size} 篇受影响文章重新分配配图。`
          : `已删除 ${galleryDeleteDialog.images.length} 张图库图片。`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图库图片删除失败。');
    } finally {
      setIsDeletingGalleryImages(false);
      setIsBusy(false);
    }
  };

  const localizeExternalImages = async () => {
    if (!isTauri()) {
      setStatus('外部图片本地化需要在 Tauri 桌面应用中执行。');
      return;
    }
    if (dirty) {
      setStatus('请先保存当前文章，再批量本地化外部图片。');
      return;
    }
    if (externalManagedImages.length === 0) {
      setStatus('当前内容仓没有需要本地化的外部图片。');
      return;
    }

    setIsLocalizingImages(true);
    setIsBusy(true);
    setImageLocalizationStatus(
      Object.fromEntries(
        externalManagedImages.map((asset) => [asset.source, 'processing' as ImageLocalizationStatus]),
      ),
    );
    setStatus(`正在下载 ${externalManagedImages.length} 张外部图片...`);
    const replacements = new Map<string, string>();
    const failures: string[] = [];

    try {
      await runWithConcurrency(externalManagedImages, IMAGE_LOCALIZATION_CONCURRENCY, async (asset) => {
        try {
          const cached = await cacheExternalImage(asset.source);
          replacements.set(asset.source, cached.publicPath);
          setImageLocalizationStatus((current) => ({ ...current, [asset.source]: 'success' }));
        } catch (error) {
          setImageLocalizationStatus((current) => ({ ...current, [asset.source]: 'error' }));
          failures.push(
            error instanceof Error ? error.message : typeof error === 'string' ? error : asset.source,
          );
        }
        await waitForNextFrame();
      });

      let changedNotes = 0;
      for (const item of items) {
        const itemDraft = createDraftFromItem(item);
        const nextBody = replaceImageReferenceSources(itemDraft.body, replacements);
        const nextCover = replacements.get(itemDraft.cover.trim()) ?? itemDraft.cover;
        const nextPreviewImage = replacements.get(itemDraft.previewImage.trim()) ?? itemDraft.previewImage;
        if (
          nextBody === itemDraft.body &&
          nextCover === itemDraft.cover &&
          nextPreviewImage === itemDraft.previewImage
        ) {
          continue;
        }

        const nextDraft = patchDraft(itemDraft, {
          body: nextBody,
          cover: nextCover,
          previewImage: nextPreviewImage,
          updatedAt: getTimestampValue(),
        });
        await writeContentFile(item.relativePath, serializeContentDraft(nextDraft));
        draftCacheRef.current.delete(item.relativePath);
        changedNotes += 1;
      }

      if (changedNotes > 0) {
        await loadLibrary(draft?.sourceRelativePath ?? undefined);
      }

      if (replacements.size === 0 && failures.length > 0) {
        setStatus(`图片本地化失败：${failures[0]}`);
      } else {
        setStatus(
          failures.length > 0
            ? `已本地化 ${replacements.size} 张图片并更新 ${changedNotes} 篇笔记，${failures.length} 张下载失败。`
            : `已本地化 ${replacements.size} 张图片并更新 ${changedNotes} 篇笔记。`,
        );
      }
    } catch (error) {
      setImageLocalizationStatus((current) =>
        Object.fromEntries(
          Object.entries(current).map(([source, status]) => [
            source,
            status === 'processing' ? 'error' : status,
          ]),
        ),
      );
      setStatus(error instanceof Error ? error.message : '外部图片本地化失败。');
    } finally {
      setIsLocalizingImages(false);
      setIsBusy(false);
    }
  };

  const categoryCounts = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        count: items.filter((item) => getItemCategorySlug(item) === category.slug).length,
      })),
    [categories, items],
  );

  const visibleItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!selectedCategorySlug) {
      return [];
    }

    return sortDocumentsByOrderAndDate(
      items.filter((item) => {
        if (getItemCategorySlug(item) !== selectedCategorySlug) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [item.frontmatter.title, item.frontmatter.slug, item.body]
          .join('\n')
          .toLowerCase()
          .includes(keyword);
      }),
    );
  }, [items, searchQuery, selectedCategorySlug]);
  const activeWorkspacePanel = draft?.type === 'inknote' ? 'inknote' : workspacePanel;
  const isPreviewOnly = Boolean(draft && showPreview);
  const canUndo =
    activeWorkspacePanel === 'inknote'
      ? linkedNotebookUndoStackRef.current.length > 0
      : activeWorkspacePanel === 'write' && draftUndoStackRef.current.length > 0;
  const canRedo =
    activeWorkspacePanel === 'inknote'
      ? linkedNotebookRedoStackRef.current.length > 0
      : activeWorkspacePanel === 'write' && draftRedoStackRef.current.length > 0;

  const selectedCategory =
    (selectedCategorySlug ? categories.find((category) => category.slug === selectedCategorySlug) : null) ?? null;
  const categoryToDelete =
    categoryDeleteDialog
      ? categories.find((category) => category.slug === categoryDeleteDialog.categorySlug) ?? null
      : null;
  const categoryDeleteAffectedItems = categoryToDelete
    ? items.filter((item) => getItemCategorySlug(item) === categoryToDelete.slug)
    : [];
  const categoryDeleteTargetOptions = categoryToDelete
    ? categories.filter((category) => category.slug !== categoryToDelete.slug)
    : [];
  const metadataCategoryOptions =
    draft?.category && !categories.some((category) => category.slug === draft.category)
      ? [...categories, { slug: draft.category, label: draft.category }]
      : categories;
  const currentMetadataItem = useMemo(() => {
    if (!draft?.sourceRelativePath) {
      return null;
    }

    return items.find((item) => item.relativePath === draft.sourceRelativePath) ?? null;
  }, [draft?.sourceRelativePath, items]);
  const currentMetadataArticleItems = useMemo(
    () => includeArticleCardItem(getArticleCardItems(items), currentMetadataItem),
    [currentMetadataItem, items],
  );
  const currentMetadataCardImage = useMemo(
    () =>
      getAssignedGalleryImageForArticle(
        currentMetadataItem,
        currentMetadataArticleItems,
        galleryImages,
        galleryAssignments,
      ),
    [currentMetadataArticleItems, currentMetadataItem, galleryAssignments, galleryImages],
  );
  const currentMetadataCardImageSource = currentMetadataCardImage
    ? getGalleryImagePreviewSource(currentMetadataCardImage.path, libraryRoot, localBlogPreviewOrigin)
    : '';
  const createCategoryIsValid = categories.some((category) => category.slug === createCategoryValue);

  const openMetadataCardImagePreview = () => {
    if (!currentMetadataCardImage || !currentMetadataCardImageSource) {
      setStatus('当前笔记还没有可预览的配图。');
      return;
    }

    setImagePreview({
      src: currentMetadataCardImageSource,
      title: currentMetadataCardImage.name,
      galleryImageKey: getGalleryImageKey(currentMetadataCardImage),
      focus: getGalleryImageFocus(currentMetadataCardImage),
    });
  };

  const reassignCurrentDraftCardImage = async () => {
    const currentDraft = draftRef.current;
    if (!isTauri() || !libraryRoot) {
      setStatus('重新分配配图需要在 Tauri 桌面端中执行。');
      return;
    }

    if (!currentDraft?.sourceRelativePath) {
      setStatus('请先保存笔记后再分配配图。');
      return;
    }

    setIsBusy(true);
    try {
      const manifest = await readUserGalleryManifest();
      if (manifest.images.length === 0) {
        setStatus('图库为空，无法分配配图。');
        return;
      }

      const currentItem =
        itemsRef.current.find((item) => item.relativePath === currentDraft.sourceRelativePath) ?? null;
      if (!currentItem) {
        setStatus('没有找到当前笔记条目，请先保存后再试。');
        return;
      }

      const articleItems = includeArticleCardItem(getArticleCardItems(itemsRef.current), currentItem);
      const normalizedAssignments = normalizeArticleGalleryAssignments(
        articleItems,
        manifest.images,
        getGalleryAssignmentBaseline(articleItems, manifest.images, manifest.assignments),
      );
      const currentArticleKey = getArticleCardAssignmentKey(currentItem);
      const currentImageKey = normalizedAssignments[currentArticleKey];
      const usedByOtherArticles = new Set(
        Object.entries(normalizedAssignments)
          .filter(([articleKey]) => articleKey !== currentArticleKey)
          .map(([, imageKey]) => imageKey),
      );
      const nextImage = shuffleGalleryImages(manifest.images).find((image) => {
        const imageKey = getGalleryImageKey(image);
        return imageKey !== currentImageKey && !usedByOtherArticles.has(imageKey);
      });

      if (!nextImage) {
        setStatus('没有可用于当前笔记的新配图。');
        return;
      }

      const nextAssignments = {
        ...normalizedAssignments,
        [currentArticleKey]: getGalleryImageKey(nextImage),
      };
      await writeUserGalleryManifest(manifest.images, nextAssignments);
      setStatus(`已为《${currentItem.frontmatter.title}》重新分配配图。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重新分配当前笔记配图失败。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="notes-app-shell">
        <style>{TABLER_ICON_OVERRIDES}</style>
        <header className="notes-topbar">
          <div className="notes-topbar-left">
            <div className="notes-brand">
              <button
                type="button"
                className="notes-brand-avatar"
                onClick={() => brandAvatarInputRef.current?.click()}
                aria-label="Upload avatar"
                title="Upload avatar"
              >
                {brandAvatar ? <img src={brandAvatar} alt="Blog avatar" /> : <span>CB</span>}
              </button>
              <input
                ref={brandAvatarInputRef}
                className="notes-brand-avatar-input"
                type="file"
                accept="image/*"
                onChange={handleBrandAvatarChange}
              />
              <strong>{siteConfigDraft.title || "Chty's Blog"}</strong>
            </div>
          </div>

        <div className="notes-topbar-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search notes"
          />
        </div>

        <div className="notes-topbar-create">
          <button
            type="button"
            className="notes-topbar-button"
            onClick={openCreateNoteDialog}
            disabled={isBusy || categories.length === 0}
            aria-label={'\u65b0\u5efa\u7b14\u8bb0'}
          >
            新建笔记
          </button>
        </div>

        <div className="notes-topbar-path">{draft ? `- ${draft.title}` : '- 未选择笔记'}</div>

        <div className="notes-topbar-right">
          <button
            type="button"
            className={isSettingsOpen ? 'notes-create-button active' : 'notes-create-button'}
            onClick={() => {
              setSettingsSection('basic');
              setIsSettingsOpen(true);
            }}
          >
            {'\u8bbe\u7f6e'}
          </button>
        </div>
        <div className="notes-topbar-primary-actions">
          <button
            type="button"
            className="notes-topbar-button"
            onClick={openCreateNoteDialog}
            disabled={isBusy || categories.length === 0}
          >
            {'\u65b0\u5efa\u7b14\u8bb0'}
          </button>
          <button
            type="button"
            className={isSettingsOpen ? 'notes-topbar-button active' : 'notes-topbar-button'}
            onClick={() => {
              setSettingsSection('basic');
              setIsSettingsOpen(true);
            }}
          >
            {'\u8bbe\u7f6e'}
          </button>
          <button
            type="button"
            className="notes-topbar-button"
            onClick={() => void openLocalBlogPreview()}
            disabled={isOpeningBlogPreview}
          >
            {isOpeningBlogPreview ? '\u542f\u52a8\u4e2d' : '\u9884\u89c8'}
          </button>
        </div>
      </header>

      <main className="notes-shell">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-header">
            <div className="notes-sidebar-title">
              <span className="notes-sidebar-title-icon" aria-hidden="true">
                <IconBook2 />
              </span>
              <strong>{'\u7b14\u8bb0\u672c'}</strong>
            </div>
          </div>

          <nav className="notes-sidebar-nav" aria-label="Note categories">
            {categoryCounts.length > 0 ? (
              categoryCounts.map((category) => (
                <button
                  key={category.slug}
                  type="button"
                  className={selectedCategorySlug === category.slug ? 'notes-sidebar-item active' : 'notes-sidebar-item'}
                  onClick={() => setSelectedCategorySlug(category.slug)}
                >
                  <span className="notes-sidebar-item-label">{category.label}</span>
                  <strong className="notes-sidebar-item-count">{category.count}</strong>
                </button>
              ))
            ) : (
              <div className="notes-sidebar-empty">
                <p>{'\u8bf7\u5728\u8bbe\u7f6e\u7684\u7c7b\u76ee\u7ba1\u7406\u4e2d\u65b0\u5efa\u7c7b\u76ee\u3002'}</p>
              </div>
            )}
          </nav>

        </aside>

        <section className="notes-list-pane">
          <div className="notes-list-header">
            {/*
            <div className="notes-list-heading">
              <strong>{selectedCategory?.label ?? '未选择类目'}</strong>
              <span>
                {selectedCategory
                  ? `${visibleItems.length} 篇笔记`
                  : `${visibleItems.length} 篇笔记`}
              </span>
            </div>
            */}
            <div className="notes-list-heading">
              <strong>{selectedCategory?.label ?? '\u672a\u9009\u62e9\u7c7b\u76ee'}</strong>
            </div>
          </div>

          <div className="notes-list-scroll">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const selected = draft?.sourceRelativePath === item.relativePath;

                return (
                  <div
                    key={item.relativePath}
                    className={[
                      'notes-list-item',
                      selected ? 'active' : '',
                      draggingNotePath === item.relativePath ? 'dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-note-path={item.relativePath}
                    onPointerEnter={() => handleNotePointerEnter(item.relativePath)}
                  >
                    <span
                      className="notes-list-item-handle"
                      role="button"
                      tabIndex={isBusy ? -1 : 0}
                      aria-disabled={isBusy}
                      onPointerDown={(event) => beginNotePointerDrag(event, item.relativePath)}
                      onKeyDown={(event) => {
                        if (isBusy) {
                          return;
                        }

                        const currentIndex = visibleItems.findIndex(
                          (visibleItem) => visibleItem.relativePath === item.relativePath,
                        );

                        if (event.key === 'ArrowUp' && currentIndex > 0) {
                          event.preventDefault();
                          void reorderNoteToTarget(item.relativePath, visibleItems[currentIndex - 1].relativePath);
                        }

                        if (event.key === 'ArrowDown' && currentIndex < visibleItems.length - 1) {
                          event.preventDefault();
                          void reorderNoteToTarget(item.relativePath, visibleItems[currentIndex + 1].relativePath);
                        }
                      }}
                      title={'\u62d6\u52a8\u6392\u5e8f'}
                      aria-label={`\u62d6\u52a8\u6392\u5e8f ${item.frontmatter.title}`}
                    >
                      <IconGripVertical aria-hidden="true" />
                    </span>

                    <button
                      type="button"
                      className="notes-list-item-button"
                      onClick={() => openItem(item)}
                    >
                      <span className="notes-list-item-title">{item.frontmatter.title}</span>
                      <span className="notes-list-item-subtitle">
                        {getNoteTypeLabel(item.frontmatter.type)} | {item.frontmatter.date}
                      </span>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="notes-empty-list">
                <p>
                  {selectedCategory
                    ? '\u5f53\u524d\u7c7b\u76ee\u6216\u641c\u7d22\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u7684\u7b14\u8bb0\u3002'
                    : '\u8bf7\u5148\u9009\u62e9\u6216\u65b0\u5efa\u4e00\u4e2a\u7c7b\u76ee\u3002'}
                </p>
                {/*
                <p>
                  {selectedCategory
                    ? '当前类目或搜索条件下没有匹配的笔记。'
                    : '请先选择或新建一个类目。'}
                </p>
                */}
              </div>
            )}
          </div>
        </section>

        <section className="notes-editor-pane" onKeyDownCapture={handleEditorKeyDownCapture}>
          {draft ? (
            <>
              <div className="notes-editor-header">
                <div className="notes-editor-tagline">
                  <div className="notes-tag-cluster">
                    {tagList.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`notes-tag-chip tone-${getTagTone(tag)}`}
                        title={tag}
                      >
                        {tag}
                      </button>
                    ))}

                    <button
                      type="button"
                      className={isTagPickerOpen ? 'notes-tag-trigger active' : 'notes-tag-trigger'}
                      onClick={() => setIsTagPickerOpen((current) => !current)}
                      aria-expanded={isTagPickerOpen}
                    >
                      编辑标签
                    </button>
                  </div>

                  {isTagPickerOpen ? (
                    <div ref={tagPickerRef} className="notes-tag-picker">
                      <div className="notes-tag-picker-head">
                        <strong>编辑标签</strong>
                      </div>

                      <div className="notes-tag-picker-input-row">
                        <input
                          ref={tagInputRef}
                          value={tagInputValue}
                          onChange={(event) => setTagInputValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitTagInput();
                            }
                          }}
                          placeholder="搜索已有标签，或输入新标签"
                        />
                        <button
                          type="button"
                          className="notes-tag-picker-add"
                          onClick={commitTagInput}
                          disabled={!normalizedTagInput}
                        >
                          添加
                        </button>
                      </div>

                      <div className="notes-tag-picker-list" role="listbox" aria-label="可选标签">
                        {filteredAvailableTags.length > 0 ? (
                          filteredAvailableTags.map((tag) => {
                            const selected = hasTag(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                className={selected ? 'notes-tag-picker-option selected' : 'notes-tag-picker-option'}
                                onClick={() => toggleTag(tag)}
                              >
                                <span className={`notes-tag-picker-swatch tone-${getTagTone(tag)}`} aria-hidden="true" />
                                <span className="notes-tag-picker-option-label">{tag}</span>
                                <span className="notes-tag-picker-option-state" aria-hidden="true">
                                  {selected ? <IconCheck /> : null}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <p className="notes-tag-picker-empty">
                            按 Enter 创建 <strong>{normalizedTagInput || '新标签'}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="notes-editor-actions">
                  <button
                    type="button"
                    className={isPreviewOnly ? 'notes-icon-button active' : 'notes-icon-button'}
                    onClick={() => {
                      if (draft.type !== 'inknote' && activeWorkspacePanel !== 'write') {
                        setWorkspacePanel('write');
                      }

                      if (draft.type !== 'inknote') {
                        if (showPreview) {
                          updatePreviewOnlyScrollRatio();
                        } else {
                          updateEditorScrollRatio();
                        }
                      }

                      setShowPreview((current) => !current);
                    }}
                    title="Preview"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={isMetadataDialogOpen ? 'notes-icon-button active' : 'notes-icon-button'}
                    onClick={openMetadataDialog}
                    disabled={isBusy}
                    title="Edit metadata"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={draft.published ? 'notes-icon-button active' : 'notes-icon-button'}
                    onClick={() => void publishDraft()}
                    disabled={isBusy}
                    title={draft.published ? 'Switch to draft' : 'Publish'}
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button"
                    onClick={() => void exportDraft()}
                    disabled={isBusy}
                    title="Export"
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button notes-icon-button-danger"
                    onClick={openDeleteDialog}
                    disabled={isBusy}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {draft ? (
                <>
                  <div className="notes-editor-titlebar">
                    <input
                      className="notes-title-input"
                      value={draft.title}
                      onChange={(event) =>
                        updateAutoSavedDraftMetadata({ title: event.target.value }, DRAFT_TITLE_AUTOSAVE_DELAY)
                      }
                      onBlur={() => void flushDraftMetadataSave()}
                      placeholder="Enter title"
                    />
                  </div>

                  <div className="notes-editor-meta">
                    <span>Created: {draft.date}</span>
                    <span>Updated: {draft.updatedAt || draft.date}</span>
                  </div>
                </>
              ) : null}

              {!isPreviewOnly && showHistoryPanel ? (
                <div className="notes-history-panel">
                  {historyEntries.length > 0 ? (
                    historyEntries.map((entry) => (
                      <div key={entry.id} className="notes-history-item">
                        <strong>{entry.label}</strong>
                        <span>{entry.detail || 'Current note'}</span>
                        <time>{entry.timestamp}</time>
                      </div>
                    ))
                  ) : (
                    <p className="notes-history-empty">No history yet for this note.</p>
                  )}
                </div>
              ) : null}

              {activeWorkspacePanel === 'write' ? (
                <>
                  <div className="notes-editor-toolbar">
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyInlineWrap('**', '**', 'bold')}
                      title="Bold"
                      aria-label="Bold"
                    >
                      <IconBold aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyInlineWrap('*', '*', 'italic')}
                      title="Italic"
                      aria-label="Italic"
                    >
                      <IconItalic aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => insertMarkdownSnippet('[link text](https://example.com)', 1, 21)}
                      title="Link"
                      aria-label="Insert link"
                    >
                      <IconLink aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line) => `> ${line.replace(/^>\s*/, '')}`)}
                      title="Blockquote"
                      aria-label="Blockquote"
                    >
                      <IconBlockquote aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyInlineWrap('<center>', '</center>', '居中文本')}
                      title="居中"
                      aria-label="居中"
                    >
                      <IconAlignCenter aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() =>
                        applyBodyTransform((value, selectionStart, selectionEnd) => {
                          const selectedText = value.slice(selectionStart, selectionEnd);
                          if (selectedText.includes('\n')) {
                            return insertSnippet(
                              value,
                              selectionStart,
                              selectionEnd,
                              `\`\`\`\n${selectedText || 'code'}\n\`\`\``,
                              4,
                              4,
                            );
                          }

                          return wrapSelection(value, selectionStart, selectionEnd, '`', '`', 'code');
                        })
                      }
                      title="Code"
                      aria-label="Code"
                    >
                      <IconCode aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() =>
                        insertMarkdownSnippet('<img src="https://example.com/image.png" alt="图片">', 10, 11)
                      }
                      title="Image"
                      aria-label="Image"
                    >
                      <IconPhoto aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => void insertSlidesDocument()}
                      title="Slides"
                      aria-label="插入演示文稿"
                    >
                      <IconPresentation aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}`)}
                      title="Ordered list"
                      aria-label="Ordered list"
                    >
                      <IconListNumbers aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line) => `- ${line.replace(/^[-*+]\s+/, '')}`)}
                      title="Bullet list"
                      aria-label="Bullet list"
                    >
                      <IconList aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix(increaseMarkdownHeadingLevel)}
                      title="标题层级 +1"
                      aria-label="标题层级 +1"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-heading">H</span>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => insertMarkdownSnippet('\n\n---\n\n', 2, 2)}
                      title="Insert divider"
                      aria-label="Insert divider"
                    >
                      <IconDots aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={undoDraftChange}
                      disabled={!canUndo}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <IconArrowBackUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={redoDraftChange}
                      disabled={!canRedo}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <IconArrowForwardUp aria-hidden="true" />
                    </button>
                  </div>

                  <div
                    className={
                      isPreviewOnly
                        ? 'notes-editor-workbench notes-editor-workbench-preview-only'
                        : 'notes-editor-workbench split'
                    }
                  >
                    {!isPreviewOnly ? (
                      <div className="notes-source-pane">
                      <textarea
                        ref={editorRef}
                        className="notes-markdown-editor"
                        value={draft.body}
                        onBeforeInput={captureEditorSelection}
                        onPaste={handleEditorPaste}
                        onCut={captureEditorSelection}
                        onKeyDown={captureEditorSelection}
                        onKeyUp={captureEditorSelection}
                        onClick={captureEditorSelection}
                        onFocus={captureEditorSelection}
                        onSelect={captureEditorSelection}
                        onChange={(event) => {
                          updateDraft(
                            { body: event.currentTarget.value },
                            { undoSelection: editorSelectionRef.current },
                          );
                          captureEditorSelection();
                        }}
                        onScroll={handleEditorScroll}
                        placeholder="Write Markdown content here..."
                        spellCheck={false}
                      />
                      </div>
                    ) : null}

                    <div
                      ref={previewPaneRef}
                      className={isPreviewOnly ? 'notes-rendered-pane preview-only' : 'notes-rendered-pane'}
                      onScroll={isPreviewOnly ? handlePreviewOnlyScroll : undefined}
                      onWheel={isPreviewOnly ? undefined : handlePreviewWheel}
                    >
                      {isPreviewRenderPending ? (
                        <span className="notes-rendered-pending">{'\u9884\u89c8\u66f4\u65b0\u4e2d'}</span>
                      ) : null}
                      <article ref={previewArticleRef} className="notes-rendered-article">
                        {renderedPreview}
                      </article>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="notes-editor-toolbar notes-inknote-toolbar">
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinkedNotebookLinePrefix(increaseMarkdownHeadingLevel)}
                      disabled={!linkedNotebook}
                      title="标题层级 +1"
                      aria-label="标题层级 +1"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-heading">H</span>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinkedNotebookInlineWrap('<center>', '</center>', '居中文本')}
                      disabled={!linkedNotebook}
                      title="居中"
                      aria-label="居中"
                    >
                      <IconAlignCenter aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinkedNotebookLinePrefix((line) => `- ${line.replace(/^[-*+]\s+/, '')}`)}
                      disabled={!linkedNotebook}
                      title="列表"
                      aria-label="列表"
                    >
                      <IconList aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() =>
                        applyLinkedNotebookLinePrefix((line, index) =>
                          `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}`,
                        )
                      }
                      disabled={!linkedNotebook}
                      title="编号列表"
                      aria-label="编号列表"
                    >
                      <IconListNumbers aria-hidden="true" />
                    </button>

                    <span className="notes-inknote-toolbar-divider" aria-hidden="true" />

                    <label className="notes-inknote-toolbar-control">
                      <span>纸张</span>
                      <select
                        value={linkedNotebook?.paperStyle ?? 'school'}
                        onChange={(event) =>
                          patchLinkedNotebook({ paperStyle: event.currentTarget.value as ProjectData['paperStyle'] })
                        }
                        disabled={!linkedNotebook}
                      >
                        {PAPER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="notes-inknote-toolbar-control">
                      <span>笔迹</span>
                      <select
                        value={linkedNotebook?.handwritingStyle ?? 'classical'}
                        onChange={(event) =>
                          patchLinkedNotebook({
                            handwritingStyle: event.currentTarget.value as ProjectData['handwritingStyle'],
                          })
                        }
                        disabled={!linkedNotebook}
                      >
                        {HANDWRITING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="notes-inknote-toolbar-control compact">
                      <span>缩进</span>
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={linkedNotebook?.paragraphIndent ?? 2}
                        onChange={(event) =>
                          patchLinkedNotebook({
                            paragraphIndent: clampNumber(Number(event.currentTarget.value), 0, 6),
                          })
                        }
                        disabled={!linkedNotebook}
                      />
                    </label>

                    <label className="notes-inknote-toolbar-control compact">
                      <span>行数</span>
                      <input
                        type="number"
                        min="10"
                        max="30"
                        value={linkedNotebook?.linesPerPage ?? 20}
                        onChange={(event) =>
                          patchLinkedNotebook({
                            linesPerPage: clampNumber(Math.round(Number(event.currentTarget.value)), 10, 30),
                          })
                        }
                        disabled={!linkedNotebook}
                      />
                    </label>

                    <label className="notes-inknote-toolbar-control compact">
                      <span>字号</span>
                      <input
                        type="number"
                        min="24"
                        max="56"
                        value={linkedNotebook?.fontSize ?? 40}
                        onChange={(event) =>
                          patchLinkedNotebook({
                            fontSize: clampNumber(Number(event.currentTarget.value), 24, 56),
                          })
                        }
                        disabled={!linkedNotebook}
                      />
                    </label>

                    <label className="notes-inknote-toolbar-control compact">
                      <span>字距</span>
                      <input
                        type="number"
                        min="0"
                        max="16"
                        value={linkedNotebook?.charSpacing ?? 6}
                        onChange={(event) =>
                          patchLinkedNotebook({
                            charSpacing: clampNumber(Number(event.currentTarget.value), 0, 16),
                          })
                        }
                        disabled={!linkedNotebook}
                      />
                    </label>

                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => patchLinkedNotebook({ seed: randomSeed() })}
                      disabled={!linkedNotebook}
                      title="重排笔迹"
                      aria-label="重排笔迹"
                    >
                      <IconRefresh aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={undoLinkedNotebookChange}
                      disabled={!canUndo}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <IconArrowBackUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={redoLinkedNotebookChange}
                      disabled={!canRedo}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <IconArrowForwardUp aria-hidden="true" />
                    </button>
                  </div>

                  <div
                    className={
                      isPreviewOnly
                        ? 'notes-editor-workbench notes-editor-workbench-preview-only notes-inknote-preview-only'
                        : 'notes-editor-workbench split notes-inknote-editor-workbench'
                    }
                  >
                    {!isPreviewOnly ? (
                      <div className="notes-source-pane">
                      <textarea
                        ref={editorRef}
                        className="notes-markdown-editor"
                        value={linkedNotebook?.content ?? ''}
                        onBeforeInput={captureEditorSelection}
                        onPaste={handleEditorPaste}
                        onCut={captureEditorSelection}
                        onKeyDown={captureEditorSelection}
                        onKeyUp={captureEditorSelection}
                        onClick={captureEditorSelection}
                        onFocus={captureEditorSelection}
                        onSelect={captureEditorSelection}
                        onChange={(event) => {
                          updateLinkedNotebookContent(event.currentTarget.value, {
                            undoSelection: editorSelectionRef.current,
                          });
                          captureEditorSelection();
                        }}
                        placeholder={
                          isLinkedNotebookLoading
                            ? '正在加载手写笔记工程...'
                            : '在这里编辑手写笔记内容，右侧会渲染为手写纸张...'
                        }
                        spellCheck={false}
                        disabled={!linkedNotebook}
                      />
                      </div>
                    ) : null}

                    <div
                      className={
                        isPreviewOnly
                          ? 'notes-rendered-pane notes-inknote-rendered-pane preview-only'
                          : 'notes-rendered-pane notes-inknote-rendered-pane'
                      }
                    >
                      <InkNoteProjectPreviewPanel
                        project={linkedNotebook}
                        projectPath={linkedNotebookPath}
                        status={linkedNotebookStatus}
                        embedded
                        spreadMode={isPreviewOnly ? 'double' : 'single'}
                      />
                    </div>
                  </div>
                </>
              )}

            </>
          ) : (
            <div className="notes-empty-state">
              <h2>{'\u8fd8\u6ca1\u6709\u9009\u62e9\u7b14\u8bb0'}</h2>
              <p>{'\u4ece\u5de6\u4fa7\u5217\u8868\u6253\u5f00\u7b14\u8bb0\uff0c\u6216\u70b9\u51fb\u9876\u90e8\u201c\u65b0\u5efa\u7b14\u8bb0\u201d\u3002'}</p>
              {/*
              <h2>还没有选择笔记</h2>
              <p>从左侧列表打开笔记，或点击顶部“新建笔记”。</p>
              */}
            </div>
          )}
        </section>
      </main>

      {toastMessages.length > 0 ? (
        <div className="notes-toast-stack" aria-live="polite" aria-atomic="false">
          {toastMessages.map((toast) => (
            <article className={`notes-toast ${toast.tone}`} key={toast.id} role="status">
              <span className="notes-toast-dot" aria-hidden="true" />
              <p>{toast.message}</p>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="关闭提示">
                <IconX aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {isMetadataDialogOpen && draft ? (
        <div className="notes-dialog-overlay" onClick={() => setIsMetadataDialogOpen(false)}>
          <section
            className="notes-metadata-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-metadata-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-metadata-dialog-header">
              <div>
                <h2 id="notes-metadata-dialog-title">{'\u7f16\u8f91\u6587\u7ae0\u5143\u6570\u636e'}</h2>
                <span>{draft.title}</span>
              </div>
              <button
                type="button"
                className="notes-metadata-dialog-close"
                onClick={() => setIsMetadataDialogOpen(false)}
                aria-label={'\u5173\u95ed\u5143\u6570\u636e\u7f16\u8f91'}
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-metadata-dialog-body">
              <label className="notes-metadata-dialog-field">
                <span>{'\u6240\u5c5e\u7c7b\u76ee'}</span>
                <select
                  value={metadataCategoryValue}
                  onChange={(event) => setMetadataCategoryValue(event.target.value)}
                  disabled={metadataCategoryOptions.length === 0}
                >
                  {metadataCategoryOptions.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="notes-metadata-dialog-field">
                <span>{'\u521b\u5efa\u65f6\u95f4'}</span>
                <input
                  ref={metadataDateInputRef}
                  type="date"
                  value={metadataDateValue}
                  onChange={(event) => setMetadataDateValue(event.target.value)}
                  onClick={openMetadataDatePicker}
                  onFocus={openMetadataDatePicker}
                  onKeyDown={(event) => event.preventDefault()}
                  onPaste={(event) => event.preventDefault()}
                  aria-label={'\u521b\u5efa\u65f6\u95f4'}
                />
              </label>

              <div className="notes-metadata-dialog-field notes-metadata-cover-field">
                <span>{'\u914d\u56fe'}</span>
                <div className="notes-metadata-cover-row">
                  <button
                    type="button"
                    className={`notes-metadata-cover-preview${currentMetadataCardImage ? '' : ' empty'}`}
                    onClick={openMetadataCardImagePreview}
                    disabled={!currentMetadataCardImage}
                    aria-label="预览并调整配图裁剪"
                    title="预览并调整配图裁剪"
                  >
                    {currentMetadataCardImage && currentMetadataCardImageSource ? (
                      <img
                        src={currentMetadataCardImageSource}
                        alt={currentMetadataCardImage?.name ?? '文章配图'}
                        style={{
                          objectPosition: formatGalleryImagePosition(
                            getGalleryImageFocus(currentMetadataCardImage),
                          ),
                        }}
                      />
                    ) : (
                      <IconPhoto aria-hidden="true" />
                    )}
                  </button>
                  <div className="notes-metadata-cover-copy">
                    <strong title={currentMetadataCardImage?.name ?? ''}>
                      {currentMetadataCardImage?.name ?? '暂无配图'}
                    </strong>
                    <small>
                      {currentMetadataCardImage
                        ? '点击缩略图可预览并调整裁剪'
                        : '点击右侧按钮为当前笔记分配配图'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="notes-metadata-cover-action"
                    onClick={() => void reassignCurrentDraftCardImage()}
                    disabled={isBusy || galleryImages.length === 0 || !draft.sourceRelativePath}
                    aria-label="重新分配当前笔记配图"
                    title="重新分配当前笔记配图"
                  >
                    <IconRefresh aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <footer className="notes-metadata-dialog-actions">
              <button
                type="button"
                className="notes-metadata-dialog-cancel"
                onClick={() => setIsMetadataDialogOpen(false)}
              >
                {'\u53d6\u6d88'}
              </button>
              <button
                type="button"
                className="notes-metadata-dialog-submit"
                onClick={() => void saveMetadata()}
                disabled={isBusy || !metadataCategoryValue || !metadataDateValue.trim()}
              >
                {isBusy ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isDeleteDialogOpen && draft ? (
        <div
          className="notes-dialog-overlay"
          onClick={() => {
            if (!isBusy) {
              setIsDeleteDialogOpen(false);
            }
          }}
        >
          <section
            className="notes-unsaved-dialog notes-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-delete-dialog-title">
                {draft.sourceRelativePath ? '\u786e\u8ba4\u5220\u9664\u6587\u7ae0' : '\u786e\u8ba4\u4e22\u5f03\u8349\u7a3f'}
              </h2>
              <p>
                {draft.sourceRelativePath
                  ? '\u5220\u9664\u540e\u4f1a\u4ece content/ \u4e2d\u79fb\u9664\u8be5\u6587\u7ae0\u6587\u4ef6\uff0c\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002'
                  : '\u8be5\u8349\u7a3f\u5c1a\u672a\u4fdd\u5b58\uff0c\u4e22\u5f03\u540e\u65e0\u6cd5\u6062\u590d\u3002'}
              </p>
            </div>

            <div className="notes-unsaved-dialog-body">
              <span className="notes-unsaved-dialog-target">
                {draft.sourceRelativePath ? '\u5c06\u8981\u5220\u9664\uff1a' : '\u5c06\u8981\u4e22\u5f03\uff1a'}
                <strong>{draft.title}</strong>
              </span>

              {draft.sourceRelativePath ? (
                <p className="notes-delete-path">{`content/${draft.sourceRelativePath}`}</p>
              ) : null}

              {draft.type === 'inknote' && linkedNotebookTarget ? (
                <p className="notes-delete-path">{`\u5173\u8054\u5de5\u7a0b\uff1acontent/${linkedNotebookTarget}`}</p>
              ) : null}
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isBusy}
              >
                {'\u53d6\u6d88'}
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-danger"
                onClick={() => void deleteDraft()}
                disabled={isBusy}
              >
                {isBusy
                  ? '\u5220\u9664\u4e2d...'
                  : draft.sourceRelativePath
                    ? '\u5220\u9664'
                    : '\u4e22\u5f03'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isClearLocalContentDialogOpen ? (
        <div
          className="notes-dialog-overlay notes-clear-local-overlay"
          onClick={() => {
            if (!isClearingLocalContent) {
              setIsClearLocalContentDialogOpen(false);
            }
          }}
        >
          <section
            className="notes-unsaved-dialog notes-delete-dialog notes-clear-local-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-clear-local-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-clear-local-dialog-title">确认清空本地内容</h2>
              <p>此操作不可撤销，但不会删除远端仓库中的任何内容。</p>
            </div>

            <div className="notes-unsaved-dialog-body">
              <span className="notes-unsaved-dialog-target">
                将清空本地文章、InkNote 工程、图片、PDF、图库和同步基线。
              </span>
              <p className="notes-clear-local-note">
                远程仓库绑定会被保留。清空后再次同步，将从远端重新克隆全部内容。
              </p>
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={() => setIsClearLocalContentDialogOpen(false)}
                disabled={isClearingLocalContent}
              >
                取消
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-danger"
                onClick={() => void clearLocalContent()}
                disabled={isClearingLocalContent}
              >
                {isClearingLocalContent ? '正在清空...' : '确认清空'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contentSyncPreviewDialog ? (
        <div className="notes-dialog-overlay notes-content-sync-preview-overlay">
          <section
            className="notes-unsaved-dialog notes-content-sync-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-content-sync-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-content-sync-preview-title">确认同步变更</h2>
              <p>以下是确认后将应用的文章变化。资源文件会随文章一同同步，但不在此列表中重复展示。</p>
            </div>

            <div className="notes-content-sync-preview-grid">
              <ContentSyncChangeColumn
                title="本地内容"
                description="同步结果写入本地后"
                changes={contentSyncPreviewDialog.localChanges}
              />
              <ContentSyncChangeColumn
                title="远端内容"
                description="同步结果推送远端后"
                changes={contentSyncPreviewDialog.remoteChanges}
              />
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={() => void submitContentSyncPreviewDecision(false)}
                disabled={contentSyncPreviewDialog.isSubmitting}
              >
                取消同步
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-primary"
                onClick={() => void submitContentSyncPreviewDecision(true)}
                disabled={contentSyncPreviewDialog.isSubmitting}
              >
                {contentSyncPreviewDialog.isSubmitting ? '处理中...' : '确定并继续'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contentSyncConflictDialog ? (
        <div className="notes-dialog-overlay notes-content-conflict-overlay" onClick={() => setContentSyncConflictDialog(null)}>
          <section
            className="notes-unsaved-dialog notes-content-conflict-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-content-conflict-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-content-conflict-title">发现内容冲突</h2>
              <p>
                同一文件在本地和远端都发生了不可自动合并的变化。当前没有写入或推送任何内容，请逐项选择保留哪一侧。
              </p>
            </div>

            <div className="notes-content-conflict-toolbar">
              <span>
                {contentSyncConflictDialog.conflicts.filter(
                  (conflict) =>
                    contentSyncConflictDialog.resolutions[conflict.path] === 'remote' ||
                    contentSyncConflictDialog.resolutions[conflict.path] === 'local',
                ).length}
                {' / '}
                {contentSyncConflictDialog.conflicts.length}
                {' 已选择'}
              </span>
              <small>逐项对比本地和远端内容，选择需要保留的一侧。</small>
            </div>

            <div className="notes-content-conflict-list">
              {contentSyncConflictDialog.conflicts.map((conflict) => {
                const resolution = contentSyncConflictDialog.resolutions[conflict.path];
                const localPreview = conflict.localContent || conflict.local || '';
                const remotePreview = conflict.remoteContent || conflict.remote || '';
                const diff = buildConflictDiff(localPreview, remotePreview);
                return (
                <article className="notes-content-conflict-item" key={`${conflict.path}-${conflict.kind}`}>
                  <header className="notes-content-conflict-item-head">
                    <div>
                      <strong>{conflict.path}</strong>
                      <span>{conflict.kind}</span>
                    </div>
                    {resolution ? <em>{resolution === 'local' ? '已选择本地' : '已选择远端'}</em> : <em>未选择</em>}
                  </header>
                  <div className="notes-content-conflict-preview-grid">
                    <section className={`notes-content-conflict-preview ${resolution === 'local' ? 'active' : ''}`}>
                      <header>
                        <strong>本地</strong>
                        <button
                          type="button"
                          onClick={() => setContentSyncConflictResolution(conflict.path, 'local')}
                        >
                          保留本地
                        </button>
                      </header>
                      <pre className="notes-content-conflict-diff">
                        {diff.local.length ? (
                          diff.local.map((line, lineIndex) => (
                            <span
                              className={`notes-content-conflict-diff-line ${line.kind}`}
                              key={`local-${lineIndex}-${line.lineNumber ?? 'gap'}`}
                            >
                              <span className="notes-content-conflict-line-number">{line.lineNumber ?? ''}</span>
                              <span className="notes-content-conflict-line-marker">
                                {getConflictDiffMarker(line.kind, 'local')}
                              </span>
                              <span className="notes-content-conflict-line-text">{renderConflictDiffLineText(line)}</span>
                            </span>
                          ))
                        ) : (
                          <span className="notes-content-conflict-empty">本地内容为空。</span>
                        )}
                      </pre>
                    </section>
                    <section className={`notes-content-conflict-preview ${resolution === 'remote' ? 'active' : ''}`}>
                      <header>
                        <strong>远端</strong>
                        <button
                          type="button"
                          onClick={() => setContentSyncConflictResolution(conflict.path, 'remote')}
                        >
                          保留远端
                        </button>
                      </header>
                      <pre className="notes-content-conflict-diff">
                        {diff.remote.length ? (
                          diff.remote.map((line, lineIndex) => (
                            <span
                              className={`notes-content-conflict-diff-line ${line.kind}`}
                              key={`remote-${lineIndex}-${line.lineNumber ?? 'gap'}`}
                            >
                              <span className="notes-content-conflict-line-number">{line.lineNumber ?? ''}</span>
                              <span className="notes-content-conflict-line-marker">
                                {getConflictDiffMarker(line.kind, 'remote')}
                              </span>
                              <span className="notes-content-conflict-line-text">{renderConflictDiffLineText(line)}</span>
                            </span>
                          ))
                        ) : (
                          <span className="notes-content-conflict-empty">远端内容为空。</span>
                        )}
                      </pre>
                    </section>
                  </div>
                </article>
                );
              })}
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={() => setContentSyncConflictDialog(null)}
                disabled={isPullingContent || isPublishingSite}
              >
                取消
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-primary"
                onClick={() => continueContentSyncWithResolutions()}
                disabled={
                  isPullingContent ||
                  isPublishingSite ||
                  !areContentSyncConflictsResolved(
                    contentSyncConflictDialog.conflicts,
                    contentSyncConflictDialog.resolutions,
                  )
                }
              >
                按选择继续
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="notes-dialog-overlay" onClick={() => setIsSettingsOpen(false)}>
          <section
            className="notes-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-settings-header">
              <div>
                <h2 id="notes-settings-title">{'\u8bbe\u7f6e'}</h2>
                <span className="notes-settings-save-state">
                  {isSiteConfigSaving ? '\u81ea\u52a8\u4fdd\u5b58\u4e2d' : '\u5df2\u542f\u7528\u81ea\u52a8\u4fdd\u5b58'}
                </span>
              </div>
              <button
                type="button"
                className="notes-settings-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label={'\u5173\u95ed\u8bbe\u7f6e'}
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-settings-layout">
              <nav className="notes-settings-tabs" aria-label={'\u8bbe\u7f6e\u5206\u7ec4'}>
                <button
                  type="button"
                  className={settingsSection === 'basic' ? 'active' : ''}
                  onClick={() => setSettingsSection('basic')}
                >
                  <strong>{'\u57fa\u672c\u8bbe\u7f6e'}</strong>
                </button>
                <button
                  type="button"
                  className={settingsSection === 'images' ? 'active' : ''}
                  onClick={() => setSettingsSection('images')}
                >
                  <strong>{'\u56fe\u7247\u7ba1\u7406'}</strong>
                </button>
                <button
                  type="button"
                  className={settingsSection === 'publish' ? 'active' : ''}
                  onClick={() => {
                    setSettingsSection('publish');
                  }}
                >
                  <strong>{'\u53d1\u5e03\u8bbe\u7f6e'}</strong>
                </button>
                <button
                  type="button"
                  className={settingsSection === 'about' ? 'active' : ''}
                  onClick={() => setSettingsSection('about')}
                >
                  <strong>{'\u7248\u672c\u66f4\u65b0'}</strong>
                </button>
              </nav>

              <div className="notes-settings-content">
                {settingsSection === 'basic' ? (
                  <section className="notes-settings-section notes-settings-basic-categories">
                    <div className="notes-settings-inline-heading notes-settings-inline-heading-action">
                      <span>{'\u7c7b\u76ee'}</span>
                      <button
                        type="button"
                        className="notes-settings-heading-button"
                        onClick={openCreateCategoryDialog}
                        disabled={isBusy}
                      >
                        <IconPlus aria-hidden="true" />
                        {'\u65b0\u589e'}
                      </button>
                    </div>
                    <div className="notes-settings-category-list">
                      {categoryCounts.length > 0 ? (
                        categoryCounts.map((category, index) => (
                          <div
                            key={category.slug}
                            className={[
                              'notes-settings-category-row',
                              draggingCategorySlug === category.slug ? 'dragging' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            data-category-slug={category.slug}
                            onPointerEnter={() => handleCategoryPointerEnter(category.slug)}
                          >
                            <span
                              className="notes-settings-icon-button tone-handle"
                              role="button"
                              tabIndex={isBusy ? -1 : 0}
                              aria-disabled={isBusy}
                              onPointerDown={(event) => beginCategoryPointerDrag(event, category.slug)}
                              onKeyDown={(event) => {
                                if (isBusy) {
                                  return;
                                }

                                if (event.key === 'ArrowUp' && index > 0) {
                                  event.preventDefault();
                                  void reorderCategoryToTarget(category.slug, categoryCounts[index - 1].slug);
                                }

                                if (event.key === 'ArrowDown' && index < categoryCounts.length - 1) {
                                  event.preventDefault();
                                  void reorderCategoryToTarget(category.slug, categoryCounts[index + 1].slug);
                                }
                              }}
                              title={'\u62d6\u52a8\u6392\u5e8f'}
                              aria-label={`\u62d6\u52a8\u6392\u5e8f ${category.label}`}
                            >
                              <IconGripVertical aria-hidden="true" />
                            </span>
                            <div className="notes-settings-category-main">
                              <strong>{category.label}</strong>
                              <span>{category.labelEn?.trim() || '\u672a\u8bbe\u7f6e\u82f1\u6587'}</span>
                            </div>
                            <span className="notes-settings-category-count">
                              {category.count} {'\u7bc7'}
                            </span>
                            <div className="notes-settings-row-actions">
                              <button
                                type="button"
                                className="notes-settings-icon-button tone-edit"
                                onClick={() => openEditCategoryDialog(category)}
                                disabled={isBusy}
                                title={'\u7f16\u8f91\u7c7b\u76ee'}
                                aria-label={`\u7f16\u8f91 ${category.label}`}
                              >
                                <IconPencil aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="notes-settings-icon-button danger"
                                onClick={() => openDeleteCategoryDialog(category)}
                                disabled={isBusy}
                                title={'\u5220\u9664\u7c7b\u76ee'}
                                aria-label={`\u5220\u9664 ${category.label}`}
                              >
                                <IconTrash aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'basic' ? (
                  <section className="notes-settings-section notes-settings-profile">
                    <div className="notes-settings-blog-grid">
                      <div className="notes-settings-avatar-card notes-settings-basic-only">
                        <button
                          type="button"
                          className="notes-settings-avatar"
                          onClick={() => brandAvatarInputRef.current?.click()}
                        >
                          {brandAvatar ? <img src={brandAvatar} alt="" /> : <span>CB</span>}
                        </button>
                        <div>
                          <strong>{'\u5934\u50cf'}</strong>
                          <p>用于桌面端标识与博客页头展示</p>
                        </div>
                        <button
                          type="button"
                          className="notes-settings-avatar-change"
                          onClick={() => brandAvatarInputRef.current?.click()}
                        >
                          更换头像
                        </button>
                      </div>

                      <label className="notes-settings-field notes-settings-basic-only">
                        <span>{'\u535a\u5ba2\u6807\u9898'}</span>
                        <input
                          value={siteConfigDraft.title}
                          onChange={(event) => updateSiteConfigDraft({ title: event.target.value })}
                        />
                      </label>

                      <label className="notes-settings-field notes-settings-basic-only">
                        <span>{'\u4e2a\u6027\u7b7e\u540d'}</span>
                        <input
                          value={siteConfigDraft.tagline}
                          onChange={(event) => updateSiteConfigDraft({ tagline: event.target.value })}
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'basic' ? (
                  <section className="notes-settings-section notes-settings-basic-links">
                    <div className="notes-settings-friend-section">
                      <div className="notes-settings-friend-head">
                        <span>{'\u53cb\u60c5\u94fe\u63a5'}</span>
                        <button type="button" onClick={addFriendLinkDraft}>
                          <IconPlus aria-hidden="true" />
                          {'\u65b0\u589e'}
                        </button>
                      </div>

                      <div className="notes-settings-friend-list">
                        {(siteConfigDraft.friendLinks ?? []).length > 0 ? (
                          (siteConfigDraft.friendLinks ?? []).map((link, index, links) => (
                            <div
                              className={[
                                'notes-settings-friend-row',
                                draggingSiteLink?.kind === 'friend' && draggingSiteLink.index === index ? 'dragging' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              key={index}
                              data-site-link-kind="friend"
                              data-site-link-index={index}
                              onPointerEnter={() => handleSiteLinkPointerEnter('friend', index)}
                            >
                              <span
                                className="notes-settings-icon-button tone-handle notes-settings-friend-handle"
                                role="button"
                                tabIndex={friendIconLoadingIndex !== null || isBusy ? -1 : 0}
                                aria-disabled={friendIconLoadingIndex !== null || isBusy}
                                onPointerDown={(event) => {
                                  if (friendIconLoadingIndex === null) {
                                    beginSiteLinkPointerDrag(event, 'friend', index);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (friendIconLoadingIndex !== null || isBusy) {
                                    return;
                                  }

                                  if (event.key === 'ArrowUp' && index > 0) {
                                    event.preventDefault();
                                    moveFriendLinkDraft(index, -1);
                                  }

                                  if (event.key === 'ArrowDown' && index < links.length - 1) {
                                    event.preventDefault();
                                    moveFriendLinkDraft(index, 1);
                                  }
                                }}
                                title={'\u62d6\u52a8\u6392\u5e8f'}
                                aria-label={`\u62d6\u52a8\u6392\u5e8f ${link.label || `\u7b2c ${index + 1} \u4e2a\u53cb\u94fe`}`}
                              >
                                <IconGripVertical aria-hidden="true" />
                              </span>
                              <FriendLinkAvatar
                                label={link.label}
                                icon={link.icon}
                                fetchedAt={link.iconFetchedAt}
                                previewOrigin={localBlogPreviewOrigin}
                              />

                              <div className="notes-settings-friend-fields">
                                <input
                                  value={link.label}
                                  disabled={friendIconLoadingIndex === index}
                                  onChange={(event) => updateFriendLinkDraft(index, { label: event.target.value })}
                                  placeholder={'\u7ad9\u70b9\u540d\u79f0'}
                                  aria-label={`\u7b2c ${index + 1} \u4e2a\u53cb\u94fe\u7684\u7ad9\u70b9\u540d\u79f0`}
                                />
                                <input
                                  type="url"
                                  value={link.href}
                                  disabled={friendIconLoadingIndex === index}
                                  onChange={(event) =>
                                    updateFriendLinkDraft(index, {
                                      href: event.target.value,
                                      icon: '',
                                      iconSource: '',
                                      iconTarget: '',
                                      iconFetchedAt: '',
                                    })
                                  }
                                  onBlur={() => refreshFriendLinkIconIfNeeded(index)}
                                  placeholder="https://example.com"
                                  aria-label={`\u7b2c ${index + 1} \u4e2a\u53cb\u94fe\u7684\u7f51\u5740`}
                                />
                              </div>

                              <div className="notes-settings-friend-actions">
                                <button
                                  type="button"
                                  className={friendIconLoadingIndex === index ? 'loading' : ''}
                                  onClick={() => void refreshFriendLinkIcon(index)}
                                  disabled={friendIconLoadingIndex !== null || !link.href.trim() || link.href.trim() === '#'}
                                  title={'\u5237\u65b0\u7ad9\u70b9\u56fe\u6807'}
                                  aria-label={`\u5237\u65b0 ${link.label || `\u7b2c ${index + 1} \u4e2a\u53cb\u94fe`} \u7684\u7ad9\u70b9\u56fe\u6807`}
                                >
                                  {friendIconLoadingIndex === index ? (
                                    <IconLoader2 aria-hidden="true" />
                                  ) : (
                                    <IconRefresh aria-hidden="true" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => removeFriendLinkDraft(index)}
                                  disabled={friendIconLoadingIndex !== null}
                                  title={'\u5220\u9664'}
                                  aria-label={`\u5220\u9664 ${link.label || `\u7b2c ${index + 1} \u4e2a\u53cb\u94fe`}`}
                                >
                                  <IconTrash aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <button type="button" className="notes-settings-friend-empty" onClick={addFriendLinkDraft}>
                            <IconPlus aria-hidden="true" />
                            <span>{'\u6dfb\u52a0\u7b2c\u4e00\u4e2a\u53cb\u60c5\u94fe\u63a5'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'basic' ? (
                  <section className="notes-settings-section notes-settings-basic-tools">
                    <div className="notes-settings-friend-section">
                      <div className="notes-settings-friend-head">
                        <span>{'\u5e38\u7528\u5de5\u5177'}</span>
                        <button type="button" onClick={addToolLinkDraft}>
                          <IconPlus aria-hidden="true" />
                          {'\u65b0\u589e'}
                        </button>
                      </div>

                      <div className="notes-settings-friend-list">
                        {(siteConfigDraft.toolLinks ?? []).length > 0 ? (
                          (siteConfigDraft.toolLinks ?? []).map((link, index, links) => (
                            <div
                              className={[
                                'notes-settings-friend-row',
                                draggingSiteLink?.kind === 'tool' && draggingSiteLink.index === index ? 'dragging' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              key={index}
                              data-site-link-kind="tool"
                              data-site-link-index={index}
                              onPointerEnter={() => handleSiteLinkPointerEnter('tool', index)}
                            >
                              <span
                                className="notes-settings-icon-button tone-handle notes-settings-friend-handle"
                                role="button"
                                tabIndex={toolIconLoadingIndex !== null || isBusy ? -1 : 0}
                                aria-disabled={toolIconLoadingIndex !== null || isBusy}
                                onPointerDown={(event) => {
                                  if (toolIconLoadingIndex === null) {
                                    beginSiteLinkPointerDrag(event, 'tool', index);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (toolIconLoadingIndex !== null || isBusy) {
                                    return;
                                  }

                                  if (event.key === 'ArrowUp' && index > 0) {
                                    event.preventDefault();
                                    moveToolLinkDraft(index, -1);
                                  }

                                  if (event.key === 'ArrowDown' && index < links.length - 1) {
                                    event.preventDefault();
                                    moveToolLinkDraft(index, 1);
                                  }
                                }}
                                title={'\u62d6\u52a8\u6392\u5e8f'}
                                aria-label={`\u62d6\u52a8\u6392\u5e8f ${link.label || `\u7b2c ${index + 1} \u4e2a\u5de5\u5177`}`}
                              >
                                <IconGripVertical aria-hidden="true" />
                              </span>
                              <FriendLinkAvatar
                                label={link.label}
                                icon={link.icon}
                                fetchedAt={link.iconFetchedAt}
                                previewOrigin={localBlogPreviewOrigin}
                              />

                              <div className="notes-settings-friend-fields">
                                <input
                                  value={link.label}
                                  disabled={toolIconLoadingIndex === index}
                                  onChange={(event) => updateToolLinkDraft(index, { label: event.target.value })}
                                  placeholder={'\u5de5\u5177\u540d\u79f0'}
                                  aria-label={`\u7b2c ${index + 1} \u4e2a\u5de5\u5177\u7684\u540d\u79f0`}
                                />
                                <input
                                  type="url"
                                  value={link.href}
                                  disabled={toolIconLoadingIndex === index}
                                  onChange={(event) =>
                                    updateToolLinkDraft(index, {
                                      href: event.target.value,
                                      icon: '',
                                      iconSource: '',
                                      iconTarget: '',
                                      iconFetchedAt: '',
                                    })
                                  }
                                  onBlur={() => refreshToolLinkIconIfNeeded(index)}
                                  placeholder="https://example.com"
                                  aria-label={`\u7b2c ${index + 1} \u4e2a\u5de5\u5177\u7684\u7f51\u5740`}
                                />
                              </div>

                              <div className="notes-settings-friend-actions">
                                <button
                                  type="button"
                                  className={toolIconLoadingIndex === index ? 'loading' : ''}
                                  onClick={() => void refreshToolLinkIcon(index)}
                                  disabled={toolIconLoadingIndex !== null || !link.href.trim() || link.href.trim() === '#'}
                                  title={'\u5237\u65b0\u7ad9\u70b9\u56fe\u6807'}
                                  aria-label={`\u5237\u65b0 ${link.label || `\u7b2c ${index + 1} \u4e2a\u5de5\u5177`} \u7684\u7ad9\u70b9\u56fe\u6807`}
                                >
                                  {toolIconLoadingIndex === index ? (
                                    <IconLoader2 aria-hidden="true" />
                                  ) : (
                                    <IconRefresh aria-hidden="true" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => removeToolLinkDraft(index)}
                                  disabled={toolIconLoadingIndex !== null}
                                  title={'\u5220\u9664'}
                                  aria-label={`\u5220\u9664 ${link.label || `\u7b2c ${index + 1} \u4e2a\u5de5\u5177`}`}
                                >
                                  <IconTrash aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <button type="button" className="notes-settings-friend-empty" onClick={addToolLinkDraft}>
                            <IconPlus aria-hidden="true" />
                            <span>{'\u6dfb\u52a0\u7b2c\u4e00\u4e2a\u5e38\u7528\u5de5\u5177'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'images' ? (
                  <section className="notes-settings-section notes-settings-images-section">
                    <div className="notes-settings-image-toolbar">
                      <div className="notes-settings-image-tabs" role="tablist" aria-label="图片管理">
                        <button
                          type="button"
                          className={imageSettingsTab === 'references' ? 'active' : ''}
                          onClick={() => setImageSettingsTab('references')}
                        >
                          引用
                          <span>{referencedManagedImages.length}</span>
                        </button>
                        <button
                          type="button"
                          className={imageSettingsTab === 'gallery' ? 'active' : ''}
                          onClick={() => setImageSettingsTab('gallery')}
                        >
                          图库
                          <span>{galleryImages.length}</span>
                        </button>
                      </div>

                      <div className="notes-settings-image-summary-row">
                        <div className="notes-settings-image-actions">
                          {imageSettingsTab === 'references' ? (
                            <button
                              type="button"
                              className="notes-settings-primary notes-settings-image-localize"
                              onClick={() => void localizeExternalImages()}
                              disabled={isLocalizingImages || isBusy || dirty || externalManagedImages.length === 0}
                            >
                              {isLocalizingImages ? (
                                <IconLoader2 className="spinning" aria-hidden="true" />
                              ) : (
                                <IconDownload aria-hidden="true" />
                              )}
                              <span>下载</span>
                            </button>
                          ) : null}

                          {imageSettingsTab === 'gallery' ? (
                            <>
                              <button
                                type="button"
                                className={`notes-settings-secondary notes-settings-image-localize${
                                  isGalleryMultiSelectMode ? ' active' : ''
                                }`}
                                onClick={isGalleryMultiSelectMode ? exitGalleryMultiSelectMode : enterGalleryMultiSelectMode}
                                disabled={isGalleryLoading || galleryImages.length === 0 || isDeletingGalleryImages}
                              >
                                <IconCheck aria-hidden="true" />
                                <span>多选</span>
                              </button>
                              <button
                                type="button"
                                className="notes-settings-secondary notes-settings-image-localize"
                                onClick={() => void reassignGalleryCardImages()}
                                disabled={isGalleryLoading || isBusy || galleryImages.length === 0}
                              >
                                <IconRefresh aria-hidden="true" />
                                <span>分配</span>
                              </button>
                              <button
                                type="button"
                                className="notes-settings-primary notes-settings-image-localize"
                                onClick={() => void uploadGalleryImages()}
                                disabled={isUploadingGalleryImages || isGalleryLoading || isBusy}
                              >
                                {isUploadingGalleryImages ? (
                                  <IconLoader2 className="spinning" aria-hidden="true" />
                                ) : (
                                  <IconUpload aria-hidden="true" />
                                )}
                                <span>上传</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {imageSettingsTab === 'gallery' && isGalleryMultiSelectMode ? (
                        <div className="notes-settings-gallery-select-bar">
                          <button
                            type="button"
                            className="notes-settings-gallery-check-all"
                            onClick={toggleCurrentGalleryPageSelection}
                            disabled={galleryImagePageData.items.length === 0 || isDeletingGalleryImages}
                          >
                            <span className={`notes-settings-gallery-mini-check${isGalleryPageFullySelected ? ' checked' : ''}`}>
                              {isGalleryPageFullySelected ? <IconCheck aria-hidden="true" /> : null}
                            </span>
                            <span>{isGalleryPageFullySelected ? '取消本页' : '全选'}</span>
                          </button>
                          <span className="notes-settings-gallery-select-hint">点击图片以选择</span>
                          <span className="notes-settings-gallery-select-count">
                            {selectedGalleryImageKeys.length > 0 ? `已选 ${selectedGalleryImageKeys.length}` : ''}
                          </span>
                          <button
                            type="button"
                            className="notes-settings-danger notes-settings-image-localize"
                            onClick={() => void requestDeleteSelectedGalleryImages()}
                            disabled={selectedGalleryImageKeys.length === 0 || isDeletingGalleryImages || isBusy}
                          >
                            {isDeletingGalleryImages ? (
                              <IconLoader2 className="spinning" aria-hidden="true" />
                            ) : (
                              <IconTrash aria-hidden="true" />
                            )}
                            <span>删除</span>
                          </button>
                          <button
                            type="button"
                            className="notes-settings-secondary notes-settings-image-localize"
                            onClick={exitGalleryMultiSelectMode}
                            disabled={isDeletingGalleryImages}
                          >
                            <IconX aria-hidden="true" />
                            <span>取消</span>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="notes-settings-image-groups">
                      {imageSettingsTab === 'references' ? (
                        <section className="notes-settings-image-group">
                          {referencedManagedImages.length > 0 ? (
                            <>
                              <div className="notes-settings-image-grid">
                                {managedImagePageData.items.map((asset) => (
                                  <ManagedImageCard
                                    key={asset.source}
                                    asset={asset}
                                    contentRoot={libraryRoot}
                                    previewOrigin={localBlogPreviewOrigin}
                                    localizationStatus={
                                      asset.kind === 'external' ? imageLocalizationStatus[asset.source] : undefined
                                    }
                                    onPreview={setImagePreview}
                                  />
                                ))}
                              </div>
                              <ImagePagination
                                page={managedImagePageData.safePage}
                                pageCount={managedImagePageData.pageCount}
                                onPageChange={setManagedImagePage}
                              />
                            </>
                          ) : (
                            <div className="notes-settings-image-group-empty">没有图片引用</div>
                          )}
                        </section>
                      ) : null}

                      {imageSettingsTab === 'gallery' ? (
                        <section className="notes-settings-image-group">
                          {isUploadingGalleryImages && galleryUploadTotal > 0 ? (
                            <div className="notes-settings-gallery-upload-progress" role="status" aria-live="polite">
                              <div>
                                <span>正在上传图库</span>
                                <strong>
                                  {galleryUploadProgress} / {galleryUploadTotal}
                                </strong>
                              </div>
                              <div
                                className="notes-settings-gallery-upload-track"
                                aria-label={`图库上传进度 ${Math.round((galleryUploadProgress / galleryUploadTotal) * 100)}%`}
                              >
                                <span
                                  style={{
                                    width: `${Math.round((galleryUploadProgress / galleryUploadTotal) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : null}

                          {isGalleryLoading ? (
                            <div className="notes-settings-image-group-empty">正在读取图库...</div>
                          ) : galleryImages.length > 0 ? (
                            <>
                              <div className="notes-settings-image-grid">
                                {galleryImagePageData.items.map((image) => (
                                  <GalleryImageCard
                                    key={getGalleryImageKey(image)}
                                    image={image}
                                    contentRoot={libraryRoot}
                                    previewOrigin={localBlogPreviewOrigin}
                                    selectable={isGalleryMultiSelectMode}
                                    selected={selectedGalleryImageSet.has(getGalleryImageKey(image))}
                                    used={usedGalleryImageKeys.has(getGalleryImageKey(image))}
                                    onToggle={() => toggleGalleryImageSelection(image)}
                                    onPreview={setImagePreview}
                                  />
                                ))}
                              </div>
                              <ImagePagination
                                page={galleryImagePageData.safePage}
                                pageCount={galleryImagePageData.pageCount}
                                onPageChange={setGalleryPage}
                              />
                            </>
                          ) : (
                            <div className="notes-settings-image-group-empty">还没有上传图库图片</div>
                          )}
                        </section>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'images' && false ? (
                  <section className="notes-settings-section notes-settings-images-section">
                    {managedImages.length > 0 ? (
                      <div className="notes-settings-image-groups">
                        <section className="notes-settings-image-group">
                          <div className="notes-settings-image-group-head">
                            <strong>外部图片</strong>
                            <span>{externalManagedImages.length}</span>
                            <button
                              type="button"
                              className="notes-settings-primary notes-settings-image-localize"
                              onClick={() => void localizeExternalImages()}
                              disabled={isLocalizingImages || isBusy || dirty || externalManagedImages.length === 0}
                            >
                              {isLocalizingImages ? (
                                <IconLoader2 className="spinning" aria-hidden="true" />
                              ) : (
                                <IconDownload aria-hidden="true" />
                              )}
                              <span>下载</span>
                            </button>
                          </div>
                          {externalManagedImages.length > 0 ? (
                            <div className="notes-settings-image-grid">
                              {externalManagedImages.map((asset) => (
                                <ManagedImageCard
                                  key={asset.source}
                                  asset={asset}
                                  contentRoot={libraryRoot}
                                  previewOrigin={localBlogPreviewOrigin}
                                  localizationStatus={imageLocalizationStatus[asset.source]}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="notes-settings-image-group-empty">没有外部图片</div>
                          )}
                        </section>

                        <section className="notes-settings-image-group">
                          <div className="notes-settings-image-group-head">
                            <strong>内部图片</strong>
                            <span>{internalManagedImages.length}</span>
                          </div>
                          {internalManagedImages.length > 0 ? (
                            <div className="notes-settings-image-grid">
                              {internalManagedImages.map((asset) => (
                                <ManagedImageCard
                                  key={asset.source}
                                  asset={asset}
                                  contentRoot={libraryRoot}
                                  previewOrigin={localBlogPreviewOrigin}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="notes-settings-image-group-empty">没有内部图片</div>
                          )}
                        </section>
                      </div>
                    ) : (
                      <div className="notes-settings-empty">当前笔记中还没有图片引用。</div>
                    )}
                  </section>
                ) : null}

                {settingsSection === 'basic' ? (
                  <section className="notes-settings-section notes-settings-services notes-settings-basic-site">
                    <div className="notes-settings-inline-heading">
                      <span>{'\u7ad9\u70b9\u8bbe\u7f6e'}</span>
                    </div>
                    <div className="notes-settings-service-grid">
                      <section className="notes-settings-integration-card">
                        <header className="notes-settings-integration-head">
                          <div>
                            <strong>文章卡片配图</strong>
                            <span>从图库中为文章列表稳定随机展示一张图片</span>
                          </div>
                          <button
                            type="button"
                            className={`notes-settings-switch ${siteConfigDraft.cardImages?.enabled ? 'on' : ''}`}
                            role="switch"
                            aria-checked={Boolean(siteConfigDraft.cardImages?.enabled)}
                            aria-label="开启文章卡片配图"
                            onClick={() =>
                              updateCardImageConfigDraft({ enabled: !siteConfigDraft.cardImages?.enabled })
                            }
                          >
                            <span />
                          </button>
                        </header>
                      </section>

                      <section className="notes-settings-integration-card">
                        <header className="notes-settings-integration-head">
                          <div>
                            <strong>阅读统计</strong>
                            <span>使用 GoatCounter 统计文章详情页访问量</span>
                          </div>
                          <div className="notes-settings-integration-actions">
                            <button
                              type="button"
                              className="notes-settings-icon-button notes-settings-integration-config"
                              onClick={() => setSiteIntegrationPanel('goatcounter')}
                              title="配置阅读统计"
                              aria-label="配置阅读统计"
                            >
                              <IconSettings aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`notes-settings-switch ${siteConfigDraft.goatcounter?.enabled ? 'on' : ''}`}
                              role="switch"
                              aria-checked={Boolean(siteConfigDraft.goatcounter?.enabled)}
                              aria-label="开启阅读统计"
                              onClick={() =>
                                updateGoatCounterConfigDraft({ enabled: !siteConfigDraft.goatcounter?.enabled })
                              }
                            >
                              <span />
                            </button>
                          </div>
                        </header>
                      </section>

                      <section className="notes-settings-integration-card">
                        <header className="notes-settings-integration-head">
                          <div>
                            <strong>评论系统</strong>
                            <span>使用 Giscus 将 GitHub Discussions 接入文章页</span>
                          </div>
                          <div className="notes-settings-integration-actions">
                            <button
                              type="button"
                              className="notes-settings-icon-button notes-settings-integration-config"
                              onClick={() => setSiteIntegrationPanel('giscus')}
                              title="配置评论系统"
                              aria-label="配置评论系统"
                            >
                              <IconSettings aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`notes-settings-switch ${siteConfigDraft.giscus?.enabled ? 'on' : ''}`}
                              role="switch"
                              aria-checked={Boolean(siteConfigDraft.giscus?.enabled)}
                              aria-label="开启评论系统"
                              onClick={() => updateGiscusConfigDraft({ enabled: !siteConfigDraft.giscus?.enabled })}
                            >
                              <span />
                            </button>
                          </div>
                        </header>
                      </section>
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'publish' ? (
                  <section className="notes-settings-section notes-settings-sync-section">
                    <article className="notes-settings-sync-card">
                      <header className="notes-settings-sync-header">
                        <div>
                          <strong>同步站点</strong>
                          <span>
                            {siteConfigDraft.repository?.remote.trim() || '尚未配置远程仓库'}
                            {siteConfigDraft.repository?.remote.trim()
                              ? ` · 内容 ${getRepositoryContentBranch(siteConfigDraft.repository)} · 工作流发布`
                              : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="notes-settings-icon-button notes-settings-integration-config"
                          onClick={() => setSiteIntegrationPanel('repository')}
                          title="配置仓库"
                          aria-label="配置仓库"
                        >
                          <IconSettings aria-hidden="true" />
                        </button>
                      </header>

                      <div className="notes-settings-sync-body">
                        {publishLogs.length > 0 ? (
                          <section
                            className={`notes-sync-flow ${publishRunState}`}
                            aria-live="polite"
                            aria-label="站点同步进度"
                          >
                            <header className="notes-sync-flow-head">
                              <strong>{publishFlowTitle}</strong>
                              <span>{publishProgress}%</span>
                            </header>
                            <div
                              className="notes-sync-flow-track"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={publishProgress}
                            >
                              <span style={{ width: `${publishProgress}%` }} />
                            </div>
                            <div className="notes-sync-flow-list" ref={publishLogViewRef}>
                              {publishLogs.map((entry) => (
                                <article className={`notes-sync-flow-step ${entry.level}`} key={entry.id}>
                                  <span className="notes-sync-flow-dot" aria-hidden="true" />
                                  <div>
                                    <strong>{entry.message}</strong>
                                    {entry.detail ? <small>{entry.detail}</small> : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ) : (
                          <section
                            className="notes-sync-flow idle notes-sync-flow-placeholder"
                            aria-label="站点同步准备状态"
                          >
                            <header className="notes-sync-flow-head">
                              <strong>准备同步</strong>
                              <span>0%</span>
                            </header>
                            <div
                              className="notes-sync-flow-track"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={0}
                            >
                              <span style={{ width: '0%' }} />
                            </div>
                            <div className="notes-sync-flow-empty">
                              <span className="notes-sync-flow-empty-icon" aria-hidden="true">
                                <IconRefresh />
                              </span>
                              <strong>等待同步</strong>
                              <span>点击下方同步按钮后，进度会在这里显示。</span>
                            </div>
                          </section>
                        )}
                      </div>

                      <footer className="notes-settings-sync-actions">
                        <button
                          type="button"
                          className="notes-settings-danger"
                          onClick={() => setIsClearLocalContentDialogOpen(true)}
                          disabled={isClearingLocalContent || isPublishingSite || isPullingContent || isBusy}
                        >
                          <IconTrash aria-hidden="true" />
                          清空本地
                        </button>
                        <div className="notes-settings-sync-main-actions">
                        <button
                          type="button"
                          className="notes-settings-secondary"
                          onClick={() => void refreshPublishStatus()}
                          disabled={
                            isTestingRemote ||
                            isPullingContent ||
                            isPublishingSite ||
                            !siteConfigDraft.repository?.remote.trim() ||
                            !getRepositoryContentBranch(siteConfigDraft.repository)
                          }
                        >
                          {isTestingRemote ? (
                            <IconLoader2 className="spinning" aria-hidden="true" />
                          ) : (
                            <IconRefresh aria-hidden="true" />
                          )}
                          测试连接
                        </button>
                        <button
                          type="button"
                          className="notes-settings-primary"
                          onClick={() => void syncSiteChanges()}
                          disabled={
                            isPublishingSite ||
                            isPullingContent ||
                            isBusy ||
                            !siteConfigDraft.repository?.remote.trim() ||
                            !getRepositoryContentBranch(siteConfigDraft.repository)
                          }
                        >
                          {isPublishingSite || isPullingContent ? (
                            <IconLoader2 className="spinning" aria-hidden="true" />
                          ) : (
                            <IconUpload aria-hidden="true" />
                          )}
                          {isPublishingSite || isPullingContent
                            ? '同步中...'
                            : publishRunState === 'idle'
                              ? '开始同步'
                              : '重新同步'}
                        </button>
                        </div>
                      </footer>
                    </article>
                  </section>
                ) : null}

                {settingsSection === 'about' ? (
                  <section className="notes-settings-section notes-settings-about">
                    <article className="notes-about-hero">
                      <span className="notes-about-logo" aria-hidden="true">
                        <img src={desktopIconUrl} alt="" />
                      </span>
                      <div>
                        <h3>逸仙笔记</h3>
                        <div className="notes-about-badges" aria-label={'\u5e94\u7528\u4fe1\u606f'}>
                          <span>{`v${desktopVersion}`}</span>
                        </div>
                      </div>
                    </article>

                    <section className="notes-about-update-card">
                      <header>
                        <div>
                          <IconRefresh aria-hidden="true" />
                          <strong>{'\u7248\u672c\u66f4\u65b0'}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => void checkDesktopUpdates()}
                          disabled={
                            desktopUpdateState === 'checking' ||
                            desktopUpdateState === 'downloading' ||
                            desktopUpdateState === 'installing'
                          }
                        >
                          {desktopUpdateState === 'checking' ||
                          desktopUpdateState === 'downloading' ||
                          desktopUpdateState === 'installing' ? (
                            <IconLoader2 className="spinning" aria-hidden="true" />
                          ) : (
                            <IconRefresh aria-hidden="true" />
                          )}
                          {'\u68c0\u67e5\u66f4\u65b0'}
                        </button>
                      </header>

                      {desktopUpdateState !== 'idle' ? (
                        <div className={`notes-about-update-result ${desktopUpdateState}`}>
                          <span aria-hidden="true">
                            {desktopUpdateState === 'latest' ? (
                              <IconCircleCheck />
                            ) : desktopUpdateState === 'available' ? (
                              <IconRocket />
                            ) : desktopUpdateState === 'checking' ||
                            desktopUpdateState === 'downloading' ||
                            desktopUpdateState === 'installing' ? (
                              <IconLoader2 className="spinning" />
                            ) : (
                              <IconInfoCircle />
                            )}
                          </span>
                          <div>
                            <strong>{desktopUpdateMessage}</strong>
                            {desktopUpdateDetail ? <small>{desktopUpdateDetail}</small> : null}
                          </div>
                          {desktopUpdateState === 'available' &&
                          latestDesktopRelease &&
                          isTauri() &&
                          pendingDesktopUpdateRef.current ? (
                            <button
                              type="button"
                              onClick={() => void installDesktopUpdate()}
                            >
                              {'\u7acb\u5373\u5347\u7ea7'}
                            </button>
                          ) : desktopUpdateState === 'available' &&
                          latestDesktopRelease?.installerUrl &&
                          isTauri() ? (
                            <button
                              type="button"
                              onClick={() => void installDesktopReleaseInstaller()}
                            >
                              {'\u4e0b\u8f7d\u5b89\u88c5'}
                            </button>
                          ) : desktopUpdateState === 'available' && latestDesktopRelease ? (
                            <button
                              type="button"
                              onClick={() => void openExternalUrl(latestDesktopRelease.url)}
                            >
                              {'\u6253\u5f00\u53d1\u5e03\u9875'}
                            </button>
                          ) : desktopUpdateState === 'downloading' || desktopUpdateState === 'installing' ? (
                            <button type="button" disabled>
                              {'\u5347\u7ea7\u4e2d'}
                            </button>
                          ) : null}
                          {desktopUpdateState === 'downloading' || desktopUpdateState === 'installing' ? (
                            <div
                              className="notes-about-update-track"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={desktopUpdateProgress}
                            >
                              <span style={{ width: `${desktopUpdateProgress}%` }} />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </section>

                    <section className="notes-about-links" aria-label={'\u7248\u672c\u94fe\u63a5'}>
                      <button type="button" onClick={() => void openExternalUrl(DESKTOP_REPOSITORY_URL)}>
                        <span aria-hidden="true">
                          <IconBrandGithub />
                        </span>
                        <div>
                          <strong>{'GitHub \u4ed3\u5e93'}</strong>
                          <small>{`github.com/${DESKTOP_RELEASE_REPOSITORY}`}</small>
                        </div>
                        <IconExternalLink aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => void openExternalUrl(DESKTOP_RELEASES_URL)}>
                        <span aria-hidden="true">
                          <IconHistory />
                        </span>
                        <div>
                          <strong>{'\u53d1\u5e03\u5386\u53f2'}</strong>
                          <small>{'\u67e5\u770b\u6240\u6709\u684c\u9762\u7f16\u8f91\u5668\u7248\u672c'}</small>
                        </div>
                        <IconExternalLink aria-hidden="true" />
                      </button>
                    </section>

                    <p className="notes-about-footer">Made with care · MIT License</p>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsOpen && siteIntegrationPanel ? (
        <div
          className="notes-dialog-overlay notes-site-integration-dialog-overlay"
          onClick={() => setSiteIntegrationPanel(null)}
        >
          <section
            className="notes-site-integration-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-site-integration-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-site-integration-dialog-header">
              <div>
                <h2 id="notes-site-integration-dialog-title">
                  {siteIntegrationPanel === 'repository'
                    ? '仓库设置'
                    : siteIntegrationPanel === 'goatcounter'
                      ? '阅读统计设置'
                      : '评论系统设置'}
                </h2>
                <span>
                  {siteIntegrationPanel === 'repository'
                    ? 'Repository'
                    : siteIntegrationPanel === 'goatcounter'
                      ? 'GoatCounter'
                      : 'Giscus'}
                </span>
              </div>
              <button
                type="button"
                className="notes-site-integration-dialog-close"
                onClick={() => setSiteIntegrationPanel(null)}
                aria-label="关闭配置"
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            {siteIntegrationPanel === 'repository' ? (
              <div className="notes-site-integration-dialog-body">
                <label className="notes-settings-field wide">
                  <span>仓库地址</span>
                  <input
                    type="text"
                    value={siteConfigDraft.repository?.remote ?? ''}
                    onChange={(event) => updateRepositoryConfigDraft({ remote: event.target.value })}
                    placeholder="https://github.com/user/repo.git"
                  />
                </label>
                <label className="notes-settings-field wide">
                  <span>内容分支</span>
                  <input
                    value={getRepositoryContentBranch(siteConfigDraft.repository)}
                    onChange={(event) => updateRepositoryConfigDraft({ contentBranch: event.target.value })}
                    placeholder={DEFAULT_CONTENT_BRANCH}
                  />
                </label>
                <div className="notes-site-integration-dialog-actions compact">
                  <span>{publishConnectionMessage}</span>
                </div>
              </div>
            ) : null}

            {siteIntegrationPanel === 'goatcounter' ? (
              <div className="notes-site-integration-dialog-body">
                <label className="notes-settings-field wide">
                  <span>GoatCounter Endpoint</span>
                  <input
                    value={siteConfigDraft.goatcounter?.endpoint ?? ''}
                    onChange={(event) => updateGoatCounterConfigDraft({ endpoint: event.target.value })}
                    placeholder="https://your-code.goatcounter.com/count"
                  />
                </label>
                <label className="notes-settings-field wide">
                  <span>统计脚本</span>
                  <input
                    value={siteConfigDraft.goatcounter?.scriptUrl ?? 'https://gc.zgo.at/count.js'}
                    onChange={(event) => updateGoatCounterConfigDraft({ scriptUrl: event.target.value })}
                    placeholder="https://gc.zgo.at/count.js"
                  />
                </label>
              </div>
            ) : null}

            {siteIntegrationPanel === 'giscus' ? (
              <div className="notes-site-integration-dialog-body two-column">
                <label className="notes-settings-field wide">
                  <span>Giscus 仓库</span>
                  <input
                    value={siteConfigDraft.giscus?.repo ?? ''}
                    onChange={(event) => updateGiscusConfigDraft({ repo: event.target.value })}
                    placeholder="owner/repo"
                  />
                </label>
                <label className="notes-settings-field">
                  <span>Repo ID</span>
                  <input
                    value={siteConfigDraft.giscus?.repoId ?? ''}
                    onChange={(event) => updateGiscusConfigDraft({ repoId: event.target.value })}
                  />
                </label>
                <label className="notes-settings-field">
                  <span>分类名称</span>
                  <input
                    value={siteConfigDraft.giscus?.category ?? 'Announcements'}
                    onChange={(event) => updateGiscusConfigDraft({ category: event.target.value })}
                    placeholder="Announcements"
                  />
                </label>
                <label className="notes-settings-field wide">
                  <span>Category ID</span>
                  <input
                    value={siteConfigDraft.giscus?.categoryId ?? ''}
                    onChange={(event) => updateGiscusConfigDraft({ categoryId: event.target.value })}
                  />
                </label>
                <label className="notes-settings-field">
                  <span>语言</span>
                  <input
                    value={siteConfigDraft.giscus?.lang ?? 'zh-CN'}
                    onChange={(event) => updateGiscusConfigDraft({ lang: event.target.value })}
                    placeholder="zh-CN"
                  />
                </label>
                <label className="notes-settings-field">
                  <span>主题</span>
                  <input
                    value={siteConfigDraft.giscus?.theme ?? 'preferred_color_scheme'}
                    onChange={(event) => updateGiscusConfigDraft({ theme: event.target.value })}
                    placeholder="preferred_color_scheme"
                  />
                </label>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {isPublishDialogOpen ? (
        <div className="notes-dialog-overlay notes-publish-dialog-overlay" onClick={() => setIsPublishDialogOpen(false)}>
          <section
            className="notes-publish-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-publish-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-publish-dialog-header">
              <div>
                <h2 id="notes-publish-dialog-title">发布站点</h2>
                <span>
                  {siteConfigDraft.repository?.remote.trim() || '尚未配置远程仓库'}
                  {siteConfigDraft.repository?.remote.trim()
                    ? ` · ${getRepositoryContentBranch(siteConfigDraft.repository)}`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPublishDialogOpen(false)}
                aria-label="关闭发布窗口"
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-publish-dialog-body">
              <label className="notes-publish-dialog-message">
                <span>发布说明</span>
                <input
                  value={publishMessage}
                  onChange={(event) => setPublishMessage(event.target.value)}
                  disabled={isPublishingSite}
                  placeholder="Update blog content"
                />
              </label>

              {publishLogs.length > 0 ? (
                <section
                  className={`notes-publish-progress ${publishRunState}`}
                  aria-live="polite"
                  aria-label="站点发布进度"
                >
                  <header className="notes-publish-progress-head">
                    <strong>
                      {publishRunState === 'success'
                        ? '发布完成'
                        : publishRunState === 'error'
                          ? '发布失败'
                          : '正在发布'}
                    </strong>
                    <span>{publishProgress}%</span>
                  </header>
                  <div
                    className="notes-publish-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={publishProgress}
                  >
                    <span style={{ width: `${publishProgress}%` }} />
                  </div>
                  <div className="notes-publish-log" ref={publishLogViewRef}>
                    {publishLogs.map((entry) => (
                      <article className={`notes-publish-log-entry ${entry.level}`} key={entry.id}>
                        <span className="notes-publish-log-dot" aria-hidden="true" />
                        <time>{entry.receivedAt}</time>
                        <div>
                          <strong>{entry.message}</strong>
                          {entry.detail ? <pre>{entry.detail}</pre> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="notes-publish-dialog-pending">
                  <IconLoader2 className="spinning" aria-hidden="true" />
                  <span>正在创建发布任务...</span>
                </div>
              )}
            </div>

            <footer className="notes-publish-dialog-actions">
              <button type="button" className="secondary" onClick={() => setIsPublishDialogOpen(false)}>
                {isPublishingSite ? '后台运行' : '关闭'}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void publishSiteChanges()}
                disabled={isPublishingSite || isBusy || !publishMessage.trim()}
              >
                {isPublishingSite ? '发布中...' : publishRunState === 'idle' ? '开始发布' : '重新发布'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isPullDialogOpen ? (
        <div className="notes-dialog-overlay notes-publish-dialog-overlay" onClick={() => setIsPullDialogOpen(false)}>
          <section
            className="notes-publish-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-pull-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-publish-dialog-header">
              <div>
                <h2 id="notes-pull-dialog-title">同步远端内容</h2>
                <span>
                  {siteConfigDraft.repository?.remote.trim() || '尚未配置远程仓库'}
                  {siteConfigDraft.repository?.remote.trim()
                    ? ` · ${getRepositoryContentBranch(siteConfigDraft.repository)}`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPullDialogOpen(false)}
                aria-label="关闭同步窗口"
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-publish-dialog-body">
              {pullLogs.length > 0 ? (
                <section
                  className={`notes-publish-progress ${pullRunState}`}
                  aria-live="polite"
                  aria-label="远端内容同步进度"
                >
                  <header className="notes-publish-progress-head">
                    <strong>
                      {pullRunState === 'success'
                        ? '同步完成'
                        : pullRunState === 'error'
                          ? '同步失败'
                          : '正在同步'}
                    </strong>
                    <span>{pullProgress}%</span>
                  </header>
                  <div
                    className="notes-publish-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pullProgress}
                  >
                    <span style={{ width: `${pullProgress}%` }} />
                  </div>
                  <div className="notes-publish-log" ref={pullLogViewRef}>
                    {pullLogs.map((entry) => (
                      <article className={`notes-publish-log-entry ${entry.level}`} key={entry.id}>
                        <span className="notes-publish-log-dot" aria-hidden="true" />
                        <time>{entry.receivedAt}</time>
                        <div>
                          <strong>{entry.message}</strong>
                          {entry.detail ? <pre>{entry.detail}</pre> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="notes-publish-dialog-pending">
                  <IconDownload aria-hidden="true" />
                  <span>点击开始后，将合并远端内容分支；本地独有内容会保留。</span>
                </div>
              )}
            </div>

            <footer className="notes-publish-dialog-actions">
              <button type="button" className="secondary" onClick={() => setIsPullDialogOpen(false)}>
                {isPullingContent ? '后台运行' : '关闭'}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void pullRemoteContentToLocal()}
                disabled={isPullingContent || isPublishingSite || isBusy}
              >
                {isPullingContent ? '同步中...' : pullRunState === 'idle' ? '开始同步' : '重新同步'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {galleryDeleteDialog ? (
        <div
          className="notes-dialog-overlay"
          onClick={() => {
            if (!isDeletingGalleryImages) {
              setGalleryDeleteDialog(null);
            }
          }}
        >
          <section
            className="notes-unsaved-dialog notes-delete-dialog notes-gallery-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-gallery-delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-gallery-delete-dialog-title">确认删除图库图片</h2>
              <p>删除后会从图库中移除图片；已使用这些图片的文章会自动补位，其他文章配图保持不变。</p>
            </div>

            <div className="notes-unsaved-dialog-body">
              <span className="notes-unsaved-dialog-target">
                将要删除
                <strong>{galleryDeleteDialog.images.length} 张图片</strong>
              </span>
              <div className="notes-gallery-delete-impact">
                <span>
                  影响文章
                  <strong>{galleryDeleteDialog.affectedCount}</strong>
                </span>
                <span>
                  可重新分配
                  <strong>{galleryDeleteDialog.reassignedCount}</strong>
                </span>
                <span>
                  暂无配图
                  <strong>{galleryDeleteDialog.unassignedCount}</strong>
                </span>
              </div>
              <div className="notes-gallery-delete-list">
                {galleryDeleteDialog.images.slice(0, 6).map((image) => (
                  <span key={getGalleryImageKey(image)} title={image.name}>
                    {image.name}
                  </span>
                ))}
                {galleryDeleteDialog.images.length > 6 ? (
                  <em>{`还有 ${galleryDeleteDialog.images.length - 6} 张...`}</em>
                ) : null}
              </div>
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={() => setGalleryDeleteDialog(null)}
                disabled={isDeletingGalleryImages}
              >
                取消
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-danger"
                onClick={() => void confirmDeleteSelectedGalleryImages()}
                disabled={isDeletingGalleryImages}
              >
                {isDeletingGalleryImages ? '删除中...' : '确认删除'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {imagePreview ? (
        <div className="notes-image-preview-overlay" onClick={() => setImagePreview(null)}>
          <div
            className="notes-image-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="notes-image-preview-close"
              onClick={() => setImagePreview(null)}
              aria-label="关闭图片预览"
            >
              <IconX aria-hidden="true" />
            </button>
            {imagePreview.galleryImageKey ? (
              <>
                <GalleryCropEditor
                  src={imagePreview.src}
                  title={imagePreview.title}
                  focus={imagePreviewFocus}
                  onChange={setImagePreviewFocus}
                />
                <div className="notes-image-crop-footer">
                  <span title={imagePreview.title}>{imagePreview.title}</span>
                  <div>
                    <button
                      type="button"
                      className="notes-settings-secondary"
                      onClick={() => setImagePreviewFocus(normalizeGalleryImageFocus(imagePreview.focus))}
                    >
                      重置
                    </button>
                    <button
                      type="button"
                      className="notes-settings-primary"
                      onClick={() => void saveGalleryImageFocus()}
                      disabled={isSameGalleryImageFocus(imagePreviewFocus, normalizeGalleryImageFocus(imagePreview.focus))}
                    >
                      保存裁剪
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <img src={imagePreview.src} alt={imagePreview.title} onClick={(event) => event.stopPropagation()} />
                <span>{imagePreview.title}</span>
              </>
            )}
          </div>
        </div>
      ) : null}

      {categoryDialog ? (
        <div className="notes-dialog-overlay notes-category-dialog-overlay" onClick={closeCategoryDialog}>
          <section
            className="notes-category-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-category-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-category-dialog-header">
              <div>
                <h2 id="notes-category-dialog-title">
                  {categoryDialog.mode === 'create' ? '\u65b0\u5efa\u7c7b\u76ee' : '\u7f16\u8f91\u7c7b\u76ee'}
                </h2>
                <span>
                  {categoryDialog.mode === 'create'
                    ? '填写中文名称和英文名称'
                    : '修改类目的中文名称和英文名称'}
                </span>
              </div>
              <button
                type="button"
                className="notes-category-dialog-close"
                onClick={closeCategoryDialog}
                disabled={isBusy}
                aria-label={'\u5173\u95ed\u7c7b\u76ee\u7f16\u8f91'}
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-category-dialog-body">
              <label className="notes-category-dialog-field">
                <span>{'\u7c7b\u76ee\u540d\u79f0'}</span>
                <input
                  autoFocus
                  value={categoryLabelValue}
                  onChange={(event) => setCategoryLabelValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && categoryLabelValue.trim() && categoryLabelEnValue.trim()) {
                      event.preventDefault();
                      void saveCategoryDialog();
                    }
                  }}
                  placeholder={'\u4f8b\u5982\uff1a\u6570\u5b66\u7814\u7a76'}
                />
              </label>

              <label className="notes-category-dialog-field">
                <span>{'\u82f1\u6587\u540d\u79f0'}</span>
                <input
                  value={categoryLabelEnValue}
                  onChange={(event) => setCategoryLabelEnValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && categoryLabelValue.trim() && categoryLabelEnValue.trim()) {
                      event.preventDefault();
                      void saveCategoryDialog();
                    }
                  }}
                  placeholder="Mathematics"
                />
              </label>
            </div>

            <footer className="notes-category-dialog-actions">
              <button type="button" className="notes-category-dialog-cancel" onClick={closeCategoryDialog} disabled={isBusy}>
                {'\u53d6\u6d88'}
              </button>
              <button
                type="button"
                className="notes-category-dialog-submit"
                onClick={() => void saveCategoryDialog()}
                disabled={isBusy || !categoryLabelValue.trim() || !categoryLabelEnValue.trim()}
              >
                {isBusy
                  ? '\u4fdd\u5b58\u4e2d...'
                  : categoryDialog.mode === 'create'
                    ? '\u65b0\u5efa'
                    : '\u4fdd\u5b58'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {categoryDeleteDialog && categoryToDelete ? (
        <div className="notes-dialog-overlay notes-category-dialog-overlay" onClick={closeCategoryDeleteDialog}>
          <section
            className="notes-category-dialog notes-category-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-category-delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="notes-category-dialog-header">
              <div>
                <h2 id="notes-category-delete-dialog-title">删除类目</h2>
                <span>删除前请为类目中的文章选择新的归属类目</span>
              </div>
              <button
                type="button"
                className="notes-category-dialog-close"
                onClick={closeCategoryDeleteDialog}
                disabled={isBusy}
                aria-label="关闭删除类目弹窗"
              >
                <IconX aria-hidden="true" />
              </button>
            </header>

            <div className="notes-category-dialog-body">
              <div className="notes-category-delete-summary">
                <span>将删除</span>
                <strong>{categoryToDelete.label}</strong>
                <em>{categoryDeleteAffectedItems.length} 篇文章</em>
              </div>

              {categoryDeleteAffectedItems.length > 0 ? (
                <>
                  <label className="notes-category-dialog-field">
                    <span>迁移到</span>
                    <select
                      value={categoryDeleteDialog.targetSlug}
                      onChange={(event) =>
                        setCategoryDeleteDialog((current) =>
                          current ? { ...current, targetSlug: event.target.value } : current,
                        )
                      }
                      disabled={isBusy}
                    >
                      {categoryDeleteTargetOptions.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {category.label}
                          {category.labelEn?.trim() ? ` / ${category.labelEn.trim()}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="notes-category-delete-preview">
                    {categoryDeleteAffectedItems.slice(0, 5).map((item) => (
                      <span key={item.relativePath}>{item.frontmatter.title}</span>
                    ))}
                    {categoryDeleteAffectedItems.length > 5 ? (
                      <small>还有 {categoryDeleteAffectedItems.length - 5} 篇文章会一并迁移</small>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="notes-category-delete-empty">该类目下没有文章，确认后只会删除类目配置。</p>
              )}
            </div>

            <footer className="notes-category-dialog-actions">
              <button
                type="button"
                className="notes-category-dialog-cancel"
                onClick={closeCategoryDeleteDialog}
                disabled={isBusy}
              >
                取消
              </button>
              <button
                type="button"
                className="notes-category-dialog-submit danger"
                onClick={() => void confirmDeleteCategory()}
                disabled={isBusy || (categoryDeleteAffectedItems.length > 0 && !categoryDeleteDialog.targetSlug)}
              >
                {isBusy ? '删除中...' : '确认删除'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {pendingSwitchItem ? (
        <div className="notes-dialog-overlay" onClick={returnToCurrentDraft}>
          <div
            className="notes-unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-unsaved-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-unsaved-dialog-header">
              <h2 id="notes-unsaved-dialog-title">{'\u6709\u672a\u4fdd\u5b58\u7684\u4fee\u6539'}</h2>
              <p>{unsavedChangesMessage}</p>
            </div>

            <div className="notes-unsaved-dialog-body">
              <span className="notes-unsaved-dialog-target">
                {'\u5373\u5c06\u5207\u6362\u5230\uff1a'}
                <strong>{pendingSwitchItem.frontmatter.title}</strong>
              </span>
              <p>
                {
                  '\u4f60\u53ef\u4ee5\u5148\u4fdd\u5b58\u5f53\u524d\u7b14\u8bb0\uff0c\u4e5f\u53ef\u4ee5\u4e22\u5f03\u672a\u4fdd\u5b58\u7684\u4fee\u6539\uff0c\u6216\u8fd4\u56de\u7ee7\u7eed\u7f16\u8f91\u3002'
                }
              </p>
            </div>

            <div className="notes-unsaved-dialog-actions">
              <button
                type="button"
                className="notes-unsaved-dialog-primary"
                onClick={() => void saveAndSwitchItem()}
                disabled={isPendingSwitchSaving || isBusy}
              >
                {isPendingSwitchSaving ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'}
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-danger"
                onClick={discardAndSwitchItem}
                disabled={isPendingSwitchSaving}
              >
                {'\u4e22\u5f03'}
              </button>
              <button
                type="button"
                className="notes-unsaved-dialog-cancel"
                onClick={returnToCurrentDraft}
                disabled={isPendingSwitchSaving}
              >
                {'\u8fd4\u56de'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateDialogOpen ? (
        <div className="notes-dialog-overlay" onClick={() => setIsCreateDialogOpen(false)}>
          <div
            className="notes-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-create-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-create-dialog-header">
              <h2 id="notes-create-dialog-title">{'\u65b0\u5efa\u7b14\u8bb0'}</h2>
              <button
                type="button"
                className="notes-create-dialog-close"
                onClick={() => setIsCreateDialogOpen(false)}
                aria-label={'\u5173\u95ed\u65b0\u5efa\u7b14\u8bb0\u7a97\u53e3'}
              >
                <IconX aria-hidden="true" />
              </button>
            </div>

            <div className="notes-create-dialog-body">
              <label className="notes-create-dialog-field">
                <span>{'\u6807\u9898'}</span>
                <input
                  ref={createTitleInputRef}
                  value={createTitleValue}
                  onChange={(event) => setCreateTitleValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && createTitleValue.trim() && createCategoryIsValid) {
                      event.preventDefault();
                      void confirmCreateNote();
                    }
                  }}
                  placeholder={'\u8f93\u5165\u7b14\u8bb0\u6807\u9898'}
                />
              </label>

              <label className="notes-create-dialog-field">
                <span>{'\u7c7b\u76ee'}</span>
                <select value={createCategoryValue} onChange={(event) => setCreateCategoryValue(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="notes-create-dialog-field">
                <span>{'\u7b14\u8bb0\u7c7b\u578b'}</span>
                <select
                  value={createTypeValue}
                  onChange={(event) => setCreateTypeValue(event.target.value as ContentDraft['type'])}
                >
                  <option value="markdown">Markdown {'\u7b14\u8bb0'}</option>
                  <option value="inknote">{'\u624b\u5199\u7b14\u8bb0'}</option>
                </select>
              </label>
            </div>

            <div className="notes-create-dialog-actions">
              <button type="button" className="notes-create-dialog-cancel" onClick={() => setIsCreateDialogOpen(false)}>
                {'\u53d6\u6d88'}
              </button>
              <button
                type="button"
                className="notes-create-dialog-submit"
                onClick={() => void confirmCreateNote()}
                disabled={!createTitleValue.trim() || !createCategoryIsValid}
              >
                {'\u521b\u5efa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/*
      {isCreateDialogOpen ? (
        <div className="notes-dialog-overlay" onClick={() => setIsCreateDialogOpen(false)}>
          <div
            className="notes-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-create-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notes-create-dialog-header">
              <h2 id="notes-create-dialog-title">新建笔记</h2>
              <button
                type="button"
                className="notes-create-dialog-close"
                onClick={() => setIsCreateDialogOpen(false)}
                aria-label="关闭新建笔记窗口"
              >
                ×
              </button>
            </div>

            <div className="notes-create-dialog-body">
              <label className="notes-create-dialog-field">
                <span>标题</span>
                <input
                  ref={createTitleInputRef}
                  value={createTitleValue}
                  onChange={(event) => setCreateTitleValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && createTitleValue.trim() && createCategoryValue) {
                      event.preventDefault();
                      confirmCreateNote();
                    }
                  }}
                  placeholder="输入笔记标题"
                />
              </label>

              <label className="notes-create-dialog-field">
                <span>类目</span>
                <select value={createCategoryValue} onChange={(event) => setCreateCategoryValue(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="notes-create-dialog-field">
                <span>笔记类型</span>
                <select
                  value={createTypeValue}
                  onChange={(event) => setCreateTypeValue(event.target.value as ContentDraft['type'])}
                >
                  <option value="markdown">Markdown 笔记</option>
                  <option value="inknote">手写笔记</option>
                </select>
              </label>
            </div>

            <div className="notes-create-dialog-actions">
              <button type="button" className="notes-create-dialog-cancel" onClick={() => setIsCreateDialogOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="notes-create-dialog-submit"
                onClick={confirmCreateNote}
                disabled={!createTitleValue.trim() || !createCategoryValue}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      */}

    </div>
  );
}
