/**
 * 錄影帶畫面產生器：NTSC 訊號模擬（ntsc.ts）和 ntsc-rs 本身的數值對照。
 *
 * 基準檔 `fixtures/vhs-frame-ntsc-oracle.json` 是 ntsc-rs（crates/ntscrs，commit 8cfc510，MIT）編譯出來的小程式跑的：
 * 32 × 16 的合成圖（色條＋上下的明暗＋斜紋，算式同下面的 `image()`），每一組設定（預設、每一步單獨打開、幾組組合與半解析度，影格 0～9）
 * 以 f32 的 RGB 套 `apply_effect_to_buffer`，結果取到小數 4 位。產生的程式：`web/scripts/ntsc-oracle/`（`cargo run --release`，
 * 輸出的 JSON 把 input 與每一組的 rgb 取到小數 4 位、加上 source 欄就是基準檔）。
 * ntsc-rs 是 f32、這裡是倍精度，所以比的是「最大差 ≤ 2e-4」（濾波器的累積誤差約 1e-5；雪花與磁頭切換的位置完全相同）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyNtscRgb,
  blend,
  butterworth,
  defaultNtscParams,
  lowpass,
  type NtscParams,
  notch,
  SplitMix,
  simplex1,
  simplex2,
} from '@/tools/vhs-frame/ntsc';
import oracle from './fixtures/vhs-frame-ntsc-oracle.json';

const W = oracle.width;
const H = oracle.height;
const f32 = Math.fround;

/** 和 oracle 相同的合成圖（f32） */
function image(): Float32Array {
  const v = new Float32Array(W * H * 3);
  const bands = [
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 1],
    [0, 1, 0],
    [1, 0, 1],
    [1, 0, 0],
    [0, 0, 1],
    [0.1, 0.1, 0.1],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const c = bands[Math.floor(x / 4) % 8];
      const fade = f32(0.25 + f32(0.75 * f32(y / (H - 1))));
      const stripe = (x + y) % 5 === 0 ? 0.15 : 0;
      for (let k = 0; k < 3; k++) v[o + k] = f32(f32(f32(c[k] * fade) * 0.8) + stripe);
    }
  return v;
}

/** 每一步都關掉（oracle 的 neutral()） */
function neutral(): NtscParams {
  return {
    ...defaultNtscParams(),
    inputLuma: 'none',
    chromaIn: 'none',
    compositeSharpening: 0,
    compositeNoise: null,
    snow: 0,
    headSwitching: null,
    trackingNoise: null,
    lumaSmear: 0,
    ringing: null,
    lumaNoise: null,
    chromaNoise: null,
    chromaPhaseError: 0,
    chromaPhaseNoise: 0,
    chromaDelay: { h: 0, v: 0 },
    vhs: null,
    chromaVertBlend: false,
    chromaOut: 'none',
  };
}

const D = defaultNtscParams();
const DEF_VHS = D.vhs as NonNullable<NtscParams['vhs']>;
const DEF_HS = D.headSwitching as NonNullable<NtscParams['headSwitching']>;
const DEF_TN = D.trackingNoise as NonNullable<NtscParams['trackingNoise']>;

/** oracle 的每一組設定 */
const CASES: Record<string, () => NtscParams> = {
  default: () => D,
  'default-f3': () => D,
  neutral,
  'neutral-both': () => ({ ...neutral(), fields: 'both' }),
  'luma-notch': () => ({ ...neutral(), inputLuma: 'notch' }),
  'chroma-lp-in': () => ({ ...neutral(), chromaIn: 'full' }),
  'chroma-lp-light-k': () => ({ ...neutral(), chromaIn: 'light', filter: 'constantK' }),
  sharpen: () => ({ ...neutral(), compositeSharpening: 1 }),
  'composite-noise': () => ({
    ...neutral(),
    compositeNoise: { frequency: 0.5, intensity: 0.05, detail: 3 },
  }),
  snow: () => ({ ...neutral(), snow: 30, snowAnisotropy: 0.5 }),
  'head-switching': () => ({ ...neutral(), headSwitching: DEF_HS }),
  'head-switching-nomid': () => ({ ...neutral(), headSwitching: { ...DEF_HS, midLine: null } }),
  tracking: () => ({ ...neutral(), trackingNoise: { ...DEF_TN, height: 10 } }),
  'luma-smear': () => ({ ...neutral(), lumaSmear: 0.5 }),
  ringing: () => ({ ...neutral(), ringing: D.ringing }),
  'plane-noise': () => ({ ...neutral(), lumaNoise: D.lumaNoise, chromaNoise: D.chromaNoise }),
  phase: () => ({ ...neutral(), chromaPhaseError: 0.2, chromaPhaseNoise: 0.3 }),
  delay: () => ({ ...neutral(), chromaDelay: { h: 3.5, v: 1 } }),
  'delay-neg': () => ({ ...neutral(), chromaDelay: { h: -2.25, v: -1 } }),
  'vhs-lp': () => ({
    ...neutral(),
    vhs: { ...DEF_VHS, chromaLoss: 0, edgeWave: null, sharpen: null },
  }),
  'vhs-ep-all': () => ({ ...neutral(), vhs: { ...DEF_VHS, tape: 'ep', chromaLoss: 0.2 } }),
  'edge-wave': () => ({
    ...neutral(),
    vhs: {
      ...DEF_VHS,
      tape: 'none',
      edgeWave: { ...(DEF_VHS.edgeWave as NonNullable<typeof DEF_VHS.edgeWave>), intensity: 4 },
    },
  }),
  'vert-blend-lp-out': () => ({ ...neutral(), chromaVertBlend: true, chromaOut: 'full' }),
  'default-seed-sp': () => ({ ...D, seed: 12345, vhs: { ...DEF_VHS, tape: 'sp' }, snow: 5 }),
  'default-half-scale': () => ({ ...D, scale: 0.5, snow: 5 }),
  'half-scale-delay-ep': () => ({
    ...D,
    scale: 0.5,
    chromaDelay: { h: 3, v: 2 },
    vhs: { ...DEF_VHS, tape: 'ep' },
  }),
};

describe('ntsc-rs 的對照', () => {
  it('合成圖和 oracle 相同', () => {
    const img = image();
    const max = Math.max(...oracle.input.map((v, i) => Math.abs(v - img[i])));
    expect(max).toBeLessThan(6e-5);
  });

  it('每一組設定都有對照', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(oracle.cases).sort());
  });

  for (const [name, c] of Object.entries(oracle.cases)) {
    it(`${name}（影格 ${c.frame}）的結果和 ntsc-rs 相同（最大差 ≤ 2e-4）`, () => {
      const img = image();
      applyNtscRgb(img, W, H, CASES[name](), c.frame);
      let max = 0;
      let at = -1;
      for (let i = 0; i < img.length; i++) {
        const d = Math.abs(img[i] - c.rgb[i]);
        if (d > max) {
          max = d;
          at = i;
        }
      }
      expect({ max: max < 2e-4, at }).toEqual({ max: true, at });
    });
  }

  it('有作用：預設的結果和原圖不同（每一步都有改到畫面）', () => {
    const img = image();
    const before = image();
    applyNtscRgb(img, W, H, D, 0);
    let diff = 0;
    for (let i = 0; i < img.length; i++) diff = Math.max(diff, Math.abs(img[i] - before[i]));
    expect(diff).toBeGreaterThan(0.05);
  });
});

describe('左邊補邊（畫布上用）', () => {
  it('補 pad 個再丟掉＝把補好的圖照 ntsc-rs 算、再裁掉左邊（逐值相同）', () => {
    const P = 32;
    const img = image();
    const padded = new Float32Array((W + P) * H * 3);
    for (let y = 0; y < H; y++)
      for (let x = -P; x < W; x++)
        for (let c = 0; c < 3; c++)
          padded[(y * (W + P) + x + P) * 3 + c] = img[(y * W + Math.max(0, x)) * 3 + c];
    applyNtscRgb(padded, W + P, H, D, 3);
    const out = image();
    applyNtscRgb(out, W, H, D, 3, P);
    let max = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++)
          max = Math.max(
            max,
            Math.abs(out[(y * W + x) * 3 + c] - padded[(y * (W + P) + x + P) * 3 + c]),
          );
    expect(max).toBe(0);
  });

  it('一片灰：不補邊時最左邊有一道亮線，補了之後和中間差不多', () => {
    const w = 96;
    const h = 4;
    const flat = () => new Float32Array(w * h * 3).fill(0.5);
    const quiet: NtscParams = {
      ...D,
      compositeNoise: null,
      lumaNoise: null,
      chromaNoise: null,
      snow: 0,
      chromaPhaseNoise: 0,
      headSwitching: null,
      trackingNoise: null,
      vhs: { ...DEF_VHS, edgeWave: null, chromaLoss: 0 },
    };
    const edge = (pad: number) => {
      const a = flat();
      applyNtscRgb(a, w, h, quiet, 0, pad);
      let m = 0;
      for (let x = 0; x < 8; x++) m = Math.max(m, Math.abs(a[x * 3] - a[60 * 3]));
      return m;
    };
    expect(edge(0)).toBeGreaterThan(0.05);
    expect(edge(32)).toBeLessThan(0.01);
  });
});

describe('小函式', () => {
  it('SplitMix：同樣的種子與混法得到同樣的數列，混進不同的數就不同', () => {
    const a = SplitMix.of(7).mix(3);
    const b = SplitMix.of(7).mix(3);
    const xs = [a.f32(), a.f64(), a.u32(), a.i32()];
    expect([b.f32(), b.f64(), b.u32(), b.i32()]).toEqual(xs);
    expect(SplitMix.of(7).mix(4).f32()).not.toBe(xs[0]);
    for (const v of [xs[0], xs[1]]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('simplex 雜訊：整數格點是 0、範圍有限、同樣的種子相同', () => {
    expect(simplex1(3, 99)).toBe(0);
    for (let x = 0; x < 50; x += 0.37) {
      expect(Math.abs(simplex1(x, 5))).toBeLessThan(10);
      expect(Math.abs(simplex2(x, x * 0.7, 5))).toBeLessThan(1);
      expect(simplex2(x, 1.5, 5)).toBe(simplex2(x, 1.5, 5));
    }
  });

  it('濾波器：低通、Butterworth 的直流增益是 1，陷波在中間頻率是 0', () => {
    const dc = (f: { num: number[]; den: number[] }) =>
      f.num.reduce((a, b) => a + b, 0) / (1 + f.den.reduce((a, b) => a + b, 0));
    expect(dc(lowpass(1e6, 14e6))).toBeCloseTo(1, 6);
    expect(dc(butterworth(1e6, 14e6))).toBeCloseTo(1, 6);
    expect(dc(notch(0.5, 2))).toBeCloseTo(1, 6);
    /* blend(f, s)：直流照樣是 1 */
    expect(dc(blend(lowpass(1e6, 14e6), -1.6))).toBeCloseTo(1, 6);
  });
});
