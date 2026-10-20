/**
 * 「圖片切換」模式的切換效果（規格 3.11.6、F141～F155）：
 * `transitionOps` 把某個效果在進度 p 的畫法寫成「畫哪一張、在哪裡、不透明度、相加與否、裁剪範圍、模糊半徑、馬賽克格子」的清單
 * （座標都是輸出畫面的 px，純函式、沒有畫布，單元測試逐項驗證）；`drawFx` 把清單畫到畫布上（預覽、匯出、對話框縮圖共用）。
 *
 * A＝切換前的畫面（舊圖）、B＝切換後的畫面（新圖），兩者都是整張輸出畫面（已含背景）；「相加」＝把這一層以相加的方式疊上去。
 */

import { makeCanvas } from '@/core/image';
import type { Ctx2D } from '@/core/motion';
import type { TransKind } from './deck';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 裁剪範圍：幾個矩形的聯集，或一個圓 */
export type Clip = { rects: Rect[] } | { circle: { x: number; y: number; r: number } };

export interface ImageOp {
  type: 'image';
  src: 'A' | 'B';
  /** 畫在哪裡；null＝整個畫面 */
  rect: Rect | null;
  alpha: number;
  /** 以相加的方式疊上去 */
  add: boolean;
  clip: Clip | null;
  /** 模糊半徑（px）；null＝不模糊 */
  blur: number | null;
  /** 馬賽克方塊邊長（輸出 px）；0＝不做 */
  mosaic: number;
}

export interface FillOp {
  type: 'fill';
  color: string;
  alpha: number;
}

export type FxOp = ImageOp | FillOp;

const VEC = { R: [1, 0], L: [-1, 0], B: [0, 1], T: [0, -1] } as const;
type Dir = keyof typeof VEC;

const img = (src: 'A' | 'B', o: Partial<Omit<ImageOp, 'type' | 'src'>> = {}): ImageOp => ({
  type: 'image',
  src,
  rect: null,
  alpha: 1,
  add: false,
  clip: null,
  blur: null,
  mosaic: 0,
  ...o,
});

/** -0 變成 0（比對與顯示都乾淨） */
const z = (v: number) => v + 0;

/** 以畫面中心為準的縮放矩形 */
const scaled = (W: number, H: number, s: number): Rect => ({
  x: W / 2 - (W * s) / 2,
  y: H / 2 - (H * s) / 2,
  w: W * s,
  h: H * s,
});

const crossfade = (p: number): FxOp[] => [
  img('A', { alpha: 1 - p }),
  img('B', { alpha: p, add: true }),
];

/**
 * 效果 kind 在進度 p（0～1）的畫法。W、H＝輸出寬高。canFilter＝瀏覽器的畫布支援濾鏡（模糊用；不支援時改用交叉溶接）。
 * 「隨機」不是實際的效果（排段時已換成抽到的），畫成交叉溶接；「不切換」只給對話框縮圖用（前半 A、後半 B）。
 */
export function transitionOps(
  kind: TransKind,
  p: number,
  W: number,
  H: number,
  canFilter = true,
): FxOp[] {
  const m = /^(slide|cover|wipe)([RLBT])$/.exec(kind);
  if (m) {
    const [dx, dy] = VEC[m[2] as Dir];
    if (m[1] === 'slide') {
      return [
        img('A', { rect: { x: z(-dx * W * p), y: z(-dy * H * p), w: W, h: H } }),
        img('B', { rect: { x: z(dx * W * (1 - p)), y: z(dy * H * (1 - p)), w: W, h: H } }),
      ];
    }
    if (m[1] === 'cover') {
      return [
        img('A'),
        img('B', { rect: { x: z(dx * W * (1 - p)), y: z(dy * H * (1 - p)), w: W, h: H } }),
      ];
    }
    return [
      img('A'),
      img('B', {
        clip: {
          rects: [
            {
              x: dx > 0 ? W * (1 - p) : 0,
              y: dy > 0 ? H * (1 - p) : 0,
              w: dx ? W * p : W,
              h: dy ? H * p : H,
            },
          ],
        },
      }),
    ];
  }
  switch (kind) {
    case 'cut':
      return [img(p < 0.5 ? 'A' : 'B')];
    case 'dipblack':
    case 'dipwhite':
      return [
        img(p < 0.5 ? 'A' : 'B'),
        {
          type: 'fill',
          color: kind === 'dipblack' ? '#000000' : '#ffffff',
          alpha: 1 - Math.abs(p - 0.5) * 2,
        },
      ];
    case 'zoomIn':
      return [
        img('A', { alpha: 1 - p, rect: scaled(W, H, 1 + 0.4 * p) }),
        img('B', { alpha: p, add: true, rect: scaled(W, H, 0.75 + 0.25 * p) }),
      ];
    case 'zoomOut':
      return [
        img('A', { alpha: 1 - p, rect: scaled(W, H, 1 - 0.3 * p) }),
        img('B', { alpha: p, add: true, rect: scaled(W, H, 1.3 - 0.3 * p) }),
      ];
    case 'circle':
    case 'circleClose': {
      const R = Math.hypot(W, H) / 2;
      const open = kind === 'circle';
      const r = Math.max(0, open ? R * p : R * (1 - p));
      return [
        img(open ? 'A' : 'B'),
        img(open ? 'B' : 'A', { clip: { circle: { x: W / 2, y: H / 2, r } } }),
      ];
    }
    case 'blindsV':
    case 'blindsH': {
      const n = 8;
      const rects: Rect[] = [];
      for (let k = 0; k < n; k++) {
        rects.push(
          kind === 'blindsV'
            ? { x: (k * W) / n, y: 0, w: (W / n) * p, h: H }
            : { x: 0, y: (k * H) / n, w: W, h: (H / n) * p },
        );
      }
      return [img('A'), img('B', { clip: { rects } })];
    }
    case 'blur': {
      if (!canFilter) return crossfade(p);
      const s = (W / 800) * 24;
      const a = s * p;
      const b = s * (1 - p);
      const ma = a * 2;
      const mb = b * 2;
      return [
        img('A', {
          alpha: 1 - p,
          blur: a,
          rect: { x: -ma, y: -ma, w: W + ma * 2, h: H + ma * 2 },
        }),
        img('B', {
          alpha: p,
          add: true,
          blur: b,
          rect: { x: -mb, y: -mb, w: W + mb * 2, h: H + mb * 2 },
        }),
      ];
    }
    case 'pixelate': {
      const f = p < 0.5 ? p * 2 : (1 - p) * 2;
      const cell = Math.max(1, Math.round(1 + f * Math.max(8, W / 18)));
      return [img(p < 0.5 ? 'A' : 'B', { mosaic: cell })];
    }
    case 'flip': {
      const s = p < 0.5 ? 1 - 2 * p : 2 * p - 1;
      if (s <= 0.003) return [];
      return [img(p < 0.5 ? 'A' : 'B', { rect: { x: (W - W * s) / 2, y: 0, w: W * s, h: H } })];
    }
    default:
      /* fade、random */
      return crossfade(p);
  }
}

/* ---------- 畫到畫布上 ---------- */

let mosaicCanvas: ReturnType<typeof makeCanvas> | null = null;

/**
 * 把 ops 畫到 ctx（畫布像素尺寸可以小於輸出尺寸：預覽用，座標與模糊半徑依 畫布寬 ÷ W 縮小）。
 * A、B 的像素尺寸應與 ctx 的畫布相同。
 */
export function drawFx(
  ctx: Ctx2D,
  ops: readonly FxOp[],
  A: CanvasImageSource,
  B: CanvasImageSource,
  W: number,
  H: number,
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const kx = cw / W;
  const ky = ch / H;
  for (const op of ops) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, op.alpha));
    if (op.type === 'fill') {
      ctx.fillStyle = op.color;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      continue;
    }
    if (op.add) ctx.globalCompositeOperation = 'lighter';
    if (op.clip) {
      ctx.beginPath();
      if ('rects' in op.clip) {
        for (const r of op.clip.rects) ctx.rect(r.x * kx, r.y * ky, r.w * kx, r.h * ky);
      } else {
        const c = op.clip.circle;
        if (kx === ky) ctx.arc(c.x * kx, c.y * ky, Math.max(0, c.r) * kx, 0, Math.PI * 2);
        else
          ctx.ellipse(
            c.x * kx,
            c.y * ky,
            Math.max(0, c.r) * kx,
            Math.max(0, c.r) * ky,
            0,
            0,
            Math.PI * 2,
          );
      }
      ctx.clip();
    }
    if (op.blur !== null) ctx.filter = `blur(${op.blur * kx}px)`;
    const src = op.src === 'A' ? A : B;
    if (op.mosaic > 0) {
      const c = op.mosaic;
      const w = Math.max(1, Math.ceil(W / c));
      const h = Math.max(1, Math.ceil(H / c));
      if (!mosaicCanvas) mosaicCanvas = makeCanvas(2, 2);
      mosaicCanvas.width = w;
      mosaicCanvas.height = h;
      (mosaicCanvas.getContext('2d') as Ctx2D).drawImage(src, 0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mosaicCanvas, 0, 0, w, h, 0, 0, w * c * kx, h * c * ky);
    } else if (op.rect) {
      const r = op.rect;
      ctx.drawImage(src, r.x * kx, r.y * ky, r.w * kx, r.h * ky);
    } else {
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
  }
}

/** 這個畫布環境支援濾鏡（模糊效果用） */
export const supportsCanvasFilter = (ctx: Ctx2D): boolean => 'filter' in ctx;
