/**
 * 團期行事曆：跑團的場次、準備事項與其他預定排在同一張月曆／年曆上，算空檔日期、存成 PNG、
 * 匯出入 JSON／iCal，並能把一團送到跑團紀錄簿或團報產生器。
 * 規格：docs/refactor/specs/session-calendar.md。
 *
 * 版面（ToolShell 的 body）：寬畫面左邊是行事曆區（工具列、聚焦列、月曆或年曆）、右邊是詳細、今天、準備事項、外觀；
 * 窄畫面上下排列（行事曆在上）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { downloadBlob, downloadText } from '@/core/files';
import { useSaveError, useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, useConfirm, WindowDrop, withShortcut } from '@/ui';
import { type CalendarActions, CalendarArea } from './CalendarArea';
import { EntryDialog } from './EntryDialog';
import { FreeDaysDialog } from './FreeDaysDialog';
import { ImportDialog, pickImport, startImport } from './ImportDialog';
import { exportIcal } from './ical';
import { exportJsonText } from './json';
import { LookPanel } from './LookPanel';
import { entryTitle } from './model';
import { NotifyBridge, notify } from './notify';
import { ProjectActions } from './ProjectActions';
import { DetailPanel, TaskPanel, TodayPanel } from './SidePanels';
import { SendBridge } from './send';
import { renderMonthPng, renderYearPng, shotFileName } from './shot';
import {
  assets,
  calNow,
  deleteEntry,
  goToday,
  openNewEntry,
  refreshToday,
  selectDate,
  setView,
  shiftCursor,
  shiftEntry,
  TOOL_ID,
  useCal,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';
import { openTaskDialog, TaskDialog } from './TaskDialog';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 檔名用的本地日期 YYYYMMDD */
const localStamp = (d: Date = new Date()) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol className="mt-2">
        {S.usage.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

async function backgroundImage() {
  const look = calNow().look;
  if (look.bg !== 'image' || !look.image.id) return null;
  return (await assets.bitmap(look.image.id).catch(() => undefined)) ?? null;
}

const actions: CalendarActions = {
  addTask: openTaskDialog,
  openFree: () => useUi.setState({ freeOpen: true }),
  shotMonth: () => void shot('month'),
  shotYear: () => void shot('year'),
  readJson: () => void pickImport('json'),
  readIcal: () => void pickImport('ical'),
  exportJson: () => {
    const name = `${fileBase()}_${localStamp()}.json`;
    downloadText(exportJsonText(calNow()), name, 'application/json');
    notify({ title: S.io.exportedJson(name), tone: 'success' });
  },
  exportIcal: () => {
    const name = `${fileBase()}_${localStamp()}.ics`;
    downloadText(exportIcal(calNow().entries, { title: calNow().title }), name, 'text/calendar');
    notify({ title: S.io.exportedIcal(name), tone: 'success' });
  },
};

const fileBase = () =>
  calNow()
    .title.trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 40) || '團期行事曆';

async function shot(kind: 'month' | 'year') {
  try {
    const data = calNow();
    const { cursor } = useUi.getState();
    const image = await backgroundImage();
    const r =
      kind === 'month'
        ? await renderMonthPng(data, cursor, image)
        : await renderYearPng(data, cursor.year, image);
    const name = shotFileName(data.title, kind === 'month' ? cursor : cursor.year);
    downloadBlob(r.blob, name);
    notify({ title: S.shot.done(name), tone: 'success' });
  } catch (e) {
    notify({
      title: S.shot.failed,
      description: e instanceof Error ? e.message : undefined,
      tone: 'danger',
    });
  }
}

/** 刪除選取的那一筆（Delete 鍵）：確認對話框要在 ToolShell 裡，由 DeleteBridge 接上 */
let deleteImpl: (() => Promise<void>) | null = null;
const requestDelete = () => void deleteImpl?.();

function DeleteBridge(): null {
  const confirm = useConfirm();
  useEffect(() => {
    const run = async () => {
      const id = useUi.getState().selectedId;
      const e = calNow().entries.find((x) => x.id === id);
      if (!e) return;
      const ok = await confirm({
        title: S.entry.deleteTitle,
        description: S.entry.deleteDesc(entryTitle(e)),
        confirmLabel: S.entry.deleteConfirm,
        danger: true,
      });
      if (!ok) return;
      deleteEntry(e.id);
      notify({ title: S.entry.deleted, tone: 'success' });
    };
    deleteImpl = run;
    return () => {
      if (deleteImpl === run) deleteImpl = null;
    };
  }, [confirm]);
  return null;
}

/** 選取的那一筆往前、往後移（Shift＋方向鍵；Alt＋←／→ 是瀏覽器的上一頁、下一頁，不搶） */
function moveSelected(e: KeyboardEvent) {
  const id = useUi.getState().selectedId;
  if (!id) return;
  const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const n = days[e.key];
  if (n) shiftEntry(id, n);
}

const SHORTCUTS: Shortcut[] = [
  {
    keys: 'alt+code:keyn',
    label: S.keys.addSession,
    group: S.keys.groupAdd,
    allowInInput: true,
    handler: () => openNewEntry('session'),
  },
  {
    keys: 'alt+code:keyp',
    label: S.keys.addPlan,
    group: S.keys.groupAdd,
    allowInInput: true,
    handler: () => openNewEntry('plan'),
  },
  {
    keys: 'alt+code:keyt',
    label: S.keys.addTask,
    group: S.keys.groupAdd,
    allowInInput: true,
    handler: openTaskDialog,
  },
  { keys: 'pageup', label: S.keys.prev, group: S.keys.groupView, handler: () => shiftCursor(-1) },
  { keys: 'pagedown', label: S.keys.next, group: S.keys.groupView, handler: () => shiftCursor(1) },
  { keys: 'home', label: S.keys.today, group: S.keys.groupView, handler: goToday },
  {
    keys: 'y',
    label: S.keys.toggleView,
    group: S.keys.groupView,
    handler: () => setView(usePrefs.getState().data.view === 'year' ? 'month' : 'year'),
  },
  {
    keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
    label: S.keys.arrows,
    group: S.keys.groupView,
  },
  {
    keys: ['shift+arrowleft', 'shift+arrowright'],
    label: S.keys.move,
    group: S.keys.groupEdit,
    handler: moveSelected,
  },
  {
    keys: ['shift+arrowup', 'shift+arrowdown'],
    label: S.keys.moveWeek,
    group: S.keys.groupEdit,
    handler: moveSelected,
  },
  { keys: 'delete', label: S.keys.delete, group: S.keys.groupEdit, handler: requestDelete },
  {
    keys: 'escape',
    label: S.keys.escape,
    group: S.keys.groupEdit,
    handler: () => selectDate(null),
  },
  {
    keys: 'mod+z',
    label: S.keys.undo,
    group: S.keys.groupEdit,
    handler: () => useCal.temporal.getState().undo(),
  },
  {
    keys: ['shift+mod+z', 'mod+y'],
    label: S.keys.redo,
    group: S.keys.groupEdit,
    handler: () => useCal.temporal.getState().redo(),
  },
];

/** 「今天」：過了午夜、頁面重新顯示（切回分頁、從背景回來）時更新 */
function TodayTicker(): null {
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(
        () => {
          refreshToday();
          schedule();
        },
        Math.max(1000, next.getTime() - now.getTime()),
      );
    };
    const onShow = () => {
      if (document.visibilityState === 'hidden') return;
      refreshToday();
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);
  return null;
}

function SaveErrorWatcher() {
  const failing = Boolean(useSaveError(TOOL_ID));
  useEffect(() => {
    if (failing) notify({ title: S.project.saveFailed, tone: 'danger', duration: 8000 });
  }, [failing]);
  return null;
}

function Workspace() {
  return (
    <>
      <NotifyBridge />
      <SendBridge />
      <DeleteBridge />
      <SaveErrorWatcher />
      <TodayTicker />
      <WindowDrop
        accept=".json,.ics,.ical,.zip,application/json,text/calendar,application/zip"
        label={S.importDialog.drop}
        hint={S.importDialog.dropHint}
        onDrop={(files) => void startImport(files)}
      />
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <CalendarArea actions={actions} />
        <aside aria-label={S.detail.title} className="flex min-w-0 flex-col gap-3">
          {/* 今天的預定在詳細之上：點今天的一筆時詳細出現在它下面，雙擊的第二下才不會落空 */}
          <TodayPanel />
          <DetailPanel />
          <TaskPanel onAdd={openTaskDialog} />
          <LookPanel />
        </aside>
      </div>
      <EntryDialog />
      <TaskDialog />
      <FreeDaysDialog />
      <ImportDialog />
    </>
  );
}

export function App() {
  const { canUndo, canRedo, undo, redo } = useUndoRedo(useCal);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUTS}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.header.undo, 'mod+z')}
            icon={<Undo2 />}
            disabled={!canUndo}
            onClick={undo}
          />
          <IconButton
            label={withShortcut(S.header.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            disabled={!canRedo}
            onClick={redo}
          />
          <ProjectActions />
        </>
      }
      body={<Workspace />}
    />
  );
}
