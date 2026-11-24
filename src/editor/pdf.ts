import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFImage } from 'pdf-lib';
import { translate } from '../shared/i18n.js';
import type { Locale } from '../shared/i18n.js';
import type { PrintSettings } from '../shared/model.js';
import { bleedMm, cardHeight, cardWidth, cutSegments, mmToPt, papers } from '../shared/print.js';
import type { Sheet, Slot } from '../shared/print.js';
import { compose } from './compose.js';
import { drawCardImage, imageGeometry, sheetImage } from './card-images.js';

export async function createPdf(sheets: Sheet[], settings: PrintSettings, name: string, progress: (page: number) => void, locale: Locale = 'it') {
  const doc = await PDFDocument.create();
  doc.setTitle(name);
  doc.setCreator('MTG Proxy Builder');
  const [width, height] = papers[settings.paper];
  const rendered = new Map<string, PDFImage>();
  const canvas = document.createElement('canvas');
  async function raster({ card }: Slot, back: boolean) {
    const key = `${card.id}/${back}`;
    const existing = rendered.get(key);
    if (existing) return existing;
    const { warning } = await compose(canvas, card, back);
    if (warning) throw new Error(`${card.fields.name} · ${translate(locale, warning)}`);
    const output = document.createElement('canvas');
    drawCardImage(output, sheetImage(canvas), imageGeometry(300, settings.bleed ?? 'none', settings.customMm ?? 3), settings.fill ?? 'mirror', settings.color ?? '#000000');
    const jpg = output.toDataURL('image/jpeg', 0.94);
    const image = await doc.embedJpg(jpg);
    rendered.set(key, image);
    return image;
  }
  for (const [index, sheet] of sheets.entries()) {
    const page = doc.addPage([mmToPt(width), mmToPt(height)]);
    for (const slot of sheet.slots) {
      const { x, y } = slot;
      const image = await raster(slot, sheet.back);
      const margin = bleedMm(settings);
      page.drawImage(image, { x: mmToPt(x - margin), y: mmToPt(height - y - cardHeight - margin), width: mmToPt(cardWidth + 2 * margin), height: mmToPt(cardHeight + 2 * margin) });
    }
    if (settings.cut) {
      for (const { x, y } of sheet.slots) {
        for (const [x1, y1, x2, y2] of cutSegments(x, y)) {
          page.drawLine({ start: { x: mmToPt(x1), y: mmToPt(height - y1) }, end: { x: mmToPt(x2), y: mmToPt(height - y2) },
            thickness: 0.28, color: rgb(0.25, 0.25, 0.25) });
        }
      }
    }
    progress(index + 1);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return doc.save();
}
