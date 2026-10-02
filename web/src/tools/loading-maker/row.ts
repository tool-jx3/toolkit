/**
 * 換圖列的時間規則（3.6、F118～F134）：各格什麼時候從「起始」換成「目標」、用哪一張圖。純函式。
 *
 * - 進度型：前 90% 的時間依變換順序一格接一格換完，最後 10% 停住；
 * - 循環型：前 44% 依序變換、44%～56% 停在目標、後 44% 依**同樣的順序**變回；
 * - 用到亂數時整段平分成「隨機重複次數」輪，每輪重新洗牌（順序與圖片）；進度型只有最後一輪換過去停住；
 * - 相鄰格的變換時間互相重疊（每格的變換時間是相鄰兩格開始間隔的 1.45 倍），格內是 S 形；
 * - 奇偶交錯：一開始是目標的格，輪到時換回起始。
 */
import { createRandom, smoothstep } from '@/core/timeline';
import type { ImageOrder, LmSettings } from './settings';
import { rowRounds, totalDuration } from './timing';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** 依種子洗牌 0～n−1（同一個種子每次相同） */
export function shuffled(n: number, seed: number | string): number[] {
  const out = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  const rnd = createRandom(`row:${seed}`);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rnd.next() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 變換順序（F129）：從左到右、兩端交替（左1、右1、左2、右2…）、亂數（每輪重新洗牌） */
export function rowOrder(order: ImageOrder, count: number, seed: number, round: number): number[] {
  if (order === 'random') return shuffled(count, `${seed}:order:${round}`);
  if (order === 'alternating') {
    const out: number[] = [];
    for (let l = 0, r = count - 1; l <= r; l++, r--) {
      out.push(l);
      if (r !== l) out.push(r);
    }
    return out;
  }
  return Array.from({ length: count }, (_, i) => i);
}

/**
 * 第 slot 格用第幾張圖（F120）：依序重複（slot mod 張數）、來回往返（0、1…最後、…1、0…）、
 * 亂數（每用完一輪重新洗牌）。沒有圖時 −1。
 */
export function imageIndex(
  order: ImageOrder,
  slot: number,
  imageCount: number,
  seed: number,
  round: number,
  salt: string,
): number {
  if (imageCount <= 0) return -1;
  if (order === 'alternating') {
    if (imageCount === 1) return 0;
    const period = imageCount * 2 - 2;
    const p = mod(slot, period);
    return p < imageCount ? p : period - p;
  }
  if (order === 'random') {
    const cycle = Math.floor(slot / imageCount);
    return shuffled(imageCount, `${seed}:${salt}:${round}:${cycle}`)[mod(slot, imageCount)];
  }
  return mod(slot, imageCount);
}

/** 這一格一開始是不是目標狀態（F124） */
export const startsAsTarget = (pattern: LmSettings['row']['pattern'], slot: number): boolean =>
  pattern === 'odd-base' ? slot % 2 === 1 : pattern === 'odd-image' && slot % 2 === 0;

/** 依序變換的一格：游標走過 (n − 1 ＋ 1.45) 格，每格在 1.45 格的時間內以 S 形換完 */
export function stepMix(phase: number, rank: number, count: number): number {
  const overlap = 1.45;
  const cursor = clamp(phase, 0, 1) * (Math.max(0, count - 1) + overlap);
  return smoothstep(clamp((cursor - rank) / overlap, 0, 1));
}

export interface RowSlotState {
  slot: number;
  rank: number;
  /** 換成目標狀態的比例（0＝起始、1＝目標） */
  mix: number;
  /** 目標圖、起始圖的索引（沒有圖時 −1） */
  targetIndex: number;
  startIndex: number;
}

export interface RowFrameState {
  round: number;
  rounds: number;
  local: number;
  order: number[];
  slots: RowSlotState[];
}

/** t 秒時各格的狀態 */
export function rowFrameState(
  s: LmSettings,
  t: number,
  imageCounts: { start: number; target: number },
): RowFrameState {
  const row = s.row;
  const seed = s.loader.seed;
  const count = Math.max(1, Math.round(row.count));
  const duration = Math.max(0.001, totalDuration(s));
  const n = clamp(t / duration, 0, 1);
  const rounds = rowRounds(s);
  const pos = n * rounds;
  const round = n >= 1 ? rounds - 1 : Math.min(rounds - 1, Math.floor(pos));
  const local = n >= 1 ? 1 : pos - round;
  const order = rowOrder(row.order, count, seed, round);
  const ranks: number[] = new Array(count).fill(0);
  order.forEach((slot, rank) => {
    ranks[slot] = rank;
  });

  let phase = 0;
  let returning = false;
  if (row.mode === 'progress' && round === rounds - 1) phase = clamp(local / 0.9, 0, 1);
  else if (local < 0.44) phase = local / 0.44;
  else if (local <= 0.56) phase = 1;
  else {
    phase = (local - 0.56) / 0.44;
    returning = true;
  }

  const nextRound = row.mode === 'loop' ? mod(round + 1, rounds) : Math.min(round + 1, rounds - 1);
  const atLoopEnd = row.mode === 'loop' && returning && local >= 1;
  const startCount = row.start === 'images' ? imageCounts.start : 0;
  const slots = Array.from({ length: count }, (_, slot): RowSlotState => {
    const stepped = stepMix(phase, ranks[slot], count);
    const raw = returning ? 1 - stepped : stepped;
    const target = startsAsTarget(row.pattern, slot);
    /* 變回時，看不見的那一邊先換成下一輪的圖 */
    const startRound = atLoopEnd ? nextRound : returning && !target ? nextRound : round;
    const targetRound = atLoopEnd ? nextRound : returning && target ? nextRound : round;
    return {
      slot,
      rank: ranks[slot],
      mix: target ? 1 - raw : raw,
      targetIndex: imageIndex(
        row.targetOrder,
        slot,
        imageCounts.target,
        seed,
        targetRound,
        'target',
      ),
      startIndex: imageIndex(row.startOrder, slot, startCount, seed, startRound, 'start'),
    };
  });
  return { round, rounds, local, order, slots };
}
