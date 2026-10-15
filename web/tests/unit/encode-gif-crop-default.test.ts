/**
 * GIF 編碼器的 `cropFrames` 預設改成開（2026-10：全站的 GIF 第 2 格起只寫變化的範圍；DESIGN.md 4.2 core/encode）：
 * - 全不透明、共用調色盤：第 2 格起只寫和前一格不同的矩形；解碼出來的每一格和改版前（每格寫整格）完全相同，
 *   影格數、延遲、播放次數、調色盤不變，只有檔案變小（含三種抖色、影格表、主成分調色盤）。
 * - 有透明像素（哪一格都算）、每格各自減色（localPalettes）：照舊每格寫整格，輸出和改版前逐位元組相同。
 * - `cropFrames: false`：輸出和改版前的預設逐位元組相同。
 * - `createEncoder` 的測試注入點 `window.__gifCropFrames = false`：照改版前每格寫整格（E2E 與對等驗證比對「打開前」用）。
 *
 * 指紋是改版前的編碼器（commit 097bc18，預設不裁）在同樣輸入下的 SHA-256 前 12 位元組。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decodeGif } from '@/core/decode';
import { createEncoder, GIF_CROP_FRAMES_HOOK } from '@/core/encode/client';
import { GifEncoder, type GifEncoderOptions } from '@/core/encode/gif';
import { copyFrames, gradient, movingSquare, sameBytes, videoLike } from '../helpers/frames';
import { composeGif, parseGif } from '../helpers/gif';

async function sha(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)));
  return Array.from(d.subarray(0, 12), (v) => v.toString(16).padStart(2, '0')).join('');
}

/** 不透明的漸層（超過 256 色）上一個每格往右移 3 px 的白色方塊；hold 的格和前一格相同 */
function slide(W: number, H: number, n: number, hold: number[] = []): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    if (!hold.includes(i)) pos = i;
    const f = gradient(W, H, 1);
    for (let k = 3; k < f.length; k += 4) f[k] = 255;
    for (let y = 6; y < 14; y++)
      for (let x = 2 + pos * 3; x < 10 + pos * 3; x++) f.set([255, 255, 255, 255], (y * W + x) * 4);
    out.push(f);
  }
  return out;
}

/** 前幾格全不透明，最後一格角落有一個透明像素（整段都要每格寫整格） */
function lateHole(): Uint8ClampedArray[] {
  const frames = slide(40, 24, 5);
  frames[4][3] = 0;
  return frames;
}

interface Case {
  opts: Partial<GifEncoderOptions>;
  frames: () => Uint8ClampedArray[];
  W: number;
  H: number;
  ticks?: number[];
  /** 預設會只寫變化的範圍（全不透明、共用調色盤，而且有格子變化的範圍比整格小） */
  crops: boolean;
}

const CASES: Record<string, Case> = {
  /* 全不透明，但每格都有散在整張的閃爍點：變化的範圍就是整格，輸出和以前相同 */
  flicker: { opts: {}, frames: () => videoLike(32, 20, 6), W: 32, H: 20, crops: false },
  slide: {
    opts: { maxColors: 32 },
    frames: () => slide(40, 24, 6, [3]),
    W: 40,
    H: 24,
    crops: true,
  },
  floyd: {
    opts: { maxColors: 16, dither: 'floyd-steinberg' },
    frames: () => slide(40, 24, 5),
    W: 40,
    H: 24,
    crops: true,
  },
  luma: {
    opts: { maxColors: 16, dither: 'luma' },
    frames: () => slide(40, 24, 5),
    W: 40,
    H: 24,
    crops: true,
  },
  pca: {
    opts: { maxColors: 24, paletteMethod: 'pca', plays: 1 },
    frames: () => slide(40, 24, 5),
    W: 40,
    H: 24,
    crops: true,
  },
  table: {
    opts: { fps: 100, variableDelay: true, plays: 3 },
    frames: () => slide(40, 24, 6, [2]),
    W: 40,
    H: 24,
    ticks: [3, 1, 7, 2, 5, 40],
    crops: true,
  },
  transparent: {
    opts: {},
    frames: () => movingSquare(24, 16, 8, [3, 4]),
    W: 24,
    H: 16,
    crops: false,
  },
  lateHole: { opts: { maxColors: 32 }, frames: lateHole, W: 40, H: 24, crops: false },
  local: {
    opts: { localPalettes: true },
    frames: () => videoLike(32, 20, 6),
    W: 32,
    H: 20,
    crops: false,
  },
  localDither: {
    opts: { localPalettes: true, maxColors: 16, dither: 'floyd-steinberg' },
    frames: () => slide(40, 24, 5),
    W: 40,
    H: 24,
    crops: false,
  },
};

/** 改版前（097bc18，預設每格寫整格）的輸出指紋 */
const GOLDEN: Record<string, string> = {
  flicker: '4f0c8f8c395237b9e8bedda3',
  slide: 'c5c88358a68174aac4cd7d85',
  floyd: '322ea474664e7df13ee0ff91',
  luma: '13369c3c8e7924c57cb96b88',
  pca: 'f0515ba24ed545f35bcd196e',
  table: 'a26e010a9782466978483337',
  transparent: 'b5cd6f1872f117537ca6bb08',
  lateHole: 'fb11426ecd73b00165387049',
  local: 'eef051309a1ce6104ed2f660',
  localDither: '21096750e2201e5a967b14be',
};

async function run(c: Case, extra: Partial<GifEncoderOptions> = {}) {
  const enc = new GifEncoder({ width: c.W, height: c.H, fps: 10, ...c.opts, ...extra });
  const frames = copyFrames(c.frames());
  for (let i = 0; i < frames.length; i++) await enc.addFrame(frames[i], c.ticks?.[i] ?? 1);
  return enc.finish();
}

const isFull = (c: Case) => (f: { x: number; y: number; width: number; height: number }) =>
  f.x === 0 && f.y === 0 && f.width === c.W && f.height === c.H;

describe('cropFrames: false＝改版前的預設（逐位元組相同）', () => {
  for (const [name, c] of Object.entries(CASES))
    it(name, async () => {
      expect(await sha((await run(c, { cropFrames: false })).bytes)).toBe(GOLDEN[name]);
    });
});

describe('有透明像素、每格各自減色：預設仍每格寫整格，輸出和改版前逐位元組相同', () => {
  for (const [name, c] of Object.entries(CASES).filter(([, c]) => !c.crops))
    it(name, async () => {
      const file = await run(c);
      expect(await sha(file.bytes)).toBe(GOLDEN[name]);
      expect(parseGif(file.bytes).frames.every(isFull(c))).toBe(true);
    });
});

describe('全不透明、共用調色盤：預設只寫變化的範圍，解碼出來每一格和改版前相同', () => {
  for (const [name, c] of Object.entries(CASES).filter(([, c]) => c.crops))
    it(name, async () => {
      const full = await run(c, { cropFrames: false });
      const crop = await run(c);
      expect(crop.bytes.length).toBeLessThan(full.bytes.length);
      expect({ ...crop, bytes: null }).toEqual({ ...full, bytes: null });
      const a = parseGif(full.bytes);
      const b = parseGif(crop.bytes);
      /* 第一格整格、之後至少一格只有變化的範圍；影格數、延遲、處置、播放次數、全域調色盤不變 */
      expect(isFull(c)(b.frames[0])).toBe(true);
      expect(b.frames.slice(1).some((f) => !isFull(c)(f))).toBe(true);
      expect(b.frames.map((f) => [f.delayCs, f.disposal, f.transparentIndex])).toEqual(
        a.frames.map((f) => [f.delayCs, f.disposal, f.transparentIndex]),
      );
      expect([b.width, b.height, b.loopCount]).toEqual([a.width, a.height, a.loopCount]);
      expect(sameBytes(b.globalPalette, a.globalPalette)).toBe(true);
      /* 合成後的每一格逐像素相同（測試用的解析器） */
      const fa = composeGif(a);
      const fb = composeGif(b);
      expect(fb).toHaveLength(fa.length);
      for (let i = 0; i < fa.length; i++) expect(sameBytes(fb[i], fa[i])).toBe(true);
      /* 本專案的解碼器（gif-combiner 讀 GIF 用）也一樣 */
      const da = decodeGif(full.bytes);
      const db = decodeGif(crop.bytes);
      expect(db.frames.map((f) => f.delayMs)).toEqual(da.frames.map((f) => f.delayMs));
      for (let i = 0; i < da.frames.length; i++)
        expect(sameBytes(db.frames[i].rgba, da.frames[i].rgba)).toBe(true);
    });
});

describe('createEncoder 的測試注入點 window.__gifCropFrames', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g[GIF_CROP_FRAMES_HOOK];
  });

  async function viaClient(c: Case, extra: Partial<GifEncoderOptions> = {}) {
    const enc = createEncoder(
      { format: 'gif', options: { width: c.W, height: c.H, fps: 10, ...c.opts, ...extra } },
      { worker: false },
    );
    for (const f of copyFrames(c.frames())) await enc.addFrame(f);
    return enc.finish();
  }

  it('名稱是 __gifCropFrames；沒設時用預設（只寫變化的範圍）', async () => {
    expect(GIF_CROP_FRAMES_HOOK).toBe('__gifCropFrames');
    const c = CASES.slide;
    expect(sameBytes((await viaClient(c)).bytes, (await run(c)).bytes)).toBe(true);
  });

  it('設成 false：每格寫整格（和改版前逐位元組相同），明確給 cropFrames: true 也一樣', async () => {
    g[GIF_CROP_FRAMES_HOOK] = false;
    const c = CASES.slide;
    expect(await sha((await viaClient(c)).bytes)).toBe(GOLDEN.slide);
    expect(await sha((await viaClient(c, { cropFrames: true })).bytes)).toBe(GOLDEN.slide);
  });

  it('只認 false：其他值（true、字串）照預設', async () => {
    const c = CASES.slide;
    const crop = (await run(c)).bytes;
    for (const v of [true, 'false', 0]) {
      g[GIF_CROP_FRAMES_HOOK] = v;
      expect(sameBytes((await viaClient(c)).bytes, crop)).toBe(true);
    }
  });
});
