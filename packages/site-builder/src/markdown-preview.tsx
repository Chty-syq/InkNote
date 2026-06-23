import {
  createElement,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import './code-highlight.css';

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeCenteredMarkdownImages(segment: string): string {
  return segment.replace(
    /(<center\b[^>]*>)\s*!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)\s*(<\/center>)/gi,
    (_match, opening: string, alt: string, source: string, title: string | undefined, closing: string) =>
      `${opening}<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(alt)}"${
        title ? ` title="${escapeHtmlAttribute(title)}"` : ''
      } />${closing}`,
  );
}

function normalizeMarkdownSegment(segment: string): string {
  return normalizeCenteredMarkdownImages(segment).replace(
    /(?<!\$)\$(?!\$)([^$]*?)\\begin\{(equation\*?)\}([\s\S]*?)\\end\{\2\}([^$]*?)(?<!\\)\$(?!\$)/g,
    (_match, before: string, _environment: string, content: string, after: string) => {
      const normalized = `${before}${content}${after}`
        .replace(/\s*\n\s*/g, ' ')
        .trim();
      return `$${normalized}$`;
    },
  );
}

function normalizeInlineEquationEnvironments(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const output: string[] = [];
  let markdownBuffer: string[] = [];
  let inCodeFence = false;

  const flushMarkdown = () => {
    if (markdownBuffer.length === 0) {
      return;
    }

    output.push(normalizeMarkdownSegment(markdownBuffer.join('\n')));
    markdownBuffer = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      flushMarkdown();
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (inCodeFence) {
      output.push(line);
    } else {
      markdownBuffer.push(line);
    }
  }

  flushMarkdown();
  return output.join('\n');
}

function normalizeDisplayMathContent(value: string): string {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/\\begin\{equation\*?\}/g, '')
    .replace(/\\end\{equation\*?\}/g, '')
    .trim();
  if (!normalized) {
    return normalized;
  }

  const hasEnvironment = /\\begin\{[^}]+\}/.test(normalized);
  const hasExplicitBreak = /\\\\/.test(normalized);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1 || hasEnvironment || hasExplicitBreak) {
    return normalized;
  }

  return ['\\begin{aligned}', lines.join(' \\\\\n'), '\\end{aligned}'].join('\n');
}

function pushDisplayMathBlock(output: string[], content: string, quoteWrapped: boolean) {
  const normalized = normalizeDisplayMathContent(content);

  if (quoteWrapped) {
    output.push('> $$');
    for (const line of normalized.split('\n')) {
      output.push(line ? `> ${line}` : '>');
    }
    output.push('> $$');
    return;
  }

  output.push('$$', normalized, '$$');
}

function pushMarkdownTextLine(output: string[], content: string, quoteWrapped: boolean) {
  const normalized = content.trim();
  if (!normalized) {
    return;
  }

  output.push(quoteWrapped ? `> ${normalized}` : normalized);
}

function pushMarkdownLineWithDisplayMath(
  output: string[],
  content: string,
  quoteWrapped: boolean,
): string[] | null {
  const openingIndex = content.indexOf('$$');
  if (openingIndex < 0) {
    pushMarkdownTextLine(output, content, quoteWrapped);
    return null;
  }

  pushMarkdownTextLine(output, content.slice(0, openingIndex), quoteWrapped);

  const afterOpening = content.slice(openingIndex + 2);
  const closingIndex = afterOpening.indexOf('$$');
  if (closingIndex < 0) {
    const initialMath = afterOpening.trimStart();
    return initialMath ? [initialMath] : [];
  }

  pushDisplayMathBlock(output, afterOpening.slice(0, closingIndex), quoteWrapped);
  return pushMarkdownLineWithDisplayMath(output, afterOpening.slice(closingIndex + 2), quoteWrapped);
}

function isSelfContainedHtmlBlock(content: string): boolean {
  const normalized = content.trim();
  const match = normalized.match(/^<(center|div|figure|section|aside|details)\b[^>]*>[\s\S]*<\/\1>\s*$/i);
  return Boolean(match);
}

export type MarkdownHeading = {
  id: string;
  level: number;
  text: string;
  markdown: string;
  line: number;
};

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

type HeadingComponentProps<Tag extends HeadingTag> = ComponentPropsWithoutRef<Tag> & {
  node?: unknown;
  children?: ReactNode;
};

type AnchorComponentProps = ComponentPropsWithoutRef<'a'> & {
  node?: unknown;
  children?: ReactNode;
};

type CodeComponentProps = ComponentPropsWithoutRef<'code'> & {
  node?: unknown;
  children?: ReactNode;
  className?: string;
};

type PreComponentProps = ComponentPropsWithoutRef<'pre'> & {
  node?: unknown;
  children?: ReactNode;
};

type TableComponentProps = ComponentPropsWithoutRef<'table'> & {
  node?: unknown;
  children?: ReactNode;
};

type ParagraphComponentProps = ComponentPropsWithoutRef<'p'> & {
  node?: unknown;
  children?: ReactNode;
};

function extractNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => extractNodeText(item)).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractNodeText(node.props.children);
  }

  return '';
}

function getCodeLanguage(node: ReactNode): string | undefined {
  if (!isValidElement<{ className?: string }>(node) || typeof node.props.className !== 'string') {
    return undefined;
  }

  return node.props.className
    .split(/\s+/)
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length);
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('Clipboard copy failed');
  }
}

function MarkdownCodeBlock({ node: _node, children, ...props }: PreComponentProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeText = extractNodeText(children).replace(/\n$/, '');
  const language = getCodeLanguage(children);
  const lineNumbers = Array.from({ length: Math.max(1, codeText.split('\n').length) }, (_, index) => index + 1).join(
    '\n',
  );

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const copyCode = async () => {
    try {
      await copyTextToClipboard(codeText);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }

    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => setCopyStatus('idle'), 1600);
  };

  return (
    <div className="markdown-code-frame">
      <div className="markdown-code-toolbar">
        <span>{language || 'text'}</span>
        <button type="button" onClick={() => void copyCode()}>
          {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'}
        </button>
      </div>
      <div className="markdown-code-body">
        <span className="markdown-code-line-numbers" aria-hidden="true">
          {lineNumbers}
        </span>
        <pre {...props} className="markdown-code-block">
          {children}
        </pre>
      </div>
    </div>
  );
}

function normalizeHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyMarkdownHeading(value: string): string {
  const normalized = normalizeHeadingText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || 'section';
}

function createUniqueHeadingId(base: string, idCounts: Map<string, number>): string {
  const count = idCounts.get(base) ?? 0;
  idCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function getNodeStartLine(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  const line = (node as { position?: { start?: { line?: number } } }).position?.start?.line;
  return typeof line === 'number' ? line : undefined;
}

function createHeadingComponent<Tag extends HeadingTag>(
  tag: Tag,
  headingsByLine: Map<number, MarkdownHeading>,
  fallbackIds: Map<string, number>,
) {
  return function Heading({ node, children, ...props }: HeadingComponentProps<Tag>) {
    const text = normalizeHeadingText(extractNodeText(children));
    const id =
      headingsByLine.get(getNodeStartLine(node) ?? -1)?.id ??
      createUniqueHeadingId(slugifyMarkdownHeading(text), fallbackIds);
    return createElement(tag, { ...props, id }, children);
  };
}

export function normalizeMarkdownForPreview(markdown: string): string {
  const lines = normalizeInlineEquationEnvironments(markdown).split('\n');
  const output: string[] = [];
  let inCodeFence = false;
  let mathBuffer: string[] | null = null;
  let mathQuoteWrapped = false;
  let quoteContinuationPending = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!mathBuffer && /^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      if (trimmed) {
        quoteContinuationPending = false;
      }
      continue;
    }

    if (inCodeFence) {
      output.push(line);
      continue;
    }

    if (mathBuffer) {
      const contentLine = mathQuoteWrapped ? (line.match(/^\s*>\s?(.*)$/)?.[1] ?? line) : line;
      const closingMatch = contentLine.match(/^(.*?)\$\$(.*)$/);
      if (closingMatch) {
        const beforeClosing = closingMatch[1].trimEnd();
        const afterClosing = closingMatch[2];
        const closingQuoteWrapped: boolean = mathQuoteWrapped;

        if (beforeClosing) {
          mathBuffer.push(beforeClosing);
        }

        pushDisplayMathBlock(output, mathBuffer.join('\n'), mathQuoteWrapped);
        mathBuffer = null;
        mathQuoteWrapped = false;
        quoteContinuationPending = closingQuoteWrapped;

        if (afterClosing.includes('$$')) {
          mathBuffer = pushMarkdownLineWithDisplayMath(output, afterClosing, closingQuoteWrapped);
          mathQuoteWrapped = mathBuffer !== null && closingQuoteWrapped;
        } else {
          pushMarkdownTextLine(output, afterClosing, closingQuoteWrapped);
        }
        continue;
      }

      mathBuffer.push(contentLine);
      continue;
    }

    const quoteMatch = line.match(/^(\s*>\s*)?(.*)$/);
    const lineQuoteWrapped = Boolean(quoteMatch?.[1]);
    const content = quoteMatch?.[2] ?? line;
    const effectiveQuoteWrapped: boolean =
      lineQuoteWrapped || (quoteContinuationPending && content.trimStart().startsWith('$$'));

    if (!lineQuoteWrapped && quoteContinuationPending && trimmed === '') {
      output.push('>');
      continue;
    }

    if (content.includes('$$')) {
      mathBuffer = pushMarkdownLineWithDisplayMath(output, content, effectiveQuoteWrapped);
      mathQuoteWrapped = effectiveQuoteWrapped;
      quoteContinuationPending = effectiveQuoteWrapped;
      continue;
    }

    output.push(line);
    if (lineQuoteWrapped) {
      quoteContinuationPending = true;
      if (isSelfContainedHtmlBlock(content)) {
        output.push('>');
      }
    } else if (trimmed !== '') {
      quoteContinuationPending = false;
    }
  }

  if (mathBuffer) {
    pushDisplayMathBlock(output, mathBuffer.join('\n'), mathQuoteWrapped);
  }

  return output.join('\n');
}

function normalizeInlineMarkdownForPreview(markdown: string): string {
  const normalized = normalizeMarkdownForPreview(markdown).trim();

  return normalized
    .replace(/^(\d+)\.(\s+)/, (_match, numberText: string, whitespace: string) => `${numberText}\\.${whitespace}`)
    .replace(/^([*+-])(\s+)/, (_match, marker: string, whitespace: string) => `\\${marker}${whitespace}`)
    .replace(/^(>+)(\s*)/, (_match, markers: string, whitespace: string) =>
      `${markers
        .split('')
        .map(() => '\\>')
        .join('')}${whitespace}`,
    )
    .replace(/^(#{1,6})(\s+)/, (_match, markers: string, whitespace: string) =>
      `${markers
        .split('')
        .map((marker) => `\\${marker}`)
        .join('')}${whitespace}`,
    );
}

export function extractMarkdownHeadings(
  markdown: string,
  options: {
    minLevel?: number;
    maxLevel?: number;
  } = {},
): MarkdownHeading[] {
  const minLevel = options.minLevel ?? 1;
  const maxLevel = options.maxLevel ?? 6;
  const lines = normalizeMarkdownForPreview(markdown).split('\n');
  const headings: MarkdownHeading[] = [];
  const idCounts = new Map<string, number>();
  let inCodeFence = false;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence || !trimmed || trimmed.startsWith('>')) {
      continue;
    }

    const match = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }

    const level = match[1].length;
    if (level < minLevel || level > maxLevel) {
      continue;
    }

    const headingMarkdown = match[2].trim();
    const text = normalizeHeadingText(headingMarkdown);
    if (!text) {
      continue;
    }

    headings.push({
      level,
      text,
      markdown: headingMarkdown,
      line: index + 1,
      id: createUniqueHeadingId(slugifyMarkdownHeading(text), idCounts),
    });
  }

  return headings;
}

export const MarkdownPreview = memo(function MarkdownPreview({ markdown }: { markdown: string }) {
  const normalizedMarkdown = useMemo(() => normalizeMarkdownForPreview(markdown), [markdown]);
  const headings = useMemo(() => extractMarkdownHeadings(markdown), [markdown]);
  const components = useMemo<Components>(() => {
    const headingsByLine = new Map<number, MarkdownHeading>(headings.map((heading) => [heading.line, heading]));
    const fallbackHeadingIds = new Map<string, number>();

    return {
      h1: createHeadingComponent('h1', headingsByLine, fallbackHeadingIds),
      h2: createHeadingComponent('h2', headingsByLine, fallbackHeadingIds),
      h3: createHeadingComponent('h3', headingsByLine, fallbackHeadingIds),
      h4: createHeadingComponent('h4', headingsByLine, fallbackHeadingIds),
      h5: createHeadingComponent('h5', headingsByLine, fallbackHeadingIds),
      h6: createHeadingComponent('h6', headingsByLine, fallbackHeadingIds),
      a({ node: _node, ...props }: AnchorComponentProps) {
        return <a {...props} target="_blank" rel="noreferrer" />;
      },
      code({ node: _node, className, children, ...props }: CodeComponentProps) {
        const codeText = extractNodeText(children).replace(/\n$/, '');
        const language = className
          ?.split(/\s+/)
          .find((candidate) => candidate.startsWith('language-'))
          ?.slice('language-'.length);
        const isHighlighted = className?.split(/\s+/).includes('hljs');

        if (language || isHighlighted) {
          return (
            <code {...props} className={className}>
              {children}
            </code>
          );
        }

        return (
          <code {...props} className="markdown-inline-code">
            {codeText}
          </code>
        );
      },
      pre: MarkdownCodeBlock,
      table({ node: _node, children, ...props }: TableComponentProps) {
        return (
          <div className="markdown-table-scroll">
            <table {...props}>{children}</table>
          </div>
        );
      },
    };
  }, [headings]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={components}
    >
      {normalizedMarkdown}
    </ReactMarkdown>
  );
});

export function renderMarkdownPreview(markdown: string): ReactNode {
  return <MarkdownPreview markdown={markdown} />;
}

export const InlineMarkdownPreview = memo(function InlineMarkdownPreview({ markdown }: { markdown: string }) {
  const normalizedMarkdown = useMemo(() => normalizeInlineMarkdownForPreview(markdown), [markdown]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={{
        p({ node: _node, children }: ParagraphComponentProps) {
          return <>{children}</>;
        },
        a({ node: _node, children }: AnchorComponentProps) {
          return <>{children}</>;
        },
        code({ node: _node, className, children, ...props }: CodeComponentProps) {
          const codeText = String(children).replace(/\n$/, '');
          const language = className?.replace(/^language-/, '');

          if (language) {
            return (
              <code {...props} className={className} data-language={language}>
                {codeText}
              </code>
            );
          }

          return (
            <code {...props} className="markdown-inline-code">
              {codeText}
            </code>
          );
        },
      }}
    >
      {normalizedMarkdown}
    </ReactMarkdown>
  );
});

export function renderInlineMarkdownPreview(markdown: string): ReactNode {
  return <InlineMarkdownPreview markdown={markdown} />;
}
