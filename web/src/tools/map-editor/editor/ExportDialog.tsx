/**
 * 匯出圖片的對話框（F181～F183、3.3）：格式、背景、網格、每格解析度、尺寸、預覽、下載、其他工具的連結。
 */
import { ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadBlob, downloadText } from '@/core/files';
import { exceedsCanvasLimit } from '@/core/grid';
import { canvasToBlob } from '@/core/image';
import { getTool, hrefToTool } from '@/registry';
import { Button, Dialog, Field, Notice, NumberInput, Segmented, Toggle, useToast } from '@/ui';
import { renderRegion, renderSvg } from '../engine/export';
import { exportFileName } from '../geometry';
import { CELL_SIZE } from '../model';
import { getEngine } from '../runtime';
import { setEditor, useEditor, useMapPrefs, usePrefs } from '../stores';
import { S } from '../strings';

/** 每格解析度：同一頁改過之後記住（F181） */
let rememberedCellPx: number | null = null;

export function ExportDialog() {
  const mode = useEditor((s) => s.exportMode);
  const rect = useEditor((s) => s.exportRect);
  const gridType = useEditor((s) => s.gridType);
  const format = usePrefs((s) => s.data.exportFormat);
  const bgPref = usePrefs((s) => s.data.exportBg);
  const gridPref = usePrefs((s) => s.data.exportGrid);
  const gridVisible = useMapPrefs((s) => s.gridVisible);
  const [cellPx, setCellPx] = useState(rememberedCellPx ?? CELL_SIZE);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const open = mode === 'dialog' && !!rect;
  const bg = format === 'jpeg' ? 'white' : bgPref;
  const withGrid = format !== 'svg' && gridPref && gridVisible;

  useEffect(() => {
    if (open) setCellPx(rememberedCellPx ?? CELL_SIZE);
  }, [open]);

  useEffect(() => {
    const eng = getEngine();
    if (!open || !rect || !eng) {
      setPreview(null);
      return;
    }
    if (exceedsCanvasLimit(Math.round(rect.w), Math.round(rect.h))) {
      setPreview(null);
      return;
    }
    const el = renderRegion(eng.canvas, rect, {
      scale: 1,
      background: bg,
      grid: withGrid,
      setExporting: (v) => eng.setExporting(v),
    });
    setPreview(el.toDataURL('image/png'));
  }, [open, rect, bg, withGrid]);

  const scale = cellPx / CELL_SIZE;
  const outW = rect ? Math.round(rect.w * scale) : 0;
  const outH = rect ? Math.round(rect.h * scale) : 0;
  const tooLarge = exceedsCanvasLimit(outW, outH);
  const isHex = gridType.startsWith('hex');
  const kind = S.exportDialog.kinds[isHex ? 'hex' : 'square'];
  const links = useMemo(() => {
    const g = getTool('grid-maker');
    const r = getTool('range-ruler');
    return { grid: g ? hrefToTool(g) : null, ruler: r ? hrefToTool(r) : null };
  }, []);

  const close = () => setEditor({ exportMode: 'off', exportRect: null });

  const download = async () => {
    const eng = getEngine();
    if (!eng || !rect || tooLarge) return;
    setBusy(true);
    try {
      if (format === 'svg') {
        const svg = renderSvg(eng.canvas, rect, scale, bg);
        downloadText(svg, exportFileName(rect, gridType, CELL_SIZE, 'svg'), 'image/svg+xml');
      } else {
        const el = renderRegion(eng.canvas, rect, {
          scale,
          background: bg,
          grid: withGrid,
          setExporting: (v) => eng.setExporting(v),
        });
        const blob = await canvasToBlob(
          el,
          format === 'jpeg' ? 'image/jpeg' : 'image/png',
          format === 'jpeg' ? 0.92 : undefined,
        );
        downloadBlob(
          blob,
          exportFileName(rect, gridType, CELL_SIZE, format === 'jpeg' ? 'jpg' : 'png'),
        );
      }
      close();
    } catch {
      toast({ title: S.exportDialog.failed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const fmt1 = (v: number) => (v / CELL_SIZE).toFixed(1);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={S.exportDialog.title}
      size="lg"
      footer={
        <>
          <Button
            onClick={() => {
              setEditor({ exportMode: 'pick', exportRect: null });
              getEngine()?.canvas.requestRenderAll();
            }}
          >
            {S.exportDialog.reselect}
          </Button>
          <Button
            variant="primary"
            onClick={() => void download()}
            loading={busy}
            disabled={tooLarge}
            data-testid="export-download"
          >
            {S.exportDialog.download}
          </Button>
        </>
      }
    >
      {rect ? (
        <div className="flex flex-col gap-3" data-testid="export-dialog">
          <p className="text-sm text-muted" data-testid="export-info">
            {S.exportDialog.info(
              fmt1(rect.w),
              fmt1(rect.h),
              Math.round(rect.w),
              Math.round(rect.h),
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={S.exportDialog.format}>
              <Segmented
                value={format}
                onValueChange={(v) => usePrefs.getState().patch({ exportFormat: v })}
                options={(['png', 'jpeg', 'svg'] as const).map((v) => ({
                  value: v,
                  label: S.exportDialog.formats[v],
                }))}
                fullWidth
              />
            </Field>
            <Field
              label={S.exportDialog.bg}
              hint={format === 'jpeg' ? S.exportDialog.jpegNoAlpha : undefined}
            >
              <Segmented
                value={bg}
                onValueChange={(v) => usePrefs.getState().patch({ exportBg: v })}
                options={(['transparent', 'white'] as const).map((v) => ({
                  value: v,
                  label: S.exportDialog.bgs[v],
                  disabled: format === 'jpeg' && v === 'transparent',
                }))}
                fullWidth
              />
            </Field>
            <Field
              label={S.exportDialog.grid}
              layout="inline"
              hint={
                format === 'svg'
                  ? S.exportDialog.svgGridNote
                  : !gridVisible
                    ? S.exportDialog.gridOffNote
                    : undefined
              }
            >
              <Toggle
                checked={gridPref}
                disabled={format === 'svg' || !gridVisible}
                onCheckedChange={(v) => usePrefs.getState().patch({ exportGrid: v })}
              />
            </Field>
            <Field label={S.exportDialog.cellRes}>
              <NumberInput
                value={cellPx}
                min={10}
                max={500}
                step={10}
                unit={S.exportDialog.pxPerCell}
                onChange={(v) => {
                  setCellPx(v);
                  rememberedCellPx = v;
                }}
              />
            </Field>
          </div>
          <p className="text-sm font-medium" data-testid="export-size">
            {S.exportDialog.size(outW, outH)}
          </p>
          {tooLarge ? <Notice tone="danger">{S.exportDialog.tooLarge}</Notice> : null}
          {preview ? (
            <figure className="m-0 flex flex-col gap-1">
              <figcaption className="text-xs text-muted">{S.exportDialog.preview}</figcaption>
              <div className="checker flex max-h-[40dvh] justify-center overflow-auto rounded-md border border-border">
                <img
                  src={preview}
                  alt={S.exportDialog.preview}
                  className="max-w-none"
                  data-testid="export-preview"
                />
              </div>
            </figure>
          ) : null}
          <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
            <span className="text-muted">{S.exportDialog.tools}</span>
            <div className="flex flex-wrap gap-2">
              {links.grid ? (
                <a
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                  href={links.grid}
                  target="_blank"
                  rel="noopener"
                >
                  {S.exportDialog.gridTool(kind)}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              ) : null}
              {links.ruler ? (
                <a
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                  href={links.ruler}
                  target="_blank"
                  rel="noopener"
                >
                  {S.exportDialog.rulerTool(kind)}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
