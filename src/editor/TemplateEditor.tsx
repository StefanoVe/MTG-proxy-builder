import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { errorMessage } from '../shared/i18n.js';
import type { MessageKey } from '../shared/i18n.js';
import { assetURL, isTemplate, maxDecorations, templateNames } from '../shared/model.js';
import type { Card, FrameDecoration, FrameTextArea, FrameTextStyle, Template, TemplateAppearance, TemplateEffect, Zones } from '../shared/model.js';
import { defaultFrameTextAlign, defaultFrameTextSizes, templateAppearance } from '../shared/templates.js';
import type { CustomFrame } from '../shared/templates.js';
import { FontPicker, ZoneFields } from './Inspector.js';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { FrameThumbnail } from './FramePicker.js';
import { importFrameArtwork } from './frame-artwork.js';
import { SymbolEditor, customSymbolCount } from './SymbolEditor.js';
import { CardColorsEditor, customCardColorCount } from './CardColorsEditor.js';
import { StatsEditor } from './StatsEditor.js';
import type { StatsSample } from './StatsEditor.js';
import { effectExtent } from './template-effects.js';
import { VisibilityConditionEditor } from './VisibilityConditionEditor.js';
import { ElementColorsEditor } from './ElementColorsEditor.js';
import { ImageDropzone } from './ImageDropzone.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { Select } from './Select.js';
import { VisualChoice } from './VisualChoice.js';
import type { VisualOption } from './VisualChoice.js';
import { useI18n } from './i18n.js';
import { appearanceChanges, restoreAppearanceKeys } from './appearance-diff.js';
import type { AppearanceChange, AppearanceChangeId } from './appearance-diff.js';
import './template-editor.css';

type AppearanceUpdate = (appearance: TemplateAppearance) => TemplateAppearance;
type Translate = (key: MessageKey) => string;
type Align = 'left' | 'center' | 'right';
type SectionId = 'images' | 'essentials' | 'text' | 'shading' | 'dividers' | 'decorations' | 'symbols' | 'cardColors' | 'stats' | 'layout';
type EditorZone = keyof Zones;
type Motif = Extract<FrameDecoration['source'], { kind: 'motif' }>['motif'];
export type FrameEditorTab = Template | 'custom';
export type EditorPreviewState = {
  statsSample: StatsSample;
  /** Guide to show on the stage preview and edit by dragging. */
  guide?: { kind: 'zone'; zone: keyof Zones } | { kind: 'decoration'; id: string } | { kind: 'shading' };
};

type Section = { id: SectionId; title: string; icon: IconName; help: string; keywords: string; count?: number; body: ReactNode };

const suggestedFontNames = ['Georgia', 'Palatino', 'Palatino Linotype', 'Book Antiqua', 'Garamond', 'Baskerville', 'Cambria', 'Times New Roman'];
const motifChoices: { motif: Motif; label: MessageKey }[] = [
  { motif: 'frame', label: 'motifFrame' }, { motif: 'corners', label: 'motifCorners' },
  { motif: 'flourish', label: 'motifFlourish' }, { motif: 'seal', label: 'motifSeal' }
];
const zoneChoices: { zone: EditorZone; label: MessageKey }[] = [
  { zone: 'art', label: 'art' }, { zone: 'title', label: 'zoneName' }, { zone: 'type', label: 'type' },
  { zone: 'rules', label: 'text' }, { zone: 'stats', label: 'stats' }, { zone: 'artist', label: 'zoneSignature' }
];
const changeLabels: Record<AppearanceChangeId, MessageKey> = {
  font: 'changeFont', textColor: 'changeTextColor', cardTextColors: 'changeCardTextColors', shading: 'changeShading',
  dividers: 'changeDividers', decorations: 'changeDecorations', symbols: 'changeSymbols', stats: 'changeStats',
  zones: 'changeZones', textStyles: 'changeTextStyles'
};
/** Italian and English keywords used by the section search, next to each section's name. */
const sectionKeywords: Record<SectionId, string> = {
  images: 'immagini cornice png set custom file frame images',
  essentials: 'essenziali font carattere sfumatura ombra regole dimensione divisori linea testo essential font shading size dividers',
  text: 'colori colore elementi testo titolo tipo corpo firma divisori statistiche valori bordo sfondo contorno carta personalizzato colors color elements text title type rules artist dividers stats values border background outline card custom',
  shading: 'sfumature sfumatura ombra intensità altezza sfocatura fino nome tipo testo libera colore shading shade height blur reach free',
  dividers: 'divisori divisore linee linea lunghezza spessore distanza allineamento tratto divider line length thickness distance alignment stroke',
  decorations: 'decorazioni immagini immagine svg png cornice angoli fregio sigillo livelli motivo opacità decoration image frame corners flourish seal layer opacity',
  symbols: 'simboli di mana simbolo icona colore symbols mana symbol icon',
  cardColors: 'colori delle carte carta identità bianco blu nero rosso verde incolore card colors white blue black red green colorless',
  stats: 'statistiche forza costituzione lealtà difesa valori stats power toughness loyalty defense',
  layout: 'posizioni posizione dimensione dimensioni zone zona illustrazione nome tipo testo firma allineamento position size art title type rules artist'
};
const reachLabels: [TemplateEffect['anchor'], MessageKey][] = [
  ['title', 'editorReachName'], ['type', 'editorReachType'], ['rules', 'editorReachRules'], ['manual', 'editorReachFree']
];
const strengthLevels: [number, MessageKey][] = [[0, 'editorNone'], [40, 'editorLight'], [70, 'editorMedium'], [96, 'editorStrong']];
const blurLevels: [number, MessageKey][] = [[0, 'editorNone'], [4, 'editorLight'], [10, 'editorMedium'], [20, 'editorStrong']];
const lengthLevels: [number, MessageKey][] = [[30, 'editorShort'], [60, 'editorMedium'], [100, 'editorFull']];
const thicknessLevels = [1, 2, 4, 6];
const distanceLevels: [number, MessageKey][] = [[3, 'editorNear'], [6, 'editorNormal'], [12, 'editorWide'], [24, 'editorWider']];
const opacityLevels = [25, 50, 75, 100];
type ShadingConfig = {
  effect: 'topEffect' | 'bottomEffect'; shade: 'titleShade' | 'rulesShade'; blur: 'titleBlur' | 'rulesBlur';
  title: MessageKey; strength: MessageKey;
};
const shadingGroups: ShadingConfig[] = [
  { effect: 'topEffect', shade: 'titleShade', blur: 'titleBlur', title: 'topShading', strength: 'topEffectShade' },
  { effect: 'bottomEffect', shade: 'rulesShade', blur: 'rulesBlur', title: 'bottomShading', strength: 'bottomEffectShade' }
];
const fadeSegments = [.15, .4, .75, 1, 1, .75, .4, .15];

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('it').normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ');
}

/** A 40 px preview of a divider stroke. */
function strokeSample(style: string) {
  return <svg className="stroke-sample" width="40" height="8" viewBox="0 0 40 8" aria-hidden="true" focusable="false">
    {style === 'dashed' && <line x1="0" y1="4" x2="40" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />}
    {style === 'fade' && fadeSegments.map((opacity, index) =>
      <rect key={index} x={index * 5} y="3" width="5" height="2" fill="currentColor" opacity={opacity} />)}
    {style !== 'dashed' && style !== 'fade' && <rect x="0" y="3" width="40" height="2" fill="currentColor" />}
  </svg>;
}

// Visuals for the tiles. Each one shows the value it stands for.

/** A light card with a shading that starts at full strength at the top and fades out. */
function StrengthVisual({ strength }: { strength: number }) {
  const id = `editor-shade-${Math.round(strength * 100)}`;
  return <svg width="24" height="34" viewBox="0 0 24 34" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#141820" stopOpacity={strength} />
        <stop offset="1" stopColor="#141820" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="0.5" y="0.5" width="23" height="33" rx="2" fill="#d9d2c3" />
    <rect x="0.5" y="0.5" width="23" height="33" rx="2" fill={`url(#${id})`} />
  </svg>;
}

/** A card outline with the shaded band at one edge; `dashed` marks a free, hand-drawn band. */
function ReachVisual({ edge, extent, dashed }: { edge: 'top' | 'bottom'; extent: number; dashed: boolean }) {
  const height = 32 * Math.min(100, Math.max(0, extent)) / 100;
  const y = edge === 'top' ? 1 : 33 - height;
  return <svg width="24" height="34" viewBox="0 0 24 34" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="23" height="33" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.5" />
    <rect x="1" y={y} width="22" height={height} fill={dashed ? 'none' : 'currentColor'} fillOpacity="0.35"
      stroke={dashed ? 'currentColor' : 'none'} strokeDasharray={dashed ? '2 2' : undefined} />
  </svg>;
}

function BlurVisual({ blur }: { blur: number }) {
  const id = `editor-blur-${blur}`;
  return <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true" focusable="false">
    {blur > 0 && <defs><filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={Math.min(4, blur / 3)} />
    </filter></defs>}
    <rect x="8" y="6" width="24" height="16" rx="2" fill="currentColor" filter={blur > 0 ? `url(#${id})` : undefined} />
  </svg>;
}

function LengthVisual({ length }: { length: number }) {
  return <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" focusable="false">
    <line x1="0" x2="40" y1="6" y2="6" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
    <line x1="0" x2={40 * Math.min(100, length) / 100} y1="6" y2="6" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

function ThicknessVisual({ thickness }: { thickness: number }) {
  return <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true" focusable="false">
    <rect x="0" y={(14 - thickness) / 2} width="40" height={thickness} fill="currentColor" />
  </svg>;
}

/** A line of text, the divider and a line of text again, with the gap set by the distance. */
function DistanceVisual({ distance }: { distance: number }) {
  const gap = Math.min(10, 2 + distance / 3);
  return <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden="true" focusable="false">
    <rect x="4" y="2" width="32" height="3" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="0" y={5 + gap} width="40" height="1.5" fill="currentColor" />
    <rect x="4" y={6.5 + 2 * gap} width="32" height="3" rx="1" fill="currentColor" opacity="0.5" />
  </svg>;
}

function AlignVisual({ align }: { align: Align }) {
  const bars = [28, 18, 24];
  return <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true" focusable="false">
    {bars.map((width, index) => <rect key={index} x={align === 'left' ? 0 : align === 'right' ? 40 - width : (40 - width) / 2}
      y={index * 5} width={width} height="3" rx="1" fill="currentColor" />)}
  </svg>;
}

/** A checkerboard with a white layer on top, at the given opacity. */
function OpacityVisual({ opacity }: { opacity: number }) {
  const squares: ReactNode[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 8; column++) {
      squares.push(<rect key={`${row}-${column}`} x={column * 5} y={row * 7} width="5" height="7" fill={(row + column) % 2 ? '#5b616c' : '#2c3038'} />);
    }
  }
  return <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true" focusable="false">
    {squares}
    <rect width="40" height="28" fill="#ffffff" opacity={opacity} />
  </svg>;
}

function strengthChoices(t: Translate): VisualOption<number>[] {
  return strengthLevels.map(([value, key]) => ({ value, label: t(key), visual: <StrengthVisual strength={value / 100} /> }));
}

function blurChoices(t: Translate): VisualOption<number>[] {
  return blurLevels.map(([value, key]) => ({ value, label: t(key), visual: <BlurVisual blur={value} /> }));
}

function alignChoices(t: Translate): VisualOption<Align>[] {
  const labels: [Align, MessageKey][] = [['left', 'left'], ['center', 'center'], ['right', 'right']];
  return labels.map(([value, key]) => ({ value, label: t(key), visual: <AlignVisual align={value} /> }));
}

/** Three sizes of "Aa": the default size of the area, and 20 % smaller and larger. */
function sizeChoices(t: Translate, base: number): VisualOption<number>[] {
  const sizes: [number, MessageKey, number][] = [
    [Math.round(base * 0.8), 'editorSmall', 11], [base, 'editorNormal', 15], [Math.round(base * 1.2), 'editorLarge', 19]
  ];
  return sizes.map(([value, key, fontSize]) => ({
    value, label: t(key), visual: <span className="editor-aa" style={{ fontSize }} aria-hidden="true">Aa</span>
  }));
}

function ColorControl({ label, value, change }: { label: string; value: string; change: (color: string) => void }) {
  return <label className="color-field template-color">
    {label}<input type="color" value={value} onChange={event => change(event.target.value)} />
  </label>;
}

/** A numeric value typed exactly, for the cases where the tiles are not enough. */
function ExactInput({ label, value, min, max, unit, change }: {
  label: string; value: number; min: number; max: number; unit: string; change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    if (!draft.trim()) { setDraft(String(value)); return; }
    const number = Number(draft.replace(',', '.'));
    if (!Number.isFinite(number)) { setDraft(String(value)); return; }
    const next = Math.round(Math.min(max, Math.max(min, number)));
    change(next);
    setDraft(String(next));
  }
  return <label className="visual-choice-custom editor-exact-row">
    <span>{label}</span>
    <input type="number" inputMode="decimal" min={min} max={max} step={1} value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={event => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(String(value));
      }} />
    <span className="visual-choice-unit">{unit}</span>
  </label>;
}

type TabItem<T extends string> = { id: T; label: string; icon?: IconName; count?: number; visual?: ReactNode };

/** Tabs with arrow, Home and End keys; the selected tab is the only one in the tab order. */
function TabList<T extends string>({ label, items, value, disabled, onChange, className, vertical = false, idPrefix, controls }: {
  label: string; items: TabItem<T>[]; value: T; disabled?: boolean; onChange: (id: T) => void; className?: string;
  vertical?: boolean; idPrefix?: string; controls?: string;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const selectedIndex = items.findIndex(item => item.id === value);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = steps[event.key];
    let index: number | undefined;
    if (step) index = (selectedIndex + step + items.length) % items.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = items.length - 1;
    if (index === undefined) return;
    event.preventDefault();
    const next = items[index];
    buttons.current.get(next.id)?.focus();
    if (next.id !== value) onChange(next.id);
  }
  return <div role="tablist" aria-label={label} aria-orientation={vertical ? 'vertical' : 'horizontal'} className={className} onKeyDown={keyDown}>
    {items.map((item, index) => {
      const selected = item.id === value;
      const focusable = selected || (selectedIndex < 0 && index === 0);
      return <button key={item.id} type="button" role="tab" disabled={disabled} id={idPrefix && `${idPrefix}-${item.id}`}
        aria-controls={controls} ref={node => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }}
        aria-selected={selected} tabIndex={focusable ? 0 : -1} onClick={() => onChange(item.id)}>
        {item.visual}
        {item.icon && <Icon name={item.icon} size={16} />}
        <span className="editor-tab-label">{item.label}</span>
        {!!item.count && <span className="editor-tab-count">{item.count}</span>}
      </button>;
    })}
  </div>;
}

/** Shading behind the top or bottom text area: its strength, how far it reaches and how much the artwork is blurred. */
function ShadingGroup({ config, appearance, patch }: {
  config: ShadingConfig; appearance: TemplateAppearance; patch: (values: Partial<TemplateAppearance>) => void;
}) {
  const { t } = useI18n();
  const { effect, shade, blur } = config;
  const settings = appearance[effect];
  const anchor = settings?.anchor ?? 'manual';
  const edge = effect === 'topEffect' ? 'top' : 'bottom';
  const withEffect = (next: TemplateEffect | undefined): TemplateAppearance =>
    effect === 'topEffect' ? { ...appearance, topEffect: next } : { ...appearance, bottomEffect: next };
  const reachOptions: VisualOption<TemplateEffect['anchor']>[] = reachLabels.map(([value, key]) => ({
    value, label: t(key),
    visual: <ReachVisual edge={edge} dashed={value === 'manual'}
      extent={Math.round(effectExtent(withEffect({ anchor: value, height: settings?.height }), effect))} />
  }));
  function chooseReach(next: TemplateEffect['anchor']) {
    patch({ [effect]: next === 'manual'
      ? { anchor: next, height: settings?.height ?? Math.round(effectExtent(appearance, effect)) }
      : { ...settings, anchor: next } });
  }
  return <fieldset className="editor-group">
    <legend>{t(config.title)}</legend>
    <VisualChoice label={t(config.strength)} value={Math.round(appearance[shade] * 100)} options={strengthChoices(t)}
      custom={{ min: 0, max: 100, unit: '%' }} onChange={value => patch({ [shade]: value / 100 })} />
    <VisualChoice label={t('editorReach')} value={anchor} options={reachOptions} help={t('editorReachHint')} onChange={chooseReach} />
    {anchor === 'manual' && <ExactInput label={t('editorReachHeight')} value={Math.round(effectExtent(appearance, effect))}
      min={0} max={100} unit="%" change={height => patch({ [effect]: { anchor: 'manual', height } })} />}
    <VisualChoice label={t('editorBlurArtwork')} value={appearance[blur] ?? 0} options={blurChoices(t)}
      custom={{ min: 0, max: 32, unit: 'px' }} onChange={value => patch({ [blur]: value })} />
  </fieldset>;
}

export function TemplateEditor({ tab, selectTab, appearance, defaultAppearance, customFrame, customControls, reset, cards, sampleCard, fonts, change,
  saving, saveError, retry, close, onPreview, previewControls, requestedZone }: {
  tab: FrameEditorTab; selectTab: (tab: FrameEditorTab) => void;
  appearance: TemplateAppearance;
  /** Appearance the reset/diff compares against (the template or set default). */
  defaultAppearance: TemplateAppearance;
  customFrame?: CustomFrame; customControls?: ReactNode; reset: () => void;
  cards: Card[];
  /** A card used to draw the thumbnails of the frame tiles. */
  sampleCard?: Card;
  fonts: string[]; change: (update: AppearanceUpdate) => void;
  saving: boolean; saveError: string; retry: () => void;
  close: () => void;
  onPreview: (state: EditorPreviewState) => void;
  /** Sample selectors for the stage preview, shown under "Anteprima". */
  previewControls?: ReactNode;
  /** When the user clicks an element on the stage preview; open the "Posizioni" section and select it. */
  requestedZone?: { zone: keyof Zones; nonce: number };
}) {
  const { t, locale } = useI18n();
  const [section, setSection] = useState<SectionId>('essentials');
  const [query, setQuery] = useState('');
  const [changesOpen, setChangesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [statsSample, setStatsSample] = useState<StatsSample>('card');
  const [zone, setZone] = useState<EditorZone>();
  const [selectedLayer, setSelectedLayer] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string }>();
  const renameDone = useRef(false);
  const [removing, setRemoving] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [opaqueAssets, setOpaqueAssets] = useState<ReadonlySet<string>>(() => new Set());
  const listId = useId();
  const panelId = useId();
  const changesId = useId();
  // The frame tiles redraw a whole card, so the active tile waits until the edits settle.
  const [tileAppearance, setTileAppearance] = useState(appearance);
  useEffect(() => {
    const timer = window.setTimeout(() => setTileAppearance(appearance), 400);
    return () => window.clearTimeout(timer);
  }, [appearance]);

  const decorations = appearance.decorations ?? [];
  const decoration = decorations.find(item => item.id === selectedLayer);
  const removingLayer = decorations.find(item => item.id === removing);
  const importDisabled = uploading || decorations.length >= maxDecorations;
  const changes = useMemo(() => appearanceChanges(appearance, defaultAppearance), [appearance, defaultAppearance]);
  const showSections = tab !== 'custom' || !!customFrame;
  const suggestedFonts = suggestedFontNames.filter(font => fonts.includes(font)).slice(0, 6);
  const queryTerms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const count = cards.filter(card => {
    const frame = card.frame;
    if (!card.source.editable) return false;
    if (tab !== 'custom') return frame.kind === 'template' && frame.template === tab;
    if (customFrame?.kind === 'color-set') return frame.kind === 'color-set' && frame.set.id === customFrame.set.id;
    return customFrame?.kind === 'custom' && frame.kind === 'custom' && frame.appearance === customFrame.appearance && frame.asset === customFrame.asset;
  }).length;

  const tileCard = (id: FrameEditorTab): Card | undefined => {
    if (!sampleCard) return undefined;
    if (id === 'custom') return customFrame && { ...sampleCard, frameOverride: true, frame: customFrame };
    const frame: Card['frame'] = {
      kind: 'template', template: id,
      appearance: id === tab ? tileAppearance : templateAppearance({ kind: 'template', template: id })
    };
    return { ...sampleCard, frameOverride: true, frame };
  };
  const frameTabs: TabItem<FrameEditorTab>[] = [
    ...Object.keys(templateNames).filter(isTemplate).map(id => ({
      id, label: t(templateNames[id]), visual: <FrameThumbnail card={tileCard(id)} icon="card" />
    })),
    { id: 'custom', label: t('customFrames'), visual: <FrameThumbnail card={tileCard('custom')} icon="frames" /> }
  ];

  function patch(values: Partial<TemplateAppearance>) {
    change(previous => ({ ...previous, ...values }));
  }

  function chooseTab(next: FrameEditorTab) {
    if (next === tab) return;
    setSelectedLayer(''); setZone(undefined); setUploadError(''); setRenaming(undefined); setRemoving(undefined);
    selectTab(next);
  }

  function editTextStyle(area: FrameTextArea, style: FrameTextStyle) {
    change(previous => ({ ...previous, textStyles: {
      ...previous.textStyles, [area]: { ...previous.textStyles?.[area], ...style }
    } }));
  }

  function editDecoration(values: Partial<FrameDecoration>) {
    if (!decoration) return;
    change(previous => ({
      ...previous, decorations: previous.decorations?.map(item => item.id === decoration.id ? { ...item, ...values } : item)
    }));
  }

  function addLayer(entry: FrameDecoration) {
    change(previous => {
      const layers = previous.decorations ?? [];
      return layers.length < maxDecorations ? { ...previous, decorations: [...layers, entry] } : previous;
    });
    setSelectedLayer(entry.id);
  }

  async function upload(file: File) {
    if (importDisabled) return;
    setUploading(true);
    setUploadError('');
    try {
      const asset = await importFrameArtwork(file);
      if (!asset.alpha) setOpaqueAssets(current => new Set(current).add(asset.id));
      addLayer({
        id: crypto.randomUUID(), name: asset.name, source: { kind: 'image', asset: asset.id },
        rect: { x: 3, y: 3, w: 94, h: 94 }, opacity: 1, color: '#fff8ea', fit: 'contain', tint: 'original'
      });
    } catch (error) {
      setUploadError(error instanceof Error ? errorMessage(error, locale) : t('decorationImportFailed'));
    } finally {
      setUploading(false);
    }
  }

  function addMotif(motif: Motif, name: string) {
    addLayer({
      id: crypto.randomUUID(), name, source: { kind: 'motif', motif }, rect: { x: 0, y: 0, w: 100, h: 100 },
      opacity: 1, tint: 'card', color: '#fff8ea', fit: 'stretch'
    });
  }

  function shiftLayer(index: number, step: number) {
    const next = [...decorations];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    patch({ decorations: next });
  }

  function startRename(item: FrameDecoration) {
    renameDone.current = false;
    setRenaming({ id: item.id, value: item.name });
  }

  function finishRename(commit: boolean) {
    const edit = renaming;
    if (!edit || renameDone.current) return;
    renameDone.current = true;
    setRenaming(undefined);
    const name = edit.value.trim().slice(0, 255);
    if (!commit || !name) return;
    change(previous => ({
      ...previous, decorations: previous.decorations?.map(item => item.id === edit.id ? { ...item, name } : item)
    }));
  }

  function updateZone(zoneName: keyof Zones, rect: Zones[keyof Zones]) {
    change(previous => ({ ...previous, zones: { ...previous.zones, [zoneName]: rect } }));
  }

  function restoreGroup(keys: AppearanceChange['keys']) {
    change(previous => restoreAppearanceKeys(previous, defaultAppearance, keys));
  }

  // Sections: "Immagini" exists only for custom frames, the others need a chosen frame.
  const rectZone = zone;
  const textArea: FrameTextArea | undefined = zone === undefined || zone === 'art' ? undefined : zone;
  const opaqueWarning = !!decoration && decoration.tint !== 'original' && decoration.source.kind === 'image'
    && opaqueAssets.has(decoration.source.asset);
  const dividerToggles = [
    ['titleDivider', 'titleDividerHideWhen', 'belowTitle'],
    ['divider', 'dividerHideWhen', 'aboveRules']
  ] as const;
  const dividerLength = appearance.dividerLength ?? 100;
  const dividerPadding = appearance.dividerPadding ?? 6;
  const shadeValue = Math.round((appearance.titleShade + appearance.rulesShade) / 2 * 100);
  const rulesSize = appearance.textStyles?.rules?.size ?? defaultFrameTextSizes.rules;
  const artistBase = tab === 'custom' ? 20 : defaultFrameTextSizes.artist;

  const lengthChoices: VisualOption<number>[] = lengthLevels.map(([value, key]) => ({ value, label: t(key), visual: <LengthVisual length={value} /> }));
  const thicknessChoices: VisualOption<number>[] = thicknessLevels.map(value => ({
    value, label: `${value} px`, visual: <ThicknessVisual thickness={value} />
  }));
  const distanceChoices: VisualOption<number>[] = distanceLevels.map(([value, key]) => ({ value, label: t(key), visual: <DistanceVisual distance={value} /> }));
  const alignDividerChoices: VisualOption<Align>[] = alignChoices(t);
  const strokeChoices: VisualOption<NonNullable<TemplateAppearance['dividerStyle']>>[] = [
    { value: 'solid', label: t('solid'), visual: strokeSample('solid') },
    { value: 'fade', label: t('fadedEnds'), visual: strokeSample('fade') },
    { value: 'dashed', label: t('dashed'), visual: strokeSample('dashed') }
  ];
  const opacityChoices: VisualOption<number>[] = opacityLevels.map(value => ({
    value, label: `${value}%`, visual: <OpacityVisual opacity={value / 100} />
  }));

  const layoutSection: Section = {
    id: 'layout', title: t('editorSectionLayout'), icon: 'zone', help: t('editorHelpLayout'), keywords: sectionKeywords.layout,
    body: <div className="editor-stack">
      <div className="editor-chips" role="group" aria-label={t('zonePicker')}>
        {zoneChoices.map(choice => <button key={choice.zone} type="button" className="editor-chip" aria-pressed={zone === choice.zone}
          onClick={() => setZone(zone === choice.zone ? undefined : choice.zone)}>{t(choice.label)}</button>)}
      </div>
      {zone && <div className="editor-stack">
        {rectZone && <details className="editor-exact">
          <summary>{t('editorExactValues')}</summary>
          <ZoneFields rect={appearance.zones[rectZone]} update={rect => updateZone(rectZone, rect)} />
          <p className="muted editor-help">{t('resizeZoneHelp')}</p>
        </details>}
        {textArea && <VisualChoice label={t('horizontalAlignment')} value={appearance.textStyles?.[textArea]?.align ?? defaultFrameTextAlign(textArea)}
          options={alignChoices(t)} onChange={align => editTextStyle(textArea, { align })} />}
        {textArea === 'stats' && <p className="muted editor-help">{t('statsSizeNote')}</p>}
        {textArea && textArea !== 'stats' && <VisualChoice label={t('maxTextSize')}
          value={appearance.textStyles?.[textArea]?.size ?? (textArea === 'artist' ? artistBase : defaultFrameTextSizes[textArea])}
          options={sizeChoices(t, textArea === 'artist' ? artistBase : defaultFrameTextSizes[textArea])}
          custom={{ min: 8, max: 96, unit: 'px' }} help={t('rulesTextSizeHelp')} onChange={size => editTextStyle(textArea, { size })} />}
      </div>}
    </div>
  };

  const sectionsAll: Section[] = [
    { id: 'images', title: t('frameImagesTitle'), icon: 'art', help: t('editorHelpImages'), keywords: sectionKeywords.images,
      body: <div className="editor-stack">
        {customControls}
        {!customFrame && <p className="editor-help">{t('chooseFrameFirst')}</p>}
      </div> },
    { id: 'essentials', title: t('editorSectionEssentials'), icon: 'settings', help: t('editorHelpEssentials'), keywords: sectionKeywords.essentials,
      body: <div className="editor-stack">
        <FontPicker value={appearance.fontFamily ?? 'Georgia'} fonts={fonts} onChange={fontFamily => patch({ fontFamily })} />
        {suggestedFonts.length > 0 && <div className="editor-chips" role="group" aria-label={t('suggestedFonts')}>
          {suggestedFonts.map(font => <button key={font} type="button" className="editor-chip" aria-pressed={(appearance.fontFamily ?? 'Georgia') === font}
            style={{ fontFamily: `"${font}", serif` }} onClick={() => patch({ fontFamily: font })}>{font}</button>)}
        </div>}
        <VisualChoice label={t('shadeStrength')} value={shadeValue} options={strengthChoices(t)} custom={{ min: 0, max: 100, unit: '%' }}
          onChange={value => patch({ titleShade: value / 100, rulesShade: value / 100 })} />
        <VisualChoice label={t('rulesTextSize')} value={rulesSize} options={sizeChoices(t, defaultFrameTextSizes.rules)}
          custom={{ min: 8, max: 96, unit: 'px' }} help={t('rulesTextSizeHelp')} onChange={size => editTextStyle('rules', { size })} />
        <fieldset className="editor-group">
          <legend>{t('dividers')}</legend>
          {dividerToggles.map(([enabled, , label]) => <label className="check" key={enabled}>
            <input type="checkbox" checked={appearance[enabled] ?? false} onChange={event => patch({ [enabled]: event.target.checked })} />{t(label)}
          </label>)}
        </fieldset>
      </div> },
    { id: 'text', title: t('editorSectionColors'), icon: 'text', help: t('editorHelpText'), keywords: sectionKeywords.text,
      body: <div className="editor-stack">
        <div className="editor-stack">
          <ColorControl label={t('textColor')} value={appearance.textColor} change={textColor => patch({ textColor })} />
          <p className="muted editor-help">{t('textColorHelp')}</p>
        </div>
        <ElementColorsEditor appearance={appearance} change={change} />
      </div> },
    { id: 'shading', title: t('editorSectionShading'), icon: 'overlay', help: t('editorHelpShading'), keywords: sectionKeywords.shading,
      body: <div className="editor-stack">
        <ColorControl label={t('shadeColor')} value={appearance.shadeColor ?? '#141820'} change={shadeColor => patch({ shadeColor })} />
        {shadingGroups.map(config => <ShadingGroup key={config.effect} config={config} appearance={appearance} patch={patch} />)}
      </div> },
    { id: 'dividers', title: t('dividers'), icon: 'batch', help: t('editorHelpDividers'), keywords: sectionKeywords.dividers,
      body: <div className="editor-stack">
        {dividerToggles.map(([enabled, condition, label]) => {
          const on = appearance[enabled] ?? false;
          return <div className="template-divider-controls" role="group" aria-label={t(label)} key={enabled}>
            <label className="check"><input type="checkbox" checked={on}
              onChange={event => patch({ [enabled]: event.target.checked })} />{t(label)}</label>
            <VisibilityConditionEditor condition={appearance[condition]} disabled={!on} change={value => patch({ [condition]: value })} />
          </div>;
        })}
        <VisualChoice label={t('dividerLength')} value={dividerLength} options={lengthChoices} custom={{ min: 5, max: 100, unit: '%' }}
          onChange={value => patch({ dividerLength: value })} />
        <VisualChoice label={t('dividerWeight')} value={appearance.dividerWeight ?? 2} options={thicknessChoices}
          custom={{ min: 1, max: 12, unit: 'px' }} onChange={value => patch({ dividerWeight: value })} />
        <VisualChoice label={t('dividerPadding')} value={dividerPadding} options={distanceChoices} custom={{ min: 0, max: 100, unit: 'px' }}
          onChange={value => patch({ dividerPadding: value })} />
        <VisualChoice label={t('alignment')} value={appearance.dividerAlign ?? 'center'} options={alignDividerChoices}
          disabled={dividerLength >= 100} help={dividerLength >= 100 ? t('alignmentNoEffectHelp') : undefined}
          onChange={value => patch({ dividerAlign: value })} />
        <VisualChoice label={t('stroke')} value={appearance.dividerStyle ?? 'solid'} options={strokeChoices}
          onChange={value => patch({ dividerStyle: value })} />
      </div> },
    { id: 'decorations', title: t('decorations'), icon: 'layers', help: t('editorHelpDecorations'), keywords: sectionKeywords.decorations,
      count: decorations.length || undefined,
      body: <div className="editor-stack">
        <ImageDropzone label={t('dropDecorationLabel')} disabled={decorations.length >= maxDecorations} busy={uploading}
          help={decorations.length >= maxDecorations ? t('layerLimit', { limit: maxDecorations }) : undefined}
          onFiles={files => { if (files[0]) void upload(files[0]); }} />
        {uploading && <p role="status" className="muted">{t('importingDecoration')}</p>}
        {uploadError && <p role="alert" className="error">{uploadError}</p>}
        {appearance.overlay && <div className="template-overlay">
          <img src={assetURL(appearance.overlay)} alt="" /><span>{t('legacyOverlay')}</span>
          <button className="icon-button" aria-label={t('removePngOverlay')} onClick={() => patch({ overlay: undefined })}><Icon name="remove" /></button>
        </div>}
        <div className="editor-stack">
          <span className="editor-label">{t('motifsIncluded')}</span>
          <div className="editor-chips" role="group" aria-label={t('motifsIncluded')}>
            {motifChoices.map(choice => <button key={choice.motif} type="button" className="editor-chip"
              disabled={decorations.length >= maxDecorations} onClick={() => addMotif(choice.motif, t(choice.label))}>{t(choice.label)}</button>)}
          </div>
        </div>
        {!!decorations.length && <ol className="template-layer-list" aria-label={t('layers')}>
          {decorations.map((item, index) => <li key={item.id}>
            {renaming?.id === item.id
              ? <input className="editor-rename" aria-label={t('layerNameInput')} autoFocus maxLength={255} value={renaming.value}
                onChange={event => setRenaming({ id: item.id, value: event.target.value })}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); finishRename(true); }
                  else if (event.key === 'Escape') { event.preventDefault(); finishRename(false); }
                }}
                onBlur={() => finishRename(true)} />
              : <button type="button" aria-pressed={item.id === selectedLayer} className="template-layer-name" onClick={() => setSelectedLayer(item.id)}>
                <Icon name={item.source.kind === 'image' ? 'art' : 'layers'} size={16} /><span>{item.name}</span>
              </button>}
            <button type="button" className="icon-button" aria-label={t('renameLayerAria', { name: item.name })} onClick={() => startRename(item)}><Icon name="edit" size={15} /></button>
            <button type="button" className="icon-button" aria-label={t('raiseLayer', { name: item.name })} disabled={index === decorations.length - 1} onClick={() => shiftLayer(index, 1)}><Icon name="up" size={15} /></button>
            <button type="button" className="icon-button" aria-label={t('lowerLayer', { name: item.name })} disabled={index === 0} onClick={() => shiftLayer(index, -1)}><Icon name="down" size={15} /></button>
            <button type="button" className="icon-button" aria-label={t('removeLayer', { name: item.name })} onClick={() => setRemoving(item.id)}><Icon name="remove" size={15} /></button>
          </li>)}
        </ol>}
        {decoration && <fieldset className="template-settings editor-layer">
          <legend>{t('editLayer')}</legend>
          {opaqueWarning && <p role="status" className="editor-warning">{t('opaqueImageTint')}</p>}
          <div className="editor-pair">
            <label>{t('decorationColor')}<Select value={decoration.tint} onChange={event => editDecoration({ tint: event.target.value as FrameDecoration['tint'] })}>
              <option value="original">{t('original')}</option><option value="card">{t('cardColor')}</option>
              <option value="text">{t('sameAsText')}</option><option value="custom">{t('custom')}</option>
            </Select></label>
            <label>{t('fit')}<Select value={decoration.fit} onChange={event => editDecoration({ fit: event.target.value as FrameDecoration['fit'] })}>
              <option value="contain">{t('keepAspectRatio')}</option><option value="stretch">{t('fillArea')}</option>
            </Select></label>
          </div>
          {decoration.tint === 'custom' && <ColorControl label={t('decorationTint')} value={decoration.color} change={color => editDecoration({ color })} />}
          <VisualChoice label={t('decorationOpacity')} value={Math.round(decoration.opacity * 100)} options={opacityChoices}
            custom={{ min: 0, max: 100, unit: '%' }} onChange={value => editDecoration({ opacity: value / 100 })} />
          <VisibilityConditionEditor condition={decoration.hideWhen} change={hideWhen => editDecoration({ hideWhen })} />
          <details className="editor-exact">
            <summary>{t('editorExactValues')}</summary>
            <ZoneFields rect={decoration.rect} update={rect => editDecoration({ rect })} />
          </details>
          <p className="muted editor-help">{t('moveLayerHelp')}</p>
        </fieldset>}
      </div> },
    { id: 'symbols', title: t('manaSymbols'), icon: 'mana', help: t('editorHelpSymbols'), keywords: sectionKeywords.symbols,
      count: customSymbolCount(appearance) || undefined, body: <SymbolEditor appearance={appearance} change={change} /> },
    { id: 'cardColors', title: t('cardColorsTitle'), icon: 'card', help: t('editorHelpCardColors'), keywords: sectionKeywords.cardColors,
      count: customCardColorCount(appearance) || undefined, body: <CardColorsEditor appearance={appearance} change={change} /> },
    { id: 'stats', title: t('stats'), icon: 'stats', help: t('editorHelpStats'), keywords: sectionKeywords.stats,
      body: <StatsEditor key={tab} sample={statsSample} setSample={setStatsSample} value={appearance.statsAppearance} colors={false}
        baseSize={appearance.textStyles?.stats?.size} change={statsAppearance => patch({ statsAppearance })} /> },
    layoutSection
  ];
  const sections = sectionsAll.filter(item => item.id === 'images' ? tab === 'custom' : showSections);
  const active = sections.find(item => item.id === section) ?? sections[0];
  const searching = queryTerms.length > 0;
  const visibleSections = sections.filter(item => {
    if (!searching) return true;
    const haystack = normalizeSearch(`${item.title} ${item.keywords}`);
    return queryTerms.every(term => haystack.includes(term));
  });

  // The stage preview shows a guide for the element being edited: a zone, a decoration or the shading limits.
  const guide: EditorPreviewState['guide'] = active.id === 'layout' && rectZone ? { kind: 'zone', zone: rectZone }
    : active.id === 'decorations' && decoration ? { kind: 'decoration', id: decoration.id }
      : active.id === 'shading' ? { kind: 'shading' } : undefined;
  const guideKey = !guide ? '' : guide.kind === 'zone' ? `zone:${guide.zone}` : guide.kind === 'decoration' ? `decoration:${guide.id}` : 'shading';
  const previewRef = useRef(onPreview);
  useEffect(() => { previewRef.current = onPreview; });
  // The guide object is new on every render, so the effect depends on guideKey instead.
  useEffect(() => {
    previewRef.current({ statsSample, guide });
  }, [statsSample, guideKey]);
  useEffect(() => () => previewRef.current({ statsSample: 'card' }), []);

  // Only a new request (nonce or zone) moves the editor to that element.
  useEffect(() => {
    if (!requestedZone) return;
    setQuery('');
    setSection('layout');
    setZone(requestedZone.zone);
  }, [requestedZone?.nonce, requestedZone?.zone]);

  return <>
    <nav className="editor-focus-nav" aria-label={t('editorCustomizeFrame')}>
      <header className="editor-nav-head">
        <button type="button" className="editor-back" onClick={close}>
          <Icon name="collapse" size={16} />{t('editorBackToDeck')}
        </button>
        <h2>{t('editorCustomizeFrame')}</h2>
      </header>

      <div className="editor-nav-body">
        <TabList className="editor-template-tabs" label={t('editorFrameType')} items={frameTabs} value={tab} disabled={uploading} onChange={chooseTab} />
        <p className="editor-usage muted">
          {count ? t(count === 1 ? 'appliesToCardOne' : 'appliesToCards', { count }) : t('noFrameCards')}
        </p>

        {previewControls && <section className="editor-nav-group" aria-label={t('editorPreview')}>
          <h3>{t('editorPreview')}</h3>
          {previewControls}
        </section>}

        <div className="editor-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} placeholder={t('searchOptions')} aria-label={t('searchOptions')}
            onChange={event => setQuery(event.target.value)} />
        </div>
        {!visibleSections.length && <p className="muted editor-help">{t('noOptionsFound')}</p>}
        {!!visibleSections.length && <TabList className="editor-section-list" vertical label={t('editorSections')}
          items={visibleSections.map(item => ({ id: item.id, label: item.title, icon: item.icon, count: item.count }))}
          value={active.id} idPrefix={listId} controls={panelId} onChange={setSection} />}
      </div>

      <footer className="editor-nav-foot">
        {showSections && <div className="editor-changes">
          <button type="button" className="editor-changes-toggle" aria-expanded={changesOpen} aria-controls={changesId}
            disabled={!changes.length} onClick={() => setChangesOpen(open => !open)}>
            <span>{changes.length
              ? t(changes.length === 1 ? 'changesBadgeOne' : 'changesBadge', { count: changes.length })
              : t('editorNoChanges')}</span>
            {!!changes.length && <Icon name={changesOpen ? 'up' : 'down'} size={14} />}
          </button>
          <ul id={changesId} className="editor-change-list" hidden={!changesOpen || !changes.length}>
            {changes.map(group => <li key={group.id}>
              <span>{t(changeLabels[group.id])}</span>
              <button type="button" className="editor-chip" onClick={() => restoreGroup(group.keys)}>{t('restoreChange')}</button>
            </li>)}
          </ul>
        </div>}
        <div className="editor-status">
          <span className={saveError ? 'error' : 'muted'} role="status">{saveError || (saving ? t('saving') : t('autosave'))}</span>
          {saveError && <button type="button" onClick={retry}>{t('retry')}</button>}
        </div>
        <button type="button" className="icon-label editor-reset" disabled={uploading || !changes.length || (tab === 'custom' && !customFrame)}
          onClick={() => setResetOpen(true)}>
          <Icon name="reset" size={16} />{t('resetAll')}
        </button>
      </footer>

      {resetOpen && <ConfirmDialog title={t('resetAllTitle')} confirmLabel={t('resetAll')} cancelLabel={t('confirmCancel')}
        onCancel={() => setResetOpen(false)} onConfirm={() => {
          setResetOpen(false);
          reset();
          setZone(undefined); setSelectedLayer(''); setUploadError('');
        }}>
        <ul className="editor-change-list">
          {changes.map(group => <li key={group.id}><span>{t(changeLabels[group.id])}</span></li>)}
        </ul>
      </ConfirmDialog>}
    </nav>

    <section id={panelId} className="editor-focus-controls" role="tabpanel" aria-label={active.title}>
      <header className="editor-controls-head">
        <h2>{active.title}</h2>
        <p>{active.help}</p>
      </header>
      <div className="editor-controls-body">{active.body}</div>
      {removingLayer && <ConfirmDialog title={t('removeLayerTitle', { name: removingLayer.name })} confirmLabel={t('confirmRemove')}
        cancelLabel={t('confirmCancel')} onCancel={() => setRemoving(undefined)} onConfirm={() => {
          patch({ decorations: decorations.filter(layer => layer.id !== removingLayer.id) });
          if (selectedLayer === removingLayer.id) setSelectedLayer('');
          setRemoving(undefined);
        }} />}
    </section>
  </>;
}
