import { manaSymbol, manaTokens } from '../shared/mana.ts';
import type { Card, SymbolOverrides, Tone } from '../shared/model.ts';

export const cardColors: Record<Exclude<Tone, 'auto'>, [string, string]> = {
  white: ['#beb49b', '#f8eed7'], blue: ['#387184', '#d6eff1'], black: ['#554a5a', '#e8dfe8'],
  red: ['#a4513a', '#f6e2ce'], green: ['#476649', '#e0ebd2'], multi: ['#9c783f', '#f3e7be'],
  artifact: ['#69767c', '#e1e9e6'], land: ['#79614e', '#efe5d0']
};
const colorNames = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' } as const;
type Color = keyof typeof colorNames;

function symbolColors(token: string) {
  return token.trim().toUpperCase().split('/').map(part => /^(HW|HR)$/.test(part) ? part.slice(1) : part)
    .filter((part): part is Color => Object.hasOwn(colorNames, part));
}

export function cardColorKeys(card: Card): Color[] {
  if (card.source.colors.length || card.source.printingId) return card.source.colors;
  return [...new Set(manaTokens(card.fields.mana).flatMap(symbolColors))];
}

export function toneOf(card: Card): Exclude<Tone, 'auto'> {
  if ((card.frame.kind === 'modern' || card.frame.kind === 'classic') && card.frame.tone !== 'auto') return card.frame.tone;
  if (card.frame.kind === 'template' || card.frame.kind === 'color-set' || card.frame.kind === 'custom') {
    const colors = cardColorKeys(card);
    if (colors.length > 1) return 'multi';
    if (colors.length === 1) return colorNames[colors[0]];
  }
  if (/\b(land|terra)\b/i.test(card.fields.type)) return 'land';
  if (card.source.colors.length > 1) return 'multi';
  return colorNames[card.source.colors[0]] ?? 'artifact';
}

export function defaultSymbolTextColor(symbol: string) {
  const colors = symbolColors(symbol);
  const tone = colors.length > 1 ? 'multi' : colorNames[colors[0]] ?? 'artifact';
  return cardColors[tone][1];
}

export function automaticTextColor(card: Card, overrides: SymbolOverrides | undefined, fallback: string) {
  if (!overrides) return fallback;
  const colors = cardColorKeys(card);
  const identity = manaSymbol(colors.join('/'));
  const identityColor = identity && overrides[identity]?.textColor;
  if (identityColor) return identityColor;

  for (const token of manaTokens(card.fields.mana)) {
    const symbol = manaSymbol(token);
    if (!symbol) continue;
    const color = overrides[symbol]?.textColor;
    if (!color) continue;
    const tokenColors = symbolColors(symbol);
    if (tokenColors.length === colors.length && colors.every(part => tokenColors.includes(part))) return color;
  }

  return (colors.length ? undefined : overrides.C?.textColor) ?? fallback;
}
