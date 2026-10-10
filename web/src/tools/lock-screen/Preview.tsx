/**
 * 預覽區（規格 F36～F39、F57、F62）：預覽模式（手機畫面／完整構圖）、舞台、播放列、匯出。
 * 平常顯示全部的訊息都出現的畫面；點預覽或按播放才看訊息跳出來的動畫。改任何設定都停止播放、回到靜態畫面。
 */
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { makeCanvas } from '@/core/image';
import type { TimelineSegment } from '@/core/timeline';
import {
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  Segmented,
  Select,
  Stage,
  Transport,
  usePlayback,
} from '@/ui';
import { type ExportJob, outputSize, runExport } from './exporter';
import { useEnsureFonts, useFontTick } from './fonts';
import { useAssetImage } from './media';
import {
  animationDuration,
  type ExportFormat,
  type ExportTarget,
  FIRST_AT,
  FULL_OUT,
  GIF_WIDTHS,
  type GifWidth,
  gifFrames,
  SCREEN_OUT,
  screenHeightFor,
} from './model';
import {
  type AnyCanvas,
  buildBlurred,
  buildOuter,
  buildPhoneFrame,
  buildWallpaper,
  type Ctx,
  drawComposition,
  drawScreen,
  fontLoads,
  layoutCards,
} from './render';
import { type PreviewMode, setPrefs, useDoc, usePrefs } from './store';
import { S } from './strings';

export interface PlayHandle {
  toggle: () => void;
  restart: () => void;
  /** 停在某個時間（測試、對等驗證用） */
  seek: (t: number) => void;
  readonly t: number;
  readonly playing: boolean;
}

const PREVIEW_MODES: readonly PreviewMode[] = ['screen', 'full'];
const TARGETS: readonly ExportTarget[] = ['screen', 'full'];

/** 卡片排版（字型載好後重排） */
export function useCardLayouts() {
  const messages = useDoc((s) => s.data.messages);
  const appName = useDoc((s) => s.data.appName);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重新排版
  return useMemo(
    () => layoutCards({ ...useDoc.getState().data, messages, appName }),
    [messages, appName, tick],
  );
}

export function Preview({
  playRef,
  exportRef,
}: {
  playRef: Ref<PlayHandle>;
  exportRef: Ref<ExportPanelHandle>;
}) {
  const s = useDoc((st) => st.data);
  const prefs = usePrefs((p) => p.data);
  const wall = useAssetImage(s.wallpaper.image?.id);
  const outerImg = useAssetImage(s.outer.image?.id);
  const loads = useMemo(() => fontLoads(s), [s]);
  useEnsureFonts(loads);
  const cards = useCardLayouts();
  const mode = prefs.preview;

  /* 快取：桌布（照片＋變暗）、模糊的桌布、外框背景、手機機身 */
  const wallpaper = useMemo(
    () => buildWallpaper(wall.bitmap, wall.bitmap ? s.wallpaper.image : null, s.wallpaper),
    [wall.bitmap, s.wallpaper],
  );
  const blurred = useMemo(() => buildBlurred(wallpaper, s.blur), [wallpaper, s.blur]);
  const outer = useMemo(
    () =>
      mode === 'full'
        ? buildOuter(outerImg.bitmap, outerImg.bitmap ? s.outer.image : null, s.outer)
        : null,
    [mode, outerImg.bitmap, s.outer],
  );
  const frame = useMemo(() => buildPhoneFrame(s.outer.side), [s.outer.side]);
  const screen = useMemo<AnyCanvas>(() => makeCanvas(SCREEN_OUT.width, SCREEN_OUT.height), []);

  const duration = animationDuration(s.messages.length, s.interval);
  const playback = usePlayback({ duration, loop: false, autoPlay: false, loopGap: 1.8 });
  const pb = useRef(playback);
  pb.current = playback;

  /* 開頁與改任何設定：停止播放、顯示全部的訊息（靜態畫面） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 內容（s）一改就回到靜態畫面
  useEffect(() => {
    pb.current.pause();
    pb.current.onTimeChange(Number.POSITIVE_INFINITY);
  }, [s]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const size = mode === 'full' ? { width: FULL_OUT, height: FULL_OUT } : SCREEN_OUT;
  const time = playback.time;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d') as Ctx | null;
    if (!ctx) return;
    const t = !playback.playing && time >= duration - 1e-9 ? Number.POSITIVE_INFINITY : time;
    const layers = { wallpaper, blurred };
    if (mode === 'screen') {
      drawScreen(ctx, c.width, c.height, s, layers, cards, t);
      return;
    }
    if (!outer) return;
    const sctx = screen.getContext('2d') as Ctx;
    drawScreen(sctx, screen.width, screen.height, s, layers, cards, t);
    drawComposition(ctx, outer, frame, screen, s.outer.side);
  }, [mode, s, cards, wallpaper, blurred, outer, frame, screen, time, duration, playback.playing]);

  useImperativeHandle(playRef, () => ({
    toggle: () => pb.current.toggle(),
    restart: () => pb.current.onRestart(),
    seek: (t: number) => {
      pb.current.pause();
      pb.current.onTimeChange(t);
    },
    get t() {
      return pb.current.time;
    },
    get playing() {
      return pb.current.playing;
    },
  }));

  const segments = useMemo<TimelineSegment[]>(() => {
    const out: TimelineSegment[] = [{ id: 'wait', label: S.segmentWait, start: 0, end: FIRST_AT }];
    s.messages.forEach((m, i) => {
      const start = FIRST_AT + i * s.interval;
      const end = i === s.messages.length - 1 ? duration : start + s.interval;
      out.push({ id: m.id, label: S.segmentMessage(i + 1), start, end });
    });
    return out;
  }, [s.messages, s.interval, duration]);

  /* 匯出 */
  const job: ExportJob = {
    target: prefs.target,
    format: prefs.format,
    gifWidth: prefs.gifWidth,
    plays: prefs.plays,
  };
  const out = outputSize(job);
  const frameCount = gifFrames(s.messages.length, s.interval);
  const gifSeconds = frameCount.reduce((a, f) => a + f.ms, 0) / 1000;
  const settings: ExportSettings = {
    format: prefs.format,
    fps: 20,
    plays: prefs.plays,
    scale: 1,
    quantize: false,
  };
  const resetKey = useMemo(
    () => ({ s, target: prefs.target, format: prefs.format, w: prefs.gifWidth, p: prefs.plays }),
    [s, prefs.target, prefs.format, prefs.gifWidth, prefs.plays],
  );
  const formats = useMemo(
    () =>
      (['png', 'gif'] as const).map((id) => ({
        id,
        label: S.formats[id],
        description: S.formatDesc[id],
        supportsLoop: id === 'gif',
      })),
    [],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-sm text-muted">
          {S.previewMode}
        </span>
        <Segmented<PreviewMode>
          aria-label={S.previewMode}
          value={mode}
          onValueChange={(v) => setPrefs({ preview: v })}
          options={PREVIEW_MODES.map((m) => ({ value: m, label: S.previewModes[m] }))}
        />
      </div>
      <Stage
        width={size.width}
        height={size.height}
        aria-label={S.previewLabel[mode]}
        className="shrink-0"
      >
        <button
          type="button"
          aria-label={S.playPreview}
          className="block size-full cursor-pointer p-0"
          onClick={() => playback.onRestart()}
        >
          <canvas
            key={mode}
            ref={canvas}
            width={size.width}
            height={size.height}
            className="block size-full"
            data-testid="lock-canvas"
            data-mode={mode}
            data-size={`${size.width}x${size.height}`}
          />
        </button>
      </Stage>
      <Transport
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        loop={playback.loop}
        onLoopChange={playback.onLoopChange}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        segments={segments}
        fps={20}
      />
      <p className="m-0 px-1 text-xs text-muted">{S.previewHint}</p>
      {wall.status === 'missing' ? (
        <Notice tone="warning">{S.photoMissing.wallpaper}</Notice>
      ) : null}
      {outerImg.status === 'missing' ? (
        <Notice tone="warning">{S.photoMissing.outer}</Notice>
      ) : null}
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        settings={settings}
        onSettingsChange={(next) =>
          setPrefs({ format: next.format as ExportFormat, plays: Math.max(0, next.plays) })
        }
        loopHint={S.loopHint}
        resetKey={resetKey}
        extra={
          <div className="flex min-w-0 flex-col gap-3">
            <Field
              label={S.target}
              hint={<span data-testid="export-size">{S.targetSize(out.width, out.height)}</span>}
            >
              <Segmented<ExportTarget>
                value={prefs.target}
                onValueChange={(v) => setPrefs({ target: v })}
                options={TARGETS.map((t) => ({
                  value: t,
                  label: S.targets[t],
                  ariaLabel: S.targetAria[t],
                }))}
                fullWidth
              />
            </Field>
            {prefs.format === 'gif' ? (
              <>
                {prefs.target === 'screen' ? (
                  <Field label={S.gifWidth} hint={S.gifHint}>
                    <Select
                      value={String(prefs.gifWidth)}
                      onValueChange={(v) => setPrefs({ gifWidth: Number(v) as GifWidth })}
                      options={GIF_WIDTHS.map((w) => ({
                        value: String(w),
                        label: S.gifWidthOption(w, screenHeightFor(w)),
                      }))}
                    />
                  </Field>
                ) : null}
                <p className="m-0 text-xs text-muted tabular-nums" data-testid="export-frames">
                  {S.exportFrames(frameCount.length, gifSeconds)}
                </p>
              </>
            ) : null}
          </div>
        }
        onExport={(_settings, { signal, onProgress }) => {
          const st = useDoc.getState().data;
          return runExport(
            st,
            { wallpaper: wall.bitmap, outer: outerImg.bitmap },
            {
              ...job,
              format: _settings.format as ExportFormat,
              plays: _settings.plays,
            },
            { signal, onProgress },
          );
        }}
      />
    </>
  );
}
