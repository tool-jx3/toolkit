/**
 * AI 誤判梗圖產生器：放一張照片，畫上 AI 物件辨識風格的框與標籤，存成 PNG。
 * 規格：docs/refactor/specs/ai-fail.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { pickFiles } from '@/core/files';
import { arrowDelta } from '@/core/layout';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { initialState } from './model';
import { AspectSection, FontSection, ListSection, PhotoSection, SelectedSection } from './Panel';
import { Preview } from './Preview';
import { loadPhotoFile, usePhotoBitmap } from './photo';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  historyStep,
  memeNow,
  nudgeSelected,
  referencedPhotos,
  removeBox,
  select,
  setMode,
  stepLayer,
  TOOL_ID,
  useMeme,
  useUi,
} from './store';
import { S } from './strings';

/**
 * 開頁約 5 秒後整理一次照片庫：以前留下、目前的狀態與復原紀錄都沒用到的照片才刪
 * （這次開頁放進來、還在解碼還沒換上的照片不刪）
 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedPhotos()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 照片的載入（選檔、拖放、貼上都走這裡）；要在 ToolShell 裡面用（通知） */
function usePhotoLoader() {
  const toast = useToast();
  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const r = await loadPhotoFile(f);
      if (!r.persisted) toast({ title: S.photoNotSaved, tone: 'warning' });
    } catch {
      toast({ title: S.decodeError(f.name), tone: 'danger' });
    }
  };
  const reject = (files: File[]) =>
    toast({ title: S.notImage(files.map((f) => f.name).join('、')), tone: 'danger' });
  const pick = async () => {
    const files = await pickFiles({ accept: 'image/*' });
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (files.length && !images.length) reject(files);
    else void load(images);
  };
  return { load, reject, pick };
}

function Settings() {
  const loader = usePhotoLoader();
  const toast = useToast();
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);
  /* 有框時才提醒「會清掉目前所有的框」 */
  const hasBoxes = useMeme((s) => s.data.boxes.length > 0);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PhotoSection onFiles={(f) => void loader.load(f)} onReject={loader.reject} />
      <AspectSection />
      <SelectedSection />
      <ListSection />
      <FontSection />
      <WindowDrop
        accept="image/*"
        label={S.windowDrop}
        hint={hasBoxes ? S.windowDropHint : undefined}
        onDrop={(files) => void loader.load(files)}
        onReject={loader.reject}
      />
    </div>
  );
}

function PreviewArea() {
  const loader = usePhotoLoader();
  const photoId = useMeme((s) => s.data.photo?.id ?? null);
  const { bitmap, status } = usePhotoBitmap(photoId);
  return <Preview bitmap={bitmap} status={status} onPick={() => void loader.pick()} />;
}

function Usage() {
  return (
    <ol className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

/** Esc：正在畫的框 → 新增框模式 → 選取（規格 F38） */
function onEscape() {
  const ui = useUi.getState();
  if (ui.drawing) useUi.setState({ drawing: null });
  else if (ui.mode === 'draw') setMode('select');
  else if (ui.selectedId) select(null);
}

const ARROWS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] as const;

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useMeme);
  /* 方向鍵的連按先結束、拖曳中不做（F50） */
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const ui = useUi();
  const hasSelection = useMeme((s) => s.data.boxes.some((b) => b.id === ui.selectedId));
  useAssetCleanup();

  /* 復原之後選取的框不見了：取消選取 */
  useEffect(() => {
    if (ui.selectedId && !hasSelection) select(null);
  }, [ui.selectedId, hasSelection]);

  /* 沒有選取時方向鍵、Delete 留給頁面（捲動等）：只在有事可做時綁定 */
  const when = <T,>(on: boolean, fn: T) => (on ? fn : undefined);
  const nudge = (step: number) => (e: KeyboardEvent) => {
    const d = arrowDelta(e.key, step);
    if (d) nudgeSelected(d.dx, d.dy);
  };
  const canEscape = !!ui.drawing || ui.mode === 'draw' || hasSelection;
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    {
      keys: 'escape',
      label: S.shortcutEscape,
      group: S.groupBox,
      handler: when(canEscape, onEscape),
    },
    {
      keys: ['delete', 'backspace'],
      label: S.shortcutDelete,
      group: S.groupBox,
      handler: when(hasSelection, () => {
        if (ui.selectedId) removeBox(ui.selectedId);
      }),
    },
    {
      keys: [...ARROWS],
      label: S.shortcutNudge,
      group: S.groupBox,
      handler: when(hasSelection, nudge(1)),
    },
    {
      keys: ARROWS.map((k) => `shift+${k}`),
      label: S.shortcutNudgeBig,
      group: S.groupBox,
      handler: when(hasSelection, nudge(10)),
    },
    {
      keys: ']',
      label: S.shortcutForward,
      group: S.groupBox,
      handler: when(hasSelection, () => stepLayer(1)),
    },
    {
      keys: '[',
      label: S.shortcutBackward,
      group: S.groupBox,
      handler: when(hasSelection, () => stepLayer(-1)),
    },
  ];

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
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<unknown>
            toolId={TOOL_ID}
            version={DATA_VERSION}
            getData={() => memeNow()}
            getFiles={() => assets.exportFiles(projectAssetIds(memeNow()))}
            confirmOpen={{
              title: S.openConfirmTitle,
              description: S.openConfirmDesc,
              confirmLabel: S.openConfirmLabel,
            }}
            openedMessage={S.projectOpened}
            onLoad={async (data, _file, files) => {
              const r = await importProject(data, files);
              useMeme.getState().replace(r.state);
              useUi.setState({ selectedId: null, drawing: null, mode: 'select' });
              /* 照片存不進瀏覽器：和「已開啟專案檔」合成一則 */
              return { warnings: [r.notSaved && S.photoNotSaved] };
            }}
            onReset={() => {
              useMeme.getState().replace(initialState());
              useUi.setState({ selectedId: null, drawing: null, mode: 'select' });
            }}
            resetText={{ title: S.resetTitle, description: S.resetDesc }}
            savedAt={savedAt}
            statusText={saveError ? S.saveFailed : undefined}
          />
        </>
      }
      settings={<Settings />}
      preview={<PreviewArea />}
    />
  );
}
