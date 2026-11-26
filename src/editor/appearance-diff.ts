import type { TemplateAppearance } from '../shared/model.js';

export type AppearanceChangeId = 'font' | 'textColor' | 'cardTextColors' | 'shading' | 'dividers' | 'decorations' | 'symbols' | 'stats' | 'zones' | 'textStyles';
export type AppearanceChange = { id: AppearanceChangeId; keys: (keyof TemplateAppearance)[] };

const appearanceGroups: AppearanceChange[] = [
  { id: 'font', keys: ['fontFamily'] },
  { id: 'textColor', keys: ['textColor'] },
  { id: 'cardTextColors', keys: ['autoTextColors', 'accent'] },
  { id: 'shading', keys: ['shadeColor', 'titleShade', 'rulesShade', 'titleBlur', 'rulesBlur', 'topEffect', 'bottomEffect'] },
  { id: 'dividers', keys: ['divider', 'titleDivider', 'dividerLength', 'dividerWeight', 'dividerPadding', 'dividerAlign', 'dividerStyle', 'titleDividerHideWhen', 'dividerHideWhen'] },
  { id: 'decorations', keys: ['decorations', 'overlay'] },
  { id: 'symbols', keys: ['symbolOverrides'] },
  { id: 'stats', keys: ['statsAppearance'] },
  { id: 'zones', keys: ['zones'] },
  { id: 'textStyles', keys: ['textStyles'] }
];

/** Drops undefined values, empty arrays and empty objects, and sorts object keys, so equivalent values compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? value.map(item => canonical(item) ?? null) : undefined;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().flatMap(key => {
      const item = canonical(record[key]);
      return item === undefined ? [] : [[key, item] as const];
    });
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left) ?? null) === JSON.stringify(canonical(right) ?? null);
}

/** The groups of the frame whose settings differ from the base appearance. */
export function appearanceChanges(current: TemplateAppearance, base: TemplateAppearance): AppearanceChange[] {
  return appearanceGroups
    .filter(group => group.keys.some(key => !sameValue(current[key], base[key])))
    .map(group => ({ id: group.id, keys: [...group.keys] }));
}

/** Sets the given keys back to their base values; a key absent from the base is removed. */
export function restoreAppearanceKeys(current: TemplateAppearance, base: TemplateAppearance,
  keys: readonly (keyof TemplateAppearance)[]): TemplateAppearance {
  const next: Partial<Record<keyof TemplateAppearance, unknown>> = { ...current };
  for (const key of keys) {
    if (base[key] === undefined) delete next[key];
    else next[key] = base[key];
  }
  return next as TemplateAppearance;
}
