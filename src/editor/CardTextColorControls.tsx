import { cardColorTextAreas } from '../shared/model.js';
import type { TemplateAppearance } from '../shared/model.js';
import { useI18n } from './i18n.js';

const labels = { title: 'titleColorFromCard', rules: 'bodyColorFromCard', type: 'typeColorFromCard' } as const;

export function CardTextColorControls({ appearance, change }: {
  appearance: TemplateAppearance;
  change: (update: (appearance: TemplateAppearance) => TemplateAppearance) => void;
}) {
  const { t } = useI18n();
  return cardColorTextAreas.map(area => <label className="check" key={area}>
    <input type="checkbox" checked={appearance.autoTextColors?.[area] ?? false} onChange={event => {
      const checked = event.target.checked;
      change(current => ({ ...current, autoTextColors: { ...current.autoTextColors, [area]: checked } }));
    }} />{t(labels[area])}
  </label>);
}
