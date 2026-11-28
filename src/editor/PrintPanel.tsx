import { Select } from './Select.js';
import { errorMessage, LocalizedError } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useEffect, useMemo, useState } from 'react';
import type { Project, PrintSettings } from '../shared/model.js';
import { projectCards } from '../shared/templates.js';
import { bleedMm, cardHeight, cardWidth, cutSegments, papers, printSheets } from '../shared/print.js';
import { imageFaces } from './card-images.js';
import { compose } from './compose.js';
import { Preview } from './Preview.js';
import { allCardsScope, cardsInScope, ExportScope } from './ExportScope.js';
import type { Scope, ScopeOptions } from './ExportScope.js';

type Faces = ReturnType<typeof imageFaces>;
type Issue = Faces[number] & { cause: unknown };
export type PrintDraft = { settings: PrintSettings; customMm: string; pageIndex: number; scope: Scope };

export function PrintPanel({ project, scopeOptions, initialDraft, onExport, onBusy, onOpenCard }: {
  project: Project;
  scopeOptions: ScopeOptions;
  initialDraft?: PrintDraft;
  onExport: () => void;
  onBusy: (value: boolean) => void;
  onOpenCard: (id: string, back: boolean, draft: PrintDraft) => void;
}) {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<PrintSettings>(initialDraft?.settings ?? { paper: 'A4', cut: true, backs: true });
  const [customMm, setCustomMm] = useState(initialDraft?.customMm ?? '3');
  const [scope, setScope] = useState(initialDraft?.scope ?? allCardsScope);
  const valid = settings.bleed !== 'custom' || (customMm !== '' && Number.isFinite(Number(customMm)) && Number(customMm) >= 0 && Number(customMm) <= 10);
  const margin = valid ? bleedMm(settings) : 0;
  const [index, setIndex] = useState(initialDraft?.pageIndex ?? 0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [preflight, setPreflight] = useState<{ faces: Faces; issues: Issue[] }>();
  const [paperW, paperH] = papers[settings.paper];
  const scopedCards = useMemo(() => cardsInScope(project.cards, scope), [project.cards, scope]);
  const count = scopedCards?.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const limit = 1500;
  const cards = useMemo(() => scopedCards && count <= limit ? projectCards(project, scopedCards) : [], [count, project, scopedCards]);
  const sheets = useMemo(() => printSheets(cards, settings), [cards, settings]);
  const faces = useMemo(() => imageFaces(cards, settings.backs), [cards, settings.backs]);
  const issues = preflight?.faces === faces ? preflight.issues : undefined;
  const firstIssue = issues?.[0];
  const checking = faces.length > 0 && issues === undefined;
  const current = Math.min(index, Math.max(0, sheets.length - 1));
  const sheet = sheets[current];
  const working = progress !== null;
  const canExport = sheets.length > 0 && issues?.length === 0 && valid && !working;

  useEffect(() => {
    if (!faces.length) return;
    let cancelled = false;
    async function checkCards() {
      const canvas = document.createElement('canvas');
      const issues: Issue[] = [];
      // Check each card face once, regardless of how many copies appear in the PDF.
      for (const [index, face] of faces.entries()) {
        try {
          const { warning } = await compose(canvas, face.card, face.back);
          if (warning) issues.push({ ...face, cause: new LocalizedError(warning) });
        } catch (cause) {
          issues.push({ ...face, cause });
        }
        if ((index + 1) % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (cancelled) return;
      }
      setPreflight({ faces, issues });
    }
    void checkCards();
    return () => { cancelled = true; };
  }, [faces]);

  async function exportPdf() {
    if (!canExport) return;
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
    {checking && <p className="muted" role="status">{t('checkingPdfCards')}</p>}
    {firstIssue && <div className="print-preflight">
      <p className="error" role="alert">{t('pdfCardsNeedAttention')}</p>
      <ul className="error messages">{issues.map(({ card, back, cause }) => <li key={`${card.id}/${back}`}>
        <strong>{card.fields.name || t('untitledCard')}</strong> · {t(back ? 'back' : 'front')} · {errorMessage(cause, locale)}
      </li>)}</ul>
      <button type="button" disabled={working}
        onClick={() => onOpenCard(firstIssue.card.id, firstIssue.back, { settings, customMm, pageIndex: current, scope })}>{t('openFirstPdfIssue')}</button>
    </div>}
    <div className="print-panel">
      <div className="print-options">
        <ExportScope scope={scope} options={scopeOptions} count={project.cards.length} invalid={!scopedCards} disabled={working}
          onChange={next => { setScope(next); setIndex(0); setError(''); }} />
        <label>{t('paper')}<Select disabled={working} value={settings.paper} onChange={event => setSettings({ ...settings, paper: event.target.value as PrintSettings['paper'] })}>
          <option>A4</option><option>Letter</option>
        </Select></label>
        <label>{t('bleed')}<Select disabled={working} value={settings.bleed ?? 'none'} onChange={event => { setIndex(0); setSettings({ ...settings, bleed: event.target.value as NonNullable<PrintSettings['bleed']> }); }}>
          <option value="none">{t('none')}</option><option value="mpc">MakePlayingCards · 63 × 88 mm</option><option value="custom">{t('customBleed')}</option>
        </Select></label>
        {settings.bleed === 'mpc' && <small>{t('mpcBleed')}</small>}
        {settings.bleed === 'custom' && <label>{t('bleedPerSide')}<input type="number" min="0" max="10" step="0.1" disabled={working} value={customMm} onChange={event => {
          setCustomMm(event.target.value); const value = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(value) && value >= 0 && value <= 10) { setIndex(0); setSettings({ ...settings, customMm: value }); }
        }} /></label>}
        {settings.bleed && settings.bleed !== 'none' && <>
          <label>{t('fill')}<Select disabled={working} value={settings.fill ?? 'mirror'} onChange={event => setSettings({ ...settings, fill: event.target.value as NonNullable<PrintSettings['fill']> })}>
            <option value="mirror">{t('mirrorEdges')}</option><option value="solid">{t('solidColor')}</option><option value="ambient">{t('ambientBlur')}</option>
          </Select></label>
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
          }}><Preview card={card} back={sheet.back} bleedSettings={settings} hideWarning sheet /></div>)}
          {settings.cut && sheet.slots.flatMap(({ x, y }) => cutSegments(x, y)).map(([x1, y1, x2, y2], i) => <i key={i} className="cut" style={{
            left: `${x1 / paperW * 100}%`, top: `${y1 / paperH * 100}%`,
            width: x1 === x2 ? '1px' : `${(x2 - x1) / paperW * 100}%`, height: y1 === y2 ? '1px' : `${(y2 - y1) / paperH * 100}%`
          }} />)}
        </div>
      </div>}
    </div>
    <div className="dialog-actions">
      <button className="primary" disabled={!canExport} onClick={() => void exportPdf()}>{t('savePdf')}</button>
    </div>
  </>;
}
