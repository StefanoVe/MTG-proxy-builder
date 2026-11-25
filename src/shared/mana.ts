import { manaFiles } from './mana-catalog.ts';

export const symbolPattern = /\{([^{}]+)\}/g;
const signature = (name: string) => name.split('/').sort().join('/');
const aliases = new Map(Object.keys(manaFiles).filter(name => name.includes('/'))
  .map(name => [signature(name), name]));

export function manaSymbol(token: string) {
  const name = token.trim().toUpperCase();
  return Object.hasOwn(manaFiles, name) ? name : aliases.get(signature(name));
}

export function manaFile(token: string) {
  const canonical = manaSymbol(token);
  return canonical ? manaFiles[canonical] : undefined;
}

export function manaComponents(token: string): string[] {
  const symbol = manaSymbol(token);
  if (!symbol) return [];
  const parts = symbol.split('/');
  // Hybrid Phyrexian symbols use two colored halves with the Phyrexian glyph over them.
  return parts.length === 3 && parts[2] === 'P' ? parts.slice(0, 2) : parts;
}

export const manaColors = ['W', 'U', 'B', 'R', 'G'] as const;
type ManaColor = typeof manaColors[number];

export function isManaColor(part: string): part is ManaColor {
  return manaColors.some(color => color === part);
}

export function manaColorKeys(tokens: string[]) {
  return [...new Set(tokens.flatMap(manaComponents).map(part => part === 'HW' || part === 'HR' ? part[1] : part)
    .filter(isManaColor))];
}

export function manaTokens(cost: string) {
  const tokens = [...cost.matchAll(symbolPattern)].map(match => match[1]);
  if (tokens.length) return tokens;
  return (cost.match(/[\w]+(?:\/[\w]+)+|\d+|[A-Za-z]+|½|∞/g) ?? [])
    .flatMap(token => manaSymbol(token) ? [token] : token.match(/\d+|[A-Za-z]|½|∞/g) ?? []);
}

export type RuleRun = { text: string; symbol?: boolean };

export function ruleWords(text: string): RuleRun[][] {
  return text.match(/\{[^{}]+\}|[^\s{}]+|[{}]|\s+/g)?.reduce<RuleRun[][]>((words, run) => {
    if (/^\s+$/.test(run)) {
      if (words.at(-1)?.length) words.push([]);
    } else {
      if (!words.length) words.push([]);
      const symbol = run.startsWith('{') && run.endsWith('}') && run.length > 2;
      words.at(-1)!.push(symbol ? { text: run.slice(1, -1), symbol } : { text: run });
    }
    return words;
  }, []).filter(word => word.length) ?? [];
}
