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
import { clampPieceSize, MAX_PIECES, type PieceParam, type PieceStatus } from './model';

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
  const spots: ({ x: number; y: number } | null)[] = list.map(() => null);
  const shown = list.flatMap((c, index) =>
    c.active ? [{ index, cells: clampPieceSize(c.size) }] : [],
  );
  let top = 0;
  for (let first = 0; first < shown.length; first += BOARD_PER_ROW) {
    const row = shown.slice(first, first + BOARD_PER_ROW);
    let left = 0;
    for (const { index, cells } of row) {
      spots[index] = { x: left * GRID_PX, y: top * GRID_PX };
      left += cells;
    }
    top += Math.max(...row.map((r) => r.cells));
  }
  return spots;
}

/** 房間 ZIP 與剪貼簿共用的欄位（大小限制在範圍內、顏色不對時用預設、空的參數不放） */
function characterFields(c: Omit<OutPiece, 'image' | 'faces'>) {
  const cells = clampPieceSize(c.size);
  return {
    name: c.name,
    memo: c.memo,
    commands: c.commands,
    externalUrl: c.externalUrl,
    initiative: Number.isFinite(c.initiative) ? c.initiative : 0,
    color: isCharacterColor(c.color) ? c.color : CHARACTER_DEFAULT_COLOR,
    width: cells,
    height: cells,
    status: c.status.map(({ label, value, max }) => ({ label, value, max })),
    params: c.params
      .filter((p) => p.label !== '' || p.value !== '')
      .map(({ label, value }) => ({ label, value })),
    active: c.active,
    secret: c.secret,
    invisible: c.invisible,
    hideStatus: c.hideStatus,
  };
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
  /** 圖 → ZIP 裡的檔名（第一次用到時打包） */
  const packOnce = async (img: OutImage | null): Promise<string | null> => {
    if (img === null) return null;
    const known = packed.get(img.key);
    if (known) return known.name;
    const file = await packRoomImage(img.bytes, img.type);
    packed.set(img.key, file);
    if (!files.includes(file.name)) files.push(file.name);
    return file.name;
  };
  const positions = boardPositions(list);
  /* order 以秒為基準：之後讀入的排在先前讀入的後面 */
  const firstOrder = Math.floor(now / 1000);
  const characters: Record<string, CcfoliaRoomCharacter> = {};
  for (const [index, c] of list.entries()) {
    const faces: { label: string; iconUrl: string }[] = [];
    for (const { label, image } of c.faces) {
      const iconUrl = await packOnce(image);
      if (iconUrl !== null) faces.push({ label, iconUrl });
    }
    const iconUrl = await packOnce(c.image);
    characters[newId()] = createRoomCharacter({
      ...characterFields(c),
      ...positions[index],
      iconUrl,
      faces,
      order: firstOrder + index,
    });
  }
  const room = createAppendRoomData({ characters });
  const built = buildRoomZip(room, packed.values(), { token, ...(mtime ? { mtime } : {}) });
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
  const addOnce = (dir: string, base: string, im: OutImage | null) => {
    if (!im || used.has(im.key)) return;
    used.add(im.key);
    const stem = safeFileName(base, { fallback: T.imageFallback });
    const name = uniqueFileName(`${dir}/${stem}.${assetExt(im.type)}`, names);
    entries.push({ name, data: im.bytes });
  };
  for (const p of input.pieces) {
    const base = p.base || T.noName;
    addOnce(T.folders.portrait, base, p.portrait);
    for (const f of p.faces)
      addOnce(T.folders.face, `${base}_${f.label || T.faceFallback}`, f.image);
  }
  for (const im of input.shelf) addOnce(T.folders.other, im.name, im);
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
  return serializeCharacterClipboard(characterFields(c), { fields: CLIPBOARD_FIELDS });
}
