import { PDFDocument } from 'pdf-lib';
import type { ProjectData } from './project-model';
import { renderNotebookPages, renderNotebookStrip } from './rendering';

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error('无法生成 PNG 数据。'));
    }, 'image/png');
  });

  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportNotebookStrip(project: ProjectData): Promise<Uint8Array> {
  const strip = renderNotebookStrip(project, 1.4);
  return canvasToPngBytes(strip);
}

export async function exportNotebookPdf(project: ProjectData): Promise<Uint8Array> {
  const pages = renderNotebookPages(project, 1.35);
  const pdf = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 28;

  for (const pageCanvas of pages) {
    const pngBytes = await canvasToPngBytes(pageCanvas);
    const image = await pdf.embedPng(pngBytes);
    const target = pdf.addPage([pageWidth, pageHeight]);
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    target.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
  }

  return new Uint8Array(await pdf.save());
}
