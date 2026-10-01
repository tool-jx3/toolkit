/**
 * 放大填滿：在畫面的一定比例（預設 92%）範圍內，取文字放得下的最大字級。
 * 外框、陰影等往外擴的距離（pad）算進去：可以是固定 px，也可以跟著字級等比（字級的倍數）。
 *
 * 做法：先以參考字級排一次估出線性比例，再用二分法修正到指定精度（字型的字寬不一定和字級完全成正比）。
 * 斷行沿用參考字級的結果（填滿模式通常只用手動換行）。
 */
import type { TypesetInput, TypesetResult } from './index';

export interface FillOptions {
  /** 畫面寬高 */
  width: number;
  height: number;
  /** 可用範圍佔畫面寬、高的比例（預設 0.92） */
  ratio?: number;
  /** 往外擴的固定距離（px，四周都算） */
  pad?: number;
  /** 往外擴的距離：字級的倍數（例如外框厚度合計 0.14 字級） */
  padPerSize?: number;
  /** 字級上限（px；預設畫面長邊 × 1.2） */
  maxSize?: number;
  /** 字級下限（px，預設 8）；到下限還放不下時就用下限（會超出畫面） */
  minSize?: number;
  /** 精度（px，預設 0.1） */
  precision?: number;
  /**
   * 拿來比較的框（預設區塊的 w × h）。例如以「行數 × 字級 × 行距」當高時傳
   * `(r) => ({ w: r.block.w, h: r.lines.main.length * r.size * leading })`。
   */
  boxOf?: (r: TypesetResult) => { w: number; h: number };
}

export interface FillResult extends TypesetResult {
  /** false：到字級下限仍放不下 */
  fits: boolean;
}

type Typeset = (input: TypesetInput) => TypesetResult;

/**
 * 實作在這裡、由 index.ts 注入 typeset（避免循環引用）。一般請用 index.ts 匯出的 typesetToFill。
 */
export function fillWith(
  typeset: Typeset,
  input: Omit<TypesetInput, 'size'> & { size?: number },
  o: FillOptions,
): FillResult {
  const ratio = o.ratio ?? 0.92;
  const aw = o.width * ratio;
  const ah = o.height * ratio;
  const padFixed = o.pad ?? 0;
  const padK = o.padPerSize ?? 0;
  const maxSize = Math.max(1, o.maxSize ?? Math.max(o.width, o.height) * 1.2);
  const minSize = Math.max(0.5, Math.min(maxSize, o.minSize ?? 8));
  const precision = Math.max(0.001, o.precision ?? 0.1);
  const boxOf = o.boxOf ?? ((r: TypesetResult) => ({ w: r.block.w, h: r.block.h }));

  const REF = 100;
  const first = typeset({ ...input, size: REF });
  const lines = first.lines;
  const at = (S: number) => typeset({ ...input, size: S, fixedLines: lines });
  const fitsAt = (r: TypesetResult) => {
    const b = boxOf(r);
    const pad = padFixed + padK * r.size;
    return b.w + 2 * pad <= aw + 1e-6 && b.h + 2 * pad <= ah + 1e-6;
  };

  /* 線性估計：box ≈ size × (box@REF ÷ REF) */
  const b0 = boxOf(first);
  const perW = b0.w / REF + 2 * padK;
  const perH = b0.h / REF + 2 * padK;
  const limW = perW > 0 ? (aw - 2 * padFixed) / perW : Number.POSITIVE_INFINITY;
  const limH = perH > 0 ? (ah - 2 * padFixed) / perH : Number.POSITIVE_INFINITY;
  let est = Math.min(limW, limH, maxSize);
  if (!Number.isFinite(est)) est = maxSize;
  est = Math.max(minSize, est);

  let r = at(est);
  let lo: number;
  let loR: TypesetResult;
  let hi: number;
  if (fitsAt(r)) {
    lo = est;
    loR = r;
    hi = Math.min(maxSize, est * 1.08 + precision);
    if (hi <= lo + precision / 2) return { ...loR, fits: true };
    const rh = at(hi);
    if (fitsAt(rh)) return { ...rh, fits: true };
  } else {
    hi = est;
    lo = Math.max(minSize, est * 0.9);
    r = at(lo);
    while (!fitsAt(r) && lo > minSize) {
      hi = lo;
      lo = Math.max(minSize, lo * 0.8);
      r = at(lo);
    }
    if (!fitsAt(r)) return { ...r, fits: false };
    loR = r;
  }
  while (hi - lo > precision) {
    const mid = (lo + hi) / 2;
    const rm = at(mid);
    if (fitsAt(rm)) {
      lo = mid;
      loR = rm;
    } else hi = mid;
  }
  return { ...loR, fits: true };
}
