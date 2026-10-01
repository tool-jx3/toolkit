/* 文字演出產生器：PNG／APNG 編碼
 * 壓縮用瀏覽器內建的 CompressionStream('deflate')（輸出正好是 PNG IDAT 要的 zlib 格式）。 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, start = 0, end = bytes.length, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

export function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(enc.encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export async function zlib(bytes) {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/* 掃描線加上濾波位元組。
 * 調色盤影像一律用 None（PNG 規範建議）；全彩 RGBA 每列挑「差值絕對值總和」最小的濾波。 */
export function filterRows(src, w, h, bpp, adaptive) {
  const stride = w * bpp;
  const out = new Uint8Array(h * (stride + 1));
  if (!adaptive) {
    for (let y = 0; y < h; y++) out.set(src.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
    return out;
  }
  const sums = new Float64Array(5);
  let prevEmpty = true;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    const o = y * (stride + 1);
    /* 整列透明（且上一列也是）：None 濾波，內容本來就全是 0 */
    let empty = true;
    for (let i = 0; i < stride; i++) if (src[row + i]) { empty = false; break; }
    if (empty && prevEmpty) { out[o] = 0; prevEmpty = true; continue; }
    prevEmpty = empty;
    /* 第一趟只算五種濾波的「差值絕對值總和」，第二趟直接寫入選中的那一種 */
    sums.fill(0);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    for (let i = 0; i < stride; i++) {
      const x = src[row + i];
      const a = i >= bpp ? src[row + i - bpp] : 0;
      const b = prev >= 0 ? src[prev + i] : 0;
      const c = prev >= 0 && i >= bpp ? src[prev + i - bpp] : 0;
      const p = a + b - c;
      const pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      let v;
      s0 += x < 128 ? x : 256 - x;
      v = (x - a) & 255; s1 += v < 128 ? v : 256 - v;
      v = (x - b) & 255; s2 += v < 128 ? v : 256 - v;
      v = (x - ((a + b) >> 1)) & 255; s3 += v < 128 ? v : 256 - v;
      v = (x - pr) & 255; s4 += v < 128 ? v : 256 - v;
    }
    let best = 0, bs = s0;
    if (s1 < bs) { best = 1; bs = s1; }
    if (s2 < bs) { best = 2; bs = s2; }
    if (s3 < bs) { best = 3; bs = s3; }
    if (s4 < bs) { best = 4; bs = s4; }
    out[o] = best;
    const d = o + 1;
    for (let i = 0; i < stride; i++) {
      const x = src[row + i];
      const a = i >= bpp ? src[row + i - bpp] : 0;
      const b = prev >= 0 ? src[prev + i] : 0;
      let v;
      if (best === 0) v = x;
      else if (best === 1) v = x - a;
      else if (best === 2) v = x - b;
      else if (best === 3) v = x - ((a + b) >> 1);
      else {
        const c = prev >= 0 && i >= bpp ? src[prev + i - bpp] : 0;
        const p = a + b - c;
        const pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
        v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[d + i] = v & 255;
    }
  }
  return out;
}

export function ihdr(w, h, colorType) {
  const d = new Uint8Array(13);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  d[8] = 8;            // 位元深度
  d[9] = colorType;    // 6 = RGBA，3 = 調色盤
  return chunk('IHDR', d);
}

export function plteChunks(palette) {
  const n = palette.length / 4;
  const plte = new Uint8Array(n * 3);
  let lastOpaque = -1;
  for (let i = 0; i < n; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    if (palette[i * 4 + 3] !== 255) lastOpaque = i;
  }
  const out = [chunk('PLTE', plte)];
  if (lastOpaque >= 0) {
    const trns = new Uint8Array(lastOpaque + 1);
    for (let i = 0; i <= lastOpaque; i++) trns[i] = palette[i * 4 + 3];
    out.push(chunk('tRNS', trns));
  }
  return out;
}

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/* 壓好一張影像的資料（rgba 或調色盤索引），回傳 zlib 資料 */
export async function packImage(pixels, w, h, paletted) {
  return zlib(filterRows(pixels, w, h, paletted ? 1 : 4, !paletted));
}

/* 單張 PNG */
export async function encodePng(pixels, w, h, palette = null) {
  const data = await packImage(pixels, w, h, !!palette);
  const parts = [PNG_SIGNATURE, ihdr(w, h, palette ? 3 : 6)];
  if (palette) parts.push(...plteChunks(palette));
  parts.push(chunk('IDAT', data), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}

export function concat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function fctl(seq, f) {
  const d = new Uint8Array(26);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, seq);
  dv.setUint32(4, f.w);
  dv.setUint32(8, f.h);
  dv.setUint32(12, f.x);
  dv.setUint32(16, f.y);
  dv.setUint16(20, f.delayNum);
  dv.setUint16(22, f.delayDen);
  d[24] = 0; // dispose_op: NONE（保留這一格，下一格只改變化的範圍）
  d[25] = 0; // blend_op: SOURCE（範圍內整個覆寫，透明也照寫）
  return chunk('fcTL', d);
}

/* 組成 APNG。
 * still: 不屬於動畫的預設圖（不支援 APNG 的環境顯示這張）；沒有時第一格動畫就是 IDAT。 */
export function assembleApng({ width, height, palette, plays, still, frames }) {
  const parts = [PNG_SIGNATURE, ihdr(width, height, palette ? 3 : 6)];
  const actl = new Uint8Array(8);
  new DataView(actl.buffer).setUint32(0, frames.length);
  new DataView(actl.buffer).setUint32(4, plays);
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
