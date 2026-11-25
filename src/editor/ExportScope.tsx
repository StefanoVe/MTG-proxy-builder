import { useId } from 'react';
import type { Card } from '../shared/model.js';
import { useI18n } from './i18n.js';
import { Select } from './Select.js';

export type Scope =
  | { mode: 'all' }
  | { mode: 'current' | 'selected'; ids: readonly string[] }
  | { mode: 'range'; range: string };

export type ScopeOptions = { currentId?: string; selectedIds: readonly string[] };
export const allCardsScope: Scope = { mode: 'all' };

export function cardsInScope(cards: Card[], scope: Scope): Card[] | undefined {
  if (scope.mode === 'all') return cards;
  if (scope.mode !== 'range') {
    const ids = new Set(scope.ids);
    return cards.filter(card => ids.has(card.id));
  }
  const positions = new Set<number>();
  for (const part of scope.range.split(',')) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if (!match) return undefined;
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || first > last || last > cards.length) return undefined;
    for (let position = first; position <= last; position++) positions.add(position);
  }
  return cards.filter((_, index) => positions.has(index + 1));
}

export function ExportScope({ scope, options, count, invalid, disabled, onChange }: {
  scope: Scope;
  options: ScopeOptions;
  count: number;
  invalid: boolean;
  disabled: boolean;
  onChange: (scope: Scope) => void;
}) {
  const { t } = useI18n();
  const helpId = useId();
  const errorId = useId();
  const showError = scope.mode === 'range' && invalid && !!scope.range.trim();
  return <>
    <label>{t('exportScope')}<Select value={scope.mode} disabled={disabled} onChange={event => {
      switch (event.target.value) {
        case 'all': onChange(allCardsScope); break;
        case 'current':
          if (options.currentId) onChange({ mode: 'current', ids: [options.currentId] });
          break;
        case 'selected': onChange({ mode: 'selected', ids: options.selectedIds }); break;
        case 'range': onChange({ mode: 'range', range: '' }); break;
      }
    }}>
      <option value="all">{t('exportAllCards')}</option>
      <option value="current" disabled={!options.currentId}>{t('exportCurrentCard')}</option>
      <option value="selected" disabled={!options.selectedIds.length}>{t('exportSelectedCards', {
        count: scope.mode === 'selected' ? scope.ids.length : options.selectedIds.length
      })}</option>
      <option value="range">{t('exportCardRange')}</option>
    </Select></label>
    {scope.mode === 'range' && <>
      <label>{t('exportCardNumbers')}<input type="text" value={scope.range} disabled={disabled}
        aria-invalid={showError} aria-describedby={showError ? `${helpId} ${errorId}` : helpId}
        onChange={event => onChange({ mode: 'range', range: event.target.value })} /></label>
      <small id={helpId}>{t('exportCardRangeHelp')}</small>
      {showError && <small id={errorId} className="error" role="alert">{t('exportCardRangeError', { count })}</small>}
    </>}
  </>;
}
