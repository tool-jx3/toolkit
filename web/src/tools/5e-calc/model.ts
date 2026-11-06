/**
 * 5e 速查計算的資料與計算（不依賴 React，單元測試直接跑）：遭遇預算、快速怪物、能力值點數購買。
 * 規則的數值在 `@/core/srd5`（SRD 5.2.1、SRD 5.1、Lazy GM's 5e Monster Builder Resource Document）。
 * 規格：docs/refactor/specs/5e-calc.md。
 */
import type { CombatSeed } from '@/core/combat';
import { CR_VALUES, type Cr, crNumber, isCr } from '@/core/srd5/cr';
import { type BenchmarkResult, lazyBenchmark } from '@/core/srd5/lgmrd/benchmark';
import { diceText, quickStats, signed } from '@/core/srd5/lgmrd/monsters';
import { RACES_51, type RaceKey, race51 } from '@/core/srd5/srd51/races';
import {
  ABILITIES,
  ABILITY_KEYS,
  type Ability,
  abilityModifier,
  BACKGROUND_SCORE_MAX,
  BACKGROUNDS,
  type BackgroundKey,
  isAbility,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  POINT_BUY_TOTAL,
  POINT_COST,
} from '@/core/srd5/srd52/abilities';
import {
  budgetForLevel,
  CR_XP,
  DIFFICULTIES,
  type EncounterDifficulty,
} from '@/core/srd5/srd52/encounter';

export const TOOL_ID = '5e-calc';
export const DATA_VERSION = 1;

export const LIMITS = {
  partyGroups: 10,
  monsterGroups: 20,
  partyCount: [1, 10],
  level: [1, 20],
  monsterCount: [1, 20],
  name: 40,
} as const;

export type Tab = 'encounter' | 'monster' | 'buy';
export const TABS: readonly Tab[] = ['encounter', 'monster', 'buy'];

export interface PartyGroup {
  id: string;
  count: number;
  level: number;
}

export interface MonsterGroup {
  id: string;
  /** 名字（選填；空白時「CR 2 的怪物」） */
  name: string;
  cr: Cr;
  count: number;
}

export type BuyRules = '2024' | '2014';
export type BgMode = '2-1' | '1-1-1';

export interface BuyState {
  rules: BuyRules;
  scores: Record<Ability, number>;
  /** 2014（SRD 5.1）：種族 */
  race: RaceKey | 'none';
  /** 半精靈自選的兩項 */
  raceChoice: Ability[];
  /** 2024（SRD 5.2.1）：背景 */
  bg: BackgroundKey | 'custom' | 'none';
  /** 自訂背景的三項 */
  bgCustom: Ability[];
  bgMode: BgMode;
  bgPlus2: Ability;
  bgPlus1: Ability;
}

export interface CalcData {
  party: PartyGroup[];
  monsters: MonsterGroup[];
  quick: { cr: Cr; name: string; count: number };
  buy: BuyState;
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export const baseScores = (): Record<Ability, number> => ({
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
});

export function initialData(): CalcData {
  return {
    party: [{ id: 'p1', count: 4, level: 1 }],
    monsters: [{ id: 'm1', name: '', cr: '1', count: 1 }],
    quick: { cr: '0', name: '', count: 1 },
    buy: {
      rules: '2024',
      scores: baseScores(),
      race: 'none',
      raceChoice: ['str', 'dex'],
      bg: 'none',
      bgCustom: ['str', 'dex', 'con'],
      bgMode: '2-1',
      bgPlus2: 'str',
      bgPlus1: 'dex',
    },
  };
}

const clampInt = (v: unknown, [min, max]: readonly [number, number], fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const cut = (s: unknown, n: number): string =>
  typeof s === 'string' ? Array.from(s).slice(0, n).join('') : '';

/* ---------- 遭遇 ---------- */

export type DifficultyResult = 'none' | EncounterDifficulty | 'over';

export interface EncounterSummary {
  characters: number;
  totalLevels: number;
  /** 平均等級（四捨五入） */
  avgLevel: number;
  monsters: number;
  /** 怪物的 XP 總和（SRD 5.2.1 不乘倍率） */
  xp: number;
  /** 隊伍的 XP 預算：每組「人數 × 那個等級的每人預算」加總 */
  budget: Record<EncounterDifficulty, number>;
  difficulty: DifficultyResult;
  benchmark: BenchmarkResult | null;
  /** 排除問題的提醒（SRD 5.2.1 Troubleshooting） */
  tips: ('many' | 'powerful' | 'cr0')[];
  highestCr: number;
}

export function encounterSummary(
  party: readonly PartyGroup[],
  monsters: readonly MonsterGroup[],
): EncounterSummary {
  const levels: number[] = [];
  const budget: Record<EncounterDifficulty, number> = { low: 0, moderate: 0, high: 0 };
  for (const g of party) {
    const b = budgetForLevel(g.level);
    for (const k of DIFFICULTIES) budget[k] += b[k] * g.count;
    for (let i = 0; i < g.count; i++) levels.push(g.level);
  }
  const crs: number[] = [];
  let xp = 0;
  let cr0 = false;
  for (const m of monsters) {
    xp += CR_XP[m.cr] * m.count;
    if (m.cr === '0') cr0 = true;
    for (let i = 0; i < m.count; i++) crs.push(crNumber(m.cr));
  }
  const characters = levels.length;
  const totalLevels = levels.reduce((a, b) => a + b, 0);
  const avgLevel = characters ? Math.round(totalLevels / characters) : 0;
  const difficulty: DifficultyResult =
    !characters || !crs.length
      ? 'none'
      : xp <= budget.low
        ? 'low'
        : xp <= budget.moderate
          ? 'moderate'
          : xp <= budget.high
            ? 'high'
            : 'over';
  const highestCr = crs.length ? Math.max(...crs) : 0;
  const tips: EncounterSummary['tips'] = [];
  if (characters && crs.length > characters * 2) tips.push('many');
  if (characters && highestCr > avgLevel) tips.push('powerful');
  if (cr0) tips.push('cr0');
  return {
    characters,
    totalLevels,
    avgLevel,
    monsters: crs.length,
    xp,
    budget,
    difficulty,
    benchmark: lazyBenchmark(levels, crs),
    tips,
    highestCr,
  };
}

export const monsterName = (g: Pick<MonsterGroup, 'name' | 'cr'>): string =>
  g.name.trim() || `CR ${g.cr} 的怪物`;

/** 一隻怪物在戰鬥追蹤的備註：CR、攻擊加值、每輪傷害、DC（快速怪物數值） */
export function monsterNote(cr: Cr): string {
  const s = quickStats(cr);
  return `CR ${cr}｜熟練加值 ${signed(s.prof)}｜每輪傷害 ${s.dpr}（${s.attacks} 次 × ${s.damage}〔${diceText(s.dice)}〕）｜DC ${s.acDc}`;
}

/** 送到戰鬥追蹤：HP、AC 照快速怪物數值；先攻擲 1d20（加值 0） */
export function monsterSeeds(
  groups: readonly Pick<MonsterGroup, 'name' | 'cr' | 'count'>[],
): CombatSeed[] {
  return groups.map((g) => {
    const s = quickStats(g.cr);
    return {
      name: monsterName(g),
      count: g.count,
      side: 'enemy',
      initMod: 0,
      rollInit: true,
      hp: s.hp,
      ac: s.acDc,
      note: monsterNote(g.cr),
    };
  });
}

/**
 * 原作的「Export for Combat Tracker」：Lazy GM Tools 的 Combat Tracker 讀得進去的 JSON
 * （本站的戰鬥追蹤也讀得進去）。先攻 10（沒有怪物資料時原作用 10）、HP 與 AC 照快速怪物數值；
 * 一組有好幾隻時名字加 A、B…（原作的規則）。
 */
export function trackerJson(groups: readonly MonsterGroup[], now = new Date()): string {
  let id = now.getTime();
  const combatants = groups.flatMap((g) => {
    const s = quickStats(g.cr);
    const name = monsterName(g);
    return Array.from({ length: g.count }, (_, i) => ({
      id: id++,
      name: g.count > 1 ? `${name} ${String.fromCharCode(65 + i)}` : name,
      initiative: 10,
      maxHp: s.hp,
      currentHp: s.hp,
      ac: s.acDc,
      originalMonsterName: name,
      monsterSource: null,
    }));
  });
  return JSON.stringify(
    { combatants, currentTurnIndex: 0, exportDate: now.toISOString() },
    null,
    2,
  );
}

export const trackerJsonName = (now = new Date()): string =>
  `encounter_for_combat_tracker_${now.toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

/* ---------- 能力值點數購買 ---------- */

export const pointsSpent = (scores: Record<Ability, number>): number =>
  ABILITY_KEYS.reduce((n, k) => n + (POINT_COST[scores[k]] ?? 0), 0);

export const pointsLeft = (scores: Record<Ability, number>): number =>
  POINT_BUY_TOTAL - pointsSpent(scores);

export function canIncrease(scores: Record<Ability, number>, k: Ability): boolean {
  const s = scores[k];
  if (s >= POINT_BUY_MAX) return false;
  return POINT_COST[s + 1] - POINT_COST[s] <= pointsLeft(scores);
}

export const canDecrease = (scores: Record<Ability, number>, k: Ability): boolean =>
  scores[k] > POINT_BUY_MIN;

/**
 * 直接打的能力值（原作的規則）：夾在 8～15；點數不夠時改成買得起的最高值。
 */
export function typedScore(scores: Record<Ability, number>, k: Ability, value: number): number {
  let v = Number.isFinite(value) ? Math.round(value) : POINT_BUY_MIN;
  v = Math.min(POINT_BUY_MAX, Math.max(POINT_BUY_MIN, v));
  const cur = POINT_COST[scores[k]];
  const left = pointsLeft(scores);
  if (POINT_COST[v] - cur <= left) return v;
  for (let t = POINT_BUY_MAX; t >= POINT_BUY_MIN; t--) if (POINT_COST[t] - cur <= left) return t;
  return scores[k];
}

/** 種族（2014）或背景（2024）的加值 */
export function bonuses(b: BuyState): Record<Ability, number> {
  const out = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as Record<Ability, number>;
  if (b.rules === '2014') {
    const r = b.race === 'none' ? undefined : race51(b.race);
    if (!r) return out;
    for (const [k, v] of Object.entries(r.bonus)) out[k as Ability] += v as number;
    if (r.choice) for (const k of b.raceChoice.slice(0, r.choice.count)) out[k] += r.choice.amount;
    return out;
  }
  const abilities = backgroundAbilities(b);
  if (!abilities) return out;
  if (b.bgMode === '1-1-1') for (const k of abilities) out[k] += 1;
  else {
    out[b.bgPlus2] += 2;
    out[b.bgPlus1] += 1;
  }
  return out;
}

/** 背景列出的三項（沒有選背景時 null） */
export function backgroundAbilities(
  b: Pick<BuyState, 'bg' | 'bgCustom'>,
): readonly Ability[] | null {
  if (b.bg === 'none') return null;
  if (b.bg === 'custom') return b.bgCustom;
  return BACKGROUNDS.find((x) => x.key === b.bg)?.abilities ?? null;
}

/** 最後的能力值（買的＋加值；2024 的背景不能超過 20） */
export function finalScores(b: BuyState): Record<Ability, number> {
  const bonus = bonuses(b);
  const out = {} as Record<Ability, number>;
  for (const k of ABILITY_KEYS) {
    const v = b.scores[k] + bonus[k];
    out[k] = b.rules === '2024' ? Math.min(BACKGROUND_SCORE_MAX, v) : v;
  }
  return out;
}

/** 選了背景之後的 +2／+1：要是背景的三項之一、而且不同；不合時改成前兩項 */
export function fixBackground(b: BuyState): void {
  const abilities = backgroundAbilities(b);
  if (!abilities) return;
  if (!abilities.includes(b.bgPlus2)) b.bgPlus2 = abilities[0];
  if (!abilities.includes(b.bgPlus1) || b.bgPlus1 === b.bgPlus2)
    b.bgPlus1 = abilities.find((k) => k !== b.bgPlus2) ?? abilities[1];
}

/** 半精靈的自選兩項：不同、不是魅力；不合時補上 */
export function fixRaceChoice(b: BuyState): void {
  const r = b.race === 'none' ? undefined : race51(b.race);
  if (!r?.choice) return;
  const ex = r.choice.exclude;
  const picked: Ability[] = [];
  for (const k of b.raceChoice) if (!ex.includes(k) && !picked.includes(k)) picked.push(k);
  for (const k of ABILITY_KEYS) {
    if (picked.length >= r.choice.count) break;
    if (!ex.includes(k) && !picked.includes(k)) picked.push(k);
  }
  b.raceChoice = picked.slice(0, r.choice.count);
}

export const modText = (score: number): string => signed(abilityModifier(score));

/** 複製用的文字：每項「力量 15（+2）」，下一行寫用了幾點、加值的來源 */
export function buyText(b: BuyState): string {
  const fin = finalScores(b);
  const bonus = bonuses(b);
  const parts = ABILITIES.map((a) => `${a.name} ${fin[a.key]}（${modText(fin[a.key])}）`);
  const src =
    b.rules === '2014'
      ? b.race === 'none'
        ? '2014（SRD 5.1）：沒有種族加值'
        : `2014（SRD 5.1）：${race51(b.race)?.name ?? ''}`
      : b.bg === 'none'
        ? '2024（SRD 5.2.1）：沒有背景加值'
        : `2024（SRD 5.2.1）：${b.bg === 'custom' ? '自訂背景' : (BACKGROUNDS.find((x) => x.key === b.bg)?.name ?? '')}`;
  const plus = ABILITIES.filter((a) => bonus[a.key])
    .map((a) => `${a.name} +${bonus[a.key]}`)
    .join('、');
  return `${parts.join('、')}\n點數購買 ${pointsSpent(b.scores)}／${POINT_BUY_TOTAL} 點｜${src}${plus ? `（${plus}）` : ''}`;
}

/* ---------- 存檔的整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export function sanitizeData(raw: unknown): CalcData | null {
  if (!isObj(raw)) return null;
  const d = initialData();
  if (Array.isArray(raw.party)) {
    const party: PartyGroup[] = [];
    for (const v of raw.party) {
      if (!isObj(v)) continue;
      party.push({
        id: typeof v.id === 'string' && v.id ? v.id : newId('p'),
        count: clampInt(v.count, LIMITS.partyCount, 4),
        level: clampInt(v.level, LIMITS.level, 1),
      });
      if (party.length >= LIMITS.partyGroups) break;
    }
    if (party.length) d.party = party;
  }
  if (Array.isArray(raw.monsters)) {
    const ms: MonsterGroup[] = [];
    for (const v of raw.monsters) {
      if (!isObj(v)) continue;
      ms.push({
        id: typeof v.id === 'string' && v.id ? v.id : newId('m'),
        name: cut(v.name, LIMITS.name),
        cr: isCr(v.cr) ? v.cr : '1',
        count: clampInt(v.count, LIMITS.monsterCount, 1),
      });
      if (ms.length >= LIMITS.monsterGroups) break;
    }
    if (ms.length) d.monsters = ms;
  }
  if (isObj(raw.quick)) {
    d.quick = {
      cr: isCr(raw.quick.cr) ? raw.quick.cr : '0',
      name: cut(raw.quick.name, LIMITS.name),
      count: clampInt(raw.quick.count, LIMITS.monsterCount, 1),
    };
  }
  if (isObj(raw.buy)) {
    const b = raw.buy;
    const buy = d.buy;
    buy.rules = b.rules === '2014' ? '2014' : '2024';
    if (isObj(b.scores)) {
      for (const k of ABILITY_KEYS)
        buy.scores[k] = clampInt(b.scores[k], [POINT_BUY_MIN, POINT_BUY_MAX], 8);
      /* 點數超過 27 的（手改的存檔）：回到 8 */
      if (pointsLeft(buy.scores) < 0) buy.scores = baseScores();
    }
    buy.race = RACES_51.some((r) => r.key === b.race) ? (b.race as RaceKey) : 'none';
    if (Array.isArray(b.raceChoice)) buy.raceChoice = b.raceChoice.filter(isAbility).slice(0, 2);
    buy.bg =
      b.bg === 'custom' || b.bg === 'none' || BACKGROUNDS.some((x) => x.key === b.bg)
        ? (b.bg as BuyState['bg'])
        : 'none';
    if (Array.isArray(b.bgCustom)) {
      const picked = [...new Set(b.bgCustom.filter(isAbility))].slice(0, 3);
      for (const k of ABILITY_KEYS) if (picked.length < 3 && !picked.includes(k)) picked.push(k);
      buy.bgCustom = picked;
    }
    buy.bgMode = b.bgMode === '1-1-1' ? '1-1-1' : '2-1';
    if (isAbility(b.bgPlus2)) buy.bgPlus2 = b.bgPlus2;
    if (isAbility(b.bgPlus1)) buy.bgPlus1 = b.bgPlus1;
    fixBackground(buy);
    fixRaceChoice(buy);
  }
  return d;
}

export { CR_VALUES };
