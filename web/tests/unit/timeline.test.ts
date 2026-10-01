import { describe, expect, it } from 'vitest';
import { EASE, EASING_CHOICES, getEasing } from '@/core/timeline/easing';
import { createRandom, hash, hashUnit, seedOf, timeSlot } from '@/core/timeline/random';
import {
  buildSegments,
  frameCount,
  frameTime,
  progress,
  remap,
  segmentAt,
} from '@/core/timeline/timeline';

/** 取樣值與 text-fx 原版（tools/text-fx/js/core.js）相同 */
const SAMPLES: Record<string, number[]> = {
  out: [0, 0.271, 0.578125, 0.875, 0.984375, 0.999, 1],
  snap: [0, 0.5, 0.823223, 0.96875, 0.994476, 0.998047, 1],
  smooth: [0, 0.004, 0.0625, 0.5, 0.9375, 0.996, 1],
  back: [0, 0.408828, 0.81741, 1.087697, 1.064137, 1.014314, 1],
  spring: [0, 1.25, 0.911612, 1.015625, 1.005524, 0.998047, 1],
  bounce: [0, 0.075625, 0.472656, 0.765625, 0.972656, 0.988125, 1],
  linear: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1],
  in: [0, 0.001, 0.015625, 0.125, 0.421875, 0.729, 1],
  slam: [0, 0.001953, 0.005524, 0.03125, 0.176777, 0.5, 1],
  glide: [0, 0.3439, 0.683594, 0.9375, 0.996094, 0.9999, 1],
};
const US = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

describe('緩動曲線', () => {
  for (const [name, values] of Object.entries(SAMPLES)) {
    it(`${name} 的取樣值與 text-fx 相同`, () => {
      const f = EASE[name as keyof typeof EASE];
      for (const [i, u] of US.entries()) expect(f(u)).toBeCloseTo(values[i], 5);
    });
  }

  it('介面選項是 8 條、都有中文名稱', () => {
    expect(EASING_CHOICES.length).toBe(8);
    expect(EASING_CHOICES.map((c) => c.label)).toContain('緩停');
    expect(getEasing('不存在')(0.3)).toBe(0.3);
  });
});

describe('決定性亂數', () => {
  it('hashUnit／seedOf 與 text-fx 相同', () => {
    expect(hashUnit(1, 2, 3)).toBeCloseTo(0.625655327225104, 12);
    expect(hashUnit(0)).toBeCloseTo(0.19494687020778656, 12);
    expect(seedOf('骰子')).toBe(221764077);
    expect(seedOf('abc')).toBe(440920331);
  });

  it('同一個種子得到同一串數字', () => {
    const a = createRandom('星星');
    const b = createRandom('星星');
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const r = createRandom(7);
    for (let i = 0; i < 50; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('hash 混合字串與數字', () => {
    expect(hash('star', 1)).toBe(hash('star', 1));
    expect(hash('star', 1)).not.toBe(hash('star', 2));
    expect(timeSlot(0.999, 10)).toBe(9);
    expect(timeSlot(1, 10)).toBe(10);
  });
});

describe('時間軸', () => {
  it('影格數與取樣時間', () => {
    expect(frameCount(1, 30)).toBe(30);
    expect(frameCount(1.01, 30)).toBe(31);
    expect(frameCount(0, 30)).toBe(1);
    expect(frameTime(29, 30, 1, 30)).toBe(1);
    expect(frameTime(29, 30, 1, 30, false)).toBeCloseTo(29 / 30);
    expect(frameTime(3, 30, 1, 30)).toBeCloseTo(0.1);
  });

  it('階段與段內進度', () => {
    const segs = buildSegments([
      { id: 'in', label: '進場', duration: 0.5 },
      { id: 'hold', label: '停留', duration: 1 },
      { id: 'out', label: '退場', duration: 0.5 },
    ]);
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      [0, 0.5],
      [0.5, 1.5],
      [1.5, 2],
    ]);
    expect(segmentAt(0.25, segs)).toMatchObject({ index: 0, progress: 0.5 });
    expect(segmentAt(0.5, segs)?.segment.id).toBe('hold');
    expect(segmentAt(2, segs)).toMatchObject({ index: 2, progress: 1 });
    expect(progress(5, 0, 0)).toBe(1);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });
});
