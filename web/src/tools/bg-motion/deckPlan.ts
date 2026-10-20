/**
 * 「圖片切換」模式的時間軸與匯出計畫（純函式，規格 3.11.2～3.11.5、3.11.8、F139、F156）：
 * 排段（第一張出現、各張停住與切換、最後一張消失、切回第一張）、影格表、抽籤、緩急曲線、容量上限的調整步驟、檔名。
 */
import { buildSegments, CURVES, type TimelineSegment } from '@/core/timeline';
import {
  type ConcreteKind,
  type DeckEasing,
  type DeckEdge,
  type DeckFormat,
  type DeckSlide,
  type DeckState,
  LIMITS,
  RANDOM_POOL,
  type TransKind,
} from './deck';
import { cleanName, DEFAULT_BASE_NAME, MIB, sourceBaseName } from './logic';

/* ---------- 抽籤（3.11.7） ---------- */

/** 序號 k 在種子 seed 下抽到的效果：24 個效果裡第 (7k + 3 + seed) mod 24 個 */
export function pickRandom(k: number, seed: number): ConcreteKind {
  const n = RANDOM_POOL.length;
  return RANDOM_POOL[(((7 * k + 3 + seed) % n) + n) % n];
}

/** 「隨機」換成抽到的效果；其他原樣 */
export const resolveKind = (kind: TransKind, k: number, seed: number): TransKind =>
  kind === 'random' ? pickRandom(k, seed) : kind;

/** 第一張出現、最後一張消失抽籤用的序號（規格 3.11.7） */
export const INTRO_RANDOM_INDEX = 50;
export const OUTRO_RANDOM_INDEX = 51;

/* ---------- 緩急曲線（3.11.5） ---------- */

/** 段內位置 u（0～1）→ 切換進度 p */
export function easeAt(easing: DeckEasing, u: number): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  if (easing === 'linear') return x;
  return easing === 'out' ? CURVES.cubicOut(x) : CURVES.quadInOut(x);
}

/* ---------- 時間軸（3.11.2） ---------- */

export interface DeckSeg {
  type: 'hold' | 'trans';
  /** 停住的那一張；切換時是前一張（第一張出現＝−1：空白畫面） */
  i: number;
  /** 切換時的後一張（最後一張消失＝−1：空白畫面）；停住時沒有 */
  j?: number;
  /** 切換的實際效果（「隨機」已換成抽到的）；停住時沒有 */
  kind?: ConcreteKind;
  /** 起點（秒）、長度（秒） */
  start: number;
  dur: number;
}

export interface DeckTimeline {
  segs: DeckSeg[];
  total: number;
}

type TimelineInput = Pick<DeckState, 'intro' | 'outro' | 'loopBack' | 'seed'> & {
  slides: readonly Pick<DeckSlide, 'hold' | 'trans' | 'dur'>[];
};

/** 有切換：效果不是「不切換」而且秒數 > 0 */
export const edgeOn = (e: Pick<DeckEdge, 'trans' | 'dur'>): boolean =>
  e.trans !== 'cut' && e.dur > 0;

/** 排出整段動畫的段（起點用逐段累加，和 findSeg 比的是同一個數字） */
export function buildTimeline(d: TimelineInput): DeckTimeline {
  const segs: DeckSeg[] = [];
  const n = d.slides.length;
  let t = 0;
  if (n && edgeOn(d.intro)) {
    segs.push({
      type: 'trans',
      i: -1,
      j: 0,
      kind: resolveKind(d.intro.trans, INTRO_RANDOM_INDEX, d.seed) as ConcreteKind,
      start: t,
      dur: d.intro.dur,
    });
    t += d.intro.dur;
  }
  for (let i = 0; i < n; i++) {
    const s = d.slides[i];
    segs.push({ type: 'hold', i, start: t, dur: s.hold });
    t += s.hold;
    if (i === n - 1 && edgeOn(d.outro)) {
      segs.push({
        type: 'trans',
        i,
        j: -1,
        kind: resolveKind(d.outro.trans, OUTRO_RANDOM_INDEX, d.seed) as ConcreteKind,
        start: t,
        dur: d.outro.dur,
      });
      t += d.outro.dur;
      continue;
    }
    const hasNext = i < n - 1 || (d.loopBack && n > 1);
    if (hasNext && edgeOn(s)) {
      segs.push({
        type: 'trans',
        i,
        j: (i + 1) % n,
        kind: resolveKind(s.trans, i, d.seed) as ConcreteKind,
        start: t,
        dur: s.dur,
      });
      t += s.dur;
    }
  }
  return { segs, total: t };
}

/** t 所在的段：第一個「起 + 長 > t」的段；超過總長取最後一段；沒有段時 undefined */
export function findSeg(segs: readonly DeckSeg[], t: number): DeckSeg | undefined {
  for (const g of segs) if (t < g.start + g.dur) return g;
  return segs[segs.length - 1];
}

/** 時間軸分色用的段（停住＝強調色、切換＝警告色） */
export function deckSegments(segs: readonly DeckSeg[]): TimelineSegment[] {
  return buildSegments(
    segs.map((g, k) => ({
      id: `seg${k}`,
      label: g.type === 'hold' ? '停住' : '切換',
      duration: g.dur,
      color: g.type === 'hold' ? 'var(--accent)' : 'var(--warning)',
    })),
  );
}

/* ---------- 影格表（3.11.3） ---------- */

export interface DeckFrame {
  /** 畫這一格的時間（秒，時間軸上的位置） */
  t: number;
  /** 顯示長度（整數毫秒） */
  d: number;
}

/** 每格至少顯示這麼久（毫秒） */
export const MIN_FRAME_MS = 20;

/** 匯出的影格表：停住一段一格；切換一段 max(1, round(長 × FPS)) 格，畫段內位置 (k + 1) ÷ (n + 1) */
export function framePlan(segs: readonly DeckSeg[], fps: number): DeckFrame[] {
  const out: DeckFrame[] = [];
  for (const g of segs) {
    if (g.type === 'hold') {
      out.push({ t: g.start, d: Math.round(g.dur * 1000) });
      continue;
    }
    const n = Math.max(1, Math.round(g.dur * fps));
    const D = g.dur * 1000;
    for (let k = 0; k < n; k++) {
      out.push({
        t: g.start + (g.dur * (k + 1)) / (n + 1),
        d: Math.round(((k + 1) * D) / n) - Math.round((k * D) / n),
      });
    }
  }
  for (const f of out) f.d = Math.max(MIN_FRAME_MS, f.d);
  return out;
}

/** 影格數（不建整張表） */
export function deckFrameCount(segs: readonly DeckSeg[], fps: number): number {
  let n = 0;
  for (const g of segs) n += g.type === 'hold' ? 1 : Math.max(1, Math.round(g.dur * fps));
  return n;
}

/* ---------- 容量上限的調整（3.11.8） ---------- */

export interface CapState {
  /** WebP 品質 0.1～1 */
  q: number;
  fps: number;
  width: number;
  height: number;
}

/** 上限（位元組）：MB × 1,048,576 */
export const capLimitBytes = (mb: number): number => mb * MIB;

/** 容量調整最多匯出幾次 */
export const CAP_MAX_ATTEMPTS = 8;
const Q_FLOOR = 0.4;
const FPS_FLOOR = 10;
const MIN_SIDE = LIMITS.width.min;

/**
 * 超過上限時的下一步（一次只改一個項目）；ratio＝上限 ÷ 實際大小（< 1）。
 * 畫質（只有 WebP；> 0.4 時降：ratio < 0.5 乘 0.6、否則乘 0.8，最低 0.4）→ FPS（ratio < 0.5、FPS > 10、還沒降過〔等於一開始的 fps0〕時降成
 * max(10, round(FPS × 0.6))）→ 尺寸（乘上 √ratio × 0.93，四捨五入、各至少 16 px）；尺寸沒有變化時回傳 null（停止）。
 */
export function capStep(
  st: CapState,
  ratio: number,
  format: DeckFormat,
  fps0: number,
): CapState | null {
  if (format === 'webp' && st.q > Q_FLOOR) {
    return { ...st, q: Math.max(Q_FLOOR, ratio < 0.5 ? st.q * 0.6 : st.q * 0.8) };
  }
  if (st.fps > FPS_FLOOR && ratio < 0.5 && st.fps === fps0) {
    return { ...st, fps: Math.max(FPS_FLOOR, Math.round(st.fps * 0.6)) };
  }
  const s = Math.sqrt(ratio) * 0.93;
  const width = Math.max(MIN_SIDE, Math.round(st.width * s));
  const height = Math.max(MIN_SIDE, Math.round(st.height * s));
  if (width === st.width && height === st.height) return null;
  return { ...st, width, height };
}

/* ---------- 檔名（F139） ---------- */

/** 下載的檔名主體：<第一張檔名去掉副檔名>[_and_<其餘張數>_more]_切換 */
export const deckFileBase = (names: readonly string[]): string =>
  cleanName(`${sourceBaseName(names) ?? DEFAULT_BASE_NAME}_切換`);
