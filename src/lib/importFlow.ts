import { showToast } from '../components/Toast';
import { getSettings } from '../storage/settings';
import { newProject, updateProject } from '../storage/projects';
import { navigate } from '../router';
import { importFiles } from './importFiles';
import type { Project } from '../types';

function reportErrors(errors: string[]) {
  if (errors.length === 1) showToast(errors[0], undefined, 7000);
  else if (errors.length > 1) showToast(`${errors.length} files couldn't be added. ${errors[0]}`, undefined, 7000);
}

/** Creates a new document from picked files and opens it. */
export async function createFromFiles(files: File[], title?: string): Promise<Project | null> {
  if (!files.length) return null;
  const { pages, errors } = await importFiles(files, 'original');
  reportErrors(errors);
  if (!pages.length) return null;
  const p = newProject(pages, title);
  navigate(`/doc/${p.id}`);
  return p;
}

/** Adds files (or camera photos) to an existing document. Returns the new page ids. */
export async function addToProject(id: string, files: Blob[], fromCamera = false): Promise<string[]> {
  if (!files.length) return [];
  const filter = fromCamera ? getSettings().scanFilter : 'original';
  const { pages, errors } = await importFiles(files, filter);
  reportErrors(errors);
  if (pages.length) updateProject(id, (p) => ({ ...p, pages: [...p.pages, ...pages] }));
  return pages.map((p) => p.id);
}
