/**
 * 圖片處理（Worker 裡執行；不支援 Worker 時主執行緒也能直接呼叫）：解碼、縮圖、畫布尺寸、調色後編碼、容量壓縮、打包 ZIP。
 * 規格：psd-studio 2.1、2.2、3.1～3.7、F08、F10、F71、F81、F101。
 *
 * - PNG（含 APNG）以純 JavaScript 解碼（像素逐值精確、影格依處置與混合方式合成好）；JPG、WebP、GIF 交給瀏覽器（GIF 只取第一格）。
 * - 延遲照原檔（延遲 0 保留 0，第 7 節裁定）。
 * - 縮小一律用面積平均（預乘透明度），細線不會出現摩爾紋；不經過 canvas，所以結果與瀏覽器無關。
 */
import { type CcfoliaRoomData, type RoomImageReplacement, rewriteRoomZip } from '@/ccfolia';
import { decodeAnimatedImage, decodeStillImage, isPng, readPsdLayers } from '@/core/decode';
import { ApngEncoder, encodePng, encodePngColors } from '@/core/encode';
import { uniqueFileName, type ZipEntry, zipFiles } from '@/core/files';
import { type AssetAdjust, applyAdjust, compileAdjust, type GlobalAdjust } from './adjust';
import { type Attempt, scaledSize, searchCompression, skipFrames } from './compress';
import { folderEntries, pngOutputName } from './naming';

/** 一個 APNG 最多讀幾格 */
export const MAX_FRAMES = 2000;
/** 縮圖的最長邊（F17） */
export const THUMB_MAX = 240;

export type Rgba = Uint8ClampedArray<ArrayBuffer>;

export interface Thumb {
  width: number;
  height: number;
  rgba: Rgba;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** 合成好的完整畫面（靜態圖一格） */
  frames: Rgba[];
  /** 每格延遲（毫秒，照原檔，可以是 0） */
  delays: number[];
  /** 原檔的播放次數（0＝無限；靜態圖 0） */
  plays: number;
  /** 2 格以上的動畫 PNG（F08） */
  apng: boolean;
}

/* ---------- 解碼 ---------- */

/** 解碼原檔（F08：APNG＝2 格以上；只有 1 格的 APNG 當靜態圖；GIF 只取第一格） */
export async function decodeSource(bytes: Uint8Array): Promise<DecodedImage> {
  if (isPng(bytes)) {
    try {
      const anim = await decodeAnimatedImage(bytes, {
        maxFrames: MAX_FRAMES,
        minDelayMs: 0,
        defaultDelayMs: 0,
      });
      const apng = anim.format === 'apng' && anim.frames.length >= 2;
      if (anim.frames.length) {
        return {
          width: anim.width,
          height: anim.height,
          frames: apng ? anim.frames.map((f) => f.rgba) : [anim.frames[0].rgba],
          delays: apng ? anim.frames.map((f) => f.delayMs) : [0],
          plays: apng ? anim.loops : 0,
          apng,
        };
      }
    } catch {
      /* 純 JavaScript 解不了的 PNG 交給瀏覽器 */
    }
  }
  const still = await decodeStillImage(bytes);
  return {
    width: still.width,
    height: still.height,
    frames: [still.rgba],
    delays: [0],
    plays: 0,
    apng: false,
  };
}

/* ---------- 縮放、補邊、遮色片 ---------- */

/** 一個軸上，每個輸出位置涵蓋的來源範圍與重疊長度（面積平均） */
function axisSpans(sn: number, dn: number): { idx: number[]; w: number[] }[] {
  const f = sn / dn;
  const spans: { idx: number[]; w: number[] }[] = [];
  for (let i = 0; i < dn; i++) {
    const a = i * f;
    const b = (i + 1) * f;
    const idx: number[] = [];
    const w: number[] = [];
    for (let s = Math.floor(a); s < Math.min(sn, Math.ceil(b)); s++) {
      const ww = Math.min(s + 1, b) - Math.max(s, a);
      if (ww > 0) {
        idx.push(s);
        w.push(ww);
      }
    }
    spans.push({ idx, w });
  }
  return spans;
}

/**
 * 面積平均縮放（每個輸出像素＝它涵蓋的來源範圍依面積加權平均）。以預乘透明度平均，透明邊緣不會變黑；
 * 縮小時細線不會出現摩爾紋。先橫向再縱向。
 */
export function resizeRgba(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Rgba {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xs = axisSpans(sw, dw);
  const ys = axisSpans(sh, dh);
  const tmp = new Float64Array(sh * dw * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4;
    for (let x = 0; x < dw; x++) {
      const { idx, w } = xs[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = row + idx[k] * 4;
        const pa = src[s + 3] * w[k];
        r += src[s] * pa;
        g += src[s + 1] * pa;
        b += src[s + 2] * pa;
        a += pa;
      }
      const o = (y * dw + x) * 4;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
      tmp[o + 3] = a;
    }
  }
  const area = (sw / dw) * (sh / dh);
  for (let y = 0; y < dh; y++) {
    const { idx, w } = ys[y];
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < idx.length; k++) {
        const o = (idx[k] * dw + x) * 4;
        r += tmp[o] * w[k];
        g += tmp[o + 1] * w[k];
        b += tmp[o + 2] * w[k];
        a += tmp[o + 3] * w[k];
      }
      const d = (y * dw + x) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
      }
      out[d + 3] = Math.round(a / area);
    }
  }
  return out;
}

/** 縮圖尺寸：最長邊 max（比 max 小時不放大） */
export function thumbSize(
  w: number,
  h: number,
  max = THUMB_MAX,
): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  return w > h
    ? { width: max, height: Math.max(1, Math.round((h * max) / w)) }
    : { width: Math.max(1, Math.round((w * max) / h)), height: max };
}

export function makeThumb(rgba: ArrayLike<number>, w: number, h: number, max = THUMB_MAX): Thumb {
  const t = thumbSize(w, h, max);
  if (t.width === w && t.height === h) return { ...t, rgba: Uint8ClampedArray.from(rgba) as Rgba };
  return { ...t, rgba: resizeRgba(rgba, w, h, t.width, t.height) };
}

/** 放到 nw × nh 的透明畫布上，左上偏移 (dx, dy)（負的＝裁掉；F101） */
export function padRgba(
  src: ArrayLike<number>,
  w: number,
  h: number,
  nw: number,
  nh: number,
  dx: number,
  dy: number,
): Rgba {
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= nh) continue;
    const x0 = Math.max(0, -dx);
    const x1 = Math.min(w, nw - dx);
    if (x1 <= x0) continue;
    const s = (y * w + x0) * 4;
    const n = (x1 - x0) * 4;
    const d = (ty * nw + x0 + dx) * 4;
    if (src instanceof Uint8ClampedArray || src instanceof Uint8Array)
      out.set(src.subarray(s, s + n), d);
    else for (let k = 0; k < n; k++) out[d + k] = src[s + k];
  }
  return out;
}

export interface LayerMask {
  left: number;
  top: number;
  width: number;
  height: number;
  defaultColor: number;
  disabled: boolean;
  values: Uint8Array;
}

/** 圖層遮色片套到不透明度（預覽用；文件座標） */
export function applyMask(
  rgba: ArrayLike<number>,
  rect: { left: number; top: number; width: number; height: number },
  mask: LayerMask,
): Rgba {
  const out = Uint8ClampedArray.from(rgba) as Rgba;
  if (mask.disabled) return out;
  for (let y = 0; y < rect.height; y++) {
    const my = rect.top + y - mask.top;
    for (let x = 0; x < rect.width; x++) {
      const mx = rect.left + x - mask.left;
      const m =
        mx >= 0 && my >= 0 && mx < mask.width && my < mask.height
          ? mask.values[my * mask.width + mx]
          : mask.defaultColor;
      const o = (y * rect.width + x) * 4 + 3;
      out[o] = Math.round((out[o] * m) / 255);
    }
  }
  return out;
}

/** 所有影格裡不同的顏色數，數到 limit 就停（APNG 無損時決定要不要用調色盤） */
export function countColorsUpTo(frames: readonly ArrayLike<number>[], limit: number): number {
  const seen = new Set<number>();
  for (const f of frames) {
    const u32 =
      f instanceof Uint8ClampedArray || f instanceof Uint8Array
        ? new Uint32Array(f.buffer, f.byteOffset, f.length >> 2)
        : Uint32Array.from(
            { length: f.length >> 2 },
            (_, i) =>
              (f[i * 4] | (f[i * 4 + 1] << 8) | (f[i * 4 + 2] << 16) | (f[i * 4 + 3] << 24)) >>> 0,
          );
    for (let i = 0; i < u32.length; i++) {
      seen.add(u32[i]);
      if (seen.size >= limit) return seen.size;
    }
  }
  return seen.size;
}

/* ---------- 編碼 ---------- */

/**
 * 編 APNG：每格是完整畫面（編碼器只存與前一格不同的範圍），延遲以毫秒計、延遲 0 保留 0、相同的影格不合併（格數照原檔）。
 * colors：null＝無損（不超過 256 色時自動用調色盤，仍無損）；數字＝減色到最多這麼多色。
 */
export async function encodeApngFrames(
  frames: readonly Rgba[],
  width: number,
  height: number,
  delays: readonly number[],
  plays: number,
  colors: number | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const quantize = colors !== null || countColorsUpTo(frames, 257) <= 256;
  const enc = new ApngEncoder({
    width,
    height,
    fps: 1000,
    plays,
    quantize,
    maxColors: colors ?? 256,
    mergeIdentical: false,
    minTicks: 0,
  });
  for (let i = 0; i < frames.length; i++) await enc.addFrame(frames[i], Math.round(delays[i] ?? 0));
  return (await enc.finish()).bytes;
}

/** 靜態 PNG：colors null＝全彩 RGBA（無損，3.5）；數字＝調色盤 PNG（色數在上限內時無損） */
export async function encodeStill(
  rgba: Rgba,
  width: number,
  height: number,
  colors: number | null,
): Promise<Uint8Array<ArrayBuffer>> {
  if (colors === null) return encodePng(rgba, width, height);
  return (await encodePngColors(rgba, width, height, colors)).bytes;
}

/* ---------- 準備（載入時） ---------- */

export interface PreparedInfo {
  width: number;
  height: number;
  apng: boolean;
  frames: number;
  delays: number[];
  plays: number;
  thumb: Thumb;
}

/** 載入時：尺寸、種類、影格與延遲、播放次數、縮圖（第一格） */
export async function prepare(bytes: Uint8Array): Promise<PreparedInfo> {
  const d = await decodeSource(bytes);
  return {
    width: d.width,
    height: d.height,
    apng: d.apng,
    frames: d.frames.length,
    delays: d.delays,
    plays: d.plays,
    thumb: makeThumb(d.frames[0], d.width, d.height),
  };
}

/* ---------- PSD（F10、2.2） ---------- */

export interface PsdLayerOut {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  blendMode: string;
  clipping: boolean;
  /** 原始圖層像素的 PNG（匯出、存檔用；3.3：不套用不透明度與遮色片） */
  png: Uint8Array<ArrayBuffer>;
  thumb: Thumb;
  /** 有遮色片時：套上遮色片的縮圖（配置檢視的合成用，第 7 節裁定） */
  maskedThumb: Thumb | null;
}

export interface PsdOut {
  width: number;
  height: number;
  /** 由下到上 */
  layers: PsdLayerOut[];
}

/** 讀 PSD：看得見、有像素的圖層（隱藏的圖層、隱藏群組裡的全部略過；群組攤平） */
export async function loadPsd(
  bytes: Uint8Array,
  onProgress?: (index: number, total: number, name: string) => void,
): Promise<PsdOut> {
  const doc = await readPsdLayers(bytes, { includeHidden: false });
  const layers: PsdLayerOut[] = [];
  for (let i = 0; i < doc.layers.length; i++) {
    const l = doc.layers[i];
    onProgress?.(i + 1, doc.layers.length, l.name);
    const groupOpacity = l.groups.reduce((m, g) => m * g.opacity, 1);
    const rect = { left: l.left, top: l.top, width: l.width, height: l.height };
    layers.push({
      name: l.name,
      left: l.left,
      top: l.top,
      width: l.width,
      height: l.height,
      opacity: l.opacity * groupOpacity,
      blendMode: l.blendMode,
      clipping: l.clipping,
      png: await encodePng(l.rgba, l.width, l.height),
      thumb: makeThumb(l.rgba, l.width, l.height),
      maskedThumb:
        l.mask && !l.mask.disabled
          ? makeThumb(applyMask(l.rgba, rect, l.mask), l.width, l.height)
          : null,
    });
  }
  return { width: doc.width, height: doc.height, layers };
}

/* ---------- 畫布尺寸（F101） ---------- */

export interface ResizedOut {
  bytes: Uint8Array<ArrayBuffer>;
  info: PreparedInfo;
}

/**
 * 放到新尺寸的透明畫布上（置中由呼叫端算好 dx、dy）。靜態圖存成 PNG；APNG 每一格都補（第 5 節第 17 項：修正），
 * 延遲與播放次數照原檔、無損。
 */
export async function resizeCanvas(
  bytes: Uint8Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
): Promise<ResizedOut> {
  const d = await decodeSource(bytes);
  const frames = d.frames.map((f) => padRgba(f, d.width, d.height, width, height, dx, dy));
  const out = d.apng
    ? await encodeApngFrames(frames, width, height, d.delays, d.plays, null)
    : await encodePng(frames[0], width, height);
  return {
    bytes: out,
    info: {
      width,
      height,
      apng: d.apng,
      frames: frames.length,
      delays: d.delays,
      plays: d.plays,
      thumb: makeThumb(frames[0], width, height),
    },
  };
}

/* ---------- 調色後輸出（3.5～3.7、F71） ---------- */

export interface AdjustInput {
  global: GlobalAdjust;
  asset: AssetAdjust | null;
}

export interface OutputOptions {
  /** F84 */
  compress: boolean;
  /** F85（位元組） */
  targetBytes: number;
  /** F86 */
  skip: boolean;
  /** F87 */
  compressStatic: boolean;
  /** 輸出的播放次數（APNG；0＝無限） */
  plays: number;
}

export type ProcessProgress =
  | { type: 'frame'; index: number; total: number }
  | { type: 'try'; scale: number; colors: number | null }
  | { type: 'skip' };

export interface ProcessInfo {
  width: number;
  height: number;
  apng: boolean;
  /** 輸出的格數 */
  frames: number;
  /** 尺寸比例（1＝原尺寸） */
  scale: number;
  /** 減色的色數上限（null＝沒有減色） */
  colors: number | null;
  skipped: boolean;
  /** 壓縮到最低設定仍超過目標 */
  over: boolean;
  /** 有沒有跑容量壓縮 */
  compressed: boolean;
  size: number;
  origSize: number;
}

export interface ProcessResult {
  data: Uint8Array<ArrayBuffer>;
  info: ProcessInfo;
}

/** 已調色的影格 → 照壓縮規則編碼（容量壓縮試算也用這個） */
async function compressDecoded(
  d: DecodedImage,
  target: number,
  allowSkip: boolean,
  plays: number,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{
  data: Uint8Array<ArrayBuffer>;
  attempt: Attempt;
  over: boolean;
  width: number;
  height: number;
  frames: number;
}> {
  const skipped = d.apng ? skipFrames(d.frames, d.delays) : null;
  const outputs = new Map<
    string,
    { data: Uint8Array<ArrayBuffer>; width: number; height: number; frames: number }
  >();
  let scaledKey = '';
  let scaled: Rgba[] = [];
  const key = (a: Attempt) => `${a.scale}|${a.colors}|${a.skip}`;
  const result = await searchCompression({
    target,
    frames: d.frames.length,
    allowSkip: d.apng && allowSkip,
    onTry: (a) => onProgress?.({ type: 'try', scale: a.scale, colors: a.colors }),
    onSkip: () => onProgress?.({ type: 'skip' }),
    attempt: async (a) => {
      const src = a.skip && skipped ? skipped : { frames: d.frames, delays: d.delays };
      const { width, height } = scaledSize(d.width, d.height, a.scale);
      const k = `${a.scale}|${a.skip}`;
      if (k !== scaledKey) {
        scaled =
          a.scale === 1
            ? src.frames
            : src.frames.map((f) => resizeRgba(f, d.width, d.height, width, height));
        scaledKey = k;
      }
      const data = d.apng
        ? await encodeApngFrames(scaled, width, height, src.delays, plays, a.colors)
        : await encodeStill(scaled[0], width, height, a.colors);
      outputs.set(key(a), { data, width, height, frames: scaled.length });
      return data.length;
    },
  });
  const out = outputs.get(key(result.attempt))!;
  return { ...out, attempt: result.attempt, over: result.over };
}

/** 解碼＋調色（每一格） */
export async function decodeAdjusted(
  bytes: Uint8Array,
  adjust: AdjustInput | null,
  onProgress?: (p: ProcessProgress) => void,
): Promise<DecodedImage> {
  const d = await decodeSource(bytes);
  if (adjust) {
    const c = compileAdjust(adjust.global, adjust.asset);
    d.frames.forEach((f, i) => {
      if (d.apng) onProgress?.({ type: 'frame', index: i + 1, total: d.frames.length });
      applyAdjust(f, c);
    });
  }
  return d;
}

/**
 * 處理一張（匯出、單張下載）：調色 → 靜態圖編成 PNG（F84、F87 都開時走容量壓縮）；
 * APNG 壓縮開時走容量壓縮，關時無損輸出（延遲、格數照原檔，播放次數依 plays）。
 */
export async function processImage(
  bytes: Uint8Array,
  adjust: AdjustInput,
  out: OutputOptions,
  onProgress?: (p: ProcessProgress) => void,
): Promise<ProcessResult> {
  const d = await decodeAdjusted(bytes, adjust, onProgress);
  const compress = d.apng ? out.compress : out.compress && out.compressStatic;
  const base = { apng: d.apng, origSize: bytes.length };
  if (compress) {
    const c = await compressDecoded(d, out.targetBytes, out.skip, out.plays, onProgress);
    return {
      data: c.data,
      info: {
        ...base,
        width: c.width,
        height: c.height,
        frames: c.frames,
        scale: c.attempt.scale,
        colors: c.attempt.colors,
        skipped: c.attempt.skip,
        over: c.over,
        compressed: true,
        size: c.data.length,
      },
    };
  }
  const data = d.apng
    ? await encodeApngFrames(d.frames, d.width, d.height, d.delays, out.plays, null)
    : await encodeStill(d.frames[0], d.width, d.height, null);
  return {
    data,
    info: {
      ...base,
      width: d.width,
      height: d.height,
      frames: d.frames.length,
      scale: 1,
      colors: null,
      skipped: false,
      over: false,
      compressed: false,
      size: data.length,
    },
  };
}

/* ---------- 打包（3.2～3.4） ---------- */

export interface ExportAsset {
  name: string;
  /** 從原 ZIP 讀進來的素材：ZIP 內的路徑 */
  zipPath?: string;
  bytes: Uint8Array;
  asset: AssetAdjust | null;
  /** 看得見（F35） */
  visible: boolean;
  plays: number;
}

export interface ExportJob {
  mode: 'image' | 'psd' | 'room';
  global: GlobalAdjust;
  output: Omit<OutputOptions, 'plays'>;
  assets: ExportAsset[];
  /** 原 ZIP（房間模式、從 ZIP 載入的圖片模式） */
  zip: {
    entries: { name: string; data: Uint8Array }[];
    dataPath: string | null;
    json: unknown;
  } | null;
  /** 固定 ZIP 的檔案時間（測試用） */
  mtime?: number;
}

export type ExportProgress =
  | { type: 'asset'; index: number; total: number; name: string }
  | ({ type: 'detail' } & { detail: ProcessProgress })
  | { type: 'pack' };

export interface ExportResult {
  bytes: Uint8Array<ArrayBuffer>;
  /** 壓縮到最低設定仍超過目標的檔名 */
  over: string[];
  count: number;
}

export interface Processed {
  asset: ExportAsset;
  data: Uint8Array<ArrayBuffer>;
  apng: boolean;
}

/** 圖片模式的 ZIP 內容（3.2）：以原 ZIP 為底或新 ZIP；靜態圖的副檔名改 .png（第 7 節裁定）；看不見的不放 */
export function imageZipEntries(
  processed: readonly Processed[],
  hidden: readonly ExportAsset[],
  base: { name: string; data: Uint8Array }[] | null,
): ZipEntry[] {
  const outName = (p: Processed, path: string) => (p.apng ? path : pngOutputName(path));
  if (base) {
    const hiddenPaths = new Set(hidden.map((a) => a.zipPath).filter(Boolean));
    const entries: ZipEntry[] = base
      .filter((e) => !hiddenPaths.has(e.name))
      .map((e) => ({ name: e.name, data: e.data }));
    const byPath = new Map(
      processed.filter((p) => p.asset.zipPath).map((p) => [p.asset.zipPath!, p]),
    );
    const used = new Set(entries.map((e) => e.name));
    const result: ZipEntry[] = [];
    for (const e of entries) {
      const p = byPath.get(e.name);
      if (!p) {
        result.push(e);
        continue;
      }
      let name = outName(p, e.name);
      if (name !== e.name) {
        used.delete(e.name);
        name = uniqueFileName(name, used);
      }
      result.push({ name, data: p.data });
    }
    for (const p of processed) {
      if (p.asset.zipPath) continue;
      const name = uniqueFileName(outName(p, p.asset.name), used);
      for (const dir of folderEntries(name)) {
        if (!used.has(dir)) {
          used.add(dir);
          result.push({ name: dir, data: new Uint8Array(0) });
        }
      }
      result.push({ name, data: p.data });
    }
    return result;
  }
  const used = new Set<string>();
  const result: ZipEntry[] = [];
  for (const p of processed) {
    const name = uniqueFileName(outName(p, p.asset.name), used);
    for (const dir of folderEntries(name)) {
      if (!used.has(dir)) {
        used.add(dir);
        result.push({ name: dir, data: new Uint8Array(0) });
      }
    }
    result.push({ name, data: p.data });
  }
  return result;
}

/** 匯出整批（F90～F93）：逐張處理（看得見的），再依模式打包 */
export async function exportZip(
  job: ExportJob,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult> {
  const visible = job.assets.filter((a) => a.visible);
  const hidden = job.assets.filter((a) => !a.visible);
  const processed: Processed[] = [];
  const over: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i];
    onProgress?.({ type: 'asset', index: i + 1, total: visible.length, name: a.name });
    const r = await processImage(
      a.bytes,
      { global: job.global, asset: a.asset },
      { ...job.output, plays: a.plays },
      (detail) => onProgress?.({ type: 'detail', detail }),
    );
    if (r.info.over) over.push(a.name);
    processed.push({ asset: a, data: r.data, apng: r.info.apng });
  }
  onProgress?.({ type: 'pack' });
  const mtime = job.mtime !== undefined ? new Date(job.mtime) : undefined;
  let bytes: Uint8Array<ArrayBuffer>;
  if (job.mode === 'room' && job.zip) {
    const replacements: RoomImageReplacement[] = processed.map((p) => ({
      path: p.asset.zipPath ?? p.asset.name,
      data: p.data,
      mime: 'image/png',
    }));
    bytes = (
      await rewriteRoomZip(
        {
          entries: job.zip.entries,
          dataPath: job.zip.dataPath,
          json: job.zip.json as CcfoliaRoomData,
        },
        replacements,
        { mtime },
      )
    ).bytes;
  } else if (job.mode === 'psd') {
    bytes = zipFiles(
      processed.map((p) => ({ name: p.asset.name, data: p.data })),
      { mtime },
    );
  } else {
    bytes = zipFiles(imageZipEntries(processed, hidden, job.zip?.entries ?? null), { mtime });
  }
  return { bytes, over, count: processed.length };
}
