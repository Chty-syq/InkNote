import { isValidElement, memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

function normalizeDisplayMathContent(value: string): string {
  const normalized = value.replace(/\r/g, '').trim();
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

export function normalizeMarkdownForPreview(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n');
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
        pushMarkdownTextLine(output, afterClosing, closingQuoteWrapped);
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

    const singleLineBlockMath = content.match(/^(.*?)\$\$([\s\S]+?)\$\$(.*)$/);
    if (singleLineBlockMath) {
      const beforeText = singleLineBlockMath[1];
      const mathContent = singleLineBlockMath[2];
      const afterText = singleLineBlockMath[3];

      pushMarkdownTextLine(output, beforeText, effectiveQuoteWrapped);
      pushDisplayMathBlock(output, mathContent, effectiveQuoteWrapped);
      pushMarkdownTextLine(output, afterText, effectiveQuoteWrapped);
      quoteContinuationPending = effectiveQuoteWrapped;
      continue;
    }

    if (content.trim() === '$$') {
      mathBuffer = [];
      mathQuoteWrapped = effectiveQuoteWrapped;
      continue;
    }

    const openingMatch = content.match(/^(.*?)\$\$(.*)$/);
    if (openingMatch) {
      const beforeText = openingMatch[1];
      const afterOpening = openingMatch[2].trimStart();
      pushMarkdownTextLine(output, beforeText, effectiveQuoteWrapped);
      mathBuffer = afterOpening ? [afterOpening] : [];
      mathQuoteWrapped = effectiveQuoteWrapped;
      continue;
    }

    output.push(line);
    if (lineQuoteWrapped) {
      quoteContinuationPending = true;
    } else if (trimmed !== '') {
      quoteContinuationPending = false;
    }
  }

  if (mathBuffer) {
    pushDisplayMathBlock(output, mathBuffer.join('\n'), mathQuoteWrapped);
  }

  return output.join('\n');
}

export const MarkdownPreview = memo(function MarkdownPreview({ markdown }: { markdown: string }) {
  const normalizedMarkdown = useMemo(() => normalizeMarkdownForPreview(markdown), [markdown]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={{
        a({ node: _node, ...props }) {
          return <a {...props} target="_blank" rel="noreferrer" />;
        },
        code({ node: _node, className, children, ...props }) {
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
        pre({ node: _node, children, ...props }) {
          const language =
            isValidElement<{ className?: string }>(children) && typeof children.props.className === 'string'
              ? children.props.className.replace(/^language-/, '')
              : undefined;

          return (
            <pre {...props} className="markdown-code-block" data-language={language || undefined}>
              {children}
            </pre>
          );
        },
        table({ node: _node, children, ...props }) {
          return (
            <div className="markdown-table-scroll">
              <table {...props}>{children}</table>
            </div>
          );
        },
      }}
    >
      {normalizedMarkdown}
    </ReactMarkdown>
  );
});

export function renderMarkdownPreview(markdown: string): ReactNode {
  return <MarkdownPreview markdown={markdown} />;
}
