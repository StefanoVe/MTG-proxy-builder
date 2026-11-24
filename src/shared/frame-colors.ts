import type { CardData, FrameColor, FrameSet } from './model.js';

const ordered = ['W', 'U', 'B', 'R', 'G'] as const;

export function colorsForFrame(colors: CardData['colors'], mix: boolean): FrameColor[] {
  const present = ordered.filter(color => colors.includes(color));
  if (present.length === 1 || (mix && present.length > 1)) return present;
  return ['C'];
}

export function colorFrameLayers(set: FrameSet, colors: CardData['colors']) {
  return colorsForFrame(colors, set.mix).map(color => set.assets[color]);
}
