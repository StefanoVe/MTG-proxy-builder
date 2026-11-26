import { useId, useState } from 'react';
import { errorMessage } from '../shared/i18n.js';
import { manaFiles } from '../shared/mana-catalog.js';
import { assetURL } from '../shared/model.js';
import type { SymbolOverrides, SymbolStyle, TemplateAppearance } from '../shared/model.js';
import { importFrameArtwork } from './frame-artwork.js';
import { useI18n } from './i18n.js';
import { Icon } from './Icon.js';
import { ImageDropzone } from './ImageDropzone.js';
import { defaultSymbolURL } from './mana-icons.js';
import './symbols.css';

const colorSymbols = ['W', 'U', 'B', 'R', 'G', 'C'];
const symbols = [...new Set([...colorSymbols, ...Object.keys(manaFiles)])];
const numbersAndVariables = /^(\d+|X|Y|Z|½|∞)$/;

const groups = [
  { id: 'colors', label: 'symbolGroupColors' },
  { id: 'numbers', label: 'symbolGroupNumbers' },
  { id: 'hybrid', label: 'symbolGroupHybrid' },
  { id: 'phyrexian', label: 'symbolGroupPhyrexian' },
  { id: 'special', label: 'symbolGroupSpecial' }
] as const;

function groupOf(token: string) {
  if (colorSymbols.includes(token)) return 'colors';
  if (numbersAndVariables.test(token)) return 'numbers';
  if (token === 'P' || token.endsWith('/P')) return 'phyrexian';
  if (token.includes('/') && !token.includes('P') && !token.startsWith('C/') && !token.startsWith('2/')) return 'hybrid';
  return 'special';
}

const symbolGroups = groups.map(group => ({
  ...group, tokens: symbols.filter(token => groupOf(token) === group.id)
})).filter(group => group.tokens.length);

/** The image shown for a symbol: the custom asset when there is one, otherwise the default artwork. */
export function symbolImageURL(overrides: SymbolOverrides | undefined, symbol: string) {
  const custom = overrides?.[symbol]?.asset;
  return custom ? assetURL(custom) : defaultSymbolURL(symbol);
}

/** How many symbols use a custom image. */
export function customSymbolCount(appearance: TemplateAppearance) {
  return Object.values(appearance.symbolOverrides ?? {}).filter(style => style?.asset).length;
}

export function SymbolEditor({ appearance, change }: {
  appearance: TemplateAppearance;
  change: (update: (appearance: TemplateAppearance) => TemplateAppearance) => void;
}) {
  const { t, locale } = useI18n();
  const searchId = useId();
  const customId = useId();
  const [symbol, setSymbol] = useState(symbols[0]);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const overrides = appearance.symbolOverrides;
  const asset = overrides?.[symbol]?.asset;
  const token = '{' + symbol + '}';
  const needle = query.replace(/[{}\s]/g, '').toLowerCase();
  const visibleGroups = symbolGroups.map(group => ({
    ...group, tokens: needle ? group.tokens.filter(item => item.toLowerCase().includes(needle)) : group.tokens
  })).filter(group => group.tokens.length);

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
    <div className="symbol-search">
      <Icon name="search" size={16} />
      <input id={searchId} type="search" value={query} placeholder={t('symbolSearch')} aria-label={t('symbolSearch')}
        onChange={event => setQuery(event.target.value)} />
    </div>
    <div className="symbol-groups">
      {visibleGroups.map(group => <section key={group.id} className="symbol-group" aria-label={t(group.label)}>
        <h4>{t(group.label)}</h4>
        <div className="symbol-grid">
          {group.tokens.map(item => <button key={item} type="button" className="symbol-tile" disabled={uploading}
            aria-label={t('symbolButtonLabel', { token: '{' + item + '}' })} aria-pressed={item === symbol}
            aria-describedby={overrides?.[item]?.asset ? customId : undefined}
            title={'{' + item + '}'} onClick={() => { setSymbol(item); setError(''); }}>
            <img src={symbolImageURL(overrides, item)} alt="" width="24" height="24" loading="lazy" />
            {overrides?.[item]?.asset && <span className="symbol-tile-dot" aria-hidden="true" />}
          </button>)}
        </div>
      </section>)}
      {!visibleGroups.length && <p className="symbol-empty">{t('symbolNoResults')}</p>}
    </div>
    <div className="symbol-editor-selected">
      <div className="symbol-editor-preview">
        <img src={symbolImageURL(overrides, symbol)} alt="" width="48" height="48" />
        <span className="symbol-editor-token">{token}</span>
        {asset && <button type="button" disabled={uploading} onClick={() => { setError(''); editStyle({ asset: undefined }); }}>
          {t('restoreSymbolImage')}
        </button>}
      </div>
      <ImageDropzone compact label={t('symbolReplaceImage')} help={t('symbolImageHelp')} busy={uploading}
        onFiles={files => { if (files[0]) void upload(files[0]); }} />
    </div>
    <span id={customId} hidden>{t('symbolCustomized')}</span>
    {error && <p className="error" role="alert">{error}</p>}
  </fieldset>;
}
