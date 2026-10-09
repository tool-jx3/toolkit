/**
 * 動態對話泡泡產生器（規格 docs/refactor/specs/speech-bubble.md）：
 * 開頁先顯示範本一覽；選了範本進入編輯畫面（左邊泡泡／動畫／版面三個分頁，右邊預覽與匯出）。
 */
import { Clapperboard, LayoutTemplate, MessageCircleMore, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  withShortcut,
} from '@/ui';
import { Gallery } from './Gallery';
import { type SbData, TOOL_ID } from './model';
import { type PlayHandle, Preview } from './Preview';
import { BubblesPanel, LayoutPanel, MotionPanel, PresetBar, stepPreset } from './panels';
import { applyPreset, PRESETS } from './presets';
import { DATA_VERSION, normalize, type Tab, usePrefs, useSb, useUi } from './store';
import { S } from './strings';

declare global {
  interface Window {
    __speechBubble?: unknown;
  }
}

function Usage() {
  return (
    <ol>
      {S.usage.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ol>
  );
}

function EditorSettings() {
  const tab = useUi((u) => u.tab);
  return (
    <>
      <PresetBar />
      <Tabs<Tab>
        aria-label={S.tabsLabel}
        value={tab}
        onValueChange={(v) => useUi.setState({ tab: v })}
        items={[
          {
            value: 'bubbles',
            label: S.tabs.bubbles,
            icon: <MessageCircleMore />,
            content: <BubblesPanel />,
          },
          {
            value: 'motion',
            label: S.tabs.motion,
            icon: <Clapperboard />,
            content: <MotionPanel />,
          },
          {
            value: 'layout',
            label: S.tabs.layout,
            icon: <LayoutTemplate />,
            content: <LayoutPanel />,
          },
        ]}
      />
    </>
  );
}

export function App() {
  const screen = useUi((u) => u.screen);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSb);
  const playRef = useRef<PlayHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* 測試與除錯用 */
  useEffect(() => {
    window.__speechBubble = {
      data: () => useSb.getState().data,
      prefs: () => usePrefs.getState().data,
      ui: () => useUi.getState(),
      set: (patch: Partial<SbData>) =>
        useSb.getState().replace({ ...useSb.getState().data, ...patch }),
      applyPreset: (id: string) => {
        const p = PRESETS.find((x) => x.id === id);
        if (p) useSb.getState().replace(applyPreset(p));
      },
      scene: () => {
        const s = playRef.current?.scene;
        if (!s) return null;
        return {
          width: s.width,
          height: s.height,
          duration: s.duration,
          ready: s.ready,
          leave: s.leave,
          empty: s.empty,
          overflow: s.overflow,
          items: s.items.map((it) => ({
            x: it.x,
            y: it.y,
            w: it.layout.w,
            h: it.layout.h,
            lines: it.layout.lines.map((l) => l.chars.join('')),
            ...it.timing,
          })),
        };
      },
      seek: (t: number) => playRef.current?.seek(t),
      setPlaying: (on: boolean) => playRef.current?.setPlaying(on),
      get t() {
        return playRef.current?.t ?? 0;
      },
      get playing() {
        return playRef.current?.playing ?? false;
      },
      exportNow: (format?: string) => exportRef.current?.exportNow(format),
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: '編輯', handler: redo },
    ...(screen === 'gallery'
      ? [
          {
            keys: '/',
            label: S.searchLabel,
            group: '範本一覽',
            handler: () => searchRef.current?.focus(),
          },
        ]
      : [
          { keys: '[', label: S.prevPreset, group: '範本', handler: () => stepPreset(-1) },
          { keys: ']', label: S.nextPreset, group: '範本', handler: () => stepPreset(1) },
        ]),
  ];

  const headerActions = (
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
      <ProjectMenu<SbData>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => useSb.getState().data}
        onLoad={(raw) => {
          const next = normalize(raw);
          if (!next) return false;
          useSb.getState().replace(next);
          clear();
          usePrefs.getState().patch({ started: true });
          useUi.setState({ screen: 'editor', selectedId: next.bubbles[0]?.id ?? null });
          return true;
        }}
        onReset={() => {
          resetToolStore(useSb);
          usePrefs.getState().patch({ started: false });
          useUi.setState({ screen: 'gallery', selectedId: null });
        }}
        resetConfirm={{
          title: S.resetTitle,
          description: S.resetDescription,
          confirmLabel: '重設',
        }}
        savedAt={savedAt}
        fileName={S.projectFile}
      />
    </>
  );

  if (screen === 'gallery')
    return (
      <ToolShell
        toolId={TOOL_ID}
        shortcuts={shortcuts}
        usage={<Usage />}
        headerActions={headerActions}
        body={<Gallery searchRef={searchRef} />}
      />
    );
  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={<Usage />}
      headerActions={headerActions}
      settings={<EditorSettings />}
      preview={<Preview playRef={playRef} exportRef={exportRef} />}
    />
  );
}
