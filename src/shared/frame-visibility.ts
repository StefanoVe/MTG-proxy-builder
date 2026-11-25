import type { Card, FrameVisibilityCondition } from './model.js';

export function hiddenByCondition(condition: FrameVisibilityCondition | undefined,
  fields: Pick<Card['fields'], FrameVisibilityCondition['field']>): boolean {
  const query = condition?.query.trim().normalize().toLowerCase();
  if (!condition || !query) return false;
  const matches = fields[condition.field].normalize().toLowerCase().includes(query);
  return condition.negate ? !matches : matches;
}
