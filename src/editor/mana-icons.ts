import { manaFile, manaTokens, symbolPattern } from '../shared/mana.js';

const artwork = import.meta.glob<string>('./mana-assets/*.svg', { query: '?raw', import: 'default', eager: true });
const loaded = new Map<string, Promise<HTMLImageElement | undefined>>();

async function readIcon(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function manaIcons(cost: string, rules: string) {
  const files = new Set([...manaTokens(cost), ...[...rules.matchAll(symbolPattern)].map(item => item[1])]
    .flatMap(token => {
      const file = manaFile(token);
      return file ? [file] : [];
    }));
  const icons = new Map<string, HTMLImageElement>();
  await Promise.all([...files].map(async file => {
    let request = loaded.get(file);
    if (!request) {
      const svg = artwork[`./mana-assets/${file}.svg`];
      request = svg ? readIcon(`data:image/svg+xml,${encodeURIComponent(svg)}`).catch(() => undefined)
        : Promise.resolve(undefined);
      loaded.set(file, request);
    }
    const image = await request;
    if (image) icons.set(file, image);
  }));
  return icons;
}

export function drawSymbol(ctx: CanvasRenderingContext2D, icons: Map<string, HTMLImageElement>, token: string,
  x: number, y: number, size: number, ink: string) {
  const info = manaFile(token);
  const icon = info ? icons.get(info) : undefined;
  const iconWidth = icon?.naturalWidth || icon?.width || 0;
  const iconHeight = icon?.naturalHeight || icon?.height || 0;
  if (icon && iconWidth && iconHeight) {
    const scale = Math.min(size / iconWidth, size / iconHeight);
    const w = iconWidth * scale, h = iconHeight * scale;
    ctx.drawImage(icon, x + (size - w) / 2, y + (size - h) / 2, w, h);
    return;
  }
  ctx.save();
  ctx.font = `${Math.max(9, size * 0.72)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.fillText(`{${token}}`, x + size / 2, y + size / 2, size);
  ctx.restore();
}
