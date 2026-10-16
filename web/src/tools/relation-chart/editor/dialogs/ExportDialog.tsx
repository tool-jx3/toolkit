/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出（原作「檔案 › 輸出」）：格式（PNG、分層 SVG、分層 PSD、互動網頁）、範圍（目前／全部／部分分頁）、
 * 去背、檔名；互動網頁可以先在對話框裡預覽。
 * 第四批：互動網頁的「壓縮頭像」「嵌入模式」（勾了嵌入模式時出現嵌入碼與託管說明；F146）；
 * 每次匯出都記下格式、範圍與勾選（再次匯出，F147）。預覽不吃這兩個選項（原作也是）。
 * 第五批：目前分頁是 2 格以上的時間軸分頁時多一個「GIF／影片」（AnimExport；原作只在時間軸分頁出現，藏而不灰）。
 */
import { Copy, Download, Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Field, Segmented, TextArea, TextInput, useToast } from '@/ui';
import { sheetName } from '../../engine/geom';
import { defaultExportBase, type ExportFormat, exportExt } from '../../export/outputs';
import { viewerHtml } from '../../export/viewer';
import { activeIndex, setPrefs, setUi, usePrefs, useProject, useUi } from '../../state/store';
import { S } from '../../strings';
import { pickIndexes, prepare, runExport, tweenPrefs } from '../exportRun';
import { AnimExport } from './AnimExport';

const E = S.exportDlg;

const HINTS: Record<ExportFormat, string> = {
  png: E.pngHint,
  svg: E.svgHint,
  psd: E.psdHint,
  html: E.htmlHint,
};

/** 嵌入碼＋託管說明（嵌入模式勾著時） */
const EMBED_CODE = `<iframe src="${E.embedSrc}" style="width:100%;aspect-ratio:4/3;border:0" loading="lazy" allowfullscreen></iframe>`;

/** 剪貼簿 API 不能用時（非 https、權限）退回舊的複製法：選取文字框後 execCommand（原作的做法） */
function legacyCopy(el: HTMLTextAreaElement | null): boolean {
  if (!el) return false;
  try {
    el.focus();
    el.select();
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

function EmbedTeach() {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border p-2"
      data-testid="embed-teach"
    >
      <Field label={E.embedCode}>
        <div className="flex items-start gap-1">
          <TextArea
            ref={box}
            readOnly
            value={EMBED_CODE}
            rows={3}
            className="min-w-0 flex-1 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
            data-testid="embed-code"
          />
          <Button
            size="sm"
            icon={<Copy />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(EMBED_CODE);
                setCopied(true);
              } catch {
                if (legacyCopy(box.current)) setCopied(true);
                else toast({ title: E.copyFail, tone: 'warning' });
              }
            }}
            data-testid="embed-copy"
          >
            {copied ? E.copied : E.copy}
          </Button>
        </div>
      </Field>
      <p className="text-xs text-muted">{E.embedSteps}</p>
      <p className="text-xs text-muted">{E.embedToyhouse}</p>
    </div>
  );
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
      if (alive) setHtml(viewerHtml(input.sheets, input, { tween: tweenPrefs() }));
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
  /* GIF／影片：只有目前分頁是 2 格以上的時間軸分頁時能選 */
  const canAnim = (sheets[active]?.tl?.frames.length ?? 0) >= 2;
  const anim = canAnim && (prefs.exportFormat === 'gif' || prefs.exportFormat === 'video');
  const fmt: ExportFormat =
    prefs.exportFormat === 'gif' || prefs.exportFormat === 'video' ? 'png' : prefs.exportFormat;
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
      const name = await runExport(
        fmt,
        scope,
        idx,
        { transparent: prefs.transparent, slim: prefs.slim, embed: prefs.embed },
        custom?.trim() || base,
      );
      toast({ title: E.done(name), tone: 'success' });
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
        {/* 窄畫面放不下五種格式（時間軸分頁多了 GIF／影片）：換行，不把字截成「分…」 */}
        <Segmented
          size="sm"
          className="flex-wrap"
          value={anim ? 'anim' : fmt}
          onValueChange={(v) =>
            setPrefs({
              exportFormat:
                v === 'anim' ? (prefs.lastExport?.fmt === 'video' ? 'video' : 'gif') : v,
            })
          }
          options={[
            { value: 'png', label: E.png },
            { value: 'svg', label: E.svg },
            { value: 'psd', label: E.psd },
            { value: 'html', label: E.html },
            ...(canAnim ? [{ value: 'anim' as const, label: E.anim }] : []),
          ]}
        />
      </Field>
      {anim ? (
        <>
          <AnimExport />
          <div className="flex justify-end">
            <Button onClick={onDone}>{E.close}</Button>
          </div>
        </>
      ) : (
        <>
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
          {fmt === 'html' ? (
            <div className="flex flex-col gap-2">
              <Checkbox
                checked={prefs.slim}
                onCheckedChange={(v) => setPrefs({ slim: v })}
                label={E.slim}
                data-testid="export-slim"
              />
              <p className="-mt-1 text-xs text-muted">{E.slimHint}</p>
              <Checkbox
                checked={prefs.embed}
                onCheckedChange={(v) => setPrefs({ embed: v })}
                label={E.embed}
                data-testid="export-embed"
              />
              {prefs.embed ? <EmbedTeach /> : null}
            </div>
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
        </>
      )}
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
