/**
 * 輸出（不依賴 React）：劇本文字 → CCFOLIA 房間 ZIP（規格 3.1），用到的圖片打包（3.7）。
 * 房間 ZIP 一律經過共用層 `@/ccfolia`（createAppendRoomData、createNote、packRoomImage、buildRoomZip）。
 */
import {
  buildRoomZip,
  type CcfoliaAppendRoomData,
  type CcfoliaNote,
  createAppendRoomData,
  createNote,
  newRoomEntityId,
  packRoomImage,
  type RoomImageFile,
  roomImageExt,
} from '@/ccfolia';
import { zipFiles } from '@/core/files';
import { sizeText } from './model';

/** 一則劇本文字的圖：網址、或檔案（同一個 key 只算一次雜湊、只放一個檔） */
export type NoteImage =
  | null
  | { kind: 'url'; url: string }
  | { kind: 'file'; key: string; bytes: Uint8Array; type: string };

export interface NoteInput {
  title: string;
  text: string;
  image: NoteImage;
}

export interface BuildOptions {
  /** 匯出的時間（毫秒；order 的基準） */
  now?: number;
  /** 劇本文字的 ID（預設 newRoomEntityId） */
  newId?: () => string;
  /** .token（預設共用層的亂數） */
  token?: string;
  /** ZIP 的檔案時間（測試用；固定時輸出逐位元組相同） */
  mtime?: Date;
}

export interface BuiltScenarioZip {
  bytes: Uint8Array<ArrayBuffer>;
  data: CcfoliaAppendRoomData;
  /** ZIP 裡的圖片檔名（依第一次用到的順序） */
  files: string[];
}

/**
 * 劇本文字 → 房間 ZIP：notes 一則一筆（order＝匯出當下的秒數＋序號），room 是 `{}`（只追加）。
 * 檔案的圖以內容的 SHA-256 命名（packRoomImage），同一張只放一次；不是四種格式時丟錯。
 */
export async function buildScenarioZip(
  list: readonly NoteInput[],
  { now = Date.now(), newId = newRoomEntityId, token, mtime }: BuildOptions = {},
): Promise<BuiltScenarioZip> {
  const packed = new Map<string, RoomImageFile>();
  const files: string[] = [];
  const iconUrl = async (img: NoteImage): Promise<string> => {
    if (!img) return '';
    if (img.kind === 'url') return img.url || '';
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
  const notes: Record<string, CcfoliaNote> = {};
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    notes[newId()] = createNote({
      name: e.title || '',
      text: e.text || '',
      iconUrl: await iconUrl(e.image),
      order: base + i,
    });
  }
  const built = buildRoomZip(createAppendRoomData({ notes }), packed.values(), {
    token,
    ...(mtime ? { mtime } : {}),
  });
  return { bytes: built.bytes, data: built.data, files };
}

/* ---------- 打包圖片（規格 3.7） ---------- */

export interface BundleImage {
  name: string;
  credit: string;
  /** 用在：標題 → 次數 */
  use: Map<string, number> | undefined;
  /** 網址的圖 */
  url?: string;
  /** 檔案的內容（找不到時 null；網址的圖不給） */
  file?: { bytes: Uint8Array; type: string; size: number; hash: string } | null;
}

export interface BundleText {
  title: string;
  created: (date: string) => string;
  count: (n: number, all: boolean) => string;
  folderNote: string;
  hashNote: string;
  size: (size: string, type: string) => string;
  tooBig: string;
  hash: (name: string) => string;
  credit: (credit: string) => string;
  noCredit: string;
  usedIn: (where: string) => string;
  unused: string;
  more: (n: number) => string;
  list: (parts: string[]) => string;
  url: (url: string) => string;
  urlImage: string;
  missing: string;
  fallbackName: string;
  dup: (n: number) => string;
  listFile: string;
}

/** 「標題 ×次數」最多 8 種，超過加「、還有 n 種」 */
export function usedText(use: Map<string, number> | undefined, T: BundleText): string {
  if (!use?.size) return T.unused;
  const parts = [...use].map(([title, n]) => `${title} ×${n}`);
  return parts.length > 8
    ? `${T.list(parts.slice(0, 8))}${T.more(parts.length - 8)}`
    : T.list(parts);
}

/** 打包用的檔名：把 \ / : * ? " < > | 與控制字元換成 _、去頭尾空白；空白時 fallback */
export function bundleFileName(name: string, fallback: string): string {
  const out = Array.from(String(name || ''), (c) =>
    c.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(c) ? '_' : c,
  ).join('');
  return out.trim() || fallback;
}

export interface BuiltBundle {
  bytes: Uint8Array<ArrayBuffer>;
  /** 放進 ZIP 的圖片張數 */
  files: number;
  urls: number;
  lost: number;
  text: string;
}

/** 用到的圖片（或圖片庫全部）打包成 `images/…`＋清單文字檔（CRLF） */
export function buildImageBundle(
  list: readonly BundleImage[],
  { all, date, T, mtime }: { all: boolean; date: string; T: BundleText; mtime?: Date },
): BuiltBundle {
  const taken = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  const lines = [T.title, T.created(date), T.count(list.length, all), T.folderNote, T.hashNote, ''];
  let files = 0;
  let urls = 0;
  let lost = 0;
  list.forEach((im, i) => {
    const n = i + 1;
    const credit = T.credit(im.credit || T.noCredit);
    const where = T.usedIn(usedText(im.use, T));
    if (im.url !== undefined) {
      urls++;
      lines.push(`[${n}] ${im.name}${T.urlImage}`, T.url(im.url), credit, where, '');
      return;
    }
    if (!im.file) {
      lost++;
      lines.push(`[${n}] ${im.name}${T.missing}`, credit, where, '');
      return;
    }
    const ext = roomImageExt(im.file.type) ?? 'png';
    const base = bundleFileName(im.name, T.fallbackName);
    let name = base;
    for (let k = 2; taken.has(`${name}.${ext}`.toLowerCase()); k++) name = `${base}${T.dup(k)}`;
    taken.add(`${name}.${ext}`.toLowerCase());
    entries.push({ name: `images/${name}.${ext}`, data: im.file.bytes });
    files++;
    lines.push(
      `[${n}] images/${name}.${ext}`,
      T.size(sizeText(im.file.size), im.file.type) +
        (im.file.size > 5 * 1024 * 1024 ? T.tooBig : ''),
    );
    if (im.file.hash) lines.push(T.hash(`${im.file.hash}.${ext}`));
    lines.push(credit, where, '');
  });
  const text = lines.join('\r\n');
  entries.push({ name: T.listFile, data: new TextEncoder().encode(text) });
  return {
    bytes: zipFiles(entries, { level: 0, ...(mtime ? { mtime } : {}) }),
    files,
    urls,
    lost,
    text,
  };
}
