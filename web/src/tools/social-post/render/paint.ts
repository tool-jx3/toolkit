/**
 * 照著畫面的描述（ops.ts）畫在 canvas 上（預覽、PNG、HTML 的圖都用這裡）。座標乘上倍率；文字的基線依字型的上下高度
 * 置中在行框裡（同 CSS 的半行距）；照片依位置蓋滿（夾回蓋滿的範圍）。
 */
import { fontFamilyCss } from '@/core/fonts';
import { clampPlacement, DEFAULT_PLACEMENT, drawPlaced, makeCanvas } from '@/core/image';
import { type ImageRef, ZOOM_MAX } from '../model';
import type { FontSpec, Measure } from '../text';
import { ICONS, type IconName } from './icons';
import type { Op, Paint, Radius, Rect, ScreenLayout, Shadow } from './ops';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 圖的來源（讀不到時 null） */
export type ImageSource = (img: ImageRef) => CanvasImageSource | null;

export const fontString = (f: FontSpec): string =>
  `${f.italic ? 'italic ' : ''}${f.weight} ${f.size}px ${fontFamilyCss(f.family)}`;

let measureCtx: Ctx | null = null;
const mctx = (): Ctx => {
  measureCtx ??= makeCanvas(1, 1).getContext('2d') as Ctx;
  return measureCtx;
};

/**
 * 瀏覽器的量字（canvas 的 measureText）。每次字型載好之後要換一個新的（逐字的寬度快取跟著這個函式，
 * 換了函式就重新量）。
 */
export function createCanvasMeasure(): Measure {
  return (text, font) => {
    const c = mctx();
    c.font = fontString(font);
    return c.measureText(text).width;
  };
}

/** 字型的上下高度（行框裡的基線位置用；快取到字型載好時清掉） */
const metrics = new Map<string, { asc: number; desc: number }>();
export const clearFontMetrics = (): void => metrics.clear();

function fontMetrics(font: FontSpec): { asc: number; desc: number } {
  const key = fontString(font);
  let m = metrics.get(key);
  if (!m) {
    const c = mctx();
    c.font = key;
    const t = c.measureText('國Hg');
    const asc = t.fontBoundingBoxAscent;
    const desc = t.fontBoundingBoxDescent;
    m =
      Number.isFinite(asc) && Number.isFinite(desc) && asc + desc > 0
        ? { asc, desc }
        : { asc: font.size * 0.88, desc: font.size * 0.24 };
    metrics.set(key, m);
  }
  return m;
}

/* ---------- 小工具 ---------- */

function pathRadius(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: Radius | undefined,
): void {
  ctx.beginPath();
  if (!r) {
    ctx.rect(x, y, w, h);
    return;
  }
  const rr = typeof r === 'number' ? [r, r, r, r] : [...r];
  const max = Math.min(w, h) / 2;
  ctx.roundRect(
    x,
    y,
    w,
    h,
    rr.map((v) => Math.max(0, Math.min(max, v))),
  );
}

function paintStyle(ctx: Ctx, p: Paint): string | CanvasGradient {
  if (typeof p === 'string') return p;
  const g = ctx.createLinearGradient(p.linear.x0, p.linear.y0, p.linear.x1, p.linear.y1);
  for (const [o, c] of p.linear.stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

/** 目前的縮放（陰影不跟著變換，要自己乘） */
const currentScale = (ctx: Ctx): number => {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
};

function setShadow(ctx: Ctx, s: Shadow | undefined): void {
  if (!s) return;
  const k = currentScale(ctx);
  ctx.shadowColor = s.color;
  ctx.shadowBlur = s.blur * k;
  /* 位移也不跟著旋轉：直接以畫面的方向乘倍率（貼紙轉了也照原作往下） */
  ctx.shadowOffsetX = (s.x ?? 0) * k;
  ctx.shadowOffsetY = (s.y ?? 0) * k;
}

const pathCache = new Map<string, Path2D>();
const path2d = (d: string): Path2D => {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
};

function drawIcon(
  ctx: Ctx,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: string,
  fill?: string,
  sw = 2,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  for (const part of ICONS[name]) {
    const p = path2d(part.d);
    if (part.mode === 'fill') {
      ctx.fillStyle = fill ?? color;
      ctx.fill(p, part.evenodd ? 'evenodd' : 'nonzero');
    } else {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(p);
      }
      ctx.stroke(p);
    }
  }
  ctx.restore();
}

function sourceSize(src: CanvasImageSource): { width: number; height: number } {
  const s = src as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  return { width: s.naturalWidth || s.width || 1, height: s.naturalHeight || s.height || 1 };
}

function drawDefaultAvatar(ctx: Ctx, cx: number, cy: number, r: number, bg: string): void {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.2, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.92, r * 0.72, r * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- 畫 ---------- */

function drawOps(ctx: Ctx, ops: readonly Op[], source: ImageSource): void {
  for (const op of ops) {
    switch (op.t) {
      case 'rect': {
        ctx.save();
        if (op.fill) {
          setShadow(ctx, op.shadow);
          ctx.fillStyle = paintStyle(ctx, op.fill);
          pathRadius(ctx, op.x, op.y, op.w, op.h, op.r);
          ctx.fill();
        }
        if (op.stroke) {
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = op.stroke.color;
          ctx.lineWidth = op.stroke.width;
          if (op.stroke.dash) ctx.setLineDash(op.stroke.dash);
          pathRadius(ctx, op.x, op.y, op.w, op.h, op.r);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'circle': {
        ctx.save();
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = paintStyle(ctx, op.fill);
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke.color;
          ctx.lineWidth = op.stroke.width;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'line': {
        ctx.save();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.beginPath();
        ctx.moveTo(op.x0, op.y0);
        ctx.lineTo(op.x1, op.y1);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'text': {
        if (!op.text) break;
        ctx.save();
        ctx.font = fontString(op.font);
        ctx.textAlign = op.align ?? 'left';
        ctx.textBaseline = 'alphabetic';
        const m = fontMetrics(op.font);
        const base = op.y + (op.lh - (m.asc + m.desc)) / 2 + m.asc;
        ctx.fillStyle = paintStyle(ctx, op.color);
        if (op.glow) {
          for (const b of op.glow.blurs) {
            setShadow(ctx, { color: op.glow.color, blur: b });
            ctx.fillText(op.text, op.x, base);
          }
          ctx.shadowColor = 'transparent';
        }
        setShadow(ctx, op.shadow);
        ctx.fillText(op.text, op.x, base);
        ctx.restore();
        break;
      }
      case 'icon': {
        ctx.save();
        setShadow(ctx, op.shadow);
        drawIcon(ctx, op.name, op.x, op.y, op.size, op.color, op.fill, op.sw);
        ctx.restore();
        break;
      }
      case 'image': {
        const src = op.img ? source(op.img) : null;
        ctx.save();
        if (op.circle) {
          ctx.beginPath();
          ctx.arc(op.x + op.w / 2, op.y + op.h / 2, Math.min(op.w, op.h) / 2, 0, Math.PI * 2);
          ctx.clip();
        } else if (op.r) {
          pathRadius(ctx, op.x, op.y, op.w, op.h, op.r);
          ctx.clip();
        } else if (op.fit !== 'contain') {
          ctx.beginPath();
          ctx.rect(op.x, op.y, op.w, op.h);
          ctx.clip();
        }
        if (!src) {
          if (op.fallback) {
            ctx.fillStyle = op.fallback;
            ctx.fillRect(op.x, op.y, op.w, op.h);
          }
          ctx.restore();
          break;
        }
        const size = sourceSize(src);
        if (op.fit === 'contain') {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(src, op.x, op.y, op.w, op.h);
        } else {
          const box: Rect = { x: op.x, y: op.y, width: op.w, height: op.h };
          const place = clampPlacement(size, box, op.place ?? DEFAULT_PLACEMENT, ZOOM_MAX);
          drawPlaced(ctx, src, size, box, place);
        }
        ctx.restore();
        break;
      }
      case 'avatar': {
        const src = op.img ? source(op.img) : null;
        if (!src) {
          drawDefaultAvatar(ctx, op.cx, op.cy, op.r, op.bg);
          break;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = op.bg;
        ctx.fillRect(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
        const size = sourceSize(src);
        drawPlaced(
          ctx,
          src,
          size,
          { x: op.cx - op.r, y: op.cy - op.r, width: op.r * 2, height: op.r * 2 },
          DEFAULT_PLACEMENT,
        );
        ctx.restore();
        break;
      }
      case 'group': {
        ctx.save();
        if (op.opacity !== undefined) ctx.globalAlpha *= op.opacity;
        if (op.clip) {
          const c = op.clip;
          if (c.circle) {
            ctx.beginPath();
            ctx.arc(
              c.x + c.width / 2,
              c.y + c.height / 2,
              Math.min(c.width, c.height) / 2,
              0,
              Math.PI * 2,
            );
          } else pathRadius(ctx, c.x, c.y, c.width, c.height, c.r);
          ctx.clip();
        }
        if (op.tx !== undefined || op.ty !== undefined) ctx.translate(op.tx ?? 0, op.ty ?? 0);
        if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
        if (op.scale !== undefined && op.scale !== 1) ctx.scale(op.scale, op.scale);
        drawOps(ctx, op.ops, source);
        ctx.restore();
        break;
      }
    }
  }
}

/**
 * 畫一個畫面：先清掉、塗底色，再整個乘上 scale 畫指令。canvas 的大小由呼叫端定（寬 × scale、高 × scale）。
 * offsetY：只畫畫面的一段（HTML 切圖：從 offsetY 開始的那一段，畫在 canvas 的 0）。
 */
export function paintScreen(
  ctx: Ctx,
  layout: Pick<ScreenLayout, 'ops' | 'background' | 'width' | 'height'>,
  scale: number,
  source: ImageSource,
  { offsetY = 0, background = true }: { offsetY?: number; background?: boolean } = {},
): void {
  const c = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  if (background) {
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, -offsetY * scale);
  drawOps(ctx, layout.ops, source);
  ctx.restore();
}
