import { LocalizedError } from '../shared/i18n.js';
import type { MessageKey } from '../shared/i18n.js';
import { cardZones } from './card-zones.js';
import { blendColorFrames } from './color-frames.js';
import { colorFrameLayers } from '../shared/frame-colors.js';
import { templateAppearance } from '../shared/templates.js';
import { blurTemplateArt, drawTemplateDividers, shadeTemplate, templateBox as box } from './template-effects.js';
import { drawDecorations, loadMotif } from './template-decorations.js';
import { manaTokens, ruleWords } from '../shared/mana.js';
import type { RuleRun } from '../shared/mana.js';
import { drawSymbol, manaIcons } from './mana-icons.js';
import { assetURL, defaultZones } from '../shared/model.js';
import type { Card, Rect, Tone } from '../shared/model.js';
import { findArtWindow, findTransparentArtWindow } from '../shared/art-window.js';
import { pixels } from '../shared/print.js';

const width = pixels.width;
const height = pixels.height;
const colors: Record<Exclude<Tone, 'auto'>, [string, string]> = {
  white: ['#beb49b', '#f8eed7'], blue: ['#387184', '#d6eff1'], black: ['#554a5a', '#e8dfe8'],
  red: ['#a4513a', '#f6e2ce'], green: ['#476649', '#e0ebd2'], multi: ['#9c783f', '#f3e7be'],
  artifact: ['#69767c', '#e1e9e6'], land: ['#79614e', '#efe5d0']
};
const colorNames = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' } as const;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(id: string) {
  const cached = imageCache.get(id);
  if (cached) return cached;
  if (imageCache.size >= 24) imageCache.delete(imageCache.keys().next().value!);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = assetURL(id);
  const loaded = image.decode().then(() => image).catch(() => {
    imageCache.delete(id);
    throw new LocalizedError('assetUnavailable');
  });
  imageCache.set(id, loaded);
  return loaded;
}

export async function pngArtZone(id: string): Promise<Rect | undefined> {
  const canvas = document.createElement('canvas');
  canvas.width = 126;
  canvas.height = 176;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(await loadImage(id), 0, 0, canvas.width, canvas.height);
  return findTransparentArtWindow(context.getImageData(0, 0, canvas.width, canvas.height));
}

const detectedWindows = new Map<string, Promise<Rect | undefined>>();

export function detectedArtZone(card: Card): Promise<Rect | undefined> {
  const { front, art } = card.source.images;
  if (!front || !art || card.source.details?.layeredArt === false) return Promise.resolve(undefined);
  const key = front + art;
  const cached = detectedWindows.get(key);
  if (cached) return cached;
  if (detectedWindows.size >= 200) detectedWindows.delete(detectedWindows.keys().next().value!);
  const result = Promise.all([loadImage(front), loadImage(art)]).then(([scan, illustration]) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    function raster(image: HTMLImageElement, width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    }
    return findArtWindow(raster(scan, 126, 176), raster(illustration, 96, 96), illustration.width / illustration.height);
  }).catch(() => {
    detectedWindows.delete(key);
    return undefined;
  });
  detectedWindows.set(key, result);
  return result;
}

function drawRect(ctx: CanvasRenderingContext2D, r: Rect, fill: string, radius: number, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function artwork(ctx: CanvasRenderingContext2D, image: HTMLImageElement, r: Rect, crop: Card['crop']) {
  const scale = Math.max(r.w / image.width, r.h / image.height) * crop.zoom;
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.drawImage(image, r.x - (w - r.w) * (1 - crop.x) / 2, r.y - (h - r.h) * (1 - crop.y) / 2, w, h);
  ctx.restore();
}

function toneOf(card: Card): Exclude<Tone, 'auto'> {
  if ((card.frame.kind === 'modern' || card.frame.kind === 'classic') && card.frame.tone !== 'auto') return card.frame.tone;
  if (card.frame.kind === 'template') {
    const colorKeys = card.source.colors.length || card.source.printingId ? card.source.colors
      : [...new Set(manaTokens(card.fields.mana).flatMap(token => token.toUpperCase().split('/')).filter(
        (part): part is keyof typeof colorNames => Object.hasOwn(colorNames, part)
      ))];
    if (colorKeys.length > 1) return 'multi';
    if (colorKeys.length === 1) return colorNames[colorKeys[0]];
  }
  if (/\b(land|terra)\b/i.test(card.fields.type)) return 'land';
  if (card.source.colors.length > 1) return 'multi';
  return colorNames[card.source.colors[0]] ?? 'artifact';
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, r: Rect, max: number, font: string, color = '#24211e', align: CanvasTextAlign = 'left') {
  if (!text || r.w < 2) return;
  const size = Math.min(max, r.h * 0.72);
  ctx.font = `${size}px ${font}`;
  const measured = ctx.measureText(text).width;
  ctx.font = `${Math.max(12, Math.min(size, size * r.w / measured))}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, r.x + (align === 'center' ? r.w / 2 : 0), r.y + r.h / 2, r.w);
}

function canvasFontFamily(family?: string) {
  if (!family || family === 'serif') return 'Georgia, serif';
  if (family === 'sans') return 'Arial, sans-serif';
  if (family === 'system') return 'system-ui, sans-serif';
  return `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}", sans-serif`;
}

function drawRules(ctx: CanvasRenderingContext2D, text: string, r: Rect, ink: string, icons: Map<string, HTMLImageElement>, font: string) {
  if (!text) return true;
  const paragraphs = text.split('\n').map(ruleWords);
  let size = 31;
  let lines: RuleRun[][][] = [];
  const measure = (run: RuleRun) => run.symbol ? size * (0.96 + 0.14) : ctx.measureText(run.text).width;
  let fits = false;
  for (; size >= 14; size--) {
    ctx.font = `${size}px ${font}`;
    lines = [];
    let widest = 0;
    const spacing = ctx.measureText(' ').width;
    for (const paragraph of paragraphs) {
      let line: RuleRun[][] = [];
      let used = 0;
      for (const word of paragraph) {
        const w = word.reduce((sum, run) => sum + measure(run), 0);
        if (line.length && used + spacing + w > r.w) {
          lines.push(line);
          widest = Math.max(widest, used);
          line = [];
          used = 0;
        }
        used += (line.length ? spacing : 0) + w;
        line.push(word);
      }
      lines.push(line);
      widest = Math.max(widest, used);
    }
    if (lines.length * size * 1.2 <= r.h && widest <= r.w) { fits = true; break; }
  }
  size = Math.max(size, 14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = ink;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    let x = r.x;
    const y = r.y + (i + 0.5) * size * 1.2;
    for (const word of line) {
      for (const run of word) {
        if (run.symbol) drawSymbol(ctx, icons, run.text, x, y - size * 0.48, size * 0.96, ink);
        else ctx.fillText(run.text, x, y);
        x += measure(run);
      }
      x += space;
    }
  });
  ctx.restore();
  return fits;
}

function framedPrinting(ctx: CanvasRenderingContext2D, scan: HTMLImageElement, art: HTMLImageElement, rect: Rect, crop: Card['crop']) {
  const hole = box(rect);
  drawRect(ctx, hole, '#1a1d1d', 0);
  artwork(ctx, art, hole, crop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(hole.x, hole.y, hole.w, hole.h);
  ctx.clip('evenodd');
  ctx.drawImage(scan, 0, 0, width, height);
  ctx.restore();
}

export async function compose(canvas: HTMLCanvasElement, card: Card, back = false): Promise<{ warning?: MessageKey }> {
  const artId = card.art ?? card.source.images.art;
  const template = card.frame.kind === 'template' ? card.frame.template : undefined;
  const hidden = new Set(card.hiddenZones ?? []);
  const baseAppearance = card.frame.kind === 'template' ? templateAppearance(card.frame) : undefined;
  const effectHidden = (anchor: 'title' | 'type' | 'rules' | 'manual' | undefined, fallback: 'title' | 'rules') =>
    anchor !== 'manual' && hidden.has(anchor ?? fallback);
  const appearance = baseAppearance ? { ...baseAppearance, ...card.dividerOverrides, zones: cardZones(card),
    titleBlur: effectHidden(baseAppearance.topEffect?.anchor, 'title') ? 0 : baseAppearance.titleBlur,
    titleShade: effectHidden(baseAppearance.topEffect?.anchor, 'title') ? 0 : baseAppearance.titleShade,
    rulesBlur: effectHidden(baseAppearance.bottomEffect?.anchor, 'rules') ? 0 : baseAppearance.rulesBlur,
    rulesShade: effectHidden(baseAppearance.bottomEffect?.anchor, 'rules') ? 0 : baseAppearance.rulesShade,
    titleDivider: hidden.has('title') ? false : card.dividerOverrides?.titleDivider ?? baseAppearance.titleDivider,
    divider: hidden.has('rules') ? false : card.dividerOverrides?.divider ?? baseAppearance.divider
  } : undefined;
  const set = card.frame.kind === 'color-set' ? card.frame.set : undefined;
  const frameId = card.frame.kind === 'custom' ? card.frame.asset : appearance?.overlay;
  const actualPrinting = card.frame.kind === 'printing' || !card.source.editable;
  const printedId = back ? card.source.images.back : actualPrinting ? card.source.images.front : undefined;
  const replacement = !back && actualPrinting && card.source.editable ? card.art : undefined;
  const [art, sourceOverlay, printed, icons, colorFrames, decorations] = await Promise.all([
    replacement || (!printedId && !actualPrinting && artId) ? loadImage(replacement ?? artId!) : undefined,
    !printedId && frameId ? loadImage(frameId) : undefined,
    printedId ? loadImage(printedId) : undefined,
    !actualPrinting && !back ? manaIcons(card.fields.mana, card.fields.rules) : new Map<string, HTMLImageElement>(),
    set && !actualPrinting && !back ? Promise.all(colorFrameLayers(set, card.source.colors).map(loadImage)) : undefined,
    !actualPrinting && !back ? Promise.all((appearance?.decorations ?? []).filter(layer => layer.opacity > 0).map(async decoration => ({
      decoration,
      image: await (decoration.source.kind === 'motif' ? loadMotif(decoration.source.motif) : loadImage(decoration.source.asset))
    }))) : []
  ]);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#1a1d1d';
  ctx.fillRect(0, 0, width, height);
  if (printed) {
    if (replacement && art) {
      const rect = (card.frame.kind === 'printing' ? card.frame.artZone : undefined) ?? await detectedArtZone(card);
      if (rect) {
        framedPrinting(ctx, printed, art, rect, card.crop);
        return {};
      }
      ctx.drawImage(printed, 0, 0, width, height);
      return { warning: 'adjustArtOrFrame' };
    }
    ctx.drawImage(printed, 0, 0, width, height);
    return {};
  }
  if (back || actualPrinting) throw new LocalizedError('missingScanHelp');
  const overlay = colorFrames && colorFrames.length > 1 ? blendColorFrames(colorFrames, width, height) : colorFrames?.[0] ?? sourceOverlay;
  const zones = cardZones(card);
  const [ink, paper] = colors[toneOf(card)];
  const textColor = (appearance?.autoTextColor ? paper : appearance?.textColor) ?? (card.frame.kind === 'custom' ? card.frame.textColor : undefined) ?? set?.textColor ?? '#24211e';
  const font = canvasFontFamily(appearance?.fontFamily ?? (card.frame.kind === 'custom' ? card.frame.fontFamily : undefined) ?? set?.fontFamily);
  const classic = card.frame.kind === 'classic';
  const illustration = box(zones.art);
  const stats = card.fields.loyalty || card.fields.defense ||
    (card.fields.power || card.fields.toughness ? `${card.fields.power}/${card.fields.toughness}` : '');

  if (!overlay && !template) {
    drawRect(ctx, { x: 23, y: 24, w: width - 46, h: height - 48 }, ink, classic ? 3 : 21, '#0e0f10');
    if (classic) {
      ctx.strokeStyle = '#cfbc87';
      ctx.lineWidth = 3;
      ctx.strokeRect(31, 33, width - 62, height - 66);
    }
    if (!hidden.has('title')) drawRect(ctx, { x: 37, y: 42, w: width - 74, h: 69 }, paper, classic ? 1 : 12, '#302b25');
    if (!hidden.has('type')) drawRect(ctx, { x: 37, y: 623, w: width - 74, h: 64 }, paper, classic ? 1 : 10, '#302b25');
    if (!hidden.has('rules')) drawRect(ctx, { x: 37, y: 693, w: width - 74, h: 254 }, paper, classic ? 1 : 12, '#302b25');
    if (stats && !hidden.has('stats')) drawRect(ctx, box(zones.stats), paper, classic ? 1 : 12, '#302b25');
  }
  if (!hidden.has('art')) {
    drawRect(ctx, illustration, '#343b3d', 0);
    if (art) artwork(ctx, art, illustration, card.crop);
  }
  if (template && appearance) blurTemplateArt(ctx, template, appearance);
  if (overlay) ctx.drawImage(overlay, 0, 0, width, height);
  if (template && appearance) {
    shadeTemplate(ctx, template, appearance);
    drawDecorations(ctx, decorations, paper, textColor);
    drawTemplateDividers(ctx, appearance, paper);
  }

  const title = box(zones.title);
  const mana = manaTokens(card.fields.mana);
  const manaGap = 4;
  const diameter = Math.min(41, title.h * 0.78, (title.w * 0.62 - manaGap * Math.max(0, mana.length - 1)) / Math.max(1, mana.length));
  const manaWidth = mana.length * diameter + manaGap * Math.max(0, mana.length - 1);
  if (!hidden.has('title')) fitLine(ctx, card.fields.name, { ...title, w: title.w - manaWidth - (mana.length ? 10 : 0) }, 43, font, textColor);
  if (!hidden.has('title')) mana.forEach((token, index) => drawSymbol(ctx, icons, token, title.x + title.w - manaWidth + index * (diameter + manaGap),
    title.y + (title.h - diameter) / 2, diameter, textColor));
  if (!hidden.has('type')) fitLine(ctx, card.fields.type, box(zones.type), 32, font, textColor);
  if (stats && !hidden.has('stats')) fitLine(ctx, stats, box(zones.stats), 34, font, textColor, 'center');
  const result = hidden.has('rules') || drawRules(ctx, card.fields.rules, box(zones.rules), textColor, icons, font);
  if (template) {
    fitLine(ctx, card.fields.artist, { x: width * 0.06, y: height * 0.965, w: width * 0.88, h: 23 }, 19, font, textColor);
  } else if (!overlay) {
    fitLine(ctx, card.fields.artist, { x: 49, y: 960, w: width - 90, h: 26 }, 21, font, textColor);
  } else {
    fitLine(ctx, card.fields.artist, { x: 26, y: height - 33, w: width - 52, h: 29 }, 20, font, textColor);
  }
  if ((template || set) && !art && !hidden.has('art')) return { warning: 'addArtHelp' };
  return result && (hidden.has('title') || mana.length === 0 || diameter >= 7) ? {} : { warning: 'textOverflow' };
}
