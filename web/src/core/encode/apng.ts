/**
 * APNG 逐格編碼器。
 *
 * - 每一格只存跟前一格不同的矩形範圍（dispose NONE、blend SOURCE）。
 * - 連續相同的影格合併成一格並延長顯示時間；減色後才變得相同的影格也會合併。
 * - 可加一張不屬於動畫的「預設圖」（不支援 APNG 的看圖程式顯示這張）。
 * - quantize 開啟時減成最多 256 色（含半透明，見 palette.ts）；關閉時為全彩 RGBA。
 *
 * 移植自 text-fx（本專案原創，MIT）的匯出流程，改成「一格一格餵進來」的串流介面。
 */
import {
  assertFrameSize,
  copyRect,
  diffRect,
  type EncodedFile,
  type FrameEncoder,
  type Rect,
  type RgbaPixels,
  toU32,
  yieldToEventLoop,
} from './frames';
import { buildPalette, ColorStats } from './palette';
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
  /**
   * 合併連續相同的影格（預設 true）。關掉時每次 addFrame 都存成一格
   * （相同的格只存 1×1 的範圍，檔案幾乎不變大；對等驗證需要和舊版影格數一致時使用）。
   */
  mergeIdentical?: boolean;
  deflate?: DeflateMode;
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

export class ApngEncoder implements FrameEncoder {
  private readonly opt: Required<ApngEncoderOptions>;
  private prev: Uint32Array | null = null;
  private readonly stored: StoredFrame[] = [];
  private readonly changes: Change[] = [];
  private readonly stats: ColorStats | null;
  private stillPx: Uint32Array | null = null;
  private added = 0;
  private ticks = 0;
  private aborted = false;

  constructor(options: ApngEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    this.opt = {
      plays: 0,
      quantize: false,
      maxColors: 256,
      mergeIdentical: true,
      deflate: 'auto',
      ...options,
    };
    this.stats = this.opt.quantize ? new ColorStats(this.opt.maxColors) : null;
  }

  /** 設定預設圖（不屬於動畫）。通常是動畫最具代表性的一格。 */
  setStill(rgba: RgbaPixels): void {
    assertFrameSize(rgba, this.opt.width, this.opt.height);
    this.stillPx = new Uint32Array(toU32(rgba));
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    const { width: W, height: H } = this.opt;
    assertFrameSize(rgba, W, H);
    const u32 = toU32(rgba);
    const t = Math.max(1, Math.round(ticks));
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
    if (this.stats) {
      this.stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
      this.changes.push({ r, px, count: t });
      return;
    }
    const data = await packImage(new Uint8Array(px.buffer), r.w, r.h, false, this.opt.deflate);
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
    if (!this.added) throw new Error('沒有任何影格');
    const { width: W, height: H, fps, plays, deflate } = this.opt;
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
          Math.max(1, Math.round(this.ticks * 0.35)),
        );
      const pal = buildPalette(this.stats, this.opt.maxColors);
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
        const data = await packImage(out, nw, nh, true, deflate);
        frames.push({ x: r.x + mx0, y: r.y + my0, w: nw, h: nh, data, count: c.count });
        if (ci % 8 === 7) await yieldToEventLoop();
      }
      if (this.stillPx) {
        const idx = new Uint8Array(W * H);
        for (let k = 0; k < idx.length; k++) idx[k] = idxOf(this.stillPx[k]);
        stillData = await packImage(idx, W, H, true, deflate);
      }
    } else if (this.stillPx) {
      stillData = await packImage(new Uint8Array(this.stillPx.buffer), W, H, false, deflate);
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
