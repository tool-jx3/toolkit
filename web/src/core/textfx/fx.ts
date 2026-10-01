/**
 * 整段文字的裝飾層堆疊：由下而上一層層畫（陰影類 → 外框類 → 填色），整段當成一個形狀。
 *
 * | 層 | 看得到的結果 |
 * |---|---|
 * | outline | 字形往外擴 width px 的實心剪影（圓角），用 paint 塗；多層外框各自的 width 是從字的邊緣量起 |
 * | fill | 字形本體，用 paint 塗（單色、漸層、金屬、彩虹、斜紋） |
 * | shadow | 硬陰影（blur 0）或模糊陰影：剪影（含 spread）往 (dx, dy) 移 |
 * | extrude | 立體擠出：剪影往 (dx, dy) 方向連續複製（每 1 px 一份），形成實心的厚度 |
 * | glow | 光暈：剪影模糊後以加亮（lighter）疊上；疊幾層由大到小的 glow 就是霓虹 |
 * | aberration | 色差：兩份染色的剪影左右錯開，以濾色（screen）疊上 |
 * | knockout | 挖空：剪影把底下已畫的東西挖成透明 |
 *
 * 模糊用「畫在畫面外、只留下陰影」的方式做（各瀏覽器都支援），不用 ctx.filter。
 * 整段的縮放、旋轉、位移（文字動態）以 transform 套在所有層上：陰影、光暈跟著字移動。
 */
import { type Ctx2D, compositeLayer, createLayerPool, type LayerPool } from './layers';
import { type Paint, type PaintBox, paintStyle } from './paint';
import { type GlyphOffset, type TextShape, traceShape, traceSilhouette } from './shape';

export type TextFxLayer =
  | { kind: 'fill'; paint: Paint }
  | { kind: 'outline'; paint: Paint; width: number }
  | {
      kind: 'shadow';
      color: string;
      /** 模糊（px，同 canvas 的 shadowBlur；0＝硬陰影） */
      blur?: number;
      dx: number;
      dy: number;
      /** 剪影往外擴（通常＝最外層外框的寬度） */
      spread?: number;
    }
  | { kind: 'extrude'; paint: Paint; dx: number; dy: number; spread?: number }
  | {
      kind: 'glow';
      color: string;
      /** 模糊（px） */
      blur: number;
      spread?: number;
      /** 疊幾次（越多越亮，預設 1） */
      strength?: number;
      /** 預設 lighter（加亮） */
      composite?: GlobalCompositeOperation;
    }
  | {
      kind: 'aberration';
      /** 左、右兩份副本的顏色（例如偏紅、偏青） */
      colors: readonly [string, string];
      /** 水平錯開（px）：左邊那份往左、右邊那份往右 */
      dx: number;
      /** 各份另外的小位移（例如依種子決定、每格都一樣） */
      jitter?: readonly [{ x: number; y: number }, { x: number; y: number }];
      spread?: number;
      /** 預設 screen（濾色） */
      composite?: GlobalCompositeOperation;
    }
  | { kind: 'knockout'; spread?: number };

export interface BlockTransform {
  /** 縮放、旋轉的中心（通常是畫布中心） */
  cx: number;
  cy: number;
  scale?: number;
  /** 弧度，正數順時針 */
  rotate?: number;
  dx?: number;
  dy?: number;
}

/** 以 (cx, cy) 為中心縮放、旋轉，再位移 */
export function applyBlockTransform(ctx: Ctx2D, tr: BlockTransform): void {
  ctx.translate(tr.cx + (tr.dx ?? 0), tr.cy + (tr.dy ?? 0));
  if (tr.rotate) ctx.rotate(tr.rotate);
  if (tr.scale !== undefined && tr.scale !== 1) ctx.scale(tr.scale, tr.scale);
  ctx.translate(-tr.cx, -tr.cy);
}

/**
 * 這組層往外擴的最大距離（px）：外框、陰影位移＋模糊、擠出、光暈、色差。給自動字級留邊用。
 * outlineSum：只把所有外框寬度相加（「所有外框層的厚度總和」）。
 */
export function textFxExtent(layers: readonly TextFxLayer[]): { max: number; outlineSum: number } {
  let max = 0;
  let outlineSum = 0;
  for (const l of layers) {
    switch (l.kind) {
      case 'outline':
        max = Math.max(max, l.width);
        outlineSum += l.width;
        break;
      case 'shadow':
        max = Math.max(
          max,
          (l.spread ?? 0) + Math.max(Math.abs(l.dx), Math.abs(l.dy)) + (l.blur ?? 0),
        );
        break;
      case 'extrude':
        max = Math.max(max, (l.spread ?? 0) + Math.max(Math.abs(l.dx), Math.abs(l.dy)));
        break;
      case 'glow':
        max = Math.max(max, (l.spread ?? 0) + l.blur);
        break;
      case 'aberration': {
        const j = l.jitter
          ? Math.max(...l.jitter.map((v) => Math.max(Math.abs(v.x), Math.abs(v.y))))
          : 0;
        max = Math.max(max, (l.spread ?? 0) + Math.abs(l.dx) + j);
        break;
      }
      case 'knockout':
        max = Math.max(max, l.spread ?? 0);
        break;
      default:
        break;
    }
  }
  return { max, outlineSum };
}

export interface RenderTextFxOptions {
  /** 循環的進度 0～1（彩虹、斜紋的流動） */
  t?: number;
  /** 整段的縮放、旋轉、位移 */
  transform?: BlockTransform;
  /** 每個字的額外位移（逐字波浪） */
  offset?: GlyphOffset;
  /** 模糊類（shadow 有 blur、glow）需要暫存畫布 */
  pool?: LayerPool;
}

/** 目前變形的縮放倍率（模糊半徑要跟著縮放） */
function transformScale(ctx: Ctx2D): number {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

/** 模糊的剪影：先在暫存畫布上畫好（套用同樣的變形），再以畫面外的陰影只留下模糊的部分 */
function blurredSilhouette(
  ctx: Ctx2D,
  pool: LayerPool,
  draw: (c: Ctx2D) => void,
  {
    color,
    blur,
    composite,
    passes,
  }: {
    color: string;
    blur: number;
    composite: GlobalCompositeOperation;
    passes: number;
  },
): void {
  const layer = pool.acquire(ctx);
  try {
    const c = layer.ctx;
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    draw(c);
    const W = ctx.canvas.width;
    const k = transformScale(ctx);
    const far = W + blur * k * 4 + 64;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = composite;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * k;
    ctx.shadowOffsetX = far;
    ctx.shadowOffsetY = 0;
    for (let i = 0; i < passes; i++) ctx.drawImage(layer.canvas, -far, 0);
    ctx.restore();
  } finally {
    pool.release(layer);
  }
}

/**
 * 用 paint 塗 drawMask 描出的形狀。單色直接畫；漸層、彩虹、斜紋先在暫存畫布上畫出形狀，再以 source-in 塗上
 * （每個字描的時候會平移、旋轉到字的位置，直接用漸層的話範圍會跟著每個字移動；這樣範圍才是整段文字的外接框）。
 */
export function withPaint(
  ctx: Ctx2D,
  pool: LayerPool,
  paint: Paint,
  box: PaintBox,
  t: number,
  drawMask: (c: Ctx2D) => void,
): void {
  if (paint.kind === 'solid') {
    ctx.fillStyle = paint.color;
    ctx.strokeStyle = paint.color;
    drawMask(ctx);
    return;
  }
  const layer = pool.acquire(ctx);
  try {
    const c = layer.ctx;
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    c.save();
    drawMask(c);
    c.restore();
    /* 暫存畫布的變形和目標相同：漸層以形狀的座標定義，鋪滿整張 */
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = paintStyle(c, paint, box, t);
    const inv = c.getTransform().inverse();
    const W = c.canvas.width;
    const H = c.canvas.height;
    const pts = [
      inv.transformPoint({ x: 0, y: 0 }),
      inv.transformPoint({ x: W, y: 0 }),
      inv.transformPoint({ x: 0, y: H }),
      inv.transformPoint({ x: W, y: H }),
    ];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    c.fillRect(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0);
    compositeLayer(ctx, layer, { composite: ctx.globalCompositeOperation });
  } finally {
    pool.release(layer);
  }
}

let fallbackPool: LayerPool | null = null;
const sharedPool = (): LayerPool => {
  fallbackPool ??= createLayerPool();
  return fallbackPool;
};

/**
 * 依序畫出每一層。呼叫前畫布的變形是畫面座標（例如已套用匯出的縮放）；形狀的座標是畫面座標。
 */
export function renderTextFx(
  ctx: Ctx2D,
  shape: TextShape,
  layers: readonly TextFxLayer[],
  { t = 0, transform, offset, pool }: RenderTextFxOptions = {},
): void {
  const p = pool ?? null;
  ctx.save();
  if (transform) applyBlockTransform(ctx, transform);
  const box = shape.bounds;
  for (const layer of layers) {
    ctx.save();
    switch (layer.kind) {
      case 'fill': {
        withPaint(ctx, p ?? sharedPool(), layer.paint, box, t, (c) =>
          traceShape(c, shape, 'fill', { offset }),
        );
        break;
      }
      case 'outline': {
        withPaint(ctx, p ?? sharedPool(), layer.paint, box, t, (c) =>
          traceSilhouette(c, shape, layer.width, { offset }),
        );
        break;
      }
      case 'shadow': {
        const spread = layer.spread ?? 0;
        if (!layer.blur) {
          ctx.fillStyle = layer.color;
          ctx.strokeStyle = layer.color;
          traceSilhouette(ctx, shape, spread, { dx: layer.dx, dy: layer.dy, offset });
        } else {
          blurredSilhouette(
            ctx,
            p ?? sharedPool(),
            (c) => traceSilhouette(c, shape, spread, { dx: layer.dx, dy: layer.dy, offset }),
            { color: layer.color, blur: layer.blur, composite: 'source-over', passes: 1 },
          );
        }
        break;
      }
      case 'extrude': {
        const len = Math.hypot(layer.dx, layer.dy);
        const steps = Math.max(1, Math.ceil(len));
        withPaint(ctx, p ?? sharedPool(), layer.paint, box, t, (c) => {
          for (let i = steps; i >= 1; i--) {
            const k = i / steps;
            traceSilhouette(c, shape, layer.spread ?? 0, {
              dx: layer.dx * k,
              dy: layer.dy * k,
              offset,
            });
          }
        });
        break;
      }
      case 'glow': {
        blurredSilhouette(
          ctx,
          p ?? sharedPool(),
          (c) => traceSilhouette(c, shape, layer.spread ?? 0, { offset }),
          {
            color: layer.color,
            blur: layer.blur,
            composite: layer.composite ?? 'lighter',
            passes: Math.max(1, Math.round(layer.strength ?? 1)),
          },
        );
        break;
      }
      case 'aberration': {
        ctx.globalCompositeOperation = layer.composite ?? 'screen';
        layer.colors.forEach((color, i) => {
          const sign = i === 0 ? -1 : 1;
          const j = layer.jitter?.[i] ?? { x: 0, y: 0 };
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          traceSilhouette(ctx, shape, layer.spread ?? 0, {
            dx: sign * layer.dx + j.x,
            dy: j.y,
            offset,
          });
        });
        break;
      }
      case 'knockout': {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        traceSilhouette(ctx, shape, layer.spread ?? 0, { offset });
        break;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/** 單一形狀描成單色的剪影（發光帶、挖空底板的遮罩等） */
export function drawSilhouette(
  ctx: Ctx2D,
  shape: TextShape,
  color: string,
  spread = 0,
  offset?: GlyphOffset,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  traceSilhouette(ctx, shape, spread, { offset });
  ctx.restore();
}
