/**
 * 時間軸（規格 3.4）：每個泡泡什麼時候登場、文字什麼時候出現完、什麼時候退場，以及整段動畫的長度。純函式。
 */
import { createRandom, seedOf, type TimelineSegment } from '@/core/timeline';
import type { SbData } from './model';

/** 逐行出現：每行間隔與每行淡入的長度（秒） */
export const LINE_STEP = 0.22;
export const LINE_FADE = 0.3;
/** 文字淡入的長度（秒） */
export const TEXT_FADE = 0.35;
/** 輪流時，中間的泡泡沒有退場動畫也要讓位：用淡出 */
export const SWAP_FALLBACK_EXIT = 0.25;

export interface ItemTiming {
  /** 泡泡在清單裡的位置 */
  index: number;
  /** 第幾個出現（0 起算） */
  rank: number;
  enter0: number;
  enter1: number;
  text0: number;
  text1: number;
  /** 不退場時是 Infinity */
  exit0: number;
  exit1: number;
}

export interface Timing {
  items: ItemTiming[];
  /** 全部出現完（文字也出現完）的時間 */
  ready: number;
  /** 開始退場的時間（不退場時＝結尾） */
  leave: number;
  duration: number;
  segments: TimelineSegment[];
}

/** 文字出現要多久（秒） */
export function textDuration(
  o: Pick<SbData, 'textAnim' | 'typeSpeed'>,
  chars: number,
  lines: number,
): number {
  if (!chars || !lines) return 0;
  switch (o.textAnim) {
    case 'with':
      return 0;
    case 'fade':
      return TEXT_FADE;
    case 'type':
      return chars / o.typeSpeed;
    case 'line':
      return (lines - 1) * LINE_STEP + LINE_FADE;
  }
}

/**
 * 出現的順序：清單順序，或依泡泡 id 決定的隨機順序（同樣的泡泡每次相同）。
 * 回傳清單位置的陣列（第 k 個出現的是 order[k]）。
 */
export function appearanceOrder(ids: readonly string[], order: SbData['order']): number[] {
  const idx = ids.map((_, i) => i);
  if (order !== 'random' || idx.length < 2) return idx;
  const rnd = createRandom(seedOf(`order|${ids.join('|')}`));
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd.next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * 時間表（規格 3.4）：
 * - 一般：第 k 個在 k × 間隔 登場，登場完接著文字動畫；全部出現完再停留 hold 秒，
 *   之後依同樣的順序與間隔退場（一起退場時同時開始）。
 * - 輪流：第一個在 0 秒登場；每個出現完停留 hold 秒後退場，下一個同時登場（交疊）。
 * - 不退場：結尾＝全部出現完＋停留。
 */
export function computeTiming(
  entries: readonly { index: number; textDur: number }[],
  order: readonly number[],
  o: Pick<
    SbData,
    'arrange' | 'enterDur' | 'exit' | 'exitDur' | 'stagger' | 'hold' | 'exitTogether'
  >,
): Timing {
  const byIndex = new Map(entries.map((e) => [e.index, e]));
  const seq = order.filter((i) => byIndex.has(i));
  if (!seq.length) return { items: [], ready: 0, leave: 0, duration: 0, segments: [] };
  const noExit = o.exit === 'none';
  const items: ItemTiming[] = [];

  if (o.arrange === 'swap') {
    let start = 0;
    seq.forEach((index, rank) => {
      const e = byIndex.get(index)!;
      const last = rank === seq.length - 1;
      const enter0 = start;
      const enter1 = enter0 + o.enterDur;
      const text1 = enter1 + e.textDur;
      const exitDur = noExit ? SWAP_FALLBACK_EXIT : o.exitDur;
      const exit0 = last && noExit ? Infinity : text1 + o.hold;
      const exit1 = last && noExit ? Infinity : exit0 + exitDur;
      items.push({ index, rank, enter0, enter1, text0: enter1, text1, exit0, exit1 });
      start = exit0;
    });
    const lastItem = items[items.length - 1];
    const duration = noExit ? lastItem.text1 + o.hold : lastItem.exit1;
    const ready = lastItem.text1;
    const leave = noExit ? duration : lastItem.exit0;
    const segments: TimelineSegment[] = items.map((it, k) => ({
      id: `item-${k}`,
      label: `第 ${k + 1} 個`,
      start: it.enter0,
      end: k === items.length - 1 ? duration : items[k + 1].enter0,
    }));
    return { items, ready, leave, duration, segments };
  }

  seq.forEach((index, rank) => {
    const e = byIndex.get(index)!;
    const enter0 = rank * o.stagger;
    const enter1 = enter0 + o.enterDur;
    items.push({
      index,
      rank,
      enter0,
      enter1,
      text0: enter1,
      text1: enter1 + e.textDur,
      exit0: 0,
      exit1: 0,
    });
  });
  const ready = Math.max(...items.map((it) => it.text1));
  const leave = ready + o.hold;
  for (const it of items) {
    if (noExit) {
      it.exit0 = Infinity;
      it.exit1 = Infinity;
    } else {
      it.exit0 = o.exitTogether ? leave : leave + it.rank * o.stagger;
      it.exit1 = it.exit0 + o.exitDur;
    }
  }
  const duration = noExit ? leave : Math.max(...items.map((it) => it.exit1));
  const segments: TimelineSegment[] = [
    { id: 'enter', label: '登場', start: 0, end: ready },
    { id: 'hold', label: '停留', start: ready, end: leave },
  ];
  if (!noExit) segments.push({ id: 'exit', label: '退場', start: leave, end: duration });
  return { items, ready, leave, duration, segments: segments.filter((s) => s.end > s.start) };
}
