/**
 * 5e 速查計算（規格 docs/refactor/specs/5e-calc.md 第 3 節）：
 * - 資料和原文（SRD 5.2.1 的表、LGMRD 的表、原作頁面的表）逐值相同；
 * - 遭遇：XP 總和、隊伍的預算（各組加總）、難度的邊界、提醒；SRD 5.2.1 的三個例子；
 * - 簡易遭遇基準：原文的例子（五名 4 級對四隻 CR 2、5 級、六名 8 級對三隻 CR 11）、高等級調整、單一怪物的上限；
 * - 點數購買：花費、能不能加減、直接打的值（原作的規則）、種族與背景的加值、20 的上限、複製的文字；
 * - 送到戰鬥追蹤的資料、原作格式的 JSON；存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import { CR_VALUES, type Cr, crNumber, parseCr } from '@/core/srd5/cr';
import { lazyBenchmark } from '@/core/srd5/lgmrd/benchmark';
import { oneLineStatBlock, QUICK_MONSTER_STATS, quickStats } from '@/core/srd5/lgmrd/monsters';
import { RACES_51 } from '@/core/srd5/srd51/races';
import { POINT_COST, STANDARD_ARRAY, STANDARD_ARRAY_BY_CLASS } from '@/core/srd5/srd52/abilities';
import { CR_XP, XP_BUDGET_PER_CHARACTER } from '@/core/srd5/srd52/encounter';
import {
  type BuyState,
  baseScores,
  bonuses,
  buyText,
  type CalcData,
  canDecrease,
  canIncrease,
  encounterSummary,
  finalScores,
  fixBackground,
  fixRaceChoice,
  initialData,
  type MonsterGroup,
  monsterSeeds,
  pointsLeft,
  pointsSpent,
  sanitizeData,
  trackerJson,
  trackerJsonName,
  typedScore,
} from '@/tools/5e-calc/model';
import { parseOriginalJson } from '@/tools/combat-tracker/model';

const party = (...g: [number, number][]) =>
  g.map(([count, level], i) => ({ id: `p${i}`, count, level }));
const mons = (...g: [Cr, number][]): MonsterGroup[] =>
  g.map(([cr, count], i) => ({ id: `m${i}`, name: '', cr, count }));

describe('資料（和原文逐值相同）', () => {
  it('CR 的 34 級、換算與讀法', () => {
    expect(CR_VALUES).toHaveLength(34);
    expect(CR_VALUES.slice(0, 5)).toEqual(['0', '1/8', '1/4', '1/2', '1']);
    expect(crNumber('1/8')).toBe(0.125);
    expect(['1/2', '0.5', '½', 'CR １／２', ' cr 3 ', '30', '31', 'x', ''].map(parseCr)).toEqual([
      '1/2',
      '1/2',
      '1/2',
      '1/2',
      '3',
      '30',
      null,
      null,
      null,
    ]);
  });

  it('CR → XP（SRD 5.2.1／原作的 monsterXP）', () => {
    const original: Record<string, number> = {
      0: 10,
      0.125: 25,
      0.25: 50,
      0.5: 100,
      1: 200,
      2: 450,
      3: 700,
      4: 1100,
      5: 1800,
      6: 2300,
      7: 2900,
      8: 3900,
      9: 5000,
      10: 5900,
      11: 7200,
      12: 8400,
      13: 10000,
      14: 11500,
      15: 13000,
      16: 15000,
      17: 18000,
      18: 20000,
      19: 22000,
      20: 25000,
      21: 33000,
      22: 41000,
      23: 50000,
      24: 62000,
      25: 75000,
      26: 90000,
      27: 105000,
      28: 120000,
      29: 135000,
      30: 155000,
    };
    for (const cr of CR_VALUES) expect(CR_XP[cr], cr).toBe(original[String(crNumber(cr))]);
  });

  it('每名角色的 XP 預算（SRD 5.2.1 的表＝原作的 encounterThresholds2024）', () => {
    const original: Record<number, [number, number, number]> = {
      1: [50, 75, 100],
      2: [100, 150, 200],
      3: [150, 225, 400],
      4: [250, 375, 500],
      5: [500, 750, 1100],
      6: [600, 1000, 1400],
      7: [750, 1300, 1700],
      8: [1000, 1700, 2100],
      9: [1300, 2000, 2600],
      10: [1600, 2300, 3100],
      11: [1900, 2900, 4100],
      12: [2200, 3700, 4700],
      13: [2600, 4200, 5400],
      14: [2900, 4900, 6200],
      15: [3300, 5400, 7800],
      16: [3800, 6100, 9800],
      17: [4500, 7200, 11700],
      18: [5000, 8700, 14200],
      19: [5500, 10700, 17200],
      20: [6400, 13200, 22000],
    };
    expect(XP_BUDGET_PER_CHARACTER).toEqual(original);
  });

  it('快速怪物數值（LGMRD 的表＝原作 quick_monster_stats 的 data）', () => {
    expect(QUICK_MONSTER_STATS.map((s) => s.cr)).toEqual([...CR_VALUES]);
    /* 原作頁面的幾列，逐欄比對 */
    const rows: [Cr, number, string, string, string, string, string][] = [
      ['0', 10, '3 (2-4)', '+2', '2', '1', '2 (1d4)'],
      ['1/2', 12, '22 (17-28)', '+4', '8', '2', '4 (1d4 + 2)'],
      ['5', 15, '95 (71-119)', '+7', '35', '3', '12 (3d6 + 2)'],
      ['14', 19, '196 (147-245)', '+11', '89', '4', '22 (4d10)'],
      ['20', 21, '300 (225-375)', '+13', '132', '5', '26 (4d12)'],
      ['30', 27, '666 (500-833)', '+19', '312', '5', '62 (6d10 + 29)'],
    ];
    for (const [cr, ac, hp, prof, dpr, n, dmg] of rows) {
      const s = quickStats(cr);
      expect(s.acDc, cr).toBe(ac);
      expect(`${s.hp} (${s.hpMin}-${s.hpMax})`, cr).toBe(hp);
      expect(`+${s.prof}`, cr).toBe(prof);
      expect(String(s.dpr), cr).toBe(dpr);
      expect(String(s.attacks), cr).toBe(n);
      expect(`${s.damage} (${s.dice})`, cr).toBe(dmg);
    }
    /* 每列：HP 在範圍內、平均傷害 × 次數接近每輪傷害（原文的表本身就有 ±5 的差） */
    for (const s of QUICK_MONSTER_STATS) {
      expect(s.hpMin <= s.hp && s.hp <= s.hpMax, s.cr).toBe(true);
      expect(Math.abs(s.damage * s.attacks - s.dpr), s.cr).toBeLessThanOrEqual(6);
      expect(s.examples.length, s.cr).toBeGreaterThan(0);
    }
    expect(oneLineStatBlock(quickStats('1'))).toBe(
      'CR 1｜AC／DC 12｜HP 33（25～41）｜熟練加值 +5｜每輪傷害 12｜攻擊 2 次 × 6（1d8＋2）',
    );
  });

  it('點數購買的花費、標準數組（剛好 27 點）、依職業的標準數組都是同一組數字', () => {
    expect(POINT_COST).toEqual({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
    expect(STANDARD_ARRAY.reduce((n, s) => n + POINT_COST[s], 0)).toBe(27);
    for (const c of STANDARD_ARRAY_BY_CLASS)
      expect(
        [...c.scores].sort((a, b) => b - a),
        c.en,
      ).toEqual([...STANDARD_ARRAY]);
  });

  it('SRD 5.1 的種族加值', () => {
    const sum = (k: string) => {
      const r = RACES_51.find((x) => x.key === k);
      return (
        Object.values(r?.bonus ?? {}).reduce((a, b) => a + (b as number), 0) +
        (r?.choice ? r.choice.count * r.choice.amount : 0)
      );
    };
    expect(RACES_51).toHaveLength(9);
    expect(sum('human')).toBe(6);
    expect(sum('half-elf')).toBe(4);
    for (const r of RACES_51.filter((x) => !['human', 'half-elf'].includes(x.key)))
      expect(sum(r.key), r.key).toBe(3);
  });
});

describe('遭遇', () => {
  it('SRD 5.2.1 的例子：四名 1 級的低難度預算 200；五名 3 級的中難度 1,125；六名 15 級的高難度 46,800', () => {
    expect(encounterSummary(party([4, 1]), mons(['1', 1])).budget.low).toBe(200);
    expect(encounterSummary(party([5, 3]), mons(['1', 1])).budget.moderate).toBe(1125);
    expect(encounterSummary(party([6, 15]), mons(['1', 1])).budget.high).toBe(46800);
    /* 1 隻 CR 1（200 XP）剛好是低難度（等於預算算在那一級；原作的 < 會判成中） */
    expect(encounterSummary(party([4, 1]), mons(['1', 1])).difficulty).toBe('low');
    /* 例 2：2 隻 CR 2＋9 隻 CR 1/8＝1,125 → 中 */
    const e2 = encounterSummary(party([5, 3]), mons(['2', 2], ['1/8', 9]));
    expect(e2.xp).toBe(1125);
    expect(e2.difficulty).toBe('moderate');
    /* 例 3：2 隻 CR 17（成年紅龍）＋2 隻 CR 9（火巨人）＝46,000 → 高 */
    const e3 = encounterSummary(party([6, 15]), mons(['17', 2], ['9', 2]));
    expect(e3.xp).toBe(46000);
    expect(e3.difficulty).toBe('high');
  });

  it('難度的邊界與超過高難度；沒有角色或怪物時 none', () => {
    const p = party([4, 5]); // 預算 2000／3000／4400
    const at = (xp: number) => {
      /* 用 CR 1/8（25 XP）湊 */
      return encounterSummary(p, mons(['1/8', xp / 25])).difficulty;
    };
    expect([at(2000), at(2025), at(3000), at(3025), at(4400), at(4425)]).toEqual([
      'low',
      'moderate',
      'moderate',
      'high',
      'high',
      'over',
    ]);
    expect(encounterSummary([], mons(['1', 1])).difficulty).toBe('none');
  });

  it('不同等級的隊伍：預算是各組加總；平均等級四捨五入', () => {
    const s = encounterSummary(party([2, 4], [2, 5]), mons(['3', 1]));
    expect(s.budget).toEqual({ low: 1500, moderate: 2250, high: 3200 });
    expect(s.avgLevel).toBe(5);
    expect(s.characters).toBe(4);
  });

  it('提醒：生物超過角色的兩倍、有 CR 比平均等級高的、有 CR 0', () => {
    expect(encounterSummary(party([2, 1]), mons(['0', 5])).tips).toEqual(['many', 'cr0']);
    expect(encounterSummary(party([4, 1]), mons(['2', 1])).tips).toEqual(['powerful']);
    expect(encounterSummary(party([4, 5]), mons(['5', 2])).tips).toEqual([]);
  });

  it('簡易遭遇基準：原文的三個例子', () => {
    /* 五名 4 級對四隻 CR 2：20 ÷ 4 = 5 < 8 → 可能致命 */
    const a = lazyBenchmark([4, 4, 4, 4, 4], [2, 2, 2, 2]);
    expect(a).toMatchObject({ benchmark: 5, totalCr: 8, deadly: true, verdict: 'deadly' });
    /* 改成 5 級：25 ÷ 2 = 12（捨去），8 < 12 → 不太可能致命 */
    const b = lazyBenchmark([5, 5, 5, 5, 5], [2, 2, 2, 2]);
    expect(b).toMatchObject({ benchmark: 12, deadly: false, verdict: 'safe' });
    /* 六名 8 級對三隻 CR 11：48 ÷ 2 = 24 < 33 → 可能致命 */
    const c = lazyBenchmark([8, 8, 8, 8, 8, 8], [11, 11, 11]);
    expect(c).toMatchObject({ benchmark: 24, totalCr: 33, deadly: true, verdict: 'deadly' });
  });

  it('簡易遭遇基準：等於基準不算、單一怪物的上限（平均等級或 1.5 倍，等於就算）', () => {
    expect(lazyBenchmark([4, 4, 4, 4], [4])?.deadly).toBe(false);
    expect(lazyBenchmark([4, 4, 4, 4], [4])?.singleDeadly).toBe(true);
    expect(lazyBenchmark([4, 4, 4, 4], [3])?.verdict).toBe('safe');
    expect(lazyBenchmark([5, 5, 5, 5], [7])?.singleDeadly).toBe(false);
    expect(lazyBenchmark([5, 5, 5, 5], [8])?.singleDeadly).toBe(true);
    expect(lazyBenchmark([], [1])).toBeNull();
    expect(lazyBenchmark([3], [])?.verdict).toBe('safe');
  });

  it('簡易遭遇基準：11～16 級 3/4、17 級以上 1 倍的選用調整', () => {
    const r = lazyBenchmark([12, 12, 12, 12], [9, 9, 9]); // 48：基準 24、調整 36、CR 27
    expect(r).toMatchObject({
      benchmark: 24,
      scaled: { factor: 0.75, benchmark: 36, deadly: false },
      verdict: 'deadly-low',
    });
    expect(lazyBenchmark([12, 12, 12, 12], [13, 13, 11])?.verdict).toBe('deadly-high');
    expect(lazyBenchmark([17, 17, 17, 17], [17, 17, 17, 17])?.scaled).toMatchObject({
      factor: 1,
      benchmark: 68,
      deadly: false,
    });
    expect(lazyBenchmark([12, 12, 12, 12], [1])?.verdict).toBe('safe');
    expect(lazyBenchmark([10, 10], [1])?.scaled).toBeNull();
  });

  it('送到戰鬥追蹤：HP、AC 照快速怪物數值、擲 1d20、名字與備註', () => {
    const seeds = monsterSeeds([
      { name: ' 食人魔 ', cr: '2', count: 2 },
      { name: '', cr: '1/2', count: 1 },
    ]);
    expect(seeds).toEqual([
      {
        name: '食人魔',
        count: 2,
        side: 'enemy',
        initMod: 0,
        rollInit: true,
        hp: 45,
        ac: 13,
        note: 'CR 2｜熟練加值 +5｜每輪傷害 17（2 次 × 9〔2d6＋2〕）｜DC 13',
      },
      expect.objectContaining({ name: 'CR 1/2 的怪物', hp: 22, ac: 12, count: 1 }),
    ]);
  });

  it('原作格式的 JSON（Export for Combat Tracker）：原作與本站的戰鬥追蹤都讀得進去', () => {
    const now = new Date('2026-11-06T01:02:03Z');
    const json = trackerJson(
      [
        { id: 'a', name: 'Ogre', cr: '2', count: 2 },
        { id: 'b', name: '', cr: '1', count: 1 },
      ],
      now,
    );
    const o = JSON.parse(json);
    expect(o.combatants.map((c: { name: string }) => c.name)).toEqual([
      'Ogre A',
      'Ogre B',
      'CR 1 的怪物',
    ]);
    expect(o.combatants[0]).toMatchObject({
      initiative: 10,
      maxHp: 45,
      currentHp: 45,
      ac: 13,
      id: now.getTime(),
    });
    expect(o.currentTurnIndex).toBe(0);
    expect(parseOriginalJson(json)).toHaveLength(3);
    expect(trackerJsonName(now)).toBe('encounter_for_combat_tracker_2026-11-06T01-02-03.json');
  });
});

describe('能力值點數購買', () => {
  const buy = (edit: Partial<BuyState> = {}): BuyState => ({ ...initialData().buy, ...edit });

  it('花費與剩下的點數；能不能加減（原作的規則）', () => {
    const s = baseScores();
    expect(pointsSpent(s)).toBe(0);
    expect(pointsLeft(s)).toBe(27);
    const full = { ...s, str: 15, dex: 15, con: 15 };
    expect(pointsSpent(full)).toBe(27);
    expect(canIncrease(full, 'int')).toBe(false);
    expect(canDecrease(full, 'int')).toBe(false);
    expect(canIncrease({ ...s, str: 15 }, 'str')).toBe(false);
    /* 剩 1 點時 13 → 14 要 2 點，加不上去；8 → 9 可以 */
    const one = { ...s, str: 15, dex: 15, con: 13, int: 11 };
    expect(pointsLeft(one)).toBe(1);
    expect(canIncrease(one, 'con')).toBe(false);
    expect(canIncrease(one, 'wis')).toBe(true);
  });

  it('直接打的值：夾在 8～15、點數不夠時改成買得起的最高值', () => {
    const s = { ...baseScores(), str: 15, dex: 15 }; // 剩 9
    expect(typedScore(s, 'con', 20)).toBe(15);
    expect(typedScore(s, 'con', 3)).toBe(8);
    expect(typedScore({ ...s, con: 14 }, 'int', 15)).toBe(10); // 剩 2 → 10
    expect(typedScore(s, 'con', Number.NaN)).toBe(8);
  });

  it('2014（SRD 5.1）的種族加值：固定的＋半精靈自選兩項（不同、不是魅力）', () => {
    expect(bonuses(buy({ rules: '2014', race: 'hill-dwarf' }))).toMatchObject({ con: 2, wis: 1 });
    const he = buy({ rules: '2014', race: 'half-elf', raceChoice: ['cha', 'str', 'str', 'dex'] });
    fixRaceChoice(he);
    expect(he.raceChoice).toEqual(['str', 'dex']);
    expect(bonuses(he)).toEqual({ str: 1, dex: 1, con: 0, int: 0, wis: 0, cha: 2 });
    expect(bonuses(buy({ rules: '2014', race: 'none' }))).toEqual({
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
    });
  });

  it('2024（SRD 5.2.1）的背景：+2／+1 或三項 +1；不在背景裡的改成前兩項；最高 20', () => {
    const b = buy({ bg: 'soldier', bgPlus2: 'cha', bgPlus1: 'cha' });
    fixBackground(b);
    expect([b.bgPlus2, b.bgPlus1]).toEqual(['str', 'dex']);
    expect(bonuses(b)).toMatchObject({ str: 2, dex: 1, con: 0 });
    expect(bonuses({ ...b, bgMode: '1-1-1' })).toMatchObject({ str: 1, dex: 1, con: 1, cha: 0 });
    const custom = buy({
      bg: 'custom',
      bgCustom: ['wis', 'cha', 'int'],
      bgPlus2: 'cha',
      bgPlus1: 'wis',
    });
    fixBackground(custom);
    expect(bonuses(custom)).toMatchObject({ cha: 2, wis: 1 });
    /* 2014 的種族在 2024 不算 */
    expect(bonuses(buy({ rules: '2024', race: 'human' }))).toEqual({
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
    });
    const fin = finalScores({ ...b, scores: { ...baseScores(), str: 15 } });
    expect(fin.str).toBe(17);
  });

  it('複製的文字', () => {
    const b = buy({
      bg: 'sage',
      scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
      bgPlus2: 'int',
      bgPlus1: 'con',
    });
    expect(buyText(b)).toBe(
      '力量 8（−1）、敏捷 14（+2）、體質 14（+2）、智力 17（+3）、感知 12（+1）、魅力 10（+0）\n點數購買 27／27 點｜2024（SRD 5.2.1）：賢者（體質 +1、智力 +2）',
    );
  });
});

describe('存檔的整理', () => {
  it('往返相同；看不懂的值用預設值；點數超過 27 的回到 8', () => {
    const d = initialData();
    expect(sanitizeData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(sanitizeData(null)).toBeNull();
    const s = sanitizeData({
      party: [{ count: 99, level: 0 }, 'x'],
      monsters: [{ cr: '1/3', count: -1, name: 5 }],
      quick: { cr: '1/2', count: 50 },
      buy: {
        rules: '2014',
        scores: { str: 15, dex: 15, con: 15, int: 15 },
        race: 'orc',
        bg: 'pirate',
        bgCustom: ['cha', 'cha', 'zzz'],
      },
    }) as CalcData;
    expect(s.party[0]).toMatchObject({ count: 10, level: 1 });
    expect(s.monsters[0]).toMatchObject({ cr: '1', count: 1, name: '' });
    expect(s.quick).toEqual({ cr: '1/2', name: '', count: 20 });
    expect(s.buy).toMatchObject({ rules: '2014', race: 'none', bg: 'none', scores: baseScores() });
    expect(s.buy.bgCustom).toEqual(['cha', 'str', 'dex']);
  });
});
