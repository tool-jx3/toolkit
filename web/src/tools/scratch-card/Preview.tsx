/**
 * 預覽欄：說明與張數、可以刮的卡片（共用舞台）、再蓋一次／直接刮開／抽新的一張、輸出（互動 HTML、分享連結）。
 */
import { Code2, Eraser, RotateCcw, Share2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Notice, Stage } from '@/ui';
import { CardView } from './CardView';
import { buildCard, specOf } from './card';
import { HtmlDialog, ShareDialog } from './Dialogs';
import { CARD_BORDER } from './markup';
import { encodeShare, SHARE_MAX_LENGTH, shareUrlFor, usesUploadedImages } from './share';
import { newTicket, recover, revealNow, setPreviewHandle, useScratch, useUi } from './store';
import { S } from './strings';

export function PreviewArea() {
  const data = useScratch((s) => s.data);
  const draws = useUi((s) => s.draws);
  const revealed = useUi((s) => s.revealed);
  const specKey = JSON.stringify(specOf(data));
  const spec = useMemo(() => JSON.parse(specKey) as ReturnType<typeof specOf>, [specKey]);
  const card = useMemo(() => buildCard(spec), [spec]);
  const [images, setImages] = useState({ pending: 0, missing: 0 });
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [share, setShare] = useState<string | null>(null);

  const shareBlock = usesUploadedImages(spec)
    ? S.shareUploaded
    : encodeShare(spec).length - 1 > SHARE_MAX_LENGTH
      ? S.shareTooLong
      : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted">{S.previewLead}</p>
        <span
          className="rounded-full bg-accent-soft px-3 py-0.5 text-xs font-medium text-accent"
          data-testid="draw-count"
        >
          {S.drawCount(draws)}
        </span>
      </div>
      <Stage
        width={card.width + CARD_BORDER * 2}
        height={card.height + CARD_BORDER * 2}
        backgrounds={['light', 'dark', 'checker']}
        defaultBackground={{ kind: 'light' }}
        aria-label={S.stageLabel}
      >
        <CardView
          card={card}
          onHandle={setPreviewHandle}
          onReveal={() => useUi.setState({ revealed: true })}
          onRecover={() => useUi.setState({ revealed: false })}
          onImages={setImages}
        />
      </Stage>
      {images.missing ? <Notice tone="warning">{S.imageMissing(images.missing)}</Notice> : null}
      {images.pending ? <Notice tone="progress">{S.imagesLoading}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button icon={<RotateCcw />} onClick={recover}>
          {S.recover}
        </Button>
        <Button icon={<Eraser />} onClick={revealNow} disabled={revealed}>
          {S.revealNow}
        </Button>
        <Button variant="primary" icon={<Sparkles />} onClick={newTicket}>
          {S.newTicket}
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="reveal-status">
        {revealed ? S.revealed : ''}
      </p>
      <section
        aria-labelledby="scratch-output"
        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <h2 id="scratch-output" className="m-0 text-sm font-semibold">
          {S.outputTitle}
        </h2>
        <p className="m-0 text-xs text-muted">{S.outputHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Code2 />} onClick={() => setHtmlOpen(true)}>
            {S.exportHtml}
          </Button>
          <Button
            icon={<Share2 />}
            disabled={!!shareBlock}
            onClick={() => setShare(shareUrlFor(spec, location.href))}
          >
            {S.shareLink}
          </Button>
        </div>
        {shareBlock ? (
          <p className="m-0 text-xs text-muted" data-testid="share-blocked">
            {shareBlock}
          </p>
        ) : null}
      </section>
      <HtmlDialog open={htmlOpen} onOpenChange={setHtmlOpen} card={card} pool={data.images} />
      <ShareDialog
        open={share !== null}
        onOpenChange={(o) => {
          if (!o) setShare(null);
        }}
        url={share ?? ''}
      />
    </div>
  );
}
