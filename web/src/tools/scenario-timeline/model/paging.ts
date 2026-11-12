/**
 * A4 自動分頁（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「自動ページ分割」，規格 F141、3.17）：
 * 一張很長的時間軸照時間切成好幾頁，每頁接近 A4 橫（√2：1）；切在格線上、盡量不切過事件。
 * KT 的時間是由上往下，切的是縱長的圖；本站的時間是由左往右，切的是橫長的圖（同樣的比例尺，每頁再畫一次刻度與泳道名稱）。純計算。
 */
import type { Span } from './layout';

/** A4 橫的長寬比 */
export const A4_RATIO = Math.SQRT2;
/** 剩下的不到一頁的 1.28 倍時併進最後一頁（KT 相同） */
export const ABSORB = 1.28;
/** 一頁最少多寬（px，圖的座標）：泳道少、圖很矮時頁不會切得太碎 */
export const MIN_PAGE_W = 960;
/** 每頁的長邊（PNG 的 px） */
export const PAGE_SIZES = [1600, 2400, 3600] as const;

export interface PageInput {
  /** 整張圖的時間範圍 */
  range: Span;
  /** 1 個時間單位是幾 px */
  k: number;
  /** 泳道名稱欄的寬（每頁都有） */
  laneW: number;
  /** 一頁的高（整張圖的高；每頁差不多） */
  height: number;
  /** 期間（切過一個 +10 分）與背景（+5 分）的範圍 */
  bars: readonly Span[];
  backgrounds?: readonly Span[];
  /** 可以切的位置（格線） */
  cuts: readonly number[];
}

/** 一頁的時間軸要多寬（px） */
export function idealTrackWidth(laneW: number, height: number): number {
  return Math.max(300, Math.max(MIN_PAGE_W, Math.round(height * A4_RATIO)) - laneW);
}

/** 切過幾個（期間 10 分、背景 5 分）＋離理想位置的距離（每一頁的寬 1.5 分） */
function cutScore(v: number, target: number, pageSpan: number, p: PageInput): number {
  let n = 0;
  for (const s of p.bars) if (s.a < v && s.b > v) n += 10;
  for (const s of p.backgrounds ?? []) if (s.a < v && s.b > v) n += 5;
  return n + (Math.abs(v - target) / pageSpan) * 1.5;
}

/**
 * 分頁：每一頁的時間範圍（一頁放得下時只有一頁）。剩下的不到兩頁（但超過 1.28 頁）時對半切
 * （第五批驗證後：以前照一頁的寬切，最後一頁只剩 0.3 頁、變得接近正方形）
 */
export function planPages(p: PageInput): Span[] {
  const { range, k } = p;
  const total = (range.b - range.a) * k;
  const track = idealTrackWidth(p.laneW, p.height);
  if (!(k > 0) || total <= track * ABSORB) return [{ a: range.a, b: range.b }];
  const pageSpan = track / k;
  const cuts = [...p.cuts].filter((v) => v > range.a && v < range.b).sort((x, y) => x - y);
  const pages: Span[] = [];
  let cur = range.a;
  for (let guard = 0; guard < 500; guard++) {
    const rest = range.b - cur;
    if (rest * k <= track * ABSORB) break;
    const half = rest < pageSpan * 2;
    const target = half ? cur + rest / 2 : cur + pageSpan;
    const lo = half ? cur + rest * 0.4 : cur + pageSpan * 0.75;
    const hi = half ? cur + rest * 0.6 : Math.min(cur + pageSpan * 1.2, range.b - pageSpan * 0.8);
    let best = target;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const v of cuts) {
      if (v < lo) continue;
      if (v > hi) break;
      const sc = cutScore(v, target, pageSpan, p);
      if (sc < bestScore) {
        bestScore = sc;
        best = v;
      }
    }
    if (!Number.isFinite(bestScore)) best = Math.min(target, range.b);
    pages.push({ a: cur, b: best });
    cur = best;
  }
  pages.push({ a: cur, b: range.b });
  return pages;
}

/** 每頁的倍率：長邊是 size px */
export const pageScale = (w: number, h: number, size: number) => size / Math.max(1, w, h);

/** 頁碼「第 01／02 頁」 */
export const pageLabel = (i: number, n: number) =>
  `第 ${String(i).padStart(2, '0')}／${String(n).padStart(2, '0')} 頁`;
