import { LayoutTemplate, LoaderCircle, Redo2, Type, Undo2, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { importAssetFiles, referencedAssetIds } from '@/core/assets';
import { uploadedFontFile, uploadFont } from '@/core/fonts';
import { type ProjectBinary, ProjectFileError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type ProjectNotice,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  withShortcut,
} from '@/ui';
import { characterMotion, elementBounds, loopElements } from './geometry';
import { assets, loadCharacterMedia, loadImageSet, TOOL_ID } from './media';
import { Preview, type PreviewHandle } from './Preview';
import { CanvasPanel, CharacterPanel, LoaderPanel, TextPanel } from './panels';
import { characterAspect, EMPTY_MEDIA, renderScene, Scratch, textMeasurer } from './render';
import { rowFrameState } from './row';
import { setMedia, setStatus, useRuntime, withBusy } from './runtime';
import { assetIdsOf, type LmSettings, normalizeSettings } from './settings';
import { edit, settingsNow, useLm } from './store';
import { S } from './strings';
import { breakdown } from './summary';
import { barProgress, contentTime, exportFrames, fileStem, totalDuration } from './timing';

const PROJECT_VERSION = 1;

/** 專案檔的內容：設定＋一起帶走的上傳字型（檔名對應） */
interface ProjectData {
  settings: LmSettings;
  fonts: { family: string; file: string; name: string }[];
}

const USAGE = (
  <ul>
    {S.usage.map((line) => (
      <li key={line}>{line}</li>
    ))}
  </ul>
);

/** 用到的上傳字型（兩段文字） */
const uploadFamilies = (s: LmSettings): string[] => [
  ...new Set(
    [s.text.top.font, s.text.bottom.font].filter((f) => f.source === 'upload').map((f) => f.family),
  ),
];

/* 存專案檔：ProjectMenu 先呼叫 getFiles 再呼叫 getData，字型的對應在 getFiles 時記下 */
let pendingFonts: ProjectData['fonts'] = [];

async function projectFiles(): Promise<ProjectBinary[]> {
  const s = settingsNow();
  const files: ProjectBinary[] = await assets.exportFiles(assetIdsOf(s));
  pendingFonts = [];
  let i = 0;
  for (const family of uploadFamilies(s)) {
    const f = await uploadedFontFile(family);
    if (!f) continue;
    const ext = /\.[a-z0-9]+$/i.exec(f.meta.fileName)?.[0] ?? '';
    const file = `font-${++i}${ext.toLowerCase()}`;
    files.push({ name: file, data: new Uint8Array(f.data) });
    pendingFonts.push({ family, file, name: f.meta.fileName });
  }
  return files;
}

/** 開啟專案檔（F02）：素材放回資產庫、字型重新註冊、解碼完才換掉目前的內容；途中有其他編輯就作廢 */
async function openProject(
  data: ProjectData,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<boolean> {
  if (useRuntime.getState().exporting) throw new ProjectFileError(S.status.loadWhileExporting);
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  const next = normalizeSettings((data as Partial<ProjectData> | null)?.settings);
  if (!next) throw new ProjectFileError(S.project.invalid);
  /* 載入途中又做了其他編輯：這次載入作廢 */
  let stale = false;
  const unsub = useLm.subscribe(() => {
    stale = true;
  });
  try {
    await withBusy(S.busy.project, async (progress) => {
      const images = [...files].filter(([name]) => !/^font-/.test(name.split('/').pop() ?? ''));
      await importAssetFiles(assets, images);
      /* 字型 */
      for (const f of Array.isArray(data.fonts) ? data.fonts : []) {
        const bytes = files.get(f.file);
        if (!bytes) continue;
        const meta = await uploadFont(
          new File([bytes as Uint8Array<ArrayBuffer>], f.name || f.file),
        );
        for (const b of [next.text.top, next.text.bottom])
          if (b.font.source === 'upload' && b.font.family === f.family) b.font.family = meta.family;
      }
      /* 找不到的圖片：拿掉那一項（改用內建角色、底形） */
      const exists = async (ids: readonly string[]) =>
        (await Promise.all(ids.map((id) => assets.get(id)))).every(Boolean);
      if (next.character.upload && !(await exists(next.character.upload.ids)))
        next.character.upload = null;
      if (next.row.startImages && !(await exists(next.row.startImages.ids)))
        next.row.startImages = null;
      if (next.row.targetImages && !(await exists(next.row.targetImages.ids)))
        next.row.targetImages = null;
      /* 先解碼，失敗時目前的內容不變 */
      const character = next.character.upload
        ? await loadCharacterMedia(next.character.upload, progress)
        : null;
      const rowStart = next.row.startImages ? await loadImageSet(next.row.startImages) : [];
      const rowTarget = next.row.targetImages ? await loadImageSet(next.row.targetImages) : [];
      if (stale) throw new ProjectFileError(S.status.staleLoad);
      unsub();
      useLm.endGesture();
      useLm.getState().replace(next);
      setMedia({ character, rowStart, rowTarget });
    });
  } finally {
    unsub();
  }
  return true;
}

function useMediaSync() {
  const upload = useLm((st) => st.data.character.upload);
  const start = useLm((st) => st.data.row.startImages);
  const target = useLm((st) => st.data.row.targetImages);
  useEffect(() => {
    if (!upload) {
      setMedia({ character: null });
      return;
    }
    let alive = true;
    loadCharacterMedia(upload)
      .then((m) => alive && setMedia({ character: m }))
      .catch(() => {
        if (!alive) return;
        setStatus('warning', S.status.restoreFailed);
        edit((d) => {
          d.character.upload = null;
        });
      });
    return () => {
      alive = false;
    };
  }, [upload]);
  useEffect(() => {
    if (!start) {
      setMedia({ rowStart: [] });
      return;
    }
    let alive = true;
    loadImageSet(start)
      .then((m) => alive && setMedia({ rowStart: m }))
      .catch(() => {
        if (!alive) return;
        setStatus('warning', S.status.restoreFailed);
        edit((d) => {
          d.row.startImages = null;
        });
      });
    return () => {
      alive = false;
    };
  }, [start]);
  useEffect(() => {
    if (!target) {
      setMedia({ rowTarget: [] });
      return;
    }
    let alive = true;
    loadImageSet(target)
      .then((m) => alive && setMedia({ rowTarget: m }))
      .catch(() => {
        if (!alive) return;
        setStatus('warning', S.status.restoreFailed);
        edit((d) => {
          d.row.targetImages = null;
        });
      });
    return () => {
      alive = false;
    };
  }, [target]);
}

declare global {
  interface Window {
    __loadingMaker?: unknown;
  }
}

/** 測試與對等驗證用的入口（3.12）：讀出指定時間的畫面與各種狀態 */
function useTestHook(preview: React.RefObject<PreviewHandle | null>) {
  useEffect(() => {
    const scratch = new Scratch();
    window.__loadingMaker = {
      settings: () => settingsNow(),
      /** 依「a.b.c」路徑改設定 */
      set: (path: string, value: unknown) =>
        edit((d) => {
          const keys = path.split('.');
          // biome-ignore lint/suspicious/noExplicitAny: 測試入口
          let o: any = d;
          for (const k of keys.slice(0, -1)) o = o[k];
          o[keys[keys.length - 1]] = value;
        }),
      replace: (s: unknown) => {
        const n = normalizeSettings(s);
        if (n) useLm.getState().replace(n);
      },
      duration: () => totalDuration(settingsNow()),
      breakdown: () => breakdown(settingsNow()),
      progress: (t: number) => barProgress(settingsNow(), contentTime(settingsNow(), t)),
      frames: () => exportFrames(settingsNow()),
      motion: (t: number) => characterMotion(settingsNow(), t),
      loop: (t: number) => loopElements(settingsNow(), t),
      row: (t: number) => {
        const m = useRuntime.getState().media;
        return rowFrameState(settingsNow(), t, {
          start: m.rowStart.length,
          target: m.rowTarget.length,
        });
      },
      bounds: (t: number) => {
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return null;
        const m = textMeasurer(ctx);
        return elementBounds(
          settingsNow(),
          t,
          characterAspect(useRuntime.getState().media),
          m.measure,
          m.measureLabel,
        );
      },
      /** t 秒時的畫面（ImageData） */
      render: (t: number) => {
        const s = settingsNow();
        const c = document.createElement('canvas');
        c.width = s.canvas.width;
        c.height = s.canvas.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        renderScene(ctx, s, useRuntime.getState().media ?? EMPTY_MEDIA, t, scratch);
        return ctx.getImageData(0, 0, c.width, c.height);
      },
      status: () => useRuntime.getState().status,
      media: () => {
        const m = useRuntime.getState().media;
        return {
          character: m.character
            ? {
                frames: m.character.frames.length,
                delays: m.character.delays,
                animated: m.character.animated,
                width: m.character.width,
                height: m.character.height,
              }
            : null,
          rowStart: m.rowStart.length,
          rowTarget: m.rowTarget.length,
        };
      },
      get time() {
        return preview.current?.time ?? 0;
      },
      get playing() {
        return preview.current?.playing ?? false;
      },
      seek: (t: number) => preview.current?.seek(t),
      setPlaying: (on: boolean) => preview.current?.setPlaying(on),
      stem: () => fileStem(settingsNow().export.fileName),
    };
  }, [preview]);
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useLm);
  const preview = useRef<PreviewHandle | null>(null);
  const s = useLm((st) => st.data);
  useMediaSync();
  useTestHook(preview);
  /* 開頁時清掉沒有用到的上傳圖片（IndexedDB） */
  useEffect(() => {
    void assets.gc(referencedAssetIds(useLm, assetIdsOf)).catch(() => {});
  }, []);

  const withFiles =
    s.export.includeAssets && (assetIdsOf(s).length > 0 || uploadFamilies(s).length > 0);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: '復原', group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: '重做', group: '編輯', handler: redo },
  ];

  const onNotify = (n: ProjectNotice) => {
    if (n.kind === 'saved')
      setStatus('success', S.status.projectSaved(withFiles, n.fileName ?? ''));
    else if (n.kind === 'opened') setStatus('success', S.status.projectLoaded(n.fileName ?? ''));
    else if (n.kind === 'open-failed') setStatus('danger', n.message ?? S.project.invalid);
    else setStatus('success', S.status.projectReset);
  };

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <>
          <IconButton
            label={withShortcut('復原', 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut('重做', 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={() => ({ settings: settingsNow(), fonts: withFiles ? pendingFonts : [] })}
            getFiles={withFiles ? projectFiles : undefined}
            saveFileName={() =>
              `${fileStem(settingsNow().export.fileName)}.project.${withFiles ? 'zip' : 'json'}`
            }
            openAccept=".json,.zip,application/json,application/zip"
            confirmOpen={false}
            onLoad={(data, project, files) => openProject(data, project.version, files)}
            onReset={() => {
              useLm.getState().reset();
              setMedia(EMPTY_MEDIA);
            }}
            resetText={{
              label: S.project.resetLabel,
              title: S.project.resetTitle,
              description: S.project.resetDescription,
              confirmLabel: S.project.resetConfirm,
            }}
            onNotify={onNotify}
            savedAt={savedAt}
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey="loading-maker">{USAGE}</UsageSection>
          <Tabs
            aria-label={S.tabsAria}
            items={[
              {
                value: 'character',
                label: S.tabs.character,
                icon: <UserRound />,
                content: <CharacterPanel />,
              },
              {
                value: 'loader',
                label: S.tabs.loader,
                icon: <LoaderCircle />,
                content: <LoaderPanel />,
              },
              { value: 'text', label: S.tabs.text, icon: <Type />, content: <TextPanel /> },
              {
                value: 'canvas',
                label: S.tabs.canvas,
                icon: <LayoutTemplate />,
                content: <CanvasPanel />,
              },
            ]}
          />
        </>
      }
      preview={<Preview handle={preview} />}
    />
  );
}
