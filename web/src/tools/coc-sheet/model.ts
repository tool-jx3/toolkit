/**
 * 角色卡的資料（結構化，不再存 HTML）：型別、預設技能表、新角色卡、讀存檔時的整理（壞掉的欄位用預設值）。
 * 規格：docs/refactor/specs/coc-sheet.md 第 3 節。
 */
import type { Rect } from '@/core/image';
import { DEFAULTS, S, SKILL_NAMES } from './strings';

export const TOOL_ID = 'coc-sheet';
/** 自動存檔、專案檔的資料版本 */
export const DATA_VERSION = 1;

/** 角色卡上印得下的列數 */
export const SKILL_SLOTS = 60;
export const SKILL_ROWS_PER_COLUMN = 15;
export const WEAPON_SLOTS = 7;
export const GEAR_LINES = 20;
export const ASSET_LINES = 7;
export const MEMO_LINES = 20;
export const CUSTOM_LINES = 8;

/** 頭像框的比例（寬 13：高 16，舊版的裁切框 520×640） */
export const PORTRAIT_ASPECT = 13 / 16;

/** 角色卡上屬性的排列（3×3，最後一格是移動力） */
export const STAT_KEYS = ['STR', 'DEX', 'INT', 'CON', 'APP', 'POW', 'SIZ', 'EDU'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const INFO_KEYS = [
  'name',
  'player',
  'occupation',
  'age',
  'sex',
  'residence',
  'birthplace',
] as const;
export type InfoKey = (typeof INFO_KEYS)[number];

/** 背景故事：左欄 5 項、右欄 5 項，每項印的行數 */
export const STORY_KEYS = [
  'description',
  'ideology',
  'people',
  'locations',
  'possessions',
  'traits',
  'injuries',
  'phobias',
  'tomes',
  'encounters',
] as const;
export type StoryKey = (typeof STORY_KEYS)[number];
export const STORY_LINES: Readonly<Record<StoryKey, number>> = Object.freeze({
  description: 4,
  ideology: 4,
  people: 4,
  locations: 4,
  possessions: 5,
  traits: 4,
  injuries: 4,
  phobias: 4,
  tomes: 4,
  encounters: 5,
});

export const FLAG_KEYS = ['majorWound', 'dying', 'unconscious', 'temporary', 'indefinite'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/**
 * 技能列的種類：
 * - skill：一般技能（印成「名稱（初始值）」）
 * - specialty：有專長的技能（印成小字的「名稱（初始值）」＋底線上的專長）
 * - custom：空白列／自訂技能（印成底線上的名稱）
 */
export type SkillKind = 'skill' | 'specialty' | 'custom';
/** 初始值：數字、DEX 的一半（閃避）、EDU（母語）、沒有（自訂列） */
export type SkillBase = number | 'DEX/2' | 'EDU' | null;

export interface Skill {
  id: string;
  /** 預設技能的鍵（SKILL_CATALOG）；自訂列是 null */
  key: string | null;
  kind: SkillKind;
  name: string;
  /** 專長（specialty 才印） */
  specialty: string;
  base: SkillBase;
  occupation: number | null;
  interest: number | null;
  growth: number | null;
  /** 直接填的技能值（null＝自動：初始＋職業＋興趣＋成長） */
  value: number | null;
  /** 成長勾選 */
  checked: boolean;
  /** 有沒有成長勾選框（克蘇魯神話、信用評級沒有） */
  checkable: boolean;
}

export interface Weapon {
  id: string;
  name: string;
  /** 使用的技能（技能列的 id）；null＝直接填技能值 */
  skillId: string | null;
  value: number | null;
  damage: string;
  range: string;
  attacks: string;
  ammo: string;
  malfunction: string;
}

export interface Portrait {
  /** 圖片資產庫（core/assets）的 id */
  assetId: string;
  /** 裁切範圍（原圖座標） */
  crop: Rect;
}

export interface Sheet {
  id: string;
  /** 角色卡名稱（清單上的名稱） */
  title: string;
  info: Record<InfoKey, string>;
  stats: Record<StatKey, number | null>;
  luck: number | null;
  /** 移動力（null＝自動） */
  mov: number | null;
  hp: { max: number | null; current: number | null };
  mp: { max: number | null; current: number | null };
  san: { start: number | null; max: number | null; current: number | null };
  luckNow: number | null;
  flags: Record<FlagKey, boolean>;
  /** 傷害加值（空白＝自動） */
  db: string;
  /** 體格（null＝自動） */
  build: number | null;
  custom: { title: string; text: string };
  portrait: Portrait | null;
  /** 技能點數的總數（null＝自動：EDU×4、INT×2） */
  budget: { occupation: number | null; interest: number | null };
  skills: Skill[];
  weapons: Weapon[];
  story: Record<StoryKey, string>;
  gear: string;
  assets: { spending: string; cash: string; assets: string; other: string };
  memo: string;
}

/** 匯出 PNG 的頁面：第 1 頁、第 2 頁、兩頁接成一張 */
export type PngPages = '1' | '2' | 'both';

export interface SheetData {
  sheets: Sheet[];
}

/* ---------- 預設技能表（舊版角色卡的 60 格，依序由上而下、由左而右） ---------- */

interface CatalogRow {
  key: string | null;
  kind: SkillKind;
  base: SkillBase;
  checkable?: boolean;
}

const sk = (key: string, base: SkillBase): CatalogRow => ({ key, kind: 'skill', base });
const sp = (key: string, base: SkillBase): CatalogRow => ({ key, kind: 'specialty', base });
const blank: CatalogRow = { key: null, kind: 'custom', base: null };

export const SKILL_CATALOG: readonly CatalogRow[] = Object.freeze([
  sk('intimidate', 15),
  sk('fastTalk', 5),
  sk('medicine', 1),
  sk('driveAuto', 20),
  sk('firstAid', 30),
  sk('occult', 5),
  sk('stealth', 20),
  sk('dodge', 'DEX/2'),
  sp('science', 1),
  blank,
  blank,
  sk('locksmith', 1),
  sk('appraise', 5),
  sk('mechRepair', 10),
  sk('listen', 20),
  sk('fightingBrawl', 25),
  blank,
  blank,
  { key: 'cthulhuMythos', kind: 'skill', base: 0, checkable: false },
  sp('artCraft', 5),
  blank,
  blank,
  sk('accounting', 5),
  sk('archaeology', 1),
  sk('computerUse', 5),
  sp('survival', 10),
  sk('naturalWorld', 10),
  sk('firearmsHandgun', 20),
  sk('firearmsRifle', 25),
  blank,
  sk('heavyMachinery', 1),
  { key: 'creditRating', kind: 'skill', base: 0, checkable: false },
  sk('psychology', 10),
  sk('anthropology', 1),
  sk('swim', 20),
  sk('psychoanalysis', 1),
  sk('persuade', 10),
  sp('pilot', 1),
  sk('jump', 20),
  sk('track', 10),
  sk('sleightOfHand', 10),
  sk('elecRepair', 10),
  sk('electronics', 1),
  sk('throw', 20),
  sk('climb', 20),
  sk('libraryUse', 20),
  sk('navigate', 10),
  sk('disguise', 5),
  sk('law', 5),
  sp('otherLanguage', 1),
  blank,
  sp('ownLanguage', 'EDU'),
  sk('charm', 15),
  sk('spotHidden', 25),
  sk('history', 5),
  blank,
  blank,
  blank,
  blank,
  blank,
]);

/** 預設技能的資料（鍵 → 種類、初始值、成長勾選） */
export const CATALOG_BY_KEY: ReadonlyMap<string, CatalogRow> = new Map(
  SKILL_CATALOG.filter((r) => r.key).map((r) => [r.key as string, r]),
);

/* ---------- 建立 ---------- */

let seq = 0;
/** 新的 id（時間＋計數＋亂數；不用 crypto，舊瀏覽器也可以） */
export function nid(prefix = 'x'): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newSkill(row: Partial<Skill> = {}): Skill {
  return {
    id: nid('s'),
    key: null,
    kind: 'custom',
    name: '',
    specialty: '',
    base: null,
    occupation: null,
    interest: null,
    growth: null,
    value: null,
    checked: false,
    checkable: true,
    ...row,
  };
}

export function defaultSkills(): Skill[] {
  return SKILL_CATALOG.map((r) =>
    newSkill({
      key: r.key,
      kind: r.kind,
      name: r.key ? (SKILL_NAMES[r.key] ?? '') : '',
      base: r.base,
      checkable: r.checkable ?? true,
    }),
  );
}

export function newWeapon(row: Partial<Weapon> = {}): Weapon {
  return {
    id: nid('w'),
    name: '',
    skillId: null,
    value: null,
    damage: '',
    range: '',
    attacks: '',
    ammo: '',
    malfunction: '',
    ...row,
  };
}

export const SHEET_CUSTOM_TITLE: string = DEFAULTS.customTitle;

const emptyRecord = <K extends string, V>(keys: readonly K[], v: V) =>
  Object.fromEntries(keys.map((k) => [k, v])) as Record<K, V>;

/** 新角色卡：預設技能表、第一把武器「徒手」（使用技能「格鬥（鬥毆）」） */
export function newSheet(title: string = S.list.newTitle): Sheet {
  const skills = defaultSkills();
  const brawl = skills.find((s) => s.key === 'fightingBrawl');
  return {
    id: nid('c'),
    title,
    info: emptyRecord(INFO_KEYS, ''),
    stats: emptyRecord(STAT_KEYS, null),
    luck: null,
    mov: null,
    hp: { max: null, current: null },
    mp: { max: null, current: null },
    san: { start: null, max: null, current: null },
    luckNow: null,
    flags: emptyRecord(FLAG_KEYS, false),
    db: '',
    build: null,
    custom: { title: SHEET_CUSTOM_TITLE, text: '' },
    portrait: null,
    budget: { occupation: null, interest: null },
    skills,
    weapons: [newWeapon(UNARMED(brawl?.id ?? null))],
    story: emptyRecord(STORY_KEYS, ''),
    gear: '',
    assets: { spending: '', cash: '', assets: '', other: '' },
    memo: '',
  };
}

/** 第一把武器的預設值（徒手） */
export const UNARMED = (skillId: string | null): Partial<Weapon> => ({
  name: DEFAULTS.unarmed,
  skillId,
  damage: DEFAULTS.unarmedDamage,
  range: DEFAULTS.dash,
  attacks: DEFAULTS.unarmedAttacks,
  ammo: DEFAULTS.dash,
  malfunction: DEFAULTS.dash,
});

export function initialData(): SheetData {
  return { sheets: [newSheet()] };
}

/** 複製一張角色卡（新的 id；技能、武器的 id 照舊，武器的技能連結不變） */
export function duplicateSheet(sheet: Sheet): Sheet {
  const copy = JSON.parse(JSON.stringify(sheet)) as Sheet;
  copy.id = nid('c');
  copy.title = `${sheet.title || S.list.unnamed}${S.list.copySuffix}`;
  return copy;
}

/* ---------- 讀存檔時的整理 ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const optNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);

function sanitizeBase(v: unknown): SkillBase {
  if (v === 'DEX/2' || v === 'EDU') return v;
  return optNum(v);
}

export function sanitizeSkill(raw: unknown): Skill {
  const r = isRecord(raw) ? raw : {};
  const kind: SkillKind =
    r.kind === 'skill' || r.kind === 'specialty' || r.kind === 'custom' ? r.kind : 'custom';
  return {
    id: str(r.id) || nid('s'),
    key: typeof r.key === 'string' && r.key ? r.key : null,
    kind,
    name: str(r.name),
    specialty: str(r.specialty),
    base: sanitizeBase(r.base),
    occupation: optNum(r.occupation),
    interest: optNum(r.interest),
    growth: optNum(r.growth),
    value: optNum(r.value),
    checked: bool(r.checked),
    checkable: bool(r.checkable, true),
  };
}

export function sanitizeWeapon(raw: unknown): Weapon {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id) || nid('w'),
    name: str(r.name),
    skillId: typeof r.skillId === 'string' && r.skillId ? r.skillId : null,
    value: optNum(r.value),
    damage: str(r.damage),
    range: str(r.range),
    attacks: str(r.attacks),
    ammo: str(r.ammo),
    malfunction: str(r.malfunction),
  };
}

function sanitizeRect(v: unknown): Rect | null {
  if (!isRecord(v)) return null;
  const n = [v.x, v.y, v.width, v.height].map(optNum);
  if (n.some((x) => x === null)) return null;
  const [x, y, width, height] = n as number[];
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function sanitizeSheet(raw: unknown): Sheet {
  const r = isRecord(raw) ? raw : {};
  const base = newSheet('');
  const rec = (v: unknown) => (isRecord(v) ? v : {});
  const info = rec(r.info);
  const stats = rec(r.stats);
  const hp = rec(r.hp);
  const mp = rec(r.mp);
  const san = rec(r.san);
  const flags = rec(r.flags);
  const custom = rec(r.custom);
  const budget = rec(r.budget);
  const story = rec(r.story);
  const assets = rec(r.assets);
  const p = rec(r.portrait);
  const crop = sanitizeRect(p.crop);
  return {
    id: str(r.id) || base.id,
    title: str(r.title),
    info: Object.fromEntries(INFO_KEYS.map((k) => [k, str(info[k])])) as Sheet['info'],
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, optNum(stats[k])])) as Sheet['stats'],
    luck: optNum(r.luck),
    mov: optNum(r.mov),
    hp: { max: optNum(hp.max), current: optNum(hp.current) },
    mp: { max: optNum(mp.max), current: optNum(mp.current) },
    san: { start: optNum(san.start), max: optNum(san.max), current: optNum(san.current) },
    luckNow: optNum(r.luckNow),
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, bool(flags[k])])) as Sheet['flags'],
    db: str(r.db),
    build: optNum(r.build),
    custom: {
      title: typeof custom.title === 'string' ? custom.title : SHEET_CUSTOM_TITLE,
      text: str(custom.text),
    },
    portrait:
      typeof p.assetId === 'string' && p.assetId && crop ? { assetId: p.assetId, crop } : null,
    budget: { occupation: optNum(budget.occupation), interest: optNum(budget.interest) },
    skills: Array.isArray(r.skills) ? r.skills.map(sanitizeSkill) : base.skills,
    weapons: Array.isArray(r.weapons) ? r.weapons.map(sanitizeWeapon) : base.weapons,
    story: Object.fromEntries(STORY_KEYS.map((k) => [k, str(story[k])])) as Sheet['story'],
    gear: str(r.gear),
    assets: {
      spending: str(assets.spending),
      cash: str(assets.cash),
      assets: str(assets.assets),
      other: str(assets.other),
    },
    memo: str(r.memo),
  };
}

/** 整理整份資料；沒有角色卡、格式不對時 null */
export function sanitizeData(raw: unknown): SheetData | null {
  if (!isRecord(raw) || !Array.isArray(raw.sheets)) return null;
  const sheets = raw.sheets.map(sanitizeSheet);
  /* id 重複時換新的（之後選取、刪除才不會一次動到兩張） */
  const seen = new Set<string>();
  for (const s of sheets) {
    if (seen.has(s.id)) s.id = nid('c');
    seen.add(s.id);
  }
  return sheets.length ? { sheets } : null;
}

export interface SheetProject {
  sheets: Sheet[];
  currentId?: string | null;
}

/** 專案檔的 data → 角色卡（不能用時 null） */
export function readProject(raw: unknown): { sheets: Sheet[]; currentId: string | null } | null {
  const data = sanitizeData(raw);
  if (!data) return null;
  const cur = isRecord(raw) && typeof raw.currentId === 'string' ? raw.currentId : null;
  return {
    sheets: data.sheets,
    currentId: cur && data.sheets.some((s) => s.id === cur) ? cur : data.sheets[0].id,
  };
}

/** 目前的角色卡（找不到時第一張） */
export function currentSheet(data: SheetData, id: string | null): Sheet {
  return data.sheets.find((s) => s.id === id) ?? data.sheets[0];
}

/** 清單上的名稱：角色卡名稱 → 調查員姓名 →「未命名的角色卡」 */
export function sheetLabel(sheet: Sheet): string {
  return sheet.title.trim() || sheet.info.name.trim() || S.list.unnamed;
}

/** 所有頭像的資產 id（gc 用） */
export function portraitIds(data: SheetData): string[] {
  return data.sheets.flatMap((s) => (s.portrait ? [s.portrait.assetId] : []));
}
