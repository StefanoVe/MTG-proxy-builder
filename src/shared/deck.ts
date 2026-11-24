import type { Asset, Card, DeckEntry } from './model.js';

export function normalizeName(name: string): string {
  return name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function parseDeck(text: string): { entries: DeckEntry[]; errors: string[] } {
  const entries: DeckEntry[] = [];
  const errors: string[] = [];
  for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || /^(#|\/\/)/.test(line) || /^(deck|commander|sideboard|maybeboard|companion|mazzo|comandante|sideboard|tokens):?$/i.test(line)) continue;
    const prefix = /^(\d+)(?:\s*x\s*|\s+)/i.exec(line);
    const quantity = prefix ? Number(prefix[1]) : 1;
    const content = prefix ? line.slice(prefix[0].length) : line;
    const cleaned = content.replace(/\s+\*[^*]+\*\s*$/, '').trim();
    const [, name, set, number] = /^(.*?)(?:\s+\(([a-z0-9]+)\)\s+(\S+))?$/i.exec(cleaned) ?? [];
    if (!name || !normalizeName(name) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999 || name.length > 300) {
      errors.push(`Riga ${index + 1} · ${line}`);
      continue;
    }
    entries.push({ name: name.trim(), count: quantity, ...(set && number ? { set: set.toLowerCase(), number } : {}) });
  }
  return { entries, errors };
}

export type BatchRow = { asset: Asset; cardId: string; accept: boolean };
export type BatchKind = 'art' | 'frame';

export function hasOverride(card: Card, kind: BatchKind): boolean {
  return kind === 'art' ? !!card.art : card.frame.kind === 'custom' || card.frame.kind === 'color-set' || card.frame.kind === 'template' || card.frame.kind === 'classic' || (card.frame.kind === 'modern' && card.frame.tone !== 'auto');
}

export function matchBatch(assets: Asset[], cards: Card[], kind: BatchKind): BatchRow[] {
  const fileNames = assets.map(asset => normalizeName(asset.name.replace(/\.[^.]+$/, '')));
  const counts = new Map<string, number>();
  for (const name of fileNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  return assets.map((asset, index) => {
    const key = fileNames[index];
    const matches = cards.filter(card => card.source.editable &&
      normalizeName(card.source.printingId ? card.source.name : card.fields.name) === key);
    const card = matches.length === 1 ? matches[0] : undefined;
    return { asset, cardId: card?.id ?? '', accept: !!card && counts.get(key) === 1 && !hasOverride(card, kind) };
  });
}
