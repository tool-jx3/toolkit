/**
 * 擲骰用的亂數（0 以上、未滿 1）。
 *
 * - 預設是 `Math.random()`。
 * - **注入點**：頁面上設了 `window.__cocRandom`（傳回 0～1 的函式）時改用它——E2E 與對等驗證用，
 *   讓新舊版吃同一串亂數；單元測試直接把函式傳給 `rollDie`／`rollPercentile`／`rollDiceTerms`。
 * - 一顆 N 面骰＝⌊亂數 × N⌋＋1（與舊版相同的算法，同一串亂數得到同樣的點數）。
 * - 動畫裡跳動的假數字不要用這裡的亂數（會打亂注入的序列），直接用 Math.random。
 */

export type RandomSource = () => number;

/** 測試用的全域注入點名稱（`window.__cocRandom = () => 0.42`） */
export const COC_RANDOM_HOOK = '__cocRandom';

/** 夾到 [0, 1)：注入的函式傳回 1 或負數、NaN 時也不會擲出範圍外的點數 */
function unit(r: number): number {
  if (!Number.isFinite(r) || r < 0) return 0;
  return r >= 1 ? 1 - 2 ** -53 : r;
}

/** 目前的亂數來源：有 `window.__cocRandom` 時用它，否則 Math.random */
export function cocRandom(): number {
  const hook = (globalThis as Record<string, unknown>)[COC_RANDOM_HOOK];
  return unit(typeof hook === 'function' ? Number((hook as RandomSource)()) : Math.random());
}

/** 擲一顆 sides 面骰（1～sides） */
export function rollDie(sides: number, random: RandomSource = cocRandom): number {
  return Math.floor(unit(random()) * sides) + 1;
}

/**
 * 依序傳回給定的值、用完從頭再來（測試、示範用）。
 * `fixedRandom([randomForFace(3, 6)])` 每次都擲出 3。
 */
export function fixedRandom(values: readonly number[]): RandomSource {
  let i = 0;
  return () => {
    if (!values.length) return 0;
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

/** 讓一顆 sides 面骰擲出 face 的亂數值（取那一格的正中央） */
export function randomForFace(face: number, sides: number): number {
  return (face - 0.5) / sides;
}
