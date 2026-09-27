import { useSyncExternalStore } from 'react';
import { Spinner } from './Controls';
import s from './Hud.module.css';

let message: string | null = null;
const listeners = new Set<() => void>();

/** Shows a blocking "working" overlay (classic iOS HUD). Pass null to hide. */
export function setBusy(m: string | null) {
  message = m;
  listeners.forEach((l) => l());
}

export async function withBusy<T>(m: string, job: () => Promise<T>): Promise<T> {
  setBusy(m);
  try {
    return await job();
  } finally {
    setBusy(null);
  }
}

export function HudHost() {
  const m = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => message,
  );
  if (!m) return null;
  return (
    <div className={s.layer} role="alert" aria-busy="true">
      <div className={s.hud}>
        <Spinner size={34} light />
        <span>{m}</span>
      </div>
    </div>
  );
}
