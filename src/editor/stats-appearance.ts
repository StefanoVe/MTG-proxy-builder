import type { Rect, StatsStyle } from '../shared/model.js';
import { cardPaint } from './card-colors.js';
import type { CardPaint } from './card-colors.js';

type Point = readonly [column: 'left' | 'start' | 'end' | 'right', row: number];
type Preset = {
  radius: number;
  dash?: number[];
  cap?: CanvasLineCap;
  outline?: readonly Point[];
};
const presets: Record<Exclude<StatsStyle, 'original'>, Preset> = {
  square: { radius: 0 },
  rounded: { radius: .2, cap: 'round' },
  capsule: { radius: .5, cap: 'round' },
  chamfered: { radius: 0, outline: [
    ['left', .22], ['start', 0], ['end', 0], ['right', .22], ['right', .78], ['end', 1], ['start', 1], ['left', .78]
  ] },
  double: { radius: .12 },
  dashed: { radius: .08, dash: [2.8, 1.8] },
  dotted: { radius: .28, dash: [.01, 2], cap: 'round' },
  diamond: { radius: 0, outline: [['left', .5], ['start', 0], ['end', 0], ['right', .5], ['end', 1], ['start', 1]] },
  fade: { radius: .14 },
  banner: { radius: 0, outline: [['left', 0], ['right', 0], ['end', .5], ['right', 1], ['left', 1], ['start', .5]] }
};

export function drawStatsBox(ctx: CanvasRenderingContext2D, rect: Rect, style: Exclude<StatsStyle, 'original'>,
  color: CardPaint, background: string) {
  const preset = presets[style];
  const unit = Math.min(3.5, rect.h * .075, rect.w * .075);
  const { x, y, w, h } = rect;
  const radius = Math.min(w, h) * preset.radius;
  const cut = Math.min(h * .42, w * .18);
  ctx.save();
  ctx.lineWidth = unit;
  ctx.lineCap = preset.cap ?? 'butt';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cardPaint(ctx, color, x, w, style === 'fade');
  ctx.fillStyle = background;
  ctx.beginPath();
  if (preset.outline) {
    const left = x + unit / 2;
    const right = x + w - unit / 2;
    const columns = { left, right, start: left + cut, end: right - cut };
    preset.outline.forEach(([column, row], index) => {
      const top = y + unit / 2 + row * (h - unit);
      if (index === 0) ctx.moveTo(columns[column], top);
      else ctx.lineTo(columns[column], top);
    });
    ctx.closePath();
  } else {
    ctx.roundRect(x + unit / 2, y + unit / 2, w - unit, h - unit, radius);
  }
  ctx.fill();
  ctx.setLineDash(preset.dash?.map(length => length * unit) ?? []);
  ctx.stroke();
  if (style === 'double') {
    const inset = unit * 2.1;
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, Math.max(0, radius - inset));
    ctx.lineWidth = unit * .5;
    ctx.stroke();
  }
  ctx.restore();
  const padding = Math.max(preset.outline ? cut : radius * .55, unit * (style === 'double' ? 3 : 1.5));
  return { x: x + padding, y, w: w - 2 * padding, h };
}

// All paths fit the same slot between the two independently measured values.
export const statsDividers = {
  square: { label: 'dividerLozenge', path: 'M10 1 V9 L15 15 L10 21 L5 15 L10 9 M10 21 V29' },
  rounded: { label: 'dividerSlash', path: 'M16 2 L4 28' },
  capsule: { label: 'dividerUpright', path: 'M10 1 V29' },
  chamfered: { label: 'dividerStep', path: 'M13 1 V12 L7 18 V29' },
  double: { label: 'dividerParallel', path: 'M7 2 V28 M13 2 V28' },
  dashed: { label: 'dividerChevron', path: 'M6 2 L14 15 L6 28' },
  dotted: { label: 'dividerBreak', path: 'M10 1 V10 M10 14 V16 M10 20 V29' },
  diamond: { label: 'dividerFork', path: 'M5 1 L10 8 L15 1 M10 8 V22 M5 29 L10 22 L15 29' },
  fade: { label: 'dividerCurve', path: 'M13 1 C2 10 18 20 7 29' },
  banner: { label: 'dividerSerif', path: 'M5 2 H15 M10 2 V28 M5 28 H15' }
} as const;

export function drawStatsRule(ctx: CanvasRenderingContext2D, rect: Rect, style: keyof typeof statsDividers) {
  const scale = Math.min(rect.w / 20, rect.h / 30);
  ctx.save();
  ctx.translate(rect.x + (rect.w - 20 * scale) / 2, rect.y + (rect.h - 30 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(statsDividers[style].path));
  ctx.restore();
}
