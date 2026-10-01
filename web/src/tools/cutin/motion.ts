/**
 * 文字動態（規格 3.9）：以畫布中心為縮放與旋轉的中心，t 是循環進度（0～1），t＝1 回到 t＝0。
 * - 脈動縮放：1 ＋ 幅度 × sin(2πt)
 * - 上下彈跳：往上 幅度 × 短邊 × |sin(πt)|（半個正弦拱形，落地時是尖的）
 * - 隨機抖動：依種子的週期平滑雜訊，水平與垂直各自不超過 幅度 × 短邊
 * - 整體旋轉：圈數 × 360° × t，順時針等速
 * - 逐字波浪：第 k 個字（共 n 個）往下 幅度 × 字級 × sin(2π(t − k ÷ n))
 */
import type { BlockTransform, GlyphOffset } from '@/core/textfx';
import { loopNoise2 } from '@/core/timeline';
import type { MotionKind } from './model';

export interface MotionInput {
  motion: MotionKind;
  /** 幅度（已套用用途的自動調整）；旋轉是圈數 */
  amount: number;
  width: number;
  height: number;
  /** 字級（逐字波浪） */
  fontSize: number;
  /** 字數（逐字波浪） */
  glyphCount: number;
  seed: number;
}

export interface MotionState {
  transform?: BlockTransform;
  offset?: GlyphOffset;
}

const TAU = Math.PI * 2;

export function motionAt(m: MotionInput, t: number): MotionState {
  const cx = m.width / 2;
  const cy = m.height / 2;
  const S = Math.min(m.width, m.height);
  const A = m.amount;
  switch (m.motion) {
    case 'pulse':
      return { transform: { cx, cy, scale: 1 + A * Math.sin(TAU * t) } };
    case 'bounce':
      return { transform: { cx, cy, dy: -A * S * Math.abs(Math.sin(Math.PI * t)) } };
    case 'jitter': {
      const j = loopNoise2(m.seed, t);
      return { transform: { cx, cy, dx: A * S * j.x, dy: A * S * j.y } };
    }
    case 'rotate':
      return { transform: { cx, cy, rotate: Math.round(A) * TAU * t } };
    case 'wave': {
      const n = Math.max(1, m.glyphCount);
      return {
        offset: (k) => ({ dx: 0, dy: A * m.fontSize * Math.sin(TAU * (t - k / n)) }),
      };
    }
    default:
      return {};
  }
}

/** 逐字波浪第 k 個字在 t 的位移（測試用） */
export function waveOffset(
  amount: number,
  fontSize: number,
  k: number,
  n: number,
  t: number,
): number {
  return amount * fontSize * Math.sin(TAU * (t - k / Math.max(1, n)));
}
