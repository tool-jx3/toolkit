/**
 * 匯出：兩個分頁。
 * - 圖片（PNG）：範圍（整張／只有地圖本體／對齊 VTT 的格子）、對象（PL 用／公開差分用／GM 用）、環境、長邊或每格的 px、
 *   淹水、背景透明；預覽與尺寸；下載 PNG、事件前後各存一張。
 * - CCFOLIA 房間 ZIP（第二批）：遮罩的樣子、無記名、PL 停留時祕密的名字蓋成編號、淹水的場景、KP 操作說明放進房間、
 *   棋子大小、（列車）排法；下載房間 ZIP、KP 準備包、只存無聲 MP3、只存說明圖；進度與取消。
 * 範圍、對象、長邊、每格、透明與房間 ZIP 的設定留著（不列入復原）；環境、淹水、列車的排法在打開時帶入作品的。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadSequentially } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Notice,
  ProgressBar,
  Segmented,
  Select,
  Toggle,
} from '@/ui';
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
  safeTitle,
  tooLarge,
} from '../draw/export';
import type { Crop } from '../draw/render';
import { planOf, worldOf } from '../draw/scene';
import { docThumb } from '../draw/thumbs';
import { ARRANGES, type Arrange, type Audience, ENV_IDS, type EnvId } from '../model/types';
import { S } from '../strings';
import {
  boardOf,
  cutinsOf,
  MASK_STYLES,
  type MaskStyle,
  panelsOf,
  scenesOf,
  type ZipOptions,
  zipDoc,
} from '../zip/plan';
import { notify } from './actions';
import { docNow, setEditor, useDoc, useEditor, usePrefs, type ZipPrefs } from './store';

let opener: HTMLElement | null = null;
/** 打開匯出（關掉後焦點回到按下的按鈕；快捷鍵打開時回到編輯列的「匯出圖片」） */
export function openExport(from: HTMLElement | null): void {
  opener = from;
  const d = docNow();
  setEditor({
    exportOpen: true,
    expEnv: d.env,
    expFlood: d.flood,
    zipFlood: d.flood,
    zipArrange: d.train?.arrange ?? 'auto',
  });
}
const returnTarget = () =>
  opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-testid="export-open"]');

const setExp = (patch: Partial<ReturnType<typeof usePrefs.getState>['data']['exp']>) =>
  usePrefs.getState().update((p) => {
    Object.assign(p.exp, patch);
  });

const setZip = (patch: Partial<ZipPrefs>) =>
  usePrefs.getState().update((p) => {
    Object.assign(p.zip, patch);
  });

/** CCFOLIA 房間 ZIP 的分頁（設定、概要、下載與進度） */
function ZipPane({ o }: { o: ZipOptions }) {
  const doc = useDoc((s) => s.data);
  const train = doc.mode === 'train' && !!doc.train;
  const info = useMemo(() => {
    const plan = planOf(zipDoc(doc, o.arrange));
    const b = boardOf(worldOf(plan), o.token);
    const panels = panelsOf(plan, o);
    return {
      b,
      masks: panels.filter((p) => p.kind === 'mask').length,
      camos: panels.filter((p) => p.kind === 'camo').length,
      scenes: scenesOf(o).length,
      cuts: cutinsOf(o).length,
    };
  }, [doc, o]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="zip-pane">
      <Field label={S.zip.mask}>
        <Segmented
          size="sm"
          columns={1}
          value={o.mask}
          onValueChange={(v: MaskStyle) => setZip({ mask: v })}
          options={MASK_STYLES.map((v) => ({
            value: v,
            label: `${S.zip.masks[v]}（${S.zip.maskHints[v]}）`,
          }))}
        />
      </Field>
      <Field label={S.zip.naming}>
        <Segmented
          size="sm"
          columns={1}
          value={o.blind ? 'blind' : 'named'}
          onValueChange={(v) => setZip({ blind: v === 'blind' })}
          options={[
            { value: 'named', label: S.zip.named },
            { value: 'blind', label: S.zip.blind },
          ]}
        />
      </Field>
      <Checkbox
        checked={o.anon || o.blind}
        disabled={o.blind}
        onCheckedChange={(v) => setZip({ anon: v })}
        label={
          <span className="flex flex-col">
            <span>{S.zip.anon}</span>
            <small className="text-xs text-muted">{S.zip.anonHint}</small>
          </span>
        }
      />
      <Field
        label={S.zip.flood}
        layout="inline"
        hint={o.flood ? S.zip.floodHint(floodFor(doc, true)) : undefined}
      >
        <Toggle checked={o.flood} onCheckedChange={(v) => setEditor({ zipFlood: v })} />
      </Field>
      <Checkbox
        checked={o.guide}
        onCheckedChange={(v) => setZip({ guide: v })}
        label={S.zip.guide}
      />
      <Field label={S.zip.token}>
        <Segmented
          size="sm"
          columns={1}
          value={String(o.token)}
          onValueChange={(v) => setZip({ token: v === '2' ? 2 : 1 })}
          options={([1, 2] as const).map((v) => ({ value: String(v), label: S.zip.tokens[v] }))}
        />
      </Field>
      {train ? (
        <Field label={S.zip.arrange}>
          <Select
            value={o.arrange}
            onValueChange={(v: Arrange) => setEditor({ zipArrange: v })}
            options={ARRANGES.map((v) => ({ value: v, label: S.arranges[v] }))}
            data-testid="zip-arrange"
          />
        </Field>
      ) : null}
      <p className="m-0 text-sm tabular-nums" data-testid="zip-info">
        {S.zip.summary(info.b.fieldWidth, info.b.fieldHeight, info.b.cell)}
        <br />
        {S.zip.summaryCounts(info.scenes, info.masks, info.camos, info.cuts)}
      </p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted">
        <li>{S.zip.packHint}</li>
        <li>{S.zip.note}</li>
        <li>{S.zip.leakNote}</li>
        {train ? <li>{S.zip.wideNote}</li> : null}
      </ul>
    </div>
  );
}

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const env = useEditor((s) => s.expEnv);
  const flood = useEditor((s) => s.expFlood);
  const doc = useDoc((s) => s.data);
  const exp = usePrefs((s) => s.data.exp);
  const tab = usePrefs((s) => s.data.expTab);
  const zipPrefs = usePrefs((s) => s.data.zip);
  const zipFlood = useEditor((s) => s.zipFlood);
  const zipArrange = useEditor((s) => s.zipArrange);
  const zipOpts: ZipOptions = useMemo(
    () => ({ ...zipPrefs, flood: zipFlood, arrange: zipArrange }),
    [zipPrefs, zipFlood, zipArrange],
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
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
          tab === 'zip'
            ? docThumb(zipDoc(doc, zipArrange), 560, {
                audience: 'reveal',
                env: 'day',
                flood: 0,
                crop: 'map',
              })
            : docThumb(doc, 560, {
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
  }, [open, doc, settings, tab, zipArrange]);

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

  /** 房間 ZIP 的四種下載（按下時才載入房間 ZIP 的程式） */
  const runZip = async (what: 'room' | 'pack' | 'mp3' | 'guide') => {
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true);
    setProgress({ ratio: 0, label: S.zip.busy });
    try {
      const z = await import('../zip/build');
      const d = docNow();
      const onProgress = (ratio: number, label: string) => setProgress({ ratio, label });
      if (what === 'mp3') {
        const mp3 = await z.silentMp3(ctl.signal);
        downloadBlob(new Blob([mp3 as BlobPart], { type: 'audio/mpeg' }), S.zip.mp3Name);
        notify(S.zip.mp3Saved, 'success');
      } else if (what === 'guide') {
        const png = await z.guideOnly(d, zipOpts);
        downloadBlob(
          new Blob([png as BlobPart], { type: 'image/png' }),
          S.zip.guideName(safeTitle(d.title)),
        );
        notify(S.zip.guideSaved, 'success');
      } else {
        const r = await z.buildRoom(d, zipOpts, onProgress, ctl.signal);
        if (what === 'room') {
          downloadBlob(new Blob([r.bytes as BlobPart], { type: 'application/zip' }), r.fileName);
          notify(S.zip.saved, 'success');
        } else {
          const mp3 = await z.silentMp3(ctl.signal);
          const pack = z.packOf(d.title, r, mp3);
          downloadBlob(
            new Blob([pack as BlobPart], { type: 'application/zip' }),
            S.zip.packName(safeTitle(d.title)),
          );
          notify(S.zip.packSaved, 'success');
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        notify(S.zip.failed, 'danger', { description: e instanceof Error ? e.message : undefined });
    } finally {
      abort.current = null;
      setBusy(false);
      setProgress(null);
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
        tab === 'zip' ? (
          <>
            {busy ? (
              <Button onClick={() => abort.current?.abort()} data-testid="zip-cancel">
                {S.zip.cancel}
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void runZip('mp3')} data-testid="zip-mp3">
              {S.zip.mp3}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runZip('guide')}
              data-testid="zip-guide-png"
            >
              {S.zip.guidePng}
            </Button>
            <Button disabled={busy} onClick={() => void runZip('pack')} data-testid="zip-pack">
              {S.zip.pack}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void runZip('room')}
              data-testid="zip-download"
            >
              {busy ? S.zip.busy : S.zip.download}
            </Button>
          </>
        ) : (
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
        )
      }
    >
      <Segmented
        size="sm"
        aria-label={S.exp.kind}
        value={tab}
        onValueChange={(v: 'png' | 'zip') => usePrefs.getState().patch({ expTab: v })}
        options={[
          { value: 'png', label: S.zip.pngTab },
          { value: 'zip', label: S.zip.tab },
        ]}
        className="mb-3"
      />
      <div
        className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
        data-testid="export-dialog"
      >
        {tab === 'zip' ? (
          <ZipPane o={zipOpts} />
        ) : (
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
        )}
        <div className="checker flex min-h-48 min-w-0 items-center justify-center rounded-md border border-border p-2">
          {progress ? (
            <div className="flex w-full max-w-sm flex-col gap-1.5" data-testid="zip-progress">
              <ProgressBar value={progress.ratio} label={progress.label} />
              <small className="text-xs text-muted">{progress.label}</small>
            </div>
          ) : preview ? (
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
