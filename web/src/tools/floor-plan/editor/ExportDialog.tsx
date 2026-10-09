/**
 * 匯出圖片（PNG）：範圍（這一層／所有樓層排成一張／每層各一張）、對象（PL／GM）、隱藏線索、樣式、每格大小、
 * 格線、透明背景；預覽與輸出尺寸；下載或複製到剪貼簿。
 */
import { useEffect, useMemo, useState } from 'react';
import { copyImage, downloadBlob, downloadSequentially } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import { Button, Dialog, Field, Notice, Segmented, Select, Toggle } from '@/ui';
import { exportLayout, hasExportContent, renderImage } from '../draw/export';
import { EXPORT_PX, type ExportPx, THEME_IDS } from '../model/catalog';
import { exportFloors, exportJobs, exportOptions } from '../model/exportPlan';
import { floorHasClues } from '../model/geometry';
import type { ThemeId } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { type Prefs, setEditor, useEditor, usePrefs, useProject } from './store';

const setExp = (patch: Partial<Prefs['exp']>) =>
  usePrefs.getState().update((d) => {
    Object.assign(d.exp, patch);
  });

/** 這一頁選過的匯出樣式（關掉對話框再開還在；重新整理後回到地圖的樣式） */
let sessionTheme: ThemeId | null = null;

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

  useEffect(() => {
    if (!open || empty) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      try {
        const c = renderImage(floors, exportOptions(project, e2, theme, Math.min(e2.px, 16)));
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
  const shrunk = layout ? layout.scale < exp.px - 1e-9 : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ exportOpen: o })}
      title={S.exp.title}
      size="xl"
      footer={
        <>
          {canCopy ? (
            <Button disabled={empty} onClick={() => void copy()}>
              {S.exp.copy}
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={busy}
            disabled={empty}
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
          <Field label={S.exp.px} hint={S.exp.pxNote}>
            <Segmented
              size="sm"
              value={String(exp.px)}
              onValueChange={(v) => setExp({ px: Number(v) as ExportPx })}
              options={EXPORT_PX.map((v) => ({ value: String(v), label: `${v}px` }))}
            />
          </Field>
          <Field label={S.exp.grid} layout="inline">
            <Toggle checked={exp.grid} onCheckedChange={(v) => setExp({ grid: v })} />
          </Field>
          <Field label={S.exp.transparent} layout="inline">
            <Toggle checked={exp.transparent} onCheckedChange={(v) => setExp({ transparent: v })} />
          </Field>
          <p className="m-0 text-sm tabular-nums" data-testid="export-info">
            {layout
              ? `${S.exp.info(layout.pxWidth, layout.pxHeight)}${range === 'each' && multi ? ` × ${project.floors.length}` : ''}`
              : ''}
          </p>
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
