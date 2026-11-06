/**
 * SRD 5.2.1 的能力值（Character Creation → Step 3: Ability Scores）與背景（Character Origins → Character Backgrounds），
 * 本站翻譯、改成程式可讀的表。出處與授權見同資料夾的 LICENSE.txt。
 */

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITIES: readonly { key: Ability; name: string; en: string; abbr: string }[] = [
  { key: 'str', name: '力量', en: 'Strength', abbr: 'STR' },
  { key: 'dex', name: '敏捷', en: 'Dexterity', abbr: 'DEX' },
  { key: 'con', name: '體質', en: 'Constitution', abbr: 'CON' },
  { key: 'int', name: '智力', en: 'Intelligence', abbr: 'INT' },
  { key: 'wis', name: '感知', en: 'Wisdom', abbr: 'WIS' },
  { key: 'cha', name: '魅力', en: 'Charisma', abbr: 'CHA' },
];

export const ABILITY_KEYS: readonly Ability[] = ABILITIES.map((a) => a.key);

export const isAbility = (v: unknown): v is Ability =>
  typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v);

export const abilityName = (k: Ability): string => ABILITIES.find((a) => a.key === k)?.name ?? k;

/** 點數購買（Point Cost）：27 點，能力值 8～15 的花費（Ability Score Point Costs） */
export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** 標準數組（Standard Array） */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

/** 能力調整值（Ability Scores and Modifiers 的表：3 → −4 … 20 → +5，30 → +10） */
export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2);

/** 背景讓能力值提高後，任何一項都不能超過這個值 */
export const BACKGROUND_SCORE_MAX = 20;

export type BackgroundKey = 'acolyte' | 'criminal' | 'sage' | 'soldier';

/**
 * SRD 5.2.1 的 4 個背景與列出的三個能力值。規則：其中一項 +2、另一項 +1，或三項都 +1；不能超過 20。
 * Gameplay Toolbox 的「Creating a Background」可以自己選三個能力值（本站的「自訂背景」）。
 */
export const BACKGROUNDS: readonly {
  key: BackgroundKey;
  name: string;
  en: string;
  abilities: readonly [Ability, Ability, Ability];
}[] = [
  { key: 'acolyte', name: '侍僧', en: 'Acolyte', abilities: ['int', 'wis', 'cha'] },
  { key: 'criminal', name: '罪犯', en: 'Criminal', abilities: ['dex', 'con', 'int'] },
  { key: 'sage', name: '賢者', en: 'Sage', abilities: ['con', 'int', 'wis'] },
  { key: 'soldier', name: '士兵', en: 'Soldier', abilities: ['str', 'dex', 'con'] },
];

/**
 * 依職業的標準數組（Standard Array by Class）：照力量、敏捷、體質、智力、感知、魅力的順序。
 * 職業的名稱只用來挑分配方式（本站不收職業的其他內容）。
 */
export const STANDARD_ARRAY_BY_CLASS: readonly {
  key: string;
  name: string;
  en: string;
  scores: readonly [number, number, number, number, number, number];
}[] = [
  { key: 'barbarian', name: '野蠻人', en: 'Barbarian', scores: [15, 13, 14, 10, 12, 8] },
  { key: 'bard', name: '吟遊詩人', en: 'Bard', scores: [8, 14, 12, 13, 10, 15] },
  { key: 'cleric', name: '牧師', en: 'Cleric', scores: [14, 8, 13, 10, 15, 12] },
  { key: 'druid', name: '德魯伊', en: 'Druid', scores: [8, 12, 14, 13, 15, 10] },
  { key: 'fighter', name: '戰士', en: 'Fighter', scores: [15, 14, 13, 8, 10, 12] },
  { key: 'monk', name: '武僧', en: 'Monk', scores: [12, 15, 13, 10, 14, 8] },
  { key: 'paladin', name: '聖武士', en: 'Paladin', scores: [15, 10, 13, 8, 12, 14] },
  { key: 'ranger', name: '遊俠', en: 'Ranger', scores: [12, 15, 13, 8, 14, 10] },
  { key: 'rogue', name: '遊蕩者', en: 'Rogue', scores: [12, 15, 13, 14, 10, 8] },
  { key: 'sorcerer', name: '術士', en: 'Sorcerer', scores: [10, 13, 14, 8, 12, 15] },
  { key: 'warlock', name: '契術師', en: 'Warlock', scores: [8, 14, 13, 12, 10, 15] },
  { key: 'wizard', name: '法師', en: 'Wizard', scores: [8, 12, 13, 15, 14, 10] },
];
