export type PaperStyle = 'ruled' | 'grid' | 'dots' | 'school';
export type HandwritingStyle = 'classroom' | 'journal' | 'casual' | 'classical';
export type LineLayoutMode = 'left' | 'center' | 'right' | 'centerLongest';

export interface LineLayoutRule {
  startLine: number;
  endLine: number;
  mode: LineLayoutMode;
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
  | { type: 'paragraph'; text: string }
  | { type: 'verse'; lines: string[] }
  | { type: 'lineGroup'; lines: string[]; mode: LineLayoutMode }
  | { type: 'list'; ordered: boolean; items: string[] };

export interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
      const mode: LineLayoutMode =
        candidate.mode === 'center' || candidate.mode === 'right' || candidate.mode === 'centerLongest'
          ? candidate.mode
          : 'left';

      if (startLine === 0 || endLine === 0) {
        return [];
      }

      return [
        {
          startLine: Math.min(startLine, endLine),
          endLine: Math.max(startLine, endLine),
          mode,
        },
      ];
    })
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
}

export const AUTOSAVE_KEY = 'inknote.autosave.v1';

export const PAPER_OPTIONS: Option<PaperStyle>[] = [
  { value: 'ruled', label: '横线纸', description: '适合课堂笔记，带红色边距线与浅蓝横线。' },
  { value: 'grid', label: '方格纸', description: '适合整理结构化内容，便于控制版面。' },
  { value: 'dots', label: '点阵纸', description: '更轻盈的草稿感，适合随笔和摘录。' },
  {
    value: 'school',
    label: '\u6821\u56ed\u6458\u6284\u672c',
    description: '\u53c2\u7167\u56fe\u4e2d\u90a3\u79cd\u6de1\u84dd\u6a2a\u7ebf\u3001\u9875\u7709\u680f\u548c\u7a84\u4e66\u5199\u533a\u7684\u8001\u5f0f\u7b14\u8bb0\u672c\u3002',
  },
];

export const HANDWRITING_OPTIONS: Option<HandwritingStyle>[] = [
  {
    value: 'classical',
    label: '\u53e4\u96c5\u6458\u6284',
    description: '\u58a8\u8272\u66f4\u6c89\uff0c\u5b57\u8ff9\u66f4\u6536\uff0c\u9002\u5408\u53e4\u8bd7\u548c\u53e4\u6587\u6458\u5f55\u3002',
  },
  { value: 'classroom', label: '工整课堂', description: '偏规整、偏克制，像认真整理过的课堂笔记。' },
  { value: 'journal', label: '清爽摘录', description: '正文舒展、字距均匀，适合长段落阅读摘录。' },
  { value: 'casual', label: '随笔手札', description: '更松弛的行气和笔画起伏，像日常手写札记。' },
];

export const SAMPLE_CONTENT = `# 春日课程笔记

今天整理了一份新的复习计划，希望把阅读、练字和项目推进都放进同一本“手写笔记”里。文字不必完全工整，但要像真正写在纸上一样有呼吸感。

- 上午先完成需求拆解，确认 MVP 的边界
- 中午补充两段正文，观察自动换行是否自然
- 晚上导出一份 PDF，检查打印效果

1. 标题需要比正文更松弛一点，居中摆放。
2. 正文首行缩进两个字距，段落之间留出空白。
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

export function parseTextBlocks(content: string, lineLayoutRules: LineLayoutRule[] = []): TextBlock[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: TextBlock[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let lineGroupBuffer: { mode: LineLayoutMode; lines: string[] } | null = null;
  const normalizedLineLayoutRules = sanitizeLineLayoutRules(lineLayoutRules);

  const getLineLayoutMode = (lineNumber: number): LineLayoutMode | null => {
    let matched: LineLayoutMode | null = null;
    for (const rule of normalizedLineLayoutRules) {
      if (rule.startLine > lineNumber) {
        break;
      }

      if (rule.endLine >= lineNumber) {
        matched = rule.mode;
      }
    }

    return matched;
  };

  const normalizeSpecialLayoutLine = (line: string): string => {
    const trimmed = line.trim();
    const subtitleMatch = trimmed.match(/^##\s+(.+)$/);
    if (subtitleMatch) {
      return subtitleMatch[1].trim();
    }

    const titleMatch = trimmed.match(/^#\s+(.+)$/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      return orderedMatch[1].trim();
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      return unorderedMatch[1].trim();
    }

    return trimmed;
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const normalized = paragraphBuffer.map((line) => line.trim()).filter(Boolean);
    const merged = normalized.join('');

    if (
      normalized.length >= 2 &&
      normalized.every((line) => Array.from(line).length <= 18)
    ) {
      blocks.push({ type: 'verse', lines: normalized });
      paragraphBuffer = [];
      return;
    }

    if (merged) blocks.push({ type: 'paragraph', text: merged });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    blocks.push({ type: 'list', ordered: listBuffer.ordered, items: listBuffer.items });
    listBuffer = null;
  };

  const flushLineGroup = () => {
    if (!lineGroupBuffer || lineGroupBuffer.lines.length === 0) {
      lineGroupBuffer = null;
      return;
    }

    blocks.push({ type: 'lineGroup', lines: [...lineGroupBuffer.lines], mode: lineGroupBuffer.mode });
    lineGroupBuffer = null;
  };

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    const subtitleMatch = line.match(/^##\s+(.+)$/);
    const titleMatch = line.match(/^#\s+(.+)$/);
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const lineLayoutMode = getLineLayoutMode(lineNumber);

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      flushLineGroup();
      continue;
    }

    if (lineLayoutMode) {
      flushParagraph();
      flushList();
      if (!lineGroupBuffer || lineGroupBuffer.mode !== lineLayoutMode) {
        flushLineGroup();
        lineGroupBuffer = { mode: lineLayoutMode, lines: [] };
      }
      lineGroupBuffer.lines.push(normalizeSpecialLayoutLine(line));
      continue;
    }

    flushLineGroup();

    if (titleMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'title', text: titleMatch[1].trim() });
      continue;
    }

    if (subtitleMatch) {
      flushParagraph();
      flushList();
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock?.type === 'title') {
        lastBlock.subtitle = subtitleMatch[1].trim();
      } else {
        blocks.push({ type: 'paragraph', text: subtitleMatch[1].trim() });
      }
      continue;
    }

    if (orderedMatch) {
      flushParagraph();
      const item = orderedMatch[2].trim();
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(item);
      continue;
    }

    if (unorderedMatch) {
      flushParagraph();
      const item = unorderedMatch[1].trim();
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(item);
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  flushLineGroup();

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: '' }];
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

  const paperStyle = PAPER_OPTIONS.find((option) => option.value === parsed.paperStyle)?.value ?? 'ruled';
  const handwritingStyle =
    HANDWRITING_OPTIONS.find((option) => option.value === parsed.handwritingStyle)?.value ?? 'classroom';
  const lineLayoutRules = sanitizeLineLayoutRules(parsed.lineLayoutRules);

  return {
    version: 1,
    content: parsed.content,
    paperStyle,
    handwritingStyle,
    lineLayoutRules,
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
    if (!line) continue;
    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) return titleMatch[1].trim().slice(0, 28);
    return line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').slice(0, 28);
  }
  return '未命名笔记';
}

export function loadAutosavedProject(): ProjectData {
  if (typeof window === 'undefined') return createDefaultProject();
  try {
    const saved = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return createDefaultProject();
    return deserializeProject(saved);
  } catch {
    return createDefaultProject();
  }
}

export function saveAutosavedProject(project: ProjectData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
}
