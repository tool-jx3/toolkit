/**
 * 濾鏡預設（core/image FILTER_PRESETS）對照 bg-motion 附件的量測值，量法照附件「圖片處理」的說明（320 × 180）：
 * 中央色＝輸入單色時畫面正中央 7 × 7 的平均；灰底分布＝中灰在橫縱 2%、25%、50%、75%、98% 處 5 × 5 的平均；
 * 邊緣剖面與漸層列＝中間一列（y＝90）的單點。容許差照規格 3.10：中央色與分布每通道 ±4、交界與漸層 ±6。
 * 有顆粒的三種（粗顆粒、驚悚、褪色照片）去掉顆粒後比，再加上原作顆粒在該量法下的幅度；顆粒另外驗標準差與「每格不同」。
 * 舊式螢幕（P12）另外逐點比對掃描線的相位（原作第 0、3、6… 列變暗，附件的 y＝90 是暗線）。
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
const FRACS = [0.02, 0.25, 0.5, 0.75, 0.98];
/** 中間一列 */
const ROW = Math.round(H / 2);

/** 規格 3.10 的容許差 */
const TOL_AVG = 4;
const TOL_PROFILE = 6;
/**
 * 有顆粒的濾鏡：附件的量測值含原作的顆粒（每像素 ±半寬 的均勻亂數），去掉顆粒的新版要多留這個幅度：
 * avg＝7 × 7、5 × 5 平均後的約 3 個標準差，px＝單點的半寬（粗顆粒 34 不同色、驚悚 10、褪色照片 16）。
 */
const NOISE: Partial<Record<FilterPresetId, { avg: number; px: number }>> = {
  grain: { avg: 6, px: 17 },
  horror: { avg: 2, px: 5 },
  faded: { avg: 3, px: 8 },
};

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
/** 附件的量法：(寬 − 1) × fx、(高 − 1) × fy 四捨五入為中心，邊長 2s + 1 的平均（各色四捨五入） */
const patch = (img: Uint8ClampedArray, fx: number, fy: number, s: number) => {
  const cx = Math.round((W - 1) * fx);
  const cy = Math.round((H - 1) * fy);
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, cy - s); y <= Math.min(H - 1, cy + s); y++)
    for (let x = Math.max(0, cx - s); x <= Math.min(W - 1, cx + s); x++) {
      const p = px(img, x, y);
      for (let c = 0; c < 3; c++) sum[c] += p[c];
      n++;
    }
  return sum.map((v) => Math.round(v / n));
};
const parse = (s: string) => s.split(',').map(Number);
const diff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** 規格代號 → id */
const PID = (id: FilterPresetId) =>
  `P${String(FILTER_PRESET_IDS.indexOf(id) + 1).padStart(2, '0')}`;

/** 去掉顆粒（逐點比對用；顆粒另外驗） */
const noGrain = (ops: readonly FilterOp[]) => ops.filter((o) => o.op !== 'grain');

/** 上下一致的測試圖只算中間 7 列（applyFilterRows），放回整張的位置 */
const MID_ROWS = Array.from({ length: 7 }, (_, i) => ROW - 3 + i);
function runMid(img: Uint8ClampedArray, ops: readonly FilterOp[]) {
  const rows = applyFilterRows(
    img.subarray(MID_ROWS[0] * W * 4, (MID_ROWS[6] + 1) * W * 4),
    W,
    H,
    MID_ROWS,
    ops,
    { frame: 0 },
  );
  const out = new Uint8ClampedArray(W * H * 4);
  out.set(rows, MID_ROWS[0] * W * 4);
  return out;
}

interface Row {
  what: string;
  got: number[];
  want: number[];
  tol: number;
}

function measure(id: FilterPresetId): Row[] {
  const ref = REF[PID(id)];
  const ops = noGrain(FILTER_PRESETS[id]);
  const noise = NOISE[id] ?? { avg: 0, px: 0 };
  const avg = TOL_AVG + noise.avg;
  const prof = TOL_PROFILE + noise.px;
  const rows: Row[] = [];
  for (const [name, c] of INPUTS)
    rows.push({
      what: `中央色 ${name}`,
      got: patch(runMid(solid(c), ops), 0.5, 0.5, 3),
      want: parse(ref.中央色[name]),
      tol: avg,
    });
  /* 灰底分布要整張（暗角、漸層、光團、掃描線隨位置變） */
  const gray = applyFilterOps(solid([128, 128, 128]), W, H, ops, { frame: 0 });
  FRACS.forEach((fy, r) => {
    FRACS.forEach((fx, c) => {
      rows.push({
        what: `灰底 (${c},${r})`,
        got: patch(gray, fx, fy, 2),
        want: parse(ref.灰底分布[r][c]),
        tol: avg,
      });
    });
  });
  const edge = runMid(EDGE, ops);
  ref.邊緣剖面.forEach((s, i) => {
    const x = 140 + i * 2;
    rows.push({ what: `邊緣 x=${x}`, got: px(edge, x, ROW), want: parse(s), tol: prof });
  });
  const grad = runMid(GRAD, ops);
  ref.漸層列.forEach((s, i) => {
    const x = i * 16;
    rows.push({ what: `漸層 x=${x}`, got: px(grad, x, ROW), want: parse(s), tol: prof });
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
    const noise = NOISE[id];
    const label = noise
      ? `分布 ±${TOL_AVG + noise.avg}、交界與漸層 ±${TOL_PROFILE + noise.px}（含原作顆粒的幅度）`
      : `分布 ±${TOL_AVG}、交界與漸層 ±${TOL_PROFILE}`;
    it(`${PID(id)} ${id}：中央色與${label}`, () => {
      const bad = measure(id)
        .filter((r) => diff(r.got, r.want) > r.tol)
        .map((r) => `${r.what}: ${r.got} vs ${r.want}`);
      expect(bad).toEqual([]);
    });
  }

  it('P12 舊式螢幕：掃描線在第 0、3、6… 列（附件 y＝90 的單點是暗線上的值），逐點比對', () => {
    const ops = FILTER_PRESETS.crt;
    /* 整張圖（不是只算幾列）：中灰的中央一欄，每 3 列一條暗線，相位與原作相同 */
    const gray = applyFilterOps(solid([128, 128, 128]), W, H, ops);
    for (let y = 84; y <= 96; y++) {
      const v = px(gray, 160, y)[1];
      if (y % 3 === 0) {
        expect(v, `y=${y}`).toBeLessThan(px(gray, 160, y - 1)[1] - 10);
        expect(v, `y=${y}`).toBeLessThan(px(gray, 160, y + 1)[1] - 10);
      } else {
        expect(px(gray, 160, y - (y % 3))[1], `y=${y}`).toBeLessThan(v - 10);
      }
    }
    /* 附件第 90 列：黑白交界與漸層的單點（暗線上）逐點 ±6；錯一列的話白會亮約 16%（> 30） */
    const edge = applyFilterOps(EDGE, W, H, ops);
    REF.P12.邊緣剖面.forEach((s, i) => {
      const x = 140 + i * 2;
      expect(diff(px(edge, x, 90), parse(s)), `邊緣 x=${x}`).toBeLessThanOrEqual(TOL_PROFILE);
      /* 下一列不是暗線：比附件亮 */
      if (parse(s)[1] > 150) expect(px(edge, x, 91)[1] - parse(s)[1]).toBeGreaterThan(20);
    });
    const grad = applyFilterOps(GRAD, W, H, ops);
    REF.P12.漸層列.forEach((s, i) => {
      expect(diff(px(grad, i * 16, 90), parse(s)), `漸層 x=${i * 16}`).toBeLessThanOrEqual(
        TOL_PROFILE,
      );
    });
    /* 中央 40 × 40 紅色通道的標準差（附件 9.4；掃描線造成） */
    const vals: number[] = [];
    for (let y = 70; y < 110; y++) for (let x = 100; x < 140; x++) vals.push(px(gray, x, y)[0]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(Math.abs(sd - REF.P12.雜訊標準差)).toBeLessThan(1);
  });

  it('有顆粒的三種：每格不同、標準差接近附件（±30%）；其他每格相同', () => {
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
      /* 附件的量法：中央偏左 40 × 40（x 100～139、y 70～109）紅色通道 */
      const vals: number[] = [];
      for (let y = 70; y < 110; y++) for (let x = 100; x < 140; x++) vals.push(px(a, x, y)[0]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      expect(Math.abs(sd - ref.雜訊標準差) / ref.雜訊標準差, id).toBeLessThan(0.3);
    }
  });
});
