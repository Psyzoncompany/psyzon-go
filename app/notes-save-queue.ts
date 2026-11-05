// The queue outlives the editor: switching notes or unmounting cannot cancel a write.
export type SaveStatus = "saving" | "saved" | "error";
export type Recovery<T> = { value: T; base: string; time: number };
export class NoteSaveQueue<T> {
  private pending = new Map<string, { value: T; version: number }>();
  private running = new Map<string, Promise<void>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private version = 0;
  private statuses = new Map<string, SaveStatus>();
  constructor(private write: (id: string, value: T) => Promise<void>, private recovery: (id: string, value: T | null) => void, private report: (id: string, status: SaveStatus) => void, private delay = 500) {}
  stage(id: string, value: T) {
    this.recovery(id, value);
    this.pending.set(id, { value, version: ++this.version });
    this.statuses.set(id, "saving"); this.report(id, "saving");
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => { void this.flush(id); }, this.delay));
  }
  isPending(id: string) { return this.pending.has(id); }
  pendingValues() { return [...this.pending.entries()].map(([id, record]) => ({ id, value: record.value })); }
  getStatuses() { return Object.fromEntries(this.statuses); }
  flush(id: string): Promise<void> {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const running = this.running.get(id);
    if (running) return running;
    const worker = this.drain(id).finally(() => this.running.delete(id));
    this.running.set(id, worker);
    return worker;
  }
  private async drain(id: string) {
    while (this.pending.has(id)) {
      const current = this.pending.get(id)!;
      try { await this.write(id, current.value); }
      catch { this.statuses.set(id, "error"); this.report(id, "error"); return; }
      if (this.pending.get(id)?.version === current.version) {
        this.pending.delete(id);
        clearTimeout(this.timers.get(id)); this.timers.delete(id);
        this.recovery(id, null);
        this.statuses.set(id, "saved"); this.report(id, "saved");
      }
    }
  }
  flushAll() { return Promise.all([...this.pending.keys()].map(id => this.flush(id))); }
}
