import { useId } from 'react';
import './shared-controls.css';

/**
 * A color that can be "automatic" (undefined) or set explicitly.
 * One pattern for every optional color: a swatch that is always clickable plus an "Automatico" reset.
 */
export function OptionalColor({ label, value, fallback, autoLabel, resetLabel, help, disabled = false, onChange }: {
  label: string; value: string | undefined; fallback: string; autoLabel: string; resetLabel: string; help?: string;
  disabled?: boolean; onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  const helpId = useId();
  return <div className={`optional-color${disabled ? ' is-disabled' : ''}`}>
    <label htmlFor={id}>{label}{help && <small id={helpId}>{help}</small>}</label>
    <div className="optional-color-controls">
      <input id={id} type="color" value={value ?? fallback} disabled={disabled} aria-describedby={help ? helpId : undefined}
        onChange={event => onChange(event.target.value)} />
      {value === undefined
        ? <span className="optional-color-state">{autoLabel}</span>
        : <button type="button" className="optional-color-reset" disabled={disabled} onClick={() => onChange(undefined)}>{resetLabel}</button>}
    </div>
  </div>;
}
