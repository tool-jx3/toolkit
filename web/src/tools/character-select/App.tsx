import { FileJson, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { referencedAssetIds } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { ProjectFileError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { AppearanceTab } from './AppearanceTab';
import { ensureImages, notify, resetAll, setToaster, syncEditingPlayer } from './actions';
import { CharactersTab } from './CharactersTab';
import { isDemoImage } from './demo';
import { ExportTab } from './ExportTab';
import { exportFile, planFor } from './exporter';
import { bakeHtmlImages, buildInteractiveHtml, htmlFont } from './html';
import { mainPanelRects, tileRects } from './layout';
import { MotionTab } from './MotionTab';
import { generateHtml, resolveAssets } from './media';
import {
  framePlan,
  gifFramePlan,
  sceneAt,
  selectionPath,
  timelineDuration,
  videoFramePlan,
} from './motion';
import { Preview, type PreviewHandle } from './Preview';
import {
  openLegacyProject,
  openProject,
  type ProjectData,
  projectData,
  projectFiles,
} from './project';
import { normalizeSettings } from './sanitize';
import {
  assets,
  edit,
  PROJECT_VERSION,
  setTab,
  settingsNow,
  type TabId,
  TOOL_ID,
  useSession,
  useSettings,
} from './store';
import { RENDER_TEXT, S } from './strings';
import { TabLabel } from './widgets';

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

/** 設定用到的圖片：解碼後放進 useSession.images */
function useImageSync() {
  const characters = useSettings((st) => st.data.characters);
  const bg = useSettings((st) => st.data.background.image);
  useEffect(() => {
    ensureImages([...characters.map((c) => c.image), ...(bg ? [bg] : [])]);
  }, [characters, bg]);
}

/** 字型：換了就先載入畫布要用的字重，好了再重畫 */
function useFontSync() {
  const font = useSettings((st) => st.data.font);
  useEffect(() => {
    let alive = true;
    Promise.all([700, 800, 900].map((w) => ensureFont(font.family, w))).then(() => {
      if (alive) useSession.setState((st) => ({ fontTick: st.fontTick + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [font]);
}

declare global {
  interface Window {
    __characterSelect?: unknown;
  }
}

/** 測試與對等驗證用的入口 */
function useTestHook(preview: React.RefObject<PreviewHandle | null>) {
  useEffect(() => {
    window.__characterSelect = {
      settings: () => settingsNow(),
      replace: (v: unknown) => useSettings.getState().replace(normalizeSettings(v)),
      set: (path: string, value: unknown) =>
        edit((d) => {
          const keys = path.split('.');
          // biome-ignore lint/suspicious/noExplicitAny: 測試入口
          let o: any = d;
          for (const k of keys.slice(0, -1)) o = o[k];
          o[keys[keys.length - 1]] = value;
        }),
      duration: () => timelineDuration(settingsNow()),
      tiles: () => tileRects(settingsNow()),
      mainRects: () => mainPanelRects(settingsNow()),
      scene: (t: number) => sceneAt(settingsNow(), t),
      path: (player: number) => {
        const s = settingsNow();
        return selectionPath(s, player, s.players.targets[player], s.characters.length);
      },
      plans: (fps: number) => {
        const s = settingsNow();
        return {
          image: framePlan(s, fps),
          gif: gifFramePlan(s, fps),
          video: videoFramePlan(s, fps),
        };
      },
      planFor: (format: 'apng' | 'webp' | 'gif' | 'mp4' | 'avi', fps: number) =>
        planFor(settingsNow(), format, fps),
      editingPlayer: () => useSession.getState().editingPlayer,
      tab: () => useSession.getState().tab,
      html: () => generateHtml(settingsNow()),
      /** 固定 id 的互動 HTML（比對用） */
      htmlFixed: async () => {
        const s = settingsNow();
        const baked = await bakeHtmlImages(s, await resolveAssets(s), async () => null);
        return buildInteractiveHtml(s, baked, htmlFont(s, null), 'csx-test');
      },
      exportFile: async (
        format: 'apng' | 'webp' | 'gif' | 'mp4' | 'avi',
        fps: number,
        scale: number,
      ) => {
        const s = settingsNow();
        const r = await exportFile({
          settings: s,
          assets: await resolveAssets(s),
          format,
          fps,
          scale,
          webpQuality: s.export.webpQuality,
          signal: new AbortController().signal,
          onProgress: () => {},
        });
        return {
          size: r.blob.size,
          type: r.blob.type,
          name: r.fileName,
          frames: r.frames,
          width: r.width,
          height: r.height,
        };
      },
      text: RENDER_TEXT,
      get time() {
        return preview.current?.time ?? 0;
      },
      get playing() {
        return preview.current?.playing ?? false;
      },
      seek: (ms: number) => preview.current?.seek(ms),
    };
  }, [preview]);
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const preview = useRef<PreviewHandle | null>(null);
  const tab = useSession((st) => st.tab);
  const exporting = useSession((st) => st.exporting);
  const players = useSettings((st) => st.data.players);
  useImageSync();
  useFontSync();
  useTestHook(preview);
  /* 正在指定目標的玩家要在播放的玩家裡 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 玩家設定改了才檢查
  useEffect(() => syncEditingPlayer(settingsNow()), [players]);
  /* 開頁時清掉以前留下、沒有用到的圖片（IndexedDB；這次開頁放進來、還沒寫進設定的不刪） */
  useEffect(() => {
    void assets
      .gcStale(
        referencedAssetIds(useSettings, (d) =>
          [...d.characters.map((c) => c.image), d.background.image].filter(
            (id): id is string => !!id && !isDemoImage(id),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.group, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.group, handler: redo },
      {
        keys: 'alt+shift+p',
        label: S.keys.play,
        group: S.keys.group,
        handler: () => preview.current?.toggle(),
      },
    ],
    [undo, redo],
  );

  const tabs: { value: TabId; content: React.ReactNode }[] = [
    { value: 'characters', content: <CharactersTab /> },
    { value: 'appearance', content: <AppearanceTab /> },
    { value: 'motion', content: <MotionTab /> },
    { value: 'export', content: <ExportTab /> },
  ];

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
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={projectData}
            getFiles={projectFiles}
            fileNameFor={(now) => {
              const p = (n: number) => String(n).padStart(2, '0');
              return `${settingsNow().text.title.trim() || TOOL_ID}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
            }}
            onLoad={async (data, project, files) => {
              const r = await openProject(data, project.version, files);
              if (r.missing) notify({ title: S.project.missing(r.missing), tone: 'warning' });
              /* 圖片存不進瀏覽器：和「已開啟專案檔」合成一則 */
              return { warnings: [r.notPersisted > 0 && S.project.projectNotPersisted] };
            }}
            onReset={resetAll}
            resetText={{ title: S.project.resetTitle, description: S.project.resetText }}
            resetDisabled={exporting}
            savedAt={savedAt}
            extraItems={
              <ProjectMenuItem
                icon={<FileJson />}
                onSelect={async () => {
                  const [file] = await pickFiles({ accept: '.json,application/json' });
                  if (!file) return;
                  try {
                    const r = await openLegacyProject(await file.text());
                    /* 同一次匯入的結果合成一則：略過的圖片、存不進瀏覽器 */
                    const notes = [
                      r.skipped ? S.project.missing(r.skipped) : '',
                      r.notPersisted ? S.project.projectNotPersisted : '',
                    ].filter(Boolean);
                    notify({
                      title: S.project.legacyOk,
                      description: notes.length ? notes.join('') : undefined,
                      tone: notes.length ? 'warning' : 'success',
                    });
                  } catch (e) {
                    notify({
                      title:
                        e instanceof ProjectFileError || e instanceof Error ? e.message : String(e),
                      tone: 'danger',
                    });
                  }
                }}
              >
                {S.project.legacy}
              </ProjectMenuItem>
            }
          />
        </>
      }
      settings={
        <>
          <ToastBridge />
          <UsageSection persistKey="character-select">{USAGE}</UsageSection>
          <Tabs<TabId>
            aria-label={S.tabsAria}
            value={tab}
            onValueChange={setTab}
            items={tabs.map((t) => ({
              value: t.value,
              label: <TabLabel id={t.value} />,
              content: t.content,
              /* 匯出中不能換分頁（匯出區在「匯出」分頁裡） */
              disabled: exporting && t.value !== tab,
            }))}
          />
        </>
      }
      preview={<Preview ref={preview} />}
    />
  );
}
