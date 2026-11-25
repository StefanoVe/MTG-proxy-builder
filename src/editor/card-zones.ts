import { defaultZones } from '../shared/model.js';
import type { Card, Zones } from '../shared/model.js';
import { frameAppearance } from '../shared/templates.js';

export function cardZones(card: Card): Zones {
  const base = frameAppearance(card.frame)?.zones ?? defaultZones;
  return { ...base, ...card.zoneOverrides };
}
