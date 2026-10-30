/**
 * 多選（規格 F90）：框選、Shift＋點選的範圍、好幾個事件一起移動。純計算（互動的時間軸與單元測試共用）。
 */
import { ITEM_H, LABEL_GAP, MIN_BAR, POINT_R, type TimelineLayout } from './layout';
import {
  canonical,
  clampValue,
  type EraArg,
  precisionUnit,
  readTime,
  snapTv,
  type TimeMode,
} from './time';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 事件畫出來的框（像素；以時間軸的左邊為 0）：時間點含標題，期間含色條外的標題 */
export function itemBox(it: TimelineLayout['items'][number], xOf: (v: number) => number): Rect {
  const x1 = xOf(it.a);
  if (it.event.kind === 'point')
    return {
      left: x1 - POINT_R - 2,
      right: x1 + POINT_R + LABEL_GAP + it.labelW,
      top: it.y,
      bottom: it.y + ITEM_H,
    };
  const w = Math.max(MIN_BAR, xOf(it.b) - x1);
  return {
    left: x1,
    right: it.inside ? x1 + w : x1 + w + LABEL_GAP + it.labelW,
    top: it.y,
    bottom: it.y + ITEM_H,
  };
}

const overlaps = (a: Rect, b: Rect) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/**
 * 框選：和框重疊的事件（時間點、期間；背景不算，和 vis-timeline 的 Shift＋點選一樣）。
 * eligible 給了時只算它允許的（篩選中淡化的不算）。
 */
export function boxHits(
  layout: TimelineLayout,
  rect: Rect,
  xOf: (v: number) => number,
  eligible?: (id: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const it of layout.items) {
    if (eligible && !eligible(it.id)) continue;
    if (overlaps(itemBox(it, xOf), rect)) out.push(it.id);
  }
  return out;
}

/**
 * Shift＋點選（參考 vis-timeline 的 multiselect）：從起點的事件到點的事件之間——
 * 兩者所在的列（含中間的列）裡，整個落在兩者的時間範圍（最早的開始～最晚的結束）之內的事件。背景不算（點的兩個本身除外）。
 */
export function rangeHits(
  layout: TimelineLayout,
  anchorId: string,
  clickedId: string,
  eligible?: (id: string) => boolean,
): string[] {
  const find = (id: string) =>
    layout.items.find((x) => x.id === id) ??
    (() => {
      const bg = layout.backgrounds.find((x) => x.id === id);
      return bg ? { row: bg.labelRow, a: bg.a, b: bg.b } : undefined;
    })();
  const a = find(anchorId);
  const b = find(clickedId);
  if (!a || !b) return [clickedId];
  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  const lo = Math.min(a.a, b.a);
  const hi = Math.max(a.b, b.b);
  const out = new Set<string>([anchorId, clickedId]);
  for (const it of layout.items) {
    if (it.row < r0 || it.row > r1) continue;
    if (eligible && !eligible(it.id)) continue;
    if (it.a >= lo && it.b <= hi) out.add(it.id);
  }
  return [...out];
}

export interface GroupItem {
  id: string;
  start: string;
  end: string;
  laneId: string;
  /** 拖曳開始時畫在第幾列 */
  row: number;
}

/**
 * 好幾個事件一起移動：時間移動 dv（被拖的那個吸附後的位移；其他的照自己的寫法對齊：只到日的一次 1 日…），
 * 列移動 dRow（每個照自己的列加 dRow，夾在第一列與最後一列之間；dRow＝0 時泳道不變）。
 * rows 是每一列的泳道 id（主線是空字串）。
 */
export function moveGroup(
  mode: TimeMode,
  ctx: EraArg,
  list: readonly GroupItem[],
  dv: number,
  dRow: number,
  rows: readonly string[],
): { id: string; start: string; end: string; laneId: string }[] {
  return list.map((g) => {
    let { start, end } = g;
    if (dv !== 0) {
      const a = readTime(mode, g.start, ctx);
      if (a) {
        const ns = snapTv(mode, clampValue(mode, a.v + dv), a.p, precisionUnit(mode, a.p), ctx);
        start = canonical(mode, ns, ctx);
        const b = g.end ? readTime(mode, g.end, ctx) : null;
        if (b)
          end = canonical(
            mode,
            snapTv(mode, clampValue(mode, b.v + (ns.v - a.v)), b.p, precisionUnit(mode, b.p), ctx),
            ctx,
          );
      }
    }
    let laneId = g.laneId;
    if (dRow !== 0 && rows.length) {
      const r = Math.min(rows.length - 1, Math.max(0, g.row + dRow));
      laneId = rows[r];
    }
    return { id: g.id, start, end, laneId };
  });
}
