/**
 * 用 core/audio 的 AudioPlayer 驅動共用播放列（Transport）：回傳值直接展開給 Transport。
 *
 * - 播放中每個畫面更新目前時間；播完停在結尾（再按播放從頭）。
 * - 拖曳時間軸時 Transport 會先暫停、放開再播放（AudioPlayer 從新的位置接著播）。
 * - `player` 換了（或拿掉音樂）會重新訂閱。
 *
 * ```tsx
 * const player = useMemo(() => createAudioPlayer(), []);
 * const playback = useAudioPlayback(player);
 * <Transport {...playback} fps={1} formatTime={formatClock} />
 * ```
 * （music-frame 移植時新增）
 */
import { useCallback, useEffect, useState } from 'react';
import type { AudioPlayer } from '@/core/audio';

export interface AudioPlayback {
  time: number;
  duration: number;
  playing: boolean;
  /** 有沒有載入音樂 */
  loaded: boolean;
  onTimeChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** 從頭播放 */
  onRestart: () => void;
  /** 播放／暫停切換 */
  toggle: () => void;
}

export function useAudioPlayback(player: AudioPlayer | null): AudioPlayback {
  const [state, setState] = useState(() => ({
    time: player?.time() ?? 0,
    duration: player?.duration ?? 0,
    playing: player?.playing ?? false,
    loaded: !!player?.buffer,
  }));

  useEffect(() => {
    if (!player) {
      setState({ time: 0, duration: 0, playing: false, loaded: false });
      return;
    }
    let raf = 0;
    const read = () =>
      setState({
        time: player.time(),
        duration: player.duration,
        playing: player.playing,
        loaded: !!player.buffer,
      });
    const frame = () => {
      read();
      raf = player.playing ? requestAnimationFrame(frame) : 0;
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      read();
      if (player.playing) raf = requestAnimationFrame(frame);
    };
    sync();
    const off = player.subscribe(sync);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [player]);

  const onTimeChange = useCallback(
    (t: number) => {
      player?.seek(t);
    },
    [player],
  );
  const onPlayingChange = useCallback(
    (on: boolean) => {
      if (!player) return;
      if (on) void player.play();
      else player.pause();
    },
    [player],
  );
  const onRestart = useCallback(() => {
    void player?.play(0);
  }, [player]);
  const toggle = useCallback(() => {
    if (!player?.buffer) return;
    if (player.playing) player.pause();
    else void player.play();
  }, [player]);

  return { ...state, onTimeChange, onPlayingChange, onRestart, toggle };
}
