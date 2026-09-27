import { useSyncExternalStore } from 'react';
import type { Settings } from '../types';

const KEY = 'pdftool.settings';

const DEFAULTS: Settings = {
  theme: 'system',
  scanFilter: 'clearScan',
  pageSize: 'a4',
  outputSize: 'original',
  welcomed: false,
  exportedNames: [],
};

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings() {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: keep in memory */
  }
  listeners.forEach((l) => l());
}

/** Remembers an exported file name (last 300) so the next default gets a (2), (3) suffix. */
export function rememberExport(name: string) {
  updateSettings({ exportedNames: [...current.exportedNames.filter((n) => n !== name), name].slice(-300) });
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
