/**
 * 時間軸工具：數學、影格換算、階段（進場／停留／退場…）。
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 把 v 從 [a, b] 換算到 [c, d]（不夾住） */
export const remap = (v: number, a: number, b: number, c: number, d: number): number =>
  b === a ? c : c + ((v - a) * (d - c)) / (b - a);

/** 影格數＝總長×fps 無條件進位（至少 1） */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}

/**
 * 第 i 格（共 n 格）的取樣時間。
 * - endInclusive（預設）：最後一格固定取在總長的最後一刻，動畫停在完成狀態（文字演出、轉場）。
 * - 無縫循環的動畫傳 false：一律取 i/fps，最後一格不會和第一格重複。
 */
export function frameTime(
  i: number,
  n: number,
  duration: number,
  fps: number,
  endInclusive = true,
): number {
  if (endInclusive && i === n - 1) return duration;
  return Math.min(duration, i / fps);
}

/** t 在 [start, start + length] 之間的進度 0～1 */
export function progress(t: number, start: number, length: number): number {
  return length <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / length);
}

/** 時間軸上的一段（Transport 會用顏色標出來） */
export interface TimelineSegment {
  id: string;
  label: string;
  start: number;
  end: number;
  /** CSS 顏色；不填時 Transport 依序配色 */
  color?: string;
}

/** 依序排列各階段：[{ id: 'in', label: '進場', duration: 0.6 }, …] → 有起訖時間的區段 */
export function buildSegments(
  parts: readonly { id: string; label: string; duration: number; color?: string }[],
): TimelineSegment[] {
  let t = 0;
  return parts.map((p) => {
    const seg = {
      id: p.id,
      label: p.label,
      start: t,
      end: t + Math.max(0, p.duration),
      color: p.color,
    };
    t = seg.end;
    return seg;
  });
}

/** 總長 */
export const segmentsDuration = (segs: readonly TimelineSegment[]): number =>
  segs.reduce((m, s) => Math.max(m, s.end), 0);

/** t 所在的區段（落在交界時取後面那段）與段內進度 */
export function segmentAt(
  t: number,
  segs: readonly TimelineSegment[],
): { segment: TimelineSegment; index: number; progress: number } | null {
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (t >= s.start && (t <= s.end || i === segs.length - 1)) {
      return { segment: s, index: i, progress: progress(t, s.start, s.end - s.start) };
    }
  }
  return null;
}

/** 1.25 → "1.25 秒" */
export function formatSeconds(t: number, digits = 2): string {
  return `${t.toFixed(digits)} 秒`;
}
