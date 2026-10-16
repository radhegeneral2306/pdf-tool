import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../types';

interface Schema extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  blobs: { key: string; value: { id: string; blob: Blob; createdAt?: number } };
  thumbs: { key: string; value: Blob };
  /** Full-quality page JPEGs prepared in the background so Save PDF is fast. */
  renders: { key: string; value: Blob };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  dbp ??= openDB<Schema>('pdf-tool', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('blobs', { keyPath: 'id' });
        d.createObjectStore('thumbs');
      }
      if (oldVersion < 2) d.createObjectStore('renders');
    },
  });
  return dbp;
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string) {
  return (await db()).get('projects', id);
}

export async function putProject(p: Project) {
  await (await db()).put('projects', p);
}

export async function putBlob(blob: Blob): Promise<string> {
  const id = uid();
  await (await db()).put('blobs', { id, blob, createdAt: Date.now() });
  return id;
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('blobs', id))?.blob;
}

export async function getBlobSize(id: string): Promise<number> {
  return (await getBlob(id))?.size ?? 0;
}

export async function getThumb(key: string) {
  return (await db()).get('thumbs', key);
}

export async function putThumb(key: string, blob: Blob) {
  await (await db()).put('thumbs', blob, key);
}

/** Deletes a project and every file only it used. */
export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
  await collectGarbage();
}

/** Removes stored files and thumbnails no project refers to anymore. */
export async function collectGarbage() {
  const d = await db();
  const used = new Set<string>();
  for (const p of await d.getAll('projects')) for (const pg of p.pages) used.add(pg.blobId);
  const tx = d.transaction(['blobs', 'thumbs', 'renders'], 'readwrite');
  // Files added in the last 10 minutes are kept: their document may not be saved yet.
  const fresh = Date.now() - 10 * 60 * 1000;
  for (const rec of await tx.objectStore('blobs').getAll())
    if (!used.has(rec.id) && !((rec.createdAt ?? 0) > fresh)) await tx.objectStore('blobs').delete(rec.id);
  for (const key of await tx.objectStore('thumbs').getAllKeys())
    if (!used.has(String(key).split('|')[0])) await tx.objectStore('thumbs').delete(key);
  for (const key of await tx.objectStore('renders').getAllKeys())
    if (!used.has(String(key).split('|')[0])) await tx.objectStore('renders').delete(key);
  await tx.done;
}

export async function getRender(key: string) {
  return (await db()).get('renders', key);
}

/** Saves a prepared page and drops older versions of the same photo that no page uses anymore. */
export async function putRender(key: string, blob: Blob, keep: Set<string>) {
  const d = await db();
  const blobId = key.split('|')[0];
  const tx = d.transaction('renders', 'readwrite');
  for (const k of await tx.store.getAllKeys(IDBKeyRange.bound(`${blobId}|`, `${blobId}|\uffff`)))
    if (k !== key && !keep.has(k)) await tx.store.delete(k);
  await tx.store.put(blob, key);
  await tx.done;
}

export async function clearAll() {
  const d = await db();
  const tx = d.transaction(['projects', 'blobs', 'thumbs', 'renders'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').clear(),
    tx.objectStore('blobs').clear(),
    tx.objectStore('thumbs').clear(),
    tx.objectStore('renders').clear(),
    tx.done,
  ]);
}

/** Asks the browser not to auto-delete our data when space is low. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export async function storageUsage(): Promise<number | null> {
  try {
    return (await navigator.storage?.estimate())?.usage ?? null;
  } catch {
    return null;
  }
}
