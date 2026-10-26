/**
 * SF 標題的繪製：8 個 HUD 範本畫在 1200 × 400 的設計空間（依輸出尺寸置中縮放），
 * 再疊上顆粒雜訊、掃描線、光暈與故障切片。只依設定與時間 t 畫，同一個時間點永遠畫出同一格。
 *
 * 範本的構圖參考 Mellow Noise 的「SF 타이틀 메이커」，畫法、細節與文字由本站自寫（見 sf.ts）。
 */
import { hashUnit, seedOf, timeSlot } from '@/core/timeline';
import { createSpriteCanvas, type SpriteCanvas } from '@/core/typeset';
import type { Settings } from './settings';
import {
  SF_LIMITS,
  SF_MONO_FONT,
  type SfTemplateId,
  sfAlpha,
  sfCjkFont,
  sfCodeOf,
  sfCycle,
  sfDecode,
  sfFit,
  sfGlitchAmount,
  sfOf,
  sfPhase,
  sfSeg,
  sfTiming,
} from './sf';

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
const TAU = Math.PI * 2;

/* ---------- 字型 ---------- */

export interface SfFontSet {
  /** 標題：英文字型＋中文字型 */
  title: (weight: number, px: number) => string;
  /** 小字：等寬字型＋中文字型 */
  mono: (px: number) => string;
}

const quote = (f: string) => `"${f.replace(/["\\]/g, '')}"`;

export function sfFonts(cfg: Pick<Settings, 'sf'>): SfFontSet {
  const sf = sfOf(cfg);
  const cjk = quote(sfCjkFont(sf.cjk).family);
  const latin = quote(sf.latin);
  const px = (v: number) => Math.round(v * 100) / 100;
  return {
    title: (w, size) => `${w} ${px(size)}px ${latin}, ${cjk}, sans-serif`,
    mono: (size) => `400 ${px(size)}px ${quote(SF_MONO_FONT)}, ${cjk}, monospace`,
  };
}

/* ---------- 一格的資料與畫圖小工具 ---------- */

export interface SfFrame {
  /** 已套用設計空間座標的畫布 */
  ctx: Ctx;
  t: number;
  D: number;
  /** 登場進度、退場進度 */
  ip: number;
  op: number;
  main: string;
  accent: string;
  title: string;
  sub: string;
  code: string;
  num: string;
  fonts: SfFontSet;
  /** 光澤用的暫存畫布（和畫布同尺寸）；沒有時不畫光澤（測試用） */
  scratch: { c: SpriteCanvas; x: Ctx } | null;
}

interface TextOpts {
  mono?: boolean;
  weight?: number;
  align?: CanvasTextAlign;
  /** 字距（設計空間的 px） */
  track?: number;
  alpha?: number;
  color?: string;
  /** 鏤空（把底下的色塊挖掉） */
  knock?: boolean;
  /** 光澤掃過 */
  sheen?: boolean;
}

export class Hud {
  constructor(readonly f: SfFrame) {}

  get x(): Ctx {
    return this.f.ctx;
  }

  /** 登場進度在 a～b 之間時 0→1 */
  seg(a: number, b: number): number {
    return sfSeg(this.f.ip, a, b);
  }

  /** 一個循環裡轉 n 圈的相位 */
  cyc(n: number): number {
    return sfCycle(this.f.t, this.f.D, n);
  }

  get settled(): boolean {
    return this.f.ip >= 1;
  }

  decode(s: string, p: number): string {
    return sfDecode(s, p, this.f.t);
  }

  /** 以 k 倍的不透明度畫 fn 裡的東西 */
  fade(k: number, fn: () => void): void {
    if (k <= 0) return;
    const c = this.x;
    c.save();
    c.globalAlpha *= Math.min(1, k);
    fn();
    c.restore();
  }

  /** 線段：從起點畫到 p（0～1）的位置 */
  line(x1: number, y1: number, x2: number, y2: number, w = 2, p = 1): void {
    if (p <= 0) return;
    const c = this.x;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 + (x2 - x1) * Math.min(1, p), y1 + (y2 - y1) * Math.min(1, p));
    c.stroke();
  }

  /** 折線：依長度畫到 p 的位置（close：回到起點） */
  poly(pts: readonly Pt[], p: number, w = 2, close = false): void {
    if (p <= 0 || pts.length < 2) return;
    const path = close ? [...pts, pts[0]] : pts;
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      lens.push(d);
      total += d;
    }
    let left = total * Math.min(1, p);
    const c = this.x;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length && left > 0; i++) {
      const k = Math.min(1, left / lens[i - 1]);
      const [ax, ay] = path[i - 1];
      c.lineTo(ax + (path[i][0] - ax) * k, ay + (path[i][1] - ay) * k);
      left -= lens[i - 1];
    }
    c.stroke();
  }

  /** 實心多邊形 */
  shape(pts: readonly Pt[], color?: string): void {
    const c = this.x;
    if (color) c.fillStyle = color;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fill();
  }

  /** 四個角的 L 形角線（長度 len×p） */
  corners(x: number, y: number, w: number, h: number, len: number, p: number, lw = 2): void {
    const l = len * Math.min(1, p);
    if (l <= 0) return;
    const c = this.x;
    c.lineWidth = lw;
    c.beginPath();
    for (const [cx, cy, sx, sy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x + w, y + h, -1, -1],
      [x, y + h, 1, -1],
    ] as const) {
      c.moveTo(cx, cy + sy * l);
      c.lineTo(cx, cy);
      c.lineTo(cx + sx * l, cy);
    }
    c.stroke();
  }

  arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number): void {
    if (r <= 0 || a1 <= a0) return;
    const c = this.x;
    c.lineWidth = w;
    c.beginPath();
    c.arc(cx, cy, r, a0, a1);
    c.stroke();
  }

  dot(cx: number, cy: number, r: number, color?: string): void {
    if (r <= 0) return;
    const c = this.x;
    if (color) c.fillStyle = color;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();
  }

  private setFont(c: Ctx, px: number, o: TextOpts): void {
    c.font = o.mono ? this.f.fonts.mono(px) : this.f.fonts.title(o.weight ?? 700, px);
    if ('letterSpacing' in c) c.letterSpacing = `${o.track ?? 0}px`;
  }

  /** 字的寬度（含字距） */
  measure(str: string, px: number, o: TextOpts = {}): number {
    const c = this.x;
    c.save();
    this.setFont(c, px, o);
    const w = c.measureText(str || ' ').width;
    c.restore();
    return w;
  }

  /** 放不下 maxW 時縮小（最小 min px）；字距是固定的 px，不跟著字級縮 */
  fit(str: string, base: number, maxW: number, o: TextOpts = {}, min = 14): number {
    const w = this.measure(str, base, o);
    if (w <= maxW) return base;
    const fixed = (o.track ?? 0) * Array.from(str || ' ').length;
    return Math.max(min, (base * Math.max(0, maxW - fixed)) / Math.max(1, w - fixed));
  }

  /** 副文字（等寬小字）：放不下 maxW 時縮小，依完整的副文字算（解碼中字級不跳動） */
  subText(str: string, x: number, y: number, px: number, maxW: number, o: TextOpts = {}): number {
    const opts = { ...o, mono: true };
    return this.text(str, x, y, this.fit(this.f.sub, px, maxW, opts, 8), opts);
  }

  /** 畫字，回傳寬度 */
  text(str: string, x: number, y: number, px: number, o: TextOpts = {}): number {
    if (!str) return 0;
    const c = this.x;
    c.save();
    this.setFont(c, px, o);
    c.textAlign = o.align ?? 'left';
    c.textBaseline = 'alphabetic';
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    const w = c.measureText(str).width;
    if (o.knock) {
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000000';
      c.fillText(str, x, y);
    } else if (o.sheen && this.f.scratch) {
      this.sheenText(str, x, y, px, w, o);
    } else {
      c.fillStyle = o.color ?? this.f.main;
      c.fillText(str, x, y);
    }
    c.restore();
    return w;
  }

  /** 光澤：字先畫在暫存畫布，亮帶只疊在字上，再整張貼回來（每個循環掃過一次） */
  private sheenText(str: string, x: number, y: number, px: number, w: number, o: TextOpts): void {
    const c = this.x;
    const s = this.f.scratch!;
    const sx = s.x;
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1;
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, s.c.width, s.c.height);
    sx.setTransform(c.getTransform());
    sx.font = c.font;
    if ('letterSpacing' in sx) sx.letterSpacing = `${o.track ?? 0}px`;
    sx.textAlign = c.textAlign;
    sx.textBaseline = 'alphabetic';
    sx.fillStyle = o.color ?? this.f.main;
    sx.fillText(str, x, y);
    const left = c.textAlign === 'center' ? x - w / 2 : c.textAlign === 'right' ? x - w : x;
    const pos = left - 160 + (w + 320) * this.cyc(1);
    const g = sx.createLinearGradient(pos - 90, 0, pos + 90, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sx.globalCompositeOperation = 'source-atop';
    sx.fillStyle = g;
    sx.fillRect(left - 200, y - px * 1.4, w + 400, px * 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(s.c, 0, 0);
  }
}

/* ---------- 8 個範本（設計空間 1200 × 400） ---------- */

const hexPts = (cx: number, cy: number, r: number, rot: number): Pt[] =>
  Array.from({ length: 6 }, (_, i) => [
    cx + Math.cos(rot + (i * TAU) / 6) * r,
    cy + Math.sin(rot + (i * TAU) / 6) * r,
  ]);

/** 準星：左邊轉動的瞄準環，右邊四角框住標題 */
function reticle(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const a = h.seg(0, 0.45);
  const b = h.seg(0.12, 0.6);
  const cc = h.seg(0.3, 0.8);
  const d = h.seg(0.45, 1);
  const cx = 210;
  const cy = 200;
  h.fade(a, () => {
    c.save();
    c.translate(cx, cy);
    c.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a);
    const spin = h.cyc(1) * TAU;
    /* 外圈：四段弧，登場時各自伸長 */
    for (let k = 0; k < 4; k++) {
      const a0 = spin + (k * TAU) / 4 + 0.2;
      h.arc(0, 0, 148, a0, a0 + (TAU / 4 - 0.4) * b, 2);
    }
    /* 刻度環：反方向慢轉，每 4 格一條長刻度 */
    h.fade(0.7, () => {
      c.save();
      c.rotate(-spin / 6);
      const n = Math.floor(48 * b);
      for (let i = 0; i < n; i++) {
        const an = (i * TAU) / 48;
        const long = i % 4 === 0;
        c.lineWidth = long ? 2 : 1;
        c.beginPath();
        c.moveTo(Math.cos(an) * 116, Math.sin(an) * 116);
        c.lineTo(Math.cos(an) * (long ? 132 : 124), Math.sin(an) * (long ? 132 : 124));
        c.stroke();
      }
      c.restore();
    });
    /* 三段粗弧：一個循環轉兩圈的三分之一 */
    const turn = (h.cyc(2) * TAU) / 3;
    for (let k = 0; k < 3; k++) {
      const a0 = turn + (k * TAU) / 3;
      h.arc(0, 0, 98, a0, a0 + 1.1 * cc, 8);
    }
    /* 點線環與內圈 */
    h.fade(0.75, () => {
      c.save();
      c.setLineDash([2, 6]);
      c.lineDashOffset = -h.cyc(1) * 64;
      h.arc(0, 0, 80, 0, TAU * cc, 1.5);
      c.restore();
    });
    h.arc(0, 0, 60, -Math.PI / 2, -Math.PI / 2 + TAU * cc, 1.5);
    /* 十字準線＋菱形指標 */
    h.fade(d, () => {
      for (let k = 0; k < 4; k++) {
        c.save();
        c.rotate((k * TAU) / 4);
        h.line(164, 0, 192, 0, 2);
        h.shape([
          [156, 0],
          [162, -5],
          [168, 0],
          [162, 5],
        ]);
        c.restore();
      }
    });
    /* 中心：脈動的小圈 */
    const pr = 10 * (1 + 0.2 * Math.sin(h.cyc(2) * TAU));
    h.arc(0, 0, pr * d, 0, TAU, 2);
    h.dot(0, 0, 3 * d);
    c.restore();
  });

  /* 右邊的框 */
  const fx = 404;
  const fy = 116;
  const fw = 756;
  const fh = 168;
  h.line(364, 200, fx, 200, 1.5, d);
  h.dot(fx, 200, 4 * d);
  h.corners(fx, fy, fw, fh, 28, h.seg(0.3, 0.75), 2.5);
  h.fade(0.45, () => {
    h.line(fx + 40, fy, fx + 320, fy, 1, h.seg(0.35, 0.8));
    h.line(fx + fw - 40, fy + fh, fx + 260, fy + fh, 1, h.seg(0.4, 0.85));
  });
  h.text(h.decode(f.code, h.seg(0.35, 0.8)), fx + 4, fy - 12, 15, {
    mono: true,
    track: 2,
    alpha: 0.8,
  });
  const hasSub = !!f.sub;
  const size = h.fit(f.title, 70, 680, { track: 2 });
  h.text(h.decode(f.title, h.seg(0.4, 1)), fx + 34, hasSub ? 212 : 200 + size * 0.35, size, {
    track: 2,
    sheen: true,
  });
  if (hasSub)
    h.subText(h.decode(f.sub, h.seg(0.55, 1)), fx + 36, 256, 18, 700, { track: 3, alpha: 0.8 });
  /* 右下角：依序亮起的四格 */
  const lit = Math.floor(h.cyc(4) * 4);
  for (let i = 0; i < 4; i++)
    h.fade(d * (lit === i ? 1 : 0.3), () => c.fillRect(fx + fw - 80 + i * 16, fy + fh - 20, 8, 8));
  /* 框外的尺規 */
  h.fade(0.5 * cc, () => {
    for (let y = fy + 12, i = 0; y < fy + fh - 8; y += 12, i++)
      h.line(fx + fw + 12, y, fx + fw + (i % 3 === 0 ? 30 : 20), y, 1);
  });
}

/** 資料掃描：定位點拉出引線，旁邊是讀數與進度格 */
function callout(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const a = h.seg(0, 0.3);
  h.fade(a, () => {
    h.arc(118, 298, 16, 0, TAU, 2);
    h.dot(118, 298, 5);
    const ph = h.cyc(2);
    h.fade((1 - ph) * 0.8, () => h.arc(118, 298, 16 + 34 * ph, 0, TAU, 1.5));
  });
  h.poly(
    [
      [130, 286],
      [214, 204],
      [332, 204],
    ],
    h.seg(0.05, 0.45),
    2,
  );
  h.text(h.decode(`ANALYZE // ${f.code}`, h.seg(0.3, 0.7)), 348, 132, 15, {
    mono: true,
    track: 2,
    alpha: 0.85,
  });
  const size = h.fit(f.title, 76, 600, { track: 1 });
  h.text(h.decode(f.title, h.seg(0.35, 0.9)), 346, 212, size, { track: 1, sheen: true });
  const ul = h.seg(0.3, 0.8);
  h.line(332, 234, 1112, 234, 2, ul);
  if (ul >= 1) c.fillRect(1106, 229, 10, 10);
  h.fade(0.5, () => {
    c.save();
    c.setLineDash([6, 6]);
    c.lineDashOffset = -h.cyc(2) * 48;
    h.line(348, 246, 760, 246, 1, h.seg(0.45, 0.9));
    c.restore();
  });
  if (f.sub) h.subText(h.decode(f.sub, h.seg(0.5, 1)), 348, 280, 17, 760, { track: 2, alpha: 0.8 });
  /* 右邊的讀數：登場時從 0% 跑上去，停留中在 96～100% 之間跳 */
  let pct = Math.floor(100 * h.seg(0.2, 0.9));
  if (h.settled) pct = 96 + Math.floor(hashUnit(timeSlot(f.t % f.D, 3), 9, 0x2d) * 5);
  pct = Math.min(100, pct);
  const pv = h.seg(0.25, 0.6);
  h.fade(pv, () => {
    h.text('LOCK', 1112, 150, 12, { mono: true, align: 'right', track: 3, alpha: 0.7 });
    h.text(`${String(pct).padStart(3, '0')}%`, 1112, 190, 30, { mono: true, align: 'right' });
    for (let i = 0; i < 10; i++)
      h.fade(i < pct / 10 ? 1 : 0.2, () =>
        h.shape([
          [994 + i * 12, 214],
          [998 + i * 12, 200],
          [1006 + i * 12, 200],
          [1002 + i * 12, 214],
        ]),
      );
  });
}

/** 警告面板：切角面板、閃爍的警示三角與斜紋警戒條 */
function warning(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const frame: Pt[] = [
    [192, 80],
    [1100, 80],
    [1100, 278],
    [1058, 320],
    [150, 320],
    [150, 122],
  ];
  h.poly(frame, h.seg(0, 0.5), 2.5, true);
  h.fade(0.3, () =>
    h.poly(
      frame.map(([x, y]) => [x + (x < 600 ? 10 : -10), y + (y < 200 ? 10 : -10)] as Pt),
      h.seg(0.1, 0.6),
      1,
      true,
    ),
  );
  const tp = h.seg(0.2, 0.6);
  c.save();
  c.strokeStyle = f.accent;
  c.lineJoin = 'round';
  h.poly(
    [
      [262, 140],
      [318, 236],
      [206, 236],
    ],
    tp,
    4,
    true,
  );
  if (tp >= 1 && (h.cyc(3) < 0.7 || !h.settled))
    h.text('!', 262, 226, 58, { color: f.accent, align: 'center', weight: 900 });
  c.restore();
  h.fade(0.5, () => h.line(360, 112, 360, 288, 1, h.seg(0.25, 0.65)));
  const hasSub = !!f.sub;
  const size = h.fit(f.title, 64, 660, { track: 1 });
  h.text(h.decode(f.title, h.seg(0.35, 0.95)), 390, hasSub ? 198 : 214, size, {
    track: 1,
    sheen: true,
  });
  if (hasSub)
    h.subText(h.decode(f.sub, h.seg(0.5, 1)), 392, 238, 17, 690, { track: 2, alpha: 0.8 });
  /* 警戒條：斜紋往右流動 */
  const hw = 668 * h.seg(0.4, 0.9);
  if (hw > 0) {
    c.save();
    c.beginPath();
    c.rect(390, 262, hw, 22);
    c.clip();
    c.fillStyle = f.accent;
    c.globalAlpha *= 0.9;
    const off = (h.cyc(1) * 84) % 28;
    for (let x = 362 + off; x < 1100; x += 28)
      h.shape([
        [x, 262],
        [x + 14, 262],
        [x + 36, 284],
        [x + 22, 284],
      ]);
    c.restore();
  }
  h.text(h.decode(`ALERT ${f.code}`, h.seg(0.3, 0.75)), 1080, 108, 13, {
    mono: true,
    align: 'right',
    track: 2,
    alpha: 0.75,
  });
  const lit = Math.floor(h.cyc(3) * 3);
  for (let i = 0; i < 3; i++)
    h.fade(h.seg(0.5, 0.9) * (lit === i ? 1 : 0.35), () => c.fillRect(1112, 150 + i * 30, 8, 20));
}

/** 賽博標籤：整塊斜角色塊，標題鏤空，旁邊有箭頭與條碼 */
function slab(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const rev = h.seg(0, 0.45);
  if (rev > 0) {
    c.save();
    c.beginPath();
    c.rect(130, 140, 940 * rev, 130);
    c.clip();
    h.shape([
      [144, 150],
      [1034, 150],
      [1062, 262],
      [172, 262],
    ]);
    c.restore();
  }
  const size = h.fit(f.title, 84, 800, { weight: 900, track: 1 });
  h.text(h.decode(f.title, h.seg(0.3, 0.9)), 194, 206 + size * 0.36, size, {
    weight: 900,
    track: 1,
    knock: true,
  });
  c.fillStyle = f.accent;
  h.fade(h.seg(0.1, 0.4), () => c.fillRect(116, 150, 12, 112));
  c.fillStyle = f.main;
  h.text(h.decode(f.code, h.seg(0.3, 0.7)), 174, 136, 14, { mono: true, track: 2, alpha: 0.85 });
  h.fade(0.6, () => h.line(420, 131, 1062, 131, 1, h.seg(0.25, 0.7)));
  c.fillStyle = f.accent;
  h.fade(h.seg(0.4, 0.8), () => {
    for (let i = 0; i < 3; i++) c.fillRect(1020 + i * 14, 118, 9, 9);
  });
  c.fillStyle = f.main;
  /* 右邊三個箭頭：亮度依序往右傳 */
  const ch = h.seg(0.45, 0.85);
  for (let i = 0; i < 3; i++) {
    const w = (((h.cyc(2) * 3 - i) % 3) + 3) % 3;
    const x = 1084 + i * 26;
    h.fade(ch * (0.25 + 0.75 * Math.max(0, 1 - w)), () =>
      h.shape([
        [x, 170],
        [x + 12, 170],
        [x + 30, 206],
        [x + 12, 242],
        [x, 242],
        [x + 18, 206],
      ]),
    );
  }
  /* 條碼：依標題與代碼雜湊決定粗細 */
  const bp = h.seg(0.4, 0.8);
  const seed = seedOf(f.title + f.code);
  for (let x = 172, i = 0; x < 172 + 250 * bp; i++) {
    const w = 1 + Math.floor(hashUnit(seed, i, 1) * 4);
    if (hashUnit(seed, i, 2) > 0.35) c.fillRect(x, 278, w, 30);
    x += w + 2;
  }
  if (f.sub)
    h.subText(h.decode(f.sub, h.seg(0.5, 1)), 446, 300, 16, 510, { track: 2, alpha: 0.85 });
  c.fillStyle = f.accent;
  h.fade(h.seg(0.6, 1), () => c.fillRect(974, 290, 60, 8));
}

/** 六角徽章：轉動的六角徽章，接一條箭頭形的鏤空標題帶 */
function hex(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const cx = 222;
  const cy = 200;
  const up = -Math.PI / 2;
  h.poly(hexPts(cx, cy, 112, up), h.seg(0, 0.5), 3, true);
  const outer = hexPts(cx, cy, 132, up);
  h.fade(0.6 * h.seg(0.2, 0.6), () => {
    for (const k of [0, 3]) {
      const [x1, y1] = outer[k];
      const [x2, y2] = outer[(k + 1) % 6];
      h.line(x1, y1, x2, y2, 2);
    }
  });
  /* 內圈六段：慢轉，亮的那一段依序換 */
  const inner = hexPts(cx, cy, 84, up + (h.cyc(1) * TAU) / 6);
  const hot = Math.floor(h.cyc(6) * 6);
  const sp = h.seg(0.25, 0.7);
  for (let k = 0; k < 6; k++) {
    const [x1, y1] = inner[k];
    const [x2, y2] = inner[(k + 1) % 6];
    h.fade(sp * (k === hot ? 1 : 0.45), () =>
      h.line(
        x1 + (x2 - x1) * 0.15,
        y1 + (y2 - y1) * 0.15,
        x1 + (x2 - x1) * 0.85,
        y1 + (y2 - y1) * 0.85,
        8,
      ),
    );
  }
  h.fade(h.seg(0.35, 0.8), () => {
    h.corners(cx - 26, cy - 26, 52, 52, 12, 1, 2);
    h.dot(cx, cy, 3);
  });
  /* 箭頭形的標題帶 */
  const bp = h.seg(0.25, 0.65);
  if (bp > 0) {
    c.save();
    c.beginPath();
    c.rect(360, 150, 780 * bp, 100);
    c.clip();
    h.shape([
      [366, 160],
      [1080, 160],
      [1120, 200],
      [1080, 240],
      [366, 240],
      [388, 200],
    ]);
    c.restore();
  }
  h.line(336, 200, 366, 200, 2, h.seg(0.2, 0.4));
  const size = h.fit(f.title, 56, 620, { weight: 800, track: 1 });
  h.text(h.decode(f.title, h.seg(0.4, 0.95)), 420, 200 + size * 0.36, size, {
    weight: 800,
    track: 1,
    knock: true,
  });
  h.fade(0.8, () => h.line(380, 140, 1080, 140, 1.5, h.seg(0.3, 0.75)));
  h.arc(1062, 128, 6 * h.seg(0.5, 0.8), 0, TAU, 1.5);
  h.text(h.decode(f.code, h.seg(0.4, 0.8)), 400, 130, 14, { mono: true, track: 2, alpha: 0.85 });
  h.fade(0.7, () => {
    c.save();
    c.setLineDash([12, 6]);
    c.lineDashOffset = -h.cyc(1) * 144;
    h.line(380, 262, 1100, 262, 2, h.seg(0.4, 0.85));
    c.restore();
  });
  if (f.sub)
    h.subText(h.decode(f.sub, h.seg(0.5, 1)), 400, 292, 16, 690, { track: 2, alpha: 0.85 });
}

/** 索引：鏤空標題的色帶，右邊菱形裡放編號 */
function index(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const bp = h.seg(0, 0.42);
  if (bp > 0) {
    c.save();
    c.beginPath();
    c.rect(900 - 760 * bp, 150, 760 * bp, 110);
    c.clip();
    c.fillRect(140, 160, 760, 86);
    c.restore();
  }
  const size = h.fit(f.title, 54, 520, { weight: 800, track: 2 });
  h.text(h.decode(f.title, h.seg(0.3, 0.9)), 176, 203 + size * 0.36, size, {
    weight: 800,
    track: 2,
    knock: true,
  });
  /* 鏤空的三個左箭頭 */
  for (let i = 0; i < 3; i++) {
    const w = (((h.cyc(3) * 3 + i) % 3) + 3) % 3;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = h.seg(0.4, 0.8) * (0.35 + (0.65 * w) / 3);
    const x = 768 + i * 34;
    c.fillStyle = '#000000';
    h.shape([
      [x + 22, 180],
      [x + 12, 180],
      [x - 6, 203],
      [x + 12, 226],
      [x + 22, 226],
      [x + 4, 203],
    ]);
    c.restore();
  }
  /* 菱形編號 */
  const dp = h.seg(0.3, 0.65);
  if (dp > 0) {
    c.save();
    c.translate(962, 203);
    c.scale(dp, dp);
    c.rotate(Math.PI / 4);
    c.fillRect(-40, -40, 80, 80);
    c.restore();
  }
  if (dp > 0.5) {
    const n = f.num || '01';
    const ns = h.fit(n, 36, 50, { weight: 800 });
    h.text(n, 962, 203 + ns * 0.36, ns, { weight: 800, align: 'center', knock: true });
  }
  /* 一排小點：亮點往右跑 */
  for (let i = 0; i < 9; i++) {
    const vis = h.seg(0.5 + i * 0.04, 0.62 + i * 0.04);
    const near = (((h.cyc(2) * 9 - i) % 9) + 9) % 9 < 2;
    h.fade(vis * (near ? 1 : 0.3), () => h.dot(1036 + i * 15, 203, 2.6, f.accent));
  }
  c.fillStyle = f.main;
  h.text(h.decode(f.code, h.seg(0.3, 0.7)), 140, 146, 13, { mono: true, track: 3, alpha: 0.85 });
  if (f.sub)
    h.subText(h.decode(f.sub, h.seg(0.5, 1)), 142, 282, 16, 750, { track: 2, alpha: 0.85 });
  c.fillStyle = f.accent;
  h.fade(h.seg(0.2, 0.5), () => c.fillRect(140, 252, 120, 3));
  c.fillStyle = f.main;
}

/** 括號框：大括號框住置中的標題，下方有來回移動的游標 */
function bracket(h: Hud): void {
  const f = h.f;
  const c = h.x;
  h.corners(160, 104, 880, 196, 36, h.seg(0, 0.5), 3);
  h.fade(0.6 * h.seg(0.2, 0.6), () => {
    for (const [x, y] of [
      [126, 74],
      [1074, 74],
      [126, 330],
      [1074, 330],
    ] as const) {
      c.lineWidth = 1.5;
      c.strokeRect(x - 4, y - 4, 8, 8);
    }
  });
  h.text(h.decode(`// ${f.code} //`, h.seg(0.25, 0.7)), 600, 94, 14, {
    mono: true,
    align: 'center',
    track: 3,
    alpha: 0.8,
  });
  const hasSub = !!f.sub;
  const size = h.fit(f.title, 72, 780, { track: 4 });
  h.text(h.decode(f.title, h.seg(0.3, 0.95)), 600, hasSub ? 212 : 200 + size * 0.36, size, {
    align: 'center',
    track: 4,
    sheen: true,
  });
  if (hasSub)
    h.subText(h.decode(f.sub, h.seg(0.5, 1)), 600, 258, 18, 780, {
      align: 'center',
      track: 4,
      alpha: 0.85,
    });
  const lp = h.seg(0.35, 0.8);
  h.fade(0.55, () => {
    h.line(590, 284, 300, 284, 1, lp);
    h.line(610, 284, 900, 284, 1, lp);
  });
  const mx = 600 + Math.sin(h.cyc(1) * TAU) * 220;
  c.fillStyle = f.accent;
  h.fade(lp, () => c.fillRect(mx - 30, 282, 60, 4));
  c.fillStyle = f.main;
  const tail = h.seg(0.5, 0.9);
  h.text(`NO. ${f.num || '01'}`, 1040, 326, 14, {
    mono: true,
    align: 'right',
    track: 2,
    alpha: 0.8 * tail,
  });
  h.fade(0.7 * tail, () => {
    for (let i = 0; i < 3; i++) h.line(166 + i * 10, 330, 176 + i * 10, 318, 2);
  });
}

/** 終端機的紀錄（本站自寫） */
const TERMINAL_LOG = [
  'SYS  UPLINK ............ OK',
  'SYS  DECRYPT KEY 4/4 ... OK',
  'NET  PING 12ms',
  'WARN SIGNAL NOISE +2dB',
  'SYS  ARCHIVE MOUNTED',
  'SYS  OPERATOR VERIFIED',
];

/** 終端機：終端機視窗逐字打出標題，下方捲動系統紀錄 */
function terminal(h: Hud): void {
  const f = h.f;
  const c = h.x;
  const x0 = 150;
  const y0 = 70;
  const w = 900;
  const ht = 260;
  h.poly(
    [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + ht],
      [x0, y0 + ht],
    ],
    h.seg(0, 0.4),
    2,
    true,
  );
  const hp = h.seg(0.1, 0.45);
  if (hp > 0) {
    c.save();
    c.beginPath();
    c.rect(x0, y0, w * hp, 26);
    c.clip();
    c.fillRect(x0, y0, w, 26);
    c.restore();
  }
  if (hp > 0.3)
    h.text(`SHELL :: ${f.code}`, x0 + 14, y0 + 18, 13, { mono: true, track: 2, knock: true });
  for (let i = 0; i < 3; i++) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = hp;
    c.fillRect(x0 + w - 22 - i * 16, y0 + 9, 9, 9);
    c.restore();
  }
  h.fade(0.22 * h.seg(0.2, 0.6), () => {
    for (let gx = x0 + w - 220; gx < x0 + w - 20; gx += 16)
      for (let gy = y0 + 46; gy < y0 + ht - 20; gy += 16) c.fillRect(gx, gy, 2, 2);
  });
  /* 逐字打出的標題＋游標 */
  const chars = Array.from(f.title);
  const typed = chars.slice(0, Math.floor(chars.length * h.seg(0.2, 0.75))).join('');
  const size = h.fit(`> ${f.title}_`, 64, 640, { track: 1 });
  const by = f.sub ? 178 : 200 + size * 0.36;
  const tw = h.text(`> ${typed}`, x0 + 36, by, size, { track: 1 });
  if (h.cyc(4) < 0.55 || !h.settled) {
    c.fillStyle = f.accent;
    c.fillRect(x0 + 40 + tw, by - size * 0.72, size * 0.42, size * 0.8);
    c.fillStyle = f.main;
  }
  if (f.sub) {
    const sc = Array.from(f.sub);
    const st = sc.slice(0, Math.floor(sc.length * h.seg(0.6, 0.95))).join('');
    h.subText(st, x0 + 38, by + 42, 18, 640, { track: 2, alpha: 0.85 });
  }
  /* 系統紀錄：一個循環捲兩輪 */
  const off = Math.floor(h.cyc(2) * TERMINAL_LOG.length);
  const lp = h.seg(0.55, 1);
  for (let i = 0; i < 3; i++)
    h.text(TERMINAL_LOG[(off + i) % TERMINAL_LOG.length], x0 + 38, y0 + ht - 64 + i * 18, 12, {
      mono: true,
      track: 1,
      alpha: (0.35 + i * 0.2) * lp,
    });
  /* 右側的進度條 */
  const bh = (ht - 70) * h.seg(0.3, 0.9);
  h.fade(0.5, () => {
    c.lineWidth = 1;
    c.strokeRect(x0 + w - 14, y0 + 40, 6, ht - 70);
  });
  c.fillStyle = f.accent;
  c.fillRect(x0 + w - 14, y0 + 40 + (ht - 70) - bh, 6, bh);
  c.fillStyle = f.main;
}

const DRAW: Record<SfTemplateId, (h: Hud) => void> = {
  reticle,
  callout,
  warning,
  slab,
  hex,
  index,
  bracket,
  terminal,
};

/** 在設計空間畫一個範本（ctx 已經設好設計空間的座標、整體不透明度與主色） */
export function drawSfTemplate(tpl: SfTemplateId, frame: SfFrame): void {
  const c = frame.ctx;
  c.strokeStyle = frame.main;
  c.fillStyle = frame.main;
  (DRAW[tpl] ?? reticle)(new Hud(frame));
}

/* ---------- 合成：顆粒雜訊、掃描線、光暈、故障 ---------- */

/** 一行文字（換行當空白）、去頭尾空白、最多 n 個字（同輸入欄的上限） */
const clip = (v: unknown, n: number) =>
  Array.from(
    String(v ?? '')
      .replace(/\s*[\r\n]+\s*/g, ' ')
      .trim(),
  )
    .slice(0, n)
    .join('');

let grainTile: SpriteCanvas | null = null;

/** 顆粒雜訊的底圖（192 × 192，每個像素的透明度是固定的亂數） */
function grain(): SpriteCanvas {
  if (grainTile) return grainTile;
  const n = 192;
  const c = createSpriteCanvas(n, n);
  const x = c.getContext('2d') as Ctx;
  const img = x.createImageData(n, n);
  for (let i = 0; i < n * n; i++)
    img.data[i * 4 + 3] = Math.floor(hashUnit(i % n, Math.floor(i / n), 0x6a) * 256);
  x.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

interface Layer {
  c: SpriteCanvas;
  x: Ctx;
}

const mkLayer = (w: number, h: number): Layer => {
  const c = createSpriteCanvas(w, h);
  return { c, x: c.getContext('2d') as Ctx };
};

export interface SfDrawOptions {
  /** 範本縮圖：一律畫停留中的樣子（沒有登場、退場） */
  idle?: boolean;
  /** 換一個範本畫（縮圖用） */
  tpl?: SfTemplateId;
}

/** 畫 SF 標題的一格（每個 painter 有自己的暫存畫布） */
export class SfPainter {
  private layer: Layer | null = null;
  private scratch: Layer | null = null;

  private ensure(W: number, H: number): { layer: Layer; scratch: Layer } {
    if (!this.layer || this.layer.c.width !== W || this.layer.c.height !== H) {
      this.layer = mkLayer(W, H);
      this.scratch = mkLayer(W, H);
    }
    return { layer: this.layer, scratch: this.scratch! };
  }

  draw(ctx: Ctx, cfg: Settings, t: number, W: number, H: number, o: SfDrawOptions = {}): void {
    const sf = sfOf(cfg);
    const tm = sfTiming(cfg);
    const ph = o.idle ? { ip: 1, op: 0 } : sfPhase(tm, t);
    const { layer, scratch } = this.ensure(W, H);
    const { s, ox, oy } = sfFit(W, H);
    const lx = layer.x;
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalAlpha = 1;
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, W, H);
    lx.setTransform(s, 0, 0, s, ox, oy);
    lx.globalAlpha = sfAlpha(ph.op, t);
    lx.lineCap = 'butt';
    lx.lineJoin = 'miter';
    lx.setLineDash([]);
    drawSfTemplate(o.tpl ?? sf.tpl, {
      ctx: lx,
      t,
      D: tm.D,
      ip: ph.ip,
      op: ph.op,
      main: sf.main,
      accent: sf.accent,
      title: clip(cfg.text, SF_LIMITS.title),
      sub: clip(cfg.sub, SF_LIMITS.sub),
      code: sfCodeOf(cfg),
      num: sf.num.trim(),
      fonts: sfFonts(cfg),
      scratch,
    });
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalAlpha = 1;
    /* 顆粒雜訊：用固定的雜訊圖挖掉一點點透明度 */
    if (sf.grain > 0) {
      const pat = lx.createPattern(grain() as CanvasImageSource, 'repeat');
      if (pat) {
        lx.globalCompositeOperation = 'destination-out';
        lx.globalAlpha = sf.grain * 0.055;
        lx.fillStyle = pat;
        lx.fillRect(0, 0, W, H);
        lx.globalAlpha = 1;
      }
    }
    /* 掃描線：每隔幾個像素挖掉一條 */
    if (sf.scan) {
      lx.globalCompositeOperation = 'destination-out';
      lx.fillStyle = 'rgba(0,0,0,0.42)';
      const step = Math.max(2, Math.round(3.6 * s));
      const band = Math.max(1, step / 3);
      for (let y = 0; y < H; y += step) lx.fillRect(0, y, W, band);
    }
    lx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (sf.glow > 0) {
      ctx.shadowColor = sf.main;
      ctx.shadowBlur = sf.glow * 8 * s;
    }
    ctx.drawImage(layer.c as CanvasImageSource, 0, 0);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    /* 故障：幾條水平切片左右錯開（每 1/30 秒換一次） */
    const g = sf.glitch ? sfGlitchAmount(tm, ph, t) : 0;
    if (g > 0.02) {
      const slot = timeSlot(t, 30);
      const u = (n: number) => hashUnit(slot, n, 0x47);
      const n = 3 + Math.floor(g * 5);
      for (let k = 0; k < n; k++) {
        const y = Math.floor(u(10 + k) * H);
        const hh = Math.min(H - y, Math.max(2, Math.floor(u(20 + k) * H * 0.12)));
        if (hh <= 0) continue;
        const dx = (u(30 + k) - 0.5) * 60 * s * g;
        ctx.clearRect(0, y, W, hh);
        ctx.drawImage(layer.c as CanvasImageSource, 0, y, W, hh, dx, y, W, hh);
      }
    }
    ctx.restore();
  }
}
