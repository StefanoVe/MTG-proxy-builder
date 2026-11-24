import { useState } from 'react';
import { assetURL, defaultZones, frameColorNames, frameColors, frameSetAssetsSchema } from '../shared/model.js';
import type { FrameColor, FrameSet } from '../shared/model.js';
import { pngArtZone } from './compose.js';

export function FrameSets({ sets, active, count, save }: {
  sets: FrameSet[]; active?: string; count: number; save: (set: FrameSet, apply: boolean) => void;
}) {
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
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const parsed = frameSetAssetsSchema.safeParse(assets);
    if (!parsed.success || !name.trim()) return;
    if (sets.some(set => set.id !== id && set.name.localeCompare(name.trim(), 'it', { sensitivity: 'base' }) === 0)) {
      setError('Esiste già un set con questo nome.');
      return;
    }
    if (!existing && sets.length >= 200) {
      setError('Il progetto può contenere al massimo 200 set.');
      return;
    }
    setBusy(true);
    const zone = existing ? undefined : await pngArtZone(parsed.data.C).catch(() => undefined);
    const zones = existing?.zones ?? { ...defaultZones, ...(zone ? { art: zone } : {}) };
    save({ id: id || crypto.randomUUID(), name: name.trim(), assets: parsed.data, mix, zones }, apply && count > 0);
  }

  return <form className="frame-set-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    {sets.length > 0 && <label>Set di cornici<select value={id} disabled={busy} onChange={event => choose(event.target.value)}>
      <option value="">Nuovo set</option>
      {sets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
    </select></label>}
    <label>Nome del set<input value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <p className="muted">Usa sei PNG trasparenti con le stesse proporzioni e le zone della carta allineate.</p>
    <div className="frame-set-grid">
      {frameColors.map(color => <div key={color}>
        {assets[color] && <img src={assetURL(assets[color])} alt="" />}
        <button type="button" disabled={busy} onClick={() => void importColor(color)}
          aria-label={`${assets[color] ? 'Sostituisci' : 'Carica'} ${frameColorNames[color]}`}>
          <strong>{frameColorNames[color]}</strong>
          <small>{assets[color] ? 'PNG caricato' : 'Scegli PNG'}</small>
        </button>
      </div>)}
    </div>
    <label className="check"><input type="checkbox" checked={mix} disabled={busy} onChange={event => setMix(event.target.checked)} />Miscela i colori delle carte multicolore</label>
    {!mix && <p className="muted">Le carte multicolore usano la cornice incolore.</p>}
    {!!count && <label className="check"><input type="checkbox" checked={apply} disabled={busy} onChange={event => setApply(event.target.checked)} />
      {count === 1 ? 'Applica a 1 carta' : `Applica a ${count} carte`}
    </label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="primary" disabled={busy || !ready || !name.trim()}>
      {apply && count ? 'Salva e applica' : 'Salva set'}
    </button></div>
  </form>;
}
