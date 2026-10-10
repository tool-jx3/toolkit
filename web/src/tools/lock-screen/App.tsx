/**
 * 鎖定畫面訊息產生器：做一張「手機鎖定畫面＋一則一則跳出來的訊息通知」的圖（跑團的 handout：角色手機收到的訊息），
 * 匯出靜態 PNG 或訊息跳出來的 GIF；也可以把手機放在外框照片上（完整構圖）。
 * 規格：docs/refactor/specs/lock-screen.md。
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
  WindowDrop,
  withShortcut,
} from '@/ui';
import { appliedNotice, type BatchNotice, closeCrop, loadPhotoFiles, useCrop } from './media';
import { FULL_OUT, initialState, SCREEN_OUT, ZOOM_MAX } from './model';
import {
  CardStyleSection,
  GradientSection,
  LockSection,
  MessagesSection,
  OuterSection,
  PhoneSection,
  WallpaperSection,
} from './Panel';
import { type PlayHandle, Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  applyPhoto,
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPrefs,
  type PhotoSlot,
  prefsNow,
  referencedImages,
  resetAll,
  setPlacement,
  setPrefs,
  type TabId,
  TOOL_ID,
  useDoc,
  usePrefs,
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

function useNotify() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone });
  };
}

/** 照片的載入（選檔、拖放、貼上都走這裡）：讀好後打開裁切 */
function usePhotoLoader() {
  const notify = useNotify();
  return (slot: PhotoSlot, files: File[]) => void loadPhotoFiles(slot, files).then(notify);
}

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

/** 裁切對話框（新照片、重新裁切）：套用時換上照片與位置（一步復原） */
function CropHost() {
  const req = useCrop((s) => s.request);
  const notify = useNotify();
  const slot = req?.slot ?? 'wallpaper';
  return (
    <ImageFrameDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) closeCrop();
      }}
      image={req?.bitmap ?? null}
      aspect={slot === 'wallpaper' ? SCREEN_OUT.width / SCREEN_OUT.height : 1}
      output={slot === 'wallpaper' ? SCREEN_OUT : { width: FULL_OUT, height: FULL_OUT }}
      cover={{ maxZoom: ZOOM_MAX }}
      guides="thirds"
      initialPlacement={req?.initial ?? null}
      title={S.cropTitle[slot]}
      note={S.cropNote[slot]}
      onApply={(place) => {
        if (!req) return;
        if (req.fresh) applyPhoto(req.slot, req.ref, place);
        else setPlacement(req.slot, place);
        if (req.slot === 'outer') setPrefs({ preview: 'full' });
        notify(appliedNotice(req));
      }}
    />
  );
}

function Settings() {
  const load = usePhotoLoader();
  const tab = usePrefs((p) => p.data.tab);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    {
      value: 'messages',
      label: S.tabs.messages,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <MessagesSection />
          <CardStyleSection />
        </div>
      ),
    },
    {
      value: 'phone',
      label: S.tabs.phone,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <WallpaperSection onFiles={(f) => load('wallpaper', f)} paste={tab !== 'outer'} />
          <LockSection />
        </div>
      ),
    },
    {
      value: 'outer',
      label: S.tabs.outer,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <OuterSection onFiles={(f) => load('outer', f)} paste={tab === 'outer'} />
          <GradientSection />
          <PhoneSection />
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
      {/* 整個視窗都可以拖放照片：外框構圖分頁時換外框背景，其他時候換桌布 */}
      <WindowDrop
        label={tab === 'outer' ? S.windowDropOuter : S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => load(tab === 'outer' ? 'outer' : 'wallpaper', files)}
      />
    </div>
  );
}

/**
 * 頁首的「專案」選單：存成專案檔（ZIP：設定＋照片）、開啟、重設。
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
    __lockScreen?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態、播放位置） */
function useTestHook(play: React.RefObject<PlayHandle | null>) {
  useEffect(() => {
    window.__lockScreen = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      play: () => ({ t: play.current?.t ?? 0, playing: play.current?.playing ?? false }),
      seek: (t: number) => play.current?.seek(t),
    };
  }, [play]);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const playRef = useRef<PlayHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);
  useAssetCleanup();
  useTestHook(playRef);

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
        keys: 'space',
        label: S.playPause,
        group: S.groupPlay,
        handler: () => playRef.current?.toggle(),
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
      settings={
        <>
          <Settings />
          <CropHost />
        </>
      }
      preview={<Preview playRef={playRef} exportRef={exportRef} />}
    />
  );
}
