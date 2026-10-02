/**
 * CCFOLIA 的角色資料（外部格式事實，character-editor 規格 2.1、2.3、3.1；room-zip 規格 3.1.7）。
 *
 * - 剪貼簿 JSON：`{ "kind": "character", "data": { … } }`。在 CCFOLIA 房間畫面貼上（Ctrl＋V）就會新增這個角色；
 *   缺少的欄位由 CCFOLIA 補預設值。各種角色卡網站「輸出成 CCFOLIA 角色」也用這個格式。
 * - 讀取：四種錯誤依序判斷（語法 → 最外層不是物件 → kind 不是 "character" → data 不是物件），回傳錯誤種類，文字由工具自訂。
 * - 修正（2.3）：型別不符的欄位用預設值；狀態／參數／差分清單裡不是物件的項目當成空物件；**項目上的其他欄位與欄位順序照原樣保留**
 *   （`{ ...原項目, label, value, max }`：原本就有的鍵留在原位，缺的鍵接在最後）。
 * - 輸出（3.1）：2 格縮排、LF、結尾沒有換行；character-editor 只輸出 9 個欄位、順序固定；項目的額外欄位保留。
 *
 * 依原作（organon-torah/ccfoliaCharacterEditor 的 clipboard.ts）的規則改寫。
 */

/** 角色的狀態（ステータス）：棋子的狀態條；聊天裡 `{標籤}` 參照目前值。項目可以帶其他欄位（照原樣保留）。 */
export interface CcfoliaStatus {
  label: string;
  value: number;
  max: number;
  [key: string]: unknown;
}

/** 角色的參數（パラメータ）：很少變動的數值或文字（值一律是字串）。 */
export interface CcfoliaParam {
  label: string;
  value: string;
  [key: string]: unknown;
}

/** 差分（立ち絵・差分）：發言時加「@標籤」切換 */
export interface CcfoliaFace {
  iconUrl: string | null;
  label: string;
  [key: string]: unknown;
}

/**
 * CCFOLIA 角色資料（剪貼簿 JSON 的 data 部分）。除了 name 都可以省略（CCFOLIA 補預設值）。
 * 房間 ZIP 的角色另有 `playerName`、`z`、`roomId`、`speaking`、`diceSkin`、`order`（見 room.ts 的 `CcfoliaRoomCharacter`）。
 */
export interface CcfoliaCharacterData {
  /** 名稱（名前） */
  name: string;
  /** 備註（名前下方的自由文字） */
  memo?: string;
  /** 先攻值（イニシアティブ），決定角色清單的排序 */
  initiative?: number;
  /** 參照網址（参照URL），通常是角色卡網址 */
  externalUrl?: string;
  status?: CcfoliaStatus[];
  params?: CcfoliaParam[];
  /** 頭像圖片網址（房間 ZIP 裡是圖片檔名） */
  iconUrl?: string | null;
  faces?: CcfoliaFace[];
  /** 棋子在盤面上的座標（格） */
  x?: number;
  y?: number;
  /** 棋子旋轉角度 */
  angle?: number;
  /** 棋子大小（駒サイズ，格） */
  width?: number;
  height?: number;
  /** 是否放在盤面上 */
  active?: boolean;
  /** ステータスを非公開にする */
  secret?: boolean;
  /** 発言時キャラクターを表示しない */
  invisible?: boolean;
  /** 盤面キャラクター一覧に表示しない */
  hideStatus?: boolean;
  /** 發言時名稱的顏色（#rrggbb） */
  color?: string;
  /** 聊天面板（チャットパレット），以換行分隔的指令 */
  commands?: string;
  /** 擁有者的使用者 ID */
  owner?: string | null;
  [key: string]: unknown;
}

/** 修正過、每個欄位都有值的角色資料（`normalizeCharacter` 的結果；未知欄位接在後面照原樣保留） */
export interface CcfoliaCharacter extends CcfoliaCharacterData {
  memo: string;
  initiative: number;
  externalUrl: string;
  status: CcfoliaStatus[];
  params: CcfoliaParam[];
  iconUrl: string | null;
  faces: CcfoliaFace[];
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  active: boolean;
  secret: boolean;
  invisible: boolean;
  hideStatus: boolean;
  color: string;
  commands: string;
  owner: string | null;
}

/** 剪貼簿格式：{ kind: 'character', data: {...} } */
export interface CcfoliaCharacterClipboard {
  kind: 'character';
  data: CcfoliaCharacterData;
}

/** 角色名稱的預設顏色 */
export const CHARACTER_DEFAULT_COLOR = '#888888';
/** 棋子的預設大小（格） */
export const CHARACTER_DEFAULT_SIZE = 4;
/** 角色 JSON 檔的副檔名（character-editor 3.5：`<名稱>.ccfolia-character.json`） */
export const CHARACTER_FILE_EXT = '.ccfolia-character.json';

/** 共用的空清單（凍結，避免改到預設值；要可修改的預設角色用 `normalizeCharacter({})`） */
const EMPTY = Object.freeze([]) as unknown as never[];

/**
 * 修正時用的預設值（欄位順序＝CCFOLIA 角色資料的順序；`normalizeCharacter` 的輸出也是這個順序）。
 * 整個物件與裡面的空清單都是凍結的；要一個可以修改的預設角色請用 `normalizeCharacter({})`。
 */
export const CHARACTER_DEFAULTS: Readonly<CcfoliaCharacter> = Object.freeze({
  name: '',
  memo: '',
  initiative: 0,
  externalUrl: '',
  status: EMPTY,
  params: EMPTY,
  iconUrl: null,
  faces: EMPTY,
  x: 0,
  y: 0,
  angle: 0,
  width: CHARACTER_DEFAULT_SIZE,
  height: CHARACTER_DEFAULT_SIZE,
  active: true,
  secret: false,
  invisible: false,
  hideStatus: false,
  color: CHARACTER_DEFAULT_COLOR,
  commands: '',
  owner: null,
});

/** CCFOLIA 角色資料的全部欄位（順序同上） */
export const CHARACTER_FIELDS = Object.freeze(
  Object.keys(CHARACTER_DEFAULTS) as (keyof CcfoliaCharacter & string)[],
);

/** character-editor 輸出的 9 個欄位（規格 3.1，順序固定；其他欄位貼進 CCFOLIA 時由 CCFOLIA 補） */
export const CHARACTER_EDITOR_FIELDS = Object.freeze([
  'name',
  'memo',
  'initiative',
  'externalUrl',
  'status',
  'params',
  'width',
  'color',
  'commands',
] as const);

/* ---------- 型別修正（2.3） ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
/** 字串照用；null、undefined 與其他型別都是 null */
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** 是不是可以匯入的顏色：`#` 加 6 位十六進位（大小寫都可，照原樣保留） */
export function isCharacterColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** 修正一個狀態項目（不是物件時當成空物件；其他欄位與順序保留） */
export function normalizeStatus(item: unknown): CcfoliaStatus {
  const r = isRecord(item) ? item : {};
  return { ...r, label: str(r.label, ''), value: num(r.value, 0), max: num(r.max, 0) };
}

/** 修正一個參數項目（label、value 都要是字串，否則空字串：數字 60 → ''） */
export function normalizeParam(item: unknown): CcfoliaParam {
  const r = isRecord(item) ? item : {};
  return { ...r, label: str(r.label, ''), value: str(r.value, '') };
}

/** 修正一個差分項目 */
export function normalizeFace(item: unknown): CcfoliaFace {
  const r = isRecord(item) ? item : {};
  return { ...r, iconUrl: nullableStr(r.iconUrl), label: str(r.label, '') };
}

const list = <T>(v: unknown, fix: (item: unknown) => T): T[] =>
  Array.isArray(v) ? v.map(fix) : [];

/**
 * 修正匯入的角色資料（character-editor 2.3）：型別不符的欄位用預設值（`"5"` 不是數字、`null` 不是字串），
 * 清單不是陣列時是空陣列；顏色不是 `#rrggbb`（6 位十六進位）時是 #888888。
 * 輸出的鍵順序：CHARACTER_FIELDS 在前，資料裡的未知欄位接在後面照原樣保留。
 * 注意：匯入資料沒有名稱時名稱是空字串（不是工具的預設名）。
 */
export function normalizeCharacter(data: unknown): CcfoliaCharacter {
  const d = isRecord(data) ? data : {};
  const D = CHARACTER_DEFAULTS;
  return {
    ...D,
    ...d,
    name: str(d.name, D.name),
    memo: str(d.memo, D.memo),
    initiative: num(d.initiative, D.initiative),
    externalUrl: str(d.externalUrl, D.externalUrl),
    status: list(d.status, normalizeStatus),
    params: list(d.params, normalizeParam),
    iconUrl: nullableStr(d.iconUrl),
    faces: list(d.faces, normalizeFace),
    x: num(d.x, D.x),
    y: num(d.y, D.y),
    angle: num(d.angle, D.angle),
    width: num(d.width, D.width),
    height: num(d.height, D.height),
    active: bool(d.active, D.active),
    secret: bool(d.secret, D.secret),
    invisible: bool(d.invisible, D.invisible),
    hideStatus: bool(d.hideStatus, D.hideStatus),
    color: isCharacterColor(d.color) ? d.color : D.color,
    commands: str(d.commands, D.commands),
    owner: nullableStr(d.owner),
  };
}

/* ---------- 剪貼簿 JSON 的讀取 ---------- */

/** 剪貼簿 JSON 的錯誤種類（依序判斷，回傳第一個不符合的） */
export type CharacterClipboardError =
  /** 不是合法 JSON */
  | 'syntax'
  /** 最外層不是物件（陣列、字串、數字、null 都算） */
  | 'root'
  /** kind 不是字串 "character" */
  | 'kind'
  /** data 不是物件（陣列或 null 也算） */
  | 'data';

export type CharacterClipboardResult =
  | {
      ok: true;
      /** 修正過的角色（normalizeCharacter） */
      character: CcfoliaCharacter;
      /** 修正前的 data（判斷「顏色是否列入比較」這類要看原始輸入的規則用） */
      raw: Record<string, unknown>;
    }
  | { ok: false; error: CharacterClipboardError };

/** 讀角色剪貼簿 JSON（文字由工具依錯誤種類自訂） */
export function parseCharacterClipboard(text: string): CharacterClipboardResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'syntax' };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'root' };
  if (parsed.kind !== 'character') return { ok: false, error: 'kind' };
  if (!isRecord(parsed.data)) return { ok: false, error: 'data' };
  return { ok: true, character: normalizeCharacter(parsed.data), raw: parsed.data };
}

/* ---------- 輸出 ---------- */

export interface SerializeCharacterOptions {
  /** 要輸出的欄位與順序（預設 CHARACTER_EDITOR_FIELDS 的 9 個）；傳 CHARACTER_FIELDS 就輸出全部 20 個 */
  fields?: readonly string[];
}

/**
 * 角色剪貼簿 JSON（character-editor 3.1）：先 normalizeCharacter，再依 fields 的順序挑欄位；
 * 2 格縮排、LF、結尾沒有換行；中文直接輸出；數字照 JavaScript 的 JSON 寫法（1e+21、-1.5）。
 * 狀態、參數項目上的其他欄位與欄位順序照原樣保留。
 */
export function serializeCharacterClipboard(
  character: CcfoliaCharacterData,
  { fields = CHARACTER_EDITOR_FIELDS }: SerializeCharacterOptions = {},
): string {
  const full = normalizeCharacter(character) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of fields) if (key in full) data[key] = full[key];
  return JSON.stringify({ kind: 'character', data }, null, 2);
}

/**
 * 原樣包成剪貼簿 JSON（不補欄位、不縮排；P0 留下的簡易版，向下相容）。
 * 給 CCFOLIA 貼上用的完整輸出請用 serializeCharacterClipboard。
 */
export function toCharacterClipboard(data: CcfoliaCharacterData): string {
  const payload: CcfoliaCharacterClipboard = { kind: 'character', data };
  return JSON.stringify(payload);
}

/**
 * 角色 JSON 檔的檔名（character-editor 3.5）：名稱去頭尾空白，每一段連續的 `\ / : * ? " < > |` 換成一個「_」；
 * 結果是空的時用 `character`；接上 `.ccfolia-character.json`。
 * 例：`a/b:c*?"<>|d` → `a_b_c_d.ccfolia-character.json`。
 */
export function characterFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|]+/g, '_');
  return `${base || 'character'}${CHARACTER_FILE_EXT}`;
}
