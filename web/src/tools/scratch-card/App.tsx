/**
 * 刮刮卡產生器：可以用滑鼠或手指刮開的卡片，底下藏著隨機抽出的圖示、句子或圖片；
 * 匯出可以刮的互動 HTML，或複製只顯示這張卡的分享連結。規格：docs/refactor/specs/scratch-card.md。
 * 網址有分享的內容（#c=…）時只顯示卡片（Player）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSaveError, useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, useToast, withShortcut } from '@/ui';
import type { CardSpec } from './card';
import {
  BackgroundSection,
  CardSection,
  ContentSection,
  CoverSection,
  DrawSection,
  ImagesSection,
  TitleSection,
} from './Panels';
import { Player } from './Player';
import { PreviewArea } from './Preview';
import { ProjectActions } from './ProjectActions';
import { readShare } from './share';
import {
  assets,
  historyStep,
  newTicket,
  recover,
  referencedImages,
  TOOL_ID,
  useScratch,
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

function Settings({ brokenShare }: { brokenShare: boolean }) {
  const toast = useToast();
  const expert = useScratch((s) => s.data.expert);
  const kind = useScratch((s) => s.data.kind);
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);
  useEffect(() => {
    if (brokenShare)
      toast({ title: S.player.broken, description: S.player.brokenHint, tone: 'warning' });
  }, [brokenShare, toast]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CardSection />
      <ContentSection />
      {kind === 'image-icon' || kind === 'image-full' ? <ImagesSection /> : null}
      <CoverSection />
      <DrawSection />
      {expert ? <BackgroundSection /> : null}
      {expert ? <TitleSection /> : null}
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

function useShare(): CardSpec | 'none' | 'broken' {
  const [share, setShare] = useState(() => readShare(location.hash));
  useEffect(() => {
    const on = () => setShare(readShare(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return share;
}

function Editor({ brokenShare }: { brokenShare: boolean }) {
  const { canUndo, canRedo } = useUndoRedo(useScratch);
  const undo = () => historyStep('undo');
  const redo = () => historyStep('redo');
  useAssetCleanup();
  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.groupEdit, handler: redo },
    { keys: 'mod+v', label: S.shortcutPaste, group: S.groupEdit },
    { keys: 'n', label: S.newTicket, group: S.groupCard, handler: newTicket },
    { keys: 'r', label: S.recover, group: S.groupCard, handler: recover },
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
  const share = useShare();
  if (typeof share === 'object')
    return <ToolShell toolId={TOOL_ID} body={<Player spec={share} />} />;
  return <Editor brokenShare={share === 'broken'} />;
}
