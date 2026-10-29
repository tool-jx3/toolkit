/**
 * 把種子刻進圖形（規格 1.12、3.15）：資料封包、檢查碼，與兩種刻法——
 * - 新方式（自然符號，v2）：同心圓的層數、每一圈花紋的起點方向、長短點與長短間隔、從每個同心圓長出的線（12 個方向有沒有線）
 *   都「照資料選」，看起來和一般產生的圖一樣；資料用完後用種子的另一串亂數補。
 * - 舊方式（環上的二進位，v1）：同心圓的外圈換成一段一段的弧（短＝0、長＝1，開頭是一段同步弧），資料分散刻在好幾個圖形上。
 * 封包、檢查碼、位元的順序與數值都照原作（al1scut/tkmizGeo edb6828），原作刻的圖本站讀得出來，本站刻的圖原作也讀得出來。
 * 純計算，不依賴 DOM（Worker 與主執行緒共用）。
 */
import type { Random } from '@/core/timeline/random';
import type { BloomRing, BloomShape } from './generate';
import type { MorseSeg } from './morse';
import { seedRandom } from './random';

const TAU = Math.PI * 2;

/* ---------- 位元與檢查碼 ---------- */

/** 整數 → n 個位元（高位在前） */
export const toBits = (v: number, n: number): number[] => {
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) out.push((v >> i) & 1);
  return out;
};

/** 位元（高位在前）→ 整數 */
export const fromBits = (bits: readonly number[]): number =>
  bits.reduce((a, x) => a * 2 + (x | 0), 0);

/** CRC-16（CCITT：初始 0xFFFF、多項式 0x1021） */
export function crc16(bytes: readonly number[]): number {
  let c = 0xffff;
  for (const b of bytes) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c;
}

/** CRC-8（多項式 0x07，初始 0），逐位元算，回傳 8 個位元 */
export function crc8bits(bits: readonly number[]): number[] {
  let c = 0;
  for (const bt of bits) {
    const fb = ((c >> 7) & 1) ^ bt;
    c = (c << 1) & 255;
    if (fb) c ^= 7;
  }
  return toBits(c, 8);
}

/* ---------- 封包 ---------- */

/** 封包的開頭位元組 */
export const PACKET_MAGIC = 0xa5;
/** 種子與設定之間的分隔字元（U+001F） */
export const SETTINGS_SEPARATOR = '\u001f';

/**
 * 封包（位元，高位在前）：[0xA5][旗標：有設定＝1][長度][資料（UTF-8，最多 255 位元組）][CRC-16 兩個位元組]。
 * 資料＝種子（有設定時接 U+001F 再接設定的差異文字）。
 */
export function makePacket(seed: string, settings: string): number[] {
  const data = [
    ...new TextEncoder().encode(settings ? seed + SETTINGS_SEPARATOR + settings : seed),
  ].slice(0, 255);
  const body = [PACKET_MAGIC, settings ? 1 : 0, data.length, ...data];
  const c = crc16(body);
  const bits: number[] = [];
  for (const b of [...body, c >> 8, c & 255]) bits.push(...toBits(b, 8));
  return bits;
}

export interface Packet {
  seed: string;
  /** 設定的差異文字（沒有時空字串） */
  settings: string;
  /** 封包的位元數 */
  bits: number;
}

/** 從位元列裡找封包（開頭沒對齊也找：每個位置都試）；檢查碼不合的不算 */
export function parsePacket(bits: readonly number[]): Packet | null {
  for (let off = 0; off + 40 <= bits.length; off++) {
    const byte = (i: number) => {
      let v = 0;
      for (let k = 0; k < 8; k++) v = (v << 1) | (bits[off + i * 8 + k] | 0);
      return v;
    };
    if (byte(0) !== PACKET_MAGIC) continue;
    const len = byte(2);
    if (off + (len + 5) * 8 > bits.length) continue;
    const body: number[] = [];
    for (let i = 0; i < len + 3; i++) body.push(byte(i));
    const c = (byte(len + 3) << 8) | byte(len + 4);
    if (crc16(body) !== c) continue;
    const text = new TextDecoder().decode(new Uint8Array(body.slice(3)));
    const [seed, settings] = body[1] & 1 ? text.split(SETTINGS_SEPARATOR) : [text, ''];
    return { seed, settings: settings || '', bits: (len + 5) * 8 };
  }
  return null;
}

/* ---------- 舊方式（環上的二進位） ---------- */

/** 一個斷片的額外位元：開頭 4＋位置 12＋長度 10＋CRC-8 8 */
export const CHUNK_OVERHEAD = 4 + 12 + 10 + 8;

export interface CodeLayout {
  /** 短點（一個單位）的長度 */
  u: number;
  /** 圈與圈的間隔 */
  sp: number;
  /** 兩個基準圈 */
  f1: number;
  f2: number;
  /** 刻資料的圈（由內而外） */
  radii: number[];
  /** 能放的位元數（粗估） */
  cap: number;
}

export interface CodeParams {
  lineWidth: number;
  codeUnit: number;
  codeWidth: number;
}

/** 外半徑 r 的圖形能刻幾圈、放幾個位元 */
export function codeLayout(r: number, p: CodeParams): CodeLayout {
  const u = p.codeUnit;
  const lwc = p.lineWidth * p.codeWidth;
  const sp = Math.max(u * 1.5, lwc * 4, 5);
  const f1 = Math.max(u * 1.2, lwc * 3, 4);
  const f2 = f1 + sp;
  const radii: number[] = [];
  for (let x = f2 + sp * 1.2; x <= r + 1e-6; x += sp) radii.push(x);
  const cap = radii.reduce((a, x) => a + Math.max(0, Math.floor((x * TAU - 11 * u) / (4 * u))), 0);
  return { u, sp, f1, f2, radii, cap };
}

const codeSeg = (a0: number, a1: number, sync = false): MorseSeg => ({
  a0,
  a1,
  dot: false,
  dash: false,
  letter: -1,
  ...(sync ? { sync: true } : {}),
});

/** 一圈：同步弧（7 個單位）之後，每個位元是「間隔 1 ＋ 弧（0＝1 個單位、1＝3 個單位）」，放不下（留 4 個單位）就換下一圈 */
export function encodeRing(
  r: number,
  u: number,
  bits: readonly number[],
  from: number,
): { segs: MorseSeg[]; next: number } {
  const L = r * TAU;
  const segs: MorseSeg[] = [codeSeg(0, (7 * u) / r, true)];
  let pos = 7 * u;
  let i = from;
  while (i < bits.length) {
    const len = bits[i] ? 3 * u : u;
    if (pos + u + len > L - 4 * u) break;
    pos += u;
    segs.push(codeSeg(pos / r, (pos + len) / r));
    pos += len;
    i++;
  }
  return { segs, next: i };
}

export interface CodeOptions extends CodeParams {
  codeMin: number;
  codeMax: number;
  codeConvert: boolean;
  codeWhole: boolean;
  codeOrient: boolean;
  codeRootR: number;
}

/** 舊方式一次產生的狀態：封包、下一段從哪個位元開始、每個位元刻了幾次、刻了資料的圖形 */
export interface CodeV1State {
  packet: number[];
  total: number;
  ptr: number;
  cover: Uint16Array;
  list: BloomShape[];
  root: BloomShape;
  settings: boolean;
}

export function codeV1State(packet: number[], root: BloomShape, settings: boolean): CodeV1State {
  return {
    packet,
    total: packet.length,
    ptr: 0,
    cover: new Uint16Array(packet.length),
    list: [],
    root,
    settings,
  };
}

/**
 * 舊方式：把圖形換成刻資料的同心圓（同心圓一定換；圓、圓＋半圓在「也換掉圓與圓＋半圓」開啟時換；三角形不換）。
 * 中央的圖形先放大到 max(中央的最小半徑, 半徑 × (1＋放大倍率))。能放的位元數不到「最小位元數」時不換。
 * 斷片＝[1 0 1 有方向][位置 12][長度 10][資料（有方向時前 3 個位元改用圖形的方向表示）][CRC-8]。
 */
export function makeCarrierV1(
  s: BloomShape,
  o: CodeOptions,
  st: CodeV1State,
  boost: number,
): boolean {
  if (s.tri) return false;
  if (s.kind !== 'rings' && !(o.codeConvert && (s.kind === 'mix' || s.kind === 'circle')))
    return false;
  let ly = codeLayout(s.r, o);
  if (s === st.root) {
    const want = Math.max(o.codeRootR, s.r * (1 + (boost || 0)));
    if (want > s.r) {
      s.r = want;
      ly = codeLayout(s.r, o);
    }
  }
  const pcap = ly.cap - CHUNK_OVERHEAD + (o.codeOrient ? 3 : 0);
  if (pcap < o.codeMin || st.total === 0) return false;
  let off = st.ptr;
  let len = Math.min(pcap, s === st.root && boost ? 1023 : o.codeMax, st.total - off, 1023);
  /* 放得下全部的圖形刻全部（只看這一個就讀得出來） */
  if (o.codeWhole && pcap >= st.total && st.total <= 1023) {
    off = 0;
    len = st.total;
  }
  const useOri = o.codeOrient && len >= 3;
  const payload = st.packet.slice(off, off + len);
  const head = [1, 0, 1, useOri ? 1 : 0, ...toBits(off, 12), ...toBits(len, 10)];
  const crc = crc8bits([...head, ...payload]);
  const stream = [...head, ...(useOri ? payload.slice(3) : payload), ...crc];
  const rings: BloomRing[] = [
    { r: ly.f1, a0: 0, span: TAU, segs: null },
    { r: ly.f2, a0: 0, span: TAU, segs: null },
  ];
  let i = 0;
  for (const r of ly.radii) {
    if (i < stream.length) {
      const e = encodeRing(r, ly.u, stream, i);
      rings.push({ r, a0: 0, span: TAU, segs: e.segs, code: true });
      i = e.next;
    } else rings.push({ r, a0: 0, span: TAU, segs: null }); // 多的圈是實線（讀的時候當成結尾）
  }
  rings.reverse();
  s.kind = 'rings';
  s.rings = rings;
  s.fill = false;
  s.core = undefined;
  s.bridges = [];
  s.rotation = useOri ? (fromBits(payload.slice(0, 3)) * Math.PI) / 4 : 0;
  s.code = { off, len };
  for (let k = off; k < off + len; k++) st.cover[k]++;
  if (!(o.codeWhole && off === 0 && len === st.total)) st.ptr = (off + len) % st.total;
  st.list.push(s);
  return true;
}

/* ---------- 新方式（自然符號） ---------- */

/** 12 個方向（每 30°） */
export const V2_DIRECTIONS = 12;

export interface V2Params {
  lw: number;
  lwc: number;
  u: number;
  /** 刻資料的同心圓周圍要空出的距離 */
  M: number;
  /** 圈與圈的間隔 */
  sp: number;
  /** 最內圈 */
  r1: number;
  /** 刻資料的同心圓最小的外半徑 */
  rmin: number;
  /** 線從外圈往外多遠開始 */
  start: number;
}

export function v2Params(p: CodeParams): V2Params {
  const lw = p.lineWidth;
  const lwc = p.lineWidth * p.codeWidth;
  const u = p.codeUnit;
  const M = Math.max(4 * Math.max(lw, lwc), 8, 1.5 * u);
  const sp = Math.max(lwc * 3.5, lw * 3.5, u * 1.2, 6);
  const r1 = Math.max(lw * 4, lwc * 2, 6);
  return { lw, lwc, u, M, sp, r1, rmin: r1 + 5 * sp + lwc, start: lwc / 2 + lw * 1.5 };
}

/** 依序交出封包的位元；用完後用種子的另一串亂數（種子＋「#fill」）補。記下每種用途用了幾個 */
export interface BitReader {
  i: number;
  used: { ring: number; shape: number; line: number };
  bit(ch: 'ring' | 'shape' | 'line'): number;
  int(n: number, ch: 'ring' | 'shape' | 'line'): number;
}

export function bitReader(packet: readonly number[], seed: string): BitReader {
  const fill: Random = seedRandom(`${seed || '0'}#fill`);
  const r: BitReader = {
    i: 0,
    used: { ring: 0, shape: 0, line: 0 },
    bit(ch) {
      r.used[ch]++;
      const b = r.i < packet.length ? packet[r.i] : fill.next() < 0.5 ? 1 : 0;
      r.i++;
      return b;
    },
    int(n, ch) {
      let v = 0;
      for (let k = 0; k < n; k++) v = v * 2 + r.bit(ch);
      return v;
    },
  };
  return r;
}

/**
 * 新方式：把圖形換成「照資料選樣子」的同心圓：層數＝3＋2 個位元；最內兩圈是實線；其他每一圈先用 3 個位元選花紋的起點方向
 * （8 個方向的中間），再一個一個放長點或短點（1 個位元），剩下的空間夠（12 個單位以上）時放長或短的間隔（1 個位元）。
 * 半徑不夠放時先放大；不塗滿、不旋轉、沒有三角形與摩斯橋。
 */
export function makeCarrierV2(s: BloomShape, reader: BitReader, p: V2Params): void {
  const k = 3 + reader.int(2, 'shape');
  if (s.r < p.r1 + (k - 1) * p.sp) s.r = p.r1 + (k - 1) * p.sp;
  const r1 = Math.max(p.r1, s.r * 0.2);
  const st = (s.r - r1) / (k - 1);
  const rings: BloomRing[] = [];
  for (let i = 0; i < k; i++) {
    const r = r1 + i * st;
    if (i < 2) {
      rings.push({ r, a0: 0, span: TAU, segs: null });
      continue;
    }
    const sector = reader.int(3, 'shape');
    const t0 = (sector * Math.PI) / 4 + Math.PI / 8;
    const L = r * TAU;
    const u = p.u;
    const segs: MorseSeg[] = [];
    let pos = 0;
    while (true) {
      const len = reader.bit('ring') ? 3 * u : u;
      segs.push(codeSeg(t0 + pos / r, t0 + (pos + len) / r));
      pos += len;
      if (L - pos >= 12 * u) pos += reader.bit('ring') ? 3 * u : u;
      else break;
    }
    rings.push({ r, a0: 0, span: TAU, segs, code: true });
  }
  rings.reverse();
  s.kind = 'rings';
  s.rings = rings;
  s.r = rings[0].r;
  s.rotation = 0;
  s.fill = false;
  s.tri = null;
  s.bridges = [];
  s.core = undefined;
  s.v2 = { k };
}
