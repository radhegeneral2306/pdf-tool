import { useCallback, useEffect, useRef, useState } from 'react';
import { CaretLeftIcon, CaretRightIcon, CheckCircleIcon, CircleIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react';
import type { PageItem } from '../types';
import { usePreview } from '../lib/usePreview';
import { Spinner } from './Controls';
import s from './PageViewer.module.css';

const VIEW_DIM = 2200;
const MAX_ZOOM = 5;

interface Props {
  pages: PageItem[];
  startIndex: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}

/**
 * Full-screen page viewer used while selecting pages.
 * Pinch or double-tap to zoom, drag to move around, swipe for next/previous page.
 */
export function PageViewer({ pages, startIndex, selected, onToggle, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const page = pages[index];
  const edits = page ? { rotation: page.rotation, crop: page.crop, filter: page.filter } : null;
  const preview = usePreview(page, edits, VIEW_DIM);

  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; x: number; y: number; mx: number; my: number; sx: number; sy: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Page drawn to fit the screen at zoom 1.
  const aspect = preview?.aspect ?? 0.707;
  const fitW = Math.min(box.w - 24, (box.h - 24) * aspect);
  const fitH = fitW / aspect;

  const clampView = useCallback(
    (scale: number, x: number, y: number) => {
      const sc = Math.min(MAX_ZOOM, Math.max(1, scale));
      const maxX = Math.max(0, (fitW * sc - box.w) / 2);
      const maxY = Math.max(0, (fitH * sc - box.h) / 2);
      return { scale: sc, x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    },
    [fitW, fitH, box.w, box.h],
  );

  /** Zoom to `scale`, keeping the point (px, py) (relative to the stage center) in place. */
  const zoomAt = useCallback(
    (scale: number, px = 0, py = 0, from = view) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, scale)) / from.scale;
      setView(clampView(from.scale * k, px - (px - from.x) * k, py - (py - from.y) * k));
    },
    [clampView, view],
  );

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= pages.length) return;
      setIndex(next);
      setView({ scale: 1, x: 0, y: 0 });
    },
    [index, pages.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' && page) {
        e.preventDefault();
        onToggle(page.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, onToggle, page]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { dist, scale: view.scale, x: view.x, y: view.y, mx, my, sx: mx, sy: my, moved: gesture.current?.moved ?? false };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // let the zoom buttons get their click
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = null;
    startGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    if (Math.hypot(mx - g.sx, my - g.sy) > 6) g.moved = true;
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = Math.min(MAX_ZOOM, Math.max(1, (g.scale * dist) / g.dist));
      const k = scale / g.scale;
      setView(clampView(scale, mx - (g.mx - g.x) * k, my - (g.my - g.y) * k));
      g.moved = true;
    } else if (g.scale > 1) {
      setView(clampView(g.scale, g.x + mx - g.mx, g.y + my - g.my));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      startGesture(); // one finger lifted during a pinch: continue as a pan
      return;
    }
    if (!g || !p) return;
    const dx = p.x - g.sx;
    if (g.scale === 1 && view.scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(p.y - g.sy)) {
      go(dx < 0 ? 1 : -1); // swipe
    } else if (!g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        zoomAt(view.scale > 1 ? 1 : 2.5, p.x, p.y);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
    gesture.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e);
    zoomAt(view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
  };

  if (!page) return null;
  const isSelected = selected.has(page.id);

  return (
    <div className={s.viewer} role="dialog" aria-modal="true" aria-label={`Page ${index + 1} of ${pages.length}`}>
      <header className={s.top}>
        <span className={s.side} />
        <span className={s.title}>
          {index + 1} of {pages.length}
        </span>
        <span className={`${s.side} ${s.right}`}>
          <button className={s.done} onClick={onClose}>
            Done
          </button>
        </span>
      </header>

      <div
        ref={stage}
        className={s.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {!preview ? (
          <Spinner size={32} light />
        ) : !preview.url ? (
          <p className={s.error}>This page can't be shown.</p>
        ) : (
          <img
            src={preview.url}
            alt={`Page ${index + 1}`}
            draggable={false}
            className={s.img}
            style={{ width: fitW, height: fitH, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          />
        )}
        {isSelected && <CheckCircleIcon className={s.badge} size={34} weight="fill" aria-hidden />}
        <div className={s.zoom}>
          <button onClick={() => zoomAt(view.scale / 1.5)} disabled={view.scale <= 1} aria-label="Zoom out">
            <MagnifyingGlassMinusIcon size={22} />
          </button>
          <button onClick={() => zoomAt(view.scale * 1.5)} disabled={view.scale >= MAX_ZOOM} aria-label="Zoom in">
            <MagnifyingGlassPlusIcon size={22} />
          </button>
        </div>
      </div>

      <footer className={s.bottom}>
        <button className={s.nav} onClick={() => go(-1)} disabled={index === 0} aria-label="Previous page">
          <CaretLeftIcon size={24} weight="bold" />
        </button>
        <button className={`${s.select} ${isSelected ? s.on : ''}`} onClick={() => onToggle(page.id)} aria-pressed={isSelected}>
          {isSelected ? <CheckCircleIcon size={22} weight="fill" /> : <CircleIcon size={22} />}
          {isSelected ? 'Selected' : 'Select Page'}
        </button>
        <button className={s.nav} onClick={() => go(1)} disabled={index === pages.length - 1} aria-label="Next page">
          <CaretRightIcon size={24} weight="bold" />
        </button>
      </footer>
    </div>
  );
}
