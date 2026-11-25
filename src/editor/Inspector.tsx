import { Dropdown } from './Dropdown.js';
import { Select } from './Select.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { cardColorKeys } from './card-colors.js';
import { cardZones } from './card-zones.js';
import { colorsForFrame } from '../shared/frame-colors.js';
import { frameAppearance, newTemplate, presetFrame } from '../shared/templates.js';
import { useState } from 'react';
import { detectedArtZone } from './compose.js';
import { cardArtZone, defaultCrop, frameColorNames, isTemplate, printingFields, templateNames } from '../shared/model.js';
import type { Asset, Card, FrameSet, Preset, Rect, TemplateAppearance, Zones } from '../shared/model.js';
import { isCardModified } from '../shared/model.js';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

export const zoneLabels: Record<keyof Zones, MessageKey> = { art: 'art', title: 'header', type: 'type', rules: 'text', stats: 'stats' };
const rarityNames: Partial<Record<string, MessageKey>> = { common: 'common', uncommon: 'uncommon', rare: 'rare', mythic: 'mythic', special: 'special', bonus: 'bonus' };
function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
  return <h3 className="inspector-section-title"><Icon name={icon} size={15} />{children}</h3>;
}

function ToolButton({ icon, label, onClick, pressed, caption = label }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; caption?: string }) {
  return <button className="icon-label" aria-label={label} title={caption === label ? undefined : label} aria-pressed={pressed} onClick={onClick}><Icon name={icon} /><span>{caption}</span></button>;
}

function FieldLabel({ icon, children }: { icon: IconName; children: string }) {
  return <span className="field-label"><Icon name={icon} size={14} />{children}</span>;
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

export function ZoneFields({ rect, update }: { rect: Rect; update: (rect: Rect) => void }) {
  const { t } = useI18n();
  return <div className="form-row zone-fields">
      {(['x', 'y', 'w', 'h'] as const).map(key => {
      const limit = 100 - rect[({ x: 'w', y: 'h', w: 'x', h: 'y' } as const)[key]];
      const min = key === 'x' || key === 'y' ? 0 : 1;
      return <label key={key}>{({ x: 'X', y: 'Y', w: t('width'), h: t('height') })[key]}
        <input type="number" step="any" min={min} max={limit} value={Number(rect[key].toFixed(2))} onChange={event => {
          const value = event.target.valueAsNumber;
          if (Number.isFinite(value)) update({ ...rect, [key]: Math.max(min, Math.min(limit, value)) });
        }} />
      </label>;
    })}
  </div>;
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

export function Inspector({ card, renderedCard, back, sharedFrame, presets, update, resetCard, selectAssets, choosePrinting, zone, selectZone, savePreset, fullArtBase, frameSets, editCustomFrame }: {
  card: Card; renderedCard: Card; back: boolean; sharedFrame: boolean; presets: Preset[]; update: (patch: Partial<Card>) => void;
  resetCard: () => void;
  selectAssets: (frame: boolean) => Promise<Asset | undefined>;
  choosePrinting: () => void; zone: keyof Zones | undefined; selectZone: (zone: keyof Zones | undefined) => void;
  savePreset: (name: string) => void;
  frameSets: FrameSet[]; editCustomFrame: () => void;
  fullArtBase?: TemplateAppearance;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'card' | 'art' | 'frame'>('card');
  const [presetName, setPresetName] = useState('');
  const custom = card.frame.kind === 'custom' ? card.frame : undefined;
  const colorSet = renderedCard.frame.kind === 'color-set' ? renderedCard.frame.set : undefined;
  const original = renderedCard.frame.kind === 'printing';
  const appearance = frameAppearance(renderedCard.frame);
  const editableFrameZone = !original;
  const visibleFields = original ? printingFields(card.source) : card.fields;
  const art = original ? !!card.art : !!(card.art ?? card.source.images.art);
  function setField(field: keyof Card['fields'], value: string) {
    if (value === visibleFields[field]) return;
    const fields = { ...visibleFields, [field]: value };
    if (card.frame.kind === 'printing') {
      update({ fields, frame: newTemplate('full-art', fullArtBase) });
      if (original) selectZone(undefined);
    } else {
      update({ fields });
    }
  }
  function changeArtZone(rect: Rect) {
    update({ zoneOverrides: { ...card.zoneOverrides, art: rect } });
  }

  async function toggleArtZone() {
    if (zone === 'art') { selectZone(undefined); return; }
    if (card.frame.kind !== 'printing') return;
    const artZone = card.frame.artZone ?? await detectedArtZone(card);
    if (artZone) update({ frame: { kind: 'printing', artZone } });
    selectZone('art');
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
    <div className="tabs" role="group" aria-label={t('cardProperties')}>
      {(['card', 'art', 'frame'] as const).map(item => <button key={item} aria-pressed={item === tab}
        onClick={() => { setTab(item); if (item !== 'frame') selectZone(undefined); }}>
        {t(item)}
      </button>)}
    </div>
    <div className="fields">
      {tab === 'card' && <>
        <SectionTitle icon="card">{t('card')}</SectionTitle>
        {card.source.printingId && <section className="source">
          <span><strong>{card.source.setName}</strong><small>{card.source.set.toUpperCase()} · {card.source.number}</small></span>
          <ToolButton icon="edition" label={t('printings')} onClick={choosePrinting} />
        </section>}
        {original && <p className="muted">{t('printingEditHelp')}</p>}
        <label><FieldLabel icon="card">{t('name')}</FieldLabel><input value={visibleFields.name} maxLength={300} onChange={event => setField('name', event.target.value)} /></label>
        <label><FieldLabel icon="mana">{t('manaCost')}</FieldLabel><input value={visibleFields.mana} maxLength={100} placeholder="{1}{U}" onChange={event => setField('mana', event.target.value)} /></label>
        <label><FieldLabel icon="type">{t('type')}</FieldLabel><input value={visibleFields.type} maxLength={300} placeholder={t('instant')} onChange={event => setField('type', event.target.value)} /></label>
        <label><FieldLabel icon="text">{t('cardText')}</FieldLabel><textarea value={visibleFields.rules} maxLength={12000} rows={6} onChange={event => setField('rules', event.target.value)} /></label>
        {(/\b(planeswalker)\b/i.test(visibleFields.type) || visibleFields.loyalty) ?
          <label><FieldLabel icon="stats">{t('loyalty')}</FieldLabel><input value={visibleFields.loyalty} maxLength={12} onChange={event => setField('loyalty', event.target.value)} /></label>
          : (/\b(battle|battaglia)\b/i.test(visibleFields.type) || visibleFields.defense) ?
          <label><FieldLabel icon="stats">{t('defense')}</FieldLabel><input value={visibleFields.defense} maxLength={12} onChange={event => setField('defense', event.target.value)} /></label>
          : <div className="form-row"><label><FieldLabel icon="stats">{t('power')}</FieldLabel><input value={visibleFields.power} maxLength={12} onChange={event => setField('power', event.target.value)} /></label>
            <label><FieldLabel icon="stats">{t('toughness')}</FieldLabel><input value={visibleFields.toughness} maxLength={12} onChange={event => setField('toughness', event.target.value)} /></label></div>}
        <label><FieldLabel icon="artist">{t('artistCredit')}</FieldLabel><input value={visibleFields.artist} maxLength={300} onChange={event => setField('artist', event.target.value)} /></label>
        <EditionDetails card={card} />
      </>}
      {tab === 'art' && <>
        <SectionTitle icon="art">{t('art')}</SectionTitle>
        <div className="inspector-actions">
          {card.art && <ToolButton icon={card.source.images.art ? 'restore' : 'remove'} label={card.source.images.art ? t('restoreCatalogArt') : t('removeArt')} caption={card.source.images.art ? t('restoreCatalog') : t('removeArt')} onClick={() => { selectZone(undefined); update({ art: undefined, crop: defaultCrop }); }} />}
        </div>
        <p className="muted">{t('moveArtHelp')}</p>
        {art && <>
          <label>{t('zoom')}{' '}<output>{card.crop.zoom.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×</output>
            <input type="range" min="1" max="5" step=".01" value={card.crop.zoom} onChange={event => update({ crop: { ...card.crop, zoom: Number(event.target.value) } })} />
          </label>
          <label>{t('horizontalPosition')}<input type="range" min="-1" max="1" step=".01" value={card.crop.x} onChange={event => update({ crop: { ...card.crop, x: Number(event.target.value) } })} /></label>
          <label>{t('verticalPosition')}<input type="range" min="-1" max="1" step=".01" value={card.crop.y} onChange={event => update({ crop: { ...card.crop, y: Number(event.target.value) } })} /></label>
          <ToolButton icon="reset" label={t('resetCrop')} onClick={() => update({ crop: defaultCrop })} />
        </>}
        {editableFrameZone && <>
          <SectionTitle icon="zone">{t('artArea')}</SectionTitle>
          <div className="inspector-actions">
            <ToolButton icon="zone" label={zone === 'art' ? t('hideArtArea') : t('showArtArea')} caption={zone === 'art' ? t('hideArea') : t('editArea')} pressed={zone === 'art'} onClick={() => selectZone(zone === 'art' ? undefined : 'art')} />
          </div>
          {zone === 'art' && <>
            <p className="muted">{t('dragGuideHelp')}</p>
            <ZoneFields rect={cardZones(renderedCard).art} update={changeArtZone} />
          </>}
        </>}
        {original && card.art && <>
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
        <SectionTitle icon="frames">{t('frame')}</SectionTitle>
        {sharedFrame ? <p className="muted">{t(back ? 'projectFrameAppliedBack' : 'projectFrameApplied')}</p> : <label>{t('template')}<Select value={colorSet?.id ?? (card.frame.kind === 'template' ? card.frame.template : card.frame.kind)} onChange={event => {
          const value = event.target.value;
          if (isTemplate(value)) update({ frame: newTemplate(value, fullArtBase) });
          else if (value === 'printing') update({ frame: { kind: 'printing' } });
          else {
            const set = frameSets.find(item => item.id === value);
            if (set) update({ frame: { kind: 'color-set', set } });
          }
          selectZone(undefined);
        }}>
          {card.source.printingId && <option value="printing">{t('originalPrinting')}</option>}
          {(Object.keys(templateNames)).filter(isTemplate).map(template =>
            <option key={template} value={template}>{t(templateNames[template])}</option>)}
          {frameSets.length > 0 && <optgroup label={t('frameSets')}>
            {frameSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
          </optgroup>}
          {card.frame.kind === 'custom' && <option value="custom">{t('existingPngFrame')}</option>}
          {(card.frame.kind === 'modern' || card.frame.kind === 'classic') && <option value={card.frame.kind}>{t('projectFrame')}</option>}
        </Select></label>}
        {appearance && <fieldset className="template-settings">
          <legend>{t('cardDividers')}</legend>
          {([['titleDivider', t('belowTitle')], ['divider', t('aboveRules')]] as const).map(([key, label]) => <label className="check" key={key}>
            <input type="checkbox" checked={card.dividerOverrides?.[key] ?? appearance[key] ?? false}
              onChange={event => update({ dividerOverrides: { ...card.dividerOverrides, [key]: event.target.checked } })} />{label}
          </label>)}
          {(card.dividerOverrides?.titleDivider !== undefined || card.dividerOverrides?.divider !== undefined) &&
            <button className="icon-label" onClick={() => update({ dividerOverrides: undefined })}><Icon name="reset" />{' '}{t('resetDividers')}</button>}
        </fieldset>}

        {!original && <>
          <fieldset className="template-settings">
            <legend>{t('visibleSections')}</legend>
            {(Object.keys(zoneLabels) as Array<keyof Zones>).map(key => <label className="check" key={key}>
              <input type="checkbox" checked={!card.hiddenZones?.includes(key)} onChange={event => update({
                hiddenZones: event.target.checked ? (card.hiddenZones ?? []).filter(item => item !== key) : [...(card.hiddenZones ?? []), key]
              })} />{t(zoneLabels[key])}
            </label>)}
          </fieldset>
          <label>{t('elementPositions')}<Select value={zone ?? ''} onChange={event => selectZone((event.target.value || undefined) as keyof Zones | undefined)}>
            <option value="">{t('hideGuides')}</option>
            {(Object.keys(zoneLabels) as Array<keyof Zones>).map(key => <option key={key} value={key}>{t(zoneLabels[key])}</option>)}
          </Select></label>
          {zone && <>
            <p className="muted">{t('cardZoneHelp')}</p>
            <ZoneFields rect={cardZones(renderedCard)[zone]} update={rect => update({ zoneOverrides: { ...card.zoneOverrides, [zone]: rect } })} />
            {card.zoneOverrides?.[zone] && <button className="icon-label" onClick={() => {
              const overrides = { ...card.zoneOverrides };
              delete overrides[zone];
              update({ zoneOverrides: overrides });
            }}><Icon name="reset" />{' '}{t('resetFramePosition')}</button>}
          </>}
        </>}

        {colorSet && <>
          <p className="muted">{t('frameApplied', { colors: colorsForFrame(cardColorKeys(renderedCard), colorSet.mix).map(color => t(frameColorNames[color])).join(' / ') })}</p>
        </>}
        {(colorSet || renderedCard.frame.kind === 'custom') && <ToolButton icon="settings" label={t('editCustomFrame')} onClick={editCustomFrame} />}
        {!sharedFrame && !!presets.length && <label>{t('applyPreset')}<Select value="" onChange={event => {
          const preset = presets.find(item => item.id === event.target.value);
          if (preset) update({ frame: presetFrame(preset) });
        }}><option value="">{t('chooseFrame')}</option>
          {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </Select></label>}
        {!sharedFrame && custom && <>
          <form className="preset-form" onSubmit={event => {
            event.preventDefault();
            if (presetName.trim()) { savePreset(presetName.trim()); setPresetName(''); }
          }}>
            <label>{t('presetName')}<input value={presetName} maxLength={100} onChange={event => setPresetName(event.target.value)} /></label>
            <button className="icon-label" disabled={!presetName.trim()}><Icon name="save" /><span>{t('savePreset')}</span></button>
          </form>
        </>}
      </>}
    </div>
  </aside>;
}
