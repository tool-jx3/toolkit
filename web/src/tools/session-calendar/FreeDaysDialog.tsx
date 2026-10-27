/**
 * 空檔日期（F65～F72）：條件一改，下面的文字立刻更新；「複製」原封不動放進剪貼簿。
 * 期間、排除的日期每次打開都從「這個月」重來；其他條件與格式記在這台裝置。
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { holidayOf, weekdayOf } from '@/core/holidays';
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  IconButton,
  Segmented,
  Select,
  TextInput,
  TextOutputPanel,
  Toggle,
} from '@/ui';
import {
  addDays,
  addMonths,
  daysInMonth,
  firstOfMonth,
  formatShort,
  monthTitle,
  WEEKDAY_NAMES,
  weekOrder,
  type YearMonth,
} from './dates';
import {
  computeFreeDays,
  type DateStyle,
  type DayFilter,
  type FreeDayOptions,
  type FreePeriod,
  formatFreeDays,
  type Separator,
} from './freeDays';
import { entriesOn } from './layout';
import { type FreePrefs, useCal, usePrefs, useUi } from './store';
import { S } from './strings';

type PeriodKind = FreePeriod['kind'];

function MiniCalendar({
  ym,
  onYm,
  excluded,
  onToggle,
}: {
  ym: YearMonth;
  onYm: (ym: YearMonth) => void;
  excluded: ReadonlySet<string>;
  onToggle: (date: string) => void;
}) {
  const entries = useCal((s) => s.data.entries);
  const weekStart = useCal((s) => s.data.weekStart);
  const first = firstOfMonth(ym);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const n = daysInMonth(ym);
  return (
    <div className="flex w-full max-w-72 flex-col gap-1 rounded-md border border-border p-2">
      <div className="flex items-center justify-between">
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.prevMonth}
          icon={<ChevronLeft />}
          onClick={() => onYm(addMonths(ym, -1))}
        />
        <span className="text-sm font-semibold" data-testid="free-mini-title">
          {monthTitle(ym)}
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.nextMonth}
          icon={<ChevronRight />}
          onClick={() => onYm(addMonths(ym, 1))}
        />
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組日子的按鈕，不是表單的 fieldset */}
      <div
        className="grid grid-cols-7 gap-0.5"
        role="group"
        aria-label={S.free.miniCal(monthTitle(ym))}
      >
        {weekOrder(weekStart).map((w) => (
          <span key={`h${w}`} aria-hidden className="text-center text-[10px] text-muted">
            {WEEKDAY_NAMES[w]}
          </span>
        ))}
        {lead ? <span aria-hidden style={{ gridColumn: `span ${lead}` }} /> : null}
        {Array.from({ length: n }, (_, i) => {
          const date = addDays(first, i);
          const busy = entriesOn(entries, date).length > 0;
          const off = excluded.has(date);
          const w = weekdayOf(date);
          const h = holidayOf(date);
          return (
            <button
              key={date}
              type="button"
              data-free-day={date}
              aria-pressed={off}
              aria-label={`${formatShort(date)}${busy ? '（有預定）' : ''}`}
              onClick={() => onToggle(date)}
              className={cn(
                'h-7 rounded-sm text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus',
                off
                  ? 'bg-danger text-danger-contrast line-through'
                  : busy
                    ? 'bg-surface-3 text-muted'
                    : 'hover:bg-surface-3',
                !off && (w === 0 || h?.off) && 'text-danger',
                !off && w === 6 && !h?.off && 'text-accent',
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Body() {
  const entries = useCal((s) => s.data.entries);
  const weekStart = useCal((s) => s.data.weekStart);
  const cursor = useUi((s) => s.cursor);
  const prefs = usePrefs((s) => s.data.free);
  const setPrefs = (patch: Partial<FreePrefs>) =>
    usePrefs.getState().patch({ free: { ...usePrefs.getState().data.free, ...patch } });
  const [kind, setKind] = useState<PeriodKind>('month');
  const [year, setYear] = useState(cursor.year);
  const [months, setMonths] = useState<number[]>([cursor.month]);
  const [rangeStart, setRangeStart] = useState(firstOfMonth(cursor));
  const [rangeEnd, setRangeEnd] = useState(addDays(firstOfMonth(addMonths(cursor, 1)), -1));
  const [excluded, setExcluded] = useState<string[]>([]);
  const [miniYm, setMiniYm] = useState<YearMonth>(cursor);

  const period: FreePeriod =
    kind === 'month'
      ? { kind, ym: cursor }
      : kind === 'months'
        ? { kind, year, months }
        : { kind, start: rangeStart, end: rangeEnd };
  const options: FreeDayOptions = {
    period,
    dayFilter: prefs.dayFilter,
    excludeWeekdays: prefs.excludeWeekdays,
    excludeHolidays: prefs.excludeHolidays,
    excludeDates: excluded,
    busy: { session: prefs.busySession, plan: prefs.busyPlan },
    busyTentative: prefs.busyTentative,
  };
  const key = JSON.stringify(options);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 條件以 key（JSON）比較，options 每次都是新的物件
  const dates = useMemo(() => computeFreeDays(entries, options), [entries, key]);
  const text = formatFreeDays(dates, prefs.format);
  const toggleExcluded = (d: string) =>
    setExcluded((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()));

  return (
    <div className="flex flex-col gap-4" data-testid="free-dialog">
      <Field label={S.free.period}>
        <Segmented
          value={kind}
          onValueChange={(v) => setKind(v as PeriodKind)}
          options={[
            { value: 'month', label: `${S.free.periodMonth}（${monthTitle(cursor)}）` },
            { value: 'months', label: S.free.periodMonths },
            { value: 'range', label: S.free.periodRange },
          ]}
        />
      </Field>
      {kind === 'months' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              variant="ghost"
              label={S.free.prevYear}
              icon={<ChevronLeft />}
              onClick={() => setYear((y) => y - 1)}
            />
            <span className="text-sm font-semibold">{S.free.months(year)}</span>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.free.nextYear}
              icon={<ChevronRight />}
              onClick={() => setYear((y) => y + 1)}
            />
          </div>
          <div className="grid grid-cols-6 gap-1" data-testid="free-months">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const on = months.includes(m);
              return (
                <Button
                  key={m}
                  size="sm"
                  variant={on ? 'primary' : 'secondary'}
                  aria-pressed={on}
                  onClick={() =>
                    setMonths((list) => (on ? list.filter((x) => x !== m) : [...list, m]))
                  }
                >
                  {S.free.monthLabel(m)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
      {kind === 'range' ? (
        <FieldRow columns={2}>
          <Field label={S.free.from}>
            <TextInput
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </Field>
          <Field label={S.free.to}>
            <TextInput type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </Field>
        </FieldRow>
      ) : null}
      <Field label={S.free.dayFilter}>
        <Segmented
          value={prefs.dayFilter}
          onValueChange={(v) => setPrefs({ dayFilter: v as DayFilter })}
          options={[
            { value: 'all', label: S.free.filterAll },
            { value: 'off', label: S.free.filterOff },
            { value: 'work', label: S.free.filterWork },
          ]}
        />
      </Field>
      <Field label={S.free.excludeWeekdays}>
        <div className="flex flex-wrap gap-1" data-testid="free-weekdays">
          {weekOrder(weekStart).map((w) => {
            const on = prefs.excludeWeekdays.includes(w);
            return (
              <Button
                key={w}
                size="sm"
                variant={on ? 'danger' : 'secondary'}
                aria-pressed={on}
                aria-label={S.free.weekdayToggle(WEEKDAY_NAMES[w])}
                onClick={() =>
                  setPrefs({
                    excludeWeekdays: on
                      ? prefs.excludeWeekdays.filter((x) => x !== w)
                      : [...prefs.excludeWeekdays, w],
                  })
                }
                className={cn('w-9', on && 'line-through')}
              >
                {WEEKDAY_NAMES[w]}
              </Button>
            );
          })}
        </div>
      </Field>
      <Field label={S.free.excludeHolidays} layout="inline">
        <Toggle
          checked={prefs.excludeHolidays}
          onCheckedChange={(v) => setPrefs({ excludeHolidays: v })}
        />
      </Field>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{S.free.busy}</legend>
        <Checkbox
          checked={prefs.busySession}
          onCheckedChange={(v) => setPrefs({ busySession: v })}
          label={S.free.busySession}
        />
        <Checkbox
          checked={prefs.busyPlan}
          onCheckedChange={(v) => setPrefs({ busyPlan: v })}
          label={S.free.busyPlan}
        />
        <Checkbox
          checked={prefs.busyTentative}
          onCheckedChange={(v) => setPrefs({ busyTentative: v })}
          label={S.free.busyTentative}
          disabled={!prefs.busySession}
        />
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{S.free.excludeDates}</span>
        <span className="text-xs text-muted">{S.free.excludeDatesHint}</span>
        <div className="flex flex-wrap gap-1" data-testid="free-excluded">
          {excluded.length ? (
            excluded.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-0.5 rounded-full border border-border py-0.5 pr-0.5 pl-2 text-xs"
              >
                {formatShort(d)}
                <IconButton
                  size="sm"
                  variant="ghost"
                  noTooltip
                  label={S.free.removeExcluded(formatShort(d))}
                  icon={<X />}
                  onClick={() => toggleExcluded(d)}
                />
              </span>
            ))
          ) : (
            <span className="text-xs text-muted">{S.free.excludedNone}</span>
          )}
        </div>
        <MiniCalendar
          ym={miniYm}
          onYm={setMiniYm}
          excluded={new Set(excluded)}
          onToggle={toggleExcluded}
        />
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{S.free.format}</legend>
        <FieldRow columns={2}>
          <Field label={S.free.style}>
            <Select
              value={prefs.format.style}
              onValueChange={(v) =>
                setPrefs({ format: { ...prefs.format, style: v as DateStyle } })
              }
              options={(Object.keys(S.free.styles) as DateStyle[]).map((k) => ({
                value: k,
                label: S.free.styles[k],
              }))}
            />
          </Field>
          <Field label={S.free.separator}>
            <Segmented
              value={prefs.format.separator}
              onValueChange={(v) =>
                setPrefs({ format: { ...prefs.format, separator: v as Separator } })
              }
              options={[
                { value: 'newline', label: S.free.sepNewline },
                { value: 'comma', label: S.free.sepComma },
                { value: 'space', label: S.free.sepSpace },
              ]}
              size="sm"
            />
          </Field>
        </FieldRow>
        <Checkbox
          checked={prefs.format.weekday}
          onCheckedChange={(v) => setPrefs({ format: { ...prefs.format, weekday: v } })}
          label={S.free.weekday}
        />
        <Checkbox
          checked={prefs.format.groupByMonth}
          onCheckedChange={(v) => setPrefs({ format: { ...prefs.format, groupByMonth: v } })}
          label={S.free.group}
        />
        <Checkbox
          checked={prefs.format.mergeRuns}
          onCheckedChange={(v) => setPrefs({ format: { ...prefs.format, mergeRuns: v } })}
          label={S.free.merge}
        />
      </fieldset>
      <TextOutputPanel
        text={text}
        title={S.free.output}
        count={() => S.free.count(dates.length)}
        placeholder={S.free.empty}
      />
    </div>
  );
}

export function FreeDaysDialog() {
  const open = useUi((s) => s.freeOpen);
  if (!open) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) useUi.setState({ freeOpen: false });
      }}
      title={S.free.title}
      description={S.free.description}
      size="lg"
      footer={<DialogClose>{S.free.close}</DialogClose>}
    >
      <Body />
    </Dialog>
  );
}
