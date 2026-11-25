import type { FrameDecoration } from '../shared/model.js';
import { cardPaint } from './card-colors.js';
import type { CardPaint } from './card-colors.js';
import { templateBox } from './template-effects.js';

type Motif = Extract<FrameDecoration['source'], { kind: 'motif' }>['motif'];
// Projects saved with preset decorations still use these shapes.
const motifs: Record<Motif, { viewBox: string; shape: string }> = {
  frame: {
    viewBox: '0 0 100 140',
    shape: '<rect x="1" y="1" width="98" height="138" rx="5"/><rect x="3" y="3" width="94" height="134" rx="4" opacity=".55"/><path d="M4 15Q4 4 15 4M85 4Q96 4 96 15M4 125Q4 136 15 136M85 136Q96 136 96 125"/>'
  },
  corners: {
    viewBox: '0 0 100 140',
    shape: '<defs><path id="corner" d="M1 21V7Q1 1 7 1H21M4 17Q4 5 17 4Q9 6 8 11Q7 15 4 17ZM8 11L14 9M6 6L8 6L8 8L6 8Z"/></defs><use href="#corner"/><use href="#corner" transform="translate(100 0) scale(-1 1)"/><use href="#corner" transform="translate(0 140) scale(1 -1)"/><use href="#corner" transform="translate(100 140) scale(-1 -1)"/>'
  },
  flourish: {
    viewBox: '0 0 100 12',
    shape: '<path d="M1 6C18 1 30 1 47 6C34 11 23 11 20 7C17 3 26 2 29 6M99 6C82 1 70 1 53 6C66 11 77 11 80 7C83 3 74 2 71 6M50 2L54 6L50 10L46 6Z"/>'
  },
  seal: {
    viewBox: '0 0 30 30',
    shape: '<path d="M15 1L29 15L15 29L1 15Z M15 5L25 15L15 25L5 15Z M15 9L21 15L15 21L9 15Z M15 12V18 M12 15H18"/>'
  }
};

const motifImages = new Map<Motif, Promise<HTMLImageElement>>();

export function loadMotif(motif: Motif) {
  const cached = motifImages.get(motif);
  if (cached) return cached;
  const { viewBox, shape } = motifs[motif];
  const [, , w, h] = viewBox.split(' ').map(Number);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (w * 10) + '" height="' + (h * 10) +
    '" viewBox="' + viewBox + '" fill="none" stroke="#fff8ea" stroke-width=".8" stroke-linejoin="round" stroke-linecap="round">' + shape + '</svg>';
  const image = new Image();
  image.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  const loaded = image.decode().then(() => image);
  motifImages.set(motif, loaded);
  return loaded;
}

export function drawDecorations(ctx: CanvasRenderingContext2D, layers: { decoration: FrameDecoration; image: HTMLImageElement }[],
  cardColor: CardPaint, textColor: CardPaint) {
  let tintBuffer: HTMLCanvasElement | undefined;
  ctx.save();
  for (const { decoration, image } of layers) {
    if (!decoration.opacity) continue;
    const { x, y, w, h } = templateBox(decoration.rect, ctx.canvas.width, ctx.canvas.height);
    const scale = Math.min(w / image.width, h / image.height);
    const targetW = decoration.fit === 'stretch' ? w : image.width * scale;
    const targetH = decoration.fit === 'stretch' ? h : image.height * scale;
    const left = x + (w - targetW) / 2;
    const top = y + (h - targetH) / 2;
    ctx.globalAlpha = decoration.opacity;
    if (decoration.tint === 'original') {
      ctx.drawImage(image, left, top, targetW, targetH);
      continue;
    }
    tintBuffer ??= document.createElement('canvas');
    tintBuffer.width = Math.max(1, Math.ceil(targetW));
    tintBuffer.height = Math.max(1, Math.ceil(targetH));
    const tint = tintBuffer.getContext('2d')!;
    tint.drawImage(image, 0, 0, tintBuffer.width, tintBuffer.height);
    tint.globalCompositeOperation = 'source-in';
    const color = decoration.tint === 'card' ? cardColor : decoration.tint === 'text' ? textColor : decoration.color;
    tint.fillStyle = cardPaint(tint, color, 0, tintBuffer.width);
    tint.fillRect(0, 0, tintBuffer.width, tintBuffer.height);
    ctx.drawImage(tintBuffer, left, top, targetW, targetH);
  }
  ctx.restore();
}
