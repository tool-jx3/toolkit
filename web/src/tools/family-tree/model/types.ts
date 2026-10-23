/**
 * 家系圖的資料（規格 3.5）。純資料、不依賴 React，單元測試直接用。
 *
 * - 一張圖板（Board）＝一份家系圖：人物以 id 為鍵存在 `people`（**保留加入的順序**，排序值相同時以它為準）。
 * - 成員（member）有自己的卡片、在世代列上；配偶（spouse）以小卡片接在成員右邊。
 * - 第二批：出系／入系（adopt）、婚姻連結（link）、狀態（status）、GM 專用（gm、gmFields、secret）、頭像（avatar、avatarPos）。
 *   資料版本 2（第一批是 1；新加的欄位都是選填，所以版本 1 的資料照讀）。
 */
import type { FramePlacement } from '@/core/image';

export type Gender = 'M' | 'F';

/** 父親的位置（規格 F28） */
export type Align = 'center' | 'manual' | 'eldest';

export const ALIGNS: readonly Align[] = ['center', 'manual', 'eldest'];

/** 出系／入系（原作的 adoptFatherId、adoptType、stubOrder、sgx；規格 F80） */
export interface AdoptInfo {
  /** 繼父（養父）的 id */
  fatherId: string | null;
  /** heir＝出系（過繼承嗣）、adopted＝入養（養子） */
  kind: 'heir' | 'adopted';
  /** 生家那邊「出」字小卡的排序值 */
  order?: number;
  /** 生家那邊「出」字小卡的左側間距 */
  gap?: number;
}

/** 跨家系的婚姻連結（原作的 linkId、pairId、auto；規格 F82） */
export interface LinkInfo {
  /** 連到的成員 */
  personId: string;
  /** 對方那邊成對的配偶 */
  pairId?: string | null;
  /** 對方那邊是連結時自動建立的 */
  auto?: boolean;
}

/** 狀態（本站，規格 F85）：沒有寫＝存活 */
export type LifeStatus = 'alive' | 'dead' | 'missing';

export const LIFE_STATUSES: readonly LifeStatus[] = ['alive', 'dead', 'missing'];

/**
 * 只有 GM 看得到的欄位（本站，規格 F86）：PL 檢視與 PL 用的匯出裡拿掉。
 * adopt＝過繼本身是秘密（PL 看到的是繼父的親生孩子：沒有「入」、生家沒有「出」）。
 */
export type GmField =
  | 'reading'
  | 'alias'
  | 'birth'
  | 'death'
  | 'note'
  | 'status'
  | 'avatar'
  | 'origin'
  | 'parents'
  | 'cat'
  | 'adopt';

export const MEMBER_GM_FIELDS: readonly GmField[] = [
  'reading',
  'alias',
  'birth',
  'death',
  'status',
  'note',
  'cat',
  'avatar',
  'adopt',
];
export const SPOUSE_GM_FIELDS: readonly GmField[] = [
  'reading',
  'origin',
  'birth',
  'death',
  'parents',
  'status',
  'note',
  'cat',
  'avatar',
];

interface PersonBase {
  id: string;
  name: string;
  /** 讀音（原作的漢字欄）：名字旁邊的小字 */
  reading?: string;
  birth?: string;
  death?: string;
  note?: string;
  /** 色分類的 id */
  cat?: string;
  /** 排序值（兄弟姊妹、始祖、同一人的配偶各自比較） */
  order: number;
  /** 狀態（沒有＝存活） */
  status?: LifeStatus;
  /** GM 筆記（只有 GM 看得到；PL 檢視、PL 用的匯出一律拿掉） */
  secret?: string;
  /** 這個人只有 GM 看得到（成員：連同子孫） */
  gm?: boolean;
  /** 只有 GM 看得到的欄位 */
  gmFields?: GmField[];
  /** 頭像（資產 id；圖片存在這個瀏覽器的資產庫，專案檔帶著） */
  avatar?: string;
  /** 頭像在圓裡的位置（沒有＝置中蓋滿） */
  avatarPos?: FramePlacement;
}

export interface Member extends PersonBase {
  kind: 'member';
  /** 別名（多行：字號、綽號、稱謂、舊姓…） */
  alias?: string;
  gender: Gender;
  fatherId?: string | null;
  motherId?: string | null;
  /** 起始代數（只對始祖有意義，預設 1） */
  gen?: number;
  /** 左側間距（規格 F29，0 以上） */
  gap?: number;
  /** 手動偏移（父親的位置是「手動」時，規格 F47） */
  shift?: number;
  /** 出系／入系 */
  adopt?: AdoptInfo;
}

export interface Spouse extends PersonBase {
  kind: 'spouse';
  /** 這位配偶屬於哪位成員 */
  spouseOf: string;
  /** 出身（原作的本貫） */
  origin?: string;
  /** 父母（原作的父親，一行文字） */
  parents?: string;
  /** 連到同一張圖板裡別的家系的成員 */
  link?: LinkInfo;
}

export type Person = Member | Spouse;

export type People = Record<string, Person>;

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Board {
  id: string;
  title: string;
  /** ISO 時間；圖板依它排序（規格 F01） */
  createdAt: string;
  align: Align;
  cats: Category[];
  people: People;
}

/** 自動儲存與專案檔的 data（資料版本 2） */
export interface TreeData {
  boards: Board[];
}

export const isMember = (p: Person | undefined | null): p is Member => !!p && p.kind === 'member';
export const isSpouse = (p: Person | undefined | null): p is Spouse => !!p && p.kind === 'spouse';

/* ---------- 欄位的上限（規格第 2 節） ---------- */

export const LIMITS = {
  name: 40,
  reading: 40,
  origin: 40,
  alias: 200,
  parents: 200,
  year: 20,
  note: 2000,
  secret: 2000,
  title: 60,
  catName: 30,
  gen: 999,
  people: 2000,
  boards: 50,
} as const;

/** 就地編輯能改的欄位 */
export type MemberField = 'name' | 'reading' | 'birth' | 'death' | 'note';
export type SpouseField = 'name' | 'birth' | 'death' | 'origin';
export type InlineField = MemberField | SpouseField;

export const FIELD_LIMIT: Record<InlineField | 'alias' | 'parents', number> = {
  name: LIMITS.name,
  reading: LIMITS.reading,
  birth: LIMITS.year,
  death: LIMITS.year,
  note: LIMITS.note,
  origin: LIMITS.origin,
  alias: LIMITS.alias,
  parents: LIMITS.parents,
};

/** 新的 id（以字母開頭，不會被 JavaScript 當成數字鍵排到最前面；規格 5.） */
export function newId(prefix = 'p'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
