/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出（原作「檔案 › 輸出」）：格式（PNG、分層 SVG、分層 PSD、互動網頁）、範圍（目前／全部／部分分頁）、
 * 去背、檔名；互動網頁可以先在對話框裡預覽。
 */
import { Download, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { Button, Checkbox, Dialog, Field, Segmented, TextInput, useToast } from '@/ui';
import { sheetName } from '../../engine/geom';
import { buildExport, defaultExportBase, type ExportFormat, exportExt } from '../../export/outputs';
import { viewerHtml } from '../../export/viewer';
import { dataUris, drawnImageIds } from '../../state/images';
import {
  activeIndex,
  type ExportScope,
  projectNow,
  setPrefs,
  setUi,
  syncProject,
  usePrefs,
  useProject,
  useUi,
} from '../../state/store';
import { S } from '../../strings';

const E = S.exportDlg;

const HINTS: Record<ExportFormat, string> = {
  png: E.pngHint,
  svg: E.svgHint,
  psd: E.psdHint,
  html: E.htmlHint,
};

/** 這次要匯出的分頁索引（沒有角色的不匯出） */
function pickIndexes(scope: ExportScope, picked: ReadonlySet<number>): number[] {
  syncProject();
  const p = projectNow();
  const all = p.sheets.map((_, i) => i).filter((i) => p.sheets[i].chars.length > 0);
  if (p.sheets.length <= 1 || scope === 'cur') return all.filter((i) => i === activeIndex(p));
  if (scope === 'all') return all;
  return all.filter((i) => picked.has(i));
}

async function prepare(idx: readonly number[], transparent: boolean) {
  syncProject();
  const p = projectNow();
  const uris = await dataUris(drawnImageIds(p, idx));
  return {
    sheets: idx.map((i) => p.sheets[i]),
    font: p.font,
    labels: p.labels,
    uris,
    transparent,
  };
}

function PreviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const multi = useProject((s) => s.data.sheets.filter((x) => x.chars.length).length > 1);
  useEffect(() => {
    if (!open) {
      setHtml(null);
      return;
    }
    let alive = true;
    void (async () => {
      const idx = pickIndexes(all ? 'all' : 'cur', new Set());
      if (!idx.length) {
        if (alive) setHtml('');
        return;
      }
      const input = await prepare(idx, false);
      if (alive) setHtml(viewerHtml(input.sheets, input));
    })();
    return () => {
      alive = false;
    };
  }, [open, all]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={E.previewTitle}
      description={E.previewNote}
      size="xl"
    >
      {open ? (
        <div className="flex flex-col gap-2">
          {multi ? (
            <Segmented
              size="sm"
              value={all ? 'all' : 'cur'}
              onValueChange={(v) => setAll(v === 'all')}
              options={[
                { value: 'cur', label: E.scopeCur },
                { value: 'all', label: E.scopeAll },
              ]}
            />
          ) : null}
          <iframe
            title={E.previewLabel}
            className="h-[70dvh] w-full rounded-md border border-border bg-bg"
            sandbox="allow-scripts"
            srcDoc={html ?? ''}
            data-testid="viewer-preview"
          />
        </div>
      ) : null}
    </Dialog>
  );
}

function Body({ onDone }: { onDone: () => void }) {
  const prefs = usePrefs((p) => p.data);
  const sheets = useProject((s) => s.data.sheets);
  const active = useProject((s) => activeIndex(s.data));
  const toast = useToast();
  const [picked, setPicked] = useState<Set<number>>(() => new Set([active]));
  const [custom, setCustom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const fmt = prefs.exportFormat;
  const scope = sheets.length > 1 ? prefs.exportScope : 'cur';
  const idx = pickIndexes(scope, picked);
  const base = defaultExportBase(
    fmt,
    idx.map((i) => sheets[i]),
    prefs.transparent,
  );
  const ext = exportExt(fmt, idx.length);
  const empty = scope === 'cur' ? E.curEmpty : scope === 'all' ? E.allEmpty : E.noneSelected;
  const run = async () => {
    if (!idx.length) return;
    setBusy(true);
    try {
      const input = await prepare(idx, prefs.transparent);
      const out = await buildExport(fmt, input, custom?.trim() || base);
      downloadBlob(out.blob, out.fileName);
      toast({ title: E.done(out.fileName), tone: 'success' });
      onDone();
    } catch (e) {
      toast({
        title: E.failed,
        description: e instanceof Error ? e.message : undefined,
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label={E.format}>
        <Segmented
          size="sm"
          value={fmt}
          onValueChange={(v) => setPrefs({ exportFormat: v })}
          options={[
            { value: 'png', label: E.png },
            { value: 'svg', label: E.svg },
            { value: 'psd', label: E.psd },
            { value: 'html', label: E.html },
          ]}
        />
      </Field>
      <p className="-mt-2 text-xs text-muted">{HINTS[fmt]}</p>
      {sheets.length > 1 ? (
        <Field label={E.scope}>
          <div className="flex flex-col gap-2">
            <Segmented
              size="sm"
              value={scope}
              onValueChange={(v) => setPrefs({ exportScope: v })}
              options={[
                { value: 'cur', label: E.scopeCur },
                { value: 'all', label: E.scopeAll },
                { value: 'some', label: E.scopeSome },
              ]}
            />
            {scope === 'some' ? (
              <fieldset className="flex flex-col gap-1" aria-label={E.pickSheets}>
                {sheets.map((s, i) => (
                  <Checkbox
                    key={s.id}
                    checked={picked.has(i)}
                    disabled={!s.chars.length}
                    onCheckedChange={(v) =>
                      setPicked((cur) => {
                        const next = new Set(cur);
                        if (v) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                    label={`${sheetName(s)}${s.chars.length ? '' : E.emptyTag}`}
                  />
                ))}
              </fieldset>
            ) : null}
          </div>
        </Field>
      ) : null}
      {fmt === 'png' ? (
        <Checkbox
          checked={prefs.transparent}
          onCheckedChange={(v) => setPrefs({ transparent: v })}
          label={E.transparent}
          data-testid="export-transparent"
        />
      ) : null}
      <Field label={E.fileName} hint={E.fileNameHint}>
        <div className="flex items-center gap-1">
          <TextInput
            value={custom ?? base}
            onChange={(e) => setCustom(e.target.value)}
            aria-label={E.fileName}
            className="min-w-0 flex-1"
            data-testid="export-name"
          />
          <span className="text-sm text-muted">.{ext}</span>
        </div>
      </Field>
      {!idx.length ? <p className="text-sm text-warning">{empty}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {fmt === 'html' ? (
          <Button
            icon={<Eye />}
            className="mr-auto"
            onClick={() => setPreview(true)}
            data-testid="export-preview"
          >
            {E.preview}
          </Button>
        ) : null}
        <Button onClick={onDone}>{E.cancel}</Button>
        <Button
          variant="primary"
          icon={<Download />}
          loading={busy}
          disabled={!idx.length}
          onClick={() => void run()}
          data-testid="export-run"
        >
          {busy ? E.running : E.run}
        </Button>
      </div>
      <PreviewDialog open={preview} onClose={() => setPreview(false)} />
    </div>
  );
}

export function ExportDialog() {
  const open = useUi((u) => u.dialog === 'export');
  const close = () => setUi({ dialog: null });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={E.title} size="md">
      {open ? <Body onDone={close} /> : null}
    </Dialog>
  );
}
