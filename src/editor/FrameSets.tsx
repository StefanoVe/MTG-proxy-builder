import { errorMessage } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { useId, useState } from 'react';
import { assetURL, defaultZones, frameColorNames, frameColors, frameSetAssetsSchema } from '../shared/model.js';
import type { FrameColor, FrameSet } from '../shared/model.js';
import { pngArtZone } from './compose.js';
import { ImageDropzone } from './ImageDropzone.js';
import { colorForFileName } from './frame-file-names.js';
import './framesets.css';

export function FrameSets({ sets, existing, count, scope = 'deck', save }: {
  sets: FrameSet[]; existing?: FrameSet; count: number; scope?: 'selection' | 'deck';
  save: (set: FrameSet, apply: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [name, setName] = useState(existing?.name ?? '');
  const [assets, setAssets] = useState<Partial<FrameSet['assets']>>(existing?.assets ?? {});
  const [mix, setMix] = useState(existing?.mix ?? true);
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonId = useId();
  // A set needs at least one image; missing colors fall back to colorless, then to the first available image.
  const ready = frameColors.some(color => assets[color]);
  const canSave = ready && !!name.trim();
  const missing = frameColors.filter(color => !assets[color]);
  const missingNames = missing.map(color => t(frameColorNames[color])).join(', ');

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

  async function importFiles(files: File[]) {
    setBusy(true);
    setError('');
    const planned: Array<{ file: File; color: FrameColor }> = [];
    const unrecognized: string[] = [];
    for (const file of files) {
      const color = colorForFileName(file.name);
      if (color) planned.push({ file, color });
      else if (files.length === 1) planned.push({ file, color: 'C' });
      else unrecognized.push(file.name);
    }
    const loaded: Partial<FrameSet['assets']> = {};
    let failure = '';
    try {
      for (const { file, color } of planned) {
        const asset = await window.proxy.dropped(new Uint8Array(await file.arrayBuffer()), file.name, true);
        loaded[color] = asset.id;
      }
    } catch (cause) {
      failure = errorMessage(cause, locale);
    }
    if (Object.keys(loaded).length) setAssets(current => ({ ...current, ...loaded }));
    const problems = [failure, unrecognized.length ? t('unmatchedFrameFiles', { names: unrecognized.join(', ') }) : '']
      .filter(Boolean);
    setError(problems.join(' '));
    setBusy(false);
  }

  function removeColor(color: FrameColor) {
    setAssets(current => {
      const next = { ...current };
      delete next[color];
      return next;
    });
  }

  function fallbackNote(color: FrameColor) {
    if (!ready || assets[color]) return undefined;
    return assets.C ? t('usesColorless') : t('usesFirstAvailable');
  }

  async function submit() {
    const parsed = frameSetAssetsSchema.safeParse(assets);
    if (!parsed.success || !name.trim()) return;
    if (sets.some(set => set.id !== existing?.id && set.name.localeCompare(name.trim(), locale, { sensitivity: 'base' }) === 0)) {
      setError(t('duplicateSet'));
      return;
    }
    if (!existing && sets.length >= 200) {
      setError(t('setLimit'));
      return;
    }
    setBusy(true);
    const zone = existing ? undefined : await pngArtZone((parsed.data.C ?? Object.values(parsed.data).find(Boolean))!).catch(() => undefined);
    const zones = existing?.zones ?? { ...defaultZones, ...(zone ? { art: zone } : {}) };
    save({ ...existing, id: existing?.id ?? crypto.randomUUID(), name: name.trim(), assets: parsed.data, mix, zones }, apply && count > 0);
    setBusy(false);
  }

  const applyKey = scope === 'selection'
    ? (count === 1 ? 'applySelectedOne' : 'applySelectedCount')
    : (count === 1 ? 'applyDeckOne' : 'applyDeckCount');

  return <form className="frame-set-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <label>{t('setName')}<input value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <p className="muted">{t('setPngHelp')}</p>
    <ImageDropzone multiple accept=".png,image/png" disabled={busy} busy={busy} compact
      label={t('dropFrameImages')} help={t('dropFrameImagesHelp')} onFiles={files => void importFiles(files)} />
    <div className="frame-set-grid">
      {frameColors.map(color => <div key={color} className="frame-set-slot">
        {assets[color] && <img src={assetURL(assets[color])} alt="" />}
        <div className="frame-set-slot-body">
          <button type="button" disabled={busy} onClick={() => void importColor(color)}
            aria-label={t(assets[color] ? 'replaceFrameColor' : 'uploadFrameColor', { color: t(frameColorNames[color]) })}>
            <strong>{t(frameColorNames[color])}</strong>
            <small>{assets[color] ? t('pngLoaded') : t('choosePng')}</small>
          </button>
          {assets[color] && <button type="button" className="frame-set-remove" disabled={busy}
            aria-label={t('removeFrameColor', { color: t(frameColorNames[color]) })} onClick={() => removeColor(color)}>
            {t('removeImage')}
          </button>}
          {fallbackNote(color) && <small className="muted frame-set-fallback">{fallbackNote(color)}</small>}
        </div>
      </div>)}
    </div>
    {ready && missing.length > 0 && <p className="muted frame-set-note">{assets.C
      ? t('frameSetMissingColorless', { colors: missingNames })
      : t('frameSetMissingFirst', { colors: missingNames })}</p>}
    <label className="check"><input type="checkbox" checked={mix} disabled={busy} onChange={event => setMix(event.target.checked)} />{t('mixColors')}</label>
    {!mix && <p className="muted">{t('colorlessFrameHelp')}</p>}
    {!!count && <label className="check"><input type="checkbox" checked={apply} disabled={busy} onChange={event => setApply(event.target.checked)} />
      {t(applyKey, { count })}
    </label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-actions frame-set-actions">
      {!canSave && <small id={reasonId} className="muted frame-set-reason">{t('frameSetNeedsImage')}</small>}
      <button className="primary" disabled={busy || !canSave} aria-describedby={canSave ? undefined : reasonId}>
        {apply && count ? t('saveApply') : t('saveSet')}
      </button>
    </div>
  </form>;
}
