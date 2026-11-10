/**
 * 魔法脈繪製工具（翠緑のフローリア）：同人 TRPG『翠緑のフローリア』的魔法脈繪圖板——方格上的直線與多角形、
 * 線圍出來的範圍塗色、傷害格；好幾張畫布（角色 11×11、隨從 6×6）、全員一覽、PNG 匯出、讀寫原作的資料。
 * 參考 Nuts-ABCd／floria_canvas（MIT，`UPSTREAM_LICENSE`）改寫；只有繪圖功能，不含規則書的內容。
 * 規格：docs/refactor/specs/floria-veins.md。
 */
import { BookOpen, FileUp, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '@/core/files';
import { serializeProject, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ConfirmOptions,
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  type ToastOptions,
  ToolShell,
  UsageSection,
  useConfirm,
  useToast,
  withShortcut,
} from '@/ui';
import { Board, fitView, zoomIn, zoomOut } from './Board';
import { ExportArea } from './ExportArea';
import { projectData, sanitizeDoc } from './model/doc';
import { canShift, canTurn } from './model/draft';
import { looksLikeLegacy } from './model/legacy';
import { DATA_VERSION, type Doc, KINDS, TOOL_ID } from './model/types';
import { Overview } from './Overview';
import {
  CanvasSection,
  importLegacyText,
  LayersSection,
  LegacyDialog,
  LegacySection,
  RightsNote,
  StampsSection,
} from './Panels';
import {
  cancelDraft,
  commit,
  docNow,
  loadSample,
  mirror,
  prefsNow,
  redo,
  replaceDoc,
  resetAll,
  rotate,
  setMode,
  shift,
  stepBackDraft,
  undo,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { CanvasTabs, DraftBar, ModeBar } from './Toolbar';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol className="mt-2">
        {S.usage.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2">{S.rights.lead}</p>
    </>
  );
}

const fileName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${S.project.fileName}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
};

/* 快捷鍵與頁首的選單在 ToolShell 的 Provider 外面：通知與確認經由這裡 */
const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
const confirmRef: { current: ((o: ConfirmOptions) => Promise<boolean>) | null } = {
  current: null,
};
function Bridge() {
  toastRef.current = useToast();
  confirmRef.current = useConfirm();
  return null;
}

function saveProjectNow() {
  try {
    const name = fileName();
    downloadText(
      serializeProject(TOOL_ID, DATA_VERSION, projectData(docNow())),
      name,
      'application/json',
    );
    toastRef.current?.({ title: S.project.saved, description: name, tone: 'success' });
  } catch (e) {
    toastRef.current?.({
      title: S.project.saveFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

function doCommit() {
  const r = commit();
  const kind = prefsNow().kind;
  if (r.kind === 'not-ready')
    toastRef.current?.({ title: S.draft.notReady[kind], tone: 'warning' });
  else if (r.kind === 'nothing-to-erase')
    toastRef.current?.({ title: S.draft.nothingErased, tone: 'warning' });
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function doShift(dx: number, dy: number) {
  if (!shift(dx, dy)) toastRef.current?.({ title: S.draft.edge, tone: 'warning' });
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const view = usePrefs((s) => s.data.view);
  const [legacyOpen, setLegacyOpen] = useState(false);

  useEffect(() => {
    window.__floria = { ...((window.__floria as object) ?? {}), useDoc, usePrefs };
  }, []);

  const movable = useDoc((s) => canShift(s.data.draft));
  const turnable = useDoc((s) => canTurn(s.data.draft));

  const shortcuts = useMemo<Shortcut[]>(() => {
    return [
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.edit, handler: redo },
      ...KINDS.map(
        (k, i): Shortcut => ({
          keys: String(i + 1),
          label: S.keys.kind(k),
          group: S.keys.draw,
          handler: () => setMode(k, prefsNow().erase),
        }),
      ),
      {
        keys: 'e',
        label: S.keys.toggleErase,
        group: S.keys.draw,
        handler: () => setMode(prefsNow().kind, !prefsNow().erase),
      },
      { keys: 'enter', label: S.keys.commit, group: S.keys.draw, handler: doCommit },
      { keys: 'escape', label: S.keys.cancel, group: S.keys.draw, handler: () => cancelDraft() },
      {
        keys: 'backspace',
        label: S.keys.stepBack,
        group: S.keys.draw,
        handler: () => stepBackDraft(),
      },
      {
        keys: ['arrowleft', 'arrowup', 'arrowdown', 'arrowright'],
        label: S.keys.move,
        group: S.keys.draw,
        handler: movable ? (e) => doShift(...(ARROWS[e.key] ?? [0, 0])) : undefined,
      },
      {
        keys: 'h',
        label: S.keys.mirror,
        group: S.keys.draw,
        handler: turnable ? () => mirror() : undefined,
      },
      {
        keys: 'r',
        label: S.keys.rotate,
        group: S.keys.draw,
        handler: turnable ? () => rotate() : undefined,
      },
      { keys: ['+', '='], label: S.keys.zoomIn, group: S.keys.view, handler: () => zoomIn() },
      { keys: '-', label: S.keys.zoomOut, group: S.keys.view, handler: () => zoomOut() },
      { keys: '0', label: S.keys.fit, group: S.keys.view, handler: fitView },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.file,
        handler: saveProjectNow,
        allowInInput: true,
      },
    ];
  }, [movable, turnable]);

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.keys.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.keys.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
      <ProjectMenu<Doc>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => projectData(docNow())}
        saveFileName={fileName}
        onLoad={(raw) => {
          const d = sanitizeDoc(raw);
          if (!d) return false;
          replaceDoc(d, { clearHistory: true });
          return true;
        }}
        onForeignFile={(_file, bytes) => {
          const text = new TextDecoder().decode(bytes);
          if (!looksLikeLegacy(text)) return false;
          const error = importLegacyText(text, (o) => toastRef.current?.(o));
          /* 丟出的錯誤由專案選單照原文顯示 */
          if (error) throw new Error(error);
          return true;
        }}
        openAccept=".json,.txt,application/json,text/plain"
        onReset={resetAll}
        savedAt={savedAt}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetText,
          confirmLabel: S.project.resetConfirm,
        }}
        extraItems={
          <>
            <ProjectMenuItem
              icon={<BookOpen />}
              onSelect={async () => {
                if (
                  await confirmRef.current?.({
                    title: S.project.sampleTitle,
                    description: S.project.sampleText,
                    confirmLabel: S.project.sampleConfirm,
                  })
                ) {
                  loadSample();
                  toastRef.current?.({ title: S.project.sampleLoaded, tone: 'success' });
                }
              }}
            >
              {S.project.sample}
            </ProjectMenuItem>
            <ProjectMenuItem icon={<FileUp />} onSelect={() => setLegacyOpen(true)}>
              {S.legacy.open}
            </ProjectMenuItem>
          </>
        }
      />
    </>
  );

  const settings = (
    <>
      <Bridge />
      <UsageSection persistKey={TOOL_ID}>
        <Usage />
      </UsageSection>
      <CanvasSection />
      <LayersSection />
      <StampsSection />
      <ExportArea />
      <LegacySection onOpen={() => setLegacyOpen(true)} />
      <RightsNote />
      <LegacyDialog open={legacyOpen} onOpenChange={setLegacyOpen} />
    </>
  );

  const preview = (
    <div className="flex min-w-0 flex-col gap-3">
      <CanvasTabs />
      {view === 'all' ? (
        <Overview />
      ) : (
        <>
          <ModeBar />
          <Board />
          <DraftBar />
        </>
      )}
    </div>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={settings}
      preview={preview}
    />
  );
}
