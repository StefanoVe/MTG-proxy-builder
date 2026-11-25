import { Select } from './Select.js';
import { errorMessage, LocalizedError } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, Project } from '../shared/model.js';
import { projectCards } from '../shared/templates.js';
import { cardArchiveLimit } from '../shared/print.js';
import { drawCardImage, imageFaces, imageGeometry, orientedGeometry } from './card-images.js';
import { sideOrientation } from '../shared/model.js';
import type { Bleed, BleedFill, ImageFormat } from './card-images.js';
import { compose } from './compose.js';

type Geometry = ReturnType<typeof imageGeometry>;

function CardThumbnail({ card, back, geometry, fill, color, guides }: {
  card: Card; back: boolean; geometry: Geometry; fill: BleedFill; color: string; guides: boolean;
}) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement>();
  const faceGeometry = orientedGeometry(geometry, sideOrientation(card, back) === 'landscape');
  const [warning, setWarning] = useState<Error>();
  useEffect(() => {
    const canvas = ref.current!;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting === visible) return;
      visible = entry.isIntersecting;
      if (!visible) {
        canvas.width = 1;
        canvas.height = 1;
        setSource(undefined);
        return;
      }
      const composed = document.createElement('canvas');
      void compose(composed, card, back).then(({ warning }) => {
        if (!visible || !canvas.isConnected) return;
        const thumbnail = document.createElement('canvas');
        thumbnail.width = composed.width > composed.height ? 352 : 252;
        thumbnail.height = composed.width > composed.height ? 252 : 352;
        const context = thumbnail.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        context.drawImage(composed, 0, 0, thumbnail.width, thumbnail.height);
        setSource(thumbnail);
        setWarning(warning ? new LocalizedError(warning) : undefined);
      }).catch((cause: unknown) => {
        if (visible && canvas.isConnected) setWarning(cause instanceof Error ? cause : new Error(String(cause)));
      });
    }, { rootMargin: '140px' });
    observer.observe(canvas);
    return () => {
      visible = false;
      observer.disconnect();
    };
  }, [card, back]);
  useEffect(() => {
    if (source && ref.current) drawCardImage(ref.current, source, geometry, fill, color);
  }, [source, geometry, fill, color]);

  const side = back ? t('back') : t('front');
  return <figure className="card-export-item">
    <div className="card-export-image" style={{ aspectRatio: `${faceGeometry.totalWidth} / ${faceGeometry.totalHeight}` }}>
      <canvas ref={ref} width={1} height={1} role="img" aria-label={`${card.fields.name} · ${side}`} />
      {guides && geometry.margin > 0 && <span className="trim-guide" style={{
        inset: `${100 * faceGeometry.margin / faceGeometry.totalHeight}% ${100 * faceGeometry.margin / faceGeometry.totalWidth}%`
      }} aria-hidden="true" />}
    </div>
    <figcaption><strong>{card.fields.name}</strong><small>{side}{card.count > 1 && ` · ×${card.count}`}</small></figcaption>
    {warning && <small className="error" role="status">{errorMessage(warning, locale)}</small>}
  </figure>;
}

export function CardExportPanel({ project, onBusy, onExport }: {
  project: Project; onBusy: (busy: boolean) => void; onExport: () => void;
}) {
  const { t, locale } = useI18n();
  const [bleed, setBleed] = useState<Bleed>('none');
  const [customMm, setCustomMm] = useState('3');
  const [fill, setFill] = useState<BleedFill>('mirror');
  const [color, setColor] = useState('#000000');
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(95);
  const [backs, setBacks] = useState(true);
  const [copies, setCopies] = useState(false);
  const [guides, setGuides] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const working = progress !== null;
  const margin = Number(customMm);
  const valid = bleed !== 'custom' || (customMm !== '' && Number.isFinite(margin) && margin >= 0 && margin <= 10);
  const geometry = useMemo(() => imageGeometry(dpi, bleed, valid ? margin : 0), [dpi, bleed, margin, valid]);
  const previewGeometry = useMemo(() => {
    const width = 248;
    const height = Math.round(geometry.height * width / geometry.width);
    const margin = Math.round(geometry.margin * width / geometry.width);
    return { width, height, margin, totalWidth: width + 2 * margin, totalHeight: height + 2 * margin };
  }, [geometry]);
  const faces = useMemo(() => imageFaces(projectCards(project), backs), [project, backs]);
  const total = faces.reduce((sum, { card }) => sum + (copies ? card.count : 1), 0);
  const hasBacks = project.cards.some(card => !!card.source.images.back);

  async function exportCards() {
    onBusy(true);
    setError('');
    setProgress(0);
    try {
      const { createCardArchive } = await import('./card-archive.js');
      const data = await createCardArchive(faces, { geometry, fill, color, format, dpi, quality, copies }, setProgress, locale);
      if (await window.proxy.cardArchive(project.name, data)) onExport();
    } catch (cause) {
      setError(errorMessage(cause, locale));
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  return <>
    <div className="card-export">
      <div className="card-export-options">
        <fieldset disabled={working} className="print-options">
          <label>{t('bleed')}<Select value={bleed} onChange={event => setBleed(event.target.value as Bleed)}>
            <option value="none">{t('none')}</option>
            <option value="mpc">MakePlayingCards · 63 × 88 mm</option>
            <option value="custom">{t('customBleed')}</option>
          </Select></label>
          {bleed === 'mpc' && <small>{t('mpcBleed')}</small>}
          {bleed === 'custom' && <label>{t('bleedPerSide')}<input type="number" min="0" max="10" step="0.1" value={customMm}
            onChange={event => setCustomMm(event.target.value)} /></label>}
          {bleed !== 'none' && <>
            <label>{t('fill')}<Select value={fill} onChange={event => setFill(event.target.value as BleedFill)}>
              <option value="mirror">{t('mirrorEdges')}</option>
              <option value="solid">{t('solidColor')}</option>
            </Select></label>
            {fill === 'solid' && <label className="bleed-color">{t('bleedColor')}<input type="color" value={color}
              onChange={event => setColor(event.target.value)} /></label>}
            <label className="check"><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} />{t('showTrimGuide')}</label>
          </>}
          <div className="form-row">
            <label>{t('format')}<Select value={format} onChange={event => setFormat(event.target.value as ImageFormat)}>
              <option value="png">PNG</option><option value="jpg">JPG</option>
            </Select></label>
            <label>{t('resolution')}<Select value={dpi} onChange={event => setDpi(Number(event.target.value))}>
              <option value="300">300 DPI</option><option value="600">600 DPI</option>
            </Select></label>
          </div>
          {format === 'jpg' && <label>{t('jpgQuality', { value: quality })}<input type="range" min="60" max="100" value={quality}
            onChange={event => setQuality(Number(event.target.value))} /></label>}
          <label className="check"><input type="checkbox" checked={backs && hasBacks} disabled={!hasBacks}
            onChange={event => setBacks(event.target.checked)} />{t('includeAvailableBacks')}</label>
          <label className="check"><input type="checkbox" checked={copies} onChange={event => setCopies(event.target.checked)} />{t('exportAllCopies')}</label>
        </fieldset>
        <small>{geometry.totalWidth} × {geometry.totalHeight} px · {t(total === 1 ? 'imageCountOne' : 'imageCount', { count: total })}</small>
        {!valid && <p className="error" role="alert">{t('bleedRange')}</p>}
        {total > cardArchiveLimit && <p className="error" role="alert">{t('zipImageLimit', { limit: cardArchiveLimit })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <section className="card-export-review" aria-label={t('cardPreviews')}>
        <div className="card-export-grid">
          {faces.map(({ card, back }) => <CardThumbnail key={`${card.id}/${back}`} card={card} back={back}
            geometry={previewGeometry} fill={fill} color={color} guides={guides} />)}
        </div>
      </section>
    </div>
    <div className="dialog-actions card-export-actions">
      {working && <p role="status">{progress === total ? t('preparingZip') : t('imagesProcessed', { done: progress, total })}</p>}
      <button className="primary" disabled={!valid || working || !total || total > cardArchiveLimit}
        onClick={() => void exportCards()}>{t('saveZip')}</button>
    </div>
  </>;
}
