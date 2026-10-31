/**
 * 生成法共用的地板遮罩：cols × rows，逐列排列，1＝地板（走得到的空地）、0＝岩石。
 * 牆與空無在最後由 layout.ts 依「八方向上與地板相鄰」的規則決定（規格 F15）。
 */
import type { Random } from '@/core/timeline';

export interface Mask {
  cols: number;
  rows: number;
  open: Uint8Array;
}

export const createMask = (cols: number, rows: number): Mask => ({
  cols,
  rows,
  open: new Uint8Array(cols * rows),
});

export const isOpen = (m: Mask, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < m.cols && y < m.rows && m.open[y * m.cols + x] === 1;

export const setOpen = (m: Mask, x: number, y: number, v = 1): void => {
  if (x >= 0 && y >= 0 && x < m.cols && y < m.rows) m.open[y * m.cols + x] = v;
};

export const countOpen = (m: Mask): number => {
  let n = 0;
  for (const v of m.open) n += v;
  return n;
};

/**
 * 地板的連通區塊（四方向）。回傳每格的區塊編號（岩石 −1）與每個區塊的格子清單；
 * 區塊依「最上面、最左邊的那一格」的順序編號，結果只看遮罩、不用亂數。
 */
export function regions(m: Mask): { label: Int32Array; cells: number[][] } {
  const { cols, rows, open } = m;
  const label = new Int32Array(cols * rows).fill(-1);
  const cells: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || label[start] >= 0) continue;
    const id = cells.length;
    const list: number[] = [];
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop() as number;
      list.push(i);
      const x = i % cols;
      const y = (i - x) / cols;
      if (x > 0 && open[i - 1] && label[i - 1] < 0) {
        label[i - 1] = id;
        stack.push(i - 1);
      }
      if (x < cols - 1 && open[i + 1] && label[i + 1] < 0) {
        label[i + 1] = id;
        stack.push(i + 1);
      }
      if (y > 0 && open[i - cols] && label[i - cols] < 0) {
        label[i - cols] = id;
        stack.push(i - cols);
      }
      if (y < rows - 1 && open[i + cols] && label[i + cols] < 0) {
        label[i + cols] = id;
        stack.push(i + cols);
      }
    }
    list.sort((a, b) => a - b);
    cells.push(list);
  }
  return { label, cells };
}

/** 把小於 minSize 格的地板碎塊填回岩石（洞窟用：一兩格的小洞不值得挖隧道接過去） */
export function dropSmallRegions(m: Mask, minSize: number): void {
  for (const list of regions(m).cells) {
    if (list.length < minSize) for (const i of list) m.open[i] = 0;
  }
}

/** Fisher–Yates 洗牌（決定性亂數） */
export function shuffle<T>(items: readonly T[], rng: Random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}
