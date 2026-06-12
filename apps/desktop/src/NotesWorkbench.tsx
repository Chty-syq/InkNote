import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import {
  createDefaultProject,
  deserializeProject,
  serializeProject,
  type ProjectData,
} from '@inknote/inknote-core';
import type { ContentCategory } from '@inknote/content-schema';
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
import {
  InkNoteProjectEditorPanel,
  InkNoteProjectPreviewPanel,
} from './InkNoteLinkedProjectPanel';
import {
  CATEGORY_CONFIG_PATH,
  ensureUniqueCategorySlug,
  parseCategoryConfig,
  serializeCategoryConfig,
  slugifyCategoryLabel,
} from './lib/category-config';
import { MarkdownPreview } from './lib/markdown-preview';
import {
  chooseFileToSave,
  deleteContentFile,
  ensureExtension,
  getContentIndex,
  getPublishStatus,
  isTauri,
  publishContentChanges,
  readContentFile,
  writeContentFile,
  writeTextFile,
  type PublishStatusResponse,
} from './lib/platform';

interface NotesWorkbenchProps {
  onSwitchToNotebook: () => void;
}

type WorkspacePanel = 'write' | 'inknote';

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

const DRAFT_UNDO_LIMIT = 100;
const NOTE_HISTORY_LIMIT = 24;
const BRAND_AVATAR_STORAGE_KEY = 'inknote.desktop.brandAvatar';

function sortLibraryItems(items: ContentLibraryItem[]): ContentLibraryItem[] {
  return [...items].sort((left, right) => right.frontmatter.date.localeCompare(left.frontmatter.date));
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

function createHistoryEntry(label: string, detail = ''): NoteHistoryEntry {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    label,
    detail,
    timestamp: getTimestampValue(),
  };
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
    content: existing?.content?.trim() || `# ${title}\n\nWrite the linked notebook content here.`,
    updatedAt: new Date().toISOString(),
  };
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

function getTagTone(tag: string): 'blue' | 'teal' | 'green' | 'amber' | 'violet' {
  const tones = ['blue', 'teal', 'green', 'amber', 'violet'] as const;
  let hash = 0;
  for (const character of tag) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
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

function ToolbarSvg({
  children,
  viewBox = '0 0 16 16',
}: {
  children: ReactNode;
  viewBox?: string;
}) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export default function NotesWorkbench({ onSwitchToNotebook }: NotesWorkbenchProps) {
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
  const [showPreview, setShowPreview] = useState(true);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<NoteHistoryEntry[]>([]);
  const [publishStatus, setPublishStatus] = useState<PublishStatusResponse | null>(null);
  const [publishMessage, setPublishMessage] = useState('Update blog content');
  const [isPublishingSite, setIsPublishingSite] = useState(false);
  const [brandAvatar, setBrandAvatar] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createTitleValue, setCreateTitleValue] = useState('');
  const [createCategoryValue, setCreateCategoryValue] = useState('');
  const [createTypeValue, setCreateTypeValue] = useState<ContentDraft['type']>('markdown');
  const [categoryMenu, setCategoryMenu] = useState<{
    slug: string;
    x: number;
    y: number;
  } | null>(null);
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
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const tagPickerRef = useRef<HTMLDivElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const brandAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const createTitleInputRef = useRef<HTMLInputElement | null>(null);
  const draftUndoStackRef = useRef<ContentDraft[]>([]);
  const draftRedoStackRef = useRef<ContentDraft[]>([]);
  const linkedNotebookRef = useRef<ProjectData | null>(null);
  const linkedNotebookSavedSnapshotRef = useRef('');
  const linkedNotebookSessionIdRef = useRef<number | null>(null);

  useEffect(() => {
    linkedNotebookRef.current = linkedNotebook;
  }, [linkedNotebook]);

  useEffect(() => {
    linkedNotebookSavedSnapshotRef.current = linkedNotebookSavedSnapshot;
  }, [linkedNotebookSavedSnapshot]);

  useEffect(() => {
    if (draft?.type !== 'inknote' && workspacePanel === 'inknote') {
      setWorkspacePanel('write');
    }
  }, [draft?.type, workspacePanel]);

  useEffect(() => {
    if (!categoryMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const menu = categoryMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) {
        return;
      }

      setCategoryMenu(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoryMenu(null);
      }
    };

    const closeMenu = () => {
      setCategoryMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [categoryMenu]);

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
    if (!isTagPickerOpen) {
      return;
    }

    requestAnimationFrame(() => {
      tagInputRef.current?.focus();
      tagInputRef.current?.select();
    });
  }, [isTagPickerOpen]);

  const draftDirty = draft ? isDraftDirty(draft) : false;
  const notebookDirty =
    draft?.type === 'inknote' && linkedNotebook
      ? getProjectSnapshot(linkedNotebook) !== linkedNotebookSavedSnapshot
      : false;
  const dirty = draftDirty || notebookDirty;

  const saveTarget = draft ? getDraftSavePath(draft) : '';
  const linkedNotebookTarget =
    draft && draft.type === 'inknote' && draft.projectFile.trim()
      ? resolveSiblingContentPath(saveTarget, draft.projectFile.trim())
      : null;
  const validationError = draft ? getDraftValidationError(draft) : null;
  const duplicateItem =
    draft && draft.sourceRelativePath !== saveTarget
      ? items.find((item) => item.relativePath === saveTarget)
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
  const deferredPreviewBody = useDeferredValue(previewBody);
  const renderedPreview = useMemo(
    () => <MarkdownPreview markdown={deferredPreviewBody} />,
    [deferredPreviewBody],
  );

  const syncPreviewPosition = () => {
    const editor = editorRef.current;
    const previewPane = previewPaneRef.current;
    const previewArticle = previewArticleRef.current;

    if (!editor || !previewPane || !previewArticle) {
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

  const handleEditorScroll = () => {
    syncPreviewPosition();
  };

  const handlePreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    event.preventDefault();
    editor.scrollTop += event.deltaY;
    syncPreviewPosition();
  };

  useLayoutEffect(() => {
    if (!showPreview) {
      return;
    }

    syncPreviewPosition();
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

    const observer = new ResizeObserver(() => {
      syncPreviewPosition();
    });

    observer.observe(previewPane);
    observer.observe(previewArticle);
    observer.observe(editor);

    return () => observer.disconnect();
  }, [showPreview, deferredPreviewBody]);

  const activateDraft = (nextDraft: ContentDraft | null) => {
    draftUndoStackRef.current = [];
    draftRedoStackRef.current = [];
    setDraftSessionId((current) => current + 1);
    setDraft(nextDraft);
    setShowHistoryPanel(false);
    setHistoryEntries(
      nextDraft
        ? [createHistoryEntry(nextDraft.sourceRelativePath ? 'Opened note' : 'Started new draft', nextDraft.title)]
        : [],
    );
  };

  const appendHistoryEntry = (label: string, detail = '') => {
    setHistoryEntries((current) => [createHistoryEntry(label, detail), ...current].slice(0, NOTE_HISTORY_LIMIT));
  };

  const refreshPublishStatus = async () => {
    if (!isTauri()) {
      setStatus('Publishing requires the Tauri desktop app.');
      return;
    }

    setIsPublishingSite(true);

    try {
      const nextStatus = await getPublishStatus();
      setPublishStatus(nextStatus);
      setStatus(nextStatus.clean ? 'No content changes waiting to publish.' : 'Content changes are ready to publish.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to read publish status.');
    } finally {
      setIsPublishingSite(false);
    }
  };

  const publishSiteChanges = async () => {
    if (!isTauri()) {
      setStatus('Publishing requires the Tauri desktop app.');
      return;
    }

    const message = publishMessage.trim();
    if (!message) {
      setStatus('Enter a commit message before publishing.');
      return;
    }

    setIsPublishingSite(true);

    try {
      const result = await publishContentChanges(message);
      appendHistoryEntry('Published site', message);
      setStatus(result.stdout || 'Pushed content changes to GitHub. GitHub Pages will deploy from the workflow.');
      setPublishStatus(await getPublishStatus());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to publish site changes.');
    } finally {
      setIsPublishingSite(false);
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
    await writeContentFile(CATEGORY_CONFIG_PATH, serializeCategoryConfig(nextCategories));
    setCategories(nextCategories);
  };

  const resolveCategoryInput = (input: string, candidateCategories: ContentCategory[]): ContentCategory | null => {
    const normalizedInput = slugifyCategoryLabel(input.trim());
    return (
      candidateCategories.find((category) => category.slug === normalizedInput) ??
      candidateCategories.find((category) => category.label === input.trim()) ??
      null
    );
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

  const pushDraftUndoEntry = (entry: ContentDraft) => {
    const entrySnapshot = serializeContentDraft(entry);
    const lastEntry = draftUndoStackRef.current[draftUndoStackRef.current.length - 1];

    if (lastEntry && serializeContentDraft(lastEntry) === entrySnapshot) {
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

    draftRedoStackRef.current = [...draftRedoStackRef.current, draft];
    setDraft(previousDraft);
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

    draftUndoStackRef.current = [...draftUndoStackRef.current, draft];
    setDraft(nextDraft);
    appendHistoryEntry('Redo', draft.title);
    setStatus('Reapplied the latest editor change.');
    return true;
  };

  const loadLibrary = async (preferredPath?: string) => {
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

      if (nextItem && (!dirty || preferredPath)) {
        activateDraft(createDraftFromItem(nextItem));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setLinkedNotebook(loadedProject);
        setLinkedNotebookSavedSnapshot(getProjectSnapshot(loadedProject));
        setLinkedNotebookStatus(`Loaded content/${linkedNotebookTarget}`);
        setDraft((current) =>
          current && current.type === 'inknote'
            ? patchDraft(current, {
                paperStyle: loadedProject.paperStyle,
                handwritingStyle: loadedProject.handwritingStyle,
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
    const nextDraft = patchDraft(createDraftFromItem(item), {
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
      activateDraft(createDraftFromItem(nextSelectedItem));
    }
  };

  const createCategory = async () => {
    const label = window.prompt('New category name')?.trim();
    if (!label) {
      return;
    }

    const nextSlug = ensureUniqueCategorySlug(label, categories);
    const nextCategories = [...categories, { slug: nextSlug, label }];

    try {
      await persistCategoryConfig(nextCategories);
      setSelectedCategorySlug(nextSlug);
      setStatus(`Created category "${label}".`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create the category.');
    }
  };

  const renameSelectedCategory = async (categoryOverride?: ContentCategory | null) => {
    const categoryToRename = categoryOverride ?? selectedCategory;
    if (!categoryToRename) {
      setStatus('Select a category to rename it.');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`rename "${categoryToRename.label}"`)) {
      return;
    }

    const nextLabel = window.prompt('Rename category', categoryToRename.label)?.trim();
    if (!nextLabel || nextLabel === categoryToRename.label) {
      return;
    }

    const nextSlug = ensureUniqueCategorySlug(nextLabel, categories, categoryToRename.slug);
    const affectedItems = items.filter((item) => getItemCategorySlug(item) === categoryToRename.slug);

    setIsBusy(true);
    try {
      const rewrittenItems =
        affectedItems.length > 0
          ? await Promise.all(affectedItems.map((item) => rewriteItemCategory(item, nextSlug)))
          : [];
      const nextCategories = categories.map((category) =>
        category.slug === categoryToRename.slug
          ? {
              slug: nextSlug,
              label: nextLabel,
            }
          : category,
      );

      applyRewrittenItems(rewrittenItems);
      await persistCategoryConfig(nextCategories);
      setSelectedCategorySlug(nextSlug);
      setDraft((current) =>
        current && !current.sourceRelativePath && current.category === categoryToRename.slug
          ? patchDraft(current, { category: nextSlug })
          : current,
      );
      setStatus(`Renamed "${categoryToRename.label}" to "${nextLabel}".`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to rename the category.');
    } finally {
      setIsBusy(false);
    }
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

  const openCategoryContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    category: ContentCategory,
  ) => {
    event.preventDefault();
    setSelectedCategorySlug(category.slug);
    setCategoryMenu({
      slug: category.slug,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const openItem = (item: ContentLibraryItem) => {
    const isCurrentItem =
      draft?.sourceRelativePath === item.relativePath ||
      (!draft?.sourceRelativePath && draft?.relativePath === item.relativePath);

    if (isCurrentItem) {
      return;
    }

    if (!confirmDiscardUnsavedChanges(`open "${item.frontmatter.title}"`)) {
      return;
    }

    activateDraft(createDraftFromItem(item));
    setSelectedCategorySlug(getItemCategorySlug(item) || null);
    setWorkspacePanel('write');
    setStatus(`Opened ${item.frontmatter.title}`);
  };

  const openCreateNoteDialog = () => {
    if (categories.length === 0) {
      setStatus('Create a category first, then create a note inside it.');
      return;
    }

    setCreateTitleValue('');
    setCreateCategoryValue(selectedCategorySlug ?? categories[0]?.slug ?? '');
    setCreateTypeValue('markdown');
    setIsCreateDialogOpen(true);
  };

  const confirmCreateNote = () => {
    const normalizedTitle = createTitleValue.trim().replace(/\s+/g, ' ');
    if (!normalizedTitle) {
      setStatus('Enter a title before creating the note.');
      createTitleInputRef.current?.focus();
      return;
    }

    if (!createCategoryValue) {
      setStatus('Choose a category before creating the note.');
      return;
    }

    if (!confirmDiscardUnsavedChanges(`create "${normalizedTitle}"`)) {
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
    setShowPreview(true);
    activateDraft(nextDraft);
    setStatus(`Created "${normalizedTitle}".`);
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

    activateDraft(createDraftFromItem(source));
    setSelectedCategorySlug(getItemCategorySlug(source) || null);
    setWorkspacePanel('write');
    setHistoryEntries([createHistoryEntry('Reverted note', source.frontmatter.title)]);
    setStatus('Reverted to the last saved version.');
  };

  const handleLinkedNotebookChange = (nextProject: ProjectData) => {
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
      setWorkspacePanel('write');

      if (options?.resetUndoStack) {
        activateDraft(createDraftFromItem(savedItem));
        if (options.historyLabel) {
          setHistoryEntries([createHistoryEntry(options.historyLabel, options.historyDetail ?? savedItem.frontmatter.title)]);
        }
      } else {
        setDraft(createDraftFromItem(savedItem));
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

  const saveDraft = async () => {
    if (!draft) {
      return;
    }

    await persistDraft(draft, {
      successMessage: `Saved to content/${getDraftSavePath(draft)}`,
      historyLabel: 'Saved note',
      historyDetail: draft.title,
    });
  };

  const publishDraft = async () => {
    if (!draft) {
      return;
    }

    const nextPublishedState = !draft.published;

    await persistDraft(patchDraft(draft, { published: nextPublishedState }), {
      successMessage: nextPublishedState ? `Published "${draft.title}".` : `Moved "${draft.title}" back to draft.`,
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

  const moveDraftToCategory = async () => {
    if (!draft) {
      return;
    }

    const otherCategories = categories.filter((category) => category.slug !== draft.category);
    if (otherCategories.length === 0) {
      setStatus('Create another category before moving this note.');
      return;
    }

    const targetInput = window
      .prompt(
        `Move "${draft.title}" to which category?\n\n${otherCategories
          .map((category) => `${category.label} (${category.slug})`)
          .join('\n')}`,
        otherCategories[0]?.label ?? '',
      )
      ?.trim();

    if (!targetInput) {
      setStatus('Move cancelled.');
      return;
    }

    const targetCategory = resolveCategoryInput(targetInput, otherCategories);
    if (!targetCategory) {
      setStatus('Choose a valid target category.');
      return;
    }

    await persistDraft(patchDraft(draft, { category: targetCategory.slug }), {
      successMessage: `Moved "${draft.title}" to "${targetCategory.label}".`,
      historyLabel: 'Moved note',
      historyDetail: `${draft.title} -> ${targetCategory.label}`,
    });
  };

  const copyDraftToCurrentCategory = async () => {
    if (!draft) {
      return;
    }

    const targetCategory =
      categories.find((category) => category.slug === (selectedCategorySlug ?? draft.category)) ??
      categories.find((category) => category.slug === draft.category) ??
      null;

    if (!targetCategory) {
      setStatus('Select a target category before copying this note.');
      return;
    }

    const baseTitle = draft.title.trim() || 'Untitled note';
    const duplicatedTitle = baseTitle.endsWith(' Copy') ? `${baseTitle} 2` : `${baseTitle} Copy`;
    const duplicatedSlug = createUniqueDraftSlug(`${draft.slug || baseTitle}-copy`);
    const duplicatedDraft = patchDraft(draft, {
      title: duplicatedTitle,
      slug: duplicatedSlug,
      category: targetCategory.slug,
      relativePath: null,
      sourceRelativePath: null,
      published: false,
      date: draft.date || getTimestampValue().slice(0, 10),
    });

    const duplicatedProject =
      draft.type === 'inknote'
        ? JSON.parse(
            JSON.stringify(linkedNotebook ?? createLinkedNotebookProject(draft, linkedNotebookRef.current)),
          ) as ProjectData
        : null;

    await persistDraft(duplicatedDraft, {
      linkedProject: duplicatedProject,
      successMessage: `Copied "${baseTitle}" to "${targetCategory.label}".`,
      historyLabel: 'Copied note',
      historyDetail: `${baseTitle} -> ${duplicatedTitle}`,
      resetUndoStack: true,
    });
  };

  const deleteDraft = async () => {
    if (!draft) {
      return;
    }

    if (!draft.sourceRelativePath) {
      const shouldDiscard = window.confirm(`Discard the unsaved draft "${draft.title}"?`);
      if (!shouldDiscard) {
        setStatus('Deletion cancelled.');
        return;
      }

      activateDraft(null);
      clearLinkedNotebookState();
      setStatus('Discarded the unsaved draft.');
      return;
    }

    if (!isTauri()) {
      setStatus('Deleting notes requires the Tauri desktop app.');
      return;
    }

    const shouldDelete = window.confirm(`Delete "${draft.title}"? This action cannot be undone.`);
    if (!shouldDelete) {
      setStatus('Deletion cancelled.');
      return;
    }

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
        activateDraft(createDraftFromItem(nextItem));
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

  const updateDraft = (patch: Partial<ContentDraft>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextDraft = patchDraft(current, patch);
      if (serializeContentDraft(nextDraft) === serializeContentDraft(current)) {
        return current;
      }

      pushDraftUndoEntry(current);
      return nextDraft;
    });

    if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
      setSelectedCategorySlug(typeof patch.category === 'string' && patch.category.trim() ? patch.category : null);
    }
  };

  const setDraftTags = (nextTags: string[]) => {
    updateDraft({ tagsText: nextTags.join(', ') });
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

    if (workspacePanel !== 'write') {
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

    const result = transform(draft.body, editor.selectionStart, editor.selectionEnd);
    updateDraft({ body: result.nextValue });

    requestAnimationFrame(() => {
      if (!editorRef.current) {
        return;
      }

      editorRef.current.focus();
      editorRef.current.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd);
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
    return items.filter((item) => {
      if (!selectedCategorySlug || getItemCategorySlug(item) !== selectedCategorySlug) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [item.frontmatter.title, item.frontmatter.slug, item.body]
        .join('\n')
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, searchQuery, selectedCategorySlug]);
  const canUndo = workspacePanel === 'write' && draftUndoStackRef.current.length > 0;
  const canRedo = workspacePanel === 'write' && draftRedoStackRef.current.length > 0;

  const saveStateText = draft
    ? draft.type === 'inknote' && notebookDirty && draftDirty
      ? 'Markdown and linked notebook both have unsaved changes.'
      : draft.type === 'inknote' && notebookDirty
        ? 'The linked notebook has unsaved changes.'
        : dirty
          ? 'The current note has unsaved changes.'
          : 'All changes are saved.'
    : 'Select a note to start editing.';

  const selectedItemIsVisible =
    draft?.sourceRelativePath && visibleItems.some((item) => item.relativePath === draft.sourceRelativePath);
  const selectedCategory =
    (selectedCategorySlug ? categories.find((category) => category.slug === selectedCategorySlug) : null) ?? null;
  const selectedCategoryCount =
    (selectedCategory ? categoryCounts.find((category) => category.slug === selectedCategory.slug)?.count : 0) ?? 0;
  const categoryMenuCategory =
    (categoryMenu ? categories.find((category) => category.slug === categoryMenu.slug) : null) ?? null;
  const categoryMenuStyle = categoryMenu
    ? {
        left: `${Math.max(12, Math.min(categoryMenu.x, window.innerWidth - 180))}px`,
        top: `${Math.max(12, Math.min(categoryMenu.y, window.innerHeight - 110))}px`,
      }
    : undefined;

  return (
    <div className="notes-app-shell">
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
              <strong>Chty's Blog</strong>
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
            className="notes-create-button active"
            onClick={openCreateNoteDialog}
            disabled={isBusy || categories.length === 0}
          >
            New Note
          </button>
        </div>

        <div className="notes-topbar-path">{draft ? `- ${draft.title}` : '- No note selected'}</div>

        <div className="notes-topbar-right">
          <button
            type="button"
            className={showPublishPanel ? 'notes-create-button active' : 'notes-create-button'}
            onClick={() =>
              setShowPublishPanel((current) => {
                const next = !current;
                if (next) {
                  void refreshPublishStatus();
                }
                return next;
              })
            }
            disabled={isBusy || isPublishingSite}
          >
            Publish Site
          </button>
        </div>
      </header>

      {showPublishPanel ? (
        <section className="notes-publish-panel" aria-label="GitHub Pages publishing">
          <div className="notes-publish-panel-head">
            <div>
              <strong>GitHub Pages Publish</strong>
              <span>
                {publishStatus
                  ? `Branch: ${publishStatus.branch || 'unknown'}`
                  : 'Commit and push content changes to trigger the Pages workflow.'}
              </span>
            </div>
            <button
              type="button"
              className="notes-create-button"
              onClick={() => void refreshPublishStatus()}
              disabled={isPublishingSite}
            >
              Refresh
            </button>
          </div>

          <div className="notes-publish-row">
            <input
              type="text"
              value={publishMessage}
              onChange={(event) => setPublishMessage(event.target.value)}
              placeholder="Commit message"
            />
            <button
              type="button"
              className="notes-create-button active"
              onClick={() => void publishSiteChanges()}
              disabled={isPublishingSite}
            >
              Commit & Push
            </button>
          </div>

          <pre className="notes-publish-status">
            {publishStatus
              ? publishStatus.clean
                ? 'No content changes detected.'
                : publishStatus.shortStatus
              : 'Refresh to inspect content changes.'}
          </pre>
        </section>
      ) : null}

      <main className="notes-shell">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-header">
            <div className="notes-sidebar-title">
              <span className="notes-sidebar-title-icon" aria-hidden="true">
                <ToolbarSvg>
                  <path d="M3.2 2.7h8.4a1.2 1.2 0 0 1 1.2 1.2v8.1H4.4a1.2 1.2 0 0 0-1.2 1.2V2.7Z" fill="#ffffff" stroke="none" />
                  <path d="M3.2 2.7h1.45v10.5H4.4a1.2 1.2 0 0 1-1.2-1.2V2.7Z" fill="#f2a94a" stroke="none" />
                  <path d="M4.4 12h8.4v1.2H4.4A1.2 1.2 0 0 1 3.2 12" stroke="#ffffff" />
                  <path d="M3.2 2.7h8.4a1.2 1.2 0 0 1 1.2 1.2v8.1H4.4a1.2 1.2 0 0 0-1.2 1.2V2.7Z" stroke="#ffffff" />
                  <path d="M5.55 5.2h5.15" stroke="#5b7795" />
                  <path d="M5.55 7.15h4.7" stroke="#5b7795" />
                </ToolbarSvg>
              </span>
              <strong>{'\u7b14\u8bb0\u672c'}</strong>
            </div>
            <button
              type="button"
              className="notes-sidebar-add"
              onClick={createCategory}
              disabled={isBusy}
              title={'\u65b0\u5efa\u7c7b\u76ee'}
              aria-label={'\u65b0\u5efa\u7c7b\u76ee'}
            >
              +
            </button>
          </div>

          <nav className="notes-sidebar-nav" aria-label="Note categories">
            {categoryCounts.length > 0 ? (
              categoryCounts.map((category) => (
                <button
                  key={category.slug}
                  type="button"
                  className={selectedCategorySlug === category.slug ? 'notes-sidebar-item active' : 'notes-sidebar-item'}
                  onClick={() => setSelectedCategorySlug(category.slug)}
                  onContextMenu={(event) => openCategoryContextMenu(event, category)}
                  title="Right-click for category actions"
                >
                  <span className="notes-sidebar-item-label">{category.label}</span>
                  <strong className="notes-sidebar-item-count">{category.count}</strong>
                </button>
              ))
            ) : (
              <div className="notes-sidebar-empty">
                <p>{'\u5148\u65b0\u5efa\u4e00\u4e2a\u7c7b\u76ee\uff0c\u518d\u5f00\u59cb\u6574\u7406\u5185\u5bb9\u3002'}</p>
              </div>
            )}
          </nav>

          <div className="notes-sidebar-footer">
            <button type="button" className="notes-sidebar-foot-item" onClick={onSwitchToNotebook}>
              <span className="notes-sidebar-foot-icon" aria-hidden="true">
                <ToolbarSvg>
                  <path d="M4 2.8h8v10.4l-4-2.2-4 2.2Z" />
                </ToolbarSvg>
              </span>
              <span className="notes-sidebar-foot-label">{'\u624b\u5199\u672c'}</span>
            </button>
            <div className="notes-sidebar-status">
              <span>{saveStateText}</span>
              <p>{status}</p>
            </div>
          </div>
        </aside>

        <section className="notes-list-pane">
          <div className="notes-list-header">
            <div className="notes-list-heading">
              <strong>{selectedCategory?.label ?? 'No category selected'}</strong>
              <span>
                {selectedCategory
                  ? `${visibleItems.length} / ${selectedCategoryCount} notes`
                  : `${visibleItems.length} notes`}
              </span>
            </div>
            <button type="button" className="notes-list-layout-button" aria-label="Toggle list layout">
              List
            </button>
          </div>

          <div className="notes-list-scroll">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const selected =
                  draft?.sourceRelativePath === item.relativePath ||
                  (!draft?.sourceRelativePath && draft?.relativePath === item.relativePath);

                return (
                  <button
                    key={item.relativePath}
                    type="button"
                    className={selected ? 'notes-list-item active' : 'notes-list-item'}
                    onClick={() => openItem(item)}
                  >
                    <span className="notes-list-item-title">{item.frontmatter.title}</span>
                    <span className="notes-list-item-subtitle">
                      {getNoteTypeLabel(item.frontmatter.type)} | {item.frontmatter.date}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="notes-empty-list">
                <p>
                  {selectedCategory
                    ? 'No notes match the current category or search filter.'
                    : 'Select or create a category first.'}
                </p>
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
                        onClick={() => toggleTag(tag)}
                        title={`Remove tag ${tag}`}
                      >
                        {tag}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="notes-tag-trigger"
                      onClick={() => setIsTagPickerOpen((current) => !current)}
                    >
                      {tagList.length > 0 ? 'Click to add tags' : 'Click to add tags'}
                    </button>
                  </div>

                  {isTagPickerOpen ? (
                    <div ref={tagPickerRef} className="notes-tag-picker">
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
                          placeholder="Search tags or create a new tag"
                        />
                        <button
                          type="button"
                          className="notes-tag-picker-add"
                          onClick={commitTagInput}
                          disabled={!normalizedTagInput}
                        >
                          Add
                        </button>
                      </div>

                      <div className="notes-tag-picker-list" role="listbox" aria-label="Available tags">
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
                                <span className="notes-tag-picker-option-state">{selected ? 'Selected' : 'Add'}</span>
                              </button>
                            );
                          })
                        ) : (
                          <p className="notes-tag-picker-empty">
                            Press Enter to create <strong>{normalizedTagInput || 'a new tag'}</strong>.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="notes-editor-actions">
                  <button
                    type="button"
                    className={workspacePanel === 'write' && showPreview ? 'notes-icon-button active' : 'notes-icon-button'}
                    onClick={() => {
                      if (workspacePanel !== 'write') {
                        setWorkspacePanel('write');
                        setShowPreview(true);
                        return;
                      }

                      setShowPreview((current) => !current);
                    }}
                    title="Preview"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button"
                    onClick={() => void saveDraft()}
                    disabled={isBusy}
                    title="Save"
                  >
                    Save
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
                    onClick={() => void deleteDraft()}
                    disabled={isBusy}
                    title="Delete"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button"
                    onClick={() => void moveDraftToCategory()}
                    disabled={isBusy}
                    title="Move"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="notes-icon-button"
                    onClick={() => void copyDraftToCurrentCategory()}
                    disabled={isBusy}
                    title="Copy"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className={showHistoryPanel ? 'notes-icon-button active' : 'notes-icon-button'}
                    onClick={() => setShowHistoryPanel((current) => !current)}
                    title="History"
                  >
                    History
                  </button>
                </div>
              </div>

              <div className="notes-editor-titlebar">
                <input
                  className="notes-title-input"
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  placeholder="Enter title"
                />
              </div>

              <div className="notes-editor-meta">
                <span>Created: {draft.date}</span>
                <span>Updated: {draft.updatedAt || draft.date}</span>
              </div>

              {showHistoryPanel ? (
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

              {workspacePanel === 'write' ? (
                <>
                  <div className="notes-editor-toolbar">
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyInlineWrap('**', '**', 'bold')}
                      title="Bold"
                      aria-label="Bold"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-bold">B</span>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyInlineWrap('*', '*', 'italic')}
                      title="Italic"
                      aria-label="Italic"
                    >
                      <span className="notes-toolbar-glyph notes-toolbar-glyph-italic">I</span>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => insertMarkdownSnippet('[link text](https://example.com)', 1, 21)}
                      title="Link"
                      aria-label="Insert link"
                    >
                      <ToolbarSvg>
                        <path d="M6.2 9.8 4.5 11.5a2.2 2.2 0 1 1-3.1-3.1l2.1-2.1a2.2 2.2 0 0 1 3.1 0" />
                        <path d="M9.8 6.2 11.5 4.5a2.2 2.2 0 1 1 3.1 3.1l-2.1 2.1a2.2 2.2 0 0 1-3.1 0" />
                        <path d="M5.8 10.2 10.2 5.8" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line) => `> ${line.replace(/^>\s*/, '')}`)}
                      title="Blockquote"
                      aria-label="Blockquote"
                    >
                      <ToolbarSvg>
                        <path
                          d="M2.4 4.3c1.3 0 2 0.9 2 2.2v1.6H2.7V12H1V8.2c0-2.2.8-3.9 2.8-3.9h.6Zm6 0c1.3 0 2 0.9 2 2.2v1.6h-1.7V12H7V8.2c0-2.2.8-3.9 2.8-3.9h.6Z"
                          fill="currentColor"
                          stroke="none"
                        />
                      </ToolbarSvg>
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
                      <ToolbarSvg>
                        <path d="M5.5 4 2.5 8l3 4" />
                        <path d="M10.5 4 13.5 8l-3 4" />
                        <path d="M8.8 3 7.2 13" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => insertMarkdownSnippet('![image alt](https://example.com/image.png)', 2, 20)}
                      title="Image"
                      aria-label="Image"
                    >
                      <ToolbarSvg>
                        <rect x="2" y="3" width="12" height="10" rx="1.5" />
                        <circle cx="5.2" cy="6.1" r="1.2" fill="currentColor" stroke="none" />
                        <path d="M3.6 11 7.1 7.7l2.1 2 1.7-1.5L14 11" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}`)}
                      title="Ordered list"
                      aria-label="Ordered list"
                    >
                      <ToolbarSvg viewBox="0 0 18 16">
                        <text x="0.9" y="5.3" fontSize="4.5" fontWeight="700" fill="currentColor" stroke="none">
                          1
                        </text>
                        <text x="0.9" y="10.1" fontSize="4.5" fontWeight="700" fill="currentColor" stroke="none">
                          2
                        </text>
                        <text x="0.9" y="14.7" fontSize="4.5" fontWeight="700" fill="currentColor" stroke="none">
                          3
                        </text>
                        <path d="M7 4h10M7 8h10M7 12h10" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line) => `- ${line.replace(/^[-*+]\s+/, '')}`)}
                      title="Bullet list"
                      aria-label="Bullet list"
                    >
                      <ToolbarSvg viewBox="0 0 18 16">
                        <circle cx="2.5" cy="4" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="2.5" cy="8" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="2.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
                        <path d="M6 4h10M6 8h10M6 12h10" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={() => applyLinePrefix((line) => `## ${line.replace(/^#{1,6}\s+/, '')}`)}
                      title="Heading"
                      aria-label="Heading"
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
                      <ToolbarSvg>
                        <circle cx="4" cy="8" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={undoDraftChange}
                      disabled={!canUndo}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <ToolbarSvg>
                        <path d="M6.2 4.5 2.8 8l3.4 3.5" />
                        <path d="M4 8h5.1a3.4 3.4 0 1 1 0 6.8h-1.2" />
                      </ToolbarSvg>
                    </button>
                    <button
                      type="button"
                      className="notes-toolbar-button"
                      onClick={redoDraftChange}
                      disabled={!canRedo}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <ToolbarSvg>
                        <path d="M9.8 4.5 13.2 8 9.8 11.5" />
                        <path d="M12 8H6.9a3.4 3.4 0 1 0 0 6.8h1.2" />
                      </ToolbarSvg>
                    </button>
                  </div>

                  <div className={showPreview ? 'notes-editor-workbench split' : 'notes-editor-workbench'}>
                    <div className="notes-source-pane">
                      <textarea
                        ref={editorRef}
                        className="notes-markdown-editor"
                        value={draft.body}
                        onChange={(event) => updateDraft({ body: event.target.value })}
                        onScroll={handleEditorScroll}
                        placeholder="Write Markdown content here..."
                        spellCheck={false}
                      />
                    </div>

                    {showPreview ? (
                      <div ref={previewPaneRef} className="notes-rendered-pane" onWheel={handlePreviewWheel}>
                        <article ref={previewArticleRef} className="notes-rendered-article">
                          {renderedPreview}
                        </article>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="notes-inknote-workspace">
                  <InkNoteProjectEditorPanel
                    project={linkedNotebook}
                    projectPath={linkedNotebookPath}
                    status={linkedNotebookStatus}
                    isLoading={isLinkedNotebookLoading}
                    onChange={handleLinkedNotebookChange}
                  />
                  <InkNoteProjectPreviewPanel
                    project={linkedNotebook}
                    projectPath={linkedNotebookPath}
                    status={linkedNotebookStatus}
                  />
                </div>
              )}

              <div className="notes-editor-statusbar">
                <span>{validationError ?? status}</span>
                <span>
                  {duplicateItem
                    ? 'Another note is already using this save path.'
                    : saveTarget
                      ? `content/${saveTarget}`
                      : saveStateText}
                </span>
                <span>{selectedItemIsVisible ? saveStateText : 'The current filter hides the open note.'}</span>
              </div>
            </>
          ) : (
            <div className="notes-empty-state">
              <h2>No note selected yet</h2>
              <p>Open a note from the list, or create a new note from the top bar.</p>
            </div>
          )}
        </section>
      </main>

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
              <h2 id="notes-create-dialog-title">Create New Note</h2>
              <button
                type="button"
                className="notes-create-dialog-close"
                onClick={() => setIsCreateDialogOpen(false)}
                aria-label="Close create note dialog"
              >
                ×
              </button>
            </div>

            <div className="notes-create-dialog-body">
              <label className="notes-create-dialog-field">
                <span>Title</span>
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
                  placeholder="Enter note title"
                />
              </label>

              <label className="notes-create-dialog-field">
                <span>Category</span>
                <select value={createCategoryValue} onChange={(event) => setCreateCategoryValue(event.target.value)}>
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="notes-create-dialog-field">
                <span>Type</span>
                <select
                  value={createTypeValue}
                  onChange={(event) => setCreateTypeValue(event.target.value as ContentDraft['type'])}
                >
                  <option value="markdown">Markdown</option>
                  <option value="inknote">InkNote</option>
                </select>
              </label>
            </div>

            <div className="notes-create-dialog-actions">
              <button type="button" className="notes-create-dialog-cancel" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="notes-create-dialog-submit"
                onClick={confirmCreateNote}
                disabled={!createTitleValue.trim() || !createCategoryValue}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryMenu && categoryMenuCategory ? (
        <div ref={categoryMenuRef} className="notes-context-menu" style={categoryMenuStyle} role="menu">
          <button
            type="button"
            className="notes-context-menu-item"
            onClick={() => {
              setCategoryMenu(null);
              void renameSelectedCategory(categoryMenuCategory);
            }}
          >
            <span className="notes-context-menu-icon" aria-hidden="true">
              <ToolbarSvg>
                <path d="M3 11.8 2.4 14l2.2-.6L12.9 5.1 10.9 3 3 11.8Z" />
                <path d="m9.9 4 2.1 2.1" />
              </ToolbarSvg>
            </span>
            <span>重命名</span>
          </button>
          <button
            type="button"
            className="notes-context-menu-item danger"
            onClick={() => {
              setCategoryMenu(null);
              void deleteSelectedCategory(categoryMenuCategory);
            }}
          >
            <span className="notes-context-menu-icon" aria-hidden="true">
              <ToolbarSvg>
                <path d="M5.1 3.2h5.8" />
                <path d="M6.2 3.2v-1h3.6v1" />
                <path d="M4.2 5h7.6l-.5 8H4.7l-.5-8Z" />
                <path d="M6.6 6.6v4.6" />
                <path d="M9.4 6.6v4.6" />
              </ToolbarSvg>
            </span>
            <span>删除</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
