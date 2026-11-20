/**
 * 輸出（不依賴 React）：棋子 → CCFOLIA 房間 ZIP（規格 3.7）、素材 ZIP（3.8）、一個棋子的角色剪貼簿 JSON（3.9）。
 * 房間 ZIP 一律經過共用層 `@/ccfolia`（createAppendRoomData、createRoomCharacter、packRoomImage、buildRoomZip）。
 */
import {
  buildRoomZip,
  type CcfoliaAppendRoomData,
  type CcfoliaRoomCharacter,
  CHARACTER_DEFAULT_COLOR,
  createAppendRoomData,
  createRoomCharacter,
  GRID_PX,
  isCharacterColor,
  newRoomEntityId,
  packRoomImage,
  type RoomImageFile,
  roomImageExt,
  serializeCharacterClipboard,
} from '@/ccfolia';
import { safeFileName, uniqueFileName, zipFiles } from '@/core/files';
import { clampSize, MAX_PIECES, type PieceParam, type PieceStatus } from './model';

/** 要放進 ZIP 的一張圖（同一個 key 只算一次雜湊、只放一個檔） */
export interface OutImage {
  key: string;
  bytes: Uint8Array;
  type: string;
}

/** 匯出用的一個棋子（全體設定已經套用、共用的聊天面板已經接上） */
export interface OutPiece {
  name: string;
  memo: string;
  initiative: number;
  externalUrl: string;
  status: readonly PieceStatus[];
  params: readonly PieceParam[];
  commands: string;
  color: string;
  size: number;
  active: boolean;
  secret: boolean;
  invisible: boolean;
  hideStatus: boolean;
  image: OutImage | null;
  /** 有圖的差分（沒有圖的不匯出） */
  faces: readonly { label: string; image: OutImage }[];
}

export interface BuildOptions {
  /** 匯出的時間（毫秒；order 的基準） */
  now?: number;
  /** 棋子的 ID（預設 newRoomEntityId） */
  newId?: () => string;
  /** .token（預設共用層的亂數） */
  token?: string;
  /** ZIP 的檔案時間（測試用；固定時輸出逐位元組相同） */
  mtime?: Date;
}

export interface BuiltPiecesZip {
  bytes: Uint8Array<ArrayBuffer>;
  data: CcfoliaAppendRoomData;
  /** ZIP 裡的圖片檔名（依第一次用到的順序） */
  files: string[];
}

/** 放到盤面的棋子一列幾個 */
export const BOARD_PER_ROW = 8;

/**
 * 放到盤面的棋子的位置（px，原點是盤面的中心）：依序橫向排開、8 個一列，下一列從上一列最高的棋子下面開始。
 * 只放進角色清單的回傳 null（用共用層的待機位置）。
 */
export function boardPositions(
  list: readonly Pick<OutPiece, 'active' | 'size'>[],
): ({ x: number; y: number } | null)[] {
  let inRow = 0;
  let rowX = 0;
  let rowY = 0;
  let rowHeight = 0;
  return list.map((c) => {
    if (!c.active) return null;
    const size = clampSize(c.size);
    if (inRow === BOARD_PER_ROW) {
      rowY += rowHeight;
      rowX = 0;
      rowHeight = 0;
      inRow = 0;
    }
    const at = { x: rowX * GRID_PX, y: rowY * GRID_PX };
    rowX += size;
    rowHeight = Math.max(rowHeight, size);
    inRow++;
    return at;
  });
}

/**
 * 棋子 → 只有角色的房間 ZIP（只追加：room 是 `{}`）：characters 一個棋子一筆（order＝匯出當下的秒數＋序號），
 * 圖片以內容的 SHA-256 命名、同一張只放一次。超過 500 個時丟錯。
 */
export async function buildPiecesZip(
  list: readonly OutPiece[],
  { now = Date.now(), newId = newRoomEntityId, token, mtime }: BuildOptions = {},
): Promise<BuiltPiecesZip> {
  if (list.length > MAX_PIECES) throw new Error(`too many pieces (${list.length} > ${MAX_PIECES})`);
  const packed = new Map<string, RoomImageFile>();
  const files: string[] = [];
  const fileName = async (img: OutImage | null): Promise<string | null> => {
    if (!img) return null;
    let f = packed.get(img.key);
    if (!f) {
      f = await packRoomImage(img.bytes, img.type);
      packed.set(img.key, f);
      if (!files.includes(f.name)) files.push(f.name);
    }
    return f.name;
  };
  /* 以秒為基準：之後讀入的排在先前讀入的後面 */
  const base = Math.floor(now / 1000);
  const at = boardPositions(list);
  const characters: Record<string, CcfoliaRoomCharacter> = {};
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const size = clampSize(c.size);
    const faces = [];
    for (const f of c.faces) {
      const iconUrl = await fileName(f.image);
      if (iconUrl) faces.push({ label: f.label, iconUrl });
    }
    characters[newId()] = createRoomCharacter({
      name: c.name,
      memo: c.memo,
      initiative: Number.isFinite(c.initiative) ? c.initiative : 0,
      externalUrl: c.externalUrl,
      status: c.status.map((s) => ({ label: s.label, value: s.value, max: s.max })),
      params: c.params
        .filter((p) => p.label || p.value)
        .map((p) => ({ label: p.label, value: p.value })),
      iconUrl: await fileName(c.image),
      faces,
      ...(at[i] ?? {}),
      width: size,
      height: size,
      active: c.active,
      secret: c.secret,
      invisible: c.invisible,
      hideStatus: c.hideStatus,
      color: isCharacterColor(c.color) ? c.color : CHARACTER_DEFAULT_COLOR,
      commands: c.commands,
      order: base + i,
    });
  }
  const built = buildRoomZip(createAppendRoomData({ characters }), packed.values(), {
    token,
    ...(mtime ? { mtime } : {}),
  });
  return { bytes: built.bytes, data: built.data, files };
}

/* ---------- 素材 ZIP（規格 3.8） ---------- */

export interface AssetsInput {
  /** 依清單順序：棋子的名稱（立繪的名稱優先）、立繪、差分 */
  pieces: readonly {
    base: string;
    portrait: OutImage | null;
    faces: readonly { label: string; image: OutImage }[];
  }[];
  /** 圖片庫的所有圖（棋子沒用到的放「其他」） */
  shelf: readonly (OutImage & { name: string })[];
}

export interface AssetsText {
  folders: { portrait: string; face: string; other: string };
  noName: string;
  faceFallback: string;
  imageFallback: string;
}

/** 素材 ZIP 的副檔名（看檔的人用：JPEG 是 jpg） */
const assetExt = (type: string): string =>
  type === 'image/jpeg' ? 'jpg' : (roomImageExt(type) ?? 'png');

/**
 * 圖片庫的圖以棋子的名稱命名：「立繪/名稱.png」「差分/名稱_差分.png」，沒用到的「其他/圖片名稱.png」。
 * 同一張圖只放第一次用到的地方；同名（不分大小寫）時加「_2」「_3」。只打包不壓縮。
 */
export function buildAssetsZip(
  input: AssetsInput,
  T: AssetsText,
  { mtime }: { mtime?: Date } = {},
): { bytes: Uint8Array<ArrayBuffer>; count: number } {
  const used = new Set<string>();
  const names = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  const put = (dir: string, base: string, im: OutImage | null) => {
    if (!im || used.has(im.key)) return;
    used.add(im.key);
    const stem = safeFileName(base, { fallback: T.imageFallback });
    const name = uniqueFileName(`${dir}/${stem}.${assetExt(im.type)}`, names);
    entries.push({ name, data: im.bytes });
  };
  for (const p of input.pieces) {
    const base = p.base || T.noName;
    put(T.folders.portrait, base, p.portrait);
    for (const f of p.faces) put(T.folders.face, `${base}_${f.label || T.faceFallback}`, f.image);
  }
  for (const im of input.shelf) put(T.folders.other, im.name, im);
  return {
    bytes: entries.length
      ? zipFiles(entries, { level: 0, ...(mtime ? { mtime } : {}) })
      : new Uint8Array(),
    count: entries.length,
  };
}

/* ---------- 角色剪貼簿 JSON（規格 3.9） ---------- */

/** 剪貼簿 JSON 輸出的欄位與順序（圖片帶不了：沒有 iconUrl、faces） */
export const CLIPBOARD_FIELDS = Object.freeze([
  'name',
  'memo',
  'initiative',
  'externalUrl',
  'status',
  'params',
  'width',
  'height',
  'active',
  'secret',
  'invisible',
  'hideStatus',
  'color',
  'commands',
] as const);

/** 一個棋子的 CCFOLIA 角色剪貼簿 JSON（在 CCFOLIA 的房間貼上就新增這個角色；2 格縮排） */
export function pieceClipboard(c: Omit<OutPiece, 'image' | 'faces'>): string {
  const size = clampSize(c.size);
  return serializeCharacterClipboard(
    {
      name: c.name,
      memo: c.memo,
      initiative: c.initiative,
      externalUrl: c.externalUrl,
      status: c.status.map((s) => ({ ...s })),
      params: c.params.filter((p) => p.label || p.value).map((p) => ({ ...p })),
      width: size,
      height: size,
      active: c.active,
      secret: c.secret,
      invisible: c.invisible,
      hideStatus: c.hideStatus,
      color: isCharacterColor(c.color) ? c.color : CHARACTER_DEFAULT_COLOR,
      commands: c.commands,
    },
    { fields: CLIPBOARD_FIELDS },
  );
}
