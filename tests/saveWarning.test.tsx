// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SaveWarning } from '../src/components/SaveWarning';
import { newProject, flushSaves, updateProject } from '../src/storage/projects';
import { putProject } from '../src/storage/db';

vi.mock('../src/storage/db', () => ({
  putProject: vi.fn(), uid: () => 'test-document',
  clearAll: vi.fn(), deleteProject: vi.fn(), getProject: vi.fn(), listProjects: vi.fn(),
}));

it('shows failed saves in the app and Retry Save persists the latest document', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const write = vi.mocked(putProject);
  write.mockRejectedValue(new DOMException('Storage full', 'QuotaExceededError'));
  const el = document.createElement('div');
  const root = createRoot(el);
  try {
    await act(async () => { root.render(<SaveWarning />); });
    expect(el.textContent).toBe('');
    await act(async () => { newProject([], 'Scan'); await flushSaves(); });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Changes could not be saved');
    await act(async () => { updateProject('test-document', p => ({ ...p, title: 'Latest title' })); await flushSaves(); });
    expect(el.textContent).toContain('Retry Save');
    write.mockResolvedValue(undefined);
    await act(async () => { el.querySelector('button')!.click(); await flushSaves(); });
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Latest title' }));
    expect(el.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
