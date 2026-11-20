/**
 * CCFOLIA 角色批次產生器的資料模型（不依賴 React）：棋子、圖片庫、全體設定、讀取方式、整份文件，
 * 預設值與讀回時的整理（自動儲存、專案檔）。規格：docs/refactor/specs/ccfolia-batch.md。
 *
 * - 圖片庫的圖片內容放在資產庫（`@/core/assets`，IndexedDB），這裡只記 id、名稱、MIME、大小與資產 id。
 * - 棋子的立繪是 'auto'（圖片庫裡和棋子同名的圖）、'none' 或圖片庫的 id；差分也可以只記圖片名稱（表格的「差分：」欄），
 *   顯示與匯出時才依名稱找圖，之後才放進圖片庫的圖照樣對得上。
 * - `edited` 是 null 時清單跟著輸入重建；第一次手動修改時把整份清單複製到這裡固定下來。
 */
import { CHARACTER_DEFAULT_COLOR, CHARACTER_DEFAULT_SIZE, isCharacterColor } from '@/ccfolia';
import type { ColumnKind } from './words';

/** 狀態（CCFOLIA 的ステータス）：目前值／最大值 */
export interface PieceStatus {
  label: string;
  value: number;
  max: number;
}

/** 參數（CCFOLIA 的パラメータ）：值一律是文字 */
export interface PieceParam {
  label: string;
  value: string;
}

/** 差分：圖片庫的 id，或只有圖片名稱（表格的「差分：」欄，依名稱找圖） */
export interface PieceFace {
  label: string;
  imageId: string | null;
  imageName: string;
}

/** 棋子的來源：從輸入讀的、已確定的、角色卡網站貼上的、手動加的 */
export type PieceFrom = 'text' | 'kept' | 'paste' | 'hand';

/** 棋子的立繪：'auto'（同名的圖）、'none'（沒有）、圖片庫 id */
export type PieceImage = 'auto' | 'none' | (string & {});

/** 一個棋子（存檔的形狀） */
export interface Piece {
  /** 讀到的第一行（1 起算）；確定、貼上、手動加的是 null */
  line: number | null;
  from: PieceFrom;
  name: string;
  memo: string;
  initiative: number;
  externalUrl: string;
  /** 聊天面板（一行一個指令；共用的聊天面板匯出時才接在後面） */
  commands: string;
  /** 找立繪用的名稱（表格的「立繪」欄、「立繪：」行；×N 的複本是原本的名字） */
  imageName: string;
  /** 發言時名稱的顏色（#rrggbb） */
  color: string;
  /** 棋子大小（格）；null＝照全體設定 */
  size: number | null;
  /** 放到盤面；null＝照全體設定 */
  active: boolean | null;
  /** 狀態不公開；null＝照全體設定 */
  secret: boolean | null;
  /** 發言時不顯示立繪 */
  invisible: boolean;
  /** 不列入盤面的角色清單；null＝照全體設定 */
  hideStatus: boolean | null;
  status: PieceStatus[];
  params: PieceParam[];
  image: PieceImage;
  /** 圖片庫裡「名稱_差分」的圖自動當差分 */
  autoFaces: boolean;
  /** 手動加的差分（與表格的「差分：」欄） */
  faces: PieceFace[];
}

/** 圖片庫的一張圖 */
export interface ShelfImage {
  id: string;
  /** 名稱（去掉副檔名的檔名；可以改，用來對應棋子） */
  name: string;
  /** 資產庫的 id（內容雜湊） */
  asset: string;
  /** MIME（image/png、image/jpeg、image/gif、image/webp） */
  type: string;
  /** 位元組數 */
  size: number;
}

/** 技能檢定的寫法：自動（7 版 CC、6 版 CCB）／固定一種／不寫成判定（技能變成參數） */
export type RollStyle = 'auto' | 'ccb' | 'cc' | 'd100' | 'none';
/** ×N 的複本名稱：A、B、C…／1、2、3… */
export type SuffixStyle = 'alpha' | 'number';
/** 讀取的標籤要讀成什麼 */
export type LabelKind = 'skill' | 'status' | 'param' | 'ignore';
export type InputMode = 'memo' | 'table';

/** 全體設定與讀取方式 */
export interface Opts {
  /** 所有棋子預設放到盤面（橫向排列）；false＝只放進角色清單 */
  active: boolean;
  /** 棋子大小（1～100 格） */
  size: number;
  /** 共用的聊天面板（接在每個棋子的聊天面板後面） */
  commonCommands: string;
  secret: boolean;
  hideStatus: boolean;
  roll: RollStyle;
  /** 判定寫成秘密骰（s 開頭） */
  secretRoll: boolean;
  suffix: SuffixStyle;
  /** 說明的文字也放進備註（其他玩家看得到） */
  proseToMemo: boolean;
  /** 能力值（STR～EDU）也寫成判定（6 版 ×5） */
  abilityChecks: boolean;
  /** 聊天面板最後加上差分的「@差分名」 */
  faceCommands: boolean;
}

export interface Doc {
  images: ShelfImage[];
  mode: InputMode;
  memo: string;
  table: string;
  /** 表格的欄：標題 → 使用者選的用途（和自動判斷的不同時才記） */
  columns: Record<string, ColumnKind>;
  /** 讀取的標籤：wordKey(寫法) → 使用者選的讀法（和自動判斷的不同時才記；重來時保留） */
  labels: Record<string, LabelKind>;
  /** 已確定的棋子 */
  kept: Piece[];
  /** 角色卡網站貼上的棋子（確定前跟在讀到的後面） */
  pasted: Piece[];
  opts: Opts;
  /** 手動修改中固定下來的整份清單；null＝跟著輸入重建 */
  edited: Piece[] | null;
}

/** CCFOLIA 的圖片上限（5 MB） */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 一個房間 ZIP 最多幾個棋子（CCFOLIA 讀入時一次寫入；原作的觀察） */
export const MAX_PIECES = 500;
/** ×N 最多幾個 */
export const MAX_COPIES = 100;
/** 棋子大小的範圍 */
export const SIZE_MIN = 1;
export const SIZE_MAX = 100;

/* ---------- id ---------- */

let issued = 0;
/** 工具內部的 id（圖片庫）：前綴＋時間（36 進位）＋5 碼亂數＋流水號 */
export function newLocalId(prefix: string): string {
  issued = (issued + 1) % 1296;
  const noise = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .padStart(5, '0');
  return [prefix, Date.now().toString(36), noise, issued.toString(36)].join('');
}

/* ---------- 預設值 ---------- */

export const initialOpts = (): Opts => ({
  /* 棋子 */
  size: CHARACTER_DEFAULT_SIZE,
  active: false,
  hideStatus: false,
  secret: false,
  commonCommands: '',
  faceCommands: false,
  /* 讀取 */
  roll: 'auto',
  secretRoll: false,
  abilityChecks: false,
  proseToMemo: false,
  suffix: 'alpha',
});

export function defaultDoc(): Doc {
  return {
    mode: 'memo',
    memo: '',
    table: '',
    labels: {},
    columns: {},
    pasted: [],
    kept: [],
    edited: null,
    images: [],
    opts: initialOpts(),
  };
}

/** 新的棋子（沒給的欄位用預設值） */
export function newPiece(patch: Partial<Piece> = {}): Piece {
  return {
    line: null,
    from: 'text',
    name: '',
    memo: '',
    initiative: 0,
    externalUrl: '',
    commands: '',
    imageName: '',
    color: CHARACTER_DEFAULT_COLOR,
    size: null,
    active: null,
    secret: null,
    invisible: false,
    hideStatus: null,
    status: [],
    params: [],
    image: 'auto',
    autoFaces: true,
    faces: [],
    ...patch,
  };
}

/* ---------- 整理（自動儲存、專案檔讀回） ---------- */

type Loose = Record<string, unknown>;
const asRecord = (v: unknown): Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Loose) : {};
const looseList = (v: unknown): Loose[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'object' && x !== null && !Array.isArray(x)) : [];
const asText = (v: unknown): string => (v === null || v === undefined ? '' : `${v}`);
const numberOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const flagOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const flagOr = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export const clampPieceSize = (n: number): number =>
  Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(n)));

const PIECE_FROM: readonly PieceFrom[] = ['text', 'kept', 'paste', 'hand'];
const LABEL_KINDS: readonly LabelKind[] = ['skill', 'status', 'param', 'ignore'];
const COLUMN_KINDS: readonly ColumnKind[] = [
  'name',
  'memo',
  'initiative',
  'status',
  'param',
  'commands',
  'image',
  'face',
  'externalUrl',
  'color',
  'size',
  'active',
  'secret',
  'invisible',
  'hideStatus',
  'ignore',
];
const ROLLS: readonly RollStyle[] = ['auto', 'ccb', 'cc', 'd100', 'none'];

export const isLabelKind = (v: unknown): v is LabelKind => LABEL_KINDS.includes(v as LabelKind);
export const isColumnKind = (v: unknown): v is ColumnKind => COLUMN_KINDS.includes(v as ColumnKind);

/** 棋子裡的文字欄位與「照全體設定」的開關 */
const PIECE_TEXTS = ['name', 'memo', 'externalUrl', 'commands', 'imageName'] as const;
const PIECE_SWITCHES = ['active', 'secret', 'hideStatus'] as const;

/** 整理一個棋子（型別不對的欄位用預設值；清單裡不是物件的項目丟掉） */
export function cleanPiece(v: unknown): Piece {
  const raw = asRecord(v);
  const piece = newPiece();
  for (const key of PIECE_TEXTS) piece[key] = asText(raw[key]);
  for (const key of PIECE_SWITCHES) piece[key] = flagOrNull(raw[key]);
  const line = numberOr(raw.line, 0);
  piece.line = line > 0 ? line : null;
  if (PIECE_FROM.includes(raw.from as PieceFrom)) piece.from = raw.from as PieceFrom;
  else piece.from = 'hand';
  piece.initiative = numberOr(raw.initiative, 0);
  if (isCharacterColor(raw.color)) piece.color = raw.color;
  const size = numberOr(raw.size, Number.NaN);
  piece.size = Number.isNaN(size) ? null : clampPieceSize(size);
  piece.invisible = raw.invisible === true;
  piece.status = looseList(raw.status).map((x) => ({
    label: asText(x.label),
    value: numberOr(x.value, 0),
    max: numberOr(x.max, 0),
  }));
  piece.params = looseList(raw.params).map((x) => ({
    label: asText(x.label),
    value: asText(x.value),
  }));
  piece.image = raw.image ? asText(raw.image) : 'auto';
  piece.autoFaces = raw.autoFaces !== false;
  piece.faces = looseList(raw.faces).map((x) => ({
    label: asText(x.label),
    imageId: x.imageId ? asText(x.imageId) : null,
    imageName: asText(x.imageName),
  }));
  return piece;
}

const cleanPieces = (v: unknown): Piece[] => looseList(v).map(cleanPiece);

export function tidyImage(v: unknown): ShelfImage | null {
  const raw = asRecord(v);
  if (!raw.id || !raw.asset) return null;
  const [id, name, asset, type] = [raw.id, raw.name, raw.asset, raw.type].map(asText);
  return { id, name, asset, type, size: Number(raw.size) || 0 };
}

export function cleanOpts(v: unknown): Opts {
  const raw = asRecord(v);
  const base = initialOpts();
  const size = typeof raw.size === 'number' ? raw.size : Number(raw.size);
  const switches = [
    'active',
    'secret',
    'hideStatus',
    'secretRoll',
    'proseToMemo',
    'abilityChecks',
    'faceCommands',
  ] as const;
  const out: Opts = { ...base };
  for (const key of switches) out[key] = flagOr(raw[key], base[key]);
  if (Number.isFinite(size)) out.size = clampPieceSize(size);
  if (typeof raw.commonCommands === 'string') out.commonCommands = raw.commonCommands;
  if (ROLLS.includes(raw.roll as RollStyle)) out.roll = raw.roll as RollStyle;
  if (raw.suffix === 'number') out.suffix = 'number';
  return out;
}

/** 物件裡值合格的項目（`__proto__` 不收） */
function keepValid<T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> {
  const entries = Object.entries(asRecord(v)).filter(([k, x]) => k !== '__proto__' && ok(x));
  return Object.fromEntries(entries) as Record<string, T>;
}

/** 存檔、專案檔讀回時整理（不是物件時回到預設；缺的欄位補預設；格式不對的項目丟掉） */
export function cleanDoc(v: unknown): Doc {
  const raw = asRecord(v);
  const doc = defaultDoc();
  if (raw !== v) return doc;
  doc.mode = raw.mode === 'table' ? 'table' : 'memo';
  doc.memo = asText(raw.memo);
  doc.table = asText(raw.table);
  doc.labels = keepValid(raw.labels, isLabelKind);
  doc.columns = keepValid(raw.columns, isColumnKind);
  doc.pasted = cleanPieces(raw.pasted);
  doc.kept = cleanPieces(raw.kept);
  doc.edited = Array.isArray(raw.edited) ? cleanPieces(raw.edited) : null;
  doc.images = Array.isArray(raw.images)
    ? raw.images.map(tidyImage).filter((x): x is ShelfImage => x !== null)
    : [];
  doc.opts = cleanOpts(raw.opts);
  return doc;
}

/* ---------- 小工具 ---------- */

/** 去掉副檔名；空白時 fallback */
export function fileStem(fileName: string, fallback: string): string {
  const stem = String(fileName || '').replace(/\.[^.]+$/, '');
  return stem === '' ? fallback : stem;
}

const MIB = 1024 ** 2;
/** 大小的寫法：未滿 1 MiB「n KB」（至少 1），其餘「x.x MB」 */
export function bytesLabel(bytes: number): string {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024) || 1} KB`;
}

/** 檔名用的時間：YYYYMMDD-HHMM（當地時間） */
export function fileStamp(at = new Date()): string {
  const two = (n: number) => `${n}`.padStart(2, '0');
  const day = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  return `${day}-${two(at.getHours())}${two(at.getMinutes())}`;
}

export const isTooBig = (img: ShelfImage | null | undefined): boolean =>
  !!img && img.size > MAX_IMAGE_BYTES;

/** 棋子的實際值（null＝照全體設定） */
export const pieceSize = (p: Piece, o: Opts): number => p.size ?? o.size;
export const onBoard = (p: Piece, o: Opts): boolean => p.active ?? o.active;
export const isSecret = (p: Piece, o: Opts): boolean => p.secret ?? o.secret;
export const hidesStatus = (p: Piece, o: Opts): boolean => p.hideStatus ?? o.hideStatus;
