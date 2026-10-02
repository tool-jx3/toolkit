/**
 * 嵌入原稿的字型（F224～F226、2.3）：讀字型檔、TTC 選一個字體、取名稱、嵌入權限（fsType）的提醒。
 */
import {
  extractTtcFace,
  fsTypeRestriction,
  readFontNames,
  readFontNamesAt,
  readFsType,
  ttcFaceOffsets,
} from '@/core/fonts';
import type { EmbeddedFont } from './model/types';

export const FONT_FILE_MAX = 40 * 1024 * 1024;
export const FONT_DATA_MAX = 24 * 1024 * 1024;
export const FONT_ACCEPT = '.ttf,.otf,.ttc,.otc,.woff,.woff2';

export class FontAddError extends Error {
  override name = 'FontAddError';
}

const RESTRICTION_TEXT = {
  restricted: '這個字型不允許嵌入（授權限制），請確認授權後再發布匯出的檔案。',
  preview: '這個字型只允許「預覽與列印」的嵌入，請確認授權後再發布。',
  bitmap: '這個字型只允許嵌入點陣圖，請確認授權。',
} as const;

/** 從名稱做出 CSS 能用的名稱，重名時加「-2」「-3」… */
export function uniqueFontName(raw: string, used: readonly string[]): string {
  const base =
    String(raw || 'font')
      .replace(/\.[^.]+$/, '')
      .replace(/["'\\]/g, '')
      .trim() || 'font';
  let name = base;
  let i = 2;
  while (used.includes(name)) {
    name = `${base}-${i}`;
    i++;
  }
  return name;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

export interface FontFace {
  index: number;
  name: string;
}

/** TTC／OTC 裡的字體（不是集合時 null） */
export function ttcFaces(bytes: Uint8Array): FontFace[] | null {
  const offs = ttcFaceOffsets(bytes);
  if (!offs) return null;
  return offs.map((o, i) => ({
    index: i,
    name: readFontNamesAt(bytes, o)?.family || `字體 ${i + 1}`,
  }));
}

export interface AddedFont {
  font: EmbeddedFont;
  /** 嵌入權限的提醒（沒有限制時空字串） */
  warn: string;
  sizeMb: number;
}

/**
 * 字型檔 → 嵌入用的字型。faceIndex：TTC 時取哪個字體（多個字體而沒給時丟錯）。
 * fallbackName：讀不到名稱時用（檔名）。
 */
export function fontFromBytes(
  bytes: Uint8Array,
  fallbackName: string,
  used: readonly string[],
  faceIndex?: number,
): AddedFont {
  let face = bytes;
  const offs = ttcFaceOffsets(bytes);
  if (offs) {
    if (offs.length > 1 && faceIndex == null) throw new FontAddError('請選擇要使用的字體。');
    face = extractTtcFace(bytes, offs[Math.max(0, Math.min(offs.length - 1, faceIndex ?? 0))]);
  }
  const nm = readFontNames(face)?.family || fallbackName;
  const r = fsTypeRestriction(readFsType(face));
  const data = `data:font/otf;base64,${base64(face)}`;
  const sizeMb = Math.round((data.length / 1024 / 1024) * 10) / 10;
  if (data.length > FONT_DATA_MAX)
    throw new FontAddError(`字型太大（${sizeMb} MB），無法嵌入。請改用較小的字型（24 MB 以內）。`);
  return {
    font: { name: uniqueFontName(nm, used), data },
    warn: r ? RESTRICTION_TEXT[r] : '',
    sizeMb,
  };
}

/** 讀電腦上的字型（Local Font Access）：優先 Regular／Medium */
export async function localFontBytes(family: string): Promise<Uint8Array> {
  const q = (
    window as unknown as {
      queryLocalFonts?: () => Promise<
        { family: string; style: string; blob: () => Promise<Blob> }[]
      >;
    }
  ).queryLocalFonts;
  if (typeof q !== 'function')
    throw new FontAddError('這個瀏覽器無法讀取電腦上的字型，請改用「從檔案新增」。');
  let list: { family: string; style: string; blob: () => Promise<Blob> }[];
  try {
    list = await q();
  } catch {
    throw new FontAddError('沒有取得讀取電腦字型的權限，請改用「從檔案新增」。');
  }
  const faces = list.filter((f) => f.family === family);
  const face = faces.find((f) => /regular|medium|^$/i.test(f.style || '')) ?? faces[0];
  if (!face) throw new FontAddError(`找不到字型「${family}」。`);
  try {
    return new Uint8Array(await (await face.blob()).arrayBuffer());
  } catch {
    throw new FontAddError(`無法讀出字型「${family}」的檔案，請改用「從檔案新增」。`);
  }
}
