import { errorMessage } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useState } from 'react';
import { assetURL, defaultZones, frameColorNames, frameColors, frameSetAssetsSchema } from '../shared/model.js';
import type { FrameColor, FrameSet } from '../shared/model.js';
import { pngArtZone } from './compose.js';

export function FrameSets({ sets, active, count, save }: {
  sets: FrameSet[]; active?: string; count: number; save: (set: FrameSet, apply: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const initial = sets.find(set => set.id === active);
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [assets, setAssets] = useState<Partial<FrameSet['assets']>>(initial?.assets ?? {});
  const [mix, setMix] = useState(initial?.mix ?? true);
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = sets.find(set => set.id === id);
  const ready = frameColors.every(color => assets[color]);

  function choose(id: string) {
    const selected = sets.find(set => set.id === id);
    setId(id);
    setName(selected?.name ?? '');
    setAssets(selected?.assets ?? {});
    setMix(selected?.mix ?? true);
    setError('');
  }

  async function importColor(color: FrameColor) {
    setBusy(true);
    setError('');
    try {
      const { assets: loaded, errors } = await window.proxy.images('single', true);
      if (errors.length) setError(errors[0]);
      if (loaded[0]) setAssets(current => ({ ...current, [color]: loaded[0].id }));
    } catch (cause) {
      setError(errorMessage(cause, locale));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const parsed = frameSetAssetsSchema.safeParse(assets);
    if (!parsed.success || !name.trim()) return;
    if (sets.some(set => set.id !== id && set.name.localeCompare(name.trim(), 'it', { sensitivity: 'base' }) === 0)) {
      setError(t('duplicateSet'));
      return;
    }
    if (!existing && sets.length >= 200) {
      setError(t('setLimit'));
      return;
    }
    setBusy(true);
    const zone = existing ? undefined : await pngArtZone(parsed.data.C).catch(() => undefined);
    const zones = existing?.zones ?? { ...defaultZones, ...(zone ? { art: zone } : {}) };
    save({ ...existing, id: id || crypto.randomUUID(), name: name.trim(), assets: parsed.data, mix, zones }, apply && count > 0);
  }

  return <form className="frame-set-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    {sets.length > 0 && <label>{t('frameSets')}<select value={id} disabled={busy} onChange={event => choose(event.target.value)}>
      <option value="">{t('newSet')}</option>
      {sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
    </select></label>}
    <label>{t('setName')}<input value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <p className="muted">{t('setPngHelp')}</p>
    <div className="frame-set-grid">
      {frameColors.map(color => <div key={color}>
        {assets[color] && <img src={assetURL(assets[color])} alt="" />}
        <button type="button" disabled={busy} onClick={() => void importColor(color)}
          aria-label={t(assets[color] ? 'replaceFrameColor' : 'uploadFrameColor', { color: t(frameColorNames[color]) })}>
          <strong>{t(frameColorNames[color])}</strong>
          <small>{assets[color] ? t('pngLoaded') : t('choosePng')}</small>
        </button>
      </div>)}
    </div>
    <label className="check"><input type="checkbox" checked={mix} disabled={busy} onChange={event => setMix(event.target.checked)} />{t('mixColors')}</label>
    {!mix && <p className="muted">{t('colorlessFrameHelp')}</p>}
    {!!count && <label className="check"><input type="checkbox" checked={apply} disabled={busy} onChange={event => setApply(event.target.checked)} />
      {t(count === 1 ? 'applyCountOne' : 'applyCount', { count })}
    </label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="primary" disabled={busy || !ready || !name.trim()}>
      {apply && count ? t('saveApply') : t('saveSet')}
    </button></div>
  </form>;
}
