/**
 * 外框的質感（石材、刮痕金屬、鎚目、木紋、液體、能量）：程式產生的 512 × 512 雜訊圖（token-workshop 的做法，MIT），
 * 疊在外框上（能量以外用 overlay 混合；能量是有自己顏色的電光）。
 *
 * - `texturePixels(type, seed, N)`：純函式，回傳 RGBA（同樣的參數每次相同）。
 * - 瀏覽器裡產生要約 0.1～0.3 秒：`requestTexture` 分段產生（每段約 9 ms，畫面不會卡住），好了以後通知重畫；
 *   匯出前用 `ensureTexture` 等它好。
 */
import { makeCanvas } from '@/core/image';
import type { Ctx2D } from './frames';
import { hash3 } from './frames';
import type { TextureId } from './model';

export const TEXTURE_SIZE = 512;
const TAU = Math.PI * 2;

function valueNoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, s);
  const b = hash3(xi + 1, yi, s);
  const c = hash3(xi, yi + 1, s);
  const d = hash3(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 四層的碎形雜訊（0～1） */
function fbm(x0: number, y0: number, s: number): number {
  let t = 0;
  let a = 0.5;
  let x = x0;
  let y = y0;
  for (let i = 0; i < 4; i++) {
    t += a * valueNoise(x, y, s + i);
    x = x * 2 + 17;
    y = y * 2 + 31;
    a /= 2;
  }
  return t / 0.9375;
}

/** 一個像素的顏色（u、v＝0～1；px、py＝像素座標） */
function texel(
  type: Exclude<TextureId, 'none'>,
  u: number,
  v: number,
  px: number,
  py: number,
  seed: number,
): [number, number, number] {
  switch (type) {
    case 'stone': {
      const t = fbm(u * 6, v * 6, seed);
      const m = fbm(u * 22 + 5, v * 22, seed + 2);
      const grain = hash3(px, py, seed) - 0.5;
      const speck = valueNoise(u * 140, v * 140, seed + 4);
      const crack = (1 - Math.abs(2 * fbm(u * 4 + t * 1.5, v * 4 + t * 1.5, seed + 9) - 1)) ** 24;
      const pit = valueNoise(u * 64, v * 64, seed + 6) ** 10;
      const L =
        128 +
        (t - 0.5) * 80 +
        (m - 0.5) * 70 +
        grain * 60 +
        (speck - 0.5) * 50 -
        crack * 130 -
        pit * 90;
      return [L, L, L * 1.02];
    }
    case 'scratched': {
      const a = valueNoise(u * 4, v * 420, seed);
      const b = valueNoise(u * 9 + 3, v * 700, seed + 1);
      const c = fbm(u * 3, v * 3, seed + 2);
      const L = 128 + (a - 0.5) * 80 + (b - 0.5) * 55 + (c - 0.5) * 50;
      return [L, L, L * 1.03];
    }
    case 'hammered': {
      /* 打出來的凹痕：最近的格點（Worley）當凹面，邊緣暗一圈 */
      const G = 9;
      const gx = u * G;
      const gy = v * G;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      let best = 9;
      let bx = 0;
      let by = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const cx = ix + i;
          const cy = iy + j;
          const dx = gx - (cx + hash3(cx, cy, seed) * 0.8 + 0.1);
          const dy = gy - (cy + hash3(cx, cy, seed + 1) * 0.8 + 0.1);
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            bx = dx;
            by = dy;
          }
        }
      const r = Math.sqrt(best);
      const R0 = 0.62;
      let L = 128 + (hash3(px, py, seed) - 0.5) * 26 + (fbm(u * 10, v * 10, seed + 3) - 0.5) * 40;
      if (r < R0) L += (((bx + by) * 0.7) / R0) * 120 * (r / R0 > 0.2 ? 1 : (r / R0) * 5);
      L -= 60 * Math.exp(-(((r - R0) / 0.07) ** 2));
      return [L, L, L];
    }
    case 'wood': {
      const w = fbm(u * 2.2, v * 50, seed);
      const q = fbm(u * 5, v * 5, seed + 3);
      const ring = Math.sin((v * 26 + q * 2.4 + w * 1.2) * TAU) * 0.5 + 0.5;
      const fine = valueNoise(u * 8, v * 300, seed + 5);
      const L = 128 + (ring - 0.5) * 80 + (fine - 0.5) * 50 + (w - 0.5) * 50;
      return [L * 1.05, L, L * 0.9];
    }
    case 'liquid': {
      const q = fbm(u * 4, v * 4, seed);
      const w = fbm(u * 4 + q * 3 + 1.7, v * 4 + q * 3 + 9.2, seed + 3);
      const L = 128 + Math.sin(w * Math.PI * 5) * 105;
      return [L * 0.92, L, Math.min(255, L * 1.08)];
    }
    default: {
      /* 能量：兩組細細的脊線（電光） */
      const q = fbm(u * 5, v * 5, seed);
      const e = 1 - Math.abs(2 * fbm(u * 7 + q * 2, v * 7 + q * 2, seed + 5) - 1);
      const e2 = 1 - Math.abs(2 * fbm(u * 13 - q * 3, v * 13, seed + 11) - 1);
      const k = Math.min(1, e ** 20 * 1.3 + e2 ** 26 * 0.7) * 255;
      return [k, k, k];
    }
  }
}

/** 一列像素（能量：白色＋透明度；其他：不透明的灰） */
function fillRow(
  type: Exclude<TextureId, 'none'>,
  seed: number,
  py: number,
  out: Uint8ClampedArray,
  N: number,
): void {
  const v = py / N;
  const energy = type === 'energy';
  for (let px = 0; px < N; px++) {
    const [r, g, b] = texel(type, px / N, v, px, py, seed);
    const i = (py * N + px) * 4;
    if (energy) {
      out[i] = out[i + 1] = out[i + 2] = 255;
      out[i + 3] = 255 * Math.min(1, Math.max(0, (r / 255 - 0.2) / 0.2));
    } else {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
}

/** 整張質感的 RGBA（純函式） */
export function texturePixels(
  type: Exclude<TextureId, 'none'>,
  seed: number,
  N = TEXTURE_SIZE,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) fillRow(type, seed, y, out, N);
  return out;
}

/** 刮痕金屬另外畫上長短不一的刮痕與深溝（決定性的亂數） */
function scratches(ctx: Ctx2D, N: number, seed: number): void {
  let s = (seed * 9301 + 49297) >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 340; i++) {
    const a = rnd() < 0.62 ? (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * Math.PI;
    const len = 14 + rnd() * rnd() * 340;
    const cx = rnd() * N;
    const cy = rnd() * N;
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    const al = 0.06 + rnd() * 0.3;
    ctx.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${al})` : `rgba(0,0,0,${al})`;
    ctx.lineWidth = 0.5 + rnd() * 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = (rnd() - 0.5) * 1.2;
    const len = 40 + rnd() * 130;
    const cx = rnd() * N;
    const cy = rnd() * N;
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    ctx.lineWidth = 1.8 + rnd() * 1.6;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy + 1.6);
    ctx.lineTo(cx + dx, cy + dy + 1.6);
    ctx.stroke();
  }
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function toCanvas(
  type: Exclude<TextureId, 'none'>,
  seed: number,
  px: Uint8ClampedArray,
): AnyCanvas {
  const N = TEXTURE_SIZE;
  const cv = makeCanvas(N, N);
  const ctx = cv.getContext('2d') as Ctx2D;
  const img = ctx.createImageData(N, N);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  if (type === 'scratched') scratches(ctx, N, seed);
  return cv;
}

/* ---------- 快取與分段產生 ---------- */

const cache = new Map<string, AnyCanvas>();
const jobs = new Map<string, Promise<AnyCanvas>>();
const listeners = new Set<() => void>();
const keyOf = (type: TextureId, seed: number) => `${type}:${seed}`;
const CACHE_MAX = 10;

function remember(key: string, cv: AnyCanvas): void {
  cache.set(key, cv);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

/** 已經產生好的質感（還沒好時 null） */
export function peekTexture(type: TextureId, seed: number): AnyCanvas | null {
  if (type === 'none') return null;
  return cache.get(keyOf(type, seed)) ?? null;
}

/** 質感產生好時通知（重畫預覽）；回傳取消函式 */
export function onTextureReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 等質感產生好（瀏覽器裡分段、不卡畫面；沒有 setTimeout 的環境一次做完） */
export function ensureTexture(type: TextureId, seed: number): Promise<AnyCanvas | null> {
  if (type === 'none') return Promise.resolve(null);
  const key = keyOf(type, seed);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = jobs.get(key);
  if (running) return running;
  const t = type as Exclude<TextureId, 'none'>;
  const N = TEXTURE_SIZE;
  const out = new Uint8ClampedArray(N * N * 4);
  const job = new Promise<AnyCanvas>((resolve, reject) => {
    let y = 0;
    const step = () => {
      try {
        const t0 = performance.now();
        while (y < N && performance.now() - t0 < 9) fillRow(t, seed, y++, out, N);
        if (y < N) {
          setTimeout(step, 0);
          return;
        }
        const cv = toCanvas(t, seed, out);
        remember(key, cv);
        jobs.delete(key);
        resolve(cv);
        for (const fn of listeners) fn();
      } catch (e) {
        jobs.delete(key);
        reject(e);
      }
    };
    step();
  });
  jobs.set(key, job);
  return job;
}

/** 預覽用：有就給，沒有就開始產生（好了會通知）並先回傳 null */
export function requestTexture(type: TextureId, seed: number): AnyCanvas | null {
  const hit = peekTexture(type, seed);
  if (hit || type === 'none') return hit;
  void ensureTexture(type, seed).catch(() => undefined);
  return null;
}
