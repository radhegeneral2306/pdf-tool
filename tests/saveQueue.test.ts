import { describe, expect, it, vi } from 'vitest';
import { SaveQueue } from '../src/storage/saveQueue';

describe('document save failures', () => {
  it('retains failed edits, warns, and retries them successfully', async () => {
    const write = vi.fn().mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError')).mockResolvedValue(undefined);
    const queue = new SaveQueue(write, vi.fn());
    const edit = { id: 'doc', title: 'Important scan' };
    queue.save(edit);
    await queue.flush();
    expect(queue.failed).toBe(true);
    await queue.retry();
    expect(write).toHaveBeenLastCalledWith(edit);
    expect(queue.failed).toBe(false);
  });

  it('keeps warning on repeated failure and still saves other documents', async () => {
    const write = vi.fn(async (p: { id: string }) => { if (p.id === 'bad') throw Error('Disk unavailable'); });
    const queue = new SaveQueue(write, vi.fn());
    queue.save({ id: 'bad' });
    queue.save({ id: 'good' });
    await queue.flush();
    expect(write).toHaveBeenCalledWith({ id: 'good' });
    await queue.retry();
    expect(queue.failed).toBe(true);
  });

  it('retries the newest edit rather than an older failed snapshot', async () => {
    const write = vi.fn().mockRejectedValueOnce(Error('Full')).mockResolvedValue(undefined);
    const queue = new SaveQueue(write, vi.fn());
    queue.save({ id: 'doc', title: 'Old' });
    await queue.flush();
    queue.save({ id: 'doc', title: 'New' });
    await queue.retry();
    expect(write).toHaveBeenLastCalledWith({ id: 'doc', title: 'New' });
    expect(queue.failed).toBe(false);
  });

  it('does not resurrect deleted documents on retry', async () => {
    const write = vi.fn().mockRejectedValue(Error('Full'));
    const queue = new SaveQueue(write, vi.fn());
    queue.save({ id: 'deleted' });
    await queue.flush();
    queue.forget('deleted');
    await queue.retry();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.failed).toBe(false);
  });
});
