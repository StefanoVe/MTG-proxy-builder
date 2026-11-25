import { useRef, useState } from 'react';
import { errorMessage } from '../shared/i18n.js';
import { manaFiles } from '../shared/mana-catalog.js';
import { assetURL } from '../shared/model.js';
import type { SymbolStyle, TemplateAppearance } from '../shared/model.js';
import { colorStops, symbolPaint } from './card-colors.js';
import { manaComponents } from '../shared/mana.js';
import { importFrameArtwork } from './frame-artwork.js';
import { useI18n } from './i18n.js';
import { CardTextColorControls } from './CardTextColorControls.js';
import { Icon } from './Icon.js';
import { defaultSymbolURL } from './mana-icons.js';
import { Select } from './Select.js';

const symbols = [...new Set(['W', 'U', 'B', 'R', 'G', 'C', ...Object.keys(manaFiles)])];

export function SymbolEditor({ appearance, change }: {
  appearance: TemplateAppearance;
  change: (update: (appearance: TemplateAppearance) => TemplateAppearance) => void;
}) {
  const { t, locale } = useI18n();
  const [symbol, setSymbol] = useState(symbols[0]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const overrides = appearance.symbolOverrides;
  const { asset, textColor } = overrides?.[symbol] ?? {};
  const paint = symbolPaint(symbol, overrides);
  const components = manaComponents(symbol);
  const token = '{' + symbol + '}';
  const symbolImage = (item: string) => {
    const custom = overrides?.[item]?.asset;
    return custom ? assetURL(custom) : defaultSymbolURL(item);
  };

  function editStyle(values: Partial<SymbolStyle>) {
    change(current => {
      const symbolOverrides = { ...current.symbolOverrides };
      const style = { ...symbolOverrides[symbol], ...values };
      if (style.asset || style.textColor) symbolOverrides[symbol] = style;
      else delete symbolOverrides[symbol];
      return { ...current, symbolOverrides: Object.keys(symbolOverrides).length ? symbolOverrides : undefined };
    });
  }

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const imported = await importFrameArtwork(file, { width: 512, height: 512 });
      editStyle({ asset: imported.id });
    } catch (failure) {
      setError(failure instanceof Error ? errorMessage(failure, locale) : t('symbolImportFailed'));
    } finally {
      setUploading(false);
    }
  }

  return <fieldset className="template-settings symbol-editor" aria-label={t('symbols')}>
    <label>{t('symbol')}<Select aria-label={t('symbol')} disabled={uploading} value={symbol}
      renderOption={(item, label) => <span className="symbol-option">
        <img src={symbolImage(item)} alt="" width="20" height="20" loading="lazy" />
        <span>{label}</span>
      </span>} onChange={event => {
      setSymbol(event.target.value);
      setError('');
    }}>
      {symbols.map(item => <option key={item} value={item}>{(overrides?.[item]?.asset ||
        (overrides?.[item]?.textColor && manaComponents(item).length === 1))
        ? t('customizedSymbol', { token: '{' + item + '}' })
        : '{' + item + '}'}</option>)}
    </Select></label>
    <div className="symbol-editor-preview">
      <img src={symbolImage(symbol)} alt="" width="40" height="40" />
      <button type="button" disabled={uploading} onClick={() => input.current?.click()}>
        <Icon name={asset ? 'art' : 'add'} size={16} />{' '}{t(uploading ? 'symbolImporting' : asset ? 'replaceSymbolImage' : 'addSymbolImage')}
      </button>
      {asset && <button type="button" disabled={uploading} onClick={() => { setError(''); editStyle({ asset: undefined }); }}>
        {t('restoreSymbolImage')}
      </button>}
    </div>
    <input ref={input} type="file" hidden accept=".svg,.png,image/svg+xml,image/png" aria-label={t('symbolFile')} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void upload(file);
    }} />
    {error && <p className="error" role="alert">{error}</p>}
    <div className="symbol-editor-color">
      <CardTextColorControls appearance={appearance} change={change} />
      {typeof paint !== 'string' ? <div className="symbol-editor-color-row">
        <span>{t('symbolSplitColor', { token, components: components.map(part => '{' + part + '}').join(' / ') })}</span>
        <span className="symbol-color-swatch" aria-hidden="true" style={{
          background: `linear-gradient(to right, ${colorStops(paint).map(([stop, color]) => `${color} ${stop * 100}%`).join(', ')})`
        }} />
      </div> : <div className="symbol-editor-color-row">
        <label className="color-field template-color">{t('symbolTextColor', { token })}
          <input type="color" value={paint}
            onChange={event => editStyle({ textColor: event.target.value })} />
        </label>
        <button type="button" className="icon-button" aria-label={t('restoreSymbolTextColor')} title={t('restoreSymbolTextColor')}
          disabled={!textColor} onClick={() => editStyle({ textColor: undefined })}><Icon name="reset" size={16} /></button>
      </div>}
    </div>
  </fieldset>;
}
