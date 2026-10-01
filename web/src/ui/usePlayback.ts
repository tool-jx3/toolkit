/**
 * 動畫播放狀態（requestAnimationFrame 驅動）。回傳值可直接展開給 Transport：
 *   const playback = usePlayback({ duration: 3 });
 *   <Transport {...playback} segments={segments} />
 * 使用者設定「減少動態效果」時預設不自動播放。
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
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(() => autoPlay ?? !prefersReducedMotion());
  const [loop, setLoop] = useState(initialLoop);
  const state = useRef({ time, duration, loop, rate });
  state.current = { time, duration, loop, rate };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * state.current.rate;
      last = now;
      const { duration: d, loop: lp } = state.current;
      let t = state.current.time + dt;
      if (d <= 0) t = 0;
      else if (t >= d) {
        if (lp) t %= d;
        else {
          setTime(d);
          setPlaying(false);
          return;
        }
      }
      state.current.time = t;
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /* 總長變短時把時間夾回範圍內 */
  useEffect(() => {
    if (time > duration) setTime(duration);
  }, [duration, time]);

  const onTimeChange = useCallback(
    (t: number) => setTime(Math.max(0, Math.min(state.current.duration, t))),
    [],
  );
  const play = useCallback(() => {
    if (state.current.time >= state.current.duration) setTime(0);
    setPlaying(true);
  }, []);
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
      setTime(0);
      setPlaying(true);
    },
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
  };
}
