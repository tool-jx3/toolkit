/**
 * 預覽區（規格 F40～F45）：舞台（循環播放）、播放列（登場／停留／退場三段）、尺寸與長度、提示、匯出。
 * 改任何設定都從頭播放（使用者設定「減少動態效果」且暫停中時，停在全部出現的畫面）。
 */
import {
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AnimationExportFormat,
  DEFAULT_MAX_FRAMES,
  drawFrame,
  type ExportResult,
  exportAnimation,
  frameCount,
} from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Notice,
  Stage,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { useEnsureFonts, useFontTick } from './fontTick';
import { exportBaseName, FPS_OPTIONS, type SbData } from './model';
import { buildScene, loadSceneFonts, type Scene } from './scene';
import { edit, usePrefs, useSb } from './store';
import { S } from './strings';

export interface PlayHandle {
  seek: (t: number) => void;
  setPlaying: (on: boolean) => void;
  restart: () => void;
  readonly t: number;
  readonly playing: boolean;
  readonly scene: Scene;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const toOutput = (r: ExportResult): ExportOutput => ({
  blob: r.blob,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
  frames: r.frames,
  storedFrames: r.storedFrames,
  duration: r.duration,
  details: r.colors
    ? [
        {
          label: S.colorsDetail,
          value: r.colors.lossless ? S.lossless(r.colors.count) : S.colorCount(r.colors.count),
        },
      ]
    : undefined,
});

/** 匯出（規格 3.6）：先等字型載好，再用載好後的字寬重新排版 */
export async function runExport(
  d: SbData,
  s: ExportSettings,
  signal: AbortSignal,
  onProgress: (ratio: number, label?: string) => void,
): Promise<ExportOutput> {
  const first = buildScene(d);
  if (first.empty) throw new Error(S.noContent);
  await loadSceneFonts(first);
  const scene = buildScene(d);
  const format = s.format as AnimationExportFormat;
  const r = await exportAnimation(scene, {
    format,
    fps: s.fps,
    plays: s.plays,
    scale: s.scale,
    quantize: format === 'apng' ? s.quantize : false,
    fileName: exportBaseName(Date.now()),
    signal,
    onProgress,
  });
  return toOutput(r);
}

export function Preview({
  playRef,
  exportRef,
}: {
  playRef: Ref<PlayHandle>;
  exportRef: RefObject<ExportPanelHandle | null>;
}) {
  const d = useSb((s) => s.data);
  const prefs = usePrefs((p) => p.data);
  const tick = useFontTick();
  const webpSupported = useWebpSupport();
  const canvas = useRef<HTMLCanvasElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重新排版
  const scene = useMemo(() => buildScene(d), [d, tick]);
  useEnsureFonts(scene.fontLoads);
  const playback = usePlayback({ duration: scene.duration, loop: true });
  const state = useRef({ playback, scene });
  state.current = { playback, scene };

  /* 字型下載超過 0.2 秒才顯示「正在載入字型」 */
  const [fontsLoading, setFontsLoading] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在需要的字型改變時檢查
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) setFontsLoading(true);
    }, 200);
    void loadSceneFonts(state.current.scene).then(() => {
      clearTimeout(timer);
      if (alive) setFontsLoading(false);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [scene.fontKey]);

  /* 改任何設定（換了場景）：從頭播放；減少動態效果且暫停中時停在全部出現的畫面 */
  const first = useRef(true);
  useEffect(() => {
    const p = state.current.playback;
    const reduce = prefersReducedMotion();
    if (first.current) {
      first.current = false;
      if (reduce) p.onTimeChange(scene.stillTime);
      return;
    }
    if (p.playing || !reduce) p.onRestart();
    else p.onTimeChange(scene.stillTime);
  }, [scene]);

  /* 畫目前這一格 */
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) void drawFrame(ctx, scene, Math.min(playback.time, scene.duration));
  }, [scene, playback.time]);

  useImperativeHandle(playRef, () => ({
    seek: (t: number) => {
      const p = state.current.playback;
      p.pause();
      p.onTimeChange(Math.min(state.current.scene.duration, Math.max(0, t)));
    },
    setPlaying: (on: boolean) =>
      on ? state.current.playback.play() : state.current.playback.pause(),
    restart: () => state.current.playback.onRestart(),
    get t() {
      return state.current.playback.time;
    },
    get playing() {
      return state.current.playback.playing;
    },
    get scene() {
      return state.current.scene;
    },
  }));

  /* 內容或匯出設定（格式、次數、倍率、減色）改了：上次的結果卡作廢 */
  const resetKey = useMemo(
    () => ({ d, format: prefs.format, plays: prefs.plays, scale: prefs.scale, q: prefs.quantize }),
    [d, prefs.format, prefs.plays, prefs.scale, prefs.quantize],
  );
  const formats = useMemo(
    () => animationFormats(['apng', 'gif', 'webp', 'png', 'zip'], { webpSupported }),
    [webpSupported],
  );
  const fpsOptions = useMemo(
    () => [...new Set([...FPS_OPTIONS, d.fps])].sort((a, b) => a - b),
    [d.fps],
  );
  const frames = frameCount(scene.duration, d.fps);
  const settings: ExportSettings = {
    format: prefs.format,
    fps: d.fps,
    plays: prefs.plays,
    scale: prefs.scale,
    quantize: prefs.quantize,
  };
  const capped = d.canvasMode === 'auto' && scene.overflow;

  return (
    <>
      <Stage
        width={scene.width}
        height={scene.height}
        aria-label={S.previewLabel}
        className="shrink-0"
        toolbarExtra={
          fontsLoading ? (
            <span role="status" className="mr-2 text-xs text-muted">
              {S.loadingFonts}
            </span>
          ) : null
        }
      >
        <canvas
          ref={canvas}
          width={scene.width}
          height={scene.height}
          className="block size-full"
          data-testid="sb-canvas"
          data-size={`${scene.width}x${scene.height}`}
        />
      </Stage>
      <Transport
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        fps={d.fps}
        segments={scene.segments}
        disabled={scene.empty}
      />
      <p className="m-0 px-1 text-xs text-muted tabular-nums" data-testid="meta-line">
        {S.meta(scene.width, scene.height, d.fps, scene.duration, frames)}
      </p>
      {scene.empty ? <Notice tone="warning">{S.emptyNotice}</Notice> : null}
      {!scene.empty && d.canvasMode === 'fixed' && scene.overflow ? (
        <Notice tone="warning">{S.overflowNotice}</Notice>
      ) : null}
      {capped ? <Notice tone="warning">{S.capNotice}</Notice> : null}
      {frames > DEFAULT_MAX_FRAMES ? (
        <Notice tone="danger">{S.tooManyFrames(frames, DEFAULT_MAX_FRAMES)}</Notice>
      ) : null}
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        baseSize={{ width: scene.width, height: scene.height }}
        fpsOptions={fpsOptions}
        settings={settings}
        onSettingsChange={(next) => {
          if (next.fps !== d.fps)
            edit((x) => {
              x.fps = next.fps;
            });
          const { format, plays, scale, quantize } = next;
          if (
            format !== prefs.format ||
            plays !== prefs.plays ||
            scale !== prefs.scale ||
            quantize !== prefs.quantize
          )
            usePrefs.getState().patch({ format, plays, scale, quantize });
        }}
        estimate={
          scene.empty
            ? null
            : {
                width: Math.round(scene.width * prefs.scale),
                height: Math.round(scene.height * prefs.scale),
                frames,
                duration: scene.duration,
              }
        }
        resetKey={resetKey}
        onExport={(s, { signal, onProgress }) =>
          runExport(useSb.getState().data, s, signal, onProgress)
        }
      />
    </>
  );
}
