/**
 * 在一個圖層上畫：一筆畫（拖曳）裡的所有變更先寫在這一層的工作副本，放開時一次交給地圖（一步復原）。
 *
 * - 放一般圖塊、擦掉：一格。蓋到大圖塊的任何一格時，整個大圖塊先拿掉（大圖塊不會只剩一部分）。
 * - 放大圖塊：從那一格往右下排開；有任何一格在地圖外就不放（地圖邊緣放不完整的大圖塊略過）；
 *   那個位置已經是同一個大圖塊時不重放（拖曳時停在原地不會一直換新的）。
 * - 填滿：和點的那一格「同一種」（同一個圖塊、轉向與翻轉相同，或都是空的）而且上下左右相連的範圍；
 *   大圖塊從範圍的外框左上角起排，整個放得進範圍的位置才放。
 * - 圖形：圖形的格子當範圍，排法同填滿。
 */
import {
  anchorsIn,
  newInstanceId,
  placed,
  placeParts,
  sameKind,
  samePlaced,
  turnedSpan,
} from './large';
import { type ShapeKind, shapeCells } from './shapes';
import type { Cell, Placed, Turn } from './types';

/** 畫筆：圖塊、轉向、翻轉、佔的格數（未轉向） */
export interface Brush {
  t: string;
  r: Turn;
  f: boolean;
  span: readonly [number, number];
}

export class LayerEdit {
  private work: Cell[] | null = null;
  private index: Map<string, Set<number>> | null = null;
  private readonly touched = new Set<number>();
  /** 上次 takeRecent 之後改過的格子（畫面的快取只重畫這些） */
  private recent = new Set<number>();

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly base: readonly Cell[],
  ) {}

  get(i: number): Cell {
    return (this.work ?? this.base)[i] ?? null;
  }

  at(x: number, y: number): Cell {
    return this.inBounds(x, y) ? this.get(y * this.width + x) : null;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** 大圖塊的編號 → 它佔的格子（第一次用到時掃一次整層） */
  private instances(): Map<string, Set<number>> {
    if (!this.index) {
      const m = new Map<string, Set<number>>();
      const cells = this.work ?? this.base;
      for (let i = 0; i < cells.length; i++) {
        const id = cells[i]?.i;
        if (!id) continue;
        let s = m.get(id);
        if (!s) {
          s = new Set();
          m.set(id, s);
        }
        s.add(i);
      }
      this.index = m;
    }
    return this.index;
  }

  private write(i: number, v: Cell): void {
    if (!this.work) this.work = this.base.slice();
    const old = this.work[i];
    if (this.index) {
      if (old?.i) this.index.get(old.i)?.delete(i);
      if (v?.i) {
        let s = this.index.get(v.i);
        if (!s) {
          s = new Set();
          this.index.set(v.i, s);
        }
        s.add(i);
      }
    }
    this.work[i] = v;
    this.touched.add(i);
    this.recent.add(i);
  }

  /** 拿掉整個大圖塊 */
  private clearInstance(id: string): void {
    const s = this.instances().get(id);
    if (!s) return;
    for (const i of [...s]) this.write(i, null);
  }

  /** 一格放 v（null＝擦掉）；蓋到別的大圖塊時整個大圖塊先拿掉 */
  set(x: number, y: number, v: Cell): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    const old = this.get(i);
    if (samePlaced(old, v)) return;
    if (old?.i && old.i !== v?.i) this.clearInstance(old.i);
    this.write(i, v);
  }

  /** 從 (x, y) 放一個畫筆（大圖塊往右下排開）；放了回傳 true */
  stamp(x: number, y: number, b: Brush): boolean {
    if (b.span[0] === 1 && b.span[1] === 1) {
      if (!this.inBounds(x, y)) return false;
      const v = placed(b.t, b.r, b.f);
      if (samePlaced(this.at(x, y), v)) return false;
      this.set(x, y, v);
      return true;
    }
    const parts = placeParts(b.span, b.r, b.f);
    if (parts.some(([, , px, py]) => !this.inBounds(x + px, y + py))) return false;
    const current = this.at(x, y)?.i;
    const already = parts.every(([sx, sy, px, py]) => {
      const c = this.at(x + px, y + py);
      return (
        !!c &&
        c.t === b.t &&
        c.r === b.r &&
        c.f === b.f &&
        c.i === current &&
        c.p?.[0] === sx &&
        c.p?.[1] === sy
      );
    });
    if (already) return false;
    const id = newInstanceId();
    for (const [sx, sy, px, py] of parts) {
      const v: Placed = Object.freeze({
        t: b.t,
        r: b.r,
        f: b.f,
        i: id,
        p: Object.freeze([sx, sy]) as readonly [number, number],
      });
      this.set(x + px, y + py, v);
    }
    return true;
  }

  /** 填滿：和 (x, y) 同一種、相連的範圍 */
  fill(x: number, y: number, b: Brush): void {
    if (!this.inBounds(x, y)) return;
    const target = this.at(x, y);
    if (b.span[0] === 1 && b.span[1] === 1 && samePlaced(target, placed(b.t, b.r, b.f))) return;
    const seen = new Uint8Array(this.width * this.height);
    const region: [number, number][] = [];
    const queue: number[] = [y * this.width + x];
    seen[queue[0]] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (!sameKind(this.get(i), target)) continue;
      const cx = i % this.width;
      const cy = (i - cx) / this.width;
      region.push([cx, cy]);
      const next: [number, number][] = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of next) {
        if (!this.inBounds(nx, ny)) continue;
        const ni = ny * this.width + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    for (const [ax, ay] of anchorsIn(region, turnedSpan(b.span, b.r))) this.stamp(ax, ay, b);
  }

  /** 圖形：範圍是 (x0, y0)～(x1, y1) 兩格 */
  shape(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    kind: ShapeKind,
    outline: boolean,
    b: Brush,
  ): void {
    const cells = shapeCells(x0, y0, x1, y1, kind, outline);
    for (const [ax, ay] of anchorsIn(cells, turnedSpan(b.span, b.r))) this.stamp(ax, ay, b);
  }

  /** 改過的結果（和原本一模一樣時 null） */
  result(): readonly Cell[] | null {
    if (!this.work) return null;
    for (const i of this.touched) if (!samePlaced(this.base[i], this.work[i])) return this.work;
    return null;
  }

  /** 上次呼叫之後改過的格子 */
  takeRecent(): number[] {
    const out = [...this.recent];
    this.recent = new Set();
    return out;
  }

  /** 目前的內容（畫到一半的預覽用；沒有改過時就是原本的） */
  current(): readonly Cell[] {
    return this.work ?? this.base;
  }
}

/** 填滿／圖形的預覽：會放大圖塊左上角的格子（不改地圖） */
export function shapeAnchors(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: ShapeKind,
  outline: boolean,
  span: readonly [number, number],
): [number, number][] {
  return anchorsIn(shapeCells(x0, y0, x1, y1, kind, outline), span);
}
