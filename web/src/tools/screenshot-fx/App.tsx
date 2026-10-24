/**
 * 截圖演出產生器：在截圖上畫放大框、螢光筆、塗黑，依時間軸做出「周圍變暗、框彈出放大、螢光筆畫出來、
 * 塗黑揭開或蓋上」的演出；背景可以模糊、透明或單色，加上圓角、陰影與出處；匯出完成圖 PNG、APNG、MP4／透明 WebM。
 * 規格：docs/refactor/specs/screenshot-fx.md。
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
import { type BatchNotice, loadImageFiles, loadSample } from './media';
import { initialState } from './model';
import { Settings } from './Panel';
import { type PlayerHandle, Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  docNow,
  duplicate,
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
import { useTestHook } from './testHook';

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
        usePrefs.getState().replace({ ...initialPrefs(), loop: p.loop, stageBg: p.stageBg });
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
        onFiles={(files) => void loadImageFiles(files).then(notify)}
        onSample={(demo) => void loadSample(demo).then(notify)}
      />
      {/* 整個視窗都可以拖放截圖 */}
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => void loadImageFiles(files).then(notify)}
      />
    </div>
  );
}

function PreviewColumn({
  playerRef,
  exportRef,
}: {
  playerRef: React.RefObject<PlayerHandle | null>;
  exportRef: React.RefObject<ExportPanelHandle | null>;
}) {
  const notify = useNotify();
  return (
    <Preview
      playerRef={playerRef}
      exportRef={exportRef}
      onSample={(demo) => void loadSample(demo).then(notify)}
    />
  );
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const playerRef = useRef<PlayerHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);
  useAssetCleanup();
  useTestHook(playerRef);

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
        handler: () => {
          if (docNow().image) playerRef.current?.toggle();
        },
      },
      {
        keys: 'mod+d',
        label: S.dupShortcut,
        group: S.groupFrame,
        handler: () => {
          const id = useLive.getState().selected;
          if (id) duplicate(id);
        },
      },
      { keys: ['delete', 'backspace'], label: S.delShortcut, group: S.groupFrame },
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.nudgeShortcut,
        group: S.groupFrame,
      },
      { keys: 'escape', label: S.escShortcut, group: S.groupFrame },
      { keys: 'shift', label: S.shiftShortcut, group: S.groupFrame },
      { keys: 'escape', label: S.escViewShortcut, group: S.groupPlay },
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
      preview={<PreviewColumn playerRef={playerRef} exportRef={exportRef} />}
    />
  );
}
