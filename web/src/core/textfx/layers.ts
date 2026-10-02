/**
 * 圖層工具：暫存畫布池、整層合成（透明度、混色模式）、遮罩後合成。
 *
 * 用法（卡拉 OK 的唱後文字：只露出交界之前的部分）：
 * ```ts
 * const pool = createLayerPool();
 * maskedComposite(ctx, pool, {
 *   draw: (c) => drawAfterText(c),
 *   mask: (c) => fillWipeMask(c, { edge, softness: 14, left, right, top, bottom }),
 * });
 * ```
 * 暫存畫布和目標畫布同尺寸、套用同樣的變形，所以 draw／mask 一律用目標畫布的座標畫。
 */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface Layer {
  canvas: AnyCanvas;
  ctx: Ctx2D;
}

export interface LayerPool {
  /** 借一張清空、和 like 同尺寸並套用同樣變形的暫存畫布 */
  acquire(like: Ctx2D): Layer;
  /** 還回去（之後可以再借） */
  release(layer: Layer): void;
}

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** 暫存畫布池：同一格裡借了又還，不會每格都建新的畫布 */
export function createLayerPool(): LayerPool {
  const free: Layer[] = [];
  return {
    acquire(like) {
      const W = like.canvas.width;
      const H = like.canvas.height;
      let layer = free.pop();
      if (!layer) {
        const canvas = makeCanvas(W, H);
        const ctx = canvas.getContext('2d') as Ctx2D | null;
        if (!ctx) throw new Error('無法建立畫布');
        layer = { canvas, ctx };
      }
      if (layer.canvas.width !== W || layer.canvas.height !== H) {
        layer.canvas.width = W;
        layer.canvas.height = H;
      }
      const c = layer.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.filter = 'none';
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      c.shadowOffsetX = 0;
      c.shadowOffsetY = 0;
      c.clearRect(0, 0, W, H);
      c.setTransform(like.getTransform());
      return layer;
    },
    release(layer) {
      free.push(layer);
    },
  };
}

/** 把整張暫存畫布以指定的透明度與混色模式貼回目標（不受目標目前的變形影響） */
export function compositeLayer(
  target: Ctx2D,
  layer: Layer,
  {
    alpha = 1,
    composite = 'source-over',
  }: { alpha?: number; composite?: GlobalCompositeOperation } = {},
): void {
  if (alpha <= 0) return;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = Math.min(1, alpha);
  target.globalCompositeOperation = composite;
  target.drawImage(layer.canvas, 0, 0);
  target.restore();
}

/**
 * 先在暫存畫布上畫好一整組內容，再整體以透明度／混色模式合成到目標。
 * 用在「半透明的句子先合成完整畫面（唱前＋唱後＋發光）再整體套透明度」，不會透出底下的層。
 */
export function withLayer(
  target: Ctx2D,
  pool: LayerPool,
  draw: (ctx: Ctx2D) => void,
  options: { alpha?: number; composite?: GlobalCompositeOperation } = {},
): void {
  if ((options.alpha ?? 1) <= 0) return;
  const layer = pool.acquire(target);
  try {
    draw(layer.ctx);
    compositeLayer(target, layer, options);
  } finally {
    pool.release(layer);
  }
}

/**
 * 遮罩後合成：draw 畫內容、mask 畫遮罩（遮罩的不透明度＝內容留下的比例），
 * 再以 composite（預設一般疊加；發光用 'lighter' 加亮）與 alpha 合成到目標。
 */
export function maskedComposite(
  target: Ctx2D,
  pool: LayerPool,
  {
    draw,
    mask,
    composite = 'source-over',
    alpha = 1,
  }: {
    draw: (ctx: Ctx2D) => void;
    mask: (ctx: Ctx2D) => void;
    composite?: GlobalCompositeOperation;
    alpha?: number;
  },
): void {
  if (alpha <= 0) return;
  const layer = pool.acquire(target);
  try {
    const c = layer.ctx;
    c.save();
    draw(c);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'destination-in';
    mask(c);
    c.restore();
    compositeLayer(target, layer, { alpha, composite });
  } finally {
    pool.release(layer);
  }
}

/** 把暫存畫布上已畫的內容（任何顏色）整個換成單色，保留透明度（例如發光的剪影） */
export function tintLayer(ctx: Ctx2D, color: string): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
