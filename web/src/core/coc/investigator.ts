/**
 * 7 版調查員的規則（coc-sheet 移植時新增）：技能值的一般／困難／極限、移動力、理智上限、技能點數。
 * 屬性一律是 ×5 之後的值（STR 50 這種寫法）。HP、MP、SAN、DB／體格用 derived.ts 的 derivedStats、damageBonus7。
 *
 * - 一般／困難／極限：困難＝⌊值÷2⌋、極限＝⌊值÷5⌋（與技能檢定 successLevel 的門檻相同）。
 * - 移動力：DEX 與 STR 都小於 SIZ → 7；DEX 與 STR 都大於 SIZ → 9；其他（任一項等於或大於 SIZ）→ 8；
 *   40 多歲 −1、50 多歲 −2、60 多歲 −3、70 多歲 −4、80 歲以上 −5（最少 0）。
 * - 理智上限：99 −「克蘇魯神話」技能值（最少 0）。
 * - 技能點數：職業技能點數預設 EDU×4（依職業不同，可以另外指定）、興趣技能點數 INT×2。
 */

export interface SkillThresholds {
  regular: number;
  hard: number;
  extreme: number;
}

/** 一般、困難（⌊÷2⌋）、極限（⌊÷5⌋） */
export function skillThresholds(value: number): SkillThresholds {
  return { regular: value, hard: Math.floor(value / 2), extreme: Math.floor(value / 5) };
}

/** 年齡對移動力的減值（40 多歲 1、50 多歲 2…80 歲以上 5；未滿 40 是 0） */
export function ageMovePenalty(age: number | null | undefined): number {
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 40) return 0;
  return Math.min(5, Math.floor(age / 10) - 3);
}

/** 移動力（7 版）；STR、DEX、SIZ 有缺時是 null */
export function movementRate7(values: {
  STR?: number | null;
  DEX?: number | null;
  SIZ?: number | null;
  age?: number | null;
}): number | null {
  const { STR, DEX, SIZ } = values;
  if (![STR, DEX, SIZ].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const s = STR as number;
  const d = DEX as number;
  const z = SIZ as number;
  const base = d < z && s < z ? 7 : d > z && s > z ? 9 : 8;
  return Math.max(0, base - ageMovePenalty(values.age));
}

/** 理智上限：99 − 克蘇魯神話（最少 0） */
export function sanityMax(mythos: number | null | undefined): number {
  const m = typeof mythos === 'number' && Number.isFinite(mythos) ? mythos : 0;
  return Math.max(0, 99 - m);
}

/** 技能點數：職業 EDU×4、興趣 INT×2（屬性沒有值時是 null） */
export function skillPointBudgets(values: { EDU?: number | null; INT?: number | null }): {
  occupation: number | null;
  interest: number | null;
} {
  const ok = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v);
  return {
    occupation: ok(values.EDU) ? values.EDU * 4 : null,
    interest: ok(values.INT) ? values.INT * 2 : null,
  };
}

/** 從自由輸入的年齡文字取出歲數（「42」「42 歲」「４２」→ 42；讀不到時 null） */
export function parseAge(text: string): number | null {
  const m = text.normalize('NFKC').match(/\d+/);
  return m ? Number(m[0]) : null;
}
