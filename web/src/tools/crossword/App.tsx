/**
 * 填字遊戲產生器：把一組答案與提示（或一段文字裡挑出的單字與句子）排成填字遊戲，
 * 匯出題目版與解答版的 PNG、HTML，或列印。
 * 規格：docs/refactor/specs/crossword.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '@/core/files';
import {
  resetToolStore,
  serializeProject,
  useSaveError,
  useSaveStatus,
  useUndoRedo,
} from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  type ToastOptions,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { type CrosswordData, DATA_VERSION, sanitizeData, TOOL_ID, titleOrDefault } from './model';
import { DesignSection, type GenerateControl, SourceSection } from './Panels';
import { Preview } from './Preview';
import { dataNow, generate, historyStep, toggleAnswers, useCrossword, useView } from './store';
import { S } from './strings';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** 快捷鍵（綁在 ToolShell 的通知範圍外）要跳通知時用：由頁面裡的元件把 toast 交出來 */
const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
function ToastBridge() {
  const toast = useToast();
  toastRef.current = toast;
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.toast.autosaveFailed, tone: 'warning' });
  }, [saveError, toast]);
  return null;
}
const notify = (o: ToastOptions) => toastRef.current?.(o);

const undo = () => historyStep('undo');
const redo = () => historyStep('redo');

const projectName = () => S.project.fileName(titleOrDefault(dataNow().title));

/** Ctrl＋S：存成專案檔（與「專案」選單的「存成專案檔」相同的檔案） */
function saveProjectNow() {
  try {
    const name = projectName();
    downloadText(serializeProject(TOOL_ID, DATA_VERSION, dataNow()), name, 'application/json');
    notify({ title: S.toast.saved, description: name, tone: 'success' });
  } catch (e) {
    notify({
      title: S.toast.saveFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

/** 產生（按鈕與 Ctrl＋Enter）：先讓按鈕顯示「產生中」，下一個畫面才開始算（長文字要算一下） */
function useGenerate(): GenerateControl {
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (busy) return;
    const d = dataNow();
    if (d.mode === 'text' ? !d.text.trim() : !d.list.trim()) {
      notify({ title: d.mode === 'text' ? S.source.needText : S.source.needList, tone: 'warning' });
      return;
    }
    setBusy(true);
    setTimeout(() => {
      try {
        const r = generate();
        if (!r.ok)
          notify({
            title: d.mode === 'text' ? S.status.noWords : S.status.noEntries,
            tone: 'warning',
          });
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  return { run, busy };
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useCrossword);
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const gen = useGenerate();

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'mod+enter',
        label: S.keys.generate,
        group: S.keys.edit,
        handler: gen.run,
        allowInInput: true,
      },
      { keys: 'a', label: S.keys.answers, group: S.keys.edit, handler: toggleAnswers },
      { keys: 'mod+z', label: S.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keys.edit, handler: redo },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.file,
        handler: saveProjectNow,
        allowInInput: true,
      },
    ],
    [gen.run],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={
        <>
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
          <ProjectMenu<CrosswordData>
            toolId={TOOL_ID}
            version={DATA_VERSION}
            getData={dataNow}
            saveFileName={projectName}
            openedMessage={S.project.opened}
            onLoad={(raw) => {
              const data = sanitizeData(raw, useCrossword.initial);
              if (!data) return false;
              useCrossword.getState().replace(data);
              return true;
            }}
            onReset={() => {
              resetToolStore(useCrossword, { clearHistory: false });
              useView.getState().reset();
            }}
            resetText={{ title: S.project.resetTitle, description: S.project.resetDescription }}
            savedAt={savedAt}
            statusText={saveError ? S.project.autosaveStatus : undefined}
          />
        </>
      }
      settings={
        <div className="flex min-w-0 flex-col gap-3">
          <ToastBridge />
          <SourceSection generate={gen} />
          <DesignSection />
          <UsageSection persistKey={TOOL_ID}>
            <Usage />
          </UsageSection>
        </div>
      }
      preview={<Preview />}
    />
  );
}
