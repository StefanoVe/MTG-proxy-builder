import type { Card, PrintSettings } from './model.js';

export const cardWidth = 63;
export const cardHeight = 88;
export const cardArchiveLimit = 3000;
export const cardArchiveMaxBytes = 256 * 1024 * 1024;
export const pixels = { width: 744, height: 1039 };
export const mmToPt = (mm: number) => mm * 72 / 25.4;
export const papers = { A4: [210, 297], Letter: [215.9, 279.4] } as const;
const gap = 2;

export type Slot = { card: Card; x: number; y: number };
export type Sheet = { back: boolean; slots: Slot[] };

export function printSheets(cards: Card[], settings: PrintSettings): Sheet[] {
  const [width, height] = papers[settings.paper];
  const left = (width - (3 * cardWidth + 2 * gap)) / 2;
  const top = (height - (3 * cardHeight + 2 * gap)) / 2;
  const sheets: Sheet[] = [];
  let page: Slot[] = [];
  const duplex = settings.backs && cards.some(card => card.source.images.back);
  function appendPage() {
    if (!page.length) return;
    sheets.push({ back: false, slots: page });
    if (duplex) sheets.push({ back: true, slots: page.filter(({ card }) => card.source.images.back)
      .map(slot => ({ ...slot, x: width - slot.x - cardWidth })) });
    page = [];
  }
  for (const card of cards) {
    for (let i = 0; i < card.count; i++) {
      const index = page.length;
      page.push({ card, x: left + (index % 3) * (cardWidth + gap), y: top + Math.floor(index / 3) * (cardHeight + gap) });
      if (page.length === 9) appendPage();
    }
  }
  appendPage();
  return sheets;
}

export function cutSegments(x: number, y: number) {
  return [
    [x - 1, y, x + 1, y], [x, y - 1, x, y + 1],
    [x + cardWidth - 1, y, x + cardWidth + 1, y], [x + cardWidth, y - 1, x + cardWidth, y + 1],
    [x - 1, y + cardHeight, x + 1, y + cardHeight], [x, y + cardHeight - 1, x, y + cardHeight + 1],
    [x + cardWidth - 1, y + cardHeight, x + cardWidth + 1, y + cardHeight],
    [x + cardWidth, y + cardHeight - 1, x + cardWidth, y + cardHeight + 1]
  ];
}
