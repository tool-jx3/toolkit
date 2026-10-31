/**
 * 互動 HTML（F90）與分享連結（F91）的對話框：共用的 `InteractiveHtmlDialog`、`ShareLinkDialog`（@/ui）加上本工具的內容。
 */
import { useCallback, useMemo } from 'react';
import { shareTooLong } from '@/core/share';
import { InteractiveHtmlDialog, ShareLinkDialog } from '@/ui/InteractiveHtmlDialog';
import { buildInteractiveHtml, htmlFileName } from './exportHtml';
import { refsOf, resolveExportSources } from './images';
import type { ClueMapState } from './model';
import { encodeShare, SHARE_MAX_LENGTH, shareUrlFor } from './share';
import { S } from './strings';

export function HtmlDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ClueMapState;
}) {
  const build = useCallback(
    () => resolveExportSources(refsOf(data)).then((src) => buildInteractiveHtml(data, src)),
    [data],
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
      fileName={htmlFileName(data)}
      data-testid="html-dialog"
    />
  );
}

/** 分享連結的長度是否放得下（太長時停用） */
export const isShareTooLong = (d: ClueMapState): boolean =>
  shareTooLong(encodeShare(d), SHARE_MAX_LENGTH);

export function ShareDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ClueMapState;
}) {
  const url = useMemo(() => (open ? shareUrlFor(data, location.href) : null), [open, data]);
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
      maxLength={SHARE_MAX_LENGTH}
      data-testid="share-dialog"
    />
  );
}
