import { manaFiles } from './mana-catalog.js';

export const symbolPattern = /\{([^{}]+)\}/g;
const signature = (name: string) => name.split('/').sort().join('/');
const aliases = new Map(Object.keys(manaFiles).filter(name => name.includes('/'))
  .map(name => [signature(name), name]));

export function manaFile(token: string) {
  const name = token.trim().toUpperCase();
  const canonical = Object.hasOwn(manaFiles, name) ? name : aliases.get(signature(name));
  return canonical ? manaFiles[canonical] : undefined;
}

export function manaTokens(cost: string) {
  const tokens = [...cost.matchAll(symbolPattern)].map(match => match[1]);
  return tokens.length ? tokens : cost.match(/\d+|[A-Za-z]|½|∞/g) ?? [];
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
