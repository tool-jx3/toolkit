/**
 * 立繪去背工具（bg-remover）的 AI 前後處理：與 SkyTNT/anime-segmentation `inference.py` 的 `get_mask()` 逐值比對。
 *
 * 參考值（tests/unit/fixtures/bg-remover-getmask.json）由 Python 腳本以 OpenCV 產生（推論尺寸 s ＝ 12，
 * 十一種尺寸：放大、縮小、正方形、極寬、1 × 5、剛好 s × s，以及 OpenCV 改走「剛好縮小一半」快速路徑的四種；關掉 Intel IPP，用 OpenCV 的通用實作——
 * 新版與它逐值相同；開了 IPP 的 OpenCV〔x86 的 pip 套件預設〕縮放的進位不同，最多差約 4e-5）：
 * - tensor：get_mask 送進模型的 [1, 3, s, s]（÷255、INTER_LINEAR 等比縮放、置中補 0、CHW）；
 * - mask：同一個「預測」（sin／cos 的固定式子）經過裁邊、INTER_LINEAR 縮回原尺寸的結果。
 * 產生方式見 docs/refactor/specs/bg-remover.md 第 3.1 節。
 */
import { describe, expect, it } from 'vitest';
import { isHalfSize, linearAxis, resizeLinear } from '@/core/image/resample';
import { fromModelOutput, letterbox, toModelInput } from '@/tools/bg-remover/animeSeg';
import golden from './fixtures/bg-remover-getmask.json';

interface Case {
  h0: number;
  w0: number;
  s: number;
  /** h, w, ph, pw（get_mask 的變數） */
  layout: [number, number, number, number];
  rgb: string;
  tensor: string;
  pred: string;
  mask: string;
}

const fixture = golden as unknown as { source: string; cases: Case[] };

const u8 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
/* float32 little-endian（測試環境都是 little-endian） */
const f32 = (b64: string) => new Float32Array(u8(b64).buffer);

function rgbToRgba(rgb: Uint8Array, alpha = 255): Uint8Array {
  const out = new Uint8Array((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = alpha;
  }
  return out;
}

function maxDiff(a: Float32Array, b: Float32Array) {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe('bg-remover：get_mask 的前後處理（與 OpenCV 參考值比對）', () => {
  it('參考值的來源', () => {
    expect(fixture.source).toContain('get_mask');
    expect(fixture.cases).toHaveLength(11);
  });

  for (const c of fixture.cases) {
    const name = `${c.w0}×${c.h0}（s=${c.s}）`;

    it(`${name}：縮放後的尺寸與補邊位置`, () => {
      const [h, w, ph, pw] = c.layout;
      const box = letterbox(c.w0, c.h0, c.s);
      expect({ w: box.w, h: box.h, top: box.top, left: box.left }).toEqual({
        w,
        h,
        top: Math.floor(ph / 2),
        left: Math.floor(pw / 2),
      });
    });

    it(`${name}：送進模型的張量（逐值相同）`, () => {
      const { tensor } = toModelInput(rgbToRgba(u8(c.rgb)), c.w0, c.h0, c.s);
      expect(maxDiff(tensor, f32(c.tensor))).toBe(0);
    });

    it(`${name}：原圖的透明度不影響張量（原作讀檔時丟掉透明度）`, () => {
      const a = toModelInput(rgbToRgba(u8(c.rgb), 255), c.w0, c.h0, c.s).tensor;
      const b = toModelInput(rgbToRgba(u8(c.rgb), 0), c.w0, c.h0, c.s).tensor;
      expect(maxDiff(a, b)).toBe(0);
    });

    it(`${name}：裁邊並縮回原尺寸的遮罩（逐值相同）`, () => {
      const mask = fromModelOutput(f32(c.pred), letterbox(c.w0, c.h0, c.s));
      expect(mask.length).toBe(c.w0 * c.h0);
      expect(maxDiff(mask, f32(c.mask))).toBe(0);
    });
  }

  it('預測（測試裡的固定式子）與參考值相同：sin(0.7x)·cos(0.3y) 轉到 0～1', () => {
    const c = fixture.cases[0];
    const s = c.s;
    const pred = f32(c.pred);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const f = Math.fround;
        const v = f(f(f(f(Math.sin(f(x * f(0.7)))) * f(Math.cos(f(y * f(0.3))))) + 1) / 2);
        expect(Math.abs(pred[y * s + x] - v)).toBeLessThanOrEqual(2e-7);
      }
    }
  });
});

describe('core/image：resizeLinear（OpenCV INTER_LINEAR）', () => {
  it('尺寸相同時原樣複製', () => {
    const src = Float32Array.from([1, 2, 3, 4, 5, 6]);
    expect(Array.from(resizeLinear(src, 3, 2, 1, 3, 2))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('放大兩倍：像素中心對齊，邊緣重複', () => {
    /* 2 → 4：取樣位置 −0.25、0.25、0.75、1.25 → 左邊界 = 第 0 格、右邊界 = 最後一格 */
    const out = resizeLinear(Float32Array.from([0, 1]), 2, 1, 1, 4, 1);
    expect(Array.from(out)).toEqual([0, 0.25, 0.75, 1]);
  });

  it('縮小是雙線性取樣（不是面積平均）：4 → 2 取 0.5、2.5 的位置', () => {
    const out = resizeLinear(Float32Array.from([0, 10, 20, 30]), 4, 1, 1, 2, 1);
    expect(Array.from(out)).toEqual([5, 25]);
  });

  it('多通道交錯排列各自縮放', () => {
    const src = Float32Array.from([0, 100, 1, 200]);
    const out = resizeLinear(src, 2, 1, 2, 4, 1);
    expect(Array.from(out)).toEqual([0, 100, 0.25, 125, 0.75, 175, 1, 200]);
  });

  it('兩個方向都剛好縮小一半時改走 OpenCV 的 INTER_AREA 快速路徑：加法順序不同', () => {
    expect(isHalfSize(2048, 1536, 1024, 768)).toBe(true);
    expect(isHalfSize(2049, 1536, 1024, 768)).toBe(false);
    /* 只有一個方向是一半：照雙線性 */
    expect(isHalfSize(4, 1, 2, 1)).toBe(false);
    /* 單通道 5 → … 的前 4 格：((a + b) + (c + d)) × 0.25；第 5 格：(((a + b) + c) + d) × 0.25 */
    const f = Math.fround;
    /* 這組值兩種順序的結果不同（差 float32 的最後一位） */
    const a = f(212 / 255);
    const b = f(58 / 255);
    const c = f(159 / 255);
    const d = f(5 / 255);
    const row0 = Float32Array.from([a, b, a, b, a, b, a, b, a, b]);
    const row1 = Float32Array.from([c, d, c, d, c, d, c, d, c, d]);
    const src = new Float32Array(20);
    src.set(row0);
    src.set(row1, 10);
    const out = resizeLinear(src, 10, 2, 1, 5, 1);
    const paired = f(f(f(a + b) + f(c + d)) * 0.25);
    const sequential = f(f(f(f(a + b) + c) + d) * 0.25);
    expect(paired).not.toBe(sequential);
    expect(Array.from(out)).toEqual([paired, paired, paired, paired, sequential]);
  });

  it('取樣表：比例＝1 ÷（輸出 ÷ 來源）', () => {
    const ax = linearAxis(3, 7, true);
    expect(ax.index[0]).toBe(0);
    expect(ax.frac[0]).toBe(0);
    expect(ax.single[6]).toBe(1);
  });
});
