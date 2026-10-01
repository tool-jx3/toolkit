/**
 * 濾鏡預設（core/image FILTER_PRESETS）對照 bg-motion 附件的量測值：
 * 中央色（9 種單色）、灰底分布（5 × 5 點）、邊緣剖面（黑白交界）、漸層列，逐點比對（每種濾鏡各自的容許差）；
 * 有顆粒的三種另外檢查雜訊標準差與「每格不同」。舊式螢幕（P12）的掃描線相位無法由附件決定，改驗規格描述的數值。
 */
import { describe, expect, it } from 'vitest';
import {
  applyFilterOps,
  applyFilterRows,
  FILTER_PRESET_IDS,
  FILTER_PRESETS,
  type FilterOp,
  type FilterPresetId,
  filterIsAnimated,
} from '@/core/image';

import BG_JSON from '../../../docs/refactor/specs/bg-motion.examples.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const REF = (BG_JSON as any).圖片處理.濾鏡 as Record<
  string,
  {
    中央色: Record<string, string>;
    灰底分布: string[][];
    邊緣剖面: string[];
    漸層列: string[];
    雜訊標準差: number;
    每格不同: boolean;
  }
>;

const W = 320;
const H = 180;
const INPUTS: [string, number[]][] = [
  ['黑(0,0,0)', [0, 0, 0]],
  ['灰(64)', [64, 64, 64]],
  ['灰(128)', [128, 128, 128]],
  ['灰(192)', [192, 192, 192]],
  ['白(255)', [255, 255, 255]],
  ['紅(220,40,40)', [220, 40, 40]],
  ['綠(40,180,60)', [40, 180, 60]],
  ['藍(40,70,210)', [40, 70, 210]],
  ['膚色(230,180,150)', [230, 180, 150]],
];
const XS = [6, 80, 160, 240, 313];
const YS = [3, 45, 90, 135, 176];

function image(f: (x: number, y: number) => number[]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = f(x, y);
      a.set([r, g, b, 255], (y * W + x) * 4);
    }
  return a;
}
const solid = (c: number[]) => image(() => c);
const EDGE = image((x) => (x < 160 ? [0, 0, 0] : [255, 255, 255]));
const GRAD = image((x) => {
  const v = Math.floor((x * 255) / (W - 1));
  return [v, v, v];
});
const px = (img: Uint8ClampedArray, x: number, y: number) => {
  const o = (y * W + x) * 4;
  return [img[o], img[o + 1], img[o + 2]];
};
const parse = (s: string) => s.split(',').map(Number);
const diff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** 規格代號 → id */
const PID = (id: FilterPresetId) =>
  `P${String(FILTER_PRESET_IDS.indexOf(id) + 1).padStart(2, '0')}`;

/** 每種濾鏡的容許差（0～255，實測最大差 + 1；有顆粒的是去掉顆粒後與含雜訊的量測值比） */
const TOL: Partial<Record<FilterPresetId, number>> = {
  mono: 1,
  sepia: 1,
  posterize: 1,
  contrast: 1,
  soft: 4,
  sharpen: 2,
  'line-dark': 1,
  'line-light': 1,
  ink: 4,
  mosaic: 1,
  grain: 20,
  vignette: 4,
  'rgb-split': 2,
  dawn: 7,
  noon: 2,
  dusk: 11,
  night: 4,
  midnight: 3,
  moonlit: 9,
  horror: 12,
  fog: 8,
  neon: 9,
  underwater: 5,
  dream: 10,
  faded: 11,
};

/** 去掉顆粒（逐點比對用；顆粒另外驗） */
const noGrain = (ops: readonly FilterOp[]) => ops.filter((o) => o.op !== 'grain');

function measure(id: FilterPresetId) {
  const ref = REF[PID(id)];
  const ops = noGrain(FILTER_PRESETS[id]);
  /* 上下一致的測試圖只算第 90 列（applyFilterRows）；灰底分布要整張（暗角、漸層、光團隨位置變） */
  const run = (img: Uint8ClampedArray) => {
    const row = applyFilterRows(img.subarray(90 * W * 4, 91 * W * 4), W, H, [90], ops, {
      frame: 0,
    });
    const out = new Uint8ClampedArray(W * H * 4);
    out.set(row, 90 * W * 4);
    return out;
  };
  const rows: { what: string; got: number[]; want: number[] }[] = [];
  for (const [name, c] of INPUTS)
    rows.push({
      what: `中央色 ${name}`,
      got: px(run(solid(c)), 160, 90),
      want: parse(ref.中央色[name]),
    });
  const gray = applyFilterOps(solid([128, 128, 128]), W, H, ops, { frame: 0 });
  YS.forEach((y, r) => {
    XS.forEach((x, c) => {
      rows.push({ what: `灰底 (${c},${r})`, got: px(gray, x, y), want: parse(ref.灰底分布[r][c]) });
    });
  });
  const edge = run(EDGE);
  ref.邊緣剖面.forEach((s, i) => {
    rows.push({ what: `邊緣 x=${140 + i * 2}`, got: px(edge, 140 + i * 2, 90), want: parse(s) });
  });
  const grad = run(GRAD);
  ref.漸層列.forEach((s, i) => {
    rows.push({ what: `漸層 x=${i * 16}`, got: px(grad, i * 16, 90), want: parse(s) });
  });
  return rows;
}

describe('濾鏡預設：附件量測值', () => {
  it('26 種、依規格順序', () => {
    expect(FILTER_PRESET_IDS).toHaveLength(26);
    expect(Object.keys(FILTER_PRESETS).sort()).toEqual([...FILTER_PRESET_IDS].sort());
    expect(PID('mono')).toBe('P01');
    expect(PID('faded')).toBe('P26');
    for (const id of FILTER_PRESET_IDS) expect(REF[PID(id)]).toBeDefined();
  });

  for (const id of FILTER_PRESET_IDS) {
    if (id === 'crt') continue;
    it(`${PID(id)} ${id}：逐點在容許差 ${TOL[id]} 以內`, () => {
      const tol = TOL[id] ?? 0;
      const bad = measure(id)
        .filter((r) => diff(r.got, r.want) > tol)
        .map((r) => `${r.what}: ${r.got} vs ${r.want}`);
      expect(bad).toEqual([]);
    });
  }

  it('P12 舊式螢幕：偏綠的中灰、RGB 錯開、每 3 px 一條暗掃描線、四周變暗', () => {
    const ops = FILTER_PRESETS.crt;
    const gray = applyFilterOps(solid([128, 128, 128]), W, H, ops);
    /* 非掃描線的列：中灰 → 約 (115,128,119) */
    expect(diff(px(gray, 160, 90), [115, 128, 119])).toBeLessThanOrEqual(3);
    /* 每 3 列一條暗線 */
    const rowsR = [89, 90, 91, 92, 93, 94].map((y) => px(gray, 160, y)[0]);
    expect(rowsR[2]).toBeLessThan(rowsR[1] - 10);
    expect(rowsR[5]).toBe(rowsR[2]);
    expect(rowsR[3]).toBe(rowsR[1]);
    /* 中央 40 × 40 紅色通道的標準差（附件 9.4） */
    const vals: number[] = [];
    for (let y = 70; y < 110; y++) for (let x = 140; x < 180; x++) vals.push(px(gray, x, y)[0]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(Math.abs(sd - REF.P12.雜訊標準差)).toBeLessThan(1.5);
    /* 錯開：附件的邊緣剖面，藍在 158 已變白、綠在 160、紅到 164 才變白 */
    const edge = applyFilterOps(EDGE, W, H, ops);
    const at = (x: number) => px(edge, x, 90);
    const white = (v: number) => v > 150;
    const ref = REF.P12.邊緣剖面.map(parse);
    for (let i = 0; i < ref.length; i++) {
      const got = at(140 + i * 2);
      expect(got.map(white)).toEqual(ref[i].map(white));
    }
    /* 四周較暗 */
    expect(px(gray, 6, 90)[1]).toBeLessThan(px(gray, 160, 90)[1]);
    expect(px(gray, 6, 3)[1]).toBeLessThan(px(gray, 6, 90)[1]);
  });

  it('有顆粒的三種：每格不同、標準差接近附件；其他每格相同', () => {
    for (const id of FILTER_PRESET_IDS) {
      const ref = REF[PID(id)];
      expect(filterIsAnimated(FILTER_PRESETS[id]), id).toBe(ref.每格不同);
      if (!ref.每格不同) continue;
      const a = applyFilterOps(solid([128, 128, 128]), W, H, FILTER_PRESETS[id], { frame: 0 });
      const b = applyFilterOps(solid([128, 128, 128]), W, H, FILTER_PRESETS[id], { frame: 1 });
      const again = applyFilterOps(solid([128, 128, 128]), W, H, FILTER_PRESETS[id], { frame: 0 });
      expect(a).not.toEqual(b);
      /* 決定性：同一格重畫一樣 */
      expect(a).toEqual(again);
      const vals: number[] = [];
      for (let y = 70; y < 110; y++) for (let x = 140; x < 180; x++) vals.push(px(a, x, y)[0]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      expect(Math.abs(sd - ref.雜訊標準差) / ref.雜訊標準差, id).toBeLessThan(0.25);
    }
  });
});
