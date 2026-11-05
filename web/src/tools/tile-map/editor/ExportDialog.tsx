/**
 * 匯出（對話框，共用的匯出區）：
 * - PNG：每格 8～512 px（預設 64）、格線（預設開）、透明背景；每邊最多 8192 px、總共最多 3,600 萬像素，
 *   超過一張畫布的上限（iOS Safari 1,677 萬像素）時分段畫再編碼。
 * - 列印用 PDF：每格的實際大小（英寸）、列印品質、A4／Letter、直式／橫式、格線、背景色；分頁最多 100 頁。
 * - 在地圖演出產生器開啟：照 PNG 的設定畫好，交給 map-fx（共用的 core/handoff；網址的 # 帶 from=tile-map）。
 */
import { Film } from 'lucide-react';
import { useMemo } from 'react';
import { beginHandoff, failHandoff, handoffHref, sendHandoff } from '@/core/handoff';
import { getTool, hrefToTool } from '@/registry';
import {
  Button,
  Dialog,
  DialogClose,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Field,
  FieldRow,
  Notice,
  NumberInput,
  Segmented,
  Select,
  Toggle,
} from '@/ui';
import { exportPng, needsBands, PNG_PX_MAX, PNG_PX_MIN, pngFits, pngSize } from '../export/png';
import { exportPrintPdf } from '../export/print';
import {
  CELL_INCHES_MAX,
  CELL_INCHES_MIN,
  inchesToCm,
  type Orientation,
  type Paper,
  PRINT_DPIS,
  PrintError,
  type PrintSettings,
  printLayout,
  printPages,
} from '../model/print';
import type { TileMap } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { fileBase } from './files';
import { mapNow, setEditor, TOOL_ID, useEditor, useMap, usePrefs } from './store';
import { imageFor, tileDef } from './tiles';

const MAP_FX_HREF = hrefToTool(getTool('map-fx') ?? { id: 'map-fx', status: 'next' });
/** map-fx 收得下的「1 格幾 px」 */
const FX_GRID_MIN = 8;
const FX_GRID_MAX = 200;

const look = (map: TileMap) => ({ defs: (id: string) => tileDef(id, map), images: imageFor });

function printInfo(
  map: TileMap,
  s: PrintSettings,
): { ok: true; text: string } | { ok: false; text: string } {
  try {
    const L = printLayout(s, map.width, map.height);
    printPages(L, map.width, map.height);
    return { ok: true, text: S.exp.pages(L.pages, L.pagesX, L.pagesY) };
  } catch (e) {
    if (e instanceof PrintError && e.code === 'pages')
      return { ok: false, text: S.exp.tooManyPages(e.pages) };
    return { ok: false, text: S.exp.cellTooBig };
  }
}

export function ExportDialog() {
  const open = useEditor((s) => s.dialog === 'export');
  const map = useMap((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  const patch = usePrefs((s) => s.patch);
  const png = prefs.png;
  const print = prefs.print;
  const size = pngSize(map, png.px);
  const pngOk = pngFits(size.width, size.height);
  const pdf = useMemo(() => printInfo(map, print), [map, print]);
  /* 地圖或設定改了：上次的結果作廢（新的物件＝換了） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依賴本身就是要比對的對象
  const resultKey = useMemo(() => ({}), [map, png, print, prefs.format]);
  const setPng = (p: Partial<typeof png>) => patch({ png: { ...png, ...p } });
  const setPrint = (p: Partial<PrintSettings>) => patch({ print: { ...print, ...p } });

  const onExport = async (
    s: ExportSettings,
    {
      signal,
      onProgress,
    }: { signal: AbortSignal; onProgress: (r: number, label?: string) => void },
  ): Promise<ExportOutput> => {
    const m = mapNow();
    const base = fileBase(m.name);
    if (s.format === 'pdf') {
      const info = printInfo(m, print);
      if (!info.ok) throw new Error(info.text);
      const bytes = await exportPrintPdf(m, print, look(m), { signal, onProgress });
      const L = printLayout(print, m.width, m.height);
      return {
        blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
        fileName: `${base}-列印.pdf`,
        width: m.width * L.pixels,
        height: m.height * L.pixels,
        details: [{ label: '頁數', value: info.text }],
      };
    }
    const sz = pngSize(m, png.px);
    if (!pngFits(sz.width, sz.height)) throw new Error(S.exp.tooBig);
    const blob = await exportPng(m, png, look(m), { signal, onProgress: (r) => onProgress(r) });
    return { blob, fileName: `${base}.png`, width: sz.width, height: sz.height };
  };

  /** 送到地圖演出產生器：新分頁在點擊的當下開（之後才畫圖、寫進 IndexedDB） */
  const sendToFx = () => {
    const id = beginHandoff('map-fx');
    const tab = window.open(`${handoffHref(MAP_FX_HREF, id)}&from=${TOOL_ID}`, '_blank');
    if (tab) tab.opener = null;
    void deliver(id, !tab);
  };
  const deliver = async (id: string, blocked: boolean) => {
    const m = mapNow();
    try {
      const sz = pngSize(m, png.px);
      if (!pngFits(sz.width, sz.height)) throw new Error('size');
      const blob = await exportPng(m, png, look(m));
      const meta: Record<string, unknown> =
        png.px >= FX_GRID_MIN && png.px <= FX_GRID_MAX ? { gridPx: png.px } : {};
      const ok = await sendHandoff({
        to: 'map-fx',
        from: TOOL_ID,
        name: m.name.trim() || S.defaultMapName,
        blob,
        meta,
        id,
      });
      if (!ok) {
        notify(S.exp.sendFxFailed, 'warning');
        return;
      }
      notify(blocked ? S.exp.sendFxBlocked : S.exp.sendFxDone, blocked ? 'warning' : 'success');
    } catch {
      await failHandoff('map-fx', id);
      notify(S.exp.failed, 'danger');
    }
  };

  const extra =
    prefs.format === 'pdf' ? (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-muted">{S.exp.pdfDesc}</p>
        <FieldRow columns={2}>
          <Field label={S.exp.cellInches} hint={S.exp.cm(inchesToCm(print.cellInches))}>
            <NumberInput
              value={print.cellInches}
              onChange={(v) => setPrint({ cellInches: v })}
              min={CELL_INCHES_MIN}
              max={CELL_INCHES_MAX}
              step={0.05}
              precision={2}
              unit={S.exp.inch}
            />
          </Field>
          <Field label={S.exp.dpi}>
            <Select
              value={String(print.dpi)}
              onValueChange={(v) => setPrint({ dpi: Number(v) as PrintSettings['dpi'] })}
              options={PRINT_DPIS.map((d) => ({ value: String(d), label: S.exp.dpis[d] }))}
            />
          </Field>
        </FieldRow>
        <FieldRow columns={2}>
          <Field label={S.exp.paper}>
            <Segmented
              value={print.paper}
              onValueChange={(v) => setPrint({ paper: v as Paper })}
              options={(['a4', 'letter'] as const).map((p) => ({
                value: p,
                label: S.exp.papers[p],
              }))}
            />
          </Field>
          <Field label={S.exp.orientation}>
            <Segmented
              value={print.orientation}
              onValueChange={(v) => setPrint({ orientation: v as Orientation })}
              options={(['portrait', 'landscape'] as const).map((p) => ({
                value: p,
                label: S.exp.orientations[p],
              }))}
            />
          </Field>
        </FieldRow>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Toggle
            label={S.exp.grid}
            checked={print.grid}
            onCheckedChange={(v) => setPrint({ grid: v })}
          />
          <Toggle
            label={S.exp.printBg}
            checked={print.background}
            onCheckedChange={(v) => setPrint({ background: v })}
          />
        </div>
        {pdf.ok ? (
          <p className="m-0 text-sm tabular-nums" data-testid="pdf-pages">
            {pdf.text}
          </p>
        ) : (
          <Notice tone="danger">{pdf.text}</Notice>
        )}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-muted">{S.exp.pngDesc}</p>
        <Field label={S.exp.px}>
          <NumberInput
            value={png.px}
            onChange={(v) => setPng({ px: v })}
            min={PNG_PX_MIN}
            max={PNG_PX_MAX}
            step={1}
            unit="px"
          />
        </Field>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Toggle
            label={S.exp.grid}
            checked={png.grid}
            onCheckedChange={(v) => setPng({ grid: v })}
          />
          <Toggle
            label={S.exp.transparent}
            checked={png.transparent}
            onCheckedChange={(v) => setPng({ transparent: v })}
          />
        </div>
        <p className="m-0 text-sm tabular-nums" data-testid="png-size">
          {S.exp.size(size.width, size.height)}
        </p>
        {!pngOk ? (
          <Notice tone="danger">{S.exp.tooBig}</Notice>
        ) : needsBands(size.width, size.height) ? (
          <p className="m-0 text-xs text-muted">{S.exp.bands}</p>
        ) : null}
      </div>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setEditor({ dialog: null })}
      title={S.exp.title}
      size="md"
      footer={<DialogClose />}
    >
      <div className="flex flex-col gap-3" data-testid="export-dialog">
        <ExportPanel
          title="格式與設定"
          formats={[
            { id: 'png', label: S.exp.formats.png },
            { id: 'pdf', label: S.exp.formats.pdf },
          ]}
          settings={{ format: prefs.format, fps: 0, plays: 0, scale: 1, quantize: false }}
          onSettingsChange={(s) => patch({ format: s.format === 'pdf' ? 'pdf' : 'png' })}
          onExport={onExport}
          extra={extra}
          resetKey={resultKey}
          sizeWarningBytes={prefs.format === 'pdf' ? Number.POSITIVE_INFINITY : 5_000_000}
          sizeWarningHint="可以把每格的 px 調小。"
        />
        <div className="flex flex-col gap-1">
          <Button
            variant="secondary"
            icon={<Film />}
            onClick={sendToFx}
            disabled={!pngOk}
            data-testid="send-fx"
          >
            {S.exp.sendFx}
          </Button>
          <p className="m-0 text-xs text-muted">{S.exp.sendFxHint}</p>
        </div>
      </div>
    </Dialog>
  );
}
