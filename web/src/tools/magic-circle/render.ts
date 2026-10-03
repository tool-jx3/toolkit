/**
 * 畫面構成（規格 3.1）：每個元素依對稱尺畫 n 個複本，套用動態狀態、填色、發光、線條、文字。
 * 編輯畫面與匯出共用這一段程式（所見即所得）。另有點選測試（3.4）與文字量測。
 *
 * pixelScale：每個畫布單位在輸出上是幾個像素（匯出倍率；編輯畫面＝縮放 × 螢幕像素密度）。
 * 陰影與發光的模糊、位移乘上它，所有倍率看起來一樣（規格 5. D10）。
 */
import {
  clamp,
  copyAngle,
  copyCountFor,
  flattenElement,
  inverseTransformPointForCopy,
  type Point,
  partialPolyline,
  pointSegmentDistance,
  polylineLengths,
  rotatePointAround,
} from './geometry';
import { type Measure, textBounds, textLayout } from './layout';
import type { McElement, McProject, McStyle, McSymmetry, TextElement } from './model';
import { animationState, type CopyState } from './motion';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/* ---------- 顏色 ---------- */

/** #rrggbb（去掉透明度） */
export function rgbOf(color: string): string {
  const t = String(color || '').trim();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) return t.slice(0, 7);
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return '#ffffff';
}

/** 色碼的透明度（#rrggbbaa 才有，否則 1） */
export function alphaOf(color: string): number {
  const t = String(color || '');
  return /^#[0-9a-f]{8}$/i.test(t) ? Number.parseInt(t.slice(7, 9), 16) / 255 : 1;
}

/* ---------- 快取（元素是不可變的物件，以物件本身為鍵） ---------- */

const pathCache = new WeakMap<McElement, Path2D>();
const flatCache = new WeakMap<
  McElement,
  Map<string, { points: Point[]; metrics: { lengths: number[]; total: number } }>
>();

export function buildPath2D(el: McElement): Path2D {
  const path = new Path2D();
  if (el.type === 'path') {
    const pts = el.points;
    if (!pts.length) return path;
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      path.bezierCurveTo(a.outX, a.outY, b.inX, b.inY, b.x, b.y);
    }
    if (el.closed && pts.length > 1) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      path.bezierCurveTo(last.outX, last.outY, first.inX, first.inY, first.x, first.y);
      path.closePath();
    }
  } else if (el.type === 'circle') {
    path.ellipse(el.x, el.y, Math.abs(el.rx), Math.abs(el.ry), el.rotation || 0, 0, Math.PI * 2);
    path.closePath();
  }
  return path;
}

export function cachedPath(el: McElement): Path2D {
  let p = pathCache.get(el);
  if (!p) {
    p = buildPath2D(el);
    pathCache.set(el, p);
  }
  return p;
}

/** 折線（含長度表；reverse 時是倒過來的折線） */
export function cachedFlat(el: McElement, quality: number, reverse = false) {
  let m = flatCache.get(el);
  if (!m) {
    m = new Map();
    flatCache.set(el, m);
  }
  const key = `${quality}:${reverse ? 1 : 0}`;
  let f = m.get(key);
  if (!f) {
    const pts = flattenElement(el, quality).points;
    const points = reverse ? pts.slice().reverse() : pts;
    f = { points, metrics: polylineLengths(points) };
    m.set(key, f);
  }
  return f;
}

/* ---------- 文字量測（瀏覽器） ---------- */

let measureContext: CanvasRenderingContext2D | null = null;
/** 量測、點選測試用的畫布（單位矩陣） */
export function scratchContext(): CanvasRenderingContext2D {
  if (!measureContext) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('無法建立畫布');
    measureContext = ctx;
  }
  return measureContext;
}

export const canvasMeasure: Measure = (font, align, line) => {
  const ctx = scratchContext();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  return ctx.measureText(line);
};

/* ---------- 畫一個複本（規格 3.1） ---------- */

function applyCopyTransform(ctx: Ctx2D, sym: McSymmetry, index: number, count: number): void {
  if (count === 1 && index === 0) return;
  ctx.translate(sym.centerX, sym.centerY);
  ctx.rotate(copyAngle(sym, index, count));
  if (sym.mirror && index % 2 === 1) ctx.scale(-1, 1);
  ctx.translate(-sym.centerX, -sym.centerY);
}

function applyStroke(
  ctx: Ctx2D,
  s: McStyle,
  alpha: number,
  glowMul: number,
  forGlow: boolean,
  px: number,
): void {
  ctx.globalCompositeOperation = s.blendMode || 'source-over';
  ctx.lineWidth = Math.max(0.01, Number(s.strokeWidth) || 0);
  ctx.lineCap = s.lineCap || 'round';
  ctx.lineJoin = s.lineJoin || 'round';
  ctx.setLineDash(Array.isArray(s.dash) ? s.dash : []);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  if (forGlow) {
    const c = rgbOf(s.glowColor || s.stroke);
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = Math.max(0, Number(s.glowBlur) || 0) * glowMul * px;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.strokeStyle = rgbOf(s.stroke);
    ctx.shadowColor = rgbOf(s.shadowColor || '#000000');
    ctx.shadowBlur = Math.max(0, Number(s.shadowBlur) || 0) * px;
    ctx.shadowOffsetX = (Number(s.shadowOffsetX) || 0) * px;
    ctx.shadowOffsetY = (Number(s.shadowOffsetY) || 0) * px;
  }
}

/** 截斷的折線（繪製進度 < 1）：發光兩次（第二次 0.22）＋本體 */
function strokePartial(ctx: Ctx2D, s: McStyle, base: number, glowMul: number, px: number): void {
  if ((Number(s.strokeWidth) || 0) <= 0) return;
  if (s.glowEnabled && Number(s.glowStrength) > 0 && Number(s.glowBlur) > 0) {
    ctx.save();
    applyStroke(ctx, s, base * 0.4 * Number(s.glowStrength), glowMul, true, px);
    ctx.lineWidth = Math.max(0.01, Number(s.strokeWidth)) * 1.35;
    ctx.stroke();
    ctx.shadowBlur *= 0.48;
    ctx.globalAlpha = clamp(base * 0.22 * Number(s.glowStrength), 0, 1);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  applyStroke(ctx, s, base * alphaOf(s.stroke), glowMul, false, px);
  ctx.stroke();
  ctx.restore();
}

function renderText(ctx: Ctx2D, el: TextElement, state: CopyState, px: number): void {
  const s = el.style;
  const base = clamp((s.opacity ?? 1) * state.alpha, 0, 1);
  const { font, lines, lineHeight } = textLayout(el);
  const each = (fn: (line: string, y: number) => void) => {
    for (let i = 0; i < lines.length; i++) fn(lines[i], i * lineHeight);
  };
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(el.rotation || 0);
  ctx.textAlign = el.textAlign || 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font;
  if (s.glowEnabled && s.glowStrength > 0) {
    ctx.save();
    ctx.globalCompositeOperation = s.blendMode || 'source-over';
    ctx.globalAlpha = clamp(base * 0.5 * s.glowStrength, 0, 1);
    const c = rgbOf(s.glowColor || s.fill);
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = Math.max(0, s.glowBlur * state.glow * px);
    each((line, y) => ctx.fillText(line, 0, y));
    ctx.restore();
  }
  /* 描邊沿用填字時的混合模式與陰影（沒有填色時是一般混合、沒有陰影；與舊版相同） */
  if (s.fillEnabled) {
    ctx.globalCompositeOperation = s.blendMode || 'source-over';
    ctx.globalAlpha = clamp(base * alphaOf(s.fill), 0, 1);
    ctx.fillStyle = rgbOf(s.fill);
    ctx.shadowColor = rgbOf(s.shadowColor || '#000000');
    ctx.shadowBlur = Math.max(0, (s.shadowBlur || 0) * px);
    ctx.shadowOffsetX = (s.shadowOffsetX || 0) * px;
    ctx.shadowOffsetY = (s.shadowOffsetY || 0) * px;
    each((line, y) => ctx.fillText(line, 0, y));
  }
  if (s.strokeWidth > 0) {
    ctx.globalAlpha = clamp(base * alphaOf(s.stroke), 0, 1);
    ctx.strokeStyle = rgbOf(s.stroke);
    ctx.lineWidth = s.strokeWidth;
    ctx.lineJoin = s.lineJoin;
    each((line, y) => ctx.strokeText(line, 0, y));
  }
  ctx.restore();
}

function renderCopy(
  ctx: Ctx2D,
  project: McProject,
  el: McElement,
  time: number,
  index: number,
  count: number,
  px: number,
): void {
  const state = animationState(el, time, index, count);
  if (!state.visible || state.alpha <= 0.001) return;
  const s = el.style;
  const base = clamp((s.opacity ?? 1) * state.alpha, 0, 1);
  const sym = project.symmetry;
  ctx.save();
  applyCopyTransform(ctx, sym, index, count);
  const cx = sym.centerX;
  const cy = sym.centerY;
  if (state.scale !== 1 || state.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation || 0);
    ctx.scale(state.scale || 0.001, state.scale || 0.001);
    ctx.translate(-cx, -cy);
  }
  if (state.clip < 0.999) {
    const maxR = Math.hypot(project.document.width, project.document.height) * 0.72;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, maxR * state.clip), 0, Math.PI * 2);
    ctx.clip();
  }
  if (el.type === 'text') {
    renderText(ctx, el, state, px);
    ctx.restore();
    return;
  }
  if (state.draw < 0.999) {
    const reverse = el.animation.direction === 'reverse';
    const flat = cachedFlat(el, 1, reverse);
    const part = partialPolyline(flat.points, state.draw, false, flat.metrics);
    if (part.length) {
      ctx.beginPath();
      ctx.moveTo(part[0].x, part[0].y);
      for (let i = 1; i < part.length; i++) ctx.lineTo(part[i].x, part[i].y);
    }
    strokePartial(ctx, s, base, state.glow, px);
  } else {
    const path = cachedPath(el);
    if (s.fillEnabled) {
      ctx.save();
      ctx.globalCompositeOperation = s.blendMode || 'source-over';
      ctx.globalAlpha = clamp(base * alphaOf(s.fill), 0, 1);
      ctx.fillStyle = rgbOf(s.fill);
      if (s.glowEnabled) {
        ctx.shadowColor = rgbOf(s.glowColor || s.fill);
        ctx.shadowBlur = Math.max(0, (s.glowBlur || 0) * state.glow * 0.7 * px);
      }
      ctx.fill(path);
      ctx.restore();
    }
    if (s.strokeWidth > 0) {
      if (s.glowEnabled && s.glowStrength > 0) {
        ctx.save();
        applyStroke(ctx, s, base * 0.4 * s.glowStrength, state.glow, true, px);
        ctx.lineWidth = s.strokeWidth * 1.35;
        ctx.stroke(path);
        ctx.shadowBlur *= 0.48;
        ctx.globalAlpha = clamp(base * 0.2 * s.glowStrength, 0, 1);
        ctx.stroke(path);
        ctx.restore();
      }
      ctx.save();
      applyStroke(ctx, s, base * alphaOf(s.stroke), state.glow, false, px);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** 依清單由下而上畫每個顯示中的元素（每個元素 n 個複本） */
export function renderElements(ctx: Ctx2D, project: McProject, time: number, px = 1): void {
  for (const el of project.elements) {
    if (!el.visible) continue;
    const n = copyCountFor(project.symmetry, el);
    for (let k = 0; k < n; k++) renderCopy(ctx, project, el, time, k, n, px);
  }
}

/** 一格輸出畫面（畫布座標；呼叫端先設好縮放）：裁到畫布、塗背景、畫元素 */
export function renderScene(
  ctx: Ctx2D,
  project: McProject,
  time: number,
  { transparent = project.document.transparent, pixelScale = 1 } = {},
): void {
  const { width, height } = project.document;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.clearRect(0, 0, width, height);
  if (!transparent) {
    ctx.fillStyle = rgbOf(project.document.background);
    ctx.fillRect(0, 0, width, height);
  }
  renderElements(ctx, project, time, pixelScale);
  ctx.restore();
}

/* ---------- 點選測試（規格 3.4） ---------- */

export type ControlKind =
  | 'node'
  | 'node-in'
  | 'node-out'
  | 'circle-center'
  | 'circle-rx'
  | 'circle-ry'
  | 'text-origin';

export interface ControlHit {
  kind: ControlKind;
  index?: number;
}

/** 基準元素的控制點（感應 10 螢幕 px） */
export function hitControl(el: McElement | null, p: Point, zoom: number): ControlHit | null {
  if (!el || el.locked || !el.visible) return null;
  const th = 10 / zoom;
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  if (el.type === 'path') {
    for (let i = 0; i < el.points.length; i++) {
      const q = el.points[i];
      const hin = { x: q.inX, y: q.inY };
      const hout = { x: q.outX, y: q.outY };
      if (d(p, hin) <= th && d(q, hin) > 0.01) return { kind: 'node-in', index: i };
      if (d(p, hout) <= th && d(q, hout) > 0.01) return { kind: 'node-out', index: i };
      if (d(p, q) <= th) return { kind: 'node', index: i };
    }
  } else if (el.type === 'circle') {
    if (d(p, { x: el.x, y: el.y }) <= th) return { kind: 'circle-center' };
    if (d(p, { x: el.x + el.rx, y: el.y }) <= th) return { kind: 'circle-rx' };
    if (d(p, { x: el.x, y: el.y + el.ry }) <= th) return { kind: 'circle-ry' };
  } else if (d(p, { x: el.x, y: el.y }) <= th) {
    return { kind: 'text-origin' };
  }
  return null;
}

/** 由上往下找第一個點到的元素（隱藏、鎖定的略過；每個複本都算） */
export function hitElement(
  project: McProject,
  p: Point,
  zoom: number,
  measure: Measure,
): { el: McElement; copy: number } | null {
  const tol = 7 / zoom;
  const ctx = typeof document !== 'undefined' ? scratchContext() : null;
  for (let i = project.elements.length - 1; i >= 0; i--) {
    const el = project.elements[i];
    if (!el.visible || el.locked) continue;
    const n = copyCountFor(project.symmetry, el);
    for (let k = 0; k < n; k++) {
      const local = inverseTransformPointForCopy(project.symmetry, p, k, n);
      if (el.type === 'text') {
        const q = rotatePointAround(local, el, -(Number(el.rotation) || 0));
        const b = textBounds(el, measure);
        if (
          q.x >= b.minX - tol &&
          q.x <= b.maxX + tol &&
          q.y >= b.minY - tol &&
          q.y <= b.maxY + tol
        )
          return { el, copy: k };
        continue;
      }
      const lineTol = tol + Math.max(0, el.style.strokeWidth || 0) / 2;
      if (el.style.fillEnabled && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (ctx.isPointInPath(cachedPath(el), local.x, local.y)) return { el, copy: k };
      }
      const flat = cachedFlat(el, 0.8).points;
      for (let j = 1; j < flat.length; j++) {
        if (pointSegmentDistance(local, flat[j - 1], flat[j]) <= lineTol) return { el, copy: k };
      }
    }
  }
  return null;
}
