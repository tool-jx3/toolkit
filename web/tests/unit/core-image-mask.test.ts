/**
 * core/image 的遮罩處理（mask.ts）與純色去背（colorkey.ts）：
 * 收縮／擴張（與逐點暴力算法比對）、羽化、筆刷、套用與鋪底、量化；色鍵、背景色偵測、去色邊（含去背邊界旁一圈）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyMask,
  applyStroke,
  brushCoverage,
  colorDistance,
  colorKeyMask,
  decontaminate,
  estimateBackground,
  featherMask,
  flattenRgba,
  growMask,
  keyAlpha,
  maskFromRgba,
  maskToRgba,
  quantizeMask,
  StrokePainter,
  strokeBounds,
} from '@/core/image';

/** 逐點暴力算的圓形形態學（邊界外取最近的像素） */
function bruteGrow(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.abs(radius);
  const isMax = radius > 0;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const sy = Math.min(h - 1, Math.max(0, y + dy));
          const m = mask[sy * w + sx];
          v = isMax ? Math.max(v, m) : Math.min(v, m);
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 決定性的亂數遮罩（有大塊也有雜點） */
function randomMask(w: number, h: number, seed: number): Uint8Array {
  const m = new Uint8Array(w * h);
  let s = seed;
  for (let i = 0; i < m.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const x = i % w;
    const y = Math.floor(i / w);
    const blob = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (Math.min(w, h) / 3) ** 2;
    m[i] = blob ? 200 + (s % 56) : s % 7 === 0 ? s % 256 : 0;
  }
  return m;
}

function rgbaOf(
  w: number,
  h: number,
  paint: (x: number, y: number) => number[],
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) px.set(paint(x, y), (y * w + x) * 4);
  }
  return px;
}

describe('core/image：growMask（收縮／擴張）', () => {
  it('與逐點暴力算法完全相同（各種半徑、奇怪的尺寸）', () => {
    for (const [w, h] of [
      [17, 13],
      [1, 9],
      [9, 1],
      [31, 7],
    ]) {
      const m = randomMask(w, h, w * 31 + h);
      for (const r of [-5, -3, -2, -1, 1, 2, 3, 6]) {
        expect(Array.from(growMask(m, w, h, r)), `${w}×${h} r=${r}`).toEqual(
          Array.from(bruteGrow(m, w, h, r)),
        );
      }
    }
  });

  it('一個點擴張 2 px：變成半徑 2 的圓（13 個像素）', () => {
    const m = new Uint8Array(81);
    m[40] = 255;
    const out = growMask(m, 9, 9, 2);
    expect(out.reduce((a, v) => a + (v ? 1 : 0), 0)).toBe(13);
  });

  it('0 回傳複本；小數四捨五入', () => {
    const m = randomMask(8, 8, 3);
    const same = growMask(m, 8, 8, 0);
    expect(same).not.toBe(m);
    expect(Array.from(same)).toEqual(Array.from(m));
    expect(Array.from(growMask(m, 8, 8, 1.4))).toEqual(Array.from(growMask(m, 8, 8, 1)));
  });
});

describe('core/image：featherMask（羽化）', () => {
  it('0 是複本；整片相同的遮罩羽化後不變（圖邊不會變透明）', () => {
    const full = new Uint8Array(20 * 10).fill(255);
    expect(Array.from(featherMask(full, 20, 10, 6))).toEqual(Array.from(full));
    const m = randomMask(6, 6, 9);
    expect(Array.from(featherMask(m, 6, 6, 0))).toEqual(Array.from(m));
  });

  it('直邊羽化：左右對稱、單調、邊上約一半', () => {
    const w = 40;
    const h = 5;
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 20; x < w; x++) m[y * w + x] = 255;
    const out = featherMask(m, w, h, 8);
    const row = Array.from(out.subarray(2 * w, 3 * w));
    for (let x = 1; x < w; x++) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1]);
    expect(row[0]).toBe(0);
    expect(row[w - 1]).toBe(255);
    expect(Math.abs(row[19] + row[20] - 255)).toBeLessThanOrEqual(2);
    expect(row[16]).toBeGreaterThan(0);
    expect(row[23]).toBeLessThan(255);
  });
});

describe('core/image：筆刷', () => {
  it('覆蓋率：硬度 100 只有 1 px 反鋸齒；硬度 0 從中心平滑變淡', () => {
    expect(brushCoverage(0, 10, 100)).toBe(1);
    expect(brushCoverage(4.5, 10, 100)).toBe(1);
    expect(brushCoverage(5, 10, 100)).toBeCloseTo(0.5);
    expect(brushCoverage(5.5, 10, 100)).toBe(0);
    expect(brushCoverage(0, 10, 0)).toBe(1);
    expect(brushCoverage(2.5, 10, 0)).toBeCloseTo(0.5);
    expect(brushCoverage(5, 10, 0)).toBe(0);
    expect(brushCoverage(1, 10, 50)).toBe(1);
  });

  it('擦掉一點：中心變 0、外面不變；補回：從 0 拉回 255', () => {
    const w = 12;
    const m = new Uint8Array(w * w).fill(255);
    applyStroke(m, w, w, { mode: 'erase', size: 4, hardness: 100, points: [6, 6] });
    expect(m[5 * w + 5]).toBe(0);
    expect(m[0]).toBe(255);
    expect(m[6 * w + 10]).toBe(255);
    const z = new Uint8Array(w * w);
    applyStroke(z, w, w, { mode: 'restore', size: 4, hardness: 100, points: [6, 6] });
    expect(z[5 * w + 5]).toBe(255);
    expect(z[0]).toBe(0);
  });

  it('同一筆重疊的地方不會越塗越濃（來回塗與塗一次相同）', () => {
    const w = 30;
    const once = new Uint8Array(w * w).fill(255);
    const twice = new Uint8Array(w * w).fill(255);
    applyStroke(once, w, w, { mode: 'erase', size: 10, hardness: 20, points: [5, 15, 25, 15] });
    applyStroke(twice, w, w, {
      mode: 'erase',
      size: 10,
      hardness: 20,
      points: [5, 15, 25, 15, 5, 15, 25, 15],
    });
    expect(Array.from(twice)).toEqual(Array.from(once));
    /* 兩筆分開畫就會疊加 */
    applyStroke(twice, w, w, { mode: 'erase', size: 10, hardness: 20, points: [5, 15, 25, 15] });
    const edge = (15 + 3) * w + 15;
    expect(once[edge]).toBeGreaterThan(0);
    expect(twice[edge]).toBeLessThan(once[edge]);
  });

  it('一點一點畫（StrokePainter）與一次畫完（applyStroke）結果相同', () => {
    const w = 40;
    const h = 30;
    const base = randomMask(w, h, 5);
    const a = new Uint8Array(base);
    const b = new Uint8Array(base);
    const pts = [3, 4, 10.5, 9, 18, 20.25, 30, 22, 36, 5];
    applyStroke(a, w, h, { mode: 'restore', size: 7, hardness: 60, points: pts });
    const painter = new StrokePainter(b, w, h, 'restore', 7, 60);
    for (let i = 0; i < pts.length; i += 2) painter.add(pts[i], pts[i + 1]);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('影響範圍：夾在圖內、完全在圖外時 null', () => {
    expect(strokeBounds({ mode: 'erase', size: 4, hardness: 100, points: [5, 5] }, 20, 20)).toEqual(
      { x: 2, y: 2, width: 7, height: 7 },
    );
    expect(
      strokeBounds({ mode: 'erase', size: 4, hardness: 100, points: [-50, -50] }, 20, 20),
    ).toBeNull();
  });
});

describe('core/image：套用、鋪底、量化', () => {
  it('applyMask：不透明度＝原圖 × 遮罩 ÷ 255，RGB 不變；clearTransparent 把完全透明的 RGB 清成 0', () => {
    const rgba = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255]);
    const mask = Uint8Array.from([128, 255, 0]);
    expect(Array.from(applyMask(rgba, mask))).toEqual([
      10, 20, 30, 128, 40, 50, 60, 128, 70, 80, 90, 0,
    ]);
    expect(Array.from(applyMask(rgba, mask, { clearTransparent: true }).slice(8))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('flattenRgba：一般的 alpha 合成到底色', () => {
    const out = flattenRgba(
      Uint8ClampedArray.from([200, 100, 0, 128, 0, 0, 0, 0]),
      [255, 255, 255],
    );
    expect(Array.from(out)).toEqual([
      Math.round((200 * 128 + 255 * 127) / 255),
      Math.round((100 * 128 + 255 * 127) / 255),
      Math.round((255 * 127) / 255),
      255,
      255,
      255,
      255,
      255,
    ]);
  });

  it('maskToRgba／maskFromRgba 來回相同', () => {
    const m = randomMask(7, 5, 2);
    expect(Array.from(maskFromRgba(maskToRgba(m)))).toEqual(Array.from(m));
  });

  it('quantizeMask：floor(float32(m × 255))，夾在 0～255（同 numpy 的 astype(np.uint8)）', () => {
    const f = Float32Array.from([0, 1, 0.5, 0.999, -0.1, 1.5, 0.00392157, 0.1]);
    expect(Array.from(quantizeMask(f))).toEqual([
      0,
      255,
      127,
      254,
      0,
      255,
      Math.floor(Math.fround(Math.fround(0.00392157) * 255)),
      Math.floor(Math.fround(Math.fround(0.1) * 255)),
    ]);
  });
});

describe('core/image：純色去背', () => {
  /* 20 × 20 白底，中間 10 × 10 的黑框，框裡面還有 4 × 4 的白洞 */
  const W = 20;
  const img = rgbaOf(W, W, (x, y) => {
    const inBox = x >= 5 && x < 15 && y >= 5 && y < 15;
    const inHole = x >= 8 && x < 12 && y >= 8 && y < 12;
    return inBox && !inHole ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });

  it('顏色差：0～100（黑白＝100）；容許度內 0、柔邊線性、之外 255', () => {
    expect(colorDistance(0, 0, 0, [255, 255, 255])).toBeCloseTo(100);
    expect(colorDistance(10, 20, 30, [10, 20, 30])).toBe(0);
    expect(keyAlpha(5, 10, 10)).toBe(0);
    expect(keyAlpha(15, 10, 10)).toBe(128);
    expect(keyAlpha(20, 10, 10)).toBe(255);
    expect(keyAlpha(10.5, 10, 0)).toBe(255);
  });

  it('只去掉和邊緣相連的背景：框裡的白洞留著；關掉時白洞也去掉', () => {
    const opts = { color: [255, 255, 255] as const, tolerance: 5, softness: 0 };
    const conn = colorKeyMask(img, W, W, { ...opts, connected: true });
    const all = colorKeyMask(img, W, W, { ...opts, connected: false });
    expect(conn[0]).toBe(0);
    expect(conn[6 * W + 6]).toBe(255);
    expect(conn[9 * W + 9]).toBe(255);
    expect(all[9 * W + 9]).toBe(0);
    expect(all[6 * W + 6]).toBe(255);
  });

  it('柔邊：接近背景色的像素半透明；原圖透明的像素當背景', () => {
    const px = rgbaOf(3, 1, (x) =>
      x === 0 ? [255, 255, 255, 0] : x === 1 ? [235, 235, 235, 255] : [0, 0, 0, 255],
    );
    const m = colorKeyMask(px, 3, 1, { color: [255, 255, 255], tolerance: 2, softness: 10 });
    const d = colorDistance(235, 235, 235, [255, 255, 255]);
    expect(m[0]).toBe(0);
    expect(m[1]).toBe(Math.round(((d - 2) / 10) * 255));
    expect(m[2]).toBe(255);
  });

  it('背景色偵測：四邊最多的顏色（平均）與比例', () => {
    const bg = estimateBackground(img, W, W);
    expect(bg.color).toEqual([255, 255, 255]);
    expect(bg.ratio).toBe(1);
    const green = rgbaOf(10, 10, (x, y) =>
      x === 0 && y < 3 ? [255, 0, 0, 255] : [40, 200, 90, 255],
    );
    const g = estimateBackground(green, 10, 10, 1);
    expect(g.color).toEqual([40, 200, 90]);
    expect(g.ratio).toBeCloseTo(33 / 36);
    expect(
      estimateBackground(
        rgbaOf(2, 2, () => [0, 0, 0, 0]),
        2,
        2,
      ),
    ).toEqual({
      color: [255, 255, 255],
      ratio: 0,
    });
  });

  it('去色邊：半透明像素扣掉混進去的背景色，還原前景色', () => {
    /* 前景 (200, 40, 40) 以 40% 疊在白底上 */
    const a = 0.4;
    const c = [200, 40, 40].map((f) => Math.round(a * f + (1 - a) * 255));
    const px = Uint8ClampedArray.from([...c, 255, 1, 2, 3, 255]);
    const out = decontaminate(px, Uint8Array.from([Math.round(a * 255), 255]), [255, 255, 255]);
    expect(Math.abs(out[0] - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[1] - 40)).toBeLessThanOrEqual(2);
    expect(Array.from(out.slice(4))).toEqual([1, 2, 3, 255]);
  });

  /** 照 colorkey.ts 的說明逐點暴力算的邊緣一圈（純前景＝收縮 edge px 後仍是 255；視窗逐格加總） */
  function bruteEdgeDespill(
    rgba: Uint8ClampedArray,
    mask: Uint8Array,
    w: number,
    h: number,
    bg: [number, number, number],
    edge: number,
  ): Uint8ClampedArray {
    const out = decontaminate(rgba, mask, bg);
    const inner = bruteGrow(mask, w, h, -edge);
    const win = edge + 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i] !== 255 || inner[i] === 255) continue;
        let n = 0;
        const sum = [0, 0, 0];
        for (let yy = Math.max(0, y - win); yy <= Math.min(h - 1, y + win); yy++) {
          for (let xx = Math.max(0, x - win); xx <= Math.min(w - 1, x + win); xx++) {
            const j = yy * w + xx;
            if (inner[j] !== 255) continue;
            n++;
            for (let c = 0; c < 3; c++) sum[c] += rgba[j * 4 + c];
          }
        }
        if (!n) continue;
        const d = sum.map((v, c) => v / n - bg[c]);
        const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (l2 < 256) continue;
        const v = [0, 1, 2].map((c) => rgba[i * 4 + c] - bg[c]);
        const t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / l2;
        if (!(t > 0 && t < 1)) continue;
        const r = [0, 1, 2].map((c) => v[c] - t * d[c]);
        if (r[0] * r[0] + r[1] * r[1] + r[2] * r[2] > 0.2 * 0.2 * l2) continue;
        for (let c = 0; c < 3; c++) {
          const nv = rgba[i * 4 + c] + (1 - t) * d[c];
          out[i * 4 + c] = nv < 0 ? 0 : nv > 255 ? 255 : Math.round(nv);
        }
      }
    }
    return out;
  }

  /** 白底上一塊紅色（12 × 12），外面一圈（不透明）是紅白各半的反鋸齒色、有一格是藍色（不是混到背景的顏色） */
  function fringeImage() {
    const w = 20;
    const h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    const mask = new Uint8Array(w * h);
    for (let y = 3; y < 17; y++) {
      for (let x = 3; x < 17; x++) {
        const ring = x === 3 || x === 16 || y === 3 || y === 16;
        rgba.set(ring ? [228, 148, 148, 255] : [200, 40, 40, 255], (y * w + x) * 4);
        mask[y * w + x] = 255;
      }
    }
    rgba.set([40, 40, 220, 255], (3 * w + 9) * 4);
    return { rgba, mask, w, h };
  }

  it('去色邊（邊緣一圈）：不透明但混到背景色的邊換成前景色；別的顏色、裡面、不給 edge 時不變', () => {
    const { rgba, mask, w, h } = fringeImage();
    const px = (a: Uint8ClampedArray, x: number, y: number) =>
      Array.from(a.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    const plain = decontaminate(rgba, mask, [255, 255, 255]);
    expect(px(plain, 3, 8)).toEqual([228, 148, 148, 255]);
    const out = decontaminate(rgba, mask, [255, 255, 255], { width: w, height: h, edge: 2 });
    /* 外圈：紅白各半 → 紅（t ≈ 0.49，換回前景色） */
    for (const [x, y] of [
      [3, 8],
      [16, 12],
      [8, 16],
      [3, 3],
    ] as const) {
      const [r, g, b, a] = px(out, x, y);
      expect(Math.abs(r - 200) + Math.abs(g - 40) + Math.abs(b - 40), `${x},${y}`).toBeLessThan(6);
      expect(a).toBe(255);
    }
    /* 藍色那一格不是混到背景色：不變 */
    expect(px(out, 9, 3)).toEqual([40, 40, 220, 255]);
    /* 裡面、背景不變 */
    expect(px(out, 9, 9)).toEqual([200, 40, 40, 255]);
    expect(px(out, 4, 8)).toEqual([200, 40, 40, 255]);
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('去色邊（邊緣一圈）：比前景色更深（t ≥ 1）、前景色和背景色太像時不處理', () => {
    const { rgba, mask, w, h } = fringeImage();
    rgba.set([120, 10, 10, 255], (8 * w + 3) * 4);
    const out = decontaminate(rgba, mask, [255, 255, 255], { width: w, height: h, edge: 2 });
    expect(Array.from(out.slice((8 * w + 3) * 4, (8 * w + 3) * 4 + 3))).toEqual([120, 10, 10]);
    /* 前景本身接近白色：不處理 */
    const pale = new Uint8ClampedArray(rgba);
    for (let i = 0; i < w * h; i++) if (mask[i]) pale.set([250, 250, 250, 255], i * 4);
    pale.set([252, 252, 252, 255], (8 * w + 3) * 4);
    const o2 = decontaminate(pale, mask, [255, 255, 255], { width: w, height: h, edge: 2 });
    expect(Array.from(o2.slice((8 * w + 3) * 4, (8 * w + 3) * 4 + 3))).toEqual([252, 252, 252]);
  });

  it('去色邊（邊緣一圈）：與逐點暴力算法完全相同（亂數的圖與遮罩、各種寬度）', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    for (const [w, h, edge] of [
      [23, 17, 2],
      [40, 31, 1],
      [9, 50, 3],
      [64, 48, 2],
    ] as const) {
      const rgba = new Uint8ClampedArray(w * h * 4);
      const mask = new Uint8Array(w * h);
      const bg: [number, number, number] = [240, 250, 230];
      const fg = [60, 120, 30];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          /* 一個圓（前景）＋雜點；邊上混一點背景色 */
          const d = Math.hypot(x - w / 2, y - h / 2) / (Math.min(w, h) * 0.35);
          const t = Math.min(1, Math.max(0, 1.6 - d)) * (0.8 + 0.2 * rnd());
          for (let c = 0; c < 3; c++)
            rgba[i * 4 + c] = Math.round(bg[c] + t * (fg[c] - bg[c]) + (rnd() - 0.5) * 12);
          rgba[i * 4 + 3] = 255;
          mask[i] = d < 0.9 ? 255 : d < 1 ? Math.round(rnd() * 254) : rnd() < 0.05 ? 255 : 0;
        }
      }
      const got = decontaminate(rgba, mask, bg, { width: w, height: h, edge });
      expect(got, `${w}×${h} edge ${edge}`).toEqual(bruteEdgeDespill(rgba, mask, w, h, bg, edge));
    }
  });
});
