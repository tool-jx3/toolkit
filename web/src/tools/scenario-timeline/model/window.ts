/**
 * 畫面範圍（規格 F30～F32、3.3）：縮放、平移、全覽。純計算。
 * 範圍 { start, end }：時間軸左右兩邊的時間（分鐘或年）。
 * ctx（曆名與架空曆）：架空年有月份時可以放大到看得到日（最短 3 日）；打開「寫到時刻」時最短 60 分（F110）。
 */
import { contentRange, eventSpan, LABEL_GAP, POINT_R, type Span } from './layout';
import { ctxParts, type EraArg, MINUTES_PER_DAY, type TimeMode, valueBounds } from './time';
import { progressValue, type VisibleDoc } from './visible';

export interface Win {
  start: number;
  end: number;
}

const YEAR_MIN = 525960;

/** 畫面範圍長度的上下限 */
export function spanLimits(mode: TimeMode, ctx?: EraArg): { min: number; max: number } {
  if (mode === 'date') return { min: 60, max: 10000 * YEAR_MIN };
  if (mode === 'day') return { min: 60, max: 20000 * MINUTES_PER_DAY };
  const info = ctxParts(ctx).info;
  if (info?.clock) return { min: 60 / (info.D * MINUTES_PER_DAY), max: 1000000 };
  return { min: info ? 3 / info.D : 5, max: 1000000 };
}

/** 畫面可以到的範圍（架空年 ±1000000） */
function viewBounds(mode: TimeMode): { lo: number; hi: number } {
  const bounds = valueBounds(mode);
  return mode === 'year' ? { lo: -1000000, hi: 1000000 } : { lo: bounds.min, hi: bounds.max };
}

/** 畫面範圍最長多少：上限與寫法允許的範圍較短的那個 */
export function maxSpan(mode: TimeMode): number {
  const { lo, hi } = viewBounds(mode);
  return Math.min(spanLimits(mode).max, hi - lo);
}

/** 夾在上下限與允許的範圍內 */
export function clampWindow(mode: TimeMode, w: Win, ctx?: EraArg): Win {
  const lim = spanLimits(mode, ctx);
  const { lo, hi } = viewBounds(mode);
  let span = w.end - w.start;
  if (!Number.isFinite(span) || span <= 0) span = lim.min;
  span = Math.min(maxSpan(mode), Math.max(lim.min, span));
  const mid = (w.start + w.end) / 2;
  let start = Number.isFinite(mid) ? mid - span / 2 : lo;
  if (start < lo) start = lo;
  if (start + span > hi) start = hi - span;
  return { start, end: start + span };
}

/** 以 anchor 為中心縮放（f > 1 放大：範圍變短）；anchor 下的時間不動 */
export function zoomWindow(mode: TimeMode, w: Win, f: number, anchor?: number, ctx?: EraArg): Win {
  const lim = spanLimits(mode, ctx);
  const span = w.end - w.start;
  const next = Math.min(maxSpan(mode), Math.max(lim.min, span / f));
  const at = anchor ?? (w.start + w.end) / 2;
  const ratio = span > 0 ? (at - w.start) / span : 0.5;
  const start = at - ratio * next;
  const out = clampWindow(mode, { start, end: start + next }, ctx);
  return out;
}

export function panWindow(mode: TimeMode, w: Win, dv: number, ctx?: EraArg): Win {
  return clampWindow(mode, { start: w.start + dv, end: w.end + dv }, ctx);
}

/** 縮放到頭了嗎（縮小的上限是長度上限與寫法允許的範圍較短的那個） */
export function zoomState(
  mode: TimeMode,
  w: Win,
  ctx?: EraArg,
): { canIn: boolean; canOut: boolean } {
  const lim = spanLimits(mode, ctx);
  const span = w.end - w.start;
  return { canIn: span > lim.min * 1.0001, canOut: span < maxSpan(mode) * 0.9999 };
}

/** 沒有事件時的畫面範圍（3.3）：today＝今天 0:00；center＝目前進度 */
export function emptyWindow(mode: TimeMode, today: number, center?: number | null): Win {
  if (mode === 'date') {
    if (center !== undefined && center !== null)
      return { start: center - MINUTES_PER_DAY, end: center + MINUTES_PER_DAY };
    return { start: today - MINUTES_PER_DAY, end: today + 2 * MINUTES_PER_DAY };
  }
  if (mode === 'day') return { start: 0, end: 3 * MINUTES_PER_DAY };
  return { start: 0, end: 100 };
}

/**
 * 全覽：範圍前後各留 pad（比例）；只有一個時間點時前後各 1 天（架空年 5 年；有月份時 15 日；
 * 架空曆寫到時刻時和日期時間相同：前後 1 日、最少留 30 分，F110）
 */
export function fitWindow(
  mode: TimeMode,
  range: Span | null,
  today: number,
  pad = 0.04,
  ctx?: EraArg,
): Win {
  if (!range) return clampWindow(mode, emptyWindow(mode, today), ctx);
  const info = mode === 'year' ? ctxParts(ctx).info : null;
  const span = range.b - range.a;
  if (span <= 0) {
    const half = info ? (info.clock ? 1 : 15) / info.D : mode === 'year' ? 5 : MINUTES_PER_DAY;
    return clampWindow(mode, { start: range.a - half, end: range.a + half }, ctx);
  }
  const least = info
    ? info.clock
      ? 30 / (info.D * MINUTES_PER_DAY)
      : 0.5 / info.D
    : mode === 'year'
      ? 0.5
      : 30;
  const margin = Math.max(span * pad, least);
  return clampWindow(mode, { start: range.a - margin, end: range.b + margin }, ctx);
}

/**
 * 全覽（規格 F32、F70）：看得到的事件、標記、目前進度的範圍，前後各留 pad；
 * 右邊再留到最後面的時間點、短期間的標題放得下（時間軸寬 width px 時）。右邊界直接解
 * 「右邊界＝標題的起點＋標題寬÷比例尺（比例尺跟著右邊界變）」，再檢查變窄之後才需要留位置的短期間，到不再變為止。
 */
export function fitWithLabels(
  vdoc: VisibleDoc,
  width: number,
  measure: (text: string) => number,
  today: number,
  pad = 0.04,
): Win {
  const p = progressValue(vdoc);
  let w = fitWindow(vdoc.mode, contentRange(vdoc, p === null ? [] : [p]), today, pad, vdoc);
  const spans = vdoc.events
    .filter((e) => e.kind !== 'background')
    .map((e) => ({ s: eventSpan(vdoc.mode, e, vdoc), px: measure(e.title.trim() || '　') }));
  const W = Math.max(1, width);
  for (let i = 0; i < 12; i++) {
    const k = W / Math.max(1e-9, w.end - w.start);
    let right = w.end;
    for (const { s, px } of spans) {
      if (!s) continue;
      if (!(s.b === s.a || (s.b - s.a) * k < px + 16)) continue;
      /* 標題比時間軸還寬時最多留 85%（其餘照樣切掉） */
      const room = Math.min(px + POINT_R * 2 + LABEL_GAP + 16, W * 0.85);
      if (s.b + room / k <= right + 1e-9) continue;
      right = Math.max(right, (s.b * W - room * w.start) / (W - room));
    }
    if (right <= w.end + (w.end - w.start) * 1e-9) break;
    const next = clampWindow(vdoc.mode, { start: w.start, end: right }, vdoc);
    if (next.end - next.start <= w.end - w.start + 1e-9) break;
    w = next;
  }
  return w;
}

/** 讓 [a, b] 出現在畫面裡（最少的移動；比畫面大時露出開頭） */
export function revealWindow(
  mode: TimeMode,
  w: Win,
  a: number,
  b: number,
  margin = 0.05,
  ctx?: EraArg,
): Win {
  const span = w.end - w.start;
  const m = span * margin;
  if (a >= w.start + m && b <= w.end - m) return w;
  if (b - a > span - 2 * m || a < w.start + m) return panWindow(mode, w, a - m - w.start, ctx);
  return panWindow(mode, w, b + m - w.end, ctx);
}

/** 滑鼠滾輪一格的倍率、觸控板捏合（每 px） */
export const WHEEL_STEP = 1.2;
export const PINCH_PER_PX = 0.01;
export const BUTTON_STEP = 1.5;

/**
 * 滑鼠的滾輪（不是觸控板的雙指捲動）：以「行」「頁」計，或一次 ≥ 50 px 的純直向滾動（沒按 Shift）。
 * 和家系圖的判斷相同（規格 4）。
 */
export function isMouseWheel(e: {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}): boolean {
  return e.deltaMode !== 0 || (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 50 && !e.shiftKey);
}

/** 滾輪事件的縮放倍率（> 1 放大）；不是縮放時 null */
export function wheelZoomFactor(e: {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): number | null {
  if (e.ctrlKey || e.metaKey) {
    if (isMouseWheel(e)) return e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    return Math.exp(-e.deltaY * PINCH_PER_PX);
  }
  if (isMouseWheel(e) && e.deltaY !== 0) return e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
  return null;
}
