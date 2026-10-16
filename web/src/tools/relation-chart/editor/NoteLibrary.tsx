/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼庫（F190；原作的 renderLibSide 的 notes 分支、renderNoteLibList）：左欄＝說明＋尺寸範本（2 × 2～10 × 10，
 * 點一個＝在畫布上新增一張）；右欄＝關閉過的便利貼（最新在前；點一筆＝放回畫布並移出紀錄；刪除模式＝只刪紀錄，
 * 留墓碑、版面不位移）。整個專案共用、不能拖曳排序。
 */
import { Trash2 } from 'lucide-react';
import { noteLook } from '../engine/notes';
import { NOTE_CELL_MAX, NOTE_CELL_MIN, NOTE_GRID, noteBinName } from '../model/notes';
import { addNote, deleteBinItem, restoreNote } from '../state/noteActions';
import { useProject, useUi } from '../state/store';
import { S } from '../strings';
import type { LibAction } from './LabelLibrary';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';

const T = S.noteLib;

export const NOTE_ACTIONS: readonly LibAction[] = [
  { key: 'del', icon: <Trash2 />, tip: T.act.del, tone: 'danger' },
];

/** 小紙片（紙色＋紙邊） */
function Paper({ size, palette }: { size: number; palette: 'dark' | 'light' }) {
  const look = noteLook(palette);
  return (
    <span
      className="shrink-0 rounded-[3px] border-[1.5px]"
      style={{ width: size, height: size, background: look.paper, borderColor: look.edge }}
      aria-hidden
    />
  );
}

export function NoteLibSide() {
  const mode = useUi((u) => u.libMode);
  const palette = useProject((s) => s.data.sheets[s.data.active]?.settings.palette ?? 'dark');
  const look = noteLook(palette);
  const cells: number[] = [];
  for (let n = NOTE_CELL_MIN; n <= NOTE_CELL_MAX; n++) cells.push(n);
  return (
    <div className="flex flex-col gap-3" data-testid="notelib-side">
      <p className="text-xs text-muted">{mode === 'del' ? T.delHint : T.hint}</p>
      <section className="flex flex-col gap-1.5" aria-label={T.tplTitle}>
        <h3 className="text-xs font-semibold text-muted">{T.tplTitle}</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {cells.map((n) => {
            const box = 8 + n * 3;
            return (
              <button
                key={n}
                type="button"
                title={T.tplTip}
                className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-2 p-1.5 text-xs hover:border-accent"
                onClick={() => {
                  if (useUi.getState().readonly) return;
                  addNote(n);
                }}
                data-testid="notelib-tpl"
                data-cells={n}
              >
                <span className="flex h-[40px] items-center justify-center" aria-hidden>
                  <span
                    className="rounded-[2px] border"
                    style={{
                      width: box,
                      height: box,
                      background: look.paper,
                      borderColor: look.edge,
                    }}
                  />
                </span>
                {T.cells(n, n)}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function NoteLibList({ query }: { query: string }) {
  const bin = useProject((s) => s.data.noteBin);
  const palette = useProject((s) => s.data.sheets[s.data.active]?.settings.palette ?? 'dark');
  const mode = useUi((u) => u.libMode);
  const thumb = useThumbSize();
  const q = query.trim().toLowerCase();
  const nameOf = (text: string, chart: boolean) =>
    noteBinName(text) ?? (chart ? S.note.chartDefault : S.note.empty);
  const rows: EntryRow[] = bin
    .filter((e) => !q || e.text.toLowerCase().includes(q))
    .map((e) => ({
      id: e.id,
      name: nameOf(e.text, !!e.chart),
      thumb: <Paper size={Math.round(thumb * 0.8)} palette={palette} />,
      meta: T.cells(e.w / NOTE_GRID, e.h / NOTE_GRID),
      onSheet: false,
      sheets: [],
    }));
  return (
    <EntryList
      rows={rows}
      sheets={[]}
      grouped={false}
      sig={`notes|${q}`}
      empty={bin.length ? T.noMatch : T.empty}
      label={T.list}
      sortable={false}
      picked={null}
      onClick={(id) => {
        if (useUi.getState().readonly) return;
        if (mode === 'del') deleteBinItem(id);
        else restoreNote(id);
      }}
      onReorder={() => {}}
      onDeleteMany={(ids) => {
        for (const id of ids) deleteBinItem(id);
      }}
      groupDelText={() => ''}
    />
  );
}
