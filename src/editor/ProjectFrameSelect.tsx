import { Select } from './Select.js';
import { isTemplate, templateNames } from '../shared/model.js';
import type { Project } from '../shared/model.js';
import { useI18n } from './i18n.js';

export function ProjectFrameSelect({ project, disabled, change, importFrame }: {
  project: Project; disabled: boolean;
  change: (frame: Project['frame']) => void; importFrame: () => void;
}) {
  const { t } = useI18n();
  const { frame, frameSets, presets } = project;
  const value = frame?.kind === 'template' ? frame.template
    : frame?.kind === 'color-set' || frame?.kind === 'preset' ? `${frame.kind}/${frame.id}` : frame?.kind ?? '';

  return <label>{t('projectFrame')}<Select value={value} disabled={disabled} onChange={event => {
    const next = event.target.value;
    if (!next) change(undefined);
    else if (next === 'modern' || next === 'classic') change({ kind: next, tone: 'auto' });
    else if (isTemplate(next)) change({ kind: 'template', template: next });
    else if (next === 'import') importFrame();
    else {
      const [kind, id] = next.split('/');
      if (kind === 'color-set' || kind === 'preset') change({ kind, id });
    }
  }}>
    <option value="">{t('framePerCard')}</option>
    <option value="modern">{t('normalFrame')}</option>
    <option value="classic">{t('classicFrame')}</option>
    {Object.keys(templateNames).filter(isTemplate).map(template =>
      <option key={template} value={template}>{t(templateNames[template])}</option>)}
    {frameSets && frameSets.length > 0 && <optgroup label={t('automaticColorSets')}>
      {frameSets.map(set => <option key={set.id} value={`color-set/${set.id}`}>{set.name}</option>)}
    </optgroup>}
    {presets.length > 0 && <optgroup label={t('framePresets')}>
      {presets.map(preset => <option key={preset.id} value={`preset/${preset.id}`}>{preset.name}</option>)}
    </optgroup>}
    {frame?.kind === 'custom' && <option value="custom">{t('projectCustomFrame')}</option>}
    <option value="import">{t('importProjectFrame')}</option>
  </Select></label>;
}
