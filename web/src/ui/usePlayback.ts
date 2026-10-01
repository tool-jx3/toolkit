/**
 * 動畫播放狀態（requestAnimationFrame 驅動）。回傳值可直接展開給 Transport：
 *   const playback = usePlayback({ duration: 3 });
 *   <Transport {...playback} segments={segments} />
 * 使用者設定「減少動態效果」時預設不自動播放。
 * 從頭播放（onRestart）與改時間（onTimeChange、play 從結尾重來）立刻生效：播放中也不會被迴圈用舊的時間蓋掉，
 * 而且要求的那個時間至少顯示一個畫面才往下播（例如改設定後一定看得到第 1 格）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlaybackOptions {
  duration: number;
  /** 預設循環（預設 true） */
  loop?: boolean;
  /** 開啟時自動播放（預設 true；減少動態效果時為 false） */
  autoPlay?: boolean;
  /** 播放速度倍率（預設 1） */
  rate?: number;
}

export interface Playback {
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  onTimeChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onLoopChange: (loop: boolean) => void;
  onRestart: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function usePlayback({
  duration,
  loop: initialLoop = true,
  autoPlay,
  rate = 1,
}: PlaybackOptions): Playback {
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(() => autoPlay ?? !prefersReducedMotion());
  const [loop, setLoop] = useState(initialLoop);
  const opts = useRef({ duration, loop, rate });
  opts.current = { duration, loop, rate };
  /*
   * 播放迴圈讀的時間。所有改時間的地方都同步寫進這裡（不等 React 重新繪製），
   * 否則「從頭播放」之後、重新繪製之前跑到的那一格會用舊的時間把歸零蓋掉。
   * held：外部要求的時間，迴圈的下一格先照原樣顯示（不往前推），保證看得到要求的那一格。
   */
  const clock = useRef({ time: 0, held: false });

  /** 迴圈自己推進時間 */
  const advance = useCallback((t: number) => {
    clock.current.time = t;
    setTimeState(t);
  }, []);
  /** 外部要求的時間（重播、拖時間軸、改設定後從頭播放…） */
  const seek = useCallback((t: number) => {
    clock.current.time = t;
    clock.current.held = true;
    setTimeState(t);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const c = clock.current;
      if (c.held) {
        c.held = false;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = ((now - last) / 1000) * opts.current.rate;
      last = now;
      const { duration: d, loop: lp } = opts.current;
      let t = c.time + dt;
      if (d <= 0) t = 0;
      else if (t >= d) {
        if (lp) t %= d;
        else {
          advance(d);
          setPlaying(false);
          return;
        }
      }
      advance(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, advance]);

  /* 總長變短時把時間夾回範圍內 */
  useEffect(() => {
    if (time > duration) seek(duration);
  }, [duration, time, seek]);

  const onTimeChange = useCallback(
    (t: number) => seek(Math.max(0, Math.min(opts.current.duration, t))),
    [seek],
  );
  const play = useCallback(() => {
    if (clock.current.time >= opts.current.duration) seek(0);
    setPlaying(true);
  }, [seek]);
  const pause = useCallback(() => setPlaying(false), []);
  return {
    time,
    duration,
    playing,
    loop,
    onTimeChange,
    onPlayingChange: (p) => (p ? play() : pause()),
    onLoopChange: setLoop,
    onRestart: () => {
      seek(0);
      setPlaying(true);
    },
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
  };
}
