/**
 * 動畫播放狀態（requestAnimationFrame 驅動）。回傳值可直接展開給 Transport：
 *   const playback = usePlayback({ duration: 3 });
 *   <Transport {...playback} segments={segments} />
 * 使用者設定「減少動態效果」時預設不自動播放。
 * 從頭播放（onRestart）與改時間（onTimeChange、play 從結尾重來）立刻生效：播放中也不會被迴圈用舊的時間蓋掉，
 * 而且要求的那個時間至少顯示一個畫面才往下播（例如改設定後一定看得到第 1 格）。
 *
 * G2 擴充（都是選填，不給時行為不變）：
 * - `loopGap`：循環時每輪播完先停在最後一刻這麼多秒再從頭（例：檔案只播一次時，預覽每輪之間停 1.2 秒）。
 * - 播放速度：`rate` 是初始值（之後改 rate 也會跟著），回傳的 `rate`／`setRate` 給 Transport 的速度欄
 *   （`<Transport {...playback} onRateChange={playback.setRate} />`；不給 onRateChange 時 Transport 不顯示速度欄）。
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
  /** 循環時每輪結尾多停幾秒（預設 0） */
  loopGap?: number;
}

export interface Playback {
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  /** 目前的播放速度 */
  rate: number;
  onTimeChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onLoopChange: (loop: boolean) => void;
  onRestart: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 改播放速度（只影響預覽） */
  setRate: (rate: number) => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function usePlayback({
  duration,
  loop: initialLoop = true,
  autoPlay,
  rate: rateOption = 1,
  loopGap = 0,
}: PlaybackOptions): Playback {
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(() => autoPlay ?? !prefersReducedMotion());
  const [loop, setLoop] = useState(initialLoop);
  const [rate, setRateState] = useState(rateOption);
  /* 外部改了 rate 選項時跟著改 */
  useEffect(() => setRateState(rateOption), [rateOption]);
  const opts = useRef({ duration, loop, rate, loopGap });
  opts.current = { duration, loop, rate, loopGap };
  /*
   * 播放迴圈讀的時鐘。所有改時間的地方都同步寫進這裡（不等 React 重新繪製），
   * 否則「從頭播放」之後、重新繪製之前跑到的那一格會用舊的時間把歸零蓋掉。
   * clock 含循環結尾的停留（顯示的時間＝min(clock, duration)）。
   * held：外部要求的時間，迴圈的下一格先照原樣顯示（不往前推），保證看得到要求的那一格。
   */
  const clock = useRef({ clock: 0, time: 0, held: false });

  /** 迴圈自己推進時間 */
  const advance = useCallback((c: number, t: number) => {
    clock.current.clock = c;
    clock.current.time = t;
    setTimeState(t);
  }, []);
  /** 外部要求的時間（重播、拖時間軸、改設定後從頭播放…） */
  const seek = useCallback((t: number) => {
    clock.current.clock = t;
    clock.current.time = t;
    clock.current.held = true;
    setTimeState(t);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const k = clock.current;
      if (k.held) {
        k.held = false;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      const { duration: d, loop: lp, rate: r, loopGap: gap } = opts.current;
      const dt = ((now - last) / 1000) * r;
      last = now;
      let c = k.clock + dt;
      let t: number;
      if (d <= 0) {
        c = 0;
        t = 0;
      } else if (c >= d) {
        if (lp) {
          const cycle = d + Math.max(0, gap);
          if (c >= cycle) c %= cycle;
          t = Math.min(c, d);
        } else {
          advance(d, d);
          setPlaying(false);
          return;
        }
      } else t = c;
      advance(c, t);
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
  const setRate = useCallback((r: number) => {
    if (Number.isFinite(r) && r > 0) setRateState(r);
  }, []);
  return {
    time,
    duration,
    playing,
    loop,
    rate,
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
    setRate,
  };
}
