/**
 * 畫一張前景框（可指定差分）。疊放順序（由下而上，規格 3.11）：
 * 窗的覆蓋色 → 窗內效果 → 窗的陰影 → 框的填色（含顆粒） → 疊在框下層的圖層 → 窗的邊線、畫面的邊線
 * → 角飾 → 沿框裝飾（依清單順序） → 差分標籤 → 最前面的圖層（依清單順序）。
 *
 * 畫布的變形是「畫布高＝1080 單位」：ctx 先 setTransform(k, 0, 0, k, 0, 0)，k＝輸出高 ÷ 1080；
 * shadowBlur 不受變形影響，所以模糊量要自己乘 k。
 */
import type { FontValue } from '@/core/fonts';
import { createRandom } from '@/core/timeline';
import { drawDecorations } from './deco';
import { drawEffect } from './effects';
import {
  type HitBox,
  openingRect,
  traceFrame,
  traceOuter,
  traceWindow,
  virtualWidth,
  type WindowRect,
} from './geometry';
import { drawIndicator } from './label';
import {
  BASE_H,
  type ColorRef,
  type EffectId,
  type FrameState,
  type IconId,
  type ImageLayer,
  type Palette,
  type TextLayer,
} from './model';
import { drawOrnaments } from './ornaments';

const TAU = Math.PI * 2;

/* ---------- 差分（目前的配色與窗的處理） ---------- */

export interface Slot extends Palette {
  /** 差分 id（沒開差分時 'base'） */
  id: string;
  name: string;
  sub: string;
  icon: IconId;
  iconAsset: string | null;
  tint: string;
  tintAlpha: number;
  effect: EffectId;
  effectAmount: number;
}

/** 生效的顏色與窗的處理：整體配色，開了差分時被該差分覆寫 */
export function resolveSlot(state: FrameState, id: string | null): Slot {
  const slot: Slot = {
    id: 'base',
    name: '',
    sub: '',
    icon: 'none',
    iconAsset: null,
    tint: '#000000',
    tintAlpha: 0,
    effect: 'none',
    effectAmount: 0,
    ...state.palette,
  };
  if (!state.variants.enabled) return slot;
  const items = state.variants.items;
  const item = items.find((i) => i.id === id) ?? items.find((i) => i.on) ?? items[0];
  if (!item) return slot;
  Object.assign(slot, {
    id: item.id,
    name: item.name,
    sub: item.sub,
    icon: item.icon,
    iconAsset: item.iconAsset,
    tint: item.tint,
    tintAlpha: item.tintAlpha,
    effect: item.effect,
    effectAmount: item.effectAmount,
  });
  if (item.useColors)
    Object.assign(slot, {
      frame1: item.frame1,
      frame2: item.frame2,
      accent: item.accent,
      text: item.text,
    });
  return slot;
}

/** 顏色參照 → 實際顏色（色碼照用；四色之一跟著目前的配色） */
export function resolveColor(ref: ColorRef, slot: Palette): string {
  if (typeof ref === 'string' && ref[0] === '#') return ref;
  return (slot as unknown as Record<string, string>)[ref] || '#000000';
}

function hexRgb(hex: string): [number, number, number] {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 依底色的相對亮度自動選近黑（#1b1b1f）或白 */
export function contrastText(hex: string): string {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1b1b1f' : '#ffffff';
}

/** 依原色改明暗（f 倍），#rrggbb 以外照原樣 */
export function shade(color: string, f: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = Number.parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/* ---------- 繪製環境 ---------- */

export interface RenderEnv {
  /** 圖片資產（解碼後）；還沒讀到時 undefined */
  image: (id: string) => CanvasImageSource | undefined;
  /** 字型 → CSS font-family 值 */
  fontFamily: (font: FontValue) => string;
  /** 換色後的圖片快取（鍵：資產 id|顏色） */
  recolorCache: Map<string, HTMLCanvasElement>;
}

export interface G {
  ctx: CanvasRenderingContext2D;
  state: FrameState;
  env: RenderEnv;
  slot: Slot;
  /** 輸出 px */
  W: number;
  H: number;
  /** 輸出高 ÷ 1080 */
  k: number;
  /** 畫布寬（單位） */
  VW: number;
  rect: WindowRect;
  hits: HitBox[];
  color: (ref: ColorRef) => string;
  /** 開了差分時，這個圖層／裝飾在目前差分是否顯示 */
  visible: (obj: { hideIn?: Record<string, boolean> }) => boolean;
  traceWindow: (c: CanvasPath) => void;
  traceFrame: (c: CanvasPath) => void;
}

const imgSize = (src: CanvasImageSource): { w: number; h: number } => {
  const s = src as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  return { w: s.naturalWidth || s.width || 0, h: s.naturalHeight || s.height || 0 };
};

/* ---------- 暫存畫布 ---------- */

const scratches: HTMLCanvasElement[] = [];

function scratch(i: number, w: number, h: number) {
  let canvas = scratches[i];
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratches[i] = canvas;
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  return { canvas, ctx };
}

/* ---------- 顆粒（每 256 單位重複的灰階雜點） ---------- */

export const GRAIN_TILE = 256;
let grainCanvas: HTMLCanvasElement | null = null;

/** 灰階雜點的值（決定性；平均約 128） */
export function grainValues(): Uint8ClampedArray {
  const n = GRAIN_TILE * GRAIN_TILE;
  const out = new Uint8ClampedArray(n);
  const rand = createRandom(20260913);
  for (let i = 0; i < n; i++) out[i] = Math.round(128 + (rand.next() - 0.5) * 230);
  return out;
}

function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const v = grainValues();
  for (let i = 0; i < v.length; i++) {
    img.data[i * 4] = v[i];
    img.data[i * 4 + 1] = v[i];
    img.data[i * 4 + 2] = v[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

/* ---------- 窗的覆蓋色、陰影、框的填色 ---------- */

function drawTint(g: G): void {
  const { ctx, slot } = g;
  if (!(slot.tintAlpha > 0)) return;
  ctx.save();
  ctx.beginPath();
  g.traceWindow(ctx);
  ctx.fillStyle = rgba(slot.tint, slot.tintAlpha);
  ctx.fill();
  ctx.restore();
}

/** 內陰影：窗外一大塊框的形狀把模糊投進窗內（只留窗內） */
function drawShadow(g: G): void {
  const { ctx, state, slot } = g;
  const sh = state.frame.shadow;
  if (!sh.on || sh.opacity <= 0 || sh.size <= 0) return;
  ctx.save();
  ctx.beginPath();
  g.traceWindow(ctx);
  ctx.clip();
  ctx.beginPath();
  traceFrame(ctx, state, Math.max(g.VW, BASE_H));
  ctx.shadowColor = rgba(resolveColor(sh.color, slot), sh.opacity);
  ctx.shadowBlur = sh.size * g.k;
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  ctx.restore();
}

/**
 * 線性漸層的端點（與 CSS 的 linear-gradient 相同：以角度方向投影整張畫布，兩端剛好碰到畫布的角）。
 * 0° 由下往上、90° 由左往右、180° 由上往下。
 */
export function linearGradientLine(
  angle: number,
  VW: number,
  H = BASE_H,
): [number, number, number, number] {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(VW * dx) + Math.abs(H * dy)) / 2;
  return [VW / 2 - dx * half, H / 2 - dy * half, VW / 2 + dx * half, H / 2 + dy * half];
}

/** 放射漸層：中心到半對角線 35% 都是框色 1，之後過渡到四角的框色 2 */
export const RADIAL_INNER = 0.35;

function frameFillStyle(g: G): string | CanvasGradient {
  const { ctx, state, slot, VW } = g;
  const f = state.frame;
  if (f.fill === 'solid') return slot.frame1;
  if (f.fill === 'radial') {
    const cx = VW / 2;
    const cy = BASE_H / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(VW, BASE_H) / 2);
    grad.addColorStop(RADIAL_INNER, slot.frame1);
    grad.addColorStop(1, slot.frame2);
    return grad;
  }
  const [x0, y0, x1, y1] = linearGradientLine(f.angle, VW);
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, slot.frame1);
  grad.addColorStop(1, slot.frame2);
  return grad;
}

/** 顆粒以「覆蓋」疊上的不透明度：顆粒感 × 框的不透明度 × 0.6 */
export const GRAIN_GAIN = 0.6;

function drawFill(g: G): void {
  const { ctx, state } = g;
  const f = state.frame;
  if (f.fill === 'none') return;
  ctx.save();
  ctx.beginPath();
  g.traceFrame(ctx);
  ctx.clip('evenodd');
  ctx.globalAlpha = f.opacity;
  ctx.fillStyle = frameFillStyle(g);
  ctx.fillRect(0, 0, g.VW, BASE_H);
  if (f.grain > 0) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = f.opacity * f.grain * GRAIN_GAIN;
    const pattern = ctx.createPattern(grain(), 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, g.VW, BASE_H);
    }
  }
  ctx.restore();
}

/* ---------- 線條（只留在框上） ---------- */

/** 沿路徑外側 inner～outer 單位的帶狀線；轉角是尖角；只保留落在框上的部分 */
function drawBand(
  g: G,
  trace: (c: CanvasPath) => void,
  inner: number,
  outer: number,
  color: string,
) {
  if (outer <= inner) return;
  const { canvas, ctx: c } = scratch(0, g.W, g.H);
  c.setTransform(g.k, 0, 0, g.k, 0, 0);
  c.lineJoin = 'miter';
  c.miterLimit = 10;
  c.beginPath();
  trace(c);
  c.strokeStyle = color;
  c.lineWidth = outer * 2;
  c.stroke();
  if (inner > 0) {
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = inner * 2;
    c.stroke();
  }
  c.globalCompositeOperation = 'destination-in';
  c.beginPath();
  traceFrame(c, g.state);
  c.fill('evenodd');
  c.globalCompositeOperation = 'source-over';
  g.ctx.save();
  g.ctx.setTransform(1, 0, 0, 1, 0, 0);
  g.ctx.drawImage(canvas, 0, 0);
  g.ctx.restore();
}

/** 雙線的間隔：max(3, 1.5 × 粗細) */
export const doubleGap = (width: number): number => Math.max(3, width * 1.5);

function drawLines(g: G): void {
  const { state, slot } = g;
  const inner = state.frame.innerLine;
  const outer = state.frame.outerLine;
  if (inner.on && inner.width > 0) {
    const color = resolveColor(inner.color, slot);
    drawBand(g, g.traceWindow, inner.gap, inner.gap + inner.width, color);
    if (inner.double) {
      const start = inner.gap + inner.width + doubleGap(inner.width);
      drawBand(g, g.traceWindow, start, start + inner.width, color);
    }
  }
  if (outer.on && outer.width > 0) {
    drawBand(
      g,
      (c) => traceOuter(c, state),
      outer.gap,
      outer.gap + outer.width,
      resolveColor(outer.color, slot),
    );
  }
}

/* ---------- 文字 ---------- */

/** 直書時轉 90° 的字（長音、破折號、波浪號、刪節號與括號） */
export const ROTATE_IN_VERTICAL = 'ー―‐－-~～〜…‥「」『』（）()【】〈〉《》[]<>＜＞';

export const fontCssOf = (px: number, bold: boolean, family: string): string =>
  `${bold ? 700 : 400} ${px}px ${family}`;

/** 加了字距的寬（字距加在每個字之間） */
export function spacedWidth(measure: (s: string) => number, text: string, spacing: number): number {
  if (!spacing) return measure(text);
  let w = 0;
  for (const ch of text) w += measure(ch) + spacing;
  return Math.max(0, w - spacing);
}

export function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right',
  mode: 'fill' | 'stroke',
): void {
  const m = (s: string) => ctx.measureText(s).width;
  const w = spacedWidth(m, text, spacing);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  const draw = (s: string, px: number) =>
    mode === 'fill' ? ctx.fillText(s, px, y) : ctx.strokeText(s, px, y);
  if (!spacing) {
    draw(text, cx);
    return;
  }
  for (const ch of text) {
    draw(ch, cx);
    cx += m(ch) + spacing;
  }
}

/** 文字中的差分佔位符：{差分}（另接受 {時間帯}）→ 名稱、{英文}（另接受 {英語}）→ 英文標示；沒開差分時是空字串 */
export function layerText(text: string, slot: Pick<Slot, 'name' | 'sub'>): string {
  return String(text || '')
    .replace(/\{(差分|時間帯)\}/g, () => slot.name)
    .replace(/\{(英文|英語)\}/g, () => slot.sub);
}

export interface TextBlock {
  lines: string[];
  w: number;
  h: number;
  lineH: number;
  colW: number;
  charH: number;
  spacing: number;
}

/**
 * 文字圖層的排版（規格 3.10）：橫書行高 1.3 × 字級、字距＝字距值 × 字級、整塊寬＝最寬的一行；
 * 直書每行一欄、由右往左，欄寬 1.35 × 字級、字與字間距＝字級 ×（1＋字距值）。
 */
export function layoutText(
  text: string,
  layer: Pick<TextLayer, 'size' | 'spacing' | 'vertical'>,
  measure: (s: string) => number,
): TextBlock {
  const lines = text.split('\n');
  const px = layer.size;
  const spacing = layer.spacing * px;
  const lineH = px * 1.3;
  const colW = px * 1.35;
  const charH = px * (1 + layer.spacing);
  let w: number;
  let h: number;
  if (layer.vertical) {
    w = lines.length * colW;
    h = Math.max(...lines.map((l) => [...l].length)) * charH;
  } else {
    w = Math.max(...lines.map((l) => spacedWidth(measure, l, spacing)));
    h = lines.length * lineH;
  }
  return { lines, w, h, lineH, colW, charH, spacing };
}

/** 文字圖層的命中範圍至少 24 × 24 單位 */
export const MIN_TEXT_HIT = 24;

function drawTextLayer(g: G, layer: TextLayer): HitBox | null {
  const ctx = g.ctx;
  const text = layerText(layer.text, g.slot);
  const px = layer.size;
  ctx.font = fontCssOf(px, layer.bold, g.env.fontFamily(layer.font));
  ctx.textBaseline = 'middle';
  const b = layoutText(text, layer, (s) => ctx.measureText(s).width);
  const cx = layer.x * g.VW;
  const cy = layer.y * BASE_H;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  if (layer.flip) ctx.scale(-1, 1);
  ctx.lineJoin = 'round';
  ctx.lineWidth = layer.strokeWidth * 2;
  ctx.strokeStyle = resolveColor(layer.strokeColor, g.slot);
  ctx.fillStyle = resolveColor(layer.color, g.slot);
  const modes: ('stroke' | 'fill')[] = layer.strokeWidth > 0 ? ['stroke', 'fill'] : ['fill'];
  modes.forEach((mode, pass) => {
    /* 陰影只由第一層（有外框時是外框）投出 */
    if (pass === 0 && layer.shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = layer.shadow * g.k;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    b.lines.forEach((l, i) => {
      if (!layer.vertical) {
        const x = layer.align === 'left' ? -b.w / 2 : layer.align === 'right' ? b.w / 2 : 0;
        spacedText(ctx, l, x, -b.h / 2 + b.lineH * (i + 0.5), b.spacing, layer.align, mode);
        return;
      }
      ctx.textAlign = 'center';
      const x = b.w / 2 - b.colW * (i + 0.5);
      [...l].forEach((ch, j) => {
        const y = -b.h / 2 + b.charH * (j + 0.5);
        const draw = (dx: number, dy: number) =>
          mode === 'fill' ? ctx.fillText(ch, dx, dy) : ctx.strokeText(ch, dx, dy);
        if (ROTATE_IN_VERTICAL.includes(ch)) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 2);
          draw(0, 0);
          ctx.restore();
        } else {
          draw(x, y);
        }
      });
    });
  });
  return {
    id: layer.id,
    cx,
    cy,
    w: Math.max(b.w, MIN_TEXT_HIT),
    h: Math.max(b.h, MIN_TEXT_HIT),
    rotation: layer.rotation,
  };
}

/* ---------- 圖片 ---------- */

function recolored(env: RenderEnv, img: CanvasImageSource, id: string, color: string) {
  const key = `${id}|${color}`;
  let canvas = env.recolorCache.get(key);
  if (!canvas) {
    const { w, h } = imgSize(img);
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const c = canvas.getContext('2d') as CanvasRenderingContext2D;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, canvas.width, canvas.height);
    env.recolorCache.set(key, canvas);
  }
  return canvas;
}

function drawImageLayer(g: G, layer: ImageLayer): HitBox | null {
  const img = g.env.image(layer.asset);
  if (!img) return null;
  const { w: iw, h: ih } = imgSize(img);
  if (!iw || !ih) return null;
  const ctx = g.ctx;
  const src =
    layer.recolor && layer.recolor !== 'none'
      ? recolored(g.env, img, layer.asset, resolveColor(layer.recolor, g.slot))
      : img;
  if (layer.fit === 'stretch') {
    ctx.drawImage(src, 0, 0, g.VW, BASE_H);
    return null;
  }
  if (layer.fit === 'cover') {
    const sc = Math.max(g.VW / iw, BASE_H / ih);
    ctx.drawImage(src, (g.VW - iw * sc) / 2, (BASE_H - ih * sc) / 2, iw * sc, ih * sc);
    return null;
  }
  if (layer.fit === 'tile') {
    const pattern = ctx.createPattern(src, 'repeat');
    if (!pattern) return null;
    pattern.setTransform(
      new DOMMatrix()
        .translate(layer.x * g.VW, layer.y * BASE_H)
        .rotate(layer.rotation)
        .scale(layer.scale),
    );
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, g.VW, BASE_H);
    return null;
  }
  const w = iw * layer.scale;
  const h = ih * layer.scale;
  const cx = layer.x * g.VW;
  const cy = layer.y * BASE_H;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  if (layer.flip) ctx.scale(-1, 1);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return { id: layer.id, cx, cy, w, h, rotation: layer.rotation };
}

function drawLayers(g: G, order: 'front' | 'back'): void {
  for (const layer of g.state.layers) {
    if (layer.order !== order || !layer.visible || !g.visible(layer)) continue;
    const ctx = g.ctx;
    ctx.save();
    if (layer.clip === 'frame' || layer.clip === 'window') {
      ctx.beginPath();
      if (layer.clip === 'frame') {
        g.traceFrame(ctx);
        ctx.clip('evenodd');
      } else {
        g.traceWindow(ctx);
        ctx.clip();
      }
    }
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend || 'source-over';
    const hit = layer.kind === 'image' ? drawImageLayer(g, layer) : drawTextLayer(g, layer);
    ctx.restore();
    if (hit) g.hits.push(hit);
  }
}

/* ---------- 入口 ---------- */

/** 畫整張（輸出的內容）；回傳可點選的範圍（單位，依疊放順序：框下層的圖層、標籤、最前面的圖層） */
export function render(
  ctx: CanvasRenderingContext2D,
  state: FrameState,
  env: RenderEnv,
  slotId: string | null,
  width: number,
  height: number,
): HitBox[] {
  const slot = resolveSlot(state, slotId);
  const g: G = {
    ctx,
    state,
    env,
    slot,
    W: width,
    H: height,
    k: height / BASE_H,
    VW: virtualWidth(state.size),
    rect: openingRect(state),
    hits: [],
    color: (ref) => resolveColor(ref, slot),
    visible: (obj) => !(state.variants.enabled && obj.hideIn?.[slot.id]),
    traceWindow: (c) => traceWindow(c, state),
    traceFrame: (c) => traceFrame(c, state),
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(g.k, 0, 0, g.k, 0, 0);
  if (state.variants.enabled) {
    drawTint(g);
    drawEffect(g);
  }
  drawShadow(g);
  drawFill(g);
  drawLayers(g, 'back');
  drawLines(g);
  drawOrnaments(g);
  drawDecorations(g);
  if (state.variants.enabled) drawIndicator(g);
  drawLayers(g, 'front');
  ctx.restore();
  return g.hits;
}

/* ---------- 預覽專用 ---------- */

/** CCFOLIA 格線（依格數等分畫布；深色細線上疊白色虛線） */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cells: { width: number; height: number },
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  for (let i = 1; i < cells.width; i++) {
    const x = Math.round((width * i) / cells.width) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let j = 1; j < cells.height; j++) {
    const y = Math.round((height * j) / cells.height) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.stroke();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();
  ctx.restore();
}

/** 選取框：白、藍兩色的虛線（隨旋轉），只在預覽 */
export function drawSelection(ctx: CanvasRenderingContext2D, hit: HitBox, k: number): void {
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(hit.cx, hit.cy);
  ctx.rotate((hit.rotation * Math.PI) / 180);
  ctx.lineWidth = 2 / k;
  ctx.setLineDash([6 / k, 5 / k]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(-hit.w / 2, -hit.h / 2, hit.w, hit.h);
  ctx.lineDashOffset = 5.5 / k;
  ctx.strokeStyle = '#6b70ff';
  ctx.strokeRect(-hit.w / 2, -hit.h / 2, hit.w, hit.h);
  ctx.restore();
}

export { TAU };
