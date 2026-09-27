import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircleIcon, CircleIcon, MagnifyingGlassPlusIcon, WarningIcon } from '@phosphor-icons/react';
import type { PageItem } from '../types';
import { useThumb } from '../lib/thumbs';
import { filterLabel } from '../lib/filterMeta';
import s from './PageGrid.module.css';

interface Props {
  pages: PageItem[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onReorder: (pages: PageItem[]) => void;
  /** Opens the full-screen viewer (select mode). */
  onZoom: (index: number) => void;
}

export function PageGrid({ pages, selecting, selected, onToggle, onOpen, onReorder, onZoom }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to pick up a page, so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = () => navigator.vibrate?.(10);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((p) => p.id === active.id);
    const to = pages.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(pages, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <ol className={s.grid}>
          {pages.map((p, i) => (
            <Tile
              key={p.id}
              page={p}
              index={i}
              selecting={selecting}
              selected={selected.has(p.id)}
              onClick={() => (selecting ? onToggle(p.id) : onOpen(p.id))}
              onZoom={() => onZoom(i)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Tile({
  page,
  index,
  selecting,
  selected,
  onClick,
  onZoom,
}: {
  page: PageItem;
  index: number;
  selecting: boolean;
  selected: boolean;
  onClick: () => void;
  onZoom: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const url = useThumb(page);
  return (
    <li
      ref={setNodeRef}
      className={`${s.tile} ${isDragging ? s.dragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className={`${s.card} ${selected ? s.selected : ''}`}
        onClick={onClick}
        aria-label={`Page ${index + 1}${selecting ? (selected ? ', selected' : '') : ', open editor. Long press to move.'}`}
        {...attributes}
        {...listeners}
      >
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : url === undefined ? (
          <span className={s.loading} />
        ) : (
          <span className={s.failed}>
            <WarningIcon size={28} />
            Can't preview
          </span>
        )}
        {page.kind === 'pdfPage' && <span className={s.badge}>PDF</span>}
        {page.kind === 'image' && page.filter !== 'original' && !selecting && <span className={`${s.badge} ${s.filterBadge}`}>{filterLabel(page.filter)}</span>}
        {selecting && (
          <span className={s.check} aria-hidden>
            {selected ? <CheckCircleIcon size={26} weight="fill" /> : <CircleIcon size={26} color="#8E8E93" />}
          </span>
        )}
      </button>
      {selecting && (
        <button
          className={s.zoom}
          onClick={onZoom}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`View page ${index + 1} larger`}
        >
          <MagnifyingGlassPlusIcon size={20} weight="bold" />
        </button>
      )}
      <span className={s.num}>{index + 1}</span>
    </li>
  );
}
