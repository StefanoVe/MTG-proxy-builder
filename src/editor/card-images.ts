import { LocalizedError } from '../shared/i18n.js';
import type { Card } from '../shared/model.js';
import { cardHeight, cardWidth } from '../shared/print.js';
import { compose } from './compose.js';

export type Bleed = 'none' | 'mpc' | 'custom';
export type BleedFill = 'mirror' | 'solid';
export type ImageFormat = 'png' | 'jpg';

export function imageGeometry(dpi: number, bleed: Bleed, customMm: number) {
  const width = Math.round(cardWidth * dpi / 25.4);
  const height = Math.round(cardHeight * dpi / 25.4);
  const margin = bleed === 'mpc' ? Math.round(36 * dpi / 300)
    : bleed === 'custom' ? Math.round(customMm * dpi / 25.4) : 0;
  return { width, height, margin, totalWidth: width + 2 * margin, totalHeight: height + 2 * margin };
}

type Geometry = ReturnType<typeof imageGeometry>;

export function drawCardImage(canvas: HTMLCanvasElement, source: HTMLCanvasElement, geometry: Geometry, fill: BleedFill, color: string) {
  const { width, height, margin, totalWidth, totalHeight } = geometry;
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const context = canvas.getContext('2d', { alpha: false })!;
  context.imageSmoothingQuality = 'high';
  if (margin && fill === 'solid') {
    context.fillStyle = color;
    context.fillRect(0, 0, totalWidth, totalHeight);
  }
  context.drawImage(source, margin, margin, width, height);
  if (!margin || fill !== 'mirror') return;

  // Reflect the finished card at each trim edge, including the corners.
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      if (!x && !y) continue;
      context.save();
      context.beginPath();
      context.rect(x < 0 ? 0 : x > 0 ? margin + width : margin, y < 0 ? 0 : y > 0 ? margin + height : margin,
        x ? margin : width, y ? margin : height);
      context.clip();
      context.translate(x > 0 ? margin + 2 * width : margin, y > 0 ? margin + 2 * height : margin);
      context.scale(x ? -1 : 1, y ? -1 : 1);
      context.drawImage(source, 0, 0, width, height);
      context.restore();
    }
  }
}

export function imageFaces(cards: Card[], backs: boolean) {
  return cards.flatMap(card => {
    const front = { card, back: false };
    return backs && card.source.images.back ? [front, { card, back: true }] : [front];
  });
}

export async function renderCardImage(canvas: HTMLCanvasElement, source: HTMLCanvasElement, card: Card, back: boolean,
  geometry: Geometry, fill: BleedFill, color: string) {
  const { warning } = await compose(source, card, back);
  drawCardImage(canvas, source, geometry, fill, color);
  return warning;
}

function withPrintDensity(bytes: Uint8Array, format: ImageFormat, dpi: number) {
  if (format === 'jpg') {
    // Add JFIF density immediately after the JPEG start-of-image marker.
    const jfif = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
    const hasJfif = bytes[2] === 255 && bytes[3] === 224 && bytes[6] === 74 && bytes[7] === 70 &&
      bytes[8] === 73 && bytes[9] === 70 && bytes[10] === 0;
    if (hasJfif) {
      bytes.set(jfif.subarray(11, 16), 13);
      return bytes;
    }
    const result = new Uint8Array(bytes.length + jfif.length);
    result.set(bytes.subarray(0, 2));
    result.set(jfif, 2);
    result.set(bytes.subarray(2), 2 + jfif.length);
    return result;
  }

  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  const density = Math.round(dpi / 0.0254);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, density);
  view.setUint32(12, density);
  chunk[16] = 1;
  let crc = -1;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, ~crc);

  const original = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const afterHeader = 33;
  for (let offset = afterHeader; offset + 12 <= bytes.length;) {
    const length = original.getUint32(offset);
    const type = original.getUint32(offset + 4);
    if (type === 0x70485973 && length === 9) {
      bytes.set(chunk, offset);
      return bytes;
    }
    if (type === 0x49444154) break;
    offset += length + 12;
  }
  const result = new Uint8Array(bytes.length + chunk.length);
  result.set(bytes.subarray(0, afterHeader));
  result.set(chunk, afterHeader);
  result.set(bytes.subarray(afterHeader), afterHeader + chunk.length);
  return result;
}

export async function encodeCardImage(canvas: HTMLCanvasElement, format: ImageFormat, dpi: number, quality: number) {
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob?.type === type) resolve(blob);
      else reject(new LocalizedError('encodeImageFailed'));
    }, type, quality / 100);
  });
  return withPrintDensity(new Uint8Array(await blob.arrayBuffer()), format, dpi);
}
