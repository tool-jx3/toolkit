/**
 * 匯出圖片（PNG）：範圍（這一層／所有樓層排成一張／每層各一張）、對象（PL／GM）、隱藏線索、樣式、每格大小、
 * 格線、透明背景；預覽與輸出尺寸；下載或複製到剪貼簿。
 * 2026-10-29（參考 KIIN マップ制作スタジオ）：用途「VTT 用」（每格 50／70／100 px、整數格、格數可以複製、上限），
 * 「在地圖演出產生器開啟」（共用的 core/handoff 交給 map-fx）。
 */
import { Copy, Film } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { copyImage, copyText, downloadBlob, downloadSequentially } from '@/core/files';
import { beginHandoff, failHandoff, handoffHref, sendHandoff } from '@/core/handoff';
import { canvasToBlob } from '@/core/image';
import { getTool, hrefToTool } from '@/registry';
import { Button, Dialog, Field, IconButton, Notice, Segmented, Select, Toggle } from '@/ui';
import { exportLayout, hasExportContent, renderImage } from '../draw/export';
import { getTheme } from '../draw/themes';
import {
  CELL_M,
  DEFAULT_CELL,
  EXPORT_PX,
  type ExportPx,
  THEME_IDS,
  VTT_PX,
  type VttPx,
} from '../model/catalog';
import {
  exportFloors,
  exportJobs,
  exportOptions,
  isVtt,
  tokenGridPx,
  vttCell,
  vttCells,
  vttPxOf,
  vttTooLarge,
} from '../model/exportPlan';
import { floorHasClues } from '../model/geometry';
import type { ThemeId } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { type Prefs, setEditor, useEditor, usePrefs, useProject } from './store';
import { TokenGridSelect } from './TokenGridSelect';

const setExp = (patch: Partial<Prefs['exp']>) =>
  usePrefs.getState().update((d) => {
    Object.assign(d.exp, patch);
  });

/** 這一頁選過的匯出樣式（關掉對話框再開還在；重新整理後回到地圖的樣式） */
let sessionTheme: ThemeId | null = null;

/** 地圖演出產生器的網址（還沒上線時在 next/；F267） */
const MAP_FX_HREF = hrefToTool(getTool('map-fx') ?? { id: 'map-fx', status: 'next' });
/** 地圖演出產生器的「1 格幾 px」的範圍（房間遮罩 ZIP；map-fx 規格 F64） */
const FX_GRID_MIN = 8;
const FX_GRID_MAX = 200;

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const project = useProject((s) => s.data);
  const exp = usePrefs((s) => s.data.exp);
  const [theme, setTheme] = useState<ThemeId>(project.theme);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* 打開時：樣式＝地圖的樣式（這一頁選過就沿用）、隱藏線索＝畫面上目前的狀態 */
  useEffect(() => {
    if (!open) return;
    setTheme(sessionTheme ?? useProject.getState().data.theme);
    setExp({ clues: usePrefs.getState().data.showClues ? 'show' : 'hide' });
  }, [open]);

  const multi = project.floors.length > 1;
  const range = multi ? exp.range : 'current';
  const e2 = useMemo(() => ({ ...exp, range }), [exp, range]);
  const hasClues = project.floors.some(floorHasClues);
  const floors = useMemo(() => exportFloors(project, range), [project, range]);
  const empty = !hasExportContent(floors, exp.view === 'pl', exp.clues === 'hide');
  const layout = useMemo(
    () => (empty ? null : exportLayout(floors, exportOptions(project, e2, theme, e2.px))),
    [empty, floors, project, theme, e2],
  );
  const vtt = isVtt(exp);
  const cell = vttCell(project);
  /* VTT 用：每一張都要在上限裡（每層各一張時每張各自算，F266） */
  const vttLayouts = useMemo(() => {
    if (!vtt || empty) return [];
    return exportJobs(project, e2)
      .filter((j) => hasExportContent(j.floors, e2.view === 'pl', e2.clues === 'hide'))
      .map((j) => exportLayout(j.floors, exportOptions(project, e2, theme, e2.px)));
  }, [vtt, empty, project, e2, theme]);
  const tooLarge = vttLayouts.find(vttTooLarge) ?? null;
  const cells = vtt && layout ? vttCells(layout, cell) : null;
  const vttLine =
    vtt && layout && cells
      ? `${S.exp.vttInfo(cells.x, cells.y, layout.pxWidth, layout.pxHeight)}${
          range === 'each' && multi ? S.exp.vttEach(project.floors.length) : ''
        }`
      : '';
  const blocked = empty || !!tooLarge;

  useEffect(() => {
    if (!open || empty) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      try {
        const c = renderImage(floors, exportOptions(project, e2, theme, Math.min(e2.px, 16), true));
        setPreview(c.toDataURL('image/png'));
      } catch {
        setPreview(null);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [open, empty, floors, project, theme, e2]);

  const download = async () => {
    setBusy(true);
    try {
      const jobs = exportJobs(project, e2).filter((j) =>
        hasExportContent(j.floors, exp.view === 'pl', exp.clues === 'hide'),
      );
      const opts = exportOptions(project, e2, theme, exp.px);
      if (jobs.length === 1) {
        const blob = await canvasToBlob(renderImage(jobs[0].floors, opts), 'image/png');
        downloadBlob(blob, jobs[0].name);
      } else
        await downloadSequentially(
          jobs.map((j) => ({
            name: j.name,
            blob: () => canvasToBlob(renderImage(j.floors, opts), 'image/png'),
          })),
          { intervalMs: 300 },
        );
      notify(S.exp.saved(jobs.length), 'success');
    } catch {
      notify(S.exp.failed, 'danger');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 送到地圖演出產生器（F267）：這一張（每層各一張時是這一層）＋名稱＋「1 格幾 px」。
   * 新分頁在點擊的當下（任何 await 之前）開，網址帶交接編號；圖畫好、寫進 IndexedDB 之後 map-fx 才讀得到
   * （map-fx 那邊顯示「正在接收」等它；畫不出來或寫不進去時 map-fx 馬上知道，2026-10-29 主控追加）。
   */
  const sendToFx = () => {
    const id = beginHandoff('map-fx');
    const tab = window.open(handoffHref(MAP_FX_HREF, id), '_blank');
    if (tab) tab.opener = null;
    void deliverToFx(id, !tab);
  };

  const deliverToFx = async (id: string, blockedTab: boolean) => {
    setBusy(true);
    try {
      const jobs = exportJobs(project, e2);
      const job = range === 'each' && multi ? jobs[project.active] : jobs[0];
      if (!job) {
        await failHandoff('map-fx', id);
        return;
      }
      const opts = exportOptions(project, e2, theme, exp.px);
      const L = exportLayout(job.floors, opts);
      const blob = await canvasToBlob(renderImage(job.floors, opts), 'image/png');
      const gridPx = vtt
        ? vttPxOf(exp)
        : Math.round(L.scale * (project.tokenGrid || DEFAULT_CELL) * 100) / 100;
      const meta =
        Number.isInteger(gridPx) && gridPx >= FX_GRID_MIN && gridPx <= FX_GRID_MAX
          ? { gridPx }
          : {};
      const ok = await sendHandoff({
        to: 'map-fx',
        from: 'floor-plan',
        name: job.name.replace(/\.png$/i, ''),
        blob,
        meta,
        id,
      });
      if (!ok) {
        notify(S.exp.sendFxFailed, 'warning');
        return;
      }
      notify(
        blockedTab ? S.exp.sendFxBlocked : S.exp.sendFxDone,
        blockedTab ? 'warning' : 'success',
      );
    } catch {
      await failHandoff('map-fx', id);
      notify(S.exp.failed, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const copyVtt = async () => {
    if (!vttLine) return;
    if (await copyText(vttLine)) notify(S.msg.copiedVtt, 'success');
  };

  const copy = async () => {
    let canvas: HTMLCanvasElement;
    try {
      canvas = renderImage(floors, exportOptions(project, e2, theme, exp.px));
    } catch {
      notify(S.exp.failed, 'danger');
      return;
    }
    const r = await copyImage(canvasToBlob(canvas, 'image/png'));
    if (r.ok) notify(S.exp.copied, 'success');
    else notify(S.exp.copyFailed, 'warning');
  };

  const canCopy =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof (globalThis as { ClipboardItem?: unknown }).ClipboardItem !== 'undefined' &&
    range !== 'each';
  const shrunk = !vtt && layout ? layout.scale < exp.px - 1e-9 : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ exportOpen: o })}
      title={S.exp.title}
      size="xl"
      footer={
        <>
          <Button
            icon={<Film />}
            disabled={blocked || busy}
            onClick={sendToFx}
            title={S.exp.sendFxHint}
            data-testid="export-send-fx"
          >
            {S.exp.sendFx}
          </Button>
          {canCopy ? (
            <Button disabled={blocked} onClick={() => void copy()}>
              {S.exp.copy}
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={busy}
            disabled={blocked}
            onClick={() => void download()}
            data-testid="export-download"
          >
            {S.exp.download}
          </Button>
        </>
      }
    >
      <div
        className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
        data-testid="export-dialog"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.exp.mode}>
            <Segmented
              size="sm"
              value={vtt ? 'vtt' : 'image'}
              onValueChange={(v) => setExp({ mode: v })}
              options={[
                { value: 'image', label: S.exp.modeImage },
                { value: 'vtt', label: S.exp.modeVtt },
              ]}
            />
          </Field>
          {multi ? (
            <Field label={S.exp.range}>
              <Segmented
                size="sm"
                value={exp.range}
                onValueChange={(v) => setExp({ range: v })}
                options={[
                  { value: 'current', label: S.exp.current },
                  { value: 'all', label: S.exp.all },
                  { value: 'each', label: S.exp.each },
                ]}
              />
            </Field>
          ) : null}
          <Field label={S.exp.view}>
            <Segmented
              size="sm"
              value={exp.view}
              onValueChange={(v) => setExp({ view: v })}
              options={[
                { value: 'pl', label: S.exp.pl },
                { value: 'gm', label: S.exp.gm },
              ]}
            />
          </Field>
          {hasClues ? (
            <Field label={S.exp.clues}>
              <Segmented
                size="sm"
                value={exp.clues}
                onValueChange={(v) => setExp({ clues: v })}
                options={[
                  { value: 'show', label: S.exp.cluesShow },
                  { value: 'hide', label: S.exp.cluesHide },
                ]}
              />
            </Field>
          ) : null}
          <Field label={S.exp.style}>
            <Select
              value={theme}
              onValueChange={(v) => {
                sessionTheme = v;
                setTheme(v);
              }}
              options={THEME_IDS.map((id) => ({ value: id, label: S.themes[id] }))}
            />
          </Field>
          {getTheme(theme).effect ? (
            <Field label={S.exp.noise} hint={S.exp.noiseHint} layout="inline">
              <Toggle checked={exp.noise !== false} onCheckedChange={(v) => setExp({ noise: v })} />
            </Field>
          ) : null}
          {vtt ? (
            <>
              <Field label={S.exp.vttCell} hint={S.exp.vttCellHint}>
                <TokenGridSelect testId="export-token-grid" offLabel={S.exp.vttCellOff} />
              </Field>
              <Field label={S.exp.vttPx}>
                <Segmented
                  size="sm"
                  value={String(vttPxOf(exp))}
                  onValueChange={(v) => setExp({ vttPx: Number(v) as VttPx })}
                  options={VTT_PX.map((v) => ({ value: String(v), label: `${v}px` }))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={S.exp.px} hint={S.exp.pxNote}>
                <Segmented
                  size="sm"
                  value={String(exp.px)}
                  onValueChange={(v) => setExp({ px: Number(v) as ExportPx })}
                  options={EXPORT_PX.map((v) => ({ value: String(v), label: `${v}px` }))}
                />
              </Field>
              <Field label={S.exp.tokenGrid} hint={S.exp.tokenGridHint}>
                <TokenGridSelect testId="export-token-grid" />
              </Field>
            </>
          )}
          <Field label={S.exp.grid} layout="inline">
            <Toggle checked={exp.grid} onCheckedChange={(v) => setExp({ grid: v })} />
          </Field>
          <Field label={S.exp.transparent} layout="inline">
            <Toggle checked={exp.transparent} onCheckedChange={(v) => setExp({ transparent: v })} />
          </Field>
          {vtt ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <p className="m-0 min-w-0 text-sm tabular-nums" data-testid="export-info">
                  {vttLine}
                </p>
                {vttLine ? (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Copy />}
                    label={S.exp.vttCopyLabel}
                    onClick={() => void copyVtt()}
                    data-testid="export-vtt-copy"
                  />
                ) : null}
              </div>
              <p className="m-0 text-xs text-muted">{S.exp.vttNote}</p>
            </div>
          ) : (
            <p className="m-0 text-sm tabular-nums" data-testid="export-info">
              {layout
                ? `${S.exp.info(layout.pxWidth, layout.pxHeight)}${range === 'each' && multi ? ` × ${project.floors.length}` : ''}`
                : ''}
            </p>
          )}
          {tooLarge ? (
            <div data-testid="export-vtt-too-large">
              <Notice tone="danger">
                {S.exp.vttTooLarge(tooLarge.pxWidth, tooLarge.pxHeight)}
              </Notice>
            </div>
          ) : null}
          {!vtt && layout?.tokenGrid ? (
            <div className="flex flex-col gap-0.5">
              <p className="m-0 text-sm tabular-nums" data-testid="export-token-info">
                {S.exp.tokenGridInfo(
                  String(layout.tokenGrid * CELL_M),
                  tokenGridPx(layout.tokenGrid, layout.scale),
                )}
              </p>
              <p className="m-0 text-xs text-muted">{S.exp.tokenGridNote}</p>
            </div>
          ) : null}
          {shrunk ? <Notice tone="warning">{S.exp.tooLarge}</Notice> : null}
        </div>
        <div className="flex min-h-48 min-w-0 items-center justify-center rounded-md border border-border bg-surface-2 p-2">
          {empty ? (
            <p className="m-0 text-sm text-muted">{S.exp.empty}</p>
          ) : preview ? (
            <img
              src={preview}
              alt={S.exp.preview}
              className="checker max-h-[60dvh] max-w-full object-contain"
              data-testid="export-preview"
            />
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
