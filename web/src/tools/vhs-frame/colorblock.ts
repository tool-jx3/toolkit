/**
 * 數位攝影的第二種編碼「方塊色」（2026-11-12，規格 3.18）：Microsoft Video 1（1992 年 Video for Windows 的 CRAM），早期 CD-ROM 影片的樣子。
 * 演算法與數值參考 NTSCRT `352b4dc` 的 Sources/CrtCodec/Video1Codec.swift（MIT，© 2026 Finn McKenty；授權全文在同一個資料夾的 UPSTREAM_LICENSE），
 * 照本站的結構改寫（平面與雜訊、資料遺失沿用 digital.ts）：
 * - 沒有轉換，每個 4 × 4 的方塊選最便宜、誤差又在畫質的上限以內的一種：跳過（預測影格：留著上一張）、一色（平均）、
 *   兩色（每個像素二選一：硬的雙色邊）、八色（四個 2 × 2 各自兩色：細節還認得出來）；
 * - 顏色是 15 位元（每色 5 位元），漸層變成一段一段的色帶；色彩不次取樣（一律 4:4:4）；
 * - 編出來的方塊是完整的顏色：資料遺失之後，哪一塊重新編碼就在哪裡復原，跳過與遺失的方塊留著解碼器原本的。
 * 和 NTSCRT 不同的地方（D43）：照片是靜態的，關鍵影格的遺失也拿錯位的內容補（同 DCT，D35），否則遺失永遠看不到；沒有固定位元率。
 */
import {
  type CodecSettings,
  cell,
  clonePlanes,
  copyBlock,
  dropBlocks,
  eachMacroblock,
  type FrameCodec,
  hash01,
  type Planes,
  sourceFrame,
} from './digital';

/** 每色 5 位元 */
export const to555 = (v: number): number =>
  (Math.round((Math.min(255, Math.max(0, v)) * 31) / 255) * 255) / 31;

/**
 * 一個方塊（16 個像素 × 3 色，0～255）可以接受的誤差平方和。畫質 q（0～1）讓「每個值的均方誤差的平方根」平均地從 50 走到 1
 * （NTSCRT：損壞跟著滑桿平均地變）：(50 − 49q)² × 48。
 */
export const COLOR_BLOCK_ROOTS = { worst: 50, best: 1 } as const;
export function blockLimit(quality: number): number {
  const q = Math.min(1, Math.max(0, quality / 100));
  const r = COLOR_BLOCK_ROOTS.worst + (COLOR_BLOCK_ROOTS.best - COLOR_BLOCK_ROOTS.worst) * q;
  return r * r * 48;
}

export type BlockMode = 'skip' | 'fill' | 'two' | 'eight';

/** 四個 2 × 2（方塊裡的像素編號） */
const QUARTERS = [
  [0, 1, 4, 5],
  [2, 3, 6, 7],
  [8, 9, 12, 13],
  [10, 11, 14, 15],
] as const;
const ALL = Array.from({ length: 16 }, (_, i) => i);

const lumaAt = (p: Float32Array, i: number) =>
  0.299 * p[i * 3] + 0.587 * p[i * 3 + 1] + 0.114 * p[i * 3 + 2];
/** 像素 i 和顏色 c（c 的第 o 個起三個數）差的平方和 */
const dist = (p: Float32Array, i: number, c: Float64Array, o = 0) => {
  const r = p[i * 3] - c[o];
  const g = p[i * 3 + 1] - c[o + 1];
  const b = p[i * 3 + 2] - c[o + 2];
  return r * r + g * g + b * b;
};

/* 兩色的暫存（每個方塊都要算好幾次，不要每次新開）：hi＝每個成員是不是亮的那組；pair＝暗、亮兩色（各 3 個數） */
const hi = new Uint8Array(16);
const lumas = new Float64Array(16);
const pair = new Float64Array(6);
const sums = new Float64Array(6);

/** 依 hi 分組的兩組平均色寫進 pair（暗 0～2、亮 3～5）；有一組是空的時不改、回傳 false */
function splitMeans(p: Float32Array, members: readonly number[]): boolean {
  sums.fill(0);
  let nLo = 0;
  let nHi = 0;
  for (let k = 0; k < members.length; k++) {
    const i = members[k];
    const o = hi[k] ? 3 : 0;
    sums[o] += p[i * 3];
    sums[o + 1] += p[i * 3 + 1];
    sums[o + 2] += p[i * 3 + 2];
    if (hi[k]) nHi++;
    else nLo++;
  }
  if (nLo === 0 || nHi === 0) return false;
  for (let c = 0; c < 3; c++) {
    pair[c] = sums[c] / nLo;
    pair[c + 3] = sums[c + 3] / nHi;
  }
  return true;
}

/**
 * members 用兩個 15 位元色：先以平均亮度分成亮、暗兩組，再把每個像素換到比較近的那一色一次（重算兩色）；
 * 寫進 out，回傳誤差平方和。亮度都一樣時是同一色兩次。
 */
export function twoColors(p: Float32Array, members: readonly number[], out: Float32Array): number {
  const n = members.length;
  let mean = 0;
  for (let k = 0; k < n; k++) {
    lumas[k] = lumaAt(p, members[k]);
    mean += lumas[k];
  }
  mean /= n;
  for (let k = 0; k < n; k++) hi[k] = lumas[k] > mean ? 1 : 0;
  if (!splitMeans(p, members)) {
    /* 全部一樣亮：平均色兩次 */
    sums.fill(0);
    for (const i of members) for (let c = 0; c < 3; c++) sums[c] += p[i * 3 + c];
    for (let c = 0; c < 3; c++) pair[c] = pair[c + 3] = sums[c] / n;
  } else {
    for (let k = 0; k < n; k++)
      hi[k] = dist(p, members[k], pair, 3) < dist(p, members[k], pair, 0) ? 1 : 0;
    splitMeans(p, members);
  }
  for (let c = 0; c < 6; c++) pair[c] = to555(pair[c]);
  let err = 0;
  for (const i of members) {
    const o = dist(p, i, pair, 3) < dist(p, i, pair, 0) ? 3 : 0;
    out[i * 3] = pair[o];
    out[i * 3 + 1] = pair[o + 1];
    out[i * 3 + 2] = pair[o + 2];
    err += dist(p, i, pair, o);
  }
  return err;
}

const twoBuf = new Float32Array(48);
const eightBuf = new Float32Array(48);
const fill = new Float64Array(3);

/**
 * 一個方塊（src：16 × 3 的 RGB）選最便宜而且誤差在 limit 以內的方式，結果寫進 out；
 * 都超過 limit 時，取「八色的誤差 × 1.05」以內最便宜的（很平的方塊只是 15 位元的捨入就超過嚴格的上限，用八色也沒有幫助）。
 * ref 給了（預測影格）而且和 ref 的差在 limit 以內時跳過（out＝ref）。
 */
export function codeColorBlock(
  src: Float32Array,
  ref: Float32Array | null,
  limit: number,
  out: Float32Array,
): BlockMode {
  if (ref) {
    let e = 0;
    for (let i = 0; i < 48; i++) e += (src[i] - ref[i]) ** 2;
    if (e <= limit) {
      out.set(ref);
      return 'skip';
    }
  }
  fill.fill(0);
  for (let i = 0; i < 16; i++) for (let c = 0; c < 3; c++) fill[c] += src[i * 3 + c];
  for (let c = 0; c < 3; c++) fill[c] = to555(fill[c] / 16);
  let fillErr = 0;
  for (let i = 0; i < 16; i++) fillErr += dist(src, i, fill);
  const fillOut = () => {
    for (let i = 0; i < 16; i++) out.set(fill, i * 3);
  };
  if (fillErr <= limit) {
    fillOut();
    return 'fill';
  }
  const twoErr = twoColors(src, ALL, twoBuf);
  let eightErr = 0;
  for (const q of QUARTERS) eightErr += twoColors(src, q, eightBuf);
  const good = Math.max(limit, eightErr * 1.05 + 1e-3);
  if (fillErr <= good) {
    fillOut();
    return 'fill';
  }
  if (twoErr <= good) {
    out.set(twoBuf);
    return 'two';
  }
  out.set(eightBuf);
  return 'eight';
}

/* ---------- 平面（4:4:4 的 YCbCr）與方塊的 RGB ---------- */

function readBlock(p: Planes, bx: number, by: number, out: Float32Array): void {
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = (by + j) * p.w + bx + i;
      const Y = p.y[k];
      const cb = p.cb[k] - 128;
      const cr = p.cr[k] - 128;
      const o = (j * 4 + i) * 3;
      out[o] = Y + 1.402 * cr;
      out[o + 1] = Y - 0.344136 * cb - 0.714136 * cr;
      out[o + 2] = Y + 1.772 * cb;
    }
}

function writeBlock(p: Planes, bx: number, by: number, px: Float32Array): void {
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = (by + j) * p.w + bx + i;
      const o = (j * 4 + i) * 3;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      p.y[k] = 0.299 * r + 0.587 * g + 0.114 * b;
      p.cb[k] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      p.cr[k] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
}

/** 一個 4 × 4 的方塊從 from 複製到 to（跳過的方塊照原樣複製，不重新換算：可以跳過好幾百格） */
function keepBlock(from: Planes, to: Planes, bx: number, by: number): void {
  for (let j = 0; j < 4; j++) {
    const k = (by + j) * from.w + bx;
    for (const c of ['y', 'cb', 'cr'] as const) to[c].set(from[c].subarray(k, k + 4), k);
  }
}

const srcBuf = new Float32Array(48);
const refBuf = new Float32Array(48);
const outBuf = new Float32Array(48);

/**
 * 一格的編碼：每個 4 × 4 的方塊照 codeColorBlock；ref 給了是預測影格（可以跳過）。
 * 回傳編碼器的畫面與每個方塊是不是跳過的。
 */
function codeFrame(
  src: Planes,
  ref: Planes | null,
  limit: number,
): { enc: Planes; skipped: Uint8Array } {
  const enc = clonePlanes(src);
  const cols = src.w / 4;
  const skipped = new Uint8Array(cols * (src.h / 4));
  for (let by = 0; by < src.h; by += 4)
    for (let bx = 0; bx < src.w; bx += 4) {
      readBlock(src, bx, by, srcBuf);
      if (ref) readBlock(ref, bx, by, refBuf);
      const mode = codeColorBlock(srcBuf, ref ? refBuf : null, limit, outBuf);
      if (mode === 'skip' && ref) {
        keepBlock(ref, enc, bx, by);
        skipped[(by / 4) * cols + bx / 4] = 1;
      } else writeBlock(enc, bx, by, outBuf);
    }
  return { enc, skipped };
}

/**
 * 方塊色的編碼器＋解碼器（介面同 BlockCodec）：關鍵影格每 K 格一個（K＝0：每一格各自編碼；方塊色沒有 datamosh，關鍵影格都會收到）。
 * 記著上一次解到哪一格，依序往後要時接著算。平面一律 4:4:4（toPlanes 的 chroma 0）。
 */
export class ColorBlockCodec implements FrameCodec {
  private readonly base: Planes;
  private readonly c: CodecSettings;
  private readonly limit: number;
  private chain: { start: number; n: number; enc: Planes; dec: Planes } | null = null;

  constructor(base: Planes, settings: CodecSettings, quality: number) {
    if (base.sx !== 1 || base.sy !== 1) throw new Error('方塊色的平面要是 4:4:4');
    this.base = base;
    this.c = settings;
    this.limit = blockLimit(quality);
  }

  /** 關鍵影格：整張各自編碼；遺失的巨集區塊拿錯位（±24 × ±16 px）的同一格內容補（同 DCT 的關鍵影格） */
  private keyframe(n: number): { enc: Planes; dec: Planes } {
    const { enc } = codeFrame(sourceFrame(this.base, this.c, n), null, this.limit);
    const dec = clonePlanes(enc);
    eachMacroblock(enc, dropBlocks(enc, this.c, n), (plane, x, y, bw, bh, m) => {
      const g = cell(enc, plane);
      const dx = Math.round((hash01(n, m, 31) - 0.5) * 48) / g.x;
      const dy = Math.round((hash01(n, m, 32) - 0.5) * 32) / g.y;
      copyBlock(enc, dec, plane, x, y, bw, bh, dx, dy);
    });
    return { enc, dec };
  }

  decode(n: number): Planes {
    const K = this.c.gop;
    if (K <= 0) return this.keyframe(n).dec;
    const start = Math.floor(n / K) * K;
    let ch = this.chain;
    if (!ch || ch.start !== start || ch.n > n) {
      const first = this.keyframe(start);
      ch = { start, n: start, enc: first.enc, dec: first.dec };
    }
    for (let m = ch.n + 1; m <= n; m++) {
      const { enc, skipped } = codeFrame(sourceFrame(this.base, this.c, m), ch.enc, this.limit);
      /* 解碼器：跳過的與遺失的方塊留著自己原本的（之前遺失的就一直錯下去，直到那一塊重新編碼） */
      const dec = clonePlanes(enc);
      const mw = enc.w / 16;
      const lost = dropBlocks(enc, this.c, m);
      const cols = enc.w / 4;
      for (let by = 0; by < enc.h; by += 4)
        for (let bx = 0; bx < enc.w; bx += 4)
          if (
            skipped[(by / 4) * cols + bx / 4] ||
            lost[Math.floor(by / 16) * mw + Math.floor(bx / 16)]
          )
            keepBlock(ch.dec, dec, bx, by);
      ch.enc = enc;
      ch.dec = dec;
    }
    ch.n = n;
    this.chain = ch;
    return ch.dec;
  }
}
