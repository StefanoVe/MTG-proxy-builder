import type { Project } from '../shared/model.js';
import type { ExportRequest } from '../shared/mcp-export.js';
import { cardArchiveLimit, cardArchiveMaxBytes, printSheets } from '../shared/print.js';
import { withProjectTemplate } from '../shared/templates.js';
import { createCardArchive } from './card-archive.js';
import { imageFaces, imageGeometry } from './card-images.js';
import { createPdf } from './pdf.js';

async function renderExport(project: Project, request: ExportRequest) {
  const cards = project.cards.map(card => withProjectTemplate(card, project.templateAppearances));
  if (!cards.length) throw new Error('Il progetto è vuoto.');
  if (request.format === 'pdf') {
    if (cards.reduce((sum, card) => sum + card.count, 0) > 1500) {
      throw new Error('Il PDF può contenere al massimo 1500 copie per esportazione.');
    }
    const settings = request.options;
    const data = await createPdf(printSheets(cards, settings), settings, project.name, () => {});
    if (data.length > cardArchiveMaxBytes) throw new Error('Il PDF supera 256 MB.');
    return data;
  }

  const settings = request.options;
  const faces = imageFaces(cards, settings.backs);
  const total = faces.reduce((sum, { card }) => sum + (settings.copies ? card.count : 1), 0);
  if (total > cardArchiveLimit) throw new Error(`Lo ZIP può contenere al massimo ${cardArchiveLimit} immagini.`);
  const geometry = imageGeometry(settings.dpi, settings.bleed, settings.customMm);
  return createCardArchive(faces, { ...settings, geometry }, () => {});
}

Object.assign(globalThis, {
  async renderExport(project: Project, request: ExportRequest) {
    try {
      return { data: await renderExport(project, request) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
});
