import { errorMessage, LocalizedError } from '../shared/i18n.js';
import { useI18n } from './i18n.js';
import { cardZones } from './card-zones.js';
import { cardArtZone, sideOrientation } from '../shared/model.js';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Card, Rect, Zones } from '../shared/model.js';
import { compose } from './compose.js';
import { drawCardImage, imageGeometry, sheetImage } from './card-images.js';
import type { PrintSettings } from '../shared/model.js';
import { Icon } from './Icon.js';
import './preview.css';

export type SelectableZone = keyof Zones;
type Corner = 'nw' | 'ne' | 'sw' | 'se';

const corners: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];
/** Hit-test priority: the smaller elements sit on top of the artwork. */
const selectableZones: readonly SelectableZone[] = ['stats', 'artist', 'title', 'type', 'rules', 'art'];
const selectSlop = 4;

function isSelectableZone(value?: string): value is SelectableZone {
  return selectableZones.includes(value as SelectableZone);
}

function moveRect({ x, y, w, h }: Rect, dx: number, dy: number): Rect {
  return { w, h, x: Math.min(100 - w, Math.max(0, x + dx)), y: Math.min(100 - h, Math.max(0, y + dy)) };
}

/** Resizes from one corner: the opposite edges stay fixed. Deltas are in percent of the card. */
function resizeRect({ x, y, w, h }: Rect, corner: Corner, dx: number, dy: number): Rect {
  let nx = x, nw = w, ny = y, nh = h;
  if (corner === 'ne' || corner === 'se') {
    nw = Math.min(100 - x, Math.max(1, w + dx));
  } else {
    const right = x + w;
    nx = Math.min(right - 1, Math.max(0, x + dx));
    nw = right - nx;
  }
  if (corner === 'sw' || corner === 'se') {
    nh = Math.min(100 - y, Math.max(1, h + dy));
  } else {
    const bottom = y + h;
    ny = Math.min(bottom - 1, Math.max(0, y + dy));
    nh = bottom - ny;
  }
  return { x: nx, y: ny, w: nw, h: nh };
}

function containsPoint(rect: Rect, px: number, py: number) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function rectStyle(rect: Rect) {
  return { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` };
}

function cornerOf(target: HTMLElement): Corner | undefined {
  if (!target.classList.contains('zone-resize')) return undefined;
  return corners.find(corner => target.classList.contains(`zone-resize-${corner}`)) ?? 'se';
}

function percentOf(event: PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { px: (event.clientX - bounds.left) / bounds.width * 100, py: (event.clientY - bounds.top) / bounds.height * 100 };
}

const keyMoves: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** A horizontal line drawn over the card; `y` is in percent of the card height (0..100). */
export type PreviewHandle = { id: string; y: number; label: string };

function snapHandle(y: number) {
  return Math.round(Math.min(100, Math.max(0, y)) * 2) / 2;
}

function CardHandle({ handle, onHandle }: { handle: PreviewHandle; onHandle?: (id: string, y: number) => void }) {
  const { t } = useI18n();
  /** Pointer offset from the handle line, in percent of the card, while dragging. */
  const offset = useRef<number | null>(null);

  function pointerPercent(event: PointerEvent<HTMLDivElement>) {
    const card = event.currentTarget.closest<HTMLElement>('.card-preview');
    if (!card) return undefined;
    const bounds = card.getBoundingClientRect();
    return (event.clientY - bounds.top) / bounds.height * 100;
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    // Dragging a handle must not pan the artwork or select the element under it.
    event.stopPropagation();
    if (event.button !== 0 || !onHandle) return;
    const py = pointerPercent(event);
    if (py === undefined) return;
    offset.current = py - handle.y;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (offset.current === null) return;
    const py = pointerPercent(event);
    if (py === undefined) return;
    onHandle?.(handle.id, snapHandle(py - offset.current));
  }
  function end(event?: PointerEvent<HTMLDivElement>) {
    event?.stopPropagation();
    offset.current = null;
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!onHandle) return;
    const step = event.shiftKey ? 5 : 1;
    let next: number | undefined;
    if (event.key === 'ArrowUp') next = handle.y - step;
    else if (event.key === 'ArrowDown') next = handle.y + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    if (next === undefined) return;
    event.preventDefault();
    onHandle(handle.id, snapHandle(next));
  }

  return <div className="card-handle" style={{ top: `${handle.y}%` }}
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { offset.current = null; }}>
    <span className="card-handle-hit" aria-hidden="true" />
    <span className="card-handle-line" aria-hidden="true" />
    <div className="card-handle-grip" role="slider" tabIndex={0} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={handle.y} aria-label={handle.label} title={t('previewHandleKeys')} onKeyDown={onKey}>
      <span className="card-handle-arrow" aria-hidden="true">↕</span>
      <span className="card-handle-label">{handle.label}</span>
    </div>
  </div>;
}

export function PreviewGuidesButton({ visible, toggle }: { visible: boolean; toggle: () => void }) {
  const { t } = useI18n();
  const label = t('previewGuides');
  return <button type="button" className="icon-button preview-guides-button" aria-label={label} title={label}
    aria-pressed={visible} onClick={toggle}><Icon name="grid" /></button>;
}

export function Preview({ card, back = false, showThirds = false, onCrop, zone, guide, onZone, hideWarning, hideArtworkWarning, bleedSettings, sheet = false, onSelectElement, selectedElement, compareCard, compareLabel, handles, onHandle }: {
  card: Card;
  bleedSettings?: PrintSettings;
  sheet?: boolean;
  back?: boolean;
  showThirds?: boolean;
  onCrop?: (crop: Card['crop']) => void;
  zone?: keyof Zones;
  guide?: Rect;
  hideWarning?: boolean;
  hideArtworkWarning?: boolean;
  onZone?: (rect: Rect) => void;
  /** Called with the zone under a short click on the card (not for printing frames). */
  onSelectElement?: (zone: SelectableZone) => void;
  /** Zone to highlight as the current selection. */
  selectedElement?: string;
  /** Shown instead of `card` while the hold-to-compare button is held. */
  compareCard?: Card;
  compareLabel?: string;
  /** Horizontal handles drawn over the card, hidden while comparing. */
  handles?: PreviewHandle[];
  /** Called with the handle id and its new `y` (percent of the card height, step 0.5). */
  onHandle?: (id: string, y: number) => void;
}) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const [warning, setWarning] = useState<Error>();
  const [comparing, setComparing] = useState(false);
  const [hover, setHover] = useState<SelectableZone>();
  const drag = useRef<{ x: number; y: number; crop: Card['crop']; rect?: Rect; corner?: Corner } | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);

  // While comparing, the displayed card is read-only: no guide, drag, selection or hover.
  const isCompare = !!compareCard && comparing;
  const shown = isCompare && compareCard ? compareCard : card;
  const live = !isCompare;
  const zones: Zones | undefined = card.frame.kind === 'printing' ? undefined : cardZones(card);
  const selectable = live && !!onSelectElement && !!zones;
  const rect = live ? guide ?? (zone === 'art' && card.frame.kind === 'printing' ? cardArtZone(card)
    : zone && card.frame.kind !== 'printing' ? cardZones(card)[zone] : undefined) : undefined;
  const canDrag = live && (!!rect || !!onCrop && !!(card.art ?? card.source.images.art));
  const selectedRect = live && zones && isSelectableZone(selectedElement) && !card.hiddenZones?.includes(selectedElement)
    ? zones[selectedElement] : undefined;

  useEffect(() => {
    let active = true;
    const offscreen = document.createElement('canvas');
    void compose(offscreen, shown, back).then(({ warning }) => {
      const canvas = ref.current;
      if (!active || !canvas) return;
      if (bleedSettings) drawCardImage(canvas, sheet ? sheetImage(offscreen) : offscreen, imageGeometry(300, bleedSettings.bleed ?? 'none', bleedSettings.customMm ?? 3), bleedSettings.fill ?? 'mirror', bleedSettings.color ?? '#000000');
      else { canvas.width = offscreen.width; canvas.height = offscreen.height; canvas.getContext('2d')!.drawImage(offscreen, 0, 0); }
      setWarning(!hideWarning && warning ? new LocalizedError(warning) : undefined);
    }).catch((error: Error) => {
      if (!active) return;
      const canvas = ref.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      setWarning(error);
    });
    return () => { active = false; };
  }, [shown, back, hideWarning, bleedSettings, sheet]);
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

  function zoneAt(event: PointerEvent<HTMLDivElement>): SelectableZone | undefined {
    if (!zones) return undefined;
    const { px, py } = percentOf(event);
    return selectableZones.find(name => !card.hiddenZones?.includes(name) && containsPoint(zones[name], px, py));
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (selectable) {
      const { px, py } = percentOf(event);
      const onGuide = !!(event.target as HTMLElement).closest('.zone-guide') || !!rect && containsPoint(rect, px, py);
      press.current = onGuide ? null : { x: event.clientX, y: event.clientY };
    }
    if (!canDrag) return;
    drag.current = { x: event.clientX, y: event.clientY, crop: card.crop, rect, corner: cornerOf(event.target as HTMLElement) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (selectable && !event.buttons) {
      const hit = zoneAt(event);
      if (hit !== hover) setHover(hit);
    }
    const target = drag.current;
    if (!target) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - target.x) / bounds.width;
    const dy = (event.clientY - target.y) / bounds.height;
    if (target.rect && onZone) {
      onZone(target.corner
        ? resizeRect(target.rect, target.corner, dx * 100, dy * 100)
        : moveRect(target.rect, dx * 100, dy * 100));
    } else {
      const clamp = (n: number) => Math.min(1, Math.max(-1, n));
      onCrop?.({ ...target.crop, x: clamp(target.crop.x + dx * 3), y: clamp(target.crop.y + dy * 3) });
    }
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const origin = press.current;
    press.current = null;
    if (!origin || !selectable || !onSelectElement) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= selectSlop) return;
    const hit = zoneAt(event);
    if (hit) onSelectElement(hit);
  }
  function onGuideKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!rect || !onZone) return;
    const direction = keyMoves[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const dx = direction[0] * step;
    const dy = direction[1] * step;
    onZone(event.altKey ? resizeRect(rect, 'se', dx, dy) : moveRect(rect, dx, dy));
  }
  function holdCompare(on: boolean) {
    if (compareCard) setComparing(on);
  }

  return <div className="preview-wrap">
    <div className={`card-preview ${canDrag ? 'is-draggable' : ''} ${selectable && hover ? 'has-zone-hover' : ''}`} style={!sheet && sideOrientation(card, back) === 'landscape' ? { aspectRatio: '88 / 63' } : undefined}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { press.current = null; }}
      onPointerLeave={() => setHover(undefined)} onLostPointerCapture={() => { drag.current = null; }}>
      <canvas ref={ref} role="img" aria-label={back ? t('cardBack') : t('cardPreview', { name: shown.fields.name })} />
      {showThirds && <div className="thirds-grid" aria-hidden="true">
        <i className="thirds-grid-line thirds-grid-line-v" />
        <i className="thirds-grid-line thirds-grid-line-v" />
        <i className="thirds-grid-line thirds-grid-line-h" />
        <i className="thirds-grid-line thirds-grid-line-h" />
      </div>}
      {selectable && hover && zones && <div className="zone-hover" aria-hidden="true" style={rectStyle(zones[hover])} />}
      {selectedRect && <div className="zone-selected" aria-hidden="true" style={rectStyle(selectedRect)} />}
      {rect && <div className="zone-guide" role={onZone ? 'group' : undefined} tabIndex={onZone ? 0 : undefined}
        aria-label={onZone ? t('previewZoneKeys') : undefined} onKeyDown={onZone ? onGuideKey : undefined} style={rectStyle(rect)}>
        {corners.map(corner => <span key={corner} className={`zone-resize zone-resize-${corner}`} aria-hidden="true" />)}
      </div>}
      {live && handles?.map(handle => <CardHandle key={handle.id} handle={handle} onHandle={onHandle} />)}
      {compareCard && <button type="button" className="preview-compare-button" aria-pressed={isCompare}
        onPointerDown={event => { event.stopPropagation(); if (event.button === 0) holdCompare(true); }}
        onPointerUp={event => { event.stopPropagation(); holdCompare(false); }}
        onPointerMove={event => event.stopPropagation()}
        onPointerLeave={() => holdCompare(false)}
        onPointerCancel={() => holdCompare(false)}
        onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); holdCompare(true); } }}
        onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') holdCompare(false); }}
        onBlur={() => holdCompare(false)}>{compareLabel ?? t('previewCompareHold')}</button>}
    </div>
    {warning && !(hideArtworkWarning && warning instanceof LocalizedError && warning.key === 'addArtHelp')
      && <span className="preview-warning" role="status">{errorMessage(warning, locale)}</span>}
  </div>;
}
