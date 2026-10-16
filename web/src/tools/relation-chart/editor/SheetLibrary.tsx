/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 分頁庫（F027；原作的 renderSheetLibList、renderLibSide 的 sheets 分支）：左欄＝說明；右欄＝刪除分頁時封存的分頁
 * （新的在前；圖示：時間軸＝膠卷、其他＝關係圖；「6 角色 · 6 關係 · 時間」／時間軸「N 影格 · 時間」；搜尋比對名稱）。
 * 沒有模式時點條目沒反應；模式：匯入當前（還原成新分頁，可以連續）、複製、刪除（留墓碑）；拖曳排序。管理動作不進復原。
 */
import { ArrowUpToLine, Copy, Film, Network, Trash2 } from 'lucide-react';
import { useToast } from '@/ui';
import { sheetName } from '../engine/geom';
import {
  copySheetLibItem,
  deleteSheetLibItems,
  reorderSheetLib,
  restoreFromSheetLib,
} from '../state/sheetLibActions';
import { useProject, useUi } from '../state/store';
import { S } from '../strings';
import type { LibAction } from './LabelLibrary';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';

const T = S.sheetLib;

export const SHEETLIB_ACTIONS: readonly LibAction[] = [
  { key: 'import', icon: <ArrowUpToLine />, tip: T.act.import },
  { key: 'copy', icon: <Copy />, tip: T.act.copy },
  { key: 'del', icon: <Trash2 />, tip: T.act.del, tone: 'danger' },
];

/** 「10/16 上午06:23」（原作的 snapTime） */
export function shortTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const h = d.getHours();
  const ap = h < 12 ? '上午' : '下午';
  const hh = String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${ap}${hh}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SheetLibSide() {
  const mode = useUi((u) => u.libMode);
  return (
    <div className="flex flex-col gap-2 text-xs text-muted" data-testid="sheetlib-side">
      <p>
        {mode === 'import'
          ? T.importTip
          : mode === 'copy'
            ? T.copyTip
            : mode === 'del'
              ? T.delTip
              : T.hint}
      </p>
      <p>{T.dragTip}</p>
    </div>
  );
}

export function SheetLibList({ query }: { query: string }) {
  const lib = useProject((s) => s.data.sheetLib);
  const mode = useUi((u) => u.libMode);
  const thumb = useThumbSize();
  const toast = useToast();
  const q = query.trim().toLowerCase();
  const rows: EntryRow[] = lib
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .map((e) => {
      const s = e.sheet;
      const Icon = s.tl ? Film : Network;
      const meta = s.tl
        ? `${T.metaTl(s.tl.frames.length)} · ${shortTime(e.savedAt)}`
        : `${T.meta(s.chars.length, s.rels.length)} · ${shortTime(e.savedAt)}`;
      return {
        id: e.id,
        name: e.name || sheetName(s),
        thumb: (
          <span
            className="grid shrink-0 place-items-center rounded-md bg-surface-3 text-muted"
            style={{ width: thumb, height: thumb }}
            aria-hidden
          >
            <Icon className="size-[60%]" />
          </span>
        ),
        meta,
        onSheet: false,
        sheets: [],
      };
    });
  return (
    <EntryList
      rows={rows}
      sheets={[]}
      grouped={false}
      sig={`sheetlib|${q}`}
      empty={lib.length ? T.noMatch : T.empty}
      label={T.list}
      picked={null}
      onClick={(id) => {
        if (useUi.getState().readonly) return;
        if (mode === 'import') {
          const it = lib.find((x) => x.id === id);
          if (restoreFromSheetLib(id) && it) toast({ title: T.restored(it.name), tone: 'success' });
        } else if (mode === 'copy') copySheetLibItem(id);
        else if (mode === 'del') deleteSheetLibItems([id]);
      }}
      onReorder={reorderSheetLib}
      onDeleteMany={deleteSheetLibItems}
      groupDelText={() => ''}
    />
  );
}
