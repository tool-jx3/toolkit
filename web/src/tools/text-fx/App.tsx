import { Clapperboard, Palette, Redo2, Shapes, Timer, Type, Undo2 } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import type { AnimationExportFormat } from '@/core/timeline';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
} from '@/ui';
import type { GalleryKind } from './actions';
import { getPath, setCfg } from './controls';
import { EffectGallery } from './EffectGallery';
import { runExport, sceneSource } from './exporter';
import { fontCssFor, loadFonts } from './fonts';
import {
  GRADIENT_KITS,
  introOf,
  outroOf,
  STYLE_KITS,
  settingsFromTemplate,
  TEMPLATES,
  templateById,
} from './library';
import { useMine } from './mine';
import { type PlayHandle, Preview } from './Preview';
import { DecoPanel } from './panels/DecoPanel';
import { ModePanel } from './panels/ModePanel';
import { StylePanel } from './panels/StylePanel';
import { TextPanel } from './panels/TextPanel';
import { TimePanel } from './panels/TimePanel';
import { buildScene, type Scene, sceneFontLoads } from './scene';
import {
  baseSettings,
  deepMerge,
  MODES,
  normalizeSettings,
  playsOf,
  type Settings,
} from './settings';
import {
  applyMine,
  applyTemplate,
  cfgOf,
  normalizeData,
  replaceAll,
  resetTemplate,
  saveMine,
  setMode,
  type TfxData,
  TOOL_ID,
  updateCfg,
  useTfx,
  useView,
} from './store';
import { S } from './strings';

/** 依設定建場景；字型先用替代字型畫，載入完自動重建 */
function useScene(cfg: Settings): { scene: Scene; fontsLoading: boolean } {
  const deferred = useDeferredValue(cfg);
  const loads = useMemo(() => sceneFontLoads(deferred), [deferred]);
  const loadKey = JSON.stringify(loads);
  const [fontTick, setFontTick] = useState(0);
  const [fontsLoading, setFontsLoading] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在需要的字型改變時重新載入
  useEffect(() => {
    let alive = true;
    const started = performance.now();
    const timer = setTimeout(() => {
      if (alive) setFontsLoading(true);
    }, 200);
    loadFonts(loads, 12000).then(() => {
      clearTimeout(timer);
      if (!alive) return;
      setFontsLoading(false);
      /* 真的有下載（花了一點時間）才重建，避免每打一個字都排兩次版 */
      if (performance.now() - started > 30) setFontTick((n) => n + 1);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [loadKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重建
  const scene = useMemo(() => buildScene(deferred), [deferred, fontTick]);
  return { scene, fontsLoading };
}

const USAGE = (
  <>
    <ol>
      <li>
        在「模式」選擇要做的素材：<b>標語</b>（畫面中央的大字）、<b>長文</b>（開場白、預告、旁白）或
        <b>字幕</b>（地點、時間），再挑一個範本當起點。
      </li>
      <li>
        在「文字」改成自己的內容。長文模式裡<b>空一行就是換頁</b>。
      </li>
      <li>
        在「模式」調整登場、停留、退場效果；按「效果一覽」可以用自己的文字直接比較每種效果動起來的樣子。
      </li>
      <li>「樣式」「裝飾」可以換字型、顏色、外框、光暈，加上線條、框或色帶。</li>
      <li>
        在預覽下方的「匯出」選格式（APNG、GIF、WebP、PNG、連番
        PNG）、fps、循環方式與色數，按「匯出」。想一次做好幾個，在「一次匯出多個」選
        <b>每一行各一個</b>（長文是每一頁）或<b>勾選的範本</b>，完成後可以打包成 ZIP。
      </li>
    </ol>
    <p>
      調好的設定可以在「模式」的<b>我的範本</b>存起來，之後一鍵套用；也能匯出成範本檔分享給別人。
      不想要登場動畫時，把「要有登場」關掉，第一格就是完成狀態。
    </p>
    <p>
      做好的 APNG 背景是透明的，可以直接上傳到 CCFOLIA
      等線上跑團平台，或疊在直播、影片畫面上。檔案超過 5 MB 時建議降低 fps、縮小尺寸或使用 256 色。
    </p>
    <p>所有處理都在你的瀏覽器裡完成，文字與圖片不會上傳到任何地方；設定會自動存在這個瀏覽器裡。</p>
    <h3 className="mt-4 mb-1 text-sm font-semibold">關於</h3>
    <p>
      文字演出產生器的功能與手感參考くま。的「文字画像APNGメーカー」；程式由本站以無塵室方式獨立撰寫（沒有使用原作的程式碼），以
      MIT 授權公開。
    </p>
    <p>用這個工具做出來的圖片與動畫，你可以自由使用，包括商業用途，不需要標示出處。</p>
    <p>
      可選的網路字型皆來自 Google Fonts，授權依各字型（SIL Open Font License
      等）。你上傳的字型只存在這個瀏覽器裡，授權請自行確認。
    </p>
  </>
);

declare global {
  interface Window {
    __textFx?: unknown;
  }
}

export function App() {
  const data = useTfx((st) => st.data);
  const cfg = cfgOf(data);
  const { scene, fontsLoading } = useScene(cfg);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useTfx);
  const tab = useView((st) => st.data.tab);
  const playRef = useRef<PlayHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);
  const [gallery, setGallery] = useState<GalleryKind | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  /* 測試與除錯用：讀寫設定、跳到指定時間、對等驗證用的函式 */
  useEffect(() => {
    const cur = () => cfgOf(useTfx.getState().data);
    const app = {
      cfg: cur,
      mode: () => useTfx.getState().data.mode,
      tplId: () => {
        const d = useTfx.getState().data;
        return d.modes[d.mode].tpl;
      },
      get: (path: string) => getPath(cur(), path),
      set: (path: string, value: unknown) => setCfg(path, value),
      patch: (fn: (c: Settings) => void) => updateCfg(fn),
      setMode,
      applyTemplate,
      resetTemplate,
      mine: () => useMine.getState().data.items,
      saveMine,
      applyMine,
      exportApng: () => exportRef.current?.exportNow('apng'),
    };
    window.__textFx = {
      app,
      get scene() {
        return sceneRef.current;
      },
      get t() {
        return playRef.current?.t ?? 0;
      },
      seek: (t: number) => playRef.current?.seek(t),
      setPlaying: (on: boolean) => playRef.current?.setPlaying(on),
      /* 對等驗證：用任意設定（含舊版格式）建場景、匯出 */
      lib: {
        MODES,
        TEMPLATES,
        templateById,
        baseSettings,
        settingsFromTemplate,
        STYLE_KITS,
        GRADIENT_KITS,
        introOf,
        outroOf,
        deepMerge,
        normalizeSettings,
        buildScene,
        sceneFontLoads,
        loadFonts,
        fontCssFor,
        sceneSource,
        playsOf,
        exportBytes: async (
          c: Settings,
          o: { format: AnimationExportFormat; fps?: number; scale?: number; quantize?: boolean },
        ) => {
          const r = await runExport({
            cfg: c,
            format: o.format,
            fps: o.fps ?? c.fps,
            plays: playsOf(c),
            scale: o.scale ?? 1,
            quantize: o.quantize ?? c.colors === 256,
            name: 'parity',
            pausedAt: null,
            signal: new AbortController().signal,
            onProgress: () => {},
          });
          return new Uint8Array(await r.blob.arrayBuffer());
        },
      },
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'space', label: '播放／暫停', group: '播放', handler: () => playRef.current?.toggle() },
    { keys: 'r', label: '從頭播放', group: '播放', handler: () => playRef.current?.restart() },
    {
      keys: 'arrowleft',
      label: '往前一格（並暫停）',
      group: '播放',
      handler: () => playRef.current?.step(-1),
    },
    {
      keys: 'arrowright',
      label: '往後一格（並暫停）',
      group: '播放',
      handler: () => playRef.current?.step(1),
    },
    {
      keys: 'mod+enter',
      label: '匯出 APNG',
      group: '匯出',
      handler: () => exportRef.current?.exportNow('apng'),
    },
    ...MODES.map(([m, name], i) => ({
      keys: String(i + 1),
      label: `切換到${name}`,
      group: '模式',
      handler: () => setMode(m),
    })),
    { keys: 'mod+z', label: '復原', group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: '重做', group: '編輯', handler: redo },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={USAGE}
      headerActions={
        <>
          <IconButton label="復原（Ctrl＋Z）" icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
          <IconButton
            label="重做（Ctrl＋Shift＋Z）"
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<TfxData>
            toolId={TOOL_ID}
            getData={() => useTfx.getState().data}
            onLoad={(d) => replaceAll(normalizeData(d))}
            onReset={() => replaceAll(useTfx.initial)}
            savedAt={savedAt}
            fileName="文字演出"
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey="text-fx">{USAGE}</UsageSection>
          <Tabs
            aria-label="設定分類"
            value={tab}
            onValueChange={(v) => useView.getState().patch({ tab: v })}
            items={[
              {
                value: 'mode',
                label: S.tabs.mode,
                icon: <Clapperboard />,
                content: <ModePanel onGallery={setGallery} />,
              },
              { value: 'text', label: S.tabs.text, icon: <Type />, content: <TextPanel /> },
              { value: 'style', label: S.tabs.style, icon: <Palette />, content: <StylePanel /> },
              { value: 'deco', label: S.tabs.deco, icon: <Shapes />, content: <DecoPanel /> },
              {
                value: 'time',
                label: S.tabs.time,
                icon: <Timer />,
                content: <TimePanel scene={scene} />,
              },
            ]}
          />
          <EffectGallery kind={gallery} cfg={cfg} onClose={() => setGallery(null)} />
        </>
      }
      preview={
        <Preview
          scene={scene}
          cfg={cfg}
          fontsLoading={fontsLoading}
          playRef={playRef}
          exportRef={exportRef}
        />
      }
    />
  );
}
