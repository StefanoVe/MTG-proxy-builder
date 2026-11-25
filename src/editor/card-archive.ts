import { errorMessage, LocalizedError, translate } from '../shared/i18n.js';
import type { Locale } from '../shared/i18n.js';
import { encodeCardImage, renderCardImage } from './card-images.js';
import type { BleedFill, ImageFormat, imageFaces, imageGeometry } from './card-images.js';

export class CardArchiveFaceError extends Error {
  constructor(message: string, readonly cardId: string, readonly back: boolean) {
    super(message);
  }
}

export async function* cardArchiveBatches(faces: ReturnType<typeof imageFaces>, options: {
  geometry: ReturnType<typeof imageGeometry>; fill: BleedFill; color: string; format: ImageFormat;
  dpi: number; quality: number; copies: boolean;
}, locale: Locale = 'it') {
  const output = document.createElement('canvas');
  const source = document.createElement('canvas');
  const numbering = new Map<string, { first: number; count: number }>();
  let next = 1;
  for (const { card, back } of faces) {
    if (!back) {
      const copies = options.copies ? card.count : 1;
      numbering.set(card.id, { first: next, count: copies });
      next += copies;
    }
    const side = back ? 'retro' : 'fronte';
    const name = card.fields.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 72) || 'Carta';
    const label = `${card.fields.name} · ${translate(locale, back ? 'back' : 'front')}`;
    let data: Uint8Array;
    try {
      const warning = await renderCardImage(output, source, card, back, options.geometry, options.fill, options.color);
      if (warning) throw new LocalizedError(warning);
      data = await encodeCardImage(output, options.format, options.dpi, options.quality);
    } catch (cause) {
      throw new CardArchiveFaceError(`${label} · ${errorMessage(cause, locale)}`, card.id, back);
    }
    const { first, count } = numbering.get(card.id)!;
    const paths = Array.from({ length: count }, (_, copy) => {
      const number = String(first + copy).padStart(4, '0');
      return `${side}/${number}-${name}.${options.format}`;
    });
    yield { paths, data };
  }
}
