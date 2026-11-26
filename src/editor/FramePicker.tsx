import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isTemplate, templateNames, tones } from '../shared/model.js';
import type { Card, Project, Template, Tone } from '../shared/model.js';
import type { MessageKey } from '../shared/i18n.js';
import { newTemplate, presetFrame, withProjectTemplate } from '../shared/templates.js';
import type { CustomFrame } from '../shared/templates.js';
import { compose } from './compose.js';
import { useI18n } from './i18n.js';
import { Select } from './Select.js';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import './frame-picker.css';

/** One choice in the unified frame picker, shared by deck, inspector and batch. */
export type FrameChoice =
  | { kind: 'per-card' }
  | { kind: 'printing' }
  | { kind: 'modern' | 'classic'; tone: Tone }
  | { kind: 'template'; template: Template }
  | { kind: 'color-set'; id: string }
  | { kind: 'preset'; id: string }
  | { kind: 'custom' };

export function choiceKey(choice: FrameChoice): string {
  switch (choice.kind) {
    case 'modern': case 'classic': return choice.kind;
    case 'template': return 'template/' + choice.template;
    case 'color-set': case 'preset': return `${choice.kind}/${choice.id}`;
    default: return choice.kind;
  }
}

/** All choices a project offers, in display order. */
export function frameChoices(project: Pick<Project, 'frameSets' | 'presets'>, include: { perCard?: boolean; printing?: boolean; custom?: boolean } = {}): FrameChoice[] {
  return [
    ...(include.perCard ? [{ kind: 'per-card' } as const] : []),
    ...(include.printing ? [{ kind: 'printing' } as const] : []),
    { kind: 'modern', tone: 'auto' },
    { kind: 'classic', tone: 'auto' },
    ...Object.keys(templateNames).filter(isTemplate).map(template => ({ kind: 'template', template }) as const),
    ...(project.frameSets ?? []).map(set => ({ kind: 'color-set', id: set.id }) as const),
    ...project.presets.map(preset => ({ kind: 'preset', id: preset.id }) as const),
    ...(include.custom ? [{ kind: 'custom' } as const] : [])
  ];
}

/** The card frame a choice produces (undefined for "per card"). `custom` needs the existing custom frame. */
export function choiceFrame(choice: FrameChoice, project: Pick<Project, 'frameSets' | 'presets' | 'fullArtBase' | 'templateAppearances'>,
  custom?: CustomFrame): Card['frame'] | undefined {
  switch (choice.kind) {
    case 'per-card': return undefined;
    case 'printing': return { kind: 'printing' };
    case 'modern': case 'classic': return { kind: choice.kind, tone: choice.tone };
    case 'template': return newTemplate(choice.template, project.templateAppearances?.['full-art'] ? undefined : project.fullArtBase);
    case 'color-set': {
      const set = project.frameSets?.find(item => item.id === choice.id);
      return set && { kind: 'color-set', set };
    }
    case 'preset': {
      const preset = project.presets.find(item => item.id === choice.id);
      return preset && presetFrame(preset);
    }
    case 'custom': return custom;
  }
}

/** The choice matching a card frame. Preset frames are stored as plain custom frames, so they map to `custom`. */
export function frameChoiceOf(frame: Card['frame'] | undefined): FrameChoice {
  if (!frame) return { kind: 'per-card' };
  switch (frame.kind) {
    case 'printing': return { kind: 'printing' };
    case 'modern': case 'classic': return { kind: frame.kind, tone: frame.tone };
    case 'template': return { kind: 'template', template: frame.template };
    case 'color-set': return { kind: 'color-set', id: frame.set.id };
    case 'custom': return { kind: 'custom' };
  }
}

const toneLabels: Record<Tone, MessageKey> = {
  auto: 'frameToneAuto', white: 'white', blue: 'blue', black: 'black', red: 'red', green: 'green',
  multi: 'frameToneMulti', artifact: 'frameToneArtifact', land: 'frameToneLand'
};

// Thumbnails are expensive (full card render), so cache them and render one at a time.
const thumbnails = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
function thumbnail(key: string, card: Card): Promise<string> {
  const cached = thumbnails.get(key);
  if (cached) return cached;
  const job = queue.then(async () => {
    const full = document.createElement('canvas');
    await compose(full, card);
    const small = document.createElement('canvas');
    small.width = 150;
    small.height = Math.round(150 * full.height / Math.max(1, full.width));
    small.getContext('2d')!.drawImage(full, 0, 0, small.width, small.height);
    return small.toDataURL('image/png');
  });
  queue = job.catch(() => undefined);
  thumbnails.set(key, job);
  job.catch(() => thumbnails.delete(key));
  return job;
}

/** A cached, small rendering of a card with its frame (used by pickers and the editor navigation). */
export function FrameThumbnail({ card, label = '', icon }: { card?: Card; label?: string; icon?: IconName }) {
  const [url, setUrl] = useState<string>();
  const key = card ? JSON.stringify([card.id, card.frame, card.art, card.source.images, card.fields.name, card.crop, card.source.colors]) : '';
  useEffect(() => {
    let active = true;
    setUrl(undefined);
    if (card) void thumbnail(key, card).then(value => { if (active) setUrl(value); }).catch(() => {});
    return () => { active = false; };
  }, [key]);
  return <span className="frame-tile-thumb" aria-hidden="true">
    {url ? <img src={url} alt="" /> : <span className="frame-tile-placeholder">{icon ? <Icon name={icon} size={22} /> : label.slice(0, 1)}</span>}
  </span>;
}

export function FramePicker({ label, project, sample, choices, value, custom, disabled = false, compact = false, onChange, footer }: {
  label: string;
  project: Project;
  /** Card used to render the thumbnails. */
  sample?: Card;
  choices: FrameChoice[];
  value?: FrameChoice;
  custom?: CustomFrame;
  disabled?: boolean;
  /** Smaller tiles without descriptions, for side panels. */
  compact?: boolean;
  onChange: (choice: FrameChoice) => void;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const selectedKey = value ? choiceKey(value) : '';
  const names = (choice: FrameChoice): { name: string; detail?: string } => {
    switch (choice.kind) {
      case 'per-card': return { name: t('framePerCardStyle'), detail: t('framePerCardStyleHelp') };
      case 'printing': return { name: t('frameOriginalScan'), detail: t('frameOriginalScanHelp') };
      case 'modern': return { name: t('normalFrame') };
      case 'classic': return { name: t('classicFrame') };
      case 'template': return { name: t(templateNames[choice.template]) };
      case 'color-set': return { name: project.frameSets?.find(set => set.id === choice.id)?.name ?? '?', detail: t('frameKindColorSet') };
      case 'preset': return { name: project.presets.find(preset => preset.id === choice.id)?.name ?? '?', detail: t('frameKindSavedPng') };
      case 'custom': return { name: t('frameKindPng') };
    }
  };
  const previewCard = (choice: FrameChoice): Card | undefined => {
    if (!sample || choice.kind === 'per-card') return undefined;
    if (choice.kind === 'printing' && !sample.source.images.front) return undefined;
    const frame = choiceFrame(choice, project, custom);
    return frame && withProjectTemplate({ ...sample, frame, frameOverride: true }, project.templateAppearances);
  };
  const toneChoice = value && (value.kind === 'modern' || value.kind === 'classic') ? value : undefined;

  function move(event: React.KeyboardEvent, index: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | undefined;
    if (event.key in keys) next = (index + keys[event.key] + choices.length) % choices.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = choices.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    const choice = choices[next];
    group.current?.querySelectorAll<HTMLElement>('[role=radio]')[next]?.focus();
    onChange(choice.kind === 'modern' || choice.kind === 'classic' ? { ...choice, tone: toneChoice?.tone ?? 'auto' } : choice);
  }

  return <div className={`frame-picker${compact ? ' is-compact' : ''}`}>
    <span id={labelId} className="frame-picker-label">{label}</span>
    <div ref={group} role="radiogroup" aria-labelledby={labelId} aria-disabled={disabled || undefined} className="frame-tiles">
      {choices.map((choice, index) => {
        const key = choiceKey(choice);
        const checked = key === selectedKey;
        const { name, detail } = names(choice);
        const tabIndex = checked || (!selectedKey && index === 0) ? 0 : -1;
        return <button type="button" role="radio" key={key} aria-checked={checked} tabIndex={tabIndex} disabled={disabled}
          className="frame-tile" title={detail ? `${name} · ${detail}` : name} onKeyDown={event => move(event, index)}
          onClick={() => onChange(choice.kind === 'modern' || choice.kind === 'classic' ? { ...choice, tone: checked && toneChoice ? toneChoice.tone : 'auto' } : choice)}>
          <FrameThumbnail card={previewCard(choice)} label={name} icon={choice.kind === 'per-card' ? 'card' : choice.kind === 'printing' ? 'edition' : undefined} />
          <span className="frame-tile-name">{name}</span>
          {detail && !compact && <small className="frame-tile-detail">{detail}</small>}
        </button>;
      })}
    </div>
    {toneChoice && <label className="frame-tone">{t('frameTone')}<Select value={toneChoice.tone} disabled={disabled}
      onChange={event => onChange({ ...toneChoice, tone: event.target.value as Tone })}>
      {tones.map(tone => <option key={tone} value={tone}>{t(toneLabels[tone])}</option>)}
    </Select></label>}
    {footer}
  </div>;
}
