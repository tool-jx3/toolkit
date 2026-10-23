/**
 * RPG 截圖產生器：把一張圖做成老式 RPG 遊戲的截圖——像素化、抖色、色調濾鏡，加上訊息視窗（名字、台詞、頭像、選項）、
 * 演出文字、地點標示、掃描線與暗角；預覽可以逐字打出（有打字音效），匯出 PNG、複製圖片、逐字打出的 GIF（可以包含所有頁）。
 * 規格：docs/refactor/specs/rpg-screenshot.md。
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
import {
  type BatchNotice,
  loadBackgroundFiles,
  loadFaceFiles,
  loadSampleBackground,
} from './media';
import { initialState } from './model';
import { Settings } from './Panel';
import { Preview, type ScreenHandle, useTestHook } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  docNow,
  goPage,
  historyStep,
  initialPrefs,
  prefsNow,
  referencedImages,
  resetAll,
  TOOL_ID,
  useDoc,
  useLive,
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
        usePrefs
          .getState()
          .replace({ ...initialPrefs(), locked: false, sound: p.sound, pitch: p.pitch });
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
        label: S.playShortcut,
        group: S.groupPlay,
        handler: () => screenRef.current?.play(),
      },
      {
        keys: 'arrowleft',
        label: S.prevShortcut,
        group: S.groupPlay,
        handler: () => goPage(useLive.getState().page - 1),
      },
      {
        keys: 'arrowright',
        label: S.nextShortcut,
        group: S.groupPlay,
        handler: () => goPage(useLive.getState().page + 1, true),
      },
      {
        keys: 'mod+s',
        label: S.pngShortcut,
        group: S.groupExport,
        allowInInput: true,
        handler: () => {
          if (docNow().bg) exportRef.current?.exportNow('png');
        },
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
      settings={<SettingsColumn />}
      preview={<PreviewColumn screenRef={screenRef} exportRef={exportRef} />}
    />
  );
}

function useNotify() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone });
  };
}

function SettingsColumn() {
  const notify = useNotify();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <Settings
        onBgFiles={(files) => void loadBackgroundFiles(files).then(notify)}
        onFaceFiles={(files) => void loadFaceFiles(files).then(notify)}
        onSample={() => void loadSampleBackground().then(notify)}
      />
      {/* 整個視窗都可以拖放背景圖 */}
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => void loadBackgroundFiles(files).then(notify)}
      />
    </div>
  );
}

function PreviewColumn({
  screenRef,
  exportRef,
}: {
  screenRef: React.RefObject<ScreenHandle | null>;
  exportRef: React.RefObject<ExportPanelHandle | null>;
}) {
  const notify = useNotify();
  return (
    <Preview
      screenRef={screenRef}
      exportRef={exportRef}
      onSample={() => void loadSampleBackground().then(notify)}
    />
  );
}
