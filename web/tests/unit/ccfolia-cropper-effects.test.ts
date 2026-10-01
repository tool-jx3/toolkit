/**
 * 立繪裁切器的效果與輸出（規格 3.3 與第 7 節裁定）：
 * 設定 → 效果參數；實線粗細、線條透明度等於設定值、角色像素（含半透明）不變、
 * 兩種光暈有區別、陰影是整個剪影往右下的偏移；輸出 PNG 為 8-bit RGBA 且像素原值照存。
 * 對等驗證後的追加裁定：模糊以 σ ＝ 模糊值計算，兩種光暈的總量都和舊版下載相近（±20%），柔和比強烈淡。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RgbaBuffer, type Settings } from '@/tools/ccfolia-cropper/logic';
import {
  applyEffects,
  type EffectParams,
  effectKey,
  effectParams,
  encodeOutput,
} from '@/tools/ccfolia-cropper/process';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

/** 300 × 300 透明底，中間 200 × 200 的不透明方塊（x、y 50～249），外圍一圈 1 px、透明度 128 的邊 */
function square(): RgbaBuffer {
  const w = 300;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 50; y <= 249; y++)
    for (let x = 50; x <= 249; x++) {
      const edge = x === 50 || x === 249 || y === 50 || y === 249;
      data.set([40, 80, 220, edge ? 128 : 255], (y * w + x) * 4);
    }
  return { data, width: w, height: w };
}

const alphaAt = (b: RgbaBuffer, x: number, y: number) => b.data[(y * b.width + x) * 4 + 3];
const pixelAt = (b: RgbaBuffer, x: number, y: number) =>
  Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
/** 從輪廓往右量：d＝1 是 x＝250 */
const right = (b: RgbaBuffer, n = 45, y = 150) =>
  Array.from({ length: n }, (_, i) => alphaAt(b, 250 + i, y));
/** 從輪廓往左量：d＝1 是 x＝49（最多量到圖的左緣 x＝0） */
const left = (b: RgbaBuffer, n = 45, y = 150) =>
  Array.from({ length: Math.min(n, 50) }, (_, i) => alphaAt(b, 49 - i, y));

const settings = (patch: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS,
  effectOn: true,
  effectColor: '#ff0000',
  ...patch,
});
const params = (patch: Partial<Settings>) => effectParams(settings(patch)) as EffectParams;

describe('設定 → 效果參數', () => {
  it('沒開效果時是 null；不透明度換成 0～1', () => {
    expect(effectParams(DEFAULT_SETTINGS)).toBeNull();
    expect(params({ effectOpacity: 25 })).toEqual({
      style: 'stroke',
      color: '#ff0000',
      width: 5,
      blur: 12,
      offset: 8,
      opacity: 0.25,
    });
  });

  it('比對鍵只看這個樣式用得到的參數', () => {
    expect(effectKey(null)).toBe('off');
    expect(effectKey(params({ effectBlur: 3 }))).toBe(effectKey(params({ effectBlur: 30 })));
    expect(effectKey(params({ effectStyle: 'glow-soft', effectBlur: 3 }))).not.toBe(
      effectKey(params({ effectStyle: 'glow-soft', effectBlur: 30 })),
    );
    expect(effectKey(params({ effectStyle: 'glow-soft', effectOffset: 3 }))).toBe(
      effectKey(params({ effectStyle: 'glow-soft', effectOffset: 30 })),
    );
    expect(effectKey(params({ effectStyle: 'shadow', effectOffset: 3 }))).not.toBe(
      effectKey(params({ effectStyle: 'shadow', effectOffset: 30 })),
    );
  });
});

describe('效果（下載圖與預覽共用）', () => {
  const src = square();

  it('不擴大輸出尺寸；角色本身（含半透明的邊）原封不動', () => {
    for (const style of ['stroke', 'glow-soft', 'glow-strong', 'shadow'] as const) {
      for (const opacity of [0, 50, 100]) {
        const out = applyEffects(src, params({ effectStyle: style, effectOpacity: opacity }));
        expect([out.width, out.height]).toEqual([300, 300]);
        expect(pixelAt(out, 150, 150), style).toEqual([40, 80, 220, 255]);
        expect(pixelAt(out, 249, 150), style).toEqual([40, 80, 220, 128]);
        expect(pixelAt(out, 50, 50), style).toEqual([40, 80, 220, 128]);
      }
    }
  });

  it('實線：粗細 N 就是 N px，顏色是設定的顏色', () => {
    const at = (w: number) => right(applyEffects(src, params({ effectWidth: w })), w + 3);
    const five = at(5);
    expect(five.slice(0, 5)).toEqual([255, 255, 255, 255, 255]);
    expect(five.slice(5)).toEqual([0, 0, 0]);
    for (const w of [1, 10, 30]) {
      const p = at(w);
      expect(p[w - 1], `粗細 ${w}`).toBe(255);
      expect(p[w], `粗細 ${w}`).toBe(0);
    }
    expect(pixelAt(applyEffects(src, params({})), 252, 150)).toEqual([255, 0, 0, 255]);
    /* 不透明度 0：看不到線 */
    expect(right(applyEffects(src, params({ effectOpacity: 0 })), 10)).toEqual(Array(10).fill(0));
  });

  it('線條的透明度等於設定值（主控裁定：不再比設定值濃）', () => {
    for (const [pct, alpha] of [
      [25, 64],
      [50, 128],
      [75, 191],
      [100, 255],
    ]) {
      expect(alphaAt(applyEffects(src, params({ effectOpacity: pct })), 252, 150), `${pct}%`).toBe(
        alpha,
      );
    }
  });

  it('柔和與強烈兩種光暈有區別：柔和的實線較細、光暈較淡', () => {
    const soft = right(applyEffects(src, params({ effectStyle: 'glow-soft' })));
    const strong = right(applyEffects(src, params({ effectStyle: 'glow-strong' })));
    expect(strong.slice(0, 5)).toEqual([255, 255, 255, 255, 255]);
    expect(soft.slice(0, 3)).toEqual([255, 255, 255]);
    expect(soft[3]).toBeLessThan(255);
    for (const d of [5, 8, 12, 16]) expect(soft[d], `d ${d + 1}`).toBeLessThan(strong[d]);
    /* 光暈往外漸淡 */
    expect(strong[8]).toBeGreaterThan(strong[16]);
    expect(strong[16]).toBeGreaterThan(0);
    expect(soft[8]).toBeGreaterThan(soft[14]);
    expect(soft[14]).toBeGreaterThan(0);
  });

  it('陰影：整個剪影的影子往右下偏移（不是中空的線），右側比左側延伸得遠', () => {
    const out = applyEffects(src, params({ effectStyle: 'shadow' }));
    const r = right(out, 50);
    const l = left(out, 50);
    expect(r[0]).toBeGreaterThan(0);
    const reachR = r.findLastIndex((a) => a > 0) + 1;
    const reachL = l.findLastIndex((a) => a > 0) + 1;
    expect(reachR).toBeGreaterThan(reachL);
    /* σ ＝ 模糊值：延伸的長度和舊版下載相近（位移 8、模糊 12：舊版右側約 d 42、左側約 d 26） */
    expect(Math.abs(reachR - 42), `右側到 d ${reachR}`).toBeLessThanOrEqual(4);
    expect(Math.abs(reachL - 26), `左側到 d ${reachL}`).toBeLessThanOrEqual(4);
    /* 模糊 0：硬邊，右側 d 1～13 實色（擴張 5 ＋ 偏移 8）、左側沒有影子 */
    const hard = applyEffects(src, params({ effectStyle: 'shadow', effectBlur: 0 }));
    expect(right(hard, 15)).toEqual([...Array(13).fill(255), 0, 0]);
    expect(left(hard, 5)).toEqual([0, 0, 0, 0, 0]);
    /* 下方也有（往右下） */
    expect(alphaAt(hard, 150, 255)).toBe(255);
    /* 位移 0：影子平均分布在四周 */
    const centered = applyEffects(src, params({ effectStyle: 'shadow', effectOffset: 0 }));
    expect(right(centered, 30)).toEqual(left(centered, 30));
  });
});

describe('光暈的強度（對等驗證後的追加裁定：以舊版下載的檔案為準）', () => {
  /** 規格第 6 節的量測：600 × 600 透明底、200 × 200 不透明正方形＋外圍 1 px 透明度 128 的邊，第 300 列從輪廓往右 */
  function big(): RgbaBuffer {
    const w = 600;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 199; y <= 400; y++)
      for (let x = 199; x <= 400; x++) {
        const edge = x === 199 || x === 400 || y === 199 || y === 400;
        data.set([40, 80, 220, edge ? 128 : 255], (y * w + x) * 4);
      }
    return { data, width: w, height: w };
  }
  const src = big();
  /** profile[d − 1]＝輪廓外第 d 個像素的透明度 */
  const profile = (patch: Partial<Settings>) => {
    const out = applyEffects(src, params(patch));
    return Array.from({ length: 199 }, (_, i) => alphaAt(out, 401 + i, 300));
  };
  const solid = (p: number[]) => p.findIndex((a) => a < 255);
  const total = (p: number[], from: number) => p.slice(from - 1).reduce((s, a) => s + a, 0);
  /** 舊版下載（兩種光暈相同）：實線外的光暈總量約 1050 */
  const OLD_TOTAL = 1050;
  const near = (v: number) => Math.abs(v - OLD_TOTAL) / OLD_TOTAL;

  it('強烈與柔和的光暈總量都在舊版下載的 ±20% 內；柔和比強烈淡', () => {
    const strong = profile({ effectStyle: 'glow-strong' });
    const soft = profile({ effectStyle: 'glow-soft' });
    expect(solid(strong)).toBe(5);
    expect(solid(soft)).toBe(3);
    /* 各自的實線外加總 */
    const ts = total(strong, 6);
    const tf = total(soft, 4);
    expect(near(ts), `強烈 ${ts}`).toBeLessThanOrEqual(0.2);
    expect(near(tf), `柔和 ${tf}`).toBeLessThanOrEqual(0.2);
    /* 柔和從粗細 5 外起算也在 ±20% 內 */
    expect(near(total(soft, 6)), `柔和 d≥6 ${total(soft, 6)}`).toBeLessThanOrEqual(0.2);
    expect(tf).toBeLessThan(ts);
    /* 每個距離上柔和都不比強烈濃（實線外） */
    for (let d = 4; d <= 60; d++) expect(soft[d - 1], `d ${d}`).toBeLessThanOrEqual(strong[d - 1]);
    expect(soft[9]).toBeLessThan(strong[9]);
  });

  it('模糊以 σ ＝ 模糊值計算：強烈光暈的形狀和舊版下載相近（透明度 ±10）', () => {
    const strong = profile({ effectStyle: 'glow-strong' });
    /* 規格 3.3：模糊 12 時 d 6 約 80、d 10 約 72、d 15 約 52、d 20 約 32、d 25 約 17、d 30 約 5，約 d 34 結束 */
    for (const [d, a] of [
      [6, 80],
      [10, 72],
      [15, 52],
      [20, 32],
      [25, 17],
      [30, 5],
    ])
      expect(Math.abs(strong[d - 1] - a), `d ${d}：${strong[d - 1]}`).toBeLessThanOrEqual(10);
    const end = strong.findLastIndex((a) => a > 0) + 1;
    expect(Math.abs(end - 34), `結束 d ${end}`).toBeLessThanOrEqual(4);
    /* 模糊 0 當成 1 px：d 6 約 136、很快結束；模糊 40：d 6 約 27、緩慢降到約 d 97 */
    const b0 = profile({ effectStyle: 'glow-strong', effectBlur: 0 });
    expect(Math.abs(b0[5] - 136)).toBeLessThanOrEqual(40);
    expect(b0[9]).toBe(0);
    const b40 = profile({ effectStyle: 'glow-strong', effectBlur: 40 });
    expect(Math.abs(b40[5] - 27)).toBeLessThanOrEqual(10);
    expect(b40[89]).toBeGreaterThan(0);
  });
});

describe('輸出 PNG', () => {
  const pixelsOf = (bytes: Uint8Array) => {
    const chunks = parseChunks(bytes);
    const { width, height, bitDepth, colorType } = readIhdr(chunks);
    const z = new Uint8Array(
      chunks.filter((c) => c.type === 'IDAT').flatMap((c) => Array.from(c.data)),
    );
    return { width, height, bitDepth, colorType, data: decodePixels(z, width, height, colorType) };
  };

  it('沒有效果：8-bit RGBA，像素原值照存（含半透明與完全透明像素的顏色）', async () => {
    const src: RgbaBuffer = { data: new Uint8ClampedArray(3 * 2 * 4), width: 3, height: 2 };
    src.data.set([10, 20, 30, 0, 200, 100, 50, 1, 7, 8, 9, 128, 255, 255, 255, 255]);
    const got = pixelsOf(await encodeOutput(src, null));
    expect([got.width, got.height, got.bitDepth, got.colorType]).toEqual([3, 2, 8, 6]);
    expect(Array.from(got.data)).toEqual(Array.from(src.data));
  });

  it('有效果：與預覽用的同一段處理結果相同（所見即所得）', async () => {
    const src = square();
    const p = params({ effectStyle: 'glow-strong', effectColor: '#3366cc' });
    const got = pixelsOf(await encodeOutput(src, p));
    expect(Array.from(got.data)).toEqual(Array.from(applyEffects(src, p).data));
  });
});
