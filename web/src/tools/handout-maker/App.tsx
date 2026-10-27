/**
 * 線索道具產生器：做跑團用的線索 handout（報紙剪報、通緝令、便條、便利貼、拍立得、系統視窗、遊戲的系統通知、終端機、
 * 手機簡訊、電子郵件），可以塗黑、蓋狀態印章、換紙張質感與背景圖，匯出 PNG 或直接複製，貼到 CCFOLIA 或 Discord。
 * 好幾張存成清單（自動存在瀏覽器），也可以存成專案檔。規格：docs/refactor/specs/handout-maker.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import { getTool, hrefToTool } from '@/registry';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { ListSection } from './ListSection';
import {
  BgSection,
  ColorSection,
  FontSection,
  ImageSection,
  SizeSection,
  TextSection,
  TextureSection,
  ThemeSection,
  useImageLoader,
} from './Panel';
import { Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  activeNow,
  assets,
  blankState,
  DATA_VERSION,
  docNow,
  historyStep,
  prefsNow,
  referencedImages,
  resetAll,
  setPrefs,
  type TabId,
  TOOL_ID,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function Settings() {
  const load = useImageLoader();
  const tab = usePrefs((p) => p.data.tab);
  const items: { value: TabId; label: string; content: ReactNode }[] = [
    {
      value: 'content',
      label: S.tabs.content,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <ThemeSection />
          <TextSection />
        </div>
      ),
    },
    {
      value: 'look',
      label: S.tabs.look,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <FontSection />
          <ColorSection />
          <TextureSection />
          <SizeSection />
        </div>
      ),
    },
    {
      value: 'images',
      label: S.tabs.images,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <ImageSection onFiles={(f) => load('image', f)} />
          <BgSection onFiles={(f) => load('bg', f)} />
        </div>
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <ListSection />
      <Tabs<TabId>
        aria-label={S.tabsLabel}
        value={tab}
        onValueChange={(v) => setPrefs({ tab: v })}
        items={items}
        keepMounted
      />
      {/* 整個視窗都可以拖放圖片：換掉目前這張的附圖 */}
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => load('image', files)}
      />
    </div>
  );
}

/** 頁首的「專案」選單：存成專案檔（ZIP：清單＋圖片）、開啟、重設 */
function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => docNow()}
      getFiles={() => assets.exportFiles(projectAssetIds(docNow()))}
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      onLoad={async (data, _file, files) => {
        const r = await importProject(data, files);
        resetAll(r.state);
        return { warnings: [r.notSaved && S.projectNotSaved] };
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast(
            n.warnings
              ? { title: S.projectOpened, description: n.warnings.join(''), tone: 'warning' }
              : { title: S.projectOpened, description: n.fileName, tone: 'success' },
          );
        else if (n.kind === 'saved')
          toast({ title: S.projectSaved, description: n.fileName, tone: 'success' });
        else if (n.kind === 'open-failed')
          toast({ title: S.projectOpenFailed, description: n.message, tone: 'danger' });
        else toast({ title: S.projectReset });
      }}
      onReset={() => resetAll(blankState())}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}

/** 說明：使用方式＋本站的相關工具 */
function Usage() {
  const links = (['polaroid', 'lock-screen', 'social-post'] as const)
    .map((id) => getTool(id))
    .filter((t) => !!t);
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex flex-col gap-1.5 pl-5">
        {S.usage.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="m-0" data-testid="related-tools">
        {S.usageLinks}
        {links.map((t, i) => (
          <span key={t.id}>
            {i ? '、' : ''}
            <a className="text-accent underline" href={hrefToTool(t)}>
              {S.usageLinkNames[t.id as keyof typeof S.usageLinkNames]}
            </a>
          </span>
        ))}
        {S.usageLinksTail}
      </p>
    </div>
  );
}

declare global {
  interface Window {
    __handoutMaker?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態） */
function useTestHook() {
  useEffect(() => {
    window.__handoutMaker = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      active: () => activeNow(),
    };
  }, []);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const exportRef = useRef<ExportPanelHandle>(null);
  useAssetCleanup();
  useTestHook();

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: () => historyStep('undo') },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.redo,
        group: S.groupEdit,
        handler: () => historyStep('redo'),
      },
    ],
    [],
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
            onClick={() => historyStep('undo')}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={() => historyStep('redo')}
            disabled={!canRedo}
          />
          <ProjectActions />
        </>
      }
      settings={<Settings />}
      preview={<Preview exportRef={exportRef} />}
    />
  );
}
