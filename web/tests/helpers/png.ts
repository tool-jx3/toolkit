/**
 * 測試用的 PNG／APNG 解析器（自己寫，不依賴被測的編碼器）：
 * 檢查 chunk 的 CRC、acTL／fcTL／fdAT 序號，並把影格解碼、合成回 RGBA 以比對像素。
 */
import { unzlibSync } from 'fflate';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

export function parseChunks(bytes: Uint8Array): PngChunk[] {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('PNG 簽章錯誤');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: PngChunk[] = [];
  let o = 8;
  while (o < bytes.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    const stored = dv.getUint32(o + 8 + len);
    out.push({ type, data, crcOk: crc(bytes.subarray(o + 4, o + 8 + len)) === stored });
    o += 12 + len;
  }
  return out;
}

export interface Ihdr {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

export function readIhdr(chunks: PngChunk[]): Ihdr {
  const c = chunks[0];
  if (c.type !== 'IHDR') throw new Error('第一個 chunk 不是 IHDR');
  const dv = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
  return {
    width: dv.getUint32(0),
    height: dv.getUint32(4),
    bitDepth: c.data[8],
    colorType: c.data[9],
  };
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** zlib 資料 → RGBA（支援 colorType 6 與 3） */
export function decodePixels(
  zdata: Uint8Array,
  w: number,
  h: number,
  colorType: number,
  plte?: Uint8Array,
  trns?: Uint8Array,
): Uint8Array {
  const raw = unzlibSync(zdata);
  const bpp = colorType === 6 ? 4 : 1;
  const stride = w * bpp;
  if (raw.length !== h * (stride + 1))
    throw new Error(`解壓後長度不符：${raw.length} ≠ ${h * (stride + 1)}`);
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[dst - stride + i - bpp] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) v = x + paeth(a, b, c);
      else throw new Error(`未知的濾波 ${f}`);
      px[dst + i] = v & 255;
    }
  }
  if (colorType === 6) return px;
  if (!plte) throw new Error('調色盤影像缺少 PLTE');
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = px[i];
    out[i * 4] = plte[k * 3];
    out[i * 4 + 1] = plte[k * 3 + 1];
    out[i * 4 + 2] = plte[k * 3 + 2];
    out[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
  }
  return out;
}

export interface ApngFrameInfo {
  seq: number;
  width: number;
  height: number;
  x: number;
  y: number;
  delayNum: number;
  delayDen: number;
  dispose: number;
  blend: number;
  /** 合併後的壓縮資料 */
  data: Uint8Array;
  /** 資料 chunk 的序號（fdAT）；IDAT 為 -1 */
  dataSeqs: number[];
}

export interface ApngInfo {
  ihdr: Ihdr;
  chunks: PngChunk[];
  numFrames: number;
  numPlays: number;
  /** IDAT 是否為獨立的預設圖（不屬於動畫） */
  stillIdat: Uint8Array | null;
  frames: ApngFrameInfo[];
  /** 所有 fcTL 與 fdAT 的序號，依出現順序 */
  sequence: number[];
  plte?: Uint8Array;
  trns?: Uint8Array;
}

export function parseApng(bytes: Uint8Array): ApngInfo {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const actl = chunks.find((c) => c.type === 'acTL');
  if (!actl) throw new Error('沒有 acTL');
  const adv = new DataView(actl.data.buffer, actl.data.byteOffset, 8);
  const frames: ApngFrameInfo[] = [];
  const sequence: number[] = [];
  let still: Uint8Array[] | null = null;
  let cur: ApngFrameInfo | null = null;
  let curParts: Uint8Array[] = [];
  const flush = () => {
    if (cur) {
      const len = curParts.reduce((s, p) => s + p.length, 0);
      const d = new Uint8Array(len);
      let o = 0;
      for (const p of curParts) {
        d.set(p, o);
        o += p.length;
      }
      cur.data = d;
      frames.push(cur);
    }
    cur = null;
    curParts = [];
  };
  for (const c of chunks) {
    const dv = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    if (c.type === 'fcTL') {
      flush();
      const seq = dv.getUint32(0);
      sequence.push(seq);
      cur = {
        seq,
        width: dv.getUint32(4),
        height: dv.getUint32(8),
        x: dv.getUint32(12),
        y: dv.getUint32(16),
        delayNum: dv.getUint16(20),
        delayDen: dv.getUint16(22),
        dispose: c.data[24],
        blend: c.data[25],
        data: new Uint8Array(0),
        dataSeqs: [],
      };
    } else if (c.type === 'IDAT') {
      if (cur) {
        curParts.push(c.data);
        (cur as ApngFrameInfo).dataSeqs.push(-1);
      } else {
        still ??= [];
        still.push(c.data);
      }
    } else if (c.type === 'fdAT') {
      const seq = dv.getUint32(0);
      sequence.push(seq);
      if (!cur) throw new Error('fdAT 前面沒有 fcTL');
      curParts.push(c.data.subarray(4));
      (cur as ApngFrameInfo).dataSeqs.push(seq);
    }
  }
  flush();
  const plte = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  let stillIdat: Uint8Array | null = null;
  if (still) {
    const parts = still as Uint8Array[];
    stillIdat = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      stillIdat.set(p, o);
      o += p.length;
    }
  }
  return {
    ihdr,
    chunks,
    numFrames: adv.getUint32(0),
    numPlays: adv.getUint32(4),
    stillIdat,
    frames,
    sequence,
    plte,
    trns,
  };
}

/**
 * 合成每一格的完整畫面。本專案的編碼器用 dispose NONE／blend SOURCE；ApngEncoder 的 transparentUnchanged
 * 另外用 dispose PREVIOUS 與 blend OVER（只有完全透明或完全不透明的像素，其他透明度在這裡丟錯誤）。
 */
export function composeApng(info: ApngInfo): Uint8Array[] {
  const { width: W, height: H, colorType } = info.ihdr;
  const canvas = new Uint8Array(W * H * 4);
  const out: Uint8Array[] = [];
  info.frames.forEach((f, i) => {
    if (f.dispose > 2 || f.blend > 1) throw new Error('不合規範的 dispose／blend');
    const px = decodePixels(f.data, f.width, f.height, colorType, info.plte, info.trns);
    /* 第一格的 PREVIOUS 當成 BACKGROUND（規範） */
    const dispose = i === 0 && f.dispose === 2 ? 1 : f.dispose;
    const saved = dispose === 2 ? canvas.slice() : null;
    for (let y = 0; y < f.height; y++) {
      if (f.blend === 0) {
        canvas.set(px.subarray(y * f.width * 4, (y + 1) * f.width * 4), ((f.y + y) * W + f.x) * 4);
        continue;
      }
      for (let x = 0; x < f.width; x++) {
        const s = (y * f.width + x) * 4;
        const a = px[s + 3];
        if (a === 0) continue;
        if (a !== 255) throw new Error('測試的合成器的 OVER 只支援完全透明或完全不透明的像素');
        canvas.set(px.subarray(s, s + 4), ((f.y + y) * W + f.x + x) * 4);
      }
    }
    out.push(canvas.slice());
    if (dispose === 1) {
      for (let y = 0; y < f.height; y++)
        canvas.fill(0, ((f.y + y) * W + f.x) * 4, ((f.y + y) * W + f.x + f.width) * 4);
    } else if (saved) canvas.set(saved);
  });
  return out;
}
