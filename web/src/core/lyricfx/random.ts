/**
 * 可重現的亂數（lyric-fx 規格 3.7）：同樣的種子與鍵永遠得到同樣的數。
 * - hash32(...parts)：字串與整數混合的 32 位元雜湊（FNV-1a 再做 murmur3 的 fmix32）。
 * - mix32(a, b, …)：只用整數的快速雜湊（抖動每一格每個字都要算，不做字串處理）。
 * - createRng(seed)：mulberry32 的亂數流；random()＝下一個 32 位元整數 ÷ 2³²，randint(a, b)＝a＋⌊random() × (b − a＋1)⌋。
 */

const fmix32 = (h0: number): number => {
  let h = h0 >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** 字串與整數混合的 32 位元雜湊 */
export function hash32(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  for (const p of parts) {
    if (typeof p === 'number') {
      const v = Math.trunc(p) >>> 0;
      byte(0x23);
      byte(v);
      byte(v >>> 8);
      byte(v >>> 16);
      byte(v >>> 24);
    } else {
      byte(0x24);
      for (const ch of p) {
        const c = ch.codePointAt(0) ?? 0;
        byte(c);
        byte(c >>> 8);
        byte(c >>> 16);
      }
    }
    byte(0x2c);
  }
  return fmix32(h);
}

/** 整數的快速雜湊（每個參數先乘上不同的奇數再混合） */
export function mix32(...ints: readonly number[]): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < ints.length; i++) {
    h = Math.imul(h ^ (ints[i] >>> 0), 0x27d4eb2d);
    h = (h ^ (h >>> 15)) >>> 0;
  }
  return fmix32(h);
}

/** 32 位元整數 → a～b（含兩端）的整數 */
export const randintOf = (u32: number, a: number, b: number): number =>
  a + Math.floor(((u32 >>> 0) / 4294967296) * (b - a + 1));

export interface Rng {
  /** 0～1（不含 1） */
  random(): number;
  /** a～b（含兩端）的整數；b < a 時回傳 a */
  randint(a: number, b: number): number;
}

/** mulberry32 的亂數流 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return (z ^ (z >>> 14)) >>> 0;
  };
  return {
    random: () => next() / 4294967296,
    randint: (a: number, b: number) => (b <= a ? a : randintOf(next(), a, b)),
  };
}

/** 新的種子（「重新抽位置」用；不是可重現的亂數） */
export const freshSeed = (): number => {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return Math.floor(Math.random() * 4294967296) >>> 0;
};
