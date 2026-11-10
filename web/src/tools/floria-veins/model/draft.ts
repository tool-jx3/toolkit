/**
 * 草稿（還沒「決定」的線、範圍、格子）的操作（規格 3.3）：點一下加點、完成一筆、退一點、
 * 移動／反轉／旋轉、決定時改到畫布上、刪除時標出會刪掉的東西。純函式；回傳 null 表示這個操作不作用。
 */
import {
  addCells,
  addFill,
  addLines,
  cellsToDelete,
  fillToDelete,
  linesToDelete,
  removeCells,
  removeFill,
  removeLines,
} from './canvas';
import {
  figureSegments,
  mirrorPoints,
  rotatePoints,
  type Segment,
  samePt,
  shiftCells,
  shiftPoints,
} from './geometry';
import type { Cell, Draft, Figure, Kind, Pt, VeinCanvas, VeinFill, VeinLine } from './types';

export function emptyDraft(canvasId: string, kind: Kind, erase: boolean): Draft {
  return { canvasId, kind, erase, figures: [], current: [], cells: [] };
}

/** 草稿裡有沒有東西 */
export const hasContent = (d: Draft | null | undefined): d is Draft =>
  !!d && (d.figures.length > 0 || d.current.length > 0 || d.cells.length > 0);

/**
 * 點一下（已經吸附好的點）：
 * - 直線：兩點一條；第二點和第一點相同時不作用。
 * - 多角形：連續加點；點回起點（3 點以上）＝封閉，再點最後一點（2 點以上）＝到此為止的折線。
 * - 塗色：同多角形，但一次只能一個範圍、點回起點或最後一點（3 點以上）都是封閉。
 * 完成一筆之後再點就開始下一筆（塗色除外）。
 */
export function clickPoint(d: Draft, p: Pt): Draft | null {
  if (d.kind === 'damage') return null;
  if (d.kind === 'fill' && d.figures.length) return null;
  const cur = d.current;
  const n = cur.length;
  const pt: Pt = [p[0], p[1]];
  if (n === 0) return { ...d, current: [pt] };
  const first = cur[0];
  const last = cur[n - 1];
  const finish = (closed: boolean): Draft => ({
    ...d,
    figures: [...d.figures, { pts: cur, closed }],
    current: [],
  });
  switch (d.kind) {
    case 'line':
      if (samePt(pt, first)) return null;
      return { ...d, figures: [...d.figures, { pts: [first, pt], closed: false }], current: [] };
    case 'shape':
      if (n >= 3 && samePt(pt, first)) return finish(true);
      if (samePt(pt, last)) return n >= 2 ? finish(false) : null;
      if (samePt(pt, first)) return null;
      return { ...d, current: [...cur, pt] };
    default:
      if (samePt(pt, first) || samePt(pt, last)) return n >= 3 ? finish(true) : null;
      return { ...d, current: [...cur, pt] };
  }
}

/** 傷害格：加一格（這次的草稿裡已經有的不重複） */
export function addCell(d: Draft, cell: Cell): Draft | null {
  if (d.kind !== 'damage') return null;
  if (d.cells.some((c) => c[0] === cell[0] && c[1] === cell[1])) return null;
  return { ...d, cells: [...d.cells, [cell[0], cell[1]]] };
}

/**
 * 退一點（原作的右鍵）：正在畫的這一筆少最後一點；這一筆是空的時候把上一筆打開
 * （封閉的回到還沒封閉；折線與直線少最後一點）；傷害格少最後一格。
 */
export function stepBack(d: Draft): Draft | null {
  if (d.kind === 'damage') return d.cells.length ? { ...d, cells: d.cells.slice(0, -1) } : null;
  if (d.current.length) return { ...d, current: d.current.slice(0, -1) };
  const f = d.figures[d.figures.length - 1];
  if (!f) return null;
  return {
    ...d,
    figures: d.figures.slice(0, -1),
    current: f.closed ? f.pts : f.pts.slice(0, -1),
  };
}

/**
 * 決定時算進去的幾筆：完成的，加上正在畫的多角形（2 點以上，當成折線）或塗色的範圍（3 點以上，封閉）。
 */
export function pendingFigures(d: Draft): Figure[] {
  const out = [...d.figures];
  if (d.kind === 'shape' && d.current.length >= 2) out.push({ pts: d.current, closed: false });
  if (d.kind === 'fill' && !d.figures.length && d.current.length >= 3)
    out.push({ pts: d.current, closed: true });
  return out;
}

/** 可以按「決定」了嗎 */
export function isReady(d: Draft | null | undefined): boolean {
  if (!d) return false;
  switch (d.kind) {
    case 'damage':
      return d.cells.length > 0;
    case 'line':
      return d.figures.length > 0 && d.current.length === 0;
    case 'shape':
      return (d.figures.length > 0 && d.current.length === 0) || d.current.length >= 2;
    default:
      return d.figures.length > 0 || d.current.length >= 3;
  }
}

/** 決定時的線段（直線、多角形） */
export function pendingSegments(d: Draft): Segment[] {
  return pendingFigures(d).flatMap((f) => figureSegments(f.pts, f.closed));
}

/** 草稿裡所有的點（完成的幾筆＋正在畫的） */
export const draftPoints = (d: Draft): Pt[] => [...d.figures.flatMap((f) => f.pts), ...d.current];

/** 決定：畫或刪，回傳新的畫布（沒有變化時回傳同一個物件） */
export function commitDraft(c: VeinCanvas, d: Draft, color: string): VeinCanvas {
  if (!isReady(d)) return c;
  switch (d.kind) {
    case 'damage':
      return d.erase ? removeCells(c, d.cells) : addCells(c, d.cells);
    case 'fill': {
      const figs = pendingFigures(d);
      if (d.erase)
        return removeFill(
          c,
          figs.flatMap((f) => f.pts),
        );
      return figs.reduce((acc, f) => addFill(acc, f.pts, color), c);
    }
    default: {
      const segs = pendingSegments(d);
      return d.erase ? removeLines(c, segs) : addLines(c, segs, color);
    }
  }
}

export interface Doomed {
  lines: VeinLine[];
  fill: VeinFill | null;
  cells: Cell[];
}

const NOTHING: Doomed = { lines: [], fill: null, cells: [] };

/** 刪除時，現在的草稿會刪掉哪些東西（畫面上標出來；正在畫的那一筆也算進去） */
export function doomedBy(c: VeinCanvas, d: Draft | null | undefined): Doomed {
  if (!d?.erase) return NOTHING;
  switch (d.kind) {
    case 'damage':
      return { ...NOTHING, cells: cellsToDelete(c, d.cells) };
    case 'fill': {
      const pts = d.figures.length ? d.figures[0].pts : d.current.length >= 3 ? d.current : [];
      return { ...NOTHING, fill: fillToDelete(c, pts) };
    }
    default: {
      const segs = [
        ...d.figures.flatMap((f) => figureSegments(f.pts, f.closed)),
        ...figureSegments(d.current, false),
      ];
      return { ...NOTHING, lines: linesToDelete(c, segs) };
    }
  }
}

/* ---------- 移動、反轉、旋轉 ---------- */

/** 移動、反轉、旋轉可以用的畫法（和原作相同：移動是直線、多角形、傷害格；反轉與旋轉是直線、多角形；刪除時都不能） */
export const canShift = (d: Draft | null | undefined): boolean =>
  hasContent(d) && !d.erase && d.kind !== 'fill';
export const canTurn = (d: Draft | null | undefined): boolean =>
  hasContent(d) && !d.erase && (d.kind === 'line' || d.kind === 'shape');

/** 把一串點換掉之後，照原本的分段放回去 */
function splitBack(d: Draft, flat: Pt[]): Draft {
  let i = 0;
  const figures = d.figures.map((f) => {
    const pts = flat.slice(i, i + f.pts.length);
    i += f.pts.length;
    return { ...f, pts };
  });
  return { ...d, figures, current: flat.slice(i) };
}

export function shiftDraft(d: Draft, dx: number, dy: number, size: number): Draft | null {
  if (!canShift(d)) return null;
  if (d.kind === 'damage') {
    const cells = shiftCells(d.cells, dx, dy, size);
    return cells ? { ...d, cells } : null;
  }
  const moved = shiftPoints(draftPoints(d), dx, dy, size);
  return moved ? splitBack(d, moved) : null;
}

export function mirrorDraft(d: Draft, size: number): Draft | null {
  if (!canTurn(d)) return null;
  return splitBack(d, mirrorPoints(draftPoints(d), size));
}

export function rotateDraft(d: Draft, size: number): Draft | null {
  if (!canTurn(d)) return null;
  return splitBack(d, rotatePoints(draftPoints(d), size));
}
