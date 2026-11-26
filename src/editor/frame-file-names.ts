import type { FrameColor } from '../shared/model.ts';

const colorTokens: Record<FrameColor, readonly string[]> = {
  W: ['white', 'bianco', 'bianca', 'w'],
  U: ['blue', 'blu', 'u'],
  B: ['black', 'nero', 'nera', 'b'],
  R: ['red', 'rosso', 'rossa', 'r'],
  G: ['green', 'verde', 'g'],
  C: ['colorless', 'incolore', 'artifact', 'artefatto', 'c', 'gray', 'grey', 'grigio'],
};

/** Reads the color from a file name; undefined when no token matches or when several colors match. */
export function colorForFileName(name: string): FrameColor | undefined {
  const base = name.replace(/\.[^.]*$/, '');
  const words = base.split(/[-_ .\s]+/).map(word => word.toLowerCase()).filter(Boolean);
  const found = (Object.keys(colorTokens) as FrameColor[]).filter(color =>
    words.some(word => colorTokens[color].includes(word)));
  return found.length === 1 ? found[0] : undefined;
}
