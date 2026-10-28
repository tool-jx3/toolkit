/**
 * 地圖演出產生器：在地圖或平面圖上畫區域放大、移動路線與地點、房間遮罩，依時間軸做出「區域彈出放大、
 * 路線一路畫過去、迷霧散開房間出現」的探索演出；匯出 PNG、APNG、影片、X 用 MP4、房間遮罩 ZIP 等。
 * 「進階 3D」分頁：房間與走廊做成線框立體空間，鏡頭沿路線走過去（WalkPanel、WalkPreview）。
 * 規格：docs/refactor/specs/map-fx.md。引擎與大部分介面和截圖演出產生器共用（core/imagefx、@/ui/imagefx）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useUndoRedo } from '@/core/storage';
import {
  ErrorBoundary,
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
import { fx, historyStep, TOOL_ID, useDoc, useLive, usePoints } from './store';
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

/**
 * 進階 3D 的預覽欄：用到 three.js，第一次切到「進階 3D」分頁時才載入。
 * 下載失敗時瀏覽器會記住失敗的那個網址（再 import 一次也是失敗）：重試時在網址後面加參數重新下載
 * （網址從錯誤訊息取得；取不到時照原樣再試）。
 */
let walkChunkUrl: string | null = null;
let walkRetries = 0;
const loadWalkPreview = (): Promise<typeof import('./WalkPreview')> => {
  if (walkChunkUrl) {
    walkRetries += 1;
    return import(/* @vite-ignore */ `${walkChunkUrl}?retry=${walkRetries}`);
  }
  return import('./WalkPreview').catch((e: unknown) => {
    const url = /https?:\/\/\S+?\.js/.exec(e instanceof Error ? e.message : String(e));
    if (url) walkChunkUrl = url[0];
    throw e;
  });
};

function PreviewColumn({
  playerRef,
  exportRef,
}: {
  playerRef: React.RefObject<PlayerHandle | null>;
  exportRef: React.RefObject<ExportPanelHandle | null>;
}) {
  const notify = useNotify();
  const onSample = (demo: boolean) => void loadSample(demo).then(notify);
  const tab = useLive((l) => l.tab);
  const active = tab === 'walk';
  /* 開過一次之後一直掛著（離開分頁時只留藏起來的匯出區，做到一半的 3D 影片不會被取消） */
  const [opened, setOpened] = useState(active);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  /* 下載失敗時「重試」換一個新的 lazy（React 會記住失敗的那一個） */
  const [WalkPreview, setWalkPreview] = useState(() => lazy(loadWalkPreview));
  return (
    <>
      {active ? null : <Preview playerRef={playerRef} exportRef={exportRef} onSample={onSample} />}
      {opened || active ? (
        <div hidden={!active} className="min-w-0">
          <ErrorBoundary
            title={S.walk.loadFailedTitle}
            description={S.walk.loadFailed}
            onRetry={() => setWalkPreview(() => lazy(loadWalkPreview))}
          >
            <Suspense
              fallback={
                active ? (
                  <p className="m-0 p-6 text-center text-sm text-muted" role="status">
                    {S.walk.building}
                  </p>
                ) : null
              }
            >
              <WalkPreview active={active} playerRef={playerRef} onSample={onSample} />
            </Suspense>
          </ErrorBoundary>
        </div>
      ) : null}
    </>
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
      /* 點選建立路線、編輯點的期間空白鍵不播放（這時預覽是暫停的編輯狀態） */
      imageFxShortcuts(
        fx,
        S,
        {
          toggle: () => {
            if (!usePoints.getState().draft) playerRef.current?.toggle();
          },
          rewind: () => {
            if (!usePoints.getState().draft) playerRef.current?.rewind();
          },
        },
        [
          { keys: 'enter', label: S.enterShortcut, group: S.groupPoints },
          { keys: 'backspace', label: S.backShortcut, group: S.groupPoints },
          { keys: 'escape', label: S.escPointShortcut, group: S.groupPoints },
          { keys: ['delete', 'backspace'], label: S.walk.delShortcut, group: S.walk.groupWalk },
          { keys: 'backspace', label: S.walk.backShortcut, group: S.walk.groupWalk },
          { keys: 'escape', label: S.walk.escShortcut, group: S.walk.groupWalk },
        ],
      ),
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
