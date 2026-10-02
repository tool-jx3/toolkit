/**
 * 狀態清單（F25）與參數清單（F26）：新增（F27）、刪除（F28）、拖曳把手排序（F29）。
 * 拖曳用共用的 useSortable（放開才移動、只在同一個清單內、拖到視窗上下緣慢慢捲動整頁）；
 * 只有把手能開始拖，聚焦把手時 Alt＋↑／↓ 也能移動。
 */
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useRef } from 'react';
import type { CcfoliaParam, CcfoliaStatus } from '@/ccfolia';
import { Button, cn, IconButton, Section, TextInput, Tooltip, useSortable } from '@/ui';
import { NumberCell } from './controls';
import type { CharacterItem, ListKey } from './logic';
import { addItem, moveListItem, removeItem, setItem, useEditor } from './store';
import { S } from './strings';

/** 拖到視窗上下緣多少 px 內開始自動捲動（規格 F29：約 96 px） */
const EDGE_SCROLL_PX = 96;

const GRID: Record<ListKey, string> = {
  /* 窄畫面時標籤與數字欄依比例分；寬畫面時數字欄固定寬度、標籤吃掉其餘 */
  status:
    'grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(3.5rem,1fr)_minmax(3.5rem,1fr)_1.75rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_minmax(4rem,6.5rem)_minmax(4rem,6.5rem)_1.75rem]',
  params: 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem]',
};

export function ListSection({ list }: { list: ListKey }) {
  const items = useEditor((s) => s.data.character[list]) as CharacterItem[];
  const keys = useEditor((s) => s.data.keys[list]);
  const handles = useRef(new Map<string, HTMLElement>());
  const sortable = useSortable({
    count: items.length,
    mode: 'drop',
    cancelOutside: true,
    windowEdge: EDGE_SCROLL_PX,
    onMove: (from, to) => moveListItem(list, from, to),
  });
  const meta = S.lists[list];

  const addButton = (where: 'top' | 'bottom') => (
    <Button
      size="sm"
      icon={<Plus />}
      onClick={() => addItem(list)}
      aria-label={S.addTo(list)}
      data-add={where}
    >
      {S.add}
    </Button>
  );

  /* Alt＋↑／↓：移動後焦點留在同一個項目的把手上 */
  const onHandleKey = (index: number, e: KeyboardEvent<HTMLElement>) => {
    const key = keys[index];
    if (sortable.keyMove(index, e)) {
      requestAnimationFrame(() => handles.current.get(key)?.focus());
    }
  };

  const drag = sortable.dragIndex;
  return (
    <Section fixed title={meta.title} description={meta.description} actions={addButton('top')}>
      <div
        aria-hidden
        className={cn('grid items-end gap-2 px-0.5 text-xs text-muted', GRID[list])}
        data-testid={`${list}-columns`}
      >
        <span />
        {meta.columns.map((c) => (
          <span key={c} className="truncate">
            {c}
          </span>
        ))}
        <span />
      </div>
      {items.length ? (
        <ul
          aria-label={meta.title}
          data-list={list}
          className={cn('m-0 flex list-none flex-col gap-1.5 p-0', drag !== null && 'select-none')}
        >
          {items.map((item, i) => {
            const key = keys[i] ?? `${list}-${i}`;
            const { ref, ...pointer } = sortable.rowProps(i);
            const dragging = drag === i;
            const over = drag !== null && sortable.overIndex === i && drag !== i;
            const drop = over ? (i > (drag ?? 0) ? 'after' : 'before') : undefined;
            const name = S.rowName(list, item.label, i);
            return (
              <li
                key={key}
                ref={ref}
                data-dragging={dragging || undefined}
                data-drop={drop}
                className={cn(
                  'relative grid items-center gap-2 rounded-md transition-[transform,opacity] duration-(--duration-fast)',
                  GRID[list],
                  dragging && 'z-10 scale-[1.02] bg-surface-2 opacity-60 shadow-2',
                  drop === 'before' &&
                    'before:absolute before:inset-x-2 before:-top-[5px] before:h-[3px] before:rounded-full before:bg-accent',
                  drop === 'after' &&
                    'after:absolute after:inset-x-2 after:-bottom-[5px] after:h-[3px] after:rounded-full after:bg-accent',
                )}
              >
                <Tooltip content={S.dragHint}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) handles.current.set(key, el);
                      else handles.current.delete(key);
                    }}
                    aria-label={S.drag(name)}
                    aria-roledescription={S.dragRole}
                    data-drag-handle
                    {...pointer}
                    onKeyDown={(e) => onHandleKey(i, e)}
                    className="flex h-8 w-7 cursor-grab touch-none select-none items-center justify-center rounded-md border border-border bg-surface-2 text-muted hover:bg-surface-3 active:cursor-grabbing [&_svg]:size-4"
                  >
                    <GripVertical aria-hidden />
                  </button>
                </Tooltip>
                <TextInput
                  aria-label={S.cell(list, i, meta.columns[0])}
                  value={item.label}
                  onChange={(e) => setItem(list, i, { label: e.target.value })}
                />
                {list === 'status' ? (
                  <>
                    <NumberCell
                      aria-label={S.cell(list, i, meta.columns[1])}
                      value={(item as CcfoliaStatus).value}
                      onChange={(v) => setItem(list, i, { value: v })}
                    />
                    <NumberCell
                      aria-label={S.cell(list, i, meta.columns[2])}
                      value={(item as CcfoliaStatus).max}
                      onChange={(v) => setItem(list, i, { max: v })}
                    />
                  </>
                ) : (
                  <TextInput
                    aria-label={S.cell(list, i, meta.columns[1])}
                    value={(item as CcfoliaParam).value}
                    onChange={(e) => setItem(list, i, { value: e.target.value })}
                  />
                )}
                <IconButton
                  size="sm"
                  label={S.remove(name)}
                  icon={<Trash2 />}
                  onClick={() => removeItem(list, i)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          {S.emptyList(list)}
        </p>
      )}
      <div className="flex justify-end">{addButton('bottom')}</div>
    </Section>
  );
}
