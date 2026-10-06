/**
 * 緩動曲線。取自 text-fx（本站以無塵室方式撰寫，MIT）的 core.js。
 * 輸入 u ∈ [0, 1]，輸出大致在 [0, 1]（過衝、彈簧會稍微超出）。
 */

const TAU = Math.PI * 2;

function bounceOut(u: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) {
    const v = u - 1.5 / d;
    return n * v * v + 0.75;
  }
  if (u < 2.5 / d) {
    const v = u - 2.25 / d;
    return n * v * v + 0.9375;
  }
  const v = u - 2.625 / d;
  return n * v * v + 0.984375;
}

export type EasingFn = (u: number) => number;

/** 使用者可以選的 8 條曲線 */
export type EasingName = 'out' | 'snap' | 'smooth' | 'back' | 'spring' | 'bounce' | 'linear' | 'in';

export const EASE: Record<EasingName | 'slam' | 'glide', EasingFn> = {
  /** 緩停 */
  out: (u) => 1 - (1 - u) ** 3,
  /** 急停 */
  snap: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  /** 平滑（S 形） */
  smooth: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  /** 過衝回彈 */
  back: (u) => {
    const k = 1.70158;
    return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2;
  },
  /** 彈簧振盪 */
  spring: (u) =>
    u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1,
  /** 落地彈跳 */
  bounce: bounceOut,
  /** 等速 */
  linear: (u) => u,
  /** 緩起 */
  in: (u) => u * u * u,
  /** 急起（不給使用者選，個別效果的自動曲線） */
  slam: (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10)),
  /** 展開段用（不給使用者選） */
  glide: (u) => 1 - (1 - u) ** 4,
};

/** 給 Select／Segmented 用的選項（順序即介面順序） */
export const EASING_CHOICES: readonly { value: EasingName; label: string }[] = [
  { value: 'out', label: '緩停' },
  { value: 'snap', label: '急停' },
  { value: 'smooth', label: '平滑（S 形）' },
  { value: 'back', label: '過衝回彈' },
  { value: 'spring', label: '彈簧振盪' },
  { value: 'bounce', label: '落地彈跳' },
  { value: 'linear', label: '等速' },
  { value: 'in', label: '緩起' },
];

/** 取得曲線；名稱不認得時用等速 */
export function getEasing(name: string): EasingFn {
  return (EASE as Record<string, EasingFn>)[name] ?? EASE.linear;
}

/** 反向（退場用）：1 - f(1 - u) */
export const reverseEasing =
  (f: EasingFn): EasingFn =>
  (u) =>
    1 - f(1 - u);
