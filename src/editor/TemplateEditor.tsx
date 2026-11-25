import { Select } from './Select.js';
import { errorMessage } from '../shared/i18n.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { CardTextColorControls } from './CardTextColorControls.js';
import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { assetURL, blankCard, createCard, frameColorNames, frameColors, isTemplate, maxDecorations, templateNames } from '../shared/model.js';
import type { Card, FrameDecoration, FrameColor, FrameTextArea, FrameTextStyle, Rect, Template, TemplateAppearance, TemplateEffect, Zones } from '../shared/model.js';
import { defaultFrameTextAlign, defaultFrameTextSizes } from '../shared/templates.js';
import type { CustomFrame } from '../shared/templates.js';
import { FontPicker, ZoneFields, zoneLabels } from './Inspector.js';
import { Icon } from './Icon.js';
import { Preview } from './Preview.js';
import { importFrameArtwork } from './frame-artwork.js';
import { SymbolEditor } from './SymbolEditor.js';
import { templateEffectLimits } from './template-effects.js';
import { VisibilityConditionEditor } from './VisibilityConditionEditor.js';

type AppearanceChange = (appearance: TemplateAppearance) => TemplateAppearance;
type Section = 'appearance' | 'dividers' | 'decorations' | 'symbols' | 'layout';
const sections: { id: Section; label: MessageKey }[] = [
  { id: 'appearance', label: 'textEffects' },
  { id: 'dividers', label: 'dividers' },
  { id: 'decorations', label: 'decorations' },
  { id: 'symbols', label: 'symbols' },
  { id: 'layout', label: 'zones' }
];
const effectAnchors = { manual: 'manual', title: 'effectTitle', type: 'effectType', rules: 'effectRules' } as const;
export type FrameEditorTab = Template | 'custom';
type EditorZone = keyof Zones | 'artist';

function Slider({ label, value, min = 0, max, step = 1, unit, change }: {
  label: string; value: number; min?: number; max: number; step?: number; unit: string; change: (value: number) => void;
}) {
  return <label className="template-slider">
    <span>{label}</span><span className="template-slider-value" aria-hidden="true">{value}{unit}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => change(event.target.valueAsNumber)} />
  </label>;
}

function ColorControl({ label, value, change }: { label: string; value: string; change: (color: string) => void }) {
  return <label className="color-field template-color">
    {label}<input type="color" value={value} onChange={event => change(event.target.value)} />
  </label>;
}

export function TemplateEditor({ tab, selectTab, appearance, customFrame, customControls, reset, activeCard, cards, fonts, change, saving, saveError, retry }: {
  tab: FrameEditorTab; selectTab: (tab: FrameEditorTab) => void; appearance: TemplateAppearance;
  customFrame?: CustomFrame; customControls?: ReactNode; reset: () => void;
  activeCard?: Card; cards: Card[]; fonts: string[]; change: (update: AppearanceChange) => void;
  saving: boolean; saveError: string; retry: () => void;
}) {
  const { t, locale } = useI18n();
  const template = tab === 'custom' ? 'full-art' : tab;
  const [section, setSection] = useState<Section>('appearance');
  const [showColors, setShowColors] = useState(tab === 'custom');
  const [zone, setZone] = useState<EditorZone>();
  const layoutZone = zone === 'artist' ? undefined : zone;
  const textArea = zone === 'art' ? undefined : zone;
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
  const example = useMemo(() => createCard({
    ...blankCard, name: t('sampleName'), type: t('sampleType'), power: '2', toughness: '3',
    rules: t('sampleRules')
  }), [t]);
  const preview = useMemo<Card>(() => ({
    ...(previewSource ?? {
      ...example, art: sampleArt, source: { ...example.source, colors: sampleColor === 'C' ? [] : [sampleColor] },
      fields: { ...example.fields, mana: sampleColor === 'C' ? '{3}' : '{2}{' + sampleColor + '}' }
    }),
    frame: customFrame ?? { kind: 'template', template, appearance }
  }), [previewSource, sampleArt, sampleColor, template, appearance, example, customFrame]);
  const count = cards.filter(card => {
    const frame = card.frame;
    if (!card.source.editable) return false;
    if (tab !== 'custom') return frame.kind === 'template' && frame.template === tab;
    if (customFrame?.kind === 'color-set') return frame.kind === 'color-set' && frame.set.id === customFrame.set.id;
    return customFrame?.kind === 'custom' && frame.kind === 'custom' && frame.appearance === customFrame.appearance && frame.asset === customFrame.asset;
  }).length;
  const customSetup = tab === 'custom' && (!customFrame || showColors);

  function patch(values: Partial<TemplateAppearance>) {
    change(previous => ({ ...previous, ...values }));
  }

  function editTextStyle(area: FrameTextArea, style: FrameTextStyle) {
    change(previous => ({ ...previous, textStyles: {
      ...previous.textStyles, [area]: { ...previous.textStyles?.[area], ...style }
    } }));
  }

  function updateZone(rect: Rect) {
    if (layoutZone) change(previous => ({ ...previous, zones: { ...previous.zones, [layoutZone]: rect } }));
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
      const asset = await importFrameArtwork(file);
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
      setUploadError(error instanceof Error ? errorMessage(error, locale) : t('decorationImportFailed'));
    } finally {
      setUploading(false);
    }
  }

  function shiftLayer(index: number, step: number) {
    const next = [...decorations];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    patch({ decorations: next });
  }

  const guide = !customSetup && section === 'decorations' ? decoration?.rect : undefined;
  return <div className="template-editor">
    <div className="template-editor-top">
      <div className="template-switch" role="group" aria-label={t('projectFrame')}>
        {Object.keys(templateNames).filter(isTemplate).map(item =>
          <button key={item} aria-pressed={item === tab} disabled={uploading} onClick={() => {
            setShowColors(false); setSelectedLayer(''); setZone(undefined); setUploadError(''); selectTab(item);
          }}>{t(templateNames[item])}</button>)}
        <button aria-pressed={tab === 'custom'} disabled={uploading} onClick={() => {
          setShowColors(true); setSelectedLayer(''); setZone(undefined); setUploadError(''); selectTab('custom');
        }}>{t('customFrames')}</button>
      </div>
      <p id={helpId} className="muted">
        {count ? t(count === 1 ? 'frameCardsOne' : 'frameCards', { count }) : t('noFrameCards')}
        {(tab !== 'custom' || customFrame) && <> {' '}{t('frameChangesHelp')}</>}
      </p>
    </div>

    <div className="template-workspace" aria-describedby={helpId}>
      <section className="template-preview" aria-label={t('livePreview')}>
        <div className="template-preview-options">
          <label>{t('preview')}<Select value={previewSource?.id ?? ''} onChange={event => setPreviewId(event.target.value)}>
            <option value="">{t('sampleCard')}</option>
            {cards.filter(card => card.source.editable).map(card =>
              <option key={card.id} value={card.id}>{card.fields.name}{card.source.set && ' · ' + card.source.set.toUpperCase()}</option>)}
          </Select></label>
          {!previewSource && <label>{t('sampleColor')}<Select value={sampleColor} onChange={event => setSampleColor(event.target.value as FrameColor)}>
            {frameColors.map(color => <option key={color} value={color}>{t(frameColorNames[color])}</option>)}
          </Select></label>}
        </div>
        <div className="template-preview-card">
          <Preview card={preview} showThirds hideWarning={!previewSource} guide={guide} zone={!customSetup && section === 'layout' ? layoutZone : undefined}
            onZone={guide ? rect => editDecoration({ rect }) : updateZone} />
        </div>
      </section>

      <section className="template-controls" aria-label={t('customization')}>
        <div className="template-sections" role="group" aria-label={t('frameControls')}>
          {tab === 'custom' && <button aria-pressed={customSetup} onClick={() => setShowColors(true)}>{t('frameColors')}</button>}
          {sections.map(item => <button key={item.id} aria-pressed={!customSetup && section === item.id} disabled={tab === 'custom' && !customFrame}
            onClick={() => { setShowColors(false); setSection(item.id); }}>{t(item.label)}</button>)}
        </div>
        <div className="template-controls-body" hidden={!customSetup}>{customControls}</div>
        {!customSetup &&
        <div className="template-controls-body">
          {section === 'appearance' && <>
            <fieldset className="template-settings">
              <legend>{t('typography')}</legend>
              <FontPicker value={appearance.fontFamily ?? 'Georgia'} fonts={fonts} onChange={fontFamily => patch({ fontFamily })} />
              <CardTextColorControls appearance={appearance} change={change} />
              <ColorControl label={t('textColor')} value={appearance.textColor} change={textColor => patch({ textColor })} />
            </fieldset>
            <fieldset className="template-settings">
              <legend>{t('shadeAndBlur')}</legend>
              <ColorControl label={t('shadeColor')} value={appearance.shadeColor ?? '#141820'} change={shadeColor => patch({ shadeColor })} />
              <div className="template-effect-grid">
                {([
                  ['topEffect', 'titleShade', 'titleBlur'],
                  ['bottomEffect', 'rulesShade', 'rulesBlur']
                ] as const).map(([effect, shade, blur]) => {
                  const settings = appearance[effect];
                  const anchor = settings?.anchor ?? 'manual';
                  const { max, defaultHeight } = templateEffectLimits(template, effect);
                  return <fieldset key={effect} className="template-settings">
                    <legend>{t(effect)}</legend>
                    <label>{t(`${effect}Anchor`)}<Select value={anchor} onChange={event =>
                      patch({ [effect]: { ...settings, anchor: event.target.value as TemplateEffect['anchor'] } })}>
                      {Object.entries(effectAnchors).map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}
                    </Select></label>
                    {anchor === 'manual' && <Slider label={t(`${effect}Height`)} value={Math.min(settings?.height ?? defaultHeight, max)}
                      max={max} step={0.1} unit="%" change={height => patch({ [effect]: { anchor, height } })} />}
                    <Slider label={t(`${effect}Shade`)} value={Math.round(appearance[shade] * 100)} max={100} unit="%" change={value => patch({ [shade]: value / 100 })} />
                    <Slider label={t(`${effect}Blur`)} value={appearance[blur] ?? 0} max={32} unit=" px" change={value => patch({ [blur]: value })} />
                  </fieldset>;
                })}
              </div>
            </fieldset>
          </>}

          {section === 'symbols' && <SymbolEditor appearance={appearance} change={change} />}

          {section === 'dividers' && <div className="template-settings" role="group" aria-label={t('dividers')}>
            {([
              ['titleDivider', 'titleDividerHideWhen', 'belowTitle'],
              ['divider', 'dividerHideWhen', 'aboveRules']
            ] as const).map(([enabled, condition, label]) => <div className="template-divider-controls" role="group" aria-label={t(label)} key={enabled}>
              <label className="check"><input type="checkbox" checked={appearance[enabled] ?? false}
                onChange={event => patch({ [enabled]: event.target.checked })} />{t(label)}</label>
              <VisibilityConditionEditor condition={appearance[condition]} change={value => patch({ [condition]: value })} />
            </div>)}
            <label className="check"><input type="checkbox" checked={!appearance.accent}
              onChange={event => patch({ accent: event.target.checked ? undefined : '#fff8ea' })} />{t('dividerColorFromCard')}</label>
            {appearance.accent && <ColorControl label={t('dividerColor')} value={appearance.accent} change={accent => patch({ accent })} />}
            <div className="template-control-grid">
              <Slider label={t('dividerLength')} value={appearance.dividerLength ?? 100} min={5} max={100} unit="%" change={dividerLength => patch({ dividerLength })} />
              <Slider label={t('dividerWeight')} value={appearance.dividerWeight ?? 2} min={1} max={12} unit=" px" change={dividerWeight => patch({ dividerWeight })} />
              <Slider label={t('dividerPadding')} value={appearance.dividerPadding ?? 6} max={100} unit=" px" change={dividerPadding => patch({ dividerPadding })} />
              <label>{t('alignment')}<Select value={appearance.dividerAlign ?? 'center'} onChange={event =>
                patch({ dividerAlign: event.target.value as TemplateAppearance['dividerAlign'] })}>
                <option value="left">{t('left')}</option><option value="center">{t('center')}</option><option value="right">{t('right')}</option>
              </Select></label>
              <label>{t('stroke')}<Select value={appearance.dividerStyle ?? 'solid'} onChange={event =>
                patch({ dividerStyle: event.target.value as TemplateAppearance['dividerStyle'] })}>
                <option value="solid">{t('solid')}</option><option value="fade">{t('fadedEnds')}</option><option value="dashed">{t('dashed')}</option>
              </Select></label>
            </div>
          </div>}

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
                <Icon name="import" /> {t('dropDecoration')}
              </button>
              <input ref={fileInput} hidden type="file" aria-label={t('decorationFile')} accept=".svg,.png,image/svg+xml,image/png" onChange={event => {
                const [file] = event.target.files ?? [];
                event.target.value = '';
                if (file) void upload(file);
              }} />
            </div>
            {uploading && <p role="status" className="muted">{t('importingDecoration')}</p>}
            {uploadError && <p role="alert" className="error">{uploadError}</p>}
            {decorations.length >= maxDecorations && <p className="muted">{t('layerLimit', { limit: maxDecorations })}</p>}
            {appearance.overlay && <div className="template-overlay">
              <img src={assetURL(appearance.overlay)} alt="" /><span>{t('pngOverlay')}</span>
              <button className="icon-button" aria-label={t('removePngOverlay')} onClick={() => patch({ overlay: undefined })}><Icon name="remove" /></button>
            </div>}
            {!!decorations.length && <ol className="template-layer-list" aria-label={t('layers')}>
              {decorations.map((item, index) => <li key={item.id}>
                <button aria-pressed={item.id === selectedLayer} className="template-layer-name" onClick={() => setSelectedLayer(item.id)}>
                  <Icon name={item.source.kind === 'image' ? 'art' : 'layers'} size={16} /><span>{item.name}</span>
                </button>
                <button className="icon-button" aria-label={t('raiseLayer', { name: item.name })} disabled={index === decorations.length - 1} onClick={() => shiftLayer(index, 1)}><Icon name="up" size={15} /></button>
                <button className="icon-button" aria-label={t('lowerLayer', { name: item.name })} disabled={index === 0} onClick={() => shiftLayer(index, -1)}><Icon name="down" size={15} /></button>
                <button className="icon-button" aria-label={t('removeLayer', { name: item.name })} onClick={() => patch({ decorations: decorations.filter(layer => layer.id !== item.id) })}><Icon name="remove" size={15} /></button>
              </li>)}
            </ol>}
            {decoration && <fieldset className="template-settings">
              <legend>{t('editLayer')}</legend>
              <div className="template-control-grid">
                <label>{t('decorationColor')}<Select value={decoration.tint} onChange={event => editDecoration({ tint: event.target.value as FrameDecoration['tint'] })}>
                  <option value="original">{t('original')}</option><option value="card">{t('cardColor')}</option>
                  <option value="text">{t('sameAsText')}</option><option value="custom">{t('custom')}</option>
                </Select></label>
                <label>{t('fit')}<Select value={decoration.fit} onChange={event => editDecoration({ fit: event.target.value as FrameDecoration['fit'] })}>
                  <option value="contain">{t('keepAspectRatio')}</option><option value="stretch">{t('fillArea')}</option>
                </Select></label>
              </div>
              {decoration.tint === 'custom' && <ColorControl label={t('decorationTint')} value={decoration.color} change={color => editDecoration({ color })} />}
              <Slider label={t('decorationOpacity')} value={Math.round(decoration.opacity * 100)} max={100} unit="%" change={value => editDecoration({ opacity: value / 100 })} />
              <VisibilityConditionEditor condition={decoration.hideWhen} change={hideWhen => editDecoration({ hideWhen })} />
              <ZoneFields rect={decoration.rect} update={rect => editDecoration({ rect })} />
              <p className="muted">{t('moveLayerHelp')}</p>
            </fieldset>}
          </>}

          {section === 'layout' && <fieldset className="template-settings">
            <legend>{t(zone === 'artist' ? 'typography' : 'positionSize')}</legend>
            <label>{t('zoneToEdit')}<Select value={zone ?? ''} onChange={event =>
              setZone((event.target.value || undefined) as EditorZone | undefined)}>
              <option value="">{t('selectZone')}</option>
              {Object.entries(zoneLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
              <option value="artist">{t('artistCredit')}</option>
            </Select></label>
            {layoutZone && <>
              <ZoneFields rect={appearance.zones[layoutZone]} update={updateZone} />
              <p className="muted">{t('resizeZoneHelp')}</p>
            </>}
            {textArea && <div className="template-control-grid">
              <label>{t('horizontalAlignment')}<Select value={appearance.textStyles?.[textArea]?.align ?? defaultFrameTextAlign(textArea)}
                onChange={event => editTextStyle(textArea, { align: event.target.value as FrameTextStyle['align'] })}>
                <option value="left">{t('left')}</option><option value="center">{t('center')}</option><option value="right">{t('right')}</option>
              </Select></label>
              <Slider label={t('maxFontSize')} value={appearance.textStyles?.[textArea]?.size ?? (tab === 'custom' && textArea === 'artist' ? 20 : defaultFrameTextSizes[textArea])}
                min={8} max={96} unit=" px" change={size => editTextStyle(textArea, { size })} />
            </div>}
          </fieldset>}
        </div>
        }
      </section>
    </div>

    <div className="template-editor-footer">
      <span className={saveError ? 'error' : 'muted'} role="status">{saveError || (saving ? t('saving') : t('autosave'))}</span>
      {saveError && <button onClick={retry}>{t('retry')}</button>}
      <button className="icon-label" disabled={uploading || (tab === 'custom' && !customFrame)} onClick={() => {
        reset();
        setZone(undefined); setSelectedLayer(''); setUploadError('');
      }}><Icon name="reset" size={16} />{' '}{t('resetFrame')}</button>
    </div>
  </div>;
}
