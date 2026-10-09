/**
 * 屬性、傷害加值（DB）／體格（Build）與衍生值（HP、MP、SAN），7 版與 6 版。
 * 表與算式以舊版 trpg-lab（coc_npc_token）為準。
 *
 * - 7 版的屬性存的是 ×5 之後的值（STR 50 這種寫法）；6 版是原始值（3～18 這種寫法）。
 * - 7 版：HP＝⌊(CON＋SIZ)÷10⌋、MP＝⌊POW÷5⌋、SAN＝POW；DB／體格依 STR＋SIZ 查表。
 * - 6 版：HP＝⌈(CON＋SIZ)÷2⌉、MP＝POW、SAN＝POW×5；DB 依 STR＋SIZ 查表，沒有體格。
 */

export type CocEdition = 7 | 6;

export const COC_EDITIONS: readonly CocEdition[] = Object.freeze([7, 6]);

/** 8 項屬性（CCFOLIA 輸出與聊天面板的順序） */
export const CHARACTERISTICS = Object.freeze([
  'STR',
  'CON',
  'POW',
  'DEX',
  'APP',
  'SIZ',
  'INT',
  'EDU',
] as const);

export type Characteristic = (typeof CHARACTERISTICS)[number];

export type CharacteristicValues = Partial<Record<Characteristic, number>>;

export interface DamageBonusRow {
  /** STR＋SIZ 的上限（含） */
  max: number;
  db: string;
}

/** 7 版：STR＋SIZ（×5 之後的值）→ DB、體格 */
export const DB_TABLE_7: readonly (DamageBonusRow & { build: number })[] = Object.freeze([
  { max: 64, db: '-2', build: -2 },
  { max: 84, db: '-1', build: -1 },
  { max: 124, db: '0', build: 0 },
  { max: 164, db: '+1D4', build: 1 },
  { max: 204, db: '+1D6', build: 2 },
  { max: 284, db: '+2D6', build: 3 },
  { max: 364, db: '+3D6', build: 4 },
  { max: 444, db: '+4D6', build: 5 },
  { max: 524, db: '+5D6', build: 6 },
]);

/** 6 版：STR＋SIZ → DB */
export const DB_TABLE_6: readonly DamageBonusRow[] = Object.freeze([
  { max: 12, db: '-1D6' },
  { max: 16, db: '-1D4' },
  { max: 24, db: '0' },
  { max: 32, db: '+1D4' },
  { max: 40, db: '+1D6' },
  { max: 56, db: '+2D6' },
  { max: 72, db: '+3D6' },
  { max: 88, db: '+4D6' },
  { max: 104, db: '+5D6' },
  { max: 120, db: '+6D6' },
  { max: 136, db: '+7D6' },
  { max: 152, db: '+8D6' },
  { max: 168, db: '+9D6' },
  { max: 184, db: '+10D6' },
]);

/** 7 版的 DB 與體格：超過表的範圍時每 80 點多 1D6、體格多 1（525～604 是 +6D6／7） */
export function damageBonus7(strPlusSiz: number): { db: string; build: number } {
  for (const row of DB_TABLE_7) if (strPlusSiz <= row.max) return { db: row.db, build: row.build };
  const extra = Math.floor((strPlusSiz - 525) / 80) + 1;
  return { db: `+${5 + extra}D6`, build: 6 + extra };
}

/** 6 版的 DB：超過表的範圍時每 16 點多 1D6（185～200 是 +11D6） */
export function damageBonus6(strPlusSiz: number): string {
  for (const row of DB_TABLE_6) if (strPlusSiz <= row.max) return row.db;
  const extra = Math.floor((strPlusSiz - 185) / 16) + 1;
  return `+${10 + extra}D6`;
}

export interface DerivedStats {
  hp: number;
  mp: number;
  san: number;
  db: string;
  /** 體格（6 版沒有：null） */
  build: number | null;
}

/** 衍生值（屬性沒有值或不是數字時當成 0） */
export function derivedStats(edition: CocEdition, values: CharacteristicValues): DerivedStats {
  const v = (k: Characteristic) => {
    const n = values[k];
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };
  if (edition === 7) {
    const { db, build } = damageBonus7(v('STR') + v('SIZ'));
    return {
      hp: Math.floor((v('CON') + v('SIZ')) / 10),
      mp: Math.floor(v('POW') / 5),
      san: v('POW'),
      db,
      build,
    };
  }
  return {
    hp: Math.ceil((v('CON') + v('SIZ')) / 2),
    mp: v('POW'),
    san: v('POW') * 5,
    db: damageBonus6(v('STR') + v('SIZ')),
    build: null,
  };
}
