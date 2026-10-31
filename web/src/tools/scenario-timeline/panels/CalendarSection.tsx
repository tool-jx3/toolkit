/**
 * 「專案」分頁的架空曆（規格 F92；時間寫法是架空年時才有）：使用月份與日、月份清單（名稱、天數、排序、刪除）、
 * 寫到時刻（F110）、一週的每天（選填）與第 1 年第 1 個月第 1 日是星期幾。改月份時存檔的時間跟著換算（一步復原）；
 * 關掉月份會失去月、日時、關掉「寫到時刻」會失去時刻時先確認；有時間被調整（刪掉的月份、天數變少）時通知。
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Field,
  IconButton,
  NumberInput,
  Section,
  Select,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import {
  CAL_LIMITS,
  type Calendar,
  calInfo,
  defaultCalendar,
  monthId,
  splitWeekdays,
} from '../model/calendar';
import { planCalendar } from '../model/calendarEdit';
import { notify } from '../notify';
import { applyCalendar, docNow, undo, useDoc } from '../store';
import { S } from '../strings';

const g = historyGesture(useDoc);

/** 不寫到時刻的架空曆（沒有 clock 這個欄位，和第二批的資料相同） */
function withoutClock(cal: Calendar): Calendar {
  const { clock: _clock, ...rest } = cal;
  return rest;
}

/** 換成新的架空曆：會失去月、日或時刻時先確認；調整了時間時通知（可以復原） */
async function change(next: Calendar, confirm: ReturnType<typeof useConfirm>) {
  const doc = docNow();
  const plan = planCalendar(doc, next, S.untitled);
  const examples = plan.examples.map((x) => `${x.name}：${x.from} → ${x.to}`);
  if (plan.lossy) {
    /* 只關掉「寫到時刻」（月份還在）：時刻拿掉、只留日子 */
    const clockOff = !!doc.calendar.clock && !next.clock && next.months.length > 0;
    const ok = await confirm({
      title: clockOff ? S.calClockOffTitle : S.calOffTitle,
      description: [
        clockOff ? S.calClockOffDesc(plan.lossy) : S.calOffDesc(plan.lossy),
        ...examples,
      ].map((t) => (
        <span key={t} className="block">
          {t}
        </span>
      )),
      confirmLabel: clockOff ? S.calClockOffApply : S.calOffApply,
      danger: true,
    });
    if (!ok) return;
  }
  const done = applyCalendar(next);
  if (done?.adjusted)
    notify({
      title: S.calAdjusted(done.adjusted),
      description: examples.join('；') || undefined,
      tone: 'warning',
      duration: 8000,
      action: { label: S.undoAction, onClick: () => undo() },
    });
}

export function CalendarSection({ pl }: { pl: boolean }) {
  const cal = useDoc((s) => s.data.calendar);
  const confirm = useConfirm();
  const info = calInfo(cal);
  const on = !!info;
  const [weekText, setWeekText] = useState(cal.weekdays.join('、'));
  useEffect(() => setWeekText(cal.weekdays.join('、')), [cal.weekdays]);

  const set = (next: Calendar) => void change(next, confirm);
  const months = cal.months;
  const moveMonth = (i: number, d: -1 | 1) => {
    const list = [...months];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ ...cal, months: list });
  };

  return (
    <Section title={S.calTitle} fixed description={S.calHint}>
      <Field label={S.calOn} layout="inline" hint={on ? undefined : S.calOffHint}>
        <Toggle
          checked={on}
          disabled={pl}
          onCheckedChange={(v) =>
            set(
              v
                ? { ...defaultCalendar(), weekdays: cal.weekdays, weekStart: cal.weekStart }
                : { ...withoutClock(cal), months: [] },
            )
          }
        />
      </Field>
      {on && info ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={S.calMonths}>
            {months.map((m, i) => (
              <li key={m.id} className="flex min-w-0 items-center gap-1.5" data-month-row={i + 1}>
                <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">
                  {i + 1}
                </span>
                <TextInput
                  value={m.name}
                  aria-label={S.calMonthName(i + 1)}
                  placeholder={`${i + 1} 月`}
                  maxLength={CAL_LIMITS.name}
                  disabled={pl}
                  className="min-w-0 flex-1"
                  data-field="month-name"
                  onFocus={g.begin}
                  onBlur={g.commit}
                  onChange={(e) =>
                    useDoc.getState().update((d) => {
                      const x = d.calendar.months.find((y) => y.id === m.id);
                      if (x) x.name = e.target.value.slice(0, CAL_LIMITS.name);
                    })
                  }
                />
                <NumberInput
                  value={m.days}
                  min={1}
                  max={CAL_LIMITS.days}
                  unit="天"
                  size="sm"
                  disabled={pl}
                  aria-label={S.calMonthDays(i + 1)}
                  className="w-20 shrink-0"
                  onChange={() => {}}
                  onCommit={(v) => {
                    if (v === m.days) return;
                    set({
                      ...cal,
                      months: months.map((x) => (x.id === m.id ? { ...x, days: v } : x)),
                    });
                  }}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.calMonthUp(i + 1)}
                  icon={<ArrowUp />}
                  disabled={pl || i === 0}
                  onClick={() => moveMonth(i, -1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.calMonthDown(i + 1)}
                  icon={<ArrowDown />}
                  disabled={pl || i === months.length - 1}
                  onClick={() => moveMonth(i, 1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.calMonthDelete(i + 1)}
                  icon={<Trash2 />}
                  disabled={pl || months.length <= 1}
                  onClick={() => set({ ...cal, months: months.filter((x) => x.id !== m.id) })}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<Plus />}
              disabled={pl || months.length >= CAL_LIMITS.months}
              data-testid="add-month"
              onClick={() =>
                set({
                  ...cal,
                  months: [...months, { id: monthId(), name: `${months.length + 1} 月`, days: 30 }],
                })
              }
            >
              {S.calAddMonth}
            </Button>
            <span className="text-xs text-muted" data-testid="cal-summary">
              {S.calSummary(info.M, info.D)}
            </span>
          </div>
          <Field label={S.calClock} layout="inline" hint={S.calClockHint}>
            <Toggle
              checked={info.clock}
              disabled={pl}
              onCheckedChange={(v) => set(v ? { ...cal, clock: true } : withoutClock(cal))}
            />
          </Field>
          <Field label={S.calWeekdays} hint={S.calWeekdaysHint}>
            <TextInput
              value={weekText}
              disabled={pl}
              data-field="weekdays"
              placeholder="月曜、火曜、水曜、木曜、金曜、土曜、日曜"
              onChange={(e) => setWeekText(e.target.value)}
              onBlur={() => {
                const list = splitWeekdays(weekText);
                const next = list.length >= 2 ? list : [];
                if (next.join('、') === cal.weekdays.join('、')) {
                  setWeekText(next.join('、'));
                  return;
                }
                set({
                  ...cal,
                  weekdays: next,
                  weekStart: Math.min(cal.weekStart, Math.max(0, next.length - 1)),
                });
              }}
            />
          </Field>
          {cal.weekdays.length >= 2 ? (
            <Field label={S.calWeekStart}>
              <Select
                value={String(cal.weekStart)}
                disabled={pl}
                data-field="week-start"
                onValueChange={(v) => set({ ...cal, weekStart: Number(v) })}
                options={cal.weekdays.map((w, i) => ({ value: String(i), label: w }))}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
