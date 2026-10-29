/**
 * 環境音混音器：程式合成的環境音（雨、風、雷、海浪、營火、時鐘、心跳、人聲…）疊在一起播放，預設組合、隨機組合、
 * 我的組合、分享連結，自己的音檔，匯出可以無縫循環的 WAV 給 CCFOLIA 當 BGM。
 * 寬畫面：左邊聲音與組合、右邊混音與匯出；窄畫面：混音在上。規格：docs/refactor/specs/ambience-mixer.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, UsageSection, useToast, withShortcut } from '@/ui';
import { cleanupAssets, rejectFiles, setNotifier, togglePlay } from './actions';
import { mixer, renderCount, startEngine } from './engine';
import { FilesSection, PresetsSection, SavedSection, SoundLibrary } from './Library';
import { MixPanel } from './MixPanel';
import { TOOL_ID } from './model';
import { ShareDialog, useOpenShared } from './Share';
import { mixNow, useMix, useRuntime } from './store';
import { S } from './strings';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ul>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

declare global {
  interface Window {
    __ambienceMixer?: unknown;
  }
}

/** 測試與對等驗證用的入口 */
function useTestHook() {
  useEffect(() => {
    window.__ambienceMixer = {
      state: () => mixNow(),
      status: () => ({ ...useRuntime.getState().status }),
      playing: () => mixer.playing,
      contextState: () => mixer.context?.state ?? 'none',
      currentTime: () => mixer.context?.currentTime ?? 0,
      level: () => mixer.level(),
      renders: () => renderCount(),
      tracks: () => mixer.trackIds(),
    };
  }, []);
}

/** ToolShell 裡面（UiProvider 之內）才拿得到通知與確認對話框：接到動作上、處理網址裡的分享連結 */
function Bridge() {
  const toast = useToast();
  useEffect(() => {
    setNotifier((o) => toast(o));
  }, [toast]);
  useOpenShared(toast);
  return null;
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useMix);
  useTestHook();
  useEffect(() => {
    startEngine();
    void cleanupAssets();
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'space', label: S.keys.play, group: S.keys.group, handler: togglePlay },
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.edit, handler: redo },
    ],
    [undo, redo],
  );

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.keys.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.keys.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={
        <>
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <PresetsSection />
          <SoundLibrary />
          <FilesSection onReject={rejectFiles} />
          <SavedSection />
        </>
      }
      preview={
        <>
          <MixPanel onShare={() => useRuntime.setState({ shareOpen: true })} />
          <ShareDialog />
          <Bridge />
        </>
      }
    />
  );
}
