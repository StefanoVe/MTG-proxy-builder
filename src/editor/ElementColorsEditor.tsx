import type { StatsAppearance, TemplateAppearance } from '../shared/model.js';
import type { MessageKey } from '../shared/i18n.js';
import { Select } from './Select.js';
import { useI18n } from './i18n.js';
import './symbols.css';

type Mode = 'text' | 'card' | 'custom' | 'auto' | 'values' | 'none';
type StatsColor = 'ink' | 'ruleColor' | 'borderColor' | 'fill' | 'outline';
type Row = {
  label: MessageKey; modes: Mode[];
  mode: (appearance: TemplateAppearance) => Mode;
  color?: (appearance: TemplateAppearance) => string;
  set: (appearance: TemplateAppearance, mode: Mode, color?: string) => TemplateAppearance;
};
const modeLabels: Record<Mode, MessageKey> = {
  text: 'elementColorText', card: 'elementColorCard', custom: 'custom', auto: 'colorAutomatic',
  values: 'elementColorValues', none: 'elementColorNone'
};

function textRow(area: 'title' | 'type' | 'rules' | 'artist', label: MessageKey): Row {
  return {
    label, modes: ['text', 'card'],
    mode: appearance => appearance.autoTextColors?.[area] ? 'card' : 'text',
    set: (appearance, mode) => ({ ...appearance, autoTextColors: { ...appearance.autoTextColors, [area]: mode === 'card' } })
  };
}

function setStats(appearance: TemplateAppearance, key: StatsColor, color: string | undefined): TemplateAppearance {
  const stats: StatsAppearance = { ...appearance.statsAppearance, [key]: color };
  if (color === undefined) delete stats[key];
  return { ...appearance, statsAppearance: Object.keys(stats).length ? stats : undefined };
}

/** A stats color: the first mode keeps the default, `card` sets the flag, `custom` stores the color. */
function statsRow(key: StatsColor, label: MessageKey, modes: Mode[], fallback: (appearance: TemplateAppearance) => string,
  card?: 'stats' | 'statsDivider' | 'statsBox'): Row {
  return {
    label, modes,
    mode: appearance => card && appearance.autoTextColors?.[card] ? 'card'
      : appearance.statsAppearance?.[key] ? 'custom' : modes[0],
    color: appearance => appearance.statsAppearance?.[key] ?? fallback(appearance),
    set: (appearance, mode, color) => {
      const next = card ? { ...appearance, autoTextColors: { ...appearance.autoTextColors, [card]: mode === 'card' } } : appearance;
      return setStats(next, key, mode === 'custom' ? color ?? fallback(appearance) : undefined);
    }
  };
}

const textRows: Row[] = [
  textRow('title', 'cardColorTitle'), textRow('type', 'cardColorType'),
  textRow('rules', 'cardColorRules'), textRow('artist', 'cardColorArtist'),
  {
    label: 'cardColorDividers', modes: ['card', 'custom'],
    mode: appearance => appearance.accent ? 'custom' : 'card',
    color: appearance => appearance.accent ?? '#fff8ea',
    set: (appearance, mode, color) => ({ ...appearance, accent: mode === 'custom' ? color ?? appearance.accent ?? '#fff8ea' : undefined })
  }
];
const statsRows: Row[] = [
  statsRow('ink', 'cardColorStatsValues', ['text', 'card', 'custom'], appearance => appearance.textColor, 'stats'),
  statsRow('ruleColor', 'cardColorStatsDivider', ['values', 'card', 'custom'],
    appearance => appearance.statsAppearance?.ink ?? appearance.textColor, 'statsDivider'),
  statsRow('borderColor', 'cardColorStatsBox', ['auto', 'card', 'custom'], () => '#302b25', 'statsBox'),
  statsRow('fill', 'elementColorStatsFill', ['auto', 'custom'], () => '#faf6ed'),
  statsRow('outline', 'elementColorStatsOutline', ['none', 'custom'], () => '#000000')
];

export function ElementColorsEditor({ appearance, change }: {
  appearance: TemplateAppearance;
  change: (update: (appearance: TemplateAppearance) => TemplateAppearance) => void;
}) {
  const { t } = useI18n();
  function rowLabel(row: Row, mode: Mode) {
    // The default stats border follows a custom text divider color.
    if (row.label === 'cardColorStatsBox' && mode === 'auto' && appearance.accent) return t('elementColorDividers');
    return t(modeLabels[mode]);
  }
  const group = (legend: MessageKey, rows: Row[]) => <fieldset className="editor-group element-colors">
    <legend>{t(legend)}</legend>
    {rows.map(row => {
      const mode = row.mode(appearance);
      const label = t(row.label);
      return <div className="element-color-row" key={row.label}>
        <span>{label}</span>
        <Select aria-label={label} value={mode} onChange={event => {
          const next = event.target.value as Mode;
          change(current => row.set(current, next));
        }}>
          {row.modes.map(option => <option key={option} value={option}>{rowLabel(row, option)}</option>)}
        </Select>
        {mode === 'custom' && row.color
          ? <input type="color" aria-label={t('elementColorPick', { name: label })} value={row.color(appearance)}
            onChange={event => { const color = event.target.value; change(current => row.set(current, 'custom', color)); }} />
          : <span className="element-color-slot" aria-hidden="true" />}
      </div>;
    })}
  </fieldset>;
  return <>
    {group('cardColorGroupText', textRows)}
    {group('cardColorGroupStats', statsRows)}
  </>;
}
