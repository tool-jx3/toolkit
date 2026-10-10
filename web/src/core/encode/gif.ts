/**
 * GIF 逐格編碼器（LZW 與檔案結構交給 gifenc，調色盤用本專案的 palette.ts）。
 *
 * - GIF 只有 1 位元透明：alpha < alphaThreshold 視為透明，其餘當作不透明。
 * - 預設整段動畫共用一個全域調色盤（最多 256 色），避免影格之間顏色跳動。
 *   `localPalettes: true` 時改成每格各自減色（第一格的調色盤當全域、之後每格帶自己的區域調色盤）：
 *   顏色會隨時間流動的動畫（彩虹流動、霓虹換色）每格都分得到 256 色，代價是每格多 768 位元組。
 * - `paletteMethod` 選調色盤的選法（預設 'median-cut'；'pca'＝主成分切割，見 palette.ts）。
 * - 連續相同的影格合併並延長顯示時間；延遲以 1/100 秒累計換算，不會越積越多誤差。
 * - 瀏覽器會把短於 2/100 秒的延遲當成 1/10 秒，所以 fps 上限是 50；每格至少 2/100 秒，
 *   補上的時間從後面的格扣回（fps ≤ 50 時每格本來就 ≥ 2/100 秒，結果不變）。
 * - 影格表（每格長度不一）用 `variableDelay: true`：fps 只當計時單位（例如 100＝ticks 以 1/100 秒計），不檢查上限。
 * - `maxColors`（2～256，預設 256）：調色盤的色數上限（video-anim 移植時新增；預設時輸出不變）。
 * - `dither: 'floyd-steinberg'`：減色有損時以 Floyd–Steinberg 誤差擴散對應顏色（由左到右、由上到下，只在變化的範圍內；
 *   完全透明的像素不擴散誤差）。調色盤無損（色數在上限內）時不抖色。預設 'none'＝最近色（輸出不變）。
 * - `cropFrames: true`（lock-screen 移植時新增；預設 false＝輸出逐位元組不變）：第 2 格起只寫和前一格不同的矩形
 *   （影像描述區塊記下位置），沒有透明像素、共用調色盤時才這樣做（有透明時要「清成背景」，每格仍寫整格）。
 *   解碼出來的每一格完全相同，只有檔案變小（例：手機畫面 540 × 1170 的 25 格只有通知卡片在動，約小一半）。
 */
import { GIFEncoder, type GifPalette } from 'gifenc';
import {
  assertFrameSize,
  copyRect,
  diffRect,
  type EncodedFile,
  type FrameEncoder,
  pasteRect,
  type Rect,
  type RgbaPixels,
  toU32,
  yieldToEventLoop,
} from './frames';
import { buildPalette, ColorStats, type Palette, type PaletteMethod } from './palette';

export const GIF_MAX_FPS = 50;

/**
 * 「不透明度小於等於 v 的像素變透明」換算成 GifEncoder 的 alphaThreshold（小於 threshold 變透明）：v ＋ 1。
 * 例：v＝96 → 97（0～96 透明、97 以上不透明）；v＝0 → 1（只有完全透明的像素透明）。
 */
export const gifAlphaThresholdInclusive = (v: number): number =>
  Math.min(256, Math.max(0, Math.round(v)) + 1);

export interface GifEncoderOptions {
  width: number;
  height: number;
  /** 每秒格數（最多 50） */
  fps: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** alpha 小於這個值當作透明（預設 128）；有半透明的邊緣時，未滿一半的變透明、一半以上的變不透明 */
  alphaThreshold?: number;
  /**
   * 影格表模式：每格的長度由 addFrame 的 ticks 決定（fps 只是 ticks 的單位，例如 100 或 1000），
   * 不檢查 fps 上限；短於 2/100 秒的格延長到 2/100 秒，之後的格扣回。
   */
  variableDelay?: boolean;
  /** 每格各自減色（每格自己的區域調色盤）；預設 false＝整段共用一個全域調色盤 */
  localPalettes?: boolean;
  /** 調色盤的選法（預設 'median-cut'） */
  paletteMethod?: PaletteMethod;
  /** 調色盤的色數上限（2～256，預設 256） */
  maxColors?: number;
  /** 抖色：'none'（預設，最近色）或 'floyd-steinberg'（誤差擴散；調色盤無損時不作用） */
  dither?: GifDither;
  /** 第 2 格起只寫變化的矩形（沒有透明、共用調色盤時；預設 false） */
  cropFrames?: boolean;
}

/**
 * 'none'：最近色；'floyd-steinberg'：RGB 誤差擴散；'luma'：只擴散亮度的誤差（上限 ±48）、從色度最近的 4 色裡挑
 * （漸層不會冒出別的色相的雜點；lock-screen 移植時新增）。
 */
export type GifDither = 'none' | 'floyd-steinberg' | 'luma';

interface Change {
  r: Rect;
  px: Uint32Array;
  count: number;
}

/** 播放次數 → GIF 的 NETSCAPE 重播次數（gifenc：-1 = 播一次、0 = 無限、n = 額外 n 次） */
export function gifRepeat(plays: number): number {
  if (plays <= 0) return 0;
  return plays === 1 ? -1 : plays - 1;
}

export class GifEncoder implements FrameEncoder {
  private readonly opt: Required<GifEncoderOptions>;
  private prev: Uint32Array | null = null;
  private readonly changes: Change[] = [];
  private readonly stats: ColorStats;
  private sawTransparent = false;
  private added = 0;
  private ticks = 0;
  private aborted = false;

  constructor(options: GifEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    if (options.fps > GIF_MAX_FPS && !options.variableDelay)
      throw new RangeError(`GIF 的 fps 最多 ${GIF_MAX_FPS}`);
    if (options.width > 65535 || options.height > 65535)
      throw new RangeError('GIF 的寬高最多 65535');
    this.opt = {
      plays: 0,
      alphaThreshold: 128,
      variableDelay: false,
      localPalettes: false,
      paletteMethod: 'median-cut',
      maxColors: 256,
      dither: 'none',
      cropFrames: false,
      ...options,
    };
    this.opt.maxColors = Math.max(2, Math.min(256, Math.round(this.opt.maxColors) || 256));
    this.stats = new ColorStats(this.opt.maxColors);
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    const { width: W, height: H, alphaThreshold } = this.opt;
    assertFrameSize(rgba, W, H);
    /* 先轉成 1 位元透明（複製一份，不改呼叫端的資料） */
    const src = toU32(rgba);
    const u32 = new Uint32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (v >>> 24 < alphaThreshold) {
        u32[i] = 0;
        this.sawTransparent = true;
      } else u32[i] = (v | 0xff000000) >>> 0;
    }
    const t = Math.max(1, Math.round(ticks));
    this.added++;
    this.ticks += t;
    const r = this.prev ? diffRect(this.prev, u32, W, H) : { x: 0, y: 0, w: W, h: H };
    this.prev = u32;
    if (!r) {
      this.changes[this.changes.length - 1].count += t;
      return;
    }
    /* 每格各自減色時，統計留到 finish 時逐格做 */
    if (!this.opt.localPalettes) this.stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
    this.changes.push({ r, px: copyRect(u32, W, r), count: t });
  }

  abort(): void {
    this.aborted = true;
    this.changes.length = 0;
    this.prev = null;
  }

  async finish(): Promise<EncodedFile> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (!this.added) throw new Error('沒有任何影格');
    const {
      width: W,
      height: H,
      fps,
      plays,
      localPalettes,
      paletteMethod,
      maxColors,
      dither,
      cropFrames,
    } = this.opt;
    const toGifPalette = (p: Palette): GifPalette => {
      const out: GifPalette = [];
      for (let i = 0; i < p.count; i++)
        out.push([p.colors[i * 4], p.colors[i * 4 + 1], p.colors[i * 4 + 2]]);
      return out;
    };
    /* 全域調色盤（每格各自減色時在迴圈裡逐格建立） */
    const shared = localPalettes ? null : buildPalette(this.stats, maxColors, paletteMethod);
    let pal: Palette | null = shared;
    /* 'luma' 抖色的色調表（調色盤換了才重建） */
    let luma: LumaTable | null = null;
    /* 無損時 0 號是完全透明（排序時排在最前面）；減色時 0 號固定保留給透明 */
    let transparent = this.sawTransparent;
    /* 減色資訊：每格各自減色時，全部無損才算無損、色數取最多的一格 */
    let lossless = true;
    let maxCount = 0;

    const gif = GIFEncoder();
    const canvas = new Uint32Array(W * H);
    const index = new Uint8Array(W * H);
    let lastV = -1;
    let lastI = 0;
    let tick = 0;
    /* 已寫入的累計時間（1/100 秒）：每格至少 2，補上的部分從後面扣回 */
    let writtenCs = 0;
    for (let ci = 0; ci < this.changes.length; ci++) {
      const c = this.changes[ci];
      pasteRect(canvas, W, c.r, c.px);
      /* 共用調色盤時只有變化的範圍要重新對應；每格各自減色時整格重來 */
      let r = c.r;
      if (localPalettes) {
        this.stats.clear();
        this.stats.add(canvas, 0, canvas.length);
        pal = buildPalette(this.stats, maxColors, paletteMethod);
        /* 這格有透明像素時 0 號才是透明（無損的調色盤只有用到透明時才有 0 號） */
        transparent = canvas.includes(0);
        lastV = -1;
        r = { x: 0, y: 0, w: W, h: H };
      }
      const p = pal as Palette;
      lossless &&= p.lossless;
      maxCount = Math.max(maxCount, p.count);
      if (dither === 'floyd-steinberg' && !p.lossless) {
        ditherRect(canvas, index, W, r, p);
      } else if (dither === 'luma' && !p.lossless) {
        if (!luma || luma.palette !== p) luma = lumaTable(p);
        ditherRectLuma(canvas, index, W, r, luma);
      } else {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            const k = y * W + x;
            const v = canvas[k];
            if (v !== lastV) {
              lastV = v;
              lastI = p.indexOf(v);
            }
            index[k] = lastI;
          }
        }
      }
      tick += c.count;
      const endCs = Math.max(writtenCs + 2, Math.round((tick * 100) / fps));
      const delayCs = endCs - writtenCs;
      writtenCs = endCs;
      const frameOpts = {
        palette: ci === 0 || localPalettes ? toGifPalette(p) : undefined,
        delay: delayCs * 10,
        repeat: gifRepeat(plays),
        transparent,
        transparentIndex: 0,
        dispose: this.sawTransparent ? 2 : 1,
      };
      if (cropFrames && ci > 0 && !localPalettes && !this.sawTransparent) {
        /* 只寫變化的矩形：gifenc 的影像描述區塊一律寫在 (0, 0)，寫完再補上位置 */
        const sub = new Uint8Array(c.r.w * c.r.h);
        for (let y = 0; y < c.r.h; y++) {
          const k = (c.r.y + y) * W + c.r.x;
          sub.set(index.subarray(k, k + c.r.w), y * c.r.w);
        }
        const at = gif.bytesView().length;
        gif.writeFrame(sub, c.r.w, c.r.h, frameOpts);
        const v = gif.bytesView();
        /* 圖形控制擴充區塊 8 個位元組之後是影像描述區塊（0x2C、左、上） */
        if (v[at + 8] !== 0x2c) throw new Error('GIF 影像描述區塊的位置不對');
        v[at + 9] = c.r.x & 255;
        v[at + 10] = c.r.x >> 8;
        v[at + 11] = c.r.y & 255;
        v[at + 12] = c.r.y >> 8;
      } else gif.writeFrame(index, W, H, frameOpts);
      if (ci % 8 === 7) await yieldToEventLoop();
    }
    gif.finish();
    const view = gif.bytesView();
    const bytes = new Uint8Array(view.length);
    bytes.set(view);
    return {
      bytes,
      mime: 'image/gif',
      ext: 'gif',
      width: W,
      height: H,
      frames: this.added,
      storedFrames: this.changes.length,
      duration: this.ticks / fps,
      colors: { lossless, count: maxCount },
    };
  }
}

/**
 * Floyd–Steinberg 抖色：把 r 範圍內的像素對應到調色盤（誤差 7/16 往右、3/16 左下、5/16 正下、1/16 右下）。
 * 完全透明（0）的像素對應到 0 號、不擴散誤差。
 */
export function ditherRect(
  canvas: Uint32Array,
  index: Uint8Array,
  W: number,
  r: Rect,
  p: Palette,
): void {
  const w = r.w;
  /* 目前列與下一列的誤差（RGB，左右各多一格省掉邊界判斷） */
  let cur = new Float32Array((w + 2) * 3);
  let next = new Float32Array((w + 2) * 3);
  const c = p.colors;
  for (let y = r.y; y < r.y + r.h; y++) {
    next.fill(0);
    for (let x = r.x; x < r.x + w; x++) {
      const k = y * W + x;
      const v = canvas[k];
      if (v >>> 24 === 0) {
        index[k] = p.indexOf(0);
        continue;
      }
      const e = (x - r.x + 1) * 3;
      const R = Math.min(255, Math.max(0, Math.round((v & 255) + cur[e])));
      const G = Math.min(255, Math.max(0, Math.round(((v >>> 8) & 255) + cur[e + 1])));
      const B = Math.min(255, Math.max(0, Math.round(((v >>> 16) & 255) + cur[e + 2])));
      const i = p.indexOf(((v & 0xff000000) | (B << 16) | (G << 8) | R) >>> 0);
      index[k] = i;
      const er = R - c[i * 4];
      const eg = G - c[i * 4 + 1];
      const eb = B - c[i * 4 + 2];
      cur[e + 3] += (er * 7) / 16;
      cur[e + 4] += (eg * 7) / 16;
      cur[e + 5] += (eb * 7) / 16;
      next[e - 3] += (er * 3) / 16;
      next[e - 2] += (eg * 3) / 16;
      next[e - 1] += (eb * 3) / 16;
      next[e] += (er * 5) / 16;
      next[e + 1] += (eg * 5) / 16;
      next[e + 2] += (eb * 5) / 16;
      next[e + 3] += er / 16;
      next[e + 4] += eg / 16;
      next[e + 5] += eb / 16;
    }
    const t = cur;
    cur = next;
    next = t;
  }
}

/* ---------- 只擴散亮度的抖色（'luma'） ---------- */

/** 亮度誤差的上限：誤差不會越積越多、把孤立的顏色擴散出去 */
const LUMA_ERROR_LIMIT = 48;
/** 每個顏色桶（RGB 565）的候選色數 */
const LUMA_CANDIDATES = 4;

export interface LumaTable {
  palette: Palette;
  /** 每色的 [亮度, R−G, B−G]；透明的色是 NaN（不當候選） */
  tones: Float32Array;
  /** RGB 565 桶 → 色度最近的 4 色（第一次用到時才算） */
  candidates: Uint8Array;
  ready: Uint8Array;
  /** 完全透明對應的索引 */
  clear: number;
}

const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 調色盤 → 'luma' 抖色用的色調表 */
export function lumaTable(p: Palette): LumaTable {
  const tones = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, g, b, a] = [
      p.colors[i * 4],
      p.colors[i * 4 + 1],
      p.colors[i * 4 + 2],
      p.colors[i * 4 + 3],
    ];
    if (a !== 255) {
      tones[i * 3] = Number.NaN;
      continue;
    }
    tones[i * 3] = lumaOf(r, g, b);
    tones[i * 3 + 1] = r - g;
    tones[i * 3 + 2] = b - g;
  }
  return {
    palette: p,
    tones,
    candidates: new Uint8Array(65536 * LUMA_CANDIDATES),
    ready: new Uint8Array(65536),
    clear: p.indexOf(0),
  };
}

/** 顏色與色調的距離：亮度差² ＋ 2 ×（色度差²） */
const toneDistance = (t: Float32Array, j: number, y: number, rg: number, bg: number) =>
  (y - t[j * 3]) ** 2 + 2 * ((rg - t[j * 3 + 1]) ** 2 + (bg - t[j * 3 + 2]) ** 2);

/** 這個顏色（依原色、不含累積的誤差）的候選色：色度與亮度綜合最近的 4 色 */
function lumaCandidates(L: LumaTable, key: number): number {
  const base = key * LUMA_CANDIDATES;
  if (L.ready[key]) return base;
  const cr = ((key >> 11) & 31) * 8 + 3.5;
  const cg = ((key >> 5) & 63) * 4 + 1.5;
  const cb = (key & 31) * 8 + 3.5;
  const y = lumaOf(cr, cg, cb);
  const best = [Infinity, Infinity, Infinity, Infinity];
  const n = L.palette.count;
  for (let j = 0; j < n; j++) {
    if (Number.isNaN(L.tones[j * 3])) continue;
    const d = toneDistance(L.tones, j, y, cr - cg, cb - cg);
    for (let k = 0; k < LUMA_CANDIDATES; k++) {
      if (d < best[k]) {
        for (let m = LUMA_CANDIDATES - 1; m > k; m--) {
          best[m] = best[m - 1];
          L.candidates[base + m] = L.candidates[base + m - 1];
        }
        best[k] = d;
        L.candidates[base + k] = j;
        break;
      }
    }
  }
  /* 不透明的色不到 4 個：空的位置補第一個 */
  for (let k = 1; k < LUMA_CANDIDATES; k++)
    if (best[k] === Infinity) L.candidates[base + k] = L.candidates[base];
  L.ready[key] = 1;
  return base;
}

/**
 * 只擴散亮度的抖色：r 範圍內蛇行掃描（偶數列往右、奇數列往左），目標亮度＝原本的亮度＋累積的誤差（夾在 ±48），
 * 在這個顏色的 4 個候選色裡挑最接近（亮度用目標、色度用原色）的；誤差照 Floyd–Steinberg 的比例只往亮度擴散。
 * 完全透明（0）的像素對應到透明、不擴散。
 */
export function ditherRectLuma(
  canvas: Uint32Array,
  index: Uint8Array,
  W: number,
  r: Rect,
  L: LumaTable,
): void {
  const w = r.w;
  let cur = new Float32Array(w + 2);
  let next = new Float32Array(w + 2);
  const lim = LUMA_ERROR_LIMIT;
  const t = L.tones;
  for (let row = 0; row < r.h; row++) {
    const y = r.y + row;
    const dir = row % 2 ? -1 : 1;
    next.fill(0);
    for (let i = 0; i < w; i++) {
      const lx = dir === 1 ? i : w - 1 - i;
      const k = y * W + r.x + lx;
      const v = canvas[k];
      if (v >>> 24 === 0) {
        index[k] = L.clear;
        continue;
      }
      const R = v & 255;
      const G = (v >>> 8) & 255;
      const B = (v >>> 16) & 255;
      const e = lx + 1;
      const target = Math.max(
        0,
        Math.min(255, lumaOf(R, G, B) + Math.max(-lim, Math.min(lim, cur[e]))),
      );
      const base = lumaCandidates(L, ((R >> 3) << 11) | ((G >> 2) << 5) | (B >> 3));
      let chosen = L.candidates[base];
      let min = Infinity;
      for (let c = 0; c < LUMA_CANDIDATES; c++) {
        const j = L.candidates[base + c];
        const d = toneDistance(t, j, target, R - G, B - G);
        if (d < min) {
          min = d;
          chosen = j;
        }
      }
      index[k] = chosen;
      const delta = Math.max(-lim, Math.min(lim, target - t[chosen * 3]));
      cur[e + dir] += (delta * 7) / 16;
      next[e - dir] += (delta * 3) / 16;
      next[e] += (delta * 5) / 16;
      next[e + dir] += delta / 16;
    }
    const tmp = cur;
    cur = next;
    next = tmp;
  }
}
