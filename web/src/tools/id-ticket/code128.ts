/**
 * Code 128 條碼（真的可以掃的格式）：字串 → 每一條的寬度（模組數，黑白交錯、從黑條開始）。
 *
 * - 可以印的 ASCII（空白～~）用 B 字集；連續 4 個以上的數字改用 C 字集（兩個數字一個碼，條碼比較短）；
 * - 不能編碼的字（中文、全形…）略過；什麼都不剩時回傳 null（畫面上改畫空白的條碼位置）；
 * - 檢查碼＝（起始碼＋Σ 碼 × 位置）mod 103；結尾是 STOP（7 條）。
 *
 * 原作的條碼是依文字當種子隨機畫的（掃不出來）；新版畫真的 Code 128（規格 D9）。
 */

/** 0～106 的條寬（6 條＝11 模組；106 STOP 是 7 條＝13 模組） */
// biome-ignore format: 對照表一列十個
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

export const CODE128_PATTERNS: readonly string[] = PATTERNS;

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** 條碼左右的空白（模組數；掃描器需要） */
export const CODE128_QUIET = 10;

/** 留下可以編碼的字（ASCII 32～126） */
export const code128Text = (text: string): string =>
  [...String(text ?? '')].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join('');

const digitRun = (s: string, i: number): number => {
  let n = 0;
  while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++;
  return n;
};

/** 字串 → 碼（含起始碼、檢查碼、STOP）；沒有可以編碼的字時 null */
export function code128Codes(text: string): number[] | null {
  const s = code128Text(text);
  if (!s) return null;
  const codes: number[] = [];
  let set: 'B' | 'C' | null = null;
  let i = 0;
  while (i < s.length) {
    const run = digitRun(s, i);
    if (run >= 4) {
      if (set !== 'C') codes.push(set === null ? START_C : CODE_C);
      set = 'C';
      const pairs = Math.floor(run / 2);
      for (let k = 0; k < pairs; k++) codes.push(Number(s.slice(i + k * 2, i + k * 2 + 2)));
      i += pairs * 2;
    } else {
      if (set !== 'B') codes.push(set === null ? START_B : CODE_B);
      set = 'B';
      codes.push(s.charCodeAt(i) - 32);
      i++;
    }
  }
  let sum = codes[0];
  for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
  codes.push(sum % 103, STOP);
  return codes;
}

/** 字串 → 條寬（黑白交錯、從黑條開始；不含左右空白）；沒有可以編碼的字時 null */
export function code128Widths(text: string): number[] | null {
  const codes = code128Codes(text);
  if (!codes) return null;
  const out: number[] = [];
  for (const c of codes) for (const ch of PATTERNS[c]) out.push(Number(ch));
  return out;
}

/** 條碼的總模組數（不含左右空白） */
export const code128Modules = (widths: readonly number[]): number =>
  widths.reduce((a, b) => a + b, 0);
