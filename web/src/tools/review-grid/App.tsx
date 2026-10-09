/**
 * 劇本心得九宮格：個人資料＋好幾格劇本（圖片、規則、劇本名稱、作者、心得標籤、感想），排成九宮格或清單存成 PNG；
 * 可以把好幾個人的檔案依劇本名稱排成比較圖。規格：docs/refactor/specs/review-grid.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useSaveError, useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, useToast, withShortcut } from '@/ui';
import { CompareSection } from './CompareSection';
import { useImageBitmaps } from './images';
import { imageIds } from './model';
import { CellEditor, CellsSection, LayoutSection, ProfileSection, TagsSection } from './Panels';
import { PreviewArea } from './Preview';
import { ProjectActions } from './ProjectActions';
import { assets, historyStep, referencedImages, TOOL_ID, useReview } from './store';
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

function Settings() {
  const toast = useToast();
  const d = useReview((s) => s.data);
  const { bitmaps } = useImageBitmaps(imageIds(d));
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <LayoutSection />
      <ProfileSection bitmaps={bitmaps} />
      <CellsSection bitmaps={bitmaps} />
      <CellEditor bitmaps={bitmaps} />
      <TagsSection />
      <CompareSection />
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

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useReview);
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  useAssetCleanup();
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    { keys: 'mod+v', label: S.shortcutPaste, group: S.groupEdit },
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
