import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { Card, StatsKind } from '../shared/model.js';
import { Select } from './Select.js';
import { StatsAppearanceControls } from './StatsAppearanceControls.js';
import { useI18n } from './i18n.js';

const samples = {
  '2/3': { kind: 'pair', value: '2/3' },
  '10/10': { kind: 'pair', value: '10/10' },
  '*/*': { kind: 'pair', value: '*/*' },
  '1+*/1+*': { kind: 'pair', value: '1+*/1+*' },
  loyalty: { kind: 'loyalty', value: '4' },
  defense: { kind: 'defense', value: '6' }
} as const;

export type StatsSample = 'card' | keyof typeof samples;

export function withStatsSample(card: Card, sample: StatsSample, previewFrame = card.frame): Card {
  if (sample === 'card') return card;
  const { kind, value } = samples[sample];
  const [power, toughness] = kind === 'pair' ? value.split('/') : ['', ''];
  return { ...card, frame: previewFrame, fields: { ...card.fields, power, toughness,
    loyalty: kind === 'loyalty' ? value : '', defense: kind === 'defense' ? value : '' } };
}

export function StatsEditor({ sample, setSample, ...controls }: Omit<ComponentProps<typeof StatsAppearanceControls>, 'kind' | 'onKindChange' | 'preview'> & {
  sample: StatsSample; setSample: (sample: StatsSample) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<StatsKind>();
  useEffect(() => () => setSample('card'), [setSample]);
  function selectKind(next?: StatsKind) {
    setKind(next);
    if (!next) setSample('card');
    else if (sample === 'card' || samples[sample].kind !== next) setSample(next === 'pair' ? '2/3' : next);
  }
  return <StatsAppearanceControls {...controls} kind={kind} onKindChange={selectKind} preview={
    <label>{t('statsPreviewValues')}<Select value={sample} onChange={event => setSample(event.target.value as StatsSample)}>
      <option value="card">{t('statsCardValues')}</option>
      {Object.entries(samples).filter(([, entry]) => !kind || entry.kind === kind).map(([id, entry]) =>
        <option key={id} value={id}>{entry.kind === 'pair' ? entry.value : t(entry.kind) + ' · ' + entry.value}</option>)}
    </Select></label>
  } />;
}
