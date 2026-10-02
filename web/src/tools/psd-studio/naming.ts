/**
 * 檔案分流、名稱與尺寸的規則（psd-studio 規格 F06、F07、F09、F10、F94、F95、F101～F103、F82／F88、2.2、3.2～3.3）。純函式。
 */
import { uniqueFileName } from '@/core/files';

/** 圖片的副檔名（F06：瀏覽器沒回報圖片類型時，以副檔名判斷） */
export const IMAGE_EXT_RE = /\.(png|apng|jpg|jpeg|webp|gif)$/i;

export type Dispatch =
  | { kind: 'psd'; file: File }
  | { kind: 'zip'; file: File }
  | { kind: 'images'; files: File[] }
  | { kind: 'none' };

/**
 * F06：依順序逐一看檔名：遇到第一個 `.psd` 或 `.zip` 就只處理那一個；都沒有時收集所有圖片（類型是 image/*
 * 或副檔名是 png／apng／jpg／jpeg／webp／gif），其他檔案略過；一張圖片都沒有時 none。
 */
export function dispatchFiles(files: readonly Pick<File, 'name' | 'type'>[]): Dispatch {
  const images: File[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.psd')) return { kind: 'psd', file: f as File };
    if (lower.endsWith('.zip')) return { kind: 'zip', file: f as File };
    if ((f.type ?? '').startsWith('image/') || IMAGE_EXT_RE.test(f.name)) images.push(f as File);
  }
  return images.length ? { kind: 'images', files: images } : { kind: 'none' };
}

/** 選資料夾時的相對路徑（「資料夾名／子資料夾／檔名」）；一般選檔是檔名 */
export const relativePath = (f: Pick<File, 'name'> & { webkitRelativePath?: string }): string =>
  f.webkitRelativePath || f.name;

export const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** 去掉最後一個副檔名 */
export function stem(name: string): string {
  const b = basename(name);
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(0, dot) : b;
}

/** F07：原名＝資料夾載入時是最上層資料夾名，否則是第一個檔案去掉副檔名 */
export function originNameOf(
  first: (Pick<File, 'name'> & { webkitRelativePath?: string }) | undefined,
): string | null {
  if (!first) return null;
  const rel = relativePath(first);
  if (rel.includes('/')) return rel.split('/')[0] || null;
  return stem(first.name) || null;
}

/** F09、F10：ZIP／PSD 的原名＝檔名去掉 .zip／.psd */
export const containerOriginName = (fileName: string, ext: 'zip' | 'psd'): string =>
  fileName.replace(new RegExp(`\\.${ext}$`, 'i'), '');

/**
 * F07：同名（含路徑）時新的一張加上「_1」「_2」…（放在副檔名前，從 1 開始找第一個沒用過的）。used 會加入結果。
 */
export function uniqueAssetName(name: string, used: Set<string>): string {
  let out = name;
  if (used.has(out)) {
    const slash = name.lastIndexOf('/');
    const dot = name.lastIndexOf('.');
    const hasExt = dot > slash + 1;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : '';
    let n = 1;
    while (used.has(`${base}_${n}${ext}`)) n++;
    out = `${base}_${n}${ext}`;
  }
  used.add(out);
  return out;
}

/** F94：ZIP 檔名「原名_recolor.zip」；原名的 `\ / : * ? " < > |` 每一段連續的換成一個「_」 */
export function exportZipName(origin: string | null | undefined, fallback: string): string {
  const base = origin?.trim() ? origin.trim() : fallback;
  return `${base.replace(/[\\/:*?"<>|]+/g, '_')}_recolor.zip`;
}

/** 2.2：圖層名 → 檔名主體：`/ \ ? % * : | " < >` 每個換成「_」 */
export const psdLayerStem = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '_');

/**
 * PSD 每個圖層的素材檔名（2.2、3.3）：清理後＋`.png`；名稱空白時用 emptyName(序號)；
 * 同名的全部保留（第 7 節裁定），重名時 `_2`、`_3`…（uniqueFileName，不分大小寫）。
 * names 依清單順序（由上到下）；序號是在清單中的位置（1 起）。
 */
export function psdLayerFileNames(
  names: readonly string[],
  emptyName: (n: number) => string,
): string[] {
  const used = new Set<string>();
  return names.map((n, i) => {
    const label = n.trim() ? n : emptyName(i + 1);
    return uniqueFileName(`${psdLayerStem(label)}.png`, used);
  });
}

/**
 * F95＋第 7 節裁定：重新編碼成 PNG 的靜態圖，副檔名改成 .png（JPG、WebP、GIF…）；PNG、APNG 原名不變。
 * 保留資料夾路徑。
 */
export function pngOutputName(name: string): string {
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  const hasExt = dot > slash + 1;
  const ext = hasExt ? name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png' || ext === 'apng') return name;
  return `${hasExt ? name.slice(0, dot) : name}.png`;
}

/** 檔名所在的各層資料夾項目（`a/b/c.png` → `a/`、`a/b/`） */
export function folderEntries(path: string): string[] {
  const parts = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(`${parts.slice(0, i).join('/')}/`);
  return out;
}

/* ---------- 畫布尺寸（F101～F103） ---------- */

/** CCFOLIA 一格＝24 px */
export const PAD_UNIT = 24;

/** F102：寬、高各自進位成 24 的整數倍（50×30 → 72×48） */
export const padTo24 = (w: number, h: number): { width: number; height: number } => ({
  width: Math.ceil(w / PAD_UNIT) * PAD_UNIT,
  height: Math.ceil(h / PAD_UNIT) * PAD_UNIT,
});

export const isGridAligned = (w: number, h: number): boolean =>
  w % PAD_UNIT === 0 && h % PAD_UNIT === 0;

/** F101：置中的左上偏移＝差距 ÷ 2 無條件捨去（奇數差距多出的 1 px 在右／下；新尺寸較小時是負的＝置中裁切） */
export const centerOffset = (
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): { dx: number; dy: number } => ({
  dx: Math.floor((newW - oldW) / 2),
  dy: Math.floor((newH - oldH) / 2),
});

/** F63：寬或高不是正整數時不動作 */
export const validCanvasSize = (w: number, h: number): boolean =>
  Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0;

/* ---------- APNG 播放次數（F82、F88） ---------- */

export type GlobalLoopMode = 'keep' | 'once' | 'infinite' | 'custom';
export type AssetLoopMode = 'global' | GlobalLoopMode;
export const MAX_LOOP_COUNT = 999;

/** 指定次數：0、空白、不是數字當 1，夾在 1～999（第 5 節第 32 項） */
export const loopCount = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_LOOP_COUNT, n) : 1;
};

/** 輸出檔的播放次數（acTL 的 num_plays，0＝無限）；個別設定（不是「跟隨整體」）優先 */
export function resolvePlays(
  asset: { mode: AssetLoopMode; count: number },
  global: { mode: GlobalLoopMode; count: number },
  original: number,
): number {
  const pick = (mode: GlobalLoopMode, count: number) =>
    mode === 'keep' ? original : mode === 'once' ? 1 : mode === 'infinite' ? 0 : loopCount(count);
  return asset.mode === 'global' ? pick(global.mode, global.count) : pick(asset.mode, asset.count);
}

/* ---------- 搜尋與排序（F18、F19） ---------- */

/** F18（第 5 節第 28 項）：名稱（含資料夾路徑）或顯示名稱包含輸入的字（不分大小寫） */
export function matchesSearch(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t?.toLowerCase().includes(q));
}
