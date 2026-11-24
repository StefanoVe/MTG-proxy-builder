import { errorMessage } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { newTemplate } from '../shared/templates.js';
import { useState } from 'react';
import { assetURL, defaultCrop, isTemplate, templateNames } from '../shared/model.js';
import type { Card, FrameSet, Preset, TemplateAppearance } from '../shared/model.js';
import { hasOverride, matchBatch } from '../shared/deck.js';
import type { BatchRow } from '../shared/deck.js';

export function Batch({ cards, presets, frameSets, fullArtBase, apply, close }: {
  cards: Card[]; presets: Preset[]; frameSets: FrameSet[]; fullArtBase?: TemplateAppearance; apply: (cards: Card[]) => void; close: () => void;
}) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<'art' | 'preset'>('art');
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [preset, setPreset] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 24;
  const eligible = cards.filter(card => card.source.editable);
  const selected = rows.filter(row => row.accept && row.cardId);
  const collisions = new Set(selected.map(row => row.cardId)).size !== selected.length;
  const presetCards = eligible.filter(card => overwrite || !hasOverride(card, 'frame'));
  const chosenPreset = presets.find(item => item.id === preset);
  const chosenSet = frameSets.find(item => item.id === preset);
  const sharedFrame: Card['frame'] | undefined = isTemplate(preset) ? newTemplate(preset, fullArtBase)
    : chosenSet ? { kind: 'color-set', set: chosenSet }
    : chosenPreset ? { kind: 'custom', asset: chosenPreset.asset, zones: chosenPreset.zones,
      textColor: chosenPreset.textColor, fontFamily: chosenPreset.fontFamily } : undefined;
  const count = kind === 'preset' ? (sharedFrame ? presetCards.length : 0) : selected.length;

  async function load(mode: 'files' | 'folder') {
    if (kind === 'preset') return;
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
    if (kind === 'preset') {
      if (sharedFrame) apply(presetCards.map(card => ({ ...card, frame: sharedFrame })));
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
    <p className="muted">{t(eligible.length === 1 ? 'eligibleCardsOne' : 'eligibleCards', { count: eligible.length, total: cards.length })}</p>
    <div className="form-row batch-options">
      <label>{t('apply')}<select value={kind} disabled={loading} onChange={event => {
        setKind(event.target.value as typeof kind); setRows([]); setErrors([]);
      }}>
        <option value="art">{t('matchArtByName')}</option>
        <option value="preset">{t('oneFrameForAll')}</option>
      </select></label>
      {kind !== 'preset' && <div className="button-group">
        <button disabled={loading} onClick={() => void load('files')}>{t('chooseFiles')}</button>
        <button disabled={loading} onClick={() => void load('folder')}>{t('chooseFolder')}</button>
      </div>}
    </div>
    {kind === 'preset' ? <>
      <label>{t('templatePresetSet')}<select value={preset} onChange={event => setPreset(event.target.value)}>
        <option value="">{t('chooseAFrame')}</option>
        {(Object.keys(templateNames)).filter(isTemplate).map(template =>
          <option key={template} value={template}>{t(templateNames[template])}</option>)}
        {frameSets.length > 0 && <optgroup label={t('automaticColorSets')}>
          {frameSets.map(set => <option value={set.id} key={set.id}>{set.name}</option>)}
        </optgroup>}
        {presets.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label className="check"><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} />{t('replaceEditedFrames')}</label>
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
            <select aria-label={t('cardForFile', { name: row.asset.name })} value={row.cardId} onChange={event => update(index, { cardId: event.target.value, accept: false })}>
              <option value="">{t('unmatched')}</option>
              {eligible.map(item => <option key={item.id} value={item.id}>{item.fields.name}{item.source.set ? ` (${item.source.set.toUpperCase()} ${item.source.number})` : ''}</option>)}
            </select>
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
      <button className="primary" disabled={!count || collisions || loading} onClick={submit}>{t(count === 1 ? 'applyCountOne' : 'applyCount', { count })}</button>
    </div>
  </>;
}
