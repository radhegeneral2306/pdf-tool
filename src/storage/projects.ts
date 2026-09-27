import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Project } from '../types';
import { getProject, listProjects, putProject, uid } from './db';
import { dateName } from '../lib/fileName';

/** In-memory copy of opened projects. Every change is written to IndexedDB right away. */
const cache = new Map<string, Project | null>();
const listeners = new Set<() => void>();
let version = 0;
let writes: Promise<void> = Promise.resolve();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function newProject(pages: Project['pages'] = [], title?: string): Project {
  const now = Date.now();
  const p: Project = { id: uid(), title: title ?? `Scan ${dateName()}`, createdAt: now, updatedAt: now, pages };
  cache.set(p.id, p);
  save(p);
  emit();
  return p;
}

function save(p: Project) {
  writes = writes.then(() => putProject(p)).catch((e) => console.error('Save failed', e));
}

/** Resolves when all pending saves have reached the database. */
export function flushSaves() {
  return writes;
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  const cur = cache.get(id);
  if (!cur) return;
  const next = { ...fn(cur), updatedAt: Date.now() };
  cache.set(id, next);
  save(next);
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

