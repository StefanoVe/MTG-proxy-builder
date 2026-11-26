import { LocalizedError } from '../shared/i18n.js';
import type { MessageKey } from '../shared/i18n.js';
import { cardFrameColors, cardPaint, resolveCardColors } from './card-colors.js';
import type { CardPaint } from './card-colors.js';
import { cardZones } from './card-zones.js';
import { blendColorFrames } from './color-frames.js';
import { colorFrameLayers } from '../shared/frame-colors.js';
import { hiddenByCondition } from '../shared/frame-visibility.js';
import { defaultFrameTextAlign, defaultFrameTextSizes, frameAppearance } from '../shared/templates.js';
import { blurTemplateArt, drawTemplateDividers, shadeTemplate, templateBox } from './template-effects.js';
import { drawDecorations, loadMotif } from './template-decorations.js';
import { drawStatsBox, drawStatsRule } from './stats-appearance.js';
import { manaTokens, ruleWords } from '../shared/mana.js';
import type { RuleRun } from '../shared/mana.js';
import { drawSymbol, manaIcons } from './mana-icons.js';
import { assetURL, cardSide, defaultZones, resolveStatsAppearance, sideOrientation } from '../shared/model.js';
import type { Card, FrameTextArea, Rect, StatsAppearance } from '../shared/model.js';
import { findArtWindow, findTransparentArtWindow } from '../shared/art-window.js';
import { pixels } from '../shared/print.js';

const width = pixels.width;
const height = pixels.height;
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

const keyedImages = new Map<string, HTMLCanvasElement>();

async function statsImage(id: string, transparentColor?: string | null) {
  const image = await loadImage(id);
  if (!transparentColor) return image;
  const key = id + transparentColor;
  const cached = keyedImages.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = parseInt(transparentColor.slice(1), 16);
  const [red, green, blue] = [rgb >> 16, rgb >> 8 & 255, rgb & 255];
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i] === red && pixels.data[i + 1] === green && pixels.data[i + 2] === blue) pixels.data[i + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  if (keyedImages.size >= 4) keyedImages.delete(keyedImages.keys().next().value!);
  keyedImages.set(key, canvas);
  return canvas;
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

function drawRect(ctx: CanvasRenderingContext2D, r: Rect, fill: CardPaint, radius: number, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = cardPaint(ctx, fill, r.x, r.w);
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawOriginalStatsBox(ctx: CanvasRenderingContext2D, r: Rect, fill: CardPaint, radius: number,
  style: StatsAppearance, border?: CardPaint) {
  if (style.fill === undefined && style.borderColor === undefined && style.borderWidth === undefined && style.opacity === undefined && !border) {
    drawRect(ctx, r, fill, radius, '#302b25');
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = cardPaint(ctx, style.fill ?? fill, r.x, r.w);
  ctx.save();
  ctx.globalAlpha *= (style.opacity ?? 100) / 100;
  ctx.fill();
  ctx.restore();
  if ((style.borderWidth ?? 3) > 0) {
    ctx.lineWidth = style.borderWidth ?? 3;
    ctx.strokeStyle = border ? cardPaint(ctx, border, r.x, r.w) : style.borderColor ?? '#302b25';
    ctx.stroke();
  }
  ctx.restore();
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

type StatsPair = { power: string; toughness: string; divider?: Parameters<typeof drawStatsRule>[2]; image?: HTMLCanvasElement | HTMLImageElement; color?: CardPaint };

function fitLine(ctx: CanvasRenderingContext2D, text: string, r: Rect, max: number, font: string, color: CardPaint,
  align: CanvasTextAlign, customSize?: number, pair?: StatsPair, outline?: string | null, dividerGap = 0) {
  if (!text || r.w < 2) return;
  const size = customSize ?? Math.min(max, r.h * 0.72);
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const dividerWidth = pair && !pair.divider && !pair.image ? ctx.measureText('/').width / size : .62;
  const baseWidth = pair ? ctx.measureText(pair.power).width + ctx.measureText(pair.toughness).width + size * dividerWidth : metrics.width;
  const gapForFit = pair ? Math.min(dividerGap, Math.max(0, (r.w - baseWidth) / 2)) : 0;
  const measuredWidth = baseWidth + 2 * gapForFit;
  const fitted = Math.min(size, size * r.w / measuredWidth);
  const finalSize = customSize === undefined ? Math.max(12, fitted)
    : Math.min(fitted, size * r.h / (2 * Math.max(metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent)));
  ctx.font = `${finalSize}px ${font}`;
  const alignment = align === 'center' ? .5 : align === 'right' ? 1 : 0;
  const x = r.x + r.w * alignment;
  const y = r.y + r.h / 2;
  function drawValue(value: string, left: number, top: number, maxWidth?: number) {
    if (outline) {
      ctx.save();
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1, finalSize * .09);
      ctx.lineJoin = 'round';
      ctx.strokeText(value, left, top, maxWidth);
      ctx.restore();
    }
    ctx.fillText(value, left, top, maxWidth);
  }
  if (pair) {
    const powerWidth = ctx.measureText(pair.power).width;
    const dividerWidthPx = finalSize * dividerWidth;
    const extraGap = Math.min(dividerGap, Math.max(0, (r.w - powerWidth - dividerWidthPx - ctx.measureText(pair.toughness).width) / 2));
    const fullWidth = powerWidth + dividerWidthPx + 2 * extraGap + ctx.measureText(pair.toughness).width;
    const scale = Math.min(1, r.w / fullWidth);
    const glyphHeight = Math.min(finalSize * .9, r.h);
    ctx.save();
    ctx.translate(x - fullWidth * scale * alignment, y);
    ctx.scale(scale, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = cardPaint(ctx, color, 0, fullWidth);
    const drawCenteredValue = (value: string, left: number) => {
      const { actualBoundingBoxAscent, actualBoundingBoxDescent } = ctx.measureText(value);
      drawValue(value, left, (actualBoundingBoxAscent - actualBoundingBoxDescent) / 2);
    };
    drawCenteredValue(pair.power, 0);
    ctx.save();
    if (pair.color) ctx.fillStyle = cardPaint(ctx, pair.color, powerWidth + extraGap, dividerWidthPx);
    if (pair.image) {
      const factor = Math.min(dividerWidthPx / pair.image.width, glyphHeight / pair.image.height);
      const w = pair.image.width * factor, h = pair.image.height * factor;
      ctx.drawImage(pair.image, powerWidth + extraGap + (dividerWidthPx - w) / 2, -h / 2, w, h);
    } else if (pair.divider) drawStatsRule(ctx, { x: powerWidth + extraGap, y: -glyphHeight / 2, w: dividerWidthPx, h: glyphHeight }, pair.divider);
    else drawCenteredValue('/', powerWidth + extraGap);
    ctx.restore();
    drawCenteredValue(pair.toughness, powerWidth + dividerWidthPx + 2 * extraGap);
    ctx.restore();
    return;
  }
  const textWidth = Math.min(r.w, ctx.measureText(text).width);
  ctx.fillStyle = cardPaint(ctx, color, x - textWidth * alignment, textWidth);
  drawValue(text, x, y, r.w);
}

function canvasFontFamily(family?: string) {
  if (!family || family === 'serif') return 'Georgia, serif';
  if (family === 'sans') return 'Arial, sans-serif';
  if (family === 'system') return 'system-ui, sans-serif';
  return `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}", sans-serif`;
}

function drawRules(ctx: CanvasRenderingContext2D, text: string, r: Rect, ink: CardPaint, icons: Map<string, HTMLImageElement>, font: string,
  max: number, align: CanvasTextAlign) {
  if (!text) return true;
  const paragraphs = text.split('\n').map(ruleWords);
  let size = max;
  const min = Math.min(14, max);
  let lines: RuleRun[][][] = [];
  const measure = (run: RuleRun) => run.symbol ? size * (0.96 + 0.14) : ctx.measureText(run.text).width;
  let fits = false;
  for (; size >= min; size--) {
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
  size = Math.max(size, min);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    const lineWidth = line.reduce((sum, word, index) =>
      sum + word.reduce((wordWidth, run) => wordWidth + measure(run), 0) + (index ? space : 0), 0);
    const free = Math.max(0, r.w - lineWidth);
    let x = r.x + (align === 'center' ? free / 2 : align === 'right' ? free : 0);
    const y = r.y + (i + 0.5) * size * 1.2;
    const paint = cardPaint(ctx, ink, x, Math.min(r.w, lineWidth));
    ctx.fillStyle = paint;
    for (const word of line) {
      for (const run of word) {
        if (run.symbol) drawSymbol(ctx, icons, run.text, x, y - size * 0.48, size * 0.96, paint);
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
  const { width, height } = ctx.canvas;
  const hole = templateBox(rect, width, height);
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
  if (back) return compose(canvas, cardSide(card, true));
  const landscape = sideOrientation(card) === 'landscape';
  const width = landscape ? pixels.height : pixels.width;
  const height = landscape ? pixels.width : pixels.height;
  const box = (zone: Rect) => templateBox(zone, width, height);
  const artId = card.art ?? card.source.images.art;
  const template = card.frame.kind === 'template' ? card.frame.template : undefined;
  const hidden = new Set(card.hiddenZones ?? []);
  const baseAppearance = frameAppearance(card.frame);
  const effectHidden = (anchor: 'title' | 'type' | 'rules' | 'manual' | undefined, fallback: 'title' | 'rules') =>
    anchor !== 'manual' && hidden.has(anchor ?? fallback);
  const appearance = baseAppearance ? { ...baseAppearance, ...card.dividerOverrides, zones: cardZones(card),
    titleBlur: effectHidden(baseAppearance.topEffect?.anchor, 'title') ? 0 : baseAppearance.titleBlur,
    titleShade: effectHidden(baseAppearance.topEffect?.anchor, 'title') ? 0 : baseAppearance.titleShade,
    rulesBlur: effectHidden(baseAppearance.bottomEffect?.anchor, 'rules') ? 0 : baseAppearance.rulesBlur,
    rulesShade: effectHidden(baseAppearance.bottomEffect?.anchor, 'rules') ? 0 : baseAppearance.rulesShade,
    titleDivider: hidden.has('title') || hiddenByCondition(baseAppearance.titleDividerHideWhen, card.fields)
      ? false : card.dividerOverrides?.titleDivider ?? baseAppearance.titleDivider,
    divider: hidden.has('rules') || hiddenByCondition(baseAppearance.dividerHideWhen, card.fields)
      ? false : card.dividerOverrides?.divider ?? baseAppearance.divider
  } : undefined;
  const set = card.frame.kind === 'color-set' ? card.frame.set : undefined;
  const frameId = card.frame.kind === 'custom' ? card.frame.asset : undefined;
  const actualPrinting = card.frame.kind === 'printing' || !card.source.editable;
  const printedId = back ? card.source.images.back : actualPrinting ? card.source.images.front : undefined;
  const replacement = !back && actualPrinting && card.source.editable ? card.art : undefined;
  const stats = card.fields.loyalty || card.fields.defense ||
    (card.fields.power || card.fields.toughness ? `${card.fields.power}/${card.fields.toughness}` : '');
  const showStats = !!stats && !hidden.has('stats');
  const kind = card.fields.loyalty ? 'loyalty' : card.fields.defense ? 'defense' : 'pair';
  const style = resolveStatsAppearance(appearance?.statsAppearance, card.statsOverrides, kind);
  const useStatsImages = showStats && !actualPrinting && !back;
  const [art, sourceOverlay, extraOverlay, printed, icons, colorFrames, boxImage, dividerImage, decorations] = await Promise.all([
    replacement || (!printedId && !actualPrinting && artId) ? loadImage(replacement ?? artId!) : undefined,
    !printedId && frameId ? loadImage(frameId) : undefined,
    !actualPrinting && appearance?.overlay ? loadImage(appearance.overlay) : undefined,
    printedId ? loadImage(printedId) : undefined,
    !actualPrinting && !back ? manaIcons(card.fields.mana, card.fields.rules, appearance?.symbolOverrides) : new Map<string, HTMLImageElement>(),
    set && !actualPrinting && !back ? Promise.all(colorFrameLayers(set, cardFrameColors(card)).map(loadImage)) : undefined,
    useStatsImages && style.boxAsset ? statsImage(style.boxAsset, style.transparentColor) : undefined,
    useStatsImages && style.dividerAsset && !card.fields.loyalty && !card.fields.defense ? statsImage(style.dividerAsset, style.transparentColor) : undefined,
    !actualPrinting && !back ? Promise.all((appearance?.decorations ?? []).filter(layer =>
      layer.opacity > 0 && !hiddenByCondition(layer.hideWhen, card.fields)).map(async decoration => ({
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
    const scanLandscape = printed.naturalWidth > printed.naturalHeight;
    if (scanLandscape !== landscape) {
      ctx.save();
      if (landscape) { ctx.translate(width, 0); ctx.rotate(Math.PI / 2); }
      else { ctx.translate(0, height); ctx.rotate(-Math.PI / 2); }
      ctx.drawImage(printed, 0, 0, height, width);
      ctx.restore();
      return replacement ? { warning: 'adjustArtOrFrame' } : {};
    }
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
  const autoTextColors = appearance?.autoTextColors ?? {};
  const hasBoxPaint = style.fill !== undefined || style.borderColor !== undefined ||
    style.borderWidth !== undefined || style.opacity !== undefined || !!autoTextColors.statsBox;
  const styledStatsBox = style.box && style.box !== 'original' ? style.box
    : hasBoxPaint && (overlay || extraOverlay || template) ? 'rounded' : undefined;
  const zones = cardZones(card);
  const { cardColor, border, panel } = resolveCardColors(card, appearance?.symbolOverrides);
  const textColor = appearance?.textColor ?? '#24211e';
  const colorForText = (area: FrameTextArea) => autoTextColors[area] ? cardColor : textColor;
  const font = canvasFontFamily(appearance?.fontFamily);
  const classic = card.frame.kind === 'classic';
  const illustration = box(zones.art);
  if (!overlay && !template) {
    ctx.save();
    ctx.scale(width / pixels.width, height / pixels.height);
    const baseWidth = pixels.width, baseHeight = pixels.height;
    drawRect(ctx, { x: 23, y: 24, w: baseWidth - 46, h: baseHeight - 48 }, border, classic ? 3 : 21, '#0e0f10');
    if (classic) {
      ctx.strokeStyle = '#cfbc87';
      ctx.lineWidth = 3;
      ctx.strokeRect(31, 33, baseWidth - 62, baseHeight - 66);
    }
    if (!hidden.has('title')) drawRect(ctx, { x: 37, y: 42, w: baseWidth - 74, h: 69 }, panel, classic ? 1 : 12, '#302b25');
    if (!hidden.has('type')) drawRect(ctx, { x: 37, y: 623, w: baseWidth - 74, h: 64 }, panel, classic ? 1 : 10, '#302b25');
    if (!hidden.has('rules')) drawRect(ctx, { x: 37, y: 693, w: baseWidth - 74, h: 254 }, panel, classic ? 1 : 12, '#302b25');
    if (showStats && !styledStatsBox && !boxImage)
      drawOriginalStatsBox(ctx, templateBox(zones.stats), panel, classic ? 1 : 12, style, autoTextColors.statsBox ? cardColor : undefined);
    ctx.restore();
  }
  if (!hidden.has('art')) {
    drawRect(ctx, illustration, '#343b3d', 0);
    if (art) artwork(ctx, art, illustration, card.crop);
  }
  if (appearance) blurTemplateArt(ctx, appearance);
  if (overlay) ctx.drawImage(overlay, 0, 0, width, height);
  if (extraOverlay) ctx.drawImage(extraOverlay, 0, 0, width, height);
  if (appearance) {
    shadeTemplate(ctx, appearance);
    drawDecorations(ctx, decorations, cardColor, textColor);
    drawTemplateDividers(ctx, appearance, cardColor);
  }

  const title = box(zones.title);
  const textSize = (area: FrameTextArea) => card.textStyleOverrides?.[area]?.size ?? appearance?.textStyles?.[area]?.size;
  const textAlign = (area: FrameTextArea) =>
    card.textAlignOverrides?.[area] ?? appearance?.textStyles?.[area]?.align ?? defaultFrameTextAlign(area);
  const drawLine = (area: FrameTextArea, text: string, rect: Rect, fallback = defaultFrameTextSizes[area]) =>
    fitLine(ctx, text, rect, fallback, font, colorForText(area), textAlign(area), textSize(area));
  const mana = manaTokens(card.fields.mana);
  const manaGap = 4;
  const diameter = Math.min(41, title.h * 0.78, (title.w * 0.62 - manaGap * Math.max(0, mana.length - 1)) / Math.max(1, mana.length));
  const manaWidth = mana.length * diameter + manaGap * Math.max(0, mana.length - 1);
  if (!hidden.has('title')) drawLine('title', card.fields.name, { ...title, w: title.w - manaWidth - (mana.length ? 10 : 0) });
  if (!hidden.has('title')) mana.forEach((token, index) => {
    const x = title.x + title.w - manaWidth + index * (diameter + manaGap);
    drawSymbol(ctx, icons, token, x, title.y + (title.h - diameter) / 2, diameter, cardPaint(ctx, colorForText('title'), x, diameter));
  });
  if (!hidden.has('type')) drawLine('type', card.fields.type, box(zones.type));
  if (showStats) {
    const rect = box(zones.stats);
    const rgb = parseInt((style.ink ?? textColor).slice(1), 16);
    const lightText = .299 * (rgb >> 16) + .587 * (rgb >> 8 & 255) + .114 * (rgb & 255) >= 140;
    const color = appearance?.accent ?? (lightText ? cardColor : border);
    const divider = style.divider && style.divider !== 'original' ? style.divider : undefined;
    let textRect = rect;
    if (boxImage) {
      ctx.save();
      ctx.globalAlpha = (style.opacity ?? 100) / 100;
      ctx.drawImage(boxImage, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    } else if (styledStatsBox) {
      textRect = drawStatsBox(ctx, rect, styledStatsBox, autoTextColors.statsBox ? cardColor : style.borderColor ?? color,
        style.fill ?? (lightText ? '#17191e' : '#faf6ed'), style.borderWidth, style.opacity);
    }
    const { power, toughness, loyalty, defense } = card.fields;
    const pair = !loyalty && !defense
      ? { power, toughness, divider, image: dividerImage, color: autoTextColors.statsDivider ? cardColor : style.ruleColor } : undefined;
    const hasPadding = style.paddingTop !== undefined || style.paddingRight !== undefined ||
      style.paddingBottom !== undefined || style.paddingLeft !== undefined;
    if (hasPadding) {
      // The box style may already reserve space for its outline or corners.
      const left = Math.min(rect.x + rect.w, Math.max(rect.x, textRect.x + (style.paddingLeft ?? 0)));
      const top = Math.min(rect.y + rect.h, Math.max(rect.y, textRect.y + (style.paddingTop ?? 0)));
      const right = Math.max(left, Math.min(rect.x + rect.w, textRect.x + textRect.w - (style.paddingRight ?? 0)));
      const bottom = Math.max(top, Math.min(rect.y + rect.h, textRect.y + textRect.h - (style.paddingBottom ?? 0)));
      textRect = { x: left, y: top, w: right - left, h: bottom - top };
    }
    if (textRect.w > 0 && textRect.h > 0) {
      if (hasPadding) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(textRect.x, textRect.y, textRect.w, textRect.h);
        ctx.clip();
      }
      fitLine(ctx, stats, textRect, defaultFrameTextSizes.stats, font, autoTextColors.stats ? cardColor : style.ink ?? textColor, textAlign('stats'),
        style.size ?? textSize('stats'), pair, style.outline, style.dividerGap);
      if (hasPadding) ctx.restore();
    }
  }
  const result = hidden.has('rules') || drawRules(ctx, card.fields.rules, box(zones.rules), colorForText('rules'), icons, font,
    textSize('rules') ?? defaultFrameTextSizes.rules, textAlign('rules'));
  if (hidden.has('artist')) {
    // The artist credit is hidden on this card.
  } else if (template) {
    drawLine('artist', card.fields.artist, { x: width * 0.06, y: height * 0.965, w: width * 0.88, h: 23 });
  } else if (!overlay) {
    drawLine('artist', card.fields.artist, { x: width * .066, y: height * .924, w: width * .88, h: height * .025 }, 21);
  } else {
    drawLine('artist', card.fields.artist, { x: 26, y: height - 33, w: width - 52, h: 29 }, 20);
  }
  if ((template || set) && !art && !hidden.has('art')) return { warning: 'addArtHelp' };
  return result && (hidden.has('title') || mana.length === 0 || diameter >= 7) ? {} : { warning: 'textOverflow' };
}
