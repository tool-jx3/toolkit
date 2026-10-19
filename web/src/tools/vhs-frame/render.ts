/**
 * 畫錄影帶的畫面（預覽與匯出同一段程式；規格 3.2～3.5）：
 * - 照片層（compose）：照片依位置畫上、調色、浮起暗部，拆成紅綠藍三張色版；照片、位置、比例、合成寬度改變時才重做。
 * - 一格（frame）：訊號層（色差、撕裂、掉訊或無訊號 → 字幕、左上文字與時間碼 → 追蹤條 → 雜訊 → 掃描線 → 亮帶）
 *   → 映像管的弧面 → 暗角、玻璃反光 → 圓角。
 * 效果的算式與數值照原作（FX）；同樣的 t、磨損度、照片與位置，畫出來的像素與原作相同（雜訊用固定種子，D3）。
 * 中間用的畫布依大小留著重複用（每個 VhsRenderer 一組；預覽與匯出各用各的）。
 */
import { makeCanvas } from '@/core/image';
import { canvasFilterSupported } from '@/core/scene';
import { createRandom } from '@/core/timeline';
import { captionFont, NO_SIGNAL, OSD_FONT_SPEC, osdFontCss } from './fonts';
import {
  type Aspect,
  coverScale,
  heightFor,
  type OsdFont,
  type PhotoView,
  SCREEN_W,
  type Size,
  screenSize,
  viewRect,
} from './model';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/* ---------- 效果的數值（照原作） ---------- */

export const FX = {
  /** 照片的調色：CSS 濾鏡（飽和度、對比、亮度）＋以「相加」疊上的暗部浮起 */
  grade: {
    filter: 'saturate(0.78) contrast(0.9) brightness(1.06)',
    saturate: 0.78,
    contrast: 0.9,
    brightness: 1.06,
    lift: 'rgba(34,48,66,0.30)',
  },
  /** 色差：紅藍左右錯開 (base ＋ perWear × 磨損) × k ＋ 抖動；綠色往下 */
  chroma: {
    base: 1.2,
    perWear: 6.5,
    wobble: 0.5,
    wobbleSpeed: 2.7,
    jitterRate: 20,
    jitter: 2,
    greenRate: 13,
    greenSeed: 7,
    green: 1.2,
  },
  /** 橫向撕裂 */
  tear: { perWear: 5.5, rate: 6, seedStep: 17, seedLine: 91, height: 0.045, shift: 0.13 },
  /** 磁帶掉訊 */
  dropout: {
    perWear: 7,
    rate: 9,
    seedStep: 31,
    seedLine: 53,
    skip: 0.55,
    width: 0.07,
    minWidth: 6,
    light: 'rgba(255,255,255,0.55)',
    dark: 'rgba(0,0,0,0.6)',
  },
  /** 追蹤條 */
  tracking: {
    speed: 0.075,
    cycle: 1.45,
    lead: 0.22,
    from: -0.12,
    to: 1.02,
    height: 0.035,
    heightWear: 0.05,
    rate: 4,
    shift: 0.05,
    shiftBase: 0.4,
    glow: 0.1,
    glowWear: 0.14,
  },
  /** 雜訊 */
  noise: { tiles: 6, size: 168, rate: 14, offsetRate: 17, alpha: 0.07, alphaWear: 0.19, cell: 420 },
  /** 掃描線 */
  scan: { lines: 190, alpha: 0.3, alphaWear: 0.1 },
  /** 亮帶 */
  hum: { speed: 0.11, cycle: 1.6, lead: 0.3, height: 0.3, glow: 0.045 },
  /** 映像管的弧面 */
  barrel: { amount: 0.028, strips: 75, minStrip: 6 },
  /** 暗角與玻璃反光 */
  vignette: { inner: 0.3, outer: 0.8, color: 'rgba(0,0,0,0.72)' },
  glass: { toX: 0.75, toY: 0.9 },
  /** 圓角（短邊的比例） */
  corner: 0.075,
  /** 無訊號 */
  blue: '#1A21A8',
  /** 字幕 */
  caption: {
    size: 0.062,
    bottom: 0.1,
    lineHeight: 1.28,
    stroke: 0.2,
    minStroke: 3,
    strokeColor: 'rgba(0,0,0,0.88)',
    fill: '#F2EFE4',
    /** 新版：最寬的一行超過畫面寬的這個比例就縮小（F15） */
    maxWidth: 0.9,
  },
  /** 左上文字與時間碼 */
  osd: {
    size: 0.042,
    pad: 0.055,
    shadow: 0.09,
    shadowColor: 'rgba(0,0,0,0.75)',
    fill: '#EDEDE6',
    /** 新版：「●」的紅色（F21） */
    dot: '#E8402F',
  },
  noSignal: { size: 0.058, lift: 0.02, color: 'rgba(255,255,255,0.92)' },
} as const;

/** 由整數決定的 0～1 的數（同一個 n 永遠相同；原作的做法） */
export function rnd(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------- 雜訊顆粒（固定種子，D3） ---------- */

/** 雜訊顆粒的亂數種子（mulberry32；對等驗證時把同一個產生器換進原作） */
export const NOISE_SEED = 0x76687321;

let tiles: AnyCanvas[] | null = null;

/** 6 張 168 × 168 的灰色顆粒（2 × 2 px 一顆，亮度 0～254） */
export function noiseTiles(): AnyCanvas[] {
  if (tiles) return tiles;
  const rand = createRandom(NOISE_SEED);
  const N = FX.noise.size;
  const out: AnyCanvas[] = [];
  for (let n = 0; n < FX.noise.tiles; n++) {
    const c = makeCanvas(N, N);
    const x = ctx2d(c);
    const img = x.createImageData(N, N);
    const d = img.data;
    for (let y = 0; y < N; y += 2) {
      for (let px = 0; px < N; px += 2) {
        const v = (rand.next() * 255) | 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const o = ((y + dy) * N + (px + dx)) * 4;
            d[o] = v;
            d[o + 1] = v;
            d[o + 2] = v;
            d[o + 3] = 255;
          }
      }
    }
    x.putImageData(img, 0, 0);
    out.push(c);
  }
  tiles = out;
  return out;
}

/* ---------- 調色（畫布不支援濾鏡時，D13） ---------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * CSS 的 saturate(s) contrast(c) brightness(b)（濾鏡效果規格的矩陣與轉換，sRGB 數值、每一步夾在 0～1），就地改 RGBA（不預乘）的 RGB。
 */
export function gradePixels(
  px: Uint8ClampedArray | Uint8Array,
  s: number = FX.grade.saturate,
  c: number = FX.grade.contrast,
  b: number = FX.grade.brightness,
): void {
  const m = [
    0.213 + 0.787 * s,
    0.715 - 0.715 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 + 0.285 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 - 0.715 * s,
    0.072 + 0.928 * s,
  ];
  const step = (v: number) => clamp01(clamp01((clamp01(v) - 0.5) * c + 0.5) * b);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const bl = px[i + 2] / 255;
    px[i] = Math.round(step(m[0] * r + m[1] * g + m[2] * bl) * 255);
    px[i + 1] = Math.round(step(m[3] * r + m[4] * g + m[5] * bl) * 255);
    px[i + 2] = Math.round(step(m[6] * r + m[7] * g + m[8] * bl) * 255);
  }
}

/* ---------- 一格的輸入 ---------- */

/** 照片層：紅綠藍三張色版 */
export interface Master {
  r: AnyCanvas;
  g: AnyCanvas;
  b: AnyCanvas;
  width: number;
  height: number;
}

export interface FrameParams {
  /** 畫面的時間（秒） */
  t: number;
  /** 磨損（0～1） */
  wear: number;
  /** 照片層；null＝無訊號 */
  master: Master | null;
  /** 這一格要畫的字幕（逐字打出時是打到的部分） */
  caption: readonly string[];
  /** 完整的字幕（決定字級；F15） */
  captionFull: readonly string[];
  /** 左上文字（null＝不顯示） */
  osd: string | null;
  /** 時間碼（null＝不顯示） */
  timecode: string | null;
  font: OsdFont;
}

/* ---------- 畫圖 ---------- */

export class VhsRenderer {
  private readonly pool = new Map<string, AnyCanvas>();

  /** 依名稱與大小留著的中間畫布 */
  private canvas(key: string, w: number, h: number): AnyCanvas {
    const id = `${key}${w}x${h}`;
    let c = this.pool.get(id);
    if (!c) {
      c = makeCanvas(w, h);
      this.pool.set(id, c);
    }
    return c;
  }

  /**
   * 照片層（規格 3.2）：寬 res、高依比例；照片依位置畫上（高品質縮放）＋調色 → 相加疊上暗部浮起 → 拆成三張色版。
   */
  compose(
    photo: CanvasImageSource,
    img: Size,
    view: PhotoView,
    aspect: Aspect,
    res: number,
  ): Master {
    const W = res;
    const H = heightFor(res, aspect);
    const f = res / SCREEN_W;
    const box = screenSize(aspect);
    const r = viewRect(img, box, view);
    /* 與原作相同的算式：縮放＝蓋滿 × 倍率 × f */
    const s = coverScale(img, box) * view.zoom * f;
    const base = this.canvas(`base${res}`, W, H);
    const b = ctx2d(base);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#000';
    b.fillRect(0, 0, W, H);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    if (canvasFilterSupported()) {
      b.filter = FX.grade.filter;
      b.drawImage(photo, r.x * f, r.y * f, img.width * s, img.height * s);
      b.filter = 'none';
    } else {
      const tmp = this.canvas(`grade${res}`, W, H);
      const t = ctx2d(tmp);
      t.clearRect(0, 0, W, H);
      t.imageSmoothingEnabled = true;
      t.imageSmoothingQuality = 'high';
      t.drawImage(photo, r.x * f, r.y * f, img.width * s, img.height * s);
      const data = t.getImageData(0, 0, W, H);
      gradePixels(data.data);
      t.putImageData(data, 0, 0);
      b.drawImage(tmp, 0, 0);
    }
    b.imageSmoothingQuality = 'low';
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = FX.grade.lift;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
    const tint = { r: '#ff0000', g: '#00ff00', b: '#0000ff' } as const;
    const out = {} as Record<'r' | 'g' | 'b', AnyCanvas>;
    for (const k of ['r', 'g', 'b'] as const) {
      const c = this.canvas(`ch${k}${res}`, W, H);
      const x = ctx2d(c);
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, W, H);
      x.drawImage(base, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = tint[k];
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
      out[k] = c;
    }
    return { ...out, width: W, height: H };
  }

  /** 一格（規格 3.3）：畫到 dst（整張換掉；四角透明） */
  frame(dst: AnyCanvas, p: FrameParams): void {
    const W = dst.width;
    const H = dst.height;
    const ctx = ctx2d(dst);
    const sig = this.canvas('sig', W, H);
    /*
     * 每一格先重設訊號層（設定寬度＝清空畫布與狀態）：Chromium 的畫布被整張畫到另一張之後（撕裂、追蹤條的複本），
     * 之後畫在它上面的結果會差 1～3 階（原作也是這樣，同一個 t 先畫過別的格就略有不同）。重設之後每一格只由自己的設定決定，
     * 暫停的預覽與匯出的 PNG 逐像素相同（對等驗證 .impl-tmp/statecheck2.ts）。
     */
    sig.width = W;
    const x = ctx2d(sig);
    const { wear, t } = p;
    const k = W / SCREEN_W;

    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);

    if (!p.master) drawNoSignal(x, W, H, p.font);
    else {
      /* 色差 */
      const c = FX.chroma;
      const sh = (c.base + wear * c.perWear) * k;
      const j =
        Math.sin(t * c.wobbleSpeed) * c.wobble +
        rnd(Math.floor(t * c.jitterRate)) * wear * c.jitter;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(p.master.r, -(sh + j), 0, W, H);
      x.drawImage(
        p.master.g,
        0,
        rnd(Math.floor(t * c.greenRate) + c.greenSeed) * wear * c.green * k,
        W,
        H,
      );
      x.drawImage(p.master.b, sh + j, 0, W, H);
      x.globalCompositeOperation = 'source-over';

      /* 橫向撕裂：從畫撕裂之前的複本取帶子 */
      const tr = FX.tear;
      const bands = Math.floor(wear * tr.perWear);
      if (bands > 0) {
        const tmp = this.canvas('tmp', W, H);
        const tc = ctx2d(tmp);
        tc.clearRect(0, 0, W, H);
        tc.drawImage(sig, 0, 0);
        for (let i = 0; i < bands; i++) {
          const seed = Math.floor(t * tr.rate) * tr.seedStep + i * tr.seedLine;
          const by = Math.floor(rnd(seed) * (H - 4));
          const bh = Math.min(H - by, 2 + rnd(seed + 1) * H * tr.height);
          if (bh < 1) continue;
          const dx = (rnd(seed + 2) - 0.5) * W * tr.shift * wear;
          x.drawImage(tmp, 0, by, W, bh, dx, by, W, bh);
        }
      }

      /* 磁帶掉訊 */
      const dr = FX.dropout;
      const drops = Math.floor(wear * dr.perWear);
      for (let i = 0; i < drops; i++) {
        const seed = Math.floor(t * dr.rate) * dr.seedStep + i * dr.seedLine;
        if (rnd(seed + 5) > dr.skip) continue;
        x.fillStyle = rnd(seed + 6) > 0.5 ? dr.light : dr.dark;
        x.fillRect(
          rnd(seed) * W,
          rnd(seed + 1) * H,
          dr.minWidth + rnd(seed + 2) * W * dr.width,
          Math.max(1, k * 2),
        );
      }
    }

    /* 字幕、左上文字與時間碼（在訊號層裡） */
    drawCaption(x, W, H, p.caption, p.captionFull);
    drawOsd(x, W, H, p.osd, p.timecode, p.font);

    /* 追蹤條：從畫了文字之後的複本取帶子 */
    const tk = FX.tracking;
    const tb = ((t * tk.speed) % tk.cycle) - tk.lead;
    if (tb > tk.from && tb < tk.to) {
      const rawH = H * (tk.height + wear * tk.heightWear);
      const by = Math.max(0, Math.min(H - 2, Math.round(tb * H)));
      const bh = Math.max(1, Math.min(H - by, Math.round(rawH)));
      const tmp2 = this.canvas('tb', W, H);
      const t2 = ctx2d(tmp2);
      t2.clearRect(0, 0, W, H);
      t2.drawImage(sig, 0, 0);
      x.drawImage(
        tmp2,
        0,
        by,
        W,
        bh,
        (rnd(Math.floor(t * tk.rate)) - 0.5) * W * tk.shift * (tk.shiftBase + wear),
        by,
        W,
        bh,
      );
      const g = x.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${tk.glow + wear * tk.glowWear})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, by, W, bh);
    }

    /* 雜訊 */
    const nz = FX.noise;
    const tilesNow = noiseTiles();
    const nt = tilesNow[Math.floor(t * nz.rate) % nz.tiles];
    x.save();
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = nz.alpha + wear * nz.alphaWear;
    const off = -Math.floor(rnd(Math.floor(t * nz.offsetRate)) * nz.size);
    const sc = Math.max(1, Math.round(W / nz.cell));
    for (let yy = off; yy < H; yy += nz.size * sc)
      for (let xx = off; xx < W; xx += nz.size * sc)
        x.drawImage(nt, xx, yy, nz.size * sc, nz.size * sc);
    x.restore();

    /* 掃描線 */
    const per = Math.max(2, Math.round(H / FX.scan.lines));
    x.save();
    x.globalAlpha = FX.scan.alpha + wear * FX.scan.alphaWear;
    const pattern = x.createPattern(this.scanTile(per), 'repeat');
    if (pattern) {
      x.fillStyle = pattern;
      x.fillRect(0, 0, W, H);
    }
    x.restore();

    /* 亮帶 */
    const hm = FX.hum;
    const hy = (((t * hm.speed) % hm.cycle) - hm.lead) * H;
    const hg = x.createLinearGradient(0, hy, 0, hy + H * hm.height);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.5, `rgba(255,255,255,${hm.glow})`);
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hg;
    x.fillRect(0, hy, W, H * hm.height);

    /* 映像管的弧面 */
    this.barrel(sig, dst, FX.barrel.amount);

    /* 暗角與玻璃反光 */
    const vg = ctx.createRadialGradient(
      W / 2,
      H / 2,
      H * FX.vignette.inner,
      W / 2,
      H / 2,
      H * FX.vignette.outer,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, FX.vignette.color);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    const gl = ctx.createLinearGradient(0, 0, W * FX.glass.toX, H * FX.glass.toY);
    gl.addColorStop(0, 'rgba(255,255,255,0.055)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.012)');
    gl.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    /* 圓角：只留圓角矩形裡面 */
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#fff';
    const radius = Math.min(W, H) * FX.corner;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, W, H, radius);
    else ctx.rect(0, 0, W, H);
    ctx.fill();
    ctx.restore();
  }

  /** 掃描線的一組：寬 1、高 per，上面 round(per ÷ 2) px 黑色 */
  private scanTile(per: number): AnyCanvas {
    const id = `scan${per}`;
    let c = this.pool.get(id);
    if (!c) {
      c = makeCanvas(1, per);
      const x = ctx2d(c);
      x.fillStyle = '#000';
      x.fillRect(0, 0, 1, Math.max(1, Math.round(per * 0.5)));
      this.pool.set(id, c);
    }
    return c;
  }

  /** 弧面（規格 3.3 第 8 步）：先橫向、再縱向，以帶子伸長；中間伸長 amount、邊緣 0 */
  private barrel(src: AnyCanvas, dst: AnyCanvas, amount: number): void {
    const W = dst.width;
    const H = dst.height;
    const ctx = ctx2d(dst);
    const mid = this.canvas('bar', W, H);
    const m = ctx2d(mid);
    const S = Math.max(FX.barrel.minStrip, Math.round(H / FX.barrel.strips));
    m.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y += S) {
      const v = ((y + S / 2) / H) * 2 - 1;
      const w = W * (1 + amount * (1 - v * v));
      m.drawImage(src, 0, y, W, S + 1, (W - w) / 2, y, w, S + 1);
    }
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x += S) {
      const u = ((x + S / 2) / W) * 2 - 1;
      const h = H * (1 + amount * (1 - u * u));
      ctx.drawImage(mid, x, 0, S + 1, H, x, (H - h) / 2, S + 1, h);
    }
  }
}

/* ---------- 文字 ---------- */

/** 無訊號：藍底＋「NO SIGNAL」（D5：原作的第二行不畫） */
function drawNoSignal(x: Ctx, W: number, H: number, font: OsdFont): void {
  x.fillStyle = FX.blue;
  x.fillRect(0, 0, W, H);
  x.fillStyle = FX.noSignal.color;
  x.font = osdFontCss(font, Math.round(H * FX.noSignal.size * OSD_FONT_SPEC[font].scale));
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(NO_SIGNAL, W / 2, H / 2 - H * FX.noSignal.lift);
  x.textAlign = 'left';
}

/** 字幕的字級（F15：最寬的一行超過畫面寬 90% 時等比例縮小；不取整） */
export function captionSize(x: Ctx, W: number, H: number, full: readonly string[]): number {
  const base = Math.round(H * FX.caption.size);
  if (!full.length) return base;
  const max = W * FX.caption.maxWidth;
  let size = base;
  /* 字寬不一定和字級成正比（字型的微調）：縮了再量，最多 4 次 */
  for (let i = 0; i < 4; i++) {
    x.font = captionFont(size);
    const widest = Math.max(...full.map((s) => x.measureText(s).width));
    if (widest <= max) break;
    size = (size * max) / widest;
  }
  return size;
}

/** 字幕（規格 3.4）：最後一行的基線在 H − round(0.10H)，描黑邊再填色 */
function drawCaption(
  x: Ctx,
  W: number,
  H: number,
  lines: readonly string[],
  full: readonly string[],
): void {
  if (!lines.length) return;
  const c = FX.caption;
  const size = captionSize(x, W, H, full.length ? full : lines);
  x.font = captionFont(size);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.lineJoin = 'round';
  const lh = size * c.lineHeight;
  let y = H - Math.round(H * c.bottom) - (lines.length - 1) * lh;
  for (const ln of lines) {
    x.lineWidth = Math.max(c.minStroke, size * c.stroke);
    x.strokeStyle = c.strokeColor;
    x.strokeText(ln, W / 2, y);
    x.fillStyle = c.fill;
    x.fillText(ln, W / 2, y);
    y += lh;
  }
  x.textAlign = 'left';
}

/** 左上文字的一段一段（「●」另外一段，畫成紅色；F21） */
export function osdRuns(text: string): { text: string; dot: boolean }[] {
  const out: { text: string; dot: boolean }[] = [];
  for (const part of text.split(/(●+)/)) {
    if (part) out.push({ text: part, dot: part.startsWith('●') });
  }
  return out;
}

/** 左上文字與時間碼（規格 3.5）：先畫影子再畫字；左上靠左、時間碼靠右 */
function drawOsd(
  x: Ctx,
  W: number,
  H: number,
  label: string | null,
  timecode: string | null,
  font: OsdFont,
): void {
  if (!label && !timecode) return;
  const o = FX.osd;
  const size = Math.round(H * o.size * OSD_FONT_SPEC[font].scale);
  x.font = osdFontCss(font, size);
  x.textBaseline = 'top';
  const pad = Math.round(H * o.pad);
  const put = (txt: string, px: number, align: CanvasTextAlign, color: string = o.fill) => {
    x.textAlign = align;
    x.fillStyle = o.shadowColor;
    x.fillText(txt, px + size * o.shadow, pad + size * o.shadow);
    x.fillStyle = color;
    x.fillText(txt, px, pad);
  };
  if (label) {
    const runs = osdRuns(label);
    if (runs.length === 1 && !runs[0].dot) put(label, pad, 'left');
    else {
      let px = pad;
      for (const r of runs) {
        put(r.text, px, 'left', r.dot ? o.dot : o.fill);
        px += x.measureText(r.text).width;
      }
    }
  }
  if (timecode) put(timecode, W - pad, 'right');
  x.textAlign = 'left';
}
