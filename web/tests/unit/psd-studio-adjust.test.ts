/**
 * CCFOLIA & 圖片調色工作室（psd-studio）：調色（規格 1.3、3.8）對照附件 psd-studio.examples.json 的「調色」。
 *
 * 照「量測條件」自製同樣的 256 × 32 量測圖，以附件每一組設定處理後讀取樣點：
 * 不透明像素每通道 ±2、半透明像素 ±3（舊版經過瀏覽器的預乘透明，例：原圖 200 讀成 199）、不透明度完全相同、完全透明的維持完全透明
 * （規格 3.10 第 1 項）。實際上不透明像素逐值相同（差 0），測試另外統計。
 */
import { describe, expect, it } from 'vitest';
import {
  type AssetAdjust,
  applyAdjust,
  buildCurveLut,
  buildGradientLut,
  type CurvePoint,
  compileAdjust,
  DEFAULT_STOPS,
  defaultAssetAdjust,
  defaultGlobalAdjust,
  type GlobalAdjust,
  type GradStop,
  gradientColorAt,
  isAssetAdjustActive,
  sanitizeAdjust,
} from '@/tools/psd-studio/adjust';
import EX from '../../../docs/refactor/specs/psd-studio.examples.json';

type Sample = Record<string, string>;
type Group = Record<string, Record<'灰階' | '色塊' | '純色' | '透明度', Sample>>;
const TONE = (EX as unknown as { 調色: Record<string, Group> }).調色;

/* ---------- 量測圖（附件「量測條件」） ---------- */

const W = 256;
const HGT = 32;
function measureImage(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * HGT * 4);
  const put = (x: number, y: number, c: number[]) => px.set(c, (y * W + x) * 4);
  const blocks = [
    [0, 0, 0],
    [64, 64, 64],
    [128, 128, 128],
    [192, 192, 192],
    [255, 255, 255],
    [220, 40, 40],
    [40, 180, 60],
    [40, 70, 210],
    [230, 180, 150],
  ];
  const alphaSegs = [
    [200, 100, 50, 128],
    [0, 128, 255, 64],
    [0, 0, 0, 0],
    [128, 128, 128, 255],
  ];
  const pure = [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
    [255, 128, 0],
    [128, 96, 64],
  ];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < 8; y++) put(x, y, [x, x, x, 255]);
    const b = blocks[Math.min(8, Math.floor(x / 28))];
    for (let y = 8; y < 16; y++) put(x, y, [...b, 255]);
    for (let y = 16; y < 24; y++) put(x, y, alphaSegs[Math.floor(x / 64)]);
    for (let y = 24; y < 32; y++) put(x, y, [...pure[Math.floor(x / 32)], 255]);
  }
  return px;
}

/** 取樣點（附件「取樣點」），順序與附件的鍵相同 */
const SAMPLE_POINTS = {
  灰階: [...Array.from({ length: 16 }, (_, k) => k * 16), 255].map((x) => [x, 4]),
  色塊: Array.from({ length: 9 }, (_, k) => [14 + 28 * k, 12]),
  透明度: Array.from({ length: 4 }, (_, k) => [32 + 64 * k, 20]),
  純色: Array.from({ length: 8 }, (_, k) => [16 + 32 * k, 28]),
} as const;

const parse = (s: string) => {
  const m = s.split(',');
  const a = m[3]?.startsWith('a') ? Number(m[3].slice(1)) : 255;
  return [Number(m[0]), Number(m[1]), Number(m[2]), a];
};

/* ---------- 附件的設定組合 ---------- */

const TWO: GradStop[] = [
  { pos: 0, color: '#102030' },
  { pos: 100, color: '#f0d080' },
];
const THREE: GradStop[] = [
  { pos: 0, color: '#400000' },
  { pos: 50, color: '#00a0a0' },
  { pos: 100, color: '#ffff80' },
];
const OFF_ENDS: GradStop[] = [
  { pos: 20, color: '#ff0000' },
  { pos: 80, color: '#0000ff' },
];
const pts = (...p: [number, number][]): CurvePoint[] => p.map(([x, y]) => ({ x, y }));
const C64 = pts([0, 0], [64, 128], [255, 255]);

type Patch = { g?: (g: GlobalAdjust) => void; a?: (a: AssetAdjust) => void };
const grad =
  (stops: GradStop[], mode: GlobalAdjust['gradient']['mode'], opacity = 100) =>
  (x: GlobalAdjust | AssetAdjust) => {
    x.gradient = { enabled: true, mode, opacity, stops: stops.map((s) => ({ ...s })) };
  };
const tone =
  (key: 'hue' | 'saturation' | 'brightness' | 'contrast' | 'exposure', v: number) =>
  (x: GlobalAdjust | AssetAdjust) => {
    x[key] = v;
  };
const curve = (ch: 'all' | 'r' | 'g' | 'b', p: CurvePoint[]) => (x: GlobalAdjust | AssetAdjust) => {
  x.curves[ch] = p;
};
const both =
  (...fs: ((x: GlobalAdjust) => void)[]) =>
  (x: GlobalAdjust) => {
    for (const f of fs) f(x);
  };

const SETTINGS: Record<string, Record<string, Patch>> = {
  原圖: { 原圖: {} },
  整體: Object.fromEntries([
    ...[-180, -150, -120, -90, -60, -30, 30, 60, 90, 120, 150, 180].map((v) => [
      `色相 ${v}`,
      { g: tone('hue', v) },
    ]),
    ...[0, 25, 50, 75, 125, 150, 200].map((v) => [`飽和度 ${v}%`, { g: tone('saturation', v) }]),
    ...[-100, -50, -20, 20, 50, 100].flatMap((v) => [
      [`亮度 ${v}`, { g: tone('brightness', v) }],
      [`對比 ${v}`, { g: tone('contrast', v) }],
      [`曝光 ${v}`, { g: tone('exposure', v) }],
    ]),
  ]),
  漸層對應: {
    '兩色標 一般 100%': { g: grad(TWO, 'normal') },
    '兩色標 色彩增值 100%': { g: grad(TWO, 'multiply') },
    '兩色標 濾色 100%': { g: grad(TWO, 'screen') },
    '兩色標 覆蓋 100%': { g: grad(TWO, 'overlay') },
    '兩色標 柔光 100%': { g: grad(TWO, 'soft-light') },
    '兩色標 顏色 100%': { g: grad(TWO, 'color') },
    '兩色標 一般 75%': { g: grad(TWO, 'normal', 75) },
    '兩色標 一般 50%': { g: grad(TWO, 'normal', 50) },
    '兩色標 一般 25%': { g: grad(TWO, 'normal', 25) },
    '兩色標 一般 0%': { g: grad(TWO, 'normal', 0) },
    '三色標 一般 100%': { g: grad(THREE, 'normal') },
    '三色標 覆蓋 60%': { g: grad(THREE, 'overlay', 60) },
    '色標不在兩端（20% 紅、80% 藍）normal': { g: grad(OFF_ENDS, 'normal') },
    '開頁預設色標，直接打開': {
      g: (g) => {
        g.gradient.enabled = true;
      },
    },
  },
  曲線: {
    'RGB 合併：(64→128)': { g: curve('all', C64) },
    'RGB 合併：(64→32)、(192→224)': {
      g: curve('all', pts([0, 0], [64, 32], [192, 224], [255, 255])),
    },
    'RGB 合併：端點 (0→40)、(255→200)': { g: curve('all', pts([0, 40], [255, 200])) },
    '只有紅：(128→200)': { g: curve('r', pts([0, 0], [128, 200], [255, 255])) },
    '只有藍：反轉': { g: curve('b', pts([0, 255], [255, 0])) },
    'RGB (64→128) 再加綠 (128→64)': {
      g: (g) => {
        g.curves.all = C64;
        g.curves.g = pts([0, 0], [128, 64], [255, 255]);
      },
    },
  },
  組合與順序: {
    '亮度 30＋對比 40': { g: both(tone('brightness', 30), tone('contrast', 40)) },
    '曝光 30＋亮度 −20': { g: both(tone('exposure', 30), tone('brightness', -20)) },
    '曝光 50＋對比 50': { g: both(tone('exposure', 50), tone('contrast', 50)) },
    '色相 60＋飽和度 150%': { g: both(tone('hue', 60), tone('saturation', 150)) },
    '亮度 50＋曲線 (64→128)': {
      g: both(tone('brightness', 50), curve('all', C64)),
    },
    '漸層 一般＋色相 90': { g: both(grad(TWO, 'normal'), tone('hue', 90)) },
    '漸層 一般＋亮度 50': { g: both(grad(TWO, 'normal'), tone('brightness', 50)) },
    '漸層 一般＋曲線 (64→128)': { g: both(grad(TWO, 'normal'), curve('all', C64)) },
    '漸層 一般＋飽和度 0%': { g: both(grad(TWO, 'normal'), tone('saturation', 0)) },
  },
  個別調整與整體疊加: {
    '個別飽和度 -100%': { a: tone('saturation', -100) },
    '個別飽和度 -50%': { a: tone('saturation', -50) },
    '個別飽和度 50%': { a: tone('saturation', 50) },
    '個別飽和度 100%': { a: tone('saturation', 100) },
    '個別色相 60': { a: tone('hue', 60) },
    '個別亮度 50': { a: tone('brightness', 50) },
    '個別對比 50': { a: tone('contrast', 50) },
    '個別曝光 50': { a: tone('exposure', 50) },
    '整體色相 30＋個別色相 30': { g: tone('hue', 30), a: tone('hue', 30) },
    '整體色相 170＋個別色相 170': { g: tone('hue', 170), a: tone('hue', 170) },
    '整體飽和度 150%＋個別 −50%': { g: tone('saturation', 150), a: tone('saturation', -50) },
    '整體飽和度 200%＋個別 +100%': { g: tone('saturation', 200), a: tone('saturation', 100) },
    '整體亮度 30＋個別亮度 30': { g: tone('brightness', 30), a: tone('brightness', 30) },
    '整體亮度 100＋個別亮度 100': { g: tone('brightness', 100), a: tone('brightness', 100) },
    '整體對比 50＋個別對比 80': { g: tone('contrast', 50), a: tone('contrast', 80) },
    '（參照）整體對比 100': { g: tone('contrast', 100) },
    '整體曝光 50＋個別曝光 50': { g: tone('exposure', 50), a: tone('exposure', 50) },
    '整體漸層（兩色標）＋個別漸層（三色標）': {
      g: grad(TWO, 'normal'),
      a: grad(THREE, 'normal'),
    },
    '整體漸層＋個別漸層開但強度 0%': { g: grad(TWO, 'normal'), a: grad(THREE, 'normal', 0) },
    '整體曲線 (64→128)＋個別曲線 (128→64)': {
      g: curve('all', C64),
      a: curve('all', pts([0, 0], [128, 64], [255, 255])),
    },
  },
};

function run(p: Patch): Uint8ClampedArray {
  const g = defaultGlobalAdjust();
  p.g?.(g);
  let a: AssetAdjust | null = null;
  if (p.a) {
    a = defaultAssetAdjust();
    p.a(a);
  }
  const px = measureImage();
  applyAdjust(px, compileAdjust(g, a));
  return px;
}

describe('調色對照附件（規格 3.8、3.10 第 1 項）', () => {
  let opaqueChecked = 0;
  let opaqueExact = 0;
  for (const [groupName, cases] of Object.entries(SETTINGS)) {
    const group = groupName === '原圖' ? { 原圖: TONE.原圖 } : TONE[groupName];
    for (const [name, patch] of Object.entries(cases)) {
      it(`${groupName}：${name}`, () => {
        const want = (group as unknown as Group)[name];
        expect(want, `附件沒有「${name}」`).toBeTruthy();
        const px = run(patch);
        for (const part of ['灰階', '色塊', '純色', '透明度'] as const) {
          const keys = Object.keys(want[part]);
          expect(keys.length).toBe(SAMPLE_POINTS[part].length);
          keys.forEach((key, i) => {
            const [x, y] = SAMPLE_POINTS[part][i];
            const o = (y * W + x) * 4;
            const got = [px[o], px[o + 1], px[o + 2], px[o + 3]];
            const exp = parse(want[part][key]);
            const where = `${part} ${key}`;
            expect(got[3], `${where} 不透明度`).toBe(exp[3]);
            if (exp[3] === 0) return;
            const tol = exp[3] === 255 ? 2 : 3;
            for (let c = 0; c < 3; c++) {
              expect(Math.abs(got[c] - exp[c]), `${where}：${got} ≠ ${exp}`).toBeLessThanOrEqual(
                tol,
              );
            }
            if (exp[3] === 255) {
              opaqueChecked++;
              if (got[0] === exp[0] && got[1] === exp[1] && got[2] === exp[2]) opaqueExact++;
            }
          });
        }
      });
    }
  }
  it('不透明像素的取樣全部逐值相同（差 0）', () => {
    expect(opaqueChecked).toBeGreaterThan(2500);
    expect(opaqueExact).toBe(opaqueChecked);
  });
});

describe('調色的規則', () => {
  it('附件的設定組合都涵蓋到（每一組都有對應的設定）', () => {
    for (const [groupName, group] of Object.entries(TONE)) {
      if (groupName === '原圖') continue;
      expect(Object.keys(SETTINGS[groupName]).sort()).toEqual(Object.keys(group).sort());
    }
  });

  it('飽和度 0：灰的亮度是最亮與最暗通道的平均（(220,40,40) → 130）', () => {
    const px = new Uint8ClampedArray([220, 40, 40, 255]);
    const g = defaultGlobalAdjust();
    g.saturation = 0;
    applyAdjust(px, compileAdjust(g, null));
    expect([...px]).toEqual([130, 130, 130, 255]);
  });

  it('亮度 +50：64 → 114；曝光 +50 加倍；完全透明不動、不透明度不變', () => {
    const g = defaultGlobalAdjust();
    g.brightness = 50;
    const px = new Uint8ClampedArray([64, 64, 64, 255, 64, 64, 64, 0, 64, 64, 64, 77]);
    applyAdjust(px, compileAdjust(g, null));
    expect([...px]).toEqual([114, 114, 114, 255, 64, 64, 64, 0, 114, 114, 114, 77]);
    const e = defaultGlobalAdjust();
    e.exposure = 50;
    const q = new Uint8ClampedArray([50, 100, 200, 255]);
    applyAdjust(q, compileAdjust(e, null));
    expect([...q]).toEqual([100, 200, 255, 255]);
  });

  it('對比的斜率（F39）與曝光的倍率（F40）', () => {
    const slope = (c: number) => (259 * (c + 255)) / (255 * (259 - c));
    expect(slope(-100)).toBeCloseTo(0.44, 2);
    expect(slope(-50)).toBeCloseTo(0.69, 1);
    expect(slope(20)).toBeCloseTo(1.17, 2);
    expect(slope(50)).toBeCloseTo(1.48, 2);
    expect(slope(100)).toBeCloseTo(2.27, 1);
    const g = defaultGlobalAdjust();
    g.exposure = -100;
    const px = new Uint8ClampedArray([200, 100, 40, 255]);
    applyAdjust(px, compileAdjust(g, null));
    expect([...px]).toEqual([50, 25, 10, 255]);
  });

  it('預設值什麼都不改（identity）', () => {
    const c = compileAdjust(defaultGlobalAdjust(), defaultAssetAdjust());
    expect(c.identity).toBe(true);
    const px = measureImage();
    const before = px.slice();
    applyAdjust(px, c);
    expect(px).toEqual(before);
  });

  it('曲線是折線、兩端以外延伸；重複的 x 不出錯', () => {
    const lut = buildCurveLut(pts([0, 0], [64, 128], [255, 255]));
    expect(lut[32]).toBe(64);
    expect(lut[128]).toBe(171);
    const ends = buildCurveLut(pts([40, 10], [200, 250]));
    expect([ends[0], ends[40], ends[200], ends[255]]).toEqual([10, 10, 250, 250]);
    const dup = buildCurveLut(pts([0, 0], [100, 20], [100, 200], [255, 255]));
    expect(Array.from(dup).every((v) => Number.isInteger(v))).toBe(true);
    expect(dup[100]).toBe(20);
  });

  it('漸層：色標依位置排序、兩端延伸；點色帶取色（F43）', () => {
    const lut = buildGradientLut(OFF_ENDS)!;
    expect([lut[0], lut[1], lut[2]]).toEqual([255, 0, 0]);
    expect([lut[255 * 3], lut[255 * 3 + 2]]).toEqual([0, 255]);
    /* 50% 取第 128 階（舊版同樣以 round(位置 × 2.55) 查表），所以略偏中間色標之後 */
    expect(gradientColorAt(DEFAULT_STOPS, 50)).toBe('#65758b');
    expect(gradientColorAt(DEFAULT_STOPS, 0)).toBe('#0f172a');
  });

  it('個別漸層勾選套用、強度 0%：整體漸層也消失（3.8.4）', () => {
    const g = defaultGlobalAdjust();
    grad(TWO, 'normal')(g);
    const a = defaultAssetAdjust();
    grad(THREE, 'normal', 0)(a);
    expect(compileAdjust(g, a).grad).toBeNull();
    expect(compileAdjust(g, defaultAssetAdjust()).grad).not.toBeNull();
  });

  it('「個別調整」角標只在有實際個別調色時（第 5 節第 9 項）', () => {
    expect(isAssetAdjustActive(null)).toBe(false);
    expect(isAssetAdjustActive(defaultAssetAdjust())).toBe(false);
    const a = defaultAssetAdjust();
    a.contrast = 3;
    expect(isAssetAdjustActive(a)).toBe(true);
    const b = defaultAssetAdjust();
    b.curves.r = pts([0, 0], [128, 140], [255, 255]);
    expect(isAssetAdjustActive(b)).toBe(true);
  });

  it('讀回的值整理：缺的補預設、超出範圍夾回、壞的色標換成預設', () => {
    const s = sanitizeAdjust(
      { hue: 999, saturation: -5, gradient: { stops: [{ pos: 5, color: 'red' }] } },
      'global',
    );
    expect(s.hue).toBe(180);
    expect(s.saturation).toBe(0);
    expect(s.gradient.stops).toEqual(DEFAULT_STOPS);
    expect(s.curves.all).toEqual(pts([0, 0], [255, 255]));
    const a = sanitizeAdjust({ saturation: -300 }, 'asset');
    expect(a.saturation).toBe(-100);
  });
});
