import { pixels } from '../shared/print.js';
import type { Rect, Template, TemplateAppearance } from '../shared/model.js';

const { width, height } = pixels;

export function templateBox(zone: Rect): Rect {
  return { x: zone.x * width / 100, y: zone.y * height / 100, w: zone.w * width / 100, h: zone.h * height / 100 };
}

const regions = {
  topEffect: { panel: { x: 5, y: 4, w: 90, h: 7.4 }, radius: 9, fullArtHeight: 15 },
  bottomEffect: { panel: { x: 5, y: 61.8, w: 90, h: 34 }, radius: 10, fullArtHeight: 48 }
};

type Effect = keyof typeof regions;

export function templateEffectLimits(template: Template, effect: Effect) {
  const { panel, fullArtHeight } = regions[effect];
  if (template === 'full-art') return { edge: effect === 'topEffect' ? 0 : 100, max: 100, defaultHeight: fullArtHeight };
  return effect === 'topEffect'
    ? { edge: panel.y, max: 100 - panel.y, defaultHeight: panel.h }
    : { edge: panel.y + panel.h, max: panel.y + panel.h, defaultHeight: panel.h };
}

function wash(ctx: CanvasRenderingContext2D, template: Template, appearance: TemplateAppearance,
  effect: Effect, color: string, strength: number) {
  if (!strength) return false;
  const { panel, radius } = regions[effect];
  const { edge, max, defaultHeight } = templateEffectLimits(template, effect);
  const top = effect === 'topEffect';
  const settings = appearance[effect];
  let extent = settings?.height ?? defaultHeight;
  if (settings && settings.anchor !== 'manual') {
    const zone = appearance.zones[settings.anchor];
    extent = top ? zone.y + zone.h - edge : edge - zone.y;
  }
  extent = Math.min(max, extent);
  if (extent <= 0) return false;
  const y = top ? edge : edge - extent;
  const tinted = (opacity: number) => color + Math.round(opacity * strength * 255).toString(16).padStart(2, '0');
  if (template === 'full-art') {
    const gradient = ctx.createLinearGradient(0, y * height / 100, 0, (y + extent) * height / 100);
    gradient.addColorStop(0, tinted(top ? 1 : 0));
    if (!top) gradient.addColorStop(17 / 48, tinted(.92));
    gradient.addColorStop(1, tinted(top ? 0 : 1));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y * height / 100, width, extent * height / 100);
  } else {
    const rect = templateBox({ ...panel, y, h: extent });
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = tinted(1);
    ctx.fill();
  }
  return true;
}

export function blurTemplateArt(ctx: CanvasRenderingContext2D, template: Template, appearance: TemplateAppearance) {
  if (!appearance.titleBlur && !appearance.rulesBlur) return;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const layer = buffer.getContext('2d')!;
  const padded = document.createElement('canvas');
  const padding = Math.ceil(Math.max(appearance.titleBlur ?? 0, appearance.rulesBlur ?? 0) * 3);
  padded.width = width + padding * 2;
  padded.height = height + padding * 2;
  const source = padded.getContext('2d')!;
  // Extend edge pixels so the blur also covers the outer edge of a full-art card.
  const strips = (size: number) => [[0, 1, 0, padding], [0, size, padding, size], [size - 1, 1, padding + size, padding]];
  for (const [x, w, left, targetWidth] of strips(width)) {
    for (const [y, h, top, targetHeight] of strips(height)) {
      source.drawImage(ctx.canvas, x, y, w, h, left, top, targetWidth, targetHeight);
    }
  }
  for (const [effect, strength] of [['topEffect', appearance.titleBlur], ['bottomEffect', appearance.rulesBlur]] as const) {
    if (!strength) continue;
    layer.clearRect(0, 0, width, height);
    layer.filter = 'blur(' + strength + 'px)';
    layer.drawImage(padded, -padding, -padding);
    layer.filter = 'none';
    layer.globalCompositeOperation = 'destination-in';
    const masked = wash(layer, template, appearance, effect, '#ffffff', 1);
    layer.globalCompositeOperation = 'source-over';
    if (masked) ctx.drawImage(buffer, 0, 0);
  }
}

export function shadeTemplate(ctx: CanvasRenderingContext2D, template: Template, appearance: TemplateAppearance) {
  const color = appearance.shadeColor ?? '#141820';
  wash(ctx, template, appearance, 'topEffect', color, appearance.titleShade);
  wash(ctx, template, appearance, 'bottomEffect', color, appearance.rulesShade);
}

export function drawTemplateDividers(ctx: CanvasRenderingContext2D, appearance: TemplateAppearance, cardColor: string) {
  const color = appearance.accent ?? cardColor;
  const weight = appearance.dividerWeight ?? 2;
  const alignment = appearance.dividerAlign ?? 'center';
  for (const [zone, enabled] of [['title', appearance.titleDivider], ['rules', appearance.divider]] as const) {
    if (!enabled) continue;
    const rect = templateBox(appearance.zones[zone]);
    const length = rect.w * (appearance.dividerLength ?? 100) / 100;
    const x = rect.x + (rect.w - length) * (alignment === 'left' ? 0 : alignment === 'right' ? 1 : .5);
    const y = zone === 'title' ? rect.y + rect.h + (appearance.dividerPadding ?? 6)
      : appearance.dividerPadding === undefined ? rect.y - 8 : rect.y - appearance.dividerPadding - weight;
    ctx.save();
    if (appearance.dividerStyle === 'fade') {
      const fade = ctx.createLinearGradient(x, 0, x + length, 0);
      fade.addColorStop(0, color + '00');
      fade.addColorStop(.25, color);
      fade.addColorStop(.75, color);
      fade.addColorStop(1, color + '00');
      ctx.fillStyle = fade;
      ctx.fillRect(x, y, length, weight);
    } else if (appearance.dividerStyle === 'dashed') {
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.setLineDash([weight * 4, weight * 2.5]);
      ctx.beginPath();
      ctx.moveTo(x, y + weight / 2);
      ctx.lineTo(x + length, y + weight / 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, length, weight);
    }
    ctx.restore();
  }
}
