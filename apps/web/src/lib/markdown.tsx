import type { ReactNode } from 'react';
import { MarkdownPreview, renderMarkdownPreview } from '@inknote/site-builder';

export { MarkdownPreview };

export function renderMarkdown(markdown: string): ReactNode {
  return renderMarkdownPreview(markdown);
}
