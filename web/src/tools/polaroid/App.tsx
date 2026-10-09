/**
 * 拍立得相框產生器：照片放進拍立得相框、下方寫字，用壓克力筆在三個圖層上塗鴉、貼上加白邊的貼紙，存成 PNG。
 * 規格：docs/refactor/specs/polaroid.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { pickFiles } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { addStickerFiles, type BatchNotice, loadPhotoFiles } from './media';
import { initialState, STICKER_MAX } from './model';
import {
  CaptionSection,
  FrameSection,
  LayersSection,
  LockNotice,
  PenSection,
  PhotoSection,
  StickersSection,
} from './Panel';
import { Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPen,
  penNow,
  referencedImages,
  resetAll,
  selectSticker,
  setPen,
  setTool,
  TOOL_ID,
  useDoc,
  usePen,
  useUi,
} from './store';
import { S, type TabId } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：目前的狀態、復原紀錄、這次開頁放進來的都沒用到的圖才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gc(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 一批檔案的結果（照片、貼紙）：一則通知 */
function useBatchToast() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone });
  };
}

/** 照片的載入（選檔、拖放、貼上都走這裡）；要在 ToolShell 裡面用（通知） */
function usePhotoLoader() {
  const notify = useBatchToast();
  const load = async (files: File[]) => notify(await loadPhotoFiles(files));
  const pick = async () => {
    const files = await pickFiles({ accept: 'image/*' });
    if (files.length) await load(files);
  };
  return { load, pick };
}

function useStickerLoader() {
  const notify = useBatchToast();
  return async (files: File[]) => notify(await addStickerFiles(files));
}

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

/**
 * 整個視窗都可以拖放照片。拖到貼紙區時提示改說「加入貼紙」（放開由貼紙區處理），貼紙區停用時說明原因（對等驗證 F33）。
 */
function PhotoWindowDrop({ onDrop }: { onDrop: (files: File[]) => void }) {
  const onSticker = useUi((s) => s.dropOnSticker);
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const count = useDoc((s) => s.data.stickers.length);
  const [label, hint] = !onSticker
    ? [S.windowDrop, S.windowDropHint]
    : !hasPhoto
      ? [S.stickerOverlayLocked, S.stickerOverlayLockedHint]
      : count >= STICKER_MAX
        ? [S.stickerOverlayFull(STICKER_MAX), S.stickerOverlayFullHint]
        : [S.stickerOverlay, S.stickerOverlayHint(count, STICKER_MAX)];
  return <WindowDrop label={label} hint={hint} onDrop={onDrop} />;
}

function Settings() {
  const loader = usePhotoLoader();
  const addStickers = useStickerLoader();
  const tab = usePen((s) => s.data.tab);
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    {
      value: 'edit',
      label: S.tabs.edit,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <PhotoSection onFiles={(f) => void loader.load(f)} />
          <FrameSection />
          <CaptionSection />
        </div>
      ),
    },
    {
      value: 'decorate',
      label: S.tabs.decorate,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <LockNotice />
          {/* 沒有照片時整組停用（F20）；min-w-0：fieldset 預設的最小寬度會撐開窄畫面 */}
          <fieldset
            disabled={!hasPhoto}
            className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
            data-testid="decorate-panel"
          >
            <PenSection />
            <LayersSection />
            <StickersSection onFiles={(f) => void addStickers(f)} />
          </fieldset>
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
        onValueChange={(v) => setPen({ tab: v })}
        items={items}
        keepMounted
      />
      <PhotoWindowDrop onDrop={(files) => void loader.load(files)} />
    </div>
  );
}

/**
 * 頁首的「專案」選單。結果合成一則通知：開啟的專案檔有圖存不進這個瀏覽器時，「已開啟專案檔。」改成提醒
 * （重新整理之後就不見了；對等驗證 F51），不另外跳第二則。
 */
function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const lastOpen = useRef({ notSaved: false });
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
        lastOpen.current.notSaved = false;
        const r = await importProject(data, files);
        resetAll(r.state);
        lastOpen.current.notSaved = r.notSaved;
        return true;
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast(
            lastOpen.current.notSaved
              ? { title: S.projectOpened, description: S.projectNotSaved, tone: 'warning' }
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
        usePen.getState().replace(initialPen());
      }}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}

function PreviewArea() {
  const loader = usePhotoLoader();
  return <Preview onPick={() => void loader.pick()} />;
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
    __polaroid?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態） */
function useTestHook() {
  useEffect(() => {
    window.__polaroid = {
      doc: () => docNow(),
      pen: () => penNow(),
      ui: () => ({ selectedSticker: useUi.getState().selectedSticker }),
    };
  }, []);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  const hasPhoto = useDoc((s) => !!s.data.photo);
  const stickerIds = useDoc((s) => s.data.stickers.map((x) => x.id).join('|'));
  const selected = useUi((s) => s.selectedSticker);
  useAssetCleanup();
  useTestHook();

  /* 復原之後選取的貼紙不見了：取消選取 */
  useEffect(() => {
    if (selected && !stickerIds.split('|').includes(selected)) selectSticker(null);
  }, [selected, stickerIds]);

  const shortcuts = useMemo<Shortcut[]>(() => {
    const tool = (t: 'pen' | 'eraser' | 'move') => (hasPhoto ? () => setTool(t) : undefined);
    return [
      { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: () => historyStep('undo') },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.redo,
        group: S.groupEdit,
        handler: () => historyStep('redo'),
      },
      { keys: 'b', label: S.shortcutPen, group: S.groupTool, handler: tool('pen') },
      { keys: 'e', label: S.shortcutEraser, group: S.groupTool, handler: tool('eraser') },
      { keys: 'v', label: S.shortcutMove, group: S.groupTool, handler: tool('move') },
    ];
  }, [hasPhoto]);

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
          <ProjectActions />
        </>
      }
      settings={<Settings />}
      preview={<PreviewArea />}
    />
  );
}
