/**
 * 驗證題梗圖產生器：做一張「圖片驗證題」樣式的梗圖（上方色帶寫「請選出所有包含 ○○ 的圖片」＋代表圖，
 * 下面是 3 × 3 或 4 × 4 的圖片格，可以勾選），匯出靜態的 PNG，或游標一格一格點選、最後按「驗證」的動畫（GIF／APNG／WebP）。
 * 規格：docs/refactor/specs/captcha-card.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ImageFrameDialog,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { captchaTimeline } from './animation';
import { closeFrame } from './media';
import { initialState, ZOOM_MAX } from './model';
import {
  AvatarSection,
  EndingSection,
  LookSection,
  MiniSection,
  PlaySection,
  TextSection,
} from './Panel';
import { Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPrefs,
  prefsNow,
  referencedImages,
  resetAll,
  setArrange,
  setAvatarPlace,
  setCellPlace,
  setPrefs,
  type TabId,
  TOOL_ID,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪（這次開頁放進來的不刪） */
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

/** 調整範圍（代表圖、格子）：圖片一定蓋滿框，套用時只換位置（一步復原） */
function FrameHost() {
  const req = useUi((s) => s.frame);
  return (
    <ImageFrameDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) closeFrame();
      }}
      image={req?.image ?? null}
      aspect={1}
      cover={{ maxZoom: ZOOM_MAX }}
      initialPlacement={req?.initial ?? null}
      title={
        req?.target.kind === 'cell' ? S.frameTitle.cell(req.target.index + 1) : S.frameTitle.avatar
      }
      note={S.frameNote}
      onApply={(place) => {
        if (!req) return;
        if (req.target.kind === 'avatar') setAvatarPlace(place);
        else setCellPlace(req.target.index, place);
      }}
    />
  );
}

function Settings({ onExportGif }: { onExportGif: () => void }) {
  const tab = usePrefs((p) => p.data.tab);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    {
      value: 'card',
      label: S.tabs.card,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <TextSection />
          <AvatarSection />
          <LookSection />
        </div>
      ),
    },
    {
      value: 'anim',
      label: S.tabs.anim,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <EndingSection />
          <PlaySection />
          <MiniSection onExportGif={onExportGif} />
        </div>
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <Tabs<TabId>
        aria-label={S.tabsLabel}
        value={tab}
        onValueChange={(v) => setPrefs({ tab: v })}
        items={items}
        keepMounted
      />
    </div>
  );
}

/**
 * 頁首的「專案」選單：存成專案檔（ZIP：設定＋圖片）、開啟、重設。
 * 開啟的專案檔有圖存不進這個瀏覽器時，「已開啟專案檔」改成提醒（onLoad 回傳的 warnings）。
 */
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
        setArrange(false);
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
      onReset={() => {
        resetAll(initialState());
        setArrange(false);
        const p = prefsNow();
        usePrefs.getState().replace({ ...initialPrefs(), tab: p.tab });
      }}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}

function Usage() {
  return (
    <ol className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

declare global {
  interface Window {
    __captchaCard?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態、影格表） */
function useTestHook() {
  useEffect(() => {
    window.__captchaCard = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      ui: () => ({ arrange: useUi.getState().arrange }),
      timeline: () => {
        const t = captchaTimeline(docNow());
        return { layout: t.layout, frames: t.frames };
      },
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
      {
        keys: 'escape',
        label: S.exitArrange,
        group: S.groupGrid,
        handler: () => {
          if (useUi.getState().arrange) setArrange(false);
        },
      },
    ],
    [],
  );

  const exportGif = () => {
    setPrefs({ format: 'gif' });
    requestAnimationFrame(() => {
      exportRef.current?.exportNow('gif');
      document
        .querySelector('[data-testid="export-anchor"]')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

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
      settings={
        <>
          <Settings onExportGif={exportGif} />
          <FrameHost />
        </>
      }
      preview={<Preview exportRef={exportRef} />}
    />
  );
}
