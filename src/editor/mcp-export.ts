import type { Project } from '../shared/model.js';
import type { ExportRequest } from '../shared/mcp-export.js';
import { cardArchiveLimit, pdfMaxBytes, printSheets } from '../shared/print.js';
import { projectCards } from '../shared/templates.js';
import { cardArchiveBatches } from './card-archive.js';
import { imageFaces, imageGeometry } from './card-images.js';
import { createPdf } from './pdf.js';

let batches: ReturnType<typeof cardArchiveBatches> | undefined;

async function renderExport(project: Project, request: ExportRequest) {
  const cards = projectCards(project);
  if (!cards.length) throw new Error('Il progetto è vuoto.');
  if (request.format === 'pdf') {
    if (cards.reduce((sum, card) => sum + card.count, 0) > 1500) {
      throw new Error('Il PDF può contenere al massimo 1500 copie per esportazione.');
    }
    const settings = request.options;
    const data = await createPdf(printSheets(cards, settings), settings, project.name, () => {});
    if (data.length > pdfMaxBytes) throw new Error('Il PDF supera 256 MB.');
    return { data };
  }

  const settings = request.options;
  const faces = imageFaces(cards, settings.backs);
  const total = faces.reduce((sum, { card }) => sum + (settings.copies ? card.count : 1), 0);
  if (total > cardArchiveLimit) throw new Error(`Lo ZIP può contenere al massimo ${cardArchiveLimit} immagini.`);
  const geometry = imageGeometry(settings.dpi, settings.bleed, settings.customMm);
  batches = cardArchiveBatches(faces, { ...settings, geometry });
  return { archive: true };
}

Object.assign(globalThis, {
  async renderExport(project: Project, request: ExportRequest) {
    try {
      return await renderExport(project, request);
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  async nextArchiveBatch() {
    try {
      const batch = await batches?.next();
      return batch && !batch.done ? batch.value : null;
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
});
