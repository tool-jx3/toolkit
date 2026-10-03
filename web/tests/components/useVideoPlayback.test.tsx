// @vitest-environment jsdom
/**
 * useVideoPlayback：用假的影片元素與 requestAnimationFrame 檢查「選取區間循環」（video-anim 規格 F25、F34）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoPlayback } from '@/ui';

class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  ended = false;
  seeking = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  plays = 0;
  play() {
    this.plays++;
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

let queue = new Map<number, FrameRequestCallback>();
let seq = 0;
const frame = () =>
  act(() => {
    const cbs = [...queue.values()];
    queue = new Map();
    for (const cb of cbs) cb(0);
  });

beforeEach(() => {
  queue = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    seq += 1;
    queue.set(seq, cb);
    return seq;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

function setup(range: { start: number; end: number } | null = { start: 1, end: 1.5 }, rate = 1) {
  const v = new FakeVideo();
  const hook = renderHook(
    (p: { range: typeof range; rate: number }) =>
      useVideoPlayback({
        video: v as unknown as HTMLVideoElement,
        duration: 3,
        range: p.range,
        rate: p.rate,
      }),
    { initialProps: { range, rate } },
  );
  return { v, hook };
}

describe('useVideoPlayback', () => {
  it('播放中到了終點就跳回起點繼續播放', () => {
    const { v, hook } = setup();
    v.currentTime = 1.2;
    act(() => hook.result.current.onPlayingChange(true));
    expect(hook.result.current.playing).toBe(true);
    frame();
    expect(hook.result.current.time).toBeCloseTo(1.2);
    v.currentTime = 1.55;
    frame();
    expect(v.currentTime).toBe(1);
    expect(v.paused).toBe(false);
  });

  it('暫停時可以停在終點以後（不會被拉回起點）', () => {
    const { v, hook } = setup();
    act(() => hook.result.current.onTimeChange(2.5));
    expect(v.currentTime).toBe(2.5);
    expect(hook.result.current.time).toBe(2.5);
    frame();
    expect(v.currentTime).toBe(2.5);
  });

  it('在終點以後按播放：從起點開始', () => {
    const { v, hook } = setup();
    v.currentTime = 2;
    act(() => hook.result.current.onPlayingChange(true));
    expect(v.currentTime).toBe(1);
    expect(v.plays).toBe(1);
  });

  it('播到影片結尾（ended）也回到起點繼續', () => {
    const { v } = setup({ start: 0.5, end: 3 });
    act(() => {
      v.play();
      v.currentTime = 3;
      v.paused = true;
      v.ended = true;
      v.dispatchEvent(new Event('pause'));
      v.dispatchEvent(new Event('ended'));
    });
    expect(v.currentTime).toBe(0.5);
    expect(v.paused).toBe(false);
  });

  it('從起點重播、切換、時間夾在 0～總長', () => {
    const { v, hook } = setup();
    v.currentTime = 2.2;
    act(() => hook.result.current.onRestart());
    expect(v.currentTime).toBe(1);
    expect(hook.result.current.playing).toBe(true);
    act(() => hook.result.current.toggle());
    expect(v.paused).toBe(true);
    expect(hook.result.current.playing).toBe(false);
    act(() => hook.result.current.onTimeChange(9));
    expect(v.currentTime).toBe(3);
  });

  it('播放速度套到影片', () => {
    const { v, hook } = setup(null, 2);
    expect(v.playbackRate).toBe(2);
    hook.rerender({ range: null, rate: 0.5 });
    expect(v.playbackRate).toBe(0.5);
    expect(v.defaultPlaybackRate).toBe(0.5);
  });
});
