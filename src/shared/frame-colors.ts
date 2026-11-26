import type { FrameColor, FrameSet } from './model.js';

export function colorsForFrame(colors: FrameColor[], mix: boolean): FrameColor[] {
  const present = [...new Set(colors)];
  if (present.length === 1 || (mix && present.length > 1)) return present;
  return ['C'];
}

/** Image for one color; missing slots fall back to colorless, then to the first available image. */
export function frameSetAsset(set: FrameSet, color: FrameColor): string {
  const fallback = set.assets.C ?? Object.values(set.assets).find(Boolean);
  return set.assets[color] ?? fallback!;
}

export function colorFrameLayers(set: FrameSet, colors: FrameColor[]) {
  return [...new Set(colorsForFrame(colors, set.mix).map(color => frameSetAsset(set, color)))];
}
