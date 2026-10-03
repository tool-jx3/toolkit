/**
 * 團報的部件與整理好的資料（範本用）。規格：docs/refactor/specs/session-report.md 3.1～3.3。
 */

/** 部件的種類：text 是範本的固定文字，其他是資料 */
export type PartKind =
  | 'text'
  | 'system'
  | 'scenario'
  | 'author'
  | 'role'
  | 'gm'
  | 'header'
  | 'slot'
  | 'ho'
  | 'pc'
  | 'pl'
  | 'result'
  | 'date'
  | 'tags';

export interface Part {
  kind: PartKind;
  value: string;
}

/** 會套用文字樣式的部件（3.3） */
export const STYLED_KINDS: ReadonlySet<PartKind> = new Set<PartKind>([
  'system',
  'role',
  'header',
  'slot',
  'ho',
  'result',
  'date',
]);

export interface ReportGm {
  role: string;
  name: string;
}

export interface ReportPlayer {
  /** 標記（PC、PC2、HO3、PC/PL、PL/PC、自由） */
  slot: string;
  ho: string;
  pc: string;
  pl: string;
}

/** 從表單整理好、可以直接放進範本的資料（3.1） */
export interface ReportData {
  system: string;
  scenario: string;
  /** 作者行（3.4；沒有作者時空字串） */
  author: string;
  result: string;
  date: string;
  tags: string;
  gms: ReportGm[];
  players: ReportPlayer[];
  /** 名字順序：PL 在前 */
  plFirst: boolean;
}

/** 標記是這些值時不寫出來（HO 補充也不寫） */
const HIDDEN_SLOTS: ReadonlySet<string> = new Set(['PC/PL', 'PL/PC', '自由']);

export const showsSlot = (slot: string): boolean => !HIDDEN_SLOTS.has(slot);
