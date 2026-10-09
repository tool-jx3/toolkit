import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
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
  resetAll,
  setToaster,
  stampNow,
  syncAudio,
  syncCover,
  syncFonts,
} from './actions';
import { savePng, setForceRealtime } from './exporter';
import { fontStack } from './fonts';
import { frameLayout } from './layout';
import { type FontId, normalizeSettings, type Settings } from './model';
import { Preview, togglePreview } from './Preview';
import { DesignTab, ExportTab, LyricsTab, MotionTab, TrackTab } from './panels';
import { parsedLyrics, previewBridge } from './scene';
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

/** 把 ToolShell 裡的 toast 交給 actions */
function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    setToaster(toast);
    return () => setToaster(null);
  }, [toast]);
  return null;
}

/** 設定裡的封面、音樂換了（含復原、開啟專案檔）就重新準備 */
function useMediaSync() {
  const coverId = useSettings((st) => st.data.cover.id);
  const audioId = useSettings((st) => st.data.audio.id);
  useEffect(() => {
    void syncCover(coverId);
  }, [coverId]);
  useEffect(() => {
    void syncAudio(audioId);
  }, [audioId]);
}

/** 字型：換字型或改了文字就載入用到的字（0.25 秒內的連續變更合併） */
function useFontSync() {
  const s = useSettings((st) => st.data);
  const key = `${s.font}|${s.title}|${s.artist}|${s.subtitle}|${s.hudText}|${s.hudTextAuto}|${s.export.fps}|${s.lyrics.enabled ? s.lyrics.text : ''}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在用到的文字或字型改變時載入
  useEffect(() => {
    const t = setTimeout(() => void syncFonts(settingsNow()), 250);
    return () => clearTimeout(t);
  }, [key]);
  /* 任何字型（含 Google Fonts 分段載入的字）載好時重新量字、重畫 */
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
    __musicFrame?: unknown;
  }
}

/** 測試與對等驗證用的入口 */
function useTestHook() {
  useEffect(() => {
    window.__musicFrame = {
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
          coverState: st.coverState,
          artId: st.artId,
          demo: !!st.art?.demo,
          audioState: st.audioState,
          duration: st.audio?.duration ?? 0,
          sampleRate: st.audio?.pcm.sampleRate ?? 0,
          exporting: st.exporting,
          recording: st.recording,
          fontTick: st.fontTick,
        };
      },
      lyrics: () => parsedLyrics(settingsNow().lyrics.text).parsed,
      layout: () => frameLayout(settingsNow().layout),
      player: {
        time: () => player.time(),
        playing: () => player.playing,
        play: (t?: number) => player.play(t),
        pause: () => player.pause(),
        seek: (t: number) => player.seek(t),
      },
      clock: () => {
        const c = previewBridge()?.clock();
        return c ? { t: c.t, beat: c.beat } : null;
      },
      savePng: () => savePng(),
      forceRealtime: (v: boolean) => setForceRealtime(v),
      fontStack: (id: FontId) => fontStack(id),
    };
  }, []);
}

const TABS: TabId[] = ['track', 'design', 'motion', 'lyrics', 'export'];

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const tab = useSession((st) => st.tab);
  const exporting = useSession((st) => st.exporting);
  useMediaSync();
  useFontSync();
  useTestHook();
  /* 開頁時清掉以前留下、沒有用到的檔案 */
  useEffect(() => {
    void cleanupOnOpen();
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'space', label: S.keys.play, group: S.keys.group, handler: () => togglePreview() },
      {
        keys: 'alt+shift+p',
        label: S.keys.playAnywhere,
        group: S.keys.group,
        handler: () => togglePreview(),
        allowInInput: true,
      },
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
      value === 'track' ? (
        <TrackTab />
      ) : value === 'design' ? (
        <DesignTab />
      ) : value === 'motion' ? (
        <MotionTab />
      ) : value === 'lyrics' ? (
        <LyricsTab />
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
            fileNameFor={(now) => {
              const p = (n: number) => String(n).padStart(2, '0');
              return `${settingsNow().title.trim() || TOOL_ID}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
            }}
            onLoad={async (data, project, files) => {
              /* 選檔視窗開著時開始匯出：說明原因（不要回傳 false，那會被當成專案檔的內容不能用） */
              if (useSession.getState().exporting) throw new Error(S.toast.busy);
              const r = await openProject(data, project.version, files);
              if (r.missing) notify({ title: S.project.missing(r.missing), tone: 'warning' });
              /* 存不進瀏覽器：和「已開啟專案檔」合成一則 */
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
          <UsageSection persistKey="music-frame">{USAGE}</UsageSection>
          <Tabs<TabId> aria-label={S.tabsAria} value={tab} onValueChange={setTab} items={items} />
        </>
      }
      preview={<Preview />}
    />
  );
}
