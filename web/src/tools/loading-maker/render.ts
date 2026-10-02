/**
 * 繪製（預覽與匯出共用，3.8）：背景 → 角色 → 讀取動畫 → 上方文字 → 下方文字（跟隨進度條時角色改在讀取動畫之上），
 * 再套用開場淡入（淡入期間畫第 0 秒）與結尾動作（core/motion 的結尾消失演出，連背景一起消失）。
 */
import { fontCss } from '@/core/fonts';
import { roundRectPath } from '@/core/image';
import { drawVanish, type VanishKind } from '@/core/motion';
import { traceShape } from '@/core/shapes';
import type { Ctx2D } from '@/core/timeline';
import { BUILTIN_ASPECT, drawBuiltinCharacter } from './characters';
import { flowPhase, flowStops, gradientLine, staticStops, vanishColors } from './fill';
import {
  type Bounds,
  barBounds,
  barSegments,
  barSlots,
  canvasScale,
  characterBounds,
  characterMotion,
  isFollowing,
  loopElements,
  loopScale,
  percentLabel,
  percentPosition,
  ringArc,
  rowLayout,
  segmentFill,
  shimmerBand,
  spacedWidth,
  squeezeOf,
  textLines,
} from './geometry';
import { rowFrameState } from './row';
import type { LmSettings, LoopStyle, RowShape, TextBlock } from './settings';
import { barProgress, completionPhase, contentTime, fadeInPhase } from './timing';

const TAU = Math.PI * 2;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** 畫得出來的圖（有寬高） */
export type SizedSource = CanvasImageSource & { width: number; height: number };

/** 上傳的角色（解碼後） */
export interface CharacterMedia {
  frames: SizedSource[];
  /** 每格毫秒（動畫檔照檔案；連續圖不使用） */
  delays: number[];
  /** 動畫檔（照檔案時間播放）；false＝連續圖或靜態圖 */
  animated: boolean;
  /** 最寬、最高的那一格（決定角色的寬高比） */
  width: number;
  height: number;
}

export interface SceneMedia {
  character: CharacterMedia | null;
  rowStart: readonly SizedSource[];
  rowTarget: readonly SizedSource[];
}

export const EMPTY_MEDIA: SceneMedia = { character: null, rowStart: [], rowTarget: [] };

/** 角色的寬高比：上傳的圖依圖、內建約 1.08 */
export const characterAspect = (media: SceneMedia): number =>
  media.character && media.character.height > 0
    ? media.character.width / media.character.height
    : BUILTIN_ASPECT;

/**
 * t 秒時角色的影格（F32～F34、3.4）：動畫檔照檔案的時間 × 播放速度循環；
 * 連續圖（或不照檔案時間時）每格 1 ÷（FPS × 播放速度）秒。
 */
export function characterFrameIndex(media: CharacterMedia, s: LmSettings, t: number): number {
  const n = media.frames.length;
  if (n <= 1) return 0;
  const speed = Math.min(8, Math.max(0.05, s.character.speed));
  const total = media.delays.reduce((a, b) => a + b, 0);
  if (media.animated && s.character.fileTiming && total > 0 && media.delays.length === n) {
    let ms = mod(t * 1000 * speed, total);
    for (let i = 0; i < n; i++) {
      if (ms < media.delays[i]) return i;
      ms -= media.delays[i];
    }
    return n - 1;
  }
  return Math.floor(t * s.character.fps * speed + 1e-9) % n;
}

/* ---------- 路徑 ---------- */

/**
 * 愛心：凹口朝上、尖端朝下，左右各一段三次貝茲曲線（與原作相同的控制點）。
 * size 是基準大小：尖端在中心下方 0.425 × size、凹口在中心上方 0.175 × size。
 */
export function heartPath(ctx: Ctx2D, cx: number, cy: number, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.85);
  ctx.bezierCurveTo(cx - s * 1.35, cy + s * 0.05, cx - s * 0.95, cy - s * 1.05, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.95, cy - s * 1.05, cx + s * 1.35, cy + s * 0.05, cx, cy + s * 0.85);
  ctx.closePath();
}

export function rowShapePath(ctx: Ctx2D, shape: RowShape, size: number) {
  const r = size / 2;
  switch (shape) {
    case 'star':
      traceShape(ctx, 'star', 0, 0, r, { innerRatio: 0.43 });
      return;
    case 'heart':
      ctx.beginPath();
      heartPath(ctx, 0, 0, size * 0.98);
      return;
    case 'square':
      traceShape(ctx, 'roundRect', 0, 0, r, { width: size, height: size, radius: size * 0.12 });
      return;
    case 'diamond':
      traceShape(ctx, 'diamond', 0, 0, r);
      return;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.9, r * 0.78);
      ctx.lineTo(-r * 0.9, r * 0.78);
      ctx.closePath();
      return;
    case 'hexagon':
      traceShape(ctx, 'hexagon', 0, 0, r);
      return;
    default:
      traceShape(ctx, 'circle', 0, 0, r);
  }
}

/* ---------- 暫存畫布 ---------- */

type Buffer = OffscreenCanvas | HTMLCanvasElement;

/** 暫存畫布（淡入、結尾動作的來源畫面） */
export class Scratch {
  private pool = new Map<string, Buffer>();
  get(name: string, w: number, h: number): { canvas: Buffer; ctx: Ctx2D } {
    let c = this.pool.get(name);
    if (!c) {
      c =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(w, h)
          : Object.assign(document.createElement('canvas'), { width: w, height: h });
      this.pool.set(name, c);
    }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d') as Ctx2D | null;
    if (!ctx) throw new Error('無法建立畫布');
    return { canvas: c, ctx };
  }
}

function resetCtx(ctx: Ctx2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/* ---------- 進度條 ---------- */

function barFillStyle(ctx: Ctx2D, s: LmSettings, t: number, b: Bounds): string | CanvasGradient {
  if (s.bar.fill !== 'gradient') return s.loader.fillColor;
  const line = gradientLine(b, s.bar.angle);
  const g = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
  const entries = s.bar.flow
    ? flowStops(
        s.bar.stops,
        flowPhase(s, t),
        Math.min(0.24, Math.max(0, (s.bar.colorBlur * canvasScale(s)) / line.length)),
      )
    : staticStops(s.bar.stops);
  for (const e of entries) g.addColorStop(Math.min(1, Math.max(0, e.offset)), e.color);
  return g;
}

function setGlow(ctx: Ctx2D, s: LmSettings, k: number) {
  if (!s.loader.glow) return;
  ctx.shadowColor = s.loader.glowColor;
  ctx.shadowBlur = s.loader.glowBlur * k;
}

function drawBarTrack(ctx: Ctx2D, s: LmSettings, b: Bounds, border: number) {
  ctx.fillStyle = s.loader.trackColor;
  ctx.strokeStyle = s.loader.borderColor;
  ctx.lineWidth = border;
  const fillStroke = () => {
    ctx.fill();
    if (border > 0) ctx.stroke();
  };
  const style = s.bar.style;
  if (style === 'hearts' || style === 'bubbles') {
    const slots = barSlots(s, b);
    for (const x of slots.centers) {
      ctx.beginPath();
      if (style === 'hearts') heartPath(ctx, x, b.cy, slots.heartSize);
      else ctx.arc(x, b.cy, slots.bubbleRadius, 0, TAU);
      fillStroke();
    }
    return;
  }
  if (style === 'segmented' || style === 'pixel') {
    const seg = barSegments(s, b);
    for (const x of seg.xs) {
      ctx.beginPath();
      roundRectPath(ctx, x, b.top, seg.width, b.height, seg.radius);
      fillStroke();
    }
    return;
  }
  ctx.beginPath();
  roundRectPath(ctx, b.left, b.top, b.width, b.height, b.height / 2);
  fillStroke();
}

function drawBarFill(
  ctx: Ctx2D,
  s: LmSettings,
  b: Bounds,
  progress: number,
  fill: string | CanvasGradient,
  border: number,
  blurred: boolean,
) {
  const amount = Math.min(1, Math.max(0, progress));
  if (amount <= 0) return;
  ctx.fillStyle = fill;
  ctx.strokeStyle = s.loader.borderColor;
  ctx.lineWidth = border;
  const style = s.bar.style;
  const count = s.bar.segments;
  if (style === 'hearts' || style === 'bubbles') {
    const slots = barSlots(s, b);
    slots.centers.forEach((x, i) => {
      const local = segmentFill(amount, count, i);
      if (local <= 0) return;
      const reveal = local * local * (3 - 2 * local);
      ctx.save();
      ctx.globalAlpha *= reveal;
      ctx.beginPath();
      if (style === 'hearts') heartPath(ctx, x, b.cy, slots.heartSize * (0.3 + reveal * 0.7));
      else ctx.arc(x, b.cy, slots.bubbleRadius * (0.25 + reveal * 0.75), 0, TAU);
      ctx.fill();
      if (!blurred && border > 0) ctx.stroke();
      ctx.restore();
    });
    return;
  }
  if (style === 'segmented' || style === 'pixel') {
    const seg = barSegments(s, b);
    seg.xs.forEach((x, i) => {
      const local = segmentFill(amount, count, i);
      if (local <= 0) return;
      ctx.beginPath();
      roundRectPath(ctx, x, b.top, seg.width * local, b.height, seg.radius);
      ctx.fill();
    });
    return;
  }
  const radius = b.height / 2;
  if (blurred) {
    ctx.beginPath();
    const w = Math.max(0.5, b.width * amount);
    roundRectPath(ctx, b.left, b.top, w, b.height, Math.min(radius, w / 2));
    ctx.fill();
    return;
  }
  /* 填滿在邊框內側 */
  ctx.save();
  ctx.beginPath();
  roundRectPath(
    ctx,
    b.left + border / 2,
    b.top + border / 2,
    Math.max(0, b.width - border),
    Math.max(0, b.height - border),
    radius,
  );
  ctx.clip();
  ctx.fillRect(b.left, b.top, b.width * amount, b.height);
  if (s.bar.shimmer) {
    const band = shimmerBand(b, amount);
    const g = ctx.createLinearGradient(band.x, 0, band.x + band.width, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = g;
    ctx.fillRect(band.x, b.top, band.width, b.height);
  }
  ctx.restore();
}

function drawPercent(ctx: Ctx2D, s: LmSettings, progress: number) {
  const p = percentPosition(s);
  ctx.save();
  ctx.font = `700 ${p.size}px Arial, "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#5a4058';
  ctx.strokeStyle = s.canvas.transparent ? 'rgba(255,255,255,0.85)' : s.canvas.background;
  ctx.lineWidth = Math.max(2, p.size * 0.18);
  const label = percentLabel(progress);
  ctx.strokeText(label, p.x, p.y);
  ctx.fillText(label, p.x, p.y);
  ctx.restore();
}

/** 進度條（F53～F83）：空條（含光暈與邊框）→ 顏色暈染 → 填滿（含光暈、流光）→ 進度數字 */
export function drawBar(ctx: Ctx2D, s: LmSettings, ct: number) {
  const k = canvasScale(s);
  const b = barBounds(s);
  const border = s.loader.borderWidth * k;
  const progress = barProgress(s, ct);
  const fill = barFillStyle(ctx, s, ct, b);
  ctx.save();
  setGlow(ctx, s, k);
  drawBarTrack(ctx, s, b, border);
  ctx.restore();
  if (s.bar.fill === 'gradient' && s.bar.colorBlur > 0 && progress > 0) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.filter = `blur(${s.bar.colorBlur * k}px)`;
    drawBarFill(ctx, s, b, progress, fill, border, true);
    ctx.restore();
  }
  ctx.save();
  setGlow(ctx, s, k);
  drawBarFill(ctx, s, b, progress, fill, border, false);
  ctx.restore();
  if (s.bar.percent) drawPercent(ctx, s, progress);
}

/* ---------- 循環動畫 ---------- */

function loopShape(ctx: Ctx2D, style: LoopStyle, size: number) {
  switch (style) {
    case 'stars':
      traceShape(ctx, 'star', 0, 0, size * 0.62, { innerRatio: 0.27 / 0.62 });
      ctx.fill();
      return;
    case 'petals':
      traceShape(ctx, 'petal', 0, -size * 0.2, size * 0.68, { aspect: 0.38 / 0.68 });
      ctx.fill();
      return;
    case 'squares':
      ctx.fillRect(-size * 0.48, -size * 0.48, size * 0.96, size * 0.96);
      return;
    case 'hearts':
      ctx.beginPath();
      heartPath(ctx, 0, 0, size * 1.05);
      ctx.fill();
      return;
    case 'bubbles':
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(-size * 0.15, -size * 0.18, size * 0.13, 0, TAU);
      ctx.fill();
      return;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, TAU);
      ctx.fill();
  }
}

/** 循環動畫（F101～F117） */
export function drawLoop(ctx: Ctx2D, s: LmSettings, t: number) {
  const k = loopScale(s);
  const size = s.loop.size * k;
  ctx.save();
  setGlow(ctx, s, k);
  if (s.loop.style === 'ring') {
    const cx = (s.canvas.width * s.loader.x) / 100;
    const cy = (s.canvas.height * s.loader.y) / 100;
    const r = s.loop.radius * k;
    const arc = ringArc(s, t);
    ctx.lineWidth = arc.lineWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = s.loader.trackColor;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.loader.fillColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, arc.start, arc.end);
    ctx.stroke();
    ctx.restore();
    return;
  }
  for (const e of loopElements(s, t)) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle + Math.PI / 2);
    ctx.globalAlpha = e.alpha;
    ctx.fillStyle = e.accent ? s.loader.fillColor : s.loader.trackColor;
    ctx.strokeStyle = s.loader.fillColor;
    ctx.lineWidth = Math.max(1, size * 0.12);
    loopShape(ctx, s.loop.style, size * e.scale);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- 換圖列 ---------- */

function drawRowImage(
  ctx: Ctx2D,
  img: SizedSource,
  size: number,
  fit: 'contain' | 'cover',
  shape: RowShape,
) {
  const w = img.width || 1;
  const h = img.height || 1;
  const k = fit === 'cover' ? Math.max(size / w, size / h) : Math.min(size / w, size / h);
  const dw = Math.max(0.5, w * k);
  const dh = Math.max(0.5, h * k);
  if (fit === 'cover') {
    rowShapePath(ctx, shape, size);
    ctx.clip();
  }
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
}

/** 換圖列（F118～F134、3.6） */
export function drawRow(ctx: Ctx2D, s: LmSettings, t: number, media: SceneMedia) {
  const k = canvasScale(s);
  const layout = rowLayout(s);
  const border = Math.max(0, s.loader.borderWidth * k);
  const state = rowFrameState(s, t, {
    start: media.rowStart.length,
    target: media.rowTarget.length,
  });
  for (const slot of state.slots) {
    const shape = s.row.shapes[slot.slot] ?? 'circle';
    const mix = Math.min(1, Math.max(0, slot.mix));
    const target = slot.targetIndex >= 0 ? media.rowTarget[slot.targetIndex] : undefined;
    const start =
      s.row.start === 'images' && slot.startIndex >= 0
        ? media.rowStart[slot.startIndex]
        : undefined;
    ctx.save();
    ctx.translate(layout.centers[slot.slot], layout.cy);
    setGlow(ctx, s, k);
    /* 起始：縮小約 8% 並淡出 */
    ctx.save();
    ctx.globalAlpha = 1 - mix;
    if (start) {
      const sc = 1 - mix * 0.08;
      ctx.scale(sc, sc);
      drawRowImage(ctx, start, layout.itemSize, s.row.startFit, shape);
    } else {
      ctx.fillStyle = s.loader.trackColor;
      ctx.strokeStyle = s.loader.borderColor;
      ctx.lineWidth = border;
      rowShapePath(ctx, shape, layout.itemSize);
      ctx.fill();
      if (border > 0) ctx.stroke();
    }
    ctx.restore();
    /* 目標：圖片從 82% 長大並淡入；沒有圖時填滿色的同形圖案從 84% 長大 */
    if (target) {
      ctx.save();
      ctx.globalAlpha = mix;
      const sc = 0.82 + mix * 0.18;
      ctx.scale(sc, sc);
      drawRowImage(ctx, target, layout.itemSize, s.row.targetFit, shape);
      ctx.restore();
    } else if (mix > 0) {
      ctx.save();
      ctx.globalAlpha = mix;
      ctx.fillStyle = s.loader.fillColor;
      rowShapePath(ctx, shape, layout.itemSize * (0.84 + mix * 0.16));
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ---------- 角色 ---------- */

/** 角色（F13～F42）：位置、大小、旋轉、不透明度、陰影、附加動作、跟隨進度條 */
export function drawCharacter(ctx: Ctx2D, s: LmSettings, ct: number, media: SceneMedia) {
  const ch = s.character;
  const k = canvasScale(s);
  const b = characterBounds(s, ct, characterAspect(media));
  const m = characterMotion(s, ct);
  ctx.save();
  ctx.translate(b.cx + m.x, b.cy + m.y);
  ctx.rotate(((ch.rotation + m.rotation) * Math.PI) / 180);
  const flip = isFollowing(s) && ch.followFlip ? -1 : 1;
  ctx.scale(m.scaleX * flip, m.scaleY);
  ctx.globalAlpha = ch.opacity;
  if (ch.shadow) {
    ctx.shadowColor = ch.shadowColor;
    ctx.shadowBlur = ch.shadowBlur * k;
    ctx.shadowOffsetY = ch.shadowY * k;
  }
  const c = media.character;
  if (c?.frames.length) {
    const img = c.frames[characterFrameIndex(c, s, ct)];
    const h = b.height;
    const w = img.height ? h * (img.width / img.height) : b.width;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    const sc = b.height / 100;
    ctx.scale(sc, sc);
    drawBuiltinCharacter(ctx, ch.builtin, ct);
  }
  ctx.restore();
}

/* ---------- 文字 ---------- */

/** 文字區塊的 canvas 字型 */
export const textFont = (block: TextBlock, sizePx: number): string =>
  fontCss({ family: block.font.family, weight: block.font.weight }, sizePx);

function drawSpaced(
  ctx: Ctx2D,
  line: string,
  y: number,
  spacing: number,
  stroke: boolean,
  maxWidth: number,
) {
  const chars = Array.from(line);
  if (!chars.length) return;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const raw = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  const squeeze = raw > maxWidth ? maxWidth / raw : 1;
  if (Math.abs(spacing) < 0.01 && squeeze === 1) {
    if (stroke) ctx.strokeText(line, 0, y);
    else ctx.fillText(line, 0, y);
    return;
  }
  ctx.save();
  ctx.textAlign = 'left';
  ctx.translate(-(raw * squeeze) / 2, y);
  ctx.scale(squeeze, 1);
  let x = 0;
  chars.forEach((c, i) => {
    if (stroke) ctx.strokeText(c, x, 0);
    else ctx.fillText(c, x, 0);
    x += widths[i] + spacing;
  });
  ctx.restore();
}

/** 文字區塊（F136～F143、3.7）：多行垂直置中、行距 1.22 倍字級、先畫外框再畫字、太寬的行水平壓縮 */
export function drawText(ctx: Ctx2D, s: LmSettings, block: TextBlock) {
  const lines = textLines(block);
  if (!lines.length) return;
  const k = canvasScale(s);
  const size = block.size * k;
  const lineHeight = size * 1.22;
  const total = (lines.length - 1) * lineHeight;
  const maxWidth = s.canvas.width * 0.92;
  ctx.save();
  ctx.translate((s.canvas.width * block.x) / 100, (s.canvas.height * block.y) / 100);
  ctx.rotate((block.rotation * Math.PI) / 180);
  ctx.font = textFont(block, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = block.color;
  ctx.strokeStyle = block.strokeColor;
  ctx.lineWidth = block.strokeWidth * k;
  lines.forEach((line, i) => {
    const y = -total / 2 + i * lineHeight;
    if (ctx.lineWidth > 0) drawSpaced(ctx, line, y, block.spacing * k, true, maxWidth);
    drawSpaced(ctx, line, y, block.spacing * k, false, maxWidth);
  });
  ctx.restore();
}

/** 量測函式（給 geometry 的文字範圍用） */
export function textMeasurer(ctx: Ctx2D) {
  return {
    measure: (text: string, sizePx: number, block: TextBlock) => {
      ctx.font = textFont(block, sizePx);
      return ctx.measureText(text).width;
    },
    measureLabel: (label: string, sizePx: number) => {
      ctx.font = `700 ${sizePx}px Arial, "Noto Sans TC", sans-serif`;
      return ctx.measureText(label).width;
    },
  };
}

/** 一行加上字距、壓縮後的寬（測試用） */
export const lineWidth = (
  ctx: Ctx2D,
  s: LmSettings,
  block: TextBlock,
  line: string,
): { width: number; squeeze: number } => {
  const k = canvasScale(s);
  const m = textMeasurer(ctx);
  const w = spacedWidth(line, block.size * k, block.spacing * k, block, m.measure);
  return { width: w, squeeze: squeezeOf(w, s.canvas.width) };
};

/* ---------- 整個畫面 ---------- */

/** 背景＋角色＋讀取動畫＋文字（內容時間 ct） */
export function drawBaseScene(ctx: Ctx2D, s: LmSettings, ct: number, media: SceneMedia) {
  const W = s.canvas.width;
  const H = s.canvas.height;
  ctx.save();
  resetCtx(ctx);
  ctx.clearRect(0, 0, W, H);
  if (!s.canvas.transparent) {
    ctx.fillStyle = s.canvas.background;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const loader = () => {
    if (s.loader.type === 'bar') drawBar(ctx, s, ct);
    else if (s.loader.type === 'loop') drawLoop(ctx, s, ct);
    else if (s.loader.type === 'row') drawRow(ctx, s, ct, media);
  };
  if (isFollowing(s)) {
    loader();
    drawCharacter(ctx, s, ct, media);
  } else {
    drawCharacter(ctx, s, ct, media);
    loader();
  }
  drawText(ctx, s, s.text.top);
  drawText(ctx, s, s.text.bottom);
  ctx.restore();
}

/**
 * t 秒（含淡入）時的完整畫面：淡入期間畫第 0 秒的畫面 × S 形不透明度；結尾動作期間把整個畫面交給
 * core/motion 的結尾消失演出（p ≥ 1 全空，連不透明的背景也消失）。
 */
export function renderScene(
  ctx: Ctx2D,
  s: LmSettings,
  media: SceneMedia,
  t: number,
  scratch: Scratch,
) {
  const W = s.canvas.width;
  const H = s.canvas.height;
  const fade = fadeInPhase(s, t);
  if (fade.active) {
    const src = scratch.get('fade', W, H);
    drawBaseScene(src.ctx, s, 0, media);
    ctx.save();
    resetCtx(ctx);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = fade.alpha;
    if (fade.alpha > 0) ctx.drawImage(src.canvas, 0, 0);
    ctx.restore();
    return;
  }
  const ct = contentTime(s, t);
  const done = completionPhase(s, t);
  if (!done.active) {
    drawBaseScene(ctx, s, ct, media);
    return;
  }
  const src = scratch.get('vanish', W, H);
  drawBaseScene(src.ctx, s, ct, media);
  ctx.save();
  resetCtx(ctx);
  ctx.clearRect(0, 0, W, H);
  if (done.p <= 0.0001) ctx.drawImage(src.canvas, 0, 0);
  else if (done.p < 0.9999)
    drawVanish(ctx, src.canvas, W, H, s.bar.vanish as VanishKind, done.p, {
      intensity: s.bar.intensity,
      seed: s.loader.seed,
      colors: vanishColors(s),
    });
  ctx.restore();
}
