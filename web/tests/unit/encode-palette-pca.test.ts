import { describe, expect, it } from 'vitest';
import { buildPalette, ColorStats, type PaletteMethod, principalAxis } from '@/core/encode/palette';

/**
 * 主成分切割（paletteMethod: 'pca'，cutin 用）。測試畫面和 cutin 對等驗證失敗的畫面同一類：
 * 大片單色（白、深色）＋上暗下亮的彩虹＋金屬色條紋（不透明），加上明滅的半透明彩虹線條
 * （每列色相不同、alpha 20～250）。預設的 median-cut 在這種畫面把幾乎所有名額給了不透明的顏色，
 * 半透明的線條只剩幾色（cutin 舊版用的 UPNG.js 依分散量分配，不會這樣）。
 */
const W = 160;
const H = 120;

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const METAL: [number, number, number][] = [
  [90, 60, 10],
  [250, 220, 120],
  [190, 150, 50],
  [255, 245, 200],
  [110, 70, 10],
  [60, 40, 5],
];

/** 第 t 格（彩虹每格往左流動 1/frames 圈） */
function frame(t: number, frames: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, [r, g, b]: number[], a: number) => {
    const i = (y * W + x) * 4;
    /* 和 canvas 的 getImageData 一樣：半透明的 RGB 是預乘後再除回來的值 */
    const k = a / 255;
    px[i] = Math.round(Math.round(r * k) / k);
    px[i + 1] = Math.round(Math.round(g * k) / k);
    px[i + 2] = Math.round(Math.round(b * k) / k);
    px[i + 3] = a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hue = ((x / W + t / frames) * 360) % 360;
      if (y < 30) put(x, y, [255, 255, 255], 255);
      else if (y < 45) put(x, y, [23, 19, 31], 255);
      else if (y < 70) put(x, y, hsl(hue, 1, 0.35 + (y - 45) / 60), 255);
      else if (y < 76) put(x, y, METAL[y - 70], 255);
      else
        put(x, y, hsl((hue + (y - 76) * 7) % 360, 1, 0.6), Math.round(20 + ((y - 76) / 44) * 230));
    }
  }
  return px;
}

const FRAMES = 4;
const frames = Array.from({ length: FRAMES }, (_, t) => frame(t, FRAMES));

function quantized(method: PaletteMethod, maxColors: number) {
  const stats = new ColorStats(maxColors);
  for (const f of frames) {
    const u = new Uint32Array(f.buffer);
    stats.add(u, 0, u.length);
  }
  const pal = buildPalette(stats, maxColors, method);
  const out = frames.map((f) => {
    const u = new Uint32Array(f.buffer);
    const o = new Uint8Array(f.length);
    for (let i = 0; i < u.length; i++)
      o.set(pal.colors.subarray(pal.indexOf(u[i]) * 4, pal.indexOf(u[i]) * 4 + 4), i * 4);
    return o;
  });
  return { pal, out };
}

/** 驗證者的量法：兩邊 alpha ≥ 128 的像素，|ΔR|＋|ΔG|＋|ΔB| 的平均與「> 60」的比例（各格平均／最差格） */
function error(out: Uint8Array[]) {
  let mean = 0;
  let worst = 0;
  out.forEach((o, k) => {
    const f = frames[k];
    let s = 0;
    let n = 0;
    let big = 0;
    for (let i = 0; i < f.length; i += 4) {
      if (f[i + 3] < 128 || o[i + 3] < 128) continue;
      const d =
        Math.abs(f[i] - o[i]) + Math.abs(f[i + 1] - o[i + 1]) + Math.abs(f[i + 2] - o[i + 2]);
      s += d;
      n++;
      if (d > 60) big++;
    }
    mean += s / n / out.length;
    worst = Math.max(worst, big / n);
  });
  return { mean, worst };
}

describe('principalAxis（4×4 對稱矩陣的最大特徵向量）', () => {
  it('C·v＝λ·v、λ 是最大的特徵值、v 是單位向量', () => {
    const m = [4, 1, 0.5, 0, 1, 3, 0.2, 0.1, 0.5, 0.2, 2, 0.3, 0, 0.1, 0.3, 1];
    const { value, axis } = principalAxis(m);
    expect(Math.hypot(...axis)).toBeCloseTo(1, 10);
    for (let i = 0; i < 4; i++) {
      const cv =
        m[i * 4] * axis[0] +
        m[i * 4 + 1] * axis[1] +
        m[i * 4 + 2] * axis[2] +
        m[i * 4 + 3] * axis[3];
      expect(cv).toBeCloseTo(value * axis[i], 8);
    }
    /* 最大：任何單位向量的 vᵀCv 都不超過 λ */
    for (const v of [
      [1, 0, 0, 0],
      [0.5, 0.5, 0.5, 0.5],
      [0.7, -0.7, 0.1, 0],
    ]) {
      const n = Math.hypot(...v);
      let q = 0;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) q += (v[i] / n) * m[i * 4 + j] * (v[j] / n);
      expect(q).toBeLessThanOrEqual(value + 1e-9);
    }
  });

  it('主軸和 (1,1,1,1) 垂直時也找得到（不靠迭代的起點）', () => {
    /* 只沿 (1,−1,0,0) 分散 */
    const m = [1, -1, 0, 0, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { value, axis } = principalAxis(m);
    expect(value).toBeCloseTo(2, 10);
    expect(Math.abs(axis[0])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(axis[0] * axis[1]).toBeLessThan(0);
  });
});

describe("減色：主成分切割（'pca'）", () => {
  it('原色數在上限以內時和預設方法一樣直接用原色（無損）', () => {
    const stats = new ColorStats(256);
    const u = new Uint32Array([0, 0xff0000ff, 0x80ffffff, 0xff00ff00]);
    stats.add(u, 0, u.length);
    const a = buildPalette(stats, 256, 'pca');
    const b = buildPalette(stats, 256);
    expect(a.lossless).toBe(true);
    expect(a.colors).toEqual(b.colors);
  });

  it('不透明的像素只對應到不透明的顏色、半透明的只對應到半透明的、完全透明是 0 號', () => {
    for (const maxColors of [256, 64]) {
      const { pal } = quantized('pca', maxColors);
      expect(pal.lossless).toBe(false);
      expect(pal.count).toBeLessThanOrEqual(maxColors);
      expect([...pal.colors.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
      for (const f of frames) {
        const u = new Uint32Array(f.buffer);
        for (let i = 0; i < u.length; i++) {
          const a = u[i] >>> 24;
          const pa = pal.colors[pal.indexOf(u[i]) * 4 + 3];
          if (a === 0) expect(pal.indexOf(u[i])).toBe(0);
          else if (a === 255) expect(pa).toBe(255);
          else expect(pa).toBeLessThan(255);
        }
      }
    }
  });

  it('名額依分散量分配：半透明的線條也分得到顏色，誤差遠小於 median-cut（256 色、64 色）', () => {
    const translucent = (method: PaletteMethod, maxColors: number) => {
      const { pal } = quantized(method, maxColors);
      let n = 0;
      for (let i = 1; i < pal.count; i++) if (pal.colors[i * 4 + 3] < 255) n++;
      return n;
    };
    /* median-cut 只給半透明幾色；pca 給到三成以上 */
    expect(translucent('median-cut', 256)).toBeLessThan(10);
    expect(translucent('pca', 256)).toBeGreaterThan(80);
    expect(translucent('pca', 64)).toBeGreaterThan(20);

    const p256 = error(quantized('pca', 256).out);
    const m256 = error(quantized('median-cut', 256).out);
    const p64 = error(quantized('pca', 64).out);
    const m64 = error(quantized('median-cut', 64).out);
    /* 實測：pca 256 色 10.0／0%、64 色 23.0／12%；median-cut 59.7／35%、69.1／44% */
    expect(p256.mean).toBeLessThan(12);
    expect(p256.worst).toBeLessThan(0.005);
    expect(p64.mean).toBeLessThan(26);
    expect(p256.mean * 4).toBeLessThan(m256.mean);
    expect(p64.mean * 2).toBeLessThan(m64.mean);
  });

  it('同樣的輸入每次得到同樣的調色盤', () => {
    const a = quantized('pca', 128).pal;
    const b = quantized('pca', 128).pal;
    expect(a.colors).toEqual(b.colors);
  });
});
