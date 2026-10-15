/**
 * 卡片底的紋理（規格 F6x、5. D 項）：紙張、顆粒、皺紙、方格、點格、橫線。
 * 全部用程式產生（本站自己設計的做法，沒有用到原作的素材）：一塊可以無縫重複的小圖（RGBA），
 * 在卡片上用 repeat 鋪滿。同樣的設定每次產生完全相同的圖（決定性亂數），預覽與匯出一致。
 *
 * - 淺色底：紋理用深色的「墨」疊上去（顆粒、纖維、陰影）。
 * - 深色底（亮度 ≤ 0.45）且開了「深色底自動加強」：改用淺色的墨，並依底色有多暗加深（深色底上深色的紋理看不見）。
 * - 皺紙另外有亮面（淺色底上是白、深色底上是黑），做出凹凸。
 *
 * textureTile 是純函式（Node 的單元測試可以跑）；texturePattern 只在瀏覽器用（建立 canvas）。
 */
import { parseColor } from '@/core/color';
import { hashUnit } from '@/core/timeline';
import type { CardStyle, TextureId } from './model';

export interface TextureTile {
  width: number;
  height: number;
  /** RGBA（非預乘） */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** 感知亮度 0～1 */
export function luminance(color: string): number {
  const c = parseColor(color) ?? { r: 255, g: 255, b: 255, a: 1 };
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

/** 深色底的門檻（感知亮度） */
export const DARK_THRESHOLD = 0.45;

export interface TextureInk {
  /** 用淺色的墨（深色底自動加強） */
  light: boolean;
  /** 不透明度的倍數（含強度與深色加強） */
  gain: number;
}

/** 依底色、強度與「深色底自動加強」決定墨的顏色與濃淡 */
export function textureInk(card: Pick<CardStyle, 'color' | 'strength' | 'darkBoost'>): TextureInk {
  const lum = luminance(card.color);
  const s = card.strength / 100;
  if (card.darkBoost && lum <= DARK_THRESHOLD) {
    /* 越暗加得越多：門檻上 ×1.35，全黑 ×1.95 */
    const depth = Math.min(1, Math.max(0, (DARK_THRESHOLD - lum) / DARK_THRESHOLD));
    return { light: true, gain: s * (1.35 + depth * 0.6) };
  }
  return { light: false, gain: s };
}

/* ---------- 可以無縫重複的雜訊 ---------- */

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 週期 period 格的值雜訊（座標 0～1 對應整塊圖；回傳 0～1） */
function valueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const at = (i: number, j: number) =>
    hashUnit(seed, ((i % period) + period) % period, ((j % period) + period) % period);
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 幾層雜訊疊起來（每層週期加倍、幅度減半），回傳 0～1 */
function fbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = base;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u, v, p, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

/* ---------- 各種紋理的「濃度」：正＝墨、負＝亮面，範圍約 -1～1 ---------- */

type Field = { size: [number, number]; at: (x: number, y: number) => number };

function paperField(): Field {
  const N = 256;
  /* 纖維：很多條短的斜線，用重複的方式畫進一張表（超出邊緣的從另一邊接回來） */
  const fiber = new Float32Array(N * N);
  for (let k = 0; k < 100; k++) {
    let x = hashUnit(11, k, 1) * N;
    let y = hashUnit(11, k, 2) * N;
    const len = 8 + hashUnit(11, k, 3) * 30;
    let ang = (hashUnit(11, k, 4) - 0.5) * 1.2;
    const strength = 0.15 + hashUnit(11, k, 5) * 0.25;
    for (let s = 0; s < len; s++) {
      const ix = ((Math.round(x) % N) + N) % N;
      const iy = ((Math.round(y) % N) + N) % N;
      fiber[iy * N + ix] = Math.max(fiber[iy * N + ix], strength);
      ang += (hashUnit(13, k, s) - 0.5) * 0.25;
      x += Math.cos(ang);
      y += Math.sin(ang) * 0.6;
    }
  }
  return {
    size: [N, N],
    at: (x, y) => {
      const u = x / N;
      const v = y / N;
      /* 紙漿的深淺（低頻）＋細的顆粒＋纖維 */
      const mottle = fbm(u, v, 4, 4, 21) - 0.45;
      const fine = (hashUnit(23, x, y) - 0.5) * 0.35;
      return Math.max(0, mottle * 0.9 + fine * 0.6 + fiber[y * N + x]);
    },
  };
}

function grainField(): Field {
  const N = 256;
  return {
    size: [N, N],
    at: (x, y) => {
      const h = hashUnit(31, x, y);
      const speck = h > 0.88 ? (h - 0.88) / 0.12 : 0;
      const blotch = Math.max(0, fbm(x / N, y / N, 8, 3, 33) - 0.5) * 1.2;
      return Math.min(1, speck * 0.65 + blotch + (hashUnit(37, x, y) - 0.5) * 0.12);
    },
  };
}

function crumpleField(): Field {
  const N = 256;
  /* 摺痕：脊狀雜訊（1 − |2n − 1|）當作高度，再用斜上方的光算明暗 */
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const r1 = 1 - Math.abs(2 * fbm(u, v, 3, 3, 41) - 1);
      const r2 = 1 - Math.abs(2 * fbm(u, v, 6, 2, 43) - 1);
      hgt[y * N + x] = r1 * 0.7 + r2 * 0.3;
    }
  const H = (x: number, y: number) => hgt[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  return {
    size: [N, N],
    at: (x, y) => {
      const dx = H(x + 1, y) - H(x - 1, y);
      const dy = H(x, y + 1) - H(x, y - 1);
      /* 光從左上來：朝光的面亮（負）、背光的面暗（正） */
      return Math.max(-1, Math.min(1, (dx + dy) * 9));
    },
  };
}

function gridField(): Field {
  const N = 200;
  const cell = 20;
  return { size: [N, N], at: (x, y) => (x % cell === 0 || y % cell === 0 ? 0.55 : 0) };
}

function dotsField(): Field {
  const N = 192;
  const cell = 16;
  return {
    size: [N, N],
    at: (x, y) => {
      const dx = (x % cell) - cell / 2 + 0.5;
      const dy = (y % cell) - cell / 2 + 0.5;
      const d = Math.hypot(dx, dy);
      return d <= 1.1 ? 0.8 : d <= 1.9 ? (0.8 * (1.9 - d)) / 0.8 : 0;
    },
  };
}

function linesField(): Field {
  const N = 224;
  const gap = 28;
  return { size: [N, N], at: (_x, y) => (y % gap === gap - 1 ? 0.5 : 0) };
}

/** 每種紋理的基本濃度（強度 100 時的倍數） */
const BASE_GAIN: Record<Exclude<TextureId, 'none'>, number> = {
  paper: 0.32,
  grain: 0.3,
  crumple: 0.42,
  grid: 0.4,
  dots: 0.45,
  lines: 0.42,
};

const FIELDS: Record<Exclude<TextureId, 'none'>, () => Field> = {
  paper: paperField,
  grain: grainField,
  crumple: crumpleField,
  grid: gridField,
  dots: dotsField,
  lines: linesField,
};

/** 產生一塊紋理小圖（RGBA）。沒有紋理或強度 0 時 null。 */
export function textureTile(kind: TextureId, ink: TextureInk): TextureTile | null {
  if (kind === 'none' || ink.gain <= 0) return null;
  const field = FIELDS[kind]();
  const [w, h] = field.size;
  const data = new Uint8ClampedArray(w * h * 4);
  const gain = ink.gain * BASE_GAIN[kind];
  /* 墨：淺色底用暖的深褐，深色底用米白；亮面相反 */
  const inkRgb = ink.light ? [242, 234, 220] : [58, 46, 34];
  const hiRgb = ink.light ? [0, 0, 0] : [255, 255, 255];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = field.at(x, y);
      const i = (y * w + x) * 4;
      if (v > 0) {
        data[i] = inkRgb[0];
        data[i + 1] = inkRgb[1];
        data[i + 2] = inkRgb[2];
        data[i + 3] = Math.round(255 * Math.min(1, v * gain));
      } else if (v < 0) {
        data[i] = hiRgb[0];
        data[i + 1] = hiRgb[1];
        data[i + 2] = hiRgb[2];
        data[i + 3] = Math.round(255 * Math.min(1, -v * gain * 0.7));
      }
    }
  return { width: w, height: h, data };
}

/* ---------- 瀏覽器：小圖 → canvas（快取）→ 重複鋪滿用的 pattern ---------- */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const tiles = new Map<string, AnyCanvas | null>();

function makeCanvas(w: number, h: number): AnyCanvas | null {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/** 紋理小圖的 canvas（同樣的設定只產生一次）；不能建立 canvas 的環境回傳 null */
export function textureCanvas(card: CardStyle): AnyCanvas | null {
  if (card.texture === 'none') return null;
  const ink = textureInk(card);
  const key = `${card.texture}|${ink.light ? 1 : 0}|${ink.gain.toFixed(4)}`;
  if (tiles.has(key)) return tiles.get(key) ?? null;
  const tile = textureTile(card.texture, ink);
  let canvas: AnyCanvas | null = null;
  if (tile) {
    canvas = makeCanvas(tile.width, tile.height);
    const ctx = canvas?.getContext('2d') as CanvasRenderingContext2D | null | undefined;
    if (canvas && ctx && typeof ImageData !== 'undefined') {
      ctx.putImageData(new ImageData(tile.data, tile.width, tile.height), 0, 0);
    } else canvas = null;
  }
  if (tiles.size > 24) tiles.clear();
  tiles.set(key, canvas);
  return canvas;
}
