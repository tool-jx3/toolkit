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
}

/**
 * 把使用者輸入（角色名、標題…）變成各作業系統都能用的檔名主體（不含副檔名）。
 * - 拿掉 \ / : * ? " < > | 與控制字元，換成「_」；
 * - 連續空白合併，去掉頭尾的空白與「.」；
 * - 避開 Windows 保留名稱（CON、NUL、COM1…）；
 * - 中文、日文、韓文與 emoji 都保留。
 */
export function safeFileName(
  name: string,
  { fallback = 'untitled', maxLength = 80 }: SafeFileNameOptions = {},
): string {
  let s = String(name ?? '')
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
