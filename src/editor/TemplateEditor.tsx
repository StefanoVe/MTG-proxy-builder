import { useId, useMemo, useRef, useState } from 'react';
import { assetURL, blankCard, createCard, frameColorNames, frameColors, isTemplate, maxDecorations, templateNames } from '../shared/model.js';
import type { Card, FrameDecoration, FrameColor, Rect, Template, TemplateAppearance, Zones } from '../shared/model.js';
import { newTemplate, templateAppearance } from '../shared/templates.js';
import { FontPicker, ZoneFields, zoneLabels } from './Inspector.js';
import { Icon } from './Icon.js';
import { Preview } from './Preview.js';
import { importDecoration } from './template-decorations.js';

type AppearanceChange = (appearance: TemplateAppearance) => TemplateAppearance;
type Section = 'appearance' | 'dividers' | 'decorations' | 'layout';
const sections: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Testo ed effetti' },
  { id: 'dividers', label: 'Divisori' },
  { id: 'decorations', label: 'Decorazioni' },
  { id: 'layout', label: 'Zone' }
];
const example = createCard({
  ...blankCard, name: 'Custode della soglia', type: 'Creatura — Spirito', power: '2', toughness: '3',
  mana: '{2}{U}', rules: 'Volare\nQuando questa creatura entra, pesca una carta.'
});

function Slider({ label, value, min = 0, max, unit, change }: {
  label: string; value: number; min?: number; max: number; unit: string; change: (value: number) => void;
}) {
  return <label className="template-slider">
    <span>{label}</span><span className="template-slider-value" aria-hidden="true">{value}{unit}</span>
    <input type="range" min={min} max={max} value={value} onChange={event => change(event.target.valueAsNumber)} />
  </label>;
}

function ColorControl({ label, value, change }: { label: string; value: string; change: (color: string) => void }) {
  return <label className="color-field template-color">
    {label}<input type="color" value={value} onChange={event => change(event.target.value)} />
  </label>;
}

export function TemplateEditor({ template, selectTemplate, appearance, activeCard, cards, fonts, change, saving, saveError, retry }: {
  template: Template; selectTemplate: (template: Template) => void; appearance: TemplateAppearance;
  activeCard?: Card; cards: Card[]; fonts: string[]; change: (update: AppearanceChange) => void;
  saving: boolean; saveError: string; retry: () => void;
}) {
  const [section, setSection] = useState<Section>('appearance');
  const [zone, setZone] = useState<keyof Zones>();
  const [selectedLayer, setSelectedLayer] = useState('');
  const [previewId, setPreviewId] = useState(activeCard?.source.editable ? activeCard.id : cards.find(card => card.source.editable)?.id ?? '');
  const [sampleColor, setSampleColor] = useState<FrameColor>('U');
  const [uploading, setUploading] = useState(false);
  const [draggingDecoration, setDraggingDecoration] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const decorations = appearance.decorations ?? [];
  const importDisabled = uploading || decorations.length >= maxDecorations;
  const decoration = decorations.find(item => item.id === selectedLayer);
  const previewSource = cards.find(card => card.id === previewId && card.source.editable);
  const sampleArt = activeCard?.art ?? activeCard?.source.images.art;
  const preview = useMemo<Card>(() => ({
    ...(previewSource ?? {
      ...example, art: sampleArt, source: { ...example.source, colors: sampleColor === 'C' ? [] : [sampleColor] },
      fields: { ...example.fields, mana: sampleColor === 'C' ? '{3}' : '{2}{' + sampleColor + '}' }
    }),
    frame: { kind: 'template', template, appearance }
  }), [previewSource, sampleArt, sampleColor, template, appearance]);
  const count = cards.filter(card => card.source.editable && card.frame.kind === 'template' && card.frame.template === template).length;

  function patch(values: Partial<TemplateAppearance>) {
    change(previous => ({ ...previous, ...values }));
  }

  function updateZone(rect: Rect) {
    if (zone) change(previous => ({ ...previous, zones: { ...previous.zones, [zone]: rect } }));
  }

  function editDecoration(values: Partial<FrameDecoration>) {
    if (!decoration) return;
    change(previous => ({
      ...previous, decorations: previous.decorations?.map(item => item.id === decoration.id ? { ...item, ...values } : item)
    }));
  }

  async function upload(file: File) {
    if (importDisabled) return;
    setUploading(true);
    setUploadError('');
    try {
      const asset = await importDecoration(file);
      const entry: FrameDecoration = {
        id: crypto.randomUUID(), name: asset.name, source: { kind: 'image', asset: asset.id },
        rect: { x: 3, y: 3, w: 94, h: 94 }, opacity: 1, color: '#fff8ea', fit: 'contain', tint: 'original'
      };
      change(previous => {
        const layers = previous.decorations ?? [];
        return layers.length < maxDecorations ? { ...previous, decorations: [...layers, entry] } : previous;
      });
      setSelectedLayer(entry.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Impossibile importare la decorazione.');
    } finally {
      setUploading(false);
    }
  }

  function shiftLayer(index: number, step: number) {
    const next = [...decorations];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    patch({ decorations: next });
  }

  const guide = section === 'decorations' ? decoration?.rect : undefined;
  return <div className="template-editor">
    <div className="template-editor-top">
      <div className="template-switch" role="group" aria-label="Cornice del progetto">
        {Object.keys(templateNames).filter(isTemplate).map(item =>
          <button key={item} aria-pressed={item === template} disabled={uploading} onClick={() => {
            setSelectedLayer(''); setZone(undefined); setUploadError(''); selectTemplate(item);
          }}>{templateNames[item]}</button>)}
      </div>
      <p id={helpId} className="muted">
        {count ? count + (count === 1 ? ' carta usa questa cornice.' : ' carte usano questa cornice.') : 'Nessuna carta usa ancora questa cornice.'}
        {' '}Le modifiche si applicano subito alle carte che la usano, anche quelle future.
      </p>
    </div>

    <div className="template-workspace" aria-describedby={helpId}>
      <section className="template-preview" aria-label="Anteprima live">
        <div className="template-preview-options">
          <label>Anteprima<select value={previewSource?.id ?? ''} onChange={event => setPreviewId(event.target.value)}>
            <option value="">Carta di esempio</option>
            {cards.filter(card => card.source.editable).map(card =>
              <option key={card.id} value={card.id}>{card.fields.name}{card.source.set && ' · ' + card.source.set.toUpperCase()}</option>)}
          </select></label>
          {!previewSource && <label>Colore di esempio<select value={sampleColor} onChange={event => setSampleColor(event.target.value as FrameColor)}>
            {frameColors.map(color => <option key={color} value={color}>{frameColorNames[color]}</option>)}
          </select></label>}
        </div>
        <div className="template-preview-card">
          <Preview card={preview} showThirds hideWarning={!previewSource} guide={guide} zone={section === 'layout' ? zone : undefined}
            onZone={guide ? rect => editDecoration({ rect }) : updateZone} />
        </div>
      </section>

      <section className="template-controls" aria-label="Personalizzazione">
        <div className="template-sections" role="group" aria-label="Controlli cornice">
          {sections.map(item => <button key={item.id} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}
        </div>
        <div className="template-controls-body">
          {section === 'appearance' && <>
            <fieldset className="template-settings">
              <legend>Tipografia</legend>
              <FontPicker value={appearance.fontFamily ?? 'Georgia'} fonts={fonts} onChange={fontFamily => patch({ fontFamily })} />
              <label className="check"><input type="checkbox" checked={appearance.autoTextColor ?? false}
                onChange={event => patch({ autoTextColor: event.target.checked })} />Colore del testo dalla carta</label>
              {!appearance.autoTextColor && <ColorControl label="Colore del testo" value={appearance.textColor} change={textColor => patch({ textColor })} />}
            </fieldset>
            <fieldset className="template-settings">
              <legend>Ombra e sfocatura</legend>
              <ColorControl label="Colore dell’ombra" value={appearance.shadeColor ?? '#141820'} change={shadeColor => patch({ shadeColor })} />
              <div className="template-control-grid">
                <Slider label="Ombra del titolo" value={Math.round(appearance.titleShade * 100)} max={100} unit="%" change={value => patch({ titleShade: value / 100 })} />
                <Slider label="Sfocatura del titolo" value={appearance.titleBlur ?? 0} max={32} unit=" px" change={titleBlur => patch({ titleBlur })} />
                <Slider label="Ombra delle regole" value={Math.round(appearance.rulesShade * 100)} max={100} unit="%" change={value => patch({ rulesShade: value / 100 })} />
                <Slider label="Sfocatura delle regole" value={appearance.rulesBlur ?? 0} max={32} unit=" px" change={rulesBlur => patch({ rulesBlur })} />
              </div>
            </fieldset>
          </>}

          {section === 'dividers' && <fieldset className="template-settings">
            <legend>Divisori</legend>
            <label className="check"><input type="checkbox" checked={appearance.titleDivider ?? false}
              onChange={event => patch({ titleDivider: event.target.checked })} />Sotto il titolo</label>
            <label className="check"><input type="checkbox" checked={appearance.divider}
              onChange={event => patch({ divider: event.target.checked })} />Sopra le regole</label>
            <label className="check"><input type="checkbox" checked={!appearance.accent}
              onChange={event => patch({ accent: event.target.checked ? undefined : '#fff8ea' })} />Colore dei divisori dalla carta</label>
            {appearance.accent && <ColorControl label="Colore dei divisori" value={appearance.accent} change={accent => patch({ accent })} />}
            <div className="template-control-grid">
              <Slider label="Lunghezza dei divisori" value={appearance.dividerLength ?? 100} min={5} max={100} unit="%" change={dividerLength => patch({ dividerLength })} />
              <Slider label="Spessore dei divisori" value={appearance.dividerWeight ?? 2} min={1} max={12} unit=" px" change={dividerWeight => patch({ dividerWeight })} />
              <label>Allineamento<select value={appearance.dividerAlign ?? 'center'} onChange={event =>
                patch({ dividerAlign: event.target.value as TemplateAppearance['dividerAlign'] })}>
                <option value="left">Sinistra</option><option value="center">Centro</option><option value="right">Destra</option>
              </select></label>
              <label>Tratto<select value={appearance.dividerStyle ?? 'solid'} onChange={event =>
                patch({ dividerStyle: event.target.value as TemplateAppearance['dividerStyle'] })}>
                <option value="solid">Continuo</option><option value="fade">Estremità sfumate</option><option value="dashed">Tratteggiato</option>
              </select></label>
            </div>
          </fieldset>}

          {section === 'decorations' && <>
            <div className="template-decoration-tools" onDragOver={event => {
              if (!event.dataTransfer.types.includes('Files')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = importDisabled ? 'none' : 'copy';
              setDraggingDecoration(!importDisabled);
            }} onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingDecoration(false);
            }} onDrop={event => {
              event.preventDefault();
              setDraggingDecoration(false);
              const [file] = event.dataTransfer.files;
              if (file) void upload(file);
            }}>
              <button type="button" className={`image-dropzone icon-label${draggingDecoration ? ' dragging' : ''}`}
                disabled={importDisabled} onClick={() => fileInput.current?.click()}>
                <Icon name="import" /> Trascina un SVG o PNG qui, oppure scegli un file
              </button>
              <input ref={fileInput} hidden type="file" aria-label="File decorazione" accept=".svg,.png,image/svg+xml,image/png" onChange={event => {
                const [file] = event.target.files ?? [];
                event.target.value = '';
                if (file) void upload(file);
              }} />
            </div>
            {uploading && <p role="status" className="muted">Importazione decorazione…</p>}
            {uploadError && <p role="alert" className="error">{uploadError}</p>}
            {decorations.length >= maxDecorations && <p className="muted">Puoi aggiungere fino a {maxDecorations} livelli.</p>}
            {appearance.overlay && <div className="template-overlay">
              <img src={assetURL(appearance.overlay)} alt="" /><span>Overlay PNG del template</span>
              <button className="icon-button" aria-label="Rimuovi overlay PNG" onClick={() => patch({ overlay: undefined })}><Icon name="remove" /></button>
            </div>}
            {!!decorations.length && <ol className="template-layer-list" aria-label="Livelli, dal fondo al primo piano">
              {decorations.map((item, index) => <li key={item.id}>
                <button aria-pressed={item.id === selectedLayer} className="template-layer-name" onClick={() => setSelectedLayer(item.id)}>
                  <Icon name={item.source.kind === 'image' ? 'art' : 'layers'} size={16} /><span>{item.name}</span>
                </button>
                <button className="icon-button" aria-label={'Porta avanti ' + item.name} disabled={index === decorations.length - 1} onClick={() => shiftLayer(index, 1)}><Icon name="up" size={15} /></button>
                <button className="icon-button" aria-label={'Porta indietro ' + item.name} disabled={index === 0} onClick={() => shiftLayer(index, -1)}><Icon name="down" size={15} /></button>
                <button className="icon-button" aria-label={'Rimuovi ' + item.name} onClick={() => patch({ decorations: decorations.filter(layer => layer.id !== item.id) })}><Icon name="remove" size={15} /></button>
              </li>)}
            </ol>}
            {decoration && <fieldset className="template-settings">
              <legend>Regola il livello</legend>
              <div className="template-control-grid">
                <label>Colore decorazione<select value={decoration.tint} onChange={event => editDecoration({ tint: event.target.value as FrameDecoration['tint'] })}>
                  <option value="original">Originale</option><option value="card">Colore della carta</option>
                  <option value="text">Come il testo</option><option value="custom">Personalizzato</option>
                </select></label>
                <label>Adattamento<select value={decoration.fit} onChange={event => editDecoration({ fit: event.target.value as FrameDecoration['fit'] })}>
                  <option value="contain">Mantieni proporzioni</option><option value="stretch">Riempi la zona</option>
                </select></label>
              </div>
              {decoration.tint === 'custom' && <ColorControl label="Tinta della decorazione" value={decoration.color} change={color => editDecoration({ color })} />}
              <Slider label="Opacità della decorazione" value={Math.round(decoration.opacity * 100)} max={100} unit="%" change={value => editDecoration({ opacity: value / 100 })} />
              <ZoneFields rect={decoration.rect} update={rect => editDecoration({ rect })} />
              <p className="muted">Trascina la guida o il suo angolo per spostare o ridimensionare il livello.</p>
            </fieldset>}
          </>}

          {section === 'layout' && <fieldset className="template-settings">
            <legend>Posizione e dimensioni</legend>
            <label>Zona da modificare<select value={zone ?? ''} onChange={event =>
              setZone((event.target.value || undefined) as keyof Zones | undefined)}>
              <option value="">Seleziona una zona</option>
              {Object.entries(zoneLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            {zone && <>
              <ZoneFields rect={appearance.zones[zone]} update={updateZone} />
              <p className="muted">Trascina la guida o il suo angolo. Le misure sono in percentuale.</p>
            </>}
          </fieldset>}
        </div>
      </section>
    </div>

    <div className="template-editor-footer">
      <span className={saveError ? 'error' : 'muted'} role="status">{saveError || (saving ? 'Salvataggio…' : 'Salvataggio automatico')}</span>
      {saveError && <button onClick={retry}>Riprova</button>}
      <button className="icon-label" disabled={uploading} onClick={() => {
        change(() => templateAppearance(newTemplate(template)));
        setZone(undefined); setSelectedLayer(''); setUploadError('');
      }}><Icon name="reset" size={16} /> Ripristina cornice</button>
    </div>
  </div>;
}
