/**
 * 匯出區：格式、FPS、循環、尺寸、減色、進度與取消、結果卡（預覽、檔名、大小、尺寸、影格數、5 MB 提醒、下載）。
 *
 * G1 擴充（都是選填，不給時行為不變）：
 * - fixedFps：鎖定 FPS（影格表、FPS 是內容參數時），不顯示 FPS 選單，改顯示唯讀的值；onExport 收到這個 fps。
 * - colorOptions：色數選單（0＝無損）取代減色開關，給支援色數的格式（APNG、PNG）；settings.colors。
 * - limit：用途的容量上限，結果卡顯示「大小／上限（百分比）」（未超過綠色、超過紅色）。
 * - autoShrink：超過上限時的「自動縮小檔案」：呼叫後（工具改掉設定）以同一格式重新匯出，並顯示這次降了什麼。
 * - 多檔：onExport 回傳 { files: [...] } 時顯示多檔結果（每個檔案各自下載，或「全部下載」依序下載、「打包成 ZIP」）。
 * - 停用的格式（disabled＋disabledReason）：不論目前選哪個格式，原因都列在「格式」欄的說明裡。
 *
 * G2 擴充（選填，不給時行為不變）：
 * - estimate：匯出按鈕上方的預估列「總長 · 影格數 · 每格約幾 ms · 未壓縮資料量」（寬 × 高 × 4 × 影格數）。
 * - pixelBudget：處理量上限（寬 × 高 × 影格數）；超過時匯出按鈕停用並顯示原因（例如請縮小畫布、降低 FPS 或縮短長度）。
 *
 * 實際的匯出由工具提供（onExport），通常就是呼叫 core/timeline 的 exportAnimation：
 *
 *   <ExportPanel
 *     formats={animationFormats(['apng', 'gif', 'webp', 'png', 'zip'])}
 *     baseSize={{ width: 512, height: 512 }}
 *     onExport={(s, { signal, onProgress }) => exportAnimation(source, { ...s, signal, onProgress })}
 *   />
 */
import { Download, FileArchive, Minimize2, TriangleAlert, X } from 'lucide-react';
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
import {
  downloadSequentially,
  downloadUrl,
  fileNameWithExt,
  formatBytes,
  formatDataSize,
  formatLimitBytes,
  SIZE_WARNING_BYTES,
  usagePercent,
  zipFiles,
} from '@/core/files';
import { type AnimationExportFormat, EXPORT_FORMATS } from '@/core/timeline/export';
import { estimateExport } from '@/core/timeline/sampling';
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
  /** 支援色數選單（ExportPanel 給了 colorOptions 時才顯示；APNG、PNG） */
  supportsColors?: boolean;
  maxFps?: number;
  disabled?: boolean;
  /**
   * 停用時的原因。不論目前選的是哪個格式，每個有原因的停用格式都列在「格式」欄的說明裡
   * （原因沒提到格式名稱時，前面加「<label>：」）。
   */
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
  /** 色數（0＝無損；只有給了 colorOptions 時才會出現在設定裡） */
  colors?: number;
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

/** 多個檔案的匯出結果（例如片尾名單分段，每段一個檔案） */
export interface ExportBatchOutput {
  files: readonly ExportOutput[];
  /** 「打包成 ZIP」的檔名主體（不含副檔名；預設「匯出」） */
  zipName?: string;
  /** 結果上方的資訊列 */
  details?: readonly { label: string; value: string }[];
}

const isBatch = (o: ExportOutput | ExportBatchOutput): o is ExportBatchOutput =>
  Array.isArray((o as ExportBatchOutput).files);

export interface ExportContext {
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

export interface ExportPanelProps {
  formats: readonly ExportFormatOption[];
  onExport: (
    settings: ExportSettings,
    ctx: ExportContext,
  ) => Promise<ExportOutput | ExportBatchOutput>;
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
  /** 鎖定 FPS（內容決定的 FPS，例如影格表）：不顯示 FPS 選單 */
  fixedFps?: number | null;
  /** 鎖定 FPS 時的說明（預設「由內容設定決定」） */
  fixedFpsHint?: ReactNode;
  /** 色數選單的選項（0＝無損），例如 [0, 256, 128, 64, 32, 16]；給了就取代減色開關 */
  colorOptions?: readonly number[];
  /** 用途的容量上限：結果卡顯示「大小／上限（百分比）」 */
  limit?: { bytes: number; label?: string } | null;
  /**
   * 超過上限時的「自動縮小檔案」：工具改掉設定（降色數、格數、尺寸…）並回傳這次降了什麼；
   * 回傳 null 表示已無可再降的項目。回傳文字時以同一格式重新匯出。
   */
  autoShrink?: (() => string | null) | null;
  /** 自動縮小的說明（預設：會依序降低色數、影格數、特效數量、尺寸…） */
  autoShrinkHint?: ReactNode;
  /** 匯出完成（例如記下大小給檢查清單用） */
  onResult?: (output: ExportOutput | ExportBatchOutput) => void;
  /** 多檔「全部下載」時兩個檔案的間隔（毫秒，預設 800） */
  sequentialIntervalMs?: number;
  /** 匯出前的預估列（輸出尺寸、影格數、總長秒數） */
  estimate?: { width: number; height: number; frames: number; duration: number } | null;
  /** 處理量上限：寬 × 高 × 影格數超過 max 時不能匯出，顯示 message */
  pixelBudget?: { max: number; message?: ReactNode } | null;
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
      supportsColors: id === 'apng' || id === 'png',
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

/** 停用格式的原因（沒提到格式名稱時前面加上名稱） */
const disabledNote = (f: ExportFormatOption) =>
  f.disabledReason?.includes(f.label) ? f.disabledReason : `${f.label}：${f.disabledReason}`;

/**
 * 「格式」欄的說明：選中的格式的說明，加上所有停用格式的原因（不只選中的那個）。
 * 沒有停用格式時和以前一樣只有一段文字。
 */
function formatHint(
  formats: readonly ExportFormatOption[],
  fmt: ExportFormatOption | undefined,
): ReactNode {
  const off = formats.filter((f) => f.disabled && f.disabledReason);
  if (!off.length) return fmt?.disabled ? fmt.disabledReason : fmt?.description;
  const desc = fmt && !fmt.disabled ? fmt.description : undefined;
  return (
    <>
      {desc ? <span className="block">{desc}</span> : null}
      {off.map((f) => (
        <span key={f.id} className="block" data-disabled-format={f.id}>
          {disabledNote(f)}
        </span>
      ))}
    </>
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; ratio: number; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; output: ExportOutput; url: string }
  | { kind: 'batch'; batch: ExportBatchOutput; urls: string[] };

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
  fixedFps = null,
  fixedFpsHint = '由內容設定決定',
  colorOptions,
  limit = null,
  autoShrink = null,
  autoShrinkHint = '每按一次就降一級（依序降低色數、影格數、特效數量、尺寸）並重新匯出。',
  onResult,
  sequentialIntervalMs = 800,
  estimate = null,
  pixelBudget = null,
}: ExportPanelProps) {
  const firstEnabled = formats.find((f) => !f.disabled) ?? formats[0];
  const [inner, setInner] = useState<ExportSettings>(() => ({
    format: firstEnabled?.id ?? '',
    fps: 30,
    plays: 0,
    scale: 1,
    quantize: false,
    ...(colorOptions ? { colors: colorOptions.includes(256) ? 256 : (colorOptions[0] ?? 0) } : {}),
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
  const urlRef = useRef<string[]>([]);
  const titleId = useId();
  const progressLabelId = useId();
  /* 自動縮小：說明這次降了什麼；重新匯出要等工具的設定更新後（下一次 render）才跑 */
  const [shrinkNote, setShrinkNote] = useState<{ tone: 'info' | 'warning'; text: string } | null>(
    null,
  );
  const [rerun, setRerun] = useState<{ format: string; n: number } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const clearResult = () => {
    for (const u of urlRef.current) URL.revokeObjectURL(u);
    urlRef.current = [];
  };
  /* 卸載時取消進行中的匯出、釋放物件網址 */
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const u of urlRef.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const est = estimate ? estimateExport(estimate) : null;
  const overBudget = !!(est && pixelBudget && est.pixels > pixelBudget.max);
  const run = async (formatId?: string, keepNote = false) => {
    if (abort.current) return;
    const f = (formatId ? formats.find((x) => x.id === formatId) : null) ?? fmt;
    if (!f || f.disabled || overBudget) return;
    const fpsFor = fixedFps ?? (f.maxFps ? Math.min(f.maxFps, s.fps) : s.fps);
    clearResult();
    if (!keepNote) setShrinkNote(null);
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
      if (isBatch(output)) {
        const urls = output.files.map((o) => URL.createObjectURL(o.blob));
        urlRef.current = urls;
        setStatus({ kind: 'batch', batch: output, urls });
      } else {
        const url = URL.createObjectURL(output.blob);
        urlRef.current = [url];
        setStatus({ kind: 'done', output, url });
      }
      onResult?.(output);
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

  /* 自動縮小後：工具的設定（onExport）已經換成新的，才用同一格式重新匯出 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 rerun 改變時觸發；run 用的是這次 render 的新設定
  useEffect(() => {
    if (rerun) void run(rerun.format, true);
  }, [rerun]);

  const shrink = (formatId: string) => {
    if (!autoShrink || abort.current) return;
    const desc = autoShrink();
    if (!desc) {
      setShrinkNote({ tone: 'warning', text: '已無可再降的項目。' });
      return;
    }
    setShrinkNote({ tone: 'info', text: `已降低：${desc}` });
    setRerun((r) => ({ format: formatId, n: (r?.n ?? 0) + 1 }));
  };

  /* 多檔：全部依序下載、打包成 ZIP */
  const downloadAll = async (batch: ExportBatchOutput) => {
    setBatchBusy(true);
    try {
      await downloadSequentially(
        batch.files.map((f) => ({ name: f.fileName, blob: f.blob })),
        { intervalMs: sequentialIntervalMs },
      );
    } finally {
      setBatchBusy(false);
    }
  };
  const downloadZip = async (batch: ExportBatchOutput) => {
    setBatchBusy(true);
    try {
      const entries = await Promise.all(
        batch.files.map(async (f) => ({
          name: f.fileName,
          data: new Uint8Array(await f.blob.arrayBuffer()),
        })),
      );
      const zip = zipFiles(entries, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      downloadUrl(url, fileNameWithExt(batch.zipName ?? '匯出', 'zip', { fallback: 'export' }));
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBatchBusy(false);
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
      <Field label="格式" hint={formatHint(formats, fmt)}>
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
        {fmt?.animated && fixedFps != null ? (
          <Field label="FPS" hint={fixedFpsHint}>
            <output
              className="flex h-9 items-center text-sm text-fg tabular-nums"
              data-testid="export-fixed-fps"
            >
              {fixedFps} fps
            </output>
          </Field>
        ) : fmt?.animated ? (
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
      {colorOptions && fmt?.supportsColors ? (
        <Field label="色數" hint={quantizeHint}>
          <Select
            value={String(s.colors ?? 0)}
            onValueChange={(v) => set({ colors: Number(v) })}
            options={colorOptions.map((c) => ({
              value: String(c),
              label: c === 0 ? '無損（全彩）' : `${c} 色`,
            }))}
            disabled={running}
          />
        </Field>
      ) : !colorOptions && fmt?.supportsQuantize ? (
        <Field label="減色（256 色）" layout="inline" hint={quantizeHint}>
          <Toggle
            checked={s.quantize}
            onCheckedChange={(quantize) => set({ quantize })}
            disabled={running}
          />
        </Field>
      ) : null}
      {extra}

      {est ? (
        <p className="m-0 text-xs tabular-nums text-muted" data-testid="export-estimate">
          {est.duration.toFixed(2)} 秒 · {est.frames} 格 · 每格約 {est.msPerFrame.toFixed(1)} ms ·
          未壓縮 {formatDataSize(est.rawBytes)}
        </p>
      ) : null}
      {overBudget ? (
        <p
          role="alert"
          className="m-0 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          data-testid="export-over-budget"
        >
          {pixelBudget?.message ?? '處理量太大，請縮小尺寸、降低 FPS 或縮短長度。'}
        </p>
      ) : null}

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
          disabled={!fmt || fmt.disabled || overBudget}
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
          : status.kind === 'batch'
            ? `匯出完成：共 ${status.batch.files.length} 個檔案`
            : ''}
      </div>

      {shrinkNote && !running ? (
        <p
          role="status"
          data-testid="export-shrink-note"
          className={cn(
            'm-0 rounded-md px-3 py-1.5 text-sm',
            shrinkNote.tone === 'warning'
              ? 'bg-warning-soft text-warning'
              : 'bg-accent-soft text-fg',
          )}
        >
          {shrinkNote.text}
        </p>
      ) : null}

      {status.kind === 'done' ? (
        <ResultCard
          output={status.output}
          url={status.url}
          limit={limit}
          sizeWarningBytes={sizeWarningBytes}
          sizeWarningHint={sizeWarningHint}
          onClear={() => {
            clearResult();
            setStatus({ kind: 'idle' });
            setShrinkNote(null);
          }}
          footer={
            autoShrink && limit && status.output.blob.size > limit.bytes ? (
              <div className="mt-1 flex flex-col gap-1">
                <Button
                  size="sm"
                  icon={<Minimize2 />}
                  className="self-start"
                  onClick={() => shrink(s.format)}
                >
                  自動縮小檔案
                </Button>
                <p className="m-0 text-xs text-muted">{autoShrinkHint}</p>
              </div>
            ) : null
          }
        />
      ) : null}

      {status.kind === 'batch' ? (
        <div data-testid="export-batch" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-sm font-medium text-fg">
              共 {status.batch.files.length} 個檔案
            </span>
            <Button
              size="sm"
              variant="primary"
              icon={<Download />}
              loading={batchBusy}
              disabled={batchBusy}
              onClick={() => void downloadAll(status.batch)}
            >
              全部下載
            </Button>
            <Button
              size="sm"
              icon={<FileArchive />}
              disabled={batchBusy}
              onClick={() => void downloadZip(status.batch)}
            >
              打包成 ZIP
            </Button>
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
          {status.batch.details?.length ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-muted">
              {status.batch.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt>{d.label}</dt>
                  <dd className="m-0">{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {status.batch.files.map((f, i) => (
              <li key={status.urls[i]}>
                <ResultCard
                  output={f}
                  url={status.urls[i]}
                  limit={limit}
                  sizeWarningBytes={sizeWarningBytes}
                  sizeWarningHint={sizeWarningHint}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** 一個檔案的結果卡：預覽、檔名、大小（與用途上限）、尺寸、影格、資訊列、大小提醒、下載 */
function ResultCard({
  output,
  url,
  limit,
  sizeWarningBytes,
  sizeWarningHint,
  onClear,
  footer,
}: {
  output: ExportOutput;
  url: string;
  limit: { bytes: number; label?: string } | null;
  sizeWarningBytes: number;
  sizeWarningHint?: ReactNode;
  onClear?: () => void;
  footer?: ReactNode;
}) {
  const size = output.blob.size;
  const over = !!limit && size > limit.bytes;
  return (
    <div
      data-testid="export-result"
      className="flex min-w-0 gap-3 rounded-md border border-border bg-surface-2 p-2.5"
    >
      <div className="checker flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
        {IMAGE_TYPES.test(output.blob.type) ? (
          <img src={url} alt="匯出結果預覽" className="max-h-full max-w-full object-contain" />
        ) : (
          <FileArchive aria-hidden className="size-8 text-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 break-all text-sm font-medium text-fg">
            {output.fileName}
          </span>
          {onClear ? (
            <IconButton label="清除結果" icon={<X />} size="sm" onClick={onClear} />
          ) : null}
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-muted">
          <dt>大小</dt>
          <dd className="m-0 tabular-nums" data-testid="export-size" data-bytes={size}>
            {formatBytes(size)}
          </dd>
          {limit ? (
            <>
              <dt>{limit.label ?? '用途上限'}</dt>
              <dd
                className={cn(
                  'm-0 tabular-nums font-medium',
                  over ? 'text-danger' : 'text-success',
                )}
                data-testid="export-limit"
                data-over={over ? '' : undefined}
              >
                {formatLimitBytes(size)}／{formatLimitBytes(limit.bytes)}（
                {usagePercent(size, limit.bytes)}%）{over ? '・超過上限' : ''}
              </dd>
            </>
          ) : null}
          <dt>尺寸</dt>
          <dd className="m-0 tabular-nums">
            {output.width}×{output.height} px
          </dd>
          {output.frames !== undefined && output.frames > 1 ? (
            <>
              <dt>影格</dt>
              <dd className="m-0 tabular-nums">
                {output.frames} 格
                {output.storedFrames !== undefined && output.storedFrames !== output.frames
                  ? `（合併後 ${output.storedFrames} 格）`
                  : ''}
                {output.duration ? `・${output.duration.toFixed(2)} 秒` : ''}
              </dd>
            </>
          ) : null}
          {output.details?.map((d) => (
            <div key={d.label} className="contents">
              <dt>{d.label}</dt>
              <dd className="m-0">{d.value}</dd>
            </div>
          ))}
        </dl>
        {size > sizeWarningBytes ? (
          <p className="m-0 flex items-start gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            超過 {Math.round(sizeWarningBytes / 1_000_000)} MB，CCFOLIA 等平台可能無法上傳。
            {sizeWarningHint ?? '可以降低 FPS、縮小尺寸或開啟減色。'}
          </p>
        ) : null}
        <a
          href={url}
          download={output.fileName}
          className={buttonClass(
            'primary',
            'sm',
            'mt-1 self-start no-underline hover:text-accent-contrast',
          )}
        >
          <Download aria-hidden className="size-4" />
          下載
        </a>
        {footer}
      </div>
    </div>
  );
}
