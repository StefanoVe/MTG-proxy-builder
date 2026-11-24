import { pixels } from '../shared/print.js';
import type { Rect, Template, TemplateAppearance } from '../shared/model.js';

const { width, height } = pixels;

export function templateBox(zone: Rect): Rect {
  return { x: zone.x * width / 100, y: zone.y * height / 100, w: zone.w * width / 100, h: zone.h * height / 100 };
}

const regions = {
  title: { panel: { x: 5, y: 4, w: 90, h: 7.4 }, radius: 9, stops: [[0, 1], [.15, 0]] },
  rules: { panel: { x: 5, y: 61.8, w: 90, h: 34 }, radius: 10, stops: [[0, 0], [.52, 0], [.69, .92], [1, 1]] }
} satisfies Record<string, { panel: Rect; radius: number; stops: [number, number][] }>;

function wash(ctx: CanvasRenderingContext2D, template: Template, part: keyof typeof regions, color: string, strength: number) {
  if (!strength) return;
  const { panel, radius, stops } = regions[part];
  const tinted = (opacity: number) => color + Math.round(opacity * strength * 255).toString(16).padStart(2, '0');
  if (template === 'full-art') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    for (const [offset, opacity] of stops) gradient.addColorStop(offset, tinted(opacity));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  } else {
    const { x, y, w, h } = templateBox(panel);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = tinted(1);
    ctx.fill();
  }
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
  for (const [part, strength] of [['title', appearance.titleBlur], ['rules', appearance.rulesBlur]] as const) {
    if (!strength) continue;
    layer.clearRect(0, 0, width, height);
    layer.filter = 'blur(' + strength + 'px)';
    layer.drawImage(padded, -padding, -padding);
    layer.filter = 'none';
    layer.globalCompositeOperation = 'destination-in';
    wash(layer, template, part, '#ffffff', 1);
    layer.globalCompositeOperation = 'source-over';
    ctx.drawImage(buffer, 0, 0);
  }
}

export function shadeTemplate(ctx: CanvasRenderingContext2D, template: Template, appearance: TemplateAppearance) {
  const color = appearance.shadeColor ?? '#141820';
  wash(ctx, template, 'title', color, appearance.titleShade);
  wash(ctx, template, 'rules', color, appearance.rulesShade);
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
    const y = zone === 'title' ? rect.y + rect.h + 6 : rect.y - 8;
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
