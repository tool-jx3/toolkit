/**
 * APNG 逐格編碼器。
 *
 * - 每一格只存跟前一格不同的矩形範圍（dispose NONE、blend SOURCE）。
 * - 連續相同的影格合併成一格並延長顯示時間；減色後才變得相同的影格也會合併。
 * - 可加一張不屬於動畫的「預設圖」（不支援 APNG 的看圖程式顯示這張）。
 * - quantize 開啟時減成最多 256 色（含半透明，見 palette.ts；paletteMethod 選調色盤的選法）；關閉時為全彩 RGBA。
 * - palette 給了固定調色盤時直接用它（不統計、不減色），像素必須是調色盤裡的顏色；完全透明的像素也保留原本的 RGB。
 *
 * 移植自 text-fx（本專案原創，MIT）的匯出流程，改成「一格一格餵進來」的串流介面。
 */
import {
  assertFrameSize,
  copyRect,
  diffRect,
  type EncodedFile,
  EncodeLimitError,
  type FrameEncoder,
  type Rect,
  type RgbaPixels,
  toU32,
  yieldToEventLoop,
} from './frames';
import { buildPalette, ColorStats, type PaletteMethod } from './palette';
import { type ApngFrame, assembleApng, type DeflateMode, packImage } from './png';

export interface ApngEncoderOptions {
  width: number;
  height: number;
  /** 每秒格數；每次 addFrame 預設佔 1/fps 秒 */
  fps: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** 減色成 256 色以內的調色盤 PNG（檔案通常小很多） */
  quantize?: boolean;
  /** 減色時的色數上限（2～256，預設 256） */
  maxColors?: number;
  /** 減色時調色盤的選法（預設 'median-cut'；'pca'＝主成分切割，見 palette.ts） */
  paletteMethod?: PaletteMethod;
  /**
   * 固定調色盤（RGBA 平鋪，每色 4 位元組，1～256 色，不可重複）。給了就輸出調色盤 PNG、忽略 quantize／maxColors：
   * 每個像素都必須與調色盤裡某一色完全相同（包含完全透明像素的 RGB），找不到時 addFrame 丟 RangeError。
   * 適合「顏色事先知道」的輸出（例如單色＋256 階透明度），檔案小且顏色完全不變。
   */
  palette?: Uint8Array;
  /**
   * 合併連續相同的影格（預設 true）。關掉時每次 addFrame 都存成一格
   * （相同的格只存 1×1 的範圍，檔案幾乎不變大；對等驗證需要和舊版影格數一致時使用）。
   */
  mergeIdentical?: boolean;
  deflate?: DeflateMode;
  /**
   * setStill 的畫面要不要放進檔案當預設圖（預設 true）。false 時只用在減色的統計（代表畫面加權），
   * 檔案的預設圖仍是第一格。
   */
  embedStill?: boolean;
  /** 減色時代表畫面的份量下限（份量＝影格數×0.35，預設下限 1） */
  stillWeightMin?: number;
  /**
   * 每格最少幾個 tick（預設 1：addFrame 的 ticks 不足 1 時以 1 計）。0＝允許延遲 0 的影格
   * （照原檔保留延遲 0，例：psd-studio 第 7 節裁定）；搭配 mergeIdentical: false 才能保證每格都留下。
   */
  minTicks?: number;
  /**
   * 壓好的影像資料累計超過這麼多位元組就放棄（預設不限）：addFrame（全彩、固定調色盤）或 finish（減色）
   * 丟出 EncodeLimitError。給「超過某個大小就不要了」的試編用（例：psd-studio 的容量壓縮），省下後面的時間；
   * 沒超過時輸出與不設上限完全相同。
   */
  maxBytes?: number;
}

interface Change {
  r: Rect;
  px: Uint32Array;
  count: number;
}

interface StoredFrame extends Rect {
  data: Uint8Array;
  count: number;
}

/** 把「幾格 1/fps 秒」換算成 APNG 的分數延遲 */
export function apngDelay(count: number, fps: number): { num: number; den: number } {
  if (Number.isInteger(fps) && fps > 0 && fps <= 65535 && count <= 65535)
    return { num: count, den: fps };
  return { num: Math.min(65535, Math.round((count * 1000) / fps)), den: 1000 };
}

/** 固定調色盤：顏色（Uint32，0xAABBGGRR）→ 索引 */
interface FixedPalette {
  colors: Uint8Array;
  index: Map<number, number>;
}

function fixedPalette(colors: Uint8Array): FixedPalette {
  const n = colors.length / 4;
  if (!Number.isInteger(n) || n < 1 || n > 256)
    throw new RangeError('固定調色盤必須是 1～256 色的 RGBA（每色 4 位元組）');
  const index = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v =
      (colors[i * 4] |
        (colors[i * 4 + 1] << 8) |
        (colors[i * 4 + 2] << 16) |
        (colors[i * 4 + 3] << 24)) >>>
      0;
    if (index.has(v)) throw new RangeError('固定調色盤裡有重複的顏色');
    index.set(v, i);
  }
  return { colors: new Uint8Array(colors), index };
}

/** 依固定調色盤把一塊像素換成索引 */
function toIndices(px: Uint32Array, pal: FixedPalette): Uint8Array {
  const out = new Uint8Array(px.length);
  let lastV = -1;
  let lastI = 0;
  for (let k = 0; k < px.length; k++) {
    const v = px[k];
    if (v !== lastV) {
      const i = pal.index.get(v);
      if (i === undefined) {
        const hex = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]
          .map((c) => c.toString(16).padStart(2, '0'))
          .join('');
        throw new RangeError(`像素顏色 #${hex} 不在固定調色盤裡`);
      }
      lastV = v;
      lastI = i;
    }
    out[k] = lastI;
  }
  return out;
}

export class ApngEncoder implements FrameEncoder {
  private readonly opt: Required<Omit<ApngEncoderOptions, 'palette'>>;
  private readonly fixed: FixedPalette | null;
  private prev: Uint32Array | null = null;
  private readonly stored: StoredFrame[] = [];
  private readonly changes: Change[] = [];
  private readonly stats: ColorStats | null;
  private stillPx: Uint32Array | null = null;
  private added = 0;
  private ticks = 0;
  private aborted = false;
  /** 已經壓好的影像資料（maxBytes 用） */
  private packed = 0;
  /** 超過 maxBytes 之後一律丟出這個 */
  private limited: EncodeLimitError | null = null;

  constructor(options: ApngEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    const { palette, ...rest } = options;
    this.opt = {
      plays: 0,
      quantize: false,
      maxColors: 256,
      paletteMethod: 'median-cut',
      mergeIdentical: true,
      deflate: 'auto',
      embedStill: true,
      stillWeightMin: 1,
      minTicks: 1,
      maxBytes: Number.POSITIVE_INFINITY,
      ...rest,
    };
    this.fixed = palette ? fixedPalette(palette) : null;
    this.stats = this.opt.quantize && !this.fixed ? new ColorStats(this.opt.maxColors) : null;
  }

  /** 設定預設圖（不屬於動畫）。通常是動畫最具代表性的一格。 */
  setStill(rgba: RgbaPixels): void {
    assertFrameSize(rgba, this.opt.width, this.opt.height);
    this.stillPx = new Uint32Array(toU32(rgba));
  }

  /**
   * 壓一塊影像並累計大小。有 maxBytes 時把剩下的額度交給 packImage（一塊壓到一半超過就停），
   * 超過時放掉暫存的影格並丟出 EncodeLimitError。progress：[這塊之前的進度, 這塊的份量]（不知道時 null）。
   */
  private async pack(
    pixels: Uint8Array,
    w: number,
    h: number,
    paletted: boolean,
    progress: [number, number] | null,
  ): Promise<Uint8Array> {
    const { maxBytes, deflate } = this.opt;
    if (maxBytes === Number.POSITIVE_INFINITY) {
      const data = await packImage(pixels, w, h, paletted, deflate);
      this.packed += data.length;
      return data;
    }
    let data: Uint8Array;
    try {
      data = await packImage(pixels, w, h, paletted, deflate, Math.max(0, maxBytes - this.packed));
    } catch (e) {
      if (!(e instanceof EncodeLimitError)) throw e;
      this.packed += e.bytes;
      this.fail(progress ? progress[0] + progress[1] * (e.progress ?? 1) : null);
    }
    this.packed += data.length;
    if (this.packed > maxBytes) this.fail(progress ? progress[0] + progress[1] : null);
    return data;
  }

  /** 超過 maxBytes：放掉暫存的影格，之後一律丟出同一個 EncodeLimitError */
  private fail(progress: number | null): never {
    this.limited = new EncodeLimitError(this.packed, progress);
    this.changes.length = 0;
    this.stored.length = 0;
    this.prev = null;
    throw this.limited;
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (this.limited) throw this.limited;
    const { width: W, height: H } = this.opt;
    assertFrameSize(rgba, W, H);
    const u32 = toU32(rgba);
    const t = Math.max(Math.max(0, this.opt.minTicks ?? 1), Math.round(ticks));
    this.added++;
    this.ticks += t;
    let r = this.prev ? diffRect(this.prev, u32, W, H) : { x: 0, y: 0, w: W, h: H };
    this.prev = u32;
    if (!r && !this.opt.mergeIdentical) r = { x: 0, y: 0, w: 1, h: 1 };
    if (!r) {
      const last = this.stats
        ? this.changes[this.changes.length - 1]
        : this.stored[this.stored.length - 1];
      last.count += t;
      return;
    }
    const px = copyRect(u32, W, r);
    if (this.fixed) {
      /* 固定調色盤：像素完全相同才算同一色，所以差分矩形與索引的差分一致，直接壓縮 */
      const idx = toIndices(px, this.fixed);
      const data = await this.pack(idx, r.w, r.h, true, null);
      this.stored.push({ ...r, data, count: t });
      return;
    }
    if (this.stats) {
      this.stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
      this.changes.push({ r, px, count: t });
      return;
    }
    const data = await this.pack(new Uint8Array(px.buffer), r.w, r.h, false, null);
    this.stored.push({ ...r, data, count: t });
  }

  abort(): void {
    this.aborted = true;
    this.changes.length = 0;
    this.stored.length = 0;
    this.prev = null;
  }

  async finish(): Promise<EncodedFile> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (this.limited) throw this.limited;
    if (!this.added) throw new Error('沒有任何影格');
    const { width: W, height: H, fps, plays } = this.opt;
    let frames: StoredFrame[] = this.stored;
    let palette: Uint8Array | null = null;
    let stillData: Uint8Array | null = null;
    let colors: EncodedFile['colors'];

    if (this.stats) {
      /* 預設圖是觀眾看最久的畫面：減色時給它相當於停留時間的份量 */
      if (this.stillPx)
        this.stats.add(
          this.stillPx,
          0,
          this.stillPx.length,
          Math.max(this.opt.stillWeightMin, Math.round(this.ticks * 0.35)),
        );
      const pal = buildPalette(this.stats, this.opt.maxColors, this.opt.paletteMethod);
      palette = pal.colors;
      colors = { lossless: pal.lossless, count: pal.count };
      let lastV = -1;
      let lastI = 0;
      const idxOf = (v: number) => {
        if (v !== lastV) {
          lastV = v;
          lastI = pal.indexOf(v);
        }
        return lastI;
      };
      /* 目前畫面的索引：減色後再比一次，減色後才相同的範圍不重存 */
      const cur = new Uint8Array(W * H);
      frames = [];
      for (let ci = 0; ci < this.changes.length; ci++) {
        const c = this.changes[ci];
        const { r } = c;
        const first = frames.length === 0;
        const tmp = new Uint8Array(r.w * r.h);
        let mx0 = r.w;
        let my0 = r.h;
        let mx1 = -1;
        let my1 = -1;
        for (let y = 0; y < r.h; y++) {
          const co = (r.y + y) * W + r.x;
          for (let x = 0; x < r.w; x++) {
            const id = idxOf(c.px[y * r.w + x]);
            tmp[y * r.w + x] = id;
            if (first || cur[co + x] !== id) {
              if (x < mx0) mx0 = x;
              if (x > mx1) mx1 = x;
              if (y < my0) my0 = y;
              if (y > my1) my1 = y;
              cur[co + x] = id;
            }
          }
        }
        if (!first && mx1 < 0) {
          if (this.opt.mergeIdentical) {
            frames[frames.length - 1].count += c.count;
            continue;
          }
          mx0 = 0;
          my0 = 0;
          mx1 = 0;
          my1 = 0;
        }
        if (first) {
          mx0 = 0;
          my0 = 0;
          mx1 = r.w - 1;
          my1 = r.h - 1;
        }
        const nw = mx1 - mx0 + 1;
        const nh = my1 - my0 + 1;
        const out = new Uint8Array(nw * nh);
        for (let y = 0; y < nh; y++) {
          out.set(tmp.subarray((my0 + y) * r.w + mx0, (my0 + y) * r.w + mx0 + nw), y * nw);
        }
        const n = this.changes.length;
        const data = await this.pack(out, nw, nh, true, [ci / n, 1 / n]);
        frames.push({ x: r.x + mx0, y: r.y + my0, w: nw, h: nh, data, count: c.count });
        if (ci % 8 === 7) await yieldToEventLoop();
      }
      if (this.stillPx && this.opt.embedStill) {
        const idx = new Uint8Array(W * H);
        for (let k = 0; k < idx.length; k++) idx[k] = idxOf(this.stillPx[k]);
        stillData = await this.pack(idx, W, H, true, null);
      }
    } else if (this.fixed) {
      palette = this.fixed.colors;
      colors = { lossless: true, count: this.fixed.colors.length / 4 };
      if (this.stillPx && this.opt.embedStill)
        stillData = await this.pack(toIndices(this.stillPx, this.fixed), W, H, true, null);
    } else if (this.stillPx && this.opt.embedStill) {
      stillData = await this.pack(new Uint8Array(this.stillPx.buffer), W, H, false, null);
    }

    const apngFrames: ApngFrame[] = frames.map((f) => {
      const d = apngDelay(f.count, fps);
      return { x: f.x, y: f.y, w: f.w, h: f.h, data: f.data, delayNum: d.num, delayDen: d.den };
    });
    const bytes = assembleApng({
      width: W,
      height: H,
      palette,
      plays,
      still: stillData,
      frames: apngFrames,
    });
    return {
      bytes,
      mime: 'image/png',
      ext: 'png',
      width: W,
      height: H,
      frames: this.added,
      storedFrames: apngFrames.length,
      duration: this.ticks / fps,
      colors,
    };
  }
}
