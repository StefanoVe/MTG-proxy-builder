import { errorMessage } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useMemo, useState } from 'react';
import type { Project, PrintSettings } from '../shared/model.js';
import { projectCards } from '../shared/templates.js';
import { bleedMm, cardHeight, cardWidth, cutSegments, papers, printSheets } from '../shared/print.js';
import { Preview } from './Preview.js';

export function PrintPanel({ project, onExport, onBusy }: { project: Project; onExport: () => void; onBusy: (value: boolean) => void }) {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<PrintSettings>({ paper: 'A4', cut: true, backs: true });
  const [customMm, setCustomMm] = useState('3');
  const valid = settings.bleed !== 'custom' || (customMm !== '' && Number.isFinite(Number(customMm)) && Number(customMm) >= 0 && Number(customMm) <= 10);
  const margin = valid ? bleedMm(settings) : 0;
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [paperW, paperH] = papers[settings.paper];
  const count = project.cards.reduce((sum, card) => sum + card.count, 0);
  const limit = 1500;
  const sheets = useMemo(() => count <= limit
    ? printSheets(projectCards(project), settings)
    : [], [count, project, settings]);
  const current = Math.min(index, Math.max(0, sheets.length - 1));
  const sheet = sheets[current];
  const working = progress !== null;

  async function exportPdf() {
    onBusy(true);
    setError('');
    setProgress(0);
    try {
      const { createPdf } = await import('./pdf.js');
      const data = await createPdf(sheets, settings, project.name, setProgress, locale);
      if (await window.proxy.pdf(project.name, data)) onExport();
    } catch (cause) {
      setError(errorMessage(cause, locale));
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  return <>
    <div className="print-panel">
      <div className="print-options">
        <label>{t('paper')}<select disabled={working} value={settings.paper} onChange={event => setSettings({ ...settings, paper: event.target.value as PrintSettings['paper'] })}>
          <option>A4</option><option>Letter</option>
        </select></label>
        <label>{t('bleed')}<select disabled={working} value={settings.bleed ?? 'none'} onChange={event => { setIndex(0); setSettings({ ...settings, bleed: event.target.value as NonNullable<PrintSettings['bleed']> }); }}>
          <option value="none">{t('none')}</option><option value="mpc">MakePlayingCards · 63 × 88 mm</option><option value="custom">{t('customBleed')}</option>
        </select></label>
        {settings.bleed === 'mpc' && <small>{t('mpcBleed')}</small>}
        {settings.bleed === 'custom' && <label>{t('bleedPerSide')}<input type="number" min="0" max="10" step="0.1" disabled={working} value={customMm} onChange={event => {
          setCustomMm(event.target.value); const value = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(value) && value >= 0 && value <= 10) { setIndex(0); setSettings({ ...settings, customMm: value }); }
        }} /></label>}
        {settings.bleed && settings.bleed !== 'none' && <>
          <label>{t('fill')}<select disabled={working} value={settings.fill ?? 'mirror'} onChange={event => setSettings({ ...settings, fill: event.target.value as NonNullable<PrintSettings['fill']> })}>
            <option value="mirror">{t('mirrorEdges')}</option><option value="solid">{t('solidColor')}</option>
          </select></label>
          {settings.fill === 'solid' && <label className="bleed-color">{t('bleedColor')}<input type="color" disabled={working} value={settings.color ?? '#000000'} onChange={event => setSettings({ ...settings, color: event.target.value })} /></label>}
        </>}
        {!valid && <p className="error" role="alert">{t('bleedRange')}</p>}
        <label className="check"><input type="checkbox" disabled={working} checked={settings.cut} onChange={event => setSettings({ ...settings, cut: event.target.checked })} />{t('cutMarks')}</label>
        <label className="check"><input type="checkbox" disabled={working} checked={settings.backs} onChange={event => {
          setIndex(0); setSettings({ ...settings, backs: event.target.checked });
        }} />{t('includeBacks')}</label>
        <p className="muted">{t('printingHelp')}</p>
        {count > limit && <p className="error">{t('pdfCopyLimit', { limit })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {working && <p role="status">{t('pageNumber', { page: progress, total: sheets.length })}</p>}
      </div>
      {sheet && <div className="print-review">
        <div className="pager">
          <button aria-label={t('previousPage')} disabled={current === 0} onClick={() => setIndex(current - 1)}>‹</button>
          <span>{t('pageNumber', { page: current + 1, total: sheets.length })} · {sheet.back ? t('back') : t('front')}</span>
          <button aria-label={t('nextPage')} disabled={current === sheets.length - 1} onClick={() => setIndex(current + 1)}>›</button>
        </div>
        <div className="paper" aria-label={t('sheetPreview')} style={{ aspectRatio: `${paperW} / ${paperH}` }}>
          {sheet.slots.map(({ card, x, y }, slot) => <div key={`${current}/${slot}`} className="paper-card" style={{
            left: `${(x - margin) / paperW * 100}%`, top: `${(y - margin) / paperH * 100}%`, width: `${(cardWidth + 2 * margin) / paperW * 100}%`, height: `${(cardHeight + 2 * margin) / paperH * 100}%`
          }}><Preview card={card} back={sheet.back} bleedSettings={settings} sheet /></div>)}
          {settings.cut && sheet.slots.flatMap(({ x, y }) => cutSegments(x, y)).map(([x1, y1, x2, y2], i) => <i key={i} className="cut" style={{
            left: `${x1 / paperW * 100}%`, top: `${y1 / paperH * 100}%`,
            width: x1 === x2 ? '1px' : `${(x2 - x1) / paperW * 100}%`, height: y1 === y2 ? '1px' : `${(y2 - y1) / paperH * 100}%`
          }} />)}
        </div>
      </div>}
    </div>
    <div className="dialog-actions">
      <button className="primary" disabled={!sheets.length || working || !valid} onClick={() => void exportPdf()}>{t('savePdf')}</button>
    </div>
  </>;
}
