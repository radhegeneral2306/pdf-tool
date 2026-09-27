import { useEffect, useRef, useState } from 'react';
import type { Point, Quad } from '../types';
import s from './CropOverlay.module.css';

const PAD = 28; // room around the photo so corner handles are easy to grab
const LOUPE = 112;
const ZOOM = 2.5;

interface Props {
  src: string;
  aspect: number; // width / height of the photo
  quad: Quad;
  onChange: (q: Quad) => void;
}

/** Four draggable corners over the photo, with a magnifier while dragging. */
export function CropOverlay({ src, aspect, quad, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ i: number; p: Point } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const cw = e.contentRect.width - PAD * 2;
      const ch = e.contentRect.height - PAD * 2;
      if (cw <= 0 || ch <= 0) return;
      const w = Math.min(cw, ch * aspect);
      setSize({ w, h: w / aspect });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const toNorm = (e: React.PointerEvent): Point => {
    const r = frame.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const move = (i: number, p: Point) => {
    const next = quad.map((q, k) => (k === i ? p : q)) as Quad;
    onChange(next);
    setDrag({ i, p });
  };

  const pts = quad.map((p) => `${p.x * size.w},${p.y * size.h}`).join(' ');
  const loupeBelow = drag && drag.p.y * size.h < LOUPE + 40;

  return (
    <div ref={box} className={s.box}>
      <div ref={frame} className={s.frame} style={{ width: size.w, height: size.h }}>
        <img src={src} alt="Page being cropped" draggable={false} />
        <svg className={s.svg} width={size.w} height={size.h} aria-hidden>
          <path d={`M0 0H${size.w}V${size.h}H0Z M${pts.replace(/ /g, ' L')}Z`} fillRule="evenodd" className={s.shade} />
          <polygon points={pts} className={s.edge} />
        </svg>
        {quad.map((p, i) => (
          <button
            key={i}
            className={`${s.handle} ${drag?.i === i ? s.active : ''}`}
            style={{ left: p.x * size.w, top: p.y * size.h }}
            aria-label={['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'][i]}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ i, p });
            }}
            onPointerMove={(e) => drag?.i === i && move(i, toNorm(e))}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.05 : 0.01;
              const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
              if (!d) return;
              e.preventDefault();
              onChange(quad.map((q, k) => (k === i ? { x: Math.min(1, Math.max(0, q.x + d[0])), y: Math.min(1, Math.max(0, q.y + d[1])) } : q)) as Quad);
            }}
          >
            <span />
          </button>
        ))}
        {drag && (
          <div
            className={s.loupe}
            style={{
              left: drag.p.x * size.w - LOUPE / 2,
              top: drag.p.y * size.h + (loupeBelow ? 40 : -LOUPE - 40),
              backgroundImage: `url(${src})`,
              backgroundSize: `${size.w * ZOOM}px ${size.h * ZOOM}px`,
              backgroundPosition: `${LOUPE / 2 - drag.p.x * size.w * ZOOM}px ${LOUPE / 2 - drag.p.y * size.h * ZOOM}px`,
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
