/**
 * core/decode 的 PNG 解碼快路（每列依濾波種類一個迴圈、8 位元常見格式直接搬、APNG 取代整列搬）：
 * 手做各種色彩類型的 PNG（每列隨機的濾波，依 PNG 規範正向濾波後壓縮），解回來要與原始像素相同；
 * 資料不完整（截斷）時缺的位元組當 0；APNG 的取代與疊上混合。
 */
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeApng, decodePng } from '@/core/decode/png';
import { ApngEncoder, chunk, concat, PNG_SIGNATURE } from '@/core/encode';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** 依 PNG 規範正向濾波（每列用 types[y]） */
function filterWith(raw: Uint8Array, stride: number, h: number, bpp: number, types: number[]) {
  const out = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const f = types[y];
    out[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * stride + i];
      const a = i >= bpp ? raw[y * stride + i - bpp] : 0;
      const b = y > 0 ? raw[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? raw[(y - 1) * stride + i - bpp] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      out[y * (stride + 1) + 1 + i] = (x - pred) & 255;
    }
  }
  return out;
}

function png(w: number, h: number, color: number, filtered: Uint8Array, extra: Uint8Array[] = []) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = color;
  return concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', zlibSync(filtered)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('PNG 解碼的快路（8 位元、各種濾波）', () => {
  const W = 23;
  const H = 17;
  const cases = [
    { color: 6, ch: 4 },
    { color: 2, ch: 3 },
    { color: 4, ch: 2 },
    { color: 0, ch: 1 },
    { color: 3, ch: 1 },
  ];
  for (const { color, ch } of cases) {
    it(`色彩類型 ${color}：每列隨機濾波，解回原始像素`, () => {
      const r = rng(color * 97 + 5);
      const stride = W * ch;
      const raw = Uint8Array.from({ length: stride * H }, () => Math.floor(r() * 256));
      const types = Array.from({ length: H }, (_, y) => y % 5);
      /* 調色盤：200 色、tRNS 只給前 50 色（其餘不透明）；索引超出調色盤的當黑色 */
      const plte = Uint8Array.from({ length: 200 * 3 }, () => Math.floor(r() * 256));
      const trns = Uint8Array.from({ length: 50 }, () => Math.floor(r() * 256));
      const extra = color === 3 ? [chunk('PLTE', plte), chunk('tRNS', trns)] : [];
      const out = decodePng(png(W, H, color, filterWith(raw, stride, H, ch, types), extra));
      const want = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const s = raw.subarray(i * ch, i * ch + ch);
        const px =
          color === 6
            ? [s[0], s[1], s[2], s[3]]
            : color === 2
              ? [s[0], s[1], s[2], 255]
              : color === 4
                ? [s[0], s[0], s[0], s[1]]
                : color === 0
                  ? [s[0], s[0], s[0], 255]
                  : [
                      plte[s[0] * 3] ?? 0,
                      plte[s[0] * 3 + 1] ?? 0,
                      plte[s[0] * 3 + 2] ?? 0,
                      s[0] < trns.length ? trns[s[0]] : 255,
                    ];
        want.set(px, i * 4);
      }
      expect(out.rgba).toEqual(want);
    });
  }

  it('無效的濾波值當作不濾波；資料不完整時缺的位元組當 0', () => {
    const raw = Uint8Array.from({ length: 4 * 3 * 2 }, (_, i) => (i * 37) & 255);
    const filtered = filterWith(raw, 12, 2, 4, [0, 0]);
    filtered[13] = 7; /* 第二列的濾波位元組：無效 */
    const full = decodePng(png(3, 2, 6, filtered));
    expect(Array.from(full.rgba)).toEqual(Array.from(raw));
    const cut = decodePng(png(3, 2, 6, filtered.subarray(0, 20)));
    expect(Array.from(cut.rgba.subarray(0, 12))).toEqual(Array.from(raw.subarray(0, 12)));
    expect(Array.from(cut.rgba.subarray(19))).toEqual(new Array(5).fill(0));
  });
});

describe('APNG 合成（取代整列搬、疊上逐點混合）', () => {
  it('ApngEncoder 的差分影格（取代）解回每一格完整畫面', async () => {
    const r = rng(42);
    const W = 31;
    const H = 19;
    const frames = Array.from({ length: 4 }, () => new Uint8ClampedArray(W * H * 4));
    frames[0].forEach((_, i) => {
      frames[0][i] = Math.floor(r() * 256);
    });
    for (let k = 1; k < 4; k++) {
      frames[k].set(frames[k - 1]);
      for (let y = 3 + k; y < 9 + k; y++)
        for (let x = 2 * k; x < 10 + 2 * k; x++) {
          const o = (y * W + x) * 4;
          frames[k].set([Math.floor(r() * 256), 0, k * 40, 128 + k], o);
        }
    }
    const enc = new ApngEncoder({ width: W, height: H, fps: 10, mergeIdentical: false });
    for (const f of frames) await enc.addFrame(f);
    const d = decodeApng((await enc.finish()).bytes);
    expect(d.frames).toHaveLength(4);
    d.frames.forEach((f, i) => {
      expect(f.rgba).toEqual(frames[i]);
    });
  });
});
