/**
 * 畫一格 1920 × 1080 的播放畫面（規格 3.2～3.6）：背景、科技風的點格、黑膠、封面、文字區（標題、歌手、副標、歌詞、
 * 視覺化、進度條）、畫面下方的歌詞、邊框裝飾、掃描線、底片顆粒。預覽、PNG 與影片的每一格都用這裡。
 */
import { type LyricLine, lyricAt } from '@/core/lyrics';
import { fontCss } from './fonts';
import {
  bottomLyricDims,
  buildStack,
  type FittedText,
  type FrameLayout,
  fitText,
  frameLayout,
  letterSpacingFor,
  type Measure,
  type Stack,
  stackLyricDims,
  type TextStyle,
  vizBox,
} from './layout';
import {
  type FontId,
  FRAME_H,
  FRAME_W,
  formatClock as fmt,
  hudTextOf,
  lyricPositionOf,
  type Settings,
  timecode,
} from './model';
import { type Hsl, hsla, type Palette, type Theme } from './theme';
import {
  beatScale,
  FAKE_PEAKS,
  fakeBar,
  meterLevel,
  peakAt,
  peakCount,
  type VizState,
  wavePoints,
} from './viz';

const W = FRAME_W;
const H = FRAME_H;
const TAU = Math.PI * 2;

/** 封面與從封面做出來的東西 */
export interface CoverArt {
  /** 正方形的封面 */
  image: CanvasImageSource;
  /** 模糊的背景（1100 px） */
  blur: CanvasImageSource;
  palette: Palette;
  /** 示範封面（每格重畫） */
  demo: boolean;
}

export interface SceneLyrics {
  lines: readonly LyricLine[];
  translated: boolean;
}

export interface Scene {
  settings: Settings;
  art: CoverArt;
  theme: Theme;
  lyrics: SceneLyrics;
  /** 有音樂時：總長與整首的波形峰值 */
  audio: { duration: number; peaks: Float32Array } | null;
}

export interface FrameClock {
  /** 有音樂：歌曲的時間；沒有音樂：循環裡的時間 */
  t: number;
  /** 隨節拍的封面動態要不要作用（播放中或匯出中） */
  beat: boolean;
  /** 時域資料（波形；有音樂時） */
  timeDomain: ArrayLike<number> | null;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 循環的相位與黑膠的角度（規格 3.6） */
export function phaseAt(s: Settings, live: boolean, t: number): { ph: number; ang: number } {
  if (!s.motion) return { ph: 0, ang: 0 };
  if (live) return { ph: (t * TAU) / 8, ang: (t * TAU) / 1.8 };
  const L = s.export.loopLength;
  const lt = ((t % L) + L) % L;
  const ph = (lt / L) * TAU;
  return { ph, ang: ph * Math.max(1, Math.round(L / 1.8)) };
}

/** 決定性的雜訊圖（底片顆粒） */
function noiseCanvas(size: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = Math.floor((s / 2147483647) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tile(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const setSpacing = (ctx: CanvasRenderingContext2D, px: number) => {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px.toFixed(2)}px`;
};

/**
 * 畫面的繪製器：保留雜訊圖、點格與掃描線的花紋、文字堆疊與歌詞自動縮小的快取。
 * 同一個繪製器對應一張畫布（預覽一張、匯出另一張）。
 */
export class FrameRenderer {
  readonly ctx: CanvasRenderingContext2D;
  private readonly grain: CanvasPattern | null;
  private readonly dotLight: CanvasPattern | null;
  private readonly dotDark: CanvasPattern | null;
  private readonly scan: CanvasPattern | null;
  private stackKey = '';
  private stackValue: Stack | null = null;
  private fitCache = new Map<string, FittedText>();
  private fontKey = '';

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.grain = ctx.createPattern(noiseCanvas(256, 1007), 'repeat');
    this.dotLight = ctx.createPattern(
      tile(40, 40, (g) => {
        g.fillStyle = '#fff';
        g.fillRect(19, 19, 2, 2);
      }),
      'repeat',
    );
    this.dotDark = ctx.createPattern(
      tile(40, 40, (g) => {
        g.fillStyle = '#000';
        g.fillRect(19, 19, 2, 2);
      }),
      'repeat',
    );
    this.scan = ctx.createPattern(
      tile(4, 4, (g) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, 4, 1);
      }),
      'repeat',
    );
  }

  /** 字型載入完成等時候清掉量字的快取 */
  invalidate(fontKey: string): void {
    if (fontKey === this.fontKey) return;
    this.fontKey = fontKey;
    this.stackKey = '';
    this.fitCache.clear();
  }

  private setFont(font: FontId, style: TextStyle) {
    this.ctx.font = fontCss(font, style.weight, style.size);
    setSpacing(this.ctx, letterSpacingFor(style));
  }

  /** 量字（含字距） */
  measureFor(font: FontId): Measure {
    return (text, style) => {
      this.setFont(font, style);
      return this.ctx.measureText(text).width;
    };
  }

  /** 文字區的堆疊（設定不變時沿用） */
  stack(s: Settings, lyricsActive: boolean, translated: boolean): Stack {
    const pos = lyricPositionOf(s);
    const key = [
      s.title,
      s.artist,
      s.subtitle,
      s.font,
      s.layout,
      s.viz,
      s.progress,
      lyricsActive,
      pos,
      s.lyrics.size,
      s.lyrics.showNext,
      translated,
      this.fontKey,
    ].join('|');
    if (key === this.stackKey && this.stackValue) return this.stackValue;
    this.ctx.save();
    const v = buildStack(
      {
        layout: s.layout,
        title: s.title,
        artist: s.artist,
        subtitle: s.subtitle,
        viz: s.viz,
        progress: s.progress,
        lyricsActive,
        lyricPosition: pos,
        lyricSize: s.lyrics.size,
        lyricShowNext: s.lyrics.showNext,
        translated,
      },
      this.measureFor(s.font),
    );
    this.ctx.restore();
    this.stackKey = key;
    this.stackValue = v;
    return v;
  }

  /** 歌詞的自動縮小（最小 0.62 倍、一行）；快取 */
  private lyricFit(font: FontId, text: string, weight: number, size: number, maxW: number) {
    const key = [font, text, weight, size, maxW].join('|');
    let v = this.fitCache.get(key);
    if (v) return v;
    if (this.fitCache.size > 400) this.fitCache.clear();
    this.ctx.save();
    v = fitText(text, weight, size, Math.round(size * 0.62), maxW, 1, false, this.measureFor(font));
    this.ctx.restore();
    this.fitCache.set(key, v);
    return v;
  }

  /**
   * 畫一格。viz 是長條與低頻能量的狀態（呼叫端依頻譜更新）；clock 是這一格的時間。
   */
  draw(scene: Scene, viz: VizState, clock: FrameClock): void {
    const { settings: s, theme: T, art } = scene;
    const ctx = this.ctx;
    const live = !!scene.audio;
    const lay = frameLayout(s.layout);
    const tc = lay.text;
    const { ph, ang } = phaseAt(s, live, clock.t);
    const lyricsActive = s.lyrics.enabled && scene.lyrics.lines.length > 0;
    const translated = scene.lyrics.translated;
    const pos = live
      ? scene.audio!.duration
        ? clamp(clock.t / scene.audio!.duration, 0, 1)
        : 0
      : s.fakePosition;
    const dur = live ? scene.audio!.duration : s.fakeDuration;
    const songT = live ? clock.t : s.fakePosition * s.fakeDuration;
    const lyricT = songT - s.lyrics.offset;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    setSpacing(ctx, 0);
    this.background(T, art, ph, lay, s);
    if (s.deco === 'cyber') {
      ctx.save();
      ctx.globalAlpha = T.dark ? 0.08 : 0.1;
      ctx.fillStyle = (T.dark ? this.dotLight : this.dotDark) ?? 'transparent';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const a = lay.art;
    const fy = Math.sin(ph) * 6;
    const scale = live && s.react && clock.beat ? beatScale(viz.bass) : 1;
    if (lay.vinyl) this.vinyl(T, art, lay.vinyl.cx, lay.vinyl.cy + fy, lay.vinyl.R, ang);
    this.cover(T, art, s.radius, a.x, a.y + fy, a.s, scale);

    const st = this.stack(s, lyricsActive, translated);
    const center = tc.align === 'center';
    const vb = vizBox(tc);
    for (const it of st.items) {
      const y = st.top + it.y;
      if (it.k === 'title' || it.k === 'artist' || it.k === 'subtitle') {
        this.setFont(s.font, it);
        ctx.textAlign = center ? 'center' : 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle =
          it.k === 'title' ? hsla(T.ink) : it.k === 'artist' ? hsla(T.ink, 0.72) : hsla(T.ink, 0.5);
        it.lines.forEach((ln, i) => {
          ctx.fillText(ln, tc.x, y + i * it.size * 1.16);
        });
      } else if (it.k === 'viz') {
        if (s.viz === 'bars') this.bars(vb.x, y, vb.w, it.h, T, ph, live, viz, tc.bars);
        else if (s.viz === 'wave')
          this.wave(vb.x, y, vb.w, it.h, T, ph, live ? clock.timeDomain : null);
        else if (s.viz === 'peaks')
          this.peaks(vb.x, y, vb.w, it.h, T, pos, scene.audio?.peaks ?? FAKE_PEAKS);
      } else if (it.k === 'progress') {
        this.progress(vb.x, y, vb.w, T, pos, dur, s.font);
      } else if (it.k === 'lyrics') {
        this.lyricsStack(scene, tc.x, tc.w, y, center, lyricT);
      }
    }
    if (lyricsActive && lyricPositionOf(s) === 'bottom') this.lyricsBottom(scene, lyricT);
    this.deco(T, ph, lay, fy, live, songT, pos, viz.bass, s);
    if (s.deco === 'cyber' && s.scanlines && this.scan) {
      ctx.save();
      ctx.globalAlpha = T.dark ? 0.2 : 0.07;
      ctx.fillStyle = this.scan;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (s.grain && this.grain) {
      ctx.globalAlpha = 0.06;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* ---------- 背景 ---------- */

  private blob(col: Hsl, x: number, y: number, r: number, a: number) {
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hsla(col, a));
    g.addColorStop(1, hsla(col, 0));
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, W, H);
  }

  private background(T: Theme, art: CoverArt, ph: number, lay: FrameLayout, s: Settings) {
    const ctx = this.ctx;
    ctx.fillStyle = hsla(T.base);
    ctx.fillRect(0, 0, W, H);
    if (s.background === 'blur') {
      const sc = 2200 * (1 + 0.035 * Math.sin(ph));
      const dx = 28 * Math.cos(ph);
      const dy = 18 * Math.sin(ph * 2);
      ctx.drawImage(art.blur, W / 2 - sc / 2 + dx, H / 2 - sc / 2 + dy, sc, sc);
      ctx.fillStyle = hsla(T.base, T.dark ? 0.5 : 0.52);
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'gradient') {
      this.blob(T.b2, W * (0.24 + 0.05 * Math.sin(ph)), H * (0.3 + 0.08 * Math.cos(ph)), 1000, 0.9);
      this.blob(
        T.b3,
        W * (0.8 + 0.04 * Math.cos(ph)),
        H * (0.78 + 0.06 * Math.sin(ph * 2)),
        1050,
        0.85,
      );
      this.blob(
        T.acc,
        W * (0.62 + 0.06 * Math.sin(ph + 1.3)),
        H * (0.18 + 0.05 * Math.cos(ph + 0.4)),
        720,
        T.dark ? 0.22 : 0.28,
      );
    } else {
      const a = lay.art;
      this.blob(T.b2, a.x + a.s / 2, a.y + a.s / 2, 1100, T.dark ? 0.38 : 0.45);
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, T.dark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.06)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- 封面與黑膠 ---------- */

  private cover(
    T: Theme,
    art: CoverArt,
    radius: number,
    x: number,
    y: number,
    s: number,
    scale: number,
  ) {
    const ctx = this.ctx;
    const r = (radius * s) / 640;
    const cx = x + s / 2;
    const cy = y + s / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = T.dark ? 'rgba(0,0,0,0.5)' : hsla([T.base[0], 0.3, 0.2], 0.3);
    ctx.shadowBlur = 90;
    ctx.shadowOffsetY = 34;
    roundRect(ctx, x, y, s, s, r);
    ctx.fillStyle = hsla(T.base);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    roundRect(ctx, x, y, s, s, r);
    ctx.clip();
    ctx.drawImage(art.image, x, y, s, s);
    ctx.restore();
  }

  private vinyl(T: Theme, art: CoverArt, cx: number, cy: number, R: number, ang: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = T.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 26;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = '#0e0f11';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    for (let r = R * 0.37; r < R * 0.97; r += 5) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(-0.6, 0, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.07, 'rgba(255,255,255,0.11)');
      g.addColorStop(0.14, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(0.57, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.64, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.rotate(ang);
    const lr = R * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, lr, 0, TAU);
    ctx.clip();
    ctx.drawImage(art.image, -lr, -lr, lr * 2, lr * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, lr, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fillStyle = hsla(T.base);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 視覺化與進度條 ---------- */

  private bars(
    x: number,
    y: number,
    w: number,
    h: number,
    T: Theme,
    ph: number,
    live: boolean,
    viz: VizState,
    n: number,
  ) {
    const ctx = this.ctx;
    const gap = w / n;
    const bw = Math.max(3, gap * 0.32);
    const mid = y + h / 2;
    const hs = h * 0.68;
    ctx.fillStyle = hsla(T.acc);
    for (let i = 0; i < n; i++) {
      const v = live ? viz.bars[i] : fakeBar(i, ph);
      const bh = Math.max(bw, v * hs);
      roundRect(ctx, x + i * gap + (gap - bw) / 2, mid - bh / 2, bw, bh, bw / 2);
      ctx.fill();
    }
  }

  private wave(
    x: number,
    y: number,
    w: number,
    h: number,
    T: Theme,
    ph: number,
    td: ArrayLike<number> | null,
  ) {
    const ctx = this.ctx;
    const mid = y + h / 2;
    const vals = wavePoints(td, ph);
    const n = vals.length - 1;
    const pts = vals.map((v, i) => [x + (i / n) * w, mid + (v * h) / 2] as const);
    ctx.strokeStyle = hsla(T.ink, 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.lineTo(x + w, mid);
    ctx.stroke();
    ctx.strokeStyle = hsla(T.acc);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[n][0], pts[n][1]);
    ctx.stroke();
  }

  private peaks(
    x: number,
    y: number,
    w: number,
    h: number,
    T: Theme,
    prog: number,
    arr: ArrayLike<number>,
  ) {
    const ctx = this.ctx;
    const n = peakCount(w);
    const gap = w / n;
    const bw = 4;
    const mid = y + h / 2;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(bw, peakAt(arr, i, n) * h);
      ctx.fillStyle = (i + 0.5) / n <= prog ? hsla(T.acc) : hsla(T.ink, 0.18);
      roundRect(ctx, x + i * gap + (gap - bw) / 2, mid - bh / 2, bw, bh, bw / 2);
      ctx.fill();
    }
  }

  private progress(
    x: number,
    y: number,
    w: number,
    T: Theme,
    pos: number,
    dur: number,
    font: FontId,
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = hsla(T.ink, 0.16);
    roundRect(ctx, x, y, w, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = hsla(T.acc);
    roundRect(ctx, x, y, Math.max(5, w * pos), 5, 2.5);
    ctx.fill();
    this.setFont(font, { weight: 500, size: 22, title: false });
    ctx.textBaseline = 'top';
    ctx.fillStyle = hsla(T.ink, 0.6);
    ctx.textAlign = 'left';
    ctx.fillText(fmt(pos * dur), x, y + 18);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(dur), x + w, y + 18);
  }

  /* ---------- 歌詞 ---------- */

  private lyricLines(
    font: FontId,
    L: FittedText,
    x: number,
    y: number,
    align: CanvasTextAlign,
    col: string,
  ) {
    const ctx = this.ctx;
    this.setFont(font, L);
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = col;
    L.lines.forEach((ln, i) => {
      ctx.fillText(ln, x, y + i * L.size * 1.22);
    });
  }

  /** 淡入：開始後 0.22 秒內從透明到不透明 */
  private static fade(cur: LyricLine, t: number) {
    return clamp((t - cur.t) / 0.22, 0, 1);
  }

  private lyricsStack(scene: Scene, x: number, w: number, y: number, center: boolean, t: number) {
    const ctx = this.ctx;
    const { settings: s, theme: T, lyrics } = scene;
    const { current: cur, next: nx } = lyricAt(lyrics.lines, t);
    const z = stackLyricDims(s.lyrics.size, lyrics.translated);
    const al: CanvasTextAlign = center ? 'center' : 'left';
    ctx.save();
    const trY = y + z.s * 1.25 + z.gT;
    const nxY = y + z.s * 1.25 + (lyrics.translated ? z.gT + z.t * 1.25 : 0) + z.gN;
    if (cur) {
      const L = this.lyricFit(s.font, cur.text, 700, z.s, w);
      const a = FrameRenderer.fade(cur, t);
      const dy = (1 - a) * 10;
      ctx.globalAlpha = a;
      this.lyricLines(s.font, L, x, y + dy + (z.s - L.size) * 0.5, al, hsla(T.acc));
      if (cur.tr) {
        const R = this.lyricFit(s.font, cur.tr, 500, z.t, w);
        this.lyricLines(s.font, R, x, trY + dy + (z.t - R.size) * 0.5, al, hsla(T.ink, 0.7));
      }
    }
    if (s.lyrics.showNext && nx) {
      const L = this.lyricFit(s.font, nx.text, 500, z.n, w);
      ctx.globalAlpha = 1;
      this.lyricLines(s.font, L, x, nxY, al, hsla(T.ink, lyrics.translated ? 0.34 : 0.42));
    }
    ctx.restore();
  }

  private lyricsBottom(scene: Scene, t: number) {
    const ctx = this.ctx;
    const { settings: s, theme: T, lyrics } = scene;
    const { current: cur, next: nx } = lyricAt(lyrics.lines, t);
    const z = bottomLyricDims(s.lyrics.size, lyrics.translated);
    const maxW = W - 480;
    const base = H - 78;
    ctx.save();
    ctx.shadowColor = T.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 18;
    const nextH = s.lyrics.showNext ? z.n * 1.22 + z.gN : 0;
    const trH = lyrics.translated ? z.t * 1.22 + z.gT : 0;
    if (s.lyrics.showNext && nx) {
      const L = this.lyricFit(s.font, nx.text, 500, z.n, maxW);
      this.lyricLines(
        s.font,
        L,
        W / 2,
        base - z.n * 1.22,
        'center',
        hsla(T.ink, lyrics.translated ? 0.38 : 0.45),
      );
    }
    if (cur) {
      const L = this.lyricFit(s.font, cur.text, 700, z.s, maxW);
      const a = FrameRenderer.fade(cur, t);
      const dy = (1 - a) * 12;
      ctx.globalAlpha = a;
      this.lyricLines(
        s.font,
        L,
        W / 2,
        base - nextH - trH - z.s * 1.22 + (z.s - L.size) * 1.22 + dy,
        'center',
        hsla(T.ink),
      );
      if (cur.tr) {
        const R = this.lyricFit(s.font, cur.tr, 500, z.t, maxW);
        this.lyricLines(
          s.font,
          R,
          W / 2,
          base - nextH - z.t * 1.22 + (z.t - R.size) * 1.22 + dy,
          'center',
          hsla(T.acc),
        );
      }
    }
    ctx.restore();
  }

  /* ---------- 邊框裝飾 ---------- */

  private line(x1: number, y1: number, x2: number, y2: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private bracket(x: number, y: number, dx: number, dy: number, len: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  }

  private deco(
    T: Theme,
    ph: number,
    lay: FrameLayout,
    fy: number,
    live: boolean,
    t: number,
    pos: number,
    bass: number,
    s: Settings,
  ) {
    if (s.deco === 'none') return;
    const ctx = this.ctx;
    const m = 44;
    const L = 72;
    const acc = hsla(T.acc);
    const cyber = s.deco === 'cyber';
    ctx.save();
    ctx.lineCap = 'square';
    setSpacing(ctx, 0);
    /* 四邊的細線（角落括號之間） */
    ctx.strokeStyle = hsla(T.ink, 0.2);
    ctx.lineWidth = 1.5;
    this.line(m + L + 18, m, W - m - L - 18, m);
    this.line(m + L + 18, H - m, W - m - L - 18, H - m);
    this.line(m, m + L + 18, m, H - m - L - 18);
    this.line(W - m, m + L + 18, W - m, H - m - L - 18);
    /* 四個角落的括號 */
    ctx.strokeStyle = acc;
    ctx.lineWidth = 3;
    if (cyber) {
      ctx.shadowColor = acc;
      ctx.shadowBlur = 16;
    }
    this.bracket(m, m, 1, 1, L);
    this.bracket(W - m, m, -1, 1, L);
    this.bracket(m, H - m, 1, -1, L);
    this.bracket(W - m, H - m, -1, -1, L);
    ctx.shadowBlur = 0;
    if (!cyber) {
      ctx.restore();
      return;
    }

    /* 上下的尺規、左邊的刻度 */
    ctx.strokeStyle = hsla(T.ink, 0.32);
    ctx.lineWidth = 1.5;
    const rw = 560;
    const rx = W / 2 - rw / 2;
    for (let i = 0; i <= rw; i += 14) {
      const h = (i / 14) % 5 === 0 ? 14 : 7;
      this.line(rx + i, m + 7, rx + i, m + 7 + h);
      this.line(rx + i, H - m - 7, rx + i, H - m - 7 - h);
    }
    ctx.strokeStyle = acc;
    ctx.lineWidth = 2.5;
    this.line(W / 2, m + 7, W / 2, m + 27);
    this.line(W / 2, H - m - 7, W / 2, H - m - 27);
    ctx.strokeStyle = hsla(T.ink, 0.32);
    ctx.lineWidth = 1.5;
    for (let j = -7; j <= 7; j++) {
      const big = j % 3 === 0;
      this.line(m + 7, H / 2 + j * 16, m + 7 + (big ? 14 : 7), H / 2 + j * 16);
    }

    /* 右邊的音量表（14 格） */
    const segs = 14;
    const sh = 12;
    const sg = 5;
    const mh = segs * (sh + sg) - sg;
    const mx = W - m - 26;
    const my = H / 2 - mh / 2;
    const on = meterLevel({ live, bass, motion: s.motion, ph });
    for (let k = 0; k < segs; k++) {
      const y = my + mh - (k + 1) * (sh + sg) + sg;
      ctx.fillStyle = k < on ? acc : hsla(T.ink, 0.13);
      ctx.fillRect(mx, y, 10, sh);
    }

    /* 封面四周的準星 */
    const a = lay.art;
    const o = 24;
    const rl = 30;
    const ax = a.x - o;
    const ay = a.y + fy - o;
    const as = a.s + o * 2;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 2;
    ctx.shadowColor = acc;
    ctx.shadowBlur = 10;
    this.bracket(ax, ay, 1, 1, rl);
    this.bracket(ax + as, ay, -1, 1, rl);
    this.bracket(ax, ay + as, 1, -1, rl);
    this.bracket(ax + as, ay + as, -1, -1, rl);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hsla(T.ink, 0.35);
    ctx.lineWidth = 1.5;
    this.line(a.x + a.s / 2, ay - 8, a.x + a.s / 2, ay + 6);
    this.line(a.x + a.s / 2, ay + as - 6, a.x + a.s / 2, ay + as + 8);
    this.line(ax - 8, a.y + fy + a.s / 2, ax + 6, a.y + fy + a.s / 2);
    this.line(ax + as - 6, a.y + fy + a.s / 2, ax + as + 8, a.y + fy + a.s / 2);

    /* 角落文字 */
    if (s.hud) {
      const ty = m + 32;
      const by = H - m - 32;
      ctx.font = fontCss(s.font, 600, 16);
      setSpacing(ctx, 16 * 0.06);
      ctx.textBaseline = 'middle';
      const blink = !s.motion || Math.sin(ph * 4) > -0.35;
      if (blink) {
        ctx.fillStyle = acc;
        ctx.shadowColor = acc;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(m + 30, ty, 5, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = hsla(T.ink, 0.82);
      ctx.fillText(HUD_LABEL, m + 46, ty);
      ctx.textAlign = 'right';
      ctx.fillStyle = acc;
      ctx.fillText(timecode(t), W - m - 24, ty);
      ctx.font = fontCss(s.font, 500, 15);
      setSpacing(ctx, 0);
      ctx.fillStyle = hsla(T.ink, 0.5);
      ctx.textAlign = 'left';
      const bl = hudTextOf(s);
      if (bl) ctx.fillText(bl, m + 24, by);
      ctx.textAlign = 'right';
      ctx.fillText(`${String(Math.round(pos * 100)).padStart(3, '0')}%`, W - m - 24, by);
    }

    /* 慢慢往下掃的光 */
    if (s.motion) {
      const u = (((ph / TAU) % 1) + 1) % 1;
      const sy = u * (H + 240) - 120;
      const lg = ctx.createLinearGradient(0, sy - 130, 0, sy);
      lg.addColorStop(0, hsla(T.acc, 0));
      lg.addColorStop(1, hsla(T.acc, T.dark ? 0.07 : 0.06));
      ctx.fillStyle = lg;
      ctx.fillRect(0, sy - 130, W, 130);
      ctx.fillStyle = hsla(T.acc, T.dark ? 0.3 : 0.22);
      ctx.fillRect(0, sy, W, 1.5);
    }
    ctx.restore();
  }
}

/** 科技風左上角的文字（本站自己的字樣） */
export const HUD_LABEL = '正在播放';
