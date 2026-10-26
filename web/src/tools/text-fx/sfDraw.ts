/**
 * SF 標題的繪製：8 個 HUD 範本畫在 1200 × 400 的設計空間（依輸出尺寸置中縮放），
 * 再疊上顆粒雜訊、掃描線、光暈，故障用 text-fx 的雜訊引擎（雜訊干擾、偶爾雜訊、雜訊斷訊）。
 * 只依設定與時間 t 畫，同一個時間點永遠畫出同一格。
 *
 * 8 個範本的構圖、元件、位置與停留中的動作都是本站設計（主控裁定 R1，2026-10-26）；
 * 只有「8 種 HUD 類型」這個分類與解碼、光澤、鏤空等效果的概念參考 Mellow Noise 的 SF 타이틀 메이커。
 */
import { createRandom, EASE, hashUnit, seedOf, timeSlot } from '@/core/timeline';
import { createSpriteCanvas, type SpriteCanvas } from '@/core/typeset';
import { type BlockState, freshBlockState, HOLD, INTRO, OUTRO } from './motion';
import { type NoiseLayer, type NoiseLayers, paintNoise } from './noise';
import type { Settings } from './settings';
import {
  introWindow,
  loopPhase,
  SF_DESIGN,
  SF_LIMITS,
  SF_MONO_FONT,
  type SfTemplateId,
  sfCjkFont,
  sfCodeOf,
  sfDecode,
  sfFit,
  sfOf,
  sfProgress,
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

/* ---------- 一格的資料與畫筆 ---------- */

export interface SfFrame {
  /** 已套用設計空間座標的畫布 */
  ctx: Ctx;
  t: number;
  /** 長度（一個循環） */
  D: number;
  /** 登場進度、退場進度 */
  intro: number;
  outro: number;
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

export interface TextStyle {
  mono?: boolean;
  weight?: number;
  align?: CanvasTextAlign;
  /** 字距（設計空間的 px） */
  track?: number;
  alpha?: number;
  color?: string;
  /** 鏤空：把底下的色塊挖掉 */
  knock?: boolean;
  /** 空心字（只描邊，線寬 px） */
  outline?: number;
  /** 光澤：每個循環的前段有一道斜的亮光掃過 */
  glint?: boolean;
}

/** 畫一個範本用的筆：登場的時段、循環的相位、線條與文字 */
export class HudPen {
  constructor(readonly f: SfFrame) {}

  get x(): Ctx {
    return this.f.ctx;
  }

  /** 這個元件的登場：登場進度從 start 起，經過 span 從 0 到 1（緩停） */
  enter(start: number, span: number): number {
    return this.f.intro >= 1 ? 1 : introWindow(this.f.intro, start, span);
  }

  /** 登場進度在 start 起、經過 span 的線性進度（登場結束時一定是 1，不受小數誤差影響） */
  private span(start: number, span: number): number {
    return this.f.intro >= 1 ? 1 : Math.min(1, Math.max(0, (this.f.intro - start) / span));
  }

  /** 一個長度裡轉 n 圈的相位（0～1） */
  turns(n: number): number {
    return loopPhase(this.f.t, this.f.D, n);
  }

  /** 登場已經結束 */
  settled(): boolean {
    return this.f.intro >= 1;
  }

  /** 一個長度裡亮 n 次，每次亮 duty 的時間；登場中一直亮 */
  lit(n: number, duty = 0.5): boolean {
    return this.f.intro < 1 || this.turns(n) < duty;
  }

  /** 解碼中的字串（登場進度 start 起，經過 span 全部定下來） */
  decode(str: string, start: number, span: number): string {
    return sfDecode(str, this.span(start, span), this.f.t);
  }

  /** 逐字打出（登場進度 start 起，經過 span 打完） */
  typed(str: string, start: number, span: number): string {
    const chars = Array.from(str);
    return chars.slice(0, Math.floor(chars.length * this.span(start, span))).join('');
  }

  /** 以 k 倍的不透明度畫 */
  fade(k: number, fn: () => void): void {
    if (k <= 0) return;
    const c = this.x;
    c.save();
    c.globalAlpha *= Math.min(1, k);
    fn();
    c.restore();
  }

  /** 只在矩形裡畫 */
  clipped(x: number, y: number, w: number, h: number, fn: () => void): void {
    if (w <= 0 || h <= 0) return;
    const c = this.x;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    fn();
    c.restore();
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, p = 1): void {
    if (p <= 0) return;
    const c = this.x;
    const k = Math.min(1, p);
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k);
    c.stroke();
  }

  /** 折線：依長度畫到 p 的位置（closed：回到起點） */
  path(pts: readonly Pt[], p: number, width: number, closed = false): void {
    if (p <= 0 || pts.length < 2) return;
    const all = closed ? [...pts, pts[0]] : pts;
    let total = 0;
    const seg: number[] = [];
    for (let i = 1; i < all.length; i++) {
      const d = Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
      seg.push(d);
      total += d;
    }
    let left = total * Math.min(1, p);
    const c = this.x;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(all[0][0], all[0][1]);
    for (let i = 1; i < all.length && left > 0; i++) {
      const k = Math.min(1, left / seg[i - 1]);
      c.lineTo(
        all[i - 1][0] + (all[i][0] - all[i - 1][0]) * k,
        all[i - 1][1] + (all[i][1] - all[i - 1][1]) * k,
      );
      left -= seg[i - 1];
    }
    c.stroke();
  }

  /** 實心多邊形 */
  solid(pts: readonly Pt[], color?: string): void {
    const c = this.x;
    if (color) c.fillStyle = color;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fill();
  }

  /** 圓弧：從 from 起掃過 sweep（弧度） */
  ring(cx: number, cy: number, r: number, from: number, sweep: number, width: number): void {
    if (r <= 0 || sweep <= 0) return;
    const c = this.x;
    c.lineWidth = width;
    c.beginPath();
    c.arc(cx, cy, r, from, from + Math.min(TAU, sweep));
    c.stroke();
  }

  disc(cx: number, cy: number, r: number, color?: string): void {
    if (r <= 0) return;
    const c = this.x;
    if (color) c.fillStyle = color;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();
  }

  private setFont(c: Ctx, px: number, o: TextStyle): void {
    c.font = o.mono ? this.f.fonts.mono(px) : this.f.fonts.title(o.weight ?? 700, px);
    if ('letterSpacing' in c) c.letterSpacing = `${o.track ?? 0}px`;
  }

  /** 字的寬度（含字距） */
  measure(str: string, px: number, o: TextStyle = {}): number {
    const c = this.x;
    c.save();
    this.setFont(c, px, o);
    const w = c.measureText(str || ' ').width;
    c.restore();
    return w;
  }

  /** 放得進 maxW 的字級（最小 min）；字距是固定的 px，不跟著字級縮 */
  fitSize(str: string, base: number, maxW: number, o: TextStyle = {}, min = 14): number {
    const w = this.measure(str, base, o);
    if (w <= maxW) return base;
    const fixed = (o.track ?? 0) * Array.from(str || ' ').length;
    return Math.max(min, (base * Math.max(0, maxW - fixed)) / Math.max(1, w - fixed));
  }

  /** 畫字，回傳寬度 */
  text(str: string, x: number, y: number, px: number, o: TextStyle = {}): number {
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
    } else if (o.outline) {
      c.strokeStyle = o.color ?? this.f.main;
      c.lineWidth = o.outline;
      c.lineJoin = 'round';
      c.strokeText(str, x, y);
    } else if (o.glint && this.f.scratch) {
      this.glintText(str, x, y, px, w, o);
    } else {
      c.fillStyle = o.color ?? this.f.main;
      c.fillText(str, x, y);
    }
    c.restore();
    return w;
  }

  /** 小字：放不下 maxW 時縮小（依完整的字串算，解碼、打字中字級不跳動；最小 8 px） */
  small(
    str: string,
    full: string,
    x: number,
    y: number,
    px: number,
    maxW: number,
    o: TextStyle = {},
  ) {
    const style = { ...o, mono: true };
    return this.text(str, x, y, this.fitSize(full, px, maxW, style, 8), style);
  }

  /**
   * 光澤：字先畫在暫存畫布，再只在字上疊一道斜的亮光；亮光在每個循環的 8%～48% 從左掃到右，其餘時間沒有。
   */
  private glintText(str: string, x: number, y: number, px: number, w: number, o: TextStyle): void {
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
    const k = (this.turns(1) - 0.08) / 0.4;
    if (k > 0 && k < 1) {
      const left = c.textAlign === 'center' ? x - w / 2 : c.textAlign === 'right' ? x - w : x;
      const band = px * 1.1;
      const at = left - band + (w + band * 2) * EASE.smooth(k);
      /* 斜的亮光：漸層方向往右上傾 */
      const g = sx.createLinearGradient(at - band / 2, y, at + band / 2, y - px * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      sx.globalCompositeOperation = 'source-atop';
      sx.fillStyle = g;
      sx.fillRect(left - band * 2, y - px * 1.2, w + band * 4, px * 1.6);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(s.c as CanvasImageSource, 0, 0);
  }
}

/* ---------- 形狀小工具 ---------- */

/** 圓角矩形的頂點（順時針，從左上角的直邊起；每個角 4 段） */
function roundedRect(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i * Math.PI) / 8;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}

/** 指向右邊的箭頭（mirror：指向左邊，以 x 為對稱軸） */
const chevron = (x: number, cy: number, mirror: boolean): Pt[] => {
  const pts: Pt[] = [
    [0, -16],
    [9, -16],
    [21, 0],
    [9, 16],
    [0, 16],
    [12, 0],
  ];
  return pts.map(([dx, dy]) => [mirror ? x - dx : x + dx, cy + dy] as Pt);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/* ---------- 8 個範本（設計空間 1200 × 400） ---------- */

/** 雷達掃描：標題在左，右邊是掃描線轉動、光點閃爍的圓形雷達 */
function radar(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  const cx = 1000;
  const cy = 200;
  const R = 160;
  p.ring(cx, cy, R, -Math.PI / 2, TAU * p.enter(0, 0.5), 2);
  p.fade(0.45 * p.enter(0.15, 0.4), () => {
    for (const r of [120, 80, 40]) p.ring(cx, cy, r, 0, TAU, 1);
  });
  p.fade(0.35 * p.enter(0.2, 0.4), () => {
    c.save();
    c.setLineDash([3, 9]);
    p.line(cx - R, cy, cx + R, cy, 1);
    p.line(cx, cy - R, cx, cy + R, 1);
    c.restore();
  });
  /* 方位刻度：每 10°，每 90° 長一點 */
  const ticks = Math.floor(36 * p.enter(0.3, 0.4));
  p.fade(0.8, () => {
    for (let i = 0; i < ticks; i++) {
      const a = (i * TAU) / 36 - Math.PI / 2;
      const r2 = R + (i % 9 === 0 ? 20 : 11);
      p.line(
        cx + Math.cos(a) * (R + 5),
        cy + Math.sin(a) * (R + 5),
        cx + Math.cos(a) * r2,
        cy + Math.sin(a) * r2,
        i % 9 === 0 ? 2 : 1,
      );
    }
  });
  /* 掃描扇形：一個長度轉一圈，尾巴漸淡 */
  const heading = -Math.PI / 2 + p.turns(1) * TAU;
  const sw = p.enter(0.5, 0.4);
  p.fade(sw, () => {
    for (let k = 0; k < 10; k++) {
      c.save();
      c.globalAlpha *= 0.42 * (1 - k / 10);
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, R - 2, heading - (k + 1) * 0.07, heading - k * 0.07);
      c.closePath();
      c.fill();
      c.restore();
    }
    p.line(cx, cy, cx + Math.cos(heading) * (R - 2), cy + Math.sin(heading) * (R - 2), 2);
  });
  /* 光點：位置依標題與代碼決定，被掃到時亮起來再慢慢暗 */
  const seed = seedOf(f.title + f.code);
  const blips = p.enter(0.6, 0.4);
  for (let i = 0; i < 5; i++) {
    const a = hashUnit(seed, i, 1) * TAU;
    const r = 34 + hashUnit(seed, i, 2) * (R - 54);
    const since = (((heading - a) % TAU) + TAU) % TAU;
    const glow = Math.max(0, 1 - since / 2.4);
    const bx = cx + Math.cos(a) * r;
    const by = cy + Math.sin(a) * r;
    p.fade(blips * (0.3 + 0.7 * glow), () => p.disc(bx, by, 4, f.accent));
    p.fade(blips * glow * 0.6, () => {
      c.strokeStyle = f.accent;
      p.ring(bx, by, 6 + 10 * (1 - glow), 0, TAU, 1.5);
    });
  }
  p.solid([
    [cx, cy - 6],
    [cx + 6, cy],
    [cx, cy + 6],
    [cx - 6, cy],
  ]);
  const deg = String(Math.round(p.turns(1) * 360) % 360).padStart(3, '0');
  p.text(`BRG ${deg}°`, 836, 388, 13, { mono: true, track: 2, alpha: 0.7 * p.enter(0.5, 0.3) });

  /* 左邊：代碼、標題、分隔線、副文字 */
  const twoLines = !!f.sub;
  c.fillStyle = f.accent;
  p.fade(p.enter(0.1, 0.3), () => c.fillRect(64, 104, 8, 8));
  c.fillStyle = f.main;
  p.small(p.decode(f.code, 0.1, 0.4), f.code, 80, 112, 14, 680, { track: 2, alpha: 0.85 });
  const size = p.fitSize(f.title, 82, 680, { weight: 800, track: 1 });
  const yT = twoLines ? 190 : 206;
  p.text(p.decode(f.title, 0.3, 0.6), 64, yT, size, { weight: 800, track: 1, glint: true });
  const yD = yT + 28;
  const dp = p.enter(0.2, 0.4);
  p.line(64, yD, 64 + 700 * dp, yD, 1.5);
  c.fillStyle = f.accent;
  c.fillRect(64, yD - 3, 88 * dp, 4);
  c.fillStyle = f.main;
  if (twoLines)
    p.small(p.decode(f.sub, 0.5, 0.5), f.sub, 64, yD + 32, 18, 680, { track: 2, alpha: 0.85 });
  p.fade(0.6, () => {
    c.save();
    c.setLineDash([2, 5]);
    p.line(776, yD, 836, yD, 1.5, p.enter(0.45, 0.3));
    c.restore();
  });
}

/** 數據讀取：圓角面板，左邊跳動的長條圖，右邊標題與三格讀數 */
function readout(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  p.path(roundedRect(56, 64, 1088, 272, 16), p.enter(0, 0.4), 2, true);
  /* 長條圖：7 條，高度依標題雜湊，停留中上下起伏；最高的一條用強調色 */
  const seed = seedOf(f.title);
  const base = Array.from({ length: 7 }, (_, i) => 0.35 + 0.6 * hashUnit(seed, i, 7));
  const top = base.indexOf(Math.max(...base));
  for (let i = 0; i < 7; i++) {
    const grow = p.enter(0.15 + i * 0.04, 0.35);
    const wave = 0.75 + 0.25 * Math.sin(p.turns(2) * TAU + i * 0.9);
    const h = 170 * base[i] * wave * grow;
    c.fillStyle = i === top ? f.accent : f.main;
    c.fillRect(98 + i * 33, 298 - h, 24, h);
  }
  c.fillStyle = f.main;
  p.line(90, 301, 332, 301, 1.5, p.enter(0.1, 0.3));
  p.fade(0.5 * p.enter(0.5, 0.4), () => {
    const y = 130 + 170 * p.turns(1);
    p.line(90, y, 332, y, 1);
  });
  p.fade(0.6, () => p.line(366, 96, 366, 304, 1, p.enter(0.3, 0.3)));

  const x0 = 402;
  p.fade(p.enter(0.2, 0.3), () => p.disc(408, 112, 4, f.accent));
  c.fillStyle = f.main;
  p.small(p.decode(f.code, 0.25, 0.35), f.code, 420, 117, 14, 680, { track: 2, alpha: 0.85 });
  const twoLines = !!f.sub;
  const size = p.fitSize(f.title, 72, 700, { track: 1 });
  p.text(p.decode(f.title, 0.35, 0.55), x0, twoLines ? 192 : 206, size, { track: 1, glint: true });
  if (twoLines)
    p.small(p.decode(f.sub, 0.5, 0.5), f.sub, x0 + 2, 230, 17, 700, { track: 2, alpha: 0.8 });
  /* 三格讀數 */
  const cells = p.enter(0.55, 0.4);
  const sig = p.settled()
    ? 91 + Math.floor(hashUnit(timeSlot(f.t % f.D, 4), 3, 0x31) * 9)
    : Math.floor(95 * cells);
  const frq = (100 + hashUnit(seedOf(f.code), 1, 2) * 800).toFixed(1);
  const vals: [string, string][] = [
    ['SIG', `${sig}%`],
    ['FRQ', frq],
    ['IDX', f.num || '01'],
  ];
  vals.forEach(([label, value], k) => {
    const x = x0 + k * 240;
    p.fade(cells, () => {
      p.fade(0.5, () => {
        c.lineWidth = 1;
        c.strokeRect(x, 254, 220, 50);
      });
      p.text(label, x + 10, 270, 11, { mono: true, track: 2, alpha: 0.6 });
      p.text(p.decode(value, 0.6, 0.35), x + 10, 296, 20, { mono: true, track: 1 });
    });
  });
}

/** 警報橫幅：上下兩條反向流動的警戒條，兩側閃爍的驚嘆號圓章 */
function alert(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  const open = p.enter(0, 0.45);
  const half = 560 * open;
  const band = (y0: number, dir: 1 | -1) => {
    p.clipped(600 - half, y0, half * 2, 34, () => {
      c.fillStyle = f.accent;
      const shift = (dir * p.turns(3) * 32) % 32;
      for (let x = 8 + shift - 64; x < 1200; x += 32)
        p.solid([
          [x, y0],
          [x + 16, y0],
          [x + 34, y0 + 34],
          [x + 18, y0 + 34],
        ]);
      c.fillStyle = f.main;
    });
    p.fade(0.8, () => {
      c.lineWidth = 1.5;
      if (half > 0) c.strokeRect(600 - half, y0, half * 2, 34);
    });
  };
  band(34, -1);
  band(332, 1);
  /* 上方色塊：鏤空的代碼 */
  const chip = p.enter(0.3, 0.3);
  if (chip > 0 && f.code) {
    const cs = p.fitSize(f.code, 15, 400, { mono: true, track: 2 }, 8);
    const w = p.measure(f.code, cs, { mono: true, track: 2 }) + 30;
    p.fade(chip, () => {
      c.fillRect(600 - w / 2, 30, w, 44);
      p.text(p.decode(f.code, 0.3, 0.35), 600, 57, cs, {
        mono: true,
        track: 2,
        align: 'center',
        knock: true,
      });
    });
  }
  /* 兩側的驚嘆號圓章：停留中左右輪流亮 */
  const badge = p.enter(0.2, 0.35);
  const left = p.lit(2, 0.5);
  for (const [x, on] of [
    [112, left],
    [1088, !left || !p.settled()],
  ] as const) {
    p.fade(badge * (on ? 1 : 0.3), () => {
      c.save();
      c.translate(x, 200);
      c.scale(0.6 + 0.4 * badge, 0.6 + 0.4 * badge);
      c.strokeStyle = f.accent;
      p.ring(0, 0, 46, 0, TAU, 5);
      p.text('!', 0, 19, 54, { weight: 900, align: 'center', color: f.accent });
      c.restore();
    });
  }
  /* 箭頭：往標題指，亮度往內傳 */
  const arrows = p.enter(0.6, 0.35);
  const step = Math.floor(p.turns(3) * 3);
  for (let i = 0; i < 3; i++) {
    const k = arrows * (step === i ? 1 : 0.35);
    p.fade(k, () => {
      p.solid(chevron(184 + i * 24, 200, false));
      p.solid(chevron(1016 - i * 24, 200, true));
    });
  }
  const twoLines = !!f.sub;
  /* 最寬 620：兩側箭頭的內緣在 253、947，留 30 px 以上的空隙 */
  const size = p.fitSize(f.title, 84, 620, { weight: 900, track: 2 });
  p.text(p.decode(f.title, 0.35, 0.6), 600, twoLines ? 196 : 216, size, {
    weight: 900,
    track: 2,
    align: 'center',
    glint: true,
  });
  if (twoLines)
    p.small(p.decode(f.sub, 0.55, 0.45), f.sub, 600, 252, 18, 680, {
      track: 3,
      align: 'center',
      alpha: 0.85,
    });
}

/** 識別吊牌：有穿孔與撕線的吊牌，頂端色帶鏤空代碼，右邊點陣碼 */
function tag(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  p.path(
    [
      [178, 96],
      [1112, 96],
      [1112, 304],
      [178, 304],
      [92, 200],
    ],
    p.enter(0, 0.45),
    2.5,
    true,
  );
  p.fade(p.enter(0.3, 0.2), () => p.ring(152, 200, 15, 0, TAU, 2));
  p.fade(0.7 * p.enter(0.35, 0.25), () => {
    c.save();
    c.setLineDash([5, 7]);
    p.line(212, 108, 212, 292, 1.5);
    c.restore();
  });
  /* 頂端色帶：由左展開，代碼與編號鏤空 */
  const bw = p.enter(0.2, 0.35);
  if (bw > 0) {
    c.fillRect(236, 108, 862 * bw, 44);
    if (bw > 0.3) {
      p.small(p.decode(f.code, 0.35, 0.35), f.code, 254, 138, 16, 560, { track: 2, knock: true });
      p.text(`#${f.num || '01'}`, 1086, 138, 16, { mono: true, align: 'right', knock: true });
    }
  }
  const twoLines = !!f.sub;
  const size = p.fitSize(f.title, 70, 620, { weight: 800 });
  p.text(p.decode(f.title, 0.35, 0.55), 254, twoLines ? 226 : 240, size, { weight: 800 });
  if (twoLines)
    p.small(p.decode(f.sub, 0.55, 0.45), f.sub, 256, 270, 16, 620, { track: 2, alpha: 0.85 });
  /* 點陣碼：依標題與代碼決定，一列一列出現；停留中有一條掃描線往下走 */
  const seed = seedOf(f.title + f.code);
  const rows = Math.floor(7 * p.enter(0.5, 0.45));
  const scanY = 164 + 133 * p.turns(1);
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < 10; k++) {
      if (hashUnit(seed, r * 10 + k, 5) <= 0.48) continue;
      const y = 170 + r * 18;
      p.fade(Math.abs(y + 6 - scanY) < 12 && p.settled() ? 1 : 0.7, () =>
        c.fillRect(902 + k * 18, y, 13, 13),
      );
    }
  p.fade(0.5 * p.enter(0.45, 0.3), () => {
    c.lineWidth = 1;
    c.strokeRect(896, 164, 192, 133);
  });
  if (p.settled()) {
    c.fillStyle = f.accent;
    c.fillRect(896, scanY, 192, 3);
  }
  p.fade(p.enter(0.6, 0.3), () =>
    p.solid(
      [
        [1112, 268],
        [1112, 304],
        [1076, 304],
      ],
      f.accent,
    ),
  );
}

/** 勳章緞帶：上方轉動的齒輪勳章（內有編號），下方燕尾緞帶鏤空標題 */
function medal(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  const cx = 600;
  const cy = 92;
  const pop = p.enter(0, 0.45);
  p.fade(pop, () => {
    c.save();
    c.translate(cx, cy);
    c.scale(0.4 + 0.6 * pop, 0.4 + 0.6 * pop);
    /* 齒輪：18 齒，一個長度轉一齒 */
    c.rotate(((p.turns(1) + (1 - pop) * 0.8) * TAU) / 18);
    const teeth: Pt[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i * TAU) / 36;
      const r = i % 2 === 0 ? 70 : 61;
      teeth.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    p.path(teeth, 1, 2, true);
    c.restore();
    p.fade(0.5, () => p.ring(cx, cy, 78, 0, TAU, 1));
    p.disc(cx, cy, 50, f.main);
    const n = f.num || '01';
    const ns = p.fitSize(n, 42, 64, { weight: 800 });
    p.text(n, cx, cy + ns * 0.35, ns, { weight: 800, align: 'center', knock: true });
  });
  /* 勳章邊上的閃光：一個長度閃兩次 */
  for (const [a, phase] of [
    [-0.6, 0],
    [2.4, 0.5],
  ] as const) {
    const k = (p.turns(2) + phase) % 1;
    const s = p.settled() && k < 0.25 ? Math.sin((k / 0.25) * Math.PI) : 0;
    if (s <= 0) continue;
    const sx = cx + Math.cos(a) * 74;
    const sy = cy + Math.sin(a) * 74;
    const r = 10 * s;
    p.solid(
      [
        [sx, sy - r],
        [sx + r * 0.25, sy - r * 0.25],
        [sx + r, sy],
        [sx + r * 0.25, sy + r * 0.25],
        [sx, sy + r],
        [sx - r * 0.25, sy + r * 0.25],
        [sx - r, sy],
        [sx - r * 0.25, sy - r * 0.25],
      ],
      f.accent,
    );
  }
  /* 兩側的翼：三條往外變短的橫條 */
  const wing = p.enter(0.35, 0.3);
  c.fillStyle = f.main;
  for (let i = 0; i < 3; i++) {
    const len = (90 - i * 24) * wing;
    c.fillRect(512 - len, 80 + i * 16, len, 5);
    c.fillRect(688, 80 + i * 16, len, 5);
  }
  /* 燕尾緞帶：從中央往兩側展開，標題鏤空 */
  const half = 474 * p.enter(0.2, 0.4);
  p.clipped(600 - half, 180, half * 2, 98, () =>
    p.solid([
      [126, 184],
      [1074, 184],
      [1044, 229],
      [1074, 274],
      [126, 274],
      [156, 229],
    ]),
  );
  p.fade(p.enter(0.45, 0.2), () => {
    p.solid(
      [
        [156, 274],
        [196, 274],
        [196, 294],
      ],
      f.accent,
    );
    p.solid(
      [
        [1044, 274],
        [1004, 274],
        [1004, 294],
      ],
      f.accent,
    );
  });
  c.fillStyle = f.main;
  if (half > 300) {
    const size = p.fitSize(f.title, 62, 780, { weight: 900, track: 2 });
    p.text(p.decode(f.title, 0.4, 0.55), 600, 229 + size * 0.35, size, {
      weight: 900,
      track: 2,
      align: 'center',
      knock: true,
    });
  }
  if (f.sub)
    p.small(p.decode(f.sub, 0.55, 0.45), f.sub, 600, 330, 18, 900, {
      track: 3,
      align: 'center',
      alpha: 0.85,
    });
  p.small(p.decode(f.code, 0.6, 0.35), f.code, 600, 372, 13, 900, {
    track: 3,
    align: 'center',
    alpha: 0.7,
  });
}

/** 大字編號：左邊空心大數字慢慢注滿，右邊標題與頁碼刻度 */
function chapter(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  const n = f.num || '01';
  const ns = p.fitSize(n, 220, 290, { weight: 900 }, 36);
  const nw = p.measure(n, ns, { weight: 900 });
  const baseY = 318;
  const topY = baseY - ns * 0.85;
  /* 空心數字：由上往下出現，內部由下往上注滿到三成五；停留中一道亮帶往上走 */
  const wipe = p.enter(0, 0.4);
  p.clipped(44, topY - 10, nw + 60, (baseY - topY + 30) * wipe, () =>
    p.text(n, 64, baseY, ns, { weight: 900, outline: 3 }),
  );
  const fill = p.enter(0.3, 0.5);
  const span = baseY - topY + 20;
  p.clipped(44, baseY + 10 - span * fill, nw + 60, span * fill, () =>
    p.text(n, 64, baseY, ns, { weight: 900, alpha: 0.35 }),
  );
  if (p.settled()) {
    const y = baseY + 10 - span * p.turns(1);
    p.clipped(44, y - 17, nw + 60, 34, () => p.text(n, 64, baseY, ns, { weight: 900 }));
  }
  /* 直線與右邊的文字 */
  const rx = Math.min(420, 64 + nw + 38);
  c.fillStyle = f.accent;
  p.fade(p.enter(0.2, 0.2), () => c.fillRect(rx - 3, 78, 6, 6));
  c.fillStyle = f.main;
  p.line(rx, 88, rx, 88 + 236 * p.enter(0.2, 0.35), 2);
  const x0 = rx + 32;
  const maxW = 1136 - x0;
  p.small(p.decode(f.code, 0.25, 0.35), f.code, x0, 118, 14, maxW, { track: 3, alpha: 0.85 });
  const twoLines = !!f.sub;
  const size = p.fitSize(f.title, 76, maxW, { weight: 800 });
  p.text(p.decode(f.title, 0.35, 0.6), x0, twoLines ? 202 : 220, size, { weight: 800 });
  if (twoLines)
    p.small(p.decode(f.sub, 0.55, 0.45), f.sub, x0 + 2, 246, 17, maxW, { track: 2, alpha: 0.8 });
  /* 頁碼刻度：10 格，目前那格用強調色，一個長度走一輪 */
  const shown = Math.floor(10 * p.enter(0.6, 0.35));
  const cur = Math.floor(p.turns(1) * 10);
  for (let i = 0; i < shown; i++) {
    if (i === cur && p.settled()) {
      c.fillStyle = f.accent;
      c.fillRect(x0 + i * 30, 284, 20, 6);
      c.fillStyle = f.main;
    } else p.fade(0.35, () => c.fillRect(x0 + i * 30, 284, 20, 6));
  }
}

/** 取景框：攝影機取景畫面，對焦框收向標題，錄影燈、時間碼、音量表 */
function viewfinder(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  /* 四角的取景線：從外面滑進來 */
  const inset = 30 * (1 - p.enter(0, 0.4));
  p.fade(p.enter(0, 0.3), () => {
    for (const [x, y, sx, sy] of [
      [40, 26, 1, 1],
      [1160, 26, -1, 1],
      [1160, 374, -1, -1],
      [40, 374, 1, -1],
    ] as const) {
      const ax = x - sx * inset;
      const ay = y - sy * inset;
      p.path(
        [
          [ax, ay + sy * 56],
          [ax, ay],
          [ax + sx * 56, ay],
        ],
        1,
        3,
      );
    }
  });
  p.fade(0.25 * p.enter(0.2, 0.3), () => {
    c.save();
    c.setLineDash([6, 10]);
    c.lineWidth = 1;
    c.strokeRect(110, 70, 980, 260);
    c.restore();
  });
  const hud = p.enter(0.4, 0.4);
  p.fade(hud, () => {
    if (p.lit(2, 0.6)) p.disc(76, 62, 8, f.accent);
    c.fillStyle = f.main;
    p.text('REC', 92, 68, 16, { mono: true, track: 2 });
    p.text(`CAM ${f.num || '01'}`, 1056, 68, 15, { mono: true, track: 2, align: 'right' });
    c.lineWidth = 1.5;
    c.strokeRect(1070, 50, 46, 22);
    c.fillRect(1116, 56, 4, 10);
    for (let i = 0; i < 4; i++) if (i < 3 || p.lit(4, 0.7)) c.fillRect(1075 + i * 10, 54, 7, 14);
    /* 時間碼：每個循環從 0 起算（24 格／秒） */
    const local = f.t % f.D;
    const sec = Math.floor(local);
    const fr = Math.floor((local % 1) * 24);
    p.text(`00:00:${pad2(sec)}:${pad2(fr)}`, 76, 354, 16, { mono: true, track: 1 });
    /* 音量表：12 格，每 1/12 秒跳一次 */
    const level = 0.3 + 0.7 * hashUnit(timeSlot(f.t % f.D, 12), 4, 0x55);
    for (let i = 0; i < 12; i++) {
      const on = i < level * 12;
      c.fillStyle = i >= 10 ? f.accent : f.main;
      p.fade(on ? 1 : 0.2, () => c.fillRect(520 + i * 14, 344, 10, 10));
    }
    c.fillStyle = f.main;
  });
  p.small(p.decode(f.code, 0.5, 0.4), f.code, 1126, 354, 14, 400, {
    track: 2,
    align: 'right',
    alpha: 0.8,
  });
  /* 標題與對焦框 */
  const twoLines = !!f.sub;
  const size = p.fitSize(f.title, 70, 760, { track: 1 });
  const yT = twoLines ? 200 : 214;
  p.text(p.decode(f.title, 0.35, 0.6), 600, yT, size, { track: 1, align: 'center', glint: true });
  if (twoLines)
    p.small(p.decode(f.sub, 0.55, 0.45), f.sub, 600, 248, 18, 760, {
      track: 3,
      align: 'center',
      alpha: 0.85,
    });
  const tw = Math.max(
    p.measure(f.title, size, { track: 1 }),
    twoLines
      ? p.measure(f.sub, p.fitSize(f.sub, 18, 760, { mono: true, track: 3 }, 8), {
          mono: true,
          track: 3,
        })
      : 0,
  );
  const focus = p.enter(0.2, 0.5);
  const k = (1 + 0.6 * (1 - focus)) * (1 + 0.025 * Math.sin(p.turns(2) * TAU));
  const hw = Math.min(490, (tw / 2 + 40) * k);
  const top = yT - size * 0.9 - 18;
  const bottom = (twoLines ? 262 : yT + size * 0.3) + 18;
  const mid = (top + bottom) / 2;
  const hh = Math.min(150, ((bottom - top) / 2) * k);
  p.fade(focus, () => {
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = 600 + sx * hw;
      const y = mid + sy * hh;
      p.path(
        [
          [x, y - sy * 22],
          [x, y],
          [x - sx * 22, y],
        ],
        1,
        2.5,
      );
    }
    p.line(600 - hw, mid, 600 - hw + 10, mid, 2);
    p.line(600 + hw, mid, 600 + hw - 10, mid, 2);
  });
}

/** 指令視窗的第一行（本站自寫） */
const CONSOLE_PROMPT = '$ open';

/** 指令視窗：有行號的視窗逐字打出標題，右邊是捲動的波形 */
function consoleWindow(p: HudPen): void {
  const f = p.f;
  const c = p.x;
  p.path(roundedRect(56, 44, 752, 310, 12), p.enter(0, 0.4), 2, true);
  const head = p.enter(0.1, 0.25);
  p.fade(head, () => {
    p.disc(84, 72, 6, f.accent);
    c.strokeStyle = f.main;
    p.ring(106, 72, 6, 0, TAU, 1.5);
    p.ring(128, 72, 6, 0, TAU, 1.5);
    p.small(f.code, f.code, 470, 77, 13, 480, { track: 2, align: 'center', alpha: 0.75 });
    p.fade(0.5, () => p.line(56, 94, 808, 94, 1));
  });
  /* 行號 */
  const rows = [134, 200, 252, 306];
  p.fade(p.enter(0.2, 0.3), () => {
    rows.forEach((y, i) => {
      p.text(String(i + 1), 100, y, 14, { mono: true, align: 'right', alpha: 0.4 });
    });
    p.fade(0.25, () => p.line(114, 104, 114, 340, 1));
  });
  p.text(p.typed(`${CONSOLE_PROMPT} ${f.code}`, 0.2, 0.3), 130, rows[0], 16, {
    mono: true,
    track: 1,
    alpha: 0.6,
  });
  /* 標題：逐字打出，後面是強調色的底線游標 */
  const size = p.fitSize(f.title, 58, 660, { track: 1 });
  const tw = p.text(p.typed(f.title, 0.3, 0.5), 130, rows[1], size, { track: 1 });
  if (p.lit(4)) {
    c.fillStyle = f.accent;
    c.fillRect(130 + tw + 6, rows[1] + 6, size * 0.55, Math.max(3, size * 0.1));
    c.fillStyle = f.main;
  }
  if (f.sub)
    p.small(p.typed(`# ${f.sub}`, 0.6, 0.35), `# ${f.sub}`, 130, rows[2], 17, 660, {
      track: 2,
      alpha: 0.8,
    });
  /* 進度條：登場時跑到 100%，停留中有一塊亮光來回 */
  const prog = p.enter(0.4, 0.6);
  p.fade(p.enter(0.35, 0.2), () => {
    c.lineWidth = 1;
    c.strokeRect(130, 296, 300, 12);
    c.fillStyle = f.accent;
    c.fillRect(130, 296, 300 * prog, 12);
    if (p.settled()) {
      c.fillStyle = f.main;
      p.fade(0.5, () => c.fillRect(130 + 256 * p.turns(1), 296, 44, 12));
    }
    c.fillStyle = f.main;
    p.text(`${Math.round(prog * 100)}%`, 446, 307, 14, { mono: true, track: 1 });
  });
  /* 右邊的波形面板 */
  p.fade(0.8, () => p.path(roundedRect(836, 44, 310, 310, 10), p.enter(0.25, 0.35), 1.5, true));
  const panel = p.enter(0.4, 0.3);
  p.fade(panel, () => {
    p.text('WAVE', 852, 72, 12, { mono: true, track: 2, alpha: 0.7 });
    p.fade(0.18, () => {
      for (let k = 0; k < 4; k++) p.line(846, 120 + k * 56, 1136, 120 + k * 56, 1);
      for (let k = 0; k < 5; k++) p.line(876 + k * 52, 96, 876 + k * 52, 344, 1);
    });
  });
  const amp = p.enter(0.5, 0.45);
  if (amp > 0) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 58; i++) {
      const u = i / 58;
      const v =
        0.62 * Math.sin(TAU * (u * 2 + p.turns(1))) + 0.38 * Math.sin(TAU * (u * 5 - p.turns(2)));
      pts.push([846 + i * 5, 218 + v * 68 * amp]);
    }
    p.path(pts, 1, 2);
    const last = pts[pts.length - 1];
    p.disc(last[0], last[1], 4, f.accent);
    c.fillStyle = f.main;
  }
}

const DRAW: Record<SfTemplateId, (p: HudPen) => void> = {
  radar,
  readout,
  alert,
  tag,
  medal,
  chapter,
  viewfinder,
  console: consoleWindow,
};

/** 在設計空間畫一個範本（ctx 已經設好設計空間的座標、整體不透明度） */
export function drawSfTemplate(tpl: SfTemplateId, frame: SfFrame): void {
  const c = frame.ctx;
  c.strokeStyle = frame.main;
  c.fillStyle = frame.main;
  (DRAW[tpl] ?? radar)(new HudPen(frame));
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

/** 顆粒雜訊的底圖（160 × 160，每個像素的透明度是固定的亂數） */
function grainImage(): SpriteCanvas {
  if (grainTile) return grainTile;
  const n = 160;
  const c = createSpriteCanvas(n, n);
  const x = c.getContext('2d') as Ctx;
  const img = x.createImageData(n, n);
  const rnd = createRandom('text-fx:sf-grain');
  for (let i = 0; i < n * n; i++) img.data[i * 4 + 3] = rnd.int(0, 255);
  x.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

const mkLayer = (w: number, h: number): NoiseLayer => {
  const c = createSpriteCanvas(w, h);
  return { c, x: c.getContext('2d') as Ctx };
};

export interface SfDrawOptions {
  /** 範本縮圖：一律畫停留中的樣子（沒有登場、退場） */
  idle?: boolean;
  /** 換一個範本畫（縮圖用） */
  tpl?: SfTemplateId;
}

/** 雜訊的尺度（設計空間的 px；分色距離、切片高度與錯開量以它為準） */
const NOISE_UNIT = 64;

/**
 * 這一格的整塊狀態：故障開著時，登場用「雜訊干擾」、停留中用「偶爾雜訊」、退場用「雜訊斷訊」（text-fx 的效果），
 * 退場的淡出與閃斷一律照「雜訊斷訊」；故障關掉時只留退場的淡出與閃斷。
 */
export function sfBlockAt(
  cfg: Settings,
  t: number,
  unit: number,
  out: BlockState = freshBlockState(),
  idle = false,
): BlockState {
  const b = freshBlockState(out);
  const sf = sfOf(cfg);
  const tm = sfTiming(cfg);
  const pr = idle ? { intro: 1, outro: 0 } : sfProgress(tm, t);
  const linear = (u: number) => u;
  const noiseIn = INTRO.glitch;
  if (sf.glitch && !idle && tm.Ti > 0 && noiseIn.unit === 'block') {
    const dur = Math.min(noiseIn.dur, tm.Ti);
    if (t < dur)
      noiseIn.apply(b, t / dur, linear, {
        S: unit,
        P: 1,
        seed: seedOf('glitch'),
        vertical: false,
        tLocal: t,
        tAbs: t,
        dur,
      });
  }
  if (sf.glitch && pr.intro >= 1 && pr.outro <= 0)
    HOLD.glitchPulse.block?.(b, t, {
      S: unit,
      P: 1,
      seed: 777,
      vertical: false,
      introEnd: tm.Ti,
      holdEnd: tm.D - tm.To,
    });
  if (pr.outro > 0) {
    const start = tm.D - tm.To;
    const o = freshBlockState();
    const noiseOut = OUTRO.glitchOut;
    if (noiseOut.unit === 'block')
      noiseOut.apply(o, pr.outro, linear, {
        S: unit,
        P: 1,
        seed: seedOf('glitchOut') + 3,
        vertical: false,
        tLocal: t - start,
        tAbs: t,
        dur: tm.To,
      });
    b.alpha *= o.alpha;
    if (sf.glitch) {
      b.glitch = Math.max(b.glitch, o.glitch);
      b.dx += o.dx;
    }
  }
  return b;
}

/** 畫 SF 標題的一格（每個 painter 有自己的暫存畫布） */
export class SfPainter {
  private layers: (NoiseLayers & { scratch: NoiseLayer }) | null = null;
  private readonly blk: BlockState = freshBlockState();

  private ensure(W: number, H: number) {
    const L = this.layers;
    if (!L || L.text.c.width !== W || L.text.c.height !== H)
      this.layers = {
        text: mkLayer(W, H),
        a: mkLayer(W, H),
        b: mkLayer(W, H),
        mix: mkLayer(W, H),
        scratch: mkLayer(W, H),
      };
    return this.layers!;
  }

  draw(ctx: Ctx, cfg: Settings, t: number, W: number, H: number, o: SfDrawOptions = {}): void {
    const sf = sfOf(cfg);
    const tm = sfTiming(cfg);
    const pr = o.idle ? { intro: 1, outro: 0 } : sfProgress(tm, t);
    const L = this.ensure(W, H);
    const { s, ox, oy } = sfFit(W, H);
    const blk = sfBlockAt(cfg, t, NOISE_UNIT * s, this.blk, o.idle);
    const art = L.text.x;
    art.setTransform(1, 0, 0, 1, 0, 0);
    art.globalAlpha = 1;
    art.globalCompositeOperation = 'source-over';
    art.clearRect(0, 0, W, H);
    art.setTransform(s, 0, 0, s, ox + blk.dx, oy);
    art.globalAlpha = Math.max(0, Math.min(1, blk.alpha));
    art.lineCap = 'butt';
    art.lineJoin = 'miter';
    art.setLineDash([]);
    drawSfTemplate(o.tpl ?? sf.tpl, {
      ctx: art,
      t,
      D: tm.D,
      intro: pr.intro,
      outro: pr.outro,
      main: sf.main,
      accent: sf.accent,
      title: clip(cfg.text, SF_LIMITS.title),
      sub: clip(cfg.sub, SF_LIMITS.sub),
      code: sfCodeOf(cfg),
      num: sf.num.trim(),
      fonts: sfFonts(cfg),
      scratch: L.scratch,
    });
    art.setTransform(1, 0, 0, 1, 0, 0);
    art.globalAlpha = 1;
    /* 顆粒雜訊：用固定的雜訊圖挖掉一點點透明度（不隨時間變） */
    if (sf.grain > 0) {
      const pat = art.createPattern(grainImage() as CanvasImageSource, 'repeat');
      if (pat) {
        art.globalCompositeOperation = 'destination-out';
        art.globalAlpha = sf.grain * 0.05;
        art.fillStyle = pat;
        art.fillRect(0, 0, W, H);
        art.globalAlpha = 1;
      }
    }
    /* 掃描線：每隔約 4 個設計單位挖掉一條細線 */
    if (sf.scan) {
      art.globalCompositeOperation = 'destination-out';
      art.fillStyle = 'rgba(0,0,0,0.38)';
      const step = Math.max(2, Math.round(4 * s));
      const band = Math.max(1, Math.round(1.5 * s));
      for (let y = 0; y < H; y += step) art.fillRect(0, y, W, band);
    }
    art.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    /* 光暈：只畫影子（圖本身移到畫面外），近的一層＋遠的一層 */
    if (sf.glow > 0) {
      const away = W + 64;
      ctx.shadowColor = sf.main;
      ctx.shadowOffsetX = away;
      for (const [blur, a] of [
        [sf.glow * 4 * s, 0.9],
        [sf.glow * 11 * s, 0.5],
      ] as const) {
        ctx.globalAlpha = a;
        ctx.shadowBlur = blur;
        ctx.drawImage(L.text.c as CanvasImageSource, -away, 0);
      }
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
    }
    if (blk.glitch > 0.004)
      paintNoise(ctx, L.text.c, L, {
        W,
        H,
        amount: blk.glitch,
        t,
        unit: NOISE_UNIT * s,
        top: oy,
        height: SF_DESIGN.h * s,
        colorA: cfg.glitchA || '#ff2a6d',
        colorB: cfg.glitchB || '#23e5ff',
      });
    else ctx.drawImage(L.text.c as CanvasImageSource, 0, 0);
    ctx.restore();
  }
}
