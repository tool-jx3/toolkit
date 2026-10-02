/**
 * 時間：總長的組成（3.2）、進度條的進度（F59～F70）、開場淡入與結尾動作的階段、對齊整圈長度（F116）、
 * 匯出的影格取樣（3.10）、檔名（3.11）。全部是純函式。
 */
import type { EasingFn } from '@/core/timeline';
import { CURVES, irregularCurve, type Keyframe, sampledFrames, smoothstep } from '@/core/timeline';
import { DEFAULT_FILE_STEM, type LmSettings, type ProgressCurve } from './settings';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 時間曲線：八種之一；不規則依種子（同一個種子每次相同） */
export function progressCurve(name: ProgressCurve | string, seed: number): EasingFn {
  if (name === 'irregular') return irregularCurve(seed);
  return (CURVES as Record<string, EasingFn>)[name] ?? CURVES.linear;
}

/**
 * 自訂時間表在 t 秒時的值（0～100）：兩節點之間依後一個節點的曲線內插；
 * 不規則曲線每一段的種子不同（種子＋段號 × 97）。
 */
export function evaluateSchedule(keys: readonly Keyframe[], t: number, seed: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.time) {
      const a = keys[i - 1];
      const span = Math.max(1e-6, b.time - a.time);
      const u = clamp((t - a.time) / span, 0, 1);
      return a.value + (b.value - a.value) * progressCurve(b.curve, seed + i * 97)(u);
    }
  }
  return keys[keys.length - 1].value;
}

/** 到達 100% 的時間（進度條）或長度欄（其他種類） */
export function progressDuration(s: LmSettings): number {
  if (s.loader.type === 'bar' && s.bar.mode === 'keyframes') {
    const last = s.bar.keys[s.bar.keys.length - 1]?.time ?? 0;
    if (last > 0) return clamp(last, 0.1, 120);
  }
  return clamp(s.duration, 0.1, 120);
}

/** 開場淡入的秒數（只有進度條） */
export const fadeInDuration = (s: LmSettings): number =>
  s.loader.type === 'bar' && s.bar.fadeIn ? clamp(s.bar.fadeInDuration, 0.1, 10) : 0;

/** 結尾動作的秒數（只有進度條、結尾不是「無」） */
export const vanishDuration = (s: LmSettings): number =>
  s.loader.type === 'bar' && s.bar.vanish !== 'none' ? clamp(s.bar.vanishDuration, 0.1, 10) : 0;

/** 結尾動作開始的時間：淡入＋到達時間＋停留 */
export function completionStart(s: LmSettings): number {
  if (s.loader.type !== 'bar') return progressDuration(s);
  return fadeInDuration(s) + progressDuration(s) + clamp(s.bar.hold, 0, 20);
}

/** 總長（3.2）：進度條＝〔淡入〕＋到達時間＋停留＋結尾；其他＝長度欄。例：預設 0＋3＋0.35＋0.7＝4.05 */
export function totalDuration(s: LmSettings): number {
  if (s.loader.type !== 'bar') return progressDuration(s);
  return Math.max(0.1, completionStart(s) + vanishDuration(s));
}

/** 內容時間：淡入期間停在第 0 秒，之後扣掉淡入（F84） */
export const contentTime = (s: LmSettings, t: number): number => Math.max(0, t - fadeInDuration(s));

/** 淡入階段：active 時畫面＝第 0 秒的畫面 × alpha（S 形） */
export function fadeInPhase(s: LmSettings, t: number): { active: boolean; alpha: number } {
  const d = fadeInDuration(s);
  if (d <= 0 || t >= d) return { active: false, alpha: 1 };
  return { active: true, alpha: smoothstep(clamp(t / d, 0, 1)) };
}

/** 結尾階段：active 時 p＝0～1（1＝全空） */
export function completionPhase(s: LmSettings, t: number): { active: boolean; p: number } {
  if (s.loader.type !== 'bar' || s.bar.vanish === 'none') return { active: false, p: 0 };
  const start = completionStart(s);
  if (t < start) return { active: false, p: 0 };
  return { active: true, p: clamp((t - start) / Math.max(0.1, s.bar.vanishDuration), 0, 1) };
}

/**
 * 進度條在內容時間 ct 的填滿比例（0～1）：依進度方式把時間對應成 0～1，再從起點走到終點；
 * 自訂時間表直接照節點。
 */
export function barProgress(s: LmSettings, ct: number): number {
  if (s.bar.mode === 'keyframes')
    return clamp(evaluateSchedule(s.bar.keys, ct, s.loader.seed) / 100, 0, 1);
  const d = Math.max(0.001, progressDuration(s));
  const eased = progressCurve(s.bar.mode, s.loader.seed)(clamp(ct / d, 0, 1));
  const a = Math.min(s.bar.start, s.bar.end) / 100;
  const b = Math.max(s.bar.start, s.bar.end) / 100;
  return clamp(a + (b - a) * eased, 0, 1);
}

/** 循環型的內容（循環動畫、換圖列循環型）：匯出取樣不含終點 */
export const isLooping = (s: LmSettings): boolean =>
  s.loader.type === 'loop' || (s.loader.type === 'row' && s.row.mode === 'loop');

/**
 * 匯出的影格表（3.10）：格數＝總長 × FPS 四捨五入、至少 2；每格延遲相同；
 * 進度型第 k 格畫 k ÷ (n − 1) × 總長（含頭尾），循環型畫 k ÷ n × 總長。
 */
export function exportFrames(s: LmSettings, fps = s.export.fps) {
  return sampledFrames({
    duration: totalDuration(s),
    fps,
    sampling: isLooping(s) ? 'loop' : 'ends',
  });
}

/**
 * 對齊整圈長度（F116）：長度改成「現有長度裡完整轉完的圈數 ÷ 速度」，至少 1 圈、至少 0.25 秒。
 * 例：速度 1.2、3 秒 → 3 圈 2.5 秒；速度 0.3、3 秒 → 1 圈 3.333333 秒（延長）。
 */
export function seamlessLoop(duration: number, speed: number) {
  const v = Math.max(0.05, Math.abs(speed));
  const current = clamp(duration, 0.25, 120);
  const minimum = Math.max(1, Math.ceil(0.25 * v - 1e-9));
  const completed = Math.floor(current * v + 1e-9);
  const cycles = Math.max(minimum, completed);
  return { cycles, duration: cycles / v, extended: completed < minimum };
}

/** 循環動畫轉了幾圈（長度 × 速度） */
export const loopRotations = (s: LmSettings): number => totalDuration(s) * Math.abs(s.loop.speed);

/** 圈數是整數＝首尾無縫 */
export const isSeamless = (rotations: number): boolean =>
  Math.abs(rotations - Math.round(rotations)) < 1e-8;

/** 換圖列是否用到亂數（順序或任一組圖片的分配） */
export const rowUsesRandom = (s: LmSettings): boolean =>
  s.row.order === 'random' ||
  s.row.targetOrder === 'random' ||
  (s.row.start === 'images' && s.row.startOrder === 'random');

/** 換圖列的輪數（用到亂數時＝隨機重複次數） */
export const rowRounds = (s: LmSettings): number =>
  rowUsesRandom(s) ? Math.max(1, Math.round(s.row.repeats)) : 1;

/**
 * 檔名主體（3.11）：去掉頭尾空白，`\ / : * ? " < > |` 與空白換成 -，連續的 - 合併，去掉頭尾的 - 與 .；
 * 空的時用英文預設名。中日韓文字保留。例：「我的 動畫/v1:測試」→ 我的-動畫-v1-測試。
 */
export function fileStem(name: string, fallback = DEFAULT_FILE_STEM): string {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || fallback;
}

/** 格式 → 副檔名（APNG 用 .png） */
export const formatExt = (format: string): string =>
  format === 'apng' ? 'png' : format === 'webp' ? 'webp' : 'gif';

/** 數字顯示：去掉多餘的 0（3.333333、2.5） */
export const trimNumber = (v: number, digits = 6): string => String(Number(v.toFixed(digits)));
