import type { ReactNode } from 'react';
import {
  InlineMarkdownPreview,
  MarkdownPreview,
  extractMarkdownHeadings,
  renderInlineMarkdownPreview,
  renderMarkdownPreview,
  type MarkdownHeading,
} from '@inknote/site-builder';

export { InlineMarkdownPreview, MarkdownPreview, extractMarkdownHeadings };
export type { MarkdownHeading };

export function renderMarkdown(markdown: string): ReactNode {
  return renderMarkdownPreview(markdown);
}

export function renderInlineMarkdown(markdown: string): ReactNode {
  return renderInlineMarkdownPreview(markdown);
}
