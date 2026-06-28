import {
  startTransition,
  useDeferredValue,
  useEffect,
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
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowUp,
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
  IconHeading,
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
  IconTrash,
  IconUpload,
  IconWriting,
  IconX,
} from '@tabler/icons-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
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
  compressGalleryImageFile,
  convertSlidesToPdf,
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
  listenToDesktopUpdateProgress,
  listenToPublishProgress,
  openExternalUrl,
  publishContentChanges,
  pullRemoteContent,
  readContentFile,
  readTextFile,
  writeBinaryFile,
  writeContentFile,
  writeTextFile,
  type PublishProgressEvent,
} from './lib/platform';

type WorkspacePanel = 'write' | 'inknote';
type CategoryDialogState = { mode: 'create' } | { mode: 'edit'; slug: string };
type PullConflictStrategy = 'remote' | 'local';

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

interface PublishLogEntry extends PublishProgressEvent {
  id: number;
  receivedAt: string;
}

interface EditorSelectionState {
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
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
const LOCAL_BLOG_PREVIEW_ORIGIN = 'http://localhost:4321';
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
const GALLERY_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const SLIDES_FILE_EXTENSIONS = new Set(['ppt', 'pptx', 'pdf']);
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

type SettingsSection = 'basic' | 'images' | 'site' | 'publish' | 'about';
type SettingsImageTab = 'external' | 'internal' | 'gallery';
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

interface GalleryImageItem {
  id: string;
  path: string;
  name: string;
  size?: number;
  uploadedAt?: string;
}

interface GalleryImageManifest {
  updatedAt: string;
  count: number;
  images: GalleryImageItem[];
}

interface ImagePreviewState {
  src: string;
  title: string;
}

interface ImagePageData<T> {
  items: T[];
  pageCount: number;
  safePage: number;
}

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
  const extension = getSlidesFileExtension(sourcePath) ?? 'pptx';
  const baseName = sanitizeAssetName(getFileNameFromPath(sourcePath)) || 'slides';
  const nonce = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `slides-${createAssetTimestamp(date)}-${nonce}-${baseName}.${extension}`;
}

function replaceFileExtension(fileName: string, nextExtension: string): string {
  return `${fileName.replace(/\.[^.]+$/i, '')}.${nextExtension.replace(/^\./, '')}`;
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

function getDesktopPublicAssetSource(contentRoot: string | null, source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed) || /^(?:data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  const filePath = getPublicAssetFilePath(contentRoot, trimmed);
  if (filePath && isTauri()) {
    return convertFileSrc(filePath);
  }
  if (trimmed.startsWith('/')) {
    return `${LOCAL_BLOG_PREVIEW_ORIGIN}${trimmed}`;
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
              }
            : null,
        )
        .filter((image): image is GalleryImageItem => Boolean(image))
    : [];

  return {
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    count: images.length,
    images,
  };
}

function getGalleryImagePreviewSource(path: string, contentRoot: string | null): string {
  return getDesktopPublicAssetSource(contentRoot, path);
}

function getGalleryImageKey(image: GalleryImageItem): string {
  return image.id || image.path;
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
    available: boolean;
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
  } | null>('plugin:updater|check', { timeout: 30_000 });

  return metadata?.available ? new Update(metadata) : null;
}

function resolveDesktopContentImages(markdown: string, contentRoot: string | null): string {
  return markdown
    .replace(/(\]\(\s*)(\/(?:content-images|content-slides|card-images|generated)\/[^\s)\r\n]+)/g, (_match, prefix, source) => {
      const resolved = getDesktopPublicAssetSource(contentRoot, source);
      return resolved ? `${prefix}${resolved}` : `${prefix}${source}`;
    })
    .replace(
      /(\b(?:src|original|href)\s*=\s*["'])(\/(?:content-images|content-slides|card-images|generated)\/[^"']+)/gi,
      (_match, prefix, source) => {
        const resolved = getDesktopPublicAssetSource(contentRoot, source);
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

function getManagedImagePreviewSource(source: string, contentRoot: string | null): string {
  return getDesktopPublicAssetSource(contentRoot, source);
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
  localizationStatus,
  onPreview,
}: {
  asset: ManagedImageAsset;
  contentRoot: string | null;
  localizationStatus?: ImageLocalizationStatus;
  onPreview?: (preview: ImagePreviewState) => void;
}) {
  const [failed, setFailed] = useState(false);
  const previewSource = getManagedImagePreviewSource(asset.source, contentRoot);
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
  selected,
  selectable,
  onToggle,
  onPreview,
}: {
  image: GalleryImageItem;
  contentRoot: string | null;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onPreview?: (preview: ImagePreviewState) => void;
}) {
  const [failed, setFailed] = useState(false);
  const previewSource = getGalleryImagePreviewSource(image.path, contentRoot);
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
        onClick={!selectable && previewSource ? () => onPreview?.({ src: previewSource, title }) : undefined}
        onKeyDown={
          !selectable && previewSource
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
            alt={image.name}
            loading="lazy"
            referrerPolicy="no-referrer"
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
        <span className="notes-settings-image-kind gallery">图库</span>
      </div>
      <div className="notes-settings-image-copy">
        <strong title={title}>{title}</strong>
      </div>
    </article>
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

  return (
    <div className="notes-settings-image-pagination">
      <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
        上一页
      </button>
      <span>
        {safePage} / {pageCount}
      </span>
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
    branch: 'gh-pages',
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
  const repository: RepositoryConfig = {
    remote:
      typeof repositoryInput.remote === 'string'
        ? repositoryInput.remote
        : fallback.repository?.remote ?? '',
    branch:
      typeof repositoryInput.branch === 'string'
        ? repositoryInput.branch
        : fallback.repository?.branch ?? 'gh-pages',
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

  return tags;
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

function FriendLinkAvatar({ label, icon, fetchedAt }: { label: string; icon?: string; fetchedAt?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [fetchedAt, icon]);

  const cacheKey = fetchedAt?.trim() ? `?v=${encodeURIComponent(fetchedAt)}` : '';
  const source = icon?.trim()
    ? `${LOCAL_BLOG_PREVIEW_ORIGIN}${icon.startsWith('/') ? icon : `/${icon}`}${cacheKey}`
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

export default function NotesWorkbench() {
  const [libraryRoot, setLibraryRoot] = useState('content');
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [status, setStatus] = useState('濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺缂佲偓婢舵劖鐓熸俊顖滃帶閸斿绱掓担鐟邦棆缂佽鲸甯掕灃濞达綀顕栧鍨渻?..');
  const [isBusy, setIsBusy] = useState(false);
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
  const [publishMessage, setPublishMessage] = useState('Update blog content');
  const [isPublishingSite, setIsPublishingSite] = useState(false);
  const [isTestingRemote, setIsTestingRemote] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishRunState, setPublishRunState] = useState<PublishRunState>('idle');
  const [publishLogs, setPublishLogs] = useState<PublishLogEntry[]>([]);
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [isPullingContent, setIsPullingContent] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullRunState, setPullRunState] = useState<PublishRunState>('idle');
  const [pullLogs, setPullLogs] = useState<PublishLogEntry[]>([]);
  const [pullConflictStrategy, setPullConflictStrategy] = useState<PullConflictStrategy>('remote');
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
  const [imageSettingsTab, setImageSettingsTab] = useState<SettingsImageTab>('external');
  const [externalImagePage, setExternalImagePage] = useState(1);
  const [internalImagePage, setInternalImagePage] = useState(1);
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [galleryPage, setGalleryPage] = useState(1);
  const [selectedGalleryImageKeys, setSelectedGalleryImageKeys] = useState<string[]>([]);
  const [isGalleryMultiSelectMode, setIsGalleryMultiSelectMode] = useState(false);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isUploadingGalleryImages, setIsUploadingGalleryImages] = useState(false);
  const [isDeletingGalleryImages, setIsDeletingGalleryImages] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('basic');
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
  const [categoryLabelValue, setCategoryLabelValue] = useState('');
  const [categoryLabelEnValue, setCategoryLabelEnValue] = useState('');
  const [categorySlugValue, setCategorySlugValue] = useState('');
  const [draggingCategorySlug, setDraggingCategorySlug] = useState<string | null>(null);
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
  const draftRef = useRef<ContentDraft | null>(null);
  const categoriesRef = useRef<ContentCategory[]>([]);
  const itemsRef = useRef<ContentLibraryItem[]>([]);
  const categoryDragSourceRef = useRef<string | null>(null);
  const categoryDragOriginalOrderRef = useRef<ContentCategory[] | null>(null);
  const pendingCategoryOrderRef = useRef<ContentCategory[] | null>(null);
  const noteDragSourceRef = useRef<string | null>(null);
  const noteDragOriginalItemsRef = useRef<ContentLibraryItem[] | null>(null);
  const pendingNoteOrderRef = useRef<ContentLibraryItem[] | null>(null);
  const linkedNotebookRef = useRef<ProjectData | null>(null);
  const linkedNotebookSavedSnapshotRef = useRef('');
  const linkedNotebookSessionIdRef = useRef<number | null>(null);
  const previewSyncFrameRef = useRef<number | null>(null);
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
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

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
    () => <MarkdownPreview markdown={resolveDesktopContentImages(deferredPreviewBody, libraryRoot)} />,
    [deferredPreviewBody, libraryRoot],
  );

  useEffect(() => {
    if (!showPreview) {
      setIsPreviewRenderPending(false);
      return;
    }

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
  }, [previewBody, previewRenderBody, showPreview]);

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

  const schedulePreviewPositionSync = () => {
    if (previewSyncFrameRef.current !== null) {
      return;
    }

    previewSyncFrameRef.current = window.requestAnimationFrame(syncPreviewPosition);
  };

  const handleEditorScroll = () => {
    schedulePreviewPositionSync();
  };

  const handlePreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    event.preventDefault();
    editor.scrollTop += event.deltaY;
    schedulePreviewPositionSync();
  };

  useEffect(() => {
    if (!showPreview) {
      return;
    }

    schedulePreviewPositionSync();
  }, [showPreview, deferredPreviewBody]);

  useEffect(() => {
    if (!showPreview) {
      return;
    }

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
      setStatus('Publishing requires the Tauri desktop app.');
      return;
    }

    const repository = siteConfigDraft.repository;
    const remote = repository?.remote.trim() ?? '';
    const branch = repository?.branch.trim() ?? '';
    const selectedSshKeyPath = sshKeyPath.trim();
    if (!remote || !branch) {
      setPublishConnectionMessage('请先填写远程仓库和发布分支。');
      setStatus('\u8bf7先填写远程仓库和发布分支。');
      return;
    }

    setIsTestingRemote(true);
    setPublishConnectionMessage('正在连接远程仓库...');

    try {
      const nextStatus = await getPublishStatus(remote, branch, selectedSshKeyPath);
      setPublishConnectionMessage(nextStatus.shortStatus);
      setStatus(nextStatus.shortStatus);
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      setPublishConnectionMessage(`连接失败：${detail || '未知错误'}`);
      setStatus(detail || 'Failed to read publish status.');
    } finally {
      setIsTestingRemote(false);
    }
  };

  const publishSiteChanges = async () => {
    setIsPublishDialogOpen(true);
    if (!isTauri()) {
      setStatus('Publishing requires the Tauri desktop app.');
      return;
    }

    const message = publishMessage.trim();
    if (!message) {
      setStatus('Enter a commit message before publishing.');
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
          detail: draft.title,
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
          detail: savedItem.relativePath,
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
        detail: `内容库：${libraryRoot}\n配置：${siteConfigDisplayPath}\n标题：${savedConfig.title}`,
        level: 'success',
      });

      const repository = savedConfig.repository;
      const remote = repository?.remote.trim() ?? '';
      const branch = repository?.branch.trim() ?? '';
      const basePath = inferGitHubPagesBasePath(remote);
      const selectedSshKeyPath = sshKeyPath.trim();
      if (!remote || !branch) {
        recordProgress({
          taskId,
          progress: 10,
          stage: 'config',
          message: '发布配置不完整',
          detail: '请填写远程仓库地址和发布分支。',
          level: 'error',
        });
        setStatus('\u8bf7先填写远程仓库和发布分支。');
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
          detail: error instanceof Error ? error.message : typeof error === 'string' ? error : String(error),
          level: 'warning',
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      setStatus(detail || 'Failed to publish site changes.');
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

  const pullRemoteContentToLocal = async () => {
    setIsPullDialogOpen(true);
    if (isPullingContent) {
      return;
    }
    if (!isTauri()) {
      setStatus('远端同步需要在 Tauri 桌面端中执行。');
      return;
    }

    const configuredRepository = siteConfigDraft.repository;
    const configuredRemote = configuredRepository?.remote.trim() ?? '';
    const configuredBranch = configuredRepository?.branch.trim() ?? '';
    if (!configuredRemote || !configuredBranch) {
      setStatus('请先填写远程仓库和发布分支。');
      setPullLogs([]);
      setPullRunState('error');
      return;
    }

    const conflictLabel = pullConflictStrategy === 'remote' ? '远端优先' : '本地优先';
    const confirmed = window.confirm(
      `将从远端发布分支合并内容到本地；本地独有内容会保留，冲突时使用“${conflictLabel}”。是否继续？`,
    );
    if (!confirmed) {
      setStatus('已取消远端内容同步。');
      return;
    }

    const taskId = globalThis.crypto?.randomUUID?.() ?? `pull-${Date.now()}`;
    let currentProgress = 2;
    const recordProgress = (event: PublishProgressEvent) => {
      const normalizedProgress = Math.max(0, Math.min(100, event.progress));
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

    setPullLogs([]);
    setPullProgress(2);
    setPullRunState('running');
    setIsPullingContent(true);
    let stopListening: (() => void) | null = null;

    try {
      stopListening = await listenToContentSyncProgress((event) => {
        if (event.taskId === taskId) {
          recordProgress(event);
        }
      });
      recordProgress({
        taskId,
        progress: 2,
        stage: 'prepare',
        message: '正在准备远端同步',
        detail: `本次操作会合并远端发布内容；冲突时使用“${conflictLabel}”。`,
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
      const branch = repository?.branch.trim() ?? '';
      const selectedSshKeyPath = sshKeyPath.trim();
      if (!remote || !branch) {
        recordProgress({
          taskId,
          progress: 5,
          stage: 'config',
          message: '远端同步配置不完整',
          detail: '请填写远程仓库地址和发布分支。',
          level: 'error',
        });
        return;
      }

      const result = await pullRemoteContent({
        taskId,
        remote,
        branch,
        sshKeyPath: selectedSshKeyPath,
        conflictStrategy: pullConflictStrategy,
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
        setStatus('Failed to load the selected avatar.');
        return;
      }

      setBrandAvatar(result);
      try {
        window.localStorage.setItem(BRAND_AVATAR_STORAGE_KEY, result);
      } catch {
        // Ignore local storage write failures.
      }
      setStatus('Updated the blog avatar.');
    };
    reader.onerror = () => {
      setStatus('Failed to load the selected avatar.');
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
      setStatus('Stayed on the current note.');
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
    setStatus('Undid the latest editor change.');
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
    setStatus('Reapplied the latest editor change.');
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
    setStatus('Undid the latest notebook editor change.');
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
    setStatus('Reapplied the latest notebook editor change.');
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
    setStatus('Loading notes...');

    try {
      if (!isTauri()) {
        setLibraryRoot('content');
        setCategories([]);
        setItems([]);
        setSelectedCategorySlug(null);
        activateDraft(null);
        clearLinkedNotebookState();
        setStatus('Content management is only available in the Tauri desktop app.');
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

      setStatus(`Loaded ${loadedItems.length} notes.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load notes.');
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
    if (!isSettingsOpen || settingsSection !== 'site' || !isTauri()) {
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

  const openCreateCategoryDialog = () => {
    setCategoryDialog({ mode: 'create' });
    setCategoryLabelValue('');
    setCategoryLabelEnValue('');
    setCategorySlugValue('');
  };

  const openEditCategoryDialog = (category: ContentCategory) => {
    setCategoryDialog({ mode: 'edit', slug: category.slug });
    setCategoryLabelValue(category.label);
    setCategoryLabelEnValue(category.labelEn?.trim() ?? '');
    setCategorySlugValue(category.slug);
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
    const routeInput = categorySlugValue.trim();
    const requestedSlug = routeInput ? slugifyCategoryLabel(routeInput) : '';

    if (!label) {
      setStatus('\u8bf7\u586b\u5199\u7c7b\u76ee\u540d\u79f0\u3002');
      return;
    }

    if (routeInput && !requestedSlug) {
      setStatus('\u8bf7\u586b\u5199\u6709\u6548\u7684\u7c7b\u76ee\u8def\u7531\u3002');
      return;
    }

    setIsBusy(true);

    try {
      if (categoryDialog.mode === 'create') {
        if (requestedSlug && categories.some((category) => category.slug === requestedSlug)) {
          setStatus(`\u7c7b\u76ee\u8def\u7531\u300c${requestedSlug}\u300d\u5df2\u5b58\u5728\u3002`);
          return;
        }

        const nextSlug = requestedSlug || ensureUniqueCategorySlug(labelEn || label, categories);
        const nextCategories = [
          ...categories,
          {
            slug: nextSlug,
            label,
            ...(labelEn ? { labelEn } : {}),
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
          requestedSlug &&
          categories.some(
            (category) => category.slug === requestedSlug && category.slug !== categoryToEdit.slug,
          )
        ) {
          setStatus(`\u7c7b\u76ee\u8def\u7531\u300c${requestedSlug}\u300d\u5df2\u5b58\u5728\u3002`);
          return;
        }

        const nextSlug =
          requestedSlug || ensureUniqueCategorySlug(labelEn || label, categories, categoryToEdit.slug);
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
                labelEn: labelEn || undefined,
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

  const deleteSelectedCategory = async (categoryOverride?: ContentCategory | null) => {
    const categoryToDelete = categoryOverride ?? selectedCategory;
    if (!categoryToDelete) {
      setStatus('Select a category to delete it.');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`delete "${categoryToDelete.label}"`)) {
      return;
    }

    const affectedItems = items.filter((item) => getItemCategorySlug(item) === categoryToDelete.slug);
    const otherCategories = categories.filter((category) => category.slug !== categoryToDelete.slug);

    let targetCategory: ContentCategory | null = null;
    if (affectedItems.length > 0) {
      if (otherCategories.length === 0) {
        setStatus('Move the notes out of this category before deleting it.');
        return;
      }

      const targetInput = window
        .prompt(
          `Move ${affectedItems.length} note(s) to which category before deleting "${categoryToDelete.label}"?\n\n${otherCategories
            .map((category) => `${category.label} (${category.slug})`)
            .join('\n')}`,
          otherCategories[0]?.label ?? '',
        )
        ?.trim();

      if (!targetInput) {
        setStatus('Category deletion cancelled.');
        return;
      }

      const normalizedTarget = slugifyCategoryLabel(targetInput);
      targetCategory =
        otherCategories.find((category) => category.slug === normalizedTarget) ??
        otherCategories.find((category) => category.label === targetInput) ??
        null;

      if (!targetCategory) {
        setStatus('Choose a valid target category before deleting this one.');
        return;
      }
    }

    setIsBusy(true);
    try {
      const rewrittenItems =
        targetCategory && affectedItems.length > 0
          ? await Promise.all(affectedItems.map((item) => rewriteItemCategory(item, targetCategory!.slug)))
          : [];
      const nextCategories = categories.filter((category) => category.slug !== categoryToDelete.slug);

      applyRewrittenItems(rewrittenItems);
      await persistCategoryConfig(nextCategories);
      setSelectedCategorySlug(targetCategory?.slug ?? nextCategories[0]?.slug ?? null);
      setDraft((current) =>
        current && !current.sourceRelativePath && current.category === categoryToDelete.slug
          ? patchDraft(current, { category: targetCategory?.slug ?? '' })
          : current,
      );
      setStatus(
        targetCategory
          ? `Moved ${affectedItems.length} note(s) to "${targetCategory.label}" and deleted "${categoryToDelete.label}".`
          : `Deleted "${categoryToDelete.label}".`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete the category.');
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
      setStatus('Discarded the unsaved draft.');
      return;
    }

    const source = items.find((item) => item.relativePath === draft.sourceRelativePath);
    if (!source) {
      setStatus('Original content could not be found, so the draft cannot be restored.');
      return;
    }

    const nextDraft = getDraftFromItem(source);
    activateDraft(nextDraft);
    setSelectedCategorySlug(getItemCategorySlug(source) || null);
    setWorkspacePanel(getWorkspacePanelForDraft(nextDraft));
    setHistoryEntries([createHistoryEntry('Reverted note', source.frontmatter.title)]);
    setStatus('Reverted to the last saved version.');
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
    const result = transform(currentProject.content, editor.selectionStart, editor.selectionEnd);
    updateLinkedNotebookContent(result.nextValue, { undoSelection });

    requestAnimationFrame(() => {
      if (!editorRef.current) {
        return;
      }

      const nextSelection = clampEditorSelection(
        {
          start: result.nextSelectionStart,
          end: result.nextSelectionEnd,
          direction: 'none',
        },
        editorRef.current.value.length,
      );

      editorRef.current.focus();
      editorRef.current.setSelectionRange(nextSelection.start, nextSelection.end, nextSelection.direction);
      editorSelectionRef.current = nextSelection;
    });
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
      setStatus(`The target path content/${nextSaveTarget} already exists.`);
      return null;
    }

    if (!isTauri()) {
      setStatus('Writing to content/ requires the Tauri desktop app.');
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

      setStatus(options?.successMessage ?? `Saved to content/${nextSaveTarget}`);
      return savedItem;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : options?.failureMessage ?? 'Failed to save note.');
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
      successMessage: `Saved to content/${getDraftSavePath(draft)}`,
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

    if (!isTauri()) {
      setStatus('Exporting notes requires the Tauri desktop app.');
      return;
    }

    const chosenPath = await chooseFileToSave(`${draft.slug || 'note'}.md`);
    if (!chosenPath) {
      setStatus('Export cancelled.');
      return;
    }

    const markdownPath = ensureExtension(chosenPath, '.md');

    try {
      const exportableDraft = patchDraft(draft, { updatedAt: getTimestampValue() });
      await writeTextFile(markdownPath, serializeContentDraft(exportableDraft));

      if (exportableDraft.type === 'inknote') {
        const linkedProject = linkedNotebook ?? createLinkedNotebookProject(exportableDraft, linkedNotebookRef.current);
        const notebookExportPath = markdownPath.replace(/\.md$/i, '.inknote.json');
        await writeTextFile(notebookExportPath, serializeProject(linkedProject));
        appendHistoryEntry('Exported note', exportableDraft.title);
        setStatus(`Exported Markdown and notebook project to ${markdownPath}`);
        return;
      }

      appendHistoryEntry('Exported note', exportableDraft.title);
      setStatus(`Exported note to ${markdownPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to export note.');
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
      setStatus('Discarded the unsaved draft.');
      return;
    }

    if (!isTauri()) {
      setStatus('Deleting notes requires the Tauri desktop app.');
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
        setStatus(`Deleted "${draft.title}".`);
      } else {
        activateDraft(null);
        clearLinkedNotebookState();
        setStatus(`Deleted "${draft.title}".`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete note.');
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
      const url = `${origin}${path}`;
      await openExternalUrl(url);
      setStatus(`\u5df2\u6253\u5f00\u672c\u5730\u535a\u5ba2\u9884\u89c8\uff1a${url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const url = `${LOCAL_BLOG_PREVIEW_ORIGIN}${path}`;
      setStatus(`\u65e0\u6cd5\u6253\u5f00\u672c\u5730\u535a\u5ba2\u9884\u89c8\uff1a${url}\uff08${message}\uff09`);
      return;
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
    const result = transform(draft.body, editor.selectionStart, editor.selectionEnd);
    updateDraft({ body: result.nextValue }, { undoSelection });

    requestAnimationFrame(() => {
      if (!editorRef.current) {
        return;
      }

      const nextSelection = clampEditorSelection(
        {
          start: result.nextSelectionStart,
          end: result.nextSelectionEnd,
          direction: 'none',
        },
        editorRef.current.value.length,
      );

      editorRef.current.focus();
      editorRef.current.setSelectionRange(nextSelection.start, nextSelection.end, nextSelection.direction);
      editorSelectionRef.current = nextSelection;
    });
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
      nextSelection = {
        start: result.nextSelectionStart,
        end: result.nextSelectionEnd,
        direction: 'none',
      };
      restoreEditorSelection(nextSelection);
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
      return patchDraft(current, { body: result.nextValue });
    });

    requestAnimationFrame(() => restoreEditorSelection(nextSelection));
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
      setStatus('仅支持插入 PPT、PPTX 或 PDF 文件。');
      return;
    }

    const noteSlug = draft.slug;
    const fileTitle = getFileNameFromPath(selectedPath).replace(/\.[^.\\/]+$/i, '') || 'Slides';

    try {
      setStatus(`正在处理演示文稿：${fileTitle}...`);
      const fileName = createSlidesFileName(selectedPath, new Date());
      const originalTarget = getSlidesTargetPath(libraryRoot, draft.type, noteSlug, fileName);
      const renderTarget =
        extension === 'pdf'
          ? originalTarget
          : getSlidesTargetPath(libraryRoot, draft.type, noteSlug, replaceFileExtension(fileName, 'pdf'));

      if (extension !== 'pdf') {
        setStatus(`正在转换为 PDF：${fileTitle}...`);
        await convertSlidesToPdf(selectedPath, renderTarget.filePath);
      }
      await copyFileToPath(selectedPath, originalTarget.filePath);

      insertPastedImageReferences(
        [
          `<div data-inknote-slides src="${renderTarget.publicPath}"`,
          extension === 'pdf' ? '' : ` original="${originalTarget.publicPath}"`,
          ` title="${escapeHtmlAttribute(fileTitle)}" type="pdf"></div>`,
        ].join(''),
        selection,
        noteSlug,
        draft.type,
      );
      appendHistoryEntry('Inserted slides', fileTitle);
      setStatus(`已插入演示文稿：${fileTitle}`);
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
  const externalImagePageData = useMemo(
    () => paginateImageItems(externalManagedImages, externalImagePage),
    [externalManagedImages, externalImagePage],
  );
  const internalImagePageData = useMemo(
    () => paginateImageItems(internalManagedImages, internalImagePage),
    [internalManagedImages, internalImagePage],
  );
  const galleryImagePageData = useMemo(
    () => paginateImageItems(galleryImages, galleryPage),
    [galleryImages, galleryPage],
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

  const writeUserGalleryManifest = async (images: GalleryImageItem[]) => {
    const manifestPath = getUserGalleryManifestPath(libraryRoot);
    const manifest = normalizeGalleryManifest({
      updatedAt: new Date().toISOString(),
      images,
    });
    await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    setGalleryImages(manifest.images);
  };

  const loadUserGalleryManifest = async () => {
    if (!isTauri() || !libraryRoot) {
      setGalleryImages([]);
      return;
    }

    setIsGalleryLoading(true);
    try {
      const manifest = await readUserGalleryManifest();
      setGalleryImages(manifest.images);
      setGalleryPage(1);
    } catch (error) {
      setGalleryImages([]);
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
    setIsBusy(true);
    try {
      const manifest = await readUserGalleryManifest();
      const existingPaths = new Set(manifest.images.map((image) => image.path));
      const nextImages = [...manifest.images];
      const now = new Date();

      for (const [index, sourcePath] of selectedFiles.entries()) {
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
        });
      }

      await writeUserGalleryManifest(nextImages);
      setGalleryPage(1);
      setStatus(`已上传 ${nextImages.length - manifest.images.length} 张图片到图库。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图库图片上传失败。');
    } finally {
      setIsUploadingGalleryImages(false);
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
      const nextImages = [...galleryImages];
      for (let index = nextImages.length - 1; index > 0; index -= 1) {
        const targetIndex = Math.floor(Math.random() * (index + 1));
        [nextImages[index], nextImages[targetIndex]] = [nextImages[targetIndex], nextImages[index]];
      }

      await writeUserGalleryManifest(nextImages);
      setGalleryPage(1);
      setStatus('已重新分配文章配图，发布站点后生效。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重新分配文章配图失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteSelectedGalleryImages = async () => {
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

    const confirmed = window.confirm(`确定删除选中的 ${selectedImages.length} 张图库图片吗？`);
    if (!confirmed) {
      return;
    }

    setIsDeletingGalleryImages(true);
    setIsBusy(true);
    try {
      for (const image of selectedImages) {
        if (image.path.startsWith(USER_GALLERY_UPLOADS_PUBLIC_PREFIX)) {
          await deleteGalleryImageFile(image.path);
        }
      }

      const nextImages = galleryImages.filter((image) => !selectedSet.has(getGalleryImageKey(image)));
      await writeUserGalleryManifest(nextImages);
      setSelectedGalleryImageKeys([]);
      setIsGalleryMultiSelectMode(false);
      setGalleryPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(nextImages.length / IMAGE_MANAGEMENT_PAGE_SIZE))),
      );
      setStatus(`已删除 ${selectedImages.length} 张图库图片。`);
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
      for (const asset of externalManagedImages) {
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
      }

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

  const saveStateText = draft
    ? draft.type === 'inknote' && notebookDirty && draftDirty
      ? 'Markdown and linked notebook both have unsaved changes.'
      : draft.type === 'inknote' && notebookDirty
        ? 'The linked notebook has unsaved changes.'
        : dirty
          ? 'The current note has unsaved changes.'
          : 'All changes are saved.'
    : 'Select a note to start editing.';

  const selectedCategory =
    (selectedCategorySlug ? categories.find((category) => category.slug === selectedCategorySlug) : null) ?? null;
  const metadataCategoryOptions =
    draft?.category && !categories.some((category) => category.slug === draft.category)
      ? [...categories, { slug: draft.category, label: draft.category }]
      : categories;
  const createCategoryIsValid = categories.some((category) => category.slug === createCategoryValue);

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
          >
            {'\u9884\u89c8'}
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

          <div className="notes-sidebar-footer">
            <div className="notes-sidebar-status">
              <span>{saveStateText}</span>
              <p>{status}</p>
            </div>
          </div>
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

              {!isPreviewOnly ? (
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

              {isPreviewOnly ? (
                activeWorkspacePanel === 'inknote' ? (
                  <div className="notes-editor-workbench notes-editor-workbench-preview-only notes-inknote-preview-only">
                    <div className="notes-rendered-pane notes-inknote-rendered-pane preview-only">
                      <InkNoteProjectPreviewPanel
                        project={linkedNotebook}
                        projectPath={linkedNotebookPath}
                        status={linkedNotebookStatus}
                        embedded
                      />
                    </div>
                  </div>
                ) : (
                  <div className="notes-editor-workbench notes-editor-workbench-preview-only">
                    <div ref={previewPaneRef} className="notes-rendered-pane preview-only">
                      {isPreviewRenderPending ? (
                        <span className="notes-rendered-pending">{'\u9884\u89c8\u66f4\u65b0\u4e2d'}</span>
                      ) : null}
                      <article ref={previewArticleRef} className="notes-rendered-article">
                        {renderedPreview}
                      </article>
                    </div>
                  </div>
                )
              ) : activeWorkspacePanel === 'write' ? (
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
                      onClick={() => applyLinePrefix((line) => `## ${line.replace(/^#{1,6}\s+/, '')}`)}
                      title="Heading"
                      aria-label="Heading"
                    >
                      <IconHeading aria-hidden="true" />
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

                  <div className="notes-editor-workbench">
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

                  </div>
                </>
              ) : (
                <>
                  <div className="notes-editor-toolbar notes-inknote-toolbar">
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinkedNotebookLinePrefix((line) => `# ${line.replace(/^#{1,6}\s+/, '')}`)}
                      disabled={!linkedNotebook}
                      title="标题"
                      aria-label="标题"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-heading">H1</span>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinkedNotebookLinePrefix((line) => `## ${line.replace(/^#{1,6}\s+/, '')}`)}
                      disabled={!linkedNotebook}
                      title="副标题"
                      aria-label="副标题"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-heading">H2</span>
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

                  <div className="notes-editor-workbench split notes-inknote-editor-workbench">
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

                    <div className="notes-rendered-pane notes-inknote-rendered-pane">
                      <InkNoteProjectPreviewPanel
                        project={linkedNotebook}
                        projectPath={linkedNotebookPath}
                        status={linkedNotebookStatus}
                        embedded
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
                  className={settingsSection === 'site' ? 'active' : ''}
                  onClick={() => setSettingsSection('site')}
                >
                  <strong>{'\u7ad9\u70b9\u8bbe\u7f6e'}</strong>
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
                    <div className="notes-settings-inline-heading">
                      <span>{'\u7c7b\u76ee'}</span>
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
                                onClick={() => void deleteSelectedCategory(category)}
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

                      <button
                        type="button"
                        className="notes-settings-category-create"
                        onClick={openCreateCategoryDialog}
                        disabled={isBusy}
                        aria-label={'\u65b0\u5efa\u7c7b\u76ee'}
                        title={'\u65b0\u5efa\u7c7b\u76ee'}
                      >
                        <span className="notes-settings-category-create-plus" aria-hidden="true">
                          <IconPlus />
                        </span>
                      </button>
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'basic' || settingsSection === 'site' ? (
                  <section className={`notes-settings-section notes-settings-profile notes-settings-mode-${settingsSection}`}>
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

                      <div className="notes-settings-friend-section notes-settings-site-only">
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
                              <div className="notes-settings-friend-row" key={index}>
                                <FriendLinkAvatar
                                  label={link.label}
                                  icon={link.icon}
                                  fetchedAt={link.iconFetchedAt}
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
                                    onClick={() => moveFriendLinkDraft(index, -1)}
                                    disabled={friendIconLoadingIndex !== null || index === 0}
                                    title={'\u4e0a\u79fb'}
                                    aria-label={`\u4e0a\u79fb ${link.label || `\u7b2c ${index + 1} \u4e2a\u53cb\u94fe`}`}
                                  >
                                    <IconArrowUp aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveFriendLinkDraft(index, 1)}
                                    disabled={friendIconLoadingIndex !== null || index === links.length - 1}
                                    title={'\u4e0b\u79fb'}
                                    aria-label={`\u4e0b\u79fb ${link.label || `\u7b2c ${index + 1} \u4e2a\u53cb\u94fe`}`}
                                  >
                                    <IconArrowDown aria-hidden="true" />
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

                      <div className="notes-settings-friend-section notes-settings-site-only">
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
                              <div className="notes-settings-friend-row" key={index}>
                                <FriendLinkAvatar
                                  label={link.label}
                                  icon={link.icon}
                                  fetchedAt={link.iconFetchedAt}
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
                                    onClick={() => moveToolLinkDraft(index, -1)}
                                    disabled={toolIconLoadingIndex !== null || index === 0}
                                    title={'\u4e0a\u79fb'}
                                    aria-label={`\u4e0a\u79fb ${link.label || `\u7b2c ${index + 1} \u4e2a\u5de5\u5177`}`}
                                  >
                                    <IconArrowUp aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveToolLinkDraft(index, 1)}
                                    disabled={toolIconLoadingIndex !== null || index === links.length - 1}
                                    title={'\u4e0b\u79fb'}
                                    aria-label={`\u4e0b\u79fb ${link.label || `\u7b2c ${index + 1} \u4e2a\u5de5\u5177`}`}
                                  >
                                    <IconArrowDown aria-hidden="true" />
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
                    </div>
                  </section>
                ) : null}

                {settingsSection === 'images' ? (
                  <section className="notes-settings-section notes-settings-images-section">
                    <div className="notes-settings-image-tabs" role="tablist" aria-label="图片管理">
                      <button
                        type="button"
                        className={imageSettingsTab === 'external' ? 'active' : ''}
                        onClick={() => setImageSettingsTab('external')}
                      >
                        外链引用
                        <span>{externalManagedImages.length}</span>
                      </button>
                      <button
                        type="button"
                        className={imageSettingsTab === 'internal' ? 'active' : ''}
                        onClick={() => setImageSettingsTab('internal')}
                      >
                        本地存储
                        <span>{internalManagedImages.length}</span>
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

                    <div className="notes-settings-image-groups">
                      {imageSettingsTab === 'external' ? (
                        <section className="notes-settings-image-group">
                          <div className="notes-settings-image-group-head">
                            <strong>外链引用</strong>
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
                            <>
                              <div className="notes-settings-image-grid">
                                {externalImagePageData.items.map((asset) => (
                                  <ManagedImageCard
                                    key={asset.source}
                                    asset={asset}
                                    contentRoot={libraryRoot}
                                    localizationStatus={imageLocalizationStatus[asset.source]}
                                    onPreview={setImagePreview}
                                  />
                                ))}
                              </div>
                              <ImagePagination
                                page={externalImagePageData.safePage}
                                pageCount={externalImagePageData.pageCount}
                                onPageChange={setExternalImagePage}
                              />
                            </>
                          ) : (
                            <div className="notes-settings-image-group-empty">没有外链图片</div>
                          )}
                        </section>
                      ) : null}

                      {imageSettingsTab === 'internal' ? (
                        <section className="notes-settings-image-group">
                          <div className="notes-settings-image-group-head">
                            <strong>本地存储</strong>
                            <span>{internalManagedImages.length}</span>
                          </div>
                          {internalManagedImages.length > 0 ? (
                            <>
                              <div className="notes-settings-image-grid">
                                {internalImagePageData.items.map((asset) => (
                                  <ManagedImageCard
                                    key={asset.source}
                                    asset={asset}
                                    contentRoot={libraryRoot}
                                    onPreview={setImagePreview}
                                  />
                                ))}
                              </div>
                              <ImagePagination
                                page={internalImagePageData.safePage}
                                pageCount={internalImagePageData.pageCount}
                                onPageChange={setInternalImagePage}
                              />
                            </>
                          ) : (
                            <div className="notes-settings-image-group-empty">没有本地图片引用</div>
                          )}
                        </section>
                      ) : null}

                      {imageSettingsTab === 'gallery' ? (
                        <section className="notes-settings-image-group">
                          <div className="notes-settings-image-group-head">
                            <strong>图库</strong>
                            <span>{galleryImages.length}</span>
                            <div className="notes-settings-gallery-actions">
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
                            </div>
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
                          </div>

                          {isGalleryMultiSelectMode ? (
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
                                onClick={() => void deleteSelectedGalleryImages()}
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
                                    selectable={isGalleryMultiSelectMode}
                                    selected={selectedGalleryImageSet.has(getGalleryImageKey(image))}
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
                                <ManagedImageCard key={asset.source} asset={asset} contentRoot={libraryRoot} />
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

                {settingsSection === 'site' || settingsSection === 'publish' ? (
                  <section className={`notes-settings-section notes-settings-services notes-settings-mode-${settingsSection}`}>
                    <div className="notes-settings-blog-grid">
                      <label className="notes-settings-field wide notes-settings-publish-only">
                        <span>{'\u4ed3\u5e93\u5730\u5740'}</span>
                        <input
                          type="text"
                          value={siteConfigDraft.repository?.remote ?? ''}
                          onChange={(event) => updateRepositoryConfigDraft({ remote: event.target.value })}
                          placeholder="https://github.com/user/repo.git"
                        />
                      </label>

                      <label className="notes-settings-field notes-settings-publish-only">
                        <span>{'\u53d1\u5e03\u5206\u652f'}</span>
                        <input
                          value={siteConfigDraft.repository?.branch ?? 'gh-pages'}
                          onChange={(event) => updateRepositoryConfigDraft({ branch: event.target.value })}
                          placeholder="gh-pages"
                        />
                      </label>

                      <div className="notes-settings-site-only notes-settings-service-grid">
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
                          </header>
                          {siteConfigDraft.goatcounter?.enabled ? (
                            <div className="notes-settings-integration-fields">
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
                        </section>

                        <section className="notes-settings-integration-card">
                          <header className="notes-settings-integration-head">
                            <div>
                              <strong>评论系统</strong>
                              <span>使用 Giscus 将 GitHub Discussions 接入文章页</span>
                            </div>
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
                          </header>
                          {siteConfigDraft.giscus?.enabled ? (
                            <div className="notes-settings-integration-fields two-column">
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

                      <div className="notes-settings-connection notes-settings-publish-only">
                        <div>
                          <strong>远程仓库连接</strong>
                          <span>{publishConnectionMessage}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshPublishStatus()}
                          disabled={isTestingRemote || !siteConfigDraft.repository?.remote.trim()}
                        >
                          {isTestingRemote ? (
                            <>
                              <IconLoader2 className="spinning" aria-hidden="true" />
                              连接中
                            </>
                          ) : (
                            <>
                              <IconRefresh aria-hidden="true" />
                              测试连接
                            </>
                          )}
                        </button>
                      </div>

                      <div className="notes-settings-publish-actions notes-settings-publish-only">
                        <button
                          type="button"
                          className="notes-settings-secondary"
                          onClick={openPullRemoteContentDialog}
                          disabled={
                            isPullingContent ||
                            isPublishingSite ||
                            !siteConfigDraft.repository?.remote.trim() ||
                            !siteConfigDraft.repository?.branch.trim()
                          }
                        >
                          {isPullingContent ? (
                            <IconLoader2 className="spinning" aria-hidden="true" />
                          ) : (
                            <IconDownload aria-hidden="true" />
                          )}
                          拉取远端内容
                        </button>
                        <button
                          type="button"
                          className="notes-settings-primary"
                          onClick={openSitePublishDialog}
                          disabled={isPublishingSite || isPullingContent || isBusy}
                        >
                          {isPublishingSite ? (
                            <IconLoader2 className="spinning" aria-hidden="true" />
                          ) : (
                            <IconUpload aria-hidden="true" />
                          )}
                          发布站点
                        </button>
                      </div>

                    </div>
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
                  {siteConfigDraft.repository?.branch.trim()
                    ? ` · ${siteConfigDraft.repository.branch.trim()}`
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
                  {siteConfigDraft.repository?.branch.trim()
                    ? ` · ${siteConfigDraft.repository.branch.trim()}`
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
              <div className="notes-pull-conflict-strategy" aria-label="冲突处理方式">
                <span>冲突处理</span>
                <div>
                  <button
                    type="button"
                    className={pullConflictStrategy === 'remote' ? 'active' : ''}
                    onClick={() => setPullConflictStrategy('remote')}
                    disabled={isPullingContent}
                  >
                    远端优先
                  </button>
                  <button
                    type="button"
                    className={pullConflictStrategy === 'local' ? 'active' : ''}
                    onClick={() => setPullConflictStrategy('local')}
                    disabled={isPullingContent}
                  >
                    本地优先
                  </button>
                </div>
                <small>
                  {pullConflictStrategy === 'remote'
                    ? '同一路径内容不一致时使用远端版本。'
                    : '同一路径内容不一致时保留本地版本。'}
                </small>
              </div>
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
                  <span>点击开始后，将合并远端发布分支内容；本地独有内容会保留。</span>
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
            <img src={imagePreview.src} alt={imagePreview.title} onClick={(event) => event.stopPropagation()} />
            <span>{imagePreview.title}</span>
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
                    ? '\u586b\u5199\u540d\u79f0\u3001\u82f1\u6587\u540d\u548c\u8def\u7531'
                    : '\u4fee\u6539\u663e\u793a\u540d\u548c web \u8def\u7531'}
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
                    if (event.key === 'Enter' && categoryLabelValue.trim()) {
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
                    if (event.key === 'Enter' && categoryLabelValue.trim()) {
                      event.preventDefault();
                      void saveCategoryDialog();
                    }
                  }}
                  placeholder="Mathematics"
                />
              </label>

              <label className="notes-category-dialog-field">
                <span>{'\u8def\u7531'}</span>
                <input
                  value={categorySlugValue}
                  onChange={(event) => setCategorySlugValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && categoryLabelValue.trim()) {
                      event.preventDefault();
                      void saveCategoryDialog();
                    }
                  }}
                  placeholder="machine-learning"
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
                disabled={isBusy || !categoryLabelValue.trim()}
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
