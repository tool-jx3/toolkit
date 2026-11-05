/**
 * 匯出圖片：寬（1536／2400／3200／4096 px）、內容（公開用／GM 用），預覽與尺寸、拿掉幾項 GM 專用；
 * 下載 PNG、複製圖片、在地圖演出產生器開啟（共用的 core/handoff 交給 map-fx）。
 * 上一次選的寬與內容會留著（不列入復原）。
 */
import { Film } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyImage, downloadBlob } from '@/core/files';
import { beginHandoff, failHandoff, handoffHref, sendHandoff } from '@/core/handoff';
import { canvasToBlob } from '@/core/image';
import { getTool, hrefToTool } from '@/registry';
import { Button, Dialog, Field, Segmented } from '@/ui';
import {
  EXPORT_WIDTHS,
  ensureMapFonts,
  exportSize,
  pngName,
  renderPngCanvas,
  secretCount,
} from '../draw/export';
import type { Audience } from '../draw/render';
import { docThumbUrl } from '../draw/thumbs';
import { S } from '../strings';
import { notify } from './actions';
import { docNow, setEditor, TOOL_ID, useDoc, useEditor, usePrefs } from './store';

/** 地圖演出產生器的網址（還沒上線時在 next/） */
const MAP_FX_HREF = hrefToTool(getTool('map-fx') ?? { id: 'map-fx', status: 'next' });

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const doc = useDoc((s) => s.data);
  const width = usePrefs((s) => s.data.exportWidth);
  const audience = usePrefs((s) => s.data.exportAudience);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const w = (EXPORT_WIDTHS as readonly number[]).includes(width) ? width : 2400;
  const size = exportSize(doc, w);
  const secrets = secretCount(doc);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      try {
        setPreview(docThumbUrl(doc, 640, null, audience));
      } catch {
        setPreview(null);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [open, audience, doc]);

  const render = async () => {
    const d = docNow();
    await ensureMapFonts(d);
    return canvasToBlob(renderPngCanvas(d, w, audience), 'image/png');
  };

  const download = async () => {
    setBusy(true);
    try {
      downloadBlob(await render(), pngName(docNow(), audience));
      notify(S.exp.saved, 'success');
    } catch {
      notify(S.exp.failed, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const r = await copyImage(render());
    if (r.ok) notify(S.exp.copied, 'success');
    else notify(S.exp.copyFailed, 'warning');
  };

  /** 新分頁在點擊的當下（任何 await 之前）開，網址帶交接編號；圖畫好、寫進 IndexedDB 之後 map-fx 才讀得到 */
  const sendToFx = () => {
    const id = beginHandoff('map-fx');
    const tab = window.open(`${handoffHref(MAP_FX_HREF, id)}&from=${TOOL_ID}`, '_blank');
    if (tab) tab.opener = null;
    void (async () => {
      setBusy(true);
      try {
        const blob = await render();
        const ok = await sendHandoff({
          to: 'map-fx',
          from: TOOL_ID,
          name: pngName(docNow(), audience).replace(/\.png$/i, ''),
          blob,
          id,
        });
        if (!ok) {
          notify(S.exp.sendFxFailed, 'warning');
          return;
        }
        notify(tab ? S.exp.sendFxDone : S.exp.sendFxBlocked, tab ? 'success' : 'warning');
      } catch {
        await failHandoff('map-fx', id);
        notify(S.exp.failed, 'danger');
      } finally {
        setBusy(false);
      }
    })();
  };

  const canCopy =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof (globalThis as { ClipboardItem?: unknown }).ClipboardItem !== 'undefined';

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
            disabled={busy}
            onClick={sendToFx}
            title={S.exp.sendFxHint}
            data-testid="export-send-fx"
          >
            {S.exp.sendFx}
          </Button>
          {canCopy ? (
            <Button disabled={busy} onClick={() => void copy()}>
              {S.exp.copy}
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void download()}
            data-testid="export-download"
          >
            {busy ? S.exp.busy : S.exp.download}
          </Button>
        </>
      }
    >
      <div
        className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
        data-testid="export-dialog"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={S.exp.width}>
            <Segmented
              size="sm"
              columns={2}
              value={String(w)}
              onValueChange={(v) => usePrefs.getState().patch({ exportWidth: Number(v) })}
              options={EXPORT_WIDTHS.map((v) => ({ value: String(v), label: `${v} px` }))}
            />
          </Field>
          <Field label={S.exp.audience}>
            <Segmented
              size="sm"
              columns={1}
              value={audience}
              onValueChange={(v: Audience) => usePrefs.getState().patch({ exportAudience: v })}
              options={[
                { value: 'player', label: S.exp.player },
                { value: 'gm', label: S.exp.gm },
              ]}
            />
          </Field>
          <p className="m-0 text-sm tabular-nums" data-testid="export-info">
            {S.exp.info(size.width, size.height)} ·{' '}
            {audience === 'gm' ? S.exp.infoGm : S.exp.infoPlayer(secrets)}
          </p>
          <p className="m-0 text-xs text-muted">{S.exp.note}</p>
        </div>
        <div className="flex min-h-48 min-w-0 items-center justify-center rounded-md border border-border bg-surface-2 p-2">
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
