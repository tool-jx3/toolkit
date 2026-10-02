/**
 * 跑團紀錄簿：把玩過、帶過的團記成表格，統計、整理成已通關劇本清單，並能把一團送到團報產生器。
 * 規格：docs/refactor/specs/session-log.md（第 7 節主控裁定優先）。
 *
 * 版面（ToolShell 的 body）：統計 → 紀錄區（工具列、篩選、欄位、表格）→ 已通關劇本清單 → 聲明；右下角浮動的新增鈕。
 * 對話框：新增／編輯團、詳細・感想側欄、匯入、送出失敗時的交接資料。
 */
import { ClipboardList, Plus, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSaveError, useUndoRedo } from '@/core/storage';
import { buttonClass, IconButton, type Shortcut, ToolShell, withShortcut } from '@/ui';
import { DetailSheet } from './DetailSheet';
import { ExportSection } from './ExportSection';
import { ImportDialog } from './ImportDialog';
import { ADD_BUTTON_ID, exportJsonWithNotice, LogPanel, SEARCH_INPUT_ID } from './LogPanel';
import { NotifyBridge, notify } from './notify';
import { SessionDialog } from './SessionDialog';
import { Stats } from './Stats';
import { REPORT_TOOL_HREF, SendBridge } from './send';
import {
  closeDetail,
  closePanel,
  openAddDialog,
  openImport,
  TOOL_ID,
  useLog,
  useUi,
} from './store';
import { S } from './strings';

/** 匯入的列亮起的時間（F37：約 2.2 秒） */
const FLASH_MS = 2200;

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
      <p className="mt-2 text-muted">{S.disclaimer}</p>
    </>
  );
}

/** 匯入後亮起的列：時間到就熄掉 */
function FlashTimer() {
  const seq = useUi((s) => s.flash.seq);
  useEffect(() => {
    if (!seq) return;
    const t = setTimeout(
      () => useUi.setState((s) => ({ flash: { ids: [], seq: s.flash.seq } })),
      FLASH_MS,
    );
    return () => clearTimeout(t);
  }, [seq]);
  return null;
}

/** 自動存檔失敗時提醒一次（之後成功會再允許提醒） */
function SaveErrorWatcher() {
  const failing = Boolean(useSaveError(TOOL_ID));
  /* 只在「開始失敗」時提醒一次（連續打字時每次存檔都失敗，不重複跳通知） */
  useEffect(() => {
    if (failing) notify({ title: S.toast.persistFailed, tone: 'danger', duration: 8000 });
  }, [failing]);
  return null;
}

/**
 * 浮動的新增鈕（F33）：工具列的新增鈕捲出畫面時才出現（一開頁不會蓋住右下角的內容）。
 */
function FloatingAdd() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById(ADD_BUTTON_ID);
    if (!target || typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting));
    io.observe(target);
    return () => io.disconnect();
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={openAddDialog}
      aria-label={S.table.fab}
      title={S.table.fab}
      data-testid="fab-add"
      className="fixed right-4 bottom-4 z-30 flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-2 hover:bg-accent-hover"
    >
      <Plus className="size-6" aria-hidden />
    </button>
  );
}

function Workspace() {
  return (
    <>
      <NotifyBridge />
      <SendBridge />
      <FlashTimer />
      <SaveErrorWatcher />
      <Stats />
      <LogPanel />
      <ExportSection />
      {/* 下方留白：捲到底時最後的內容不會被浮動的新增鈕蓋住 */}
      <p className="m-0 px-1 pb-14 text-xs text-muted" data-testid="disclaimer">
        {S.disclaimer}
      </p>
      <FloatingAdd />
      <SessionDialog />
      <DetailSheet />
      <ImportDialog />
    </>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useLog);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'alt+code:keyn',
        label: S.keys.add,
        group: S.keys.groupEdit,
        allowInInput: true,
        handler: () => openAddDialog(),
      },
      {
        keys: 'mod+shift+f',
        label: S.keys.search,
        group: S.keys.groupEdit,
        allowInInput: true,
        handler: () => document.getElementById(SEARCH_INPUT_ID)?.focus(),
      },
      {
        keys: 'mod+z',
        label: S.keys.undo,
        group: S.keys.groupEdit,
        handler: () => useLog.temporal.getState().undo(),
      },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.keys.redo,
        group: S.keys.groupEdit,
        handler: () => useLog.temporal.getState().redo(),
      },
      {
        keys: 'escape',
        label: S.keys.escape,
        group: S.keys.groupEdit,
      },
      {
        keys: 'mod+j',
        label: S.keys.import,
        group: S.keys.groupFile,
        allowInInput: true,
        handler: () => {
          closePanel();
          closeDetail();
          openImport();
        },
      },
      {
        keys: 'mod+e',
        label: S.keys.exportJson,
        group: S.keys.groupFile,
        allowInInput: true,
        handler: () => exportJsonWithNotice(),
      },
    ],
    [],
  );

  const headerActions = (
    <>
      <a
        href={REPORT_TOOL_HREF}
        className={buttonClass('ghost', 'sm')}
        title={S.header.reportLinkTitle}
        data-testid="report-link"
      >
        <ClipboardList className="size-4" aria-hidden />
        <span className="max-sm:sr-only">{S.header.reportLink}</span>
      </a>
      <IconButton
        label={withShortcut(S.header.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => undo()}
      />
      <IconButton
        label={withShortcut(S.header.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => redo()}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      body={<Workspace />}
    />
  );
}
