/**
 * 畫布的資料操作（規格 3.5）：加線、刪線、塗色、傷害格、清空。純函式，回傳新的畫布。
 */
import { cellKey, ptKey, type Segment, sameSegment, segKey } from './geometry';
import type { Cell, Pt, VeinCanvas, VeinFill, VeinLine } from './types';

export function newCanvas(id: string, name: string, size: number): VeinCanvas {
  return { id, name, size, lines: [], fills: [], damage: [] };
}

/** 清空（原作的「初期化」）：名字與格數不變 */
export function clearCanvas(c: VeinCanvas): VeinCanvas {
  return { ...c, lines: [], fills: [], damage: [] };
}

export const isEmptyCanvas = (c: VeinCanvas): boolean =>
  !c.lines.length && !c.fills.length && !c.damage.length;

/**
 * 加線：長度 0 的不加；已經有同一條線（不分方向）時換成新的顏色、移到最上面（不重複加一條）。
 */
export function addLines(c: VeinCanvas, segs: readonly Segment[], color: string): VeinCanvas {
  const lines = [...c.lines];
  for (const [a, b] of segs) {
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const i = lines.findIndex((l) => sameSegment([l.a, l.b], [a, b]));
    if (i >= 0) lines.splice(i, 1);
    lines.push({ a: [a[0], a[1]], b: [b[0], b[1]], color });
  }
  return { ...c, lines };
}

/** 會被刪掉的線：和選取的線段相同（不分方向）的畫上去的線 */
export function linesToDelete(c: VeinCanvas, segs: readonly Segment[]): VeinLine[] {
  const keys = new Set(segs.map(segKey));
  return c.lines.filter((l) => keys.has(segKey([l.a, l.b])));
}

export function removeLines(c: VeinCanvas, segs: readonly Segment[]): VeinCanvas {
  const doomed = new Set(linesToDelete(c, segs));
  return doomed.size ? { ...c, lines: c.lines.filter((l) => !doomed.has(l)) } : c;
}

const vertexSet = (pts: readonly Pt[]) => new Set(pts.map(ptKey));

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((k) => b.has(k));

/**
 * 加塗色：頂點相同的塗色已經有了時換成新的顏色、移到最上面（不重複加一層）。
 * 不到 3 個不同的頂點不加。
 */
export function addFill(c: VeinCanvas, pts: readonly Pt[], color: string): VeinCanvas {
  const clean = dedupeRing(pts);
  if (vertexSet(clean).size < 3) return c;
  const key = vertexSet(clean);
  const fills = c.fills.filter((f) => !sameSet(vertexSet(f.pts), key));
  fills.push({ pts: clean.map((p): Pt => [p[0], p[1]]), color });
  return { ...c, fills };
}

/** 去掉連續重複的點，以及最後回到起點的那一點 */
export function dedupeRing(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  while (out.length > 1 && ptKey(out[0]) === ptKey(out[out.length - 1])) out.pop();
  return out;
}

/**
 * 會被刪掉的塗色：頂點全部都在選取的點裡的塗色。頂點和選取完全相同的那一個優先；
 * 沒有完全相同的時候刪最後加的那一個（和原作相同：一次刪一個）。
 */
export function fillToDelete(c: VeinCanvas, pts: readonly Pt[]): VeinFill | null {
  const sel = vertexSet(pts);
  if (!sel.size) return null;
  const candidates = c.fills.filter((f) => f.pts.every((p) => sel.has(ptKey(p))));
  if (!candidates.length) return null;
  return (
    candidates.find((f) => sameSet(vertexSet(f.pts), sel)) ?? candidates[candidates.length - 1]
  );
}

export function removeFill(c: VeinCanvas, pts: readonly Pt[]): VeinCanvas {
  const f = fillToDelete(c, pts);
  return f ? { ...c, fills: c.fills.filter((x) => x !== f) } : c;
}

/** 加傷害格（已經標過的不重複；超出畫布的略過） */
export function addCells(c: VeinCanvas, cells: readonly Cell[]): VeinCanvas {
  const have = new Set(c.damage.map(cellKey));
  const damage = [...c.damage];
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= c.size || y >= c.size) continue;
    const k = cellKey([x, y]);
    if (have.has(k)) continue;
    have.add(k);
    damage.push([x, y]);
  }
  return damage.length === c.damage.length ? c : { ...c, damage };
}

export function cellsToDelete(c: VeinCanvas, cells: readonly Cell[]): Cell[] {
  const keys = new Set(cells.map(cellKey));
  return c.damage.filter((d) => keys.has(cellKey(d)));
}

export function removeCells(c: VeinCanvas, cells: readonly Cell[]): VeinCanvas {
  const keys = new Set(cells.map(cellKey));
  const damage = c.damage.filter((d) => !keys.has(cellKey(d)));
  return damage.length === c.damage.length ? c : { ...c, damage };
}
