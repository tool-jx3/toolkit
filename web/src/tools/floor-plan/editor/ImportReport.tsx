/**
 * 讀原作新版的地圖檔之後：通知上的「詳細」與「匯入時的調整」對話框（規格 F213、D25）。
 * 逐項列出換成相近種類的東西（原作的名稱與代號 → 本工具的種類、個數）與略過的家具、門窗、設定。
 * 2026-10 第二批起原作的房間、門窗、牆種類都照讀，換掉的只剩疊在牆上的牆洞、崩塌與將來的版本才有的代號。
 */
import type { ReactNode } from 'react';
import { Dialog } from '@/ui';
import type { CompatEntry, CompatReport } from '../model/compat';
import type { OpeningKind, RoomCategory, WallKind } from '../model/types';
import { S } from '../strings';
import { setEditor, useEditor } from './store';

/** 略過的代號最多列幾種 */
const MAX_CODES = 40;

/** 通知的說明：一行摘要＋「詳細」 */
export function importNotice(summary: string): ReactNode {
  return (
    <>
      {summary}
      <button
        type="button"
        className="ml-1 rounded-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        aria-label={S.compat.detailsAlt}
        data-testid="import-report-open"
        onClick={() => setEditor({ importReportOpen: true })}
      >
        {S.compat.details}
      </button>
    </>
  );
}

const C = S.compat;

/** 對話框裡的順序：房間、門窗、牆、疊在牆上的素材（同一類照檔案裡出現的順序） */
const TYPE_ORDER: Record<CompatEntry['type'], number> = {
  room: 0,
  opening: 1,
  wall: 2,
  overlay: 3,
};

function fromName(e: CompatEntry): string {
  const names = C.names[e.type] as Record<string, string>;
  return `${Object.hasOwn(names, e.from) ? names[e.from] : C.unknown}（${e.from}）`;
}

function toName(e: CompatEntry): string {
  if (e.type === 'room') return S.categories[e.to as RoomCategory] ?? e.to;
  if (e.type === 'wall') return S.walls[e.to as WallKind] ?? e.to;
  return S.openings[e.to as OpeningKind] ?? e.to;
}

const codeList = (list: readonly { code: string; n: number }[]) =>
  C.codes(
    list
      .slice(0, MAX_CODES)
      .map((d) => `${d.code} ×${d.n}`)
      .join('、'),
    list.length,
    MAX_CODES,
  );

function Row({ label, count, sub }: { label: string; count: string; sub?: string }) {
  return (
    <li className="flex flex-col gap-0.5 border-border border-b py-1.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0 text-muted tabular-nums">{count}</span>
      </div>
      {sub ? <p className="break-all text-muted text-xs">{sub}</p> : null}
    </li>
  );
}

function Rows({ report }: { report: CompatReport }) {
  const dropped: ReactNode[] = [];
  const items = report.droppedItems.reduce((s, d) => s + d.n, 0);
  if (items)
    dropped.push(
      <Row
        key="items"
        label={C.items}
        count={C.count(items, '件')}
        sub={codeList(report.droppedItems.map((d) => ({ code: d.t, n: d.n })))}
      />,
    );
  const openings = report.droppedOpenings.reduce((s, d) => s + d.n, 0);
  if (openings)
    dropped.push(
      <Row
        key="openings"
        label={C.openings}
        count={C.count(openings, '個')}
        sub={codeList(report.droppedOpenings.map((d) => ({ code: d.kind, n: d.n })))}
      />,
    );
  if (report.roomWalls)
    dropped.push(<Row key="walls" label={C.roomWalls} count={C.count(report.roomWalls, '間')} />);
  return (
    <div className="flex flex-col gap-4 text-sm">
      {report.converted.length ? (
        <section aria-label={C.convertedHead}>
          <h3 className="mb-1 font-medium text-fg">{C.convertedHead}</h3>
          <ul data-testid="import-report-converted">
            {[...report.converted]
              .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
              .map((e) => (
                <Row
                  key={`${e.type}:${e.from}`}
                  label={`${fromName(e)} → ${toName(e)}`}
                  count={C.count(e.n, C.units[e.type])}
                />
              ))}
          </ul>
        </section>
      ) : null}
      {dropped.length ? (
        <section aria-label={C.droppedHead}>
          <h3 className="mb-1 font-medium text-fg">{C.droppedHead}</h3>
          <ul data-testid="import-report-dropped">{dropped}</ul>
        </section>
      ) : null}
    </div>
  );
}

export function ImportReportDialog() {
  const open = useEditor((s) => s.importReportOpen);
  const report = useEditor((s) => s.importReport);
  const link = useEditor((s) => s.importSource === 'link');
  return (
    <Dialog
      open={open && !!report}
      onOpenChange={(o) => setEditor({ importReportOpen: o })}
      title={link ? C.titleLink : C.title}
      description={link ? C.introLink : C.intro}
      size="md"
    >
      <div data-testid="import-report">{report ? <Rows report={report} /> : null}</div>
    </Dialog>
  );
}
