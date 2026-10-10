/**
 * core/image 的多色背景（colorkey.ts）與遮罩的色階（mask.ts）：
 * - 背景色可以有好幾個，兩個背景色之間的混色也可以算背景（到兩色連線的距離）；
 * - 只有一個背景色時，色鍵、去色邊的結果和原本（單色）逐位元組相同；
 * - 四邊常見的顏色（給「建議的背景色」用）；
 * - 色階：≤ lo → 0、≥ hi → 255、中間線性。
 */
import { describe, expect, it } from 'vitest';
import {
  borderColors,
  COLOR_DISTANCE_MAX,
  colorDistance,
  colorKeyMask,
  decontaminate,
  keyAlpha,
  keyDistance,
  levelsMask,
  nearestKeyColor,
  type Rgb,
} from '@/core/image';

/** 決定性的亂數 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 2 ** 32;
  };
}

function rgbaOf(w: number, h: number, paint: (x: number, y: number) => number[]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(paint(x, y), (y * w + x) * 4);
  return px;
}

/**
 * 單色色鍵照規格 3.2 逐點算（多色功能加進來之前的定義）：差 ≤ 容許度 0、≥ 容許度＋柔邊 255、中間線性；
 * 原圖透明 0；connected 時從四邊四連通找「值 < 255」的像素，找到的用上面的值，其餘 255。
 */
function bruteSingleKey(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  color: Rgb,
  tol: number,
  soft: number,
  connected: boolean,
) {
  const n = w * h;
  const key = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const d =
      (Math.sqrt(
        (rgba[p] - color[0]) ** 2 + (rgba[p + 1] - color[1]) ** 2 + (rgba[p + 2] - color[2]) ** 2,
      ) /
        COLOR_DISTANCE_MAX) *
      100;
    key[i] =
      rgba[p + 3] === 0
        ? 0
        : d <= tol
          ? 0
          : soft <= 0 || d >= tol + soft
            ? 255
            : Math.round(((d - tol) / soft) * 255);
  }
  if (!connected) return key;
  const out = new Uint8Array(n).fill(255);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && key[i] < 255) {
      seen[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop() as number;
    out[i] = key[i];
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || seen[j] || key[j] >= 255) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return out;
}

/** 白底（左）與紫底（右），中間一段從白到紫的漸層；中央一塊橘色（角色） */
function twoTone(w = 60, h = 30) {
  const white = [255, 255, 255];
  const purple = [144, 120, 153];
  return rgbaOf(w, h, (x, y) => {
    if (x >= 26 && x < 34 && y >= 10 && y < 20) return [230, 130, 50, 255];
    const t = x < 20 ? 0 : x >= 40 ? 1 : (x - 20) / 20;
    return [...white.map((c, k) => Math.round(c + t * (purple[k] - c))), 255];
  });
}

describe('core/image：多個背景色', () => {
  it('一個背景色：keyDistance 和 colorDistance 逐值相同', () => {
    const r = rng(3);
    for (let k = 0; k < 200; k++) {
      const c: Rgb = [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
      const d = keyDistance({ colors: [c], blend: true });
      const p = [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)] as const;
      expect(d(...p)).toBe(colorDistance(p[0], p[1], p[2], c));
    }
  });

  it('多個背景色：到最近的那一色；混色開時也到兩色之間的連線（線段，兩端外面用端點）', () => {
    const white: Rgb = [255, 255, 255];
    const black: Rgb = [0, 0, 0];
    const off = keyDistance({ colors: [white, black] });
    const on = keyDistance({ colors: [white, black], blend: true });
    expect(off(250, 250, 250)).toBe(colorDistance(250, 250, 250, white));
    expect(off(10, 10, 10)).toBe(colorDistance(10, 10, 10, black));
    /* 灰：離兩色都遠，但就在連線上 */
    expect(off(128, 128, 128)).toBeGreaterThan(49);
    expect(on(128, 128, 128)).toBeCloseTo(0, 10);
    /* 離連線的距離（垂直距離） */
    const [r, g, b] = [138, 128, 118];
    const perp = Math.hypot(10, 0, -10) / COLOR_DISTANCE_MAX;
    expect(on(r, g, b)).toBeCloseTo(perp * 100, 10);
    /* 三個顏色：每兩個都連（紅－綠的中間點也是背景） */
    const three = keyDistance({ colors: [white, [255, 0, 0], [0, 255, 0]], blend: true });
    expect(three(128, 128, 0)).toBeCloseTo(colorDistance(128, 128, 0, [127.5, 127.5, 0]), 6);
  });

  it('最近的背景色（去色邊用）：一個顏色時就是它；混色開時是連線上最近的一點', () => {
    const near1 = nearestKeyColor({ colors: [[10, 20, 30]], blend: true });
    expect(near1(200, 100, 50)).toEqual([10, 20, 30]);
    const near = nearestKeyColor({
      colors: [
        [255, 255, 255],
        [0, 0, 0],
      ],
      blend: true,
    });
    const p = near(140, 120, 130);
    expect(p[0]).toBeCloseTo(130, 6);
    expect(p[1]).toBeCloseTo(130, 6);
    expect(p[2]).toBeCloseTo(130, 6);
    const noBlend = nearestKeyColor({
      colors: [
        [255, 255, 255],
        [0, 0, 0],
      ],
    });
    expect(noBlend(140, 120, 130)).toEqual([255, 255, 255]);
    expect(noBlend(100, 120, 110)).toEqual([0, 0, 0]);
  });

  it('只有一個背景色：colorKeyMask 和單色的定義逐位元組相同（亂數的圖、各種設定；extra 空的也一樣）', () => {
    const r = rng(11);
    for (const [w, h] of [
      [17, 13],
      [40, 31],
      [64, 9],
    ] as const) {
      const color: Rgb = [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
      const rgba = rgbaOf(w, h, () => {
        /* 一半接近背景色、一半亂數，偶爾透明 */
        const near = r() < 0.5;
        const c = near
          ? color.map((v) => Math.max(0, Math.min(255, v + Math.round((r() - 0.5) * 60))))
          : [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
        return [...c, r() < 0.05 ? 0 : 255];
      });
      for (const [tol, soft] of [
        [12, 8],
        [0, 0],
        [5, 30],
        [30, 0],
      ] as const) {
        for (const connected of [true, false]) {
          const want = bruteSingleKey(rgba, w, h, color, tol, soft, connected);
          const opts = { color, tolerance: tol, softness: soft, connected };
          expect(colorKeyMask(rgba, w, h, opts), `${w}×${h} ${tol}/${soft}`).toEqual(want);
          expect(colorKeyMask(rgba, w, h, { ...opts, extra: [], blend: true })).toEqual(want);
        }
      }
    }
  });

  it('兩個背景色（白＋紫）：兩邊都去掉；混色開時中間的漸層也去掉，關掉時漸層的中段留著；角色留著', () => {
    const w = 60;
    const rgba = twoTone(w);
    const base = {
      color: [255, 255, 255] as Rgb,
      tolerance: 6,
      softness: 4,
      connected: true,
    };
    const single = colorKeyMask(rgba, w, 30, base);
    const off = colorKeyMask(rgba, w, 30, { ...base, extra: [[144, 120, 153]] });
    const on = colorKeyMask(rgba, w, 30, { ...base, extra: [[144, 120, 153]], blend: true });
    const at = (m: Uint8Array, x: number, y: number) => m[y * w + x];
    expect(at(single, 2, 2)).toBe(0);
    expect(at(single, 55, 2)).toBe(255);
    expect(at(off, 55, 2)).toBe(0);
    expect(at(off, 2, 2)).toBe(0);
    expect(at(off, 30, 2)).toBe(255);
    expect(at(on, 30, 2)).toBe(0);
    for (const m of [single, off, on]) expect(at(m, 30, 15)).toBe(255);
  });

  it('多色時「只去掉和圖邊相連的」照樣：被角色圍住的紫色留著', () => {
    const w = 30;
    const rgba = rgbaOf(w, w, (x, y) => {
      const box = x >= 8 && x < 22 && y >= 8 && y < 22;
      const hole = x >= 12 && x < 18 && y >= 12 && y < 18;
      if (hole) return [144, 120, 153, 255];
      if (box) return [20, 20, 20, 255];
      return x < 15 ? [255, 255, 255, 255] : [144, 120, 153, 255];
    });
    const o = { color: [255, 255, 255] as Rgb, extra: [[144, 120, 153]] as Rgb[], blend: true };
    const conn = colorKeyMask(rgba, w, w, { ...o, tolerance: 5, softness: 0, connected: true });
    const all = colorKeyMask(rgba, w, w, { ...o, tolerance: 5, softness: 0, connected: false });
    expect(conn[0]).toBe(0);
    expect(conn[w - 1]).toBe(0);
    expect(conn[15 * w + 15]).toBe(255);
    expect(all[15 * w + 15]).toBe(0);
    expect(conn[10 * w + 10]).toBe(255);
  });

  it('去色邊（多色）：每個像素用「附近被去掉的像素的平均色」最接近的背景色；左白右紫都還原成前景色', () => {
    /* 紅色以 40% 疊在白上（左半）、疊在紫上（右半）；周圍都是被去掉的背景 */
    const a = 0.4;
    const red = [200, 40, 40];
    const white: Rgb = [255, 255, 255];
    const purple: Rgb = [144, 120, 153];
    const over = (bg: readonly number[]) => red.map((f, c) => Math.round(a * f + (1 - a) * bg[c]));
    const w = 20;
    const h = 10;
    const px = rgbaOf(w, h, (x, y) =>
      y === 5 && x === 5
        ? [...over(white), 255]
        : y === 5 && x === 15
          ? [...over(purple), 255]
          : [...(x < 10 ? white : purple), 255],
    );
    const mask = new Uint8Array(w * h);
    mask[5 * w + 5] = mask[5 * w + 15] = Math.round(a * 255);
    /* 40% 的紅疊在白上，顏色反而比較接近紫色：只看這個像素自己會選錯 */
    expect(colorDistance(...(over(white) as [number, number, number]), purple)).toBeLessThan(
      colorDistance(...(over(white) as [number, number, number]), white),
    );
    const out = decontaminate(px, mask, { colors: [white, purple] }, { width: w, height: h });
    for (const k of [(5 * w + 5) * 4, (5 * w + 15) * 4]) {
      expect(Math.abs(out[k] - 200), `${k}`).toBeLessThanOrEqual(3);
      expect(Math.abs(out[k + 1] - 40)).toBeLessThanOrEqual(3);
      expect(Math.abs(out[k + 2] - 40)).toBeLessThanOrEqual(3);
    }
  });

  it('去色邊：只給一個背景色（集合）時和給顏色本身逐位元組相同', () => {
    const r = rng(5);
    const w = 20;
    const h = 16;
    const img = rgbaOf(w, h, () => [r() * 256, r() * 256, r() * 256, 255].map(Math.floor));
    const m = Uint8Array.from({ length: w * h }, () =>
      r() < 0.5 ? 255 : r() < 0.5 ? 0 : Math.floor(r() * 256),
    );
    const bg: Rgb = [250, 240, 230];
    const opts = { width: w, height: h, edge: 2 };
    expect(decontaminate(img, m, { colors: [bg], blend: true }, opts)).toEqual(
      decontaminate(img, m, bg, opts),
    );
    expect(decontaminate(img, m, { colors: [bg] })).toEqual(decontaminate(img, m, bg));
  });

  it('色鍵的值和 keyAlpha(keyDistance) 相同（關掉相連時每個像素各自算）', () => {
    const w = 60;
    const rgba = twoTone(w);
    const set = {
      colors: [
        [255, 255, 255],
        [144, 120, 153],
      ] as Rgb[],
      blend: true,
    };
    const m = colorKeyMask(rgba, w, 30, {
      color: set.colors[0],
      extra: set.colors.slice(1),
      blend: true,
      tolerance: 3,
      softness: 10,
      connected: false,
    });
    const d = keyDistance(set);
    for (let i = 0; i < m.length; i++) {
      const p = i * 4;
      expect(m[i]).toBe(keyAlpha(d(rgba[p], rgba[p + 1], rgba[p + 2]), 3, 10));
    }
  });
});

describe('core/image：四邊常見的顏色', () => {
  it('左白右紫（紫色有細顆粒）：兩群，比例照四邊的像素數；細顆粒併成一群', () => {
    const r = rng(9);
    const w = 100;
    const h = 60;
    const rgba = rgbaOf(w, h, (x) =>
      x < 70
        ? [255, 255, 255, 255]
        : [144, 120, 153].map((v) => v + Math.round((r() - 0.5) * 16)).concat(255),
    );
    const list = borderColors(rgba, w, h);
    expect(list).toHaveLength(2);
    expect(list[0].color).toEqual([255, 255, 255]);
    /* 四邊（2 px）：上下各 2 列 × 100、左右各 2 欄 × 56 */
    const total = 2 * 2 * w + 2 * 2 * (h - 4);
    const purple = 2 * 2 * 30 + 2 * (h - 4);
    expect(list[1].ratio).toBeCloseTo(purple / total, 6);
    expect(list[0].ratio).toBeCloseTo(1 - purple / total, 6);
    for (let c = 0; c < 3; c++)
      expect(Math.abs(list[1].color[c] - [144, 120, 153][c])).toBeLessThan(4);
  });

  it('比例低於 minRatio 的不列；透明的不算；沒有像素時是空的', () => {
    const w = 40;
    const h = 40;
    const rgba = rgbaOf(w, h, (x, y) =>
      x < 2 && y < 6 ? [255, 0, 0, 255] : y === 0 && x > 30 ? [0, 0, 0, 0] : [30, 200, 90, 255],
    );
    const all = borderColors(rgba, w, h, { minRatio: 0 });
    expect(all.map((c) => c.color)).toEqual([
      [30, 200, 90],
      [255, 0, 0],
    ]);
    expect(borderColors(rgba, w, h, { minRatio: 0.1 })).toHaveLength(1);
    expect(
      borderColors(
        rgbaOf(3, 3, () => [0, 0, 0, 0]),
        3,
        3,
      ),
    ).toEqual([]);
  });
});

describe('core/image：色階', () => {
  it('≤ lo → 0、≥ hi → 255、中間線性（四捨五入）；回傳新的遮罩', () => {
    const m = Uint8Array.from([0, 5, 6, 100, 203, 204, 255, 1]);
    const out = levelsMask(m, 5, 204);
    expect(Array.from(out)).toEqual([
      0,
      0,
      Math.round((1 * 255) / 199),
      Math.round((95 * 255) / 199),
      Math.round((198 * 255) / 199),
      255,
      255,
      0,
    ]);
    expect(out).not.toBe(m);
    expect(Array.from(m)).toEqual([0, 5, 6, 100, 203, 204, 255, 1]);
    /* 0／255 時不變 */
    expect(Array.from(levelsMask(m, 0, 255))).toEqual(Array.from(m));
  });
});
