/**
 * 讀入 CCFOLIA 房間 ZIP → 這個工具的專案（規格 3.7、F287～F299；不依賴 React 與 DOM，單元測試直接餵位元組）。
 *
 * 讀取用共用的 `readRoomZip`（`@/ccfolia`）；轉換規則：
 * - 圖片 → 素材（內容 SHA-256＋副檔名命名、同內容合併；不轉檔、不縮小，原位元組照放）。
 * - 房間 → 房間設計（背景、前景、盤面、BGM 交叉淡化〔與畫面相反〕、舊式骰子）；其餘欄位原樣記在 `room.extra`。
 * - `room.markers` → 共用標記；`items`（螢幕面板）→ 螢幕面板；位置換成中心座標（見 rect.ts）。
 * - 場景 → 場景：背景模式、前景、盤面、裁切、格線、切換文字（開頭的「@切入名稱」還原成指定切入）；場景的マーカー與共用標記同 ID、
 *   只差圖片／位置／大小／堆疊順序的 → 場景差異，不在這個場景裡的共用標記 → 本場景隱藏，其餘 → 演出。
 * - `effects` → 切入；`characters` → 棋子（名稱、備忘、HP／MP、圖示、差分、聊天面板；狀態、參數、位置等原樣記在 `extra`）。
 * - `notes`（劇本文字）→ 「劇本文字」頁的內容（標題、內文；順序、圖示等原樣記在 `note`，匯出時寫回成劇本文字）。
 * - 沒有對應功能的資料（牌堆、存檔、快照、無法對應的面板…）原樣放進 `keep`，匯出時寫回。
 * 壞檔、不是房間 ZIP、版本不認得時丟 `RoomImportError`（訊息可直接顯示；呼叫端的目前專案不受影響）。
 */
import {
  crossfadeFromFlag,
  type GridRect,
  gridLength,
  matchRoomImage,
  packRoomImage,
  ROOM_IMAGE_NAME_RE,
  type RoomZipContents,
  readRoomZip,
  resolveRoomData,
  sniffImageMime,
} from '@/ccfolia';
import { zipUncompressedSize } from '@/core/files';
import { isZipBytes, type ToolStore } from '@/core/storage';
import { imageInfo } from './imageInfo';
import { baseName, guessTag } from './materials';
import {
  type Cutin,
  createKpSettings,
  createProject,
  createRoomDesign,
  DEFAULT_PROJECT_NAME,
  type Extra,
  type Material,
  NAMES,
  NEW_PROJECT_NAME,
  newLocalId,
  type Part,
  type PartOverride,
  type Piece,
  type PieceFace,
  type Project,
  type RoomKeep,
  type Scene,
  type SceneMarker,
  type StoryText,
  type Tag,
} from './model';
import { fitRect, sameRect } from './rect';
import { EXTERNAL_RE, isImageKey, KEEP_KINDS, OWNED } from './roomFields';
import { S } from './strings';

/* ---------- 錯誤 ---------- */

export type RoomImportErrorCode =
  | 'too-large'
  | 'too-large-unzipped'
  | 'not-zip'
  | 'project-file'
  | 'no-data'
  | 'bad-json'
  | 'not-room'
  | 'version';

/** 讀得進來的房間 ZIP 大小上限（位元組）：整份讀進記憶體再解開，太大的瀏覽器可能撐不住 */
export const ROOM_ZIP_MAX_BYTES = 400 * 1024 * 1024;

/** 解開後的總大小上限（位元組）：擋掉解壓炸彈（檔案很小、解開來好幾 GB） */
export const ROOM_ZIP_MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;

/** 讀不了房間 ZIP（訊息可直接顯示給使用者） */
export class RoomImportError extends Error {
  override name = 'RoomImportError';
  constructor(
    readonly code: RoomImportErrorCode,
    detail = '',
  ) {
    super(
      code === 'version'
        ? S.roomImport.errors.version(detail)
        : code === 'too-large'
          ? S.roomImport.errors['too-large'](ROOM_ZIP_MAX_BYTES / 1024 / 1024)
          : code === 'too-large-unzipped'
            ? S.roomImport.errors['too-large-unzipped'](ROOM_ZIP_MAX_UNZIPPED_BYTES / 1024 / 1024)
            : S.roomImport.errors[code],
    );
  }
}

/** 檔案太大就不讀（讀檔之前先看大小） */
export function assertRoomZipSize(size: number): void {
  if (size > ROOM_ZIP_MAX_BYTES) throw new RoomImportError('too-large');
}

/* ---------- 結果 ---------- */

/** 要存進圖片庫的一張圖 */
export interface RoomImportImage {
  /** `<SHA-256>.<副檔名>`（素材的識別） */
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface RoomImportReport {
  /** 專案名稱（房間名稱、檔名） */
  roomName: string;
  counts: {
    materials: number;
    scenes: number;
    markers: number;
    panels: number;
    pieces: number;
    cutins: number;
    /** 讀成「劇本文字」頁內容的劇本文字數 */
    notes: number;
  };
  /** 場景專屬、成為「演出」的面板數 */
  sceneOnlyMarkers: number;
  /** 用網址的圖（不同的網址張數） */
  externalImages: number;
  /** 原樣保留的資料：類別 → 件數（3.7.8；`other` 是不認得的類別名稱） */
  kept: KeptCounts & {
    /** 棋子、房間、場景有欄位原樣保留 */
    fields: boolean;
  };
  /** 做不到保留、會少掉的東西（3.7.9） */
  lost: {
    /** ZIP 裡既不是房間資料、`.token` 也不是圖片的檔案數 */
    files: number;
    /** 格式不支援或內容是空的圖片檔（ZIP 內路徑） */
    images: string[];
    /** 房間資料引用了、ZIP 裡找不到的檔名 */
    missing: string[];
    /** 欄位名稱不是「Url」結尾卻寫著房間圖片檔名的位置數（匯出時那張圖不會收進 ZIP） */
    unlinked: number;
    /** 最上層本工具不認得的欄位 */
    topFields: string[];
    /** 名稱是 `__proto__` 的項目與欄位數（會污染物件原型，不能保留） */
    reserved: number;
  };
}

export interface RoomImportResult {
  project: Project;
  images: RoomImportImage[];
  report: RoomImportReport;
}

/** 原樣保留的資料有多少（類別 → 件數；`other` 是不認得的類別名稱） */
export interface KeptCounts {
  decks: number;
  savedatas: number;
  snapshots: number;
  items: number;
  effects: number;
  roomMarkers: number;
  sceneMarkers: number;
  other: string[];
}

/** 專案的 keep 有多少東西（讀入報告、儲存頁的「保留的房間資料」用） */
export function keptCounts(keep: RoomKeep | undefined): KeptCounts {
  const size = (v: unknown): number =>
    Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
  const kind = (k: string) => size(keep?.entities?.[k]);
  const known = ['decks', 'savedatas', 'snapshots', 'items', 'effects'];
  return {
    decks: kind('decks'),
    savedatas: kind('savedatas'),
    snapshots: kind('snapshots'),
    items: kind('items'),
    effects: kind('effects'),
    roomMarkers: size(keep?.roomMarkers),
    sceneMarkers: Object.values(keep?.sceneMarkers ?? {}).reduce((n, o) => n + size(o), 0),
    other: Object.keys(keep?.entities ?? {}).filter(
      (k) => !known.includes(k) && size(keep?.entities?.[k]) > 0,
    ),
  };
}

/** 保留的資料一句話（「劇本文字 3、牌堆 1」）；沒有時空陣列 */
export function keptLabels(k: KeptCounts): string[] {
  const out: string[] = [];
  for (const [key, label] of Object.entries(S.roomImport.keptKinds)) {
    const n = (k as unknown as Record<string, number>)[key];
    if (n > 0) out.push(S.roomImport.keptCount(label, n));
  }
  for (const kind of k.other) out.push(S.roomImport.keptOther(kind));
  return out;
}

/** 讀入報告裡有沒有「會少掉的東西」 */
export const hasLost = (r: RoomImportReport): boolean =>
  r.lost.files > 0 ||
  r.lost.images.length > 0 ||
  r.lost.missing.length > 0 ||
  r.lost.unlinked > 0 ||
  r.lost.topFields.length > 0 ||
  r.lost.reserved > 0;

/** 讀入報告的文字（對話框與通知用；回傳一行一行的字串） */
export function describeReport(r: RoomImportReport): {
  counts: string;
  converted: string | null;
  external: string | null;
  kept: string[];
  keptFields: boolean;
  lost: string[];
} {
  const T = S.roomImport;
  const list = (names: string[]) =>
    names.slice(0, 3).join('、') + (names.length > 3 ? `…（共 ${names.length} 個）` : '');
  const lost: string[] = [];
  if (r.lost.files) lost.push(T.lostFiles(r.lost.files));
  if (r.lost.images.length) lost.push(T.lostImages(r.lost.images.length, list(r.lost.images)));
  if (r.lost.missing.length) lost.push(T.lostMissing(r.lost.missing.length, list(r.lost.missing)));
  if (r.lost.unlinked) lost.push(T.lostUnlinked(r.lost.unlinked));
  if (r.lost.topFields.length) lost.push(T.lostTop(list(r.lost.topFields)));
  if (r.lost.reserved) lost.push(T.lostReserved(r.lost.reserved));
  return {
    counts: T.countsLine(r.counts),
    converted: r.sceneOnlyMarkers ? T.convertedLine(r.sceneOnlyMarkers) : null,
    external: r.externalImages ? T.externalLine(r.externalImages) : null,
    kept: keptLabels(r.kept),
    keptFields: r.kept.fields,
    lost,
  };
}

/* ---------- 小工具 ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};
/** 去掉指定的鍵（也丟掉 `__proto__`）；回傳新物件 */
const omit = (o: Obj, keys: readonly string[]): Obj =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== '__proto__' && !keys.includes(k)));

/** 容器（物件或陣列）裡的物件與它的 ID（陣列用物件的 id 欄位，沒有就用索引） */
function entriesOf(container: unknown): [string, Obj][] {
  if (Array.isArray(container)) {
    return container.flatMap((o, i) =>
      isObj(o) ? [[str(o.id) || String(i), o] as [string, Obj]] : [],
    );
  }
  if (!isObj(container)) return [];
  return Object.entries(container).filter(
    (e): e is [string, Obj] => e[0] !== '__proto__' && isObj(e[1]),
  );
}

/** 依 `order` 由小到大（沒有 order 的排最後；順序相同維持原順序） */
const byOrder = (list: [string, Obj][]): [string, Obj][] =>
  list
    .map((e, i) => ({ e, i, o: num(e[1].order, Number.POSITIVE_INFINITY) }))
    .sort((a, b) => (a.o === b.o ? a.i - b.i : a.o < b.o ? -1 : 1))
    .map((x) => x.e);

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => sameJson(x, b[i]))
    );
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return (
      ka.length === Object.keys(b).length &&
      ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]))
    );
  }
  return false;
}

const rectOf = (o: Obj): GridRect => ({
  x: num(o.x),
  y: num(o.y),
  width: num(o.width, 4),
  height: num(o.height, 4),
});

/** 外部資料格式的最上層欄位（其餘算「最上層不認得的欄位」） */
const TOP_KEYS = ['meta', 'entities', 'resources', 'data'];

/* ---------- 是不是房間 ZIP（開檔時分辨用） ---------- */

/** 本工具的專案檔（project.json＋files/…）：房間資料檔的搜尋會把 project.json 當成資料檔，要先排除 */
function isProjectZip(read: RoomZipContents): boolean {
  const names = read.entries.map((e) => e.name);
  return (
    names.includes('project.json') && !names.includes('__data.json') && !names.includes('data.json')
  );
}

/** ZIP 的種類（頁首「讀取」自動分辨用）：房間資料、本工具的專案檔、兩者都不是、不是 ZIP（或讀不了） */
export type ZipKind = 'room' | 'project' | 'other' | 'not-zip';

export function zipKind(bytes: Uint8Array): ZipKind {
  if (!isZipBytes(bytes)) return 'not-zip';
  try {
    const read = readRoomZip(bytes);
    if (isProjectZip(read)) return 'project';
    return read.isRoom ? 'room' : 'other';
  } catch {
    return 'not-zip';
  }
}

/** 便宜的判斷：是 ZIP、有房間資料檔、沒有本工具專案檔的 project.json */
export const looksLikeRoomZip = (bytes: Uint8Array): boolean => zipKind(bytes) === 'room';

/**
 * 專案是空的（沒有任何素材、場景、部件、立繪、切入、棋子、劇本文字、保留的資料，房間設計、KP 設定、備忘、待辦、專案名稱都沒改過）：
 * 讀入時不必確認（R9）。
 */
export function isProjectBlank(p: Project): boolean {
  return (
    !p.materials.length &&
    !p.scenes.length &&
    !p.parts.length &&
    !p.tachie.length &&
    !p.cutins.length &&
    !p.pieces.length &&
    !p.story.length &&
    !p.sceneTemplates.length &&
    !p.keep &&
    !p.memo.trim() &&
    !p.todos.length &&
    (p.name === DEFAULT_PROJECT_NAME || p.name === NEW_PROJECT_NAME) &&
    sameJson(p.room, createRoomDesign()) &&
    sameJson(p.kp, createKpSettings())
  );
}

/**
 * 整個專案換掉，並且一定記成一步復原（3.7.3）：連續變更的合併（0.8 秒內併成一步）不會把這一步併掉，
 * 復原一次就回到換掉之前的專案。
 */
export function replaceUndoable<T extends object>(
  store: Pick<ToolStore<T>, 'beginGesture' | 'endGesture' | 'getState'>,
  next: T,
): void {
  store.beginGesture();
  try {
    store.getState().replace(next);
  } finally {
    store.endGesture();
  }
}

/* ---------- 讀入 ---------- */

export interface RoomImportOptions {
  /** 檔名（沒有房間名稱時當專案名稱，去掉 .zip） */
  fileName?: string;
}

/** 讀房間 ZIP 的位元組，轉成專案與要存的圖片（失敗丟 RoomImportError） */
export async function importRoomZip(
  bytes: Uint8Array,
  { fileName = '' }: RoomImportOptions = {},
): Promise<RoomImportResult> {
  assertRoomZipSize(bytes.length);
  if (!isZipBytes(bytes)) throw new RoomImportError('not-zip');
  /* 解開之前先看目錄記的解開後大小（R12，擋解壓炸彈） */
  let unzipped: number;
  try {
    unzipped = zipUncompressedSize(bytes);
  } catch {
    throw new RoomImportError('not-zip');
  }
  if (unzipped > ROOM_ZIP_MAX_UNZIPPED_BYTES) throw new RoomImportError('too-large-unzipped');
  let read: RoomZipContents;
  try {
    read = readRoomZip(bytes);
  } catch {
    throw new RoomImportError('not-zip');
  }
  if (isProjectZip(read)) throw new RoomImportError('project-file');
  if (!read.dataPath) throw new RoomImportError('no-data');
  if (read.json === null) throw new RoomImportError('bad-json');
  if (!read.isRoom) throw new RoomImportError('not-room');
  const json = read.json as Obj;
  const view = resolveRoomData(json);
  const data = isObj(json.data) ? json.data : null;
  const meta = [json.meta, data?.meta].find(isObj);
  if (meta && meta.version != null && !/^1(\.|$)/.test(str(meta.version))) {
    throw new RoomImportError('version', str(meta.version));
  }
  const ent: Obj = view.entities ?? {};
  const roomRaw: Obj = isObj(ent.room) ? ent.room : {};

  /* ---------- 圖片 ---------- */
  const images = new Map<
    string,
    RoomImportImage & { path: string; width: number; height: number; animated: boolean }
  >();
  const pathToName = new Map<string, string>();
  const skippedImages: string[] = [];
  for (const f of read.images) {
    /* 檔頭認得是 PNG（含 APNG）、JPEG、GIF、WebP 才收；副檔名和 resources 的 type 不當依據 */
    const mime = sniffImageMime(f.data);
    if (!mime) {
      skippedImages.push(f.path);
      continue;
    }
    try {
      const packed = await packRoomImage(f.data, mime);
      pathToName.set(f.path, packed.name);
      if (!images.has(packed.name)) {
        images.set(packed.name, {
          name: packed.name,
          mime: packed.type,
          data: packed.data,
          path: f.path,
          ...imageInfo(f.data, packed.type),
        });
      }
    } catch {
      skippedImages.push(f.path);
    }
  }
  const zipPaths = [...pathToName.keys()];
  const resolved = new Map<string, { out: string; found: boolean }>();
  const missing = new Set<string>();
  const external = new Set<string>();
  /**
   * 引用 → 素材名稱（ZIP 裡的圖）；網址與找不到的原樣；空的是 null。
   * key 是這個值所在的欄位名稱（沒給＝圖片欄位）：外部連結、嵌入網址等不是圖片的欄位不算「網址的圖」或「找不到的圖」。
   */
  const img = (v: unknown, key = ''): string | null => {
    if (typeof v !== 'string' || !v.trim()) return null;
    let hit = resolved.get(v);
    if (!hit) {
      const plain = v.replace(/^\.?\//, '');
      const web = EXTERNAL_RE.test(v);
      let path = web ? null : matchRoomImage(plain, zipPaths);
      if (!path && !web) {
        try {
          const decoded = decodeURIComponent(plain);
          if (decoded !== plain) path = matchRoomImage(decoded, zipPaths);
        } catch {
          /* 不是合法的百分比編碼就算了 */
        }
      }
      hit = { out: path ? (pathToName.get(path) ?? v) : v, found: path !== null };
      resolved.set(v, hit);
    }
    if (!hit.found && isImageKey(key)) noteUnresolved(v);
    return hit.out;
  };
  const noteUnresolved = (v: string) => {
    if (EXTERNAL_RE.test(v)) external.add(v);
    else missing.add(v);
  };
  /** 深層複製；欄位名稱以 Url 結尾的字串換成素材名稱 */
  const mapUrls = <T>(v: T, key = ''): T => {
    if (typeof v === 'string') return (/Url$/.test(key) && v ? (img(v, key) ?? v) : v) as T;
    if (Array.isArray(v)) return v.map((x) => mapUrls(x, key)) as T;
    if (isObj(v)) {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => k !== '__proto__')
          .map(([k, x]) => [k, mapUrls(x, k)]),
      ) as T;
    }
    return v;
  };
  /** 素材的顯示名稱：第一個用到它的地方 */
  const labels = new Map<string, string>();
  const use = (name: string | null, label: string): string | null => {
    if (name && images.has(name) && !labels.has(name)) labels.set(name, label);
    return name;
  };

  /* ---------- 房間 ---------- */
  const roomName =
    str(roomRaw.name).trim() || fileName.replace(/\.zip$/i, '').trim() || S.roomImport.defaultName;
  const fieldWidth = gridLength(num(roomRaw.fieldWidth, 40), 40);
  const fieldHeight = gridLength(num(roomRaw.fieldHeight, 30), 30);
  const roomBg = use(img(roomRaw.backgroundUrl), '房間背景');
  const roomFg = use(img(roomRaw.foregroundUrl), '房間前景');
  const room = {
    ...createRoomDesign(),
    fieldWidth,
    fieldHeight,
    backgroundUrl: roomBg,
    foregroundUrl: roomFg,
    bgmCrossfade: crossfadeFromFlag(Boolean(roomRaw.enableCrossfade)),
    legacyDice: roomRaw.hidden3dDice === true,
    extra: mapUrls(omit(roomRaw, OWNED.room)),
  };

  /* 沒有對應功能、原樣保留的資料（3.7.8） */
  const keepMeta: Extra | undefined = meta ? mapUrls(omit(meta, [])) : undefined;
  const keepEntities: Record<string, Record<string, unknown>> = {};
  const keepRoomMarkers: Record<string, unknown> = {};
  const keepSceneMarkers: Record<string, Record<string, unknown>> = {};
  const keepEntity = (kind: string, id: string, raw: unknown) => {
    keepEntities[kind] ??= {};
    keepEntities[kind][id] = mapUrls(raw);
  };

  /* ---------- 共用標記與螢幕面板 ---------- */
  const parts: Part[] = [];
  const partIds = new Set<string>();
  const partRaw = new Map<string, GridRect>();
  const uniquePartId = (id: string): string => {
    let out = id;
    for (let i = 2; partIds.has(out); i++) out = `${id}~${i}`;
    partIds.add(out);
    return out;
  };
  const hasImage = (o: Obj) => typeof o.imageUrl === 'string' && o.imageUrl.trim() !== '';
  const firstLine = (t: string) => t.split('\n')[0].trim().slice(0, 16);
  let markerNo = 0;
  for (const [id, m] of entriesOf(roomRaw.markers)) {
    if (!hasImage(m)) {
      keepRoomMarkers[id] = mapUrls(m);
      continue;
    }
    markerNo++;
    const raw = rectOf(m);
    const fit = fitRect(raw);
    const text = str(m.text);
    const pid = uniquePartId(id);
    partRaw.set(pid, raw);
    parts.push({
      id: pid,
      ...(pid !== id ? { key: id } : {}),
      kind: 'marker',
      name: firstLine(text) || `${NAMES.marker}${markerNo}`,
      imageUrl: use(img(m.imageUrl), firstLine(text) || `${NAMES.marker}${markerNo}`),
      ...fit.model,
      z: num(m.z, 2),
      locked: false,
      lockAspect: false,
      visible: true,
      text,
      extra: mapUrls(omit(m, OWNED.marker)),
      ...(fit.origin ? { origin: fit.origin } : {}),
    });
  }
  let panelNo = 0;
  for (const [id, it] of byOrder(entriesOf(ent.items))) {
    const isPanel = (it.type === undefined || it.type === 'object') && !it.deckId && hasImage(it);
    if (!isPanel) {
      keepEntity('items', id, it);
      continue;
    }
    panelNo++;
    const fit = fitRect(rectOf(it));
    const memo = str(it.memo);
    const label = firstLine(memo) || `${NAMES.panel}${panelNo}`;
    const pid = uniquePartId(id);
    parts.push({
      id: pid,
      ...(pid !== id ? { key: id } : {}),
      kind: 'panel',
      name: label,
      imageUrl: use(img(it.imageUrl), label),
      ...fit.model,
      z: num(it.z, 2),
      locked: false,
      lockAspect: false,
      visible: true,
      text: memo,
      extra: mapUrls(omit(it, OWNED.item)),
      ...(fit.origin ? { origin: fit.origin } : {}),
    });
  }
  const markerParts = parts.filter((p) => p.kind === 'marker');
  const markerIds = new Set(markerParts.map((p) => p.id));

  /* 場景裡的面板 → 場景差異（3.7.5）：同 ID 的共用標記，文字與其他欄位都相同，只差圖片、位置、大小、堆疊順序；表示不出來時 undefined */
  const overrideOf = (part: Part, base: GridRect, m: Obj): PartOverride | undefined => {
    if (str(m.text) !== part.text) return undefined;
    if (!sameJson(mapUrls(omit(m, OWNED.marker)), part.extra ?? {})) return undefined;
    const o: PartOverride = {};
    const rect = rectOf(m);
    if (!sameRect(rect, base)) {
      const fit = fitRect(rect);
      if (fit.origin) return undefined;
      if (fit.model.x !== part.x) o.x = fit.model.x;
      if (fit.model.y !== part.y) o.y = fit.model.y;
      if (fit.model.width !== part.width) o.width = fit.model.width;
      if (fit.model.height !== part.height) o.height = fit.model.height;
      if (!Object.keys(o).length) return undefined;
    }
    const z = num(m.z, 2);
    if (z !== part.z) o.z = z;
    const image = img(m.imageUrl);
    if (image !== part.imageUrl) o.imageUrl = image;
    return o;
  };

  /* ---------- 切入 ---------- */
  const cutins: Cutin[] = [];
  for (const [id, e] of byOrder(entriesOf(ent.effects))) {
    const name = str(e.name);
    if (!name && !hasImage(e)) {
      keepEntity('effects', id, e);
      continue;
    }
    cutins.push({
      id,
      name,
      imageUrl: use(img(e.imageUrl), name || NAMES.cutin),
      extra: mapUrls(omit(e, OWNED.cutin)),
    });
  }

  /* ---------- 場景 ---------- */
  let sceneOnlyMarkers = 0;
  const scenes: Scene[] = [];
  for (const [sid, s] of byOrder(entriesOf(ent.scenes))) {
    const name = str(s.name);
    const label = name || NAMES.scene;
    const fg = use(img(s.foregroundUrl), `${label}・前景`);
    const bg = img(s.backgroundUrl);
    /* 背景模式（3.7.5）：沒有背景＝沿用房間（房間也沒有時）或沒有背景；和房間背景相同＝沿用房間；和前景相同＝與前景相同；其餘個別素材 */
    let backgroundMode: Scene['backgroundMode'];
    if (bg === null) backgroundMode = roomBg === null ? 'room' : 'none';
    else if (bg === roomBg) backgroundMode = 'room';
    else if (bg === (fg ?? roomFg)) backgroundMode = 'foreground';
    else backgroundMode = 'image';
    const text = str(s.text);
    const cut = splitSceneText(text, cutins);
    const overrides: Record<string, PartOverride> = {};
    const markers: SceneMarker[] = [];
    const seen = new Set<string>();
    let freeNo = 0;
    for (const [mid, m] of entriesOf(s.markers)) {
      const part = markerParts.find((p) => (p.key ?? p.id) === mid);
      const o = part ? overrideOf(part, partRaw.get(part.id) as GridRect, m) : undefined;
      if (part && o) {
        seen.add(part.id);
        if (Object.keys(o).length) overrides[part.id] = o;
        if (o.imageUrl) use(o.imageUrl, `${label}・${part.name}`);
        continue;
      }
      const image = img(m.imageUrl);
      const mtext = str(m.text);
      if (!image && !mtext) {
        keepSceneMarkers[sid] ??= {};
        keepSceneMarkers[sid][mid] = mapUrls(m);
        continue;
      }
      freeNo++;
      sceneOnlyMarkers++;
      const fit = fitRect(rectOf(m));
      const mlabel = firstLine(mtext) || `${NAMES.effect}${freeNo}`;
      let id = mid;
      for (let i = 2; markerIds.has(id) || markers.some((x) => x.id === id); i++)
        id = `${mid}~${i}`;
      markers.push({
        id,
        kind: 'free',
        refId: null,
        name: mlabel,
        imageUrl: use(image, `${label}・${mlabel}`),
        text: mtext,
        ...fit.model,
        z: num(m.z, 2),
        fullFit: 'cover',
        lockAspect: false,
        extra: mapUrls(omit(m, OWNED.marker)),
        ...(fit.origin ? { origin: fit.origin } : {}),
      });
    }
    /* 這個場景的マーカー沒有它的共用標記＝本場景隱藏 */
    for (const p of markerParts) if (!seen.has(p.id)) overrides[p.id] = { hidden: true };
    scenes.push({
      id: sid,
      name,
      foregroundUrl: fg,
      backgroundMode,
      backgroundUrl: backgroundMode === 'image' ? use(bg, `${label}・背景`) : null,
      fieldWidth: gridLength(num(s.fieldWidth, fieldWidth), fieldWidth),
      fieldHeight: gridLength(num(s.fieldHeight, fieldHeight), fieldHeight),
      autoCrop: s.fieldObjectFit !== 'fill',
      displayGrid: s.displayGrid === true,
      text: cut.text,
      memo: '',
      overrides,
      markers,
      cutinId: cut.cutinId,
      extra: mapUrls(omit(s, OWNED.scene)),
    });
  }

  /* ---------- 棋子（角色） ---------- */
  const pieces: Piece[] = [];
  for (const [id, c] of byOrder(entriesOf(ent.characters))) {
    const name = str(c.name);
    const icon = use(img(c.iconUrl), name || NAMES.normal);
    const faces: PieceFace[] = [];
    if (Array.isArray(c.faces)) {
      for (const f of c.faces) {
        if (!isObj(f)) continue;
        const flabel = str(f.label);
        faces.push({
          id: newLocalId('f'),
          label: flabel,
          iconUrl: use(
            img(f.iconUrl),
            `${name || NAMES.normal}・${flabel || NAMES.face(faces.length + 1)}`,
          ),
          extra: mapUrls(omit(f, OWNED.face)),
        });
      }
    }
    pieces.push({
      id,
      kind: 'normal',
      name,
      iconUrl: icon,
      hp: statusValue(c.status, 'HP'),
      mp: statusValue(c.status, 'MP'),
      faces,
      armor: '',
      dodge: '',
      noDodge: false,
      skills: [],
      commands: str(c.commands),
      memo: str(c.memo),
      extra: mapUrls(omit(c, OWNED.piece)),
    });
  }

  /* ---------- 劇本文字（notes）→「劇本文字」頁 ---------- */
  const story: StoryText[] = [];
  for (const [id, n] of byOrder(entriesOf(ent.notes))) {
    story.push({ id, title: str(n.name), body: str(n.text), note: mapUrls(omit(n, OWNED.note)) });
  }

  /* ---------- 沒有對應功能的類別 ---------- */
  for (const [kind, container] of Object.entries(ent)) {
    if (kind === '__proto__') continue;
    if ((KEEP_KINDS as readonly string[]).includes(kind)) {
      for (const [id, o] of entriesOf(container)) keepEntity(kind, id, o);
    } else if (!['room', 'items', 'characters', 'effects', 'scenes', 'notes'].includes(kind)) {
      /* 不認得的類別：整個原樣保留（含不是物件的內容） */
      keepEntities[kind] = mapUrls(container) as Record<string, unknown>;
    }
  }

  /* ---------- 素材 ---------- */
  const order = [...labels.keys(), ...[...images.keys()].filter((n) => !labels.has(n))];
  const materials: Material[] = order.map((name, i) => {
    const im = images.get(name) as NonNullable<ReturnType<typeof images.get>>;
    const tag: Tag = im.animated ? 'effect' : guessTag(im.width, im.height);
    return {
      name,
      label: labels.get(name) ?? `圖片${i + 1}`,
      tags: [tag],
      animated: im.animated,
      originalName: baseName(im.path.split('/').pop() ?? im.path),
      mime: im.mime,
      before: im.data.byteLength,
      after: im.data.byteLength,
      width: im.width,
      height: im.height,
    };
  });

  const project: Project = {
    ...createProject(roomName),
    room,
    parts,
    scenes,
    cutins,
    pieces,
    story,
    materials,
  };
  const keep: RoomKeep = {};
  if (keepMeta) keep.meta = keepMeta;
  if (Object.keys(keepEntities).length) keep.entities = keepEntities;
  if (Object.keys(keepRoomMarkers).length) keep.roomMarkers = keepRoomMarkers;
  if (Object.keys(keepSceneMarkers).length) keep.sceneMarkers = keepSceneMarkers;
  if (Object.keys(keep).length) project.keep = keep;

  /* ---------- 報告 ---------- */
  const unlinked = countUnlinkedImageNames(ent);
  const report: RoomImportReport = {
    roomName,
    counts: {
      materials: materials.length,
      scenes: scenes.length,
      markers: markerParts.length,
      panels: parts.length - markerParts.length,
      pieces: pieces.length,
      cutins: cutins.length,
      notes: story.length,
    },
    sceneOnlyMarkers,
    externalImages: external.size,
    kept: {
      ...keptCounts(project.keep),
      fields:
        pieces.some((p) => p.extra && Object.keys(p.extra).length > 0) ||
        Object.keys(room.extra ?? {}).length > 0 ||
        scenes.some((s) => s.extra && Object.keys(s.extra).length > 0),
    },
    lost: {
      files: read.entries.filter(
        (e) =>
          !e.name.endsWith('/') &&
          e.name !== read.dataPath &&
          e.name.split('/').pop() !== '.token' &&
          !pathToName.has(e.name) &&
          !skippedImages.includes(e.name) &&
          !/^__MACOSX\/|(^|\/)\.DS_Store$/.test(e.name),
      ).length,
      images: skippedImages,
      missing: [...missing],
      unlinked,
      topFields: Object.keys(json).filter((k) => !TOP_KEYS.includes(k)),
      reserved: countOwnKey(json, '__proto__'),
    },
  };

  return {
    project,
    images: [...images.values()].map(({ name, mime, data }) => ({ name, mime, data })),
    report,
  };
}

/**
 * 場景的切換文字（3.7.5）：開頭一行「@名稱」剛好是某個切入的名稱，而且接回去和原文完全一樣時，
 * 還原成「指定切入」＋切換時文字；否則整段當切換時文字。
 */
export function splitSceneText(
  text: string,
  cutins: readonly Cutin[],
): { text: string; cutinId: string | null } {
  const m = /^@([^\n]*)(?:\n([\s\S]*))?$/.exec(text);
  if (!m) return { text, cutinId: null };
  const cut = cutins.find((c) => c.name && c.name === m[1]);
  if (!cut) return { text, cutinId: null };
  const body = m[2] ?? '';
  return `@${cut.name}${body ? `\n${body}` : ''}` === text
    ? { text: body, cutinId: cut.id }
    : { text, cutinId: null };
}

/** 角色的狀態列裡某一欄（HP、MP）的最大值；沒有就空字串 */
function statusValue(status: unknown, label: 'HP' | 'MP'): string {
  if (!Array.isArray(status)) return '';
  const s = status.find((x) => isObj(x) && x.label === label);
  if (!isObj(s)) return '';
  const v = typeof s.max === 'number' ? s.max : s.value;
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** JSON 裡名稱是 key 的自有鍵有幾個（`__proto__` 之類的鍵放進物件會污染原型，讀入時略過並報告，R6） */
function countOwnKey(root: unknown, key: string): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === key) n++;
        walk(x);
      }
    }
  };
  walk(root);
  return n;
}

/** 欄位名稱不是 Url 結尾、值卻是房間圖片檔名的位置數（資料裡的圖片檔名只有 Url 欄位會被匯出時收進 ZIP） */
function countUnlinkedImageNames(root: unknown): number {
  let n = 0;
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string') {
      if (ROOM_IMAGE_NAME_RE.test(v) && !/Url$/.test(key)) n++;
      return;
    }
    if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(root, '');
  return n;
}
