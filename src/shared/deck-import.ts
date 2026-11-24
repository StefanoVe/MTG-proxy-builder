import { errorMessage, translate } from './i18n.js';
import type { Locale } from './i18n.js';
import { createCard } from './model.js';
import type { Card, CardData, DeckEntry, Printing } from './model.js';

export async function loadDeckCards(
  entries: DeckEntry[], matches: Array<Printing | null>, load: (id: string) => Promise<CardData>,
  progress: (completed: number) => void = () => {}, locale: Locale = 'it'
) {
  const results: Array<{ item: DeckEntry; card?: Card; error?: string }> = [];
  let next = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (next < entries.length) {
      const index = next++;
      const item = entries[index];
      const match = matches[index];
      try {
        results[index] = match
          ? { item, card: createCard(await load(match.id), item.count) }
          : { item, error: translate(locale, 'printingNotFound', { name: item.name }) };
      } catch (cause) {
        const error = errorMessage(cause, locale);
        results[index] = { item, error: `${item.name} · ${error}` };
      } finally {
        progress(++completed);
      }
    }
  }));
  return results;
}
