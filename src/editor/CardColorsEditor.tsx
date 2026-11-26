import type { TemplateAppearance } from '../shared/model.js';
import { defaultSymbolTextColor } from './card-colors.js';
import { useI18n } from './i18n.js';
import { OptionalColor } from './OptionalColor.js';
import { symbolImageURL } from './SymbolEditor.js';
import './symbols.css';

const identities = [
  { symbol: 'W', name: 'white' },
  { symbol: 'U', name: 'blue' },
  { symbol: 'B', name: 'black' },
  { symbol: 'R', name: 'red' },
  { symbol: 'G', name: 'green' },
  { symbol: 'C', name: 'colorless' }
] as const;

/** How many card identities have a custom color. */
export function customCardColorCount(appearance: TemplateAppearance) {
  return identities.filter(({ symbol }) => appearance.symbolOverrides?.[symbol]?.textColor).length;
}

export function CardColorsEditor({ appearance, change }: {
  appearance: TemplateAppearance;
  change: (update: (appearance: TemplateAppearance) => TemplateAppearance) => void;
}) {
  const { t } = useI18n();
  const overrides = appearance.symbolOverrides;

  function setCardColor(symbol: string, textColor: string | undefined) {
    change(current => {
      const symbolOverrides = { ...current.symbolOverrides };
      const style = { ...symbolOverrides[symbol], textColor };
      if (style.asset || style.textColor) symbolOverrides[symbol] = style;
      else delete symbolOverrides[symbol];
      return { ...current, symbolOverrides: Object.keys(symbolOverrides).length ? symbolOverrides : undefined };
    });
  }

  return <fieldset className="template-settings card-colors-editor">
    <legend>{t('cardColorsTitle')}</legend>
    <p className="card-colors-help">{t('cardColorsHelp')}</p>
    {identities.map(({ symbol, name }) => <div className="card-color-row" key={symbol}>
      <img src={symbolImageURL(overrides, symbol)} alt="" width="24" height="24" />
      <OptionalColor label={t(name)} value={overrides?.[symbol]?.textColor} fallback={defaultSymbolTextColor(symbol)}
        autoLabel={t('colorAutomatic')} resetLabel={t('colorUseAutomatic')}
        onChange={value => setCardColor(symbol, value)} />
    </div>)}
  </fieldset>;
}
