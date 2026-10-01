/**
 * 匯出區：格式、FPS、循環、尺寸、減色、進度與取消、結果卡（預覽、檔名、大小、尺寸、影格數、5 MB 提醒、下載）。
 *
 * 實際的匯出由工具提供（onExport），通常就是呼叫 core/timeline 的 exportAnimation：
 *
 *   <ExportPanel
 *     formats={animationFormats(['apng', 'gif', 'webp', 'png', 'zip'])}
 *     baseSize={{ width: 512, height: 512 }}
 *     onExport={(s, { signal, onProgress }) => exportAnimation(source, { ...s, signal, onProgress })}
 *   />
 */
import { Download, FileArchive, TriangleAlert, X } from 'lucide-react';
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supportsWebpEncoding } from '@/core/encode/webp';
import { formatBytes, SIZE_WARNING_BYTES } from '@/core/files';
import { type AnimationExportFormat, EXPORT_FORMATS } from '@/core/timeline/export';
import { Button, buttonClass, IconButton } from './Button';
import { cn } from './cn';
import { Field } from './Field';
import { NumberInput } from './NumberInput';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Toggle } from './Toggle';

export interface ExportFormatOption {
  id: string;
  label: string;
  description?: string;
  /** 動畫格式：顯示 FPS */
  animated?: boolean;
  /** 顯示循環設定 */
  supportsLoop?: boolean;
  /** 顯示減色開關 */
  supportsQuantize?: boolean;
  maxFps?: number;
  disabled?: boolean;
  /** 停用時的原因（顯示在說明） */
  disabledReason?: string;
}

export interface ExportSettings {
  format: string;
  fps: number;
  /** 播放次數，0 = 無限循環 */
  plays: number;
  /** 輸出尺寸倍率 */
  scale: number;
  /** 減色（256 色） */
  quantize: boolean;
}

export interface ExportOutput {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  /** 影格數（實際存進檔案的；動畫才有） */
  frames?: number;
  storedFrames?: number;
  /** 秒 */
  duration?: number;
  /** 結果卡上額外的資訊列（例如色數、循環、匯出時間） */
  details?: readonly { label: string; value: string }[];
}

export interface ExportContext {
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

export interface ExportPanelProps {
  formats: readonly ExportFormatOption[];
  onExport: (settings: ExportSettings, ctx: ExportContext) => Promise<ExportOutput>;
  settings?: ExportSettings;
  onSettingsChange?: (settings: ExportSettings) => void;
  defaultSettings?: Partial<ExportSettings>;
  /** 原始尺寸，用來顯示輸出尺寸 */
  baseSize?: { width: number; height: number };
  fpsOptions?: readonly number[];
  scaleOptions?: readonly number[];
  /** 超過這個大小時提醒（預設 5,000,000 位元組） */
  sizeWarningBytes?: number;
  /** 播放次數上限（預設 99） */
  maxPlays?: number;
  /** 循環設定下方的說明 */
  loopHint?: ReactNode;
  /** 減色開關的說明（預設：檔案通常小很多…） */
  quantizeHint?: ReactNode;
  /** 匯出按鈕上方的額外設定（例如預設圖、裁邊、檔名） */
  extra?: ReactNode;
  /** 超過大小提醒時的建議文字（預設：降低 FPS、縮小尺寸或開啟減色） */
  sizeWarningHint?: ReactNode;
  /** 從外部觸發匯出（例如快捷鍵）：ref.current.exportNow('apng') */
  ref?: Ref<ExportPanelHandle>;
  title?: string;
  className?: string;
}

export interface ExportPanelHandle {
  /** 用目前的設定匯出；給格式 id 時先切換到那個格式 */
  exportNow: (format?: string) => void;
  /** 取消進行中的匯出 */
  cancel: () => void;
  /** 是否正在匯出 */
  readonly busy: boolean;
}

export const DEFAULT_FPS_OPTIONS = [10, 12, 15, 20, 24, 30, 50, 60] as const;
export const DEFAULT_SCALE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

/** 用 core/timeline 的格式資料組出選項；WebP 在不支援編碼的瀏覽器會停用 */
export function animationFormats(
  ids: readonly AnimationExportFormat[],
  { webpSupported = true }: { webpSupported?: boolean } = {},
): ExportFormatOption[] {
  return ids.map((id) => {
    const f = EXPORT_FORMATS[id];
    const webpOff = id === 'webp' && !webpSupported;
    return {
      id,
      label: f.label,
      description: f.description,
      animated: f.animated,
      supportsLoop: f.loop,
      supportsQuantize: f.quantize,
      maxFps: f.maxFps,
      disabled: webpOff,
      disabledReason: webpOff
        ? '這個瀏覽器無法匯出 WebP（Safari 不支援），請改用 Chrome、Edge 或 Firefox。'
        : undefined,
    };
  });
}

/** 這個瀏覽器能不能匯出 WebP（第一次檢查前為 true） */
export function useWebpSupport(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let alive = true;
    supportsWebpEncoding().then((v) => {
      if (alive) setOk(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

const IMAGE_TYPES = /^image\/(png|gif|webp|jpeg|apng)/;

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; ratio: number; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; output: ExportOutput; url: string };

export function ExportPanel({
  formats,
  onExport,
  settings,
  onSettingsChange,
  defaultSettings,
  baseSize,
  fpsOptions = DEFAULT_FPS_OPTIONS,
  scaleOptions = DEFAULT_SCALE_OPTIONS,
  sizeWarningBytes = SIZE_WARNING_BYTES,
  maxPlays = 99,
  loopHint,
  quantizeHint = '檔案通常小很多；顏色很多的漸層可能出現色帶。',
  extra,
  sizeWarningHint,
  ref,
  title = '匯出',
  className,
}: ExportPanelProps) {
  const firstEnabled = formats.find((f) => !f.disabled) ?? formats[0];
  const [inner, setInner] = useState<ExportSettings>(() => ({
    format: firstEnabled?.id ?? '',
    fps: 30,
    plays: 0,
    scale: 1,
    quantize: false,
    ...defaultSettings,
  }));
  const s = settings ?? inner;
  const set = (patch: Partial<ExportSettings>) => {
    const next = { ...s, ...patch };
    if (!settings) setInner(next);
    onSettingsChange?.(next);
  };
  const fmt = formats.find((f) => f.id === s.format) ?? firstEnabled;
  const fpsList = useMemo(
    () => fpsOptions.filter((v) => !fmt?.maxFps || v <= fmt.maxFps),
    [fpsOptions, fmt],
  );
  const fps = fmt?.maxFps ? Math.min(fmt.maxFps, s.fps) : s.fps;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const titleId = useId();
  const progressLabelId = useId();

  const clearResult = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };
  /* 卸載時取消進行中的匯出、釋放物件網址 */
  useEffect(
    () => () => {
      abort.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const run = async (formatId?: string) => {
    if (abort.current) return;
    const f = (formatId ? formats.find((x) => x.id === formatId) : null) ?? fmt;
    if (!f || f.disabled) return;
    const fpsFor = f.maxFps ? Math.min(f.maxFps, s.fps) : s.fps;
    clearResult();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus({ kind: 'running', ratio: 0, label: '準備中' });
    try {
      const output = await onExport(
        { ...s, format: f.id, fps: fpsFor },
        {
          signal: ctrl.signal,
          onProgress: (ratio, label) => {
            if (!ctrl.signal.aborted)
              setStatus({
                kind: 'running',
                ratio: Math.min(1, Math.max(0, ratio)),
                label: label ?? '處理中',
              });
          },
        },
      );
      if (ctrl.signal.aborted) throw new DOMException('已取消', 'AbortError');
      const url = URL.createObjectURL(output.blob);
      urlRef.current = url;
      setStatus({ kind: 'done', output, url });
    } catch (e) {
      const aborted = (e instanceof DOMException && e.name === 'AbortError') || ctrl.signal.aborted;
      setStatus(
        aborted
          ? { kind: 'idle' }
          : { kind: 'error', message: e instanceof Error ? e.message : String(e) },
      );
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  };

  const running = status.kind === 'running';
  useImperativeHandle(ref, () => ({
    exportNow: (formatId?: string) => {
      if (formatId && formatId !== s.format && formats.some((x) => x.id === formatId))
        set({ format: formatId });
      void run(formatId);
    },
    cancel: () => abort.current?.abort(),
    get busy() {
      return !!abort.current;
    },
  }));
  const outSize = baseSize
    ? {
        width: Math.max(1, Math.round(baseSize.width * s.scale)),
        height: Math.max(1, Math.round(baseSize.height * s.scale)),
      }
    : null;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3',
        className,
      )}
    >
      <h2 id={titleId} className="m-0 text-sm font-semibold">
        {title}
      </h2>
      <Field label="格式" hint={fmt?.disabled ? fmt.disabledReason : fmt?.description}>
        {formats.length <= 5 ? (
          <Segmented
            value={fmt?.id ?? ''}
            onValueChange={(format) => set({ format })}
            options={formats.map((f) => ({ value: f.id, label: f.label, disabled: f.disabled }))}
            disabled={running}
            fullWidth
          />
        ) : (
          <Select
            value={fmt?.id ?? ''}
            onValueChange={(format) => set({ format })}
            options={formats.map((f) => ({ value: f.id, label: f.label, disabled: f.disabled }))}
            disabled={running}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {fmt?.animated ? (
          <Field label="FPS" hint={fmt.maxFps ? `${fmt.label} 最多 ${fmt.maxFps}` : undefined}>
            <Select
              value={String(fps)}
              onValueChange={(v) => set({ fps: Number(v) })}
              options={fpsList.map((v) => ({ value: String(v), label: `${v} fps` }))}
              disabled={running}
            />
          </Field>
        ) : null}
        {outSize ? (
          <Field label="尺寸">
            <Select
              value={String(s.scale)}
              onValueChange={(v) => set({ scale: Number(v) })}
              options={scaleOptions.map((k) => ({
                value: String(k),
                label: `${Math.round(k * 100)}%（${Math.max(1, Math.round(baseSize!.width * k))}×${Math.max(1, Math.round(baseSize!.height * k))}）`,
              }))}
              disabled={running}
            />
          </Field>
        ) : null}
      </div>
      {fmt?.supportsLoop ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle
            label="無限循環"
            checked={s.plays === 0}
            onCheckedChange={(on) => set({ plays: on ? 0 : 1 })}
            disabled={running}
          />
          {s.plays !== 0 ? (
            <div className="flex items-center gap-2">
              <NumberInput
                aria-label="播放次數"
                value={s.plays}
                onChange={(plays) => set({ plays })}
                min={1}
                max={maxPlays}
                unit="次"
                disabled={running}
                className="w-24"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {fmt?.supportsLoop && loopHint ? (
        <p className="m-0 -mt-1 text-xs text-muted">{loopHint}</p>
      ) : null}
      {fmt?.supportsQuantize ? (
        <Field label="減色（256 色）" layout="inline" hint={quantizeHint}>
          <Toggle
            checked={s.quantize}
            onCheckedChange={(quantize) => set({ quantize })}
            disabled={running}
          />
        </Field>
      ) : null}
      {extra}

      {running ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span id={progressLabelId}>{status.label}</span>
            <span className="tabular-nums">{Math.round(status.ratio * 100)}%</span>
          </div>
          <div
            role="progressbar"
            aria-labelledby={progressLabelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(status.ratio * 100)}
            className="h-2 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-(--duration-fast)"
              style={{ width: `${status.ratio * 100}%` }}
            />
          </div>
          <Button icon={<X />} onClick={() => abort.current?.abort()} className="self-end">
            取消
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          size="lg"
          icon={<Download />}
          onClick={() => void run()}
          disabled={!fmt || fmt.disabled}
        >
          匯出 {fmt?.label ?? ''}
        </Button>
      )}

      {status.kind === 'error' ? (
        <p role="alert" className="m-0 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          匯出失敗：{status.message}
        </p>
      ) : null}

      <div aria-live="polite" className="sr-only">
        {status.kind === 'done'
          ? `匯出完成：${status.output.fileName}，${formatBytes(status.output.blob.size)}`
          : ''}
      </div>

      {status.kind === 'done' ? (
        <div
          data-testid="export-result"
          className="flex min-w-0 gap-3 rounded-md border border-border bg-surface-2 p-2.5"
        >
          <div className="checker flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
            {IMAGE_TYPES.test(status.output.blob.type) ? (
              <img
                src={status.url}
                alt="匯出結果預覽"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <FileArchive aria-hidden className="size-8 text-muted" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all text-sm font-medium text-fg">
                {status.output.fileName}
              </span>
              <IconButton
                label="清除結果"
                icon={<X />}
                size="sm"
                onClick={() => {
                  clearResult();
                  setStatus({ kind: 'idle' });
                }}
              />
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-muted">
              <dt>大小</dt>
              <dd
                className="m-0 tabular-nums"
                data-testid="export-size"
                data-bytes={status.output.blob.size}
              >
                {formatBytes(status.output.blob.size)}
              </dd>
              <dt>尺寸</dt>
              <dd className="m-0 tabular-nums">
                {status.output.width}×{status.output.height} px
              </dd>
              {status.output.frames !== undefined && status.output.frames > 1 ? (
                <>
                  <dt>影格</dt>
                  <dd className="m-0 tabular-nums">
                    {status.output.frames} 格
                    {status.output.storedFrames !== undefined &&
                    status.output.storedFrames !== status.output.frames
                      ? `（合併後 ${status.output.storedFrames} 格）`
                      : ''}
                    {status.output.duration ? `・${status.output.duration.toFixed(2)} 秒` : ''}
                  </dd>
                </>
              ) : null}
              {status.output.details?.map((d) => (
                <div key={d.label} className="contents">
                  <dt>{d.label}</dt>
                  <dd className="m-0">{d.value}</dd>
                </div>
              ))}
            </dl>
            {status.output.blob.size > sizeWarningBytes ? (
              <p className="m-0 flex items-start gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs text-warning">
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                超過 {Math.round(sizeWarningBytes / 1_000_000)} MB，CCFOLIA 等平台可能無法上傳。
                {sizeWarningHint ?? '可以降低 FPS、縮小尺寸或開啟減色。'}
              </p>
            ) : null}
            <a
              href={status.url}
              download={status.output.fileName}
              className={buttonClass(
                'primary',
                'sm',
                'mt-1 self-start no-underline hover:text-accent-contrast',
              )}
            >
              <Download aria-hidden className="size-4" />
              下載
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
