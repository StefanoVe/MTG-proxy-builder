import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useI18n } from './i18n.js';
import './visual-choice.css';

export type VisualOption<T extends string | number> = { value: T; label: string; visual?: ReactNode };

/**
 * A row of visual tiles replacing a slider. When `custom` is given, an exact value can still be typed
 * ("Personalizzato"), so no precision is lost compared with the old slider.
 */
export function VisualChoice<T extends string | number>({ label, value, options, onChange, custom, help, disabled = false }: {
  label: string;
  value: T;
  options: VisualOption<T>[];
  onChange: (value: T) => void;
  /** Only for numeric choices: allows typing an exact value within the range. */
  custom?: { min: number; max: number; step?: number; unit?: string };
  help?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const helpId = useId();
  const matched = options.some(option => option.value === value);
  const [customOpen, setCustomOpen] = useState(!matched);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); if (!matched) setCustomOpen(true); }, [value, matched]);

  function move(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }

  function commit() {
    if (!custom) return;
    // An empty field means "no change": Number('') would silently become 0.
    if (!draft.trim()) { setDraft(String(value)); return; }
    const number = Number(draft.replace(',', '.'));
    if (!Number.isFinite(number)) { setDraft(String(value)); return; }
    if (number === Number(value)) return;
    const clamped = Math.min(custom.max, Math.max(custom.min, number));
    onChange(clamped as T);
    setDraft(String(clamped));
  }

  return <div className={`visual-choice${disabled ? ' is-disabled' : ''}`}>
    <div className="visual-choice-head">
      <span id={labelId} className="visual-choice-label">{label}</span>
      {custom && <button type="button" className="visual-choice-custom-toggle" disabled={disabled} aria-expanded={customOpen}
        onClick={() => setCustomOpen(open => !open)}>{t('visualChoiceCustom')}</button>}
    </div>
    <div role="radiogroup" aria-labelledby={labelId} aria-describedby={help ? helpId : undefined} className="visual-choice-options">
      {options.map((option, index) => {
        const checked = option.value === value;
        return <button key={String(option.value)} type="button" role="radio" aria-checked={checked} disabled={disabled}
          tabIndex={checked || (!matched && index === 0) ? 0 : -1} className="visual-choice-option"
          onClick={() => onChange(option.value)} onKeyDown={event => move(event, index)}>
          {option.visual && <span className="visual-choice-visual" aria-hidden="true">{option.visual}</span>}
          <span className="visual-choice-text">{option.label}</span>
        </button>;
      })}
    </div>
    {custom && customOpen && <label className="visual-choice-custom">
      <span>{t('visualChoiceExact')}</span>
      <input type="number" inputMode="decimal" min={custom.min} max={custom.max} step={custom.step ?? 1} value={draft} disabled={disabled}
        onChange={event => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setDraft(String(value)); }} />
      {custom.unit && <span className="visual-choice-unit">{custom.unit}</span>}
    </label>}
    {help && <small id={helpId} className="visual-choice-help">{help}</small>}
  </div>;
}
