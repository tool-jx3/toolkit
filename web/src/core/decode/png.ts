/**
 * PNG／APNG 解碼（純 JavaScript，Node 與 Worker 都能用）：
 * 色彩類型 0、2、3、4、6，位元深度 1～16，tRNS 透明、Adam7 交錯；APNG 依 fcTL 的處置與混合方式合成每一格。
 */
import { unzlibSync } from 'fflate';
import { type DecodedAnimation, type DecodeOptions, frameDelay } from './types';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

interface PngHeader {
  width: number;
  height: number;
  depth: number;
  color: number;
  interlace: number;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIG.every((v, i) => bytes[i] === v);
}

function readChunks(bytes: Uint8Array): Chunk[] {
  if (!isPng(bytes)) throw new Error('不是 PNG 檔');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Chunk[] = [];
  let o = 8;
  while (o + 12 <= bytes.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    if (o + 12 + len > bytes.length) throw new Error('PNG 檔不完整');
    out.push({ type, data: bytes.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const channelsOf = (color: number) =>
  color === 0 ? 1 : color === 2 ? 3 : color === 3 ? 1 : color === 4 ? 2 : 4;

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 還原一個（子）影像的濾波，回傳原始掃描線（不含濾波位元組） */
function unfilter(
  data: Uint8Array,
  offset: number,
  w: number,
  h: number,
  bpp: number,
  bits: number,
) {
  const stride = Math.ceil((w * bits) / 8);
  const out = new Uint8Array(stride * h);
  let o = offset;
  for (let y = 0; y < h; y++) {
    const f = data[o++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[o++] ?? 0;
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v = raw;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      out[row + x] = v & 255;
    }
  }
  return { rows: out, stride, next: o };
}

interface Palette {
  rgb: Uint8Array | null;
  alpha: Uint8Array | null;
  /** 灰階／全彩的透明色（tRNS），已換成 8 位元 */
  key: number[] | null;
}

/** 掃描線 → RGBA（寫進 out 的 (ox, oy) 起，dx／dy 為交錯的間隔） */
function expand(
  rows: Uint8Array,
  stride: number,
  w: number,
  h: number,
  hd: PngHeader,
  pal: Palette,
  out: Uint8ClampedArray,
  outW: number,
  ox = 0,
  oy = 0,
  dx = 1,
  dy = 1,
) {
  const { depth, color } = hd;
  const ch = channelsOf(color);
  const max = (1 << depth) - 1;
  const sample = (row: number, i: number): number => {
    if (depth === 8) return rows[row + i];
    if (depth === 16) return rows[row + i * 2];
    const per = 8 / depth;
    const byte = rows[row + Math.floor(i / per)];
    const shift = 8 - depth * ((i % per) + 1);
    return (byte >> shift) & max;
  };
  /* 16 位元的完整值（比對 tRNS 用） */
  const sample16 = (row: number, i: number) =>
    depth === 16 ? (rows[row + i * 2] << 8) | rows[row + i * 2 + 1] : sample(row, i);
  const to8 = (v: number) => (depth === 16 ? v : depth === 8 ? v : Math.round((v * 255) / max));
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    for (let x = 0; x < w; x++) {
      const o = ((oy + y * dy) * outW + ox + x * dx) * 4;
      let r: number;
      let g: number;
      let b: number;
      let a = 255;
      if (color === 3) {
        const idx = sample(row, x);
        r = pal.rgb?.[idx * 3] ?? 0;
        g = pal.rgb?.[idx * 3 + 1] ?? 0;
        b = pal.rgb?.[idx * 3 + 2] ?? 0;
        a = pal.alpha && idx < pal.alpha.length ? pal.alpha[idx] : 255;
      } else if (color === 0 || color === 4) {
        const v = sample(row, x * ch);
        r = g = b = to8(v);
        if (color === 4) a = to8(sample(row, x * ch + 1));
        else if (pal.key && sample16(row, x) === pal.key[0]) a = 0;
      } else {
        r = to8(sample(row, x * ch));
        g = to8(sample(row, x * ch + 1));
        b = to8(sample(row, x * ch + 2));
        if (color === 6) a = to8(sample(row, x * ch + 3));
        else if (
          pal.key &&
          sample16(row, x * ch) === pal.key[0] &&
          sample16(row, x * ch + 1) === pal.key[1] &&
          sample16(row, x * ch + 2) === pal.key[2]
        )
          a = 0;
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** 解壓後的影像資料 → w × h 的 RGBA */
function decodeImage(zdata: Uint8Array, w: number, h: number, hd: PngHeader, pal: Palette) {
  const data = unzlibSync(zdata);
  const bits = hd.depth * channelsOf(hd.color);
  const bpp = Math.max(1, bits >> 3);
  const out = new Uint8ClampedArray(w * h * 4);
  if (!hd.interlace) {
    const { rows, stride } = unfilter(data, 0, w, h, bpp, bits);
    expand(rows, stride, w, h, hd, pal, out, w);
    return out;
  }
  let offset = 0;
  for (const [x0, y0, sx, sy] of ADAM7) {
    const pw = Math.ceil((w - x0) / sx);
    const ph = Math.ceil((h - y0) / sy);
    if (pw <= 0 || ph <= 0) continue;
    const { rows, stride, next } = unfilter(data, offset, pw, ph, bpp, bits);
    expand(rows, stride, pw, ph, hd, pal, out, w, x0, y0, sx, sy);
    offset = next;
  }
  return out;
}

const concatBytes = (parts: Uint8Array[]) => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

function headerOf(chunks: Chunk[]) {
  const ih = chunks.find((c) => c.type === 'IHDR');
  if (!ih) throw new Error('PNG 缺少 IHDR');
  const dv = new DataView(ih.data.buffer, ih.data.byteOffset, ih.data.byteLength);
  const hd: PngHeader = {
    width: dv.getUint32(0),
    height: dv.getUint32(4),
    depth: ih.data[8],
    color: ih.data[9],
    interlace: ih.data[12],
  };
  const plte = chunks.find((c) => c.type === 'PLTE');
  const trns = chunks.find((c) => c.type === 'tRNS');
  const pal: Palette = { rgb: plte?.data ?? null, alpha: null, key: null };
  if (trns) {
    if (hd.color === 3) pal.alpha = trns.data;
    else {
      const t = new DataView(trns.data.buffer, trns.data.byteOffset, trns.data.byteLength);
      pal.key =
        hd.color === 0
          ? [t.getUint16(0)]
          : trns.data.length >= 6
            ? [t.getUint16(0), t.getUint16(2), t.getUint16(4)]
            : null;
    }
  }
  return { hd, pal };
}

/** 單張 PNG（APNG 時取預設圖） */
export function decodePng(bytes: Uint8Array): {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
} {
  const chunks = readChunks(bytes);
  const { hd, pal } = headerOf(chunks);
  const idat = concatBytes(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  if (!idat.length) throw new Error('PNG 沒有影像資料');
  return {
    width: hd.width,
    height: hd.height,
    rgba: decodeImage(idat, hd.width, hd.height, hd, pal),
  };
}

/** 是不是 APNG（有 acTL） */
export function isApng(bytes: Uint8Array): boolean {
  if (!isPng(bytes)) return false;
  try {
    return readChunks(bytes).some((c) => c.type === 'acTL');
  } catch {
    return false;
  }
}

/**
 * APNG（或一般 PNG）解碼成逐格的完整畫面：依每格的 fcTL 範圍、混合（取代／疊上）與處置（不處置／清空／還原）合成。
 * 預設圖不屬於動畫時（IDAT 前沒有 fcTL）略過。一般 PNG 回傳一格。
 */
export function decodeApng(bytes: Uint8Array, options: DecodeOptions = {}): DecodedAnimation {
  const { maxFrames = 500 } = options;
  const chunks = readChunks(bytes);
  const { hd, pal } = headerOf(chunks);
  const W = hd.width;
  const H = hd.height;
  const actl = chunks.find((c) => c.type === 'acTL');
  if (!actl) {
    const still = decodePng(bytes);
    return {
      format: 'png',
      width: W,
      height: H,
      loops: 0,
      truncated: false,
      frames: [{ rgba: still.rgba, delayMs: frameDelay(undefined, options) }],
    };
  }
  const loops = new DataView(actl.data.buffer, actl.data.byteOffset, 8).getUint32(4);
  interface Pending {
    x: number;
    y: number;
    w: number;
    h: number;
    delay: number | undefined;
    dispose: number;
    blend: number;
    parts: Uint8Array[];
  }
  const list: Pending[] = [];
  let cur: Pending | null = null;
  for (const c of chunks) {
    if (c.type === 'fcTL') {
      const dv = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
      const num = dv.getUint16(20);
      const den = dv.getUint16(22) || 100;
      cur = {
        w: dv.getUint32(4),
        h: dv.getUint32(8),
        x: dv.getUint32(12),
        y: dv.getUint32(16),
        delay: num ? (num * 1000) / den : undefined,
        dispose: c.data[24],
        blend: c.data[25],
        parts: [],
      };
      list.push(cur);
    } else if (c.type === 'IDAT' && cur) cur.parts.push(c.data);
    else if (c.type === 'fdAT' && cur) cur.parts.push(c.data.subarray(4));
  }
  const frames: DecodedAnimation['frames'] = [];
  const canvas = new Uint8ClampedArray(W * H * 4);
  let truncated = false;
  for (let i = 0; i < list.length; i++) {
    if (frames.length >= maxFrames) {
      truncated = true;
      break;
    }
    const f = list[i];
    if (!f.parts.length) continue;
    const img = decodeImage(concatBytes(f.parts), f.w, f.h, hd, pal);
    /* 第一格的「還原」當成清空（規範） */
    const dispose = i === 0 && f.dispose === 2 ? 1 : f.dispose;
    const saved = dispose === 2 ? canvas.slice() : null;
    for (let y = 0; y < f.h; y++) {
      const cy = f.y + y;
      if (cy < 0 || cy >= H) continue;
      for (let x = 0; x < f.w; x++) {
        const cx = f.x + x;
        if (cx < 0 || cx >= W) continue;
        const s = (y * f.w + x) * 4;
        const d = (cy * W + cx) * 4;
        const sa = img[s + 3];
        if (f.blend === 0 || sa === 255) {
          canvas[d] = img[s];
          canvas[d + 1] = img[s + 1];
          canvas[d + 2] = img[s + 2];
          canvas[d + 3] = sa;
        } else if (sa > 0) {
          /* 疊上（非預乘的 source-over） */
          const da = canvas[d + 3] / 255;
          const a = sa / 255;
          const oa = a + da * (1 - a);
          for (let k = 0; k < 3; k++)
            canvas[d + k] = Math.round((img[s + k] * a + canvas[d + k] * da * (1 - a)) / oa);
          canvas[d + 3] = Math.round(oa * 255);
        }
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs: frameDelay(f.delay, options) });
    if (dispose === 1) {
      for (let y = 0; y < f.h; y++) {
        const cy = f.y + y;
        if (cy < 0 || cy >= H) continue;
        canvas.fill(0, (cy * W + f.x) * 4, (cy * W + Math.min(W, f.x + f.w)) * 4);
      }
    } else if (dispose === 2 && saved) canvas.set(saved);
  }
  return { format: 'apng', width: W, height: H, loops, truncated, frames };
}
