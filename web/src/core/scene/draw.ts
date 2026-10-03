/**
 * 版型畫布的繪圖：把場景節點依序畫到 canvas（預覽與匯出共用）。
 * 另外提供：點選區（collectHitRegions）、要載入的字型（collectFonts）、圖片的蓋滿／放入、模糊、淡出等小工具。
 */
import { applyFilterOps, makeCanvas, roundRectPath } from '../image';
import { baselineIn, fontMetrics, fontString, layoutRichNode, layoutText, textWidth } from './text';
import type {
  HitRegion,
  ImageFit,
  ImageNode,
  Paint,
  Radius,
  Rect,
  RectNode,
  RichNode,
  SceneNode,
  Shadow,
  TextNode,
} from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/* ---------- 小工具 ---------- */

/** 填色 → canvas 的 fillStyle */
export function paintStyle(ctx: Ctx, p: Paint): string | CanvasGradient {
  if (typeof p === 'string') return p;
  const { x0, y0, x1, y1, stops } = p.linear;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
  return g;
}

/** 形狀的路徑（矩形、圓角、圓形） */
export function shapePath(
  ctx: CanvasPath,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: { radius?: Radius; circle?: boolean },
): void {
  if (shape.circle) {
    const r = Math.min(w, h) / 2;
    ctx.moveTo(x + w / 2 + r, y + h / 2);
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.closePath();
  } else if (shape.radius) roundRectPath(ctx, x, y, w, h, shape.radius);
  else ctx.rect(x, y, w, h);
}

function setShadow(ctx: Ctx, s: Shadow | undefined): void {
  if (!s) return;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = s.blur;
  ctx.shadowOffsetX = s.x ?? 0;
  ctx.shadowOffsetY = s.y ?? 0;
}

/** 來源圖的大小 */
export function sourceSize(img: CanvasImageSource): { width: number; height: number } {
  const anyImg = img as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: unknown;
    height?: unknown;
  };
  if (anyImg.naturalWidth) return { width: anyImg.naturalWidth, height: anyImg.naturalHeight ?? 0 };
  const w = anyImg.width;
  const h = anyImg.height;
  if (typeof w === 'number' && typeof h === 'number') return { width: w, height: h };
  /* SVGImageElement 等：寬高是 SVGAnimatedLength */
  const sw = (w as { baseVal?: { value: number } } | undefined)?.baseVal?.value ?? 0;
  const sh = (h as { baseVal?: { value: number } } | undefined)?.baseVal?.value ?? 0;
  return { width: sw, height: sh };
}

/**
 * 圖片放進框：cover（蓋滿、置中裁掉多的）、contain（整張放入、置中）、fill（拉伸）。
 * 回傳來源的範圍（sx, sy, sw, sh）與畫到的範圍（dx, dy, dw, dh）。
 */
export function fitImage(
  src: { width: number; height: number },
  box: Rect,
  fit: ImageFit = 'cover',
): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
} {
  const { width: iw, height: ih } = src;
  if (fit === 'fill' || !iw || !ih)
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: box.x, dy: box.y, dw: box.width, dh: box.height };
  if (fit === 'cover') {
    const r = Math.max(box.width / iw, box.height / ih);
    const sw = box.width / r;
    const sh = box.height / r;
    return {
      sx: (iw - sw) / 2,
      sy: (ih - sh) / 2,
      sw,
      sh,
      dx: box.x,
      dy: box.y,
      dw: box.width,
      dh: box.height,
    };
  }
  const r = Math.min(box.width / iw, box.height / ih);
  const dw = iw * r;
  const dh = ih * r;
  return {
    sx: 0,
    sy: 0,
    sw: iw,
    sh: ih,
    dx: box.x + (box.width - dw) / 2,
    dy: box.y + (box.height - dh) / 2,
    dw,
    dh,
  };
}

let filterSupport: boolean | null = null;

/** 瀏覽器的 canvas 支不支援 filter（Safari 舊版不支援） */
export function canvasFilterSupported(): boolean {
  if (filterSupport === null) {
    try {
      const c = makeCanvas(1, 1);
      const ctx = c.getContext('2d') as Ctx | null;
      if (!ctx || !('filter' in ctx)) filterSupport = false;
      else {
        ctx.filter = 'blur(2px)';
        filterSupport = ctx.filter === 'blur(2px)';
      }
    } catch {
      filterSupport = false;
    }
  }
  return filterSupport;
}

/** 模糊一張畫布（就地）：支援 canvas filter 時用它，不支援時用 core/image 的同樣規則 */
export function blurCanvas(canvas: AnyCanvas, sigma: number): void {
  if (!(sigma > 0)) return;
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return;
  if (canvasFilterSupported()) {
    const copy = makeCanvas(canvas.width, canvas.height);
    (copy.getContext('2d') as Ctx).drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `blur(${sigma}px)`;
    ctx.drawImage(copy, 0, 0);
    ctx.restore();
    return;
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = applyFilterOps(img.data, canvas.width, canvas.height, [
    { op: 'blur', radius: sigma, mix: 1, canvas: true },
  ]);
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

/** 沿一個方向淡出（就地；from 處完全不透明、to 處完全透明） */
export function fadeCanvas(
  canvas: AnyCanvas,
  axis: 'x' | 'y',
  from: number,
  to: number,
  reverse = false,
): void {
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return;
  const len = axis === 'x' ? canvas.width : canvas.height;
  const g =
    axis === 'x'
      ? ctx.createLinearGradient(len * from, 0, len * to, 0)
      : ctx.createLinearGradient(0, len * from, 0, len * to);
  g.addColorStop(0, reverse ? 'rgba(0,0,0,0)' : '#000');
  g.addColorStop(1, reverse ? '#000' : 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/* ---------- 各種節點 ---------- */

function drawRect(ctx: Ctx, n: RectNode): void {
  ctx.beginPath();
  shapePath(ctx, n.x, n.y, n.w, n.h, n);
  if (n.fill) {
    ctx.save();
    setShadow(ctx, n.shadow);
    ctx.fillStyle = paintStyle(ctx, n.fill);
    ctx.fill();
    ctx.restore();
  }
  if (n.stroke && n.stroke.width > 0) {
    ctx.save();
    ctx.lineWidth = n.stroke.width;
    ctx.strokeStyle = n.stroke.color;
    if (n.stroke.dash) ctx.setLineDash([...n.stroke.dash]);
    ctx.stroke();
    ctx.restore();
  }
}

/** 圖片節點（形狀裁切、模糊、淡出、陰影） */
function drawImageNode(ctx: Ctx, n: ImageNode): void {
  if (!n.image) return;
  const size = sourceSize(n.image);
  if (!size.width || !size.height || n.w <= 0 || n.h <= 0) return;
  const f = fitImage(size, { x: 0, y: 0, width: n.w, height: n.h }, n.fit);
  const simple = !n.blur && !n.fade && !n.shadow;
  if (simple) {
    ctx.save();
    if (n.radius || n.circle) {
      ctx.beginPath();
      shapePath(ctx, n.x, n.y, n.w, n.h, n);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = n.quality ?? 'high';
    ctx.drawImage(n.image, f.sx, f.sy, f.sw, f.sh, n.x + f.dx, n.y + f.dy, f.dw, f.dh);
    ctx.restore();
    return;
  }
  /* 先在另一張畫布上處理（模糊、淡出、形狀），再整張畫上去（含陰影） */
  const tmp = makeCanvas(n.w, n.h);
  const t = tmp.getContext('2d') as Ctx;
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = n.quality ?? 'high';
  t.drawImage(n.image, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  if (n.blur) blurCanvas(tmp, n.blur);
  if (n.fade) fadeCanvas(tmp, n.fade.axis, n.fade.from, n.fade.to, n.fade.reverse);
  if (n.radius || n.circle) {
    t.save();
    t.globalCompositeOperation = 'destination-in';
    t.beginPath();
    shapePath(t, 0, 0, n.w, n.h, n);
    t.fillStyle = '#000';
    t.fill();
    t.restore();
  }
  ctx.save();
  setShadow(ctx, n.shadow);
  ctx.drawImage(tmp, n.x, n.y, n.w, n.h);
  ctx.restore();
}

function drawText(ctx: Ctx, n: TextNode): void {
  if (!n.text) return;
  const lay = layoutText(ctx, n);
  const ls = n.letterSpacing ?? 0;
  const m = fontMetrics(ctx, lay.font, lay.size);
  ctx.save();
  ctx.font = lay.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lay.lines.forEach((line, i) => {
    const base = baselineIn(lay.top + i * lay.lineHeightPx, lay.lineHeightPx, m);
    const x0 = lay.xs[i];
    const paint = (fn: (s: string, x: number, y: number) => void) => {
      if (!ls) {
        fn(line.text, x0, base);
        return;
      }
      let x = x0;
      for (const ch of Array.from(line.text)) {
        fn(ch, x, base);
        x += ctx.measureText(ch).width + ls;
      }
    };
    if (n.stroke && n.stroke.width > 0) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = n.stroke.width * 2;
      ctx.strokeStyle = n.stroke.color;
      paint((s, x, y) => ctx.strokeText(s, x, y));
      ctx.restore();
    }
    ctx.save();
    setShadow(ctx, n.shadow);
    ctx.fillStyle = n.color;
    paint((s, x, y) => ctx.fillText(s, x, y));
    ctx.restore();
  });
  ctx.restore();
}

function drawRich(ctx: Ctx, n: RichNode): void {
  const lay = layoutRichNode(ctx, n);
  ctx.save();
  ctx.beginPath();
  ctx.rect(n.x, n.y, n.w, n.h);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let font = '';
  for (const g of lay.glyphs) {
    if (g.ch === ' ' || g.ch === '　') continue;
    const f = fontString(n.font, g.size, g.weight);
    if (f !== font) {
      font = f;
      ctx.font = f;
    }
    ctx.fillStyle = g.color;
    if (g.scaleX === 1) ctx.fillText(g.ch, g.x, g.baseline);
    else {
      ctx.save();
      ctx.translate(g.x, g.baseline);
      ctx.scale(g.scaleX, 1);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawLine(
  ctx: Ctx,
  n: { points: readonly number[]; color: string; width: number; dash?: readonly number[] },
) {
  if (n.points.length < 4) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(n.points[0], n.points[1]);
  for (let i = 2; i + 1 < n.points.length; i += 2) ctx.lineTo(n.points[i], n.points[i + 1]);
  ctx.lineWidth = n.width;
  ctx.strokeStyle = n.color;
  if (n.dash) ctx.setLineDash([...n.dash]);
  ctx.stroke();
  ctx.restore();
}

/** 依序畫出節點（第一個在最下面） */
export function drawScene(ctx: Ctx, nodes: readonly SceneNode[]): void {
  for (const n of nodes) {
    if (n.opacity !== undefined && n.opacity <= 0) continue;
    ctx.save();
    if (n.opacity !== undefined && n.opacity < 1) ctx.globalAlpha *= n.opacity;
    switch (n.kind) {
      case 'rect':
        drawRect(ctx, n);
        break;
      case 'line':
        drawLine(ctx, n);
        break;
      case 'image':
        drawImageNode(ctx, n);
        break;
      case 'text':
        drawText(ctx, n);
        break;
      case 'rich':
        drawRich(ctx, n);
        break;
      case 'custom':
        n.draw(ctx as CanvasRenderingContext2D);
        break;
      case 'group': {
        ctx.translate(n.x ?? 0, n.y ?? 0);
        if (n.clip) {
          ctx.beginPath();
          shapePath(ctx, n.clip.x, n.clip.y, n.clip.width, n.clip.height, n.clip);
          ctx.clip();
        }
        drawScene(ctx, n.children);
        break;
      }
    }
    ctx.restore();
  }
}

/* ---------- 點選區、字型 ---------- */

/** 節點的範圍（畫布座標，未含群組位移）；量不到時 null */
export function nodeBox(ctx: Ctx | null, n: SceneNode): Rect | null {
  switch (n.kind) {
    case 'rect':
    case 'image':
    case 'rich':
      return { x: n.x, y: n.y, width: n.w, height: n.h };
    case 'text': {
      if (n.w !== undefined && n.h !== undefined)
        return { x: n.x, y: n.y, width: n.w, height: n.h };
      if (!ctx)
        return n.w !== undefined ? { x: n.x, y: n.y, width: n.w, height: n.font.size * 1.3 } : null;
      const lay = layoutText(ctx, n);
      const w = n.w ?? Math.max(1, ...lay.lines.map((l) => l.width));
      const h = n.h ?? Math.max(lay.lineHeightPx, lay.lines.length * lay.lineHeightPx);
      return { x: n.x, y: n.y, width: w, height: h };
    }
    case 'line': {
      const xs = n.points.filter((_, i) => i % 2 === 0);
      const ys = n.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case 'custom':
      return n.box ?? null;
    case 'group':
      return null;
  }
}

/**
 * 收集點選區（依畫的順序：後面的在上層）。群組的位移會加進去；群組本身有 hit 時以它的裁切範圍為範圍。
 * ctx 用來量沒有寬高的文字（可以是任何 2D context；null 時沒有寬高的文字略過）。
 */
export function collectHitRegions(
  nodes: readonly SceneNode[],
  ctx: Ctx | null = null,
  dx = 0,
  dy = 0,
): HitRegion[] {
  const out: HitRegion[] = [];
  for (const n of nodes) {
    if (n.kind === 'group') {
      const ox = dx + (n.x ?? 0);
      const oy = dy + (n.y ?? 0);
      if (n.hit && n.clip)
        out.push({
          ...n.hit,
          box: { x: n.clip.x + ox, y: n.clip.y + oy, width: n.clip.width, height: n.clip.height },
          circle: n.clip.circle,
        });
      out.push(...collectHitRegions(n.children, ctx, ox, oy));
      continue;
    }
    if (!n.hit) continue;
    const b = nodeBox(ctx, n);
    if (!b) continue;
    const circle = (n.kind === 'rect' || n.kind === 'image') && !!n.circle;
    const radius =
      (n.kind === 'rect' || n.kind === 'image') && typeof n.radius === 'number'
        ? n.radius
        : undefined;
    out.push({ ...n.hit, box: { ...b, x: b.x + dx, y: b.y + dy }, circle, radius });
  }
  return out;
}

export interface FontUse {
  family: string;
  weight: number;
  text: string;
}

/** 場景用到的字型與文字（畫之前先載入，Google 字型只下載用到的字） */
export function collectFonts(nodes: readonly SceneNode[]): FontUse[] {
  const map = new Map<string, FontUse>();
  const add = (family: string, weight: number, text: string) => {
    if (!text) return;
    const key = `${family}\n${weight}`;
    const hit = map.get(key);
    if (hit) hit.text += text;
    else map.set(key, { family, weight, text });
  };
  const walk = (list: readonly SceneNode[]) => {
    for (const n of list) {
      if (n.kind === 'group') walk(n.children);
      else if (n.kind === 'text') add(n.font.family, n.font.weight ?? 400, n.text);
      else if (n.kind === 'rich')
        for (const l of n.doc.lines)
          for (const r of l.runs)
            add(n.font.family, r.bold ? (n.boldWeight ?? 700) : (n.font.weight ?? 400), r.text);
    }
  };
  walk(nodes);
  for (const f of map.values()) f.text = [...new Set(Array.from(f.text))].join('');
  return [...map.values()];
}

/** 文字寬（給工具算位置用；例如「名字・年齡」的接續位置） */
export { textWidth };

/** 依點選區取最上層的（畫布座標） */
export function hitRegionAt(regions: readonly HitRegion[], x: number, y: number): HitRegion | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    const b = r.box;
    if (r.circle) {
      const rr = Math.min(b.width, b.height) / 2;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) return r;
    } else if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return r;
  }
  return null;
}
