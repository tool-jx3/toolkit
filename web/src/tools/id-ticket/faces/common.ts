/**
 * 證件範本共用的東西：畫的環境（成品尺寸、出血、主題色、深淺色）、基本配色、小標、資料列。
 * 座標是設計單位（1 mm＝5.5），原點在成品的左上角；背景畫到出血（−11～成品＋11）。
 */
import { onColor, tint } from '../colors';
import type { IdTemplate } from '../templates';
import { type DrawEnv, field, line, text } from '../kit';

export interface IdEnv extends DrawEnv {
  /** 成品寬高（設計單位） */
  W: number;
  H: number;
  /** 出血（設計單位） */
  B: number;
  /** 安全範圍（成品邊往內） */
  S: number;
  /** 主題色 */
  c: string;
  dk: boolean;
  /** 背景漸層（會員卡；已經依主題色算好） */
  g1: string;
  g2: string;
  tpl: IdTemplate;
  /** QR code 的內容（已經決定好：QR 欄位 → 編號 → 範本的預設字） */
  qrContent: string;
  /** 編號（條碼的內容） */
  code: string;
}

export type FaceFn = (e: IdEnv) => void;

export interface IdFaces {
  front: FaceFn;
  back: FaceFn;
}

/** 基本配色：底、字、次要字、分隔線、強調字、主題色上的字 */
export function tones(e: IdEnv) {
  const { c, dk } = e;
  return {
    bg: dk ? '#15171c' : '#ffffff',
    fg: dk ? '#f1f2f4' : '#17181c',
    mu: dk ? 'rgba(241,242,244,0.55)' : '#7d828c',
    ln: dk ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.09)',
    hc: dk ? tint(c, 0.35) : c,
    oc: onColor(c),
  };
}

/** 整面（含出血）塗滿 */
export function fillBleed(e: IdEnv, fill: string | CanvasGradient): void {
  e.ctx.fillStyle = fill;
  e.ctx.fillRect(-e.B, -e.B, e.W + e.B * 2, e.H + e.B * 2);
}

/** 一條橫帶：y0～y1（左右到出血；y0／y1 在邊上時延伸到出血） */
export function band(e: IdEnv, y0: number, y1: number, fill: string | CanvasGradient): void {
  const top = y0 <= 0 ? -e.B : y0;
  const bottom = y1 >= e.H ? e.H + e.B : y1;
  e.ctx.fillStyle = fill;
  e.ctx.fillRect(-e.B, top, e.W + e.B * 2, bottom - top);
}

/** 小標：粗體、小字、字距寬（英文字自動大寫） */
export function cap(
  e: IdEnv,
  t: string,
  x: number,
  y: number,
  color: string,
  o: { size?: number; align?: 'left' | 'center' | 'right'; maxWidth?: number } = {},
): void {
  const size = o.size ?? 6.5;
  text(e, t, x, y, {
    size,
    weight: 700,
    color,
    spacing: size * 0.16,
    upper: true,
    align: o.align,
    maxWidth: o.maxWidth,
  });
}

/** 一組「小標＋值」（值在小標下方） */
export function labeled(
  e: IdEnv,
  caption: string,
  key: string,
  x: number,
  y: number,
  o: {
    width: number;
    capColor: string;
    color: string;
    size?: number;
    weight?: number;
    mono?: boolean;
    gap?: number;
    align?: 'left' | 'center' | 'right';
  },
): void {
  cap(e, caption, x, y, o.capColor, { align: o.align, maxWidth: o.width });
  const size = o.size ?? 10.5;
  field(e, key, x, y + (o.gap ?? 4) + size, {
    font: o.mono ? 'mono' : 'sans',
    size,
    weight: o.weight ?? 600,
    color: o.color,
    maxWidth: o.width,
    align: o.align,
  });
}

/** 資料列：左邊名稱、右邊值（欄位），列與列之間細線 */
export function rows(
  e: IdEnv,
  list: readonly (readonly [string, string])[],
  x: number,
  y: number,
  w: number,
  o: { mu: string; fg: string; ln: string; rowH?: number; size?: number },
): number {
  const rowH = o.rowH ?? 22;
  const size = o.size ?? 9;
  list.forEach(([caption, key], i) => {
    const base = y + i * rowH + rowH * 0.66;
    const capW = text(e, caption, x, base, { size: size - 0.5, color: o.mu }).width;
    field(e, key, x + w, base, {
      size,
      weight: 600,
      color: o.fg,
      align: 'right',
      maxWidth: Math.max(30, w - capW - 12),
    });
    if (i < list.length - 1) line(e.ctx, x, y + (i + 1) * rowH, x + w, y + (i + 1) * rowH, o.ln, 0.8);
  });
  return y + list.length * rowH;
}

/** 依今天的日期（YYYY.MM.DD） */
export const todayText = (now = new Date()): string =>
  `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

/** 淡色的對角紋（防偽底紋的感覺） */
export function hatch(e: IdEnv, x: number, y: number, w: number, h: number, color: string, gap = 7): void {
  const { ctx } = e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let k = -h; k < w; k += gap) {
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** 波浪的防偽紋（幾條正弦線） */
export function guilloche(
  e: IdEnv,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  n = 7,
): void {
  const { ctx } = e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.55;
  for (let k = 0; k < n; k++) {
    ctx.beginPath();
    const phase = (k / n) * Math.PI * 2;
    for (let px = 0; px <= w; px += 2) {
      const py = y + h / 2 + Math.sin(px / 18 + phase) * h * 0.32 + Math.sin(px / 47 + phase * 2) * h * 0.12;
      if (px === 0) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
