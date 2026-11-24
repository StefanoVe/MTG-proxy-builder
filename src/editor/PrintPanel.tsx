import { useMemo, useState } from 'react';
import type { Project, PrintSettings } from '../shared/model.js';
import { withProjectTemplate } from '../shared/templates.js';
import { cardHeight, cardWidth, cutSegments, papers, printSheets } from '../shared/print.js';
import { Preview } from './Preview.js';

export function PrintPanel({ project, onExport, onBusy }: { project: Project; onExport: () => void; onBusy: (value: boolean) => void }) {
  const [settings, setSettings] = useState<PrintSettings>({ paper: 'A4', cut: true, backs: true });
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [paperW, paperH] = papers[settings.paper];
  const count = project.cards.reduce((sum, card) => sum + card.count, 0);
  const limit = 1500;
  const sheets = useMemo(() => count <= limit
    ? printSheets(project.cards.map(card => withProjectTemplate(card, project.templateAppearances)), settings)
    : [], [count, project.cards, project.templateAppearances, settings]);
  const current = Math.min(index, Math.max(0, sheets.length - 1));
  const sheet = sheets[current];
  const working = progress !== null;

  async function exportPdf() {
    onBusy(true);
    setError('');
    setProgress(0);
    try {
      const { createPdf } = await import('./pdf.js');
      const data = await createPdf(sheets, settings, project.name, setProgress);
      if (await window.proxy.pdf(project.name, data)) onExport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  return <>
    <div className="print-panel">
      <div className="print-options">
        <label>Carta<select disabled={working} value={settings.paper} onChange={event => setSettings({ ...settings, paper: event.target.value as PrintSettings['paper'] })}>
          <option>A4</option><option>Letter</option>
        </select></label>
        <label className="check"><input type="checkbox" disabled={working} checked={settings.cut} onChange={event => setSettings({ ...settings, cut: event.target.checked })} />Segni di taglio</label>
        <label className="check"><input type="checkbox" disabled={working} checked={settings.backs} onChange={event => {
          setIndex(0); setSettings({ ...settings, backs: event.target.checked });
        }} />Includi i retro</label>
        <p className="muted">Stampa al 100%. Per i retro, imposta il ribaltamento sul lato lungo.</p>
        {count > limit && <p className="error">Il PDF può contenere al massimo {limit} copie per esportazione.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {working && <p role="status">Pagina {progress} di {sheets.length}</p>}
      </div>
      {sheet && <div className="print-review">
        <div className="pager">
          <button aria-label="Pagina precedente" disabled={current === 0} onClick={() => setIndex(current - 1)}>‹</button>
          <span>Pagina {current + 1} di {sheets.length} · {sheet.back ? 'Retro' : 'Fronte'}</span>
          <button aria-label="Pagina successiva" disabled={current === sheets.length - 1} onClick={() => setIndex(current + 1)}>›</button>
        </div>
        <div className="paper" aria-label="Anteprima del foglio" style={{ aspectRatio: `${paperW} / ${paperH}` }}>
          {sheet.slots.map(({ card, x, y }, slot) => <div key={`${current}/${slot}`} className="paper-card" style={{
            left: `${x / paperW * 100}%`, top: `${y / paperH * 100}%`, width: `${cardWidth / paperW * 100}%`, height: `${cardHeight / paperH * 100}%`
          }}><Preview card={card} back={sheet.back} /></div>)}
          {settings.cut && sheet.slots.flatMap(({ x, y }) => cutSegments(x, y)).map(([x1, y1, x2, y2], i) => <i key={i} className="cut" style={{
            left: `${x1 / paperW * 100}%`, top: `${y1 / paperH * 100}%`,
            width: x1 === x2 ? '1px' : `${(x2 - x1) / paperW * 100}%`, height: y1 === y2 ? '1px' : `${(y2 - y1) / paperH * 100}%`
          }} />)}
        </div>
      </div>}
    </div>
    <div className="dialog-actions">
      <button className="primary" disabled={!sheets.length || working} onClick={() => void exportPdf()}>Salva PDF</button>
    </div>
  </>;
}
