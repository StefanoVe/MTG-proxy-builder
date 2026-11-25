import type { FrameColor, FrameSet } from './model.js';

export function colorsForFrame(colors: FrameColor[], mix: boolean): FrameColor[] {
  const present = [...new Set(colors)];
  if (present.length === 1 || (mix && present.length > 1)) return present;
  return ['C'];
}

export function colorFrameLayers(set: FrameSet, colors: FrameColor[]) {
  return colorsForFrame(colors, set.mix).map(color => set.assets[color]);
}
