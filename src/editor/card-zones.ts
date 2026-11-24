import { defaultZones } from '../shared/model.js';
import type { Card, Zones } from '../shared/model.js';
import { templateAppearance } from '../shared/templates.js';

export function cardZones(card: Card): Zones {
  const frame = card.frame;
  const base = frame.kind === 'template' ? templateAppearance(frame).zones
    : frame.kind === 'color-set' ? frame.set.zones
    : frame.kind === 'custom' ? frame.zones : defaultZones;
  return { ...base, ...card.zoneOverrides };
}
