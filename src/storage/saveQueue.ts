/** Keeps the latest unsaved edit for each document until storage accepts it. */
export class SaveQueue<T extends { id: string }> {
  private pending = new Map<string, T>();
  private failures = new Set<string>();
  private writes: Promise<void> = Promise.resolve();

  constructor(private write: (value: T) => Promise<void>, private changed: () => void) {}

  get failed() { return this.failures.size > 0; }

  save(value: T) {
    this.pending.set(value.id, value);
    this.schedule(value);
  }

  private schedule(value: T) {
    this.writes = this.writes.then(async () => {
      if (this.pending.get(value.id) !== value) return;
      try {
        await this.write(value);
        if (this.pending.get(value.id) === value) {
          this.pending.delete(value.id);
          this.failures.delete(value.id);
        }
      } catch {
        this.failures.add(value.id);
      }
      this.changed();
    });
  }

  retry() {
    for (const value of this.pending.values()) this.schedule(value);
    return this.flush();
  }

  /** Waits for attempts to finish; failed edits stay pending and visible to the UI. */
  flush() { return this.writes; }

  forget(id: string) {
    this.pending.delete(id);
    this.failures.delete(id);
    this.changed();
  }
}
