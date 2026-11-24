import { useState } from 'react';
import { styles } from '../shared/model.js';
import type { Printing, PrintingStyle } from '../shared/model.js';

const names: Record<PrintingStyle, string> = {
  modern: 'Moderna', retro: 'Retrò', showcase: 'Showcase', borderless: 'Senza bordo', 'full-art': 'Full art', other: 'Altre'
};
const pageSize = 24;

export function FrameGallery({ editions, active, pending, hasArt, select }: {
  editions: Printing[]; active?: string; pending: boolean; hasArt: boolean; select: (printing: Printing, keepArt: boolean) => void;
}) {
  const [style, setStyle] = useState<PrintingStyle | ''>('');
  const [page, setPage] = useState(0);
  const [keepArt, setKeepArt] = useState(hasArt);
  const available = styles.filter(style => editions.some(item => (item.style ?? 'other') === style));
  const frames = style ? editions.filter(item => (item.style ?? 'other') === style) : editions;
  const visible = frames.slice(page * pageSize, (page + 1) * pageSize);

  if (!editions.length) return pending ? <p role="status">Caricamento cornici…</p> : null;
  return <>
    <div className="gallery-filters">
      <label>Stile della cornice<select value={style} onChange={event => {
        setStyle(event.target.value as typeof style);
        setPage(0);
      }}>
        <option value="">Tutti gli stili</option>
        {available.map(style => <option key={style} value={style}>{names[style]}</option>)}
      </select></label>
      {hasArt && <label className="check"><input type="checkbox" checked={keepArt} onChange={event => setKeepArt(event.target.checked)} />Mantieni l’illustrazione attuale</label>}
    </div>
    {frames.length > pageSize && <div className="pager">
      <button disabled={!page || pending} aria-label="Cornici precedenti" onClick={() => setPage(page - 1)}>‹</button>
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, frames.length)} di {frames.length}</span>
      <button disabled={(page + 1) * pageSize >= frames.length || pending} aria-label="Cornici successive" onClick={() => setPage(page + 1)}>›</button>
    </div>}
    <div className="frame-gallery">
      {visible.map(edition => <button key={edition.id} disabled={pending} onClick={() => select(edition, keepArt)}
        aria-label={`Usa cornice ${edition.setName} ${edition.number} ${edition.lang.toUpperCase()}`}
        aria-current={edition.id === active ? 'true' : undefined}>
        {edition.thumbnail && <img loading="lazy" src={edition.thumbnail} alt="" />}
        <strong>{edition.setName}</strong>
        <small>{names[edition.style ?? 'other']} · {edition.set.toUpperCase()} {edition.number} · {edition.lang.toUpperCase()}</small>
      </button>)}
    </div>

  </>;
}
