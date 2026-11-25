import { useRef, useState } from 'react';
import { errorMessage } from '../shared/i18n.js';
import { manaFiles } from '../shared/mana-catalog.js';
import { assetURL } from '../shared/model.js';
import type { SymbolStyle, TemplateAppearance } from '../shared/model.js';
import { colorTransition, defaultSymbolTextColor, splitSymbolColor } from './card-colors.js';
import { importFrameArtwork } from './frame-artwork.js';
import { useI18n } from './i18n.js';
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
  const splitColor = splitSymbolColor(symbol, overrides);
  const token = '{' + symbol + '}';

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
    <label>{t('symbol')}<Select aria-label={t('symbol')} disabled={uploading} value={symbol} onChange={event => {
      setSymbol(event.target.value);
      setError('');
    }}>
      {symbols.map(item => <option key={item} value={item}>{(overrides?.[item]?.asset ||
        (overrides?.[item]?.textColor && !splitSymbolColor(item)))
        ? t('customizedSymbol', { token: '{' + item + '}' })
        : '{' + item + '}'}</option>)}
    </Select></label>
    <div className="symbol-editor-preview">
      <img src={asset ? assetURL(asset) : defaultSymbolURL(symbol)} alt="" width="40" height="40" />
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
      <label className="check"><input type="checkbox" checked={appearance.autoTextColor ?? false}
        onChange={event => {
          const autoTextColor = event.target.checked;
          change(current => ({ ...current, autoTextColor }));
        }} />{t('textColorFromCard')}</label>
      {splitColor ? <div className="symbol-editor-color-row">
        <span>{t('symbolSplitColor', { token })}</span>
        <span className="symbol-color-swatch" aria-hidden="true" style={{
          background: `linear-gradient(to right, ${splitColor[0]} ${colorTransition[0] * 100}%, ${splitColor[1]} ${colorTransition[1] * 100}%)`
        }} />
      </div> : <div className="symbol-editor-color-row">
        <label className="color-field template-color">{t('symbolTextColor', { token })}
          <input type="color" value={textColor ?? defaultSymbolTextColor(symbol)}
            onChange={event => editStyle({ textColor: event.target.value })} />
        </label>
        <button type="button" className="icon-button" aria-label={t('restoreSymbolTextColor')} title={t('restoreSymbolTextColor')}
          disabled={!textColor} onClick={() => editStyle({ textColor: undefined })}><Icon name="reset" size={16} /></button>
      </div>}
    </div>
  </fieldset>;
}
