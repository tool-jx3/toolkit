/**
 * 匯出（規格 1.9）：摘要、匯出房間 ZIP、匯出素材 ZIP、狀態；CCFOLIA 的讀入方法與注意事項（F43）。
 */
import { FileArchive, Images } from 'lucide-react';
import { Button, Section } from '@/ui';
import { exportAssetsZip, exportRoomZip } from './actions';
import { viewsOf } from './derived';
import { MAX_PIECES } from './model';
import { StatusLine } from './parts';
import { useDoc, useUi } from './store';
import { S } from './strings';

export function ImportGuide() {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed" data-testid="import-guide">
      <ol className="m-0 list-decimal pl-5">
        {S.importSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="m-0 font-semibold">{S.importNotesTitle}</p>
      <ul className="m-0 list-disc pl-5">
        {S.importNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function OutputPanel() {
  const doc = useDoc((s) => s.data);
  const busy = useUi((s) => s.busy);
  const views = viewsOf(doc);
  const board = views.filter((v) => v.active).length;
  const tooMany = views.length > MAX_PIECES;
  return (
    <>
      <Section title={S.exportTitle} fixed>
        <p className="m-0 text-sm" data-testid="export-summary">
          {!views.length
            ? S.exportNone
            : tooMany
              ? S.exportTooMany(views.length, MAX_PIECES)
              : S.exportSummary(views.length, board)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={<FileArchive />}
            disabled={!views.length || busy.room}
            loading={busy.room}
            onClick={() => void exportRoomZip()}
          >
            {S.exportRoom}
          </Button>
          <Button
            icon={<Images />}
            disabled={!doc.images.length || busy.assets}
            loading={busy.assets}
            onClick={() => void exportAssetsZip()}
          >
            {S.exportAssets}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.assetsHelp}</p>
        <StatusLine area="export" />
      </Section>
      <Section title={S.importTitle} defaultOpen={false} persistKey="ccfolia-batch:import">
        <ImportGuide />
      </Section>
    </>
  );
}
