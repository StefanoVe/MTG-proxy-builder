import type { SVGProps } from 'react';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ArrowUturnLeftIcon, Bars3BottomLeftIcon,
  BookmarkSquareIcon, ChartBarIcon, CircleStackIcon, DocumentTextIcon,
  MagnifyingGlassIcon, MagnifyingGlassPlusIcon, NewspaperIcon, PencilIcon, PhotoIcon,
  PlusIcon, PrinterIcon, AdjustmentsHorizontalIcon, ArrowUpIcon, ArrowDownIcon, QueueListIcon, RectangleStackIcon, Square2StackIcon,
  TagIcon, TrashIcon, ViewfinderCircleIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon
} from '@heroicons/react/24/outline';

const icons = {
  collapse: ChevronLeftIcon,
  expand: ChevronRightIcon,
  settings: AdjustmentsHorizontalIcon,
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  search: MagnifyingGlassIcon,
  undo: ArrowUturnLeftIcon,
  frames: Square2StackIcon,
  batch: QueueListIcon,
  print: PrinterIcon,
  import: ArrowDownTrayIcon,
  add: PlusIcon,
  remove: TrashIcon,
  card: DocumentTextIcon,
  edit: PencilIcon,
  art: PhotoIcon,
  close: XMarkIcon,
  edition: NewspaperIcon,
  reset: ArrowPathIcon,
  detect: MagnifyingGlassPlusIcon,
  overlay: PhotoIcon,
  save: BookmarkSquareIcon,
  zone: ViewfinderCircleIcon,
  restore: ArrowUturnLeftIcon,
  text: Bars3BottomLeftIcon,
  mana: CircleStackIcon,
  type: TagIcon,
  stats: ChartBarIcon,
  artist: BookmarkSquareIcon,
  crop: ViewfinderCircleIcon,
  layers: RectangleStackIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const Heroicon = icons[name];
  return <Heroicon width={size} height={size} aria-hidden="true" focusable="false" {...props} />;
}
