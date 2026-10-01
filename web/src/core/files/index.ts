/**
 * 檔案：下載、讀檔、選檔、ZIP（fflate）、檔名規則、大小格式。
 */
import { strToU8, unzipSync, type Zippable, zipSync } from 'fflate';

/* ---------- 下載 ---------- */

/** 讓瀏覽器下載一個 Blob。物件網址一分鐘後才釋放，避免部分瀏覽器還沒開始下載就失效。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 下載 data: 或 blob: 網址 */
export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 下載 dataURL（例如 canvas.toDataURL() 的結果） */
export const downloadDataUrl = downloadUrl;

/** 下載位元組 */
export function downloadBytes(
  bytes: Uint8Array,
  fileName: string,
  mime = 'application/octet-stream',
): void {
  downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), fileName);
}

/** 下載文字（JSON、CSS…），預設 UTF-8 */
export function downloadText(
  text: string,
  fileName: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}

export interface SequentialDownloadItem {
  /** 下載的檔名 */
  name: string;
  /** 檔案內容；可以是函式（輪到這個檔案時才產生，例如下載時才編碼） */
  blob: Blob | (() => Promise<Blob>);
}

export interface SequentialDownloadOptions {
  /** 兩個下載之間至少間隔幾毫秒（預設 500，避免瀏覽器擋下連續下載） */
  intervalMs?: number;
  signal?: AbortSignal;
  /** 輪到某個檔案時呼叫（準備內容之前；index 從 0 開始） */
  onProgress?: (index: number, total: number, item: SequentialDownloadItem) => void;
  /** 實際的下載動作（預設 downloadBlob；測試可替換） */
  download?: (blob: Blob, name: string) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 一個接一個下載多個檔案（不打包），兩個下載之間至少間隔 intervalMs。
 * 下一個檔案的內容在等待間隔時就先準備，所以間隔不會因為產生檔案而拉長（除非產生得比間隔還久）。
 * 取消時丟出 signal.reason（AbortError）。回傳實際下載的檔案（產生內容後的 Blob 與檔名）。
 */
export async function downloadSequentially(
  items: readonly SequentialDownloadItem[],
  { intervalMs = 500, signal, onProgress, download = downloadBlob }: SequentialDownloadOptions = {},
): Promise<{ name: string; blob: Blob }[]> {
  const done: { name: string; blob: Blob }[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < items.length; i++) {
    signal?.throwIfAborted();
    const item = items[i];
    onProgress?.(i, items.length, item);
    const blob = typeof item.blob === 'function' ? await item.blob() : item.blob;
    signal?.throwIfAborted();
    const wait = last + intervalMs - performance.now();
    if (wait > 0) await sleep(wait, signal);
    download(blob, item.name);
    last = performance.now();
    done.push({ name: item.name, blob });
  }
  return done;
}

/* ---------- 讀檔與選檔 ---------- */

export const readAsText = (file: Blob): Promise<string> => file.text();
export const readAsArrayBuffer = (file: Blob): Promise<ArrayBuffer> => file.arrayBuffer();
export async function readAsBytes(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await file.arrayBuffer());
}
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('讀檔失敗'));
    reader.readAsDataURL(file);
  });
}

export interface PickFilesOptions {
  /** 例如 'image/*'、'.json,application/json' */
  accept?: string;
  multiple?: boolean;
}

/** 開啟選檔視窗。使用者取消時回傳空陣列。必須在使用者操作（點擊）的事件裡呼叫。 */
export function pickFiles({ accept, multiple = false }: PickFilesOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** 檔案是否符合 accept 字串（同 <input accept> 的規則：副檔名、MIME、萬用字元） */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

/* ---------- 剪貼簿 ---------- */

/**
 * 把文字放進剪貼簿（原封不動，含行尾空白與全形空白）。成功回傳 true。
 * 優先用 Clipboard API；不能用時（http、舊瀏覽器）改用隱藏的 textarea＋execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 改用備用方法 */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export type CopyImageFailure = 'unsupported' | 'denied' | 'encode' | 'failed';

export type CopyImageResult =
  | { ok: true }
  | { ok: false; reason: CopyImageFailure; error?: unknown };

/** 不是 PNG 的圖片先轉成 PNG（剪貼簿只保證支援 image/png） */
async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')?.drawImage(bmp, 0, 0);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('無法轉成 PNG'))), 'image/png'),
  );
}

/**
 * 把圖片以 PNG 放進剪貼簿。內容可以是 Blob，或回傳 Blob 的 Promise（Safari 要在點擊當下就呼叫
 * clipboard.write，所以耗時的產生工作請傳 Promise 進來，不要先 await）。
 * 失敗時不丟錯，回傳原因：unsupported（瀏覽器不支援寫入圖片）、denied（沒有權限／不在使用者操作中）、
 * encode（轉 PNG 失敗）、failed（其他）。失敗時建議提示使用者改用下載。
 * ```ts
 * const r = await copyImage(canvasToBlob(canvas));
 * toast(r.ok ? { title: '已複製圖片' } : { title: '無法複製圖片，請改用「下載 PNG」', tone: 'warning' });
 * ```
 */
export async function copyImage(source: Blob | Promise<Blob>): Promise<CopyImageResult> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!clip?.write || !Item) return { ok: false, reason: 'unsupported' };
  let encodeError: unknown = null;
  const png = Promise.resolve(source)
    .then(toPngBlob)
    .catch((e) => {
      encodeError = e;
      throw e;
    });
  try {
    await clip.write([new Item({ 'image/png': png })]);
    return { ok: true };
  } catch (error) {
    if (encodeError) return { ok: false, reason: 'encode', error: encodeError };
    const name = (error as { name?: string } | null)?.name;
    return {
      ok: false,
      reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed',
      error,
    };
  }
}

/* ---------- ZIP ---------- */

export interface ZipEntry {
  /** ZIP 內的路徑（可含「/」子資料夾） */
  name: string;
  data: Uint8Array | string;
}

export interface ZipOptions {
  /** 壓縮等級 0～9。PNG／GIF／WebP 本身已壓過，用 0（只打包）最快。預設 6。 */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 檔案時間（預設現在）。固定這個值可以讓輸出逐位元組相同。 */
  mtime?: Date;
}

/** 打包成 ZIP（檔名以 UTF-8 存放） */
export function zipFiles(
  entries: readonly ZipEntry[],
  { level = 6, mtime = new Date() }: ZipOptions = {},
): Uint8Array<ArrayBuffer> {
  const tree: Zippable = {};
  for (const e of entries) {
    const data = typeof e.data === 'string' ? strToU8(e.data) : e.data;
    const name = e.name.replace(/^\/+/, '');
    if (!name) throw new Error('ZIP 內的檔名不可為空');
    if (name in tree) throw new Error(`ZIP 內有重複的檔名：${name}`);
    tree[name] = [data, { level, mtime }];
  }
  return zipSync(tree) as Uint8Array<ArrayBuffer>;
}

/** 解開 ZIP，回傳檔案清單（略過資料夾項目） */
export function unzipFiles(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const out = unzipSync(bytes);
  return Object.entries(out)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => ({ name, data }));
}

/* ---------- 檔名 ---------- */

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export interface SafeFileNameOptions {
  /** 清理後是空字串時用這個 */
  fallback?: string;
  /** 最多幾個字元（不含副檔名；以字元計，不切斷中文字） */
  maxLength?: number;
  /**
   * 底線模式（差分名、主名稱這類「接在檔名裡」的片段）：去掉頭尾空白 → 連續空白（含全形空白、換行）換成一個「_」
   * → 刪掉 \ / : * ? " < > |（不是換成 _）→ 連續的「_」合併成一個 → 去掉頭尾的「_」。
   * 例：「怒り/怒?」→「怒り怒」、「a  b__c_」→「a_b_c」、只有空白 → fallback。
   */
  underscore?: boolean;
}

/**
 * 把使用者輸入（角色名、標題…）變成各作業系統都能用的檔名主體（不含副檔名）。
 * - 拿掉 \ / : * ? " < > | 與控制字元，換成「_」；
 * - 連續空白合併，去掉頭尾的空白與「.」；
 * - 避開 Windows 保留名稱（CON、NUL、COM1…）；
 * - 中文、日文、韓文與 emoji 都保留。
 * `underscore: true` 時改用底線模式（見 SafeFileNameOptions）。
 */
export function safeFileName(
  name: string,
  { fallback = 'untitled', maxLength = 80, underscore = false }: SafeFileNameOptions = {},
): string {
  let s = underscore
    ? String(name ?? '')
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, '_')
        // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名裡的控制字元必須移除
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
    : String(name ?? '')
        .normalize('NFC')
        .replace(/[\t\n\r\v\f]/g, ' ')
        // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名裡的控制字元必須移除
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.]+|[\s.]+$/g, '');
  const chars = Array.from(s);
  if (chars.length > maxLength)
    s = chars
      .slice(0, maxLength)
      .join('')
      .replace(/[\s.]+$/g, '');
  if (!s || /^_+$/.test(s)) s = fallback;
  if (RESERVED.test(s.split('.')[0])) s = `_${s}`;
  return s;
}

/** 拆出副檔名（不含點，小寫） */
export function splitExtension(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf('.');
  if (i <= 0 || i === fileName.length - 1) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, i), ext: fileName.slice(i + 1).toLowerCase() };
}

export interface UniqueFileNameOptions {
  /** 序號前的分隔字元（預設「_」） */
  separator?: string;
  /** 第一個序號（預設 2：a.png、a_2.png、a_3.png…） */
  start?: number;
  /** 不分大小寫比對（Windows、macOS 的檔案系統不分大小寫；預設 true） */
  ignoreCase?: boolean;
}

/**
 * 不重複的檔名：name 沒被用過就原樣回傳；用過就在副檔名前加「_2」「_3」…，**加了之後再檢查**，直到不撞名。
 * 回傳的名稱會加進 used（同一個 Set 連續呼叫即可）。
 * ```ts
 * const used = new Set<string>();
 * ['a.png', 'a.png', 'a_2.png'].map((n) => uniqueFileName(n, used)); // a.png、a_2.png、a_2_2.png
 * ```
 */
export function uniqueFileName(
  name: string,
  used: Set<string>,
  { separator = '_', start = 2, ignoreCase = true }: UniqueFileNameOptions = {},
): string {
  const key = (s: string) => (ignoreCase ? s.toLowerCase() : s);
  const taken = (s: string) => {
    if (!ignoreCase) return used.has(s);
    const k = key(s);
    for (const u of used) if (key(u) === k) return true;
    return false;
  };
  let out = name;
  if (taken(out)) {
    const i = name.lastIndexOf('.');
    const base = i > 0 ? name.slice(0, i) : name;
    const ext = i > 0 ? name.slice(i) : '';
    for (let n = start; ; n++) {
      out = `${base}${separator}${n}${ext}`;
      if (!taken(out)) break;
    }
  }
  used.add(out);
  return out;
}

/** 安全檔名＋副檔名 */
export function fileNameWithExt(base: string, ext: string, options?: SafeFileNameOptions): string {
  const clean = safeFileName(base, options);
  const e = ext.replace(/^\./, '');
  return e ? `${clean}.${e}` : clean;
}

/** 連番檔名：frame_0001.png */
export function sequenceName(base: string, index: number, total: number, ext: string): string {
  const digits = Math.max(4, String(total).length);
  return `${base}_${String(index + 1).padStart(digits, '0')}.${ext}`;
}

/* ---------- 大小 ---------- */

/** CCFOLIA 等平台常見的上傳上限，超過時在結果卡提醒（保守取 5,000,000 位元組） */
export const SIZE_WARNING_BYTES = 5_000_000;

/** 1536 → "1.5 KB"（以 1024 為單位） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/**
 * 容量上限的顯示（匯出用途的「大小／上限」）：未滿 1,024 位元組「n B」；未滿 1,048,576「x.x KB」（一位小數）；
 * 其餘「x.xx MB」（兩位小數），以 1024 為單位。例：1,000,000 → 976.6 KB；8,000,000 → 7.63 MB。
 */
export function formatLimitBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/** 實際大小佔上限的百分比（四捨五入成整數） */
export const usagePercent = (bytes: number, maxBytes: number): number =>
  maxBytes > 0 ? Math.round((bytes / maxBytes) * 100) : 0;
