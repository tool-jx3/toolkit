/**
 * core/coc：骰子算式、7 版技能檢定、DB／體格與衍生值、BCDice 結果解析。
 * 「舊版」的對照是照 tools/trpg-lab 的 coc7_dice.js、coc_npc_token.js、damage_sum.js 的算法在測試裡重寫的參考實作，
 * 同一串亂數下新版要得到一樣的點數與結果。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RESULT_SEPARATOR } from '@/ccfolia';
import {
  applyArmor,
  BCDICE_SEPARATOR,
  CHARACTERISTICS,
  COC_RANDOM_HOOK,
  cocRandom,
  combinePercentile,
  DB_TABLE_6,
  DB_TABLE_7,
  DICE_LIMITS,
  damageBonus6,
  damageBonus7,
  derivedStats,
  fixedRandom,
  formatDiceDetail,
  formatDiceTerms,
  isSuccessLevel,
  lineEndTotals,
  normalizeDiceText,
  parseDiceExpression,
  percentileValue,
  randomForFace,
  rollDiceExpression,
  rollDie,
  rollPercentile,
  SUCCESS_LEVEL_LABELS,
  statusChangeCommand,
  successLevel,
  tensFace,
} from '@/core/coc';

/** 可重現的亂數串（LCG） */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 記下取用過的亂數，給舊版參考實作重播 */
function recorded(seed: number) {
  const base = lcg(seed);
  const values: number[] = [];
  return {
    values,
    random: () => {
      const v = base();
      values.push(v);
      return v;
    },
  };
}

/* ---------- 舊版的參考實作（測試用） ---------- */

function legacyCustomRoll(command: string, random: () => number) {
  const rollDice = (sides: number) => Math.floor(random() * sides) + 1;
  const parts = command.match(/([+-]?[^+-]+)/g)!;
  const results: { type: string; rolls: number[] }[] = [];
  let total = 0;
  for (const part of parts) {
    const sign = part[0] === '+' || part[0] === '-' ? part[0] : '+';
    const body = part.replace(/^[+-]/, '');
    const m = body.match(/^(\d+)?D(\d+)$/i);
    if (m) {
      const num = Number.parseInt(m[1] || '1', 10);
      const sides = Number.parseInt(m[2], 10);
      const rolls: number[] = [];
      for (let i = 0; i < num; i++) {
        const r = rollDice(sides);
        rolls.push(sign === '-' ? -r : r);
      }
      results.push({ type: `${sign + num}D${sides}`, rolls });
      total += rolls.reduce((s, r) => s + r, 0);
    } else {
      const val = Number.parseInt(body, 10);
      results.push({ type: sign + val, rolls: [] });
      total += sign === '-' ? -val : val;
    }
  }
  const detail = results
    .map((item, idx) => {
      if (item.rolls.length) {
        const m = item.type.match(/^([+-]?)(\d+)D(\d+)$/i)!;
        const sign = m[1] || '+';
        const dSig = idx === 0 && sign === '+' ? '' : sign;
        return `${dSig}${m[2]}D${m[3]}[${item.rolls.map((r) => Math.abs(r)).join(',')}]`;
      }
      const m = item.type.match(/^([+-]?)(\d+)$/)!;
      const sign = m[1] || '+';
      const dSig = idx === 0 && sign === '+' ? '' : sign;
      return `${dSig}${m[2]}`;
    })
    .join('');
  return { total, detail };
}

function legacySkillRoll(bd: number, random: () => number) {
  const rollDice = (sides: number) => Math.floor(random() * sides) + 1;
  const oneDigit = rollDice(10) - 1;
  const percentDice: number[] = [];
  for (let i = 0; i < 1 + Math.abs(bd); i++) percentDice.push((rollDice(10) - 1) * 10);
  const candidates = percentDice.map((d) => (d + oneDigit === 0 ? 100 : d + oneDigit));
  let finalRoll: number;
  let chosenIdx: number;
  if (bd > 0) {
    finalRoll = Math.min(...candidates);
    chosenIdx = candidates.indexOf(finalRoll);
  } else if (bd < 0) {
    finalRoll = Math.max(...candidates);
    chosenIdx = candidates.indexOf(finalRoll);
  } else {
    finalRoll = candidates[0];
    chosenIdx = 0;
  }
  return { oneDigit, percentDice, candidates, finalRoll, chosenIdx };
}

function legacyLevel(roll: number, skill: number) {
  if (roll === 1) return 'critical';
  if (skill < 50 && roll >= 96) return 'fumble';
  if (skill >= 50 && roll === 100) return 'fumble';
  if (roll <= Math.floor(skill / 5)) return 'extreme';
  if (roll <= Math.floor(skill / 2)) return 'hard';
  if (roll <= skill) return 'regular';
  return 'failure';
}

/** 舊版 NPC 的 rollDice（只用在合法的算式上比對） */
function legacyNpcRoll(expr: string, random: () => number) {
  const s = expr.trim().toUpperCase().replace(/\s/g, '');
  const tokens = s
    .replace(/-/g, '+-')
    .split('+')
    .filter((p) => p !== '');
  let total = 0;
  for (const tok of tokens) {
    if (tok.includes('D')) {
      const [nStr, mStr] = tok.split('D');
      const n = Number.parseInt(nStr, 10) || 1;
      const m = Number.parseInt(mStr, 10) || 6;
      const sign = n < 0 ? -1 : 1;
      for (let i = 0; i < Math.abs(n); i++) total += sign * (Math.floor(random() * m) + 1);
    } else {
      total += Number.parseInt(tok, 10) || 0;
    }
  }
  return total;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[COC_RANDOM_HOOK];
});

describe('亂數', () => {
  it('rollDie：⌊亂數 × 面數⌋＋1；超出 [0, 1) 的值夾回範圍內', () => {
    expect(rollDie(6, () => 0)).toBe(1);
    expect(rollDie(6, () => 0.999999)).toBe(6);
    expect(rollDie(6, () => 1)).toBe(6);
    expect(rollDie(6, () => -3)).toBe(1);
    expect(rollDie(6, () => Number.NaN)).toBe(1);
    expect(rollDie(10, () => randomForFace(7, 10))).toBe(7);
  });

  it('window.__cocRandom 注入點', () => {
    const seq = fixedRandom([0.1, 0.95]);
    (globalThis as Record<string, unknown>)[COC_RANDOM_HOOK] = seq;
    expect(cocRandom()).toBe(0.1);
    expect(rollDie(20)).toBe(20);
    delete (globalThis as Record<string, unknown>)[COC_RANDOM_HOOK];
    const r = cocRandom();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });

  it('fixedRandom 依序、用完從頭', () => {
    const f = fixedRandom([0.1, 0.2]);
    expect([f(), f(), f()]).toEqual([0.1, 0.2, 0.1]);
    expect(fixedRandom([])()).toBe(0);
  });
});

describe('骰子算式', () => {
  it('正規化：空白、全形符號與數字', () => {
    expect(normalizeDiceText(' １Ｄ６ ＋ ２ｄ４　－　３ ')).toBe('1D6+2D4-3');
    expect(normalizeDiceText('1d6−2')).toBe('1d6-2');
  });

  it('合法的寫法', () => {
    const cases: [string, string][] = [
      ['2D6+1D4+3', '2D6+1D4+3'],
      ['1d100', '1D100'],
      ['D6', '1D6'],
      ['+1D6', '1D6'],
      ['-1D6+10', '-1D6+10'],
      ['01D06+007', '1D6+7'],
      ['5', '5'],
      ['３Ｄ６－２', '3D6-2'],
    ];
    for (const [input, canonical] of cases) {
      const r = parseDiceExpression(input);
      expect(r.ok, input).toBe(true);
      if (r.ok) expect(formatDiceTerms(r.terms)).toBe(canonical);
    }
  });

  it('錯誤的種類', () => {
    const err = (s: string) => {
      const r = parseDiceExpression(s);
      return r.ok ? null : r.error;
    };
    expect(err('')).toBe('empty');
    expect(err('　 ')).toBe('empty');
    for (const s of ['abc', '1D6abc', '1.5', '(2D6+6)', '3D6×5', '3D6*5', '1D6++2', '5-', '+', 'D'])
      expect(err(s), s).toBe('syntax');
    expect(err('0D6')).toBe('zero');
    expect(err('1D0')).toBe('zero');
    expect(err(`${DICE_LIMITS.maxDice + 1}D6`)).toBe('too-many');
    expect(err(`500D6+500D6`)).toBe('too-many');
    expect(err(`1D${DICE_LIMITS.maxSides + 1}`)).toBe('too-large');
    expect(err(`${DICE_LIMITS.maxConstant + 1}`)).toBe('too-large');
  });

  it('擲骰：項的順序、每顆依序取亂數；明細與舊版相同', () => {
    const r = rollDiceExpression(
      '1D6+1D4+2',
      fixedRandom([randomForFace(3, 6), randomForFace(2, 4)]),
    );
    expect(r.ok && r.total).toBe(7);
    expect(r.ok && formatDiceDetail(r.terms)).toBe('1D6[3]+1D4[2]+2');
    const n = rollDiceExpression('-1D6-2D4+10', fixedRandom([randomForFace(4, 6), 0, 0.99]));
    expect(n.ok && n.total).toBe(10 - 4 - 1 - 4);
    expect(n.ok && formatDiceDetail(n.terms)).toBe('-1D6[4]-2D4[1,4]+10');
  });

  it('同一串亂數下，合法算式的總和與明細都和舊版（自訂擲骰、NPC 屬性）相同', () => {
    const exprs = [
      '1D6+1D4+2',
      '3D6',
      '2D6+6',
      '1D100',
      '1D6-1D4',
      '-1D3+5',
      '10D10+3D20-7',
      '1D8+1D8+1D8',
      '2D6+3',
    ];
    for (const expr of exprs) {
      for (let seed = 1; seed <= 25; seed++) {
        const a = recorded(seed);
        const mine = rollDiceExpression(expr, a.random);
        const legacy = legacyCustomRoll(normalizeDiceText(expr), fixedRandom(a.values));
        expect(mine.ok).toBe(true);
        if (!mine.ok) continue;
        expect(mine.total, `${expr} #${seed}`).toBe(legacy.total);
        expect(formatDiceDetail(mine.terms)).toBe(legacy.detail);
        expect(legacyNpcRoll(expr, fixedRandom(a.values))).toBe(mine.total);
      }
    }
  });
});

describe('技能檢定', () => {
  it('成功等級的邊界（技能值 50 以上／未滿 50）', () => {
    const t = (roll: number, skill: number) => successLevel(roll, skill);
    expect(t(1, 1)).toBe('critical');
    expect(t(1, 99)).toBe('critical');
    expect(t(96, 49)).toBe('fumble');
    expect(t(95, 49)).toBe('failure');
    expect(t(100, 49)).toBe('fumble');
    expect(t(96, 50)).toBe('failure');
    expect(t(99, 50)).toBe('failure');
    expect(t(100, 50)).toBe('fumble');
    expect(t(100, 200)).toBe('fumble');
    expect(t(99, 99)).toBe('regular');
    expect(t(10, 50)).toBe('extreme');
    expect(t(11, 50)).toBe('hard');
    expect(t(25, 50)).toBe('hard');
    expect(t(26, 50)).toBe('regular');
    expect(t(50, 50)).toBe('regular');
    expect(t(51, 50)).toBe('failure');
    expect(t(9, 49)).toBe('extreme');
    expect(t(10, 49)).toBe('hard');
    expect(t(24, 49)).toBe('hard');
    expect(t(25, 49)).toBe('regular');
    expect(t(2, 4)).toBe('hard');
    expect(t(3, 4)).toBe('regular');
    expect(isSuccessLevel('hard')).toBe(true);
    expect(isSuccessLevel('fumble')).toBe(false);
    expect(SUCCESS_LEVEL_LABELS.extreme).toBe('極限成功');
  });

  it('所有點數與技能值 1～120 都和舊版相同', () => {
    for (let skill = 1; skill <= 120; skill++)
      for (let roll = 1; roll <= 100; roll++)
        expect(successLevel(roll, skill)).toBe(legacyLevel(roll, skill));
  });

  it('百分骰：00＋0＝100；獎勵骰取小、懲罰骰取大；同值取第一顆', () => {
    expect(percentileValue(0, 0)).toBe(100);
    expect(percentileValue(0, 5)).toBe(5);
    expect(percentileValue(90, 0)).toBe(90);
    expect(combinePercentile(3, [40], 0)).toMatchObject({
      candidates: [43],
      result: 43,
      chosen: 0,
    });
    expect(combinePercentile(3, [40, 10, 70], 2)).toMatchObject({ result: 13, chosen: 1 });
    expect(combinePercentile(0, [40, 0], -1)).toMatchObject({ candidates: [40, 100], result: 100 });
    expect(combinePercentile(5, [30, 30], 1)).toMatchObject({ result: 35, chosen: 0 });
    expect(tensFace(0)).toBe('00');
    expect(tensFace(30)).toBe('30');
  });

  it('擲百分骰的取用順序：個位骰先，再依序十位骰；與舊版相同', () => {
    const r = rollPercentile(1, fixedRandom([0.35, 0.82, 0.11]));
    expect(r).toMatchObject({ ones: 3, tens: [80, 10], candidates: [83, 13], result: 13 });
    for (const bd of [-2, -1, 0, 1, 2]) {
      for (let seed = 1; seed <= 200; seed++) {
        const a = recorded(seed);
        const mine = rollPercentile(bd, a.random);
        const legacy = legacySkillRoll(bd, fixedRandom(a.values));
        expect(mine.ones).toBe(legacy.oneDigit);
        expect(mine.tens).toEqual(legacy.percentDice);
        expect(mine.candidates).toEqual(legacy.candidates);
        expect(mine.result).toBe(legacy.finalRoll);
        expect(mine.chosen).toBe(legacy.chosenIdx);
      }
    }
  });
});

describe('DB／體格與衍生值', () => {
  it('7 版的表與表外（每 80 點多 1D6）', () => {
    const t = (n: number) => damageBonus7(n);
    expect(t(0)).toEqual({ db: '-2', build: -2 });
    expect(t(64)).toEqual({ db: '-2', build: -2 });
    expect(t(65)).toEqual({ db: '-1', build: -1 });
    expect(t(84)).toEqual({ db: '-1', build: -1 });
    expect(t(85)).toEqual({ db: '0', build: 0 });
    expect(t(124)).toEqual({ db: '0', build: 0 });
    expect(t(125)).toEqual({ db: '+1D4', build: 1 });
    expect(t(165)).toEqual({ db: '+1D6', build: 2 });
    expect(t(205)).toEqual({ db: '+2D6', build: 3 });
    expect(t(285)).toEqual({ db: '+3D6', build: 4 });
    expect(t(365)).toEqual({ db: '+4D6', build: 5 });
    expect(t(445)).toEqual({ db: '+5D6', build: 6 });
    expect(t(524)).toEqual({ db: '+5D6', build: 6 });
    expect(t(525)).toEqual({ db: '+6D6', build: 7 });
    expect(t(604)).toEqual({ db: '+6D6', build: 7 });
    expect(t(605)).toEqual({ db: '+7D6', build: 8 });
    expect(DB_TABLE_7).toHaveLength(9);
  });

  it('6 版的表與表外（每 16 點多 1D6）', () => {
    expect(damageBonus6(2)).toBe('-1D6');
    expect(damageBonus6(12)).toBe('-1D6');
    expect(damageBonus6(13)).toBe('-1D4');
    expect(damageBonus6(16)).toBe('-1D4');
    expect(damageBonus6(17)).toBe('0');
    expect(damageBonus6(24)).toBe('0');
    expect(damageBonus6(25)).toBe('+1D4');
    expect(damageBonus6(184)).toBe('+10D6');
    expect(damageBonus6(185)).toBe('+11D6');
    expect(damageBonus6(200)).toBe('+11D6');
    expect(damageBonus6(201)).toBe('+12D6');
    expect(DB_TABLE_6).toHaveLength(14);
  });

  it('衍生值：7 版與 6 版', () => {
    expect(derivedStats(7, { STR: 60, CON: 55, POW: 47, SIZ: 65 })).toEqual({
      hp: 12,
      mp: 9,
      san: 47,
      db: '+1D4',
      build: 1,
    });
    expect(derivedStats(6, { STR: 13, CON: 11, POW: 9, SIZ: 14 })).toEqual({
      hp: 13,
      mp: 9,
      san: 45,
      db: '+1D4',
      build: null,
    });
    /* 沒有值、NaN 當成 0 */
    expect(derivedStats(7, { CON: Number.NaN })).toEqual({
      hp: 0,
      mp: 0,
      san: 0,
      db: '-2',
      build: -2,
    });
    expect(CHARACTERISTICS).toEqual(['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU']);
  });
});

describe('BCDice 結果', () => {
  const SAMPLE = [
    '藍道夫·卡特 - 今天 00:00',
    'x3 1D10+2 手槍 #1',
    '(1D10+2) ＞ 3[3]+2 ＞ 5',
    '',
    '#2',
    '(1D10+2) ＞ 7[7]+2 ＞ 9',
    '',
    '#3',
    '(1D10+2) ＞ 4[4]+2 ＞ 6',
  ].join('\n');

  it('每一行結尾的「＞ 數字」', () => {
    expect(lineEndTotals(SAMPLE)).toEqual([5, 9, 6]);
    expect(lineEndTotals(SAMPLE.replace(/\n/g, '\r\n'))).toEqual([5, 9, 6]);
    expect(lineEndTotals('CC<=50 (1D100<=50) ＞ 23 ＞ 成功')).toEqual([]);
    expect(lineEndTotals('(1D100) ＞ 45  ')).toEqual([45]);
    expect(lineEndTotals('＞ -3')).toEqual([]);
    expect(lineEndTotals('＞ ５')).toEqual([]);
    expect(lineEndTotals('a ＞ 3 b')).toEqual([]);
    expect(lineEndTotals('')).toEqual([]);
  });

  it('扣護甲（最少 0）與加總、指令', () => {
    expect(applyArmor([5, 9, 6], 0)).toEqual({ each: [5, 9, 6], total: 20 });
    expect(applyArmor([5, 9, 6], 6)).toEqual({ each: [0, 3, 0], total: 3 });
    expect(applyArmor([5], -2)).toEqual({ each: [7], total: 7 });
    expect(statusChangeCommand(20)).toBe(':HP-20');
  });

  it('與 @/ccfolia 的分隔符號相同', () => {
    expect(RESULT_SEPARATOR).toBe(BCDICE_SEPARATOR);
  });
});
