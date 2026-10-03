/**
 * 互動 HTML 的對話框（規格 F129）：程式碼、複製、儲存獨立 HTML、開新視窗試用。
 * 「自己試著選選看」（F117）也用同一套產生流程，直接在新視窗打開。
 */
import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadText, formatBytes } from '@/core/files';
import { Button, Dialog, Notice, TextOutputPanel } from '@/ui';
import { notify } from './actions';
import { fileNameOf } from './exporter';
import { generateHtml } from './media';
import { settingsNow } from './store';
import { S } from './strings';

/** 把獨立 HTML 開在新視窗（先開空白視窗，避免產生途中被當成彈出視窗擋掉） */
export async function openInteractivePreview(): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    notify({ title: S.toast.popup, description: S.toast.popupHint, tone: 'danger' });
    return;
  }
  try {
    win.document.title = S.html.generating;
    win.document.body.textContent = S.html.generating;
  } catch {
    /* 有些瀏覽器不讓寫空白視窗，照樣往下 */
  }
  try {
    const { standalone } = await generateHtml(settingsNow());
    const url = URL.createObjectURL(new Blob([standalone], { type: 'text/html;charset=utf-8' }));
    win.opener = null;
    win.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win.close();
    notify({ title: e instanceof Error ? e.message : String(e), tone: 'danger' });
  }
}

export function HtmlDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; snippet: string; standalone: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ kind: 'busy' });
    generateHtml(settingsNow()).then(
      (r) => alive && setState({ kind: 'done', ...r }),
      (e) =>
        alive && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [open]);
  const done = state.kind === 'done' ? state : null;
  const openWindow = () => {
    if (!done) return;
    const url = URL.createObjectURL(
      new Blob([done.standalone], { type: 'text/html;charset=utf-8' }),
    );
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) notify({ title: S.toast.popup, description: S.toast.popupHint, tone: 'danger' });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.html.title}
      description={S.html.lead}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-muted">{S.html.note}</p>
        {state.kind === 'busy' || state.kind === 'idle' ? (
          <Notice tone="progress">{S.html.generating}</Notice>
        ) : state.kind === 'error' ? (
          <Notice tone="danger">{state.message}</Notice>
        ) : (
          <TextOutputPanel
            text={state.snippet}
            title={S.html.code}
            count={(t) => S.html.size(formatBytes(new Blob([t]).size))}
            copyLabel={S.html.copy}
            messages={{ copied: S.toast.htmlCopied }}
            wrap="off"
            font="mono"
            className="max-h-[45dvh] overflow-auto"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download />}
            disabled={!done}
            onClick={() =>
              done &&
              downloadText(
                done.standalone,
                fileNameOf(settingsNow(), 'html', '-interactive'),
                'text/html;charset=utf-8',
              )
            }
          >
            {S.html.download}
          </Button>
          <Button icon={<ExternalLink />} disabled={!done} onClick={openWindow}>
            {S.html.open}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
