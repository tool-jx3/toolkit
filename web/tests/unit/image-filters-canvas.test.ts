/**
 * core/image 濾鏡「照畫布做法」的選項（bg-motion 對等修正時新增）：與直接算法、以及在 Chromium 實測的畫布結果比對。
 * - gradient space: 'pixel'、radial：px 座標、像素中心；色標不預乘內插；格號圖快取（第二次、換尺寸）。
 * - blur canvas：Chromium 的 filter: blur(6px)（左黑右白的交界、畫面外透明的邊緣）實測剖面。
 * - mosaic sample: 'center'：Chromium 低品質縮小（10 倍、非整數倍）再最近鄰放大的實測值。
 * - lines kernel: 'forward'：|自己 − 右| ＋ |自己 − 下|，1 px 細線、畫在交界的左／上那一格。
 * - matrix 的亮部、暗部項；grain shape: 'uniform'；跳過截斷的步驟與截斷後結果相同。
 */
import { describe, expect, it } from 'vitest';
import { applyFilterOps, applyFilterRows, type FilterOp, type GradientStop } from '@/core/image';

const solidImg = (w: number, h: number, f: (x: number, y: number) => number[]) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set([...f(x, y), 255], (y * w + x) * 4);
  return a;
};
const ch = (img: Uint8ClampedArray, w: number, x: number, y: number, c = 0) =>
  img[(y * w + x) * 4 + c];

describe('畫布式漸層', () => {
  const W = 61;
  const H = 23;
  const IMG = solidImg(W, H, (x, y) => [(x * 9 + y * 2) & 255, (x * y + 17) & 255, (x * 3) & 255]);
  const stops: GradientStop[] = [
    { at: 0, color: [255, 196, 122], alpha: 0.9 },
    { at: 0.6, color: [20, 200, 90], alpha: 0.3 },
    { at: 1, color: [44, 44, 96], alpha: 0 },
  ];
  const sample = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    const i = u <= 0.6 ? 0 : 1;
    const k = (u - stops[i].at) / (stops[i + 1].at - stops[i].at);
    const m = (a: number, b: number) => a + (b - a) * k;
    return {
      c: [0, 1, 2].map((j) => m(stops[i].color[j], stops[i + 1].color[j])),
      a: m(stops[i].alpha, stops[i + 1].alpha),
    };
  };
  const naive = (tAt: (x: number, y: number) => number) => {
    const out: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const { c, a } = sample(tAt(x + 0.5, y + 0.5));
        for (let j = 0; j < 3; j++) {
          const v = IMG[(y * W + x) * 4 + j];
          out.push(Math.round(v + (c[j] - v) * a));
        }
      }
    return out;
  };
  const rgb = (img: Uint8ClampedArray) => Array.from(img).filter((_, i) => i % 4 !== 3);
  const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

  it('gradient（pixel）：斜向漸層在 px 座標投影（隨長寬比改變方向），像素中心取樣', () => {
    const op: FilterOp = { op: 'gradient', space: 'pixel', from: [0, 0], to: [1, 1], stops };
    const want = naive((px, py) => (px * W + py * H) / (W * W + H * H));
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want)).toBeLessThanOrEqual(1);
    /* 第二次用快取 */
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want)).toBeLessThanOrEqual(1);
    const v: FilterOp = { op: 'gradient', space: 'pixel', from: [0, 0], to: [0, 1], stops };
    expect(
      maxDiff(
        rgb(applyFilterOps(IMG, W, H, [v])),
        naive((_, py) => py / H),
      ),
    ).toBeLessThanOrEqual(1);
  });

  it('radial：同心圓（半徑以長邊計）、內圈以內用第一個色標；換尺寸時重算', () => {
    const op: FilterOp = { op: 'radial', center: [0.3, 0.6], r0: 0.1, r1: 0.5, stops };
    const want = naive((px, py) => (Math.hypot(px - 0.3 * W, py - 0.6 * H) - 0.1 * W) / (0.4 * W));
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want)).toBeLessThanOrEqual(1);
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want)).toBeLessThanOrEqual(1);
    const small = applyFilterOps(IMG.subarray(0, 20 * 10 * 4), 20, 10, [op]);
    expect(Array.from(applyFilterOps(IMG.subarray(0, 20 * 10 * 4), 20, 10, [op]))).toEqual(
      Array.from(small),
    );
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want)).toBeLessThanOrEqual(1);
  });

  it('applyFilterRows：只算幾列時與整張的那幾列相同', () => {
    const ops: FilterOp[] = [
      { op: 'radial', center: [0.5, 0.5], r0: 0.13, r1: 0.74, stops },
      { op: 'gradient', space: 'pixel', from: [0, 0], to: [1, 1], stops },
    ];
    const flat = solidImg(W, H, (x) => [x * 4, 100, 255 - x * 4]);
    const full = applyFilterOps(flat, W, H, ops);
    const rows = [3, 11, 20];
    const part = applyFilterRows(
      new Uint8ClampedArray(
        rows.flatMap((y) => Array.from(flat.subarray(y * W * 4, (y + 1) * W * 4))),
      ),
      W,
      H,
      rows,
      ops,
    );
    rows.forEach((y, k) => {
      expect(Array.from(part.subarray(k * W * 4, (k + 1) * W * 4))).toEqual(
        Array.from(full.subarray(y * W * 4, (y + 1) * W * 4)),
      );
    });
  });
});

describe('畫布式模糊（filter: blur）', () => {
  const W = 320;
  const H = 180;
  /* Chromium 在畫布上 filter = 'blur(6px)' 畫左黑右白的圖：第 90 列 x＝140～180 的值，與左邊緣（x＝0～14）的不透明度 */
  const CHROME_ROW = [
    0, 0, 0, 0, 0, 0, 1, 2, 4, 7, 11, 16, 23, 32, 42, 55, 69, 85, 102, 119, 136, 153, 170, 186, 200,
    213, 223, 232, 239, 244, 248, 251, 253, 254, 255, 255, 255, 255, 255, 255, 255,
  ];
  const CHROME_EDGE_ALPHA = [
    136, 153, 170, 186, 200, 213, 223, 232, 239, 244, 248, 251, 253, 254, 255,
  ];

  it('交界的剖面與 Chromium 相同（mix 1、亮度 1）', () => {
    const edge = solidImg(W, H, (x) => (x < 160 ? [0, 0, 0] : [255, 255, 255]));
    const out = applyFilterOps(edge, W, H, [{ op: 'blur', radius: 6, mix: 1, canvas: true }]);
    const row = CHROME_ROW.map((_, i) => ch(out, W, 140 + i, 90));
    expect(row).toEqual(CHROME_ROW);
  });

  it('畫面外透明：靠邊的模糊層變半透明（與 Chromium 的不透明度相同），上下左右一樣', () => {
    /* 白底、亮度 0 的模糊副本以 mix 1 疊上：結果＝255 × (1 − 不透明度) */
    const white = solidImg(W, H, () => [255, 255, 255]);
    const ops: FilterOp[] = [{ op: 'blur', radius: 6, mix: 1, brightness: 0, canvas: true }];
    const out = applyFilterOps(white, W, H, ops);
    const want = CHROME_EDGE_ALPHA.map((a) => 255 - a);
    expect(CHROME_EDGE_ALPHA.map((_, x) => ch(out, W, x, 90))).toEqual(want);
    expect(CHROME_EDGE_ALPHA.map((_, y) => ch(out, W, 200, y))).toEqual(want);
    expect(CHROME_EDGE_ALPHA.map((_, x) => ch(out, W, W - 1 - x, 90))).toEqual(want);
    /* 只算幾列（上下一致的圖）時，縱向的覆蓋率照原本的 y */
    const rows = [0, 3, 90, 179];
    const part = applyFilterRows(white.subarray(0, rows.length * W * 4), W, H, rows, ops);
    rows.forEach((y, k) => {
      expect(ch(part, W, 5, k)).toBe(ch(out, W, 5, y));
      expect(ch(part, W, 160, k)).toBe(ch(out, W, 160, y));
    });
  });

  it('亮度倍率夾在 255（未預乘的顏色）', () => {
    const gray = solidImg(40, 30, () => [200, 100, 0]);
    const out = applyFilterOps(gray, 40, 30, [
      { op: 'blur', radius: 2, mix: 0.5, brightness: 1.5, canvas: true },
    ]);
    /* 中央：200 → min(255, 300)＝255、100 → 150；以 0.5 疊回 */
    expect([ch(out, 40, 20, 15, 0), ch(out, 40, 20, 15, 1), ch(out, 40, 20, 15, 2)]).toEqual([
      228, 125, 0,
    ]);
  });
});

describe('畫布式馬賽克（mosaic sample: center）', () => {
  it('10 倍：每格取格子中心的雙線性取樣（Chromium 實測 27、87、147、207）', () => {
    const img = solidImg(40, 1, (x) => [x * 6, 0, 0]);
    const out = applyFilterOps(img, 40, 1, [{ op: 'mosaic', size: 10, sample: 'center' }]);
    const row = Array.from({ length: 40 }, (_, x) => ch(out, 40, x, 0));
    expect(row).toEqual([27, 87, 147, 207].flatMap((v) => Array(10).fill(v)));
  });
  it('非整數倍（32 → 3 格）：格寬 11、10、11（同 Chromium 的最近鄰放大），值差 1 以內', () => {
    const img = solidImg(32, 32, (x, y) => [x * 7, y * 7, 0]);
    const out = applyFilterOps(img, 32, 32, [{ op: 'mosaic', size: 10, sample: 'center' }]);
    const row = Array.from({ length: 32 }, (_, x) => ch(out, 32, x, 0));
    const chrome = [33, 108, 182];
    const widths = [11, 10, 11];
    let x = 0;
    widths.forEach((n, k) => {
      for (let i = 0; i < n; i++, x++) expect(Math.abs(row[x] - chrome[k])).toBeLessThanOrEqual(1);
    });
    expect(Math.abs(ch(out, 32, 0, 31, 1) - chrome[2])).toBeLessThanOrEqual(1);
  });
  it('細線不會被平均掉（方塊清楚）：格子中心的線保留原本的亮度', () => {
    /* 每 10 px 一格，第 4、5 欄（格子中心）是白線 */
    const img = solidImg(40, 20, (x) =>
      x % 10 === 4 || x % 10 === 5 ? [255, 255, 255] : [0, 0, 0],
    );
    const center = applyFilterOps(img, 40, 20, [{ op: 'mosaic', size: 10, sample: 'center' }]);
    const mean = applyFilterOps(img, 40, 20, [{ op: 'mosaic', size: 10 }]);
    expect(ch(center, 40, 0, 0)).toBe(255);
    expect(ch(mean, 40, 0, 0)).toBe(51);
  });
});

describe('線稿（lines kernel: forward）', () => {
  it('2 px 寬的橫線畫成上下兩條 1 px 細線；平坦處全白', () => {
    const W = 12;
    const H = 12;
    const img = solidImg(W, H, (_, y) => (y === 5 || y === 6 ? [0, 0, 0] : [255, 255, 255]));
    const ops: FilterOp[] = [
      { op: 'lines', mode: 'dark', threshold: 24, softness: 255 / 3.2, kernel: 'forward' },
    ];
    const out = applyFilterOps(img, W, H, ops);
    const col = Array.from({ length: H }, (_, y) => ch(out, W, 3, y));
    expect(col).toEqual([255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]);
    /* 預設（max）：線畫在較暗那一側（兩列黑） */
    const old = applyFilterOps(img, W, H, [{ ...ops[0], kernel: undefined } as FilterOp]);
    expect(Array.from({ length: H }, (_, y) => ch(old, W, 3, y))).toEqual([
      255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 255,
    ]);
  });
  it('濃度＝(差 − 門檻) × 3.2（原作）：差 30 → 255 − 19', () => {
    const img = solidImg(4, 1, (x) => (x < 2 ? [100, 100, 100] : [130, 130, 130]));
    const out = applyFilterOps(img, 4, 1, [
      { op: 'lines', mode: 'dark', threshold: 24, softness: 255 / 3.2, kernel: 'forward' },
    ]);
    expect(Array.from({ length: 4 }, (_, x) => ch(out, 4, x, 0))).toEqual([255, 236, 255, 255]);
  });
});

describe('其他選項', () => {
  it('matrix 的亮部、暗部項（highlightAbove 以下的亮部當成 0）', () => {
    const img = solidImg(
      3,
      1,
      (x) =>
        [
          [0, 0, 0],
          [128, 128, 128],
          [255, 255, 255],
        ][x],
    );
    const op: FilterOp = {
      op: 'matrix',
      m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      highlight: [34, 0, 0],
      shadow: [0, 0, 8],
    };
    const out = applyFilterOps(img, 3, 1, [op]);
    /* 黑：S＝1 → 藍 +8；中灰：H＝16 ÷ 143、S＝4 ÷ 132；白：H＝1 → 紅 +34（夾在 255） */
    expect([
      ch(out, 3, 0, 0, 2),
      ch(out, 3, 1, 0, 0),
      ch(out, 3, 1, 0, 2),
      ch(out, 3, 2, 0, 0),
    ]).toEqual([8, Math.round(128 + (34 * 16) / 143), Math.round(128 + (8 * 4) / 132), 255]);
    const knee = applyFilterOps(img, 3, 1, [{ ...op, highlightAbove: 0.55 }]);
    expect(ch(knee, 3, 1, 0, 0)).toBe(128);
  });
  it('grain uniform：均勻分布、標準差約 amount、每格不同、同一格可重現', () => {
    const img = solidImg(100, 100, () => [128, 128, 128]);
    const op: FilterOp = { op: 'grain', amount: 10 / Math.sqrt(12), mono: true, shape: 'uniform' };
    const a = applyFilterOps(img, 100, 100, [op], { frame: 0 });
    const b = applyFilterOps(img, 100, 100, [op], { frame: 1 });
    expect(Array.from(a)).toEqual(Array.from(applyFilterOps(img, 100, 100, [op], { frame: 0 })));
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const vals = Array.from({ length: 10000 }, (_, i) => a[i * 4]);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(123);
    expect(Math.max(...vals)).toBeLessThanOrEqual(133);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    expect(Math.abs(sd - 2.89)).toBeLessThan(0.3);
  });
  it('跳過截斷的步驟（搬移、掃描線、一般混合的疊層）：與每步截斷的結果相同', () => {
    const W = 37;
    const H = 29;
    const img = solidImg(W, H, (x, y) => [(x * 11) & 255, (y * 13) & 255, (x * y) & 255]);
    const ops: FilterOp[] = [
      { op: 'matrix', m: [1.4, 0, 0, 30, 0, 1.3, 0, -20, 0, 0, 1.2, 10] },
      { op: 'shift', r: [3, 0], g: [0, 1], b: [-3, 0] },
      { op: 'scanlines', period: 3, dark: 0.16 },
      { op: 'fill', color: [13, 18, 8], alpha: 0.05 },
      {
        op: 'radial',
        center: [0.5, 0.5],
        r0: 0.1,
        r1: 0.7,
        stops: [
          { at: 0, color: [0, 0, 0], alpha: 0 },
          { at: 1, color: [0, 0, 0], alpha: 0.3 },
        ],
      },
      { op: 'mosaic', size: 4, sample: 'center' },
    ];
    /* 每步之間插一個不改值、但一定會截斷的步驟（contrast 1），結果要與直接套相同 */
    const together = applyFilterOps(img, W, H, ops);
    const clamped = applyFilterOps(
      img,
      W,
      H,
      ops.flatMap((o) => [o, { op: 'contrast', amount: 1 } as FilterOp]),
    );
    expect(Array.from(together)).toEqual(Array.from(clamped));
  });
});
