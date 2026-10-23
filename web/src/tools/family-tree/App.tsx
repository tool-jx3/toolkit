/**
 * 家系圖產生器：一代一列的家系圖，卡片雙擊就地編輯、拖曳換順序或換父母，匯出 PNG／SVG。
 * 規格：docs/refactor/specs/family-tree.md（第一批＝樹的核心；第二批＝過繼、外孫、婚姻連結、框選匯出、
 * 女兒的寫法、狀態、GM 專用與 PL 版、頭像、SVG）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { importAssetFiles } from '@/core/assets';
import { downloadBytes, downloadText } from '@/core/files';
import {
  type ProjectBinary,
  serializeProject,
  serializeProjectZip,
  useSaveError,
  useSaveStatus,
  useUndoRedo,
} from '@/core/storage';
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
import { avatarIds } from './model/ops';
import { cleanTreeData } from './model/sanitize';
import { type Board, LIMITS, newId, type TreeData } from './model/types';
import { BoardSection } from './panels/BoardSection';
import { ExportTab } from './panels/ExportTab';
import { PersonPanel } from './panels/PersonPanel';
import { ViewPanel } from './panels/ViewPanel';
import {
  assets,
  boardNow,
  DATA_VERSION,
  prefsNow,
  referencedAvatars,
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
      stubs: () => { id: string; x: number; y: number; gen: number; parent: string | null }[];
      board: () => Board;
      area: () => string[] | null;
    };
  }
}

window.__familyTree = {
  /* 成員的卡片（「出」字小卡另外在 stubs） */
  layout: () =>
    layoutNow()
      .nodes.filter((n) => !n.stub)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, gen: n.gen })),
  stubs: () =>
    layoutNow()
      .nodes.filter((n) => n.stub)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, gen: n.gen, parent: n.parent?.id ?? null })),
  board: () => boardNow(),
  area: () => useUi.getState().area.keys,
};

/** 專案檔帶的頭像（所有圖板或一張圖板；沒有頭像時是 JSON 專案檔，有時是 ZIP） */
const boardAvatarIds = (boards: readonly Board[]) => [
  ...new Set(boards.flatMap((b) => avatarIds(b.people))),
];
const projectFiles = (boards: readonly Board[]): Promise<ProjectBinary[]> =>
  assets.exportFiles(boardAvatarIds(boards));

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
  /* 有頭像時存成 ZIP（project.json＋files/<資產 id>.<副檔名>）；沒有時照舊是 JSON */
  const data = useTree((s) => s.data);
  const withFiles = boardAvatarIds(data.boards).length > 0;

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
      getFiles={withFiles ? () => projectFiles(treeNow().boards) : undefined}
      openAccept=".json,.zip,application/json,application/zip"
      onLoad={async (data, _file, files) => {
        canceled.current = false;
        const d = cleanTreeData(data);
        if (!d.boards.length) return false;
        /* 頭像的圖片放回資產庫（保留檔案裡的 id）；存不進瀏覽器時提醒 */
        const imported = files.size ? await importAssetFiles(assets, files.entries()) : null;
        if (!(await place(d.boards))) canceled.current = true;
        return { warnings: [imported?.notPersisted ? S.avatarNotSaved : null] };
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
          onSelect={async () => {
            const b = boardNow();
            const base = `${b.title || S.untitledBoard} ${stamp()}`;
            try {
              if (boardAvatarIds([b]).length) {
                const files = await projectFiles([b]);
                const name = `${base}.zip`;
                downloadBytes(
                  serializeProjectZip(TOOL_ID, DATA_VERSION, { boards: [b] }, files),
                  name,
                  'application/zip',
                );
                toast({ title: S.savedProject, description: name, tone: 'success' });
                return;
              }
              const name = `${base}.json`;
              downloadText(
                serializeProject(TOOL_ID, DATA_VERSION, { boards: [b] }),
                name,
                'application/json',
              );
              toast({ title: S.savedProject, description: name, tone: 'success' });
            } catch (e) {
              toast({
                title: S.saveProjectFailed,
                description: e instanceof Error ? e.message : String(e),
                tone: 'danger',
              });
            }
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
  /* 開頁約 5 秒後整理頭像的圖片庫：以前留下、所有圖板與復原紀錄都沒用到的才刪（這次開頁放進來的不刪） */
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedAvatars()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
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
    {
      keys: 'p',
      label: S.keyP,
      group: S.groupCanvas,
      handler: () => setPrefs({ viewMode: prefsNow().viewMode === 'pl' ? 'gm' : 'pl' }),
    },
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
