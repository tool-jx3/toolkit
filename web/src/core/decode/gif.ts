/**
 * GIF 解碼（純 JavaScript）：全域／區域調色盤、LZW、交錯、透明色、處置方式（不處置、清空、還原前一格）、
 * NETSCAPE 播放次數。每一格回傳合成後的完整畫面。
 */
import { type DecodedAnimation, type DecodeOptions, frameDelay } from './types';

export function isGif(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  );
}

/** 讀連續的資料子區塊（長度＋內容…以 0 結尾） */
function readSubBlocks(b: Uint8Array, o: number): { data: Uint8Array; next: number } {
  const parts: Uint8Array[] = [];
  let n = 0;
  while (o < b.length) {
    const len = b[o++];
    if (!len) break;
    parts.push(b.subarray(o, o + len));
    n += len;
    o += len;
  }
  const data = new Uint8Array(n);
  let p = 0;
  for (const part of parts) {
    data.set(part, p);
    p += part.length;
  }
  return { data, next: o };
}

/** LZW 解壓成索引 */
function lzw(data: Uint8Array, minSize: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let size = minSize + 1;
  let mask = (1 << size) - 1;
  let next = eoi + 1;
  let old = -1;
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    first[i] = i;
  }
  let p = 0;
  while (o < count) {
    while (bits < size && p < data.length) {
      acc |= data[p++] << bits;
      bits += 8;
    }
    if (bits < size) break;
    const code = acc & mask;
    acc >>>= size;
    bits -= size;
    if (code === clear) {
      size = minSize + 1;
      mask = (1 << size) - 1;
      next = eoi + 1;
      old = -1;
      continue;
    }
    if (code === eoi) break;
    let c = code;
    let sp = 0;
    if (old === -1) {
      out[o++] = suffix[code];
      old = code;
      continue;
    }
    if (code >= next) {
      /* KwKwK：還沒建立的碼＝舊字串＋舊字串的第一個字 */
      stack[sp++] = first[old];
      c = old;
    }
    while (c >= clear && sp < 4096) {
      stack[sp++] = suffix[c];
      c = prefix[c];
    }
    stack[sp++] = c;
    if (next < 4096) {
      prefix[next] = old;
      suffix[next] = c;
      first[next] = first[old];
      next++;
      if (next > mask && size < 12) {
        size++;
        mask = (1 << size) - 1;
      }
    }
    while (sp > 0 && o < count) out[o++] = stack[--sp];
    old = code;
  }
  return out;
}

/** 交錯的列順序 → 實際列號 */
function interlacedRows(h: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ])
    for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}

export function decodeGif(bytes: Uint8Array, options: DecodeOptions = {}): DecodedAnimation {
  if (!isGif(bytes)) throw new Error('不是 GIF 檔');
  const { maxFrames = 500 } = options;
  const u16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  const W = u16(6);
  const H = u16(8);
  const packed = bytes[10];
  let o = 13;
  let gct: Uint8Array | null = null;
  if (packed & 0x80) {
    const n = 3 * (1 << ((packed & 7) + 1));
    gct = bytes.subarray(o, o + n);
    o += n;
  }
  let loops = 1;
  let delay: number | undefined;
  let transparent = -1;
  let dispose = 0;
  const canvas = new Uint8ClampedArray(W * H * 4);
  const frames: DecodedAnimation['frames'] = [];
  let truncated = false;
  while (o < bytes.length) {
    const block = bytes[o++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[o++];
      if (label === 0xf9) {
        const len = bytes[o];
        const p = bytes[o + 1];
        dispose = (p >> 2) & 7;
        const cs = u16(o + 2);
        delay = cs ? cs * 10 : undefined;
        transparent = p & 1 ? bytes[o + 4] : -1;
        o += 1 + len;
        o = readSubBlocks(bytes, o).next;
      } else if (label === 0xff) {
        const len = bytes[o];
        const id = String.fromCharCode(...bytes.subarray(o + 1, o + 1 + len));
        const { data, next } = readSubBlocks(bytes, o + 1 + len);
        if ((id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') && data.length >= 3 && data[0] === 1) {
          const n = data[1] | (data[2] << 8);
          loops = n === 0 ? 0 : n + 1;
        }
        o = next;
      } else {
        o = readSubBlocks(bytes, o).next;
      }
      continue;
    }
    if (block !== 0x2c) break;
    const fx = u16(o);
    const fy = u16(o + 2);
    const fw = u16(o + 4);
    const fh = u16(o + 6);
    const ip = bytes[o + 8];
    o += 9;
    let table = gct;
    if (ip & 0x80) {
      const n = 3 * (1 << ((ip & 7) + 1));
      table = bytes.subarray(o, o + n);
      o += n;
    }
    const minSize = bytes[o++];
    const { data, next } = readSubBlocks(bytes, o);
    o = next;
    if (frames.length >= maxFrames) {
      truncated = true;
      break;
    }
    const idx = lzw(data, minSize, fw * fh);
    const rows = ip & 0x40 ? interlacedRows(fh) : null;
    const saved = dispose === 3 ? canvas.slice() : null;
    for (let r = 0; r < fh; r++) {
      const y = fy + (rows ? rows[r] : r);
      if (y >= H) continue;
      for (let x = 0; x < fw; x++) {
        const cx = fx + x;
        if (cx >= W) continue;
        const k = idx[r * fw + x];
        if (k === transparent) continue;
        const d = (y * W + cx) * 4;
        canvas[d] = table?.[k * 3] ?? 0;
        canvas[d + 1] = table?.[k * 3 + 1] ?? 0;
        canvas[d + 2] = table?.[k * 3 + 2] ?? 0;
        canvas[d + 3] = 255;
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs: frameDelay(delay, options) });
    if (dispose === 2) {
      for (let y = fy; y < Math.min(H, fy + fh); y++)
        canvas.fill(0, (y * W + fx) * 4, (y * W + Math.min(W, fx + fw)) * 4);
    } else if (dispose === 3 && saved) canvas.set(saved);
    /* 圖形控制延伸只作用在下一張圖 */
    delay = undefined;
    transparent = -1;
    dispose = 0;
  }
  return { format: 'gif', width: W, height: H, loops, frames, truncated };
}
