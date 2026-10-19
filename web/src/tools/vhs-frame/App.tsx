/**
 * 錄影帶畫面產生器：把照片做成老錄影帶在映像管電視上播放的畫面（色差、撕裂、掉訊、追蹤條、雜訊、掃描線、弧面），
 * 加上字幕與左上的播放字樣、時間碼，匯出 PNG 或字幕逐字打出的 GIF（CoC 的錄影帶、監視器截圖這類 handout）。
 * 規格：docs/refactor/specs/vhs-frame.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { renderInto } from './exporter';
import { type BatchNotice, loadPhotoFiles } from './media';
import {
  animSize,
  gifFrameTime,
  initialState,
  masterWidthFor,
  SCREEN_W,
  screenSize,
} from './model';
import { PhotoSection, resetView, ScreenSection, TextSection } from './Panel';
import { Preview, type ScreenHandle } from './Preview';
import { importProject, projectAssetIds } from './project';
import { VhsRenderer } from './render';
import {
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPrefs,
  prefsNow,
  referencedImages,
  resetAll,
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

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function Settings({ onResetView }: { onResetView: () => void }) {
  const notify = useNotify();
  const load = (files: File[]) => void loadPhotoFiles(files).then(notify);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <PhotoSection onFiles={load} onResetView={onResetView} />
      <TextSection />
      <ScreenSection />
      {/* 整個視窗都可以拖放照片 */}
      <WindowDrop label={S.windowDrop} hint={S.windowDropHint} onDrop={(files) => load(files)} />
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
        usePrefs.getState().replace({ ...initialPrefs(), preview: p.preview });
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
    __vhsFrame?: unknown;
  }
}

/**
 * 測試與對等驗證用的入口：讀狀態、預覽的時間、停在某個時間；
 * frame(kind, at) 用目前的內容另外畫一格（'png'：t＝at；'anim'：第 at 格，四角透明、還沒鋪黑），回傳 PNG 的 data URL。
 */
function useTestHook(screen: React.RefObject<ScreenHandle | null>) {
  useEffect(() => {
    window.__vhsFrame = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      screen: () => screen.current?.state(),
      seek: (t: number, mode?: 'tape' | 'gif') => screen.current?.seek(t, mode),
      frame: async (kind: 'png' | 'anim', at: number) => {
        const s = docNow();
        const bmp = s.photo ? await assets.bitmap(s.photo.id).catch(() => undefined) : undefined;
        const size =
          kind === 'png' ? screenSize(s.aspect) : animSize(s.aspect, prefsNow().animSize);
        const r = new VhsRenderer();
        const master =
          bmp && s.photo
            ? r.compose(
                bmp,
                s.photo,
                s.view,
                s.aspect,
                kind === 'png' ? SCREEN_W : masterWidthFor(size.width),
              )
            : null;
        const c = document.createElement('canvas');
        c.width = size.width;
        c.height = size.height;
        if (kind === 'png') renderInto(r, c, s, master, at);
        else renderInto(r, c, s, master, gifFrameTime(at), at);
        return c.toDataURL('image/png');
      },
    };
  }, [screen]);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const screenRef = useRef<ScreenHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);
  useAssetCleanup();
  useTestHook(screenRef);

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
        handler: () => screenRef.current?.toggle(),
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
        <Settings
          onResetView={() => {
            resetView();
            screenRef.current?.focus();
          }}
        />
      }
      preview={<Preview screenRef={screenRef} exportRef={exportRef} />}
    />
  );
}
