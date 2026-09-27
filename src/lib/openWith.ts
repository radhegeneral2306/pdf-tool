import { withBusy } from '../components/Hud';
import { showToast } from '../components/Toast';
import { navigate } from '../router';
import { dateName } from './fileName';
import { createFromFiles } from './importFlow';

/** Document title for opened files: the file name for one file, otherwise "Opened DD-MM-YY". */
export function titleFor(files: File[]): string {
  if (files.length === 1 && files[0].name) return files[0].name.replace(/\.[^.]+$/, '') || `Opened ${dateName()}`;
  return `Opened ${dateName()}`;
}

/** Opens files as a new document, ready to edit. */
export function openFiles(files: File[], replace = false) {
  if (!files.length) return;
  return withBusy('Opening', () => createFromFiles(files, titleFor(files), { replace }));
}

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}

/**
 * Computer (Chrome/Edge, installed app): "Open with PDF Tool" from the file manager.
 * The browser hands the files over through window.launchQueue.
 */
export function listenForLaunchFiles() {
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
  lq?.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((h) => h.getFile()));
    openFiles(files);
  });
}

/**
 * Android (installed app): files shared to PDF Tool from another app.
 * The service worker saves them in the 'shared-files' cache and opens #/open.
 */
export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open('shared-files');
  const out: File[] = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (res) {
      const name = decodeURIComponent(res.headers.get('x-file-name') || 'shared-file');
      const blob = await res.blob();
      out.push(new File([blob], name, { type: res.headers.get('content-type') || blob.type }));
    }
    await cache.delete(req);
  }
  return out;
}

/** Route #/open: import whatever was shared, or go home if nothing is waiting. */
let opening = false;
export async function handleOpenRoute() {
  if (opening) return; // guard against running twice
  opening = true;
  try {
    await openShared();
  } finally {
    opening = false;
  }
}

async function openShared() {
  const files = await takeSharedFiles().catch(() => []);
  if (files.length) await openFiles(files, true);
  else {
    navigate('/', { replace: true });
    showToast('Nothing to open. Use Edit PDF to choose a file.');
  }
}
