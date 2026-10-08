/**
 * CoC 7 版的技能檢定（百分骰＋獎勵骰／懲罰骰＋成功等級）。
 *
 * 百分骰：1 顆個位骰（0～9）＋（1＋|獎勵或懲罰骰數|）顆十位骰（00、10…90），每顆十位骰配同一顆個位骰組成候選值，
 * 「00」配「0」算 100。獎勵骰（正數）取最小的候選值、懲罰骰（負數）取最大的，沒有時只有一顆十位骰。
 * 亂數取用順序（與舊版 trpg-lab 相同）：先擲個位骰，再依序擲十位骰。
 *
 * 成功等級（依序判斷）：出 1 → 大成功；技能值未滿 50 時 96 以上、50 以上時只有 100 → 大失敗；
 * 技能值的 1/5 以下（無條件捨去）→ 極限成功；1/2 以下 → 困難成功；技能值以下 → 一般成功；其餘失敗。
 */
import { cocRandom, type RandomSource, rollDie } from './random';

export type SuccessLevel = 'critical' | 'extreme' | 'hard' | 'regular' | 'failure' | 'fumble';

/** 由好到壞 */
export const SUCCESS_LEVELS: readonly SuccessLevel[] = Object.freeze([
  'critical',
  'extreme',
  'hard',
  'regular',
  'failure',
  'fumble',
]);

/** 成功等級的名稱（台灣 CoC 7 版常用的譯名） */
export const SUCCESS_LEVEL_LABELS: Readonly<Record<SuccessLevel, string>> = Object.freeze({
  critical: '大成功',
  extreme: '極限成功',
  hard: '困難成功',
  regular: '一般成功',
  failure: '失敗',
  fumble: '大失敗',
});

/** 成功等級（規則見檔頭） */
export function successLevel(roll: number, skill: number): SuccessLevel {
  if (roll === 1) return 'critical';
  if (skill < 50 && roll >= 96) return 'fumble';
  if (skill >= 50 && roll === 100) return 'fumble';
  if (roll <= Math.floor(skill / 5)) return 'extreme';
  if (roll <= Math.floor(skill / 2)) return 'hard';
  if (roll <= skill) return 'regular';
  return 'failure';
}

/** 算成功的等級（大成功、極限、困難、一般） */
export function isSuccessLevel(level: SuccessLevel): boolean {
  return level !== 'failure' && level !== 'fumble';
}

export interface PercentileRoll {
  /** 獎勵骰（正）／懲罰骰（負）的數量 */
  bonus: number;
  /** 個位骰（0～9） */
  ones: number;
  /** 十位骰（0、10…90），1＋|bonus| 顆 */
  tens: number[];
  /** 每顆十位骰配個位骰的候選值（1～100） */
  candidates: number[];
  /** 採用的結果 */
  result: number;
  /** 採用的是第幾顆十位骰（有同值時取第一顆） */
  chosen: number;
}

/** 十位骰＋個位骰的值（00＋0 是 100） */
export function percentileValue(tens: number, ones: number): number {
  const v = tens + ones;
  return v === 0 ? 100 : v;
}

/** 由已經擲好的骰子組出結果（純計算） */
export function combinePercentile(
  ones: number,
  tens: readonly number[],
  bonus: number,
): PercentileRoll {
  const candidates = tens.map((t) => percentileValue(t, ones));
  const result =
    bonus > 0 ? Math.min(...candidates) : bonus < 0 ? Math.max(...candidates) : candidates[0];
  return {
    bonus,
    ones,
    tens: [...tens],
    candidates,
    result,
    chosen: bonus === 0 ? 0 : candidates.indexOf(result),
  };
}

/** 擲百分骰：先個位骰，再依序擲 1＋|bonus| 顆十位骰 */
export function rollPercentile(bonus: number, random: RandomSource = cocRandom): PercentileRoll {
  const b = Math.trunc(bonus) || 0;
  const ones = rollDie(10, random) - 1;
  const tens = Array.from({ length: 1 + Math.abs(b) }, () => (rollDie(10, random) - 1) * 10);
  return combinePercentile(ones, tens, b);
}

/** 十位骰的顯示：0 → 「00」，其他兩位數（10、20…90） */
export function tensFace(tens: number): string {
  return tens === 0 ? '00' : String(tens).padStart(2, '0');
}
