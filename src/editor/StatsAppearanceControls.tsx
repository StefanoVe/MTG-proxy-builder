import { statsStyles } from '../shared/model.js';
import type { StatsAppearance, StatsStyle } from '../shared/model.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { statsDividers } from './stats-appearance.js';
import { Select } from './Select.js';

const styleLabels: Record<StatsStyle, MessageKey> = {
  original: 'original', square: 'statsStyleSquare', rounded: 'statsStyleRounded', capsule: 'statsStyleCapsule',
  chamfered: 'statsStyleChamfered', double: 'statsStyleDouble', dashed: 'dashed', dotted: 'statsStyleDotted',
  diamond: 'statsStyleDiamond', fade: 'statsStyleFade', banner: 'statsStyleBanner'
};
const controls = { divider: 'statsDividerStyle', box: 'statsBoxStyle' } as const;

export function StatsAppearanceControls({ value, inherit = false, change }: {
  value?: StatsAppearance; inherit?: boolean; change: (value: StatsAppearance | undefined) => void;
}) {
  const { t } = useI18n();
  return <fieldset className="template-settings">
    <legend>{t('stats')}</legend>
    {(Object.keys(controls) as (keyof StatsAppearance)[]).map(part => <label key={part}>
      {t(controls[part])}<Select renderOption={(id, label) => {
        const divider = part === 'divider' && statsDividers[id as keyof typeof statsDividers];
        return divider ? <span className="stats-divider-option"><svg viewBox="0 0 20 30" width="18" height="21" aria-hidden="true">
          <path d={divider.path} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>{label}</span> : label;
      }} value={value?.[part] ?? (inherit ? '' : 'original')} onChange={event => {
        const next = { ...value };
        const style = event.target.value as StatsStyle | '';
        if (!style || (!inherit && style === 'original')) delete next[part];
        else next[part] = style;
        change(Object.keys(next).length ? next : undefined);
      }}>
        {inherit && <option value="">{t('inheritStatsStyle')}</option>}
        {(['original', ...statsStyles] as const).map(style => <option key={style} value={style}>{t(part === 'divider' && style !== 'original' ? statsDividers[style].label : styleLabels[style])}</option>)}
      </Select>
    </label>)}
  </fieldset>;
}
