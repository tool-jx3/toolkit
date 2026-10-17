/**
 * 種子（規格 3.1）：種子文字 → 32 位元整數 → mulberry32（共用的 core/timeline/random）。
 * 雜湊的算法照原作（同一個種子才會畫出同一張）：以 UTF-16 碼元逐一混合。
 */
import { createRandom, type Random } from '@/core/timeline/random';

/** 種子文字 → 32 位元無號整數（空白當成「0」） */
export function seedNumber(text: string): number {
  const s = text || '0';
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** 這個種子的亂數產生器 */
export const seedRandom = (text: string): Random => createRandom(seedNumber(text));

const SEED_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 新的隨機種子：8 個英數字（0～9、a～z） */
export function randomSeedText(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += SEED_CHARS[b % SEED_CHARS.length];
  return out;
}
