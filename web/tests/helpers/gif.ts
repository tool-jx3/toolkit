/** 測試用的 GIF 解析器（結構＋LZW 解碼），不依賴被測的編碼器 */

export interface GifFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1/100 秒 */
  delayCs: number;
  disposal: number;
  transparentIndex: number | null;
  indices: Uint8Array;
  /** 這格自己的區域調色盤（RGB 平鋪）；沒有時為 null（用全域調色盤） */
  localPalette: Uint8Array | null;
}

export interface GifInfo {
  width: number;
  height: number;
  globalPalette: Uint8Array;
  /** NETSCAPE 擴充的重播次數；沒有這個擴充時為 null（只播一次） */
  loopCount: number | null;
  frames: GifFrame[];
}

function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    codeSize = minCodeSize + 1;
  };
  reset();
  let bitPos = 0;
  let prev: number[] | null = null;
  let o = 0;
  const read = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = data[(bitPos + i) >> 3];
      if (byte === undefined) return eoi;
      v |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    return v;
  };
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('LZW 資料錯誤');
    for (const v of entry) if (o < pixelCount) out[o++] = v;
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

export function parseGif(bytes: Uint8Array): GifInfo {
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  if (head !== 'GIF89a' && head !== 'GIF87a') throw new Error('不是 GIF');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint16(6, true);
  const height = dv.getUint16(8, true);
  const flags = bytes[10];
  let o = 13;
  let globalPalette = new Uint8Array(0);
  if (flags & 0x80) {
    const n = 1 << ((flags & 7) + 1);
    globalPalette = bytes.slice(o, o + n * 3);
    o += n * 3;
  }
  let loopCount: number | null = null;
  const frames: GifFrame[] = [];
  let gce = { delayCs: 0, disposal: 0, transparentIndex: null as number | null };
  const readSubBlocks = () => {
    const parts: number[] = [];
    for (;;) {
      const size = bytes[o++];
      if (!size) break;
      for (let i = 0; i < size; i++) parts.push(bytes[o + i]);
      o += size;
    }
    return new Uint8Array(parts);
  };
  for (;;) {
    const b = bytes[o++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[o++];
      if (label === 0xf9) {
        const packed = bytes[o + 1];
        gce = {
          delayCs: dv.getUint16(o + 2, true),
          disposal: (packed >> 2) & 7,
          transparentIndex: packed & 1 ? bytes[o + 4] : null,
        };
        o += 6;
      } else if (label === 0xff) {
        const size = bytes[o];
        const app = String.fromCharCode(...bytes.subarray(o + 1, o + 1 + size));
        o += 1 + size;
        const sub = readSubBlocks();
        if (app === 'NETSCAPE2.0' && sub[0] === 1) loopCount = sub[1] | (sub[2] << 8);
      } else readSubBlocks();
    } else if (b === 0x2c) {
      const x = dv.getUint16(o, true);
      const y = dv.getUint16(o + 2, true);
      const w = dv.getUint16(o + 4, true);
      const h = dv.getUint16(o + 6, true);
      const f = bytes[o + 8];
      o += 9;
      let localPalette: Uint8Array | null = null;
      if (f & 0x80) {
        const n = (1 << ((f & 7) + 1)) * 3;
        localPalette = bytes.slice(o, o + n);
        o += n;
      }
      const minCode = bytes[o++];
      const data = readSubBlocks();
      frames.push({
        x,
        y,
        width: w,
        height: h,
        ...gce,
        indices: lzwDecode(minCode, data, w * h),
        localPalette,
      });
      gce = { delayCs: 0, disposal: 0, transparentIndex: null };
    } else throw new Error(`未知的區塊 0x${b?.toString(16)}`);
  }
  return { width, height, globalPalette, loopCount, frames };
}

/** 用這格的區域調色盤（沒有時用全域調色盤）把一格轉成 RGBA（透明色 → alpha 0） */
export function gifFrameRgba(info: GifInfo, f: GifFrame): Uint8Array {
  const out = new Uint8Array(f.width * f.height * 4);
  const pal = f.localPalette ?? info.globalPalette;
  for (let i = 0; i < f.indices.length; i++) {
    const k = f.indices[i];
    if (f.transparentIndex !== null && k === f.transparentIndex) continue;
    out[i * 4] = pal[k * 3];
    out[i * 4 + 1] = pal[k * 3 + 1];
    out[i * 4 + 2] = pal[k * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
