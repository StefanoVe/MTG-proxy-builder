import { cardSide } from './model.ts';
import type { Card } from './model.ts';

/** Find cards whose effective artwork is also used by another card. */
export function cardsWithSharedArt(cards: Card[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const card of cards) {
    const sides = card.source.images.back ? [card, cardSide(card, true)] : [card];
    for (const side of sides) {
      const art = side.art ?? side.source.images.art;
      if (!art) continue;
      const ids = owners.get(art) ?? new Set<string>();
      ids.add(card.id);
      owners.set(art, ids);
    }
  }
  return new Set([...owners.values()].filter(ids => ids.size > 1).flatMap(ids => [...ids]));
}
