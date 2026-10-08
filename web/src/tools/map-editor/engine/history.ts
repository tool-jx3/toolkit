/**
 * 復原／重做（規格 F185、F186）：每一步存「操作之後」整個畫布的快照（JSON 字串），最多 50 步。
 * 同名的連續修改（拖滑桿、打字）停 0.5 秒才記成一步。做法與舊版相同（A 方式：全狀態快照）。
 */
export const HISTORY_MAX = 50;
export const HISTORY_DEBOUNCE_MS = 500;

export interface HistoryEntry {
  snapshot: string;
  name: string;
}

export interface HistoryHost {
  /** 目前的狀態（快照） */
  snapshot(): string;
  /** 還原快照（非同步：Fabric 的 loadFromJSON） */
  restore(snapshot: string): Promise<void>;
  /** 記了一步／復原／重做之後（自動儲存、更新按鈕） */
  changed(kind: 'push' | 'undo' | 'redo' | 'clear', name: string): void;
}

export class History {
  private stack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private initial = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = '';
  /** 還原中（不記錄） */
  restoring = false;

  constructor(private host: HistoryHost) {}

  get canUndo(): boolean {
    return this.stack.length > 0 || this.timer !== null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get size(): number {
    return this.stack.length;
  }

  /** 開啟地圖時：清空，目前的狀態當作最早的狀態 */
  clear(): void {
    this.cancelPending();
    this.stack = [];
    this.redoStack = [];
    this.initial = this.host.snapshot();
    this.host.changed('clear', '');
  }

  push(name: string): void {
    if (this.restoring) return;
    this.flush();
    this.stack.push({ snapshot: this.host.snapshot(), name });
    if (this.stack.length > HISTORY_MAX) {
      /* 最舊的一步變成最早的狀態 */
      const dropped = this.stack.shift();
      if (dropped) this.initial = dropped.snapshot;
    }
    this.redoStack = [];
    this.host.changed('push', name);
  }

  /** 連續修改：同名的在 0.5 秒內合成一步；不同名的先把前一個記下來 */
  pushDebounced(name: string): void {
    if (this.restoring) return;
    if (this.timer && this.pending !== name) this.flush();
    this.pending = name;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const n = this.pending;
      this.pending = '';
      this.push(n);
    }, HISTORY_DEBOUNCE_MS);
  }

  /** 等待中的連續修改立刻記下來 */
  flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    const n = this.pending;
    this.pending = '';
    this.push(n);
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = '';
  }

  async undo(): Promise<string | null> {
    this.flush();
    const top = this.stack.pop();
    if (!top) return null;
    this.redoStack.push(top);
    const target = this.stack.at(-1)?.snapshot ?? this.initial;
    await this.apply(target);
    this.host.changed('undo', top.name);
    return top.name;
  }

  async redo(): Promise<string | null> {
    this.flush();
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.stack.push(entry);
    await this.apply(entry.snapshot);
    this.host.changed('redo', entry.name);
    return entry.name;
  }

  private async apply(snapshot: string): Promise<void> {
    this.restoring = true;
    try {
      await this.host.restore(snapshot);
    } finally {
      this.restoring = false;
    }
  }

  dispose(): void {
    this.cancelPending();
  }
}
