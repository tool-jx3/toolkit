/**
 * 劇本時間表：把劇本的事件、NPC 的行動排在可以縮放的時間軸上（日期時間、第 N 天、架空年），
 * 依角色、地點分泳道；年表檢視可以列印、複製成文字；PL 檢視拿掉 GM 專用的東西；匯出 PNG、SVG、文字、CSV。
 * 規格：docs/refactor/specs/scenario-timeline.md。
 *
 * 版面：共用外框；設定欄四個分頁（事件、泳道、專案、匯出）；預覽欄是工具列＋時間軸或年表。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  useConfirm,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { fileBase } from './export/render';
import type { TimelineDoc } from './model/types';
import { BUTTON_STEP } from './model/window';
import { NotifyBridge, notify } from './notify';
import { EventPanel } from './panels/EventPanel';
import { ExportTab } from './panels/ExportTab';
import { ImportBridge, importFiles, PasteDialog, readProjectData } from './panels/importer';
import { LanesPanel } from './panels/LanesPanel';
import { ProjectPanel } from './panels/ProjectPanel';
import {
  DATA_VERSION,
  deleteEvent,
  docNow,
  loadExample,
  prefsNow,
  redo,
  replaceDoc,
  resetBlank,
  type SettingsTab,
  select,
  setPrefs,
  TOOL_ID,
  undo,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';
import { addEventNow } from './view/actions';
import { Chronicle } from './view/Chronicle';
import { Timeline, timelineApi } from './view/Timeline';
import { Toolbar, useEffectiveView } from './view/Toolbar';

const pad2 = (n: number) => String(n).padStart(2, '0');

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __scenarioTimeline?: {
      doc: () => TimelineDoc;
      win: () => { start: number; end: number } | null;
    };
  }
}

window.__scenarioTimeline = {
  doc: () => docNow(),
  win: () => useUi.getState().win,
};

function Usage() {
  return (
    <ol className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

function Settings() {
  const tab = usePrefs((s) => s.data.tab);
  return (
    <Tabs<SettingsTab>
      aria-label={S.tabs}
      value={tab}
      onValueChange={(v) => setPrefs({ tab: v })}
      items={[
        { value: 'event', label: S.tabEvent, content: <EventPanel /> },
        { value: 'lanes', label: S.tabLanes, content: <LanesPanel /> },
        { value: 'project', label: S.tabProject, content: <ProjectPanel /> },
        { value: 'export', label: S.tabExport, content: <ExportTab /> },
      ]}
    />
  );
}

function Preview() {
  const view = useEffectiveView();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Toolbar />
      {view === 'timeline' ? <Timeline /> : <Chronicle />}
    </div>
  );
}

function Project() {
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const confirm = useConfirm();
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => ({ ...docNow(), sample: false })}
      fileNameFor={(now) =>
        `${fileBase(docNow())}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
      }
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      openedMessage={S.opened}
      onLoad={(data) => {
        const { doc, warnings } = readProjectData(data);
        replaceDoc({ ...doc, sample: false });
        return { warnings };
      }}
      onReset={() => resetBlank()}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      openDisabled={pl}
      resetDisabled={pl}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
      extraItems={
        <ProjectMenuItem
          disabled={pl}
          onSelect={async () => {
            if (prefsNow().viewMode === 'pl') return;
            if (
              await confirm({
                title: S.exampleConfirmTitle,
                description: S.exampleConfirmDesc,
                confirmLabel: S.loadExample,
              })
            ) {
              loadExample();
              notify({ title: S.exampleLoaded, tone: 'success' });
            }
          }}
        >
          {S.loadExample}
        </ProjectMenuItem>
      }
    />
  );
}

/** 通知、讀入的對話框、存檔失敗、復原後的整理（在 ToolShell 裡才拿得到） */
function Glue() {
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) notify({ title: S.saveFailed, tone: 'warning', duration: 8000 });
  }, [saveError]);
  /* 復原之後選取的事件不見了：取消選取 */
  const events = useDoc((s) => s.data.events);
  const selectedId = useUi((s) => s.selectedId);
  useEffect(() => {
    if (selectedId && !events.some((e) => e.id === selectedId)) select(null);
  }, [events, selectedId]);
  return (
    <>
      <NotifyBridge />
      <ImportBridge />
      <PasteDialog />
      <WindowDrop
        accept=".json,.zip,.csv,.tsv,.txt,application/json,application/zip,text/csv,text/plain,text/tab-separated-values"
        label={S.dropLabel}
        hint={S.dropHint}
        onDrop={(files) => void importFiles(files)}
        onReject={(files) =>
          notify({
            title: S.unknownFile,
            description: files.map((f) => f.name).join('、'),
            tone: 'danger',
          })
        }
      />
    </>
  );
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'n', label: S.keyNew, group: S.groupEdit, handler: addEventNow },
  {
    keys: ['delete', 'backspace'],
    label: S.keyDelete,
    group: S.groupEdit,
    handler: () => {
      const id = useUi.getState().selectedId;
      if (id) deleteEvent(id);
    },
  },
  { keys: 'escape', label: S.keyEscape, group: S.groupEdit, handler: () => select(null) },
  { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
  { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
  {
    keys: ['+', '='],
    label: S.keyZoomIn,
    group: S.groupView,
    handler: () => timelineApi.current?.zoom(BUTTON_STEP),
  },
  {
    keys: ['-'],
    label: S.keyZoomOut,
    group: S.groupView,
    handler: () => timelineApi.current?.zoom(1 / BUTTON_STEP),
  },
  { keys: '0', label: S.keyFit, group: S.groupView, handler: () => timelineApi.current?.fit() },
  {
    keys: 'v',
    label: S.keyView,
    group: S.groupView,
    handler: () => {
      const wide = window.matchMedia?.('(min-width: 640px)').matches ?? true;
      const cur = prefsNow().view ?? (wide ? 'timeline' : 'chronicle');
      setPrefs({ view: cur === 'timeline' ? 'chronicle' : 'timeline' });
    },
  },
  {
    keys: 'p',
    label: S.keyGmPl,
    group: S.groupView,
    handler: () => setPrefs({ viewMode: prefsNow().viewMode === 'pl' ? 'gm' : 'pl' }),
  },
  { keys: ['arrowleft', 'arrowright'], label: S.keyPan, group: S.groupView },
  { keys: ['arrowleft', 'arrowright'], label: S.keyMove, group: S.groupItem },
  { keys: ['shift+arrowleft', 'shift+arrowright'], label: S.keyResize, group: S.groupItem },
  { keys: ['arrowup', 'arrowdown'], label: S.keyLane, group: S.groupItem },
  { keys: 'enter', label: S.keyEnter, group: S.groupItem },
  { keys: 'alt', label: S.keyAlt, group: S.groupItem },
];

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUTS}
      settingsResize={{ persistKey: TOOL_ID }}
      headerActions={
        <>
          <Glue />
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={pl || !canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={pl || !canRedo}
          />
          <Project />
        </>
      }
      settings={<Settings />}
      preview={<Preview />}
    />
  );
}
