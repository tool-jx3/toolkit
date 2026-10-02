// @vitest-environment jsdom
/**
 * usePlayback：用假的 requestAnimationFrame／performance.now 一格一格推進。
 * 重點（typewriter 規格 7.1，F64／F57）：要求從頭播放或改時間之後，正在跑的播放迴圈
 * 不能在 React 重新繪製之前用舊的時間把要求蓋掉。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PlaybackOptions, usePlayback } from '@/ui';

/** 假的畫面更新時鐘：frame(ms) 讓時間前進 ms 毫秒並跑一輪 rAF 的回呼 */
function fakeFrames() {
  let now = 1000;
  let seq = 0;
  const queue = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    seq += 1;
    queue.set(seq, cb);
    return seq;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id);
  });
  return {
    frame(ms = 16) {
      now += ms;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(now);
    },
    /** 連跑 n 格，每格各自包在 act 裡（React 每格之間都會重新繪製） */
    run(n: number, ms = 16) {
      for (let i = 0; i < n; i++) act(() => this.frame(ms));
    },
    get pending() {
      return queue.size;
    },
  };
}

const setup = (opts: PlaybackOptions) =>
  renderHook((o: PlaybackOptions) => usePlayback(o), { initialProps: opts });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePlayback', () => {
  it('依畫面更新推進時間', () => {
    const clock = fakeFrames();
    const { result } = setup({ duration: 3, autoPlay: true });
    expect(result.current.playing).toBe(true);
    clock.run(50, 20);
    expect(result.current.time).toBeCloseTo(1, 6);
  });

  it('從頭播放：迴圈在 React 重新繪製前先跑一格，也不會用舊的時間蓋掉歸零', () => {
    const clock = fakeFrames();
    const { result } = setup({ duration: 3, autoPlay: true });
    clock.run(60, 20);
    expect(result.current.time).toBeCloseTo(1.2, 6);
    /* 同一輪裡：要求從頭播放，接著瀏覽器馬上跑了一格播放迴圈 */
    act(() => {
      result.current.onRestart();
      clock.frame(20);
    });
    /* 要求的時間至少顯示一個畫面 */
    expect(result.current.time).toBe(0);
    expect(result.current.playing).toBe(true);
    clock.run(5, 20);
    expect(result.current.time).toBeCloseTo(0.1, 6);
  });

  it('改時間（onTimeChange）同樣不會被迴圈蓋掉，之後從新的時間繼續', () => {
    const clock = fakeFrames();
    const { result } = setup({ duration: 10, autoPlay: true });
    clock.run(100, 20);
    expect(result.current.time).toBeCloseTo(2, 6);
    act(() => {
      result.current.onTimeChange(0.5);
      clock.frame(20);
      clock.frame(20);
    });
    expect(result.current.time).toBeCloseTo(0.52, 6);
    /* 連續要求好幾次（例如拖數值欄），每次都回到開頭 */
    for (let i = 0; i < 5; i++) {
      clock.run(30, 20);
      expect(result.current.time).toBeGreaterThan(0.5);
      act(() => {
        result.current.onRestart();
        clock.frame(20);
      });
      expect(result.current.time).toBe(0);
    }
  });

  it('循環：超過總長回到開頭；不循環：停在結尾，再按播放從頭開始', () => {
    const clock = fakeFrames();
    const { result } = setup({ duration: 0.5, autoPlay: true });
    clock.run(30, 20); // 0.6 秒
    expect(result.current.time).toBeCloseTo(0.1, 6);
    expect(result.current.playing).toBe(true);

    act(() => result.current.onLoopChange(false));
    clock.run(30, 20);
    expect(result.current.time).toBe(0.5);
    expect(result.current.playing).toBe(false);
    expect(clock.pending).toBe(0);
    act(() => result.current.play());
    expect(result.current.time).toBe(0);
    /* 第 1 格先照原樣顯示一個畫面，之後每格 20 ms */
    clock.run(3, 20);
    expect(result.current.time).toBeCloseTo(0.04, 6);
  });

  it('暫停時改時間；總長變短時夾回範圍內', () => {
    const clock = fakeFrames();
    const { result, rerender } = setup({ duration: 4, autoPlay: false });
    expect(result.current.playing).toBe(false);
    act(() => result.current.onTimeChange(3));
    clock.run(5, 20);
    expect(result.current.time).toBe(3);
    act(() => result.current.onTimeChange(9));
    expect(result.current.time).toBe(4);
    rerender({ duration: 2, autoPlay: false });
    expect(result.current.time).toBe(2);
    /* 播放後從夾回的時間（＝結尾）重新開始 */
    act(() => result.current.play());
    expect(result.current.time).toBe(0);
  });
});
