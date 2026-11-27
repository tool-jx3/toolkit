/**
 * 匯出圖片：範圍（整張／只有地圖本體／對齊 VTT 的格子）、對象（PL 用／公開差分用／GM 用）、環境、長邊或每格的 px、
 * 淹水、背景透明；預覽與尺寸；下載 PNG、事件前後各存一張。
 * 範圍、對象、長邊、每格、透明留著（不列入復原）；環境與淹水在打開時帶入畫面上的。
 */
import { useEffect, useMemo, useState } from 'react';
import { downloadBlob, downloadSequentially } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import { Button, Dialog, Field, Notice, Segmented, Select, Toggle } from '@/ui';
import {
  CELL_PX,
  type ExportSettings,
  ensureDocFonts,
  exportSize,
  floodFor,
  LONG_EDGES,
  pairEnvs,
  pngName,
  renderPng,
  tooLarge,
} from '../draw/export';
import type { Crop } from '../draw/render';
import { docThumb } from '../draw/thumbs';
import { type Audience, ENV_IDS, type EnvId } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { docNow, setEditor, useDoc, useEditor, usePrefs } from './store';

let opener: HTMLElement | null = null;
/** 打開匯出（關掉後焦點回到按下的按鈕；快捷鍵打開時回到編輯列的「匯出圖片」） */
export function openExport(from: HTMLElement | null): void {
  opener = from;
  const d = docNow();
  setEditor({ exportOpen: true, expEnv: d.env, expFlood: d.flood });
}
const returnTarget = () =>
  opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-testid="export-open"]');

const setExp = (patch: Partial<ReturnType<typeof usePrefs.getState>['data']['exp']>) =>
  usePrefs.getState().update((p) => {
    Object.assign(p.exp, patch);
  });

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const env = useEditor((s) => s.expEnv);
  const flood = useEditor((s) => s.expFlood);
  const doc = useDoc((s) => s.data);
  const exp = usePrefs((s) => s.data.exp);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const settings: ExportSettings = useMemo(
    () => ({ ...exp, env, flood, transparent: exp.crop === 'sheet' && exp.transparent }),
    [exp, env, flood],
  );
  const size = exportSize(doc, exp.crop, exp.longEdge, exp.cellPx);
  const big = tooLarge(size);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      try {
        setPreview(
          docThumb(doc, 560, {
            audience: settings.audience,
            env: settings.env,
            flood: floodFor(doc, settings.flood),
            crop: settings.crop,
            transparent: settings.transparent,
          }),
        );
      } catch {
        setPreview(null);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [open, doc, settings]);

  const render = async (e: ExportSettings) => {
    const d = docNow();
    await ensureDocFonts(d);
    return canvasToBlob(renderPng(d, e), 'image/png');
  };

  const download = async () => {
    setBusy(true);
    try {
      downloadBlob(await render(settings), pngName(docNow(), settings));
      notify(S.exp.saved, 'success');
    } catch {
      notify(S.exp.failed, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const [beforeEnv, afterEnv] = pairEnvs(env);
  const downloadPair = async () => {
    setBusy(true);
    try {
      const d = docNow();
      await downloadSequentially([
        {
          name: pngName(d, settings, S.exp.before),
          blob: () => render({ ...settings, env: beforeEnv }),
        },
        {
          name: pngName(d, settings, S.exp.after),
          blob: () => render({ ...settings, env: afterEnv }),
        },
      ]);
      notify(S.exp.pairSaved, 'success');
    } catch {
      notify(S.exp.failed, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ exportOpen: o })}
      returnFocus={returnTarget()}
      title={S.exp.title}
      size="xl"
      footer={
        <>
          <Button
            disabled={busy || big}
            onClick={() => void downloadPair()}
            title={S.exp.pairHint(S.envs[beforeEnv])}
            data-testid="export-pair"
          >
            {S.exp.pair}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={big}
            onClick={() => void download()}
            data-testid="export-download"
          >
            {busy ? S.exp.busy : S.exp.download}
          </Button>
        </>
      }
    >
      <div
        className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
        data-testid="export-dialog"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.exp.crop}>
            <Segmented
              size="sm"
              columns={1}
              value={exp.crop}
              onValueChange={(v: Crop) => setExp({ crop: v })}
              options={(['sheet', 'map', 'vtt'] as const).map((v) => ({
                value: v,
                label: S.exp.crops[v],
              }))}
            />
          </Field>
          <Field label={S.exp.audience}>
            <Segmented
              size="sm"
              columns={1}
              value={exp.audience}
              onValueChange={(v: Audience) => setExp({ audience: v })}
              options={(['player', 'reveal', 'gm'] as const).map((v) => ({
                value: v,
                label: S.exp.audiences[v],
              }))}
            />
          </Field>
          <Field label={S.exp.env}>
            <Select
              value={env}
              onValueChange={(v: EnvId) => setEditor({ expEnv: v })}
              options={ENV_IDS.map((v) => ({ value: v, label: S.envs[v] }))}
              data-testid="export-env"
            />
          </Field>
          {exp.crop === 'vtt' ? (
            <Field label={S.exp.cellPx} hint={S.exp.cellHint}>
              <Select
                value={String(exp.cellPx)}
                onValueChange={(v) => setExp({ cellPx: Number(v) })}
                options={CELL_PX.map((v) => {
                  const s = exportSize(doc, 'vtt', exp.longEdge, v);
                  return {
                    value: String(v),
                    label: `${v} px／格`,
                    disabled: tooLarge(s),
                    description: tooLarge(s) ? S.exp.tooLarge : undefined,
                  };
                })}
                data-testid="export-cell"
              />
            </Field>
          ) : (
            <Field label={S.exp.longEdge}>
              <Segmented
                size="sm"
                fullWidth
                value={String(exp.longEdge)}
                onValueChange={(v) => setExp({ longEdge: Number(v) })}
                options={LONG_EDGES.map((v) => ({ value: String(v), label: `${v} px` }))}
              />
            </Field>
          )}
          <Field
            label={S.exp.flood}
            layout="inline"
            hint={flood ? S.exp.floodHint(floodFor(doc, true)) : undefined}
          >
            <Toggle checked={flood} onCheckedChange={(v) => setEditor({ expFlood: v })} />
          </Field>
          <Field
            label={S.exp.transparent}
            layout="inline"
            hint={exp.crop === 'sheet' ? S.exp.transparentHint : S.exp.transparentOff}
          >
            <Toggle
              checked={exp.crop === 'sheet' && exp.transparent}
              disabled={exp.crop !== 'sheet'}
              onCheckedChange={(v) => setExp({ transparent: v })}
            />
          </Field>
          <p className="m-0 text-sm tabular-nums" data-testid="export-info">
            {S.exp.info(size.width, size.height, size.cols, size.rows)}
          </p>
          {big ? <Notice tone="warning">{S.exp.tooLarge}</Notice> : null}
          <p className="m-0 text-xs text-muted">{S.exp.pairHint(S.envs[beforeEnv])}</p>
        </div>
        <div className="checker flex min-h-48 min-w-0 items-center justify-center rounded-md border border-border p-2">
          {preview ? (
            <img
              src={preview}
              alt={S.exp.preview}
              className="max-h-[60dvh] max-w-full object-contain"
              data-testid="export-preview"
            />
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
