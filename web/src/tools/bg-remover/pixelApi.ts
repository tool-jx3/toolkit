/**
 * 像素處理的函式集（加圖時的檢查與縮圖、讀圖、色鍵、AI 的前後處理、邊緣調整、筆刷重播、預覽合成、匯出）：
 * Worker（pixels.worker.ts）與主執行緒的退路共用。這個檔案不建立 Worker（Worker 也 import 它）。
 */
import { errorText } from '@/core/diagnostics/error';
import {
  applyMask,
  detectImageType,
  type KeyColors,
  type Mask,
  maskToRgba,
  type Rect,
  type Rgb,
} from '@/core/image';
import { transfer } from '@/core/worker';
import type { Letterbox } from './animeSeg';
import type { FillStroke, Mode, StoredStroke, ViewMode } from './model';
import {
  aiBase,
  aiInput,
  aiMask,
  applyStrokes,
  type ColorBase,
  colorBase,
  comboBase,
  composeOutput,
  cutoutColors,
  decodeMaskPng,
  decodeSource,
  encodeImage,
  encodeMaskPng,
  fillRegion,
  type KeyInfo,
  type KeyParams,
  keyInfo,
  type OutputSpec,
  refineMask,
  type SourceImage,
} from './pipeline';

export interface RenderJob {
  /** 這次匯出的編號（給了就可以用 cancelRender 取消） */
  id?: number;
  /** 原圖的快取鍵（資產 id） */
  key: string;
  blob: Blob;
  mode: Mode;
  keyParams: KeyParams;
  /** AI 的遮罩（存著的 8 位元 PNG，用的時候套色階）；要 AI 的方式還沒去背時 null */
  aiMask: Blob | null;
  /** 去掉孤島：留比最大一塊的這個比例（0～1）大的塊；null＝關 */
  islands: number | null;
  grow: number;
  feather: number;
  despill: boolean;
  strokes: readonly StoredStroke[];
  output: OutputSpec;
}

export interface RenderResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** 匯出時 AI 模式的圖還沒去背 */
export class NeedsAiError extends Error {
  constructor() {
    super('needs-ai');
    this.name = 'NeedsAiError';
  }
}

/** 匯出被取消（cancelRender）；經過 Worker 只剩 name，主執行緒看 name === 'AbortError' */
class RenderCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

/** 加圖時的檢查結果 */
export type InspectResult =
  | { kind: 'image'; width: number; height: number; thumb: Blob | null }
  | { kind: 'not-image' }
  /** 認得檔頭（format）但瀏覽器解不開：error 是瀏覽器回報的錯誤（給「複製錯誤資訊」） */
  | { kind: 'failed'; format: string; error: string };

/** 同色擦掉／補回的範圍預覽：選到幾個像素、外框，以及蓋在外框上的半透明色塊（沒有選到時 null） */
export interface FillPreview {
  count: number;
  bounds: Rect | null;
  image: PreviewImage | null;
}

/** 範圍預覽的斜紋：tint 色（不透明度 FILL_TINT_ALPHA）與深色（FILL_DARK_ALPHA）交替，什麼顏色的地方都看得出來 */
const FILL_TINT_ALPHA = 200;
const FILL_DARK_ALPHA = 110;

/** 預覽要畫的一張：ImageBitmap（主執行緒直接 drawImage）；環境不能做 ImageBitmap 時是像素 */
export type PreviewImage =
  | { bitmap: ImageBitmap; width: number; height: number }
  | { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };

export interface PreviewJob {
  key: string;
  blob: Blob;
  view: ViewMode;
  /** 最終遮罩（原圖檢視、還沒有遮罩時 null） */
  mask: Mask | null;
  /** 去色邊後的顏色：colorsKey 對得上 despill 上次算的就直接用（不必再傳一次）；都沒有時用原圖的顏色 */
  colorsKey: string | null;
  colors: Uint8ClampedArray | null;
}

/** 縮圖的長邊（px；清單的縮圖約 100 px 寬，高解析度螢幕要兩倍） */
export const THUMB_SIZE = 256;

/** 讓出一下（Worker 裡：讓排在後面的訊息——例如取消——先處理） */
const yieldToEvents = () => new Promise<void>((r) => setTimeout(r, 0));

/** 縮圖：等比縮到長邊 max px 的 PNG（不能用 OffscreenCanvas 時 null） */
async function thumbnailOf(bmp: ImageBitmap, max: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/png' });
}

/** 像素做成 ImageBitmap（主執行緒 drawImage 不必再轉）；做不到時原樣回傳像素 */
async function previewImage(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Promise<PreviewImage> {
  if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(new ImageData(rgba, width, height), {
        premultiplyAlpha: 'premultiply',
        colorSpaceConversion: 'none',
      });
      return transfer({ bitmap, width, height }, [bitmap]);
    } catch {
      /* 改傳像素 */
    }
  }
  const copy = rgba.slice();
  return transfer({ rgba: copy, width, height }, [copy.buffer]);
}

/** 解碼過的原圖留最近 3 張（同一張圖反覆調整時不必重新解碼） */
const CACHE_SIZE = 3;

export function createPixelApi() {
  const cache = new Map<string, Promise<SourceImage>>();
  /** 進行中的匯出、被取消的匯出（編號） */
  const rendering = new Set<number>();
  const cancelled = new Set<number>();
  /** despill 上次算出的顏色（預覽合成直接用） */
  let lastColors: { key: string; colors: Uint8ClampedArray<ArrayBuffer> } | null = null;
  /** 同色範圍預覽用的「目前的遮罩」（主執行緒的版本號；游標移動時不必每次重傳整張遮罩） */
  let fillMask: { version: number; mask: Mask } | null = null;
  const checkpoint = async (id: number | undefined) => {
    if (id === undefined) return;
    await yieldToEvents();
    if (cancelled.has(id)) throw new RenderCancelledError();
  };
  const source = (key: string, blob: Blob): Promise<SourceImage> => {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const p = decodeSource(blob);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return p;
  };

  const baseOf = async (job: RenderJob, src: SourceImage): Promise<ColorBase | { mask: Mask }> => {
    if (job.mode === 'color') return colorBase(src, job.keyParams);
    if (!job.aiMask) throw new NeedsAiError();
    const m = decodeMaskPng(new Uint8Array(await job.aiMask.arrayBuffer()));
    if (m.width !== src.width || m.height !== src.height) throw new NeedsAiError();
    const ai = aiBase(m.mask);
    return job.mode === 'combo' ? comboBase(src, ai, job.keyParams) : { mask: ai };
  };

  return {
    /** 加圖時檢查一個檔案：看檔頭是不是圖片、解碼量尺寸、做縮圖（都在 Worker 裡，畫面不卡） */
    async inspect(blob: Blob, thumbSize = THUMB_SIZE): Promise<InspectResult> {
      const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
      const format = detectImageType(head);
      if (!format) return { kind: 'not-image' };
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(blob);
      } catch (e) {
        return { kind: 'failed', format, error: errorText(e) };
      }
      try {
        const thumb = await thumbnailOf(bmp, thumbSize).catch(() => null);
        return { kind: 'image', width: bmp.width, height: bmp.height, thumb };
      } finally {
        bmp.close();
      }
    },
    /** 清單的縮圖（重新整理後、或加圖時沒做成的） */
    async thumb(blob: Blob, thumbSize = THUMB_SIZE): Promise<Blob | null> {
      const bmp = await createImageBitmap(blob);
      try {
        return await thumbnailOf(bmp, thumbSize);
      } finally {
        bmp.close();
      }
    },
    /** 解碼（回傳一份複本給主執行緒預覽用） */
    async load(key: string, blob: Blob): Promise<SourceImage> {
      const src = await source(key, blob);
      const rgba = src.rgba.slice();
      return transfer({ width: src.width, height: src.height, rgba }, [rgba.buffer]);
    },
    /** 背景色的偵測與建議（AI＋背景色還沒 AI 去背時也要顯示） */
    async keyInfo(key: string, blob: Blob, color: Rgb | null): Promise<KeyInfo> {
      return keyInfo(await source(key, blob), color);
    },
    async colorBase(key: string, blob: Blob, p: KeyParams): Promise<ColorBase> {
      const r = colorBase(await source(key, blob), p);
      return transfer(r, [r.mask.buffer]);
    },
    /** AI＋背景色的基礎遮罩（aiPng：存著的 AI 遮罩；尺寸不合時 null＝當成還沒 AI 去背） */
    async comboBase(key: string, blob: Blob, p: KeyParams, aiPng: Blob): Promise<ColorBase | null> {
      const src = await source(key, blob);
      const m = decodeMaskPng(new Uint8Array(await aiPng.arrayBuffer()));
      if (m.width !== src.width || m.height !== src.height) return null;
      const r = comboBase(src, aiBase(m.mask), p);
      return transfer(r, [r.mask.buffer]);
    },
    async aiInput(key: string, blob: Blob): Promise<{ tensor: Float32Array; box: Letterbox }> {
      const r = aiInput(await source(key, blob));
      return transfer(r, [r.tensor.buffer as ArrayBuffer]);
    },
    /** 模型輸出 → 遮罩（＋存檔用的 PNG） */
    async aiMask(pred: Float32Array, box: Letterbox): Promise<{ mask: Mask; png: Uint8Array }> {
      const mask = aiMask(pred, box);
      const png = await encodeMaskPng(mask, box.w0, box.h0);
      return transfer({ mask, png }, [mask.buffer, png.buffer as ArrayBuffer]);
    },
    /** AI 的基礎遮罩：存著的 8 位元遮罩（PNG）讀回來套色階 */
    async aiBase(png: Blob): Promise<{ mask: Mask; width: number; height: number }> {
      const r = decodeMaskPng(new Uint8Array(await png.arrayBuffer()));
      const mask = aiBase(r.mask);
      return transfer({ mask, width: r.width, height: r.height }, [mask.buffer]);
    },
    /** 邊緣調整：去掉孤島（islands：比例 0～1，null＝關）→ 收縮／擴張 → 羽化 */
    async refine(
      mask: Mask,
      w: number,
      h: number,
      grow: number,
      feather: number,
      islands: number | null = null,
    ): Promise<Mask> {
      const r = refineMask(mask, w, h, grow, feather, islands);
      return transfer(r, [r.buffer]);
    },
    /** 去色邊後的顏色（純色模式預覽用）；colorsKey 給了就記住，預覽合成時不必再傳回來 */
    async despill(
      key: string,
      blob: Blob,
      base: Mask,
      keys: KeyColors,
      colorsKey: string | null = null,
    ): Promise<Uint8ClampedArray<ArrayBuffer>> {
      const src = await source(key, blob);
      const colors = cutoutColors(src, { base, keys });
      lastColors = colorsKey ? { key: colorsKey, colors } : null;
      const r = colors.slice();
      return transfer(r, [r.buffer]);
    },
    /** 最終遮罩：邊緣調整後的遮罩（或目前的遮罩）依序畫上存起來的筆刷與同色擦掉／補回 */
    async finalMask(
      key: string,
      blob: Blob,
      mask: Mask,
      strokes: readonly StoredStroke[],
    ): Promise<Mask> {
      applyStrokes(mask, await source(key, blob), strokes);
      return transfer(mask, [mask.buffer]);
    },
    /**
     * 同色擦掉／補回的範圍預覽（規格 F61）：依目前的遮罩與原圖的顏色算範圍，回傳選到幾個像素、外框與斜紋色塊
     * （tint 色與深色交替，一條寬 stripe 個像素；主執行緒依畫面縮放給，畫面上大約一樣寬）。
     * 遮罩用版本號記住：Worker 記得的版本不同又沒有附 mask 時回傳 null（請主執行緒附上 mask 再叫一次）。
     */
    async fillPreview(
      key: string,
      blob: Blob,
      version: number,
      mask: Mask | null,
      fill: FillStroke,
      tint: readonly [number, number, number],
      stripe = 4,
    ): Promise<FillPreview | null> {
      if (mask) fillMask = { version, mask };
      else if (fillMask?.version !== version) return null;
      const src = await source(key, blob);
      const current = fillMask.mask;
      if (current.length !== src.width * src.height) return null;
      const r = fillRegion(current, src, fill);
      if (!r.count || !r.bounds) return { count: 0, bounds: null, image: null };
      const { x, y, width, height } = r.bounds;
      const rgba = new Uint8ClampedArray(width * height * 4);
      const band = Math.max(1, Math.round(stripe));
      for (let j = 0; j < height; j++) {
        const row = (y + j) * src.width + x;
        for (let i = 0; i < width; i++) {
          if (!r.region[row + i]) continue;
          const o = (j * width + i) * 4;
          /* 斜紋：以圖片座標算，換位置時紋路不會跳 */
          if (Math.floor((x + i + y + j) / band) % 2 === 0) {
            rgba[o] = tint[0];
            rgba[o + 1] = tint[1];
            rgba[o + 2] = tint[2];
            rgba[o + 3] = FILL_TINT_ALPHA;
          } else {
            rgba[o + 3] = FILL_DARK_ALPHA;
          }
        }
      }
      return { count: r.count, bounds: r.bounds, image: await previewImage(rgba, width, height) };
    },
    /**
     * 預覽要畫的整張（結果／原圖／遮罩）：在這裡合成，主執行緒只要 drawImage。
     * colorsKey 對不上 despill 記住的顏色、又沒有給 colors 時回傳 null（請主執行緒附上 colors 再叫一次）。
     */
    async preview(job: PreviewJob): Promise<PreviewImage | null> {
      const src = await source(job.key, job.blob);
      const { width: w, height: h } = src;
      const fits = (a: { length: number } | null, k: number): a is NonNullable<typeof a> =>
        !!a && a.length === w * h * k;
      if (job.view === 'original' || !fits(job.mask, 1)) return previewImage(src.rgba, w, h);
      if (job.view === 'mask') return previewImage(maskToRgba(job.mask), w, h);
      let colors: Uint8ClampedArray = src.rgba;
      if (job.colorsKey) {
        if (lastColors?.key === job.colorsKey && fits(lastColors.colors, 4))
          colors = lastColors.colors;
        else if (fits(job.colors, 4)) colors = job.colors;
        else return null;
      }
      return previewImage(applyMask(colors, job.mask), w, h);
    },
    /** 匯出一張（id 給了就可以用 cancelRender 中途取消：每一步之間檢查） */
    async render(job: RenderJob): Promise<RenderResult> {
      const id = job.id;
      if (id !== undefined) rendering.add(id);
      try {
        const src = await source(job.key, job.blob);
        await checkpoint(id);
        const base = await baseOf(job, src);
        await checkpoint(id);
        const final = refineMask(
          base.mask,
          src.width,
          src.height,
          job.grow,
          job.feather,
          job.islands,
        );
        await checkpoint(id);
        applyStrokes(final, src, job.strokes);
        const colors = cutoutColors(
          src,
          job.mode !== 'ai' && job.despill && 'keys' in base
            ? { base: base.mask, keys: base.keys }
            : null,
        );
        await checkpoint(id);
        const img = composeOutput(src, colors, final, job.output);
        await checkpoint(id);
        const bytes = await encodeImage(img, job.output.format);
        await checkpoint(id);
        return transfer({ bytes, width: img.width, height: img.height }, [
          bytes.buffer as ArrayBuffer,
        ]);
      } finally {
        if (id !== undefined) {
          rendering.delete(id);
          cancelled.delete(id);
        }
      }
    },
    /** 取消進行中的匯出（下一個檢查點就停下來，render 以 name 為 AbortError 的錯誤結束） */
    cancelRender(id: number): void {
      if (rendering.has(id)) cancelled.add(id);
    },
    forget(key: string): void {
      cache.delete(key);
    },
  };
}

export type PixelApi = ReturnType<typeof createPixelApi>;
