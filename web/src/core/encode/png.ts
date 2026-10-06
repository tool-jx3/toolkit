/**
 * PNG／APNG 的底層編碼：CRC、chunk、zlib、掃描線濾波、組檔。
 *
 * 移植自 text-fx（本站以無塵室方式撰寫，MIT）的 png.js，改寫成 TypeScript。
 * 壓縮預設用瀏覽器內建的 CompressionStream('deflate')（輸出正好是 IDAT 要的 zlib 格式）；
 * 沒有時改用 fflate。兩者輸出都是決定性的：同樣的輸入每次得到同樣的位元組。
 */
import { zlibSync } from 'fflate';
import { EncodeLimitError } from './frames';

export type Bytes = Uint8Array<ArrayBuffer>;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/** 一個 PNG chunk：長度＋類型＋資料＋CRC */
export function chunk(type: string, data: Uint8Array): Bytes {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(enc.encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export type DeflateMode = 'auto' | 'native' | 'fflate';

/** zlib 格式壓縮（PNG 的 IDAT／fdAT 內容） */
export async function zlib(bytes: Uint8Array, mode: DeflateMode = 'auto'): Promise<Bytes> {
  const native = typeof CompressionStream !== 'undefined';
  if (mode === 'fflate' || (mode === 'auto' && !native)) {
    return zlibSync(bytes, { level: 6 }) as Bytes;
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(bytes as Bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** 一個位元組當成有號數（−128～127）的絕對值：濾波的成本估計用（查表，比分支快） */
const SIGNED_ABS = (() => {
  const t = new Uint8Array(256);
  for (let v = 0; v < 256; v++) t[v] = v < 128 ? v : 256 - v;
  return t;
})();

/**
 * Paeth 預測值（PNG 規範：p＝a＋b−c，取 a、b、c 中最接近 p 的，同距離依 a、b、c 的順序）。
 * 不用分支（雜訊影像的分支幾乎猜不中，很慢）：|p−a|＝|b−c|、|p−b|＝|a−c|、|p−c|＝|a＋b−2c|，以符號位元選值。
 */
function paethOf(a: number, b: number, c: number): number {
  const da = b - c;
  const db = a - c;
  const dc = da + db;
  const pa = (da ^ (da >> 31)) - (da >> 31);
  const pb = (db ^ (db >> 31)) - (db >> 31);
  const pc = (dc ^ (dc >> 31)) - (dc >> 31);
  /* pa ≤ pb 且 pa ≤ pc → a；否則 pb ≤ pc → b；否則 c */
  const notA = ((pb - pa) | (pc - pa)) >> 31;
  const notB = (pc - pb) >> 31;
  return (a & ~notA) | (((b & ~notB) | (c & notB)) & notA);
}

/** 分段濾波時要接續的狀態 */
interface FilterState {
  /** 上一列是不是整列 0 */
  prevEmpty: boolean;
}

/**
 * 濾波第 y0～y1−1 列，寫到 out 的 outOffset 起（每列＝濾波位元組＋stride 位元組）。
 * 整張一次做（filterRows）與分段做（packImage 的上限模式）結果相同。
 */
function filterBand(
  src: Uint8Array | Uint8ClampedArray,
  stride: number,
  y0: number,
  y1: number,
  bpp: number,
  adaptive: boolean,
  out: Uint8Array,
  outOffset: number,
  state: FilterState,
): void {
  if (!adaptive) {
    for (let y = y0; y < y1; y++) {
      out.set(
        src.subarray(y * stride, y * stride + stride),
        outOffset + (y - y0) * (stride + 1) + 1,
      );
    }
    return;
  }
  const abs = SIGNED_ABS;
  let prevEmpty = state.prevEmpty;
  for (let y = y0; y < y1; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    const o = outOffset + (y - y0) * (stride + 1);
    /* 整列透明（且上一列也是）：None 濾波，內容本來就全是 0 */
    let empty = true;
    for (let i = 0; i < stride; i++) {
      if (src[row + i]) {
        empty = false;
        break;
      }
    }
    if (empty && prevEmpty) {
      out[o] = 0;
      out.fill(0, o + 1, o + 1 + stride);
      continue;
    }
    prevEmpty = empty;
    /* 第一趟只算五種濾波的「差值絕對值總和」，第二趟直接寫入選中的那一種 */
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let s4 = 0;
    for (let i = 0; i < stride; i++) {
      const x = src[row + i];
      let a = 0;
      let b = 0;
      let c = 0;
      if (prev >= 0) {
        b = src[prev + i];
        if (i >= bpp) {
          a = src[row + i - bpp];
          c = src[prev + i - bpp];
        }
      } else if (i >= bpp) a = src[row + i - bpp];
      const pr = paethOf(a, b, c);
      s0 += abs[x];
      s1 += abs[(x - a) & 255];
      s2 += abs[(x - b) & 255];
      s3 += abs[(x - ((a + b) >> 1)) & 255];
      s4 += abs[(x - pr) & 255];
    }
    let best = 0;
    let bs = s0;
    if (s1 < bs) {
      best = 1;
      bs = s1;
    }
    if (s2 < bs) {
      best = 2;
      bs = s2;
    }
    if (s3 < bs) {
      best = 3;
      bs = s3;
    }
    if (s4 < bs) best = 4;
    out[o] = best;
    const d = o + 1;
    if (best === 0) {
      out.set(src.subarray(row, row + stride), d);
    } else if (best === 1) {
      for (let i = 0; i < bpp && i < stride; i++) out[d + i] = src[row + i];
      for (let i = bpp; i < stride; i++) out[d + i] = (src[row + i] - src[row + i - bpp]) & 255;
    } else if (best === 2) {
      if (prev < 0) out.set(src.subarray(row, row + stride), d);
      else for (let i = 0; i < stride; i++) out[d + i] = (src[row + i] - src[prev + i]) & 255;
    } else if (best === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? src[row + i - bpp] : 0;
        const b = prev >= 0 ? src[prev + i] : 0;
        out[d + i] = (src[row + i] - ((a + b) >> 1)) & 255;
      }
    } else {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? src[row + i - bpp] : 0;
        const b = prev >= 0 ? src[prev + i] : 0;
        const c = prev >= 0 && i >= bpp ? src[prev + i - bpp] : 0;
        out[d + i] = (src[row + i] - paethOf(a, b, c)) & 255;
      }
    }
  }
  state.prevEmpty = prevEmpty;
}

/**
 * 掃描線加上濾波位元組。
 * 調色盤影像一律用 None（PNG 規範建議）；全彩 RGBA 每列挑「差值絕對值總和」最小的濾波。
 */
export function filterRows(
  src: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  bpp: number,
  adaptive: boolean,
): Bytes {
  const stride = w * bpp;
  const out = new Uint8Array(h * (stride + 1));
  filterBand(src, stride, 0, h, bpp, adaptive, out, 0, { prevEmpty: true });
  return out;
}

/** colorType：6 = RGBA，3 = 調色盤 */
export function ihdr(w: number, h: number, colorType: 3 | 6): Bytes {
  const d = new Uint8Array(13);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  d[8] = 8; // 位元深度
  d[9] = colorType;
  return chunk('IHDR', d);
}

/** 調色盤（RGBA 平鋪，每色 4 位元組）→ PLTE＋（有半透明時）tRNS */
export function plteChunks(palette: Uint8Array): Bytes[] {
  const n = palette.length / 4;
  const plte = new Uint8Array(n * 3);
  let lastTranslucent = -1;
  for (let i = 0; i < n; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    if (palette[i * 4 + 3] !== 255) lastTranslucent = i;
  }
  const out = [chunk('PLTE', plte)];
  if (lastTranslucent >= 0) {
    const trns = new Uint8Array(lastTranslucent + 1);
    for (let i = 0; i <= lastTranslucent; i++) trns[i] = palette[i * 4 + 3];
    out.push(chunk('tRNS', trns));
  }
  return out;
}

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** 壓好一張影像的資料（RGBA 或調色盤索引），回傳 zlib 資料 */
export function packImage(
  pixels: Uint8Array,
  w: number,
  h: number,
  paletted: boolean,
  deflate: DeflateMode = 'auto',
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Bytes> {
  if (maxBytes !== Number.POSITIVE_INFINITY)
    return packWithin(pixels, w, h, paletted ? 1 : 4, !paletted, deflate, maxBytes);
  return zlib(filterRows(pixels, w, h, paletted ? 1 : 4, !paletted), deflate);
}

/** 上限模式每段大約多少位元組（濾波後） */
const BAND_BYTES = 1 << 18;

/**
 * packImage 的上限模式：一段一段濾波、送進壓縮，壓好的資料超過 maxBytes 就停（EncodeLimitError），
 * 不必把整張做完。沒超過時結果與一次做完相同（壓縮串流只在結尾收尾，與一次寫入的輸出相同）。
 * 沒有原生壓縮時改用 fflate 一次壓完再比大小。
 */
async function packWithin(
  pixels: Uint8Array,
  w: number,
  h: number,
  bpp: number,
  adaptive: boolean,
  deflate: DeflateMode,
  maxBytes: number,
): Promise<Bytes> {
  const native = typeof CompressionStream !== 'undefined';
  if (deflate === 'fflate' || (deflate === 'auto' && !native)) {
    const out = zlibSync(filterRows(pixels, w, h, bpp, adaptive), { level: 6 }) as Bytes;
    if (out.length > maxBytes) throw new EncodeLimitError(out.length, 1);
    return out;
  }
  const stride = w * bpp;
  const rowsPer = Math.max(1, Math.floor(BAND_BYTES / (stride + 1)));
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  const parts: Uint8Array[] = [];
  let outBytes = 0;
  let over = false;
  const reading = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      parts.push(value);
      outBytes += value.length;
      if (outBytes > maxBytes) {
        over = true;
        await reader.cancel().catch(() => {});
        return;
      }
    }
  })();
  const state: FilterState = { prevEmpty: true };
  let rowsDone = 0;
  try {
    for (let y = 0; y < h && !over; y += rowsPer) {
      const y1 = Math.min(h, y + rowsPer);
      const band = new Uint8Array((y1 - y) * (stride + 1));
      filterBand(pixels, stride, y, y1, bpp, adaptive, band, 0, state);
      rowsDone = y1;
      await writer.write(band);
    }
    if (!over) await writer.close();
  } catch (e) {
    /* 讀取端放棄之後寫入會失敗；其他錯誤照丟 */
    if (!over) throw e;
  }
  await reading;
  if (over) {
    await writer.abort().catch(() => {});
    throw new EncodeLimitError(outBytes, h ? rowsDone / h : 1);
  }
  return concat(parts);
}

export function concat(parts: readonly Uint8Array[]): Bytes {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * 單張 PNG。
 * @param pixels RGBA（width×height×4），或有 palette 時為索引（width×height）
 * @param palette RGBA 平鋪的調色盤（最多 256 色）
 * @param maxBytes 壓好的影像資料超過這麼多位元組就放棄，丟出 EncodeLimitError（預設不限；試編用）
 */
export async function encodePng(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: Uint8Array | null = null,
  deflate: DeflateMode = 'auto',
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Bytes> {
  const px =
    pixels instanceof Uint8Array
      ? pixels
      : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length);
  const data = await packImage(px, width, height, !!palette, deflate, maxBytes);
  const parts: Uint8Array[] = [PNG_SIGNATURE, ihdr(width, height, palette ? 3 : 6)];
  if (palette) parts.push(...plteChunks(palette));
  parts.push(chunk('IDAT', data), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}

export interface ApngFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 顯示時間＝delayNum / delayDen 秒 */
  delayNum: number;
  delayDen: number;
  /** zlib 壓好的影像資料 */
  data: Uint8Array;
  /** dispose_op（不給＝0 NONE；2＝PREVIOUS：顯示完還原成這格畫上去之前的畫面） */
  dispose?: 0 | 1 | 2;
  /** blend_op（不給＝0 SOURCE；1＝OVER：依透明度疊上，完全透明的像素保留底下的畫面） */
  blend?: 0 | 1;
}

function fctl(seq: number, f: ApngFrame): Bytes {
  const d = new Uint8Array(26);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, seq);
  dv.setUint32(4, f.w);
  dv.setUint32(8, f.h);
  dv.setUint32(12, f.x);
  dv.setUint32(16, f.y);
  dv.setUint16(20, f.delayNum);
  dv.setUint16(22, f.delayDen);
  d[24] = f.dispose ?? 0; // dispose_op：預設 NONE（保留這一格，下一格只改變化的範圍）
  d[25] = f.blend ?? 0; // blend_op：預設 SOURCE（範圍內整個覆寫，透明也照寫）
  return chunk('fcTL', d);
}

export interface AssembleApngOptions {
  width: number;
  height: number;
  /** RGBA 平鋪的調色盤；null 表示全彩 RGBA */
  palette: Uint8Array | null;
  /** 播放次數，0 = 無限循環 */
  plays: number;
  /** 不屬於動畫的預設圖（zlib 資料）。不支援 APNG 的環境顯示這張；沒有時第一格動畫就是 IDAT。 */
  still: Uint8Array | null;
  frames: readonly ApngFrame[];
}

/** 組成 APNG 檔 */
export function assembleApng({
  width,
  height,
  palette,
  plays,
  still,
  frames,
}: AssembleApngOptions): Bytes {
  const parts: Uint8Array[] = [PNG_SIGNATURE, ihdr(width, height, palette ? 3 : 6)];
  const actl = new Uint8Array(8);
  const av = new DataView(actl.buffer);
  av.setUint32(0, frames.length);
  av.setUint32(4, plays);
  parts.push(chunk('acTL', actl));
  if (palette) parts.push(...plteChunks(palette));
  let seq = 0;
  if (still) parts.push(chunk('IDAT', still));
  frames.forEach((f, i) => {
    parts.push(fctl(seq++, f));
    if (i === 0 && !still) {
      parts.push(chunk('IDAT', f.data));
    } else {
      const d = new Uint8Array(4 + f.data.length);
      new DataView(d.buffer).setUint32(0, seq++);
      d.set(f.data, 4);
      parts.push(chunk('fdAT', d));
    }
  });
  parts.push(chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}
