/**
 * 預覽（規格 F17～F19）：輸出尺寸的畫布（播放中每個畫面重畫，暫停時只在時間或設定改變時重畫）、避開區域、
 * 播放列（有音樂時控制音樂，沒有音樂時控制循環的預覽時鐘）、儲存這一格 PNG。
 */
import { ImageDown, Music2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Stage,
  type StageBackground,
  Transport,
  useAudioPlayback,
  usePlayback,
} from '@/ui';
import { currentRegion, notify, removeAudio } from './actions';
import { savePng } from './exporter';
import { LineOverlay, LineToolbar } from './LineOverlay';
import { formatClock, sizeOf } from './model';
import { RegionOverlay, RegionToolbar } from './RegionOverlay';
import { builtLines, drawFrame, loopLength, planOf, styleOf, usesRegion } from './scene';
import { player, usePreview, useSession, useSettings } from './store';
import { S } from './strings';

export interface PreviewControls {
  toggle(): void;
  restart(): void;
  /** 回到開頭：暫停並停在第一格 */
  rewind(): void;
  seek(t: number): void;
  time(): number;
}

let controls: PreviewControls | null = null;
export const togglePreview = () => controls?.toggle();
export const restartPreview = () => controls?.restart();
export const rewindPreview = () => controls?.rewind();
export const seekPreview = (t: number) => controls?.seek(t);
export const previewNow = () => controls?.time() ?? 0;

let previewCanvas: HTMLCanvasElement | null = null;
/** 測試用：預覽的畫布 */
export const previewCanvasEl = () => previewCanvas;

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const s = useSettings((st) => st.data);
  const fontTick = useSession((st) => st.fontTick);
  const hasAudio = useSession((st) => !!st.audio);
  const exporting = useSession((st) => st.exporting);
  const showRegion = usePreview((st) => st.data.showRegion);
  const stage = usePreview((st) => st.data.stage);
  const size = sizeOf(s.canvas.size);
  const length = loopLength(s, fontTick);
  const loop = usePlayback({ duration: length, loop: true });
  const audio = useAudioPlayback(player);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  /* 避開區域是工具層的共用設定；目前的風格不避開它時不畫框 */
  const region = usesRegion(styleOf(s)) ? s.region : null;
  /* 預覽上的逐句操作（F76）：暫停時才能點選、拖曳 */
  const time = hasAudio ? audio.time : loop.time;
  const playing = hasAudio ? audio.playing : loop.playing;

  useEffect(() => {
    if (hasAudio) loopRef.current.pause();
  }, [hasAudio]);

  useEffect(() => {
    const seek = (t: number) => {
      if (useSession.getState().audio) {
        player.pause();
        player.seek(Math.max(0, t));
      } else {
        loopRef.current.pause();
        loopRef.current.onTimeChange(Math.max(0, Math.min(loopRef.current.duration, t)));
      }
    };
    controls = {
      toggle: () => {
        if (useSession.getState().exporting) return;
        if (useSession.getState().audio) {
          if (player.playing) player.pause();
          else void player.play();
        } else loopRef.current.toggle();
      },
      restart: () => {
        if (useSession.getState().exporting) return;
        if (useSession.getState().audio) void player.play(0);
        else loopRef.current.onRestart();
      },
      rewind: () => {
        if (!useSession.getState().exporting) seek(0);
      },
      seek,
      time: () => (useSession.getState().audio ? player.time() : loopRef.current.time),
    };
    return () => {
      controls = null;
    };
  }, []);

  /* 畫面：每個畫面檢查要不要重畫 */
  useEffect(() => {
    const canvas = canvasRef.current;
    previewCanvas = canvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let prev: unknown[] = [];
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const sess = useSession.getState();
      if (sess.exporting && !sess.recording) return;
      const st = useSettings.getState().data;
      const t = sess.audio ? player.time() : loopRef.current.time;
      if (!sess.audio && sess.loopTime !== t) useSession.setState({ loopTime: t });
      const plan = planOf(st, sess.fontTick);
      const sig = [st, plan, sess.bg, t];
      if (sig.every((v, i) => Object.is(v, prev[i]))) return;
      prev = sig;
      if (canvas.width !== sizeOf(st.canvas.size).width) {
        canvas.width = sizeOf(st.canvas.size).width;
        canvas.height = sizeOf(st.canvas.size).height;
      }
      drawFrame(ctx, t, st, plan, { paint: true, image: sess.bg });
      canvas.dataset.rendered = String(Number(canvas.dataset.rendered ?? 0) + 1);
      canvas.dataset.time = t.toFixed(3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (previewCanvas === canvas) previewCanvas = null;
    };
  }, []);

  const lines = builtLines(s).lines;
  const markers = useMemo(
    () =>
      lines
        .filter((l) => Number.isFinite(l.t) && l.t >= 0)
        .slice(0, 400)
        .map((l) => ({ time: l.t, label: l.text })),
    [lines],
  );

  const onPng = async () => {
    if (useSession.getState().exporting) return;
    try {
      const name = await savePng();
      notify({ title: S.toast.png(name), tone: 'success' });
    } catch (e) {
      notify({ title: e instanceof Error ? e.message : S.toast.pngFailed, tone: 'danger' });
    }
  };

  const stageBg: StageBackground =
    stage.kind === 'color' ? { kind: 'color', color: stage.color } : { kind: stage.kind };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage
        width={size.width}
        height={size.height}
        aria-label={S.preview.aria}
        background={stageBg}
        onBackgroundChange={(bg) =>
          usePreview.getState().update((d) => {
            d.stage =
              bg.kind === 'color'
                ? { kind: 'color', color: bg.color ?? d.stage.color }
                : bg.kind === 'checker' || bg.kind === 'light' || bg.kind === 'dark'
                  ? { kind: bg.kind, color: d.stage.color }
                  : { kind: 'dark', color: d.stage.color };
          })
        }
        backgrounds={['checker', 'dark', 'light', 'color']}
      >
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="block size-full"
          data-testid="preview-canvas"
          aria-label={S.preview.aria}
        />
        <LineOverlay time={time} playing={playing} width={size.width} height={size.height} />
        <RegionOverlay region={region} show={showRegion} />
      </Stage>
      <RegionToolbar />
      <LineToolbar time={time} playing={playing} />
      {hasAudio ? (
        <div className="flex min-w-0 flex-col gap-2" data-testid="audio-transport">
          <Transport
            {...audio}
            fps={1}
            formatTime={formatClock}
            markers={markers}
            disabled={exporting}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
              <Music2 aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate" title={s.audio.name}>
                {s.audio.name}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={removeAudio} disabled={exporting}>
              {S.canvas.musicRemove}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1" data-testid="loop-transport">
          <Transport
            {...loop}
            onLoopChange={undefined}
            fps={30}
            formatTime={formatClock}
            markers={markers}
            disabled={exporting}
          />
          <p className="m-0 text-xs text-muted">{S.preview.loopNote(length)}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<ImageDown />}
          onClick={() => void onPng()}
          disabled={exporting}
          data-testid="save-png"
        >
          {S.preview.png}
        </Button>
        <span className="min-w-0 text-xs text-muted">{S.preview.pngHint}</span>
      </div>
    </div>
  );
}

/** 目前的避開區域（測試用） */
export const regionNow = () => currentRegion();
