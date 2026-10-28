import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  playbackShortcuts,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import {
  cleanupOnOpen,
  dropFiles,
  notify,
  openProject,
  projectData,
  projectFiles,
  rerollAll,
  resetAll,
  selectLine,
  setToaster,
  stampNow,
  syncAudio,
  syncBackground,
  syncFonts,
  toggleLock,
} from './actions';
import { savePng, setForceRealtime } from './exporter';
import { normalizeSettings, type Settings } from './model';
import {
  Preview,
  previewCanvasEl,
  previewNow,
  restartPreview,
  rewindPreview,
  seekPreview,
  togglePreview,
} from './Preview';
import { CanvasTab, ExportTab, LyricsTab, StyleTab } from './panels';
import { builtLines, fontsToLoad, placementOf, planOf, styleOf, styleSettings } from './scene';
import {
  edit,
  PROJECT_VERSION,
  player,
  setTab,
  settingsNow,
  type TabId,
  TOOL_ID,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

const USAGE = (
  <>
    <ol>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    <p>{S.about}</p>
  </>
);

function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    setToaster(toast);
    return () => setToaster(null);
  }, [toast]);
  return null;
}

/** 設定裡的音樂、背景圖換了（含復原、開啟專案檔）就重新準備 */
function useMediaSync() {
  const audioId = useSettings((st) => st.data.audio.id);
  const bgId = useSettings((st) => st.data.background.image.id);
  useEffect(() => {
    void syncAudio(audioId);
  }, [audioId]);
  useEffect(() => {
    void syncBackground(bgId);
  }, [bgId]);
}

/** 字型：換字型（含逐句換的字型）或改了歌詞就載入用到的字（0.25 秒內的連續變更合併） */
function useFontSync() {
  const s = useSettings((st) => st.data);
  const key = JSON.stringify(fontsToLoad(s));
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在字型或用到的字改變時載入
  useEffect(() => {
    const t = setTimeout(() => {
      void syncFonts(settingsNow());
    }, 250);
    return () => clearTimeout(t);
  }, [key]);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.addEventListener) return;
    const bump = () => useSession.setState((st) => ({ fontTick: st.fontTick + 1 }));
    fonts.addEventListener('loadingdone', bump);
    return () => fonts.removeEventListener('loadingdone', bump);
  }, []);
}

declare global {
  interface Window {
    __lyricFx?: unknown;
  }
}

/** 測試與對等驗證用的入口 */
function useTestHook() {
  useEffect(() => {
    window.__lyricFx = {
      settings: () => settingsNow(),
      set: (path: string, value: unknown) =>
        edit((d) => {
          const keys = path.split('.');
          // biome-ignore lint/suspicious/noExplicitAny: 測試入口
          let o: any = d;
          for (const k of keys.slice(0, -1)) o = o[k];
          o[keys[keys.length - 1]] = value;
        }),
      replace: (v: unknown) => useSettings.getState().replace(normalizeSettings(v)),
      session: () => {
        const st = useSession.getState();
        return {
          audioState: st.audioState,
          duration: st.audio?.duration ?? 0,
          bgState: st.bgState,
          exporting: st.exporting,
          fontTick: st.fontTick,
          regionEditing: st.regionEditing,
          regionPending: st.regionPending,
        };
      },
      lines: () => builtLines(settingsNow()).lines,
      rows: () => builtLines(settingsNow()).rows,
      plan: () => {
        const s = settingsNow();
        const p = planOf(s, useSession.getState().fontTick) as {
          width: number;
          height: number;
          preview: number;
          lines: {
            key: string;
            x: number;
            y: number;
            angle: number;
            rows: string[];
            start: number;
            interval: number;
            slotBorn: number | null;
            fadeStart: number;
            fadeEnd: number;
            box: { x: number; y: number; width: number; height: number };
            locked: boolean;
            latin: boolean;
            font: string;
            pinned?: boolean;
            th?: number;
            textColor?: string;
            glowColor?: string;
            opacity?: number;
            glyphs: { adv?: number }[];
          }[];
        };
        return {
          width: p.width,
          height: p.height,
          preview: p.preview,
          lines: p.lines.map((l) => ({
            key: l.key,
            x: l.x,
            y: l.y,
            angle: l.angle,
            rows: l.rows,
            start: l.start,
            interval: l.interval,
            slotBorn: l.slotBorn,
            fadeStart: Number.isFinite(l.fadeStart) ? l.fadeStart : null,
            fadeEnd: Number.isFinite(l.fadeEnd) ? l.fadeEnd : null,
            box: l.box,
            locked: l.locked,
            latin: l.latin,
            font: l.font,
            pinned: !!l.pinned,
            th: l.th ?? null,
            textColor: l.textColor ?? null,
            glowColor: l.glowColor ?? null,
            opacity: l.opacity ?? null,
            width: l.glyphs.reduce((w, g) => w + (g.adv ?? 0), 0),
          })),
        };
      },
      /* 逐句的手動調整（F75～F81） */
      selected: () => useSession.getState().selected,
      select: (key: string | null) => selectLine(key, 'preview'),
      placement: (key: string, t?: number) =>
        placementOf(settingsNow(), useSession.getState().fontTick, key, t ?? previewNow()),
      hit: (x: number, y: number, t?: number) => {
        const s = settingsNow();
        return (
          styleOf(s).hitTest?.(
            planOf(s, useSession.getState().fontTick),
            styleSettings(s),
            t ?? previewNow(),
            x,
            y,
          ) ?? null
        );
      },
      seek: (t: number) => seekPreview(t),
      time: () => previewNow(),
      toggle: () => togglePreview(),
      player: {
        time: () => player.time(),
        playing: () => player.playing,
        play: (t?: number) => player.play(t),
        pause: () => player.pause(),
      },
      canvas: () => previewCanvasEl(),
      lock: (key: string) => toggleLock(key),
      savePng: () => savePng(),
      forceRealtime: (v: boolean) => setForceRealtime(v),
    };
  }, []);
}

const TABS: TabId[] = ['lyrics', 'style', 'canvas', 'export'];

/** 框選避開區域時其他快捷鍵不作用 */
const free = (fn: () => void) => () => {
  if (!useSession.getState().regionEditing) fn();
};

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const tab = useSession((st) => st.tab);
  const exporting = useSession((st) => st.exporting);
  useMediaSync();
  useFontSync();
  useTestHook();
  useEffect(() => {
    void cleanupOnOpen();
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      ...playbackShortcuts({
        toggle: free(togglePreview),
        rewind: free(rewindPreview),
        group: S.keys.group,
        labels: { toggle: S.keys.play },
      }),
      {
        keys: 'alt+shift+p',
        label: S.keys.playAnywhere,
        group: S.keys.group,
        handler: free(togglePreview),
        allowInInput: true,
      },
      { keys: 'r', label: S.keys.restart, group: S.keys.group, handler: free(restartPreview) },
      { keys: 'g', label: S.keys.reroll, group: S.keys.group, handler: free(rerollAll) },
      /* 預覽上選取的句（F76）：由 LineOverlay 自己處理，這裡只列在說明裡 */
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.keys.nudge,
        group: S.keys.group,
      },
      {
        keys: ['shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown'],
        label: S.keys.nudge10,
        group: S.keys.group,
      },
      { keys: 'escape', label: S.keys.deselect, group: S.keys.group },
      { keys: 'shift', label: S.keys.rotateSnap, group: S.keys.group },
      {
        keys: 'mod+enter',
        label: S.keys.stamp,
        group: S.keys.group,
        handler: () => {
          if (!useSession.getState().exporting) stampNow();
        },
        allowInInput: true,
      },
      {
        keys: 'mod+z',
        label: S.keys.undo,
        group: S.keys.group,
        handler: () => {
          if (!useSession.getState().exporting) undo();
        },
      },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.keys.redo,
        group: S.keys.group,
        handler: () => {
          if (!useSession.getState().exporting) redo();
        },
      },
    ],
    [undo, redo],
  );

  const items = TABS.map((value) => ({
    value,
    label: S.tabs[value],
    content:
      value === 'lyrics' ? (
        <LyricsTab />
      ) : value === 'style' ? (
        <StyleTab />
      ) : value === 'canvas' ? (
        <CanvasTab />
      ) : (
        <ExportTab />
      ),
    disabled: exporting && value !== tab,
  }));

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo || exporting}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo || exporting}
          />
          <ProjectMenu<Settings>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={projectData}
            getFiles={projectFiles}
            openAccept=".zip,.json"
            fileNameFor={(now) => {
              const p = (n: number) => String(n).padStart(2, '0');
              return `${TOOL_ID}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
            }}
            onLoad={async (data, project, files) => {
              if (useSession.getState().exporting) throw new Error(S.toast.busy);
              const r = await openProject(data, project.version, files);
              if (r.missing) notify({ title: S.project.missing(r.missing), tone: 'warning' });
              return { warnings: [r.notPersisted > 0 && S.project.notPersisted] };
            }}
            onReset={resetAll}
            resetText={{ title: S.project.resetTitle, description: S.project.resetText }}
            resetDisabled={exporting}
            openDisabled={exporting}
            savedAt={savedAt}
          />
        </>
      }
      settings={
        <>
          <ToastBridge />
          <WindowDrop
            onDrop={(files) => dropFiles(files)}
            label={S.preview.dropLabel}
            hint={S.preview.dropDetail}
            disabled={exporting}
          />
          <UsageSection persistKey="lyric-fx">{USAGE}</UsageSection>
          <Tabs<TabId> aria-label={S.tabsAria} value={tab} onValueChange={setTab} items={items} />
        </>
      }
      preview={<Preview />}
    />
  );
}
