/**
 * 互動 HTML（F45～F48）與分享連結（F50）的對話框：共用的 `InteractiveHtmlDialog`、`ShareLinkDialog`（@/ui）加上本工具的內容
 * （待填的網址開關、網址圖片的裁切範圍）。
 */
import { useCallback, useEffect, useState } from 'react';
import { shareTooLong } from '@/core/share';
import { Field, InteractiveHtmlDialog, ShareLinkDialog, Toggle } from '@/ui';
import type { Card, CardSpec } from './card';
import { buildInteractiveHtml, htmlFileName } from './exportHtml';
import { resolveExportSources, shareCropsOf } from './images';
import type { ImageRef } from './model';
import { SHARE_MAX_LENGTH, shareUrlFor } from './share';
import { usePrefs } from './store';
import { S } from './strings';

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
  const placeholders = usePrefs((s) => s.data.placeholders);
  const build = useCallback(
    () =>
      resolveExportSources(card, pool, placeholders).then((src) => buildInteractiveHtml(card, src)),
    [card, pool, placeholders],
  );
  return (
    <InteractiveHtmlDialog
      open={open}
      onOpenChange={onOpenChange}
      strings={{
        title: S.html.title,
        lead: S.html.lead,
        note: S.html.note,
        generating: S.html.generating,
        failed: S.html.failed,
        code: S.html.code,
        copy: S.html.copy,
        copied: S.html.copied,
        size: S.html.size,
        download: S.html.download,
        open: S.html.open,
        popupBlocked: S.popupBlocked,
        popupBlockedHint: S.popupBlockedHint,
      }}
      build={build}
      fileName={htmlFileName(card)}
      extra={
        <Field label={S.html.placeholders} layout="inline" hint={S.html.placeholdersHint}>
          <Toggle
            checked={placeholders}
            onCheckedChange={(v) => usePrefs.getState().patch({ placeholders: v })}
          />
        </Field>
      }
      data-testid="html-dialog"
    />
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
  return (
    <ShareLinkDialog
      open={open}
      onOpenChange={onOpenChange}
      strings={{
        title: S.share.title,
        lead: S.share.lead,
        note: S.share.note,
        generating: S.html.generating,
        tooLong: S.shareTooLong,
        link: S.share.link,
        copy: S.share.copy,
        copied: S.share.copied,
        count: S.share.count,
        open: S.share.open,
      }}
      url={url}
      tooLong={url !== null && shareTooLong(new URL(url).hash, SHARE_MAX_LENGTH)}
      data-testid="share-dialog"
    />
  );
}
