import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from '../shared/i18n.js';
import { importFrameArtwork } from './frame-artwork.js';
import { assetURL, resolveStatsAppearance, statsStyles } from '../shared/model.js';
import type { StatsAppearance, StatsBaseAppearance, StatsKind, StatsStyle } from '../shared/model.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { statsDividers } from './stats-appearance.js';
import { ImageDropzone } from './ImageDropzone.js';
import { OptionalColor } from './OptionalColor.js';
import { Select } from './Select.js';
import { VisualChoice } from './VisualChoice.js';
import type { VisualOption } from './VisualChoice.js';
import './stats-controls.css';

type Section = 'box' | 'divider' | 'text' | 'spacing';
const sections = [['box', 'statsSectionBox'], ['divider', 'statsSectionDivider'], ['text', 'text'], ['spacing', 'statsSectionSpacing']] as const satisfies readonly (readonly [Section, MessageKey])[];
const styleLabels: Record<StatsStyle, MessageKey> = {
  original: 'statsStyleStandard', square: 'statsStyleSquare', rounded: 'statsStyleRounded', capsule: 'statsStyleCapsule',
  chamfered: 'statsStyleChamfered', double: 'statsStyleDouble', dashed: 'dashed', dotted: 'statsStyleDotted',
  diamond: 'statsStyleDiamond', fade: 'statsStyleFade', banner: 'statsStyleBanner'
};
const controls = { divider: 'statsDividerStyle', box: 'statsBoxStyle' } as const;
const kindLabels: Record<StatsKind | 'base', MessageKey> = {
  base: 'statsKindBase', pair: 'statsKindPair', loyalty: 'statsKindLoyalty', defense: 'statsKindDefense'
};
const paddingKeys = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
const paddingLabels = { paddingTop: 'statsSideTop', paddingRight: 'statsSideRight', paddingBottom: 'statsSideBottom', paddingLeft: 'statsSideLeft' } as const;
const spacingChoices = [0, 4, 8, 16] as const;
const spacingNames = ['statsSpacingNone', 'statsSpacingTight', 'statsSpacingNormal', 'statsSpacingWide'] as const;
const sizeNames = { small: 'statsSizeSmall', normal: 'statsSizeNormal', large: 'statsSizeLarge' } as const;
const borderChoices = [0, 1, 3, 6] as const;
const opacityChoices = [25, 50, 75, 100] as const;

/** Small sample of each box style, drawn in currentColor on a 20x14 grid. */
const stylePreviews: Record<StatsStyle, ReactNode> = {
  original: <>
    <rect x="1" y="1" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x="3.5" y="3.5" width="13" height="7" fill="none" stroke="currentColor" strokeWidth=".6" />
  </>,
  square: <rect x="1" y="1" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  rounded: <rect x="1" y="1" width="18" height="12" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  capsule: <rect x="1" y="1" width="18" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  chamfered: <polygon points="5,1 15,1 19,5 19,9 15,13 5,13 1,9 1,5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  double: <>
    <rect x="1" y="1" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="4" y="4" width="12" height="6" fill="none" stroke="currentColor" strokeWidth=".8" />
  </>,
  dashed: <rect x="1" y="1" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" />,
  dotted: <rect x="1" y="1" width="18" height="12" rx="4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 2.6" />,
  diamond: <polygon points="1,7 5,1 15,1 19,7 15,13 5,13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  fade: <>
    <defs>
      <linearGradient id="stats-style-fade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="currentColor" stopOpacity="0" />
        <stop offset=".35" stopColor="currentColor" />
        <stop offset=".65" stopColor="currentColor" />
        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="url(#stats-style-fade)" strokeWidth="1.6" />
  </>,
  banner: <polygon points="1,1 19,1 15,7 19,13 1,13 5,7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
};

/** Keeps a number in the allowed whole-number range. */
export function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Small, normal and large sizes around a base (80% and 120%). A clamped step that would repeat
 * the base is dropped, so every tile is distinct and the base tile always stays.
 */
export function sizeSteps(base: number, min: number, max: number): { key: keyof typeof sizeNames; value: number }[] {
  const steps: { key: keyof typeof sizeNames; value: number }[] = [
    { key: 'small', value: clampInt(base * .8, min, max) },
    { key: 'normal', value: base },
    { key: 'large', value: clampInt(base * 1.2, min, max) }
  ];
  return steps.filter(step => step.key === 'normal' || step.value !== base);
}

/** Whether the four paddings are equal, so one choice can drive all of them. */
function paddingsAreLinked(values: readonly (number | undefined)[]) {
  return values.every(value => (value ?? 0) === (values[0] ?? 0));
}

function BoxVisual({ style }: { style: StatsStyle }) {
  return <svg viewBox="0 0 20 14" width="30" height="21" aria-hidden="true" className="stats-style-preview">{stylePreviews[style]}</svg>;
}

function DividerVisual({ style }: { style: StatsStyle }) {
  const path = style === 'original' ? 'M10 1 V29' : statsDividers[style].path;
  return <svg viewBox="0 0 20 30" width="16" height="24" aria-hidden="true" className="stats-divider-preview">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function InheritVisual() {
  return <svg viewBox="0 0 20 14" width="30" height="21" aria-hidden="true">
    <rect x="1" y="1" width="18" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 2" />
  </svg>;
}

function BorderVisual({ width }: { width: number }) {
  return <span className="stats-border-visual" style={{ borderWidth: width }} />;
}

function OpacityVisual({ opacity }: { opacity: number }) {
  return <span className="stats-opacity-visual"><span style={{ background: `color-mix(in srgb, #faf6ed ${opacity}%, transparent)` }} /></span>;
}

function SizeVisual({ size, base }: { size: number; base: number }) {
  return <span className="stats-size-visual" style={{ fontSize: `${(13 * size) / base}px` }}>2/2</span>;
}

function SpacingVisual({ gap }: { gap: number }) {
  return <span className="stats-space-visual" style={{ padding: gap / 2 }}><span /></span>;
}

function GapVisual({ gap }: { gap: number }) {
  return <span className="stats-gap-visual" style={{ gap: gap * .6 }}>
    <span className="stats-gap-bar" /><span className="stats-gap-rule" /><span className="stats-gap-bar" />
  </span>;
}

/** A compact number field that commits on blur or Enter. Empty or invalid text is ignored. */
export function NumberField({ label, value, min, max, onCommit }: {
  label: string; value: number; min: number; max: number; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    const number = Number(draft.replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(number)) { setDraft(String(value)); return; }
    const next = clampInt(number, min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }
  return <label className="number-field">
    <span>{label}</span>
    <input type="number" inputMode="numeric" min={min} max={max} step={1} value={draft}
      onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(String(value));
      }} />
  </label>;
}

export function StatsAppearanceControls({ value, inherit = false, inherited, baseSize = 34, change, kind: kindProp, onKindChange, preview, colors = true }: {
  value?: StatsAppearance; inherit?: boolean; inherited?: StatsAppearance; baseSize?: number; change: (value: StatsAppearance | undefined) => void;
  /** False when the element colors are edited elsewhere; the image key color stays. */
  colors?: boolean;
  preview?: ReactNode; kind?: StatsKind; onKindChange?: (kind: StatsKind | undefined) => void;
}) {
  const { t, locale } = useI18n();
  const idBase = useId();
  // Without onKindChange the level is managed here; with it, the parent owns `kind`.
  const [localKind, setLocalKind] = useState<StatsKind>();
  const kind = onKindChange ? kindProp : localKind;
  const [section, setSection] = useState<Section>('box');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { byKind, ...base } = value ?? {};
  const currentValue = kind ? byKind?.[kind] : base;
  const layerFallback = resolveStatsAppearance(inherited, kind ? base : undefined, kind);
  const effective = resolveStatsAppearance(inherited, value, kind);
  const [linkedPadding, setLinkedPadding] = useState(() => paddingsAreLinked(paddingKeys.map(key => effective[key])));
  const showDivider = !kind || kind === 'pair';
  const visibleSections = sections.filter(([id]) => id !== 'divider' || showDivider);
  const active = section === 'divider' && !showDivider ? 'box' : section;
  const levelLabel = t(kindLabels[kind ?? 'base']);
  const inheritsStyle = inherit || !!kind;
  function chooseKind(next: StatsKind | undefined) {
    if (onKindChange) onKindChange(next);
    else setLocalKind(next);
  }
  function replaceLayer(layer: StatsBaseAppearance) {
    const variants = { ...byKind };
    if (kind) {
      if (Object.keys(layer).length) variants[kind] = layer;
      else delete variants[kind];
    }
    const next: StatsAppearance = { ...(kind ? base : layer) };
    if (Object.keys(variants).length) next.byKind = variants;
    change(Object.keys(next).length ? next : undefined);
  }
  function set<K extends keyof StatsBaseAppearance>(key: K, entry: StatsBaseAppearance[K]) {
    const next = { ...currentValue, [key]: entry };
    if (entry === undefined) delete next[key];
    replaceLayer(next);
  }
  function setPadding(amount: number) {
    replaceLayer({ ...currentValue, paddingTop: amount, paddingRight: amount, paddingBottom: amount, paddingLeft: amount });
  }
  function reset() {
    setError('');
    replaceLayer({});
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = visibleSections.length;
    const target = event.key === 'ArrowRight' ? (index + 1) % count
      : event.key === 'ArrowLeft' ? (index - 1 + count) % count
        : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (target < 0) return;
    event.preventDefault();
    const [id] = visibleSections[target];
    setSection(id);
    document.getElementById(`${idBase}-tab-${id}`)?.focus();
  }
  async function upload(key: 'boxAsset' | 'dividerAsset', file: File) {
    setError('');
    setBusy(true);
    try {
      const asset = await importFrameArtwork(file, { width: 1024, height: 512 });
      if (mounted.current) set(key, asset.id);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? errorMessage(failure, locale) : t('decorationImportFailed'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function imageField(key: 'boxAsset' | 'dividerAsset', uploadLabel: MessageKey, replacesNote: MessageKey) {
    const current = effective[key];
    return <div className="stats-image">
      <ImageDropzone compact label={t(uploadLabel)} help={t('statsImageFormats')} busy={busy} onFiles={files => {
        const [file] = files;
        if (file) void upload(key, file);
      }} />
      {current && <p className="stats-image-note">{t(replacesNote)}</p>}
      {current && <div className="stats-image-current">
        <img src={assetURL(current)} alt="" />
        <div className="stats-image-actions">
          <button type="button" onClick={() => set(key, layerFallback[key] ? null : undefined)}>{t('statsRemoveImage')}</button>
          {layerFallback[key] && currentValue?.[key] !== undefined && currentValue[key] !== layerFallback[key] && <button type="button" onClick={() => { setError(''); set(key, undefined); }}>{t('statsUseInheritedImage')}</button>}
        </div>
      </div>}
      {!current && layerFallback[key] && currentValue?.[key] === null && <button type="button" onClick={() => { setError(''); set(key, undefined); }}>{t('statsUseInheritedImage')}</button>}
    </div>;
  }
  function styleField(part: 'box' | 'divider') {
    if (part === 'box' ? effective.boxAsset : effective.dividerAsset) return <p className="stats-style-replaced">{t('statsStyleReplacedByImage')}</p>;
    const options: VisualOption<string>[] = [
      ...(inheritsStyle ? [{ value: '', label: t(kind ? 'statsInheritKind' : 'inheritStatsStyle'), visual: <InheritVisual /> }] : []),
      ...(['original', ...statsStyles] as const).map(style => ({
        value: style,
        label: t(part === 'divider' && style !== 'original' ? statsDividers[style].label : styleLabels[style]),
        visual: part === 'divider' ? <DividerVisual style={style} /> : <BoxVisual style={style} />
      }))
    ];
    return <>
      <div className="stats-style-choice">
        <VisualChoice label={t(controls[part])} value={currentValue?.[part] ?? (inheritsStyle ? '' : 'original')} options={options}
          onChange={choice => {
            const style = choice as StatsStyle | '';
            set(part, style === 'original' && !kind && !inherit ? undefined : style || undefined);
          }} />
      </div>
      {part === 'box' && <small className="stats-help">{t('statsStyleStandardHelp')}</small>}
    </>;
  }
  const colorRows = [['ink', 'statsInk', '#24211e'], ['ruleColor', 'statsRuleColor', '#24211e'],
    ['borderColor', 'statsBorderColor', '#302b25'], ['fill', 'statsFill', '#faf6ed'],
    ['outline', 'statsOutline', '#000000'], ['transparentColor', 'statsKey', '#ffffff']] as const;
  const visibleColors = colorRows.filter(([key]) => {
    if (key === 'transparentColor') return (active === 'box' || active === 'divider') && !!(effective.boxAsset || effective.dividerAsset);
    if (!colors) return false;
    if (active === 'box') return key === 'fill' || key === 'borderColor';
    if (active === 'divider') return key === 'ruleColor';
    return active === 'text' && (key === 'ink' || key === 'outline');
  });
  const borderReplaced = !!effective.boxAsset;
  return <fieldset className="stats-settings" aria-label={t('stats')} disabled={busy}>
    <div className="stats-toolbar">
    <div className="stats-kind">
      <label>{t('statsEditKind')}<Select aria-label={t('statsEditKind')} value={kind ?? 'base'} onChange={event => {
        chooseKind((event.target.value === 'base' ? undefined : event.target.value) as StatsKind | undefined);
      }}>
        <option value="base">{t('statsKindBase')}</option>
        <option value="pair">{t('statsKindPair')}</option>
        <option value="loyalty">{t('statsKindLoyalty')}</option>
        <option value="defense">{t('statsKindDefense')}</option>
      </Select></label>
      {kind && <small className="stats-kind-note">{t('statsKindNote')}</small>}
    </div>
    {preview}
    </div>
    <div className="stats-navigation" role="tablist" aria-label={t('stats')}>
      {visibleSections.map(([id, label], index) =>
        <button key={id} id={`${idBase}-tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls={`${idBase}-panel`}
          tabIndex={active === id ? 0 : -1} onClick={() => setSection(id)} onKeyDown={event => moveTab(event, index)}>{t(label)}</button>)}
    </div>
    <div className="stats-controls" role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${active}`}>
    {active === 'box' && styleField('box')}
    {active === 'divider' && styleField('divider')}
    {active === 'box' && imageField('boxAsset', 'statsUploadBoxImage', 'statsBoxImageReplacesStyle')}
    {active === 'divider' && imageField('dividerAsset', 'statsUploadDividerImage', 'statsDividerImageReplacesStyle')}
    {error && <p className="error" role="alert">{error}</p>}
    {visibleColors.map(([key, label, fallbackColor]) => {
      const help = key === 'transparentColor' ? t('statsKeyHelp') : undefined;
      if (key === 'outline' || key === 'transparentColor') {
        return <div className="stats-color" key={key}>
          <div className="stats-check-main">
            <label className="check"><input type="checkbox" checked={!!effective[key]}
              onChange={event => set(key, event.target.checked ? effective[key] ?? fallbackColor : layerFallback[key] ? null : undefined)} />
              {t(label)}</label>
            {help && <small>{help}</small>}
          </div>
          <input type="color" aria-label={t(label)} disabled={!effective[key]} value={effective[key] ?? fallbackColor}
            onChange={event => set(key, event.target.value)} />
        </div>;
      }
      const disabledByImage = (key === 'borderColor' || key === 'fill') && !!effective.boxAsset || key === 'ruleColor' && !!effective.dividerAsset;
      return <OptionalColor key={key} label={t(label)} value={currentValue?.[key]} fallback={effective[key] ?? fallbackColor}
        autoLabel={t('colorAutomatic')} resetLabel={t('colorUseAutomatic')} help={disabledByImage ? t('statsReplacedByImage') : undefined}
        disabled={disabledByImage} onChange={next => set(key, next)} />;
    })}
    {active === 'box' && <>
      <VisualChoice label={t('statsBorderWidth')} value={effective.borderWidth ?? 3} disabled={borderReplaced}
        help={borderReplaced ? t('statsReplacedByImage') : undefined}
        options={borderChoices.map(width => ({ value: width, label: `${width} px`, visual: <BorderVisual width={width} /> }))}
        custom={{ min: 0, max: 8, step: .5, unit: 'px' }} onChange={width => set('borderWidth', width)} />
      <VisualChoice label={t('statsOpacity')} value={effective.opacity ?? 100}
        options={opacityChoices.map(opacity => ({ value: opacity, label: `${opacity}%`, visual: <OpacityVisual opacity={opacity} /> }))}
        custom={{ min: 0, max: 100, unit: '%' }} onChange={opacity => set('opacity', opacity)} />
    </>}
    {active === 'text' && <VisualChoice label={t('statsSize')} value={effective.size ?? baseSize}
      options={sizeSteps(baseSize, 8, 100).map(step => ({ value: step.value, label: t(sizeNames[step.key]), visual: <SizeVisual size={step.value} base={baseSize} /> }))}
      custom={{ min: 8, max: 100, unit: 'px' }} onChange={size => set('size', clampInt(size, 8, 100))} />}
    {active === 'spacing' && <div className="stats-spacing">
      <label className="check"><input type="checkbox" checked={linkedPadding} onChange={event => {
        setLinkedPadding(event.target.checked);
        if (event.target.checked) setPadding(effective.paddingTop ?? 0);
      }} />{t('statsPaddingLinked')}</label>
      {linkedPadding
        ? <VisualChoice label={t('statsPaddingAll')} value={effective.paddingTop ?? 0}
          options={spacingChoices.map((gap, index) => ({ value: gap, label: t(spacingNames[index]), visual: <SpacingVisual gap={gap} /> }))}
          custom={{ min: 0, max: 64, unit: 'px' }} onChange={amount => setPadding(clampInt(amount, 0, 64))} />
        : <div className="stats-sides-group">
          <span className="stats-field-title">{t('statsPaddingAll')}</span>
          <div className="stats-sides">{paddingKeys.map(key =>
            <NumberField key={key} label={t(paddingLabels[key])} value={effective[key] ?? 0} min={0} max={64}
              onCommit={amount => set(key, amount)} />)}</div>
        </div>}
    </div>}
    {active === 'divider' && <VisualChoice label={t('statsDividerGap')} value={effective.dividerGap ?? 0}
      options={spacingChoices.map((gap, index) => ({ value: gap, label: t(spacingNames[index]), visual: <GapVisual gap={gap} /> }))}
      custom={{ min: 0, max: 32, unit: 'px' }} onChange={gap => set('dividerGap', clampInt(gap, 0, 32))} />}
    </div>
    <button className="stats-reset" type="button" disabled={!Object.keys(currentValue ?? {}).length && !error} onClick={reset}>{t('statsResetLevel', { level: levelLabel })}</button>
  </fieldset>;
}
