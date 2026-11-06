/**
 * SRD 5.2.1 的遭遇難度（Gameplay Toolbox → Combat Encounters）與挑戰等級的經驗值（Monsters → Experience Points by
 * Challenge Rating），本站翻譯、改成程式可讀的表。出處與授權見同資料夾的 LICENSE.txt。
 */
import type { Cr } from '../cr';

export type EncounterDifficulty = 'low' | 'moderate' | 'high';

export const DIFFICULTIES: readonly EncounterDifficulty[] = ['low', 'moderate', 'high'];

/** 每名角色的 XP 預算（XP Budget per Character）：等級 1～20 → [低, 中, 高] */
export const XP_BUDGET_PER_CHARACTER: Readonly<Record<number, readonly [number, number, number]>> =
  {
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

/** 等級 → { low, moderate, high }（等級夾在 1～20） */
export function budgetForLevel(level: number): Record<EncounterDifficulty, number> {
  const l = Math.min(20, Math.max(1, Math.round(level)));
  const [low, moderate, high] = XP_BUDGET_PER_CHARACTER[l];
  return { low, moderate, high };
}

/**
 * 挑戰等級 → 經驗值（Experience Points by Challenge Rating）。CR 0 原文是「0 或 10」
 * （沒有有效攻擊的生物 0），本站的計算用 10。
 */
export const CR_XP: Readonly<Record<Cr, number>> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

/** 三種難度的名稱與說明（摘要翻譯） */
export const DIFFICULTY_TEXT: Readonly<
  Record<EncounterDifficulty, { name: string; en: string; text: string }>
> = {
  low: {
    name: '低難度',
    en: 'Low',
    text: '大概會有一兩個驚險的時刻，但角色應該能毫無傷亡地獲勝；可能有人需要用到治療資源。',
  },
  moderate: {
    name: '中難度',
    en: 'Moderate',
    text: '沒有治療與其他資源的話可能會不妙：較弱的角色可能被打倒，也有很小的機會有人死亡。',
  },
  high: {
    name: '高難度',
    en: 'High',
    text: '可能有一名以上的角色喪命。要活下來需要聰明的戰術、快速的反應，或許還要一點運氣。',
  },
};

/** 排除問題（Troubleshooting）的摘要：遭遇的計算結果觸發時顯示 */
export const ENCOUNTER_TIPS = {
  /** 生物比角色的兩倍多 */
  many: '生物很多時，運氣一好造成的傷害可能比預期多。每名角色對上超過兩隻生物時，加入幾隻很快就能打倒的弱小生物；1、2 級的角色尤其要注意。',
  /** 有 CR 比隊伍等級高的生物 */
  powerful:
    '有生物的挑戰等級比隊伍的等級高時，牠的一次行動就可能打倒一名以上的角色（例如 CR 2 的食人魔一擊就能打倒 1 級的法師）。',
  /** 有 CR 0 的生物 */
  cr0: '挑戰等級 0 的生物（特別是 0 XP 的）要節制使用；想放很多隻時改用一群（swarm）。',
} as const;
