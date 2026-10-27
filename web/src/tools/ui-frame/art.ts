/**
 * 框的圖形（規格 3.3、3.5～3.7，自訂；形狀、四角裝飾、中央紋章、翻頁游標、質感的圖樣都是本站自己設計的）。
 *
 * 四角裝飾以「左上角」的方向畫在單位座標裡（原點＝框的角，+x 沿上緣往右、+y 沿左緣往下，約 0～32），
 * 其他三個角鏡射；大小乘上 k。畫在 canvas 的 2D context 上，瀏覽器與 Node（node-canvas）都能用。
 */
import type { CornerStyle, CursorShape, Ornament, Texture } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TAU = Math.PI * 2;

/* ---------- 外框形狀 ---------- */

/** 角的半徑：不超過寬、高的 1/3 */
export const cornerRadius = (r: number, w: number, h: number): number =>
  Math.max(0, Math.min(r, w / 3, h / 3));

/** 畫出框的路徑（預設先 beginPath） */
export function traceFrame(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CornerStyle,
  radius: number,
  /** false：接在目前的路徑後面（evenodd 挖窗用） */
  begin = true,
): void {
  const r = cornerRadius(radius, w, h);
  if (begin) ctx.beginPath();
  if (r <= 0 || style === 'square') {
    ctx.rect(x, y, w, h);
    return;
  }
  if (style === 'round') {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    return;
  }
  if (style === 'bevel') {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.lineTo(x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.lineTo(x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.lineTo(x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.closePath();
    return;
  }
  /* 內凹：四個角各挖掉以角為圓心的四分之一圓 */
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x, y + h, r, 0, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arc(x, y, r, Math.PI / 2, 0, true);
  ctx.closePath();
}

/**
 * 外框在角的 45° 方向上離外接矩形的角有多遠（x、y 各相同）：四角裝飾從這一點開始畫，才會貼在框線上。
 */
export function cornerDiagonalInset(style: CornerStyle, r: number): number {
  if (r <= 0) return 0;
  switch (style) {
    case 'round':
      return r * (1 - Math.SQRT1_2);
    case 'bevel':
      return r / 2;
    case 'concave':
      return r * Math.SQRT1_2;
    default:
      return 0;
  }
}

/* ---------- 四角裝飾 ---------- */

/** 每種裝飾在單位座標裡伸多遠（對角兩個裝飾不會碰在一起的依據） */
export const ORNAMENT_REACH: Record<Ornament, number> = {
  classic: 32,
  star: 27,
  circuit: 28,
  wave: 24,
  gothic: 36,
  pixel: 28,
  none: 0,
};

function star(ctx: Ctx, cx: number, cy: number, R: number, r: number, points = 5, rot = -90) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function dot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** 四瓣（哥德窗花的四葉形） */
function quatrefoil(ctx: Ctx, cx: number, cy: number, d: number) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const lx = cx + Math.cos(a) * d;
    const ly = cy + Math.sin(a) * d;
    /* 每一瓣畫外側的 3/4 圓，四瓣首尾相接 */
    ctx.arc(lx, ly, d, a - Math.PI * 0.75, a + Math.PI * 0.75);
  }
  ctx.closePath();
}

/**
 * 畫一個角的裝飾（左上角的方向）。lineWidth、顏色由呼叫端設好（strokeStyle＝fillStyle＝裝飾色）。
 * k：大小倍率；lw：線寬（以畫面 px 計，不跟著 k 縮放）。
 */
export function drawOrnamentUnit(ctx: Ctx, type: Ornament, k: number, lw: number): void {
  if (type === 'none' || k <= 0) return;
  ctx.save();
  ctx.scale(k, k);
  ctx.lineWidth = lw / k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (type) {
    case 'classic': {
      /* 一道往角落鼓起的弧、角落的小渦卷、沿對角線的葉片、弧兩端的圓點 */
      ctx.beginPath();
      ctx.moveTo(1.5, 30);
      ctx.bezierCurveTo(1.5, 12, 12, 1.5, 30, 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9.5, 9.5, 3.6, Math.PI * 0.25, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12.5, 12.5);
      ctx.quadraticCurveTo(20, 13.5, 23, 23);
      ctx.quadraticCurveTo(13.5, 20, 12.5, 12.5);
      ctx.fill();
      dot(ctx, 1.5, 30, 1.9);
      dot(ctx, 30, 1.5, 1.9);
      break;
    }
    case 'star': {
      star(ctx, 9, 9, 7.6, 3.2);
      ctx.fill();
      /* 四芒的小閃光 */
      ctx.beginPath();
      ctx.moveTo(22, 1.5);
      ctx.quadraticCurveTo(22.6, 4.4, 25.5, 5);
      ctx.quadraticCurveTo(22.6, 5.6, 22, 8.5);
      ctx.quadraticCurveTo(21.4, 5.6, 18.5, 5);
      ctx.quadraticCurveTo(21.4, 4.4, 22, 1.5);
      ctx.fill();
      dot(ctx, 5, 21.5, 1.9);
      dot(ctx, 14.5, 18.5, 1.1);
      break;
    }
    case 'circuit': {
      ctx.lineWidth = Math.max(lw, 2) / k;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(0, 7);
      ctx.lineTo(7, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.lineWidth = lw / k;
      ctx.beginPath();
      ctx.moveTo(6, 16);
      ctx.lineTo(6, 10);
      ctx.lineTo(10, 6);
      ctx.lineTo(16, 6);
      ctx.moveTo(12, 12);
      ctx.lineTo(17, 12);
      ctx.lineTo(20.5, 15.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(22, 17, 1.8, 0, TAU);
      ctx.stroke();
      ctx.fillRect(26.5, -1, 3.5, 2);
      ctx.fillRect(-1, 26.5, 2, 3.5);
      break;
    }
    case 'wave': {
      /* 以角為圓心的三道同心弧（青海波）、角上的圓點、對角線上的小菱形 */
      for (const r of [7, 12.5, 18]) {
        ctx.beginPath();
        ctx.arc(1, 1, r, 0, Math.PI / 2);
        ctx.stroke();
      }
      dot(ctx, 1, 1, 2.6);
      ctx.beginPath();
      ctx.moveTo(19.5, 16.5);
      ctx.lineTo(22.5, 19.5);
      ctx.lineTo(19.5, 22.5);
      ctx.lineTo(16.5, 19.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'gothic': {
      ctx.beginPath();
      ctx.moveTo(0, 31);
      ctx.lineTo(0, 0);
      ctx.lineTo(31, 0);
      ctx.stroke();
      /* 兩端的尖刺 */
      ctx.beginPath();
      ctx.moveTo(31, -2.6);
      ctx.lineTo(36, 0);
      ctx.lineTo(31, 2.6);
      ctx.closePath();
      ctx.moveTo(-2.6, 31);
      ctx.lineTo(0, 36);
      ctx.lineTo(2.6, 31);
      ctx.closePath();
      ctx.fill();
      quatrefoil(ctx, 12.5, 12.5, 3);
      ctx.stroke();
      dot(ctx, 12.5, 12.5, 1.2);
      ctx.beginPath();
      ctx.moveTo(2.5, 2.5);
      ctx.lineTo(6.6, 6.6);
      ctx.stroke();
      break;
    }
    case 'pixel': {
      const s = 4;
      const cells: [number, number][] = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [1, 1],
        [2, 1],
        [1, 2],
        [6, 0],
        [0, 6],
      ];
      for (const [cx, cy] of cells) ctx.fillRect(cx * s, cy * s, s - 0.5, s - 0.5);
      break;
    }
  }
  ctx.restore();
}

/** 大框（訊息框、留言板）上下緣中央的紋章；k＝大小倍率 */
export function drawCrest(ctx: Ctx, type: Ornament, cx: number, cy: number, k: number): void {
  if (type === 'none' || k <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /* 兩側的細線 */
  ctx.beginPath();
  ctx.moveTo(-46, 0);
  ctx.lineTo(-13, 0);
  ctx.moveTo(13, 0);
  ctx.lineTo(46, 0);
  ctx.stroke();
  switch (type) {
    case 'classic':
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(6.5, 0);
      ctx.lineTo(0, 6.5);
      ctx.lineTo(-6.5, 0);
      ctx.closePath();
      ctx.fill();
      dot(ctx, -10, 0, 1.6);
      dot(ctx, 10, 0, 1.6);
      break;
    case 'star':
      star(ctx, 0, 0, 7, 2.9);
      ctx.fill();
      break;
    case 'circuit':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = Math.cos(a) * 6;
        const y = Math.sin(a) * 6;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillRect(-1.5, -1.5, 3, 3);
      break;
    case 'wave':
      for (const r of [3.5, 7]) {
        ctx.beginPath();
        ctx.arc(0, 2, r, Math.PI, 0);
        ctx.stroke();
      }
      dot(ctx, 0, 2, 1.4);
      break;
    case 'gothic':
      ctx.fillRect(-1.3, -8, 2.6, 16);
      ctx.fillRect(-5.5, -4, 11, 2.6);
      break;
    case 'pixel':
      ctx.fillRect(-7, -2, 3.5, 3.5);
      ctx.fillRect(-1.75, -2, 3.5, 3.5);
      ctx.fillRect(3.5, -2, 3.5, 3.5);
      break;
  }
  ctx.restore();
}

/* ---------- 翻頁游標（畫在原點，約 ±14） ---------- */

export function drawCursorShape(ctx: Ctx, shape: CursorShape, color: string, accent: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (shape) {
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(12.5, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-12.5, 0);
      ctx.closePath();
      ctx.lineWidth = 1.4;
      ctx.stroke();
      break;
    }
    case 'quill': {
      ctx.beginPath();
      ctx.moveTo(-8, 11);
      ctx.bezierCurveTo(-6, -1, 3, -10, 12, -13);
      ctx.bezierCurveTo(10, -3, 2, 6, -8, 11);
      ctx.closePath();
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, 14);
      ctx.lineTo(7, -6);
      ctx.moveTo(0, 0);
      ctx.lineTo(5, 1);
      ctx.moveTo(-3, 4);
      ctx.lineTo(1, 5.5);
      ctx.stroke();
      break;
    }
    case 'crystal': {
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(8, -6);
      ctx.lineTo(8, 4);
      ctx.lineTo(0, 14);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(0, -2);
      ctx.lineTo(8, -6);
      ctx.moveTo(0, -2);
      ctx.lineTo(0, 14);
      ctx.stroke();
      break;
    }
    case 'chevron': {
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-10, -9);
      ctx.lineTo(0, 0);
      ctx.lineTo(10, -9);
      ctx.moveTo(-10, 1);
      ctx.lineTo(0, 10);
      ctx.lineTo(10, 1);
      ctx.stroke();
      break;
    }
    case 'pixel': {
      /* 往下的三角形，一格 4 px；左上角一格亮色 */
      const s = 4;
      const rows: [number, number][] = [
        [-8, 5],
        [-4, 3],
        [0, 1],
      ];
      for (const [y, n] of rows)
        for (let j = 0; j < n; j++) ctx.fillRect(-(n * s) / 2 + j * s, y, s - 0.4, s - 0.4);
      ctx.fillStyle = accent;
      ctx.fillRect(-(5 * s) / 2, -8, s - 0.4, s - 0.4);
      break;
    }
  }
  ctx.restore();
}

/* ---------- 質感 ---------- */

/** 固定種子的亂數（同樣的設定每次畫出一樣的圖樣） */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type CanvasMaker = (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;

/** 質感一格的大小（px，以 1920 寬為準） */
export const TEXTURE_TILE: Record<Exclude<Texture, 'none'>, number> = {
  noise: 64,
  dots: 14,
  lines: 10,
  washi: 48,
  grid: 16,
};

/** 畫一格質感（透明底、tint 色） */
export function textureTile(
  type: Exclude<Texture, 'none'>,
  tint: string,
  make: CanvasMaker,
): HTMLCanvasElement | OffscreenCanvas {
  const n = TEXTURE_TILE[type];
  const c = make(n, n);
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) return c;
  ctx.fillStyle = tint;
  ctx.strokeStyle = tint;
  switch (type) {
    case 'noise': {
      const rnd = seeded(20261027);
      for (let i = 0; i < 520; i++) {
        const x = Math.floor(rnd() * n);
        const y = Math.floor(rnd() * n);
        const s = rnd() < 0.25 ? 2 : 1;
        ctx.globalAlpha = 0.45 + rnd() * 0.55;
        ctx.fillRect(x, y, s, s);
      }
      break;
    }
    case 'dots': {
      ctx.beginPath();
      ctx.arc(3.5, 3.5, 1.35, 0, TAU);
      ctx.arc(10.5, 10.5, 1.35, 0, TAU);
      ctx.fill();
      break;
    }
    case 'lines': {
      /* 往右下的斜線（含跨過格子邊緣的兩段，接起來不斷） */
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(n + 2, n + 2);
      ctx.moveTo(-2, n - 2);
      ctx.lineTo(2, n + 2);
      ctx.moveTo(n - 2, -2);
      ctx.lineTo(n + 2, 2);
      ctx.stroke();
      break;
    }
    case 'washi': {
      const rnd = seeded(7031);
      ctx.lineWidth = 0.7;
      ctx.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const x = rnd() * n;
        const y = rnd() * n;
        const len = 6 + rnd() * 9;
        const a = rnd() * Math.PI;
        const bend = (rnd() - 0.5) * 6;
        ctx.globalAlpha = 0.5 + rnd() * 0.5;
        /* 跨過邊緣的纖維在對面再畫一次，接縫看不出來 */
        for (const [ox, oy] of [
          [0, 0],
          [-n, 0],
          [0, -n],
          [-n, -n],
        ]) {
          const x0 = x + ox;
          const y0 = y + oy;
          const x1 = x0 + Math.cos(a) * len;
          const y1 = y0 + Math.sin(a) * len;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(
            (x0 + x1) / 2 - Math.sin(a) * bend,
            (y0 + y1) / 2 + Math.cos(a) * bend,
            x1,
            y1,
          );
          ctx.stroke();
        }
      }
      break;
    }
    case 'grid': {
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0.3, 0);
      ctx.lineTo(0.3, n);
      ctx.moveTo(0, 0.3);
      ctx.lineTo(n, 0.3);
      ctx.stroke();
      break;
    }
  }
  return c;
}
