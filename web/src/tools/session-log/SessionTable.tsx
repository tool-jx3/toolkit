/**
 * 跑團紀錄表格（F19～F37、F42、F43）。
 * - 欄寬由 <colgroup> 決定（table-layout: fixed），長文字依實際欄寬以「…」省略、滑過看全文。
 * - 列元件以 memo 包住，props 只有列物件（Immer 未改動的列維持同一個物件）、欄位鍵清單、選取與亮起狀態，
 *   所以打字、拖曳欄寬時不會整份清單重畫。
 * - 欄位標題：把手（拖曳或 ←／→ 排序）、右緣的調整鈕（拖曳或 ←／→ 調整寬度）。送出欄固定在右側。
 */
import { ArrowRight, GripVertical, PanelRightOpen, Plus } from 'lucide-react';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type SessionRow, statusLabel, survivalLabel, systemLabel } from '@/core/sessions';
import { Checkbox, cn, IconButton, useVirtualRows } from '@/ui';
import {
  type ColumnState,
  clampColumnWidth,
  columnLabel,
  maxWidth,
  minWidth,
  REPORT_KEY,
  REPORTED_KEY,
} from './columns';
import { dateDisplay, dateTitle, roleKind, systemKind, timeDisplay } from './logic';
import { sendToReport } from './send';
import {
  activeRowOf,
  moveColumnAction,
  moveColumnByAction,
  openAddDialog,
  openDetail,
  openEditDialog,
  resizeColumnAction,
  selectRow,
  setReported,
  useLog,
  useUi,
} from './store';
import { S } from './strings';

const SYSTEM_PILL: Readonly<Record<string, string>> = {
  coc7: 'bg-accent-soft text-accent',
  coc6: 'bg-success-soft text-success',
  emoklore: 'bg-warning-soft text-warning',
  madamisu: 'bg-danger-soft text-danger',
  other: 'bg-surface-3 text-muted',
};

const ROLE_PILL: Readonly<Record<string, string>> = {
  pl: 'bg-accent-soft text-accent',
  gm: 'bg-warning-soft text-warning',
  other: 'bg-surface-3 text-muted',
};

const pill = 'inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium';

function TextCell({ value, className }: { value: unknown; className?: string }) {
  const text = value == null ? '' : String(value);
  return (
    <span className={cn('block truncate', className)} title={text || undefined}>
      {text}
    </span>
  );
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function Cell({ row, colKey }: { row: SessionRow; colKey: string }) {
  switch (colKey) {
    case REPORTED_KEY:
      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: 只擋掉冒泡，不讓勾選變成選取列
        <span className="flex justify-center" onClick={stop} onDoubleClick={stop} onKeyDown={stop}>
          <Checkbox
            checked={Boolean(row.reported)}
            onCheckedChange={(v) => setReported(row.id, v)}
            aria-label={S.table.reportedAria(String(row.scenario ?? ''))}
          />
        </span>
      );
    case 'date':
      return (
        <span className="block truncate tabular-nums" title={dateTitle(row) || undefined}>
          {dateDisplay(row)}
        </span>
      );
    case 'scenario':
      return (
        <span className="flex min-w-0 items-center gap-1">
          <TextCell value={row.scenario} className="min-w-0 flex-1 font-semibold text-fg" />
          <IconButton
            label={S.table.openDetail(String(row.scenario ?? ''))}
            icon={<PanelRightOpen />}
            size="sm"
            variant="ghost"
            noTooltip
            className="shrink-0 text-muted"
            onClick={(e) => {
              e.stopPropagation();
              openDetail(row.id);
            }}
            onDoubleClick={stop}
          />
        </span>
      );
    case 'system':
      return row.system ? (
        <span
          className={cn(pill, SYSTEM_PILL[systemKind(row.system)])}
          title={systemLabel(row.system)}
        >
          {systemLabel(row.system)}
        </span>
      ) : null;
    case 'role':
      return row.role ? (
        <span className={cn(pill, ROLE_PILL[roleKind(row.role)])}>{String(row.role)}</span>
      ) : null;
    case 'fav':
      return <span className={row.fav ? 'text-warning' : 'text-muted'}>{row.fav ? '★' : '☆'}</span>;
    case 'time':
      return <TextCell value={timeDisplay(row.time)} className="tabular-nums" />;
    case 'status':
      return <TextCell value={statusLabel(row.status)} />;
    case 'survival':
      return <TextCell value={survivalLabel(row.survival)} />;
    case REPORT_KEY:
      return (
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-medium text-accent-contrast hover:bg-accent-hover"
          title={S.table.sendTitle}
          aria-label={S.table.sendAria(String(row.scenario ?? ''))}
          onClick={(e) => {
            e.stopPropagation();
            void sendToReport(row.id);
          }}
          onDoubleClick={stop}
        >
          <ArrowRight className="size-3.5" aria-hidden />
          {S.table.send}
        </button>
      );
    default: {
      const v = row[colKey];
      return <TextCell value={typeof v === 'string' || typeof v === 'number' ? v : ''} />;
    }
  }
}

const stickyRight = 'sticky right-0 z-[1] bg-surface';

interface RowProps {
  row: SessionRow;
  keys: readonly string[];
  selected: boolean;
  flash: boolean;
}

const Row = memo(function Row({ row, keys, selected, flash }: RowProps) {
  return (
    <tr
      data-row-id={row.id}
      data-sample={row.sample || undefined}
      data-flash={flash || undefined}
      aria-current={selected || undefined}
      onClick={() => selectRow(row.id)}
      onDoubleClick={() => openEditDialog(row.id)}
      className={cn(
        'group/row cursor-default text-sm transition-[background-color] duration-[1200ms]',
        selected ? 'bg-accent-soft' : 'hover:bg-surface-2',
        flash && 'bg-warning-soft duration-0',
        row.sample && 'text-muted italic',
      )}
    >
      {keys.map((key) => (
        <td
          key={key}
          data-col={key}
          className={cn(
            'h-10 overflow-hidden border-b border-border px-2.5 align-middle',
            key === REPORT_KEY && stickyRight,
            key === REPORT_KEY &&
              'group-data-[at-end=false]/table:shadow-[-8px_0_8px_-8px_var(--overlay)]',
            key === REPORT_KEY &&
              selected &&
              'bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))]',
          )}
        >
          <Cell row={row} colKey={key} />
        </td>
      ))}
    </tr>
  );
});

interface DragState {
  key: string;
  startX: number;
  active: boolean;
  target: string | null;
  side: 'before' | 'after';
}

function HeaderCell({
  col,
  drop,
  onHandleDown,
  onHandleKey,
}: {
  col: ColumnState;
  drop: 'before' | 'after' | null;
  onHandleDown: (e: ReactPointerEvent<HTMLButtonElement>, key: string) => void;
  onHandleKey: (e: ReactKeyboardEvent<HTMLButtonElement>, key: string) => void;
}) {
  const label = columnLabel(col);
  const resize = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { startX: e.clientX, startW: col.width };
    useLog.beginGesture();
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (!r) return;
    resizeColumnAction(col.key, r.startW + (e.clientX - r.startX));
  };
  const onResizeEnd = () => {
    if (!resize.current) return;
    resize.current = null;
    useLog.endGesture();
  };
  const onResizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      resizeColumnAction(col.key, col.width + (e.key === 'ArrowLeft' ? -step : step));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      resizeColumnAction(col.key, e.key === 'Home' ? minWidth(col.key) : maxWidth(col.key));
    }
  };
  return (
    <th
      scope="col"
      data-col={col.key}
      data-drop={drop ?? undefined}
      className={cn(
        'relative h-9 overflow-hidden border-b border-border bg-surface-2 px-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted',
        'sticky top-0 z-[2]',
        col.key === REPORT_KEY &&
          'right-0 z-[3] group-data-[at-end=false]/table:shadow-[-8px_0_8px_-8px_var(--overlay)]',
        drop === 'before' && 'shadow-[inset_3px_0_0_var(--accent)]',
        drop === 'after' && 'shadow-[inset_-3px_0_0_var(--accent)]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        {col.locked ? null : (
          <button
            type="button"
            data-col-handle={col.key}
            aria-label={S.columns.moveHandle(label)}
            title={S.columns.moveHandle(label)}
            className="-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-fg"
            onPointerDown={(e) => onHandleDown(e, col.key)}
            onKeyDown={(e) => onHandleKey(e, col.key)}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        )}
        <span className={cn('truncate', col.key === REPORTED_KEY && 'mx-auto')}>{label}</span>
      </span>
      {col.locked ? null : (
        // biome-ignore lint/a11y/useSemanticElements: 欄寬的調整鈕（可聚焦的分隔線，←／→ 調整）
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={S.columns.resizeHandle(label)}
          aria-valuenow={col.width}
          aria-valuemin={minWidth(col.key)}
          aria-valuemax={maxWidth(col.key)}
          tabIndex={0}
          data-col-resize={col.key}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none hover:bg-accent-soft focus-visible:bg-accent-soft"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onLostPointerCapture={onResizeEnd}
          onKeyDown={onResizeKey}
        />
      )}
    </th>
  );
}

export function SessionTable({ rows }: { rows: readonly SessionRow[] }) {
  const columns = useLog((s) => s.data.columns);
  const allRows = useLog((s) => s.data.rows);
  const activeId = useUi((s) => s.activeId);
  const flash = useUi((s) => s.flash);
  const reveal = useUi((s) => s.reveal);
  const selectedId = activeRowOf(allRows, activeId)?.id ?? null;
  const flashIds = useMemo(() => new Set(flash.ids), [flash]);

  const keySig = columns.map((c) => c.key).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只有欄位的鍵與順序改變時才換新的陣列（調整寬度時列不重畫）
  const keys = useMemo(() => columns.map((c) => c.key), [keySig]);
  const totalWidth = columns.reduce((s, c) => s + clampColumnWidth(c.key, c.width), 0);

  /* 送出欄的陰影：還沒捲到最右時顯示 */
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  /* 表格區看得到的寬度（最後一列的新增鈕跟著它，不會被橫向捲動藏起來） */
  const [viewWidth, setViewWidth] = useState(0);
  const updateEnd = () => {
    const el = scroller.current;
    if (!el) return;
    setAtEnd(Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 8);
    setViewWidth(el.clientWidth);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 寬度或列數改變時重算
  useEffect(() => {
    updateEnd();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateEnd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [totalWidth, rows.length]);

  /* 列很多時只畫捲動範圍內的列（列高固定：h-10＋框線） */
  const v = useVirtualRows({
    count: rows.length,
    scrollRef: scroller,
    rowHeight: 41,
    headerOffset: 37,
  });
  useLayoutEffect(() => {
    if (v.virtual)
      v.measure(scroller.current?.querySelector<HTMLElement>('tr[data-row-id]') ?? null);
  });

  /* 匯入後把第一筆捲到畫面中央（F37）；只畫一部分時先把容器捲到那一列 */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const scrollToIndex = v.scrollToIndex;
  useEffect(() => {
    if (!reveal) return;
    const index = rowsRef.current.findIndex((r) => r.id === reveal.id);
    if (index >= 0) scrollToIndex(index);
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const tr = scroller.current?.querySelector<HTMLElement>(
          `tr[data-row-id="${CSS.escape(reveal.id)}"]`,
        );
        tr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [reveal, scrollToIndex]);

  /* 欄位排序：把手拖曳（門檻 4 px）或 ←／→ */
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const focusHandle = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!focusHandle.current) return;
    const key = focusHandle.current;
    focusHandle.current = null;
    scroller.current?.querySelector<HTMLElement>(`[data-col-handle="${CSS.escape(key)}"]`)?.focus();
  });

  const targetAt = (
    x: number,
    from: string,
  ): { target: string | null; side: 'before' | 'after' } => {
    const ths = [...(scroller.current?.querySelectorAll<HTMLElement>('th[data-col]') ?? [])];
    for (const th of ths) {
      const r = th.getBoundingClientRect();
      if (x >= r.left && x < r.right) {
        const key = th.dataset.col ?? null;
        if (!key || key === from) return { target: null, side: 'before' };
        return { target: key, side: x < r.left + r.width / 2 ? 'before' : 'after' };
      }
    }
    return { target: null, side: 'before' };
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const state: DragState = {
      key,
      startX: e.clientX,
      active: false,
      target: null,
      side: 'before',
    };
    dragRef.current = state;
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.abs(ev.clientX - d.startX) < 4) return;
      const { target, side } = targetAt(ev.clientX, d.key);
      dragRef.current = { ...d, active: true, target, side };
      setDrag(dragRef.current);
    };
    const end = (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', esc, true);
      if (commit && d?.active && d.target) moveColumnAction(d.key, d.target, d.side);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      end(false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', esc, true);
  };

  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, key: string) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    focusHandle.current = key;
    moveColumnByAction(key, e.key === 'ArrowLeft' ? -1 : 1);
  };

  return (
    <div
      ref={scroller}
      onScroll={updateEnd}
      data-at-end={atEnd}
      data-dragging={drag?.active || undefined}
      className="group/table max-h-[min(640px,75dvh)] overflow-auto rounded-md border border-border bg-surface max-sm:max-h-[520px]"
    >
      <table
        aria-label={S.table.aria}
        className="table-fixed border-separate border-spacing-0"
        style={{ width: totalWidth }}
      >
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: clampColumnWidth(c.key, c.width) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <HeaderCell
                key={c.key}
                col={c}
                drop={drag?.active && drag.target === c.key ? drag.side : null}
                onHandleDown={onHandleDown}
                onHandleKey={onHandleKey}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {v.padTop ? (
            <tr aria-hidden data-spacer="top">
              <td colSpan={keys.length} className="p-0" style={{ height: v.padTop }} />
            </tr>
          ) : null}
          {rows.slice(v.start, v.end).map((row) => (
            <Row
              key={row.id}
              row={row}
              keys={keys}
              selected={row.id === selectedId}
              flash={flashIds.has(row.id)}
            />
          ))}
          {v.padBottom ? (
            <tr aria-hidden data-spacer="bottom">
              <td colSpan={keys.length} className="p-0" style={{ height: v.padBottom }} />
            </tr>
          ) : null}
          {!rows.length ? (
            <tr>
              <td colSpan={keys.length} className="px-3 py-4 text-center text-sm text-muted">
                {allRows.length ? S.table.empty : S.table.emptyAll}
              </td>
            </tr>
          ) : null}
          <tr>
            <td colSpan={keys.length} className="p-2">
              <button
                type="button"
                onClick={openAddDialog}
                data-testid="add-row"
                className="sticky left-2 flex h-10 items-center justify-center gap-2 rounded-md border-2 border-dashed border-border-strong text-sm text-accent hover:bg-accent-soft"
                style={{ width: viewWidth ? Math.max(viewWidth - 16, 120) : '100%' }}
              >
                <Plus className="size-4" aria-hidden />
                {S.table.addRow}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
