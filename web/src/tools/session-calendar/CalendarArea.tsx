/**
 * 行事曆區：工具列（月曆／年曆、換月、今天、新增、空檔日期、存成 PNG、匯入匯出）、選取日期的聚焦列、
 * 行事曆本體（套上外觀的背景與顏色）、假日資料的說明。
 */
import { ChevronLeft, ChevronRight, Download, FileDown, ImageDown, Plus, X } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { holidaySource } from '@/core/holidays';
import { Button, IconButton, MenuButton, Segmented, withShortcut } from '@/ui';
import { formatFullDay, monthTitle } from './dates';
import { backgroundCss, lookVars } from './look';
import { MonthView } from './MonthView';
import {
  assets,
  clearSamples,
  goToday,
  openNewEntry,
  selectDate,
  setView,
  shiftCursor,
  useCal,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';
import { YearView } from './YearView';

export interface CalendarActions {
  addTask: () => void;
  openFree: () => void;
  shotMonth: () => void;
  shotYear: () => void;
  readJson: () => void;
  readIcal: () => void;
  exportJson: () => void;
  exportIcal: () => void;
}

/** 背景圖片的網址（資產庫 → objectURL） */
function useImageUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!id) return;
    assets
      .url(id)
      .then((u) => alive && setUrl(u ?? null))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

function Toolbar({ actions }: { actions: CalendarActions }) {
  const view = usePrefs((s) => s.data.view);
  const cursor = useUi((s) => s.cursor);
  const samples = useCal((s) => s.data.entries.some((e) => e.sample));
  const year = view === 'year';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onValueChange={(v) => setView(v as 'month' | 'year')}
          options={[
            { value: 'month', label: S.toolbar.month },
            { value: 'year', label: S.toolbar.year },
          ]}
          aria-label={S.toolbar.view}
        />
        <div className="flex items-center gap-1">
          <IconButton
            label={year ? S.toolbar.prevYear : S.toolbar.prevMonth}
            icon={<ChevronLeft />}
            onClick={() => shiftCursor(-1)}
            data-testid="cal-prev"
          />
          <h2
            className="m-0 min-w-[7.5em] text-center text-lg font-bold tabular-nums"
            aria-live="polite"
            data-testid="cal-title"
          >
            {year ? `${cursor.year}年` : monthTitle(cursor)}
          </h2>
          <IconButton
            label={year ? S.toolbar.nextYear : S.toolbar.nextMonth}
            icon={<ChevronRight />}
            onClick={() => shiftCursor(1)}
            data-testid="cal-next"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={goToday}
          title={withShortcut(S.toolbar.today, 'home')}
        >
          {S.toolbar.today}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MenuButton
          label={S.toolbar.add}
          icon={<Plus className="size-4" aria-hidden />}
          variant="primary"
          data-testid="add-menu"
          items={[
            {
              label: S.toolbar.addSession,
              description: S.toolbar.addSessionDesc,
              shortcut: 'alt+n',
              onSelect: () => openNewEntry('session'),
              'data-testid': 'add-session',
            },
            {
              label: S.toolbar.addPlan,
              description: S.toolbar.addPlanDesc,
              shortcut: 'alt+p',
              onSelect: () => openNewEntry('plan'),
              'data-testid': 'add-plan',
            },
            {
              label: S.toolbar.addTask,
              description: S.toolbar.addTaskDesc,
              shortcut: 'alt+t',
              onSelect: actions.addTask,
              'data-testid': 'add-task',
            },
          ]}
        />
        <Button size="sm" variant="secondary" onClick={actions.openFree} data-testid="open-free">
          {S.toolbar.free}
        </Button>
        <MenuButton
          label={S.toolbar.shot}
          icon={<ImageDown className="size-4" aria-hidden />}
          data-testid="shot-menu"
          items={[
            {
              label: S.toolbar.shotMonth,
              onSelect: actions.shotMonth,
              'data-testid': 'shot-month',
            },
            { label: S.toolbar.shotYear, onSelect: actions.shotYear, 'data-testid': 'shot-year' },
          ]}
        />
        <MenuButton
          label={S.toolbar.io}
          icon={<FileDown className="size-4" aria-hidden />}
          data-testid="io-menu"
          items={[
            {
              label: S.toolbar.readJson,
              description: S.toolbar.readJsonDesc,
              onSelect: actions.readJson,
              'data-testid': 'read-json',
            },
            {
              label: S.toolbar.readIcal,
              description: S.toolbar.readIcalDesc,
              onSelect: actions.readIcal,
              'data-testid': 'read-ical',
            },
            {
              label: S.toolbar.exportJson,
              icon: <Download className="size-4" aria-hidden />,
              onSelect: actions.exportJson,
              'data-testid': 'export-json',
            },
            {
              label: S.toolbar.exportIcal,
              icon: <Download className="size-4" aria-hidden />,
              onSelect: actions.exportIcal,
              'data-testid': 'export-ical',
            },
          ]}
        />
        {samples ? (
          <span className="flex items-center gap-2 text-xs text-muted" data-testid="sample-note">
            {S.toolbar.samplesNote}
            <Button size="sm" variant="ghost" onClick={() => clearSamples()}>
              {S.toolbar.clearSamples}
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FocusBar({ actions }: { actions: CalendarActions }) {
  const date = useUi((s) => s.selectedDate);
  if (!date) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
      data-testid="focus-bar"
    >
      <span className="sr-only">{S.focus.label}</span>
      <strong className="mr-auto text-sm">{formatFullDay(date)}</strong>
      <Button size="sm" variant="secondary" onClick={() => openNewEntry('session', date)}>
        {S.focus.addSession}
      </Button>
      <Button size="sm" variant="secondary" onClick={actions.addTask}>
        {S.focus.addTask}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => openNewEntry('plan', date)}>
        {S.focus.addPlan}
      </Button>
      <IconButton label={S.focus.clear} icon={<X />} onClick={() => selectDate(null)} size="sm" />
    </div>
  );
}

function HolidayNote() {
  const year = useUi((s) => s.cursor.year);
  const show = useCal((s) => s.data.showHolidays);
  if (!show) return null;
  const src = holidaySource(year);
  if (src === 'official') return null;
  return (
    <p className="m-0 text-xs text-muted" data-testid="holiday-note">
      {src === 'estimated' ? S.calendar.estimatedNote(year) : S.calendar.noHolidayData(year)}
    </p>
  );
}

export function CalendarArea({ actions }: { actions: CalendarActions }) {
  const view = usePrefs((s) => s.data.view);
  const look = useCal((s) => s.data.look);
  const title = useCal((s) => s.data.title);
  const imageUrl = useImageUrl(look.bg === 'image' ? look.image.id : null);
  const style = { ...lookVars(look), ...backgroundCss(look, imageUrl) } as CSSProperties;
  return (
    <section aria-label={S.toolbar.region} className="flex min-w-0 flex-col gap-3">
      <Toolbar actions={actions} />
      <FocusBar actions={actions} />
      <div
        data-testid="calendar-board"
        data-bg={look.bg}
        className={
          look.bg === 'theme'
            ? 'flex min-w-0 flex-col gap-2'
            : 'flex min-w-0 flex-col gap-2 rounded-lg p-2 sm:p-3'
        }
        style={style}
      >
        {title.trim() ? (
          <p
            className="m-0 px-1 text-base font-bold text-[var(--cal-text)]"
            data-testid="cal-board-title"
          >
            {title}
          </p>
        ) : null}
        {view === 'year' ? <YearView /> : <MonthView />}
      </div>
      <HolidayNote />
    </section>
  );
}
