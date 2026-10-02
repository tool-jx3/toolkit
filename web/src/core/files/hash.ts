/**
 * 內容雜湊：完整的 SHA-256（64 個小寫十六進位字元）。
 *
 * - 有 `crypto.subtle`（https、localhost、Node、Worker）時用它；沒有時（file://、http 的非安全環境）改用本檔的純 JavaScript
 *   實作，結果完全相同。CCFOLIA 房間 ZIP 的圖片檔名必須等於內容的 SHA-256，所以這裡不能退回「簡單雜湊」。
 * - `core/assets` 的資產 id（SHA-256 前 24 位）也用這裡的 `subtleSha256`，id 規則不變。
 *
 * ```ts
 * const hex = await sha256Hex(bytes);        // 'e3b0c442…'
 * const name = `${hex}.png`;
 * ```
 */

export type HashInput = Uint8Array | ArrayBuffer | Blob;

async function toBytes(input: HashInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** 位元組 → 小寫十六進位字串 */
export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** 用 `crypto.subtle` 算 SHA-256（32 位元組）；環境沒有或失敗時回傳 null（呼叫端自己決定退路） */
export async function subtleSha256(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    return new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  } catch {
    return null;
  }
}

/* ---------- 純 JavaScript 的 SHA-256（FIPS 180-4） ---------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256（同步、純 JavaScript）。大檔案（數十 MB）會花上數百毫秒，能用 `sha256()` 就用它。 */
export function sha256Sync(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const len = bytes.length;
  /* 補位：0x80、補 0 到 56 mod 64、最後 8 位元組是位元長度（大端） */
  const total = Math.ceil((len + 9) / 64) * 64;
  const tail = new Uint8Array(total - Math.floor(len / 64) * 64);
  const tailStart = Math.floor(len / 64) * 64;
  tail.set(bytes.subarray(tailStart));
  tail[len - tailStart] = 0x80;
  const bitLen = len * 8;
  const tv = new DataView(tail.buffer);
  tv.setUint32(tail.length - 8, Math.floor(bitLen / 0x100000000));
  tv.setUint32(tail.length - 4, bitLen >>> 0);

  const block = (src: Uint8Array, off: number) => {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (src[j] << 24) | (src[j + 1] << 16) | (src[j + 2] << 8) | src[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  };

  for (let off = 0; off < tailStart; off += 64) block(bytes, off);
  for (let off = 0; off < tail.length; off += 64) block(tail, off);

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

/** SHA-256（32 位元組）：優先用 `crypto.subtle`，不能用時改用純 JavaScript（結果相同） */
export async function sha256(input: HashInput): Promise<Uint8Array> {
  const bytes = await toBytes(input);
  return (await subtleSha256(bytes)) ?? sha256Sync(bytes);
}

/** SHA-256 的 64 個小寫十六進位字元 */
export async function sha256Hex(input: HashInput): Promise<string> {
  return bytesToHex(await sha256(input));
}
