/**
 * 地圖演出產生器：在地圖或平面圖上畫區域放大、移動路線與地點、房間遮罩，依時間軸做出「區域彈出放大、
 * 路線一路畫過去、迷霧散開房間出現」的探索演出；匯出 PNG、APNG、影片、X 用 MP4、房間遮罩 ZIP 等。
 * 規格：docs/refactor/specs/map-fx.md。引擎與大部分介面和截圖演出產生器共用（core/imagefx、@/ui/imagefx）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  type Shortcut,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import {
  FxSaveErrorNotice,
  ImageFxProjectMenu,
  imageFxShortcuts,
  useFxAssetCleanup,
} from '@/ui/imagefx';
import { type BatchNotice, loadImageFiles, loadSample } from './media';
import { Settings } from './Panel';
import { type PlayerHandle, Preview } from './Preview';
import { fx, historyStep, TOOL_ID, useDoc } from './store';
import { S } from './strings';
import { useTestHook } from './testHook';

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
      <FxSaveErrorNotice toolId={TOOL_ID} text={S.saveFailed} />
      <Settings
        onFiles={(files) => void loadImageFiles(files).then(notify)}
        onSample={(demo) => void loadSample(demo).then(notify)}
      />
      {/* 整個視窗都可以拖放地圖 */}
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
  useFxAssetCleanup(fx);
  useTestHook(playerRef);

  const shortcuts = useMemo<Shortcut[]>(
    () =>
      imageFxShortcuts(fx, S, () => playerRef.current?.toggle(), [
        { keys: 'enter', label: S.enterShortcut, group: S.groupPoints },
        { keys: 'backspace', label: S.backShortcut, group: S.groupPoints },
        { keys: 'escape', label: S.escPointShortcut, group: S.groupPoints },
      ]),
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
          <ImageFxProjectMenu fx={fx} text={S} />
        </>
      }
      settings={<SettingsColumn />}
      preview={<PreviewColumn playerRef={playerRef} exportRef={exportRef} />}
    />
  );
}
