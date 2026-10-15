/**
 * 動態對話泡泡產生器（規格 docs/refactor/specs/speech-bubble.md）：
 * 開頁先顯示範本一覽；選了範本進入編輯畫面（左邊泡泡／動畫／版面三個分頁，右邊預覽與匯出）。
 */
import {
  Clapperboard,
  LayoutTemplate,
  MessageCircleMore,
  Palette,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { importAssetFiles } from '@/core/assets';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { Gallery } from './Gallery';
import { type SbData, TOOL_ID } from './model';
import { type PlayHandle, Preview } from './Preview';
import { BubblesPanel, LayoutPanel, MotionPanel, PresetBar, stepPreset } from './panels';
import { applyPreset, PRESETS } from './presets';
import { StylePanel } from './StylePanel';
import {
  assets,
  DATA_VERSION,
  normalize,
  referencedImages,
  type Tab,
  usePrefs,
  useSb,
  useUi,
} from './store';
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
            value: 'style',
            label: S.tabs.style,
            icon: <Palette />,
            content: <StylePanel />,
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

/** 專案檔要一起存的圖（卡片的背景圖） */
const projectImages = (d: SbData): string[] => (d.card.image ? [d.card.image] : []);

/** 頁首的「專案」選單（在 ToolShell 裡面，才能用通知） */
function ProjectActions() {
  const savedAt = useSaveStatus(TOOL_ID);
  const cardImage = useSb((s) => s.data.card.image);
  const toast = useToast();
  return (
    <ProjectMenu<SbData>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => useSb.getState().data}
      getFiles={
        /* 有背景圖時存成 ZIP（project.json＋圖片）；沒有時照舊存 JSON */
        cardImage ? () => assets.exportFiles(projectImages(useSb.getState().data)) : undefined
      }
      openAccept=".json,.zip,application/json,application/zip"
      onLoad={async (raw, _file, files) => {
        const next = normalize(raw);
        if (!next) return false;
        if (files.size) {
          const imported = await importAssetFiles(assets, files.entries());
          if (imported.notPersisted) toast({ title: S.imageNotSaved, tone: 'warning' });
        }
        useSb.getState().replace(next);
        useSb.temporal.getState().clear();
        usePrefs.getState().patch({ started: true });
        useUi.setState({ screen: 'editor', selectedId: next.bubbles[0]?.id ?? null });
        return true;
      }}
      onReset={() => {
        /* 確認框寫「可以用『復原』回來」：留著復原紀錄 */
        resetToolStore(useSb, { clearHistory: false });
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
  );
}

export function App() {
  const screen = useUi((u) => u.screen);

  /* 開頁約 5 秒後整理一次圖片庫：只清以前留下、沒人用的圖（這次開頁寫進或讀過的都保留） */
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSb);
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
      <ProjectActions />
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
