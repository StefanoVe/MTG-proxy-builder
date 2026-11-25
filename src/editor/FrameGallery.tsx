import { Select } from './Select.js';
import type { MessageKey } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useState } from 'react';
import { styles } from '../shared/model.js';
import type { Printing, PrintingStyle } from '../shared/model.js';

const names: Record<PrintingStyle, MessageKey> = {
  modern: 'modern', retro: 'retro', showcase: 'showcase', borderless: 'borderless', 'full-art': 'fullArt', other: 'other'
};
const pageSize = 24;

export function FrameGallery({ editions, active, pending, hasArt, select }: {
  editions: Printing[]; active?: string; pending: boolean; hasArt: boolean; select: (printing: Printing, keepArt: boolean) => void;
}) {
  const { t } = useI18n();
  const [style, setStyle] = useState<PrintingStyle | ''>('');
  const [page, setPage] = useState(0);
  const [keepArt, setKeepArt] = useState(hasArt);
  const available = styles.filter(style => editions.some(item => (item.style ?? 'other') === style));
  const frames = style ? editions.filter(item => (item.style ?? 'other') === style) : editions;
  const visible = frames.slice(page * pageSize, (page + 1) * pageSize);

  if (!editions.length) return pending ? <p role="status">{t('loadingFrames')}</p> : null;
  return <>
    <div className="gallery-filters">
      <label>{t('frameStyle')}<Select value={style} onChange={event => {
        setStyle(event.target.value as typeof style);
        setPage(0);
      }}>
        <option value="">{t('allStyles')}</option>
        {available.map(style => <option key={style} value={style}>{t(names[style])}</option>)}
      </Select></label>
      {hasArt && <label className="check"><input type="checkbox" checked={keepArt} onChange={event => setKeepArt(event.target.checked)} />{t('keepArtwork')}</label>}
    </div>
    {frames.length > pageSize && <div className="pager">
      <button disabled={!page || pending} aria-label={t('previousFrames')} onClick={() => setPage(page - 1)}>‹</button>
      <span>{t('itemRange', { first: page * pageSize + 1, last: Math.min((page + 1) * pageSize, frames.length), total: frames.length })}</span>
      <button disabled={(page + 1) * pageSize >= frames.length || pending} aria-label={t('nextFrames')} onClick={() => setPage(page + 1)}>›</button>
    </div>}
    <div className="frame-gallery">
      {visible.map(edition => <button key={edition.id} disabled={pending} onClick={() => select(edition, keepArt)}
        aria-label={t('useFrame', { edition: edition.setName, number: edition.number, language: edition.lang.toUpperCase() })}
        aria-current={edition.id === active ? 'true' : undefined}>
        {edition.thumbnail && <img loading="lazy" src={edition.thumbnail} alt="" />}
        <strong>{edition.setName}</strong>
        <small>{t(names[edition.style ?? 'other'])} · {edition.set.toUpperCase()} {edition.number} · {edition.lang.toUpperCase()}</small>
      </button>)}
    </div>

  </>;
}
