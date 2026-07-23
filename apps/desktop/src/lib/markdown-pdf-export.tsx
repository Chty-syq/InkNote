import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MarkdownPreview } from './markdown-preview';

const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;
const PAGE_MARGIN_POINTS = 40;
const EXPORT_CONTENT_WIDTH = 720;
const IMAGE_LOAD_TIMEOUT = 8_000;

interface MarkdownPdfExportOptions {
  title: string;
  markdown: string;
}

interface PageRange {
  start: number;
  end: number;
}

function afterBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    try {
      await image.decode();
    } catch {
      // Broken or unsupported images are omitted rather than blocking the export.
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, IMAGE_LOAD_TIMEOUT);
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
  });
}

async function waitForExportAssets(element: HTMLElement): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await Promise.all(Array.from(element.querySelectorAll('img')).map(waitForImage));
  await afterBrowserPaint();
}

function collectPageBreakCandidates(article: HTMLElement): number[] {
  const articleTop = article.getBoundingClientRect().top;
  const previewRoot = article.querySelector<HTMLElement>('.markdown-preview-root');
  const blocks = [
    ...Array.from(article.querySelectorAll<HTMLElement>(':scope > .notes-pdf-export-title')),
    ...(previewRoot ? Array.from(previewRoot.children).filter((child): child is HTMLElement => child instanceof HTMLElement) : []),
  ];

  return blocks
    .map((block) => block.getBoundingClientRect().bottom - articleTop)
    .filter((position) => Number.isFinite(position) && position > 0)
    .sort((left, right) => left - right);
}

function createPageRanges(article: HTMLElement, pageHeight: number): PageRange[] {
  const totalHeight = Math.max(1, Math.ceil(article.scrollHeight));
  const candidates = collectPageBreakCandidates(article);
  const ranges: PageRange[] = [];
  let start = 0;

  while (start < totalHeight) {
    const desiredEnd = Math.min(totalHeight, start + pageHeight);
    if (desiredEnd >= totalHeight) {
      ranges.push({ start, end: totalHeight });
      break;
    }

    const minimumUsefulEnd = start + pageHeight * 0.55;
    const naturalBreaks = candidates.filter(
      (candidate) => candidate > minimumUsefulEnd && candidate <= desiredEnd,
    );
    const naturalEnd = naturalBreaks[naturalBreaks.length - 1];
    const end = Math.max(start + 1, Math.round(naturalEnd ?? desiredEnd));
    ranges.push({ start, end });
    start = end;
  }

  return ranges;
}

function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法生成 PDF 页面图像。'));
        return;
      }

      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(() => reject(new Error('无法读取 PDF 页面图像。')));
    }, 'image/jpeg', 0.94);
  });
}

export async function renderMarkdownPdf({ title, markdown }: MarkdownPdfExportOptions): Promise<Uint8Array> {
  const captureFrame = document.createElement('div');
  captureFrame.setAttribute('aria-hidden', 'true');
  Object.assign(captureFrame.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: `${EXPORT_CONTENT_WIDTH}px`,
    overflow: 'hidden',
    background: '#ffffff',
    pointerEvents: 'none',
    zIndex: '-1',
  });

  const article = document.createElement('article');
  article.className = 'notes-rendered-article notes-pdf-export-article';
  Object.assign(article.style, {
    position: 'relative',
    top: 'auto',
    left: 'auto',
    right: 'auto',
    width: `${EXPORT_CONTENT_WIDTH}px`,
    minHeight: '0',
    padding: '0',
    boxSizing: 'border-box',
    transform: 'none',
    background: '#ffffff',
  });
  captureFrame.append(article);
  document.body.append(captureFrame);

  const reactRoot = createRoot(article);

  try {
    flushSync(() => {
      reactRoot.render(
        <>
          <h1 className="notes-pdf-export-title">{title}</h1>
          <MarkdownPreview markdown={markdown} />
        </>,
      );
    });

    await waitForExportAssets(article);

    article.querySelectorAll<HTMLElement>('.katex-display, .markdown-table-scroll').forEach((element) => {
      element.style.overflow = 'visible';
    });
    await afterBrowserPaint();

    const usableWidth = A4_WIDTH_POINTS - PAGE_MARGIN_POINTS * 2;
    const usableHeight = A4_HEIGHT_POINTS - PAGE_MARGIN_POINTS * 2;
    const pageHeight = (EXPORT_CONTENT_WIDTH * usableHeight) / usableWidth;
    const pageRanges = createPageRanges(article, pageHeight);
    const pdf = await PDFDocument.create();
    pdf.setTitle(title);
    pdf.setCreator('逸仙笔记');
    pdf.setProducer('逸仙笔记');

    for (const range of pageRanges) {
      const rangeHeight = Math.max(1, range.end - range.start);
      captureFrame.style.height = `${rangeHeight}px`;
      article.style.transform = `translateY(-${range.start}px)`;

      const canvas = await html2canvas(captureFrame, {
        width: EXPORT_CONTENT_WIDTH,
        height: rangeHeight,
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const image = await pdf.embedJpg(await canvasToJpegBytes(canvas));
      const renderedHeight = (rangeHeight / EXPORT_CONTENT_WIDTH) * usableWidth;
      const page = pdf.addPage([A4_WIDTH_POINTS, A4_HEIGHT_POINTS]);
      page.drawImage(image, {
        x: PAGE_MARGIN_POINTS,
        y: A4_HEIGHT_POINTS - PAGE_MARGIN_POINTS - renderedHeight,
        width: usableWidth,
        height: renderedHeight,
      });
    }

    return pdf.save();
  } finally {
    reactRoot.unmount();
    captureFrame.remove();
  }
}
