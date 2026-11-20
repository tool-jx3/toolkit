/**
 * CCFOLIA 角色批次產生器：把劇本的 NPC（速記、從劇本貼上、試算表、角色卡網站的 CCFOLIA 輸出）一次做成一批 CCFOLIA 棋子，
 * 帶立繪與差分，匯出成只有角色的房間 ZIP 與素材 ZIP。規格：docs/refactor/specs/ccfolia-batch.md。
 *
 * 版面（ToolShell 的 body）：寬畫面左右兩欄——左邊是輸入（輸入、圖片庫、全體設定三個分頁），
 * 右邊是棋子清單（預覽、原文的讀法、修改）與匯出；窄畫面上下排列（輸入在上）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { loadLegacyProject, loadProject, projectData, projectFiles, resetAll } from './actions';
import { InputPanel } from './InputPanel';
import { ListPanel } from './ListPanel';
import { stamp } from './model';
import { ImportGuide, OutputPanel } from './OutputPanel';
import { SettingsPanel } from './SettingsPanel';
import { ShelfPanel } from './ShelfPanel';
import { hydrateAssets, type InputTab, PROJECT_VERSION, TOOL_ID, useDoc, usePrefs } from './store';
import { S } from './strings';

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-3 font-semibold">{S.importTitle}</p>
      <ImportGuide />
      <p className="mt-3 text-xs text-muted">{S.unofficial}</p>
    </>
  );
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** 拖到拖放區以外的檔案：不讓瀏覽器打開它，提示拖到哪裡 */
function DropGuard() {
  const toast = useToast();
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      toast({ title: S.dropOutside, tone: 'warning', replace: true });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [toast]);
  return null;
}

function HeaderActions() {
  const toast = useToast();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useDoc);
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => undo()}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => redo()}
      />
      <ProjectMenu
        toolId={TOOL_ID}
        version={PROJECT_VERSION}
        getData={projectData}
        getFiles={projectFiles}
        openAccept=".zip,.json,application/zip,application/json"
        fileNameFor={() => `ccfolia-batch-project-${stamp()}`}
        savedAt={savedAt}
        statusText={saveError ? S.autosaveFailed : undefined}
        confirmOpen={false}
        onLoad={async (data, _file, files) => {
          const r = await loadProject(data, files);
          return { warnings: [r.notPersisted > 0 && S.projectNotSaved] };
        }}
        onForeignFile={async (file, bytes) => {
          /* 原作的專案檔（.json） */
          const r = await loadLegacyProject(bytes);
          if (!r) return false;
          toast(
            r.notPersisted
              ? {
                  title: S.openedLegacy(file.name, r.images),
                  description: S.projectNotSaved,
                  tone: 'warning',
                }
              : { title: S.openedLegacy(file.name, r.images), tone: 'success' },
          );
          return true;
        }}
        onReset={resetAll}
        resetText={{
          label: S.resetLabel,
          title: S.resetTitle,
          description: S.resetDescription,
          confirmLabel: S.resetConfirm,
        }}
        onNotify={(n) => {
          if (n.kind === 'saved') toast({ title: S.saved(n.fileName ?? ''), tone: 'success' });
          else if (n.kind === 'opened') {
            toast(
              n.warnings
                ? {
                    title: S.opened(n.fileName ?? ''),
                    description: n.warnings.join(''),
                    tone: 'warning',
                  }
                : { title: S.opened(n.fileName ?? ''), tone: 'success' },
            );
          } else if (n.kind === 'open-failed') {
            toast({ title: S.openFailed(n.message ?? ''), tone: 'danger' });
          }
        }}
      />
    </>
  );
}

export function App() {
  const { undo, redo } = useUndoRedo(useDoc);
  const tab = usePrefs((s) => s.data.tab);
  const imageCount = useDoc((s) => s.data.images.length);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void hydrateAssets();
  }, []);

  const setTab = (t: InputTab) => usePrefs.getState().patch({ tab: t });

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.keyUndo, group: S.keyGroupEdit, handler: () => undo() },
    {
      keys: ['shift+mod+z', 'mod+y'],
      label: S.keyRedo,
      group: S.keyGroupEdit,
      handler: () => redo(),
    },
    /* 以下由清單自己處理，只列在說明裡 */
    { keys: ['arrowup', 'arrowdown'], label: S.keyRowMove, group: S.keyGroupList },
    { keys: ['enter', 'space'], label: S.keyRowPick, group: S.keyGroupList },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={<HeaderActions />}
      body={
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(340px,460px)_minmax(0,1fr)]">
          <DropGuard />
          <div className="flex min-w-0 flex-col gap-3" data-testid="input-pane">
            <Tabs<InputTab>
              aria-label={S.inputTabs}
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'input', label: S.tabInput, content: <InputPanel textRef={textRef} /> },
                { value: 'images', label: S.tabImages(imageCount), content: <ShelfPanel /> },
                { value: 'settings', label: S.tabSettings, content: <SettingsPanel /> },
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3" data-testid="output-pane">
            <ListPanel />
            <OutputPanel />
          </div>
        </div>
      }
    />
  );
}
