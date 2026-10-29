/**
 * 時間軸的排版（規格 F24、F27、F33、3.8）：哪些列（主線、泳道、子泳道；收合）、每個事件在哪一列的哪一層。
 * 互動的時間軸與匯出的圖共用。堆疊參考 vis-timeline 的做法（依開始排、往下放到不重疊的地方），
 * 這裡每層一樣高，所以是「放進第一個放得下的層」。純計算。
 */
import { afterUnit, readTime, type TimeMode } from './time';
import type { VisibleDoc, VisibleEvent, VisibleLane } from './visible';

export const ITEM_H = 22;
export const LEVEL_GAP = 4;
export const ROW_PAD = 6;
export const POINT_R = 5;
export const LABEL_GAP = 5;
export const H_GAP = 8;
export const INSIDE_PAD = 8;
export const MIN_BAR = 6;

export const rowHeight = (levels: number) =>
  ROW_PAD * 2 + Math.max(1, levels) * ITEM_H + (Math.max(1, levels) - 1) * LEVEL_GAP;

export interface Span {
  a: number;
  b: number;
}

/** 解讀過的範圍（同一個事件物件、同樣的寫法只解讀一次：縮放時重新排版不用再解讀時間） */
const spanCache = new WeakMap<object, { mode: TimeMode; era: string; span: Span | null }>();

/** 事件在時間軸上的範圍（時間點 b＝a；期間的結束含整個單位；PL 版只到目前進度時剪掉） */
export function eventSpan(mode: TimeMode, e: VisibleEvent, era: string): Span | null {
  const hit = spanCache.get(e);
  if (hit && hit.mode === mode && hit.era === era) return hit.span;
  const span = computeSpan(mode, e, era);
  spanCache.set(e, { mode, era, span });
  return span;
}

function computeSpan(mode: TimeMode, e: VisibleEvent, era: string): Span | null {
  const a = readTime(mode, e.start, era);
  if (!a) return null;
  if (e.kind === 'point') return { a: a.v, b: a.v };
  const end = readTime(mode, e.end, era);
  let b = end ? afterUnit(mode, end) : a.v;
  if (e.clipEnd !== undefined) b = Math.min(b, e.clipEnd);
  return { a: a.v, b: Math.max(a.v, b) };
}

export interface RowLayout {
  /** 主線是空字串，其他是泳道 id */
  key: string;
  lane: VisibleLane | null;
  depth: 0 | 1;
  hasChildren: boolean;
  collapsed: boolean;
  /** PL 版看不到（GM 檢視畫斜線） */
  secret: boolean;
  y: number;
  height: number;
  levels: number;
}

export interface ItemLayout {
  id: string;
  event: VisibleEvent;
  row: number;
  level: number;
  a: number;
  b: number;
  /** 以 origin 為 0 的像素位置 */
  x1: number;
  x2: number;
  label: string;
  labelW: number;
  /** 期間的標題畫在色條裡 */
  inside: boolean;
  /** 列的頂端＋層的位置 */
  y: number;
}

export interface BackgroundLayout {
  id: string;
  event: VisibleEvent;
  /** null＝整個時間軸（主線的背景） */
  row: number | null;
  a: number;
  b: number;
}

export interface TimelineLayout {
  rows: RowLayout[];
  items: ItemLayout[];
  backgrounds: BackgroundLayout[];
  height: number;
  origin: number;
}

export interface LayoutOptions {
  k: number;
  /** 事件標題的寬度（px） */
  measure: (text: string) => number;
  collapsed: Readonly<Record<string, boolean>>;
  untitled: string;
}

/** 列（主線在最上面：沒有泳道、或主線有事件時才有） */
export function layoutRows(
  vdoc: VisibleDoc,
  collapsed: Readonly<Record<string, boolean>>,
): Omit<RowLayout, 'y' | 'height' | 'levels'>[] {
  const ids = new Set(vdoc.lanes.map((l) => l.id));
  const mainUsed = vdoc.events.some(
    (e) => e.kind !== 'background' && (!e.laneId || !ids.has(e.laneId)),
  );
  const rows: Omit<RowLayout, 'y' | 'height' | 'levels'>[] = [];
  if (!vdoc.lanes.length || mainUsed)
    rows.push({
      key: '',
      lane: null,
      depth: 0,
      hasChildren: false,
      collapsed: false,
      secret: false,
    });
  for (const l of vdoc.lanes) {
    if (l.parentId && ids.has(l.parentId)) continue;
    const kids = vdoc.lanes.filter((c) => c.parentId === l.id);
    const isCollapsed = kids.length > 0 && !!collapsed[l.id];
    rows.push({
      key: l.id,
      lane: l,
      depth: 0,
      hasChildren: kids.length > 0,
      collapsed: isCollapsed,
      secret: l.secret,
    });
    if (!isCollapsed)
      for (const c of kids)
        rows.push({
          key: c.id,
          lane: c,
          depth: 1,
          hasChildren: false,
          collapsed: false,
          secret: c.secret,
        });
  }
  return rows;
}

/** 事件畫在哪一列（收合的上層＝上層那一列；找不到的泳道＝主線） */
export function displayRowKey(
  vdoc: Pick<VisibleDoc, 'lanes'>,
  laneId: string,
  rowKeys: ReadonlySet<string>,
): string {
  if (!laneId) return '';
  if (rowKeys.has(laneId)) return laneId;
  const lane = vdoc.lanes.find((l) => l.id === laneId);
  if (lane?.parentId && rowKeys.has(lane.parentId)) return lane.parentId;
  return '';
}

export interface StackInput {
  index: number;
  left: number;
  right: number;
}

/** 放進第一個放得下的層；回傳每一個的層號（依輸入的順序）與層數 */
export function stackLevels(
  list: readonly StackInput[],
  gap = H_GAP,
): { levels: number[]; count: number } {
  const order = [...list].sort((p, q) => p.left - q.left || q.right - p.right || p.index - q.index);
  const ends: number[] = [];
  const levels = new Array<number>(list.length).fill(0);
  for (const it of order) {
    let lv = ends.findIndex((end) => end + gap <= it.left);
    if (lv < 0) {
      lv = ends.length;
      ends.push(it.right);
    } else ends[lv] = it.right;
    levels[it.index] = lv;
  }
  return { levels, count: Math.max(1, ends.length) };
}

/** 一個事件佔的水平範圍（像素；時間點含右邊的標題，期間的標題放不進去時也含） */
export function itemExtent(
  kind: VisibleEvent['kind'],
  x1: number,
  x2: number,
  labelW: number,
): { left: number; right: number; inside: boolean } {
  if (kind === 'point')
    return { left: x1 - POINT_R, right: x1 + POINT_R + LABEL_GAP + labelW, inside: false };
  const w = Math.max(MIN_BAR, x2 - x1);
  const inside = w >= labelW + INSIDE_PAD * 2;
  return { left: x1, right: inside ? x1 + w : x1 + w + LABEL_GAP + labelW, inside };
}

export function layoutTimeline(vdoc: VisibleDoc, o: LayoutOptions): TimelineLayout {
  const base = layoutRows(vdoc, o.collapsed);
  const rowIndex = new Map(base.map((r, i) => [r.key, i]));
  const rowKeys = new Set(rowIndex.keys());
  const spans = new Map<string, Span>();
  let origin = Number.POSITIVE_INFINITY;
  for (const e of vdoc.events) {
    const s = eventSpan(vdoc.mode, e, vdoc.era);
    if (!s) continue;
    spans.set(e.id, s);
    if (s.a < origin) origin = s.a;
  }
  if (!Number.isFinite(origin)) origin = 0;

  const perRow: { e: VisibleEvent; s: Span; label: string; labelW: number }[][] = base.map(
    () => [],
  );
  const backgrounds: BackgroundLayout[] = [];
  for (const e of vdoc.events) {
    const s = spans.get(e.id);
    if (!s) continue;
    const key = displayRowKey(vdoc, e.laneId, rowKeys);
    if (e.kind === 'background') {
      backgrounds.push({
        id: e.id,
        event: e,
        row: key === '' ? null : (rowIndex.get(key) ?? null),
        a: s.a,
        b: s.b,
      });
      continue;
    }
    const r = rowIndex.get(key) ?? 0;
    if (!perRow[r]) continue;
    const label = e.title.trim() || o.untitled;
    perRow[r].push({ e, s, label, labelW: Math.ceil(o.measure(label)) });
  }

  const items: ItemLayout[] = [];
  const rows: RowLayout[] = [];
  let y = 0;
  base.forEach((row, r) => {
    const list = perRow[r] ?? [];
    const geo = list.map((it, index) => {
      const x1 = (it.s.a - origin) * o.k;
      const x2 = (it.s.b - origin) * o.k;
      return { index, x1, x2, ...itemExtent(it.e.kind, x1, x2, it.labelW) };
    });
    const { levels, count } = stackLevels(geo);
    const height = rowHeight(count);
    rows.push({ ...row, y, height, levels: count });
    list.forEach((it, i) => {
      items.push({
        id: it.e.id,
        event: it.e,
        row: r,
        level: levels[i],
        a: it.s.a,
        b: it.s.b,
        x1: geo[i].x1,
        x2: geo[i].x2,
        label: it.label,
        labelW: it.labelW,
        inside: geo[i].inside,
        y: y + ROW_PAD + levels[i] * (ITEM_H + LEVEL_GAP),
      });
    });
    y += height;
  });
  return { rows, items, backgrounds, height: y, origin };
}

/** 所有看得到的東西的時間範圍（全覽用；沒有時 null） */
export function contentRange(vdoc: VisibleDoc, extra: readonly number[] = []): Span | null {
  let a = Number.POSITIVE_INFINITY;
  let b = Number.NEGATIVE_INFINITY;
  for (const e of vdoc.events) {
    const s = eventSpan(vdoc.mode, e, vdoc.era);
    if (!s) continue;
    a = Math.min(a, s.a);
    b = Math.max(b, s.b);
  }
  for (const m of vdoc.markers) {
    const t = readTime(vdoc.mode, m.time, vdoc.era);
    if (!t) continue;
    a = Math.min(a, t.v);
    b = Math.max(b, t.v);
  }
  for (const v of extra) {
    a = Math.min(a, v);
    b = Math.max(b, v);
  }
  return Number.isFinite(a) ? { a, b } : null;
}

/** 範圍 [a, b] 裡有沒有看得到的東西：和範圍重疊的事件、範圍裡的標記與 extra（目前進度） */
export function hasContentIn(vdoc: VisibleDoc, span: Span, extra: readonly number[] = []): boolean {
  for (const e of vdoc.events) {
    const s = eventSpan(vdoc.mode, e, vdoc.era);
    if (s && s.a <= span.b && s.b >= span.a) return true;
  }
  for (const m of vdoc.markers) {
    const t = readTime(vdoc.mode, m.time, vdoc.era);
    if (t && t.v >= span.a && t.v <= span.b) return true;
  }
  return extra.some((v) => v >= span.a && v <= span.b);
}
