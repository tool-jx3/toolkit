/**
 * 互動 HTML（F45～F48）與分享連結（F50）的對話框。
 */
import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadText, formatBytes } from '@/core/files';
import {
  Button,
  buttonClass,
  Dialog,
  Field,
  Notice,
  TextOutputPanel,
  Toggle,
  useToast,
} from '@/ui';
import type { Card, CardSpec } from './card';
import { buildInteractiveHtml, htmlFileName } from './exportHtml';
import { resolveExportSources, shareCropsOf } from './images';
import type { ImageRef } from './model';
import { SHARE_MAX_LENGTH, shareUrlFor } from './share';
import { usePrefs } from './store';
import { S } from './strings';

type HtmlState =
  | { kind: 'busy' }
  | { kind: 'done'; snippet: string; standalone: string }
  | { kind: 'error'; message: string };

export function HtmlDialog({
  open,
  onOpenChange,
  card,
  pool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card;
  pool: readonly ImageRef[];
}) {
  const toast = useToast();
  const placeholders = usePrefs((s) => s.data.placeholders);
  const [state, setState] = useState<HtmlState>({ kind: 'busy' });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ kind: 'busy' });
    resolveExportSources(card, pool, placeholders)
      .then((src) => buildInteractiveHtml(card, src))
      .then(
        (r) => alive && setState({ kind: 'done', ...r }),
        (e) =>
          alive && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      alive = false;
    };
  }, [open, card, pool, placeholders]);

  const done = state.kind === 'done' ? state : null;
  const openWindow = () => {
    if (!done) return;
    const url = URL.createObjectURL(
      new Blob([done.standalone], { type: 'text/html;charset=utf-8' }),
    );
    const win = window.open(url, '_blank');
    if (!win) toast({ title: S.popupBlocked, description: S.popupBlockedHint, tone: 'danger' });
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
      <div className="flex min-w-0 flex-col gap-3" data-testid="html-dialog">
        <p className="m-0 text-sm text-muted">{S.html.note}</p>
        <Field label={S.html.placeholders} layout="inline" hint={S.html.placeholdersHint}>
          <Toggle
            checked={placeholders}
            onCheckedChange={(v) => usePrefs.getState().patch({ placeholders: v })}
          />
        </Field>
        {state.kind === 'busy' ? (
          <Notice tone="progress">{S.html.generating}</Notice>
        ) : state.kind === 'error' ? (
          <Notice tone="danger">
            {S.html.failed} {state.message}
          </Notice>
        ) : (
          <TextOutputPanel
            text={state.snippet}
            title={S.html.code}
            count={(t) => S.html.size(formatBytes(new Blob([t]).size))}
            copyLabel={S.html.copy}
            messages={{ copied: S.html.copied }}
            wrap="off"
            font="mono"
            className="max-h-[40dvh] overflow-auto"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download />}
            disabled={!done}
            onClick={() =>
              done && downloadText(done.standalone, htmlFileName(card), 'text/html;charset=utf-8')
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

export function ShareDialog({
  open,
  onOpenChange,
  spec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: CardSpec;
}) {
  /* 網址圖片要裁時先算裁切範圍（讀圖片的像素），再組連結 */
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setUrl(null);
    shareCropsOf(spec).then(
      (crops) => alive && setUrl(shareUrlFor(spec, location.href, crops)),
      () => alive && setUrl(shareUrlFor(spec, location.href)),
    );
    return () => {
      alive = false;
    };
  }, [open, spec]);
  const tooLong = url !== null && new URL(url).hash.length - 1 > SHARE_MAX_LENGTH;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.share.title}
      description={S.share.lead}
      size="lg"
    >
      <div className="flex min-w-0 flex-col gap-3" data-testid="share-dialog">
        <p className="m-0 text-sm text-muted">{S.share.note}</p>
        {url === null ? (
          <Notice tone="progress">{S.html.generating}</Notice>
        ) : tooLong ? (
          <Notice tone="danger">{S.shareTooLong}</Notice>
        ) : (
          <>
            <TextOutputPanel
              text={url}
              title={S.share.link}
              count={(t) => S.share.count(t.length)}
              copyLabel={S.share.copy}
              messages={{ copied: S.share.copied }}
              className="max-h-[30dvh] overflow-auto"
            />
            <div className="flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('secondary', 'md')}
              >
                <ExternalLink aria-hidden className="size-4" />
                {S.share.open}
              </a>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
