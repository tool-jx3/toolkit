/**
 * 時間軸（規格 3.1）：每種型共用同一個節拍——0 秒開始進場、0.16 秒撞進定位（閃光、震動）、
 * 1.25 秒開始退場、1.45 秒退完；1.60 秒以後什麼都不畫。預覽每 2.1 秒重複一次。
 * 時間都是「動畫時間」：速度（倍）只改變播放的快慢與匯出的影格間隔，不改變節拍。
 */
import { buildSegments, clamp01, EASE, type TimelineSegment } from '@/core/timeline';

export const BEAT = {
  /** 撞進定位 */
  land: 0.16,
  /** 開始退場 */
  leave: 1.25,
  /** 退完 */
  gone: 1.45,
  /** 這之後不畫（空白） */
  blank: 1.6,
  /** 預覽一輪 */
  cycle: 2.1,
} as const;

/** 匯出的最後一格取到「退完＋0.04 秒」 */
export const EXPORT_LAST = BEAT.gone + 0.04;
/** 匯出結尾的空白格取在這個時間（已經不畫了） */
export const TAIL_TIME = BEAT.gone + 0.2;

/** a～b 之間的進度（0～1，夾住） */
export const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));

/** 急停（指數，衝進來）／急起（指數，衝出去） */
export const dash = EASE.snap;
export const rush = EASE.slam;

/** 過衝回彈；k 越大衝得越過頭（「升起」用 1.9） */
export const overshoot =
  (k: number) =>
  (u: number): number => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const v = u - 1;
    return 1 + (k + 1) * v * v * v + k * v * v;
  };

/** 閃光：at 之後 0.12 秒內從 0.55 淡到 0（只有中間那段畫） */
export function flashAlpha(t: number, at: number): number {
  const a = 1 - span(t, at, at + 0.12);
  return a > 0 && a < 1 ? a * 0.55 : 0;
}

/** 震動的位移：at 之後 0.14 秒內由強到弱 */
export function quake(t: number, at: number): [number, number] {
  const k = 1 - span(t, at, at + 0.14);
  if (k <= 0 || k >= 1) return [0, 0];
  return [Math.sin(t * 170) * 9 * k, Math.cos(t * 130) * 6 * k];
}

/** 白色剪影的不透明度：from～to 從 1 淡到 0；held＝to 之前（進場中）一直是 1，否則只有淡出的那一段 */
export function whiteout(t: number, from: number, to: number, held: boolean): number {
  const v = 1 - span(t, from, to);
  if (held) return v > 0 ? v : 0;
  return v > 0 && v < 1 ? v : 0;
}

/**
 * 匯出的取樣時間：0、pace ÷ fps、2 × pace ÷ fps…取到 EXPORT_LAST 為止，
 * 再接空白格：重複播放時約 0.35 秒（四捨五入成格數）、只播一次時 1 格（播完變透明）。
 */
export function exportTimes(pace: number, fps: number, once: boolean): number[] {
  const step = pace / fps;
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const t = i * step;
    if (t > EXPORT_LAST + 1e-9) break;
    out.push(t);
  }
  const tail = Math.max(1, Math.round((once ? 0.04 : 0.35) * fps));
  for (let i = 0; i < tail; i++) out.push(TAIL_TIME);
  return out;
}

/** 每格的長度（毫秒，四捨五入） */
export const frameMs = (fps: number): number => Math.round(1000 / fps);

/** 播放列的階段 */
export const SEGMENTS: TimelineSegment[] = buildSegments([
  { id: 'in', label: '進場', duration: BEAT.land },
  { id: 'hold', label: '停留', duration: BEAT.leave - BEAT.land },
  { id: 'out', label: '退場', duration: BEAT.gone - BEAT.leave },
  { id: 'rest', label: '空白', duration: BEAT.cycle - BEAT.gone },
]);
