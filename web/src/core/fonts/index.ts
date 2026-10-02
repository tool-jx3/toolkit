/**
 * core/fonts：字型目錄、按需載入（Google Fonts）、電腦字型、上傳字型（存 IndexedDB）。
 *
 * 畫到 canvas 之前一定要先 `await ensureFont(family, weight, text)`，否則第一次會用到備用字型。
 */
import { safeFileName } from '../files';
import { idbDel, idbGet, idbKeys, idbSet, idbStore } from '../storage/idb';
import { DEFAULT_FONT_FAMILY, findGoogleFont, googleFontCssUrl, nearestWeight } from './catalog';
import { readFontNames } from './sfnt';

export * from './catalog';
export {
  defineFontChoices,
  type FontChoice,
  type FontChoiceInput,
  pickFontChoice,
} from './choices';
export { type FontNames, readFontNames } from './sfnt';

export type FontSource = 'google' | 'local' | 'upload';

/** FontPicker 的值 */
export interface FontValue {
  source: FontSource;
  family: string;
  weight: number;
}

export const DEFAULT_FONT: FontValue = {
  source: 'google',
  family: DEFAULT_FONT_FAMILY,
  weight: 400,
};

/** 介面與畫布的備用字型堆疊（台灣常見的系統字型） */
export const FALLBACK_STACK =
  "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', system-ui, sans-serif";

/** CSS font-family 值：指定字型＋備用堆疊 */
export function fontFamilyCss(family: string): string {
  const name = family.replace(/["\\]/g, '');
  return `"${name}", ${FALLBACK_STACK}`;
}

/** canvas 的 ctx.font：fontCss({ family, weight }, 32) → '700 32px "Noto Sans TC", …' */
export function fontCss(
  value: Pick<FontValue, 'family' | 'weight'>,
  sizePx: number,
  style: 'normal' | 'italic' = 'normal',
): string {
  return `${style === 'italic' ? 'italic ' : ''}${value.weight} ${sizePx}px ${fontFamilyCss(value.family)}`;
}

/* ---------- Google Fonts ---------- */

const loadedSheets = new Map<string, Promise<void>>();

function injectStylesheet(href: string): Promise<void> {
  let p = loadedSheets.get(href);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.toolkitFont = '';
      /* 網路失敗也不要讓工具卡住：改用備用字型 */
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    loadedSheets.set(href, p);
  }
  return p;
}

export interface EnsureFontOptions {
  /** 最多等幾毫秒（預設 8000）；逾時就先用備用字型 */
  timeoutMs?: number;
  style?: 'normal' | 'italic';
}

/**
 * 確保字型可用（按需載入）。
 * - Google Fonts：插入 css2 樣式表（同一字型只插一次），再用 document.fonts.load 載入實際用到的字。
 *   中日韓字型被切成很多小檔（unicode-range），傳入 text 只會下載這些字需要的部分。
 * - 電腦字型、上傳字型：等 document.fonts.load。
 * 回傳字型是否確實可用（false 表示會用備用字型）。
 */
export async function ensureFont(
  family: string,
  weight = 400,
  text?: string,
  { timeoutMs = 8000, style = 'normal' }: EnsureFontOptions = {},
): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const entry = findGoogleFont(family);
  const work = (async () => {
    if (entry) await injectStylesheet(googleFontCssUrl(entry.family));
    else if (!restoredOnce) await registerUploadedFonts().catch(() => []);
    const spec = `${style === 'italic' ? 'italic ' : ''}${weight} 16px "${(entry?.family ?? family).replace(/"/g, '')}"`;
    const faces = await document.fonts.load(spec, text || '永Aa');
    return faces.length > 0 || document.fonts.check(spec, text || '永Aa');
  })();
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return false;
  }
}

/** 一次確保多組字型（例如一個版面用到的所有文字） */
export function ensureFonts(
  list: readonly { family: string; weight?: number; text?: string }[],
): Promise<boolean[]> {
  return Promise.all(list.map((f) => ensureFont(f.family, f.weight ?? 400, f.text)));
}

const previewLoaded = new Map<string, Promise<string>>();

/** 字型清單的預覽用 family 名稱 */
export const previewFamily = (family: string): string => `TK Preview ${family}`;

/**
 * 載入「只含少數字」的預覽字型（Google Fonts 的 text= 子集，很小）。
 * 以另一個名稱註冊，不會干擾正式載入的完整字型。回傳可直接用在 CSS 的 family 名稱。
 */
export function loadPreviewFont(family: string, text: string): Promise<string> {
  const key = `${family}\n${text}`;
  let p = previewLoaded.get(key);
  if (!p) {
    p = (async () => {
      const alias = previewFamily(family);
      try {
        const entry = findGoogleFont(family);
        const weight = entry ? nearestWeight(entry.weights, 400) : 400;
        const css = await (await fetch(googleFontCssUrl(family, [weight], text))).text();
        const renamed = css.replace(/font-family:\s*'[^']*'/g, `font-family: '${alias}'`);
        const style = document.createElement('style');
        style.dataset.toolkitPreviewFont = family;
        style.textContent = renamed;
        document.head.appendChild(style);
        await document.fonts.load(`16px "${alias}"`, text);
      } catch {
        /* 預覽失敗就用備用字型顯示 */
      }
      return alias;
    })();
    previewLoaded.set(key, p);
  }
  return p;
}

/* ---------- 電腦字型 ---------- */

interface LocalFontData {
  family: string;
  fullName: string;
  style: string;
  postscriptName: string;
}

/** 瀏覽器支援列出電腦字型（Chromium 的 Local Font Access API） */
export function canQueryLocalFonts(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

/** 列出電腦上的字型家族（會跳出權限詢問；必須在使用者點擊時呼叫） */
export async function queryLocalFamilies(): Promise<string[]> {
  if (!canQueryLocalFonts()) throw new Error('這個瀏覽器不支援列出電腦字型，請手動輸入字型名稱。');
  const list =
    (await (
      window as unknown as { queryLocalFonts: () => Promise<LocalFontData[]> }
    ).queryLocalFonts()) ?? [];
  return [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'zh-Hant-TW'));
}

/** 電腦上的一個字型家族（同一家族只列一次） */
export interface LocalFontFamily {
  family: string;
  /** 這個家族各樣式的完整名稱（搜尋用） */
  fullNames: string[];
}

/**
 * 讀不到電腦字型清單的原因：
 * unsupported：瀏覽器不支援（Firefox、Safari、手機）；insecure：頁面無法讀取（例如以本機檔案開啟）；
 * denied：使用者拒絕權限；empty：回傳空清單（通常也是權限被擋）；failed：其他錯誤。
 */
export type LocalFontErrorKind = 'unsupported' | 'insecure' | 'denied' | 'empty' | 'failed';

export class LocalFontError extends Error {
  readonly kind: LocalFontErrorKind;
  constructor(kind: LocalFontErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'LocalFontError';
    this.kind = kind;
  }
}

let localFontCache: LocalFontFamily[] | null = null;

/** 已經讀過的電腦字型清單（沒讀過時 null）；讀過一次就留著，下次不再要求權限 */
export function cachedLocalFonts(): LocalFontFamily[] | null {
  return localFontCache;
}

/** 測試用：清掉快取 */
export function clearLocalFontCache(): void {
  localFontCache = null;
}

/**
 * 讀取電腦上的字型（依家族名稱排序、同一家族只列一次）。第一次呼叫時瀏覽器會詢問權限，
 * 必須在使用者點擊時呼叫。失敗時丟 LocalFontError（kind 說明原因）；成功的結果會留在快取。
 */
export async function queryLocalFontFamilies({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<LocalFontFamily[]> {
  if (localFontCache && !force) return localFontCache;
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:')
    throw new LocalFontError('insecure');
  if (!canQueryLocalFonts()) throw new LocalFontError('unsupported');
  let list: LocalFontData[];
  try {
    list =
      (await (
        window as unknown as { queryLocalFonts: () => Promise<LocalFontData[]> }
      ).queryLocalFonts()) ?? [];
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === 'SecurityError' || name === 'NotAllowedError') throw new LocalFontError('denied');
    throw new LocalFontError('failed', e instanceof Error ? e.message : String(e));
  }
  if (!list.length) throw new LocalFontError('empty');
  const map = new Map<string, Set<string>>();
  for (const f of list) {
    if (!f.family) continue;
    let set = map.get(f.family);
    if (!set) {
      set = new Set();
      map.set(f.family, set);
    }
    if (f.fullName) set.add(f.fullName);
  }
  localFontCache = [...map.entries()]
    .map(([family, names]) => ({ family, fullNames: [...names] }))
    .sort((a, b) => a.family.localeCompare(b.family, 'zh-Hant-TW'));
  return localFontCache;
}

/**
 * 搜尋電腦字型：以空白分隔多個關鍵字，全部都要符合（不分大小寫，比對家族名稱與完整名稱）。
 */
export function filterLocalFonts(
  list: readonly LocalFontFamily[],
  query: string,
): LocalFontFamily[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((f) => {
    const hay = [f.family, ...f.fullNames].join('\n').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * 粗略判斷電腦上有沒有這個字型：用它畫一段字，寬度和三種通用字型都一樣就當作沒有。
 * （document.fonts.check 對系統字型永遠回傳 true，不能用）
 */
export function isLocalFontAvailable(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  const sample = 'mmmmmmmmmwwwwwwwlli 永和九年 あいう 가나다';
  const name = family.replace(/"/g, '');
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `48px ${base}`;
    const w0 = ctx.measureText(sample).width;
    ctx.font = `48px "${name}", ${base}`;
    return ctx.measureText(sample).width !== w0;
  });
}

/* ---------- 上傳字型（IndexedDB） ---------- */

export interface UploadedFont {
  id: string;
  /** 註冊到 document.fonts 的名稱 */
  family: string;
  fileName: string;
  size: number;
  addedAt: number;
}

export const FONT_FILE_ACCEPT =
  '.ttf,.otf,.ttc,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';

const fontDb = () => idbStore('fonts');
const uploadedFamilies = new Map<string, FontFace>();

function registerFace(meta: UploadedFont, data: ArrayBuffer): Promise<FontFace> {
  const face = new FontFace(meta.family, data, { display: 'swap' });
  return face.load().then((f) => {
    document.fonts.add(f);
    uploadedFamilies.set(meta.id, f);
    return f;
  });
}

/**
 * 上傳字型：讀出字型名稱、註冊到頁面、存進 IndexedDB（下次開啟自動恢復）。
 * 名稱讀不出來時用檔名。
 */
export async function uploadFont(file: File): Promise<UploadedFont> {
  const data = await file.arrayBuffer();
  const names = readFontNames(new Uint8Array(data));
  const base = safeFileName(file.name.replace(/\.[^.]+$/, ''), { fallback: '上傳字型' });
  const existing = await listUploadedFonts();
  let family = names?.family || base;
  /* 避免和已上傳的字型同名（不同檔案） */
  if (existing.some((f) => f.family === family && f.fileName !== file.name))
    family = `${family}（${base}）`;
  const meta: UploadedFont = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    family,
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
  };
  try {
    await registerFace(meta, data);
  } catch {
    throw new Error(`「${file.name}」不是可用的字型檔。`);
  }
  const old = existing.find((f) => f.fileName === file.name && f.family === family);
  if (old) await removeUploadedFont(old.id);
  await idbSet(`meta:${meta.id}`, meta, fontDb());
  await idbSet(`data:${meta.id}`, data, fontDb());
  return meta;
}

/** 已上傳的字型（依上傳時間排序） */
export async function listUploadedFonts(): Promise<UploadedFont[]> {
  try {
    const keys = (await idbKeys(fontDb())).filter(
      (k): k is string => typeof k === 'string' && k.startsWith('meta:'),
    );
    const metas = await Promise.all(keys.map((k) => idbGet<UploadedFont>(k, fontDb())));
    return metas.filter((m): m is UploadedFont => !!m).sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return [];
  }
}

export async function removeUploadedFont(id: string): Promise<void> {
  const face = uploadedFamilies.get(id);
  if (face) {
    document.fonts.delete(face);
    uploadedFamilies.delete(id);
  }
  await idbDel(`meta:${id}`, fontDb());
  await idbDel(`data:${id}`, fontDb());
}

let restoring: Promise<UploadedFont[]> | null = null;
let restoredOnce = false;

/** 把 IndexedDB 裡的上傳字型全部註冊到頁面（頁面開啟時呼叫一次即可；重複呼叫無妨） */
export function registerUploadedFonts(): Promise<UploadedFont[]> {
  if (!restoring) {
    restoring = (async () => {
      const metas = await listUploadedFonts();
      await Promise.all(
        metas
          .filter((m) => !uploadedFamilies.has(m.id))
          .map(async (m) => {
            const data = await idbGet<ArrayBuffer>(`data:${m.id}`, fontDb());
            if (data) await registerFace(m, data).catch(() => undefined);
          }),
      );
      return metas;
    })().finally(() => {
      restoring = null;
      restoredOnce = true;
    });
  }
  return restoring;
}
