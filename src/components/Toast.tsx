import { useSyncExternalStore } from 'react';
import s from './Toast.module.css';

interface ToastState {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

let current: ToastState | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let n = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Short message at the bottom, with an optional action like "Undo". */
export function showToast(message: string, action?: ToastState['action'], ms = 5000) {
  clearTimeout(timer);
  current = { id: ++n, message, action };
  emit();
  timer = setTimeout(hideToast, ms);
}

export function hideToast() {
  current = null;
  emit();
}

export function ToastHost() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  if (!t) return null;
  return (
    <div className={s.toast} key={t.id} role="status" aria-live="polite">
      <span>{t.message}</span>
      {t.action && (
        <button
          className={s.action}
          onClick={() => {
            t.action!.run();
            hideToast();
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}
