/**
 * 畫一個泡泡（規格 3.2）：外框、標題、圖示、內文（打字、淡入、逐行）、按鈕、停留時的閃光與掃描線。
 * 原點是泡泡本體的左上角；超出本體的部分（尾巴、名字、名牌、光暈、陰影）畫在 layout 的 ext 範圍內。
 * 只用 canvas 2D 的基本指令（Node 的單元測試以假的 context 檢查）。
 */
import { parseColor, readableTextColor } from '@/core/color';
import { traceShape } from '@/core/shapes';
import type { Ctx2D } from '@/core/timeline';
import { hashSigned, hashUnit } from '@/core/timeline';
import type { BubbleLayout } from './layout';
import type { Bubble, CursorId, IconId, Palette } from './model';

/* ---------- 顏色 ---------- */

/** 顏色乘上透明度 → CSS rgba() */
export function rgba(color: string, mul = 1): string {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const a = Math.max(0, Math.min(1, c.a * mul));
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${+a.toFixed(3)})`;
}

/** 兩色內插（透明度也內插） */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const y = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  const k = Math.max(0, Math.min(1, t));
  const ch = (p: number, q: number) => Math.round(p + (q - p) * k);
  return `rgba(${ch(x.r, y.r)}, ${ch(x.g, y.g)}, ${ch(x.b, y.b)}, ${+(x.a + (y.a - x.a) * k).toFixed(3)})`;
}

const isClear = (color: string): boolean => (parseColor(color)?.a ?? 1) <= 0.001;

/** 目前變換的縮放（陰影、光暈的模糊不跟著變換，要自己乘上） */
export function deviceScale(ctx: Ctx2D): number {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  if (!m) return 1;
  const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/* ---------- 路徑 ---------- */

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

const ellipsePath = (ctx: Ctx2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.moveTo(cx + rx, cy);
  ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  ctx.closePath();
};

const circlePath = (ctx: Ctx2D, cx: number, cy: number, r: number) => {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.closePath();
};

/** 吶喊泡泡的鋸齒外框（相對於中心的頂點；同一個泡泡每次相同） */
export function burstPoints(w: number, h: number, fs: number, seed: number): [number, number][] {
  const rx = w / 2;
  const ry = h / 2;
  const n = Math.max(12, Math.min(28, Math.round((Math.PI * (rx + ry)) / (fs * 1.1))));
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const outer = i % 2 === 0;
    const jitter = outer
      ? 0.7 + 0.3 * hashUnit(seed, i, 41)
      : 0.92 + 0.04 * hashSigned(seed, i, 43);
    const ex = outer ? rx + fs * 0.9 * jitter : rx * jitter;
    const ey = outer ? ry + fs * 0.9 * jitter : ry * jitter;
    pts.push([w / 2 + Math.cos(a) * ex, h / 2 + Math.sin(a) * ey]);
  }
  return pts;
}

/** 羊皮紙的不規則邊（沿四邊取樣、往內外抖動） */
export function roughPoints(w: number, h: number, fs: number, seed: number): [number, number][] {
  const step = Math.max(6, fs * 0.55);
  const pts: [number, number][] = [];
  const amp = fs * 0.16;
  let k = 0;
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const j = hashSigned(seed, k++, 47) * amp + Math.sin(u * 9 + k) * amp * 0.25;
      pts.push([x0 + (x1 - x0) * u + nx * j, y0 + (y1 - y0) * u + ny * j]);
    }
  };
  edge(0, 0, w, 0, 0, -1);
  edge(w, 0, w, h, 1, 0);
  edge(w, h, 0, h, 0, 1);
  edge(0, h, 0, 0, -1, 0);
  return pts;
}

const polyPath = (ctx: Ctx2D, pts: readonly [number, number][]) => {
  pts.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
};

/** 想法泡泡：橢圓周圍一圈小圓（雲朵） */
function cloudCircles(w: number, h: number, fs: number): [number, number, number][] {
  const rx = w / 2;
  const ry = h / 2;
  const perim = Math.PI * (rx + ry);
  const n = Math.max(8, Math.min(22, Math.round(perim / (fs * 1.35))));
  const rb = Math.max(fs * 0.55, (perim / n) * 0.62);
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([w / 2 + Math.cos(a) * (rx - rb * 0.45), h / 2 + Math.sin(a) * (ry - rb * 0.45), rb]);
  }
  return out;
}

/** 泡泡本體的路徑（填色、裁切閃光與掃描線用；不含尾巴） */
export function traceBody(ctx: Ctx2D, L: BubbleLayout, seed: number): void {
  const { w, h, fs } = L;
  ctx.beginPath();
  switch (L.spec.id) {
    case 'messenger':
      roundRectPath(ctx, 0, 0, w, h, Math.min(h / 2, fs * 0.95));
      break;
    case 'speech':
      ellipsePath(ctx, w / 2, h / 2, w / 2, h / 2);
      break;
    case 'thought':
      ellipsePath(ctx, w / 2, h / 2, w / 2 - fs * 0.1, h / 2 - fs * 0.1);
      for (const [cx, cy, r] of cloudCircles(w, h, fs)) circlePath(ctx, cx, cy, r);
      break;
    case 'shout':
      polyPath(ctx, burstPoints(w, h, fs, seed));
      break;
    case 'tag': {
      const c = h * 0.32;
      polyPath(ctx, [
        [c, 0],
        [w - c, 0],
        [w, h / 2],
        [w - c, h],
        [c, h],
        [0, h / 2],
      ]);
      break;
    }
    case 'sticky': {
      const k = Math.min(fs * 0.95, w * 0.2, h * 0.3);
      polyPath(ctx, [
        [0, 0],
        [w, 0],
        [w, h - k],
        [w - k, h],
        [0, h],
      ]);
      break;
    }
    case 'parchment':
      polyPath(ctx, roughPoints(w, h, fs, seed));
      break;
    case 'capsule':
      roundRectPath(ctx, 0, 0, w, h, h / 2);
      break;
    case 'hud':
    case 'news':
      ctx.rect(0, 0, w, h);
      break;
    case 'notebook':
      roundRectPath(ctx, 0, 0, w, h, 3);
      break;
    case 'rpg':
    case 'battle':
    case 'hologram':
      roundRectPath(ctx, 0, 0, w, h, fs * 0.16);
      break;
    case 'chat-card':
      roundRectPath(ctx, 0, 0, w, h, fs * 0.55);
      break;
    case 'glass':
      roundRectPath(ctx, 0, 0, w, h, fs * 0.7);
      break;
    case 'neon':
      roundRectPath(ctx, 0, 0, w, h, fs * 0.45);
      break;
    case 'toast':
      roundRectPath(ctx, 0, 0, w, h, fs * 0.4);
      break;
    default:
      roundRectPath(ctx, 0, 0, w, h, fs * 0.32);
  }
}

/* ---------- 陰影與光暈 ---------- */

function withShadow(
  ctx: Ctx2D,
  on: boolean,
  fs: number,
  draw: () => void,
  color = 'rgba(0, 0, 0, 0.24)',
): void {
  if (!on) {
    draw();
    return;
  }
  const s = deviceScale(ctx);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = fs * 0.6 * s;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = fs * 0.22 * s;
  draw();
  ctx.restore();
}

function withGlow(ctx: Ctx2D, color: string, blur: number, draw: () => void): void {
  if (blur <= 0 || isClear(color)) {
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = rgba(color, 0.9);
  ctx.shadowBlur = blur * deviceScale(ctx);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  draw();
  ctx.restore();
}

const fillIf = (ctx: Ctx2D, color: string | CanvasGradient) => {
  if (typeof color === 'string' && isClear(color)) return;
  ctx.fillStyle = color;
  ctx.fill();
};
const strokeIf = (ctx: Ctx2D, color: string, width: number) => {
  if (isClear(color) || width <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
};

function vGradient(ctx: Ctx2D, h: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/* ---------- 圖示 ---------- */

/** 圖示（圓底或三角底＋符號）。big＝系統視窗的大圖示，警告用三角形。 */
export function drawIcon(
  ctx: Ctx2D,
  id: IconId,
  cx: number,
  cy: number,
  size: number,
  bg: string,
  fg: string,
  big = false,
): void {
  if (id === 'none') return;
  const r = size / 2;
  ctx.save();
  if (id === 'dot') {
    ctx.beginPath();
    circlePath(ctx, cx, cy, r * 0.75);
    fillIf(ctx, bg);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  if (big && id === 'warn') {
    const tr = r * 1.08;
    ctx.moveTo(cx, cy - tr);
    ctx.lineTo(cx + tr * 1.05, cy + tr * 0.85);
    ctx.lineTo(cx - tr * 1.05, cy + tr * 0.85);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = bg;
    ctx.stroke();
  } else circlePath(ctx, cx, cy, r);
  fillIf(ctx, bg);
  const lw = Math.max(1, size * 0.11);
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const k = r * 0.5;
  const oy = big && id === 'warn' ? r * 0.18 : 0;
  switch (id) {
    case 'check':
      ctx.beginPath();
      ctx.moveTo(cx - k * 0.95, cy + k * 0.02);
      ctx.lineTo(cx - k * 0.25, cy + k * 0.7);
      ctx.lineTo(cx + k * 1.0, cy - k * 0.65);
      ctx.stroke();
      break;
    case 'cross':
      ctx.beginPath();
      ctx.moveTo(cx - k * 0.7, cy - k * 0.7);
      ctx.lineTo(cx + k * 0.7, cy + k * 0.7);
      ctx.moveTo(cx + k * 0.7, cy - k * 0.7);
      ctx.lineTo(cx - k * 0.7, cy + k * 0.7);
      ctx.stroke();
      break;
    case 'warn':
      ctx.beginPath();
      ctx.moveTo(cx, cy - k * 0.95 + oy);
      ctx.lineTo(cx, cy + k * 0.3 + oy);
      ctx.stroke();
      ctx.beginPath();
      circlePath(ctx, cx, cy + k * 0.85 + oy, lw * 0.6);
      ctx.fill();
      break;
    case 'info':
      ctx.beginPath();
      circlePath(ctx, cx, cy - k * 0.85, lw * 0.6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - k * 0.25);
      ctx.lineTo(cx, cy + k * 0.95);
      ctx.stroke();
      break;
    case 'question':
      ctx.beginPath();
      ctx.arc(cx, cy - k * 0.35, k * 0.55, Math.PI * 1.05, Math.PI * 2.25);
      ctx.quadraticCurveTo(cx, cy - k * 0.05, cx, cy + k * 0.35);
      ctx.stroke();
      ctx.beginPath();
      circlePath(ctx, cx, cy + k * 0.95, lw * 0.6);
      ctx.fill();
      break;
    case 'person':
      ctx.beginPath();
      circlePath(ctx, cx, cy - r * 0.22, r * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy + r * 0.6);
      ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.12, cx, cy + r * 0.12);
      ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.12, cx + r * 0.55, cy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'star':
      traceShape(ctx, 'star', cx, cy + r * 0.04, r * 0.62);
      ctx.fill();
      break;
    case 'heart':
      traceShape(ctx, 'heart', cx, cy + r * 0.04, r * 0.55);
      ctx.fill();
      break;
    case 'bell':
      ctx.beginPath();
      ctx.moveTo(cx - k * 0.85, cy + k * 0.55);
      ctx.quadraticCurveTo(cx - k * 0.75, cy - k * 0.95, cx, cy - k * 0.95);
      ctx.quadraticCurveTo(cx + k * 0.75, cy - k * 0.95, cx + k * 0.85, cy + k * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      circlePath(ctx, cx, cy + k * 0.85, lw * 0.75);
      ctx.fill();
      break;
  }
  ctx.restore();
}

/* ---------- 文字 ---------- */

export interface TextState {
  /** 內文顯示到第幾個字（字素，Infinity＝全部） */
  visible: number;
  /** 內文的透明度（淡入） */
  alpha: number;
  /** 逐行出現：每行的透明度與往下的位移；null＝不用 */
  lines: { alpha: number; dy: number }[] | null;
  cursor: CursorId;
  cursorOn: boolean;
}

export const FULL_TEXT: TextState = {
  visible: Number.POSITIVE_INFINITY,
  alpha: 1,
  lines: null,
  cursor: 'none',
  cursorOn: false,
};

export interface DrawEnv {
  shadow: boolean;
  /** 這個泡泡登場完之後過了幾秒（造型本身的小動畫用；登場中是負的） */
  u: number;
  seed: number;
  text: TextState;
  /** 閃光、掃描線的位置（0～1；null＝沒有） */
  shine: number | null;
  scan: number | null;
}

function textGlowBlur(L: BubbleLayout): number {
  return L.spec.textGlow * L.fs;
}

function drawTitle(ctx: Ctx2D, L: BubbleLayout, c: Palette): void {
  if (!L.title) return;
  const mode = L.spec.titleMode;
  const color = mode === 'label' ? c.text : c.accent;
  ctx.save();
  ctx.font = L.titleFont;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  const glow = L.spec.textGlow > 0 && mode !== 'label' ? textGlowBlur(L) : 0;
  withGlow(ctx, c.accent, glow, () => ctx.fillText(L.title, L.titleX, L.titleCy));
  ctx.restore();
}

function drawBodyText(ctx: Ctx2D, L: BubbleLayout, c: Palette, st: TextState): void {
  if (!L.lines.length && st.cursor === 'none') return;
  ctx.save();
  ctx.font = L.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.globalAlpha *= st.alpha;
  const glow = textGlowBlur(L);
  const holo = L.spec.id === 'hologram';
  const soft = L.spec.id === 'glass';
  let left = st.visible;
  let cursorAt: { x: number; cy: number } | null = null;
  L.lines.forEach((line, i) => {
    const n = Math.max(0, Math.min(line.chars.length, left));
    left -= n;
    const la = st.lines?.[i];
    const dy = la?.dy ?? 0;
    if (n > 0 && (la?.alpha ?? 1) > 0) {
      const s = line.chars.slice(0, n).join('');
      ctx.save();
      if (la) ctx.globalAlpha *= la.alpha;
      if (holo) {
        ctx.fillStyle = rgba(c.accent, 0.55);
        ctx.fillText(s, line.x - L.fs * 0.07, line.cy + dy);
        ctx.fillStyle = rgba('#ff5ad9', 0.4);
        ctx.fillText(s, line.x + L.fs * 0.07, line.cy + dy);
      }
      ctx.fillStyle = c.text;
      if (soft) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = L.fs * 0.2 * deviceScale(ctx);
      }
      withGlow(ctx, c.accent, glow, () => ctx.fillText(s, line.x, line.cy + dy));
      ctx.restore();
    }
    if (n < line.chars.length && !cursorAt) {
      cursorAt = { x: line.x + line.adv.slice(0, n).reduce((a, v) => a + v, 0), cy: line.cy };
    }
  });
  if (!cursorAt) {
    const last = L.lines[L.lines.length - 1];
    cursorAt = last
      ? { x: last.x + last.w, cy: last.cy }
      : { x: L.content.x, cy: L.content.y + L.lineH / 2 };
  }
  if (st.cursor !== 'none' && st.cursorOn) {
    const fs = L.fs;
    const at = cursorAt as { x: number; cy: number };
    ctx.fillStyle = c.text;
    withGlow(ctx, c.accent, glow, () => {
      if (st.cursor === 'block') ctx.fillRect(at.x + fs * 0.06, at.cy - fs * 0.5, fs * 0.55, fs);
      else ctx.fillRect(at.x + fs * 0.06, at.cy + fs * 0.38, fs * 0.6, Math.max(2, fs * 0.1));
    });
  }
  ctx.restore();
}

function drawButton(ctx: Ctx2D, L: BubbleLayout, c: Palette): void {
  const b = L.buttonBox;
  if (!b || !L.button) return;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h * 0.22);
  fillIf(ctx, c.accent);
  ctx.font = L.buttonFont;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = readableTextColor(c.accent);
  ctx.fillText(L.button, b.x + b.w / 2, b.y + b.h / 2);
  ctx.restore();
}

/* ---------- 各造型的外框 ---------- */

/*
 * 尾巴與本體合成一個路徑填色（nonzero）：子路徑的方向要和本體一樣（畫面上順時針），
 * 否則重疊的地方會變成洞。圓角矩形、橢圓、圓都是順時針，所以尾巴也照順時針畫。
 */
function messengerTail(ctx: Ctx2D, L: BubbleLayout): void {
  const { w, h, fs } = L;
  if (L.align === 'center') {
    const cx = w / 2;
    ctx.moveTo(cx + fs * 0.45, h - 1);
    ctx.quadraticCurveTo(cx + fs * 0.1, h + fs * 0.1, cx, h + fs * 0.42);
    ctx.quadraticCurveTo(cx - fs * 0.1, h + fs * 0.1, cx - fs * 0.45, h - 1);
    ctx.closePath();
    return;
  }
  /* 從側邊往下勾出去、再沿著圓角下方回到底邊（聊天軟體常見的小尾巴） */
  const right = L.align === 'right';
  const m = (x: number) => (right ? w - x : x);
  const a: [number, number] = [m(0), h - fs * 0.9];
  const c1: [number, number] = [m(fs * 0.02), h - fs * 0.05];
  const tip: [number, number] = [m(-fs * 0.32), h + fs * 0.34];
  const c2: [number, number] = [m(fs * 0.45), h + fs * 0.36];
  const b: [number, number] = [m(fs * 1.25), h - 1];
  const d: [number, number] = [m(fs * 1.25), h - fs * 0.9];
  if (right) {
    ctx.moveTo(...a);
    ctx.quadraticCurveTo(...c1, ...tip);
    ctx.quadraticCurveTo(...c2, ...b);
    ctx.lineTo(...d);
  } else {
    ctx.moveTo(...d);
    ctx.lineTo(...b);
    ctx.quadraticCurveTo(...c2, ...tip);
    ctx.quadraticCurveTo(...c1, ...a);
  }
  ctx.closePath();
}

/** 三點的方向（畫面座標，>0＝順時針） */
const turn = (a: [number, number], b: [number, number], c: [number, number]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** 漫畫泡泡的尖角（從橢圓底部往所在側斜下伸出） */
function speechTail(ctx: Ctx2D, L: BubbleLayout): void {
  const { w, h, fs } = L;
  const dir = L.align === 'right' ? 1 : L.align === 'left' ? -1 : 0;
  const base = L.tailX;
  const tip: [number, number] = [base + dir * fs * 0.85, h + fs * 1.15];
  /* 底邊兩點取在橢圓上（往內縮一點，接縫藏在本體裡） */
  const yOn = (x: number) => {
    const u = (x - w / 2) / (w / 2);
    return h / 2 + (h / 2) * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const p0: [number, number] = [base - fs * 0.55, yOn(base - fs * 0.55) - fs * 0.35];
  const p1: [number, number] = [base + fs * 0.55, yOn(base + fs * 0.55) - fs * 0.35];
  const [a, b] = turn(p0, tip, p1) > 0 ? [p0, p1] : [p1, p0];
  ctx.moveTo(...a);
  ctx.lineTo(...tip);
  ctx.lineTo(...b);
  ctx.closePath();
}

/** 外框：先描粗邊、再填色，內部的接縫被填色蓋掉（尾巴與本體連成一個外框） */
function outlined(ctx: Ctx2D, path: () => void, fill: string, border: string, bw: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path();
  strokeIf(ctx, border, bw * 2);
  ctx.beginPath();
  path();
  fillIf(ctx, fill);
  ctx.restore();
}

type BackFn = (ctx: Ctx2D, L: BubbleLayout, c: Palette, env: DrawEnv) => void;

const BACK: Partial<Record<Bubble['style'], BackFn>> = {
  messenger: (ctx, L, c) => {
    ctx.beginPath();
    roundRectPath(ctx, 0, 0, L.w, L.h, Math.min(L.h / 2, L.fs * 0.95));
    messengerTail(ctx, L);
    fillIf(ctx, c.fill);
    strokeIf(ctx, c.border, Math.max(1, L.fs * 0.06));
  },
  speech: (ctx, L, c) => {
    const bw = Math.max(1.5, L.fs * 0.11);
    outlined(
      ctx,
      () => {
        ellipsePath(ctx, L.w / 2, L.h / 2, L.w / 2, L.h / 2);
        speechTail(ctx, L);
      },
      c.fill,
      c.border,
      bw,
    );
  },
  thought: (ctx, L, c) => {
    const bw = Math.max(1.5, L.fs * 0.1);
    const dir = L.align === 'right' ? 1 : L.align === 'left' ? -1 : 0;
    const fs = L.fs;
    const dots: [number, number, number][] = [
      [L.tailX + dir * fs * 0.25, L.h + fs * 0.35, fs * 0.34],
      [L.tailX + dir * fs * 0.7, L.h + fs * 1.0, fs * 0.22],
      [L.tailX + dir * fs * 1.0, L.h + fs * 1.5, fs * 0.13],
    ];
    outlined(
      ctx,
      () => {
        ellipsePath(ctx, L.w / 2, L.h / 2, L.w / 2 - fs * 0.1, L.h / 2 - fs * 0.1);
        for (const [cx, cy, r] of cloudCircles(L.w, L.h, fs)) circlePath(ctx, cx, cy, r);
      },
      c.fill,
      c.border,
      bw,
    );
    for (const [cx, cy, r] of dots)
      outlined(ctx, () => circlePath(ctx, cx, cy, r), c.fill, c.border, bw * 0.8);
  },
  shout: (ctx, L, c, env) => {
    const bw = Math.max(2, L.fs * 0.13);
    outlined(ctx, () => polyPath(ctx, burstPoints(L.w, L.h, L.fs, env.seed)), c.fill, c.border, bw);
  },
  'chat-card': (ctx, L, c, env) => {
    withShadow(ctx, env.shadow, L.fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, 1);
  },
  rpg: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(
        ctx,
        vGradient(ctx, h, [
          [0, mix(c.fill, '#ffffff', 0.06)],
          [1, mix(c.fill, '#000000', 0.25)],
        ]),
      );
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1.5, fs * 0.09));
    ctx.beginPath();
    roundRectPath(ctx, fs * 0.2, fs * 0.2, w - fs * 0.4, h - fs * 0.4, fs * 0.1);
    strokeIf(ctx, rgba(c.border, 0.45), 1);
    /* 名牌 */
    const t = L.tagBox;
    if (t) {
      ctx.beginPath();
      roundRectPath(ctx, t.x, t.y, t.w, t.h, t.h * 0.22);
      fillIf(ctx, mix(c.fill, '#000000', 0.35));
      strokeIf(ctx, c.accent, Math.max(1, fs * 0.06));
    }
  },
  battle: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, mix(c.fill, '#000000', 0.3));
      g.addColorStop(0.5, mix(c.fill, '#ffffff', 0.05));
      g.addColorStop(1, mix(c.fill, '#000000', 0.3));
      fillIf(ctx, g);
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, 1);
    ctx.beginPath();
    ctx.rect(fs * 0.18, fs * 0.18, w - fs * 0.36, h - fs * 0.36);
    strokeIf(ctx, rgba(c.accent, 0.3), 1);
    const d = fs * 0.26;
    for (const x of [fs * 0.85, w - fs * 0.85]) {
      ctx.beginPath();
      ctx.moveTo(x, h / 2 - d);
      ctx.lineTo(x + d * 0.75, h / 2);
      ctx.lineTo(x, h / 2 + d);
      ctx.lineTo(x - d * 0.75, h / 2);
      ctx.closePath();
      fillIf(ctx, c.accent);
    }
  },
  tag: (ctx, L, c, env) => {
    withShadow(ctx, env.shadow, L.fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(
        ctx,
        vGradient(ctx, L.h, [
          [0, mix(c.fill, '#ffffff', 0.08)],
          [1, mix(c.fill, '#000000', 0.2)],
        ]),
      );
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1.2, L.fs * 0.07));
  },
  sticky: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    const k = Math.min(fs * 0.95, w * 0.2, h * 0.3);
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, mix(c.fill, '#ffffff', 0.18));
      g.addColorStop(1, mix(c.fill, '#000000', 0.04));
      fillIf(ctx, g);
    });
    /* 折角 */
    ctx.beginPath();
    ctx.moveTo(w, h - k);
    ctx.lineTo(w - k, h);
    ctx.lineTo(w - k, h - k);
    ctx.closePath();
    fillIf(ctx, mix(c.fill, c.border, 0.75));
    /* 紙膠帶 */
    ctx.save();
    ctx.translate(w / 2, 0);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.beginPath();
    ctx.rect(-fs * 1.4, -fs * 0.32, fs * 2.8, fs * 0.66);
    fillIf(ctx, 'rgba(255, 255, 255, 0.55)');
    ctx.restore();
  },
  notebook: (ctx, L, c, env) => {
    const { w, h, fs, lineH } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    /* 橫線：對齊內文的行，往上下鋪滿 */
    const first = L.lines[0]?.cy ?? L.content.y + lineH / 2;
    const base = first + lineH / 2 - lineH * 0.08;
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (
      let y = base - Math.floor((base - fs * 0.9) / lineH) * lineH;
      y < h - fs * 0.35;
      y += lineH
    ) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fs * 1.75, 0);
    ctx.lineTo(fs * 1.75, h);
    strokeIf(ctx, c.accent, Math.max(1, fs * 0.06));
    for (let y = fs * 1.1; y < h - fs * 0.5; y += lineH * 2) {
      ctx.beginPath();
      circlePath(ctx, fs * 0.8, y, fs * 0.2);
      fillIf(ctx, rgba(c.border, 0.9));
    }
    ctx.restore();
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, rgba(c.border, 0.8), 1);
  },
  parchment: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.1,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.62,
      );
      g.addColorStop(0, mix(c.fill, '#ffffff', 0.25));
      g.addColorStop(0.7, c.fill);
      g.addColorStop(1, mix(c.fill, c.border, 0.45));
      fillIf(ctx, g);
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1.5, fs * 0.1));
  },
  neon: (ctx, L, c, env) => {
    const { fs } = L;
    traceBody(ctx, L, env.seed);
    fillIf(ctx, c.fill);
    withGlow(ctx, c.border, fs * 0.9, () => {
      traceBody(ctx, L, env.seed);
      strokeIf(ctx, c.border, Math.max(2, fs * 0.13));
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, mix(c.border, '#ffffff', 0.55), Math.max(1, fs * 0.045));
  },
  news: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    withShadow(ctx, env.shadow, fs, () => {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      fillIf(
        ctx,
        vGradient(ctx, h, [
          [0, mix(c.fill, '#ffffff', 0.1)],
          [1, mix(c.fill, '#000000', 0.2)],
        ]),
      );
    });
    if (L.labelW > 0) {
      ctx.beginPath();
      ctx.rect(0, 0, L.labelW, h);
      fillIf(
        ctx,
        vGradient(ctx, h, [
          [0, mix(c.accent, '#ffffff', 0.1)],
          [1, mix(c.accent, '#000000', 0.15)],
        ]),
      );
    }
    ctx.beginPath();
    ctx.rect(0, h - fs * 0.14, w, fs * 0.14);
    fillIf(ctx, c.border);
  },
  toast: (ctx, L, c, env) => {
    const { h, fs } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 0, fs * 0.2, h);
    ctx.restore();
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, 1);
    /* 關閉的 × */
    const x = L.w - fs * 0.75;
    const y = fs * 0.7;
    const k = fs * 0.2;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    strokeIf(ctx, rgba(c.text, 0.35), Math.max(1, fs * 0.06));
  },
  window: (ctx, L, c, env) => {
    const { w, fs, barH, ts } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.fillStyle = mix(c.fill, c.border, 0.22);
    ctx.fillRect(0, 0, w, barH);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, barH);
    ctx.lineTo(w, barH);
    strokeIf(ctx, rgba(c.border, 0.8), 1);
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1, fs * 0.07));
    /* －□× */
    const cy = barH / 2;
    const k = ts * 0.3;
    const col = rgba(c.text, 0.55);
    let x = w - ts * 1.1;
    ctx.beginPath();
    ctx.moveTo(x - k, cy - k);
    ctx.lineTo(x + k, cy + k);
    ctx.moveTo(x + k, cy - k);
    ctx.lineTo(x - k, cy + k);
    strokeIf(ctx, col, Math.max(1, ts * 0.09));
    x -= ts * 1.3;
    ctx.beginPath();
    ctx.rect(x - k * 0.85, cy - k * 0.85, k * 1.7, k * 1.7);
    strokeIf(ctx, col, Math.max(1, ts * 0.08));
    x -= ts * 1.3;
    ctx.beginPath();
    ctx.moveTo(x - k, cy + k * 0.6);
    ctx.lineTo(x + k, cy + k * 0.6);
    strokeIf(ctx, col, Math.max(1, ts * 0.09));
  },
  glass: (ctx, L, c, env) => {
    const { h, fs } = L;
    withShadow(
      ctx,
      env.shadow,
      fs,
      () => {
        traceBody(ctx, L, env.seed);
        fillIf(ctx, c.fill);
      },
      'rgba(0, 0, 0, 0.14)',
    );
    traceBody(ctx, L, env.seed);
    fillIf(
      ctx,
      vGradient(ctx, h, [
        [0, 'rgba(255, 255, 255, 0.22)'],
        [0.5, 'rgba(255, 255, 255, 0.04)'],
        [1, 'rgba(255, 255, 255, 0)'],
      ]),
    );
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1, fs * 0.05));
  },
  capsule: (ctx, L, c, env) => {
    withShadow(ctx, env.shadow, L.fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, Math.max(1.2, L.fs * 0.07));
  },
  card: (ctx, L, c, env) => {
    withShadow(ctx, env.shadow, L.fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 0, L.w, Math.max(2, L.fs * 0.14));
    ctx.restore();
    traceBody(ctx, L, env.seed);
    strokeIf(ctx, c.border, 1);
  },
  hud: (ctx, L, c) => {
    const { w, h, fs, barH, ts } = L;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    fillIf(ctx, c.fill);
    /* 細橫紋 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.fillStyle = rgba(c.accent, 0.06);
    for (let y = barH; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = rgba(c.border, 0.2);
    ctx.fillRect(0, 0, w, barH);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, barH);
    ctx.lineTo(w, barH);
    strokeIf(ctx, rgba(c.border, 0.7), 1);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    strokeIf(ctx, rgba(c.border, 0.85), 1);
    /* 標題列右邊三個點 */
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      circlePath(ctx, w - ts * (0.9 + i * 0.75), barH / 2, ts * 0.17);
      fillIf(ctx, rgba(c.accent, 1 - i * 0.3));
    }
    /* 四角的括號 */
    const o = fs * 0.25;
    const a = fs * 0.8;
    ctx.beginPath();
    const corner = (x: number, y: number, sx: number, sy: number) => {
      ctx.moveTo(x + sx * a, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * a);
    };
    corner(-o, -o, 1, 1);
    corner(w + o, -o, -1, 1);
    corner(-o, h + o, 1, -1);
    corner(w + o, h + o, -1, -1);
    withGlow(ctx, c.accent, fs * 0.3, () => strokeIf(ctx, c.accent, Math.max(1.5, fs * 0.08)));
  },
  terminal: (ctx, L, c, env) => {
    const { w, fs, barH, ts } = L;
    withShadow(ctx, env.shadow, fs, () => {
      traceBody(ctx, L, env.seed);
      fillIf(ctx, c.fill);
    });
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.fillStyle = c.border;
    ctx.fillRect(0, 0, w, barH);
    ctx.restore();
    const dots = ['#ff5f57', '#febc2e', '#28c840'];
    dots.forEach((col, i) => {
      ctx.beginPath();
      circlePath(ctx, fs * 0.75 + i * ts * 1.05, barH / 2, ts * 0.33);
      fillIf(ctx, col);
    });
  },
  hologram: (ctx, L, c, env) => {
    const { w, h, fs } = L;
    traceBody(ctx, L, env.seed);
    fillIf(
      ctx,
      vGradient(ctx, h, [
        [0, c.fill],
        [1, rgba(c.fill, 0.55)],
      ]),
    );
    ctx.save();
    traceBody(ctx, L, env.seed);
    ctx.clip();
    ctx.fillStyle = rgba(c.accent, 0.12);
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
    withGlow(ctx, c.border, fs * 0.5, () => {
      traceBody(ctx, L, env.seed);
      strokeIf(ctx, c.border, Math.max(1.2, fs * 0.07));
    });
  },
};

/** 造型在文字之後畫的東西 */
function drawFront(ctx: Ctx2D, L: BubbleLayout, c: Palette, env: DrawEnv): void {
  if (L.spec.id === 'rpg') {
    /* ▼ 呼吸似地明滅 */
    const fs = L.fs;
    const x = L.w - fs * 1.05;
    const y = L.h - fs * 0.72;
    const k = fs * 0.24;
    const a = env.u < 0 ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((env.u / 0.9) * Math.PI * 2));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k * 0.6);
    ctx.lineTo(x + k, y - k * 0.6);
    ctx.lineTo(x, y + k * 0.7);
    ctx.closePath();
    fillIf(ctx, c.accent);
    ctx.restore();
  }
}

function drawOverlays(ctx: Ctx2D, L: BubbleLayout, c: Palette, env: DrawEnv): void {
  if (env.shine === null && env.scan === null) return;
  const { w, h, fs } = L;
  ctx.save();
  traceBody(ctx, L, env.seed);
  ctx.clip();
  if (env.shine !== null) {
    const band = Math.max(fs * 1.6, w * 0.12);
    const x = -band * 2 + (w + band * 4) * env.shine;
    const g = ctx.createLinearGradient(x - band, 0, x + band, h * 0.45);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.42)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (env.scan !== null) {
    const band = Math.max(fs * 0.8, h * 0.12);
    const y = -band + (h + band * 2) * env.scan;
    const g = ctx.createLinearGradient(0, y - band, 0, y + band);
    g.addColorStop(0, rgba(c.accent, 0));
    g.addColorStop(0.5, rgba(c.accent, 0.32));
    g.addColorStop(1, rgba(c.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - band, w, band * 2);
  }
  ctx.restore();
}

/** 畫一個泡泡（原點在本體左上角） */
export function drawBubble(ctx: Ctx2D, L: BubbleLayout, b: Bubble, env: DrawEnv): void {
  const c = b.colors;
  ctx.save();
  const back = BACK[L.spec.id];
  if (back) back(ctx, L, c, env);
  drawTitle(ctx, L, c);
  if (L.icon) {
    const big = L.spec.icon === 'big';
    const fg = L.spec.icon === 'small' ? c.fill : readableTextColor(c.accent);
    drawIcon(ctx, b.icon, L.icon.cx, L.icon.cy, L.icon.size, c.accent, fg, big);
  }
  drawBodyText(ctx, L, c, env.text);
  drawButton(ctx, L, c);
  drawFront(ctx, L, c, env);
  drawOverlays(ctx, L, c, env);
  ctx.restore();
}
