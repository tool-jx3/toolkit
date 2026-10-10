/**
 * 立繪去背工具（bg-remover）的設定與輸出規則：設定修正、檔名、JPG 的背景、
 * 輸出的組法（去背圖＋裁透明邊＋鋪底、遮罩、比較圖）、純色去背的自動偵測、邊緣調整與筆刷的存檔格式。
 */
import { describe, expect, it } from 'vitest';
import type { Mask } from '@/core/image';
import { letterbox } from '@/tools/bg-remover/animeSeg';
import {
  ANIME_SEG_MODEL,
  defaultSettings,
  effectiveBackground,
  modelSpec,
  normalizeSettings,
  outputName,
  roundPoint,
} from '@/tools/bg-remover/model';
import {
  aiMask,
  alphaBounds,
  applyStrokes,
  colorBase,
  composeOutput,
  cutoutColors,
  decodeMaskPng,
  encodeMaskPng,
  type OutputSpec,
  refineMask,
  type SourceImage,
  trimRgba,
} from '@/tools/bg-remover/pipeline';

function image(w: number, h: number, paint: (x: number, y: number) => number[]): SourceImage {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(paint(x, y), (y * w + x) * 4);
  return { width: w, height: h, rgba };
}

const spec = (over: Partial<OutputSpec> = {}): OutputSpec => ({
  content: 'cutout',
  background: 'transparent',
  bgColor: '#ff0000',
  format: 'png',
  trim: false,
  trimPad: 0,
  ...over,
});

describe('bg-remover：模型與設定', () => {
  it('模型固定 Hugging Face 的 revision、大小與 SHA-256', () => {
    expect(ANIME_SEG_MODEL.url).toBe(
      'https://huggingface.co/skytnt/anime-seg/resolve/493cb60893f47441b26ec4fb9a306bce9e342982/isnetis.onnx',
    );
    expect(ANIME_SEG_MODEL.bytes).toBe(176_069_933);
    expect(ANIME_SEG_MODEL.sha256).toBe(
      'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99',
    );
    expect(ANIME_SEG_MODEL.license).toBe('Apache-2.0');
    expect(modelSpec()).toBe(ANIME_SEG_MODEL);
  });

  it('設定修正：範圍外夾回、不認得的換預設、壞掉的圖片與筆刷拿掉', () => {
    const s = normalizeSettings({
      mode: 'magic',
      tolerance: 500,
      softness: -3,
      grow: 3.6,
      feather: 99,
      keyColor: 'red',
      bgColor: '#ABCDEF',
      format: 'gif',
      trimPad: 12.4,
      images: [
        {
          id: 'a',
          name: 'a.png',
          asset: 'x',
          width: 10,
          height: 20,
          strokes: [{ m: 'r', s: 9999, h: 50, p: [1, 2, 3] }, { p: [] }],
        },
        { id: 'a', name: 'dup.png', asset: 'y', width: 1, height: 1 },
        { id: 'b', asset: 'z', width: 0, height: 5 },
        null,
      ],
    });
    const d = defaultSettings();
    expect(s.mode).toBe(d.mode);
    expect(s.tolerance).toBe(100);
    expect(s.softness).toBe(0);
    expect(s.grow).toBe(4);
    expect(s.feather).toBe(20);
    expect(s.keyColor).toBe(d.keyColor);
    expect(s.bgColor).toBe('#abcdef');
    expect(s.format).toBe('png');
    expect(s.trimPad).toBe(12);
    expect(s.images).toHaveLength(1);
    expect(s.images[0].strokes).toEqual([{ m: 'r', s: 500, h: 50, p: [1, 2] }]);
    expect(normalizeSettings(null)).toEqual(d);
  });

  it('設定修正：同色擦掉／補回（F61）的位置取整數、容許度夾回、沒寫相連時當成相連，壞掉的拿掉', () => {
    const s = normalizeSettings({
      images: [
        {
          id: 'a',
          name: 'a.png',
          asset: 'x',
          width: 10,
          height: 20,
          strokes: [
            { m: 'fe', x: 3.6, y: -2, t: 150, c: false },
            { m: 'fr', x: 1, y: 2 },
            { m: 'fe', x: 'a', y: 2, t: 5, c: true },
            { m: 'e', s: 10, h: 80, p: [1, 1] },
          ],
        },
      ],
    });
    expect(s.images[0].strokes).toEqual([
      { m: 'fe', x: 4, y: 0, t: 100, c: false },
      { m: 'fr', x: 1, y: 2, t: 12, c: true },
      { m: 'e', s: 10, h: 80, p: [1, 1] },
    ]);
  });

  it('輸出檔名：原檔名＋_去背／_遮罩／_比較', () => {
    expect(outputName('角色A.png', 'cutout', 'png')).toBe('角色A_去背.png');
    expect(outputName('角色A.jpg', 'mask', 'webp')).toBe('角色A_遮罩.webp');
    expect(outputName('pic', 'compare', 'jpg')).toBe('pic_比較.jpg');
    expect(outputName('.png', 'cutout', 'png')).toBe('.png_去背.png');
  });

  it('JPG 沒有透明：去背圖選透明時改成白色；遮罩、比較圖本來就不透明', () => {
    expect(
      effectiveBackground({ background: 'transparent', format: 'jpg', content: 'cutout' }),
    ).toBe('white');
    expect(effectiveBackground({ background: 'color', format: 'jpg', content: 'cutout' })).toBe(
      'color',
    );
    expect(
      effectiveBackground({ background: 'transparent', format: 'png', content: 'cutout' }),
    ).toBe('transparent');
    expect(effectiveBackground({ background: 'white', format: 'png', content: 'mask' })).toBe(
      'transparent',
    );
  });

  it('筆刷點存檔取到小數一位', () => {
    expect(roundPoint(12.345)).toBe(12.3);
    expect(roundPoint(-0.06)).toBe(-0.1);
  });
});

describe('bg-remover：輸出', () => {
  const src = image(6, 4, (x, y) => [x * 40, y * 60, 200, 255]);
  const mask = Uint8Array.from({ length: 24 }, (_, i) =>
    i % 6 >= 2 && i % 6 <= 3 ? 255 : i === 7 ? 128 : 0,
  ) as Mask;

  it('去背圖：不透明度＝遮罩、RGB 原樣；完全透明的 RGB 清成 0', () => {
    const out = composeOutput(src, src.rgba, mask, spec());
    expect(out.width).toBe(6);
    expect(Array.from(out.rgba.slice(2 * 4, 3 * 4))).toEqual([80, 0, 200, 255]);
    expect(Array.from(out.rgba.slice(7 * 4, 8 * 4))).toEqual([40, 60, 200, 128]);
    expect(Array.from(out.rgba.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it('裁掉透明邊並留白（超出原圖的地方補透明）', () => {
    const out = composeOutput(src, src.rgba, mask, spec({ trim: true, trimPad: 1 }));
    /* 不透明的範圍：x 1～3、y 0～3 → 寬 3＋2、高 4＋2 */
    expect([out.width, out.height]).toEqual([5, 6]);
    expect(out.rgba[3]).toBe(0);
    expect(Array.from(out.rgba.slice((1 * 5 + 2) * 4, (1 * 5 + 3) * 4))).toEqual([80, 0, 200, 255]);
    expect(alphaBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
    const empty = { width: 2, height: 2, rgba: new Uint8ClampedArray(16) };
    expect(trimRgba(empty, 3)).toBe(empty);
  });

  it('白色、自訂色背景：合成成不透明', () => {
    const white = composeOutput(src, src.rgba, mask, spec({ background: 'white' }));
    expect(Array.from(white.rgba.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(white.rgba.slice(7 * 4, 8 * 4))).toEqual([
      Math.round((40 * 128 + 255 * 127) / 255),
      Math.round((60 * 128 + 255 * 127) / 255),
      Math.round((200 * 128 + 255 * 127) / 255),
      255,
    ]);
    const red = composeOutput(src, src.rgba, mask, spec({ background: 'color' }));
    expect(Array.from(red.rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it('遮罩：灰階、不透明、原圖尺寸', () => {
    const out = composeOutput(src, src.rgba, mask, spec({ content: 'mask', trim: true }));
    expect([out.width, out.height]).toEqual([6, 4]);
    expect(Array.from(out.rgba.slice(7 * 4, 8 * 4))).toEqual([128, 128, 128, 255]);
  });

  it('比較圖：原圖｜去背後疊在黑底（floor(色 × 遮罩 ÷ 255)）｜遮罩，寬 3 倍', () => {
    const out = composeOutput(src, src.rgba, mask, spec({ content: 'compare' }));
    expect([out.width, out.height]).toEqual([18, 4]);
    const px = (x: number, y: number) =>
      Array.from(out.rgba.slice((y * 18 + x) * 4, (y * 18 + x) * 4 + 4));
    expect(px(1, 1)).toEqual([40, 60, 200, 255]);
    expect(px(6 + 1, 1)).toEqual([
      Math.floor((40 * 128) / 255),
      Math.floor((60 * 128) / 255),
      Math.floor((200 * 128) / 255),
      255,
    ]);
    expect(px(6 + 0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(12 + 1, 1)).toEqual([128, 128, 128, 255]);
  });

  it('遮罩存成 PNG 再讀回相同', async () => {
    const png = await encodeMaskPng(mask, 6, 4);
    const back = decodeMaskPng(png);
    expect([back.width, back.height]).toEqual([6, 4]);
    expect(Array.from(back.mask)).toEqual(Array.from(mask));
  });

  it('AI 的後處理：模型輸出裁邊縮回後量化成 0～255', () => {
    const box = letterbox(4, 2, 8);
    const pred = new Float32Array(64).fill(1);
    expect(Array.from(aiMask(pred, box))).toEqual(new Array(8).fill(255));
  });
});

describe('bg-remover：純色、邊緣與筆刷', () => {
  /** 只有一個背景色（其他背景色沒有） */
  const one = { extra: [], blend: false };
  /* 白底中間一個紅色方塊，方塊邊上有一圈淡粉紅（反鋸齒） */
  const src = image(12, 12, (x, y) => {
    if (x >= 4 && x < 8 && y >= 4 && y < 8) return [220, 30, 30, 255];
    if (x >= 3 && x < 9 && y >= 3 && y < 9) return [238, 143, 143, 255];
    return [255, 255, 255, 255];
  });

  it('自動偵測背景色（四邊最多的顏色），柔邊的像素半透明', () => {
    const r = colorBase(src, { ...one, color: null, tolerance: 5, softness: 60, connected: true });
    expect(r.bg).toEqual([255, 255, 255]);
    expect(r.ratio).toBe(1);
    expect(r.mask[0]).toBe(0);
    expect(r.mask[5 * 12 + 5]).toBe(255);
    const edge = r.mask[3 * 12 + 3];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('指定顏色：用指定的顏色（不偵測）', () => {
    const r = colorBase(src, {
      ...one,
      color: [220, 30, 30],
      tolerance: 5,
      softness: 0,
      connected: false,
    });
    expect(r.bg).toEqual([220, 30, 30]);
    expect(r.mask[5 * 12 + 5]).toBe(0);
    expect(r.mask[0]).toBe(255);
  });

  it('去色邊：半透明邊緣的顏色扣掉白色後接近方塊的紅', () => {
    const r = colorBase(src, { ...one, color: null, tolerance: 5, softness: 60, connected: true });
    const colors = cutoutColors(src, { base: r.mask, keys: r.keys });
    const k = (3 * 12 + 3) * 4;
    expect(colors[k]).toBeGreaterThan(colors[k + 1] + 60);
    expect(cutoutColors(src, null)).toBe(src.rgba);
  });

  it('邊緣調整：0 是複本；收縮讓方塊變小', () => {
    const r = colorBase(src, { ...one, color: null, tolerance: 30, softness: 0, connected: true });
    const same = refineMask(r.mask, 12, 12, 0, 0);
    expect(same).not.toBe(r.mask);
    expect(Array.from(same)).toEqual(Array.from(r.mask));
    const shrunk = refineMask(r.mask, 12, 12, -1, 0);
    const count = (m: Uint8Array) => m.reduce((a, v) => a + (v ? 1 : 0), 0);
    expect(count(shrunk)).toBeLessThan(count(r.mask));
  });

  it('存起來的筆刷（擦掉、補回）依序重播', () => {
    const m = new Uint8Array(144).fill(255) as Mask;
    applyStrokes(m, src, [
      { m: 'e', s: 8, h: 100, p: [6, 6] },
      { m: 'r', s: 4, h: 100, p: [6, 6] },
    ]);
    expect(m[3 * 12 + 6]).toBe(0);
    expect(m[5 * 12 + 5]).toBe(255);
    expect(m[0]).toBe(255);
  });

  it('同色擦掉／補回（F61）依當下的遮罩重播，和筆刷照順序', () => {
    const zeros = (m: Uint8Array) => m.reduce((a, v) => a + (v === 0 ? 1 : 0), 0);
    const m = new Uint8Array(144).fill(255) as Mask;
    /* 點紅色中心：只擦掉相連的紅（4 × 4），粉紅與白不動 */
    applyStrokes(m, src, [{ m: 'fe', x: 5, y: 5, t: 5, c: true }]);
    expect(zeros(m)).toBe(16);
    expect(m[5 * 12 + 5]).toBe(0);
    expect(m[3 * 12 + 3]).toBe(255);
    /* 筆刷整張擦掉，再點白底同色補回：只補回被去掉的白（粉紅、紅還是去掉的） */
    applyStrokes(m, src, [
      { m: 'e', s: 30, h: 100, p: [6, 6] },
      { m: 'fr', x: 0, y: 0, t: 5, c: true },
    ]);
    expect(zeros(m)).toBe(36);
    expect(m[0]).toBe(255);
    expect(m[3 * 12 + 3]).toBe(0);
    expect(m[5 * 12 + 5]).toBe(0);
    /* 點到的地方不符合條件（同色補回點看得到的白）：不動 */
    const before = Uint8Array.from(m);
    applyStrokes(m, src, [{ m: 'fr', x: 0, y: 0, t: 5, c: true }]);
    expect(m).toEqual(before);
  });
});
