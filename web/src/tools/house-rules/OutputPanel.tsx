/**
 * 輸出（規格 F35～F48）：圖片（PNG）／純文字／Markdown。改了表之後約 0.2 秒更新預覽。
 * PNG：配色、版面、包含注記、包含圖例；下載 PNG（2 倍）、複製圖片。文字：複製、下載 .txt／.md。
 */
import { Copy, Download, Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { copyImage, downloadBlob, downloadText } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  Field,
  Segmented,
  TextOutputPanel,
  useToast,
} from '@/ui';
import { buildModel, fileBase, hasRows, type TableModel } from './model';
import {
  canvasMeasure,
  effectiveScale,
  layoutPng,
  loadPngFonts,
  measureContext,
  PNG_SCALE,
  PNG_WIDTH,
  type PngLayoutKind,
  type PngOptions,
  type PngTheme,
  paintPng,
  renderPng,
} from './render';
import { effectiveLayout, type OutputFormat, useRules, useView } from './store';
import { S } from './strings';
import { toMarkdown, toText } from './text';

/** 預覽 canvas 的畫素上限（太長的表降低預覽的解析度） */
const PREVIEW_PIXELS = 6_000_000;

/** 把表畫進畫面上的 canvas（解析度依 maxPixels 降低）；回傳下載時的尺寸 */
function drawPreview(
  canvas: HTMLCanvasElement,
  model: TableModel,
  opts: PngOptions,
  maxPixels: number,
): { w: number; h: number } {
  const layout = layoutPng(model, opts, canvasMeasure(measureContext()));
  const exportScale = effectiveScale(layout, PNG_SCALE);
  const scale = Math.min(exportScale, Math.sqrt(maxPixels / (layout.width * layout.height)));
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (ctx) paintPng(ctx, layout, opts.theme, scale);
  return { w: Math.round(layout.width * exportScale), h: Math.round(layout.height * exportScale) };
}

/** 放大檢視（對話框裡用較高的解析度再畫一次） */
function ZoomCanvas({ model, opts }: { model: TableModel; opts: PngOptions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, model, opts, PREVIEW_PIXELS * 3);
  }, [model, opts]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={S.output.previewAria}
      className="mx-auto block h-auto w-full"
      style={{ maxWidth: PNG_WIDTH[opts.layout] }}
    />
  );
}

function PngPreview({ model, opts }: { model: TableModel; opts: PngOptions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (!canvasRef.current || cancelled) return;
      setSize(drawPreview(canvasRef.current, model, opts, PREVIEW_PIXELS));
    };
    const timer = setTimeout(() => {
      draw();
      /* 字型載入後再畫一次（量字寬會變） */
      void loadPngFonts(model).then(draw);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [model, opts]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-h-[min(70dvh,900px)] overflow-auto rounded-md border border-border bg-surface-2 p-2 lg:max-h-none">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={S.output.previewAria}
          data-testid="png-preview"
          data-export-width={size?.w}
          data-export-height={size?.h}
          className="mx-auto block h-auto w-full"
          style={{ maxWidth: opts.layout === 'narrow' ? 420 : undefined }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted tabular-nums" data-testid="png-size">
          {size ? S.output.size(size.w, size.h) : S.output.rendering}
        </p>
        <Button size="sm" variant="ghost" icon={<Maximize2 />} onClick={() => setZoom(true)}>
          {S.output.zoom}
        </Button>
      </div>
      <Dialog
        open={zoom}
        onOpenChange={setZoom}
        title={S.output.zoomTitle}
        size="xl"
        footer={<DialogClose />}
      >
        {zoom ? <ZoomCanvas model={model} opts={opts} /> : null}
      </Dialog>
    </div>
  );
}

export function OutputPanel() {
  const data = useRules((s) => s.data);
  const view = useView((v) => v.data);
  const patch = useView((v) => v.patch);
  const toast = useToast();
  const model = useMemo(() => buildModel(data), [data]);
  const layout: PngLayoutKind = effectiveLayout(view.layout);
  const opts = useMemo<PngOptions>(
    () => ({ theme: view.theme, layout, notes: view.notes, legend: view.legend }),
    [view.theme, layout, view.notes, view.legend],
  );
  const textOpts = { notes: view.notes, legend: view.legend };
  const empty = !hasRows(model);
  const fmt = view.format;
  const text = empty
    ? ''
    : fmt === 'md'
      ? toMarkdown(model, textOpts)
      : fmt === 'txt'
        ? toText(model, textOpts)
        : '';

  const savePng = async () => {
    await loadPngFonts(model);
    const { canvas } = renderPng(model, opts);
    const name = `${fileBase(useRules.getState().data)}.png`;
    downloadBlob(await canvasToBlob(canvas), name);
    toast({ title: S.toast.downloaded, description: name, tone: 'success' });
  };
  const copyPng = async () => {
    /* Safari 要在點擊當下呼叫剪貼簿：把產生中的 Promise 交出去 */
    const blob = loadPngFonts(model).then(() => canvasToBlob(renderPng(model, opts).canvas));
    const r = await copyImage(blob);
    toast(
      r.ok
        ? { title: S.toast.copiedImage, tone: 'success' }
        : { title: S.toast.copyImageFailed, description: S.toast.copyImageHint, tone: 'warning' },
    );
  };
  const saveText = () => {
    const ext = fmt === 'md' ? 'md' : 'txt';
    const name = `${fileBase(useRules.getState().data)}.${ext}`;
    downloadText(text, name, fmt === 'md' ? 'text/markdown;charset=utf-8' : undefined);
    toast({ title: S.toast.downloaded, description: name, tone: 'success' });
  };

  return (
    <section
      id="hr-output"
      aria-labelledby="hr-output-title"
      data-testid="hr-output"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <h2 id="hr-output-title" className="m-0 text-base font-bold text-fg">
        {S.output.title}
      </h2>
      <Segmented<OutputFormat>
        aria-label={S.output.formatAria}
        value={fmt}
        onValueChange={(v) => patch({ format: v })}
        options={(['png', 'txt', 'md'] as const).map((f) => ({
          value: f,
          label: S.output.formats[f],
        }))}
        fullWidth
        size="sm"
      />
      {fmt === 'png' ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={S.output.theme}>
            <Segmented<PngTheme>
              value={view.theme}
              onValueChange={(v) => patch({ theme: v })}
              options={(['dark', 'light'] as const).map((t) => ({
                value: t,
                label: S.output.themes[t],
              }))}
              size="sm"
            />
          </Field>
          <Field label={S.output.layout}>
            <Segmented<PngLayoutKind>
              value={layout}
              onValueChange={(v) => patch({ layout: v })}
              options={(['wide', 'narrow'] as const).map((t) => ({
                value: t,
                label: S.output.layouts[t],
              }))}
              size="sm"
            />
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Checkbox
          checked={view.notes}
          onCheckedChange={(v) => patch({ notes: v })}
          label={S.output.notes}
        />
        <Checkbox
          checked={view.legend}
          onCheckedChange={(v) => patch({ legend: v })}
          label={S.output.legend}
        />
      </div>
      <p className="m-0 text-xs text-muted">{S.output.hints[fmt]}</p>
      {empty ? (
        <p
          role="status"
          className="m-0 rounded-md border border-dashed border-border-strong px-3 py-8 text-center text-sm font-medium text-muted"
        >
          {S.output.empty}
        </p>
      ) : fmt === 'png' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Download />} onClick={() => void savePng()}>
              {S.output.savePng}
            </Button>
            <Button icon={<Copy />} onClick={() => void copyPng()}>
              {S.output.copyImage}
            </Button>
          </div>
          <PngPreview model={model} opts={opts} />
        </>
      ) : (
        <TextOutputPanel
          text={text}
          title={S.output.textTitle[fmt]}
          count={(t) => S.output.lines(t ? t.replace(/\n$/, '').split('\n').length : 0)}
          copyLabel={S.output.copyText}
          messages={{
            copied: S.toast.copied,
            failed: S.toast.copyFailed,
            failedHint: S.toast.copyFailedHint,
            empty: S.toast.copyEmpty,
          }}
          actions={
            <Button size="sm" icon={<Download />} onClick={saveText}>
              {S.output.download(fmt === 'md' ? 'md' : 'txt')}
            </Button>
          }
        />
      )}
    </section>
  );
}
