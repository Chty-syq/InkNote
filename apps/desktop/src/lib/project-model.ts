export type PaperStyle = 'ruled' | 'grid' | 'dots' | 'school';
export type HandwritingStyle = 'classroom' | 'journal' | 'casual' | 'classical';
export type LineLayoutMode = 'left' | 'center' | 'right' | 'centerLongest';

export interface LineLayoutRule {
  startLine: number;
  endLine: number;
  mode: LineLayoutMode;
}

export interface ParagraphRange {
  startLine: number;
  endLine: number;
  kind: 'paragraph' | 'verse' | 'list';
}

export interface ProjectData {
  version: 1;
  content: string;
  paperStyle: PaperStyle;
  handwritingStyle: HandwritingStyle;
  lineLayoutRules: LineLayoutRule[];
  paragraphIndent: number;
  linesPerPage: number;
  fontSize: number;
  charSpacing: number;
  seed: number;
  updatedAt: string;
}

export type TextBlock =
  | { type: 'title'; text: string; subtitle?: string }
  | { type: 'paragraph'; text: string; align: LineLayoutMode }
  | { type: 'verse'; lines: string[]; align: LineLayoutMode }
  | { type: 'list'; ordered: boolean; items: string[]; align: LineLayoutMode };

export interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

interface ParagraphBuffer {
  startLine: number;
  lines: string[];
}

interface ListBuffer {
  startLine: number;
  ordered: boolean;
  items: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLineLayoutMode(value: unknown): LineLayoutMode {
  return value === 'center' || value === 'right' || value === 'centerLongest' ? value : 'left';
}

function sanitizeLineLayoutRules(input: unknown): LineLayoutRule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const candidate = entry as Partial<LineLayoutRule>;
      const startLine = typeof candidate.startLine === 'number' ? Math.max(1, Math.round(candidate.startLine)) : 0;
      const endLine = typeof candidate.endLine === 'number' ? Math.max(1, Math.round(candidate.endLine)) : 0;

      if (startLine === 0 || endLine === 0) {
        return [];
      }

      return [
        {
          startLine: Math.min(startLine, endLine),
          endLine: Math.max(startLine, endLine),
          mode: normalizeLineLayoutMode(candidate.mode),
        },
      ];
    })
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
}

function getLayoutModeForRange(
  startLine: number,
  endLine: number,
  rules: LineLayoutRule[],
): LineLayoutMode | null {
  let matched: LineLayoutMode | null = null;

  for (const rule of rules) {
    if (rule.endLine < startLine) {
      continue;
    }

    if (rule.startLine > endLine) {
      break;
    }

    matched = rule.mode;
  }

  return matched;
}

function createParagraphBuffer(startLine: number): ParagraphBuffer {
  return { startLine, lines: [] };
}

function createListBuffer(startLine: number, ordered: boolean): ListBuffer {
  return { startLine, ordered, items: [] };
}

function normalizeParagraphLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function isVerseParagraph(lines: string[]): boolean {
  return lines.length >= 2 && lines.every((line) => Array.from(line).length <= 18);
}

export const AUTOSAVE_KEY = 'inknote.autosave.v1';

export const PAPER_OPTIONS: Option<PaperStyle>[] = [
  { value: 'ruled', label: '横线纸', description: '适合课堂笔记，带红色边距线与浅蓝横线。' },
  { value: 'grid', label: '方格纸', description: '适合整理结构化内容，便于控制版面。' },
  { value: 'dots', label: '点阵纸', description: '更轻盈的草稿感，适合随笔和摘录。' },
  {
    value: 'school',
    label: '校园摘抄本',
    description: '参考老式摘抄本的淡蓝横线、页眉栏和较窄书写区。',
  },
];

export const HANDWRITING_OPTIONS: Option<HandwritingStyle>[] = [
  {
    value: 'classical',
    label: '古雅摘抄',
    description: '墨色更沉，字迹更收，适合古诗和古文摘录。',
  },
  { value: 'classroom', label: '工整课堂', description: '偏规整、偏克制，像认真整理过的课堂笔记。' },
  { value: 'journal', label: '清爽摘录', description: '正文舒展、字距均匀，适合长段落阅读摘录。' },
  { value: 'casual', label: '随笔手札', description: '更松弛的行气和笔画起伏，像日常手写本记。' },
];

export const SAMPLE_CONTENT = `# 春日课程笔记

今天整理了一份新的复习计划，希望把阅读、练字和项目推进都放进同一本“手写笔记”里。文字不必完全工整，但要像真正写在纸上一样有呼吸感。

- 上午先完成需求拆解，确认 MVP 的边界
- 中午补充两段正文，观察自动换行是否自然
- 晚上导出一份 PDF，检查打印效果

1. 标题需要比正文更松弛一点，居中摆放。
2. 正文首行缩进两个字距，段落之间保持清爽。
3. 列表项目要能在不同纸张上保持清晰。

下一步会继续补充更多中文段落，测试长文分页、不同纸张模板以及随机笔迹种子的稳定性。`;

export function createDefaultProject(): ProjectData {
  return {
    version: 1,
    content: SAMPLE_CONTENT,
    paperStyle: 'ruled',
    handwritingStyle: 'classroom',
    lineLayoutRules: [],
    paragraphIndent: 2,
    linesPerPage: 20,
    fontSize: 40,
    charSpacing: 6,
    seed: 3842,
    updatedAt: new Date().toISOString(),
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export function getSelectableParagraphRanges(content: string): ParagraphRange[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const ranges: ParagraphRange[] = [];
  let paragraphBuffer: ParagraphBuffer | null = null;
  let listBuffer: ListBuffer | null = null;

  const flushParagraph = (endLine: number) => {
    if (!paragraphBuffer) {
      return;
    }

    const normalized = normalizeParagraphLines(paragraphBuffer.lines);
    if (normalized.length > 0) {
      ranges.push({
        startLine: paragraphBuffer.startLine,
        endLine,
        kind: isVerseParagraph(normalized) ? 'verse' : 'paragraph',
      });
    }

    paragraphBuffer = null;
  };

  const flushList = (endLine: number) => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }

    ranges.push({
      startLine: listBuffer.startLine,
      endLine,
      kind: 'list',
    });
    listBuffer = null;
  };

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const isTitle = /^#{1,2}\s+/.test(trimmed);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);

    if (!trimmed) {
      flushParagraph(lineNumber - 1);
      flushList(lineNumber - 1);
      continue;
    }

    if (isTitle) {
      flushParagraph(lineNumber - 1);
      flushList(lineNumber - 1);
      continue;
    }

    if (orderedMatch || unorderedMatch) {
      flushParagraph(lineNumber - 1);
      const ordered = Boolean(orderedMatch);
      const item = (orderedMatch?.[1] ?? unorderedMatch?.[1] ?? '').trim();

      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList(lineNumber - 1);
        listBuffer = createListBuffer(lineNumber, ordered);
      }

      if (item) {
        listBuffer.items.push(item);
      }
      continue;
    }

    flushList(lineNumber - 1);
    if (!paragraphBuffer) {
      paragraphBuffer = createParagraphBuffer(lineNumber);
    }
    paragraphBuffer.lines.push(line);
  }

  flushParagraph(lines.length);
  flushList(lines.length);
  return ranges;
}

export function parseTextBlocks(content: string, lineLayoutRules: LineLayoutRule[] = []): TextBlock[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: TextBlock[] = [];
  const normalizedRules = sanitizeLineLayoutRules(lineLayoutRules);
  let paragraphBuffer: ParagraphBuffer | null = null;
  let listBuffer: ListBuffer | null = null;

  const flushParagraph = (endLine: number) => {
    if (!paragraphBuffer) {
      return;
    }

    const normalized = normalizeParagraphLines(paragraphBuffer.lines);
    if (normalized.length === 0) {
      paragraphBuffer = null;
      return;
    }

    const align = getLayoutModeForRange(paragraphBuffer.startLine, endLine, normalizedRules) ?? 'left';
    if (isVerseParagraph(normalized)) {
      blocks.push({ type: 'verse', lines: normalized, align });
    } else {
      blocks.push({ type: 'paragraph', text: normalized.join(''), align });
    }

    paragraphBuffer = null;
  };

  const flushList = (endLine: number) => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }

    const align = getLayoutModeForRange(listBuffer.startLine, endLine, normalizedRules) ?? 'left';
    blocks.push({ type: 'list', ordered: listBuffer.ordered, items: listBuffer.items, align });
    listBuffer = null;
  };

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const subtitleMatch = trimmed.match(/^##\s+(.+)$/);
    const titleMatch = trimmed.match(/^#\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);

    if (!trimmed) {
      flushParagraph(lineNumber - 1);
      flushList(lineNumber - 1);
      continue;
    }

    if (subtitleMatch) {
      flushParagraph(lineNumber - 1);
      flushList(lineNumber - 1);
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock?.type === 'title') {
        lastBlock.subtitle = subtitleMatch[1].trim();
      } else {
        blocks.push({ type: 'paragraph', text: subtitleMatch[1].trim(), align: 'left' });
      }
      continue;
    }

    if (titleMatch) {
      flushParagraph(lineNumber - 1);
      flushList(lineNumber - 1);
      blocks.push({ type: 'title', text: titleMatch[1].trim() });
      continue;
    }

    if (orderedMatch || unorderedMatch) {
      flushParagraph(lineNumber - 1);
      const ordered = Boolean(orderedMatch);
      const item = (orderedMatch?.[1] ?? unorderedMatch?.[1] ?? '').trim();

      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList(lineNumber - 1);
        listBuffer = createListBuffer(lineNumber, ordered);
      }

      if (item) {
        listBuffer.items.push(item);
      }
      continue;
    }

    flushList(lineNumber - 1);
    if (!paragraphBuffer) {
      paragraphBuffer = createParagraphBuffer(lineNumber);
    }
    paragraphBuffer.lines.push(line);
  }

  flushParagraph(lines.length);
  flushList(lines.length);
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: '', align: 'left' }];
}

export function serializeProject(project: ProjectData): string {
  return JSON.stringify({ ...project, version: 1, updatedAt: new Date().toISOString() }, null, 2);
}

export function deserializeProject(payload: string): ProjectData {
  const parsed = JSON.parse(payload) as Partial<ProjectData>;
  const defaults = createDefaultProject();

  if (typeof parsed.content !== 'string') {
    throw new Error('项目文件缺少有效的文本内容。');
  }

  const paperStyle = PAPER_OPTIONS.find((option) => option.value === parsed.paperStyle)?.value ?? defaults.paperStyle;
  const handwritingStyle =
    HANDWRITING_OPTIONS.find((option) => option.value === parsed.handwritingStyle)?.value ??
    defaults.handwritingStyle;

  return {
    version: 1,
    content: parsed.content,
    paperStyle,
    handwritingStyle,
    lineLayoutRules: sanitizeLineLayoutRules(parsed.lineLayoutRules),
    paragraphIndent:
      typeof parsed.paragraphIndent === 'number' ? clamp(parsed.paragraphIndent, 0, 6) : defaults.paragraphIndent,
    linesPerPage:
      typeof parsed.linesPerPage === 'number' ? clamp(Math.round(parsed.linesPerPage), 10, 30) : defaults.linesPerPage,
    fontSize: typeof parsed.fontSize === 'number' ? clamp(parsed.fontSize, 24, 56) : defaults.fontSize,
    charSpacing: typeof parsed.charSpacing === 'number' ? clamp(parsed.charSpacing, 0, 16) : defaults.charSpacing,
    seed: typeof parsed.seed === 'number' ? parsed.seed : randomSeed(),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function getProjectTitle(content: string): string {
  const lines = content.replace(/\r/g, '').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) {
      return titleMatch[1].trim().slice(0, 28);
    }

    return line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').slice(0, 28);
  }

  return '未命名笔记';
}

export function loadAutosavedProject(): ProjectData {
  if (typeof window === 'undefined') {
    return createDefaultProject();
  }

  try {
    const saved = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) {
      return createDefaultProject();
    }

    return deserializeProject(saved);
  } catch {
    return createDefaultProject();
  }
}

export function saveAutosavedProject(project: ProjectData): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
}
