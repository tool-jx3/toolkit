/**
 * 角色分析圖產生器：同一份角色清單畫成性格四象限（好幾頁、契合度、座標碼）與關係圖（線的種類、連線），存成 PNG。
 * 規格：docs/refactor/specs/char-chart.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { arrowDelta } from '@/core/layout';
import { useSaveError, useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, useToast, WindowDrop, withShortcut } from '@/ui';
import { loadCharacterImages, splitImageFiles, useImageBitmaps } from './images';
import { imageIds, LIMITS, nameFromFile } from './model';
import { PreviewArea } from './Preview';
import { ProjectActions } from './ProjectActions';
import { canNudgeFrom } from './QuadLayer';
import { PageSection, ScoreSection, ShareSection } from './QuadPanel';
import { LegendsSection, LinksSection, RelationSection } from './RelationPanel';
import { CharactersSection, SelectedSection } from './Roster';
import {
  addImageCharacters,
  assets,
  chartNow,
  currentPageIndex,
  historyStep,
  nudgeSelected,
  referencedImages,
  select,
  TOOL_ID,
  unplaceCharacter,
  useChart,
  usePrefs,
  useUi,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖片才刪（這次開頁放進來的不刪） */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/**
 * 一次加入多張圖片（選檔、拖放、貼上都走這裡）；要在 ToolShell 裡面用（通知）。
 * 同一批的結果合成一則通知：加了幾個、哪些讀不了、哪些不是圖片、超過上限（規格 F06、7.1）。
 */
function useBatchAdd() {
  const toast = useToast();
  return async (files: File[]) => {
    if (!files.length) return;
    const { images, others } = await splitImageFiles(files);
    const room = Math.max(0, LIMITS.characters - chartNow().characters.length);
    const take = images.slice(0, room);
    const notes: string[] = [];
    let ids: string[] = [];
    let firstName = '';
    if (take.length) {
      const { loaded, failed } = await loadCharacterImages(take);
      if (failed.length) notes.push(S.decodeError(failed.join('、')));
      if (loaded.some((l) => !l.persisted)) notes.push(S.imageNotSaved);
      if (loaded.length) {
        const place = usePrefs.getState().data.chart === 'quadrant' ? currentPageIndex() : null;
        firstName = nameFromFile(loaded[0].file.name);
        ids = addImageCharacters(
          loaded.map((l) => ({ name: nameFromFile(l.file.name), image: l.ref })),
          place,
        );
      }
    }
    if (others.length) notes.push(S.notImage(others.map((f) => f.name).join('、')));
    if (images.length > take.length)
      notes.push(S.batchOverLimit(LIMITS.characters, images.length - take.length));
    toast({
      title:
        ids.length === 1 ? S.added(firstName) : ids.length ? S.addedMany(ids.length) : S.batchNone,
      description: notes.length ? notes.join('') : undefined,
      tone: !notes.length ? 'success' : ids.length ? 'warning' : 'danger',
      replace: true,
    });
  };
}

function Settings() {
  const batchAdd = useBatchAdd();
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
      <CharactersSection bitmaps={bitmaps} onBatch={(f) => void batchAdd(f)} />
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
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => void batchAdd(files)}
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
  /*
   * 方向鍵移動選取的角色：只在焦點在預覽或頁面上時（canNudgeFrom）；其他地方（角色清單的列…）照常交給那個元件、
   * 也不擋捲動。快捷鍵說明照樣列出（下面的 shortcuts 沒有 handler）。
   */
  const nudgeOn = useRef(quadSel);
  nudgeOn.current = quadSel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!nudgeOn.current || e.defaultPrevented || e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dd = arrowDelta(e.key, e.shiftKey ? 10 : 1);
      if (!dd || !canNudgeFrom(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="alertdialog"]'))
        return;
      e.preventDefault();
      nudgeSelected(dd.dx, dd.dy);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    { keys: [...ARROWS], label: S.shortcutNudge, group: S.groupQuadrant },
    { keys: ARROWS.map((k) => `shift+${k}`), label: S.shortcutNudgeBig, group: S.groupQuadrant },
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
          <ProjectActions />
        </>
      }
      settings={<Settings />}
      preview={<PreviewArea />}
    />
  );
}
