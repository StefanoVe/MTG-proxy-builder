import { useRef, useState } from 'react';
import { Icon } from './Icon.js';
import './shared-controls.css';

/** One consistent way to add an SVG/PNG image: click to choose or drop a file. */
export function ImageDropzone({ label, help, disabled = false, busy = false, accept = '.svg,.png,image/svg+xml,image/png', multiple = false, compact = false, onFiles }: {
  label: string; help?: string; disabled?: boolean; busy?: boolean; accept?: string; multiple?: boolean; compact?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = disabled || busy;
  return <div className={`image-drop${compact ? ' is-compact' : ''}${dragging ? ' is-dragging' : ''}`}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
      setDragging(!blocked);
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => {
      event.preventDefault();
      setDragging(false);
      if (blocked) return;
      const files = [...event.dataTransfer.files];
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    }}>
    <button type="button" className="image-drop-button" disabled={blocked} aria-busy={busy || undefined} onClick={() => input.current?.click()}>
      <Icon name="import" size={16} /><span>{label}</span>
    </button>
    {help && <small className="image-drop-help">{help}</small>}
    <input ref={input} hidden type="file" accept={accept} multiple={multiple} aria-label={label} onChange={event => {
      const files = [...(event.target.files ?? [])];
      event.target.value = '';
      if (files.length) onFiles(files);
    }} />
  </div>;
}
