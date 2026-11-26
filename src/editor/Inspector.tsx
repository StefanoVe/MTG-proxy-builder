import { Dropdown } from './Dropdown.js';
import { Select } from './Select.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { cardFrameColors } from './card-colors.js';
import { cardZones } from './card-zones.js';
import { colorsForFrame } from '../shared/frame-colors.js';
import { defaultFrameTextSizes, frameAppearance } from '../shared/templates.js';
import type { TemplateFrame } from '../shared/templates.js';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { detectedArtZone } from './compose.js';
import { cardArtZone, defaultCrop, frameColorNames, frameTextAreas, printingFields, templateNames } from '../shared/model.js';
import type { Asset, Card, FrameSet, FrameTextAlign, FrameTextArea, Preset, Project, Rect, TemplateAppearance, Zones } from '../shared/model.js';
import { isCardModified } from '../shared/model.js';
import { Icon } from './Icon.js';
import { NumberField, StatsAppearanceControls, clampInt, sizeSteps } from './StatsAppearanceControls.js';
import type { IconName } from './Icon.js';
import { FramePicker, choiceFrame, frameChoiceOf, frameChoices } from './FramePicker.js';
import type { FrameChoice } from './FramePicker.js';
import { VisualChoice } from './VisualChoice.js';
import type { VisualOption } from './VisualChoice.js';
import './inspector.css';

export const zoneLabels: Record<keyof Zones, MessageKey> = { art: 'art', title: 'header', type: 'type', rules: 'text', stats: 'stats' };
export type FrameElement = keyof Zones | FrameTextArea;
const visibleSectionLabels: Record<keyof Zones | 'artist', MessageKey> = {
  art: 'sectionArt', title: 'sectionName', type: 'sectionType', rules: 'sectionText', stats: 'sectionStats', artist: 'sectionArtist'
};
const elementLabels: Record<FrameTextArea, MessageKey> = {
  title: 'sectionName', type: 'sectionType', rules: 'sectionText', stats: 'sectionStats', artist: 'elementSignature'
};
const rarityNames: Partial<Record<string, MessageKey>> = { common: 'common', uncommon: 'uncommon', rare: 'rare', mythic: 'mythic', special: 'special', bonus: 'bonus' };
const manaTokens = ['W', 'U', 'B', 'R', 'G', 'C', 'X'] as const;
const tabItems = ['card', 'art', 'frame'] as const;
type InspectorTab = typeof tabItems[number];
type StatsValueKind = 'pair' | 'loyalty' | 'defense';
type ZoneKey = keyof Rect;
const oppositeZoneKey = { x: 'w', y: 'h', w: 'x', h: 'y' } as const;

function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
  return <h3 className="inspector-section-title"><Icon name={icon} size={15} />{children}</h3>;
}

function ToolButton({ icon, label, onClick, pressed, caption = label }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; caption?: string }) {
  return <button className="icon-label" aria-label={label} title={caption === label ? undefined : label} aria-pressed={pressed} onClick={onClick}><Icon name={icon} /><span>{caption}</span></button>;
}

function FieldLabel({ icon, children }: { icon: IconName; children: string }) {
  return <span className="field-label"><Icon name={icon} size={14} />{children}</span>;
}

const elementIcons: Record<FrameTextArea, IconName> = { title: 'card', type: 'type', rules: 'text', stats: 'stats', artist: 'artist' };

/** Three horizontal bars, aligned as the choice says; the frame choice draws them dashed. */
function AlignVisual({ align }: { align: FrameTextAlign | 'frame' }) {
  const start = { left: 2, center: 6, right: 10, frame: 2 }[align];
  const widths = [12, 8, 10];
  return <svg viewBox="0 0 20 14" width="22" height="15" aria-hidden="true">
    {widths.map((width, row) => {
      const x = align === 'center' ? (20 - width) / 2 : align === 'right' ? 18 - width : start;
      return <rect key={row} x={x} y={2 + row * 4} width={width} height="2" rx="1" fill="currentColor"
        opacity={align === 'frame' ? .55 : 1} />;
    })}
  </svg>;
}

/** Shows the crop window: a larger zoom leaves a smaller window of the artwork. */
function ZoomVisual({ zoom }: { zoom: number }) {
  return <span className="zoom-visual"><span style={{ width: 24 / zoom, height: 24 / zoom }} /></span>;
}

function detectStatsKind(fields: Card['fields']): StatsValueKind {
  if (/\b(planeswalker)\b/i.test(fields.type) || fields.loyalty) return 'loyalty';
  if (/\b(battle|battaglia)\b/i.test(fields.type) || fields.defense) return 'defense';
  return 'pair';
}

function fontStack(name: string) {
  if (name === 'serif') name = 'Georgia';
  if (name === 'sans') name = 'Arial';
  if (name === 'system') name = 'system-ui';
  return `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}", sans-serif`;
}

export function FontPicker({ value, fonts, onChange }: { value: string; fonts: string[]; onChange: (font: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const legacyFontNames: Record<string, string> = { serif: 'Georgia', sans: 'Arial', system: 'System UI' };
  const currentName = legacyFontNames[value] ?? value;
  const currentInstalledName = fonts.find(font => font.toLocaleLowerCase() === currentName.toLocaleLowerCase());
  const filtered = fonts.filter(font => font.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choices = [...new Set([...(currentInstalledName && !query ? [currentInstalledName] : []), ...filtered])].slice(0, 120);
  return <div className="font-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label><FieldLabel icon="type">{t('searchFonts')}</FieldLabel><input type="search" value={query} placeholder={t('fontExample')} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} /></label>
    <div className="font-current" style={{ fontFamily: fontStack(value) }}><span>{currentName}</span><span className="font-sample">Aa Bb Cc 123</span></div>
    {open && <Dropdown className="font-picker-results" role="listbox" aria-label={t('systemFonts')}>
      {choices.map(font => <button type="button" key={font} role="option" aria-selected={font === value} className="font-option" style={{ fontFamily: fontStack(font) }} onClick={() => {
        onChange(font); setQuery(''); setOpen(false);
      }}><span>{font}</span><span className="font-sample">Aa Bb Cc 123</span></button>)}
      {!choices.length && <p className="muted font-empty">{t('noFonts')}</p>}
      {filtered.length > 120 && <small className="muted font-empty">{t('fontResults')}</small>}
    </Dropdown>}
  </div>;
}

export type ZoneFieldsProps = { rect: Rect; update: (rect: Rect) => void };

/** X, Y, width and height in percent. Values are committed on blur or Enter, and Escape reverts the draft. */
export function ZoneFields({ rect, update }: ZoneFieldsProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Partial<Record<ZoneKey, string>>>({});
  const limitOf = (key: ZoneKey) => 100 - rect[oppositeZoneKey[key]];
  const minimumOf = (key: ZoneKey) => key === 'x' || key === 'y' ? 0 : 1;
  function clearDraft(key: ZoneKey) {
    setDrafts(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function commit(key: ZoneKey) {
    const draft = drafts[key];
    clearDraft(key);
    if (draft === undefined || draft.trim() === '') return;
    const value = Number(draft);
    if (!Number.isFinite(value)) return;
    update({ ...rect, [key]: Math.max(minimumOf(key), Math.min(limitOf(key), value)) });
  }
  return <>
    <div className="form-row zone-fields">
      {(['x', 'y', 'w', 'h'] as const).map(key => <label key={key}>{({ x: 'X', y: 'Y', w: t('width'), h: t('height') })[key]}
        <input type="number" step="any" min={minimumOf(key)} max={limitOf(key)} value={drafts[key] ?? Number(rect[key].toFixed(2))}
          onChange={event => setDrafts(current => ({ ...current, [key]: event.target.value }))}
          onBlur={() => commit(key)}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commit(key); }
            else if (event.key === 'Escape') clearDraft(key);
          }} />
      </label>)}
    </div>
    {limitOf('x') <= 0 && <p className="muted">{t('zoneHorizontalHint')}</p>}
    {limitOf('y') <= 0 && <p className="muted">{t('zoneVerticalHint')}</p>}
  </>;
}

function EditionDetails({ card }: { card: Card }) {
  const { t } = useI18n();
  const details = card.source.details;
  if (!details) return null;
  const rarity = rarityNames[details.rarity];
  return <div className="card-details">
    {(details.rarity || details.lang) && <p className="muted">{[rarity ? t(rarity) : details.rarity, details.lang.toUpperCase()].filter(Boolean).join(' · ')}</p>}
    {details.flavor && <p lang={details.lang}>{details.flavor}</p>}
    {details.faces.map((face, index) => <section key={index}>
      <h3>{face.name}</h3>
      <p className="muted">{[face.mana, face.type].filter(Boolean).join(' · ')}</p>
      {face.rules && <p>{face.rules}</p>}
      {face.flavor && <p>{face.flavor}</p>}
      {(face.power || face.toughness) && <p>{t('powerToughness', { power: face.power, toughness: face.toughness })}</p>}
      {face.loyalty && <p>{t('loyaltyValue', { value: face.loyalty })}</p>}
      {face.defense && <p>{t('defenseValue', { value: face.defense })}</p>}
      {face.artist && <small>{t('artist', { name: face.artist })}</small>}
    </section>)}
  </div>;
}

export type InspectorProps = {
  card: Card; renderedCard: Card; back: boolean;
  /** This card currently follows the deck frame. */
  sharedFrame: boolean;
  presets: Preset[];
  project: Project;
  /** The deck-wide frame, when the project has one. */
  projectFrame?: Card['frame'];
  update: (patch: Partial<Card>) => void;
  resetCard: () => void;
  selectAssets: (frame: boolean) => Promise<Asset | undefined>;
  choosePrinting: () => void;
  zone: FrameElement | undefined;
  selectZone: (zone: FrameElement | undefined) => void;
  /** A new nonce opens the frame tab (or the artwork tab for the art area) on this element. */
  focusElement?: { zone: FrameElement; nonce: number };
  focusDeckStyle?: () => void;
  chooseEditionFrame?: () => void;
  savePreset: (name: string) => void;
  frameSets: FrameSet[];
  editCustomFrame: () => void;
  copyFrame?: () => void;
  pasteFrame?: () => void;
  mirror?: { value: string; suspended: boolean; options: { value: string; label: string }[]; change: (value: string) => void };
  fullArtBase?: TemplateAppearance;
  printingEditFrame: TemplateFrame;
};

export function Inspector({ card, renderedCard, sharedFrame, projectFrame, project, update, resetCard, choosePrinting, zone, selectZone, focusElement,
  focusDeckStyle, chooseEditionFrame, savePreset, editCustomFrame, copyFrame, pasteFrame, mirror, printingEditFrame }: InspectorProps) {
  const { t } = useI18n();
  const baseId = useId();
  const [tab, setTab] = useState<InspectorTab>('card');
  const [presetName, setPresetName] = useState('');
  const [copying, setCopying] = useState(false);
  // "Copy from another card" stays open while the user is choosing a source; any other way the link
  // disappears (card reset, source removed) returns the card to its own style.
  const choosingSource = useRef(false);
  const linked = !!mirror?.value;
  useEffect(() => {
    if (!linked && !choosingSource.current) setCopying(false);
    choosingSource.current = false;
  }, [linked]);
  const [tweaksOpen, setTweaksOpen] = useState(true);
  const tabButtons = useRef<Partial<Record<InspectorTab, HTMLButtonElement | null>>>({});
  const seenFocus = useRef(focusElement?.nonce);
  useEffect(() => {
    if (!focusElement || focusElement.nonce === seenFocus.current) return;
    seenFocus.current = focusElement.nonce;
    setTab(focusElement.zone === 'art' ? 'art' : 'frame');
  }, [focusElement]);

  const pasteLabel = t(sharedFrame ? 'pasteFrameSettings' : 'pasteFrame');
  const custom = card.frame.kind === 'custom' ? card.frame : undefined;
  const colorSet = renderedCard.frame.kind === 'color-set' ? renderedCard.frame.set : undefined;
  const original = renderedCard.frame.kind === 'printing';
  const printingTemplateName = t(templateNames[printingEditFrame.template]);
  const elementZone = zone === 'art' ? undefined : zone;
  const textArea = elementZone;
  const layoutZone = original || elementZone === 'artist' ? undefined : elementZone;
  const sizeArea = elementZone && elementZone !== 'stats' ? elementZone : undefined;
  const mirrored = !!mirror?.value;
  const appearance = frameAppearance(renderedCard.frame);
  const visibleFields = original && !mirrored ? printingFields(card.source) : card.fields;
  const art = original ? !!card.art : !!(card.art ?? card.source.images.art);

  // Who decides the frame: the deck, a copied card, or this card alone.
  const deckChecked = sharedFrame && !mirrored;
  const copyChecked = mirrored || copying;
  const ownChecked = !deckChecked && !copyChecked;
  const pickerChoices = frameChoices(project, { printing: !!card.source.printingId, custom: card.frame.kind === 'custom' });
  const pickerValue: FrameChoice = renderedCard.frame.kind === 'color-set'
    ? { kind: 'color-set', id: renderedCard.frame.set.id } : frameChoiceOf(card.frame);

  const detectedStats = detectStatsKind(visibleFields);
  const [statsKind, setStatsKind] = useState<StatsValueKind>(detectedStats);
  const [seenStats, setSeenStats] = useState(detectedStats);
  if (seenStats !== detectedStats) {
    setSeenStats(detectedStats);
    setStatsKind(detectedStats);
  }

  const sizeOverride = sizeArea ? card.textStyleOverrides?.[sizeArea]?.size : undefined;
  // Tiles scale the frame's own size, never this card's override, so they stay put while you choose.
  const frameSize = sizeArea ? appearance?.textStyles?.[sizeArea]?.size ?? defaultFrameTextSizes[sizeArea] : 0;
  const sizeLabels = { small: 'inspectorSizeSmall', normal: 'inspectorSizeNormal', large: 'inspectorSizeLarge' } as const;
  const sizeOptions: VisualOption<number | ''>[] = [
    { value: '', label: t('inheritFrameAlignment'), visual: <span className="size-visual is-inherit">Aa</span> },
    ...sizeSteps(frameSize, 8, 96).map(step => ({
      value: step.value, label: t(sizeLabels[step.key]),
      visual: <span className="size-visual" style={{ fontSize: `${(14 * step.value) / frameSize}px` }}>Aa</span>
    }))
  ];
  const tweakCount = Object.keys(card.zoneOverrides ?? {}).length + (card.hiddenZones?.length ?? 0)
    + Object.values(card.dividerOverrides ?? {}).filter(value => value !== undefined).length
    + (Object.values(card.statsOverrides ?? {}).some(value => value !== undefined) ? 1 : 0)
    + Object.keys(card.textAlignOverrides ?? {}).length
    + Object.values(card.textStyleOverrides ?? {}).filter(value => value?.size !== undefined).length;

  function setField(field: keyof Card['fields'], value: string) {
    if (value === visibleFields[field]) return;
    const fields = { ...visibleFields, [field]: value };
    if (!mirrored && card.frame.kind === 'printing') {
      update({ fields, frame: printingEditFrame });
      if (original) selectZone(undefined);
    } else {
      update({ fields });
    }
  }
  function changeArtZone(rect: Rect) {
    update({ zoneOverrides: { ...card.zoneOverrides, art: rect } });
  }

  function setTextAlign(area: FrameTextArea, align: FrameTextAlign | '') {
    const overrides = { ...card.textAlignOverrides };
    if (align) overrides[area] = align;
    else delete overrides[area];
    update({
      textAlignOverrides: Object.keys(overrides).length ? overrides : undefined,
      ...(original && align ? { frame: printingEditFrame } : {})
    });
  }

  function setTextSize(area: FrameTextArea, size: number | undefined) {
    const overrides = { ...card.textStyleOverrides };
    if (size === undefined) delete overrides[area];
    else overrides[area] = { size };
    update({
      textStyleOverrides: Object.keys(overrides).length ? overrides : undefined,
      ...(original ? { frame: printingEditFrame } : {})
    });
  }

  async function toggleArtZone() {
    if (zone === 'art') { selectZone(undefined); return; }
    if (card.frame.kind !== 'printing') return;
    const artZone = card.frame.artZone ?? await detectedArtZone(card);
    if (artZone) update({ frame: { kind: 'printing', artZone } });
    selectZone('art');
  }

  function selectTab(item: InspectorTab) {
    setTab(item);
    if (item !== 'frame' || (original && zone === 'art')) selectZone(undefined);
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabItems.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last : undefined;
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabItems[next]);
    tabButtons.current[tabItems[next]]?.focus();
  }

  function followDeck() {
    if (mirrored) mirror?.change('');
    update({ frameOverride: undefined });
    setCopying(false);
  }
  function ownStyle() {
    if (mirrored) mirror?.change('');
    if (sharedFrame || mirrored) update({ frameOverride: true, frame: renderedCard.frame });
    setCopying(false);
  }
  function chooseFrame(choice: FrameChoice) {
    if (choice.kind === 'per-card') return;
    const frame = choiceFrame(choice, project, custom);
    if (frame) update({ frame });
    selectZone(undefined);
  }

  if (!card.source.editable) return <aside id="workspace-properties" className="inspector">
    <div className="panel-title"><h2>{t('printing')}</h2><button className="icon-button" aria-label={t('resetCard')} title={t('resetCard')} disabled={!isCardModified(card)} onClick={resetCard}><Icon name="reset" /></button></div>
    <div className="fields">
      <h3>{card.source.name}</h3>
      <p className="muted">{card.source.setName} · {card.source.number}</p>
      {sharedFrame && <p className="muted">{t('projectFrameOriginalScan')}</p>}
      <ToolButton icon="edition" label={t('changePrinting')} onClick={choosePrinting} />
      {!card.source.details?.faces.length && <>
        {visibleFields.type && <p>{visibleFields.type}</p>}
        {visibleFields.mana && <p>{visibleFields.mana}</p>}
        {visibleFields.rules && <p className="printed-rules">{visibleFields.rules}</p>}
        {visibleFields.artist && <small>{t('artist', { name: visibleFields.artist })}</small>}
      </>}
      <EditionDetails card={card} />
    </div>
  </aside>;

  return <aside id="workspace-properties" className="inspector">
    <div className="panel-title"><h2>{t('properties')}</h2><button className="icon-button" aria-label={t('resetCard')} title={t('resetCard')} disabled={!isCardModified(card)} onClick={resetCard}><Icon name="reset" /></button></div>
    <div className="tabs" role="tablist" aria-label={t('cardProperties')}>
      {tabItems.map((item, index) => <button key={item} type="button" role="tab" id={`${baseId}-tab-${item}`} aria-controls={`${baseId}-panel`}
        aria-selected={item === tab} tabIndex={item === tab ? 0 : -1}
        ref={node => { tabButtons.current[item] = node; }}
        onKeyDown={event => onTabKeyDown(event, index)} onClick={() => selectTab(item)}>
        {t(item)}
      </button>)}
    </div>
    <div className="fields" role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`}>
      {mirrored && mirror?.suspended && <p className="error" role="status">{t('frameMirrorSuspended')}</p>}
      {tab === 'card' && <>
        <SectionTitle icon="card">{t('card')}</SectionTitle>
        {card.source.printingId && <section className="source">
          <span><strong>{card.source.setName}</strong><small>{card.source.set.toUpperCase()} · {card.source.number}</small></span>
          <ToolButton icon="edition" label={t('printings')} onClick={choosePrinting} />
          {chooseEditionFrame && <ToolButton icon="frames" label={t('editionFrames')} onClick={chooseEditionFrame} />}
        </section>}
        {original && !mirrored && <p className="muted">{t('printingEditHelp', { template: printingTemplateName })}</p>}
        <label><FieldLabel icon="card">{t('name')}</FieldLabel><input value={visibleFields.name} maxLength={300} onChange={event => setField('name', event.target.value)} /></label>
        <label><FieldLabel icon="mana">{t('manaCost')}</FieldLabel><input value={visibleFields.mana} maxLength={100} placeholder="{1}{U}" onChange={event => setField('mana', event.target.value)} /></label>
        <div className="mana-tokens">
          {manaTokens.map(token => <button type="button" key={token} className="mana-token" aria-label={t('addManaSymbol', { symbol: `{${token}}` })}
            onClick={() => setField('mana', `${visibleFields.mana}{${token}}`)}>{`{${token}}`}</button>)}
        </div>
        <label><FieldLabel icon="type">{t('type')}</FieldLabel><input value={visibleFields.type} maxLength={300} placeholder={t('instant')} onChange={event => setField('type', event.target.value)} /></label>
        <label><FieldLabel icon="text">{t('cardText')}</FieldLabel><textarea value={visibleFields.rules} maxLength={12000} rows={6} onChange={event => setField('rules', event.target.value)} /></label>
        <label>{t('statsValues')}<Select value={statsKind} onChange={event => setStatsKind(event.target.value as StatsValueKind)}>
          <option value="pair">{t('inspectorValuesPair')}</option>
          <option value="loyalty">{t('loyalty')}</option>
          <option value="defense">{t('defense')}</option>
        </Select></label>
        {statsKind === 'loyalty' && <label><FieldLabel icon="stats">{t('loyalty')}</FieldLabel><input value={visibleFields.loyalty} maxLength={12} onChange={event => setField('loyalty', event.target.value)} /></label>}
        {statsKind === 'defense' && <label><FieldLabel icon="stats">{t('defense')}</FieldLabel><input value={visibleFields.defense} maxLength={12} onChange={event => setField('defense', event.target.value)} /></label>}
        {statsKind === 'pair' && <div className="form-row"><label><FieldLabel icon="stats">{t('power')}</FieldLabel><input value={visibleFields.power} maxLength={12} onChange={event => setField('power', event.target.value)} /></label>
          <label><FieldLabel icon="stats">{t('toughness')}</FieldLabel><input value={visibleFields.toughness} maxLength={12} onChange={event => setField('toughness', event.target.value)} /></label></div>}
        <label><FieldLabel icon="artist">{t('artistCredit')}</FieldLabel><input value={visibleFields.artist} maxLength={300} onChange={event => setField('artist', event.target.value)} /></label>
        <EditionDetails card={card} />
      </>}
      {tab === 'art' && <>
        <SectionTitle icon="art">{t('art')}</SectionTitle>
        <div className="inspector-actions">
          {card.art && <ToolButton icon={card.source.images.art ? 'restore' : 'remove'} label={card.source.images.art ? t('restoreCatalogArt') : t('removeArt')} caption={card.source.images.art ? t('restoreCatalog') : t('removeArt')} onClick={() => { selectZone(undefined); update({ art: undefined, crop: defaultCrop }); }} />}
        </div>
        <p className="muted">{t('inspectorArtHint')}</p>
        {art && <div className="art-adjust">
          <VisualChoice label={t('zoom')} value={Math.round(card.crop.zoom * 100)}
            options={[100, 125, 150, 200].map(percent => ({ value: percent, label: `${percent}%`, visual: <ZoomVisual zoom={percent / 100} /> }))}
            custom={{ min: 100, max: 500, unit: '%' }} onChange={percent => update({ crop: { ...card.crop, zoom: percent / 100 } })} />
          <div className="inspector-actions">
            <ToolButton icon="crop" label={t('centerArt')} onClick={() => update({ crop: { ...card.crop, x: 0, y: 0 } })} />
            <ToolButton icon="reset" label={t('resetCrop')} onClick={() => update({ crop: defaultCrop })} />
          </div>
          <details className="precise-adjust">
            <summary>{t('inspectorPreciseAdjust')}</summary>
            <div className="precise-grid">
              <NumberField label={t('horizontalPosition')} value={Math.round(card.crop.x * 100)} min={-100} max={100}
                onCommit={percent => update({ crop: { ...card.crop, x: percent / 100 } })} />
              <NumberField label={t('verticalPosition')} value={Math.round(card.crop.y * 100)} min={-100} max={100}
                onCommit={percent => update({ crop: { ...card.crop, y: percent / 100 } })} />
            </div>
          </details>
        </div>}
        {!mirrored && !original && <>
          <SectionTitle icon="zone">{t('artArea')}</SectionTitle>
          <div className="inspector-actions">
            <ToolButton icon="zone" label={zone === 'art' ? t('hideArtArea') : t('showArtArea')} caption={zone === 'art' ? t('hideArea') : t('editArea')} pressed={zone === 'art'} onClick={() => selectZone(zone === 'art' ? undefined : 'art')} />
          </div>
          {zone === 'art' && <>
            <p className="muted">{t('dragGuideHelp')}</p>
            <ZoneFields rect={cardZones(renderedCard).art} update={changeArtZone} />
          </>}
        </>}
        {!mirrored && original && card.art && <>
          <ToolButton icon="zone" label={t('adjustArtArea')} caption={t('adjustArea')} pressed={zone === 'art'} onClick={() => void toggleArtZone()} />
          {zone === 'art' && <>
            <p className="muted">{t('resizeGuideHelp')}</p>
            <ZoneFields rect={cardArtZone(card)} update={artZone => update({ frame: { kind: 'printing', artZone } })} />
            <div className="inspector-actions">
              <ToolButton icon="save" label={t('useArea')} onClick={() => {
                update({ frame: { kind: 'printing', artZone: cardArtZone(card) } });
                selectZone(undefined);
              }} />
              <ToolButton icon="detect" label={t('detectArea')} onClick={() => { update({ frame: { kind: 'printing' } }); selectZone(undefined); }} />
            </div>
          </>}
        </>}
      </>}
      {tab === 'frame' && <>
        {(projectFrame || (mirror && (mirror.options.length > 0 || !!mirror.value))) && <fieldset className="scope-choice">
          <legend>{t('styleScope')}</legend>
          {projectFrame && <>
            <label className="check"><input type="radio" name={`${baseId}-scope`} checked={deckChecked} onChange={followDeck} />{t('scopeDeck')}</label>
            {focusDeckStyle && <button type="button" className="scope-link" onClick={focusDeckStyle}>{t('scopeDeckChange')}</button>}
          </>}
          <label className="check"><input type="radio" name={`${baseId}-scope`} checked={ownChecked} onChange={ownStyle} />{t('scopeOwn')}</label>
          {mirror && (mirror.options.length > 0 || !!mirror.value) && <label className="check">
            <input type="radio" name={`${baseId}-scope`} checked={copyChecked} onChange={() => setCopying(true)} />{t('scopeCopy')}
          </label>}
        </fieldset>}
        {mirror && copyChecked && <>
          <label>{t('followFrame')}<Select value={mirror.value} disabled={!mirror.value && !mirror.options.length}
            onChange={event => {
              // Only an explicit "no card" choice unlinks while the user is still choosing.
              choosingSource.current = !event.target.value && linked;
              setCopying(true);
              mirror.change(event.target.value);
            }}>
            <option value="">{t('noFrameSource')}</option>
            {mirror.options.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
          </Select></label>
          {mirrored && !mirror.suspended && <p className="muted">{t('frameMirrorLocked')}</p>}
        </>}

        {ownChecked && <>
          <FramePicker compact label={t('frame')} project={project} sample={renderedCard} choices={pickerChoices} value={pickerValue} custom={custom} onChange={chooseFrame} />
          {colorSet && <p className="muted">{t('frameApplied', { colors: colorsForFrame(cardFrameColors(renderedCard), colorSet.mix).map(color => t(frameColorNames[color])).join(' / ') })}</p>}
        </>}
        {(colorSet || renderedCard.frame.kind === 'custom') && <>
          <ToolButton icon="settings" label={t('customizeFrame')} onClick={editCustomFrame} />
          <p className="muted">{t('customizeFrameNote')}</p>
        </>}
        {ownChecked && custom && <form className="preset-form" onSubmit={event => {
          event.preventDefault();
          if (presetName.trim()) { savePreset(presetName.trim()); setPresetName(''); }
        }}>
          <label>{t('savePngFrame')}<input value={presetName} maxLength={100} placeholder={t('inspectorPresetPlaceholder')} onChange={event => setPresetName(event.target.value)} /></label>
          <button className="icon-label" disabled={!presetName.trim()}><Icon name="save" /><span>{t('inspectorSave')}</span></button>
        </form>}

        {!mirrored && <section className="tweaks">
          <button type="button" className="tweaks-toggle" aria-expanded={tweaksOpen} aria-controls={`${baseId}-tweaks`} onClick={() => setTweaksOpen(open => !open)}>
            <span className="tweaks-chevron"><Icon name="down" size={14} /></span>
            <span>{t('tweaksTitle')}</span>
            {tweakCount > 0 && <span className="tweaks-count">{t('tweaksActive', { count: tweakCount })}</span>}
          </button>
          {tweaksOpen && <div id={`${baseId}-tweaks`} className="tweaks-body">
            {appearance && <section className="tweak-block">
              <h4 className="tweak-heading">{t('inspectorDividers')}</h4>
              {([['titleDivider', t('belowTitle')], ['divider', t('aboveRules')]] as const).map(([key, label]) => <label className="check" key={key}>
                <input type="checkbox" checked={card.dividerOverrides?.[key] ?? appearance[key] ?? false}
                  onChange={event => update({ dividerOverrides: { ...card.dividerOverrides, [key]: event.target.checked } })} />{label}
                {card.dividerOverrides?.[key] !== undefined && <span className="state-tag">{t('dividerEdited')}</span>}
              </label>)}
              {(card.dividerOverrides?.titleDivider !== undefined || card.dividerOverrides?.divider !== undefined) &&
                <button type="button" className="icon-label" onClick={() => update({ dividerOverrides: undefined })}><Icon name="reset" /><span>{t('resetDividers')}</span></button>}
            </section>}

            {!original && <section className="tweak-block">
              <h4 className="tweak-heading">{t('visibleSections')}</h4>
              {(Object.keys(visibleSectionLabels) as Array<keyof typeof visibleSectionLabels>).map(key => <label className="check" key={key}>
                <input type="checkbox" checked={!card.hiddenZones?.includes(key)} onChange={event => update({
                  hiddenZones: event.target.checked ? (card.hiddenZones ?? []).filter(item => item !== key) : [...(card.hiddenZones ?? []), key]
                })} />{t(visibleSectionLabels[key])}
              </label>)}
            </section>}

            <div className="element-settings">
              <h4 className="tweak-heading">{t('elementLabel')}</h4>
              <div className="element-toggles">
                {frameTextAreas.map(area => <button type="button" key={area} className="element-toggle" aria-pressed={zone === area}
                  onClick={() => selectZone(zone === area ? undefined : area)}><Icon name={elementIcons[area]} size={15} /><span>{t(elementLabels[area])}</span></button>)}
              </div>
              <p className="muted">{t('elementHint')}</p>
              {layoutZone && <section className="tweak-block">
                <details className="exact-values">
                  <summary>{t('inspectorLayoutHeading')}</summary>
                  <ZoneFields rect={cardZones(renderedCard)[layoutZone]} update={rect => update({ zoneOverrides: { ...card.zoneOverrides, [layoutZone]: rect } })} />
                </details>
                {card.zoneOverrides?.[layoutZone] && <button type="button" className="icon-label" onClick={() => {
                  const overrides = { ...card.zoneOverrides };
                  delete overrides[layoutZone];
                  update({ zoneOverrides: overrides });
                }}><Icon name="reset" /><span>{t('resetElementPosition')}</span></button>}
              </section>}
              {textArea && <section className="tweak-block">
                <VisualChoice label={t('inspectorAlignment')} value={original ? '' : card.textAlignOverrides?.[textArea] ?? ''}
                  options={[
                    { value: '', label: t('inheritFrameAlignment'), visual: <AlignVisual align="frame" /> },
                    { value: 'left', label: t('left'), visual: <AlignVisual align="left" /> },
                    { value: 'center', label: t('center'), visual: <AlignVisual align="center" /> },
                    { value: 'right', label: t('right'), visual: <AlignVisual align="right" /> }
                  ]}
                  onChange={align => setTextAlign(textArea, align as FrameTextAlign | '')}
                  help={original ? t('printingAlignmentHelp', { template: printingTemplateName }) : undefined} />
                {sizeArea && <VisualChoice label={t('textMaxSize')} value={sizeOverride ?? ''} options={sizeOptions}
                  custom={sizeOverride !== undefined ? { min: 8, max: 96, unit: 'px' } : undefined}
                  onChange={size => setTextSize(sizeArea, size === '' ? undefined : clampInt(size, 8, 96))}
                  help={t('textShrinkHelp')} />}
              </section>}
              {layoutZone === 'stats' && <section className="tweak-block">
                <StatsAppearanceControls value={card.statsOverrides} inherit change={statsOverrides => update({ statsOverrides })} />
              </section>}
            </div>

            <button type="button" className="icon-label" disabled={tweakCount === 0} onClick={() => update({
              zoneOverrides: undefined, hiddenZones: undefined, dividerOverrides: undefined, statsOverrides: undefined,
              textAlignOverrides: undefined, textStyleOverrides: undefined
            })}><Icon name="reset" /><span>{t('tweaksResetAll')}</span></button>
          </div>}
        </section>}
        <div className="frame-clipboard">
          <button type="button" className="icon-label" disabled={!copyFrame} onClick={copyFrame}><Icon name="copy" /><span>{t('copyFrame')}</span></button>
          <button type="button" className="icon-label" disabled={!pasteFrame} onClick={pasteFrame}><Icon name="paste" /><span>{pasteLabel}</span></button>
        </div>
      </>}
    </div>
  </aside>;
}
