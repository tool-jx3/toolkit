/**
 * 骰子算式：`NdM±常數`，多組相加減（例：`2D6+1D4+3`、`1D6-1D4`、`D100`）。
 *
 * - 先正規化：拿掉所有空白（含全形空白）、全形「＋」→「+」、全形「－」與「−」→「-」、全形「ｄ」「Ｄ」→「D」、
 *   全形數字 → 半形（與舊版 trpg-lab 相同；半形小寫 d 保留，比對時不分大小寫）。
 * - 每一項是「骰子數 D 面數」（骰子數省略時是 1）或整數常數，項與項之間只能是 + 或 -，開頭可以有正負號。
 *   其他寫法（括號、乘號、小數、多餘的符號）一律當成錯誤，不擲骰。
 * - 擲骰依項的順序、每顆骰依序向亂數取值（與舊版相同的取用順序）。
 */
import { type RandomSource, rollDie } from './random';

export type DiceSign = 1 | -1;

export type DiceTerm =
  | { kind: 'dice'; sign: DiceSign; count: number; sides: number }
  | { kind: 'constant'; sign: DiceSign; value: number };

/**
 * 解析錯誤的種類（文字由工具自訂）：
 * - empty：沒有內容；syntax：看不懂的寫法；zero：骰子數或面數是 0；
 * - too-many：骰子總數超過上限；too-large：面數或常數超過上限。
 */
export type DiceParseError = 'empty' | 'syntax' | 'zero' | 'too-many' | 'too-large';

export type DiceParseResult =
  | { ok: true; normalized: string; terms: DiceTerm[] }
  | { ok: false; normalized: string; error: DiceParseError };

/** 上限（避免一次擲幾百萬顆骰子讓頁面卡住） */
export const DICE_LIMITS = Object.freeze({ maxDice: 999, maxSides: 9999, maxConstant: 999999 });

const FULL_DIGIT = /[０-９]/g;

/** 正規化（舊版的寫法）：拿掉空白、全形符號與數字轉半形 */
export function normalizeDiceText(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, '')
    .replace(/＋/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/[ｄＤ]/g, 'D')
    .replace(FULL_DIGIT, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const TERM = String.raw`(?:\d*[Dd]\d+|\d+)`;
const WHOLE = new RegExp(`^[+-]?${TERM}(?:[+-]${TERM})*$`);
const DICE = /^(\d*)[Dd](\d+)$/;

/** 把（正規化後的）算式拆成「帶正負號的項」：'1D6-2' → ['1D6', '-2'] */
export function splitDiceParts(normalized: string): string[] {
  return normalized.match(/[+-]?[^+-]+/g) ?? [];
}

/** 解析算式（會先正規化） */
export function parseDiceExpression(text: string): DiceParseResult {
  const normalized = normalizeDiceText(text);
  if (!normalized) return { ok: false, normalized, error: 'empty' };
  if (!WHOLE.test(normalized)) return { ok: false, normalized, error: 'syntax' };
  const terms: DiceTerm[] = [];
  let dice = 0;
  for (const part of splitDiceParts(normalized)) {
    const sign: DiceSign = part[0] === '-' ? -1 : 1;
    const body = part.replace(/^[+-]/, '');
    const m = DICE.exec(body);
    if (m) {
      const count = m[1] ? Number.parseInt(m[1], 10) : 1;
      const sides = Number.parseInt(m[2], 10);
      if (count < 1 || sides < 1) return { ok: false, normalized, error: 'zero' };
      if (sides > DICE_LIMITS.maxSides) return { ok: false, normalized, error: 'too-large' };
      dice += count;
      if (dice > DICE_LIMITS.maxDice) return { ok: false, normalized, error: 'too-many' };
      terms.push({ kind: 'dice', sign, count, sides });
    } else {
      const value = Number.parseInt(body, 10);
      if (value > DICE_LIMITS.maxConstant) return { ok: false, normalized, error: 'too-large' };
      terms.push({ kind: 'constant', sign, value });
    }
  }
  return { ok: true, normalized, terms };
}

/** 擲過的一項：骰子的每顆點數（正數，正負號看 sign）；常數項是空陣列 */
export type RolledTerm = DiceTerm & { rolls: number[] };

export interface DiceRollResult {
  terms: RolledTerm[];
  total: number;
}

/** 依序擲每一項（項的順序、每顆骰依序取亂數） */
export function rollDiceTerms(terms: readonly DiceTerm[], random?: RandomSource): DiceRollResult {
  let total = 0;
  const out: RolledTerm[] = terms.map((t) => {
    if (t.kind === 'constant') {
      total += t.sign * t.value;
      return { ...t, rolls: [] };
    }
    const rolls = Array.from({ length: t.count }, () => rollDie(t.sides, random));
    total += t.sign * rolls.reduce((a, b) => a + b, 0);
    return { ...t, rolls };
  });
  return { terms: out, total };
}

export type DiceEvaluation =
  | ({ ok: true; normalized: string } & DiceRollResult)
  | { ok: false; normalized: string; error: DiceParseError };

/** 解析並擲骰 */
export function rollDiceExpression(text: string, random?: RandomSource): DiceEvaluation {
  const parsed = parseDiceExpression(text);
  if (!parsed.ok) return parsed;
  return { ok: true, normalized: parsed.normalized, ...rollDiceTerms(parsed.terms, random) };
}

/**
 * 擲骰明細（舊版紀錄的寫法）：每一項寫成「骰子數D面數[點數,點數]」或常數，
 * 第一項是正的時不寫「+」：`1D6[3]+1D4[2]+2`、`-1D6[4]+10`。
 */
export function formatDiceDetail(terms: readonly RolledTerm[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign < 0 ? '-' : i === 0 ? '' : '+';
      return t.kind === 'dice'
        ? `${sign}${t.count}D${t.sides}[${t.rolls.join(',')}]`
        : `${sign}${t.value}`;
    })
    .join('');
}

/** 算式寫成標準形（`D6+02` → `1D6+2`）：給驗證訊息、範例用 */
export function formatDiceTerms(terms: readonly DiceTerm[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign < 0 ? '-' : i === 0 ? '' : '+';
      return t.kind === 'dice' ? `${sign}${t.count}D${t.sides}` : `${sign}${t.value}`;
    })
    .join('');
}
