/**
 * 預覽區：舞台（依匯出的時間軸逐格播放、無限循環）、播放列、影格計數、提示、匯出。
 * 改任何設定都從頭播放（使用者設定「減少動態效果」且暫停中時，停在代表畫面）。
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
  exportAnimationBatch,
  frameIndexAt,
  frameStartTimes,
} from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  Notice,
  NumberInput,
  Stage,
  Toggle,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { animationBaseName, segmentBaseName } from './filename';
import { loadFonts } from './fonts';
import {
  buildCreditsSource,
  buildGlitchSource,
  buildKaraokeSource,
  buildTypingSource,
  type TwSource,
} from './render';
import { type Mode, type ModeSettings, RANGES, type TwData, WEBP_MIN_FRAME_MS } from './settings';
import { currentMode, setField, setWebp, useTw, useView } from './store';
import { S } from './strings';
import { creditSegments } from './timeline';

export interface PlayHandle {
  seek: (t: number) => void;
  setPlaying: (on: boolean) => void;
  restart: () => void;
  readonly t: number;
  readonly playing: boolean;
  /** 目前顯示的格（從 0 起算；沒有動畫時 −1） */
  readonly frame: number;
  readonly source: TwSource;
}

/** 依模式建立來源 */
export function sourceFor(mode: Mode, s: ModeSettings): TwSource {
  switch (mode) {
    case 'typing':
      return buildTypingSource(s as TwData['typing']);
    case 'glitch':
      return buildGlitchSource(s as TwData['glitch']);
    case 'credits':
      return buildCreditsSource(s as TwData['credits']);
    case 'karaoke':
      return buildKaraokeSource(s as TwData['karaoke']);
  }
}

/** 代表畫面（減少動態效果時停在這裡）：打字＝打完、故障／卡拉 OK＝最後一格、片尾＝中間 */
export function stillTimeOf(src: TwSource): number {
  if (!src.frames.length) return 0;
  const starts = frameStartTimes(src.frames);
  const i = src.mode === 'credits' ? Math.floor(src.frames.length / 2) : src.fitFrame;
  return starts[Math.min(starts.length - 1, Math.max(0, i))] ?? 0;
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
          label: S.export.colors,
          value: r.colors.lossless
            ? S.export.lossless(r.colors.count)
            : S.export.colorCount(r.colors.count),
        },
      ]
    : undefined,
});

/** 匯出（主執行緒先等字型載入，再用載入後的量測重新排版） */
async function runExport(
  format: AnimationExportFormat,
  signal: AbortSignal,
  onProgress: (ratio: number, label?: string) => void,
) {
  const data = useTw.getState().data;
  const mode = currentMode();
  const st = data[mode];
  const first = sourceFor(mode, st);
  if (first.empty) throw new Error(`${S.noText}，${S.noTextHint}`);
  await loadFonts(first.fontLoads);
  const ts = Date.now();
  const opts = {
    format,
    fps: st.fps,
    plays: 0,
    quantize: format === 'apng' ? st.quantize : false,
    webpQuality: data.webp.lossless ? 1 : Math.min(0.995, data.webp.quality / 100),
    webpMinFrameMs: WEBP_MIN_FRAME_MS,
    signal,
    onProgress,
  };
  if (mode === 'credits' && data.credits.split) {
    const segs = creditSegments(data.credits.text, data.credits.duration, data.credits.fps);
    if (!segs.length) throw new Error(`${S.noText}，${S.noTextHint}`);
    const items = segs.map((seg) => ({
      source: buildCreditsSource({ ...data.credits, text: seg.text, duration: seg.duration }),
      fileName: segmentBaseName(seg.number, seg.text, ts),
    }));
    const results = await exportAnimationBatch(items, opts);
    return {
      files: results.map(toOutput),
      zipName: S.export.zipName(ts),
      details: [{ label: S.export.segments, value: S.export.segmentsValue(results.length) }],
    };
  }
  const r = await exportAnimation(sourceFor(mode, st), {
    ...opts,
    fileName: animationBaseName(mode, ts),
  });
  return toOutput(r);
}

function WebpFields() {
  const webp = useTw((st) => st.data.webp);
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
      <Field label={S.export.webpLossless} layout="inline">
        <Toggle checked={webp.lossless} onCheckedChange={(lossless) => setWebp({ lossless })} />
      </Field>
      <Field
        label={S.export.webpQuality}
        hint={webp.lossless ? S.export.webpQualityHint : undefined}
      >
        <NumberInput
          value={webp.quality}
          onChange={(quality) => setWebp({ quality })}
          min={RANGES.quality.min}
          max={RANGES.quality.max}
          step={1}
          disabled={webp.lossless}
        />
      </Field>
    </div>
  );
}

export function Preview({
  playRef,
  exportRef,
}: {
  playRef: Ref<PlayHandle>;
  exportRef: RefObject<ExportPanelHandle | null>;
}) {
  const mode = useView((st) => st.data.mode);
  const format = useView((st) => st.data.format);
  const settings = useTw((st) => st.data[mode]);
  const webpSupported = useWebpSupport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);
  const [fontsLoading, setFontsLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後以新的量測重新排版
  const source = useMemo(() => sourceFor(mode, settings), [mode, settings, fontTick]);
  const playback = usePlayback({ duration: source.duration, loop: true });
  const state = useRef({ playback, source });
  state.current = { playback, source };

  /* 字型：需要的字型改變時才載入；真的花了時間下載才重新排版 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在需要的字型改變時重新載入
  useEffect(() => {
    let alive = true;
    const started = performance.now();
    const timer = setTimeout(() => {
      if (alive) setFontsLoading(true);
    }, 200);
    state.current.source.prepare().then(() => {
      clearTimeout(timer);
      if (!alive) return;
      setFontsLoading(false);
      if (performance.now() - started > 30) setFontTick((n) => n + 1);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [source.fontKey]);

  /* 改任何設定（換了來源）：從頭播放 */
  const first = useRef(true);
  useEffect(() => {
    const p = state.current.playback;
    const reduce = prefersReducedMotion();
    if (first.current) {
      first.current = false;
      if (reduce) p.onTimeChange(stillTimeOf(source));
      return;
    }
    if (p.playing || !reduce) p.onRestart();
    else p.onTimeChange(stillTimeOf(source));
  }, [source]);

  /* 畫目前這一格 */
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) void drawFrame(ctx, source, playback.time);
  }, [source, playback.time]);

  const frame = source.empty ? -1 : frameIndexAt(source.frames, playback.time);
  useImperativeHandle(playRef, () => ({
    seek: (t: number) => {
      const p = state.current.playback;
      p.pause();
      p.onTimeChange(Math.min(state.current.source.duration, Math.max(0, t)));
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
    get frame() {
      const s = state.current.source;
      return s.empty ? -1 : frameIndexAt(s.frames, state.current.playback.time);
    },
    get source() {
      return state.current.source;
    },
  }));

  const formats = useMemo(
    () =>
      animationFormats(['apng', 'gif', 'webp'], { webpSupported }).map((f) => ({
        ...f,
        supportsLoop: false,
      })),
    [webpSupported],
  );
  const n = source.frames.length;
  const tooMany = n > DEFAULT_MAX_FRAMES;

  return (
    <>
      <Stage
        width={source.width}
        height={source.height}
        aria-label="動畫預覽"
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
          width={source.width}
          height={source.height}
          className="block size-full"
          data-testid="tw-canvas"
        />
      </Stage>
      <Transport
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        fps={settings.fps}
        disabled={source.empty}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
        <span data-testid="frame-counter" className="tabular-nums text-fg">
          {S.frameCounter(frame + 1, n)}
        </span>
        <span data-testid="meta-line" className="ml-auto tabular-nums">
          <b className="font-medium text-fg">{S.modes[mode]}</b>・{source.width}×{source.height}・
          {settings.fps} fps・{source.duration.toFixed(2)} 秒
        </span>
      </div>
      {source.empty ? <Notice tone="warning">{S.emptyNotice}</Notice> : null}
      {tooMany ? <Notice tone="danger">{S.tooManyFrames(n, DEFAULT_MAX_FRAMES)}</Notice> : null}
      <ExportPanel
        ref={exportRef}
        formats={formats}
        fixedFps={settings.fps}
        fixedFpsHint={S.export.fixedFpsHint}
        quantizeHint={S.export.quantizeHint}
        settings={{
          format,
          fps: settings.fps,
          plays: 0,
          scale: 1,
          quantize: settings.quantize,
        }}
        onSettingsChange={(next) => {
          if (next.format !== format) useView.getState().patch({ format: next.format });
          if (next.quantize !== settings.quantize) setField(mode, 'quantize', next.quantize);
        }}
        extra={format === 'webp' ? <WebpFields /> : null}
        onExport={(s, { signal, onProgress }) =>
          runExport(s.format as AnimationExportFormat, signal, onProgress)
        }
      />
    </>
  );
}
