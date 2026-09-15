import UPNG from 'upng-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface EncodeRequest {
  buffers: ArrayBuffer[];
  w: number;
  h: number;
  format: 'apng' | 'gif' | 'png';
  fps: number;
  /** APNG: 量子化色数。0=無損失 */
  colors: number;
  /** GIF: 半透明ピクセルを合成する色。null=1bit透過 */
  matte: string | null;
}

export type EncodeResponse =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; buffer: ArrayBuffer; mime: string }
  | { kind: 'error'; message: string };

function parseHex(c: string): [number, number, number] {
  const hex = c.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** 半透明ピクセルを bg に合成して完全不透明にする */
function matteInPlace(data: Uint8ClampedArray, bg: string): void {
  const [br, bg_, bb] = parseHex(bg);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    data[i] = Math.round(data[i] * a + br * (1 - a));
    data[i + 1] = Math.round(data[i + 1] * a + bg_ * (1 - a));
    data[i + 2] = Math.round(data[i + 2] * a + bb * (1 - a));
    data[i + 3] = 255;
  }
}

/** GIFは1bit透過しか持てないので、閾値でアルファを二値化する */
function binarizeAlpha(data: Uint8ClampedArray): void {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) {
      data[i - 3] = 0;
      data[i - 2] = 0;
      data[i - 1] = 0;
      data[i] = 0;
    } else {
      data[i] = 255;
    }
  }
}

/**
 * acTL の num_plays を 0（無限ループ）に書き換える。
 * UPNG.js の出力値に依存しないよう、常に明示的に上書きする。
 */
function forceInfiniteLoop(buf: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 8; // PNG シグネチャ
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const dataStart = off + 8;
    if (type === 'acTL') {
      view.setUint32(dataStart + 4, 0); // num_plays = 0
      // CRC を再計算
      const crc = crc32(bytes.subarray(off + 4, dataStart + len));
      view.setUint32(dataStart + len, crc >>> 0);
      break;
    }
    off = dataStart + len + 4;
  }
  return buf;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodeGif(req: EncodeRequest, post: (m: EncodeResponse) => void): ArrayBuffer {
  const gif = GIFEncoder();
  // ブラウザは歴史的に delay<=10ms を100msへ丸めるため、20ms以上を保証する
  const delay = Math.max(20, Math.round(1000 / req.fps / 10) * 10);
  req.buffers.forEach((b, i) => {
    const data = new Uint8ClampedArray(b);
    if (req.matte) {
      matteInPlace(data, req.matte);
      const palette = quantize(data, 256, { format: 'rgb565' });
      const index = applyPalette(data, palette, 'rgb565');
      gif.writeFrame(index, req.w, req.h, { palette, delay });
    } else {
      binarizeAlpha(data);
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true });
      let transparentIndex = palette.findIndex((c) => c.length >= 4 && c[3] === 0);
      if (transparentIndex < 0) {
        if (palette.length >= 256) palette[255] = [0, 0, 0, 0];
        else palette.push([0, 0, 0, 0]);
        transparentIndex = palette.length >= 256 ? 255 : palette.length - 1;
      }
      const index = applyPalette(data, palette, 'rgba4444');
      gif.writeFrame(index, req.w, req.h, { palette, delay, transparent: true, transparentIndex });
    }
    post({ kind: 'progress', done: i + 1, total: req.buffers.length });
  });
  gif.finish();
  const out = gif.bytes();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

self.onmessage = (e: MessageEvent<EncodeRequest>) => {
  const req = e.data;
  const post = (m: EncodeResponse) => (self as unknown as Worker).postMessage(m);
  try {
    if (req.format === 'gif') {
      const buf = encodeGif(req, post);
      post({ kind: 'done', buffer: buf, mime: 'image/gif' });
      return;
    }
    if (req.format === 'png') {
      const buf = UPNG.encode([req.buffers[0]], req.w, req.h, req.colors);
      post({ kind: 'done', buffer: buf, mime: 'image/png' });
      return;
    }
    const delays = new Array(req.buffers.length).fill(Math.round(1000 / req.fps));
    post({ kind: 'progress', done: 0, total: req.buffers.length });
    const apng = UPNG.encode(req.buffers, req.w, req.h, req.colors, delays);
    post({ kind: 'done', buffer: forceInfiniteLoop(apng), mime: 'image/png' });
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
