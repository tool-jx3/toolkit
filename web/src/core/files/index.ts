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
