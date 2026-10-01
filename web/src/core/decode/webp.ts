/**
 * 動態 WebP：解析 RIFF／VP8X／ANIM／ANMF（純 JavaScript），每格的影像交給瀏覽器解碼（注入 decodeStill），
 * 再依「混合／不混合」與「處置／不處置」合成成完整畫面。
 */
import { parseWebp, riffChunk } from '../encode/webp';
import { type DecodedAnimation, type DecodeOptions, frameDelay } from './types';

export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export interface WebpAnimFrameInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
  /** true＝疊上（alpha 混合）；false＝不混合（直接取代） */
  blend: boolean;
  /** true＝顯示完後把範圍清成透明 */
  dispose: boolean;
  /** 這一格的單張 WebP 檔（可直接交給瀏覽器解碼） */
  still: Uint8Array;
}

export interface WebpInfo {
  width: number;
  height: number;
  animated: boolean;
  /** 0＝無限 */
  loops: number;
  frames: WebpAnimFrameInfo[];
}

const u24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

function riffFile(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const n = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(12 + n);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(out.buffer).setUint32(4, 4 + n, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  let o = 12;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** 把一格的 ALPH＋VP8（或 VP8L）包成單張 WebP 檔 */
function stillFromFrame(w: number, h: number, sub: { fourcc: string; data: Uint8Array }[]) {
  const hasAlph = sub.some((c) => c.fourcc === 'ALPH');
  const parts: Uint8Array[] = [];
  if (hasAlph) {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x10;
    vp8x[4] = (w - 1) & 255;
    vp8x[5] = ((w - 1) >> 8) & 255;
    vp8x[6] = ((w - 1) >> 16) & 255;
    vp8x[7] = (h - 1) & 255;
    vp8x[8] = ((h - 1) >> 8) & 255;
    vp8x[9] = ((h - 1) >> 16) & 255;
    parts.push(riffChunk('VP8X', vp8x));
  }
  for (const c of sub)
    if (c.fourcc === 'ALPH' || c.fourcc === 'VP8 ' || c.fourcc === 'VP8L')
      parts.push(riffChunk(c.fourcc, c.data));
  return riffFile(parts);
}

/** 解析 WebP 的結構（不解碼影像） */
export function parseWebpInfo(bytes: Uint8Array): WebpInfo {
  const chunks = parseWebp(bytes);
  const vp8x = chunks.find((c) => c.fourcc === 'VP8X');
  if (!vp8x) {
    /* 單張（VP8／VP8L） */
    return { width: 0, height: 0, animated: false, loops: 0, frames: [] };
  }
  const width = u24(vp8x.data, 4) + 1;
  const height = u24(vp8x.data, 7) + 1;
  const animated = !!(vp8x.data[0] & 0x02);
  const anim = chunks.find((c) => c.fourcc === 'ANIM');
  const loops = anim ? anim.data[4] | (anim.data[5] << 8) : 0;
  const frames: WebpAnimFrameInfo[] = [];
  for (const c of chunks) {
    if (c.fourcc !== 'ANMF') continue;
    const d = c.data;
    const w = u24(d, 6) + 1;
    const h = u24(d, 9) + 1;
    const flags = d[15];
    const sub = parseWebp(riffFile([d.subarray(16)]));
    frames.push({
      x: u24(d, 0) * 2,
      y: u24(d, 3) * 2,
      w,
      h,
      durationMs: u24(d, 12),
      blend: !(flags & 0x02),
      dispose: !!(flags & 0x01),
      still: stillFromFrame(w, h, sub),
    });
  }
  return { width, height, animated, loops, frames };
}

/** 單張影像解碼器：檔案位元組 → RGBA（瀏覽器版見 index.ts 的 decodeStillImage） */
export type StillDecoder = (
  bytes: Uint8Array,
) => Promise<{ width: number; height: number; rgba: Uint8ClampedArray }>;

/** 動態 WebP 解碼成逐格的完整畫面（單張 WebP 回傳一格） */
export async function decodeWebp(
  bytes: Uint8Array,
  decodeStill: StillDecoder,
  options: DecodeOptions = {},
): Promise<DecodedAnimation> {
  const { maxFrames = 500 } = options;
  const info = parseWebpInfo(bytes);
  if (!info.animated || !info.frames.length) {
    const s = await decodeStill(bytes);
    return {
      format: 'webp',
      width: s.width,
      height: s.height,
      loops: 0,
      truncated: false,
      frames: [{ rgba: new Uint8ClampedArray(s.rgba), delayMs: frameDelay(undefined, options) }],
    };
  }
  const W = info.width;
  const H = info.height;
  const canvas = new Uint8ClampedArray(W * H * 4);
  const frames: DecodedAnimation['frames'] = [];
  let truncated = false;
  for (const f of info.frames) {
    if (frames.length >= maxFrames) {
      truncated = true;
      break;
    }
    const img = await decodeStill(f.still);
    for (let y = 0; y < Math.min(f.h, img.height); y++) {
      const cy = f.y + y;
      if (cy >= H) continue;
      for (let x = 0; x < Math.min(f.w, img.width); x++) {
        const cx = f.x + x;
        if (cx >= W) continue;
        const s = (y * img.width + x) * 4;
        const d = (cy * W + cx) * 4;
        const sa = img.rgba[s + 3];
        if (!f.blend || sa === 255) {
          canvas[d] = img.rgba[s];
          canvas[d + 1] = img.rgba[s + 1];
          canvas[d + 2] = img.rgba[s + 2];
          canvas[d + 3] = sa;
        } else if (sa > 0) {
          const da = canvas[d + 3] / 255;
          const a = sa / 255;
          const oa = a + da * (1 - a);
          for (let k = 0; k < 3; k++)
            canvas[d + k] = Math.round((img.rgba[s + k] * a + canvas[d + k] * da * (1 - a)) / oa);
          canvas[d + 3] = Math.round(oa * 255);
        }
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs: frameDelay(f.durationMs, options) });
    if (f.dispose) {
      for (let y = f.y; y < Math.min(H, f.y + f.h); y++)
        canvas.fill(0, (y * W + f.x) * 4, (y * W + Math.min(W, f.x + f.w)) * 4);
    }
  }
  return { format: 'webp', width: W, height: H, loops: info.loops, frames, truncated };
}
