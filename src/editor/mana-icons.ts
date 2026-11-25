import { manaFile, manaSymbol, manaTokens, symbolPattern } from '../shared/mana.js';
import { assetURL } from '../shared/model.js';
import type { SymbolOverrides } from '../shared/model.js';

const artwork = import.meta.glob<string>('./mana-assets/*.svg', { query: '?raw', import: 'default', eager: true });
const loaded = new Map<string, Promise<HTMLImageElement | undefined>>();

export function defaultSymbolURL(symbol: string) {
  const svg = artwork[`./mana-assets/${manaFile(symbol)}.svg`];
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : undefined;
}

async function readIcon(url: string, asset: boolean) {
  const image = new Image();
  if (asset) image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return image;
}

function loadSymbol(symbol: string, asset?: string) {
  const key = asset ?? symbol;
  const cached = loaded.get(key);
  if (cached) return cached;
  const url = asset ? assetURL(asset) : defaultSymbolURL(symbol);
  if (!url) return Promise.resolve(undefined);
  if (loaded.size >= 100) loaded.delete(loaded.keys().next().value!);
  const request = readIcon(url, !!asset).catch(() => {
    if (loaded.get(key) === request) loaded.delete(key);
    return undefined;
  });
  loaded.set(key, request);
  return request;
}

export async function manaIcons(cost: string, rules: string, overrides?: SymbolOverrides) {
  const symbols = new Set([...manaTokens(cost), ...[...rules.matchAll(symbolPattern)].map(item => item[1])]
    .map(manaSymbol).filter(symbol => symbol !== undefined));
  const icons = new Map<string, HTMLImageElement>();
  await Promise.all([...symbols].map(async symbol => {
    const asset = overrides?.[symbol]?.asset;
    const image = (asset ? await loadSymbol(symbol, asset) : undefined) ?? await loadSymbol(symbol);
    if (image) icons.set(symbol, image);
  }));
  return icons;
}

export function drawSymbol(ctx: CanvasRenderingContext2D, icons: Map<string, HTMLImageElement>, token: string,
  x: number, y: number, size: number, ink: string | CanvasGradient) {
  const info = manaSymbol(token);
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
