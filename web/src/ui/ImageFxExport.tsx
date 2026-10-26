/**
 * 圖片演出的匯出區（截圖演出、地圖演出共用）：PNG、APNG（色數、播放次數、試算大小）、影片（MP4／透明 WebM，
 * 依瀏覽器能不能編、背景是否透明）、逐步公開／圖層／連番 PNG 的 ZIP；工具可以再加自己的格式（extra）。
 */
import { Calculator } from 'lucide-react';
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import {
  apngTimes,
  buildTimeline,
  computeLayout,
  detectVideoMode,
  type FrameBase,
  type FxDoc,
  type FxExporter,
  type FxExportText,
  formatSize,
  type ImageSource,
  type MovieCodecs,
  type RenderKit,
  SEQUENCE_MAX_FRAMES,
  type Size,
  sizeBadge,
  stepFrames,
  VIDEO_FPS,
  type VideoMode,
} from '@/core/imagefx';
import { Button } from './Button';
import {
  type ExportContext,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
} from './ExportPanel';

/** 匯出區的文字（工具的 strings.ts 提供） */
export interface ImageFxExportText extends FxExportText {
  formats: {
    png: string;
    apng: string;
    mp4: string;
    webm: string;
    steps: string;
    layers: string;
    sequence: string;
  };
  formatDesc: { png: string; apng: string; mp4: string; webm: string };
  stepsDesc: (n: number) => string;
  layersDesc: string;
  sequenceDesc: (n: number) => string;
  needImage: string;
  videoChecking: string;
  apngFpsHint: string;
  colorsHint: string;
  loopHint: string;
  estimate: string;
  estimateRun: string;
  estimateRunning: string;
  estimateIdle: string;
  estimateFailed: string;
}

/** 這個瀏覽器能怎麼編影片（檢查中 null） */
export function useFxVideoMode(
  size: Size,
  fps: number,
  alpha: boolean,
  codecs?: MovieCodecs,
): VideoMode | null {
  const [mode, setMode] = useState<{ key: string; mode: VideoMode } | null>(null);
  const { width, height } = size;
  const codecKey = codecs?.join(',') ?? '';
  const key = `${width}x${height}|${fps}|${alpha}|${codecKey}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: codecs 由 codecKey 代表
  useEffect(() => {
    let alive = true;
    void detectVideoMode({ width, height }, fps, alpha, codecs).then((m) => {
      if (alive) setMode({ key, mode: m });
    });
    return () => {
      alive = false;
    };
  }, [key, width, height, fps, alpha, codecKey]);
  return mode?.key === key ? mode.mode : null;
}

/** 匯出區的影片格式 */
export function fxVideoFormat(
  mode: VideoMode | null,
  transparent: boolean,
  noImage: boolean,
  text: Pick<
    ImageFxExportText,
    | 'formats'
    | 'formatDesc'
    | 'needImage'
    | 'videoChecking'
    | 'webmUnsupported'
    | 'videoUnsupported'
  >,
): ExportFormatOption {
  const label = transparent ? text.formats.webm : text.formats.mp4;
  const reason = noImage
    ? text.needImage
    : !mode
      ? text.videoChecking
      : mode.kind === 'none'
        ? transparent
          ? text.webmUnsupported
          : text.videoUnsupported
        : undefined;
  return {
    id: 'video',
    label,
    description: transparent ? text.formatDesc.webm : text.formatDesc.mp4,
    animated: true,
    disabled: !!reason,
    disabledReason: reason,
  };
}

/** APNG 的試算大小：用目前的設定實際編碼一次（內容或設定改了就作廢） */
export function ImageFxApngEstimate<S extends FxDoc>({
  s,
  image,
  colors,
  plays,
  exportApng,
  text,
}: {
  s: S;
  image: ImageSource;
  colors: number;
  plays: number;
  exportApng: FxExporter<S>['exportApng'];
  text: Pick<
    ImageFxExportText,
    | 'estimate'
    | 'estimateRun'
    | 'estimateRunning'
    | 'estimateIdle'
    | 'estimateFailed'
    | 'estimateBadge'
  >;
}) {
  const key = JSON.stringify([s, colors, plays]);
  const [result, setResult] = useState<
    { key: string; bytes: number } | { key: string; error: string } | null
  >(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  /* 內容或設定改了：取消進行中的試算 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 key 改變時取消
  useEffect(() => {
    abort.current?.abort();
  }, [key]);
  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    try {
      const out = await exportApng(
        s,
        image,
        { colors, plays },
        {
          signal: ctrl.signal,
          onProgress: () => undefined,
        },
      );
      if (!ctrl.signal.aborted) setResult({ key, bytes: out.blob.size });
    } catch (e) {
      if (!ctrl.signal.aborted)
        setResult({ key, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setRunning(false);
      }
    }
  };
  const cur = result?.key === key ? result : null;
  const badge = cur && 'bytes' in cur ? sizeBadge(cur.bytes, text) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{text.estimate}</span>
        <output className="text-sm tabular-nums" data-testid="apng-estimate">
          {cur && 'bytes' in cur ? formatSize(cur.bytes) : '—'}
        </output>
        {badge ? (
          <span
            className={
              badge.tone === 'success'
                ? 'rounded-full bg-success-soft px-2 py-0.5 text-xs text-success'
                : badge.tone === 'warning'
                  ? 'rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning'
                  : 'rounded-full bg-accent-soft px-2 py-0.5 text-xs text-fg'
            }
            data-testid="apng-estimate-badge"
          >
            {badge.text}
          </span>
        ) : null}
        <Button
          size="sm"
          icon={<Calculator />}
          className="ml-auto"
          loading={running}
          onClick={() => void run()}
        >
          {running ? text.estimateRunning : text.estimateRun}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">
        {cur && 'error' in cur ? `${text.estimateFailed}：${cur.error}` : text.estimateIdle}
      </p>
    </div>
  );
}

/** 工具自己加的格式（放在影片後面、三種 ZIP 前面，或最後） */
export interface ImageFxExtraFormat<S> {
  option: ExportFormatOption;
  /** 放在哪裡：影片後面（預設）或最後 */
  place?: 'afterVideo' | 'end';
  /** 匯出區這個格式時，共用匯出區下方多出來的設定 */
  panel?: ReactNode;
  /** 不顯示「預估大小」那一行（ZIP 等） */
  noEstimate?: boolean;
  /** 固定的影格率（例如 X 用 MP4 的 30 fps）與它的說明 */
  fixedFps?: number;
  fixedFpsHint?: string;
  /** 輸出大小和畫面不同時（例如縮小的影片），預估用的大小 */
  size?: Size;
  run: (
    s: S,
    image: ImageSource,
    settings: ExportSettings,
    ctx: ExportContext,
  ) => Promise<ExportOutput>;
}

export interface ImageFxExportAreaProps<F extends FrameBase, S extends FxDoc<F>> {
  s: S;
  image: ImageSource | null;
  kit: RenderKit<F>;
  exporter: FxExporter<S>;
  settings: ExportSettings;
  onSettingsChange: (next: ExportSettings) => void;
  exportRef: Ref<ExportPanelHandle>;
  text: ImageFxExportText;
  /** APNG 的色數選項 */
  colorOptions: readonly number[];
  extra?: readonly ImageFxExtraFormat<S>[];
  /** 匯出時讀最新的內容（不給時用 s） */
  current?: () => S;
}

export function ImageFxExportArea<F extends FrameBase, S extends FxDoc<F>>({
  s,
  image,
  kit,
  exporter,
  settings,
  onSettingsChange,
  exportRef,
  text,
  colorOptions,
  extra = [],
  current,
}: ImageFxExportAreaProps<F, S>) {
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : null);
  const transparent = s.bg.mode === 'transparent';
  const videoFps = VIDEO_FPS.includes(settings.fps) ? settings.fps : 30;
  const mode = useFxVideoMode(layout.canvas, videoFps, transparent);
  const total = buildTimeline(s.timing, s.frames, kit, s.camera).total;
  const fmt = settings.format;
  const fixed = fmt === 'apng' || fmt === 'sequence';
  const extraNow = extra.find((x) => x.option.id === fmt);
  const animated = fixed || fmt === 'video' || !!extraNow?.option.animated;
  const fps = fixed ? s.timing.fps : (extraNow?.fixedFps ?? videoFps);
  const noImage = !image;
  const off = (why?: string) => ({
    disabled: noImage || !!why,
    disabledReason: noImage ? text.needImage : why,
  });
  const steps = stepFrames(s.frames, kit.isAction).length + 1;
  const seqN = apngTimes(total, s.timing.fps).length;
  const formats: ExportFormatOption[] = [
    { id: 'png', label: text.formats.png, description: text.formatDesc.png, ...off() },
    {
      id: 'apng',
      label: text.formats.apng,
      description: text.formatDesc.apng,
      animated: true,
      supportsLoop: true,
      supportsColors: true,
      ...off(),
    },
    fxVideoFormat(mode, transparent, noImage, text),
    ...extra.filter((x) => x.place !== 'end').map((x) => x.option),
    { id: 'steps', label: text.formats.steps, description: text.stepsDesc(steps), ...off() },
    { id: 'layers', label: text.formats.layers, description: text.layersDesc, ...off() },
    {
      id: 'sequence',
      label: text.formats.sequence,
      description: text.sequenceDesc(seqN),
      animated: true,
      ...off(
        seqN > SEQUENCE_MAX_FRAMES ? text.sequenceTooMany(seqN, SEQUENCE_MAX_FRAMES) : undefined,
      ),
    },
    ...extra.filter((x) => x.place === 'end').map((x) => x.option),
  ];
  const zipLike =
    fmt === 'steps' || fmt === 'layers' || fmt === 'sequence' || !!extraNow?.noEstimate;
  return (
    <ExportPanel
      ref={exportRef}
      formats={formats}
      settings={settings}
      onSettingsChange={(next: ExportSettings) => onSettingsChange({ ...next, scale: 1 })}
      fixedFps={fixed ? s.timing.fps : (extraNow?.fixedFps ?? null)}
      fixedFpsHint={extraNow?.fixedFpsHint ?? text.apngFpsHint}
      fpsOptions={VIDEO_FPS}
      colorOptions={colorOptions}
      quantizeHint={text.colorsHint}
      loopHint={text.loopHint}
      sizeWarningBytes={zipLike ? Number.POSITIVE_INFINITY : undefined}
      resetKey={s}
      /* 連番 PNG 的 ZIP 不顯示「未壓縮 N GB」（對 ZIP 沒有意義；張數寫在格式說明裡） */
      estimate={
        animated && fmt !== 'sequence' && !extraNow?.noEstimate && image
          ? {
              width: extraNow?.size?.width ?? layout.canvas.width,
              height: extraNow?.size?.height ?? layout.canvas.height,
              frames: apngTimes(total, fps).length,
              duration: total,
            }
          : null
      }
      extra={
        fmt === 'apng' && image ? (
          <ImageFxApngEstimate
            s={s}
            image={image}
            colors={settings.colors ?? 0}
            plays={settings.plays}
            exportApng={exporter.exportApng}
            text={text}
          />
        ) : (
          (extraNow?.panel ?? null)
        )
      }
      onExport={async (set, ctx) => {
        const img = image;
        if (!img) throw new Error(text.needImage);
        const cur = current?.() ?? s;
        if (set.format === 'png') return exporter.exportPng(cur, img);
        if (set.format === 'apng')
          return exporter.exportApng(cur, img, { colors: set.colors ?? 0, plays: set.plays }, ctx);
        if (set.format === 'steps') return exporter.exportSteps(cur, img, ctx);
        if (set.format === 'layers') return exporter.exportLayers(cur, img, ctx);
        if (set.format === 'sequence') return exporter.exportSequence(cur, img, ctx);
        const x = extra.find((e) => e.option.id === set.format);
        if (x) return x.run(cur, img, set, ctx);
        return exporter.exportVideo(
          cur,
          img,
          mode ?? { kind: 'none', alpha: transparent },
          set.fps,
          ctx,
        );
      }}
    />
  );
}
