import { pixels } from '../shared/print.ts';
import type { Rect, TemplateAppearance } from '../shared/model.js';
import { cardPaint } from './card-colors.ts';
import type { CardPaint } from './card-colors.js';

const { width, height } = pixels;

export function templateBox(zone: Rect, w = width, h = height): Rect {
  return { x: zone.x * w / 100, y: zone.y * h / 100, w: zone.w * w / 100, h: zone.h * h / 100 };
}

export const templateEffectHeights = { topEffect: 15, bottomEffect: 48 };
type Effect = keyof typeof templateEffectHeights;

/** How far (in % of the card height) a shading reaches from its edge, honouring zone anchors. */
export function effectExtent(appearance: TemplateAppearance, effect: Effect): number {
  const settings = appearance[effect];
  if (settings && settings.anchor !== 'manual') {
    const zone = appearance.zones[settings.anchor];
    const boundary = zone.y + zone.h / 2 < 50 ? zone.y + zone.h : zone.y;
    return effect === 'topEffect' ? boundary : 100 - boundary;
  }
  return settings?.height ?? templateEffectHeights[effect];
}
const blurSteps = 6;

function wash(ctx: CanvasRenderingContext2D, appearance: TemplateAppearance,
  effect: Effect, color: string, strength: number, blurStep?: number) {
  const { width, height } = ctx.canvas ?? pixels;
  if (!strength) return false;
  const top = effect === 'topEffect';
  const edge = top ? 0 : 100;
  const settings = appearance[effect];
  const extent = Math.min(100, effectExtent(appearance, effect));
  if (extent <= 0) return false;
  const tinted = (opacity: number) => color + Math.round(opacity * strength * 255).toString(16).padStart(2, '0');
  // Let the transition continue beyond the selected boundary, clipped by the card.
  const transitionExtent = extent * 1.35;
  const y = top ? edge : edge - transitionExtent;
  const gradient = ctx.createLinearGradient(0, y * height / 100, 0, (y + transitionExtent) * height / 100);
  for (let i = 0; i <= 96; i++) {
    const position = i / 96;
    const distance = top ? 1 - position : position;
    const intensity = distance * distance * (3 - 2 * distance);
    const fraction = blurStep === undefined ? intensity : Math.max(0, Math.min(1, intensity * blurSteps - blurStep));
    const opacity = blurStep === undefined ? fraction : fraction * fraction * (3 - 2 * fraction);
    gradient.addColorStop(position, tinted(opacity));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y * height / 100, width, transitionExtent * height / 100);
  return true;
}

export function blurTemplateArt(ctx: CanvasRenderingContext2D, appearance: TemplateAppearance) {
  if (!appearance.titleBlur && !appearance.rulesBlur) return;
  const { width, height } = ctx.canvas ?? pixels;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const layer = buffer.getContext('2d')!;
  const padded = document.createElement('canvas');
  const padding = Math.ceil(Math.max(appearance.titleBlur ?? 0, appearance.rulesBlur ?? 0) * 3);
  padded.width = width + padding * 2;
  padded.height = height + padding * 2;
  const source = padded.getContext('2d')!;
  // Extend edge pixels so the blur also covers the outer edge of the card.
  const strips = (size: number) => [[0, 1, 0, padding], [0, size, padding, size], [size - 1, 1, padding + size, padding]];
  for (const [x, w, left, targetWidth] of strips(width)) {
    for (const [y, h, top, targetHeight] of strips(height)) {
      source.drawImage(ctx.canvas, x, y, w, h, left, top, targetWidth, targetHeight);
    }
  }
  for (const [effect, strength] of [['topEffect', appearance.titleBlur], ['bottomEffect', appearance.rulesBlur]] as const) {
    if (!strength) continue;
    // Crossfade successive blur radii instead of fading a single fully blurred image.
    for (let step = 0; step < blurSteps; step++) {
      layer.clearRect(0, 0, width, height);
      layer.filter = 'blur(' + (strength * (step + 1) / blurSteps) + 'px)';
      layer.drawImage(padded, -padding, -padding);
      layer.filter = 'none';
      layer.globalCompositeOperation = 'destination-in';
      const masked = wash(layer, appearance, effect, '#ffffff', 1, step);
      layer.globalCompositeOperation = 'source-over';
      if (masked) ctx.drawImage(buffer, 0, 0);
    }
  }
}

export function shadeTemplate(ctx: CanvasRenderingContext2D, appearance: TemplateAppearance) {
  const color = appearance.shadeColor ?? '#141820';
  wash(ctx, appearance, 'topEffect', color, appearance.titleShade);
  wash(ctx, appearance, 'bottomEffect', color, appearance.rulesShade);
}

export function drawTemplateDividers(ctx: CanvasRenderingContext2D, appearance: TemplateAppearance, cardColor: CardPaint) {
  const color = appearance.accent ?? cardColor;
  const weight = appearance.dividerWeight ?? 2;
  const alignment = appearance.dividerAlign ?? 'center';
  for (const [zone, enabled] of [['title', appearance.titleDivider], ['rules', appearance.divider]] as const) {
    if (!enabled) continue;
    const rect = templateBox(appearance.zones[zone], ctx.canvas.width, ctx.canvas.height);
    const length = rect.w * (appearance.dividerLength ?? 100) / 100;
    const x = rect.x + (rect.w - length) * (alignment === 'left' ? 0 : alignment === 'right' ? 1 : .5);
    const y = zone === 'title' ? rect.y + rect.h + (appearance.dividerPadding ?? 6)
      : appearance.dividerPadding === undefined ? rect.y - 8 : rect.y - appearance.dividerPadding - weight;
    ctx.save();
    const paint = cardPaint(ctx, color, x, length, appearance.dividerStyle === 'fade');
    if (appearance.dividerStyle === 'dashed') {
      ctx.strokeStyle = paint;
      ctx.lineWidth = weight;
      ctx.setLineDash([weight * 4, weight * 2.5]);
      ctx.beginPath();
      ctx.moveTo(x, y + weight / 2);
      ctx.lineTo(x + length, y + weight / 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = paint;
      ctx.fillRect(x, y, length, weight);
    }
    ctx.restore();
  }
}
