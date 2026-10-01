/**
 * 節點表（時間 → 數值，每段可選曲線）：自訂進度時間表、動作曲線。
 * KeyframeTable 元件（@/ui）用這裡的規則整理節點；工具也可以直接計算。
 *
 * 例（loading-maker 的預設時間表）：
 *   const keys = [
 *     { time: 0, value: 0, curve: 'linear' },
 *     { time: 1, value: 30, curve: 'cubicOut' },
 *     { time: 2, value: 70, curve: 'smoothstep' },
 *     { time: 3, value: 100, curve: 'cubicInOut' },
 *   ];
 *   evaluateKeyframes(keys, 0.25) // ≈ 17.4
 */
import { type CurveName, getCurve } from './curves';

export interface Keyframe {
  /** 秒 */
  time: number;
  value: number;
  /** 「進入這個節點」的曲線（第一個節點的曲線不使用） */
  curve: CurveName | string;
}

/** t 秒時的值：在前後兩個節點之間依後一個節點的曲線內插；超出範圍取頭尾的值 */
export function evaluateKeyframes(keys: readonly Keyframe[], t: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.time) {
      const a = keys[i - 1];
      const span = b.time - a.time;
      const u = span > 0 ? (t - a.time) / span : 1;
      return a.value + (b.value - a.value) * getCurve(b.curve)(u);
    }
  }
  return keys[keys.length - 1].value;
}

/** 節點表的最後一個時間（總長） */
export const keyframesDuration = (keys: readonly Keyframe[]): number =>
  keys.length ? keys[keys.length - 1].time : 0;

export interface KeyframeRules {
  /** 最少、最多幾個節點（預設 2、16） */
  minCount?: number;
  maxCount?: number;
  /** 相鄰節點至少相隔幾秒（預設 0.05） */
  minGap?: number;
  /** 第一個節點固定在這個時間與值（例如 0 秒 0%）；null＝不固定 */
  first?: { time: number; value: number } | null;
  /** 最後一個節點的值固定（例如 100%）；null＝不固定 */
  lastValue?: number | null;
  /** 後面的值不小於前面（自動拉高；預設 true） */
  monotonic?: boolean;
  /** 值的範圍（預設 0～100） */
  valueMin?: number;
  valueMax?: number;
  /** 時間的上限（預設 120 秒） */
  timeMax?: number;
  /** 新增節點的曲線（預設 smoothstep） */
  defaultCurve?: CurveName;
}

const DEFAULT_RULES: Required<Omit<KeyframeRules, 'first' | 'lastValue'>> & {
  first: { time: number; value: number } | null;
  lastValue: number | null;
} = {
  minCount: 2,
  maxCount: 16,
  minGap: 0.05,
  first: { time: 0, value: 0 },
  lastValue: 100,
  monotonic: true,
  valueMin: 0,
  valueMax: 100,
  timeMax: 120,
  defaultCurve: 'smoothstep',
};

const rulesOf = (r?: KeyframeRules) => ({ ...DEFAULT_RULES, ...r });

const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * 整理節點：依時間排序、第一個節點固定、相鄰至少相隔 minGap（往後推）、值夾在範圍內、
 * monotonic 時後面的值不小於前面（自動拉高）、最後一個節點的值固定。不改變節點數。
 */
export function normalizeKeyframes(keys: readonly Keyframe[], rules?: KeyframeRules): Keyframe[] {
  const r = rulesOf(rules);
  const list = keys.map((k) => ({ ...k })).sort((a, b) => a.time - b.time);
  if (!list.length) return list;
  if (r.first) {
    list[0].time = r.first.time;
    list[0].value = r.first.value;
  }
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    k.time = Math.max(0, Math.min(r.timeMax, Number.isFinite(k.time) ? k.time : 0));
    if (i > 0) k.time = Math.max(k.time, list[i - 1].time + r.minGap);
    k.time = round(k.time);
    k.value = Math.max(r.valueMin, Math.min(r.valueMax, Number.isFinite(k.value) ? k.value : 0));
    if (r.monotonic && i > 0) k.value = Math.max(k.value, list[i - 1].value);
    k.value = round(k.value);
  }
  if (r.lastValue !== null && list.length > 1) {
    list[list.length - 1].value = r.lastValue;
  }
  return list;
}

/** 還能不能新增（未滿 maxCount） */
export const canAddKeyframe = (keys: readonly Keyframe[], rules?: KeyframeRules): boolean =>
  keys.length < rulesOf(rules).maxCount;

/** 這個節點能不能刪（頭尾不能刪、至少留 minCount 個） */
export function canRemoveKeyframe(
  keys: readonly Keyframe[],
  index: number,
  rules?: KeyframeRules,
): boolean {
  const r = rulesOf(rules);
  return index > 0 && index < keys.length - 1 && keys.length > r.minCount;
}

/**
 * 新增一個節點：插在時間間隔最大的兩個節點正中間（時間、值取中間），曲線用 defaultCurve。
 * 滿了回傳原本的陣列（同一個參照）。回傳 { keys, index }：新節點的位置。
 */
export function insertKeyframe(
  keys: readonly Keyframe[],
  rules?: KeyframeRules,
): { keys: Keyframe[]; index: number } {
  const r = rulesOf(rules);
  if (keys.length >= r.maxCount || keys.length < 2) return { keys: [...keys], index: -1 };
  let best = 1;
  for (let i = 2; i < keys.length; i++) {
    if (keys[i].time - keys[i - 1].time > keys[best].time - keys[best - 1].time + 1e-9) best = i;
  }
  const a = keys[best - 1];
  const b = keys[best];
  const next: Keyframe = {
    time: round((a.time + b.time) / 2),
    value: round((a.value + b.value) / 2),
    curve: r.defaultCurve,
  };
  const out = [...keys.slice(0, best), next, ...keys.slice(best)];
  return { keys: out, index: best };
}

/** 刪除一個節點（不能刪時回傳原本的內容） */
export function removeKeyframe(
  keys: readonly Keyframe[],
  index: number,
  rules?: KeyframeRules,
): Keyframe[] {
  if (!canRemoveKeyframe(keys, index, rules)) return [...keys];
  return keys.filter((_, i) => i !== index);
}

/** 摘要：「0 秒 0% → 1 秒 30% → …」 */
export function keyframesSummary(
  keys: readonly Keyframe[],
  { unit = '%', timeUnit = ' 秒' }: { unit?: string; timeUnit?: string } = {},
): string {
  const n = (v: number) => String(round(v, 2));
  return keys.map((k) => `${n(k.time)}${timeUnit} ${n(k.value)}${unit}`).join(' → ');
}
