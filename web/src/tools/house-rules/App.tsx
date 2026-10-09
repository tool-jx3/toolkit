/**
 * CoC 房規表產生器：CoC 6 版／7 版的房規，從常見的規則裡選、調整數值與注記，整理成一張表，
 * 匯出 PNG、純文字、Markdown。
 *
 * 版面：≥ 1280 px 三欄（目錄｜編輯｜輸出，目錄與輸出固定在畫面上）；1024～1279 px 兩欄（編輯｜輸出），
 * 目錄改成編輯區上方的橫向列；更窄時由上而下（目錄列黏在頂端、輸出在最下面）。
 * 規格：docs/refactor/specs/house-rules.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { downloadText } from '@/core/files';
import { resetToolStore, serializeProject, useSaveStatus, useUndoRedo } from '@/core/storage';
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
import { InfoCard, RemarksCard } from './InfoCard';
import { DATA_VERSION, fileBase, type HouseRulesData, sanitizeData, TOOL_ID } from './model';
import { OutputPanel } from './OutputPanel';
import { EDITION_SECTIONS } from './rules';
import { SheetSection } from './SheetSection';
import { useRules, useView } from './store';
import { S } from './strings';
import { Toc } from './Toc';
import { Toolbar } from './Toolbar';

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

const projectName = () => `${fileBase(useRules.getState().data)}.json`;

/** 快捷鍵（在 ToolShell 的通知範圍外綁定）要跳通知時用：由頁面裡的元件把 toast 交出來 */
const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
function ToastBridge() {
  toastRef.current = useToast();
  return null;
}

/** Ctrl＋S：存成專案檔（與「專案」選單的「存成專案檔」相同的檔案） */
function saveProjectNow() {
  try {
    const name = projectName();
    downloadText(
      serializeProject(TOOL_ID, DATA_VERSION, useRules.getState().data),
      name,
      'application/json',
    );
    toastRef.current?.({ title: S.toast.saved, description: name, tone: 'success' });
  } catch (e) {
    toastRef.current?.({
      title: S.toast.saveFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

/** 頁首的高度寫進 --hr-head（1024 px 以上頁首黏在頂端，目錄列要黏在它下面） */
function useHeaderHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('body header');
    const host = ref.current;
    if (!header || !host || typeof ResizeObserver === 'undefined') return;
    const set = () => host.style.setProperty('--hr-head', `${header.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, [ref]);
}

export function App() {
  const edition = useRules((s) => s.data.edition);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useRules);
  const layoutRef = useRef<HTMLDivElement>(null);
  useHeaderHeight(layoutRef);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
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
    [undo, redo],
  );

  const headerActions = (
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
      <ProjectMenu<HouseRulesData>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => useRules.getState().data}
        saveFileName={projectName}
        onLoad={(raw) => {
          const data = sanitizeData(raw);
          if (!data) return false;
          useRules.getState().replace(data);
          return true;
        }}
        onReset={() => {
          resetToolStore(useRules, { clearHistory: false });
          useView.getState().patch({ collapsed: {} });
        }}
        savedAt={savedAt}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDescription,
          confirmLabel: S.project.resetConfirm,
        }}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      body={
        <>
          <ToastBridge />
          <UsageSection persistKey={TOOL_ID}>
            <Usage />
          </UsageSection>
          <div
            ref={layoutRef}
            className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:grid-cols-[minmax(170px,200px)_minmax(0,1fr)_minmax(340px,400px)]"
          >
            <div className="hidden min-w-0 xl:block xl:sticky-pane">
              <Toc variant="column" />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="sticky top-0 z-20 -mx-3 lg:top-(--hr-head) lg:mx-0 xl:hidden">
                <Toc variant="strip" />
              </div>
              <Toolbar />
              <InfoCard />
              {EDITION_SECTIONS[edition].map((secId) => (
                <SheetSection key={secId} secId={secId} />
              ))}
              <RemarksCard />
            </div>
            <div className="min-w-0 lg:sticky-pane">
              <OutputPanel />
            </div>
          </div>
        </>
      }
    />
  );
}
