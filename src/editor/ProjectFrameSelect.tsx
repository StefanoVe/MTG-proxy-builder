import { FramePicker, frameChoices } from './FramePicker.js';
import type { FrameChoice } from './FramePicker.js';
import type { Card, Project } from '../shared/model.js';
import { useI18n } from './i18n.js';
import './deck-frame.css';

/** The picker choice that shows the project frame. */
function frameValue(frame: Project['frame']): FrameChoice {
  if (!frame) return { kind: 'per-card' };
  switch (frame.kind) {
    case 'printing': return { kind: 'printing' };
    case 'modern': case 'classic': return { kind: frame.kind, tone: frame.tone };
    case 'template': return { kind: 'template', template: frame.template };
    case 'color-set': return { kind: 'color-set', id: frame.id };
    case 'preset': return { kind: 'preset', id: frame.id };
    case 'custom': return { kind: 'custom' };
  }
}

/** The project frame a picker choice stores. A custom frame is kept as it is. */
function frameOf(choice: FrameChoice, current: Project['frame']): Project['frame'] {
  switch (choice.kind) {
    case 'per-card': return undefined;
    case 'printing': return { kind: 'printing' };
    case 'modern': case 'classic': return { kind: choice.kind, tone: choice.tone };
    case 'template': return { kind: 'template', template: choice.template };
    case 'color-set': return { kind: 'color-set', id: choice.id };
    case 'preset': return { kind: 'preset', id: choice.id };
    case 'custom': return current;
  }
}

export function ProjectFrameSelect({ project, disabled, change, importFrame, sample }: {
  project: Project; disabled: boolean; sample?: Card;
  change: (frame: Project['frame']) => void; importFrame: () => void;
}) {
  const { t } = useI18n();
  const { frame } = project;
  const custom = frame?.kind === 'custom' ? frame : undefined;
  const choices = frameChoices(project, { perCard: true, printing: true, custom: !!custom });

  return <div className="deck-frame">
    <FramePicker compact label={t('projectCardStyle')} project={project} sample={sample} choices={choices}
      value={frameValue(frame)} custom={custom} disabled={disabled}
      onChange={choice => change(frameOf(choice, frame))} />
    <button type="button" className="deck-frame-import" disabled={disabled} onClick={importFrame}>{t('uploadPngFrame')}</button>
  </div>;
}
