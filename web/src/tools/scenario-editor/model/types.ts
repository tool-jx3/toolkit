/**
 * 原稿（文件模型）的型別。欄位名稱沿用原作（CC0）的存檔格式，舊版存的 JSON 可以直接讀（規格 3.1）。
 * 所有段落都放在「串列」裡：本文（doc.blocks）、彈出視窗的內容（pop.blocks）、表格每一格（tbl.cb["r,c"]）。
 */

export type BlockType =
  | 'desc'
  | 'dialog'
  | 'note'
  | 'proc'
  | 'flow'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'subtitle'
  | 'scene'
  | 'hr'
  | 'vr'
  | 'break'
  | 'colbr'
  | 'image'
  | 'npc'
  | 'table'
  | 'popup'
  | 'toc'
  | 'cover'
  | 'colophon';

/** 註解：第 a 字到第 b 字（不含 b） */
export interface Comment {
  a: number;
  b: number;
  t: string;
}

/** 文字裝飾（目前只有顏色）：第 a 字到第 b 字 */
export interface Mark {
  a: number;
  b: number;
  col: string;
  bold: boolean;
}

/** 規則框的外觀 */
export interface BoxStyle {
  ln: 'solid' | 'dash' | 'none';
  bar: boolean;
  fill: boolean;
  sm: boolean;
  col: BoxColorKey;
}

export type BoxColorKey = 'aka' | 'sumi' | 'ai' | 'koke' | 'kin' | 'hai';

/** 自己做的規則框樣板 */
export interface BoxTemplate extends BoxStyle {
  id: string;
  /** 名稱（最多 24 字） */
  n: string;
  /** 標題語（最多 24 字） */
  lb: string;
}

export type TableLook = 'grid' | 'list' | 'card';
export type TableOutMode = 'roll' | 'simple' | 'free';

export interface Table {
  head: boolean;
  rowhead: boolean;
  capOn: boolean;
  out: string;
  outMode: TableOutMode;
  outOpen?: boolean;
  look: TableLook;
  name: string;
  dice: string;
  rows: number;
  ncol: number;
  /** 每一格的段落串列，鍵為 "列,欄" */
  cb: Record<string, Block[]>;
  /** 舊格式（讀入時轉換後刪除） */
  cells?: string[][];
  seed?: string[][];
}

export interface Popup {
  label: string;
  /** 舊式的文字內容 */
  body: string;
  /** 只從 ＠名稱 指向，不放在紙面 */
  only: boolean;
  /** 以段落保存的內容（新建的彈出視窗都有） */
  blocks?: Block[];
}

export type FlowKind = 'box' | 'round' | 'diamond' | 'term' | 'io';

export interface FlowNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
  t2: string;
  kind: FlowKind;
  pad: number;
  /** 顏色鍵（空字串＝墨色） */
  col: BoxColorKey | '';
}

export interface FlowEdge {
  id: string;
  a: string;
  b: string;
  lb: string;
}

export interface Flow {
  w: number;
  h: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface TocSettings {
  lb: string;
  pick: string[];
  pn: boolean;
  dots: boolean;
}

export type ImagePos = 'inline' | 'left' | 'right' | 'free';

export interface Block {
  id: string;
  type: BlockType;
  /** 1＝全寬（跨欄）、2＝在欄內流動 */
  cols: 1 | 2;
  text: string;
  /** 只套用在這個段落的上／下間距（mm），null＝依書式 */
  mt: number | null;
  mb: number | null;
  /** 縮排層級 0～4 */
  ind?: number;
  /** 整段文字顏色 */
  col?: string | null;
  /** 解除文繞圖（從圖片下方開始） */
  clr?: boolean;
  cm?: Comment[];
  mk?: Mark[];
  /** 目錄中的寫法 */
  tl?: string;
  tocMode?: '' | 'on' | 'off';
  tocLv?: number;
  /** 舊原稿：不收錄進目錄 */
  tocOff?: boolean;
  /** 對話文的說話者 */
  sp?: string;
  /** 規則框的標題語（null＝預設） */
  lb?: string | null;
  bx?: BoxStyle;
  /* 圖片 */
  img?: string | null;
  w?: number;
  cap?: string;
  ar?: number;
  pos?: ImagePos;
  fl?: '' | 'l' | 'r';
  dx?: number;
  dy?: number;
  fx?: number;
  fy?: number;
  pg?: number;
  wrap?: 'square' | 'none';
  /* 各書式的資料 */
  tbl?: Table;
  pop?: Popup;
  flow?: Flow;
  npc?: Npc;
  toc?: TocSettings;
  /** 舊的「條列」書式 */
  mark?: string;
}

export interface PageBg {
  preset: string;
  img: string | null;
  fit: 'cover' | 'contain' | 'repeat';
  opa: number;
}

export interface PageSetting {
  id: string;
  bg: PageBg;
  cols: 1 | 2;
}

export interface EmbeddedFont {
  name: string;
  /** data URL */
  data: string;
}

export interface Doc {
  /** 行首記號改成 markdown 寫法的版本（3.1.3） */
  mdv: number;
  title: string;
  padV: number;
  padH: number;
  base: number;
  defCols: 1 | 2;
  foot: { num: boolean; text: string; from: number };
  fonts: EmbeddedFont[];
  fontBody: string;
  fontHead: string;
  bxTpl: BoxTemplate[];
  pages: PageSetting[];
  blocks: Block[];
}

/* ---------- NPC 卡 ---------- */

export interface EmoSkill {
  n: string;
  cat: string;
  arg: string;
  ref: string;
  lv: string;
  v: string;
}

export interface EmoRes {
  attr: string;
  name: string;
}

export interface Emoklore {
  ab: Record<'body' | 'dex' | 'mind' | 'sense' | 'int' | 'cha' | 'soc' | 'luck', string>;
  hp: string;
  mp: string;
  skills: EmoSkill[];
  base: Record<string, string>;
  baseOpen: boolean;
  kyomei: string;
  kyodo: string;
  res: Record<'omote' | 'ura' | 'root', EmoRes>;
}

export interface DxEffect {
  id: string;
  kind: string;
  n: string;
  lv: string;
  timing: string;
  skill: string;
  dif: string;
  tgt: string;
  rng: string;
  enc: string;
  lim: string;
}

export interface DxCombo {
  n: string;
  cmb: string;
  pick: string[];
  extra: string;
  timing: string;
  skill: string;
  hit: string;
  atk: string;
  tgt: string;
  rng: string;
  enc: string;
  cond: string;
  eff: string;
}

export interface Dx3rd {
  breed: string;
  syn: string;
  syns: string[];
  enc: string;
  ab: Record<'body' | 'sense' | 'mind' | 'soc', string>;
  act: string;
  hp: string;
  stock: string;
  skills: Record<string, string>;
  sarg: Record<string, string>;
  effects: DxEffect[];
  combos: DxCombo[];
}

export interface CocSkill {
  n: string;
  cat: string;
  arg: string;
  v: string;
  free: boolean;
}

export interface CocWeapon {
  n: string;
  v: string;
  dmg: string;
}

export interface Coc {
  ver: '6' | '7';
  ab: Record<'str' | 'con' | 'pow' | 'dex' | 'app' | 'siz' | 'int' | 'edu', string>;
  sub: Record<'hp' | 'mp' | 'san' | 'idea' | 'luck' | 'know' | 'build' | 'db' | 'mov', string>;
  skills: CocSkill[];
  weapons: CocWeapon[];
  /** 舊原稿：只有一個武器 */
  weapon?: CocWeapon;
}

export interface NpcTab {
  id: string;
  title: string;
  text: string;
  open: boolean;
}

export type NpcSystem = 'emoklore' | 'dx3rd' | 'coc';

export interface Npc {
  sys: NpcSystem;
  name: string;
  kana: string;
  role: string;
  memo: string;
  memoOpen: boolean;
  art: string | null;
  artW: number;
  tabs: NpcTab[];
  emoklore: Emoklore;
  dx3rd: Dx3rd;
  coc: Coc;
}
