/**
 * 劇本文字產生器：把台本或描寫切成一則一則的 CCFOLIA 劇本文字（シナリオテキスト），匯出成房間 ZIP。
 * 規格：docs/refactor/specs/scenario-text.md。
 *
 * 版面（ToolShell 的 body）：寬畫面左右兩欄——左邊是輸入（文字、說話者、圖片庫三個分頁），
 * 右邊是清單與預覽、已確定、匯出；窄畫面上下排列（輸入在上）。
 */
import { FileJson, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pickFiles, readAsText } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { loadLegacyProject, loadProject, projectData, projectFiles, resetAll } from './actions';
import { stamp } from './model';
import { BatchesPanel, ExportPanel, ImportGuide } from './OutputPanels';
import { ResultsPanel } from './ResultsPanel';
import { ShelfPanel } from './ShelfPanel';
import { SpeakersPanel } from './SpeakersPanel';
import { hydrateAssets, type InputTab, PROJECT_VERSION, TOOL_ID, useDoc, usePrefs } from './store';
import { S } from './strings';
import { TextPanel } from './TextPanel';

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
    </>
  );
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** 拖到拖放區以外的檔案：不讓瀏覽器打開它，提示拖到哪裡（F24） */
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

  const openLegacy = async () => {
    const [file] = await pickFiles({ accept: '.json,application/json' });
    if (!file) return;
    try {
      const r = await loadLegacyProject(await readAsText(file));
      toast(
        r.notPersisted
          ? {
              title: S.openedLegacy(file.name, r.images),
              description: S.projectNotSaved,
              tone: 'warning',
            }
          : { title: S.openedLegacy(file.name, r.images), tone: 'success' },
      );
    } catch (e) {
      toast({
        title: S.openFailed(e instanceof Error ? e.message : String(e)),
        tone: 'danger',
      });
    }
  };

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
        fileNameFor={() => `scenario-text-project-${stamp()}`}
        savedAt={savedAt}
        statusText={saveError ? S.autosaveFailed : undefined}
        confirmOpen={false}
        onLoad={async (data, _file, files) => {
          const r = await loadProject(data, files);
          /* 圖片存不進瀏覽器：和「已開啟專案檔」合成一則 */
          return { warnings: [r.notPersisted > 0 && S.projectNotSaved] };
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
        extraItems={
          <ProjectMenuItem icon={<FileJson aria-hidden />} onSelect={() => void openLegacy()}>
            {S.openLegacy}
          </ProjectMenuItem>
        }
      />
    </>
  );
}

export function App() {
  const { undo, redo } = useUndoRedo(useDoc);
  const tab = usePrefs((s) => s.data.tab);
  const speakerCount = useDoc((s) => s.data.speakers.length);
  const imageCount = useDoc((s) => s.data.images.length);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void hydrateAssets();
  }, []);

  const setTab = (t: InputTab) => usePrefs.getState().patch({ tab: t });

  /** 放回修改之後：切到文字分頁、捲到文字欄 */
  const showText = () => {
    setTab('text');
    requestAnimationFrame(() => {
      textRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

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
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
          <DropGuard />
          <div className="flex min-w-0 flex-col gap-3" data-testid="input-pane">
            <Tabs<InputTab>
              aria-label={S.inputTabs}
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'text', label: S.tabText, content: <TextPanel textRef={textRef} /> },
                {
                  value: 'speakers',
                  label: S.tabSpeakers(speakerCount),
                  content: <SpeakersPanel />,
                },
                { value: 'images', label: S.tabImages(imageCount), content: <ShelfPanel /> },
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3" data-testid="output-pane">
            <ResultsPanel />
            <BatchesPanel onRestored={showText} />
            <ExportPanel />
          </div>
        </div>
      }
    />
  );
}
