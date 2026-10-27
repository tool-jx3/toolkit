/**
 * 月曆（F08～F21）：每週一列，日子的格子是按鈕（點一下選取、雙擊新增場次、方向鍵移動），
 * 預定與跨日的場次畫成色條、單日的場次與準備事項是小卡。
 * 拖曳：在日子上按住拖過幾天 → 新增那幾天的預定；拖曳色條或小卡 → 換日子（天數不變）。觸控時先按住 0.4 秒再拖。
 */
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { readableTextColor } from '@/core/color';
import { addDays, dayNumber, type HolidayDay, holidayOf, weekdayOf } from '@/core/holidays';
import { cn } from '@/ui';
import { formatDay, monthTitle, monthWeeks, today, WEEKDAY_NAMES, weekOrder, ymOf } from './dates';
import { type BarSegment, type DayChip, entriesOn, layoutWeek } from './layout';
import { colorCss, colorSlice, type Entry, entryTitle, spanDays, timeRange } from './model';
import { notify } from './notify';
import {
  moveEntry,
  openEditEntry,
  openNewEntry,
  selectDate,
  selectEntry,
  setCursor,
  useCal,
  useUi,
} from './store';
import { S } from './strings';

/** 一週最多畫幾條色條、每天最多幾張小卡 */
export const MAX_BARS = 3;
export const MAX_CHIPS = 3;
/** 觸控：按住多久才開始拖曳（ms）、滑動多少算捲動（px）；滑鼠：移動多少算拖曳（px） */
const LONG_PRESS_MS = 400;
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 4;

interface DragState {
  kind: 'range' | 'move';
  pointerId: number;
  x: number;
  y: number;
  origin: string;
  current: string;
  entry?: Entry;
  /** move：抓的那天距離開始日幾天 */
  offset: number;
  active: boolean;
  touch: boolean;
  timer: number | null;
}

/** 指標下的日子（色條、小卡底下的格子也找得到） */
function dateAt(x: number, y: number): string | null {
  const list =
    typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
  for (const el of list) {
    const d = (el as HTMLElement).dataset?.calDay;
    if (d) return d;
  }
  return null;
}

function useCalendarDrag() {
  const ref = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (ref.current?.active) e.preventDefault();
    };
    window.addEventListener('touchmove', preventScroll, { passive: false });
    return () => window.removeEventListener('touchmove', preventScroll);
  }, []);

  const show = (d: DragState) => {
    if (d.kind === 'range') {
      const [s, e] = d.origin <= d.current ? [d.origin, d.current] : [d.current, d.origin];
      useUi.setState({ drag: { kind: 'range', start: s, end: e } });
    } else if (d.entry) {
      const start = addDays(d.current, -d.offset);
      useUi.setState({
        drag: { kind: 'move', start, end: addDays(start, spanDays(d.entry) - 1) },
      });
    }
  };

  const stop = () => {
    const d = ref.current;
    if (d?.timer) window.clearTimeout(d.timer);
    ref.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    useUi.setState({ drag: null });
  };

  function onMove(e: PointerEvent) {
    const d = ref.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.active) {
      if (d.touch) {
        if (dist > TOUCH_SLOP) stop();
        return;
      }
      if (dist <= MOUSE_SLOP) return;
      d.active = true;
    }
    const at = dateAt(e.clientX, e.clientY);
    if (at && at !== d.current) {
      d.current = at;
      show(d);
    }
  }

  function onUp(e: PointerEvent) {
    const d = ref.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const at = (d.active && dateAt(e.clientX, e.clientY)) || d.current;
    const wasActive = d.active;
    stop();
    if (!wasActive) return;
    if (d.kind === 'range') {
      if (at === d.origin) return;
      suppress();
      const [s, t] = d.origin <= at ? [d.origin, at] : [at, d.origin];
      selectDate(s);
      openNewEntry('plan', s, t);
      return;
    }
    if (!d.entry) return;
    const start = addDays(at, -d.offset);
    if (start === d.entry.start) return;
    suppress();
    moveEntry(d.entry.id, start);
    notify({ title: S.entry.moved, tone: 'success' });
  }

  function onCancel(e: PointerEvent) {
    if (ref.current && e.pointerId === ref.current.pointerId) stop();
  }

  const suppress = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const begin = (e: ReactPointerEvent, kind: DragState['kind'], origin: string, entry?: Entry) => {
    if (e.button !== 0 || ref.current) return;
    const touch = e.pointerType === 'touch';
    const d: DragState = {
      kind,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin,
      current: origin,
      entry,
      offset: entry ? dayNumber(origin) - dayNumber(entry.start) : 0,
      active: false,
      touch,
      timer: null,
    };
    if (touch) {
      d.timer = window.setTimeout(() => {
        d.timer = null;
        if (ref.current !== d) return;
        d.active = true;
        show(d);
      }, LONG_PRESS_MS);
    }
    ref.current = d;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return { begin, suppressClick };
}

const dayColor = (date: string, h: HolidayDay | null): string => {
  if (h && !h.off) return 'var(--cal-text)';
  const w = weekdayOf(date);
  if (w === 0 || h?.off) return 'var(--cal-holiday)';
  if (w === 6) return 'var(--cal-saturday)';
  return 'var(--cal-text)';
};

function barStyle(seg: BarSegment, weekStart: string): CSSProperties {
  const e = seg.entry;
  const from = dayNumber(addDays(weekStart, seg.col)) - dayNumber(e.start);
  const c = colorSlice(e.color, from, seg.span, spanDays(e));
  return {
    gridColumn: `${seg.col + 1} / span ${seg.span}`,
    gridRow: seg.lane + 2,
    background: colorCss(c),
    color: readableTextColor(c.c1),
  };
}

export function MonthView() {
  const data = useCal((s) => s.data);
  const cursor = useUi((s) => s.cursor);
  const selectedDate = useUi((s) => s.selectedDate);
  const selectedId = useUi((s) => s.selectedId);
  const drag = useUi((s) => s.drag);
  const focusDate = useUi((s) => s.focusDate);
  const grid = useRef<HTMLDivElement>(null);
  const { begin, suppressClick } = useCalendarDrag();
  const t = today();

  const weeks = useMemo(() => monthWeeks(cursor, data.weekStart), [cursor, data.weekStart]);
  const layouts = useMemo(
    () =>
      weeks.map((w) =>
        layoutWeek(w, data.entries, {
          maxBars: MAX_BARS,
          maxChips: MAX_CHIPS,
          showTasks: data.showTasks,
        }),
      ),
    [weeks, data.entries, data.showTasks],
  );
  const all = weeks.flat();
  const tabDate =
    [selectedDate, t].find((d) => d && all.includes(d)) ??
    all.find((d) => ymOf(d).month === cursor.month);

  useEffect(() => {
    if (!focusDate) return;
    const el = grid.current?.querySelector<HTMLElement>(`[data-cal-day="${focusDate}"]`);
    if (el) {
      el.focus();
      useUi.setState({ focusDate: null });
    }
  }, [focusDate]);

  const onDayKey = (e: React.KeyboardEvent, date: string) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const n = step[e.key];
    if (n === undefined || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const next = addDays(date, n);
    selectDate(next);
    const ym = ymOf(next);
    if (ym.month !== cursor.month || ym.year !== cursor.year) {
      if (!all.includes(next)) setCursor(ym);
    }
    useUi.setState({ focusDate: next });
  };

  const inDrag = (date: string) => Boolean(drag && date >= drag.start && date <= drag.end);
  const dayEntries = (date: string) => entriesOn(data.entries, date).length;

  const entryPointer = (e: ReactPointerEvent, entry: Entry, date: string) => {
    e.stopPropagation();
    begin(e, 'move', date, entry);
  };
  const entryClick = (e: React.MouseEvent, entry: Entry, date: string) => {
    e.stopPropagation();
    if (suppressClick.current) return;
    selectEntry(entry.id, date);
  };

  const chip = (c: DayChip, date: string) => {
    const e = c.entry;
    const selected = e.id === selectedId;
    if (c.type === 'task')
      return (
        <button
          key={`t-${c.task.id}`}
          type="button"
          tabIndex={-1}
          data-cal-task={c.task.id}
          title={`${S.calendar.taskPrefix}${c.task.title}（${entryTitle(e)}）`}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => entryClick(ev, e, e.start)}
          className={cn(
            'pointer-events-auto block w-full truncate rounded-sm px-1 text-left text-[11px] leading-4 text-[var(--cal-muted)] hover:bg-[var(--cal-border)]/40',
            c.task.done && 'line-through opacity-70',
          )}
        >
          {c.task.done ? '☑' : '☐'} {c.task.title}
        </button>
      );
    return (
      <button
        key={e.id}
        type="button"
        tabIndex={-1}
        data-cal-entry={e.id}
        data-kind={e.kind}
        data-status={e.status}
        aria-pressed={selected}
        title={`${timeRange(e)} ${entryTitle(e)}`.trim()}
        onPointerDown={(ev) => entryPointer(ev, e, date)}
        onClick={(ev) => entryClick(ev, e, date)}
        onDoubleClick={(ev) => {
          ev.stopPropagation();
          openEditEntry(e.id);
        }}
        style={{ borderLeftColor: e.color.c1 }}
        className={cn(
          'pointer-events-auto flex w-full min-w-0 touch-manipulation items-baseline gap-1 rounded-sm border border-l-4 border-[var(--cal-border)] bg-[var(--cal-card)] px-1 text-left text-[11px] leading-4 text-[var(--cal-text)] select-none',
          e.status === 'tentative' && 'border-dashed',
          e.status === 'completed' && 'opacity-70',
          selected && 'ring-2 ring-[var(--cal-accent)]',
        )}
      >
        {e.startTime ? (
          <span className="shrink-0 tabular-nums text-[var(--cal-muted)] max-sm:hidden">
            {e.startTime}
          </span>
        ) : null}
        <span className="min-w-0 truncate font-medium">
          {e.status === 'completed' ? '✓ ' : ''}
          {entryTitle(e)}
        </span>
      </button>
    );
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 一整個月的日子按鈕，不是表單的 fieldset
    <div
      ref={grid}
      data-cal-month={`${cursor.year}-${cursor.month}`}
      role="group"
      aria-label={S.calendar.monthLabel(monthTitle(cursor))}
      className="overflow-hidden rounded-md border border-[var(--cal-border)] select-none"
      onContextMenu={(e) => {
        if (drag) e.preventDefault();
      }}
    >
      <div className="grid grid-cols-7 border-b border-[var(--cal-border)]" aria-hidden>
        {weekOrder(data.weekStart).map((w) => (
          <div
            key={w}
            className="py-1 text-center text-xs font-semibold"
            style={{
              color:
                w === 0
                  ? 'var(--cal-holiday)'
                  : w === 6
                    ? 'var(--cal-saturday)'
                    : 'var(--cal-muted)',
            }}
          >
            {WEEKDAY_NAMES[w]}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const l = layouts[wi];
        return (
          <div
            key={week[0]}
            data-week={week[0]}
            className="relative grid grid-cols-7 border-b border-[var(--cal-border)] [--cal-head:2.375rem] last:border-b-0 sm:[--cal-head:1.625rem]"
            style={{
              gridTemplateRows: `var(--cal-head) ${l.lanes ? `repeat(${l.lanes}, 1.375rem) ` : ''}minmax(2.75rem, auto)`,
            }}
          >
            {week.map((date, i) => {
              const h = data.showHolidays ? holidayOf(date) : null;
              const other = ymOf(date).month !== cursor.month;
              const isToday = date === t;
              const selected = date === selectedDate;
              const count = dayEntries(date);
              return (
                <button
                  key={date}
                  type="button"
                  data-cal-day={date}
                  data-today={isToday || undefined}
                  data-holiday={h?.off ? h.name : undefined}
                  data-in-drag={inDrag(date) || undefined}
                  tabIndex={date === tabDate ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={S.calendar.dayLabel(formatDay(date), h?.name ?? '', count, isToday)}
                  onPointerDown={(e) => begin(e, 'range', date)}
                  onClick={() => {
                    if (suppressClick.current) return;
                    selectDate(date);
                  }}
                  onDoubleClick={() => openNewEntry('session', date)}
                  onKeyDown={(e) => onDayKey(e, date)}
                  style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                  className={cn(
                    'relative flex min-w-0 touch-manipulation flex-col items-stretch border-[var(--cal-border)] text-left outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                    i < 6 && 'border-r',
                    'bg-[var(--cal-card)] hover:brightness-[1.04]',
                    other && 'opacity-45',
                    selected && 'ring-2 ring-[var(--cal-accent)] ring-inset',
                    inDrag(date) && 'bg-[color-mix(in_srgb,var(--cal-accent)_22%,var(--cal-card))]',
                  )}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5 px-1 pt-1 sm:flex-row sm:items-center sm:gap-1">
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                        isToday && 'bg-[var(--cal-accent)] text-[var(--cal-card)]',
                      )}
                      style={isToday ? undefined : { color: dayColor(date, h) }}
                    >
                      {Number(date.slice(8))}
                    </span>
                    {h ? (
                      <span
                        className="max-w-full min-w-0 truncate text-[9px] leading-tight sm:text-[10px]"
                        style={{ color: h.off ? 'var(--cal-holiday)' : 'var(--cal-muted)' }}
                        title={
                          h.source === 'estimated' ? `${h.name}（${S.calendar.estimated}）` : h.name
                        }
                      >
                        {h.name}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {l.bars.map((seg) => {
              const e = seg.entry;
              const selected = e.id === selectedId;
              const date = addDays(week[0], seg.col);
              return (
                <button
                  key={`${e.id}-${week[0]}`}
                  type="button"
                  tabIndex={-1}
                  data-cal-entry={e.id}
                  data-kind={e.kind}
                  aria-pressed={selected}
                  title={entryTitle(e)}
                  onPointerDown={(ev) => {
                    const at = dateAt(ev.clientX, ev.clientY) ?? date;
                    entryPointer(ev, e, at);
                  }}
                  onClick={(ev) => entryClick(ev, e, date)}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    openEditEntry(e.id);
                  }}
                  style={barStyle(seg, week[0])}
                  className={cn(
                    'z-10 mx-0.5 my-px flex min-w-0 cursor-grab touch-manipulation items-center overflow-hidden px-1.5 text-left text-[11px] leading-none font-semibold shadow-1 select-none',
                    seg.head ? 'rounded-l-md' : 'ml-0 rounded-l-none',
                    seg.tail ? 'rounded-r-md' : 'mr-0 rounded-r-none',
                    e.kind === 'session' && e.status === 'tentative' && 'opacity-80',
                    selected && 'ring-2 ring-[var(--cal-accent)] ring-offset-1',
                  )}
                >
                  <span className="truncate">
                    {e.kind === 'session' && e.startTime && seg.head ? `${e.startTime} ` : ''}
                    {entryTitle(e)}
                  </span>
                </button>
              );
            })}
            {week.map((date, i) => {
              const chips = l.chips[i];
              const more = l.more[i];
              if (!chips.length && !more) return null;
              return (
                <div
                  key={`c-${date}`}
                  style={{ gridColumn: i + 1, gridRow: l.lanes + 2 }}
                  className="pointer-events-none z-10 flex min-w-0 flex-col gap-0.5 px-0.5 pt-0.5 pb-1"
                >
                  {chips.map((c) => chip(c, date))}
                  {more ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      data-cal-more={date}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => selectDate(date)}
                      className="pointer-events-auto truncate rounded-sm px-1 text-left text-[10px] text-[var(--cal-muted)] hover:underline"
                    >
                      {S.calendar.more(more)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
