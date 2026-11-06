/**
 * 產生器的定義：原作 mshea/lazy_gm_tools 的 `5e_artisanal_database/generators/` 的 13 個產生器（template 除外），
 * 加上使用者自己寫的表（自訂產生器）。每個產生器依選項組出這次的範本、表與表函式（法術、名字）；抽法在 engine.ts。
 * 規格：docs/refactor/specs/fantasy-gen.md。
 */
import { CONDITIONS, ITEMS, LOCATIONS, MONSTER_TYPES, ORIGINS } from './data/5eadb/common';
import { NAME_PREFIXES, NAME_SUFFIXES } from './data/location-names';
import {
  artTier,
  gemTier,
  MONUMENTS,
  type NamePack,
  NPC_DRESS,
  NPC_GOALS,
  NPC_PERSONALITIES,
  NPC_ROLES,
  NPC_SPECIES,
  NPC_TRAITS,
  QUEST_TASKS,
  TRAP_DEVICES,
  TRAP_EFFECTS,
  TRAP_TRIGGERS,
} from './data/own';
import { AMMUNITION, ARMORS, TREASURE_ARMORS, TREASURE_WEAPONS, WEAPONS } from './data/srd/gear';
import { SPELLS, type SpellRow } from './data/srd/spells';
import { BFRD_ITEMS, LAZY_ITEMS, SRD52_ITEMS } from './data/srd/treasure-items';
import {
  type ExpandContext,
  parseTables,
  pickEntry,
  type Rng,
  type RolledPart,
  type TableEntry,
  type TableFn,
  type TableSet,
  type TableSource,
  tablesFrom,
} from './engine';
import { S } from './strings';

/* ---------- 型別 ---------- */

export type CategoryId = 'people' | 'adventure' | 'places' | 'items' | 'treasure' | 'custom';

export const CATEGORIES: readonly CategoryId[] = [
  'people',
  'adventure',
  'places',
  'items',
  'treasure',
  'custom',
];

/** 「關於規則內容」要列的資料來源 */
export type SourceId = 'srd51' | 'srd52' | 'bfrd' | '5eadb' | 'inknomu' | 'cc0' | 'own';

export interface GenChoice {
  value: string;
  label: string;
}

export interface GenOption {
  key: string;
  label: string;
  choices: readonly GenChoice[];
  default: string;
  /** 選項多（法師等級 1～20）時用下拉選單 */
  select?: boolean;
}

export type GenOptions = Readonly<Record<string, string>>;

/** 名字的來源（弄墨 Inknomu 的奇幻語料；還沒載入時 null） */
export interface FantasyNames {
  draw(pack: NamePack, rng: Rng): string;
}

export interface GenEnv {
  names: FantasyNames | null;
}

export interface RollArgs {
  rng: Rng;
  /** 留著的欄（鍵 → 值） */
  keep: Readonly<Record<string, string>>;
  /** 重抽前的這一筆（法術書：重抽一環時照舊的個數） */
  prev?: readonly RolledPart[];
}

export interface Built {
  /** 範本（多種時依權重抽一種；鎖定了欄時照原本那一種） */
  templates: readonly TableEntry[];
  tables: TableSet;
  fns?: Readonly<Record<string, TableFn>>;
  /** 先抽這些欄（NPC：先抽種族再依種族抽名字） */
  order?: readonly string[];
  /** 自己抽（法術書）：給了就不用範本 */
  roll?(args: RollArgs): RolledPart[];
  /** 自訂產生器的問題（找不到的表等） */
  issues?: readonly string[];
}

export interface GeneratorDef {
  id: string;
  category: CategoryId;
  label: string;
  summary: string;
  options: readonly GenOption[];
  /** 預設一次產生幾筆（原作：大多 10 筆、地名 20 筆、寶藏與法術書 1 筆） */
  defaultCount: number;
  /** 一筆是一大塊（寶藏、法術書）：結果卡排一欄 */
  block?: boolean;
  /** 要先載入名字的語料（NPC、委託） */
  needsNames?: boolean;
  /** CCFOLIA 棋子的名稱用哪一欄（沒有時用產生器的名稱） */
  titleField?: string;
  sources: readonly SourceId[];
  build(options: GenOptions, env: GenEnv): Built;
}

/* ---------- 共用的表 ---------- */

const zhOf = (rows: readonly (readonly [string, string])[]) => rows.map((r) => r[1]);
const both = (en: string, zh: string) => `${zh}（${en}）`;

/** 狀態、來源、小東西、地點、生物類型（5e Artisanal Database 的共用詞，本站翻譯） */
const COMMON: TableSource = {
  condition: zhOf(CONDITIONS),
  origin: zhOf(ORIGINS),
  item: zhOf(ITEMS),
  location: zhOf(LOCATIONS),
  monster_type: zhOf(MONSTER_TYPES),
};

const NPC_TABLES: TableSource = {
  species: NPC_SPECIES.map(([name, , w]) => [name, w] as const),
  personality: NPC_PERSONALITIES,
  role: NPC_ROLES,
  trait: NPC_TRAITS,
  dress: NPC_DRESS,
  goal: NPC_GOALS,
  quest: QUEST_TASKS,
};

const PACK_OF = new Map(NPC_SPECIES.map(([name, pack]) => [name, pack]));

/** 依「種族」欄抽名字（語料還沒載入時是「（無名氏）」） */
function nameFn(env: GenEnv): TableFn {
  return (ctx: ExpandContext) => {
    const pack = PACK_OF.get(ctx.values?.種族 ?? '') ?? 'human';
    return env.names ? env.names.draw(pack, ctx.rng) : S.out.noName;
  };
}

/* ---------- 法術 ---------- */

export type SpellSource = 'srd52' | 'srd51' | 'bfrd';
const SOURCE_COLUMN: Record<SpellSource, 2 | 3 | 4> = { srd52: 2, srd51: 3, bfrd: 4 };

export interface Spell {
  en: string;
  zh: string;
  level: number;
  wizard: boolean;
}

const spellCache = new Map<SpellSource, Spell[]>();

/** 一份 SRD 的法術（照英文名排序） */
export function spellsOf(source: SpellSource): Spell[] {
  const cached = spellCache.get(source);
  if (cached) return cached;
  const col = SOURCE_COLUMN[source];
  const list = SPELLS.filter((r: SpellRow) => r[col] !== '').map((r) => ({
    en: r[0],
    zh: r[1],
    level: Number.parseInt(r[col], 10),
    wizard: r[col].endsWith('w'),
  }));
  spellCache.set(source, list);
  return list;
}

/**
 * 法術捲軸的數值（SRD 的 Spell Scroll 表：稀有度、豁免 DC、攻擊加值；價格是原作的參考價），索引＝環位。
 */
export const SCROLL_STATS: readonly { dc: number; attack: number; price: number }[] = [
  { dc: 13, attack: 5, price: 30 },
  { dc: 13, attack: 5, price: 50 },
  { dc: 13, attack: 5, price: 200 },
  { dc: 15, attack: 7, price: 300 },
  { dc: 15, attack: 7, price: 2000 },
  { dc: 17, attack: 9, price: 3000 },
  { dc: 17, attack: 9, price: 20000 },
  { dc: 18, attack: 10, price: 25000 },
  { dc: 18, attack: 10, price: 30000 },
  { dc: 19, attack: 11, price: 100000 },
];

/** 稀有度 → 環位（原作 rarityToLevels） */
export const RARITY_LEVELS: Readonly<Record<string, readonly number[]>> = {
  any: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  common: [0, 1],
  uncommon: [2, 3],
  rare: [4, 5],
  'very-rare': [6, 7, 8],
  legendary: [9],
};

export const levelText = (level: number) => (level === 0 ? S.out.cantrip : S.out.level(level));
export const spellLabel = (s: Pick<Spell, 'en' | 'zh'>) => `「${both(s.en, s.zh)}」`;

/** 法術後面的括號：哪些項目 */
export type SpellStyle = 'scroll' | 'relic' | 'item' | 'short' | 'once';

export function formatSpell(s: Spell, style: SpellStyle): string {
  const st = SCROLL_STATS[s.level];
  const lv = levelText(s.level);
  const rarity = S.out.rarity[s.level];
  const atk = `${S.out.spellAttack} +${st.attack}`;
  switch (style) {
    case 'scroll':
      return `${spellLabel(s)}（${lv}，${rarity}，DC ${st.dc}，${atk}，${st.price.toLocaleString('en-US')} GP）`;
    case 'relic':
      return `${spellLabel(s)}（${lv}，${rarity}，DC ${st.dc}，${atk}，${Math.round(st.price / 2).toLocaleString('en-US')} GP）`;
    case 'item':
      return `${spellLabel(s)}（${lv}，${rarity}，DC ${st.dc}，${atk}）`;
    case 'short':
      return `${spellLabel(s)}（${lv}，DC ${st.dc}，${atk}）`;
    case 'once':
      return `${spellLabel(s)}${S.out.once}（${lv}，DC ${st.dc}，${atk}）`;
  }
}

/** 從環位清單裡隨機一環（那一份 SRD 有法術的），再抽一個法術（原作：先抽環位再抽法術） */
export function pickSpell(source: SpellSource, levels: readonly number[], rng: Rng): Spell | null {
  const all = spellsOf(source);
  const usable = levels.filter((l) => all.some((s) => s.level === l));
  if (!usable.length) return null;
  const level = usable[Math.floor(rng() * usable.length)];
  const pool = all.filter((s) => s.level === level);
  return pool[Math.floor(rng() * pool.length)];
}

function spellFn(source: SpellSource, levels: readonly number[], style: SpellStyle): TableFn {
  return (ctx) => {
    const s = pickSpell(source, levels, ctx.rng);
    return s ? formatSpell(s, style) : '';
  };
}

/** 寶藏用的表函式：`spell_0`～`spell_9`（那一環）與 `spell`（任一環，遺物用） */
function treasureSpellFns(source: SpellSource): Record<string, TableFn> {
  const fns: Record<string, TableFn> = { spell: spellFn(source, RARITY_LEVELS.any, 'once') };
  for (let l = 0; l <= 9; l++) fns[`spell_${l}`] = spellFn(source, [l], 'short');
  return fns;
}

/* ---------- 選項 ---------- */

const SOURCE_OPTION: GenOption = {
  key: 'source',
  label: S.options.spellSource,
  default: 'srd52',
  choices: [
    { value: 'srd52', label: S.options.srd52 },
    { value: 'srd51', label: S.options.srd51 },
  ],
};

const RARITY_OPTION: GenOption = {
  key: 'rarity',
  label: S.options.rarity,
  default: 'any',
  select: true,
  choices: [
    { value: 'any', label: S.options.rarityAny },
    { value: 'common', label: S.options.rarityCommon },
    { value: 'uncommon', label: S.options.rarityUncommon },
    { value: 'rare', label: S.options.rarityRare },
    { value: 'very-rare', label: S.options.rarityVeryRare },
    { value: 'legendary', label: S.options.rarityLegendary },
  ],
};

const TIER_OPTION: GenOption = {
  key: 'tier',
  label: S.options.tier,
  default: 'tier1',
  choices: [
    { value: 'tier1', label: S.options.tier1 },
    { value: 'tier2', label: S.options.tier2 },
    { value: 'tier3', label: S.options.tier3 },
    { value: 'tier4', label: S.options.tier4 },
  ],
};

/** 法師等級 → 法術書裡的法術數（1 環以上）、最高環位、戲法數（SRD 的法師） */
export function wizardProgression(level: number): {
  spells: number;
  maxLevel: number;
  cantrips: number;
} {
  const l = Math.max(1, Math.min(20, Math.round(level)));
  return {
    spells: 6 + 2 * (l - 1),
    maxLevel: Math.min(9, Math.ceil(l / 2)),
    cantrips: l >= 10 ? 5 : l >= 4 ? 4 : 3,
  };
}

const WIZARD_OPTION: GenOption = {
  key: 'level',
  label: S.options.wizardLevel,
  default: '3',
  select: true,
  choices: Array.from({ length: 20 }, (_, i) => {
    const p = wizardProgression(i + 1);
    return { value: String(i + 1), label: S.options.wizardLevelLabel(i + 1, p.spells, p.cantrips) };
  }),
};

export function optionValue(
  def: Pick<GeneratorDef, 'options'>,
  options: GenOptions,
  key: string,
): string {
  const opt = def.options.find((o) => o.key === key);
  const v = options[key];
  if (opt?.choices.some((c) => c.value === v)) return v;
  return opt?.default ?? '';
}

const spellSourceOf = (def: Pick<GeneratorDef, 'options'>, o: GenOptions) =>
  optionValue(def, o, 'source') as SpellSource;
const tierOf = (def: Pick<GeneratorDef, 'options'>, o: GenOptions) =>
  optionValue(def, o, 'tier') as 'tier1' | 'tier2' | 'tier3' | 'tier4';

const one = (template: string): TableEntry[] => [{ text: template, weight: 1 }];

/* ---------- 寶藏 ---------- */

/** 寶藏表裡出現的每顆寶石價值、藝術品價值（GP） */
const GEM_VALUES = [10, 25, 50, 100, 250, 500, 1000, 5000] as const;
const ART_VALUES = [25, 50, 250, 500, 750, 2500, 5000, 7500, 10000, 50000] as const;

/**
 * 依價值的寶石表 `gem_<價值>` 與藝術品表 `art_<價值>`：寶石與藝術品的分級是本站定的（data/own.ts 的 gemTier、artTier），
 * 價值照原作的寶藏表。藝術品前面加「狀態＋來源」（原作：每個藝術品前面加 {condition} {origin}），後面寫價值；
 * listed 時每一項前面寫「藝術品：」（個數不一定、一項一行的清單用）。
 */
function valueTables(listed: boolean): TableSource {
  const out: Record<string, string[]> = {};
  for (const v of GEM_VALUES) out[`gem_${v}`] = [...gemTier(v)];
  for (const v of ART_VALUES)
    out[`art_${v}`] = artTier(v).map(
      (a) =>
        `${listed ? '藝術品：' : ''}{condition}{origin}${a}（${v.toLocaleString('en-US')} GP）`,
    );
  return out;
}

const treasureWeapon = (flavored: boolean) =>
  TREASURE_WEAPONS.map(
    ([en, zh, w]) => [flavored ? `{condition}{origin}${both(en, zh)}` : both(en, zh), w] as const,
  );
const treasureArmor = (flavored: boolean) =>
  TREASURE_ARMORS.map(([en, zh]) =>
    flavored ? `{condition}{origin}${both(en, zh)}` : both(en, zh),
  );
const AMMO = AMMUNITION.map(([en, zh, w]) => [both(en, zh), w] as const);

/** Lazy 5e 寶藏：錢幣、寶石、藝術品、消耗品 2、永久物品 1、遺物（原作 treasure/data.js 的數值） */
const LAZY_TIERS: Record<string, string> = {
  tier1: [
    '錢幣：{@錢幣:[[400-600]] CP、[[350-550]] SP、[[180-280]] GP}',
    `寶石：{@寶石:{gem_10} ×[[5-9]]（${S.out.perGem('10')}）}`,
    '藝術品：{@藝術品:{art_50}}',
    '消耗品：{@消耗品:{uncommon_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item}}',
  ].join('\n'),
  tier2: [
    '錢幣：{@錢幣:[[400-600]] SP、[[2650-3650]] GP、[[75-125]] PP}',
    `寶石：{@寶石:{gem_50} ×[[5-9]]（${S.out.perGem('50')}）}`,
    '藝術品：{@藝術品:{art_500}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item|rare_magic_item}}',
  ].join('\n'),
  tier3: [
    '錢幣：{@錢幣:[[15750-25750]] GP、[[200-300]] PP}',
    `寶石：{@寶石:{gem_250} ×[[5-9]]（${S.out.perGem('250')}）}`,
    '藝術品：{@藝術品:{art_5000}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable|very_rare_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable|very_rare_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item|rare_magic_item|very_rare_magic_item}}',
  ].join('\n'),
  tier4: [
    '錢幣：{@錢幣:[[45000-145000]] GP、[[15000-25000]] PP}',
    `寶石：{@寶石:{gem_5000} ×[[5-9]]（${S.out.perGem('5,000')}）}`,
    '藝術品：{@藝術品:{art_50000}}',
    '消耗品：{@消耗品:{rare_consumable|very_rare_consumable|legendary_consumable}}',
    '消耗品：{@消耗品:{rare_consumable|very_rare_consumable|legendary_consumable}}',
    '永久物品：{@永久物品:{rare_magic_item|very_rare_magic_item|legendary_magic_item}}',
  ].join('\n'),
};

/** SRD 5.2（2024）寶藏：每個等級 4～5 種錢幣與財寶的組合（原作 2024_dnd_treasure/data.js 的數值），加上 N 個魔法物品 */
const SRD52_TIERS: Record<string, readonly string[]> = {
  tier1: [
    '錢幣：{@錢幣:[[150-250]] CP、[[130-230]] SP、[[430-530]] GP}',
    '錢幣：{@錢幣:[[150-250]] CP、[[130-230]] SP、[[330-430]] GP}\n財寶：{@財寶:銀條 ×[[8-12]]（每條 10 GP）}',
    `錢幣：{@錢幣:[[150-250]] CP、[[130-230]] SP、[[330-430]] GP}\n財寶：{@財寶:{gem_10} ×[[8-12]]（${S.out.perGem('10')}）}`,
    `錢幣：{@錢幣:[[150-250]] CP、[[130-230]] SP、[[280-380]] GP}\n財寶：{@財寶:{gem_10} ×[[8-12]]（${S.out.perGem('10')}）}\n{@藝術品:{art_25*[[1-3]]}}`,
  ],
  tier2: [
    '錢幣：{@錢幣:[[150-250]] SP、[[1980-2780]] GP、[[150-250]] PP}',
    '錢幣：{@錢幣:[[150-250]] SP、[[1980-2780]] GP、[[125-225]] PP}\n財寶：{@財寶:銀條 ×[[8-12]]（每條 25 GP）}',
    `錢幣：{@錢幣:[[150-250]] SP、[[1980-2780]] GP、[[100-200]] PP}\n財寶：{@財寶:{gem_50} ×[[8-12]]（${S.out.perGem('50')}）}`,
    '錢幣：{@錢幣:[[150-250]] SP、[[1980-2780]] GP、[[100-200]] PP}\n{@藝術品:{art_250*[[1-3]]}}',
  ],
  tier3: [
    '錢幣：{@錢幣:[[30000-36000]] GP、[[200-400]] PP}',
    '錢幣：{@錢幣:[[27500-33500]] GP、[[200-400]] PP}\n財寶：{@財寶:金條 ×[[8-12]]（每條 250 GP）}',
    `錢幣：{@錢幣:[[29000-35000]] GP、[[200-400]] PP}\n財寶：{@財寶:{gem_100} ×[[8-12]]（${S.out.perGem('100')}）}`,
    `錢幣：{@錢幣:[[27500-33500]] GP、[[200-400]] PP}\n財寶：{@財寶:{gem_100} ×[[8-12]]（${S.out.perGem('100')}）}\n{@藝術品:{art_750*[[1-3]]}}`,
  ],
  tier4: [
    '錢幣：{@錢幣:[[200000-260000]] GP、[[8000-12000]] PP}',
    `錢幣：{@錢幣:[[200000-260000]] GP、[[7000-11000]] PP}\n財寶：{@財寶:{gem_1000} ×[[8-12]]（${S.out.perGem('1,000')}）}`,
    `錢幣：{@錢幣:[[200000-260000]] GP、[[5000-9000]] PP}\n財寶：{@財寶:{gem_1000} ×[[8-12]]（${S.out.perGem('1,000')}）}\n財寶：{@財寶:{gem_5000} ×[[2-6]]（${S.out.perGem('5,000')}）}`,
    `錢幣：{@錢幣:[[200000-260000]] GP、[[6500-10500]] PP}\n財寶：{@財寶:{gem_1000} ×[[8-12]]（${S.out.perGem('1,000')}）}\n{@藝術品:{art_2500*[[1-3]]}}`,
    `錢幣：{@錢幣:[[192500-252500]] GP、[[6500-10500]] PP}\n財寶：{@財寶:{gem_1000} ×[[8-12]]（${S.out.perGem('1,000')}）}\n{@藝術品:{art_2500*[[1-3]]}\n{art_7500}}`,
  ],
};

/** 每個等級的魔法物品數與稀有度的機率（原作 2024_dnd_treasure 的權重） */
const SRD52_MAGIC: Record<
  string,
  { count: string; weights: readonly (readonly [string, number])[] }
> = {
  tier1: {
    count: '[[0-3]]',
    weights: [
      ['common', 54],
      ['uncommon', 37],
      ['rare', 9],
    ],
  },
  tier2: {
    count: '[[1-3]]',
    weights: [
      ['common', 30],
      ['uncommon', 51],
      ['rare', 17],
      ['very_rare', 2],
    ],
  },
  tier3: {
    count: '[[1-4]]',
    weights: [
      ['common', 11],
      ['uncommon', 23],
      ['rare', 36],
      ['very_rare', 23],
      ['legendary', 7],
    ],
  },
  tier4: {
    count: '[[1-6]]',
    weights: [
      ['rare', 20],
      ['very_rare', 44],
      ['legendary', 36],
    ],
  },
};

/** BFRD（Black Flag）寶藏（原作 tov_treasure/data.js 的數值） */
const BFRD_TIERS: Record<string, string> = {
  tier1: [
    '錢幣：{@錢幣:[[400-600]] CP、[[175-225]] SP、[[100-150]] GP}',
    `寶石：{@寶石:{gem_25} ×[[1-4]]（${S.out.perGem('25')}）}`,
    '藝術品：{@藝術品:{art_50}}',
    '普通物品：{@普通物品:{common_magic_item}}',
    '消耗品：{@消耗品:{uncommon_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item}}',
  ].join('\n'),
  tier2: [
    '錢幣：{@錢幣:[[300-700]] SP、[[800-1000]] GP、[[25-75]] PP}',
    `寶石：{@寶石:{gem_100} ×[[4-6]]（${S.out.perGem('100')}）}`,
    '藝術品：{@藝術品:{art_50}}',
    '藝術品：{@藝術品:{art_500}}',
    '普通物品：{@普通物品:{common_magic_item}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item|rare_magic_item}}',
  ].join('\n'),
  tier3: [
    '錢幣：{@錢幣:[[4000-5000]] GP、[[175-225]] PP}',
    `寶石：{@寶石:{gem_500} ×[[1-5]]（${S.out.perGem('500')}）}`,
    '藝術品：{@藝術品:{art_500}}',
    '藝術品：{@藝術品:{art_2500}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable|very_rare_consumable}}',
    '消耗品：{@消耗品:{uncommon_consumable|rare_consumable|very_rare_consumable}}',
    '永久物品：{@永久物品:{uncommon_magic_item|rare_magic_item|very_rare_magic_item}}',
  ].join('\n'),
  tier4: [
    '錢幣：{@錢幣:[[8000-12000]] GP、[[800-1200]] PP}',
    `寶石：{@寶石:{gem_1000} ×[[3-7]]（${S.out.perGem('1,000')}）}`,
    `寶石：{@寶石:{gem_5000} ×1（${S.out.perGem('5,000')}）}`,
    '藝術品：{@藝術品:{art_2500}}',
    '藝術品：{@藝術品:{art_5000}}',
    '藝術品：{@藝術品:{art_10000}}',
    '消耗品：{@消耗品:{rare_consumable|very_rare_consumable|legendary_consumable}}',
    '消耗品：{@消耗品:{rare_consumable|very_rare_consumable|legendary_consumable}}',
    '永久物品：{@永久物品:{rare_magic_item|very_rare_magic_item|legendary_magic_item}}',
  ].join('\n'),
};

/* ---------- 法術書 ---------- */

/** 抽 n 個不重複的法術（每個的權重由 weight 決定） */
function drawDistinct(
  pool: readonly Spell[],
  n: number,
  rng: Rng,
  used: Set<string>,
  weight: (s: Spell) => number = () => 1,
): Spell[] {
  const out: Spell[] = [];
  const left = pool.filter((s) => !used.has(s.en));
  while (out.length < n && left.length) {
    const entry = pickEntry(
      left.map((s) => ({ text: s.en, weight: weight(s) })),
      rng,
    );
    if (!entry) break;
    const i = left.findIndex((s) => s.en === entry.text);
    const [s] = left.splice(i, 1);
    used.add(s.en);
    out.push(s);
  }
  return out;
}

/** 補滿時各環的權重（原作：1 環 4、2 環 3、3～4 環 2、5 環以上 1） */
export const SPELLBOOK_WEIGHTS = [0, 4, 3, 2, 2, 1, 1, 1, 1, 1];

const spellbookLine = (spells: readonly Spell[]) =>
  [...spells]
    .sort((a, b) => (a.en < b.en ? -1 : a.en > b.en ? 1 : 0))
    .map((s) => both(s.en, s.zh))
    .join('、');

/**
 * 法師的法術書（原作 spellbook）：戲法照等級的個數；1 環到最高環各至少一個；剩下的照各環的權重補滿（不重複）。
 * 原作的「法術數」把戲法也算在內，本站照 SRD：法術書裡 6＋2×（等級−1）個 1 環以上的法術，戲法另外算。
 * 欄是每一環一行（「戲法」「1 環」…）；重抽一環時照舊的個數、不和其他環重複。
 */
export function rollSpellbook(
  source: SpellSource,
  level: number,
  { rng, keep, prev }: RollArgs,
): RolledPart[] {
  const p = wizardProgression(level);
  const all = spellsOf(source).filter((s) => s.wizard);
  const byLevel = (l: number) => all.filter((s) => s.level === l);
  const nameOf = (en: string) => all.find((s) => s.en === en);
  /** 留著的欄裡的法術 */
  const used = new Set<string>();
  const keptLevels = new Map<number, Spell[]>();
  const parseLine = (line: string) =>
    line
      .split('、')
      .map((t) => /（([^（）]+)）$/.exec(t)?.[1])
      .flatMap((en) => {
        const s = en ? nameOf(en) : undefined;
        return s ? [s] : [];
      });
  for (const [key, value] of Object.entries(keep)) {
    const l = key === S.out.cantrip ? 0 : Number.parseInt(key, 10);
    if (!Number.isFinite(l)) continue;
    const spells = parseLine(value);
    keptLevels.set(l, spells);
    for (const s of spells) used.add(s.en);
  }
  const counts = new Map<number, number>();
  if (prev) {
    for (const part of prev) {
      if (!part.k) continue;
      const l = part.k === S.out.cantrip ? 0 : Number.parseInt(part.k, 10);
      if (Number.isFinite(l)) counts.set(l, parseLine(part.t).length);
    }
  }
  const chosen = new Map<number, Spell[]>(keptLevels);
  if (prev && counts.size) {
    /* 重抽某幾環：照舊的個數 */
    for (const [l, n] of counts) {
      if (chosen.has(l)) continue;
      chosen.set(l, drawDistinct(byLevel(l), n, rng, used));
    }
  } else {
    if (!chosen.has(0)) chosen.set(0, drawDistinct(byLevel(0), p.cantrips, rng, used));
    const leveled: Spell[] = [];
    for (let l = 1; l <= p.maxLevel; l++) {
      if (chosen.has(l)) continue;
      leveled.push(...drawDistinct(byLevel(l), 1, rng, used));
    }
    const have = [...chosen.entries()].filter(([l]) => l > 0).reduce((n, [, s]) => n + s.length, 0);
    const pool = all.filter((s) => s.level >= 1 && s.level <= p.maxLevel && !chosen.has(s.level));
    leveled.push(
      ...drawDistinct(
        pool,
        Math.max(0, p.spells - have - leveled.length),
        rng,
        used,
        (s) => SPELLBOOK_WEIGHTS[s.level],
      ),
    );
    for (const s of leveled) chosen.set(s.level, [...(chosen.get(s.level) ?? []), s]);
  }
  const parts: RolledPart[] = [{ t: `${S.out.spellbook(Math.round(level))}\n` }];
  const levels = [...chosen.keys()].sort((a, b) => a - b);
  levels.forEach((l, i) => {
    const spells = chosen.get(l) ?? [];
    if (!spells.length) return;
    const label = levelText(l);
    parts.push({ t: `${label}：` });
    parts.push({
      t: Object.hasOwn(keep, label) ? keep[label] : spellbookLine(spells),
      k: label,
      l: label,
    });
    if (i < levels.length - 1) parts.push({ t: '\n' });
  });
  return parts;
}

/* ---------- 產生器 ---------- */

const gen = (
  id: keyof typeof S.gens,
  rest: Omit<GeneratorDef, 'id' | 'label' | 'summary'>,
): GeneratorDef => ({ id, label: S.gens[id].label, summary: S.gens[id].summary, ...rest });

export const GENERATORS: readonly GeneratorDef[] = [
  gen('npc', {
    category: 'people',
    options: [],
    defaultCount: 10,
    needsNames: true,
    titleField: '名字',
    sources: ['own', 'inknomu'],
    build: (_o, env) => ({
      templates: one(
        '{@名字:name}——{@個性:personality}的{@種族:species}{@身分:role}，{@特徵:trait}，穿著{@穿著:dress}，想要{@目標:goal}。',
      ),
      tables: tablesFrom(NPC_TABLES),
      fns: { name: nameFn(env) },
      order: ['種族'],
    }),
  }),
  gen('quest', {
    category: 'adventure',
    options: [],
    defaultCount: 10,
    needsNames: true,
    titleField: '委託人',
    sources: ['own', 'inknomu', '5eadb'],
    build: (_o, env) => ({
      templates: one(
        '{@委託人:name}——{@個性:personality}的{@種族:species}{@身分:role}——希望角色們到{@地點:{condition}{origin}{location}}，{@委託:quest}。那裡有{@盤據者:monster_type}盤據。',
      ),
      tables: tablesFrom(NPC_TABLES, COMMON),
      fns: { name: nameFn(env) },
      order: ['種族'],
    }),
  }),
  gen('trap', {
    category: 'adventure',
    options: [],
    defaultCount: 10,
    sources: ['own'],
    build: () => ({
      templates: one(
        '{@機關一:device}（{@效果一:effect}）和{@機關二:device}（{@效果二:effect}），觸發條件是{@觸發:trigger}。',
      ),
      tables: tablesFrom({ device: TRAP_DEVICES, effect: TRAP_EFFECTS, trigger: TRAP_TRIGGERS }),
    }),
  }),
  gen('location', {
    category: 'places',
    options: [],
    defaultCount: 10,
    sources: ['5eadb'],
    build: () => ({
      templates: one('{@狀態:condition}{@來源:origin}{@地點:location}'),
      tables: tablesFrom(COMMON),
    }),
  }),
  gen('location-name', {
    category: 'places',
    options: [
      {
        key: 'style',
        label: S.options.nameStyle,
        default: 'zh',
        choices: [
          { value: 'zh', label: S.options.nameZh },
          { value: 'en', label: S.options.nameEn },
          { value: 'both', label: S.options.nameBoth },
        ],
      },
    ],
    defaultCount: 20,
    sources: ['cc0'],
    build: (o) => {
      const style = o.style === 'en' || o.style === 'both' ? o.style : 'zh';
      if (style === 'both') {
        /* 中文＋英文：同一組前後半一起抽（括號裡是那一組的英文） */
        return {
          templates: one('{@地名:place}'),
          tables: {},
          fns: {
            place: (ctx) => {
              const a = NAME_PREFIXES[Math.floor(ctx.rng() * NAME_PREFIXES.length)];
              const b = NAME_SUFFIXES[Math.floor(ctx.rng() * NAME_SUFFIXES.length)];
              return `${a[1]}${b[1]}（${a[0]} ${b[0]}）`;
            },
          },
        };
      }
      const col = style === 'en' ? 0 : 1;
      return {
        templates: one(
          style === 'en' ? '{@前半:prefix} {@後半:suffix}' : '{@前半:prefix}{@後半:suffix}',
        ),
        tables: tablesFrom({
          prefix: NAME_PREFIXES.map((r) => r[col]),
          suffix: NAME_SUFFIXES.map((r) => r[col]),
        }),
      };
    },
  }),
  gen('monument', {
    category: 'places',
    options: [],
    defaultCount: 10,
    sources: ['5eadb', 'own'],
    build: () => ({
      templates: one('{@狀態:condition}{@來源:origin}{@地標:monument}'),
      tables: tablesFrom(COMMON, { monument: MONUMENTS }),
    }),
  }),
  gen('relic', {
    category: 'items',
    options: [SOURCE_OPTION, RARITY_OPTION],
    defaultCount: 10,
    sources: ['5eadb', 'srd52', 'srd51'],
    build(o) {
      const levels = RARITY_LEVELS[optionValue(this, o, 'rarity')];
      return {
        templates: one('{@遺物:{condition}{origin}{item}}，可以施放{@法術:spell}。'),
        tables: tablesFrom(COMMON),
        fns: { spell: spellFn(spellSourceOf(this, o), levels, 'relic') },
      };
    },
  }),
  gen('scroll', {
    category: 'items',
    options: [SOURCE_OPTION, RARITY_OPTION],
    defaultCount: 10,
    sources: ['srd52', 'srd51'],
    build(o) {
      const levels = RARITY_LEVELS[optionValue(this, o, 'rarity')];
      return {
        templates: one('法術捲軸（Spell Scroll）：{@法術:spell}'),
        tables: {},
        fns: { spell: spellFn(spellSourceOf(this, o), levels, 'scroll') },
      };
    },
  }),
  gen('spellbook', {
    category: 'items',
    options: [SOURCE_OPTION, WIZARD_OPTION],
    defaultCount: 1,
    block: true,
    sources: ['srd52', 'srd51'],
    build(o) {
      const source = spellSourceOf(this, o);
      const level = Number.parseInt(optionValue(this, o, 'level'), 10);
      return {
        templates: [],
        tables: {},
        roll: (args) => rollSpellbook(source, level, args),
      };
    },
  }),
  gen('weapon', {
    category: 'items',
    options: [SOURCE_OPTION, RARITY_OPTION],
    defaultCount: 10,
    sources: ['5eadb', 'srd52', 'srd51'],
    build(o) {
      const levels = RARITY_LEVELS[optionValue(this, o, 'rarity')];
      return {
        templates: one('{@武器:{condition}{origin}{weapon}}，可以施放{@法術:spell}。'),
        tables: tablesFrom(COMMON, { weapon: WEAPONS.map(([en, zh]) => both(en, zh)) }),
        fns: { spell: spellFn(spellSourceOf(this, o), levels, 'item') },
      };
    },
  }),
  gen('armor', {
    category: 'items',
    options: [SOURCE_OPTION, RARITY_OPTION],
    defaultCount: 10,
    sources: ['5eadb', 'srd52', 'srd51'],
    build(o) {
      const levels = RARITY_LEVELS[optionValue(this, o, 'rarity')];
      return {
        templates: one('{@護甲:{condition}{origin}{armor}}，可以施放{@法術:spell}。'),
        tables: tablesFrom(COMMON, { armor: ARMORS.map(([en, zh]) => both(en, zh)) }),
        fns: { spell: spellFn(spellSourceOf(this, o), levels, 'item') },
      };
    },
  }),
  gen('treasure', {
    category: 'treasure',
    options: [
      TIER_OPTION,
      SOURCE_OPTION,
      {
        key: 'relic',
        label: S.options.relic,
        default: 'on',
        choices: [
          { value: 'on', label: S.options.relicOn },
          { value: 'off', label: S.options.relicOff },
        ],
      },
    ],
    defaultCount: 1,
    block: true,
    sources: ['srd51', 'srd52', '5eadb', 'own'],
    build(o) {
      const relic = optionValue(this, o, 'relic') === 'on';
      return {
        templates: one(LAZY_TIERS[tierOf(this, o)] + (relic ? '\n遺物：{@遺物:{relic}}' : '')),
        tables: tablesFrom(COMMON, LAZY_ITEMS, {
          ...valueTables(false),
          weapon: treasureWeapon(true),
          armor: treasureArmor(true),
          ammunition: AMMO,
          relic: ['{condition}{origin}{item}，可施放{spell}'],
        }),
        fns: treasureSpellFns(spellSourceOf(this, o)),
      };
    },
  }),
  gen('treasure-2024', {
    category: 'treasure',
    options: [TIER_OPTION],
    defaultCount: 1,
    block: true,
    sources: ['srd52', '5eadb', 'own'],
    build(o) {
      const tier = tierOf(this, o);
      const magic = SRD52_MAGIC[tier];
      const items = tablesFrom(SRD52_ITEMS);
      /* 個數不一定的清單（魔法物品、藝術品）：每一行前面都寫名稱 */
      const rarityLine = (r: string) =>
        `魔法物品：〔${S.out.rarityOf[r as keyof typeof S.out.rarityOf]}〕{${r}}`;
      return {
        templates: SRD52_TIERS[tier].map((t) => ({
          text: `${t}\n{@魔法物品:{magic_item*${magic.count}}}`,
          weight: 1,
        })),
        tables: {
          ...tablesFrom(COMMON, {
            ...valueTables(true),
            weapon: treasureWeapon(false),
            armor: treasureArmor(false),
            ammunition: AMMO,
            magic_item: magic.weights.map(([r, w]) => [rarityLine(r), w] as const),
          }),
          ...items,
        },
        fns: treasureSpellFns('srd52'),
      };
    },
  }),
  gen('treasure-bfrd', {
    category: 'treasure',
    options: [TIER_OPTION],
    defaultCount: 1,
    block: true,
    sources: ['bfrd', '5eadb', 'own'],
    build(o) {
      return {
        templates: one(BFRD_TIERS[tierOf(this, o)]),
        tables: tablesFrom(COMMON, BFRD_ITEMS, {
          ...valueTables(false),
          weapon: treasureWeapon(true),
          weapon_plain: treasureWeapon(false),
          armor: treasureArmor(true),
          ammunition: AMMO,
        }),
        fns: treasureSpellFns('bfrd'),
      };
    },
  }),
];

export function generatorById(id: string): GeneratorDef | undefined {
  return GENERATORS.find((g) => g.id === id);
}

/* ---------- 自訂產生器 ---------- */

export interface CustomGenerator {
  id: string;
  name: string;
  text: string;
}

/** 自訂產生器的 id 前面加「custom:」 */
export const CUSTOM_PREFIX = 'custom:';
export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);

/** 範本表的名稱（原作的 template 也可以） */
export const TEMPLATE_TABLES = ['範本', 'template'] as const;

/** 自訂產生器：表的文字 → 產生器（範本表是每一筆的樣子，其他是表） */
export function customGenerator(custom: CustomGenerator): GeneratorDef {
  return {
    id: `${CUSTOM_PREFIX}${custom.id}`,
    category: 'custom',
    label: custom.name,
    summary: '',
    options: [],
    defaultCount: 10,
    sources: [],
    build: () => {
      const { tables, issues } = parseTables(custom.text);
      const templateName = TEMPLATE_TABLES.find((n) => Object.hasOwn(tables, n));
      const templates = templateName ? tables[templateName] : [];
      const rest = { ...tables };
      if (templateName) delete rest[templateName];
      return {
        templates,
        tables: rest,
        issues: [
          ...issues.map((i) => `第 ${i.line} 行：${i.message}`),
          ...(templateName ? [] : [S.custom.noTemplate]),
        ],
      };
    },
  };
}

/** 一次最多幾筆 */
export const COUNT_MAX = 50;
