/**
 * 右欄下半：已確定的劇本文字（規格 1.9）、匯出（1.10）、在 CCFOLIA 讀入的方法（F69）。
 */
import { ArrowDown, ArrowUp, ChevronRight, FileArchive, Images, Trash2, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Checkbox, cn, IconButton, Section, UsageSection, useConfirm } from '@/ui';
import {
  bundleTargets,
  deleteBatch,
  exportImages,
  exportRoomZip,
  moveBatch,
  restoreBatch,
} from './actions';
import { entriesOf, lookupOf } from './derived';
import { BATCH_ENTRY_CHARS, type Batch, snippet } from './model';
import { StatusLine, Thumb } from './parts';
import { imageOf, type Lookup, titleOf } from './resolve';
import { useDoc, useUi } from './store';
import { S } from './strings';

function BatchRow({
  batch: b,
  i,
  count,
  L,
  onRemove,
  onRestored,
}: {
  batch: Batch;
  i: number;
  count: number;
  L: Lookup;
  onRemove: (i: number) => void;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <li className="rounded-lg border border-border bg-surface-2" data-testid="batch">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left focus-visible:focus-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-90')}
          />
          <span className="min-w-[1.5em] text-xs text-muted tabular-nums">{i + 1}</span>
          <span className="rounded-sm border border-border-strong px-1 text-xs text-muted">
            {S.batchMode[b.mode]}
          </span>
          <b className="shrink-0 text-sm font-medium">{S.batchCount(b.entries.length)}</b>
          <span className="min-w-0 flex-1 truncate text-xs text-muted" data-role="label">
            {b.label}
          </span>
        </button>
        <span className="ml-auto flex flex-wrap gap-1">
          <IconButton
            label={S.batchUp(i + 1)}
            icon={<ArrowUp />}
            size="sm"
            variant="ghost"
            disabled={i === 0}
            onClick={() => moveBatch(i, -1)}
          />
          <IconButton
            label={S.batchDown(i + 1)}
            icon={<ArrowDown />}
            size="sm"
            variant="ghost"
            disabled={i === count - 1}
            onClick={() => moveBatch(i, 1)}
          />
          <Button
            size="sm"
            icon={<Undo2 />}
            aria-label={S.batchRestoreOf(i + 1)}
            onClick={() => {
              restoreBatch(i);
              onRestored();
            }}
          >
            {S.batchRestore}
          </Button>
          <IconButton
            label={S.batchDelete(i + 1)}
            icon={<Trash2 />}
            size="sm"
            variant="ghost"
            onClick={() => onRemove(i)}
          />
        </span>
      </div>
      {open ? (
        <ol
          id={listId}
          className="m-0 flex flex-col gap-0.5 px-3 pb-2.5 pl-9 text-xs text-muted"
          aria-label={S.batchEntries(i + 1)}
        >
          {b.entries.map((e, k) => {
            const img = imageOf(e, L);
            const t = titleOf(e, L);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 已確定的一則沒有 id
              <li key={k} className="flex min-w-0 items-center gap-1.5">
                {img ? <Thumb image={img} className="h-[22px] w-4 shrink-0 border-0" /> : null}
                <b className={cn('shrink-0 font-medium', t ? 'text-fg' : 'text-muted')}>
                  {t || S.emptyTitle}
                </b>
                <span className="min-w-0 truncate">{snippet(e.text, BATCH_ENTRY_CHARS)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

export function BatchesPanel({ onRestored }: { onRestored: () => void }) {
  const doc = useDoc((s) => s.data);
  const confirm = useConfirm();
  const L = lookupOf(doc);
  if (!doc.confirmed.length) return null;
  const total = doc.confirmed.reduce((n, b) => n + b.entries.length, 0);

  const remove = async (i: number) => {
    const b = doc.confirmed[i];
    if (
      b &&
      (await confirm({
        title: S.batchDeleteTitle(i + 1, b.entries.length),
        confirmLabel: S.deleteConfirm,
        danger: true,
      }))
    ) {
      deleteBatch(i);
    }
  };

  return (
    <Section title={<span data-testid="batches-title">{S.batchesTitle(total)}</span>} fixed>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="batches">
        {doc.confirmed.map((b, i) => (
          <BatchRow
            key={b.id}
            batch={b}
            i={i}
            count={doc.confirmed.length}
            L={L}
            onRemove={(k) => void remove(k)}
            onRestored={onRestored}
          />
        ))}
      </ol>
    </Section>
  );
}

export function ExportPanel() {
  const doc = useDoc((s) => s.data);
  const busy = useUi((s) => s.busy);
  const bundleAll = useUi((s) => s.bundleAll);
  const done = doc.confirmed.reduce((n, b) => n + b.entries.length, 0);
  const now = entriesOf(doc).length;
  const total = done + now;
  const bundleCount = bundleTargets(doc, bundleAll).length;
  return (
    <Section title={S.exportTitle} fixed>
      <p className="m-0 text-sm text-muted" data-testid="export-summary">
        {total
          ? done
            ? S.exportSummaryAll(done, now, total)
            : S.exportSummaryNow(now)
          : S.exportSummaryNone}
      </p>
      <div>
        <Button
          variant="primary"
          icon={<FileArchive />}
          loading={busy.export}
          disabled={!total || busy.export}
          onClick={() => void exportRoomZip()}
        >
          {busy.export ? S.exporting : S.exportZip}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          icon={<Images />}
          loading={busy.bundle}
          disabled={!bundleCount || busy.bundle}
          onClick={() => void exportImages()}
        >
          {busy.bundle ? S.bundling : S.bundle}
        </Button>
        <Checkbox
          checked={bundleAll}
          onCheckedChange={(v) => useUi.setState({ bundleAll: v })}
          label={S.bundleAll}
        />
      </div>
      <p className="m-0 text-xs text-muted">{S.bundleHelp}</p>
      <StatusLine area="export" />
      <UsageSection title={S.importTitle} persistKey="scenario-text:import">
        <ImportGuide />
      </UsageSection>
    </Section>
  );
}

/** CCFOLIA 讀入的步驟與注意事項（說明對話框也用） */
export function ImportGuide() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ol className="m-0 list-decimal pl-5">
        {S.importSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ul className="m-0 list-disc pl-5 text-muted">
        {S.importNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
