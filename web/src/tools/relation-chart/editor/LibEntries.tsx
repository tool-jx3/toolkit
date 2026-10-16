/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色庫與關係庫共用的清單（原作的 renderCharLibList／renderRelLibList、libGroupSecs、libDelFrozenSecs）：
 * 一列＝一個條目（縮圖、名字、已在目前分頁的 ✓、「N 分頁 · K 變體」）；依分頁分組（同一條目被多張分頁用會出現在多組，
 * 最後是「未使用」組）；拖曳排序（分組時只在同一組內）；刪除模式中刪掉的留墓碑、版面不位移；分組＋刪除模式有「刪除整組」。
 */
import { Check } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { Button, useConfirm, useSortable } from '@/ui';
import { sheetName } from '../engine/geom';
import type { Sheet } from '../model/types';
import { holdHistory, releaseHistory, usePrefs, useUi } from '../state/store';
import { S } from '../strings';

export interface EntryRow {
  id: number;
  name: string;
  thumb: ReactNode;
  /** 「N 分頁 · K 變體」 */
  meta: string;
  onSheet: boolean;
  /** 依分頁分組時屬於哪幾張分頁（索引） */
  sheets: readonly number[];
}

interface Sec {
  key: string;
  title: string | null;
  ids: number[];
  sheet: number | null;
}

const THUMB = { sm: 24, md: 32, lg: 44 } as const;

function Row({
  r,
  rowProps,
  onKeyDown,
  dragging,
  picked,
}: {
  r: EntryRow;
  rowProps: object;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  dragging: boolean;
  picked: boolean;
}) {
  const level = usePrefs((p) => p.data.libLevel);
  return (
    // biome-ignore lint/a11y/useSemanticElements: 要能從整列拖曳排序（按鈕不能開始拖）
    <div
      {...rowProps}
      role="button"
      tabIndex={0}
      title={level === 'min' ? `${r.name}（${r.meta}）` : undefined}
      onKeyDown={onKeyDown}
      className={`flex min-w-0 cursor-pointer select-none items-center gap-2 rounded-md border px-1.5 py-1 ${
        picked ? 'border-accent ring-2 ring-accent/40' : 'border-border'
      } bg-surface-2 ${dragging ? 'shadow-2' : ''}`}
      data-testid="lib-entry"
      data-entry-id={r.id}
    >
      {r.thumb}
      {level === 'min' ? (
        <span className="sr-only">{r.name}</span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1 text-sm">
            <span className="min-w-0 truncate" data-testid="lib-entry-name">
              {r.name}
            </span>
            {r.onSheet ? (
              <Check className="size-3.5 shrink-0 text-accent" aria-label={S.charLib.onSheet} />
            ) : null}
          </span>
          {level === 'detail' && r.meta ? (
            <span className="truncate text-xs text-muted" data-testid="lib-entry-meta">
              {r.meta}
            </span>
          ) : null}
        </span>
      )}
      {level === 'min' && r.onSheet ? (
        <Check className="size-3 shrink-0 text-accent" aria-label={S.charLib.onSheet} />
      ) : null}
    </div>
  );
}

function Ghost({ name }: { name: string }) {
  return (
    <div
      className="flex min-w-0 select-none items-center gap-2 rounded-md border border-dashed border-border px-1.5 py-1 opacity-40"
      aria-hidden
      data-testid="lib-ghost"
    >
      <span className="min-w-0 flex-1 truncate text-sm line-through">{name}</span>
      <span className="shrink-0 text-xs">{S.charLib.ghost}</span>
    </div>
  );
}

function Group({
  sec,
  rows,
  live,
  frozen,
  onClick,
  onReorder,
  onDeleteGroup,
  sortable: canSort,
  picked: pickedId,
}: {
  sec: Sec;
  rows: readonly { id: number; name: string }[];
  live: ReadonlyMap<number, EntryRow>;
  frozen: boolean;
  onClick: (id: number) => void;
  onReorder: (groupIds: readonly number[], from: number, to: number) => void;
  onDeleteGroup: (() => void) | null;
  sortable: boolean;
  picked: number | null | undefined;
}) {
  const mode = useUi((u) => u.libMode);
  const libPick = useUi((u) => u.libPick);
  const pick = pickedId === undefined ? libPick : pickedId;
  const level = usePrefs((p) => p.data.libLevel);
  const ids = sec.ids.filter((id) => live.has(id));
  const sortable = useSortable({
    count: ids.length,
    axis: 'xy',
    disabled: mode !== null || frozen || !canSort,
    onMove: (from, to) => onReorder(ids, from, to),
    onMoveStart: () => holdHistory('lib'),
    onMoveEnd: () => releaseHistory('lib'),
    onClick: (i) => onClick(ids[i]),
  });
  return (
    <div className="flex flex-col gap-1.5" data-testid="lib-group">
      {sec.title !== null ? (
        <div className="flex items-center gap-2 border-b border-border pb-0.5">
          <span className="min-w-0 truncate text-xs font-semibold text-muted">{sec.title}</span>
          {onDeleteGroup ? (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={onDeleteGroup}
              data-testid="lib-group-delete"
            >
              {S.lib.groupDelAll}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div
        className={
          level === 'min'
            ? 'flex flex-wrap gap-1.5'
            : 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5'
        }
      >
        {rows.map((x) => {
          const r = live.get(x.id);
          if (!r) return <Ghost key={x.id} name={x.name} />;
          const i = ids.indexOf(x.id);
          return (
            <Row
              key={x.id}
              r={r}
              picked={mode === null && pick === r.id}
              rowProps={sortable.rowProps(i)}
              dragging={sortable.dragIndex === i}
              onKeyDown={(e) => {
                if (sortable.keyMove(i, e)) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick(r.id);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** 縮圖的大小（跟著檔案庫的「項目大小」） */
export function useThumbSize(): number {
  return THUMB[usePrefs((p) => p.data.libSize)];
}

export function EntryList({
  rows,
  sheets,
  grouped,
  sig,
  empty,
  label,
  onClick,
  onReorder,
  onDeleteMany,
  groupDelText,
  sortable = true,
  picked,
}: {
  /** 可以拖曳排序（便利貼庫不行，原作） */
  sortable?: boolean;
  /** 左欄正在看的那一項（沒給＝角色庫、關係庫的 libPick） */
  picked?: number | null;
  rows: readonly EntryRow[];
  sheets: readonly Sheet[];
  grouped: boolean;
  /** 刪除模式凍結版面的鍵（換了搜尋、篩選、分組＝重新凍結） */
  sig: string;
  empty: string;
  label: string;
  onClick: (id: number) => void;
  onReorder: (groupIds: readonly number[], from: number, to: number) => void;
  onDeleteMany: (ids: number[]) => void;
  groupDelText: (sheet: string | null, n: number) => string;
}) {
  const mode = useUi((u) => u.libMode);
  const confirm = useConfirm();
  const frozen = useRef<{
    sig: string;
    secs: (Sec & { rows: { id: number; name: string }[] })[];
  } | null>(null);
  const live = new Map(rows.map((r) => [r.id, r]));
  const secs: Sec[] = [];
  if (grouped) {
    sheets.forEach((s, i) => {
      const ids = rows.filter((r) => r.sheets.includes(i)).map((r) => r.id);
      if (ids.length) secs.push({ key: `s${s.id}`, title: sheetName(s), ids, sheet: i });
    });
    const unused = rows.filter((r) => !r.sheets.length).map((r) => r.id);
    if (unused.length)
      secs.push({ key: 'unused', title: S.lib.groupUnused, ids: unused, sheet: null });
  } else if (rows.length)
    secs.push({ key: 'all', title: null, ids: rows.map((r) => r.id), sheet: null });
  if (mode !== 'del') frozen.current = null;
  let shown = secs.map((s) => ({
    ...s,
    rows: s.ids.map((id) => ({ id, name: live.get(id)?.name ?? '' })),
  }));
  if (mode === 'del') {
    if (frozen.current?.sig !== sig) frozen.current = { sig, secs: shown };
    const seen = new Set(frozen.current.secs.flatMap((s) => s.ids));
    shown = [...frozen.current.secs];
    const extra = rows.filter((r) => !seen.has(r.id));
    if (extra.length)
      shown.push({
        key: 'new',
        title: null,
        ids: extra.map((r) => r.id),
        sheet: null,
        rows: extra.map((r) => ({ id: r.id, name: r.name })),
      });
  }
  if (!shown.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <section className="flex flex-col gap-3" aria-label={label} data-testid="lib-list">
      {shown.map((s) => {
        const alive = s.ids.filter((id) => live.has(id));
        return (
          <Group
            key={s.key}
            sec={s}
            rows={s.rows}
            live={live}
            frozen={mode === 'del'}
            sortable={sortable}
            picked={picked}
            onClick={onClick}
            onReorder={onReorder}
            onDeleteGroup={
              mode === 'del' && grouped && s.title !== null && alive.length
                ? async () => {
                    const ok = await confirm({
                      title: groupDelText(
                        s.sheet === null ? null : sheetName(sheets[s.sheet]),
                        alive.length,
                      ),
                      confirmLabel: S.lib.groupDelAll,
                      danger: true,
                    });
                    if (ok) onDeleteMany(alive);
                  }
                : null
            }
          />
        );
      })}
    </section>
  );
}
