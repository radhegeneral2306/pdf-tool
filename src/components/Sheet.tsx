import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Sheet.module.css';

/** iOS modal card sheet: slides up, dims the page behind. */
export function Sheet({
  open,
  onClose,
  title,
  left,
  right,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={s.layer}>
      <div className={s.dim} onClick={onClose} />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={s.grabber} aria-hidden />
        <header className={s.header}>
          <div className={s.side}>{left}</div>
          <div className={s.title}>{title}</div>
          <div className={`${s.side} ${s.right}`}>{right}</div>
        </header>
        <div className={s.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}

/** iOS action sheet: list of choices plus a separate Cancel button. */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={`${s.layer} ${s.actionLayer}`}>
      <div className={s.dim} onClick={onClose} />
      <div className={s.actions} role="dialog" aria-modal="true" aria-label={title ?? 'Options'}>
        <div className={s.group}>
          {title && <div className={s.actionTitle}>{title}</div>}
          {actions.map((a) => (
            <button
              key={a.label}
              className={`${s.action} ${a.destructive ? s.destructive : ''}`}
              onClick={() => {
                onClose();
                a.onSelect();
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
        <button className={`${s.group} ${s.action} ${s.cancel}`} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}
