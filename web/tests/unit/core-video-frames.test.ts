/**
 * core/video 的純計算：選取區間的取樣時間、跳轉時的誤差修正、平均取樣、等比縮放。
 */
import { describe, expect, it } from 'vitest';
import {
  clipSampleTimes,
  evenSampleTimes,
  FRAME_SEEK_EPSILON,
  fitWithin,
  seekTimeFor,
} from '@/core/video/frames';

describe('clipSampleTimes', () => {
  it('影格數＝⌊長度 ÷ (速度 ÷ fps)⌋，第 i 格＝起點 + i × 間隔', () => {
    const r = clipSampleTimes({ start: 0, end: 3, fps: 30 });
    expect(r.step).toBeCloseTo(1 / 30, 12);
    expect(r.times.length).toBe(90);
    expect(r.times[0]).toBe(0);
    expect(r.times[3]).toBeCloseTo(0.1, 12);
    expect(r.times[89]).toBeCloseTo(89 / 30, 12);
  });

  it('規格 3.1 的表（選取區間 3 秒）', () => {
    const n = (fps: number, speed = 1) =>
      clipSampleTimes({ start: 0, end: 3, fps, speed }).times.length;
    expect(n(30)).toBe(90);
    expect(n(24)).toBe(72);
    expect(n(60)).toBe(180);
    expect(n(50)).toBe(150);
    expect(n(15)).toBe(45);
    expect(n(10)).toBe(30);
    expect(n(24, 2)).toBe(36);
    expect(n(15, 0.5)).toBe(90);
    expect(n(30, 1.5)).toBe(60);
  });

  it('從起點開始、終點那一刻不取', () => {
    const r = clipSampleTimes({ start: 1, end: 2, fps: 10 });
    expect(r.times.length).toBe(10);
    expect(r.times[0]).toBe(1);
    expect(r.times[9]).toBeCloseTo(1.9, 12);
    expect(r.times.every((t) => t < 2)).toBe(true);
  });

  it('浮點誤差：長度 ÷ 間隔算成 20.999… 時仍是 21 格', () => {
    /* 0.7 ÷ (1/30) 在浮點數裡不是剛好 21 */
    const r = clipSampleTimes({ start: 0.3, end: 1.0, fps: 30 });
    expect(r.times.length).toBe(21);
  });

  it('長度下限：區間太短時以 minLength 計', () => {
    expect(clipSampleTimes({ start: 1, end: 1.05, fps: 30, minLength: 0.1 }).times.length).toBe(3);
    expect(clipSampleTimes({ start: 1, end: 1.05, fps: 30 }).times.length).toBe(1);
    expect(clipSampleTimes({ start: 2, end: 1, fps: 30 }).times.length).toBe(0);
  });

  it('fps、速度必須大於 0', () => {
    expect(() => clipSampleTimes({ start: 0, end: 1, fps: 0 })).toThrow(RangeError);
    expect(() => clipSampleTimes({ start: 0, end: 1, fps: 30, speed: 0 })).toThrow(RangeError);
  });
});

describe('seekTimeFor', () => {
  it('加 1 毫秒，交界一律取後面那一格', () => {
    expect(FRAME_SEEK_EPSILON).toBe(0.001);
    /* 3 × (1/30)＝0.09999…，加上去之後一定 ≥ 第 3 格的開始（0.1） */
    const t = seekTimeFor(3 * (1 / 30), 10);
    expect(t).toBeGreaterThanOrEqual(0.1);
    expect(t).toBeLessThan(0.1 + 1 / 30);
  });

  it('夾在 0～總長；總長未知時不夾上限', () => {
    expect(seekTimeFor(5, 3)).toBe(3);
    expect(seekTimeFor(-1, 3)).toBe(0);
    expect(seekTimeFor(5, Number.POSITIVE_INFINITY)).toBeCloseTo(5.001, 12);
  });
});

describe('evenSampleTimes', () => {
  it('12 張樣本：起點 + i × 長度 ÷ 12（不含終點）', () => {
    const t = evenSampleTimes(0, 3, 12);
    expect(t.length).toBe(12);
    expect(t[0]).toBe(0);
    expect(t[1]).toBeCloseTo(0.25, 12);
    expect(t[11]).toBeCloseTo(2.75, 12);
  });

  it('長度下限', () => {
    expect(evenSampleTimes(1, 1, 2, 0.1)).toEqual([1, 1.05]);
  });
});

describe('fitWithin', () => {
  it('等比放進框裡、不放大、至少 1 px', () => {
    expect(fitWithin(1920, 1080, 320, 180)).toEqual({ width: 320, height: 180 });
    expect(fitWithin(1080, 1920, 320, 180)).toEqual({ width: 101, height: 180 });
    expect(fitWithin(100, 50, 320, 180)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(10000, 1, 100, 100)).toEqual({ width: 100, height: 1 });
  });
});
