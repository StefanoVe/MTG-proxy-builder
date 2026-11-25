import { maxVisibilityQueryLength } from '../shared/model.js';
import type { FrameVisibilityCondition } from '../shared/model.js';
import { Select } from './Select.js';
import { useI18n } from './i18n.js';

const emptyCondition: FrameVisibilityCondition = { field: 'type', negate: false, query: '' };

export function VisibilityConditionEditor({ condition = emptyCondition, change }: {
  condition?: FrameVisibilityCondition; change: (condition: FrameVisibilityCondition) => void;
}) {
  const { t } = useI18n();
  return <div className="visibility-condition" role="group" aria-label={t('hideWhen')}>
    <span>{t('hideWhen')}</span>
    <label className="check"><input type="checkbox" checked={condition.negate}
      onChange={event => change({ ...condition, negate: event.target.checked })} />{t('conditionNot')}</label>
    <Select aria-label={t('conditionField')} value={condition.field} onChange={event =>
      change({ ...condition, field: event.target.value as FrameVisibilityCondition['field'] })}>
      <option value="name">{t('titleContains')}</option>
      <option value="type">{t('typeContains')}</option>
      <option value="rules">{t('rulesContain')}</option>
    </Select>
    <input aria-label={t('conditionQuery')} placeholder={t('conditionQuery')} value={condition.query} maxLength={maxVisibilityQueryLength}
      onChange={event => change({ ...condition, query: event.target.value })} />
  </div>;
}
