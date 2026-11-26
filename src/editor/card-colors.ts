import { isManaColor, manaColorKeys, manaColors, manaComponents, manaSymbol, manaTokens } from '../shared/mana.ts';
import type { Card, FrameColor, SymbolOverrides, Tone } from '../shared/model.ts';

const cardColors: Record<Exclude<Tone, 'auto'>, [string, string]> = {
  white: ['#beb49b', '#f8eed7'], blue: ['#387184', '#d6eff1'], black: ['#554a5a', '#e8dfe8'],
  red: ['#a4513a', '#f6e2ce'], green: ['#476649', '#e0ebd2'], multi: ['#9c783f', '#f3e7be'],
  artifact: ['#69767c', '#e1e9e6'], land: ['#79614e', '#efe5d0']
};
const cardIdentitySymbols = ['W', 'U', 'B', 'R', 'G', 'C'];
const colorNames = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' } as const;
export type CardPaint = string | readonly string[];

function paletteForSymbol(symbol: string) {
  const [color] = manaColorKeys([symbol]);
  return cardColors[color ? colorNames[color] : 'artifact'];
}

export function defaultSymbolTextColor(symbol: string) {
  return paletteForSymbol(symbol)[1];
}

function paintFor(keys: string[], colorFor: (key: string) => string): CardPaint {
  return keys.length === 1 ? colorFor(keys[0]) : keys.map(colorFor);
}

export function symbolPaint(symbol: string, overrides?: SymbolOverrides): CardPaint {
  const keys = manaComponents(symbol);
  return paintFor(keys.length ? keys : [symbol], key => overrides?.[key]?.textColor ?? defaultSymbolTextColor(key));
}

function cardPaletteKeys(card: Card, tokens: string[]) {
  const { source, fields } = card;
  const frontFace = source.images.back ? source.details?.faces[0] : undefined;
  const recordedColors = source.printingId || source.colors.length ? source.colors : undefined;
  const printedColors = frontFace ? frontFace.colors : recordedColors;
  const colors = (fields.mana === source.mana ? printedColors : undefined) ?? manaColorKeys(tokens);
  const ordered = manaColors.filter(key => colors.includes(key));
  const canonical = manaSymbol(ordered.join('/'));
  const identity = canonical ? manaComponents(canonical) : ordered;
  const compounds = tokens.filter(token => manaComponents(token).length > 1 &&
    manaColorKeys([token]).every(color => colors.includes(color)));
  const components = [...new Set(compounds.flatMap(manaComponents))];
  if (tokens.includes('C') && !components.includes('C')) components.push('C');
  if (components.length) return [...new Set([...components, ...identity])];
  return identity;
}

export function cardFrameColors(card: Card): FrameColor[] {
  const keys = cardPaletteKeys(card, manaTokens(card.fields.mana).map(manaSymbol).filter(key => key !== undefined));
  return [...new Set(keys.map(key => isManaColor(key) ? key : 'C'))];
}

export function resolveCardColors(card: Card, overrides?: SymbolOverrides) {
  const tokens = manaTokens(card.fields.mana).map(manaSymbol).filter(key => key !== undefined);
  const keys = cardPaletteKeys(card, tokens);
  const land = /\b(land|terra)\b/i.test(card.fields.type);
  const fallback = cardColors[land ? 'land' : 'artifact'];
  // Only a color identity (W, U, B, R, G) or colorless C may define the card color; numeric and generic symbols never do.
  const standalone = keys.length <= 1 ? tokens.find(token => cardIdentitySymbols.includes(token) &&
    manaColorKeys([token]).join('') === (keys[0] ?? '') && overrides?.[token]?.textColor) : undefined;
  const standaloneColor = standalone ? overrides?.[standalone]?.textColor : undefined;
  const cardColor = keys.length
    ? paintFor(keys, key => overrides?.[key]?.textColor ?? standaloneColor ?? defaultSymbolTextColor(key))
    : standaloneColor ?? overrides?.C?.textColor ?? fallback[1];
  const frame = card.frame;
  const fixed = (frame.kind === 'modern' || frame.kind === 'classic') && frame.tone !== 'auto'
    ? cardColors[frame.tone] : undefined;
  return {
    cardColor,
    border: fixed?.[0] ?? (keys.length ? paintFor(keys, key => paletteForSymbol(key)[0]) : fallback[0]),
    panel: fixed?.[1] ?? cardColor
  };
}

export function colorBand(index: number, count: number) {
  const width = 1 / count;
  const feather = Math.min(.06, width / 3);
  return {
    start: index * width,
    end: (index + 1) * width,
    feather
  };
}

export function colorStops(colors: readonly string[], fade = false): [number, string][] {
  const stops: [number, string][] = [];
  const inset = fade ? Math.min(.25, .5 / colors.length) : 0;
  if (fade) stops.push([0, colors[0] + '00']);
  colors.forEach((color, index) => {
    const { start, end, feather } = colorBand(index, colors.length);
    stops.push([index ? start + feather : inset, color]);
    stops.push([index === colors.length - 1 ? 1 - inset : end - feather, color]);
  });
  if (fade) stops.push([1, colors[colors.length - 1] + '00']);
  return stops;
}

export function cardPaint(ctx: CanvasRenderingContext2D, color: CardPaint, x: number, width: number, fade = false) {
  if (typeof color === 'string' && !fade) return color;
  const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
  for (const [position, value] of colorStops(typeof color === 'string' ? [color] : color, fade)) {
    gradient.addColorStop(position, value);
  }
  return gradient;
}
