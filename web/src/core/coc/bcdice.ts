/**
 * BCDice 擲骰結果的文字（CCFOLIA 聊天欄、日誌裡的那一行）：
 * `(1D10+2) ＞ 7[7]+2 ＞ 9`——各段以全形「＞」分隔，最後一段是結果。
 * 分隔符號與 `@/ccfolia` 的 `RESULT_SEPARATOR` 是同一個（ccfolia 由這裡取用）。
 */

/** 結果分隔符號（BCDice 的全形「＞」） */
export const BCDICE_SEPARATOR = '＞';

/**
 * 每一行「以『＞ 數字』結尾」的那個數字，依出現順序（舊版傷害計算的規則）：
 * - 只認半形數字、不含負號；數字後面只能是空白；「＞」與數字之間可以有空白（含換行）。
 * - `CC<=50 (1D100<=50) ＞ 23 ＞ 成功` 結尾不是數字，不算；`(1D100) ＞ 45` 算（45）。
 */
export function lineEndTotals(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text ?? '').matchAll(/＞\s*(\d+)\s*$/gm)) out.push(Number(m[1]));
  return out;
}

/** 每一筆扣掉護甲（最少 0）後的值與總和 */
export function applyArmor(
  values: readonly number[],
  armor: number,
): { each: number[]; total: number } {
  const each = values.map((v) => Math.max(0, v - armor));
  return { each, total: each.reduce((a, b) => a + b, 0) };
}

/** 改數值的 CCFOLIA 指令：`:HP-12` */
export function statusChangeCommand(amount: number, label = 'HP'): string {
  return `:${label}-${amount}`;
}
