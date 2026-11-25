import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from './Dropdown.js';

type Option = { value: string; label: ReactNode; disabled: boolean; group?: string };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  renderOption?: (value: string, label: ReactNode) => ReactNode;
};

function optionsFrom(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; label?: string; children?: ReactNode }>(child)) return [];
    if (child.type === 'optgroup') return optionsFrom(child.props.children, child.props.label);
    if (child.type !== 'option') return [];
    return [{ value: String(child.props.value ?? child.props.children ?? ''), label: child.props.children, disabled: !!child.props.disabled, group }];
  });
}

export function Select({ children, value, onChange, disabled, className, title, renderOption, 'aria-label': ariaLabel }: SelectProps) {
  const options = optionsFrom(children);
  const selected = options.find(option => option.value === String(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 220, above: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const height = Math.max(0, Math.min(220, Math.max(below, above) - 8));
      const opensAbove = below < 150 && above > below;
      const dialog = trigger.current?.closest('dialog');
      const dialogRect = dialog?.getBoundingClientRect();
      setPosition({ top: (opensAbove ? rect.top : rect.bottom) - (dialogRect?.top ?? 0) + (dialog ? dialog.scrollTop - dialog.clientTop : window.scrollY), left: rect.left - (dialogRect?.left ?? 0) + (dialog ? dialog.scrollLeft - dialog.clientLeft : window.scrollX), width: rect.width, maxHeight: height, above: opensAbove });
    };
    const dismiss = (event: MouseEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', dismiss);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('mousedown', dismiss); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  function show() { setActive(Math.max(0, options.findIndex(option => option.value === String(value)))); setOpen(true); }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    if (option.value !== String(value)) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } } as ChangeEvent<HTMLSelectElement>);
    trigger.current?.focus();
  }
  function move(step: number) {
    let next = active;
    for (let i = 0; i < options.length; i++) {
      next = (next + step + options.length) % options.length;
      if (!options[next].disabled) { setActive(next); break; }
    }
  }
  const optionLabel = (option: Option) => renderOption ? renderOption(option.value, option.label) : option.label;
  return <div className={`select-control${className ? ` ${className}` : ''}`} onKeyDown={event => {
    if (event.key !== 'Escape' || (!open && !event.repeat)) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  }}>
    <button ref={trigger} type="button" role="combobox" className="select-trigger" data-value={String(value)} disabled={disabled} title={title}
      aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) show(); else move(event.key === 'ArrowDown' ? 1 : -1); }
        else if (open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(active); }
        else if (open && event.key === 'Tab') setOpen(false);
      }}><span>{selected && optionLabel(selected)}</span><span aria-hidden="true" className="select-arrow">▾</span></button>
    {open && createPortal(<Dropdown ref={menu} id={id} className="select-menu" role="listbox" aria-label={ariaLabel} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, transform: position.above ? 'translateY(-100%)' : undefined }}>
      {options.map((option, index) => <div key={`${option.value}-${index}`}>
        {option.group && (index === 0 || options[index - 1].group !== option.group) && <div className="select-group">{option.group}</div>}
        <button id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={option.value === String(value)} disabled={option.disabled} data-active={index === active} data-value={option.value} onMouseMove={() => setActive(index)} onClick={() => choose(index)}>{optionLabel(option)}</button>
      </div>)}
    </Dropdown>, trigger.current?.closest('dialog') ?? document.body)}
  </div>;
}
