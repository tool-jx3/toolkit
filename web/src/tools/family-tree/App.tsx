/**
 * 家系圖產生器：一代一列的家系圖，卡片雙擊就地編輯、拖曳換順序或換父母，匯出 PNG。
 * 規格：docs/refactor/specs/family-tree.md（第一批＝樹的核心）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { downloadText } from '@/core/files';
import { serializeProject, useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  useChoice,
  useToast,
  withShortcut,
} from '@/ui';
import { layoutNow, toaster } from './actions';
import { TreeCanvas } from './editor/Canvas';
import { CanvasToolbar } from './editor/Toolbar';
import { exampleBoard } from './model/example';
import { boardsFromLegacy, isLegacyBackup } from './model/legacy';
import { cleanTreeData } from './model/sanitize';
import { type Board, LIMITS, newId, type TreeData } from './model/types';
import { BoardSection } from './panels/BoardSection';
import { ExportTab } from './panels/ExportTab';
import { PersonPanel } from './panels/PersonPanel';
import { ViewPanel } from './panels/ViewPanel';
import {
  boardNow,
  DATA_VERSION,
  resetUi,
  type SettingsTab,
  select,
  setPrefs,
  switchBoard,
  TOOL_ID,
  treeNow,
  useBoard,
  usePrefs,
  useTree,
  useUi,
} from './store';
import { S } from './strings';

const stamp = () => new Date().toISOString().slice(0, 10);

declare global {
  interface Window {
    /** 測試與對等驗證用：目前的排版與圖板 */
    __familyTree?: {
      layout: () => { id: string; x: number; y: number; gen: number }[];
      board: () => Board;
    };
  }
}

window.__familyTree = {
  layout: () => layoutNow().nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, gen: n.gen })),
  board: () => boardNow(),
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

/** 讀進來的圖板（新的 id；名稱不重複；超過上限的不收） */
function appendBoards(list: Board[], replace: boolean): number {
  const keep = replace ? [] : treeNow().boards;
  const room = Math.max(0, LIMITS.boards - keep.length);
  const add = list.slice(0, room).map((b) => ({ ...b, id: newId('b') }));
  if (!add.length) return 0;
  useTree.getState().update((d) => {
    if (replace) d.boards = add;
    else d.boards.push(...add);
  });
  switchBoard(add[0].id);
  useTree.temporal.getState().clear();
  return add.length;
}

function Settings() {
  const tab = usePrefs((s) => s.data.tab);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs<SettingsTab>
        aria-label={S.tabs}
        value={tab}
        onValueChange={(v) => setPrefs({ tab: v })}
        keepMounted
        items={[
          { value: 'person', label: S.tabPerson, content: <PersonPanel /> },
          { value: 'view', label: S.tabView, content: <ViewPanel /> },
          { value: 'export', label: S.tabExport, content: <ExportTab /> },
          { value: 'boards', label: S.tabBoards, content: <BoardSection /> },
        ]}
      />
    </div>
  );
}

function Preview() {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CanvasToolbar />
      <TreeCanvas />
    </div>
  );
}

function Project() {
  const choose = useChoice();
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const canceled = useRef(false);

  /** 讀到的圖板：問「加成新的圖板」或「取代全部」；取消時 false */
  const place = async (boards: Board[]): Promise<boolean> => {
    const how = await choose({
      title: S.openChoiceTitle(boards.length),
      description: S.openChoiceDesc,
      choices: [
        { value: 'append', label: S.openAppend },
        { value: 'replace', label: S.openReplace, variant: 'danger' },
      ],
    });
    if (!how) return false;
    appendBoards(boards, how === 'replace');
    return true;
  };

  return (
    <ProjectMenu<TreeData>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => treeNow()}
      fileNameFor={() => `${S.untitledBoard} ${stamp()}`}
      savedAt={savedAt}
      confirmOpen={false}
      openAccept=".json,application/json"
      onLoad={async (data) => {
        canceled.current = false;
        const d = cleanTreeData(data);
        if (!d.boards.length) return false;
        if (!(await place(d.boards))) canceled.current = true;
        return true;
      }}
      onForeignFile={async (_file, bytes) => {
        let json: unknown;
        try {
          json = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
        } catch {
          return false;
        }
        if (!isLegacyBackup(json)) return false;
        const boards = boardsFromLegacy(json, S.importedBoardTitle);
        if (!boards.length) return false;
        const n = appendBoards(boards, false);
        toast({ title: S.openedLegacy(n), tone: 'success' });
        return true;
      }}
      onNotify={(n) => {
        if (n.kind === 'opened') {
          if (canceled.current) return;
          toast({ title: S.opened, description: n.fileName, tone: n.tone });
        } else if (n.kind === 'open-failed')
          toast({ title: S.notOurFile, description: n.message, tone: 'danger' });
        else if (n.kind === 'saved')
          toast({ title: S.savedProject, description: n.fileName, tone: 'success' });
        else if (n.kind === 'reset') toast({ title: '已重設', tone: 'info' });
      }}
      onReset={() => {
        const b = exampleBoard();
        useTree.getState().replace({ boards: [b] });
        usePrefs.getState().patch({ current: b.id, collapsed: {} });
        resetUi();
      }}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      extraItems={
        <ProjectMenuItem
          onSelect={() => {
            const b = boardNow();
            const name = `${b.title || S.untitledBoard} ${stamp()}.json`;
            downloadText(
              serializeProject(TOOL_ID, DATA_VERSION, { boards: [b] }),
              name,
              'application/json',
            );
            toast({ title: S.savedProject, description: name, tone: 'success' });
          }}
        >
          {S.saveBoardOnly}
        </ProjectMenuItem>
      }
    />
  );
}

/** 通知與復原後的整理（在 ToolShell 裡才拿得到通知） */
function Glue() {
  const toast = useToast();
  toaster.current = toast;
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning', replace: true });
  }, [saveError, toast]);
  /* 復原之後選取的人不見了：取消選取 */
  const board = useBoard();
  const selectedId = useUi((s) => s.selectedId);
  useEffect(() => {
    if (selectedId && !board.people[selectedId]) select(null);
  }, [board, selectedId]);
  return null;
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useTree);
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    {
      keys: 'escape',
      label: S.keyEscape,
      group: S.groupEdit,
      handler: () => {
        if (useUi.getState().selectedId) select(null);
      },
    },
    { keys: 'enter', label: S.keyEnter, group: S.groupCanvas },
    { keys: 'f2', label: S.keyF2, group: S.groupCanvas },
    { keys: 'alt', label: S.keyAlt, group: S.groupCanvas },
    { keys: 'shift', label: S.keyShift, group: S.groupCanvas },
  ];
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={
        <>
          <Glue />
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <Project />
        </>
      }
      settings={<Settings />}
      preview={<Preview />}
    />
  );
}
