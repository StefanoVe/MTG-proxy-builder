import { cardZones } from './card-zones.js';
import { colorsForFrame } from '../shared/frame-colors.js';
import { newTemplate, templateAppearance } from '../shared/templates.js';
import { useState } from 'react';
import { detectedArtZone } from './compose.js';
import { cardArtZone, defaultCrop, frameColorNames, isTemplate, printingFields, templateNames } from '../shared/model.js';
import type { Asset, Card, CardFontFamily, FrameSet, Preset, Rect, Template, TemplateAppearance, Zones } from '../shared/model.js';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

export const zoneLabels: Record<keyof Zones, string> = { art: 'Illustrazione', title: 'Intestazione', type: 'Tipo', rules: 'Testo', stats: 'Statistiche' };
const rarityNames: Record<string, string> = { common: 'Comune', uncommon: 'Non comune', rare: 'Rara', mythic: 'Mitica', special: 'Speciale', bonus: 'Bonus' };
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
    <label><FieldLabel icon="type">Cerca font</FieldLabel><input type="search" value={query} placeholder="Es. Garamond" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} /></label>
    <div className="font-current" style={{ fontFamily: fontStack(value) }}><span>{currentName}</span><span className="font-sample">Aa Bb Cc 123</span></div>
    {open && <div className="font-picker-results" role="listbox" aria-label="Font di sistema">
      {choices.map(font => <button type="button" key={font} role="option" aria-selected={font === value} className="font-option" style={{ fontFamily: fontStack(font) }} onClick={() => {
        onChange(font); setQuery(''); setOpen(false);
      }}><span>{font}</span><span className="font-sample">Aa Bb Cc 123</span></button>)}
      {!choices.length && <p className="muted font-empty">Nessun font trovato.</p>}
      {filtered.length > 120 && <small className="muted font-empty">Mostro i primi 120 risultati. Affina la ricerca.</small>}
    </div>}
  </div>;
}

function FrameTextControls({ color, fontFamily, fonts, change }: { color: string; fontFamily: CardFontFamily; fonts: string[]; change: (color: string, fontFamily: CardFontFamily) => void }) {
  return <div className="frame-text-controls">
    <label className="color-field"><FieldLabel icon="text">Colore del testo</FieldLabel><input type="color" value={color} onChange={event => change(event.target.value, fontFamily)} /></label>
    <FontPicker value={fontFamily} fonts={fonts} onChange={font => change(color, font)} />
  </div>;
}

export function ZoneFields({ rect, update }: { rect: Rect; update: (rect: Rect) => void }) {
  return <div className="form-row zone-fields">
      {(['x', 'y', 'w', 'h'] as const).map(key => {
      const limit = 100 - rect[({ x: 'w', y: 'h', w: 'x', h: 'y' } as const)[key]];
      const min = key === 'x' || key === 'y' ? 0 : 1;
      return <label key={key}>{({ x: 'X', y: 'Y', w: 'Larghezza', h: 'Altezza' })[key]}
        <input type="number" step="any" min={min} max={limit} value={Number(rect[key].toFixed(2))} onChange={event => {
          const value = event.target.valueAsNumber;
          if (Number.isFinite(value)) update({ ...rect, [key]: Math.max(min, Math.min(limit, value)) });
        }} />
      </label>;
    })}
  </div>;
}

function EditionDetails({ card }: { card: Card }) {
  const details = card.source.details;
  if (!details) return null;
  return <div className="card-details">
    {(details.rarity || details.lang) && <p className="muted">{[rarityNames[details.rarity] ?? details.rarity, details.lang.toUpperCase()].filter(Boolean).join(' · ')}</p>}
    {details.flavor && <p lang={details.lang}>{details.flavor}</p>}
    {details.faces.map((face, index) => <section key={index}>
      <h3>{face.name}</h3>
      <p className="muted">{[face.mana, face.type].filter(Boolean).join(' · ')}</p>
      {face.rules && <p>{face.rules}</p>}
      {face.flavor && <p>{face.flavor}</p>}
      {(face.power || face.toughness) && <p>Forza e costituzione {face.power}/{face.toughness}</p>}
      {face.loyalty && <p>Fedeltà {face.loyalty}</p>}
      {face.defense && <p>Difesa {face.defense}</p>}
      {face.artist && <small>Artista {face.artist}</small>}
    </section>)}
  </div>;
}

export function Inspector({ card, renderedCard, presets, update, selectAssets, choosePrinting, chooseFrames, zone, selectZone, savePreset, fullArtBase, editTemplate, frameSets, manageFrameSets, editFrameSet, systemFonts }: {
  card: Card; renderedCard: Card; presets: Preset[]; update: (patch: Partial<Card>) => void;
  selectAssets: (frame: boolean) => Promise<Asset | undefined>;
  choosePrinting: () => void; chooseFrames: () => void; zone: keyof Zones | undefined; selectZone: (zone: keyof Zones | undefined) => void;
  savePreset: (name: string) => void;
  frameSets: FrameSet[]; manageFrameSets: () => void; editFrameSet: (set: FrameSet) => void;
  systemFonts: string[];
  fullArtBase?: TemplateAppearance; editTemplate: (template: Template) => void;
}) {
  const [tab, setTab] = useState<'card' | 'art' | 'frame'>('card');
  const [presetName, setPresetName] = useState('');
  const custom = card.frame.kind === 'custom' ? card.frame : undefined;
  const colorSet = card.frame.kind === 'color-set' ? card.frame.set : undefined;
  const original = card.frame.kind === 'printing';
  const templateFrame = card.frame.kind === 'template' ? card.frame : undefined;
  const editableFrameZone = !original;
  const visibleFields = original ? printingFields(card.source) : card.fields;
  const art = original ? !!card.art : !!(card.art ?? card.source.images.art);
  function setField(field: keyof Card['fields'], value: string) {
    if (value === visibleFields[field]) return;
    const fields = { ...visibleFields, [field]: value };
    if (original) {
      update({ fields, frame: newTemplate('full-art', fullArtBase) });
      selectZone(undefined);
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
  if (!card.source.editable) return <aside className="inspector">
    <div className="panel-title"><h2>Edizione di stampa</h2></div>
    <div className="fields">
      <h3>{card.source.name}</h3>
      <p className="muted">{card.source.setName} · {card.source.number}</p>
      <ToolButton icon="edition" label="Cambia edizione" onClick={choosePrinting} />
      {!card.source.details?.faces.length && <>
        {visibleFields.type && <p>{visibleFields.type}</p>}
        {visibleFields.mana && <p>{visibleFields.mana}</p>}
        {visibleFields.rules && <p className="printed-rules">{visibleFields.rules}</p>}
        {visibleFields.artist && <small>Artista {visibleFields.artist}</small>}
      </>}
      <EditionDetails card={card} />
    </div>
  </aside>;

  return <aside className="inspector">
    <div className="panel-title"><h2>Proprietà</h2></div>
    <div className="tabs" role="group" aria-label="Proprietà della carta">
      {(['card', 'art', 'frame'] as const).map((item, index) => <button key={item} aria-pressed={item === tab}
        onClick={() => { setTab(item); if (item !== 'frame') selectZone(undefined); }}>
        {['Carta', 'Illustrazione', 'Cornice'][index]}
      </button>)}
    </div>
    <div className="fields">
      {tab === 'card' && <>
        <SectionTitle icon="card">Carta</SectionTitle>
        {card.source.printingId && <section className="source">
          <span><strong>{card.source.setName}</strong><small>{card.source.set.toUpperCase()} · {card.source.number}</small></span>
          <ToolButton icon="edition" label="Edizioni" onClick={choosePrinting} />
        </section>}
        {original && <p className="muted">Quando modifichi i dati della stampa originale, l’editor applica il template Full art.</p>}
        <label><FieldLabel icon="card">Nome</FieldLabel><input value={visibleFields.name} maxLength={300} onChange={event => setField('name', event.target.value)} /></label>
        <label><FieldLabel icon="mana">Costo di mana</FieldLabel><input value={visibleFields.mana} maxLength={100} placeholder="{1}{U}" onChange={event => setField('mana', event.target.value)} /></label>
        <label><FieldLabel icon="type">Tipo</FieldLabel><input value={visibleFields.type} maxLength={300} placeholder="Istantaneo" onChange={event => setField('type', event.target.value)} /></label>
        <label><FieldLabel icon="text">Testo della carta</FieldLabel><textarea value={visibleFields.rules} maxLength={12000} rows={6} onChange={event => setField('rules', event.target.value)} /></label>
        {(/\b(planeswalker)\b/i.test(visibleFields.type) || visibleFields.loyalty) ?
          <label><FieldLabel icon="stats">Fedeltà</FieldLabel><input value={visibleFields.loyalty} maxLength={12} onChange={event => setField('loyalty', event.target.value)} /></label>
          : (/\b(battle|battaglia)\b/i.test(visibleFields.type) || visibleFields.defense) ?
          <label><FieldLabel icon="stats">Difesa</FieldLabel><input value={visibleFields.defense} maxLength={12} onChange={event => setField('defense', event.target.value)} /></label>
          : <div className="form-row"><label><FieldLabel icon="stats">Forza</FieldLabel><input value={visibleFields.power} maxLength={12} onChange={event => setField('power', event.target.value)} /></label>
            <label><FieldLabel icon="stats">Costituzione</FieldLabel><input value={visibleFields.toughness} maxLength={12} onChange={event => setField('toughness', event.target.value)} /></label></div>}
        <label><FieldLabel icon="text">Help text</FieldLabel><input value={visibleFields.artist} maxLength={300} onChange={event => setField('artist', event.target.value)} /></label>
        <EditionDetails card={card} />
      </>}
      {tab === 'art' && <>
        <SectionTitle icon="art">Illustrazione</SectionTitle>
        <div className="inspector-actions">
          {card.art && <ToolButton icon={card.source.images.art ? 'restore' : 'remove'} label={card.source.images.art ? 'Torna all’illustrazione di catalogo' : 'Rimuovi illustrazione'} caption={card.source.images.art ? 'Torna al catalogo' : 'Rimuovi illustrazione'} onClick={() => { selectZone(undefined); update({ art: undefined, crop: defaultCrop }); }} />}
        </div>
        <p className="muted">Trascina l’illustrazione per spostarla, oppure scorri per ingrandirla. Puoi importare PNG, JPEG o WebP.</p>
        {art && <>
          <label>Zoom <output>{card.crop.zoom.toFixed(2)}×</output>
            <input type="range" min="1" max="5" step=".01" value={card.crop.zoom} onChange={event => update({ crop: { ...card.crop, zoom: Number(event.target.value) } })} />
          </label>
          <label>Posizione orizzontale<input type="range" min="-1" max="1" step=".01" value={card.crop.x} onChange={event => update({ crop: { ...card.crop, x: Number(event.target.value) } })} /></label>
          <label>Posizione verticale<input type="range" min="-1" max="1" step=".01" value={card.crop.y} onChange={event => update({ crop: { ...card.crop, y: Number(event.target.value) } })} /></label>
          <ToolButton icon="reset" label="Ripristina inquadratura" onClick={() => update({ crop: defaultCrop })} />
        </>}
        {editableFrameZone && <>
          <SectionTitle icon="zone">Area dell’illustrazione</SectionTitle>
          <div className="inspector-actions">
            <ToolButton icon="zone" label={zone === 'art' ? 'Nascondi area dell’illustrazione' : 'Mostra e modifica area dell’illustrazione'} caption={zone === 'art' ? 'Nascondi area' : 'Modifica area'} pressed={zone === 'art'} onClick={() => selectZone(zone === 'art' ? undefined : 'art')} />
          </div>
          {zone === 'art' && <>
            <p className="muted">Trascina la guida sull’anteprima, oppure inserisci le misure qui.</p>
            <ZoneFields rect={cardZones(renderedCard).art} update={changeArtZone} />
          </>}
        </>}
        {original && card.art && <>
          <ToolButton icon="zone" label="Regola area illustrazione" caption="Regola area" pressed={zone === 'art'} onClick={() => void toggleArtZone()} />
          {zone === 'art' && <>
            <p className="muted">Sposta o trascina l’angolo della guida. Le misure sono in percentuale.</p>
            <ZoneFields rect={cardArtZone(card)} update={artZone => update({ frame: { kind: 'printing', artZone } })} />
            <div className="inspector-actions">
              <ToolButton icon="save" label="Usa quest’area" onClick={() => {
                update({ frame: { kind: 'printing', artZone: cardArtZone(card) } });
                selectZone(undefined);
              }} />
              <ToolButton icon="detect" label="Rileva area in automatico" onClick={() => { update({ frame: { kind: 'printing' } }); selectZone(undefined); }} />
            </div>
          </>}
        </>}
      </>}
      {tab === 'frame' && <>
        <SectionTitle icon="frames">Cornice</SectionTitle>
        <label>Template<select value={colorSet?.id ?? (card.frame.kind === 'template' ? card.frame.template : card.frame.kind)} onChange={event => {
          const value = event.target.value;
          if (isTemplate(value)) update({ frame: newTemplate(value, fullArtBase) });
          else if (value === 'printing') update({ frame: { kind: 'printing' } });
          else {
            const set = frameSets.find(item => item.id === value);
            if (set) update({ frame: { kind: 'color-set', set } });
          }
          selectZone(undefined);
        }}>
          {card.source.printingId && <option value="printing">Edizione originale</option>}
          {(Object.keys(templateNames)).filter(isTemplate).map(template =>
            <option key={template} value={template}>{templateNames[template]}</option>)}
          {frameSets.length > 0 && <optgroup label="Set di cornici">
            {frameSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
          </optgroup>}
          {card.frame.kind === 'custom' && <option value="custom">Cornice PNG esistente</option>}
          {(card.frame.kind === 'modern' || card.frame.kind === 'classic') && <option value={card.frame.kind}>Cornice del progetto</option>}
        </select></label>
        <div className="inspector-actions">
          {card.source.printingId && <ToolButton icon="edition" label="Sfoglia cornici delle edizioni" caption="Cornici delle edizioni" onClick={chooseFrames} />}
          <ToolButton icon="layers" label="Gestisci set di cornici" onClick={manageFrameSets} />
        </div>
        {templateFrame && <button className="icon-label" onClick={() => editTemplate(templateFrame.template)}>
          <Icon name="settings" /> Editor cornici del progetto
        </button>}

        {templateFrame && renderedCard.frame.kind === 'template' && <fieldset className="template-settings">
          <legend>Divisori della carta</legend>
          {([['titleDivider', 'Sotto il titolo'], ['divider', 'Sopra le regole']] as const).map(([key, label]) => <label className="check" key={key}>
            <input type="checkbox" checked={card.dividerOverrides?.[key] ?? templateAppearance(renderedCard.frame as typeof templateFrame)[key] ?? false}
              onChange={event => update({ dividerOverrides: { ...card.dividerOverrides, [key]: event.target.checked } })} />{label}
          </label>)}
          {(card.dividerOverrides?.titleDivider !== undefined || card.dividerOverrides?.divider !== undefined) &&
            <button className="icon-label" onClick={() => update({ dividerOverrides: undefined })}><Icon name="reset" /> Ripristina divisori della cornice</button>}
        </fieldset>}

        {!original && <>
          <label>Posizione degli elementi<select value={zone ?? ''} onChange={event => selectZone((event.target.value || undefined) as keyof Zones | undefined)}>
            <option value="">Nascondi guide</option>
            {(Object.keys(zoneLabels) as Array<keyof Zones>).map(key => <option key={key} value={key}>{zoneLabels[key]}</option>)}
          </select></label>
          {zone && <>
            <p className="muted">Queste misure valgono solo per questa carta. Trascina la guida o inserisci le misure in percentuale.</p>
            <ZoneFields rect={cardZones(renderedCard)[zone]} update={rect => update({ zoneOverrides: { ...card.zoneOverrides, [zone]: rect } })} />
            {card.zoneOverrides?.[zone] && <button className="icon-label" onClick={() => {
              const overrides = { ...card.zoneOverrides };
              delete overrides[zone];
              update({ zoneOverrides: overrides });
            }}><Icon name="reset" /> Ripristina posizione della cornice</button>}
          </>}
        </>}

        {colorSet && <>
          <p className="muted">Cornice applicata · {colorsForFrame(card.source.colors, colorSet.mix).map(color => frameColorNames[color]).join(' / ')}</p>
          <FrameTextControls color={colorSet.textColor ?? '#24211e'} fontFamily={colorSet.fontFamily ?? 'Georgia'} fonts={systemFonts} change={(textColor, fontFamily) => editFrameSet({ ...colorSet, textColor, fontFamily })} />
        </>}
        {!!presets.length && <label>Applica un preset<select value="" onChange={event => {
          const preset = presets.find(item => item.id === event.target.value);
          if (preset) update({ frame: { kind: 'custom', asset: preset.asset, zones: preset.zones,
            textColor: preset.textColor, fontFamily: preset.fontFamily } });
        }}><option value="">Scegli cornice</option>
          {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select></label>}
        {custom && <>
          <fieldset className="template-settings">
            <legend>Testo</legend>
            <FrameTextControls color={custom.textColor ?? '#24211e'} fontFamily={custom.fontFamily ?? 'Georgia'} fonts={systemFonts} change={(textColor, fontFamily) => update({ frame: { ...custom, textColor, fontFamily } })} />
          </fieldset>
          <form className="preset-form" onSubmit={event => {
            event.preventDefault();
            if (presetName.trim()) { savePreset(presetName.trim()); setPresetName(''); }
          }}>
            <label>Nome del preset<input value={presetName} maxLength={100} onChange={event => setPresetName(event.target.value)} /></label>
            <button className="icon-label" disabled={!presetName.trim()}><Icon name="save" /><span>Salva preset</span></button>
          </form>
        </>}
      </>}
    </div>
  </aside>;
}
