import { useEffect, useRef, useState, type ReactNode } from 'react';
import s from './NavBar.module.css';

interface Props {
  title: ReactNode;
  /** Classic iOS large title that shrinks into the bar when scrolled. */
  large?: boolean;
  left?: ReactNode;
  right?: ReactNode;
}

export function NavBar({ title, large, left, right }: Props) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(!large);

  useEffect(() => {
    if (!large || !sentinel.current) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0 });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [large]);

  return (
    <>
      <header className={`${s.bar} ${scrolled ? s.scrolled : ''}`}>
        <div className={s.side}>{left}</div>
        <div className={`${s.title} ${large && !scrolled ? s.hidden : ''}`}>{title}</div>
        <div className={`${s.side} ${s.right}`}>{right}</div>
      </header>
      {large && (
        <div className={s.largeWrap}>
          <h1 className={s.large}>{title}</h1>
          <div ref={sentinel} className={s.sentinel} />
        </div>
      )}
    </>
  );
}

/** Blue text button used in bars ("Cancel", "Done", "‹ Back"). */
export function BarButton({
  children,
  onClick,
  bold,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  bold?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button className={`${s.btn} ${bold ? s.bold : ''}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  );
}
