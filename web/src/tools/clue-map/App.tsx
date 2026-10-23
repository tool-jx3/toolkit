/**
 * 調查熱點圖：在場景圖上畫出熱點，每個熱點藏著一則線索；PL 點熱點翻出線索卡，可以設成「先找到別的線索才出現」或「隱藏熱點」。
 * 輸出互動 HTML、分享連結與總覽 PNG。規格：docs/refactor/specs/clue-map.md。
 * 網址有分享的內容（#m=…）時只顯示遊玩畫面（Player）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { clearShareHash } from '@/core/share';
import { useShareHash } from '@/core/share/react';
import { useSaveError, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  isEditableTarget,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { loadSceneFiles } from './images';
import { addNotice } from './notices';
import { LookTab, SceneTab, SpotsTab } from './Panels';
import { Player } from './Player';
import { PreviewArea } from './Preview';
import { ProjectActions } from './ProjectActions';
import { readShare } from './share';
import {
  assets,
  historyStep,
  referencedImages,
  type SettingsTab,
  setScene,
  setTool,
  TOOL_ID,
  useClue,
  useUi,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：只清以前留下、沒人用的圖（這次開頁寫進或讀過的都保留，`gcStale`） */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** Ctrl＋V 貼上圖片＝換場景圖（焦點在文字欄、線索圖片的拖放區時照常） */
function useScenePaste() {
  const toast = useToast();
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (!files.length) return;
      const t = e.target;
      if (isEditableTarget(t)) return;
      if (t instanceof Element && t.closest('[data-clue-drop]')) return;
      e.preventDefault();
      void loadSceneFiles(files).then(({ loaded, notImages, failed }) => {
        const first = loaded[0];
        if (first) setScene(first.ref);
        const n = addNotice({
          added: first ? 1 : 0,
          notImages,
          failed,
          notSaved: loaded.some((l) => !l.persisted),
          title: S.scene.changed,
        });
        if (n) toast(n);
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [toast]);
}

function Settings({ brokenShare }: { brokenShare: boolean }) {
  const toast = useToast();
  const tab = useUi((s) => s.tab);
  useAssetCleanup();
  useScenePaste();
  /* 自動儲存失敗只在「成功 → 失敗」時通知一次（每次寫入都失敗時不重複跳） */
  const saveFailed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveFailed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveFailed, toast]);
  /* 壞掉的分享連結：通知一次，並拿掉網址的 #m=（重新整理不再通知；F92） */
  useEffect(() => {
    if (!brokenShare) return;
    toast({ title: S.sharedBroken, description: S.sharedBrokenHint, tone: 'warning' });
    clearShareHash();
  }, [brokenShare, toast]);
  return (
    <Tabs<SettingsTab>
      aria-label={S.tabsLabel}
      value={tab}
      onValueChange={(v) => useUi.setState({ tab: v })}
      items={[
        { value: 'scene', label: S.tabScene, content: <SceneTab /> },
        { value: 'spots', label: S.tabSpots, content: <SpotsTab /> },
        { value: 'look', label: S.tabLook, content: <LookTab /> },
      ]}
    />
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

function Editor({ brokenShare }: { brokenShare: boolean }) {
  const { canUndo, canRedo } = useUndoRedo(useClue);
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  const inEdit = () => useUi.getState().mode === 'edit';
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    { keys: 'mod+v', label: S.shortcutPaste, group: S.groupEdit },
    {
      keys: 'v',
      label: S.stage.toolSelect,
      group: S.groupTool,
      handler: () => inEdit() && setTool('select'),
    },
    {
      keys: 'r',
      label: S.stage.toolRect,
      group: S.groupTool,
      handler: () => inEdit() && setTool('rect'),
    },
    {
      keys: 'e',
      label: S.stage.toolEllipse,
      group: S.groupTool,
      handler: () => inEdit() && setTool('ellipse'),
    },
    { keys: 'delete', label: S.shortcutDelete, group: S.groupSpot },
    { keys: 'arrowleft', label: S.shortcutNudge, group: S.groupSpot },
    { keys: 'escape', label: S.shortcutEsc, group: S.groupSpot },
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
      settings={<Settings brokenShare={brokenShare} />}
      preview={<PreviewArea />}
    />
  );
}

export function App() {
  const share = useShareHash(readShare);
  if (typeof share === 'object')
    return <ToolShell toolId={TOOL_ID} body={<Player shared={share} />} />;
  return <Editor brokenShare={share === 'broken'} />;
}
