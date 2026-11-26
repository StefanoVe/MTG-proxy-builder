import { Select } from './Select.js';
import { errorMessage } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useMemo, useState } from 'react';
import { assetURL, createProject, defaultCrop } from '../shared/model.js';
import type { Card, FrameSet, Preset, TemplateAppearance } from '../shared/model.js';
import { hasOverride, matchBatch } from '../shared/deck.js';
import type { BatchRow } from '../shared/deck.js';
import { FramePicker, choiceFrame, frameChoices } from './FramePicker.js';
import type { FrameChoice } from './FramePicker.js';
import './deck-frame.css';

export function Batch({ cards, selectionCount, hiddenSelectionCount, sharedFrame, presets, frameSets, fullArtBase, apply, close }: {
  cards: Card[]; selectionCount: number; hiddenSelectionCount: number; sharedFrame: boolean; presets: Preset[]; frameSets: FrameSet[];
  fullArtBase?: TemplateAppearance; apply: (cards: Card[]) => void; close: () => void;
}) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<'art' | 'frame'>('art');
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [choice, setChoice] = useState<FrameChoice>();
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 24;
  const eligible = cards.filter(card => card.source.editable);
  const selected = rows.filter(row => row.accept && row.cardId);
  const collisions = new Set(selected.map(row => row.cardId)).size !== selected.length;

  // Printings need a catalog card with an original scan; the option is hidden when no card has one.
  const hasPrinting = eligible.some(card => !!card.source.printingId);
  const frameProject = useMemo(() => ({ ...createProject(''), frameSets, presets, fullArtBase }), [frameSets, presets, fullArtBase]);
  const choices = frameChoices(frameProject, { printing: hasPrinting });
  const chosenFrame = choice ? choiceFrame(choice, frameProject) : undefined;
  const fits = (card: Card) => !card.frameMirror && (choice?.kind !== 'printing' || !!card.source.printingId);
  const frameCards = eligible.filter(card => fits(card) && (overwrite || !hasOverride(card, 'frame')));
  const skipped = overwrite ? 0 : eligible.filter(card => fits(card) && hasOverride(card, 'frame')).length;
  const count = kind === 'frame' ? (chosenFrame ? frameCards.length : 0) : selected.length;

  async function load(mode: 'files' | 'folder') {
    if (kind === 'frame') return;
    setLoading(true);
    try {
      const result = await window.proxy.images(mode, false);
      if (!result.assets.length && !result.errors.length) return;
      setPage(0);
      setRows(matchBatch(result.assets, eligible, 'art'));
      setErrors(result.errors);
    } catch (error) {
      setErrors([errorMessage(error, locale)]);
    } finally {
      setLoading(false);
    }
  }
  function update(index: number, patch: Partial<BatchRow>) {
    setRows(value => value.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  function submit() {
    if (!count || collisions) return;
    if (kind === 'frame') {
      if (chosenFrame) apply(frameCards.map(card => ({ ...card, frame: chosenFrame, ...(sharedFrame && { frameOverride: true }) })));
      return;
    }
    const map = new Map(selected.map(row => [row.cardId, row.asset]));
    apply(eligible.flatMap(card => {
      const asset = map.get(card.id);
      if (!asset) return [];
      return [{ ...card, art: asset.id, crop: defaultCrop }];
    }));
  }

  return <>
    <div>
      <p><strong>{selectionCount
        ? t(selectionCount === 1 ? 'batchSelectedOne' : 'batchSelected', { count: selectionCount })
        : t(cards.length === 1 ? 'batchWholeDeckOne' : 'batchWholeDeck', { count: cards.length })}</strong>
        {hiddenSelectionCount > 0 && <> · {t(hiddenSelectionCount === 1 ? 'hiddenSelectionCountOne' : 'hiddenSelectionCount', { count: hiddenSelectionCount })}</>}
      </p>
      {eligible.length !== cards.length && <p className="muted">{t(eligible.length === 1 ? 'eligibleCardsOne' : 'eligibleCards', { count: eligible.length, total: cards.length })}</p>}
    </div>
    <div className="form-row batch-options">
      <label>{t('batchMode')}<Select value={kind} disabled={loading} onChange={event => {
        setKind(event.target.value as typeof kind); setRows([]); setErrors([]);
      }}>
        <option value="art">{t('matchArtByName')}</option>
        <option value="frame">{t('oneFrameForAll')}</option>
      </Select></label>
      {kind === 'art' && <div className="button-group">
        <button disabled={loading} onClick={() => void load('files')}>{t('chooseFiles')}</button>
        <button disabled={loading} onClick={() => void load('folder')}>{t('chooseFolder')}</button>
      </div>}
    </div>
    {kind === 'frame' ? <>
      <FramePicker label={t('batchFrameToApply')} project={frameProject} sample={eligible[0]} choices={choices} value={choice}
        onChange={setChoice} footer={sharedFrame ? <p className="muted batch-frame-note">{t('batchSharedFrameNote')}</p> : undefined} />
      <label className="check"><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} />{t('replaceEditedFrames')}</label>
      {skipped > 0 && <p className="muted batch-frame-note">{t(skipped === 1 ? 'batchSkipEditedFramesOne' : 'batchSkipEditedFrames', { count: skipped })}</p>}
    </> : <>
      {loading && <p role="status">{t('readingImages')}</p>}
      {rows.length > pageSize && <div className="pager">
        <button disabled={page === 0} aria-label={t('previousMatches')} onClick={() => setPage(page - 1)}>‹</button>
        <span>{t('fileRange', { first: page * pageSize + 1, last: Math.min(rows.length, (page + 1) * pageSize), total: rows.length })}</span>
        <button disabled={(page + 1) * pageSize >= rows.length} aria-label={t('nextMatches')} onClick={() => setPage(page + 1)}>›</button>
      </div>}
      {rows.length > 0 && <div className="batch-table" aria-label={t('imageMatches')}>
        {rows.slice(page * pageSize, (page + 1) * pageSize).map((row, offset) => {
          const index = page * pageSize + offset;
          const card = eligible.find(item => item.id === row.cardId);
          return <div className="batch-row" key={index}>
            <img src={assetURL(row.asset.id)} alt="" />
            <span className="filename" title={row.asset.name}>{row.asset.name}</span>
            <Select aria-label={t('cardForFile', { name: row.asset.name })} value={row.cardId} onChange={event => update(index, { cardId: event.target.value, accept: false })}>
              <option value="">{t('unmatched')}</option>
              {eligible.map(item => <option key={item.id} value={item.id}>{item.fields.name}{item.source.set ? ` (${item.source.set.toUpperCase()} ${item.source.number})` : ''}</option>)}
            </Select>
            <label className="check"><input type="checkbox" disabled={!card} checked={row.accept} onChange={event => update(index, { accept: event.target.checked })} />
              {card && hasOverride(card, 'art') ? t('replace') : t('apply')}
            </label>
          </div>;
        })}
      </div>}

      {collisions && <p className="error" role="alert">{t('oneFilePerCard')}</p>}
    </>}
    {errors.length > 0 && <ul className="error messages">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    <div className="dialog-actions">
      <button onClick={close}>{t('cancel')}</button>
      <button className="primary" disabled={!count || collisions || loading} onClick={submit}>
        {kind === 'frame' && !chosenFrame ? t('chooseAFrame') : t(count === 1 ? 'applyCountOne' : 'applyCount', { count })}
      </button>
    </div>
  </>;
}
