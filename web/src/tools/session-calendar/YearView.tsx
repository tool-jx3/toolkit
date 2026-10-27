/**
 * 年曆（F22～F24）：12 個月的小月曆；有預定的日子塗上那一筆的顏色（連續的日子頭尾圓角），國定假日與週末上色。
 * 點月份（整張卡片是按鈕）打開那個月的月曆。
 */
import { useMemo } from 'react';
import { readableTextColor } from '@/core/color';
import { dayNumber, holidayOf, weekdayOf } from '@/core/holidays';
import { cn } from '@/ui';
import { addDays, daysInMonth, firstOfMonth, today, WEEKDAY_NAMES, weekOrder } from './dates';
import { yearMarks } from './layout';
import { colorCss, colorSlice, spanDays } from './model';
import { openMonth, useCal, useUi } from './store';
import { S } from './strings';

export function YearView() {
  const data = useCal((s) => s.data);
  const year = useUi((s) => s.cursor.year);
  const marks = useMemo(() => yearMarks(data.entries, year), [data.entries, year]);
  const t = today();
  const order = weekOrder(data.weekStart);

  return (
    // biome-ignore lint/a11y/useSemanticElements: 12 個月的按鈕，不是表單的 fieldset
    <div
      role="group"
      aria-label={S.calendar.yearLabel(year)}
      data-cal-year={year}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4"
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const ym = { year, month };
        const first = firstOfMonth(ym);
        const n = daysInMonth(ym);
        const lead = (weekdayOf(first) - data.weekStart + 7) % 7;
        const count = data.entries.filter(
          (e) => e.start <= addDays(first, n - 1) && e.end >= first,
        ).length;
        return (
          <button
            key={month}
            type="button"
            data-cal-mini={month}
            aria-label={S.calendar.openMonth(month, count)}
            onClick={() => openMonth(ym)}
            className="flex min-w-0 flex-col gap-1 rounded-md border border-[var(--cal-border)] bg-[var(--cal-card)] p-1.5 text-left outline-none hover:border-[var(--cal-accent)] focus-visible:ring-2 focus-visible:ring-focus sm:p-2"
          >
            <span className="px-0.5 text-sm font-bold text-[var(--cal-text)]">{month}月</span>
            <span className="grid grid-cols-7 gap-y-0.5" aria-hidden>
              {order.map((w) => (
                <span
                  key={`h${w}`}
                  className="text-center text-[9px] font-semibold sm:text-[10px]"
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
                </span>
              ))}
              {lead ? <span style={{ gridColumn: `span ${lead}` }} /> : null}
              {Array.from({ length: n }, (_, k) => {
                const date = addDays(first, k);
                const mark = marks.get(date);
                const h = data.showHolidays ? holidayOf(date) : null;
                const w = weekdayOf(date);
                const color = mark
                  ? readableTextColor(mark.entry.color.c1)
                  : h && !h.off
                    ? 'var(--cal-text)'
                    : w === 0 || h?.off
                      ? 'var(--cal-holiday)'
                      : w === 6
                        ? 'var(--cal-saturday)'
                        : 'var(--cal-text)';
                return (
                  <span
                    key={date}
                    data-mini-day={date}
                    data-marked={mark ? mark.entry.id : undefined}
                    className={cn(
                      'flex h-4 items-center justify-center text-[9px] leading-none tabular-nums sm:h-[1.125rem] sm:text-[10px]',
                      mark && 'font-bold',
                      mark?.head && 'rounded-l-full',
                      mark?.tail && 'rounded-r-full',
                      date === t && 'ring-1 ring-[var(--cal-accent)] ring-inset rounded-full',
                    )}
                    style={{
                      color,
                      background: mark
                        ? colorCss(
                            colorSlice(
                              mark.entry.color,
                              dayNumber(date) - dayNumber(mark.entry.start),
                              1,
                              spanDays(mark.entry),
                            ),
                          )
                        : undefined,
                    }}
                  >
                    {k + 1}
                  </span>
                );
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
