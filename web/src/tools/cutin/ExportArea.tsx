/**
 * 預覽下方：三個匯出按鈕（F41、F42）、重新開啟上次結果（F45）、分享連結（F61）、檢查清單（F48），
 * 以及匯出完成時自動打開的結果對話框（F43、F44、F46）。
 */
import { Download, FileImage, Link2, Minimize2 } from 'lucide-react';
import { checkTarget, EXPORT_TARGETS, formatLimitBytes, usagePercent } from '@/ccfolia';
import { Button, buttonClass, cn, Dialog, IssueList } from '@/ui';
import { autoShrink, copyShareLink, cutinWord, exportAs } from './actions';
import { type CutinFormat, charCount, FORMATS, fontOf } from './model';
import { useSettings, useUi } from './store';
import { S } from './strings';

const SHORT_FORMAT: Record<CutinFormat, string> = { apng: 'APNG', gif: 'GIF', png: 'PNG' };

export function ExportArea() {
  const exporting = useUi((u) => u.exporting);
  const outcome = useUi((u) => u.outcome);
  return (
    <div className="flex flex-col gap-3">
      <section aria-label={S.exportGroup} className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((f) => {
            const busy = exporting?.format === f;
            const p = exporting?.progress;
            return (
              <Button
                key={f}
                variant="primary"
                icon={<Download />}
                disabled={!!exporting}
                aria-busy={busy || undefined}
                data-format={f}
                onClick={() => void exportAs(f)}
                className="min-w-0 px-2"
              >
                <span className="truncate" data-testid={busy ? 'export-progress' : undefined}>
                  {busy && p
                    ? p.phase === 'draw'
                      ? S.progressDraw(p.done, p.total)
                      : S.progressEncode(p.total)
                    : S.exportButton(SHORT_FORMAT[f])}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {outcome && !exporting ? (
            <Button
              size="sm"
              icon={<FileImage />}
              onClick={() => useUi.setState({ resultOpen: true })}
            >
              {S.reopenResult}
            </Button>
          ) : null}
          <Button size="sm" icon={<Link2 />} onClick={() => void copyShareLink()}>
            {S.share}
          </Button>
        </div>
      </section>
      <Checklist />
      <ResultDialog />
    </div>
  );
}

/** 檢查清單（F48）：錯誤、警告、資訊；上方另有一則訊息（匯出失敗、已複製、自動縮小） */
function Checklist() {
  const s = useSettings((st) => st.data);
  const lastBytes = useUi((u) => u.lastBytes);
  const notice = useUi((u) => u.notice);
  const issues = checkTarget(EXPORT_TARGETS[s.target], {
    format: s.format,
    width: s.width,
    height: s.height,
    frames: s.frames,
    gifMatte: s.gifMatte,
    transparentBackground: s.background === 'transparent',
    charCount: charCount(s.text),
    fontSuggestedChars: fontOf(s.font).data.maxChars,
    lastBytes,
  });
  return (
    <IssueList
      aria-label={S.checklistLabel}
      items={issues.map((i) => ({ level: i.level, message: i.message, id: i.code }))}
      notice={notice}
      empty={S.checklistEmpty}
    />
  );
}

/** 結果對話框：成品預覽、格式、大小／上限、下載、自動縮小、繼續編輯、使用步驟、檔名 */
function ResultDialog() {
  const open = useUi((u) => u.resultOpen);
  const outcome = useUi((u) => u.outcome);
  const shrinkNote = useUi((u) => u.shrinkNote);
  if (!outcome) return null;
  const { result, url, format, target: targetId } = outcome;
  const target = EXPORT_TARGETS[targetId];
  const bytes = result.blob.size;
  const over = bytes > target.maxBytes;
  const close = () => useUi.setState({ resultOpen: false });
  const steps = S.targetSteps[targetId](cutinWord(outcome.text));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useUi.setState({ resultOpen: o })}
      title={S.resultTitle}
      size="md"
      footer={
        <>
          <Button onClick={close}>{S.continueEdit}</Button>
          <a
            href={url}
            download={result.fileName}
            className={buttonClass('primary', 'md', 'no-underline hover:text-accent-contrast')}
          >
            <Download aria-hidden className="size-4" />
            {S.download}
          </a>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="result-dialog">
        <div className="checker flex max-h-64 items-center justify-center overflow-hidden rounded-md border border-border">
          <img src={url} alt={S.resultPreviewAlt} className="max-h-64 max-w-full object-contain" />
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{S.resultFormat}</dt>
          <dd className="m-0" data-testid="result-format">
            {S.formats[format]}
          </dd>
          <dt className="text-muted">{S.resultSize}</dt>
          <dd
            className={cn('m-0 font-medium tabular-nums', over ? 'text-danger' : 'text-success')}
            data-testid="result-size"
            data-bytes={bytes}
            data-over={over ? '' : undefined}
          >
            {formatLimitBytes(bytes)}／{formatLimitBytes(target.maxBytes)}（
            {usagePercent(bytes, target.maxBytes)}%）{over ? `・${S.resultOver}` : ''}
          </dd>
          <dt className="text-muted">{S.fileNameLabel}</dt>
          <dd className="m-0 break-all" data-testid="result-filename">
            {result.fileName}
          </dd>
        </dl>
        {shrinkNote ? (
          <p
            className="m-0 rounded-md bg-accent-soft px-3 py-1.5 text-sm text-fg"
            data-testid="shrink-note"
          >
            {shrinkNote}
          </p>
        ) : null}
        {over ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-danger-soft p-2.5">
            <Button
              size="sm"
              icon={<Minimize2 />}
              className="self-start"
              onClick={() => autoShrink()}
            >
              {S.autoShrink}
            </Button>
            <p className="m-0 text-xs text-fg">{S.autoShrinkHint}</p>
          </div>
        ) : null}
        <section>
          <h3 className="m-0 mb-1 text-sm font-semibold">{S.stepsTitle(target.label)}</h3>
          <ol className="m-0 list-decimal pl-5 text-sm leading-relaxed">
            {steps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </section>
      </div>
    </Dialog>
  );
}
