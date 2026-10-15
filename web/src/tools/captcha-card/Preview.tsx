/**
 * 預覽欄（規格 F10～F20、F38～F44）：Stage 裡的卡片（與 PNG 同一段繪圖程式）＋操作層 → 格子的操作列
 * （統計、放入圖片、排列模式、全選、打亂、清空）→ 說明 → 匯出區（GIF／APNG／WebP／PNG）。
 * 也負責整個視窗的拖放（放在哪一格就從那一格開始放）與 Ctrl＋V 貼上（滑鼠指著的格子）。
 */
import { ArrowLeftRight, Check, ImagePlus, ListChecks, Shuffle, Trash2 } from 'lucide-react';
import { type Ref, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { loadAssetBitmaps } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { type AnimationExportFormat, exportAnimation } from '@/core/timeline';
import {
  Button,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  isEditableTarget,
  Notice,
  Stage,
  useConfirm,
  useToast,
  useWebpSupport,
  WindowDrop,
} from '@/ui';
import { captchaTimeline, createCaptchaSource } from './animation';
import { GridOverlay, PREVIEW_SCALE, useNotify } from './GridOverlay';
import { cellAt } from './layout';
import { placeFiles } from './media';
import { type CaptchaState, exportBaseName, gridCounts, stateAssetIds } from './model';
import { drawCard, loadCardFonts, renderPng, resolverFrom } from './render';
import {
  ANIM_SCALES,
  assets,
  clearCells,
  docNow,
  EXPORT_FORMATS,
  type ExportFormat,
  PNG_SCALES,
  prefsNow,
  selectAll,
  setArrange,
  setPrefs,
  shuffleCells,
  type Target,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';
import { useCardImages, useCardLayout } from './useCard';

/** 匯出（規格 3.2～3.4）：PNG＝靜態的卡片；其他＝點選的動畫（影格表） */
export async function runExport(
  d: CaptchaState,
  format: ExportFormat,
  { plays, scale }: { plays: number; scale: number },
  signal: AbortSignal,
  onProgress: (ratio: number, label?: string) => void,
): Promise<ExportOutput> {
  const base = exportBaseName(d.keyword);
  const resolve = resolverFrom(await loadAssetBitmaps(assets, stateAssetIds(d)));
  if (format === 'png') {
    const r = await renderPng(d, resolve, scale);
    return { blob: r.blob, fileName: `${base}.png`, width: r.width, height: r.height };
  }
  await loadCardFonts(d);
  const source = createCaptchaSource(d, resolve, scale);
  const r = await exportAnimation(source, {
    format: format as AnimationExportFormat,
    plays,
    scale,
    fileName: base,
    signal,
    onProgress,
  });
  return {
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
  };
}

export function Preview({ exportRef }: { exportRef: Ref<ExportPanelHandle> }) {
  const d = useDoc((s) => s.data);
  const { layout: L, tick } = useCardLayout(d);
  const { resolve, missing } = useCardImages(d);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = Math.round(L.width * PREVIEW_SCALE);
  const height = Math.round(L.height * PREVIEW_SCALE);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 在字型載好後重畫
  useLayoutEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c.width / L.width, 0, 0, c.height / L.height, 0, 0);
    drawCard(ctx, d, L, resolve);
  }, [d, L, resolve, tick, width, height]);

  /* 拖放與貼上：畫面座標 → 預覽上的目標 */
  const targetAt = (clientX: number, clientY: number): Target | null => {
    const c = canvas.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = ((clientX - r.left) / r.width) * L.width;
    const y = ((clientY - r.top) / r.height) * L.height;
    const a = L.avatar;
    if (x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height) return { kind: 'avatar' };
    const i = cellAt(L, x, y);
    return i >= 0 ? { kind: 'cell', index: i } : null;
  };

  const notify = useNotify();
  const live = useRef(notify);
  live.current = notify;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      /* 在文字欄裡貼上文字時照常貼上 */
      if (isEditableTarget(e.target) && dt.types.includes('text/plain')) return;
      e.preventDefault();
      void placeFiles(files, useUi.getState().hover).then((n) => live.current(n));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage
        width={width}
        height={height}
        backgrounds={[]}
        aria-label={S.previewLabel}
        className="shrink-0"
      >
        <canvas
          ref={canvas}
          width={width}
          height={height}
          className="block size-full"
          data-testid="card-canvas"
          data-size={`${width}x${height}`}
        />
        <GridOverlay d={d} layout={L} source={canvas} />
      </Stage>
      <GridToolbar d={d} />
      {missing.length ? <Notice tone="warning">{S.imagesMissing}</Notice> : null}
      <p className="m-0 px-1 text-xs text-muted" data-testid="preview-hint">
        {S.previewHint}
      </p>
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files, at) =>
          void placeFiles(files, targetAt(at.clientX, at.clientY)).then(notify)
        }
      />
      <div data-testid="export-anchor" className="flex min-w-0 flex-col">
        <ExportArea d={d} exportRef={exportRef} height={L.height} />
      </div>
    </div>
  );
}

/** 格子的操作列（原作在卡片下方的一排文字按鈕） */
function GridToolbar({ d }: { d: CaptchaState }) {
  const arrange = useUi((s) => s.arrange);
  const toast = useToast();
  const confirm = useConfirm();
  const notify = useNotify();
  const counts = gridCounts(d);
  const need = () => toast({ title: S.needImages, tone: 'warning', replace: true });
  return (
    <div className="flex flex-col gap-2" data-testid="grid-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm tabular-nums text-muted" data-testid="grid-count">
          {S.count(counts.selected, counts.filled, counts.total)}
        </span>
        <Button
          size="sm"
          icon={<ImagePlus />}
          onClick={async () => {
            const files = await pickFiles({ accept: 'image/*', multiple: true });
            if (files.length) notify(await placeFiles(files, null));
          }}
        >
          {S.fill}
        </Button>
        <Button
          size="sm"
          icon={arrange ? <Check /> : <ArrowLeftRight />}
          variant={arrange ? 'primary' : 'secondary'}
          aria-pressed={arrange}
          onClick={() => setArrange(!arrange)}
        >
          {arrange ? S.arrangeDone : S.arrange}
        </Button>
        <Button size="sm" icon={<ListChecks />} onClick={() => (selectAll() ? null : need())}>
          {S.selectAll}
        </Button>
        <Button size="sm" icon={<Shuffle />} onClick={() => (shuffleCells() ? null : need())}>
          {S.shuffle}
        </Button>
        <Button
          size="sm"
          icon={<Trash2 />}
          disabled={!d.cells.some((c) => c.image)}
          onClick={async () => {
            if (
              await confirm({
                title: S.clearTitle,
                description: S.clearDesc,
                confirmLabel: S.clearConfirm,
                danger: true,
              })
            )
              clearCells();
          }}
        >
          {S.clear}
        </Button>
      </div>
      {arrange ? (
        <p className="m-0 text-xs text-accent" role="status" data-testid="arrange-hint">
          {S.arrangeOn}
        </p>
      ) : null}
    </div>
  );
}

function ExportArea({
  d,
  exportRef,
  height,
}: {
  d: CaptchaState;
  exportRef: Ref<ExportPanelHandle>;
  height: number;
}) {
  const prefs = usePrefs((p) => p.data);
  const webpSupported = useWebpSupport();
  const filled = gridCounts(d).filled > 0;
  const formats = useMemo<ExportFormatOption[]>(
    () =>
      EXPORT_FORMATS.map((id) => {
        const animated = id !== 'png';
        const disabled = (animated && !filled) || (id === 'webp' && !webpSupported);
        return {
          id,
          label: S.formats[id],
          description: S.formatDesc[id],
          supportsLoop: animated,
          disabled,
          disabledReason: disabled
            ? id === 'webp' && !webpSupported
              ? '這個瀏覽器無法編碼 WebP。'
              : S.noAnimation
            : undefined,
        };
      }),
    [filled, webpSupported],
  );
  const format = prefs.format;
  const isPng = format === 'png';
  const scale = isPng ? prefs.pngScale : prefs.animScale;
  /* 匯出按鈕上方的預估（影格數、總長）：只算影格表，不畫底圖 */
  const plan = useMemo(() => {
    if (isPng || !filled) return null;
    const ms = captchaTimeline(d).frames.map((f) => f.ms);
    return { frames: ms.length, duration: ms.reduce((a, b) => a + b, 0) / 1000 };
  }, [d, isPng, filled]);
  const resetKey = useMemo(
    () => ({ d, format, plays: prefs.plays, scale }),
    [d, format, prefs.plays, scale],
  );
  return (
    <ExportPanel
      ref={exportRef}
      title={S.exportTitle}
      formats={formats}
      baseSize={{ width: 380, height }}
      scaleOptions={isPng ? PNG_SCALES : ANIM_SCALES}
      settings={{ format, fps: 30, plays: prefs.plays, scale, quantize: false }}
      onSettingsChange={(next) => {
        const p = prefsNow();
        const patch: Partial<typeof p> = {};
        if (next.format !== p.format) patch.format = next.format as ExportFormat;
        if (next.plays !== p.plays) patch.plays = Math.max(0, next.plays);
        if (next.format === p.format && next.scale !== scale) {
          if (isPng) patch.pngScale = next.scale;
          else patch.animScale = next.scale;
        }
        if (Object.keys(patch).length) setPrefs(patch);
      }}
      loopHint={S.loopHint}
      estimate={
        plan
          ? {
              width: Math.round(380 * scale),
              height: Math.round(height * scale),
              frames: plan.frames,
              duration: plan.duration,
            }
          : null
      }
      resetKey={resetKey}
      onExport={(s, { signal, onProgress }) => {
        const p = prefsNow();
        const fmt = s.format as ExportFormat;
        return runExport(
          docNow(),
          fmt,
          { plays: s.plays, scale: fmt === 'png' ? p.pngScale : p.animScale },
          signal,
          onProgress,
        );
      }}
    />
  );
}
