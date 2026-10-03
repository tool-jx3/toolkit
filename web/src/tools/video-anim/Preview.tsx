/**
 * 預覽欄：影片預覽（舞台＋裁切框）、播放列（選取區間的色帶）、起點／終點、匯出區（格式、FPS、格式選項、目前的影格）、結果。
 */
import { ClipboardCopy, ExternalLink, Flag, FlagOff, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  animationFormats,
  Button,
  CropFrame,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Field,
  FieldRow,
  Select,
  Slider,
  Stage,
  Toggle,
  Tooltip,
  Transport,
  useVideoPlayback,
  useWebpSupport,
  withShortcut,
} from '@/ui';
import {
  copyResultDataUrl,
  notify,
  openResultInNewTab,
  pausePreview,
  previewTime,
  registerPreview,
  resetRange,
  setCropPixels,
  setEndHere,
  setResult,
  setStartHere,
} from './actions';
import { exportVideo, MAX_FRAMES, PIXEL_BUDGET } from './exporter';
import {
  cropPixels,
  effectiveFps,
  exportPlan,
  FPS_CHOICES,
  GIF_COLOR_CHOICES,
  type GifDitherChoice,
  type OutputFormat,
  outputSize,
  QUALITY_RANGE,
  sourceRect,
} from './logic';
import { patchSettings, type Settings, useSession, useSettings } from './store';
import { S } from './strings';

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** 結果資訊列的格式（規格 F57：依格式寫實際情況） */
export const formatText = (format: OutputFormat, s: Settings): string =>
  format === 'apng'
    ? S.formatLossless('APNG')
    : format === 'webp'
      ? s.lossless
        ? S.formatLossless('WebP')
        : S.formatLossy('WebP', s.quality)
      : S.formatGif(s.gifColors, s.gifDither);

/** 匯出區的格式選項：WebP 的無損與畫質、GIF 的色數與抖色（規格 5. D7） */
function FormatOptions({ format, disabled }: { format: OutputFormat; disabled: boolean }) {
  const s = useSettings((st) => st.data);
  if (format === 'webp')
    return (
      <div className="flex flex-col gap-2">
        <Field
          label={S.losslessLabel}
          layout="inline"
          hint={s.lossless ? S.losslessOn : S.losslessOff}
        >
          <Toggle
            checked={s.lossless}
            onCheckedChange={(lossless) => patchSettings({ lossless })}
            disabled={disabled}
          />
        </Field>
        <Field label={S.qualityLabel}>
          <Slider
            value={s.quality}
            onChange={(quality) => patchSettings({ quality })}
            min={QUALITY_RANGE[0]}
            max={QUALITY_RANGE[1]}
            step={1}
            unit="%"
            disabled={disabled || s.lossless}
          />
        </Field>
      </div>
    );
  if (format === 'gif')
    return (
      <div className="flex flex-col gap-1">
        <FieldRow columns={2}>
          <Field label={S.gifColorsLabel}>
            <Select
              value={String(s.gifColors)}
              onValueChange={(v) => patchSettings({ gifColors: Number(v) })}
              options={GIF_COLOR_CHOICES.map((n) => ({
                value: String(n),
                label: S.gifColorOption(n),
              }))}
              disabled={disabled}
            />
          </Field>
          <Field label={S.gifDitherLabel}>
            <Select<GifDitherChoice>
              value={s.gifDither}
              onValueChange={(gifDither) => patchSettings({ gifDither })}
              options={(['floyd-steinberg', 'none'] as const).map((v) => ({
                value: v,
                label: S.gifDitherOptions[v],
              }))}
              disabled={disabled}
            />
          </Field>
        </FieldRow>
        <p className="m-0 text-xs text-muted">{S.gifHint}</p>
      </div>
    );
  return null;
}

/** 影片預覽＋播放列＋選取區間（播放中每個畫面更新，所以和匯出區分開） */
function Player() {
  const video = useSession((s) => s.video);
  const start = useSession((s) => s.start);
  const end = useSession((s) => s.end);
  const cropOn = useSession((s) => s.cropOn);
  const crop = useSession((s) => s.crop);
  const exporting = useSession((s) => s.exporting);
  const speed = useSettings((s) => s.data.speed);

  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const range = useMemo(() => ({ start, end }), [start, end]);
  const playback = useVideoPlayback({
    video: el,
    duration: video?.duration ?? 0,
    range,
    rate: speed,
  });
  const toggleRef = useRef(playback.toggle);
  toggleRef.current = playback.toggle;
  useEffect(() => {
    registerPreview({ el, toggle: () => toggleRef.current() });
    return () => registerPreview(null);
  }, [el]);

  if (!video) return null;
  const cropPx = cropPixels(crop, video.width, video.height);
  return (
    <>
      <Stage
        width={video.width}
        height={video.height}
        aria-label={S.previewLabel}
        backgrounds={['dark', 'checker', 'light']}
        defaultBackground={{ kind: 'dark' }}
        fitUpscale
      >
        {/* biome-ignore lint/a11y/useMediaCaption: 使用者自己的影片，沒有字幕檔可以提供 */}
        <video
          key={video.id}
          ref={setEl}
          src={video.url}
          playsInline
          preload="auto"
          className="block size-full"
          data-testid="preview-video"
        />
        {cropOn ? (
          <CropFrame
            width={video.width}
            height={video.height}
            rect={cropPx}
            axis="both"
            label={S.cropFrameLabel(cropPx.width, cropPx.height)}
            aria-label={S.cropFrameAria}
            disabled={exporting}
            onMove={(r, phase) => {
              if (phase === 'move') setCropPixels(r);
            }}
          />
        ) : null}
      </Stage>
      <Transport
        {...playback}
        segments={[{ id: 'range', label: S.rangeSegment, start, end, color: 'var(--accent)' }]}
        fps={30}
        disabled={exporting}
      />
      <section aria-label={S.rangeTitle} className="flex flex-col gap-2">
        <dl
          className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums"
          data-testid="range-info"
        >
          {(
            [
              [S.startLabel, start, 'start'],
              [S.currentLabel, playback.time, 'current'],
              [S.endLabel, end, 'end'],
              [S.lengthLabel, Math.max(0, end - start), 'length'],
            ] as const
          ).map(([label, v, id]) => (
            <div key={id} className="flex gap-1">
              <dt>{label}</dt>
              <dd className="m-0 font-medium text-fg" data-testid={`range-${id}`}>
                {S.seconds2(v)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Tooltip content={withShortcut(S.setStart, '[')}>
            <Button
              size="sm"
              icon={<Flag />}
              onClick={() => setStartHere(previewTime())}
              disabled={exporting}
            >
              {S.setStart}
            </Button>
          </Tooltip>
          <Tooltip content={withShortcut(S.setEnd, ']')}>
            <Button
              size="sm"
              icon={<FlagOff />}
              onClick={() => setEndHere(previewTime())}
              disabled={exporting}
            >
              {S.setEnd}
            </Button>
          </Tooltip>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={resetRange}
            disabled={exporting}
          >
            {S.resetRange}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.rangeHint}</p>
      </section>
    </>
  );
}

/** 匯出區：格式、FPS、格式選項、預估、目前的影格、進度與結果卡 */
function ExportArea() {
  const video = useSession((s) => s.video);
  const start = useSession((s) => s.start);
  const end = useSession((s) => s.end);
  const cropOn = useSession((s) => s.cropOn);
  const crop = useSession((s) => s.crop);
  const exporting = useSession((s) => s.exporting);
  const settings = useSettings((s) => s.data);
  const webpSupported = useWebpSupport();
  /* 目前抽出的影格 */
  const live = useRef<HTMLCanvasElement>(null);

  const formats = useMemo(
    () =>
      animationFormats(['apng', 'webp', 'gif'], { webpSupported }).map((f) => ({
        ...f,
        description: S.formatDescriptions[f.id as OutputFormat],
        /* 一律無限循環；APNG 一律無損（規格 3.3） */
        supportsLoop: false,
        supportsQuantize: false,
        supportsColors: false,
      })),
    [webpSupported],
  );

  if (!video) return null;
  const format = settings.format;
  const fps = effectiveFps(format, settings.fps);
  const src = sourceRect(video, cropOn ? crop : null);
  const out = outputSize(src, settings.scale);
  const plan = exportPlan({ start, end }, { format, fps, speed: settings.speed });
  const tooMany = plan.times.length > MAX_FRAMES;
  const exportSettings: ExportSettings = { format, fps, plays: 0, scale: 1, quantize: false };

  const runExport = async (
    set: ExportSettings,
    { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
  ): Promise<ExportOutput> => {
    const st = useSession.getState();
    const data = useSettings.getState().data;
    if (!st.video) throw new Error(S.needVideo);
    const fmt = set.format as OutputFormat;
    const outFps = effectiveFps(fmt, set.fps);
    pausePreview();
    useSession.setState({ exporting: true });
    try {
      const r = await exportVideo({
        video: st.video,
        range: { start: st.start, end: st.end },
        crop: st.cropOn ? st.crop : null,
        settings: data,
        format: fmt,
        fps: outFps,
        signal,
        onProgress,
        onFrame: (frame) => {
          const c = live.current;
          const ctx = c?.getContext('2d');
          if (!c || !ctx) return;
          const k = Math.min(c.width / frame.width, c.height / frame.height);
          const w = frame.width * k;
          const h = frame.height * k;
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(frame, (c.width - w) / 2, (c.height - h) / 2, w, h);
        },
      });
      setResult({ blob: r.blob, fileName: r.fileName });
      notify({ title: S.toast.done, tone: 'success' });
      return {
        blob: r.blob,
        fileName: r.fileName,
        width: r.width,
        height: r.height,
        frames: r.frames,
        storedFrames: r.storedFrames,
        duration: r.duration,
        details: [
          { label: S.detailFormat, value: formatText(fmt, data) },
          { label: S.detailSampling, value: S.samplingText(outFps, data.speed, r.frames) },
          { label: S.detailSize, value: S.mb(r.blob.size) },
          { label: S.detailTime, value: S.timeText(r.ms) },
        ],
      };
    } catch (e) {
      if (isAbort(e) || signal.aborted) notify({ title: S.toast.cancelled, tone: 'warning' });
      else
        notify({
          title: S.toast.failed,
          description: e instanceof Error ? e.message : String(e),
          tone: 'danger',
        });
      throw e;
    } finally {
      useSession.setState({ exporting: false });
    }
  };

  return (
    <ExportPanel
      title={S.exportTitle}
      formats={formats}
      settings={exportSettings}
      onSettingsChange={(next) =>
        patchSettings({
          format: next.format as OutputFormat,
          /* GIF 顯示的 50 是夾過的值：沒改 FPS 時保留原本的選擇（例如 60） */
          fps: next.fps !== exportSettings.fps ? next.fps : settings.fps,
        })
      }
      fpsOptions={FPS_CHOICES}
      sizeWarningHint={S.sizeWarningHint}
      estimate={{
        width: out.width,
        height: out.height,
        frames: plan.times.length,
        duration: plan.duration,
      }}
      pixelBudget={{ max: tooMany ? 0 : PIXEL_BUDGET, message: S.overBudget }}
      resetKey={video.id}
      extra={
        <div className="flex flex-col gap-2">
          <FormatOptions format={format} disabled={exporting} />
          <p className="m-0 text-xs text-muted tabular-nums" data-testid="export-size">
            {S.outputSize(out.width, out.height)}
          </p>
          <div className={exporting ? 'flex items-center gap-2' : 'hidden'}>
            <canvas
              ref={live}
              width={128}
              height={80}
              aria-label={S.liveFrame}
              className="rounded-sm border border-border bg-black"
              data-testid="live-frame"
            />
            <span className="text-xs text-muted">{S.liveFrame}</span>
          </div>
        </div>
      }
      onExport={runExport}
    />
  );
}

/** 結果：大的循環預覽、在新分頁開啟、複製資料網址 */
function ResultView() {
  const result = useSession((s) => s.result);
  /* 完成後捲到結果 */
  const ref = useRef<HTMLElement>(null);
  const last = useRef(result);
  useEffect(() => {
    if (result && result !== last.current)
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    last.current = result;
  }, [result]);
  if (!result) return null;
  return (
    <section
      ref={ref}
      aria-label={S.resultTitle}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <h2 className="m-0 text-sm font-semibold">{S.resultTitle}</h2>
      <div className="checker flex min-h-40 items-center justify-center overflow-hidden rounded-md border border-border p-2">
        <img
          src={result.url}
          alt={S.resultAlt}
          className="max-h-80 max-w-full object-contain"
          data-testid="result-preview"
        />
      </div>
      <p className="m-0 text-xs text-muted">{S.resultLoop}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<ExternalLink />} onClick={openResultInNewTab}>
          {S.openNewTab}
        </Button>
        <Button size="sm" icon={<ClipboardCopy />} onClick={() => void copyResultDataUrl()}>
          {S.copyDataUrl}
        </Button>
      </div>
    </section>
  );
}

export function Preview() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Player />
      <ExportArea />
      <ResultView />
    </div>
  );
}
