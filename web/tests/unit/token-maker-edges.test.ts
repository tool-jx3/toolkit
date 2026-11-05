/**
 * VTT 棋子產生器 2026-11-05 跟進 token-workshop（ce4c62b）：
 * - 讀新版 TW 匯出的 PNG／WebP（`rle8` 的 32 階軟遮罩、CRC、上限；新的設定欄位的對應）。
 *   `tests/fixtures/tw-ce4c62b-rle8.{png,webp}` 是用**原作的程式**在 Node 裡產生的（src/js/04-state.js 的 SETTINGS 與預設值、
 *   10-project-file.js 的 rle8Enc／b64enc／buildChunk／injectChunk、13-tabs-export.js 的 WebP TKWS 那一段；原作的 readProject、
 *   readWebpProject 讀得回來）；`tw-ce4c62b-rle8.json` 是原作 rle8Dec 解出來的遮罩與 settings。
 * - 軟選取與修邊（edges.ts）：自動（背景單純、深色背景、透明背景、背景太雜）、一鍵修邊、去雜點與填洞、去掉小縫隙、去光暈、套索。
 *   和原作逐像素的比對（原作 tests/scene.mjs 的合成人像 4 種背景 × 5 組靈敏度／內縮，修邊、縫隙、雜點、去光暈全部 0 差異）
 *   在 scratchpad 的 batch-1105/token-maker/gen/parity-edges.mjs，這裡用小圖測規則。
 * - 漸層的色彩平衡。
 */
import { describe, expect, it } from 'vitest';
import { makeCanvas } from '../../src/core/image';
import {
  chamfer,
  cleanSpecks,
  edgeReach,
  estimateBg,
  fillPolygon,
  fixEdges,
  gapRemove,
  hardenMask,
  hasPartial,
  softAuto,
  speckArea,
  unmixHalo,
} from '../../src/tools/token-maker/edges';
import {
  fromBase64,
  fromTokenWorkshop,
  readEmbedded,
  TW_LIMITS,
  toBase64,
  twRle8Decode,
  twRle8Encode,
  twRleDecode,
  twRleEncode,
} from '../../src/tools/token-maker/embed';
import type { Mask, Rgba } from '../../src/tools/token-maker/mask';
import {
  DEFAULT_LOOK,
  defaultAdjust,
  type Look,
  normalizeLook,
  normalizeToken,
} from '../../src/tools/token-maker/model';
import { applyPreset, RING_PRESETS } from '../../src/tools/token-maker/presets';
import { renderTokenCanvas } from '../../src/tools/token-maker/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

interface Fs {
  readFile(p: string): Promise<Uint8Array>;
}
const fsName = 'node:fs/promises';
const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
const fixture = async (name: string) =>
  new Uint8Array(await fs.readFile(new URL(`../fixtures/${name}`, import.meta.url).pathname));

const look = (p: Partial<Look> = {}): Look => normalizeLook({ ...DEFAULT_LOOK, ...p });

/** w × h 的 RGBA，fn(x, y) → [r, g, b, a] */
function rgbaOf(w: number, h: number, fn: (x: number, y: number) => number[]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const maskOf = (w: number, h: number, fn: (x: number, y: number) => number): Mask => {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fn(x, y);
  return { width: w, height: h, data };
};
const count = (m: Mask, test: (v: number) => boolean) => {
  let n = 0;
  for (const v of m.data) if (test(v)) n++;
  return n;
};

/* 圓形的主體（中心 cx, cy、半徑 r；邊緣 1 px 抗鋸齒）放在單色背景上 */
const disc = (
  w: number,
  h: number,
  fg: number[],
  bg: number[],
  cx = w / 2,
  cy = h / 2,
  r = Math.min(w, h) * 0.3,
) =>
  rgbaOf(w, h, (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const a = Math.max(0, Math.min(1, r + 0.5 - d));
    return [0, 1, 2].map((c) => Math.round(fg[c] * a + bg[c] * (1 - a))).concat(255);
  });

describe('讀新版 token-workshop 的 PNG／WebP（rle8，ce4c62b）', () => {
  it('PNG：32 階的軟遮罩照原作 rle8Dec 解；新的設定欄位對應到本站', async () => {
    const png = await fixture('tw-ce4c62b-rle8.png');
    const want = JSON.parse(new TextDecoder().decode(await fixture('tw-ce4c62b-rle8.json'))) as {
      w: number;
      h: number;
      mask: number[];
    };
    const e = readEmbedded(png, look());
    expect(e?.source).toBe('token-workshop');
    expect(e?.image.type).toBe('image/png');
    /* 嵌入的圖是一張真的 PNG（48 × 40） */
    expect(Array.from(e?.image.bytes.subarray(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(e?.mask?.kind).toBe('pixels');
    if (e?.mask?.kind !== 'pixels') throw new Error('沒有遮罩');
    expect([e.mask.width, e.mask.height]).toEqual([want.w, want.h]);
    expect(Array.from(e.mask.data)).toEqual(want.mask);
    /* 半透明留著（不是只有 0／255） */
    expect(e.mask.data.some((v) => v > 0 && v < 255)).toBe(true);
    expect(e.look).toMatchObject({
      frame: 'gear',
      colorMode: 'gradient',
      g1: '#ffd23f',
      g2: '#b3111a',
      gAngle: 90,
      gMid: 30,
      width: 14,
      count: 30,
      texture: 'stone',
      texScale: 300,
      lightAngle: 180,
      lightStrength: 80,
      bg: 'color',
      bgColor: '#203040',
      feather: 1.5,
      shadow: 25,
    });
    expect(e.token.adjust).toEqual({ bright: 120, contrast: 90, sat: 130, hue: 0 });
    expect(e.token.halo).toBe(80);
    expect(e.token.view.flip).toBe(true);
    expect(e.token.view.rotate).toBeCloseTo(15);
  });

  it('WebP（RIFF 的 TKWS chunk）讀得到一樣的內容', async () => {
    const png = readEmbedded(await fixture('tw-ce4c62b-rle8.png'), look());
    const webp = readEmbedded(await fixture('tw-ce4c62b-rle8.webp'), look());
    expect(webp?.source).toBe('token-workshop');
    expect(webp?.look).toEqual(png?.look);
    expect(webp?.token).toEqual(png?.token);
    expect(Array.from(webp?.image.bytes ?? [])).toEqual(Array.from(png?.image.bytes ?? []));
    if (webp?.mask?.kind !== 'pixels' || png?.mask?.kind !== 'pixels') throw new Error('沒有遮罩');
    expect(Array.from(webp.mask.data)).toEqual(Array.from(png.mask.data));
  });

  it('rle8 的編碼與解碼：值取高 5 位元，還原成 (v << 3) | (v >> 2)；舊的 rle 照讀', () => {
    const m = Uint8Array.from({ length: 3000 }, (_, i) =>
      i < 200 ? 0 : i < 400 ? 255 : (i * 13) % 256,
    );
    const back = twRle8Decode(twRle8Encode(m), m.length);
    for (let i = 0; i < m.length; i++) {
      const v = m[i] >> 3;
      expect(back[i]).toBe(v ? (v << 3) | (v >> 2) : 0);
    }
    expect(back[0]).toBe(0);
    expect(back[300]).toBe(255);
    /* 長度很長（可變長度整數 3 組以上） */
    const long = new Uint8Array(300000).fill(255);
    expect(twRle8Decode(twRle8Encode(long), long.length).every((v) => v === 255)).toBe(true);
    const hard = new Uint8Array(500);
    hard.fill(255, 3, 200);
    expect(Array.from(twRleDecode(twRleEncode(hard), 500))).toEqual(Array.from(hard));
  });

  it('照原作的檢查：CRC 不對、遮罩太大、rle8 太長、圖片不是 PNG／JPEG、JSON 太長時不認', async () => {
    const png = await fixture('tw-ce4c62b-rle8.png');
    const base = look();
    /* 找出 tkWs chunk */
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let p = 8;
    while (String.fromCharCode(...png.subarray(p + 4, p + 8)) !== 'tkWs') p += 12 + dv.getUint32(p);
    const len = dv.getUint32(p);
    /* CRC 改壞 */
    const badCrc = png.slice();
    badCrc[p + 8 + len] ^= 0xff;
    expect(readEmbedded(badCrc, base)).toBeNull();
    /* 重新組一個 chunk：meta 換掉 */
    const jl = dv.getUint32(p + 8);
    const meta = JSON.parse(new TextDecoder().decode(png.subarray(p + 12, p + 12 + jl)));
    const img = png.subarray(p + 12 + jl, p + 8 + len);
    const { crc32 } = await import('../../src/core/encode');
    const rebuild = (m: unknown, jsonLength?: number) => {
      const j = new TextEncoder().encode(JSON.stringify(m));
      const data = new Uint8Array(4 + j.length + img.length);
      new DataView(data.buffer).setUint32(0, jsonLength ?? j.length);
      data.set(j, 4);
      data.set(img, 4 + j.length);
      const chunk = new Uint8Array(12 + data.length);
      const cd = new DataView(chunk.buffer);
      cd.setUint32(0, data.length);
      chunk.set(new TextEncoder().encode('tkWs'), 4);
      chunk.set(data, 8);
      cd.setUint32(8 + data.length, crc32(chunk, 4, 8 + data.length));
      const out = new Uint8Array(png.length - (12 + len) + chunk.length);
      out.set(png.subarray(0, p));
      out.set(chunk, p);
      out.set(png.subarray(p + 12 + len), p + chunk.length);
      return out;
    };
    expect(readEmbedded(rebuild(meta), base)?.source).toBe('token-workshop');
    expect(
      readEmbedded(rebuild({ ...meta, mask: { ...meta.mask, w: 5000, h: 4000 } }), base),
    ).toBeNull();
    expect(
      readEmbedded(
        rebuild({ ...meta, mask: { ...meta.mask, rle8: 'A'.repeat(48 * 40 * 3 + 17) } }),
        base,
      ),
    ).toBeNull();
    expect(readEmbedded(rebuild({ ...meta, img: { type: 'image/gif' } }), base)).toBeNull();
    expect(readEmbedded(rebuild({ ...meta, mask: { ...meta.mask, w: 1.5 } }), base)).toBeNull();
    expect(readEmbedded(rebuild({ ...meta, app: 'other' }), base)).toBeNull();
    expect(readEmbedded(rebuild(meta, TW_LIMITS.json + 1), base)).toBeNull();
    /* 舊的 rle 也照讀 */
    const old = {
      ...meta,
      mask: { w: 48, h: 40, rle: toBase64(twRleEncode(new Uint8Array(1920).fill(255, 0, 100))) },
    };
    const e = readEmbedded(rebuild(old), base);
    expect(e?.mask?.kind === 'pixels' && e.mask.data[50]).toBe(255);
    expect(fromBase64(toBase64(Uint8Array.from([1, 2, 255])))).toEqual(
      Uint8Array.from([1, 2, 255]),
    );
  });

  it('WebP 的 chunk 長度不對時不認；不是 WebP 的 RIFF 不當成 WebP', async () => {
    const webp = await fixture('tw-ce4c62b-rle8.webp');
    const broken = webp.slice();
    /* 最後一個 chunk（TKWS）的長度改成超過檔案 */
    let p = 12;
    const dv = new DataView(broken.buffer);
    while (String.fromCharCode(...broken.subarray(p, p + 4)) !== 'TKWS')
      p += 8 + dv.getUint32(p + 4, true) + (dv.getUint32(p + 4, true) & 1);
    dv.setUint32(p + 4, broken.length, true);
    expect(readEmbedded(broken, look())).toBeNull();
    const wav = webp.slice();
    wav.set(new TextEncoder().encode('WAVE'), 8);
    expect(readEmbedded(wav, look())).toBeNull();
  });
});

describe('自動（軟選取）', () => {
  it('單色背景：主體的邊緣是半透明的、背景是 0、中間是 255；背景色是四邊的中位數', () => {
    const img = disc(120, 100, [200, 60, 40], [240, 238, 230]);
    const r = softAuto(img, { sens: 50, shrink: 0 });
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.bg).toBe('#f0eee6');
    expect(r.mask.data[50 * 120 + 60]).toBe(255);
    expect(r.mask.data[2 * 120 + 2]).toBe(0);
    expect(hasPartial(r.mask)).toBe(true);
    /* 選到的面積≈圓的面積 */
    const area = Math.PI * 30 ** 2;
    expect(count(r.mask, (v) => v >= 128)).toBeGreaterThan(area * 0.9);
    expect(count(r.mask, (v) => v >= 128)).toBeLessThan(area * 1.1);
    /* 自動時順便修邊關掉：變成硬的 */
    const hard = hardenMask(r.mask);
    expect(hasPartial(hard)).toBe(false);
  });

  it('內縮／外擴：正數變小、負數變大', () => {
    const img = disc(120, 100, [200, 60, 40], [240, 238, 230]);
    const at = (shrink: number) =>
      count((softAuto(img, { sens: 50, shrink }) as { mask: Mask }).mask, (v) => v >= 128);
    expect(at(4)).toBeLessThan(at(0));
    expect(at(-4)).toBeGreaterThan(at(0));
  });

  it('深色背景：主體裡和背景一樣暗的部分也算（形狀補起來）', () => {
    /* 黑底、亮色的圓環，中間有一塊和背景一樣暗的「黑髮」 */
    const img = rgbaOf(160, 160, (x, y) => {
      const d = Math.hypot(x - 80, y - 80);
      if (d < 50 && d > 18) return [210, 170, 140, 255];
      if (d <= 18) return [22, 20, 18, 255];
      return [20, 18, 16, 255];
    });
    const r = softAuto(img, { sens: 50, shrink: 0 });
    expect(r).not.toBeNull();
    expect(r?.mask.data[80 * 160 + 80]).toBe(255);
  });

  it('透明背景、背景太雜、主體幾乎整張時找不到（null）', () => {
    const clear = rgbaOf(60, 60, (x) => (x < 30 ? [0, 0, 0, 0] : [200, 0, 0, 255]));
    expect(softAuto(clear, { sens: 50, shrink: 0 })).toBeNull();
    const noise = rgbaOf(60, 60, (x, y) => [
      (x * 97 + y * 31) % 256,
      (x * 13 + y * 71) % 256,
      (x * y) % 256,
      255,
    ]);
    expect(softAuto(noise, { sens: 50, shrink: 0 })).toBeNull();
    const tiny = rgbaOf(6, 6, () => [0, 0, 0, 255]);
    expect(softAuto(tiny, { sens: 50, shrink: 0 })).toBeNull();
  });

  it('靈敏度：低的時候淡的部分不算、高的時候算', () => {
    /* 淡淡的灰色圓（和背景只差一點）＋清楚的紅色圓 */
    const img = rgbaOf(160, 100, (x, y) => {
      if (Math.hypot(x - 40, y - 50) < 22) return [200, 30, 30, 255];
      if (Math.hypot(x - 115, y - 50) < 22) return [222, 222, 222, 255];
      return [240, 240, 240, 255];
    });
    const lo = softAuto(img, { sens: 0, shrink: 0 });
    const hi = softAuto(img, { sens: 100, shrink: 0 });
    expect(lo?.mask.data[50 * 160 + 115] ?? 0).toBeLessThan(128);
    expect(hi?.mask.data[50 * 160 + 115] ?? 0).toBeGreaterThan(0);
  });
});

describe('一鍵修邊、去雜點與填洞、去掉小縫隙', () => {
  const W = 120;
  const H = 100;
  /* 白底紅圓（邊緣混色）、硬的遮罩（≥ 半徑 + 1 都選） */
  const img = disc(W, H, [200, 40, 40], [250, 250, 250], 60, 50, 30);
  const hard = maskOf(W, H, (x, y) => (Math.hypot(x + 0.5 - 60, y + 0.5 - 50) < 32 ? 255 : 0));

  it('邊緣依顏色變成半透明：圓外一圈的背景變 0、混色的邊是半透明、中間 255', () => {
    const r = fixEdges(hard, img, edgeReach(W, H));
    expect(r.matte).toBe(true);
    expect(r.busy).toBe(false);
    expect(r.mask.data[50 * W + 60]).toBe(255);
    /* 半徑 31 的地方（背景）變 0 */
    expect(r.mask.data[50 * W + 60 + 31]).toBe(0);
    expect(hasPartial(r.mask)).toBe(true);
  });

  it('背景太雜：只去雜點與洞（busy）', () => {
    const noisy = rgbaOf(W, H, (x, y) =>
      Math.hypot(x + 0.5 - 60, y + 0.5 - 50) < 30
        ? [200, 40, 40, 255]
        : [(x * 97 + y * 31) % 256, (x * 13 + y * 71) % 256, (x * y * 7) % 256, 255],
    );
    const r = fixEdges(hard, noisy, edgeReach(W, H));
    expect(r.busy).toBe(true);
    expect(r.matte).toBe(false);
  });

  it('去雜點（比面積上限小的塊）與填洞（沒接到圖邊的小洞）', () => {
    const m = maskOf(200, 200, (x, y) => {
      if (x >= 2 && x < 5 && y >= 2 && y < 5) return 255; /* 雜點 3 × 3 */
      if (x >= 50 && x < 150 && y >= 50 && y < 150)
        return x >= 90 && x < 93 && y >= 90 && y < 93 ? 0 : 255; /* 大塊中間一個 3 × 3 的洞 */
      return 0;
    });
    expect(speckArea(200, 200)).toBe(4);
    const c = cleanSpecks(m, 20);
    expect(c.specks).toBe(1);
    expect(c.filled).toBe(1);
    expect(c.mask.data[3 * 200 + 3]).toBe(0);
    expect(c.mask.data[91 * 200 + 91]).toBe(255);
    /* 碰到圖邊的空白不算洞 */
    expect(c.mask.data[0]).toBe(0);
  });

  it('去掉小縫隙：選取裡和背景同色、夠窄的縫去掉，寬的留著', () => {
    /* 白底；紅色的方塊中間有一條 4 px 寬的白縫、一條 20 px 寬的白縫（整塊都選了） */
    const im = rgbaOf(160, 100, (x, y) => {
      const inBlock = x >= 20 && x < 140 && y >= 20 && y < 80;
      const slitA = x >= 50 && x < 54;
      const slitB = x >= 90 && x < 110;
      return inBlock && !slitA && !slitB ? [200, 40, 40, 255] : [250, 250, 250, 255];
    });
    const m = maskOf(160, 100, (x, y) => (x >= 20 && x < 140 && y >= 20 && y < 80 ? 255 : 0));
    const r = gapRemove(m, im, 6, edgeReach(160, 100));
    expect(r.n).toBeGreaterThanOrEqual(1);
    expect(r.mask.data[50 * 160 + 52]).toBe(0);
    expect(r.mask.data[50 * 160 + 100]).toBe(255);
    expect(r.mask.data[50 * 160 + 30]).toBe(255);
    const wide = gapRemove(m, im, 24, edgeReach(160, 100));
    expect(wide.mask.data[50 * 160 + 100]).toBe(0);
  });

  it('背景色的估計：選取外面一圈的中位數', () => {
    const r = estimateBg(hard, img, edgeReach(W, H));
    expect(r.c).toEqual([250, 250, 250]);
    expect(r.busy).toBe(false);
  });

  it('倒角距離：上下左右 1、斜角 1.414', () => {
    const src = new Uint8Array(25);
    src[12] = 1;
    const d = chamfer(src, 5, 5);
    expect(d[12]).toBe(0);
    expect(d[13]).toBe(1);
    expect(d[18]).toBeCloseTo(1.41, 2);
    expect(d[0]).toBeCloseTo(2.828, 2);
  });
});

describe('去光暈', () => {
  it('半透明的邊緣像素扣掉背景色：紅 50% 混白 → 紅；全選、沒選的不動；強度 0 不動', () => {
    /* 遮罩：左 4 欄 255、中間 128、右邊 0；圖片：左邊紅、中間紅白各半、右邊白 */
    const W = 12;
    const H = 4;
    const mask = maskOf(W, H, (x) => (x < 4 ? 255 : x < 6 ? 128 : 0));
    const make = () => ({
      width: W,
      height: H,
      data: new Uint8ClampedArray(
        Array.from({ length: W * H }, (_, i) => {
          const x = i % W;
          return x < 4 ? [220, 20, 20, 255] : x < 6 ? [238, 138, 138, 255] : [255, 255, 255, 255];
        }).flat(),
      ),
    });
    const img = make();
    unmixHalo(img, mask, 1, [255, 255, 255]);
    const px = (x: number) => Array.from(img.data.subarray((1 * W + x) * 4, (1 * W + x) * 4 + 3));
    expect(px(0)).toEqual([220, 20, 20]);
    expect(px(10)).toEqual([255, 255, 255]);
    /* 中間（不透明度約 0.5）：往紅色靠 */
    expect(px(4)[1]).toBeLessThan(138);
    expect(px(4)[0]).toBeGreaterThan(200);
    const same = make();
    unmixHalo(same, mask, 0, [255, 255, 255]);
    expect(Array.from(same.data)).toEqual(Array.from(make().data));
  });
});

describe('套索', () => {
  it('圈起來的範圍（像素中心在裡面）設成 255／0；回傳改到的像素數', () => {
    const base = maskOf(20, 20, () => 0);
    const sq = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];
    const r = fillPolygon(base, sq, 255);
    expect(r.changed).toBe(100);
    expect(r.mask.data[5 * 20 + 5]).toBe(255);
    expect(r.mask.data[14 * 20 + 14]).toBe(255);
    expect(r.mask.data[15 * 20 + 15]).toBe(0);
    expect(r.mask.data[4 * 20 + 5]).toBe(0);
    /* 同一塊再加一次：沒有改到 */
    expect(fillPolygon(r.mask, sq, 255).changed).toBe(0);
    /* 去掉 */
    const tri = fillPolygon(
      r.mask,
      [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 5, y: 15 },
      ],
      0,
    );
    expect(tri.mask.data[6 * 20 + 6]).toBe(0);
    expect(tri.mask.data[13 * 20 + 13]).toBe(255);
    /* 太少點、太小：不改 */
    expect(fillPolygon(base, sq.slice(0, 2), 255).changed).toBe(0);
    expect(
      fillPolygon(
        base,
        [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 1, y: 2 },
        ],
        255,
      ).changed,
    ).toBe(0);
  });

  it('自己交叉的圈（8 字形）兩半都選（nonzero 規則）', () => {
    const r = fillPolygon(
      maskOf(30, 20, () => 0),
      [
        { x: 2, y: 2 },
        { x: 28, y: 18 },
        { x: 28, y: 2 },
        { x: 2, y: 18 },
      ],
      255,
    );
    expect(r.mask.data[10 * 30 + 5]).toBe(255);
    expect(r.mask.data[10 * 30 + 25]).toBe(255);
    expect(r.mask.data[3 * 30 + 15]).toBe(0);
  });
});

describe('資料：漸層的色彩平衡、去光暈', () => {
  it('gMid 夾在 5～95（同原作），沒有時 50；漸層色票、外框預設、隨機都回到 50', () => {
    expect(look().gMid).toBe(50);
    expect(normalizeLook({ ...DEFAULT_LOOK, gMid: 3 }).gMid).toBe(5);
    expect(normalizeLook({ ...DEFAULT_LOOK, gMid: 99 }).gMid).toBe(95);
    expect(normalizeLook({ ...DEFAULT_LOOK, gMid: 95 }).gMid).toBe(95);
    const { gMid: _g, ...old } = DEFAULT_LOOK;
    expect(normalizeLook(old).gMid).toBe(50);
    expect(applyPreset(look({ gMid: 30 }), RING_PRESETS[0]).gMid).toBe(50);
    /* TW 的 gMid（原作夾在 0.05～0.95）→ 5～95% */
    expect(fromTokenWorkshop({ gMid: 0.05 }, look()).look.gMid).toBe(5);
    expect(fromTokenWorkshop({ gMid: 0.95 }, look()).look.gMid).toBe(95);
  });

  it('棋子的去光暈：只在有遮罩時留著，0 時不寫（存檔和之前相同）', () => {
    const base = {
      id: 't1',
      image: { id: 'i', name: 'a.png', width: 10, height: 10 },
      mask: { id: 'm', width: 10, height: 10 },
      view: { x: 0, y: 0, zoom: 1, rotate: 0, flip: false },
      popOn: true,
      name: '',
      badge: '',
      adjust: defaultAdjust(),
    };
    expect(normalizeToken({ ...base, halo: 80 }, new Set())?.halo).toBe(80);
    expect(normalizeToken({ ...base, halo: 150 }, new Set())?.halo).toBe(100);
    expect('halo' in (normalizeToken({ ...base, halo: 0 }, new Set()) ?? {})).toBe(false);
    expect('halo' in (normalizeToken({ ...base, mask: null, halo: 50 }, new Set()) ?? {})).toBe(
      false,
    );
    expect(Object.keys(normalizeToken(base, new Set()) ?? {})).toEqual([
      'id',
      'image',
      'view',
      'mask',
      'popOn',
      'name',
      'badge',
      'adjust',
    ]);
  });
});

const canvasLib = await nodeCanvas();

describe.runIf(!!canvasLib)('繪製：色彩平衡、去光暈（node-canvas）', () => {
  const N = 160;
  const solid = (w: number, h: number, rgba: number[]) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`;
    ctx.fillRect(0, 0, w, h);
    return c;
  };
  const render = (l: Look, extra: { popImage?: ReturnType<typeof solid> | null } = {}) => {
    const image = solid(100, 100, [200, 40, 40, 255]);
    const c = renderTokenCanvas(
      {
        N,
        pad: 0.15,
        look: l,
        token: {
          id: 't',
          view: { x: 0, y: -0.6, zoom: 1, rotate: 0, flip: false },
          popOn: true,
          adjust: defaultAdjust(),
        },
        cacheFrame: false,
      },
      {
        image,
        size: { width: 100, height: 100 },
        popMask: solid(100, 100, [255, 255, 255, 255]),
        texture: null,
        popImage: extra.popImage ?? null,
      },
    );
    return (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, N, N).data;
  };

  it('色彩平衡改了外框的漸層（50% 時和沒有這個設定相同）', () => {
    const g = look({ colorMode: 'gradient', g1: '#ffffff', g2: '#000000', gAngle: 0 });
    const a = render(g);
    const b = render({ ...g, gMid: 20 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
    /* 外框左邊（起點色附近）：交界往左移，所以變暗 */
    const lum = (d: Uint8ClampedArray, x: number, y: number) => {
      const i = (y * N + x) * 4;
      return d[i] + d[i + 1] + d[i + 2];
    };
    const R = N * (0.5 - 0.15);
    const x = Math.round(N / 2 - R * 0.5);
    const y = Math.round(N / 2 + Math.sqrt(R * R - (R * 0.5) ** 2) - 2);
    expect(lum(b, x, y)).toBeLessThan(lum(a, x, y));
  });

  it('去光暈：出框用另一張圖（同樣的擺放）；沒有時用圖片本身', () => {
    const plain = render(look());
    const blue = render(look(), { popImage: solid(100, 100, [20, 40, 220, 255]) });
    /* 出框在棋子上方（外框外面）：換成藍色 */
    const at = (d: Uint8ClampedArray, x: number, y: number) =>
      Array.from(d.subarray((y * N + x) * 4, (y * N + x) * 4 + 4));
    expect(at(plain, 80, 6)[0]).toBeGreaterThan(150);
    expect(at(blue, 80, 6)[2]).toBeGreaterThan(150);
    /* 開口裡（遮罩外沒有差別的地方）一樣是圖片：這裡整張都在遮罩裡，所以只比外框下方的透明 */
    expect(at(blue, 2, N - 2)).toEqual(at(plain, 2, N - 2));
  });
});
