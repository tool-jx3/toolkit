/**
 * 動畫預覽（規格 F35～F37）：設定欄裡一直循環播放的小預覽（改設定就從頭播），
 * 「放大預覽」打開對話框：較大的畫面（與 GIF 同樣 1.5 倍）＋播放列（播放、暫停、重播、拖曳、循環、逐格）＋「匯出 GIF」。
 */
import { Expand, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { frameIndexAt } from '@/core/timeline';
import { Button, Dialog, DialogClose, IconButton, Transport, usePlayback } from '@/ui';
import { type CaptchaSource, createCaptchaSource } from './animation';
import { gridCounts } from './model';
import type { Ctx } from './render';
import { useDoc } from './store';
import { S } from './strings';
import { useCardImages, useCardLayout } from './useCard';

/** 小預覽的倍率（380 寬，顯示成最寬 240 px） */
const MINI_SCALE = 1;
/** 放大預覽的倍率（與 GIF 預設相同） */
const BIG_SCALE = 1.5;

function useSource(scale: number, enabled: boolean): CaptchaSource | null {
  const d = useDoc((s) => s.data);
  const { tick } = useCardLayout(d);
  const { resolve } = useCardImages(d);
  const filled = gridCounts(d).filled > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 在字型載好後重畫
  return useMemo(
    () => (enabled && filled ? createCaptchaSource(d, resolve, scale) : null),
    [d, resolve, filled, scale, enabled, tick],
  );
}

/** 依播放的時間把目前那一格畫到畫布上 */
function useDrawFrame(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  source: CaptchaSource | null,
  time: number,
) {
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d') as Ctx | null | undefined;
    if (!c || !ctx || !source) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c.width / source.width, 0, 0, c.height / source.height, 0, 0);
    source.drawIndex(ctx, frameIndexAt(source.frames, time));
  }, [canvas, source, time]);
}

export function AnimPreview({ onExportGif }: { onExportGif: () => void }) {
  const [big, setBig] = useState(false);
  const source = useSource(MINI_SCALE, true);
  const playback = usePlayback({ duration: source?.duration || 1, loop: true });
  const pb = useRef(playback);
  pb.current = playback;
  const canvas = useRef<HTMLCanvasElement>(null);

  /* 改設定：從頭播（暫停中就停在第一格） */
  useEffect(() => {
    if (!source) return;
    const p = pb.current;
    if (p.playing) p.onRestart();
    else p.onTimeChange(0);
  }, [source]);

  /* 放大預覽開著時小預覽先停 */
  const resume = useRef(false);
  useEffect(() => {
    const p = pb.current;
    if (big) {
      resume.current = p.playing;
      p.pause();
    } else if (resume.current) {
      resume.current = false;
      p.play();
    }
  }, [big]);

  useDrawFrame(canvas, source, playback.time);
  const frame = source ? frameIndexAt(source.frames, playback.time) : -1;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="relative flex min-h-28 items-center justify-center rounded-lg bg-surface-2 p-3"
        data-testid="mini-box"
        data-state={source ? 'on' : 'empty'}
      >
        {source ? (
          <canvas
            ref={canvas}
            width={Math.round(source.width * MINI_SCALE)}
            height={Math.round(source.height * MINI_SCALE)}
            aria-label={S.miniLabel}
            role="img"
            className="block h-auto w-full max-w-60 rounded-sm shadow-1"
            data-testid="mini-canvas"
            data-frame={frame}
            data-frames={source.frames.length}
          />
        ) : (
          <p className="m-0 text-center text-xs text-muted">{S.miniEmpty}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={playback.playing ? S.miniPause : S.miniPlay}
          icon={playback.playing ? <Pause /> : <Play />}
          size="sm"
          disabled={!source}
          onClick={() => playback.toggle()}
          data-testid="mini-toggle"
        />
        <span className="text-xs tabular-nums text-muted" data-testid="mini-info">
          {source ? S.bigDesc(source.frames.length, source.duration) : ''}
        </span>
        <Button
          size="sm"
          icon={<Expand />}
          className="ml-auto"
          disabled={!source}
          onClick={() => setBig(true)}
        >
          {S.enlarge}
        </Button>
      </div>
      <BigPreview
        open={big}
        onOpenChange={setBig}
        onExportGif={() => {
          setBig(false);
          onExportGif();
        }}
      />
    </div>
  );
}

function BigPreview({
  open,
  onOpenChange,
  onExportGif,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportGif: () => void;
}) {
  const source = useSource(BIG_SCALE, open);
  return (
    <Dialog
      open={open && !!source}
      onOpenChange={onOpenChange}
      title={S.bigTitle}
      description={source ? S.bigDesc(source.frames.length, source.duration) : undefined}
      size="md"
      footer={
        <>
          <DialogClose>{S.close}</DialogClose>
          <Button variant="primary" onClick={onExportGif}>
            {S.bigExport}
          </Button>
        </>
      }
    >
      {source ? <BigPlayer source={source} /> : null}
    </Dialog>
  );
}

function BigPlayer({ source }: { source: CaptchaSource }) {
  const playback = usePlayback({ duration: source.duration, loop: true });
  const canvas = useRef<HTMLCanvasElement>(null);
  useDrawFrame(canvas, source, playback.time);
  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <canvas
        ref={canvas}
        width={Math.round(source.width * BIG_SCALE)}
        height={Math.round(source.height * BIG_SCALE)}
        aria-label={S.bigTitle}
        role="img"
        className="block h-auto max-h-[calc(100dvh-16rem)] w-auto max-w-full rounded-sm shadow-1"
        data-testid="big-canvas"
        data-frame={frameIndexAt(source.frames, playback.time)}
      />
      <Transport
        className="w-full"
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        loop={playback.loop}
        onLoopChange={playback.onLoopChange}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        segments={source.segments}
        frames={source.frames}
      />
    </div>
  );
}
