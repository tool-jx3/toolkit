/**
 * 角色分析圖產生器：同一份角色清單畫成性格四象限（好幾頁、契合度、座標碼）與關係圖（線的種類、連線），存成 PNG。
 * 規格：docs/refactor/specs/char-chart.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
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
import { loadCharacterImages, useImageBitmaps } from './images';
import { imageIds, initialState, LIMITS, nameFromFile } from './model';
import { PreviewArea } from './Preview';
import { importProject, projectAssetIds } from './project';
import { PageSection, ScoreSection, ShareSection } from './QuadPanel';
import { LegendsSection, LinksSection, RelationSection } from './RelationPanel';
import { CharactersSection, SelectedSection } from './Roster';
import {
  addImageCharacters,
  assets,
  chartNow,
  currentPageIndex,
  DATA_VERSION,
  historyStep,
  nudgeSelected,
  referencedImages,
  replaceAll,
  select,
  TOOL_ID,
  unplaceCharacter,
  useChart,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：目前的狀態與復原紀錄都沒用到的圖片才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gc(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 一次加入多張圖片（選檔、拖放、貼上都走這裡）；要在 ToolShell 裡面用（通知） */
function useBatchAdd() {
  const toast = useToast();
  const add = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/') || !f.type);
    if (!images.length) return;
    const room = LIMITS.characters - chartNow().characters.length;
    if (room <= 0) {
      toast({ title: S.limitReached(LIMITS.characters), tone: 'warning' });
      return;
    }
    const { loaded, failed } = await loadCharacterImages(images.slice(0, room));
    if (failed.length) toast({ title: S.decodeError(failed.join('、')), tone: 'danger' });
    if (loaded.some((l) => !l.persisted)) toast({ title: S.imageNotSaved, tone: 'warning' });
    if (!loaded.length) return;
    const place = usePrefs.getState().data.chart === 'quadrant' ? currentPageIndex() : null;
    const ids = addImageCharacters(
      loaded.map((l) => ({ name: nameFromFile(l.file.name), image: l.ref })),
      place,
    );
    if (ids.length === 1)
      toast({ title: S.added(nameFromFile(loaded[0].file.name)), tone: 'success', replace: true });
    else if (ids.length) toast({ title: S.addedMany(ids.length), tone: 'success', replace: true });
    if (images.length > room) toast({ title: S.limitReached(LIMITS.characters), tone: 'warning' });
  };
  const reject = (files: File[]) =>
    toast({ title: S.notImage(files.map((f) => f.name).join('、')), tone: 'danger' });
  return { add, reject };
}

function Settings() {
  const batch = useBatchAdd();
  const toast = useToast();
  const chart = usePrefs((s) => s.data.chart);
  const d = useChart((s) => s.data);
  const { bitmaps } = useImageBitmaps(imageIds(d));
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CharactersSection
        bitmaps={bitmaps}
        onBatch={(f) => void batch.add(f)}
        onReject={batch.reject}
      />
      <SelectedSection bitmaps={bitmaps} />
      {chart === 'quadrant' ? (
        <>
          <PageSection />
          <ScoreSection />
          <ShareSection />
        </>
      ) : (
        <>
          <RelationSection />
          <LegendsSection />
          <LinksSection />
        </>
      )}
      <WindowDrop
        accept="image/*"
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => void batch.add(files)}
        onReject={batch.reject}
      />
    </div>
  );
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

const ARROWS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] as const;

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useChart);
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const chart = usePrefs((s) => s.data.chart);
  const page = usePrefs((s) => s.data.page);
  const ui = useUi();
  const exists = useChart((s) => s.data.characters.some((c) => c.id === ui.selectedId));
  const placed = useChart((s) => {
    const p = s.data.pages[Math.min(page, s.data.pages.length - 1)];
    return !!(ui.selectedId && p?.positions[ui.selectedId]);
  });
  useAssetCleanup();

  /* 復原之後選取的角色不見了：取消選取 */
  useEffect(() => {
    if (ui.selectedId && !exists) select(null);
  }, [ui.selectedId, exists]);

  /* 沒有選取時方向鍵、Delete 留給頁面（捲動等）：只在有事可做時綁定 */
  const when = <T,>(on: boolean, fn: T) => (on ? fn : undefined);
  const quadSel = chart === 'quadrant' && placed;
  const nudge = (step: number) => (e: KeyboardEvent) => {
    const dd = arrowDelta(e.key, step);
    if (dd) nudgeSelected(dd.dx, dd.dy);
  };
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    {
      keys: [...ARROWS],
      label: S.shortcutNudge,
      group: S.groupQuadrant,
      handler: when(quadSel, nudge(1)),
    },
    {
      keys: ARROWS.map((k) => `shift+${k}`),
      label: S.shortcutNudgeBig,
      group: S.groupQuadrant,
      handler: when(quadSel, nudge(10)),
    },
    {
      keys: ['delete', 'backspace'],
      label: S.shortcutUnplace,
      group: S.groupQuadrant,
      handler: when(quadSel, () => {
        if (ui.selectedId) unplaceCharacter(ui.selectedId, currentPageIndex());
      }),
    },
    {
      keys: 'escape',
      label: S.shortcutEscape,
      group: S.groupQuadrant,
      handler: when(chart === 'quadrant' && exists, () => select(null)),
    },
    {
      keys: 'escape',
      label: S.shortcutCancelLink,
      group: S.groupRelation,
      handler: when(chart === 'relation' && !!ui.linkFrom, () =>
        useUi.setState({ linkFrom: null }),
      ),
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
            getData={() => chartNow()}
            getFiles={() => assets.exportFiles(projectAssetIds(chartNow()))}
            confirmOpen={{
              title: S.openConfirmTitle,
              description: S.openConfirmDesc,
              confirmLabel: S.openConfirmLabel,
            }}
            openedMessage={S.projectOpened}
            onLoad={async (data, _file, files) => {
              replaceAll(await importProject(data, files));
              return true;
            }}
            onReset={() => replaceAll(initialState())}
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
