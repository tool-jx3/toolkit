/**
 * 名字與徽章（eidolon-ui 的做法，MIT）：切角的名字牌或沿外框的弧形文字、圓形的徽章；位置是離棋子中心的位移（R 為單位），
 * 拖曳時吸附到幾個位置（名字牌：上、下、中心、中線；弧形：每 45°；徽章：四角、四邊、中心），按住 Alt 不吸附。
 * 版面的計算給繪製與預覽的點選共用。純繪圖，不碰 DOM。
 */
import { fontCss } from '@/core/fonts';
import type { Ctx2D } from './frames';
import { frameDef } from './frames';
import type { ColorSource, Geom, Look, TokenItem } from './model';

export type OverlayKind = 'label' | 'badge';

/** 名字牌、徽章取色用的三個顏色 */
export interface LookColors {
  frame: string;
  accent: string;
  bg: string;
}

/** 這個外觀有沒有畫出第二色 */
export function accentShown(look: Look): boolean {
  const def = frameDef(look.frame);
  return def.accent === 'always' || (def.accent === 'optional' && look.accentOn);
}

export function lookColors(look: Look): LookColors {
  const frame = look.colorMode === 'gradient' ? look.g1 : look.color;
  return { frame, accent: accentShown(look) ? look.accent : frame, bg: look.bgColor };
}

/** 顏色來源 → 色碼（'auto' 回傳 null，由呼叫端依底色挑深淺） */
export function colorFrom(
  from: ColorSource | 'auto',
  custom: string,
  c: LookColors,
): string | null {
  if (from === 'frame') return c.frame;
  if (from === 'accent') return c.accent;
  if (from === 'bg') return c.bg;
  if (from === 'auto') return null;
  return custom;
}

/** 底色上的字：亮的底用深色、暗的底用淺色 */
export function ink(hex: string): string {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? '#050507' : '#e8e8ee';
}

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function setSpacing(ctx: Ctx2D, px: number): void {
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${px}px`;
}

export const labelText = (look: Look, t: Pick<TokenItem, 'name'> | null): string =>
  look.labelOn && t?.name.trim() ? t.name.trim().toUpperCase() : '';

export const badgeText = (
  look: Look,
  t: Pick<TokenItem, 'badge'> | null,
  override?: string | null,
): string =>
  override != null
    ? String(override).trim().toUpperCase()
    : look.badgeOn && t
      ? t.badge.trim().toUpperCase()
      : '';

/** 弧形文字的方向（位置的角度；沒有位置時朝下） */
function arcAngle(look: Look): number {
  return look.labelX || look.labelY ? Math.atan2(look.labelY, look.labelX) : Math.PI / 2;
}

export interface PlateLayout {
  fs: number;
  h: number;
  pw: number;
  k: number;
  xc: number;
  yc: number;
}

export function plateLayout(ctx: Ctx2D, text: string, g: Geom, look: Look): PlateLayout {
  const N = g.N;
  let fs = N * 0.068;
  ctx.font = fontCss(look.font, fs);
  setSpacing(ctx, fs * 0.08);
  const maxW = N * 0.8;
  let w = ctx.measureText(text).width;
  if (w > maxW) {
    fs *= maxW / w;
    ctx.font = fontCss(look.font, fs);
    setSpacing(ctx, fs * 0.08);
    w = ctx.measureText(text).width;
  }
  const h = fs * 1.6;
  const pw = w + fs * 1.6;
  const pad = N * 0.012;
  /* 整個名字牌留在棋子上 */
  return {
    fs,
    h,
    pw,
    k: h * 0.38,
    xc: clampTo(g.c + look.labelX * g.R, pw / 2 + pad, N - pw / 2 - pad),
    yc: clampTo(g.c + look.labelY * g.R, h / 2 + pad, N - h / 2 - pad),
  };
}

export interface ArcLayout {
  fs: number;
  ws: number[];
  r: number;
  th: number;
  span: number;
  pad: number;
  top: boolean;
}

export function arcLayout(ctx: Ctx2D, text: string, g: Geom, look: Look): ArcLayout {
  const N = g.N;
  let fs = N * 0.062;
  const chars = [...text];
  const measureAll = () => {
    ctx.font = fontCss(look.font, fs);
    setSpacing(ctx, 0);
    const ws = chars.map((ch) => ctx.measureText(ch).width + fs * 0.12);
    return { ws, total: ws.reduce((a, b) => a + b, 0) };
  };
  let m = measureAll();
  let r = g.R - fs * 0.8;
  const maxSpan = (150 * Math.PI) / 180;
  while (m.total / r > maxSpan && fs > N * 0.02) {
    fs *= 0.92;
    m = measureAll();
    r = g.R - fs * 0.8;
  }
  const th = arcAngle(look);
  /* 上半圈的字反過來排，才不會倒著讀 */
  return { fs, ws: m.ws, r, th, span: m.total / r, pad: (fs * 0.9) / r, top: Math.sin(th) < -1e-6 };
}

export function badgeLayout(g: Geom, look: Look): { r: number; bx: number; by: number } {
  const N = g.N;
  const r = N * 0.088;
  const e = r + N * 0.006;
  return {
    r,
    bx: clampTo(g.c + look.badgeX * g.R, e, N - e),
    by: clampTo(g.c + look.badgeY * g.R, e, N - e),
  };
}

export function drawLabel(ctx: Ctx2D, text: string, g: Geom, look: Look): void {
  const c = lookColors(look);
  const N = g.N;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const plate = colorFrom(look.plateFrom, look.plateColor, c) ?? c.frame;
  const fg = colorFrom(look.labelFrom, look.labelColor, c) ?? ink(plate);
  if (look.labelStyle === 'plate') {
    const { fs, h, pw, k, xc, yc } = plateLayout(ctx, text, g, look);
    const x0 = xc - pw / 2;
    const y0 = yc - h / 2;
    ctx.beginPath();
    ctx.moveTo(x0 + k, y0);
    ctx.lineTo(x0 + pw, y0);
    ctx.lineTo(x0 + pw, y0 + h - k);
    ctx.lineTo(x0 + pw - k, y0 + h);
    ctx.lineTo(x0, y0 + h);
    ctx.lineTo(x0, y0 + k);
    ctx.closePath();
    ctx.fillStyle = plate;
    ctx.fill();
    if (accentShown(look)) {
      ctx.lineWidth = Math.max(1, N * 0.004);
      ctx.strokeStyle = look.accent;
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.fillText(text, xc, yc + fs * 0.04);
  } else {
    const L = arcLayout(ctx, text, g, look);
    ctx.strokeStyle = plate;
    ctx.lineWidth = L.fs * 1.6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(g.c, g.c, L.r, L.th - L.span / 2 - L.pad, L.th + L.span / 2 + L.pad);
    ctx.stroke();
    ctx.fillStyle = fg;
    let acc = 0;
    [...text].forEach((ch, i) => {
      const d = (acc + L.ws[i] / 2) / L.r;
      const th = L.top ? L.th - L.span / 2 + d : L.th + L.span / 2 - d;
      acc += L.ws[i];
      ctx.save();
      ctx.translate(g.c + L.r * Math.cos(th), g.c + L.r * Math.sin(th));
      ctx.rotate(th + (L.top ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillText(ch, 0, L.fs * 0.04);
      ctx.restore();
    });
  }
  ctx.restore();
}

export function drawBadge(ctx: Ctx2D, text: string, g: Geom, look: Look): void {
  const c = lookColors(look);
  const N = g.N;
  const { r, bx, by } = badgeLayout(g, look);
  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  const fill = colorFrom(look.badgeFrom, look.badgeColor, c) ?? c.accent;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = N * 0.012;
  ctx.strokeStyle = look.bg === 'color' ? look.bgColor : '#050507';
  ctx.stroke();
  let fs = r * 1.1;
  ctx.font = fontCss(look.font, fs);
  setSpacing(ctx, 0);
  const w = ctx.measureText(text).width;
  if (w > r * 1.55) {
    fs *= (r * 1.55) / w;
    ctx.font = fontCss(look.font, fs);
  }
  ctx.fillStyle = colorFrom(look.badgeTextFrom, look.badgeTextColor, c) ?? ink(fill);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, by + fs * 0.05);
  ctx.restore();
}

/** 棋子上 (x, y) 點到的是哪一個（徽章畫在最上面，先判斷）；沒有時 null */
export function overlayAt(
  ctx: Ctx2D,
  g: Geom,
  look: Look,
  token: Pick<TokenItem, 'name' | 'badge'> | null,
  x: number,
  y: number,
): OverlayKind | null {
  if (badgeText(look, token)) {
    const b = badgeLayout(g, look);
    if (Math.hypot(x - b.bx, y - b.by) <= b.r * 1.1) return 'badge';
  }
  const text = labelText(look, token);
  if (!text) return null;
  if (look.labelStyle === 'arc') {
    const L = arcLayout(ctx, text, g, look);
    const d = Math.hypot(x - g.c, y - g.c);
    let da = Math.atan2(y - g.c, x - g.c) - L.th;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(d - L.r) <= L.fs * 0.9 && Math.abs(da) <= L.span / 2 + L.pad ? 'label' : null;
  }
  const P = plateLayout(ctx, text, g, look);
  return Math.abs(x - P.xc) <= P.pw / 2 && Math.abs(y - P.yc) <= P.h / 2 ? 'label' : null;
}

/* ---------- 吸附 ---------- */

const D = 0.74;
const E = 0.92;
export const SNAPS: Record<OverlayKind, [number, number][]> = {
  label: [
    [0, 0.8],
    [0, -0.8],
    [0, 0],
  ],
  badge: [
    [D, D],
    [-D, D],
    [D, -D],
    [-D, -D],
    [0, E],
    [0, -E],
    [E, 0],
    [-E, 0],
    [0, 0],
  ],
};
const ARC_STEP = Math.PI / 4;
const ARC_SNAP = (7 * Math.PI) / 180;
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * 拖曳到 (x, y)（R 為單位）：吸到範圍內最近的位置，否則吸到直、橫的中線；free（Alt）時不吸附。
 * 弧形文字只看方向（每 45° 吸附），放回半徑 0.8 的位置。
 */
export function snapOverlay(
  which: OverlayKind,
  style: Look['labelStyle'],
  x: number,
  y: number,
  free: boolean,
): [number, number] {
  if (which === 'label' && style === 'arc') {
    let th = Math.atan2(y, x);
    const k = Math.round(th / ARC_STEP) * ARC_STEP;
    if (!free && Math.abs(th - k) <= ARC_SNAP) th = k;
    return [round4(Math.cos(th) * 0.8), round4(Math.sin(th) * 0.8)];
  }
  if (free) return [x, y];
  const reach = which === 'badge' ? 0.12 : 0.1;
  let best: [number, number] | null = null;
  let bd = reach;
  for (const p of SNAPS[which]) {
    const d = Math.hypot(x - p[0], y - p[1]);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (best) return [best[0], best[1]];
  return [Math.abs(x) < reach / 2 ? 0 : x, Math.abs(y) < reach / 2 ? 0 : y];
}
