/**
 * 立繪裁切器的效果與輸出（規格 3.3 與第 7 節裁定）：
 * 設定 → 效果參數；實線粗細、線條透明度等於設定值、角色像素（含半透明）不變、
 * 兩種光暈有區別、陰影是整個剪影往右下的偏移；輸出 PNG 為 8-bit RGBA 且像素原值照存。
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
/** 從輪廓往左量：d＝1 是 x＝49 */
const left = (b: RgbaBuffer, n = 45, y = 150) =>
  Array.from({ length: n }, (_, i) => alphaAt(b, 49 - i, y));

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
    const r = right(out, 60);
    const l = left(out, 60);
    expect(r[0]).toBeGreaterThan(0);
    const reachR = r.findLastIndex((a) => a > 0) + 1;
    const reachL = l.findLastIndex((a) => a > 0) + 1;
    expect(reachR).toBeGreaterThan(reachL);
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
