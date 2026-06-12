import {
  type HandwritingStyle,
  type LineLayoutMode,
  type PaperStyle,
  type ProjectData,
  parseTextBlocks,
} from './project-model';

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_PADDING = {
  top: 168,
  right: 128,
  bottom: 150,
  left: 136,
};

type LayoutAlign = 'left' | 'center' | 'right' | 'centerLongest';
type LineRole = 'title' | 'paragraph' | 'list';

interface WrappedLine {
  text: string;
  indent: number;
  charSpacing?: number;
}

interface LayoutLine {
  serial: number;
  role: LineRole;
  text: string;
  y: number;
  indent: number;
  align: LayoutAlign;
  fontWeight: number;
  textBaseline: CanvasTextBaseline;
  jitterIntensity: number;
  fontSize: number;
  charSpacing: number;
  lineHeight: number;
  groupWidth?: number;
  manualX?: number;
  prefix?: string;
  prefixOffset?: number;
}

interface LayoutPage {
  lines: LayoutLine[];
}

interface HandwritingPreset {
  label: string;
  fontFamily: string;
  inkColor: string;
  titleColor: string;
  fontSize: number;
  titleSize: number;
  lineHeight: number;
  titleLineHeight: number;
  charSpacing: number;
  blockGap: number;
  baselineJitter: number;
  rotationJitter: number;
  spacingJitter: number;
  sizeJitter: number;
  lineDrift: number;
  shadowBlur: number;
  shadowColor: string;
}

interface PaperMetrics {
  rowPitch: number;
  textStartY: number;
  textEndY: number;
  guideStartY: number;
  guideEndY: number;
  contentLeft: number;
  contentRight: number;
  bodyTextBaseline: CanvasTextBaseline;
}

interface InkMetrics {
  ascent: number;
  descent: number;
}

const NO_LINE_START_PUNCTUATION = new Set(
  Array.from('，。！？；：、）》」』】〕〉〗〙〛’”％!?;:,.%)]}'),
);

const TITLE_TUNING = {
  default: {
    titleJitterIntensity: 0.24,
    titleJitterIntensityClassical: 0.12,
    subtitleJitterIntensity: 0.12,
    subtitleJitterIntensityClassical: 0.06,
  },
  // Adjust these values directly if you want to fine-tune title/subtitle jitter only.
  school: {
    titleJitterIntensity: 0.24,
    titleJitterIntensityClassical: 0.12,
    subtitleJitterIntensity: 0.12,
    subtitleJitterIntensityClassical: 0.06,
  },
} as const;

const PRESETS: Record<HandwritingStyle, HandwritingPreset> = {
  classroom: {
    label: '工整课堂',
    fontFamily: '"KaiTi", "STKaiti", "Kaiti SC", "DFKai-SB", serif',
    inkColor: '#263b65',
    titleColor: '#1f2f53',
    fontSize: 40,
    titleSize: 58,
    lineHeight: 72,
    titleLineHeight: 88,
    charSpacing: 6,
    blockGap: 24,
    baselineJitter: 2.2,
    rotationJitter: 0.8,
    spacingJitter: 1.1,
    sizeJitter: 0.6,
    lineDrift: 1.5,
    shadowBlur: 0.3,
    shadowColor: 'rgba(29, 47, 85, 0.16)',
  },
  journal: {
    label: '清爽摘录',
    fontFamily: '"FangSong", "STFangsong", "KaiTi", serif',
    inkColor: '#3f392f',
    titleColor: '#342f28',
    fontSize: 39,
    titleSize: 56,
    lineHeight: 76,
    titleLineHeight: 90,
    charSpacing: 7,
    blockGap: 28,
    baselineJitter: 2.9,
    rotationJitter: 1.1,
    spacingJitter: 1.8,
    sizeJitter: 0.9,
    lineDrift: 2.2,
    shadowBlur: 0.5,
    shadowColor: 'rgba(58, 46, 32, 0.14)',
  },
  casual: {
    label: '随笔手札',
    fontFamily: '"STXingkai", "KaiTi", "STKaiti", serif',
    inkColor: '#5a3324',
    titleColor: '#512c1f',
    fontSize: 42,
    titleSize: 60,
    lineHeight: 78,
    titleLineHeight: 94,
    charSpacing: 8,
    blockGap: 28,
    baselineJitter: 3.6,
    rotationJitter: 1.8,
    spacingJitter: 2.2,
    sizeJitter: 1.3,
    lineDrift: 3.1,
    shadowBlur: 0.7,
    shadowColor: 'rgba(83, 44, 26, 0.12)',
  },
  classical: {
    label: '\u53e4\u98ce\u6458\u5f55',
    fontFamily: '"STKaiti", "KaiTi", "Kaiti SC", "Songti SC", serif',
    inkColor: '#3d2b22',
    titleColor: '#2f231d',
    fontSize: 36,
    titleSize: 42,
    lineHeight: 70,
    titleLineHeight: 86,
    charSpacing: 4,
    blockGap: 18,
    baselineJitter: 1.05,
    rotationJitter: 0.28,
    spacingJitter: 0.45,
    sizeJitter: 0.35,
    lineDrift: 0.45,
    shadowBlur: 0.12,
    shadowColor: 'rgba(61, 43, 34, 0.08)',
  },
};

function getPaperMetrics(project: ProjectData): PaperMetrics {
  const { paperStyle, linesPerPage } = project;
  const textStartY = paperStyle === 'school' ? PAGE_PADDING.top + 64 : PAGE_PADDING.top + 18;
  const textEndY = paperStyle === 'school' ? PAGE_HEIGHT - PAGE_PADDING.bottom - 26 : PAGE_HEIGHT - PAGE_PADDING.bottom - 18;
  const safeLineCount = Math.max(10, Math.min(30, linesPerPage));
  const rowPitch = (textEndY - textStartY) / Math.max(1, safeLineCount - 1);

  if (paperStyle === 'school') {
    return {
      rowPitch,
      textStartY,
      textEndY,
      guideStartY: textStartY + 6,
      guideEndY: textEndY + 6,
      contentLeft: PAGE_PADDING.left - 20,
      contentRight: PAGE_WIDTH - PAGE_PADDING.right + 20,
      bodyTextBaseline: 'alphabetic',
    };
  }

  if (paperStyle === 'ruled') {
    return {
      rowPitch,
      textStartY,
      textEndY,
      guideStartY: textStartY,
      guideEndY: textEndY,
      contentLeft: PAGE_PADDING.left - 24,
      contentRight: PAGE_WIDTH - PAGE_PADDING.right + 12,
      bodyTextBaseline: 'alphabetic',
    };
  }

  return {
    rowPitch,
    textStartY,
    textEndY,
    guideStartY: textStartY - rowPitch / 2,
    guideEndY: textEndY + rowPitch / 2,
    contentLeft: paperStyle === 'grid' ? PAGE_PADDING.left - 34 : PAGE_PADDING.left - 10,
    contentRight:
      paperStyle === 'grid'
        ? PAGE_WIDTH - PAGE_PADDING.right + 34
        : PAGE_WIDTH - PAGE_PADDING.right + 20,
    bodyTextBaseline: 'middle',
  };
}

function snapToPaperRow(y: number, metrics: PaperMetrics): number {
  if (y <= metrics.textStartY) {
    return metrics.textStartY;
  }

  const rowIndex = (y - metrics.textStartY) / metrics.rowPitch;
  const roundedRowIndex = Math.round(rowIndex);
  const normalizedRowIndex =
    Math.abs(rowIndex - roundedRowIndex) < 1e-6 ? roundedRowIndex : Math.ceil(rowIndex);

  return metrics.textStartY + normalizedRowIndex * metrics.rowPitch;
}

function alignStroke(value: number): number {
  return Math.round(value) + 0.5;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(...values: number[]): number {
  let seed = 0x811c9dc5;
  for (const value of values) {
    seed ^= value + 0x9e3779b9 + (seed << 6) + (seed >>> 2);
    seed >>>= 0;
  }
  return seed >>> 0;
}

function createMeasureContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前环境不支持 Canvas 2D。');
  return context;
}

function toFont(fontSize: number, fontFamily: string, weight = 400): string {
  return `${weight} ${fontSize}px ${fontFamily}`;
}

function measureRunWidth(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontFamily: string,
  charSpacing: number,
  fontWeight = 400,
): number {
  context.font = toFont(fontSize, fontFamily, fontWeight);
  const chars = Array.from(text);
  return chars.reduce((width, char, index) => {
    const advance = context.measureText(char).width;
    return width + advance + (index === chars.length - 1 ? 0 : charSpacing);
  }, 0);
}

function measureInkMetrics(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = 400,
): InkMetrics {
  context.font = toFont(fontSize, fontFamily, fontWeight);
  const sample = text.trim() || '永';
  const metrics = context.measureText(sample);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.76;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  return { ascent, descent };
}

function computeAlignedTitleBaseline(
  rowBaseline: number,
  bodyMetrics: InkMetrics,
  targetMetrics: InkMetrics,
  paper: PaperMetrics,
): number {
  if (paper.bodyTextBaseline !== 'alphabetic') {
    return rowBaseline;
  }

  return rowBaseline + bodyMetrics.descent - targetMetrics.descent;
}

function getPunctuationSqueezedSpacing(
  currentText: string,
  punctuation: string,
  baseCharSpacing: number,
  overflow: number,
  fontSize: number,
): number | null {
  if (!NO_LINE_START_PUNCTUATION.has(punctuation) || overflow <= 0) {
    return null;
  }

  const gapCount = Math.max(Array.from(currentText + punctuation).length - 1, 1);
  const maxSqueezePerGap = Math.max(0.35, Math.min(1.4, fontSize * 0.03));
  const minCharSpacing = Math.min(baseCharSpacing, 0) - maxSqueezePerGap;
  const squeezeCapacity = Math.max(0, (baseCharSpacing - minCharSpacing) * gapCount);

  if (overflow > squeezeCapacity + 1e-6) {
    return null;
  }

  return baseCharSpacing - overflow / gapCount;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontFamily: string,
  charSpacing: number,
  maxWidth: number,
  firstIndent = 0,
  hangingIndent = firstIndent,
  fontWeight = 400,
): WrappedLine[] {
  context.font = toFont(fontSize, fontFamily, fontWeight);
  const chars = Array.from(text);
  const lines: WrappedLine[] = [];
  let current = '';
  let currentWidth = 0;
  let indent = firstIndent;
  let currentCharSpacing = charSpacing;
  let availableWidth = maxWidth - indent;

  for (const char of chars) {
    const advance = context.measureText(char).width;
    const extraSpacing = current.length > 0 ? currentCharSpacing : 0;

    if (current && currentWidth + extraSpacing + advance > availableWidth) {
      const overflow = currentWidth + extraSpacing + advance - availableWidth;
      const squeezedCharSpacing = getPunctuationSqueezedSpacing(
        current,
        char,
        currentCharSpacing,
        overflow,
        fontSize,
      );

      if (squeezedCharSpacing !== null) {
        currentCharSpacing = squeezedCharSpacing;
        current += char;
        currentWidth = measureRunWidth(
          context,
          current,
          fontSize,
          fontFamily,
          currentCharSpacing,
          fontWeight,
        );
        continue;
      }

      lines.push({ text: current, indent, charSpacing: currentCharSpacing });
      current = char;
      currentWidth = advance;
      indent = hangingIndent;
      currentCharSpacing = charSpacing;
      availableWidth = maxWidth - indent;
      continue;
    }

    current += char;
    currentWidth += advance + extraSpacing;
  }

  if (current) lines.push({ text: current, indent, charSpacing: currentCharSpacing });
  return lines.length > 0 ? lines : [{ text: '', indent: firstIndent, charSpacing }];
}

function buildLayout(project: ProjectData): LayoutPage[] {
  const preset = PRESETS[project.handwritingStyle];
  const paper = getPaperMetrics(project);
  const bodyFontSize = project.fontSize;
  const bodyCharSpacing = project.charSpacing;
  const titleFontSize = Math.max(
    bodyFontSize + 4,
    Math.round(bodyFontSize * (preset.titleSize / preset.fontSize)),
  );
  const titleLineHeight = paper.rowPitch;
  const subtitleFontSize = Math.max(16, Math.round(bodyFontSize * 0.42));
  const subtitleCharSpacing = Math.max(1, Math.round(bodyCharSpacing * 0.4));
  const paragraphIndent = Math.round(project.paragraphIndent * (bodyFontSize + bodyCharSpacing));
  const context = createMeasureContext();
  /*
  const bodyInkMetrics = measureInkMetrics(context, '永国春', bodyFontSize, preset.fontFamily, 400);
  */
  const bodyInkMetrics = measureInkMetrics(
    context,
    '\u6c38\u56fd\u6625',
    bodyFontSize,
    preset.fontFamily,
    400,
  );
  const contentWidth = paper.contentRight - paper.contentLeft;
  const titleWrapWidth = contentWidth * 0.72;
  const titleTuning = project.paperStyle === 'school' ? TITLE_TUNING.school : TITLE_TUNING.default;
  const titleJitterIntensity =
    project.handwritingStyle === 'classical'
      ? titleTuning.titleJitterIntensityClassical
      : titleTuning.titleJitterIntensity;
  const subtitleJitterIntensity =
    project.handwritingStyle === 'classical'
      ? titleTuning.subtitleJitterIntensityClassical
      : titleTuning.subtitleJitterIntensity;
  const pages: LayoutPage[] = [{ lines: [] }];
  const blocks = parseTextBlocks(project.content, project.lineLayoutRules);
  let pageIndex = 0;
  let y = paper.textStartY;
  let serial = 0;

  const resolveBlockAlign = (mode: LineLayoutMode): LayoutAlign =>
    mode === 'centerLongest' ? 'centerLongest' : mode;

  const addPage = () => {
    pageIndex += 1;
    pages.push({ lines: [] });
    y = paper.textStartY;
  };

  const advanceRows = (rows: number) => {
    if (pages[pageIndex].lines.length === 0) {
      return;
    }

    const nextY = y + paper.rowPitch * rows;
    if (nextY > paper.textEndY) {
      addPage();
      return;
    }

    y = nextY;
  };

  const addWrappedLines = (
    lines: WrappedLine[],
    options: Omit<LayoutLine, 'text' | 'y' | 'indent' | 'serial'>,
  ) => {
    for (const [index, line] of lines.entries()) {
      if (y > paper.textEndY) {
        addPage();
      }

      pages[pageIndex].lines.push({
        serial,
        role: options.role,
        text: line.text,
        y,
        indent: line.indent,
        align: options.align,
        fontWeight: options.fontWeight,
        textBaseline: options.textBaseline,
        jitterIntensity: options.jitterIntensity,
        fontSize: options.fontSize,
        charSpacing: line.charSpacing ?? options.charSpacing,
        lineHeight: options.lineHeight,
        groupWidth: options.groupWidth,
        manualX: options.manualX,
        prefix: index === 0 ? options.prefix : undefined,
        prefixOffset: options.prefixOffset,
      });
      serial += 1;
      y += options.lineHeight;
    }
  };

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0 && block.type === 'title') {
      advanceRows(1);
    }

    if (block.type === 'title') {
      const titleBodyRow = pages[pageIndex].lines.length === 0 ? paper.textStartY : snapToPaperRow(y, paper);
      const lines = wrapText(
        context,
        block.text,
        titleFontSize,
        preset.fontFamily,
        bodyCharSpacing,
        titleWrapWidth,
        0,
        0,
        700,
      );
      const titleInkMetrics = measureInkMetrics(
        context,
        lines[0]?.text ?? block.text,
        titleFontSize,
        preset.fontFamily,
        700,
      );
      const titleAnchorY = computeAlignedTitleBaseline(titleBodyRow, bodyInkMetrics, titleInkMetrics, paper);
      y = titleAnchorY;
      addWrappedLines(lines, {
        role: 'title',
        align: 'center',
        fontWeight: 700,
        textBaseline: 'alphabetic',
        jitterIntensity: titleJitterIntensity,
        fontSize: titleFontSize,
        charSpacing: bodyCharSpacing,
        lineHeight: titleLineHeight,
      });

      if (block.subtitle && lines.length > 0) {
        const subtitleInkMetrics = measureInkMetrics(
          context,
          block.subtitle,
          subtitleFontSize,
          preset.fontFamily,
          500,
        );
        const firstLineWidth = measureRunWidth(
          context,
          lines[0].text,
          titleFontSize,
          preset.fontFamily,
          bodyCharSpacing,
          700,
        );
        const subtitleWidth = measureRunWidth(
          context,
          block.subtitle,
          subtitleFontSize,
          preset.fontFamily,
          subtitleCharSpacing,
          500,
        );
        const titleStartX = paper.contentLeft + (contentWidth - firstLineWidth) / 2;
        const subtitleGap = Math.max(18, Math.round(bodyFontSize * 0.45));
        pages[pageIndex].lines.push({
          serial,
          role: 'title',
          text: block.subtitle,
          y: computeAlignedTitleBaseline(titleBodyRow, bodyInkMetrics, subtitleInkMetrics, paper),
          indent: 0,
          align: 'left',
          fontWeight: 500,
          textBaseline: 'alphabetic',
          jitterIntensity: subtitleJitterIntensity,
          fontSize: subtitleFontSize,
          charSpacing: subtitleCharSpacing,
          lineHeight: 0,
          manualX: Math.min(
            paper.contentRight - subtitleWidth,
            titleStartX + firstLineWidth + subtitleGap,
          ),
        });
        serial += 1;
      }

      y = titleBodyRow + lines.length * paper.rowPitch;
      return;
    }

    if (block.type === 'paragraph') {
      y = snapToPaperRow(y, paper);
      const align = resolveBlockAlign(block.align);
      const firstIndent = align === 'left' ? paragraphIndent : 0;
      const lines = wrapText(
        context,
        block.text,
        bodyFontSize,
        preset.fontFamily,
        bodyCharSpacing,
        contentWidth,
        firstIndent,
        0,
      );
      const groupWidth =
        align === 'centerLongest'
          ? lines.reduce(
              (maxWidth, line) =>
                Math.max(
                  maxWidth,
                  measureRunWidth(
                    context,
                    line.text,
                    bodyFontSize,
                    preset.fontFamily,
                    line.charSpacing ?? bodyCharSpacing,
                  ),
                ),
              0,
            )
          : undefined;
      addWrappedLines(lines, {
        role: 'paragraph',
        align,
        fontWeight: 400,
        textBaseline: paper.bodyTextBaseline,
        jitterIntensity: 0.42,
        fontSize: bodyFontSize,
        charSpacing: bodyCharSpacing,
        lineHeight: paper.rowPitch,
        groupWidth,
      });
      return;
    }

    if (block.type === 'verse') {
      y = snapToPaperRow(y, paper);
      const align = resolveBlockAlign(block.align);
      const groupWidth =
        align === 'centerLongest'
          ? block.lines.reduce(
              (maxWidth, text) =>
                Math.max(maxWidth, measureRunWidth(context, text, bodyFontSize, preset.fontFamily, bodyCharSpacing)),
              0,
            )
          : undefined;
      addWrappedLines(
        block.lines.map((text) => ({ text, indent: 0 })),
        {
          role: 'paragraph',
          align,
          fontWeight: 400,
          textBaseline: paper.bodyTextBaseline,
          jitterIntensity: project.handwritingStyle === 'classical' ? 0.24 : 0.32,
          fontSize: project.handwritingStyle === 'classical' ? bodyFontSize + 1 : bodyFontSize,
          charSpacing: bodyCharSpacing,
          lineHeight: paper.rowPitch,
          groupWidth,
        },
      );
      return;
    }

    block.items.forEach((item, itemIndex) => {
      const align = resolveBlockAlign(block.align);
      y = snapToPaperRow(y, paper);
      const prefix = block.ordered ? `${itemIndex + 1}.` : '•';
      context.font = toFont(bodyFontSize, preset.fontFamily);
      const prefixWidth = measureRunWidth(context, prefix, bodyFontSize, preset.fontFamily, bodyCharSpacing);
      const listIndent = 34;
      const textIndent = listIndent + prefixWidth + 24;
      const firstIndent = align === 'left' ? textIndent : 0;
      const lines = wrapText(
        context,
        item,
        bodyFontSize,
        preset.fontFamily,
        bodyCharSpacing,
        contentWidth,
        firstIndent,
        align === 'left' ? textIndent : 0,
      );
      const groupWidth =
        align === 'centerLongest'
          ? lines.reduce((maxWidth, line, lineIndex) => {
              const lineWidth = measureRunWidth(
                context,
                line.text,
                bodyFontSize,
                preset.fontFamily,
                line.charSpacing ?? bodyCharSpacing,
              );
              const totalWidth = lineIndex === 0 ? lineWidth + prefixWidth + 24 : lineWidth;
              return Math.max(maxWidth, totalWidth);
            }, 0)
          : undefined;
      addWrappedLines(lines, {
        role: 'list',
        align,
        fontWeight: 400,
        textBaseline: paper.bodyTextBaseline,
        jitterIntensity: 0.42,
        fontSize: bodyFontSize,
        charSpacing: bodyCharSpacing,
        lineHeight: paper.rowPitch,
        groupWidth,
        prefix,
        prefixOffset: listIndent,
      });
    });
  });

  return pages;
}

function drawPaperBackground(
  context: CanvasRenderingContext2D,
  project: ProjectData,
  pageIndex: number,
  seed: number,
): void {
  const { paperStyle } = project;
  const paper = getPaperMetrics(project);
  const gradient = context.createLinearGradient(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  if (paperStyle === 'school') {
    gradient.addColorStop(0, '#f7f3ea');
    gradient.addColorStop(0.58, '#f4efe6');
    gradient.addColorStop(1, '#efe8dc');
  } else if (paperStyle === 'ruled') {
    gradient.addColorStop(0, '#fdfbf3');
    gradient.addColorStop(1, '#f7f0e5');
  } else if (paperStyle === 'grid') {
    gradient.addColorStop(0, '#fbf8ef');
    gradient.addColorStop(1, '#f3eddf');
  } else {
    gradient.addColorStop(0, '#fffaf1');
    gradient.addColorStop(1, '#f6efdf');
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  const textureRandom = mulberry32(mixSeed(seed, pageIndex, 71));
  for (let i = 0; i < 220; i += 1) {
    const x = textureRandom() * PAGE_WIDTH;
    const y = textureRandom() * PAGE_HEIGHT;
    const alpha = 0.012 + textureRandom() * 0.02;
    const radius = 0.8 + textureRandom() * 1.8;
    context.fillStyle = `rgba(120, 103, 72, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  if (paperStyle === 'school') {
    context.strokeStyle = '#bfc8d3';
    context.lineWidth = 1.1;
    for (let y = paper.guideStartY; y <= paper.guideEndY; y += paper.rowPitch) {
      const alignedY = alignStroke(y);
      context.beginPath();
      context.moveTo(alignStroke(paper.contentLeft), alignedY);
      context.lineTo(alignStroke(paper.contentRight), alignedY);
      context.stroke();
    }

    const boxStartX = PAGE_PADDING.left - 6;
    const boxTopY = 34;
    const boxWidth = 30;
    const boxHeight = 18;
    const boxGap = 4;
    const dayLabels = ['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    context.strokeStyle = 'rgba(134, 141, 153, 0.42)';
    context.lineWidth = 0.8;
    context.fillStyle = 'rgba(120, 128, 140, 0.55)';
    context.font = '500 12px "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    dayLabels.forEach((label, index) => {
      const x = boxStartX + index * (boxWidth + boxGap);
      context.strokeRect(x, boxTopY, boxWidth, boxHeight);
      context.fillText(label, x + boxWidth / 2, boxTopY + boxHeight / 2 + 0.5);
      context.strokeRect(x, boxTopY + boxHeight + 3, boxWidth, boxHeight);
    });

    const rightX = PAGE_WIDTH - PAGE_PADDING.right - 30;
    context.textAlign = 'left';
    context.fillStyle = 'rgba(120, 128, 140, 0.48)';
    context.font = '500 16px "Georgia", "Times New Roman", serif';
    context.fillText('DATE', rightX, 40);
    context.fillText('MEMO NO.', rightX - 4, 76);
    context.strokeStyle = 'rgba(134, 141, 153, 0.38)';
    context.beginPath();
    context.moveTo(alignStroke(rightX + 56), alignStroke(42));
    context.lineTo(alignStroke(PAGE_WIDTH - 56), alignStroke(42));
    context.stroke();
    context.beginPath();
    context.moveTo(alignStroke(rightX + 92), alignStroke(78));
    context.lineTo(alignStroke(PAGE_WIDTH - 56), alignStroke(78));
    context.stroke();

    const edge = context.createLinearGradient(0, 0, 48, 0);
    edge.addColorStop(0, 'rgba(108, 92, 75, 0.10)');
    edge.addColorStop(1, 'rgba(108, 92, 75, 0)');
    context.fillStyle = edge;
    context.fillRect(0, 0, 48, PAGE_HEIGHT);
    context.fillRect(PAGE_WIDTH - 48, 0, 48, PAGE_HEIGHT);
    return;
  }

  if (paperStyle === 'ruled') {
    context.strokeStyle = '#b5d0eb';
    context.lineWidth = 1.3;
    for (let y = paper.guideStartY; y <= paper.guideEndY; y += paper.rowPitch) {
      const alignedY = alignStroke(y);
      context.beginPath();
      context.moveTo(alignStroke(paper.contentLeft), alignedY);
      context.lineTo(alignStroke(paper.contentRight), alignedY);
      context.stroke();
    }
    context.strokeStyle = '#da9898';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(alignStroke(PAGE_PADDING.left - 48), alignStroke(paper.guideStartY - 24));
    context.lineTo(alignStroke(PAGE_PADDING.left - 48), alignStroke(paper.guideEndY + 24));
    context.stroke();
    return;
  }

  if (paperStyle === 'grid') {
    let rowIndex = 0;
    for (let y = paper.guideStartY; y <= paper.guideEndY; y += paper.rowPitch) {
      const alignedY = alignStroke(y);
      context.strokeStyle = rowIndex % 2 === 0 ? '#c0cfe0' : '#d9e4ef';
      context.lineWidth = rowIndex % 2 === 0 ? 1.2 : 0.9;
      context.beginPath();
      context.moveTo(alignStroke(paper.contentLeft), alignedY);
      context.lineTo(alignStroke(paper.contentRight), alignedY);
      context.stroke();
      rowIndex += 1;
    }
    let columnIndex = 0;
    for (let x = paper.contentLeft; x <= paper.contentRight; x += paper.rowPitch) {
      const alignedX = alignStroke(x);
      context.strokeStyle = columnIndex % 2 === 0 ? '#c0cfe0' : '#d9e4ef';
      context.lineWidth = columnIndex % 2 === 0 ? 1.2 : 0.9;
      context.beginPath();
      context.moveTo(alignedX, alignStroke(paper.guideStartY));
      context.lineTo(alignedX, alignStroke(paper.guideEndY));
      context.stroke();
      columnIndex += 1;
    }
    return;
  }

  context.fillStyle = '#b8c9d3';
  for (let y = paper.guideStartY; y <= paper.guideEndY; y += paper.rowPitch) {
    for (let x = paper.contentLeft; x <= paper.contentRight; x += paper.rowPitch) {
      context.beginPath();
      context.arc(x, y, 1.7, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawStylizedRun(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  charSpacing: number,
  fontWeight: number,
  preset: HandwritingPreset,
  seed: number,
  color: string,
  textBaseline: CanvasTextBaseline,
  jitterIntensity: number,
): void {
  const random = mulberry32(seed);
  let cursor = x;
  context.fillStyle = color;

  for (const [index, char] of Array.from(text).entries()) {
    const localSize = fontSize + (random() - 0.5) * preset.sizeJitter * jitterIntensity * 2;
    const rotation = ((random() - 0.5) * preset.rotationJitter * jitterIntensity * 2 * Math.PI) / 180;
    const offsetX = (random() - 0.5) * preset.spacingJitter * jitterIntensity * 2;
    const offsetY = (random() - 0.5) * preset.baselineJitter * jitterIntensity * 2;
    const alpha = 0.84 + random() * 0.14;
    context.font = toFont(localSize, preset.fontFamily, fontWeight);
    const charWidth = context.measureText(char).width;

    context.save();
    context.textAlign = 'left';
    context.textBaseline = textBaseline;
    context.translate(cursor + offsetX, y + offsetY);
    context.rotate(rotation);
    context.shadowBlur = preset.shadowBlur;
    context.shadowColor = preset.shadowColor;
    context.globalAlpha = alpha;
    context.fillText(char, 0, 0);
    context.restore();

    cursor +=
      charWidth +
      charSpacing +
      (index === 0 ? 0 : (random() - 0.5) * preset.spacingJitter * jitterIntensity);
  }
}

function drawPageFooter(
  context: CanvasRenderingContext2D,
  pageIndex: number,
  pageCount: number,
  preset: HandwritingPreset,
  paperStyle: PaperStyle,
): void {
  if (paperStyle === 'school') {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.font = '500 20px "Georgia", "Times New Roman", serif';
    context.fillStyle = 'rgba(94, 84, 71, 0.62)';
    context.fillText(`${pageIndex + 1}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 40);
    context.restore();
    return;
  }

  const label = `${pageIndex + 1} / ${pageCount}`;
  context.save();
  context.font = `500 24px "Georgia", "Times New Roman", serif`;
  context.fillStyle = 'rgba(88, 79, 67, 0.55)';
  context.textAlign = 'right';
  context.fillText(label, PAGE_WIDTH - PAGE_PADDING.right, PAGE_HEIGHT - 66);
  context.restore();

  context.save();
  context.strokeStyle = 'rgba(116, 104, 82, 0.14)';
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(PAGE_PADDING.left, PAGE_HEIGHT - 90);
  context.lineTo(PAGE_WIDTH - PAGE_PADDING.right - 90, PAGE_HEIGHT - 90);
  context.stroke();
  context.restore();

  context.save();
  context.font = `500 20px ${preset.fontFamily}`;
  context.fillStyle = 'rgba(116, 104, 82, 0.5)';
  context.fillText('InkNote', PAGE_PADDING.left, PAGE_HEIGHT - 62);
  context.restore();
}

function renderPage(
  page: LayoutPage,
  pageIndex: number,
  pageCount: number,
  project: ProjectData,
  scale: number,
): HTMLCanvasElement {
  const preset = PRESETS[project.handwritingStyle];
  const paper = getPaperMetrics(project);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_WIDTH * scale);
  canvas.height = Math.round(PAGE_HEIGHT * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前环境不支持 Canvas 2D。');

  context.scale(scale, scale);
  drawPaperBackground(context, project, pageIndex, project.seed);

  page.lines.forEach((line) => {
    const runWidth = measureRunWidth(
      context,
      line.text,
      line.fontSize,
      preset.fontFamily,
      line.charSpacing,
      line.fontWeight,
    );
    const blockWidth = paper.contentRight - paper.contentLeft;
    const driftRandom = mulberry32(mixSeed(project.seed, pageIndex, line.serial, 311));
    const drift = (driftRandom() - 0.5) * preset.lineDrift * line.jitterIntensity * 2;
    const baselineY = line.y + drift;
    const color = line.role === 'title' ? preset.titleColor : preset.inkColor;
    const startX =
      typeof line.manualX === 'number'
        ? line.manualX
        : line.align === 'center'
        ? paper.contentLeft + (blockWidth - runWidth) / 2
        : line.align === 'centerLongest'
          ? paper.contentLeft + (blockWidth - (line.groupWidth ?? runWidth)) / 2
        : line.align === 'right'
          ? paper.contentRight - runWidth - line.indent
          : paper.contentLeft + line.indent;

    if (line.prefix && typeof line.prefixOffset === 'number') {
      const prefixWidth = measureRunWidth(
        context,
        line.prefix,
        line.fontSize,
        preset.fontFamily,
        line.charSpacing,
        line.fontWeight,
      );
      const prefixX =
        line.align === 'left'
          ? paper.contentLeft + line.prefixOffset
          : startX - prefixWidth - 24;
      drawStylizedRun(
        context,
        line.prefix,
        prefixX,
        baselineY,
        line.fontSize,
        line.charSpacing,
        line.fontWeight,
        preset,
        mixSeed(project.seed, pageIndex, line.serial, 17),
        color,
        line.textBaseline,
        line.jitterIntensity,
      );
    }

    drawStylizedRun(
      context,
      line.text,
      startX,
      baselineY,
      line.fontSize,
      line.charSpacing,
      line.fontWeight,
      preset,
      mixSeed(project.seed, pageIndex, line.serial, 29),
      color,
      line.textBaseline,
      line.jitterIntensity,
    );
  });

  drawPageFooter(context, pageIndex, pageCount, preset, project.paperStyle);
  return canvas;
}

export function renderNotebookPages(project: ProjectData, scale = 1): HTMLCanvasElement[] {
  const layout = buildLayout(project);
  return layout.map((page, pageIndex) => renderPage(page, pageIndex, layout.length, project, scale));
}

export function renderNotebookStrip(project: ProjectData, scale = 1): HTMLCanvasElement {
  const pages = renderNotebookPages(project, scale);
  const gap = Math.round(48 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = pages[0]?.width ?? Math.round(PAGE_WIDTH * scale);
  canvas.height = pages.reduce((height, page) => height + page.height, 0) + Math.max(0, pages.length - 1) * gap;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前环境不支持 Canvas 2D。');

  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#e6ded0');
  background.addColorStop(1, '#d5ccbb');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let offsetY = 0;
  pages.forEach((page) => {
    context.shadowColor = 'rgba(56, 42, 28, 0.16)';
    context.shadowBlur = 24 * scale;
    context.shadowOffsetY = 10 * scale;
    context.drawImage(page, 0, offsetY);
    offsetY += page.height + gap;
  });

  return canvas;
}

export const PREVIEW_PAGE_WIDTH = PAGE_WIDTH;
export const PREVIEW_PAGE_HEIGHT = PAGE_HEIGHT;
