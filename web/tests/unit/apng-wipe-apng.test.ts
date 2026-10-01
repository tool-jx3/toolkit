/**
 * 輕量轉場 APNG 產生器：實際編碼後用測試用的解析器（tests/helpers/png.ts）解碼驗證（規格 3.1～3.4）。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DURATIONS,
  encodeTransition,
  WIPE_COVER_TABLE,
  type WipeSettings,
} from '@/tools/apng-wipe/wipe';
import { sameBytes } from '../helpers/frames';
import { composeApng, parseApng } from '../helpers/png';

interface Decoded {
  width: number;
  height: number;
  plays: number;
  /** 每格：開始時間、延遲（毫秒）、合成後的 RGBA */
  frames: { start: number; delay: number; rgba: Uint8Array }[];
  total: number;
  bytes: number;
}

async function make(over: Partial<WipeSettings>): Promise<Decoded> {
  const file = await encodeTransition({ ...DEFAULT_SETTINGS, ...over });
  const info = parseApng(file.bytes);
  expect(info.chunks.every((c) => c.crcOk)).toBe(true);
  const rgba = composeApng(info);
  let start = 0;
  const frames = info.frames.map((f, i) => {
    expect(f.delayDen).toBe(1000);
    const delay = f.delayNum;
    const out = { start, delay, rgba: rgba[i] };
    start += delay;
    return out;
  });
  expect(file.frames).toBe(frames.length);
  return {
    width: info.ihdr.width,
    height: info.ihdr.height,
    plays: info.numPlays,
    frames,
    total: start,
    bytes: file.bytes.length,
  };
}

/** time 毫秒時正在顯示的畫面 */
function shownAt(d: Decoded, time: number) {
  let f = d.frames[0];
  for (const g of d.frames) if (g.start <= time) f = g;
  return f;
}

const alphaAt = (d: Decoded, rgba: Uint8Array, x: number, y: number) =>
  rgba[(y * d.width + x) * 4 + 3];

/** 規格 3.2 的影格數（舊版，15 × 15） */
const FRAME_COUNTS = {
  cover: [5, 11, 20, 29, 37, 47, 56, 65, 73, 83, 92],
  reveal: [6, 11, 20, 29, 37, 47, 56, 65, 73, 83, 92],
  wipe: [7, 16, 31, 46, 61, 76, 90, 106, 120, 134, 149],
};
/** 規格 3.1 的舊版檔案大小（KB，15 × 15、預設色）；新版不得超過 1.5 倍 */
const OLD_KB = {
  normal: [1.5, 1.8, 2.4, 3.0, 3.6, 4.2, 4.9, 5.5, 6.0, 6.7, 7.3],
  wipe: [1.6, 2.3, 3.5, 4.7, 5.9, 7.0, 8.1, 9.4, 10.5, 11.6, 12.8],
};

describe('影格時間軸與檔案大小（15 × 15）', () => {
  it('淡變：影格數與舊版完全相同；總長＝所選時長；檔案不超過舊版 1.5 倍', async () => {
    for (const [i, duration] of DURATIONS.entries()) {
      for (const direction of ['cover', 'reveal'] as const) {
        const d = await make({ mode: 'normal', duration, direction });
        expect(d.frames.length, `${duration} 秒 ${direction}`).toBe(FRAME_COUNTS[direction][i]);
        expect(d.total).toBe(Math.round(duration * 1000));
        expect(d.bytes).toBeLessThanOrEqual(OLD_KB.normal[i] * 1024 * 1.5);
      }
    }
  });

  it('擦除：影格數與舊版相差 5% 以內；總長＝時長＋34 ms；檔案不超過舊版 1.5 倍', async () => {
    for (const [i, duration] of DURATIONS.entries()) {
      for (const direction of ['cover', 'reveal'] as const) {
        const d = await make({ mode: 'wipe', angle: 0, duration, direction });
        const old = FRAME_COUNTS.wipe[i];
        expect(
          Math.abs(d.frames.length - old),
          `${duration} 秒 ${direction}：${d.frames.length} 格`,
        ).toBeLessThanOrEqual(old * 0.05);
        expect(d.total).toBe(Math.round(duration * 1000) + 34);
        expect(d.frames[d.frames.length - 1].delay).toBeGreaterThanOrEqual(34);
        expect(d.bytes).toBeLessThanOrEqual(OLD_KB.wipe[i] * 1024 * 1.5);
      }
    }
    /* 斜向（1 秒 45° 約 4.6 KB、90° 約 4.1 KB） */
    expect((await make({ mode: 'wipe', angle: 45 })).bytes).toBeLessThanOrEqual(4.6 * 1024 * 1.5);
    expect((await make({ mode: 'wipe', angle: 90 })).bytes).toBeLessThanOrEqual(4.1 * 1024 * 1.5);
  });

  it('1 秒、蓋上：逐格的開始時間、延遲、透明度與規格 3.3 的表相同', async () => {
    const d = await make({ mode: 'normal', duration: 1, direction: 'cover' });
    expect(d.frames.map((f) => f.start)).toEqual([
      0, 267, 300, 333, 367, 400, 433, 467, 500, 533, 567, 600, 633, 667, 700, 733, 767, 800, 833,
      867,
    ]);
    expect(d.frames.map((f) => f.delay)).toEqual([
      267, 33, 33, 34, 33, 33, 34, 33, 33, 34, 33, 33, 34, 33, 33, 34, 33, 33, 34, 133,
    ]);
    expect(d.frames.map((f) => alphaAt(d, f.rgba, 7, 7))).toEqual([
      0, 7, 21, 35, 50, 64, 78, 92, 106, 120, 135, 149, 163, 177, 191, 205, 220, 234, 248, 255,
    ]);
  });

  it('1 秒、揭開：255 停 167 ms，依序遞減，最後 0 停 233 ms（共 20 格）', async () => {
    const d = await make({ mode: 'normal', duration: 1, direction: 'reveal' });
    expect(d.frames).toHaveLength(20);
    expect(d.frames[0].delay).toBe(167);
    expect(d.frames[d.frames.length - 1].delay).toBe(233);
    expect(d.frames.map((f) => alphaAt(d, f.rgba, 0, 0))).toEqual([
      255, 248, 234, 220, 205, 191, 177, 163, 149, 135, 120, 106, 92, 78, 64, 50, 35, 21, 7, 0,
    ]);
  });

  it('0.2 秒、蓋上：0（67 ms）、36、106、176、249；最後一格不會完全不透明', async () => {
    const d = await make({ mode: 'normal', duration: 0.2, direction: 'cover' });
    expect(d.frames.map((f) => alphaAt(d, f.rgba, 3, 11))).toEqual([0, 36, 106, 176, 249]);
    expect(d.frames.map((f) => f.delay)).toEqual([67, 33, 33, 34, 33]);
  });
});

describe('擦除的透明度分布（規格 3.4，容許 ±5）', () => {
  /** 在寬 W 的 0° 擦除中，q 最接近目標的欄 */
  const colFor = (W: number, q: number) => Math.min(W - 1, Math.max(0, Math.round(q * W - 0.5)));

  for (const [W, H] of [
    [100, 20],
    [15, 15],
    [300, 300],
  ]) {
    it(`${W} × ${H}、0°、蓋上：各時刻沿移動方向的透明度與量測表相差 ±5 以內`, async () => {
      const d = await make({
        sizeKind: W === 15 ? 'square' : 'free',
        customWidth: String(W),
        customHeight: String(H),
        mode: 'wipe',
        angle: 0,
        duration: 1,
        direction: 'cover',
      });
      expect([d.width, d.height]).toEqual([W, H]);
      WIPE_COVER_TABLE.forEach((row, i) => {
        const f = shownAt(d, i * 100);
        row.forEach((expected, j) => {
          const x = colFor(W, j / 5);
          for (const y of [0, H - 1]) {
            const a = alphaAt(d, f.rgba, x, y);
            expect(
              Math.abs(a - expected),
              `t=${i / 10} q=${j / 5}：${a} vs ${expected}`,
            ).toBeLessThanOrEqual(5);
          }
        });
      });
    });
  }

  it('方向：0° 左邊先出現、90° 上邊、180° 右邊、270° 下邊、45° 左上角', async () => {
    const W = 15;
    const H = 15;
    const at = async (angle: number) => {
      const d = await make({ mode: 'wipe', angle, duration: 1 });
      return { d, f: shownAt(d, 300) };
    };
    const firstSide = async (angle: number, a: [number, number], b: [number, number]) => {
      const { d, f } = await at(angle);
      expect(alphaAt(d, f.rgba, ...a)).toBeGreaterThan(alphaAt(d, f.rgba, ...b) + 50);
    };
    await firstSide(0, [0, 7], [W - 1, 7]);
    await firstSide(90, [7, 0], [7, H - 1]);
    await firstSide(180, [W - 1, 7], [0, 7]);
    await firstSide(270, [7, H - 1], [7, 0]);
    await firstSide(45, [0, 0], [W - 1, H - 1]);
    await firstSide(135, [W - 1, 0], [0, H - 1]);
    await firstSide(225, [W - 1, H - 1], [0, 0]);
    await firstSide(315, [0, H - 1], [W - 1, 0]);
    /* 斜角：右上與左下在同一條等透明度線上 */
    const { d, f } = await at(45);
    expect(alphaAt(d, f.rgba, W - 1, 0)).toBe(alphaAt(d, f.rgba, 0, H - 1));
  });

  it('揭開的每一格每一點＝255 − 蓋上同一格同一點', async () => {
    for (const angle of [0, 45, 90, 225]) {
      const cover = await make({ mode: 'wipe', angle, duration: 1.5, direction: 'cover' });
      const reveal = await make({ mode: 'wipe', angle, duration: 1.5, direction: 'reveal' });
      expect(reveal.frames.length).toBe(cover.frames.length);
      cover.frames.forEach((f, i) => {
        const g = reveal.frames[i];
        expect(g.start).toBe(f.start);
        for (let k = 3; k < f.rgba.length; k += 4) {
          if (g.rgba[k] !== 255 - f.rgba[k])
            throw new Error(`第 ${i} 格第 ${k >> 2} 點：${g.rgba[k]} ≠ 255 − ${f.rgba[k]}`);
        }
      });
    }
  });
});

describe('檔案格式', () => {
  it('每個像素的 RGB 都是所選顏色（包含完全透明的像素），只有透明度變化', async () => {
    for (const over of [
      { mode: 'normal' as const, color: '#28212f' },
      { mode: 'wipe' as const, angle: 135, color: '#ff8000' },
      { mode: 'wipe' as const, angle: 270, color: '#000000', direction: 'reveal' as const },
    ]) {
      const d = await make(over);
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(over.color.slice(i, i + 2), 16));
      let transparent = 0;
      for (const f of d.frames) {
        for (let k = 0; k < f.rgba.length; k += 4) {
          if (f.rgba[k] !== r || f.rgba[k + 1] !== g || f.rgba[k + 2] !== b)
            throw new Error(`顏色不符：${f.rgba.slice(k, k + 4).join(',')}`);
          if (f.rgba[k + 3] === 0) transparent++;
        }
      }
      expect(transparent).toBeGreaterThan(0);
    }
  });

  it('播放次數：單次＝1、無限循環＝0；尺寸寫在 IHDR', async () => {
    expect((await make({ plays: 'once' })).plays).toBe(1);
    expect((await make({ plays: 'loop' })).plays).toBe(0);
    const p = await make({ sizeKind: 'portrait' });
    expect([p.width, p.height]).toEqual([15, 30]);
    const l = await make({ sizeKind: 'landscape' });
    expect([l.width, l.height]).toEqual([30, 15]);
  });

  it('同樣的設定輸出逐位元組相同', async () => {
    const s = { ...DEFAULT_SETTINGS, mode: 'wipe' as const, angle: 45, duration: 2 };
    const a = await encodeTransition(s);
    const b = await encodeTransition(s);
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
  });

  it('自訂尺寸不合法時拒絕匯出', async () => {
    await expect(
      encodeTransition({ ...DEFAULT_SETTINGS, sizeKind: 'free', customWidth: '1.5' }),
    ).rejects.toThrow(/1～1200/);
  });
});
