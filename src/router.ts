import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'tools' }
  | { name: 'documents' }
  | { name: 'settings' }
  | { name: 'scan' }
  | { name: 'open' }
  | { name: 'ocr' }
  | { name: 'doc'; id: string; select?: boolean }
  | { name: 'camera'; id: string }
  | { name: 'edit'; id: string; pageId: string };

/** Hash routes (#/doc/123) so refreshing on GitHub Pages never gives a 404. */
export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === 'documents') return { name: 'documents' };
  if (a === 'settings') return { name: 'settings' };
  if (a === 'scan') return { name: 'scan' };
  if (a === 'open') return { name: 'open' };
  if (a === 'ocr') return { name: 'ocr' };
  if (a === 'doc' && b) {
    if (c === 'camera') return { name: 'camera', id: b };
    if (c === 'edit' && d) return { name: 'edit', id: b, pageId: d };
    if (c === 'select') return { name: 'doc', id: b, select: true };
    return { name: 'doc', id: b };
  }
  return { name: 'tools' };
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`;
  if (opts.replace) history.replaceState(history.state, '', url);
  else history.pushState({ inApp: true }, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Goes back if there is in-app history, otherwise to `fallback`. */
export function goBack(fallback: string) {
  if (history.state?.inApp) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      window.addEventListener('popstate', l);
      return () => {
        window.removeEventListener('hashchange', l);
        window.removeEventListener('popstate', l);
      };
    },
    () => location.hash,
  );
  return parse(hash);
}
