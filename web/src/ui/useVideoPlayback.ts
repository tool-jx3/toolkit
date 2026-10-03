/**
 * 用 <video> 驅動共用播放列（Transport）：回傳值直接展開給 Transport。
 *
 * - 播放中每個畫面更新目前時間；給了 `range` 時播放中到了 range.end 就立刻跳回 range.start 繼續播放（循環播放選取區間），
 *   影片播到結尾（ended）也跳回 range.start 繼續。暫停時可以停在任何位置（不會被拉回範圍內）。
 * - `duration` 由呼叫端給（瀏覽器錄的 WebM 的 video.duration 可能是 Infinity，用 core/video 的 probeVideo 先算出來）。
 * - `rate` 套到影片的播放速度。
 *
 * ```tsx
 * const [video, setVideo] = useState<HTMLVideoElement | null>(null);
 * const playback = useVideoPlayback({ video, duration: info.duration, range: { start, end }, rate: speed });
 * <video ref={setVideo} src={url} />
 * <Transport {...playback} />
 * ```
 * （video-anim 移植時新增）
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVideoPlaybackOptions {
  /** 預覽用的影片元素（用 callback ref 存成 state，元素換了會重新綁定） */
  video: HTMLVideoElement | null;
  /** 總長（秒） */
  duration: number;
  /** 循環播放的範圍；不給＝整段（播完停住） */
  range?: { start: number; end: number } | null;
  /** 播放速度（倍，預設 1） */
  rate?: number;
}

export interface VideoPlayback {
  time: number;
  duration: number;
  playing: boolean;
  onTimeChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** 從範圍的起點（沒有範圍時從 0）重新播放 */
  onRestart: () => void;
  /** 播放／暫停切換 */
  toggle: () => void;
}

const play = (video: HTMLVideoElement) => {
  void video.play().catch(() => {});
};

export function useVideoPlayback({
  video,
  duration,
  range = null,
  rate = 1,
}: UseVideoPlaybackOptions): VideoPlayback {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const sync = () => setTime(video.currentTime);
    const frame = () => {
      const r = rangeRef.current;
      if (r && !video.paused && !video.seeking && video.currentTime >= r.end) {
        video.currentTime = r.start;
      }
      setTime(video.currentTime);
      raf = requestAnimationFrame(frame);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      sync();
    };
    const onEnded = () => {
      const r = rangeRef.current;
      if (!r) return;
      video.currentTime = r.start;
      play(video);
    };
    const onTime = () => {
      if (video.paused) sync();
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('seeked', sync);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', sync);
    setPlaying(!video.paused);
    sync();
    if (!video.paused) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('seeked', sync);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', sync);
    };
  }, [video]);

  useEffect(() => {
    if (!video) return;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }, [video, rate]);

  const onTimeChange = useCallback(
    (t: number) => {
      if (!video) return;
      const d = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
      const c = Math.min(d, Math.max(0, t));
      video.currentTime = c;
      setTime(c);
    },
    [video, duration],
  );

  const onPlayingChange = useCallback(
    (on: boolean) => {
      if (!video) return;
      if (!on) {
        video.pause();
        return;
      }
      const r = rangeRef.current;
      if (r && (video.ended || video.currentTime >= r.end - 1e-3)) video.currentTime = r.start;
      else if (!r && video.ended) video.currentTime = 0;
      play(video);
    },
    [video],
  );

  const onRestart = useCallback(() => {
    if (!video) return;
    video.currentTime = rangeRef.current?.start ?? 0;
    play(video);
  }, [video]);

  const toggle = useCallback(() => {
    if (video) onPlayingChange(video.paused);
  }, [video, onPlayingChange]);

  return { time, duration, playing, onTimeChange, onPlayingChange, onRestart, toggle };
}
