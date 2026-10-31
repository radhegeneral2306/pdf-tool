import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Project } from '../types';
import { clearAll, deleteProject, getProject, listProjects, putProject, uid } from './db';
import { dateName } from '../lib/fileName';
import { SaveQueue } from './saveQueue';

/** In-memory copy of opened projects. Every change is written to IndexedDB right away. */
const cache = new Map<string, Project | null>();
const listeners = new Set<() => void>();
let version = 0;
const saves = new SaveQueue<Project>(putProject, emit);

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function newProject(pages: Project['pages'] = [], title?: string, exportName?: string): Project {
  const now = Date.now();
  const p: Project = { id: uid(), title: title ?? `Scan ${dateName()}`, createdAt: now, updatedAt: now, pages, exportName };
  cache.set(p.id, p);
  save(p);
  emit();
  return p;
}

function save(p: Project) {
  saves.save(p);
}

/** Waits for pending save attempts. Failures remain available for retry. */
export function flushSaves() {
  return saves.flush();
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  const cur = cache.get(id);
  if (cur === null) return;
  if (cur === undefined) {
    // Not opened in this session (e.g. the app reloaded on the camera screen): load it first.
    getProject(id).then((p) => {
      if (!cache.has(id)) cache.set(id, p ?? null);
      if (cache.get(id)) updateProject(id, fn);
      else emit();
    });
    return;
  }
  const next = { ...fn(cur), updatedAt: Date.now() };
  cache.set(id, next);
  save(next);
  emit();
}

/** Deletes a project for good, after any pending save has landed (so it can't come back). */
export async function removeProject(id: string) {
  cache.set(id, null);
  await flushSaves();
  await deleteProject(id);
  saves.forget(id);
  cache.delete(id);
  emit();
}

/** Deletes everything, after pending saves have landed. */
export async function removeAll() {
  for (const k of cache.keys()) cache.set(k, null);
  await flushSaves();
  await clearAll();
  for (const id of cache.keys()) saves.forget(id);
  cache.clear();
  emit();
}

export function forgetProject(id: string) {
  cache.delete(id);
  emit();
}

/** Returns the project, `undefined` while loading, or `null` if it doesn't exist. */
export function useProject(id: string | undefined): Project | null | undefined {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (!id || cache.has(id)) return;
    getProject(id).then((p) => {
      if (!cache.has(id)) {
        cache.set(id, p ?? null);
        emit();
      }
    });
  }, [id]);
  return id ? cache.get(id) : null;
}

/** All projects, newest first. Refreshes whenever any project changes. */
export function useProjectList(): Project[] | undefined {
  const v = useSyncExternalStore(subscribe, () => version);
  const [list, setList] = useState<Project[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    flushSaves()
      .then(listProjects)
      .then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [v, setList]);
  return list;
}



/** A persistent warning remains until all failed documents are saved or deleted. */
export function useSaveFailure() {
  useSyncExternalStore(subscribe, () => version);
  return saves.failed;
}

export const retrySaves = () => saves.retry();
