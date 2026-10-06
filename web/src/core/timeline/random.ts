/**
 * 決定性亂數：同一組設定每次畫出來的影格都要一模一樣，所以不用 Math.random。
 * hashUnit／seedOf 取自 text-fx（本站以無塵室方式撰寫，MIT）。
 */

/** 由整數組合（例如字序、時間桶、用途編號）雜湊出 [0, 1) 的值 */
export function hashUnit(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x9e3779b1);
  h ^= Math.imul((b | 0) + 0x1b873593, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul((c | 0) + 0x5bd1e995, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 對稱亂數 [-1, 1) */
export const hashSigned = (a: number, b = 0, c = 0): number => hashUnit(a, b, c) * 2 - 1;

/** 由字串得到穩定的 32 位元整數種子（FNV-1a） */
export function seedOf(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

/** 字串與數字混合的雜湊 → [0, 1)。例如 hash('star', i, 3) */
export function hash(...parts: (string | number)[]): number {
  let h = 0x2545f491;
  for (const p of parts) {
    const v = typeof p === 'string' ? seedOf(p) : Math.round(p * 1000) | 0;
    h = Math.imul(h ^ v, 0x9e3779b1) ^ (h >>> 13);
  }
  return hashUnit(h);
}

/** 依固定頻率分桶：雜訊、抖動的亂數每秒只換固定次數，不跟著輸出 fps 變 */
export const timeSlot = (t: number, perSecond: number): number => Math.floor(t * perSecond + 1e-6);

export interface Random {
  /** [0, 1) */
  next(): number;
  /** [min, max) */
  range(min: number, max: number): number;
  /** [min, max] 的整數 */
  int(min: number, max: number): number;
  /** [-1, 1) */
  signed(): number;
  pick<T>(items: readonly T[]): T;
}

/** 有狀態的決定性亂數產生器（mulberry32）。種子可以是字串或數字。 */
export function createRandom(seed: string | number): Random {
  let s = (typeof seed === 'string' ? seedOf(seed) : seed | 0) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    signed: () => next() * 2 - 1,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
