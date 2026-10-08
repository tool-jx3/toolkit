import { FolderOpen, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  type Shortcut,
  ToolShell,
  useModelCache,
  WindowDrop,
  withShortcut,
} from '@/ui';
import {
  cycleBackground,
  debugState,
  openFile,
  pickPsd,
  presetByNumber,
  redo,
  saveSettings,
  setAnchorMode,
  setCamera,
  setSectionRevealer,
  shutdown,
  toggleAnchorMode,
  togglePause,
  undo,
} from './actions';
import { getEngine } from './engine';
import { faceModelSpec } from './faceModel';
import { revealSection, SettingsPanel } from './Panels';
import { fitView, PreviewColumn } from './Preview';
import { PRESET_IDS, TOOL_ID } from './params';
import { useEdit, useSession } from './store';
import { S } from './strings';
import { Usage } from './Usage';
import { useDirty } from './useDirty';

const faceSpec = faceModelSpec();

/** 不重複觸發（按住不放時） */
const once =
  (fn: () => void) =>
  (e: KeyboardEvent): void => {
    if (!e.repeat) fn();
  };

const hasModel = () => !!useSession.getState().model;

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useEdit);
  const faceModel = useModelCache(faceSpec);
  const dirty = useDirty();

  useEffect(() => {
    setSectionRevealer(revealSection);
    /* 測試入口與狀態檢查（唯讀的狀態＋讓預覽停在決定性的姿勢） */
    Object.defineProperty(window, '__animeRig', {
      configurable: true,
      value: Object.freeze({
        state: debugState,
        still: () => getEngine()?.still(),
      }),
    });
    /* ?cam=1：開頁就開攝影機追蹤（F61） */
    if (new URLSearchParams(location.search).get('cam') === '1') void setCamera(true);
    const onHide = () => shutdown();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      setSectionRevealer(null);
    };
  }, []);

  /* 有未儲存的調整時，關閉頁面前確認（F77） */
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = S.leaveConfirm;
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'space',
        label: S.keys.pause,
        group: S.keys.groupPlay,
        handler: once(() => {
          if (hasModel()) togglePause();
        }),
      },
      ...PRESET_IDS.map((p, i) => ({
        keys: String(i + 1),
        label: S.keys.preset(S.presets[p]),
        group: S.keys.groupPlay,
        handler: once(() => {
          if (hasModel()) presetByNumber(i + 1);
        }),
      })),
      {
        keys: '0',
        label: S.keys.presetClear,
        group: S.keys.groupPlay,
        handler: once(() => presetByNumber(0)),
      },
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.groupEdit, handler: undo },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.keys.redo,
        group: S.keys.groupEdit,
        handler: redo,
      },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.groupEdit,
        allowInInput: true,
        handler: once(saveSettings),
      },
      {
        keys: 'mod+o',
        label: S.keys.open,
        group: S.keys.groupEdit,
        allowInInput: true,
        handler: once(() => void pickPsd()),
      },
      {
        keys: 'e',
        label: S.keys.anchor,
        group: S.keys.groupEdit,
        handler: once(() => {
          if (hasModel()) toggleAnchorMode();
        }),
      },
      {
        keys: 'escape',
        label: S.keys.esc,
        group: S.keys.groupEdit,
        handler: () => {
          if (useSession.getState().anchorMode) setAnchorMode(false);
        },
      },
      { keys: 'f', label: S.keys.fit, group: S.keys.groupView, handler: once(fitView) },
      {
        keys: 'b',
        label: S.keys.bg,
        group: S.keys.groupView,
        handler: once(() => {
          if (hasModel()) cycleBackground();
        }),
      },
      { keys: [], label: S.keys.zoom, group: S.keys.groupView },
      { keys: [], label: S.keys.pan, group: S.keys.groupView },
      { keys: [], label: S.keys.dblclick, group: S.keys.groupView },
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
          <Button
            size="sm"
            variant="primary"
            icon={<FolderOpen />}
            onClick={() => void pickPsd()}
            title={withShortcut(S.open, 'mod+o')}
          >
            {S.open}
          </Button>
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
          <WindowDrop label={S.dropOverlay} onDrop={(files) => files[0] && openFile(files[0])} />
        </>
      }
      settings={<SettingsPanel faceModel={faceModel} />}
      preview={<PreviewColumn />}
    />
  );
}
