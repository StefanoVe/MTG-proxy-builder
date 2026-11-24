import { cardZones } from './card-zones.js';
import { cardArtZone } from '../shared/model.js';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Card, Rect, Zones } from '../shared/model.js';
import { compose } from './compose.js';

export function Preview({ card, back = false, showThirds = false, onCrop, zone, guide, onZone, hideWarning }: {
  card: Card;
  back?: boolean;
  showThirds?: boolean;
  onCrop?: (crop: Card['crop']) => void;
  zone?: keyof Zones;
  guide?: Rect;
  hideWarning?: boolean;
  onZone?: (rect: Rect) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [warning, setWarning] = useState('');
  const drag = useRef<{ x: number; y: number; crop: Card['crop']; rect?: Rect; resize: boolean } | null>(null);
  const rect = guide ?? (zone === 'art' && card.frame.kind === 'printing' ? cardArtZone(card)
    : zone && card.frame.kind !== 'printing' ? cardZones(card)[zone] : undefined);
  const canDrag = !!rect || !!onCrop && !!(card.art ?? card.source.images.art);
  useEffect(() => {
    let active = true;
    const offscreen = document.createElement('canvas');
    void compose(offscreen, card, back).then(({ warning }) => {
      const canvas = ref.current;
      if (!active || !canvas) return;
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext('2d')!.drawImage(offscreen, 0, 0);
      setWarning(hideWarning ? '' : warning ?? '');
    }).catch((error: Error) => {
      if (!active) return;
      const canvas = ref.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      setWarning(error.message);
    });
    return () => { active = false; };
  }, [card, back, hideWarning]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !onCrop || rect || !canDrag) return;
    function zoom(event: WheelEvent) {
      event.preventDefault();
      onCrop?.({ ...card.crop, zoom: Math.min(5, Math.max(1, card.crop.zoom * Math.exp(-event.deltaY * 0.002))) });
    }
    canvas.addEventListener('wheel', zoom, { passive: false });
    return () => canvas.removeEventListener('wheel', zoom);
  }, [card.crop, onCrop, rect, canDrag]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!canDrag || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, crop: card.crop, rect, resize: (event.target as HTMLElement).classList.contains('zone-resize') };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const target = drag.current;
    if (!target) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - target.x) / bounds.width;
    const dy = (event.clientY - target.y) / bounds.height;
    if (target.rect && onZone) {
      const { w, h, x, y } = target.rect;
      onZone(target.resize
        ? { x, y, w: Math.min(100 - x, Math.max(1, w + dx * 100)), h: Math.min(100 - y, Math.max(1, h + dy * 100)) }
        : { w, h, x: Math.min(100 - w, Math.max(0, x + dx * 100)), y: Math.min(100 - h, Math.max(0, y + dy * 100)) });
    } else {
      const clamp = (n: number) => Math.min(1, Math.max(-1, n));
      onCrop?.({ ...target.crop, x: clamp(target.crop.x + dx * 3), y: clamp(target.crop.y + dy * 3) });
    }
  }
  return <div className="preview-wrap">
    <div className={`card-preview ${canDrag ? 'is-draggable' : ''}`} onPointerDown={start} onPointerMove={move}
      onLostPointerCapture={() => { drag.current = null; }}>
      <canvas ref={ref} role="img" aria-label={back ? 'Retro della carta' : `Anteprima di ${card.fields.name}`} />
      {showThirds && <div className="thirds-grid" aria-hidden="true">
        <i className="thirds-grid-line thirds-grid-line-v" />
        <i className="thirds-grid-line thirds-grid-line-v" />
        <i className="thirds-grid-line thirds-grid-line-h" />
        <i className="thirds-grid-line thirds-grid-line-h" />
      </div>}
      {rect && <div className="zone-guide" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}>
        <span className="zone-resize" aria-hidden="true" />
      </div>}
    </div>
    {warning && <span className="preview-warning" role="status">{warning}</span>}
  </div>;
}
