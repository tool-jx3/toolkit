/**
 * 預覽欄：舞台（輸出畫面的等比縮圖，依循環設定播放）、播放列、轉場／淡化的順序卡、狀態列、匯出區與兩個 PNG 下載。
 */
import { FileImage, ImageDown } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { QUALITY_WEBP } from '@/core/image';
import { type AnimationExportFormat, type ExportResult, exportAnimation } from '@/core/timeline';
import {
  animationFormats,
  Button,
  cn,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Notice,
  Stage,
  type StageAnyBackgroundKind,
  ThumbnailList,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import {
  effectName,
  fileBase,
  filterName,
  loopWord,
  notify,
  reorderImages,
  swapFadeOrder,
} from './actions';
import { isFade, isSwitch } from './effects';
import {
  exportFrames,
  formatMb,
  outputSize,
  parseSeconds,
  pngSequenceFrames,
  SIZE_LIMIT_BYTES,
  secondsText,
  sequenceBase,
  suffixedName,
} from './logic';
import { colorSwatch, exportSource, renderScene, type Scene, stillSource } from './render';
import {
  type ExportFormatId,
  FPS_CHOICES,
  patchSettings,
  setStatus,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

/** 預覽背景：棋盤格（看得出透明淡化）、黑、白、示意場景（只供預覽） */
const STAGE_BACKGROUNDS: readonly StageAnyBackgroundKind[] = ['checker', 'dark', 'light', 'scene'];

/** 預覽畫布最多約這麼多像素（再大就等比縮小畫，濾鏡的 px 參數一起縮） */
const PREVIEW_PIXELS = 960 * 540;

export const previewScale = (w: number, h: number) =>
  Math.min(1, Math.sqrt(PREVIEW_PIXELS / Math.max(1, w * h)));

const FORMAT_LABEL: Record<ExportFormatId, string> = {
  webp: 'WebP',
  apng: 'APNG',
  gif: 'GIF',
  zip: '連番 PNG',
};

export interface PreviewHandle {
  /** 播放或停止（同播放鈕，沒有圖片或沒有動態時只提示） */
  toggle: () => void;
  /** 以指定 FPS 匯出 WebP（快捷鍵） */
  exportWith: (fps: number) => void;
  seek: (t: number) => void;
  readonly time: number;
  readonly playing: boolean;
}

const toOutput = (r: ExportResult, details: ExportOutput['details']): ExportOutput => ({
  blob: r.blob,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
  frames: r.frames,
  storedFrames: r.storedFrames,
  duration: r.duration,
  details,
});

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export function Preview({
  exportRef,
  ref,
}: {
  exportRef: Ref<ExportPanelHandle>;
  ref?: Ref<PreviewHandle>;
}) {
  const s = useSettings((st) => st.data);
  const images = useSession((st) => st.images);
  const status = useSession((st) => st.status);
  const exporting = useSession((st) => st.exporting);
  const firstFrame = useSession((st) => st.firstFrame);
  const loadSeq = useSession((st) => st.loadSeq);
  const playSeq = useSession((st) => st.playSeq);
  const webpSupported = useWebpSupport();

  const first = images[0] ?? null;
  const seconds = parseSeconds(s.secondsText);
  const size = outputSize(s.quality, s.size, first);
  const ps = previewScale(size.width, size.height);
  const pw = Math.max(1, Math.round(size.width * ps));
  const ph = Math.max(1, Math.round(size.height * ps));
  const filter = s.filter === 'none' ? null : s.filter;
  const scene = useMemo<Scene>(
    () => ({ images: images.map((i) => i.bitmap), effect: s.effect, filter, fadeIn: s.fadeIn }),
    [images, s.effect, filter, s.fadeIn],
  );

  /* 預覽依循環設定：循環時一直重播，不循環時播完停在最後 */
  const playback = usePlayback({ duration: seconds, loop: s.loop, autoPlay: false });
  const pb = useRef(playback);
  pb.current = playback;
  useEffect(() => pb.current.onLoopChange(s.loop), [s.loop]);

  /* 載入圖片（或清除）：預覽停在第一格 */
  const firstLoad = useRef(loadSeq);
  useEffect(() => {
    if (loadSeq === firstLoad.current) return;
    pb.current.pause();
    pb.current.onTimeChange(0);
  }, [loadSeq]);
  /* 選了效果：從頭播放 */
  const firstPlay = useRef(playSeq);
  useEffect(() => {
    if (playSeq === firstPlay.current) return;
    pb.current.onRestart();
  }, [playSeq]);
  /* 無動態：停在靜止畫面 */
  useEffect(() => {
    if (!s.effect) {
      pb.current.pause();
      pb.current.onTimeChange(0);
    }
  }, [s.effect]);

  /* 畫預覽 */
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = s.effect ? Math.min(1, playback.time / Math.max(1e-6, seconds)) : 0;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    renderScene(ctx, scene, progress, {
      width: size.width,
      height: size.height,
      pixelScale: ps,
      frame: Math.floor(progress * seconds * 24),
    });
  }, [scene, progress, seconds, size.width, size.height, ps]);

  /* 下載作廢：圖片、順序、效果、濾鏡、淡化順序、秒數、畫質、尺寸、循環改了就清掉上次的結果 */
  const signature = [
    images.map((i) => i.id).join(','),
    s.effect,
    s.filter,
    s.fadeIn,
    seconds,
    s.quality,
    s.size,
    s.loop,
  ].join('|');
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    useSession.setState({ firstFrame: null });
  }, [signature]);

  /* 播放鈕：沒有圖片、沒有動態時只提示 */
  const setPlaying = (on: boolean) => {
    if (on && !images.length) {
      setStatus('warning', S.status.needImage);
      return;
    }
    if (on && !s.effect) {
      setStatus('info', S.status.noMotionPreview);
      return;
    }
    playback.onPlayingChange(on);
  };

  /* 快捷鍵的匯出：先換成 WebP 與指定 FPS，等設定生效（下一次繪製）後才匯出 */
  const [pendingExport, setPendingExport] = useState(0);
  const panel = useRef<ExportPanelHandle | null>(null);
  useEffect(() => {
    if (pendingExport) panel.current?.exportNow();
  }, [pendingExport]);
  useImperativeHandle(exportRef, () => ({
    exportNow: (f?: string) => panel.current?.exportNow(f),
    cancel: () => panel.current?.cancel(),
    get busy() {
      return !!panel.current?.busy;
    },
  }));
  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (useSession.getState().exporting) return;
      setPlaying(!pb.current.playing);
    },
    exportWith: (fps: number) => {
      if (useSession.getState().exporting) return;
      patchSettings({ fps, ...(webpSupported ? { format: 'webp' as const } : {}) });
      setPendingExport((n) => n + 1);
    },
    seek: (t: number) => pb.current.onTimeChange(t),
    get time() {
      return pb.current.time;
    },
    get playing() {
      return pb.current.playing;
    },
  }));

  const formats = useMemo(
    () =>
      animationFormats(['webp', 'apng', 'gif', 'zip'], { webpSupported }).map((f) => ({
        ...f,
        /* 循環由工具的「循環播放」決定（也影響預覽與檔名） */
        supportsLoop: false,
      })),
    [webpSupported],
  );
  const exportSettings: ExportSettings = {
    format: s.format,
    fps: s.fps,
    plays: s.loop ? 0 : 1,
    scale: 1,
    quantize: s.quantize,
  };
  const effectiveFps = s.format === 'gif' && s.fps > 50 ? 30 : s.fps;
  const estimateFrames = exportFrames(seconds, effectiveFps, s.effect, s.loop).length;

  const runExport = async (
    set: ExportSettings,
    { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
  ): Promise<ExportOutput> => {
    const data = useSettings.getState().data;
    const sess = useSession.getState();
    if (!sess.images.length) {
      setStatus('warning', S.status.needImage);
      throw new Error(S.status.needImage);
    }
    const format = set.format as ExportFormatId;
    const label = FORMAT_LABEL[format];
    const fps = set.fps;
    const secs = parseSeconds(data.secondsText);
    const out = outputSize(data.quality, data.size, sess.images[0]);
    const base = fileBase(data, sess.sourceBase);
    const frames = exportFrames(secs, fps, data.effect, data.loop);
    const exportScene: Scene = {
      images: sess.images.map((i) => i.bitmap),
      effect: data.effect,
      filter: data.filter === 'none' ? null : data.filter,
      fadeIn: data.fadeIn,
    };
    pb.current.pause();
    useSession.setState({ exporting: true, firstFrame: null });
    notify({ title: S.toast.start(fps, label), tone: 'info', duration: 3200 });
    setStatus('progress', S.status.exporting(label, 0, frames.length));
    const onAbort = () => {
      setStatus('warning', S.status.cancelling);
      notify({ title: S.toast.cancelling, tone: 'warning', duration: 2600 });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      /* 連番 PNG：一格一張（張數＝影格數） */
      const table = format === 'zip' ? pngSequenceFrames(frames, fps) : frames;
      const source = exportSource(exportScene, out, secs, table, (i, n) => {
        if (i % 4 === 0 || i === n - 1) setStatus('progress', S.status.exporting(label, i + 1, n));
      });
      const result = await exportAnimation(source, {
        format: format as AnimationExportFormat,
        fps,
        plays: data.loop ? 0 : 1,
        quantize: set.quantize,
        webpQuality: QUALITY_WEBP[data.quality],
        fileName: base,
        sequenceBaseName: sequenceBase(base),
        signal,
        onProgress,
      });
      const still = await exportAnimation(stillSource(exportScene, out), {
        format: 'png',
        fileName: suffixedName(base, 'frame01'),
        signal,
      });
      useSession.setState({ firstFrame: { blob: still.blob, fileName: still.fileName } });
      const bytes = result.blob.size;
      const over = bytes > SIZE_LIMIT_BYTES;
      const done = S.status.done({
        file: result.fileName,
        size: formatMb(bytes),
        effect: effectName(data.effect),
        loop: loopWord(data.loop),
        seconds: secondsText(secs),
        fps,
        quality: S.qualities[data.quality],
        width: out.width,
        height: out.height,
      });
      setStatus(over ? 'warning' : 'success', over ? `${done} ${S.status.tooLarge}` : done);
      notify(
        over
          ? {
              title: S.toast.tooLarge(label),
              description: S.toast.tooLargeHint,
              tone: 'warning',
              duration: 7200,
            }
          : { title: S.toast.ready(label), tone: 'success', duration: 4400 },
      );
      return toOutput(result, [
        { label: '效果', value: effectName(data.effect) },
        { label: '濾鏡', value: filterName(data.filter) },
        { label: '播放', value: loopWord(data.loop) },
        { label: '秒數', value: `${secondsText(secs)} 秒・${fps} FPS` },
        { label: '畫質', value: S.qualities[data.quality] },
      ]);
    } catch (e) {
      if (isAbort(e) || signal.aborted) {
        setStatus('warning', S.status.cancelled);
        notify({ title: S.toast.cancelled, tone: 'warning', duration: 2800 });
      } else {
        setStatus('danger', S.status.failed(e instanceof Error ? e.message : String(e)));
      }
      throw e;
    } finally {
      signal.removeEventListener('abort', onAbort);
      useSession.setState({ exporting: false });
    }
  };

  /* 第一格 PNG：最近一次匯出時一起產生；還沒匯出（或已作廢）時只提示 */
  const downloadFirst = () => {
    if (!firstFrame) {
      notify({
        title: S.toast.exportFirst,
        description: S.exportFirst,
        tone: 'warning',
        duration: 4200,
      });
      return;
    }
    downloadBlob(firstFrame.blob, firstFrame.fileName);
    notify({ title: S.toast.downloaded, tone: 'success', duration: 3200 });
  };
  /* 只套濾鏡（無動態）：直接下載套好濾鏡的靜態圖（輸出尺寸） */
  const showStill = !s.effect && !!filter && images.length > 0;
  const downloadStill = async () => {
    const data = useSettings.getState().data;
    const sess = useSession.getState();
    const out = outputSize(data.quality, data.size, sess.images[0]);
    const r = await exportAnimation(stillSource(scene, out), {
      format: 'png',
      fileName: suffixedName(fileBase(data, sess.sourceBase), 'still'),
    });
    downloadBlob(r.blob, r.fileName);
    notify({ title: S.toast.downloaded, tone: 'success', duration: 3200 });
  };

  /* 順序卡 */
  const showSwitchOrder = isSwitch(s.effect) && images.length >= 2;
  const showFadeOrder = isFade(s.effect) && images.length >= 1;
  const swatch = useMemo(
    () => (s.effect && isFade(s.effect) ? colorSwatch(s.effect) : null),
    [s.effect],
  );
  const fadeItems = useMemo(() => {
    if (!showFadeOrder || !first || !s.effect) return [];
    const img = { id: 'image', name: first.name, image: first.bitmap };
    const color = { id: 'color', name: S.fadeColors[s.effect] ?? '', image: swatch };
    return s.fadeIn ? [color, img] : [img, color];
  }, [showFadeOrder, first, s.effect, s.fadeIn, swatch]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage<StageAnyBackgroundKind>
        width={size.width}
        height={size.height}
        aria-label={S.previewLabel}
        backgrounds={STAGE_BACKGROUNDS}
        defaultBackground={{ kind: 'checker' }}
      >
        <canvas
          ref={canvas}
          width={pw}
          height={ph}
          className="block size-full"
          data-testid="bg-preview"
          data-output={`${size.width}x${size.height}`}
        />
        {!images.length ? (
          <div
            className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-border-strong text-center text-muted"
            style={{ fontSize: 'calc(16px / var(--stage-scale, 1))' }}
            data-testid="preview-empty"
          >
            {S.previewEmpty}
          </div>
        ) : null}
      </Stage>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="output-size">
        {S.outputSize(size.width, size.height)}・{secondsText(seconds)} 秒・
        {s.effect ? effectName(s.effect) : S.noMotion}
      </p>
      <Transport
        {...playback}
        onPlayingChange={setPlaying}
        onRestart={() => {
          if (images.length && s.effect) playback.onRestart();
          else setPlaying(true);
        }}
        loop={s.loop}
        onLoopChange={(v) => patchSettings({ loop: v, fileName: null })}
        onRateChange={playback.setRate}
        fps={24}
        disabled={exporting}
      />

      {showSwitchOrder ? (
        <section aria-label={S.orderTransition} className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold">{S.orderTransition}</h2>
          <p className="m-0 text-xs text-muted">{S.orderTransitionHint}</p>
          <ThumbnailList
            aria-label={S.orderTransitionAria}
            items={images.map((i) => ({ id: i.id, name: i.name, image: i.bitmap }))}
            numbered
            thumbAspect={16 / 9}
            thumbFit="cover"
            minItemWidth={110}
            onReorder={reorderImages}
          />
        </section>
      ) : showFadeOrder ? (
        <section aria-label={S.orderFade} className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold">{S.orderFade}</h2>
          <p className="m-0 text-xs text-muted">{S.orderFadeHint}</p>
          <ThumbnailList
            aria-label={S.orderFadeAria}
            items={fadeItems}
            numbered
            thumbAspect={16 / 9}
            thumbFit="cover"
            minItemWidth={110}
            onReorder={(from, to) => {
              if (from !== to) swapFadeOrder();
            }}
          />
        </section>
      ) : null}

      <div data-testid="status">
        <Notice tone={status.tone}>{status.text}</Notice>
      </div>

      <div
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a[download]'))
            notify({ title: S.toast.downloaded, tone: 'success', duration: 3200 });
        }}
      >
        <ExportPanel
          ref={panel}
          title={S.exportTitle}
          formats={formats}
          settings={exportSettings}
          onSettingsChange={(next) =>
            patchSettings({
              format: next.format as ExportFormatId,
              /* GIF 最多 50 FPS：選 GIF 時 60 改成 30 */
              fps: next.format === 'gif' && next.fps > 50 ? 30 : next.fps,
              quantize: next.quantize,
            })
          }
          fpsOptions={FPS_CHOICES}
          sizeWarningBytes={SIZE_LIMIT_BYTES}
          sizeWarningHint={S.sizeWarningHint}
          estimate={{
            width: size.width,
            height: size.height,
            frames: estimateFrames,
            duration: seconds,
          }}
          resetKey={signature}
          extra={
            <div className="flex flex-col gap-1 text-xs text-muted">
              <p className="m-0">{S.fpsNote}</p>
              <p className="m-0" data-testid="size-note">
                {S.sizeNote}
              </p>
            </div>
          }
          onExport={runExport}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<FileImage />}
            onClick={downloadFirst}
            aria-disabled={!firstFrame || undefined}
            className={cn(!firstFrame && 'opacity-60')}
            data-testid="download-first"
          >
            {S.firstFrame}
          </Button>
          {showStill ? (
            <Button
              icon={<ImageDown />}
              variant="primary"
              onClick={() => void downloadStill()}
              data-testid="download-still"
            >
              {S.stillPng}
            </Button>
          ) : null}
        </div>
        <p className="m-0 text-xs text-muted">{showStill ? S.stillHint : S.firstFrameHint}</p>
      </div>
    </div>
  );
}
