/**
 * CCFOLIA 房間 ZIP 的讀寫（外部格式事實，room-zip 規格 3.1.1、3.2.12、F281；psd-studio 規格 2.3、3.4）。
 *
 * - **寫**（room-zip）：完全平坦（不可有資料夾）；`__data.json`（不縮排）、`.token`（「0.」＋64 個小寫十六進位）、圖片。
 *   圖片檔名＝內容的 SHA-256（64 個小寫十六進位）＋「.」＋副檔名（webp、png、**jpeg**、gif）；同內容只出現一次。
 *   `resources` 必須與 ZIP 裡的圖片檔**完全一一對應**（多一個或少一個都會匯入失敗）。寫完用 `checkRoomZip` 自我檢查。
 * - **讀**（psd-studio）：找資料檔、列出圖片與 JSON 裡的引用位置。
 * - **改名重寫**（psd-studio）：圖片換成新內容後，以新雜湊改名，JSON 裡所有字串值與物件的鍵一起換；`.token` 與其他檔案原封不動。
 *
 * ZIP 本身用 `@/core/files` 的 fflate 包裝（zipFiles／unzipFiles）。
 */
import { sha256Hex, unzipFiles, type ZipEntry, type ZipOptions, zipFiles } from '@/core/files';
import {
  type CcfoliaResource,
  type CcfoliaRoomData,
  newRoomToken,
  ROOM_DATA_FILE,
  ROOM_TOKEN_FILE,
} from './room';

/* ---------- 圖片檔名 ---------- */

/** MIME → 房間 ZIP 的副檔名（`image/jpeg` 是 `jpeg`，不是 jpg） */
export const ROOM_IMAGE_EXT: Readonly<Record<string, string>> = Object.freeze({
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
});

/** 副檔名 → MIME（讀別人的 ZIP 時 jpg 也認得） */
export const ROOM_IMAGE_MIME: Readonly<Record<string, string>> = Object.freeze({
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
});

/** 房間 ZIP 的圖片檔名：64 個小寫十六進位＋副檔名 */
export const ROOM_IMAGE_NAME_RE = /^[0-9a-f]{64}\.(webp|png|jpeg|jpg|gif)$/;
/** ZIP 裡算「圖片」的檔案（依副檔名，含 apng） */
const IMAGE_FILE_RE = /\.(png|apng|jpg|jpeg|webp|gif)$/i;

export const isRoomImageName = (s: unknown): s is string =>
  typeof s === 'string' && ROOM_IMAGE_NAME_RE.test(s);

/** MIME → 副檔名；房間 ZIP 不收的格式（BMP、AVIF…）回傳 null（要先轉成 PNG 或 WebP） */
export function roomImageExt(mime: string): string | null {
  return ROOM_IMAGE_EXT[mime.toLowerCase().split(';')[0].trim()] ?? null;
}

/** 依檔頭判斷四種格式的 MIME（認不得時 null） */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'image/gif';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** 要放進房間 ZIP 的一張圖 */
export interface RoomImageFile {
  /** `<SHA-256>.<副檔名>` */
  name: string;
  /** MIME（resources 的 type） */
  type: string;
  data: Uint8Array;
}

/**
 * 算出圖片在房間 ZIP 裡的檔名。mime 沒給時用 Blob 的 type，再沒有就看檔頭。
 * 不是 PNG／JPEG／GIF／WebP 時丟 Error（BMP、AVIF 等要先轉成 PNG，room-zip 第 7 節裁定 D8）。
 */
export async function packRoomImage(
  input: Blob | Uint8Array,
  mime?: string,
): Promise<RoomImageFile> {
  const data = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
  const type =
    mime || (input instanceof Blob && input.type ? input.type : '') || sniffImageMime(data) || '';
  const ext = roomImageExt(type);
  if (!ext) throw new Error(`房間 ZIP 不收這種圖片格式：${type || '未知'}`);
  return { name: `${await sha256Hex(data)}.${ext}`, type: ROOM_IMAGE_MIME[ext], data };
}

/**
 * JSON 裡引用到的房間圖片檔名（掃描所有字串值，符合 ROOM_IMAGE_NAME_RE 的），依第一次出現的順序。
 * `__data.json` 傳整份時只掃 `entities`（resources 的鍵不算引用）。
 */
export function collectRoomImageNames(data: unknown): string[] {
  const root =
    data && typeof data === 'object' && 'entities' in data
      ? (data as { entities: unknown }).entities
      : data;
  const seen = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (ROOM_IMAGE_NAME_RE.test(v)) seen.add(v);
      return;
    }
    if (!v || typeof v !== 'object') return;
    for (const x of Object.values(v)) walk(x);
  };
  walk(root);
  return [...seen];
}

/* ---------- 寫 ---------- */

export interface BuildRoomZipOptions extends ZipOptions {
  /** `.token` 的內容（預設 newRoomToken()） */
  token?: string;
}

export interface BuiltRoomZip {
  bytes: Uint8Array<ArrayBuffer>;
  /** 實際寫進 ZIP 的 `__data.json`（resources 已依引用重建） */
  data: CcfoliaRoomData;
  /** JSON 有引用、但 images 裡沒有的檔名（不會進 ZIP；自我檢查會報「引用的圖不在 ZIP 裡」） */
  missing: string[];
}

/**
 * 組出房間 ZIP（room-zip 3.1.1、3.2.12）：掃描 entities 裡引用的圖片檔名 → resources 只收「有引用而且有圖」的，
 * 一張一檔（images 裡沒被引用的不收）。ZIP 項目順序：`__data.json`（不縮排）、`.token`、圖片（依 resources 的順序）。
 */
export function buildRoomZip(
  data: CcfoliaRoomData,
  images: Iterable<RoomImageFile>,
  { token, ...zipOptions }: BuildRoomZipOptions = {},
): BuiltRoomZip {
  const pool = new Map<string, RoomImageFile>();
  for (const img of images) if (!pool.has(img.name)) pool.set(img.name, img);
  const resources: Record<string, CcfoliaResource> = {};
  const missing: string[] = [];
  for (const name of collectRoomImageNames(data)) {
    const img = pool.get(name);
    if (img) resources[name] = { type: img.type };
    else missing.push(name);
  }
  const out: CcfoliaRoomData = { ...data, resources };
  const entries: ZipEntry[] = [
    { name: ROOM_DATA_FILE, data: JSON.stringify(out) },
    { name: ROOM_TOKEN_FILE, data: token ?? newRoomToken() },
    ...Object.keys(resources).map((name) => ({ name, data: pool.get(name)!.data })),
  ];
  return { bytes: zipFiles(entries, zipOptions), data: out, missing };
}

/* ---------- 自我檢查（room-zip F281） ---------- */

export type RoomZipProblem =
  /** 有資料夾（ZIP 必須完全平坦） */
  | { code: 'folder'; names: string[] }
  /** 沒有 `.token` */
  | { code: 'no-token' }
  /** 沒有 `__data.json` */
  | { code: 'no-data' }
  /** `__data.json` 不是合法 JSON */
  | { code: 'bad-json' }
  /** resources 有、ZIP 裡沒有的圖 */
  | { code: 'missing-image'; names: string[] }
  /** ZIP 裡有、resources 沒列的圖 */
  | { code: 'orphan-image'; names: string[] }
  /** 檔名不等於內容的 SHA-256 */
  | { code: 'hash-mismatch'; names: string[] }
  /** JSON 引用了、ZIP 裡沒有的圖 */
  | { code: 'dangling-ref'; names: string[] };

export interface RoomZipCheck {
  ok: boolean;
  /** 依上面的順序列出（文字由工具依 code 自訂） */
  problems: RoomZipProblem[];
  imageCount: number;
  sceneCount: number;
  characterCount: number;
}

/**
 * 解開房間 ZIP 自行檢查（room-zip F281）：沒有資料夾、有 `.token`、有 `__data.json`、resources 與圖片檔一一對應
 * （沒有多也沒有少）、每個圖片檔名等於內容的 SHA-256、JSON 引用的圖片都在 ZIP 裡。
 */
export async function checkRoomZip(bytes: Uint8Array): Promise<RoomZipCheck> {
  const all = unzipFiles(bytes, { directories: true });
  const files = all.filter((e) => !e.name.endsWith('/'));
  const names = files.map((e) => e.name);
  const problems: RoomZipProblem[] = [];
  const folders = all.filter((e) => e.name.includes('/')).map((e) => e.name);
  if (folders.length) problems.push({ code: 'folder', names: folders });
  if (!names.includes(ROOM_TOKEN_FILE)) problems.push({ code: 'no-token' });
  const dataEntry = files.find((e) => e.name === ROOM_DATA_FILE);
  const images = files.filter((e) => /\.(webp|png|jpeg|jpg|gif)$/i.test(e.name));
  const counts = { imageCount: images.length, sceneCount: 0, characterCount: 0 };
  if (!dataEntry) {
    problems.push({ code: 'no-data' });
    return { ok: false, problems, ...counts, imageCount: 0 };
  }
  let data: Partial<CcfoliaRoomData>;
  try {
    data = JSON.parse(new TextDecoder().decode(dataEntry.data));
  } catch {
    problems.push({ code: 'bad-json' });
    return { ok: false, problems, ...counts };
  }
  const imageNames = images.map((e) => e.name);
  const declared = Object.keys(data?.resources ?? {});
  const missing = declared.filter((n) => !imageNames.includes(n));
  const orphan = imageNames.filter((n) => !declared.includes(n));
  if (missing.length) problems.push({ code: 'missing-image', names: missing });
  if (orphan.length) problems.push({ code: 'orphan-image', names: orphan });
  const bad: string[] = [];
  for (const img of images) {
    const stem = img.name.split('.')[0];
    if (stem !== (await sha256Hex(img.data))) bad.push(img.name);
  }
  if (bad.length) problems.push({ code: 'hash-mismatch', names: bad });
  const dangling = collectRoomImageNames(data).filter((n) => !imageNames.includes(n));
  if (dangling.length) problems.push({ code: 'dangling-ref', names: dangling });
  const entities = (data?.entities ?? {}) as Partial<CcfoliaRoomData['entities']>;
  return {
    ok: problems.length === 0,
    problems,
    imageCount: images.length,
    sceneCount: Object.keys(entities.scenes ?? {}).length,
    characterCount: Object.keys(entities.characters ?? {}).length,
  };
}

/* ---------- 讀（psd-studio 2.3） ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;
/** 物件或陣列的子項目（陣列的鍵是數字） */
const childEntries = (v: object): [string | number, unknown][] =>
  Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);

/**
 * 在 ZIP 的檔案清單裡找房間資料檔（psd-studio F09）：根目錄的 `data.json` → `__data.json` →
 * 任何資料夾裡名為 `data.json`／`__data.json`／`room.json` 的檔（不分大小寫，ZIP 內順序的第一個）→ 任何 `.json`。
 */
export function findRoomDataFile(names: readonly string[]): string | null {
  const files = names.filter((n) => !n.endsWith('/'));
  return (
    files.find((n) => n === 'data.json') ??
    files.find((n) => n === ROOM_DATA_FILE) ??
    files.find((n) => /(^|\/)(data|__data|room)\.json$/i.test(n)) ??
    files.find((n) => /\.json$/i.test(n)) ??
    null
  );
}

/** 房間資料在 JSON 裡的位置（CCFOLIA 的格式在 `entities`；也接受包在 `data` 底下或放在頂層） */
export interface RoomDataView {
  /** 各類實體（items、characters、scenes…）所在的物件 */
  entities: Obj | null;
  /** 房間設定（`entities.room`；舊格式的 JSON 可能直接把背景、前景、markers 放在 entities 那一層或頂層） */
  room: Obj | null;
  /** `resources`（沒有時 null） */
  resources: Obj | null;
}

const ENTITY_KEYS = ['room', 'items', 'characters', 'scenes', 'effects', 'notes', 'decks'];
const ROOM_KEYS = ['backgroundUrl', 'foregroundUrl', 'markers', 'fieldWidth', 'fieldHeight'];

/** 找出房間資料的位置（`entities`、`data.entities`、`data`、頂層，依序取第一個像房間資料的） */
export function resolveRoomData(json: unknown): RoomDataView {
  if (!isObj(json)) return { entities: null, room: null, resources: null };
  const data = isObj(json.data) ? json.data : null;
  const candidates = [json.entities, data?.entities, data, json].filter(isObj);
  const entities = candidates.find((c) => ENTITY_KEYS.some((k) => k in c)) ?? null;
  const roomCandidates = [entities?.room, entities, data, json].filter(isObj);
  const room = roomCandidates.find((c) => ROOM_KEYS.some((k) => k in c)) ?? null;
  const resources = [json.resources, data?.resources].find(isObj) ?? null;
  return { entities, room, resources };
}

/** 引用的種類 */
export type RoomImageRefKind =
  | 'background'
  | 'foreground'
  | 'marker'
  | 'item'
  | 'item-cover'
  | 'character'
  | 'face'
  | 'scene-background'
  | 'scene-foreground'
  | 'scene-marker'
  | 'effect'
  | 'note'
  /** 上面以外、看起來是房間圖片檔名（64 字雜湊＋副檔名）的字串 */
  | 'other';

/** JSON 裡的一個圖片引用 */
export interface RoomImageRef {
  /** 引用的值（通常是 ZIP 裡的檔名；也可能是外部網址） */
  value: string;
  kind: RoomImageRefKind;
  /** 所屬物件的 ID（markers、items、characters、scenes…；背景與前景沒有） */
  id?: string;
  /** 場景的マーカーパネル：所屬場景的 ID */
  sceneId?: string;
  /** 從 JSON 頂層到這個值的路徑 */
  path: (string | number)[];
  /** 配置檢視要畫的（psd-studio F22：背景、前景、room.markers、items、characters 的 iconUrl） */
  layout: boolean;
  /** 物件本身（位置 x、y 是左上角的格座標；z、width、height、angle 可能沒有） */
  object?: Obj;
}

/**
 * 列出房間 JSON 裡所有的圖片引用（psd-studio 2.3）：背景、前景、`room.markers`、`items`（imageUrl、coverImageUrl）、
 * `characters`（iconUrl、faces[].iconUrl）、`scenes`（背景、前景、markers）、`effects`、`notes`，
 * 以及其他位置上看起來是房間圖片檔名的字串（kind 'other'）。容器是物件或陣列都可以。依 JSON 的順序。
 */
export function listRoomImageRefs(json: unknown): RoomImageRef[] {
  const refs: RoomImageRef[] = [];
  if (!isObj(json)) return refs;
  const { entities, room } = resolveRoomData(json);
  /* 先記下每個物件在 JSON 裡的路徑（entities、room 可能在不同的位置） */
  const pathOf = new Map<unknown, (string | number)[]>();
  const index = (v: unknown, path: (string | number)[]) => {
    if (!v || typeof v !== 'object' || pathOf.has(v)) return;
    pathOf.set(v, path);
    for (const [k, x] of childEntries(v)) index(x, [...path, k]);
  };
  index(json, []);
  const known = new Set<string>();
  const push = (
    holder: Obj,
    key: string,
    kind: RoomImageRefKind,
    layout: boolean,
    extra: Partial<RoomImageRef> = {},
  ) => {
    const value = holder[key];
    if (typeof value !== 'string' || !value) return;
    const path = [...(pathOf.get(holder) ?? []), key];
    known.add(path.join('\u0000'));
    refs.push({ value, kind, path, layout, ...extra });
  };
  /** 容器（物件或陣列）裡的每個物件與它的 ID */
  const each = (container: unknown, fn: (obj: Obj, id: string) => void) => {
    if (!container || typeof container !== 'object') return;
    for (const [id, o] of childEntries(container)) if (isObj(o)) fn(o, String(id));
  };
  if (room) {
    push(room, 'backgroundUrl', 'background', true);
    push(room, 'foregroundUrl', 'foreground', true);
    each(room.markers, (m, id) => push(m, 'imageUrl', 'marker', true, { id, object: m }));
  }
  if (entities) {
    each(entities.items, (it, id) => {
      push(it, 'imageUrl', 'item', true, { id, object: it });
      push(it, 'coverImageUrl', 'item-cover', false, { id, object: it });
    });
    each(entities.characters, (c, id) => {
      push(c, 'iconUrl', 'character', true, { id, object: c });
      each(c.faces, (f) => push(f, 'iconUrl', 'face', false, { id, object: c }));
    });
    each(entities.scenes, (sc, id) => {
      push(sc, 'backgroundUrl', 'scene-background', false, { id, object: sc });
      push(sc, 'foregroundUrl', 'scene-foreground', false, { id, object: sc });
      each(sc.markers, (m, mid) => {
        push(m, 'imageUrl', 'scene-marker', false, { id: mid, sceneId: id, object: m });
      });
    });
    each(entities.effects, (e, id) => push(e, 'imageUrl', 'effect', false, { id, object: e }));
    each(entities.notes, (n, id) => push(n, 'iconUrl', 'note', false, { id, object: n }));
  }
  /* 其他位置的房間圖片檔名（resources 的鍵不是值，不會被掃到） */
  const scan = (v: unknown, path: (string | number)[]) => {
    if (typeof v === 'string') {
      if (ROOM_IMAGE_NAME_RE.test(v) && !known.has(path.join('\u0000'))) {
        refs.push({ value: v, kind: 'other', path, layout: false });
      }
      return;
    }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of childEntries(v)) scan(x, [...path, k]);
  };
  scan(json, []);
  return refs;
}

/** 看不看得出是房間資料（psd-studio F09）：有任何配置檢視要畫的圖片引用，或 JSON 頂層有 `data`／`entities` */
export function isRoomJson(json: unknown): boolean {
  if (!isObj(json)) return false;
  if (json.data || json.entities) return true;
  return listRoomImageRefs(json).some((r) => r.layout);
}

/**
 * 引用 → ZIP 裡的圖片路徑（CCFOLIA 的引用就是檔名）：完全相同的路徑 → 檔名相同 → 檔名不分大小寫相同；找不到時 null。
 */
export function matchRoomImage(value: string, paths: readonly string[]): string | null {
  const exact = paths.find((p) => p === value);
  if (exact) return exact;
  const b = basename(value);
  const same = paths.find((p) => basename(p) === b);
  if (same) return same;
  const lower = b.toLowerCase();
  return paths.find((p) => basename(p).toLowerCase() === lower) ?? null;
}

export interface RoomZipContents {
  /** ZIP 的全部項目（依 ZIP 內的順序，含資料夾項目） */
  entries: { name: string; data: Uint8Array }[];
  /** 讀到的房間資料檔路徑（沒有時 null） */
  dataPath: string | null;
  /** 解析後的 JSON（沒有資料檔或解析失敗時 null） */
  json: unknown;
  /** 有房間資料而且看得出是房間（F09） */
  isRoom: boolean;
  /** ZIP 裡的圖片（依副檔名：png、apng、jpg、jpeg、webp、gif；保留 ZIP 內路徑） */
  images: { path: string; data: Uint8Array }[];
}

/** 讀房間 ZIP（psd-studio F09；資料檔解析失敗當成沒有，不會丟錯；ZIP 本身壞掉時 unzip 會丟錯） */
export function readRoomZip(bytes: Uint8Array): RoomZipContents {
  const entries = unzipFiles(bytes, { directories: true });
  const dataPath = findRoomDataFile(entries.map((e) => e.name));
  let json: unknown = null;
  if (dataPath) {
    try {
      const raw = entries.find((e) => e.name === dataPath)!.data;
      json = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      json = null;
    }
  }
  const images = entries
    .filter((e) => !e.name.endsWith('/') && IMAGE_FILE_RE.test(e.name))
    .map((e) => ({ path: e.name, data: e.data }));
  return { entries, dataPath, json, isRoom: json !== null && isRoomJson(json), images };
}

/* ---------- 改名重寫（psd-studio 3.4） ---------- */

/** 定義一個自有屬性（鍵是 "__proto__" 也安全） */
function setOwn(o: Obj, key: string, value: unknown) {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true });
}

function replaceAllIn(s: string, renames: readonly (readonly [string, string])[]): string {
  let out = s;
  for (const [from, to] of renames) {
    if (!from) continue;
    if (out === from) out = to;
    else if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/**
 * 把 JSON 裡**所有字串值與物件的鍵**中的舊名換成新名（psd-studio 3.4 第 3 步）：完全相等的換掉、包含的把其中的舊名全部換掉。
 * 從比較長的舊名先換（避免只換到雜湊主體）；回傳新的 JSON（不改動原本的），物件的鍵順序不變。
 */
export function renameInRoomJson<T>(json: T, renames: Iterable<readonly [string, string]>): T {
  const sorted = [...renames].filter(([from]) => from).sort((a, b) => b[0].length - a[0].length);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return replaceAllIn(v, sorted);
    if (Array.isArray(v)) return v.map(walk);
    if (isObj(v)) {
      const out: Obj = {};
      for (const key of Object.keys(v)) setOwn(out, replaceAllIn(key, sorted), walk(v[key]));
      return out;
    }
    return v;
  };
  return walk(json) as T;
}

/**
 * 一張圖改名時的「舊 → 新」對照（psd-studio 3.4 第 2 步）：舊主檔名（雜湊）→ 新雜湊；舊檔名 → 新檔名；
 * 含路徑的舊名 → 含路徑的新名。newExt 不給時沿用原副檔名（含「.」的部分）。
 */
export function roomRenamePairs(
  oldPath: string,
  newHash: string,
  newExt?: string,
): [string, string][] {
  const oldName = basename(oldPath);
  const prefix = oldPath.slice(0, oldPath.length - oldName.length);
  const dot = oldName.lastIndexOf('.');
  const oldStem = dot >= 0 ? oldName.slice(0, dot) : oldName;
  const ext =
    newExt !== undefined ? (newExt ? `.${newExt}` : '') : dot >= 0 ? oldName.slice(dot) : '';
  const newName = `${newHash}${ext}`;
  return [
    [oldStem, newHash],
    [oldName, newName],
    [oldPath, prefix + newName],
  ];
}

/** 換掉的一張圖 */
export interface RoomImageReplacement {
  /** ZIP 內原本的路徑（含資料夾） */
  path: string;
  /** 新內容 */
  data: Uint8Array;
  /**
   * 新內容的 MIME（webp、png、jpeg、gif 四種）。給了就依它決定副檔名並把 resources 的 type 改成它
   * （psd-studio 第 7 節裁定：重新編碼成 PNG 時副檔名改 .png、type 改 image/png）；
   * 不給（或不是這四種）時副檔名沿用原檔、type 不改（原作的行為）。
   */
  mime?: string;
}

export interface RewrittenRoomZip {
  bytes: Uint8Array<ArrayBuffer>;
  /** 寫回的 JSON（已改名） */
  json: unknown;
  /** JSON 寫在 ZIP 裡的路徑 */
  jsonPath: string;
  /** 每張圖：原路徑 → 新路徑 */
  renamed: { from: string; to: string }[];
}

/**
 * 以原 ZIP 為底改名重寫（psd-studio 3.4）：
 * 1. 每張換掉的圖算新內容的 SHA-256，新檔名＝`<新雜湊>.<副檔名>`，放在原本的資料夾、原本的位置（舊檔移除）；
 * 2. JSON 裡所有字串值與物件的鍵依「舊 → 新」對照替換（renameInRoomJson）；有給 mime 的圖一併改 resources 的 type；
 * 3. JSON 以 2 格縮排寫回：ZIP 內第一個名為 `data.json`／`__data.json`／`room.json` 的檔；都沒有時寫在根目錄、
 *    用讀進來時的檔名（沒有資料檔時 `data.json`）；
 * 4. `.token`、資料夾項目與其他檔案（含沒換掉的圖）原封不動。
 */
export async function rewriteRoomZip(
  source: Pick<RoomZipContents, 'entries' | 'dataPath' | 'json'>,
  replacements: readonly RoomImageReplacement[],
  zipOptions: ZipOptions = {},
): Promise<RewrittenRoomZip> {
  const files = new Map<string, Uint8Array>(source.entries.map((e) => [e.name, e.data]));
  const order = source.entries.map((e) => e.name);
  const pairs = new Map<string, string>();
  const retype = new Map<string, string>();
  const renamed: { from: string; to: string }[] = [];
  for (const r of replacements) {
    const hash = await sha256Hex(r.data);
    const ext = r.mime ? (roomImageExt(r.mime) ?? undefined) : undefined;
    const list = roomRenamePairs(r.path, hash, ext);
    for (const [from, to] of list) pairs.set(from, to);
    const [, [, newName], [, newPath]] = list;
    if (ext) retype.set(newName, ROOM_IMAGE_MIME[ext]);
    const at = order.indexOf(r.path);
    files.delete(r.path);
    if (at >= 0 && !files.has(newPath)) order[at] = newPath;
    else if (at >= 0) order.splice(at, 1);
    else if (!files.has(newPath)) order.push(newPath);
    files.set(newPath, r.data);
    renamed.push({ from: r.path, to: newPath });
  }
  const hasJson = source.json !== null && source.json !== undefined;
  const json = hasJson ? renameInRoomJson(source.json, pairs) : null;
  if (hasJson && retype.size) {
    const { resources } = resolveRoomData(json);
    for (const [name, mime] of retype) {
      const res = resources?.[name];
      if (isObj(res)) res.type = mime;
    }
  }
  const jsonPath =
    order.find((n) => /(^|\/)(data|__data|room)\.json$/i.test(n)) ??
    (source.dataPath ? basename(source.dataPath) : 'data.json');
  if (hasJson) {
    if (!files.has(jsonPath)) order.push(jsonPath);
    files.set(jsonPath, new TextEncoder().encode(JSON.stringify(json, null, 2)));
  }
  const bytes = zipFiles(
    order.map((name) => ({ name, data: files.get(name)! })),
    zipOptions,
  );
  return { bytes, json, jsonPath, renamed };
}
