/**
 * 右側（窄畫面在下方）：選取的那一筆的詳細或選取那一天的清單（F31～F33）、今天的預定（F26）、準備事項清單（F27～F30）。
 */
import { ExternalLink, GripVertical, Pencil, Send, Trash2, X } from 'lucide-react';
import { type RefObject, useEffect, useRef } from 'react';
import { holidayOf } from '@/core/holidays';
import { Button, Checkbox, cn, IconButton, Segmented, SortableList, useConfirm } from '@/ui';
import { formatDay, formatRange, formatShort, weekRange } from './dates';
import { entriesOn } from './layout';
import { colorCss, type Entry, entryTitle, timeRange } from './model';
import { notify } from './notify';
import { sendToLog, sendToReport } from './send';
import {
  deleteEntry,
  moveTask,
  openEditEntry,
  selectDate,
  selectEntry,
  setTaskDone,
  useCal,
  usePrefs,
  useToday,
  useUi,
} from './store';
import { S } from './strings';
import { allTasks, type TaskItem, taskState, weekTasks } from './tasks';

const panel = 'flex flex-col gap-2 rounded-lg border border-border bg-surface p-3';

function Swatch({ entry }: { entry: Entry }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-full"
      style={{ background: colorCss(entry.color) }}
    />
  );
}

/** 一筆的按鈕（清單用） */
function EntryButton({ entry, date }: { entry: Entry; date?: string }) {
  const selected = useUi((s) => s.selectedId === entry.id);
  return (
    <button
      type="button"
      onClick={() => selectEntry(entry.id, date)}
      onDoubleClick={() => openEditEntry(entry.id)}
      aria-pressed={selected}
      data-list-entry={entry.id}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus',
        selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2 hover:bg-surface-3',
      )}
    >
      <Swatch entry={entry} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{entryTitle(entry)}</span>
        <span className="truncate text-xs text-muted">
          {[
            entry.start === entry.end ? '' : formatRange(entry.start, entry.end),
            timeRange(entry),
            entry.kind === 'session' ? entry.system : '',
            entry.kind === 'session' && entry.status !== 'scheduled' ? S.status[entry.status] : '',
          ]
            .filter(Boolean)
            .join('・') || (entry.kind === 'plan' ? S.detail.kindPlan : S.detail.kindSession)}
        </span>
      </span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EntryDetail({ entry }: { entry: Entry }) {
  const confirm = useConfirm();
  const t = useToday();
  const session = entry.kind === 'session';
  const remove = async () => {
    const ok = await confirm({
      title: S.entry.deleteTitle,
      description: S.entry.deleteDesc(entryTitle(entry)),
      confirmLabel: S.entry.deleteConfirm,
      danger: true,
    });
    if (!ok) return;
    deleteEntry(entry.id);
    notify({ title: S.entry.deleted, tone: 'success' });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="entry-detail" data-entry={entry.id}>
      <div className="flex items-start gap-2">
        <Swatch entry={entry} />
        <h3 className="m-0 min-w-0 flex-1 text-base font-bold break-words">{entryTitle(entry)}</h3>
        <span className="shrink-0 rounded-full border border-border px-2 text-xs text-muted">
          {session ? S.detail.kindSession : S.detail.kindPlan}
        </span>
      </div>
      <dl className="m-0 flex flex-col gap-1">
        <Row label={S.detail.date}>{formatRange(entry.start, entry.end)}</Row>
        {timeRange(entry) ? <Row label={S.detail.time}>{timeRange(entry)}</Row> : null}
        {session ? (
          <>
            <Row label={S.detail.system}>{entry.system || S.detail.none}</Row>
            <Row label={S.detail.gm}>{entry.gm || S.detail.none}</Row>
            <Row label={S.detail.format}>{entry.format || S.detail.none}</Row>
            <Row label={S.detail.status}>
              <span
                className={cn(
                  'rounded-full px-2 text-xs',
                  entry.status === 'completed'
                    ? 'bg-success-soft text-success'
                    : entry.status === 'tentative'
                      ? 'bg-warning-soft text-warning'
                      : 'bg-accent-soft text-accent',
                )}
              >
                {S.status[entry.status]}
              </span>
            </Row>
          </>
        ) : null}
        <Row label={S.detail.calendar}>{entry.calendar}</Row>
      </dl>
      {session ? (
        <>
          <h4 className="m-0 mt-1 text-xs font-semibold text-muted">{S.detail.players}</h4>
          {entry.players.length ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
              {entry.players.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 參加者沒有識別碼，順序就是身分
                <li key={i}>
                  <strong>{p.pl || '—'}</strong>
                  {p.pc ? <span className="text-muted"> ／ {p.pc}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted">{S.detail.none}</p>
          )}
          <h4 className="m-0 mt-1 text-xs font-semibold text-muted">{S.detail.links}</h4>
          {entry.links.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-1 p-0 text-sm">
              {entry.links.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 連結沒有識別碼
                <li key={i}>
                  {l.url ? (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-accent hover:underline"
                    >
                      {l.label || l.url}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted">
                      {l.label} {S.detail.noLink}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted">{S.detail.none}</p>
          )}
          <h4 className="m-0 mt-1 text-xs font-semibold text-muted">{S.detail.tasks}</h4>
          {entry.tasks.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {entry.tasks.map((task) => {
                const st = taskState(task, t);
                return (
                  <li key={task.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={task.done}
                      onCheckedChange={(v) => setTaskDone(entry.id, task.id, v)}
                      label={
                        <span className={cn(task.done && 'text-muted line-through')}>
                          {task.title}
                        </span>
                      }
                    />
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {task.due ? formatShort(task.due) : ''}
                    </span>
                    {S.tasks.state[st] ? <StateChip state={st} /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted">{S.detail.none}</p>
          )}
          {entry.tags.length ? (
            <p className="m-0 text-sm text-accent">{entry.tags.map((x) => `#${x}`).join(' ')}</p>
          ) : null}
        </>
      ) : null}
      {entry.memo.trim() ? (
        <p className="m-0 rounded-md bg-surface-2 p-2 text-sm whitespace-pre-wrap">{entry.memo}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="primary"
          icon={<Pencil className="size-4" />}
          onClick={() => openEditEntry(entry.id)}
        >
          {S.detail.edit}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>
          {S.detail.delete}
        </Button>
        {session ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<Send className="size-4" />}
              onClick={() => void sendToLog(entry.id)}
              data-testid="send-log"
            >
              {S.detail.sendLog}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Send className="size-4" />}
              onClick={() => void sendToReport(entry.id)}
              data-testid="send-report"
            >
              {S.detail.sendReport}
            </Button>
          </>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.detail.moveHint}</p>
    </div>
  );
}

/** 窄畫面選取一筆後，等多久再把詳細捲進畫面（雙擊的第二下要先落在原處） */
export const REVEAL_DELAY_MS = 450;

/**
 * 窄畫面（詳細欄在月曆下面）選取一筆時，詳細看不到就捲進畫面。等一下才捲：雙擊（開編輯）時不捲，
 * 選取換了、對話框開著也不捲。
 */
function useRevealDetail(ref: RefObject<HTMLElement | null>, selectedId: string | null) {
  useEffect(() => {
    if (!selectedId || typeof window === 'undefined') return;
    if (window.matchMedia?.('(min-width: 1024px)').matches) return;
    const timer = window.setTimeout(() => {
      if (useUi.getState().selectedId !== selectedId) return;
      if (
        useUi.getState().entryDialog ||
        document.querySelector('[role="dialog"],[role="alertdialog"]')
      )
        return;
      const el = ref.current?.querySelector<HTMLElement>('[data-testid="entry-detail"]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top >= 56 && r.top < window.innerHeight - 96) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }, REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ref, selectedId]);
}

export function DetailPanel() {
  const entries = useCal((s) => s.data.entries);
  const showHolidays = useCal((s) => s.data.showHolidays);
  const selectedId = useUi((s) => s.selectedId);
  const selectedDate = useUi((s) => s.selectedDate);
  const ref = useRef<HTMLElement>(null);
  const entry = selectedId ? entries.find((e) => e.id === selectedId) : undefined;
  useRevealDetail(ref, entry ? entry.id : null);
  if (!entry && !selectedDate) return null;
  const day = selectedDate ? entriesOn(entries, selectedDate) : [];
  const h = selectedDate && showHolidays ? holidayOf(selectedDate) : null;
  return (
    <section
      ref={ref}
      aria-label={S.detail.title}
      className={cn(panel, '[&_[data-testid=entry-detail]]:scroll-mt-16')}
      data-testid="detail-panel"
    >
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-sm font-bold">
          {selectedDate ? formatDay(selectedDate) : S.detail.title}
          {h ? (
            <span className={cn('ml-2 text-xs font-normal', h.off ? 'text-danger' : 'text-muted')}>
              {h.name}
              {h.source === 'estimated' ? `（${S.calendar.estimated}）` : ''}
            </span>
          ) : null}
        </h2>
        <IconButton
          label={S.detail.close}
          icon={<X />}
          size="sm"
          variant="ghost"
          onClick={() => {
            selectDate(null);
          }}
        />
      </div>
      {selectedDate ? (
        day.length ? (
          <div className="flex flex-col gap-1" data-testid="day-list">
            {day.map((e) => (
              <EntryButton key={e.id} entry={e} date={selectedDate} />
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-muted">{S.detail.dayEmpty}</p>
        )
      ) : null}
      {entry ? (
        <div className={cn(selectedDate && 'border-t border-border pt-2')}>
          <EntryDetail entry={entry} />
        </div>
      ) : null}
    </section>
  );
}

export function TodayPanel() {
  const entries = useCal((s) => s.data.entries);
  const t = useToday();
  const list = entriesOn(entries, t);
  return (
    <section aria-label={S.today.title} className={panel} data-testid="today-panel">
      <h2 className="m-0 text-sm font-bold">
        {S.today.title}
        <span className="ml-2 text-xs font-normal text-muted">{formatDay(t)}</span>
      </h2>
      {list.length ? (
        <div className="flex flex-col gap-1">
          {list.map((e) => (
            <EntryButton key={e.id} entry={e} date={t} />
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted">{S.today.empty}</p>
      )}
    </section>
  );
}

function StateChip({ state }: { state: ReturnType<typeof taskState> }) {
  const text = S.tasks.state[state];
  if (!text) return null;
  return (
    <span
      data-task-state={state}
      className={cn(
        'shrink-0 rounded-full px-1.5 text-[11px]',
        state === 'done' && 'bg-success-soft text-success',
        state === 'overdue' && 'bg-danger-soft text-danger',
        (state === 'today' || state === 'soon') && 'bg-warning-soft text-warning',
      )}
    >
      {text}
    </span>
  );
}

export function TaskPanel({ onAdd }: { onAdd: () => void }) {
  const entries = useCal((s) => s.data.entries);
  const weekStart = useCal((s) => s.data.weekStart);
  const range = usePrefs((s) => s.data.taskRange);
  const selectedId = useUi((s) => s.selectedId);
  const t = useToday();
  const items: TaskItem[] = range === 'week' ? weekTasks(entries, t, weekStart) : allTasks(entries);
  const [ws, we] = weekRange(t, weekStart);
  return (
    <section aria-label={S.tasks.title} className={panel} data-testid="task-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 flex-1 text-sm font-bold">
          {S.tasks.title}
          {range === 'week' ? (
            <span className="ml-2 text-xs font-normal text-muted">
              {S.tasks.weekRange(formatShort(ws), formatShort(we))}
            </span>
          ) : null}
        </h2>
        <Segmented
          size="sm"
          value={range}
          onValueChange={(v) => usePrefs.getState().patch({ taskRange: v as 'week' | 'all' })}
          options={[
            { value: 'week', label: S.tasks.week },
            { value: 'all', label: S.tasks.all },
          ]}
          aria-label={S.tasks.range}
        />
      </div>
      <SortableList
        aria-label={S.tasks.list}
        items={items}
        getId={(it) => it.task.id}
        mode="drop"
        handleOnly
        selectedId={items.find((it) => it.entry.id === selectedId)?.task.id ?? null}
        onSelect={(id) => {
          const it = items.find((x) => x.task.id === id);
          if (it) selectEntry(it.entry.id);
        }}
        onMove={(from, to) => {
          const a = items[from];
          const b = items[to];
          if (!a || !b) return;
          moveTask(a.task.id, b.task.id);
          notify({ title: S.tasks.moved, tone: 'success' });
        }}
        empty={range === 'week' ? S.tasks.emptyWeek : S.tasks.empty}
        renderItem={({ task, entry }) => {
          const st = taskState(task, t);
          return (
            <div className="flex items-center gap-2 px-2 py-1.5" data-task={task.id}>
              <Checkbox
                checked={task.done}
                onCheckedChange={(v) => {
                  setTaskDone(entry.id, task.id, v);
                  if (v) notify({ title: S.tasks.done(task.title), tone: 'success' });
                }}
                aria-label={task.title}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate text-sm', task.done && 'text-muted line-through')}>
                  {task.title}
                </span>
                <span className="truncate text-xs text-muted">
                  {entryTitle(entry)}・{task.due ? formatShort(task.due) : S.tasks.noDue}
                </span>
              </span>
              <StateChip state={st} />
              <span
                data-drag-handle
                aria-hidden
                title={S.tasks.handle}
                className="cursor-grab touch-none text-muted"
              >
                <GripVertical className="size-4" />
              </span>
            </div>
          );
        }}
      />
      <Button size="sm" variant="ghost" onClick={onAdd} className="self-start">
        ＋ {S.tasks.add}
      </Button>
    </section>
  );
}
