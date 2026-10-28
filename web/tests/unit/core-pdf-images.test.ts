/**
 * core/pdf：影像的判斷（QC 的規則＋本站的 Flate 轉 JPEG）、像素處理（預測器、面積平均縮小、照片的判斷）、
 * JPEG 檔頭、mozjpeg 的編解碼（灰階存成單一成分）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  acceptReplacement,
  FLATE_MAX_RATIO,
  FLATE_MIN_PIXELS,
  type ImageFacts,
  MAX_IMAGE_PIXELS,
  planImage,
} from '@/core/pdf/images';
import { createJpegCodec, type JpegCodec, readJpegHeader } from '@/core/pdf/jpeg';
import { LEVELS } from '@/core/pdf/levels';
import {
  downscaleArea,
  flattenOnWhite,
  isGrayRgba,
  looksPhotographic,
  PHOTO_MAX_FLAT,
  PHOTO_MIN_GRAY_LEVELS,
  rowBytes,
  sampledColorCount,
  sampledGrayStats,
  samplesToRgba,
  undoPredictor,
} from '@/core/pdf/pixels';
import { encodeAttempts } from '@/core/pdf/recompress';
import { nodeCodec } from '../helpers/pdfEngine';
import {
  graphicRgba,
  grayGradientChartRgba,
  grayLowContrastRgba,
  grayScanRgba,
  grayScreenshotRgba,
  photoRgba,
} from '../helpers/pdfFixtures';
import { nodeModulePath } from '../helpers/pdfQpdf';

/** 單元測試的型別沒有 Node：模組名稱放在變數裡動態載入 */
const NODE_FS = 'node:fs';

const rgb = { kind: 'rgb', components: 3, label: 'DeviceRGB' } as const;
const gray = { kind: 'gray', components: 1, label: 'DeviceGray' } as const;

function facts(over: Partial<ImageFacts> = {}): ImageFacts {
  return {
    width: 1000,
    height: 800,
    bitsPerComponent: 8,
    filters: ['DCTDecode'],
    color: rgb,
    hasSMask: false,
    colorKeyMask: false,
    stencilMask: false,
    imageMask: false,
    colorTransform: false,
    storedBytes: 100_000,
    ...over,
  };
}

const opts = { convertFlate: true, usedAsMask: false };

describe('影像的判斷（JPEG：QC 的規則）', () => {
  it('DCTDecode 的 RGB／灰階、Flate 包著的 JPEG：重新壓縮', () => {
    expect(planImage(facts(), opts)).toEqual({ kind: 'jpeg', wrapped: false, gray: false });
    expect(planImage(facts({ color: gray }), opts)).toEqual({
      kind: 'jpeg',
      wrapped: false,
      gray: true,
    });
    expect(planImage(facts({ filters: ['FlateDecode', 'DCTDecode'] }), opts)).toEqual({
      kind: 'jpeg',
      wrapped: true,
      gray: false,
    });
  });

  it('ICCBased 3／1 色當成 RGB／灰階（colorInfo 的結果）；CMYK、Indexed、ICC 4 色不動', () => {
    expect(
      planImage(facts({ color: { kind: 'rgb', components: 3, label: 'ICCBased' } }), opts).kind,
    ).toBe('jpeg');
    for (const kind of ['cmyk', 'indexed', 'icc', 'other', 'none'] as const) {
      expect(planImage(facts({ color: { kind, components: 4, label: kind } }), opts)).toEqual({
        kind: 'skip',
        reason: 'colorspace',
      });
    }
  });

  it('不是 8 位元、濾鏡鏈不認得、ColorTransform、顏色範圍遮罩：不動', () => {
    expect(planImage(facts({ bitsPerComponent: 1 }), opts)).toMatchObject({ reason: 'bits' });
    expect(planImage(facts({ filters: ['ASCII85Decode', 'DCTDecode'] }), opts)).toMatchObject({
      reason: 'filter',
    });
    expect(planImage(facts({ colorTransform: true }), opts)).toMatchObject({
      reason: 'color-transform',
    });
    expect(planImage(facts({ colorKeyMask: true }), opts)).toMatchObject({ reason: 'color-key' });
  });

  it('帶軟遮罩的 JPEG 照樣重新壓縮（遮罩本身不動）；被當成遮罩的影像不動', () => {
    expect(planImage(facts({ hasSMask: true }), opts).kind).toBe('jpeg');
    expect(planImage(facts(), { ...opts, usedAsMask: true })).toMatchObject({
      reason: 'used-as-mask',
    });
    expect(planImage(facts({ imageMask: true }), opts)).toMatchObject({ reason: 'image-mask' });
  });

  it('沒有寬高、像素太多：不動', () => {
    expect(planImage(facts({ width: 0 }), opts)).toMatchObject({ reason: 'no-size' });
    expect(MAX_IMAGE_PIXELS).toBe(50_000_000);
    expect(planImage(facts({ width: 10_000, height: 6_000 }), opts)).toMatchObject({
      reason: 'too-large',
    });
  });
});

describe('影像的判斷（Flate 轉 JPEG：本站）', () => {
  const flate = (o: Partial<ImageFacts> = {}) => facts({ filters: ['FlateDecode'], ...o });

  it('大張的 Flate／沒壓縮的 RGB、灰階：轉', () => {
    expect(planImage(flate(), opts)).toEqual({ kind: 'flate', compressed: true, gray: false });
    expect(planImage(flate({ filters: [], color: gray }), opts)).toEqual({
      kind: 'flate',
      compressed: false,
      gray: true,
    });
  });

  it('關掉時不轉（QC：不是 JPEG 的一律不動）', () => {
    expect(planImage(flate(), { ...opts, convertFlate: false })).toMatchObject({
      reason: 'not-jpeg',
    });
  });

  it('有遮罩、太小、JPEG 2000／JBIG2／CCITT、不是 8 位元、CMYK：不轉', () => {
    expect(planImage(flate({ hasSMask: true }), opts)).toMatchObject({ reason: 'has-mask' });
    expect(planImage(flate({ stencilMask: true }), opts)).toMatchObject({ reason: 'has-mask' });
    expect(FLATE_MIN_PIXELS).toBe(90_000);
    expect(planImage(flate({ width: 299, height: 300 }), opts)).toMatchObject({ reason: 'small' });
    for (const f of ['JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode', 'LZWDecode']) {
      expect(planImage(flate({ filters: [f] }), opts)).toMatchObject({ reason: 'filter' });
    }
    expect(planImage(flate({ bitsPerComponent: 16 }), opts)).toMatchObject({ reason: 'bits' });
    expect(
      planImage(flate({ color: { kind: 'cmyk', components: 4, label: 'DeviceCMYK' } }), opts),
    ).toMatchObject({
      reason: 'colorspace',
    });
  });

  it('換不換：JPEG 要比原本小；Flate 轉 JPEG 要小到 0.8 倍以下', () => {
    const j = planImage(facts(), opts);
    expect(acceptReplacement(j, 1000, 999)).toBe(true);
    expect(acceptReplacement(j, 1000, 1000)).toBe(false);
    const f = planImage(flate(), opts);
    expect(FLATE_MAX_RATIO).toBe(0.8);
    expect(acceptReplacement(f, 1000, 800)).toBe(true);
    expect(acceptReplacement(f, 1000, 801)).toBe(false);
  });
});

describe('像素處理', () => {
  it('PNG 預測器：None、Sub、Up、Average、Paeth', () => {
    /* 2 × 3 的 RGB（每列 6 位元組） */
    const rows = [
      [10, 20, 30, 40, 50, 60],
      [11, 22, 33, 44, 55, 66],
      [5, 5, 5, 200, 200, 200],
    ];
    const enc: number[] = [];
    /* 第 1 列 Sub、第 2 列 Up、第 3 列 Paeth（自己算一次編碼） */
    enc.push(1, ...rows[0].map((v, x) => (v - (x >= 3 ? rows[0][x - 3] : 0)) & 0xff));
    enc.push(2, ...rows[1].map((v, x) => (v - rows[0][x]) & 0xff));
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    enc.push(
      4,
      ...rows[2].map((v, x) => {
        const a = x >= 3 ? rows[2][x - 3] : 0;
        const b = rows[1][x];
        const c = x >= 3 ? rows[1][x - 3] : 0;
        return (v - paeth(a, b, c)) & 0xff;
      }),
    );
    const out = undoPredictor(
      Uint8Array.from(enc),
      { predictor: 15, colors: 3, bitsPerComponent: 8, columns: 2 },
      3,
    );
    expect(Array.from(out)).toEqual(rows.flat());
    /* Average */
    const avg = undoPredictor(
      Uint8Array.from([3, 10, 10, 10, 10, 10, 10]),
      {
        predictor: 13,
        colors: 3,
        bitsPerComponent: 8,
        columns: 2,
      },
      1,
    );
    expect(Array.from(avg)).toEqual([10, 10, 10, 15, 15, 15]);
  });

  it('TIFF 預測器（橫向差分）與沒有預測器', () => {
    const out = undoPredictor(
      Uint8Array.from([10, 5, 5, 1]),
      { predictor: 2, colors: 1, bitsPerComponent: 8, columns: 4 },
      1,
    );
    expect(Array.from(out)).toEqual([10, 15, 20, 21]);
    expect(
      Array.from(
        undoPredictor(
          Uint8Array.from([1, 2]),
          { predictor: 1, colors: 1, bitsPerComponent: 8, columns: 2 },
          1,
        ),
      ),
    ).toEqual([1, 2]);
    expect(rowBytes(5, 3, 8)).toBe(15);
    expect(rowBytes(10, 1, 1)).toBe(2);
  });

  it('灰階／RGB 樣本 → RGBA', () => {
    expect(Array.from(samplesToRgba(Uint8Array.from([7, 9]), 2, 1, 1))).toEqual([
      7, 7, 7, 255, 9, 9, 9, 255,
    ]);
    expect(Array.from(samplesToRgba(Uint8Array.from([1, 2, 3]), 1, 1, 3))).toEqual([1, 2, 3, 255]);
  });

  it('面積平均縮小：2 × 2 → 1 × 1 是平均；3 → 2 依涵蓋的比例加權', () => {
    const four = Uint8ClampedArray.from([
      0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255,
    ]);
    expect(Array.from(downscaleArea(four, 2, 2, 1, 1))).toEqual([100, 100, 100, 255]);
    const three = Uint8ClampedArray.from([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]);
    /* 輸出第 1 格涵蓋 [0, 1.5)：0 × 2/3 ＋ 90 × 1/3 ＝ 30；第 2 格 [1.5, 3)：90 × 1/3 ＋ 180 × 2/3 ＝ 150 */
    expect(Array.from(downscaleArea(three, 3, 1, 2, 1))).toEqual([
      30, 30, 30, 255, 150, 150, 150, 255,
    ]);
    /* 不放大 */
    expect(downscaleArea(four, 2, 2, 4, 4).length).toBe(16);
  });

  it('照片的判斷：顏色多、Flate 壓不太下去才算', () => {
    const photo = photoRgba(200, 150, 1);
    const chart = graphicRgba(200, 150);
    expect(sampledColorCount(photo, 200, 150)).toBeGreaterThanOrEqual(256);
    expect(sampledColorCount(chart, 200, 150)).toBeLessThan(10);
    expect(looksPhotographic(photo, 200, 150, 60_000, 90_000)).toBe(true);
    expect(looksPhotographic(photo, 200, 150, 5_000, 90_000)).toBe(false);
    expect(looksPhotographic(chart, 200, 150, 60_000, 90_000)).toBe(false);
    /* 沒壓縮的（不知道壓不壓得下去）只看顏色 */
    expect(looksPhotographic(photo, 200, 150, 90_000, 0)).toBe(true);
  });

  it('灰階的照片判斷（M4）：掃描、低對比的照片轉；圖表、截圖、漸層填色的圖表不轉', () => {
    const W = 600;
    const H = 400;
    const raw = W * H;
    const photo = (rgba: Uint8ClampedArray) => looksPhotographic(rgba, W, H, raw * 0.6, raw, true);
    const scan = grayScanRgba(W, H);
    const low = grayLowContrastRgba(W, H);
    const shot = grayScreenshotRgba(W, H);
    const gradient = grayGradientChartRgba(W, H);
    /* 掃描、低對比照片的階數都不到彩色的 256，但 ≥ 32、相鄰像素很少完全相同 */
    for (const img of [scan, low]) {
      const st = sampledGrayStats(img, W, H);
      expect(st.levels).toBeGreaterThanOrEqual(PHOTO_MIN_GRAY_LEVELS);
      expect(st.levels).toBeLessThan(256);
      expect(st.flat).toBeLessThan(PHOTO_MAX_FLAT);
      expect(photo(img)).toBe(true);
      /* 彩色的門檻（256 色）不變：同一張當成彩色不算照片 */
      expect(looksPhotographic(img, W, H, raw * 1.8, raw * 3)).toBe(false);
    }
    /* 截圖：階數少；漸層填色：階數夠多，但大片平塗 */
    expect(sampledGrayStats(shot, W, H).levels).toBeLessThan(PHOTO_MIN_GRAY_LEVELS);
    expect(photo(shot)).toBe(false);
    expect(sampledGrayStats(gradient, W, H).levels).toBeGreaterThanOrEqual(PHOTO_MIN_GRAY_LEVELS);
    expect(sampledGrayStats(gradient, W, H).flat).toBeGreaterThan(PHOTO_MAX_FLAT);
    expect(photo(gradient)).toBe(false);
    /* Flate 壓得很小的（圖表）仍然不算 */
    expect(looksPhotographic(scan, W, H, raw * 0.05, raw, true)).toBe(false);
  });

  it('灰階的判斷、疊在白底上', () => {
    expect(isGrayRgba(Uint8ClampedArray.from([5, 6, 7, 255]))).toBe(true);
    expect(isGrayRgba(Uint8ClampedArray.from([5, 6, 12, 255]))).toBe(false);
    const px = Uint8ClampedArray.from([0, 0, 0, 0, 0, 0, 0, 128]);
    flattenOnWhite(px);
    expect(Array.from(px)).toEqual([255, 255, 255, 255, 127, 127, 127, 255]);
  });
});

describe('JPEG（mozjpeg）', () => {
  it('彩色存成 3 個成分、灰階存成 1 個成分；檔頭讀得出寬高與漸進式', async () => {
    const codec = nodeCodec();
    const img = { data: photoRgba(64, 48, 2), width: 64, height: 48 };
    const color = await codec.encode(img, { quality: 70, gray: false });
    const g = await codec.encode(img, { quality: 70, gray: true });
    expect(readJpegHeader(color)).toMatchObject({
      width: 64,
      height: 48,
      components: 3,
      progressive: true,
    });
    expect(readJpegHeader(g)).toMatchObject({ width: 64, height: 48, components: 1 });
    expect(g.length).toBeLessThan(color.length);
    const back = await codec.decode(g);
    expect([back.width, back.height]).toEqual([64, 48]);
    expect(back.data[0]).toBe(back.data[1]);
  });

  it('不是 JPEG、截斷的檔頭：null', () => {
    expect(readJpegHeader(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readJpegHeader(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBeNull();
  });
});

describe('每張圖試的設定（L5、L12）', () => {
  /** 假的編碼器：記下每次的尺寸與品質；大小＝像素數 ÷ 品質 */
  function countingCodec() {
    const calls: { width: number; quality: number }[] = [];
    const codec: JpegCodec = {
      decode: async () => {
        throw new Error('unused');
      },
      encode: async (img, o) => {
        calls.push({ width: img.width, quality: o.quality });
        return new Uint8Array(Math.ceil((img.width * img.height) / o.quality));
      },
    };
    return { calls, codec };
  }
  const img = { data: new Uint8ClampedArray(3000 * 2000 * 4), width: 3000, height: 2000 };

  it('平衡：量得到大小的影像不試 QC 的 balanced（不看 DPI 的那一組）', async () => {
    const a = countingCodec();
    await encodeAttempts(img, { widthIn: 6, heightIn: 4 }, LEVELS.balanced.images, false, a.codec);
    expect(a.calls).toEqual([{ width: 900, quality: 72 }]);
    const b = countingCodec();
    await encodeAttempts(img, null, LEVELS.balanced.images, false, b.codec);
    expect(b.calls).toEqual([
      { width: 1755, quality: 72 },
      { width: 2480, quality: 78 },
    ]);
  });

  it('最小：包含平衡的全部設定，每張圖的結果不會比平衡大', async () => {
    for (const a of LEVELS.balanced.images) expect(LEVELS.smallest.images).toContainEqual(a);
    for (const placement of [null, { widthIn: 6, heightIn: 4 }, { widthIn: 30, heightIn: 20 }]) {
      const bal = await encodeAttempts(
        img,
        placement,
        LEVELS.balanced.images,
        false,
        countingCodec().codec,
      );
      const small = await encodeAttempts(
        img,
        placement,
        LEVELS.smallest.images,
        false,
        countingCodec().codec,
      );
      expect(small!.bytes.length).toBeLessThanOrEqual(bal!.bytes.length);
    }
  });
});

describe('mozjpeg 的警告（L2）', () => {
  it('libjpeg 的警告不印到 console.error，交給 onMessage', async () => {
    const good = await nodeCodec().encode(
      { data: photoRgba(64, 48, 2), width: 64, height: 48 },
      { quality: 80, gray: false },
    );
    /* SOI 後面插 2 個多的位元組：libjpeg 會警告「2 extraneous bytes before marker 0xe0」 */
    const bad = new Uint8Array(good.length + 2);
    bad.set(good.subarray(0, 2));
    bad.set(good.subarray(2), 4);
    const messages: string[] = [];
    const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
      readFileSync(p: string): Uint8Array;
    };
    const codec = createJpegCodec(
      async (which) =>
        WebAssembly.compile(
          fs.readFileSync(
            nodeModulePath(`@jsquash/jpeg/codec/${which}/mozjpeg_${which}.wasm`),
          ) as Uint8Array<ArrayBuffer>,
        ),
      { onMessage: (t) => messages.push(t) },
    );
    const spy = vi.spyOn(console, 'error');
    const img = await codec.decode(bad);
    expect(img.width).toBe(64);
    expect(spy).not.toHaveBeenCalled();
    expect(messages.join('\n')).toMatch(/Corrupt JPEG data/);
  });
});
