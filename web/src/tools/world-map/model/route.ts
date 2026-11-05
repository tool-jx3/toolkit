/**
 * 格子上的最便宜路線（自動產生的道路用）：四方向相鄰、走進每一格的成本依地形，海不能走。
 * 以二元堆積實作的 Dijkstra；成本相同時的走法固定（同一張地形一定得到同一條路）。
 */

/** 二元堆積（鍵小的在上）：上浮遇到相等的就停，下沉只換到嚴格比較小的子節點 */
export class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    this.settle(this.ids.length - 1, id, key, 'up');
  }

  /** 取出鍵最小的（空的時候不要呼叫） */
  pop(): { id: number; key: number } {
    const top = { id: this.ids[0], key: this.keys[0] };
    const id = this.ids.pop() as number;
    const key = this.keys.pop() as number;
    if (this.ids.length) this.settle(0, id, key, 'down');
    return top;
  }

  private place(at: number, id: number, key: number): void {
    this.ids[at] = id;
    this.keys[at] = key;
  }

  /** 從 at 開始把 (id, key) 移到該在的位置，路上的節點往反方向挪一格 */
  private settle(start: number, id: number, key: number, dir: 'up' | 'down'): void {
    let at = start;
    for (;;) {
      const next = dir === 'up' ? this.parentToSwap(at, key) : this.childToSwap(at, key);
      if (next < 0) break;
      this.place(at, this.ids[next], this.keys[next]);
      at = next;
    }
    this.place(at, id, key);
  }

  private parentToSwap(at: number, key: number): number {
    if (at === 0) return -1;
    const parent = (at - 1) >> 1;
    return this.keys[parent] <= key ? -1 : parent;
  }

  private childToSwap(at: number, key: number): number {
    const n = this.ids.length;
    let child = at * 2 + 1;
    if (child >= n) return -1;
    if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++;
    return this.keys[child] >= key ? -1 : child;
  }
}

/** 四方向的鄰格（左、右、上、下的順序） */
export function eachNeighbor(
  i: number,
  cols: number,
  rows: number,
  visit: (j: number) => void,
): void {
  const x = i % cols;
  const y = (i - x) / cols;
  if (x > 0) visit(i - 1);
  if (x < cols - 1) visit(i + 1);
  if (y > 0) visit(i - cols);
  if (y < rows - 1) visit(i + cols);
}

/**
 * start 到 goal 的格子（含兩端）；enter(j) 是走進 j 的成本，null 表示不能走。到不了時 null。
 */
export function cheapestRoute(
  cols: number,
  rows: number,
  start: number,
  goal: number,
  enter: (j: number) => number | null,
): number[] | null {
  const spent = new Float64Array(cols * rows).fill(Infinity);
  const from = new Int32Array(cols * rows).fill(-1);
  const open = new MinHeap();
  spent[start] = 0;
  open.push(start, 0);
  while (open.size) {
    const { id, key } = open.pop();
    if (key !== spent[id]) continue;
    if (id === goal) break;
    eachNeighbor(id, cols, rows, (j) => {
      const step = enter(j);
      if (step === null || key + step >= spent[j]) return;
      spent[j] = key + step;
      from[j] = id;
      open.push(j, key + step);
    });
  }
  if (!Number.isFinite(spent[goal])) return null;
  const trail = [goal];
  while (trail[trail.length - 1] !== start) {
    const back = from[trail[trail.length - 1]];
    if (back < 0) break;
    trail.push(back);
  }
  return trail.reverse();
}
