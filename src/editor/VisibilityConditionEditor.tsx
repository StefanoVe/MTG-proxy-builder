import { useEffect, useRef, useState } from 'react';
import { maxVisibilityQueryLength } from '../shared/model.js';
import type { FrameVisibilityCondition } from '../shared/model.js';
import { Select } from './Select.js';
import { useI18n } from './i18n.js';
import './visibility.css';

const emptyCondition: FrameVisibilityCondition = { field: 'type', negate: false, query: '' };

const fieldNounKeys = {
  name: 'visibilityNounName',
  type: 'visibilityNounType',
  rules: 'visibilityNounRules',
} as const;

export function VisibilityConditionEditor({ condition = emptyCondition, change, disabled = false }: {
  condition?: FrameVisibilityCondition; change: (condition: FrameVisibilityCondition) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const focusOnOpen = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const query = condition.query.trim();
  const open = expanded || query.length > 0;

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    input.current?.focus();
  }, [open]);

  if (disabled) return null;

  return <div className="visibility-editor" role="group" aria-label={t('hideWhen')}>
    {open ? <>
      <div className="visibility-editor-row">
        <span className="visibility-editor-lead">{t('visibilityHideWhen')}</span>
        <Select className="visibility-editor-select" aria-label={t('conditionField')} value={condition.field} onChange={event =>
          change({ ...condition, field: event.target.value as FrameVisibilityCondition['field'] })}>
          <option value="name">{t('visibilityFieldName')}</option>
          <option value="type">{t('visibilityFieldType')}</option>
          <option value="rules">{t('visibilityFieldRules')}</option>
        </Select>
        <Select className="visibility-editor-select" aria-label={t('visibilityOperator')} value={condition.negate ? 'not' : 'contains'} onChange={event =>
          change({ ...condition, negate: event.target.value === 'not' })}>
          <option value="contains">{t('visibilityContains')}</option>
          <option value="not">{t('visibilityNotContains')}</option>
        </Select>
        <input ref={input} className="visibility-editor-input" aria-label={t('conditionQuery')}
          placeholder={t('visibilityQueryPlaceholder')} value={condition.query} maxLength={maxVisibilityQueryLength}
          onChange={event => change({ ...condition, query: event.target.value })} />
        <button type="button" className="visibility-editor-remove" onClick={() => {
          change({ field: condition.field, query: '', negate: false });
          setExpanded(false);
        }}>{t('visibilityRemove')}</button>
      </div>
      {query && <p className="visibility-editor-summary" aria-live="polite">{t('visibilitySummary', {
        field: t(fieldNounKeys[condition.field]),
        operator: t(condition.negate ? 'visibilityNotContains' : 'visibilityContains'),
        query,
      })}</p>}
    </> : <button type="button" className="visibility-editor-add" aria-expanded={false} onClick={() => {
      focusOnOpen.current = true;
      setExpanded(true);
    }}>{t('visibilityAdd')}</button>}
  </div>;
}
