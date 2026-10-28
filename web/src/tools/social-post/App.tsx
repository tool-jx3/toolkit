/**
 * 社群貼文產生器：做出「相片社群 App」的貼文、留言、限時動態、個人頁畫面，存成 PNG 或可以點的 HTML 檔
 * （跑團用：角色的社群帳號、劇本 handout、宣傳、團後梗圖）。規格：docs/refactor/specs/social-post.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { filesInMemory } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  isEditableTarget,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { FrameDialogHost, UrlDialogHost, useNotify } from './controls';
import { addImageFiles, type ImageTarget } from './media';
import { collectAssetIds, initialState } from './model';
import { Preview } from './Preview';
import { CommentsPanel } from './panels/CommentsPanel';
import { CommonPanel } from './panels/CommonPanel';
import { FeedPanel } from './panels/FeedPanel';
import { PostPanel } from './panels/PostPanel';
import { ProfilePanel } from './panels/ProfilePanel';
import { StoryPanel } from './panels/StoryPanel';
import { importProject } from './project';
import { createCanvasMeasure } from './render/paint';
import { buildScreen, makeEnv } from './render/screens';
import {
  assets,
  currentPost,
  currentStory,
  DATA_VERSION,
  docNow,
  historyStep,
  prefsNow,
  referencedImages,
  resetAll,
  setTab,
  TOOL_ID,
  useDoc,
  usePrefs,
} from './store';
import { S, type TabId } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪（這次開頁放進來的不刪） */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 拖放、貼上的圖放到哪裡（依分頁；F100） */
function dropTarget(): ImageTarget {
  const p = prefsNow();
  const d = docNow();
  switch (p.tab) {
    case 'story':
      return { kind: 'cell', storyId: currentStory(d, p).id, index: p.cell };
    case 'profile':
      return { kind: 'grid' };
    case 'common':
      return { kind: 'avatar' };
    default:
      return { kind: 'post-photos', postId: currentPost(d, p).id };
  }
}

const DROP_LABEL: Record<TabId, string> = {
  post: S.dropOnPost,
  comments: S.dropOnPost,
  story: S.dropOnStory,
  profile: S.dropOnProfile,
  feed: S.dropOnFeed,
  common: S.dropOnCommon,
};

/** 貼上（Ctrl＋V）：在文字欄以外貼上圖片時，依分頁放進去 */
function usePasteImages() {
  const notify = useNotify();
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length || isEditableTarget(e.target)) return;
      e.preventDefault();
      void filesInMemory(files).then((list) => addImageFiles(list, dropTarget()).then(notify));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [notify]);
}

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function Settings() {
  const tab = usePrefs((p) => p.data.tab);
  const notify = useNotify();
  usePasteImages();
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    { value: 'post', label: S.tabs.post, content: <PostPanel /> },
    { value: 'comments', label: S.tabs.comments, content: <CommentsPanel /> },
    { value: 'story', label: S.tabs.story, content: <StoryPanel /> },
    { value: 'profile', label: S.tabs.profile, content: <ProfilePanel /> },
    { value: 'feed', label: S.tabs.feed, content: <FeedPanel /> },
    { value: 'common', label: S.tabs.common, content: <CommonPanel /> },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <Tabs<TabId> aria-label={S.tabsLabel} value={tab} onValueChange={setTab} items={items} />
      <WindowDrop
        label={DROP_LABEL[tab]}
        hint={S.dropHint}
        onDrop={(files) => void addImageFiles(files, dropTarget()).then(notify)}
      />
      <UrlDialogHost />
      <FrameDialogHost />
    </div>
  );
}

/** 頁首的「專案」選單：存成專案檔（ZIP：內容＋照片）、開啟、重設 */
function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => docNow()}
      getFiles={() => assets.exportFiles(collectAssetIds(docNow()))}
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      onLoad={async (data, file, files) => {
        const r = await importProject(data, files, file.version);
        resetAll(r.state);
        return { warnings: [r.notSaved && S.projectNotSaved] };
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast(
            n.warnings
              ? { title: S.projectOpened, description: n.warnings.join(''), tone: 'warning' }
              : { title: S.projectOpened, description: n.fileName, tone: 'success' },
          );
        else if (n.kind === 'saved')
          toast({ title: S.projectSaved, description: n.fileName, tone: 'success' });
        else if (n.kind === 'open-failed')
          toast({ title: S.projectOpenFailed, description: n.message, tone: 'danger' });
        else toast({ title: S.projectReset });
      }}
      onReset={() => {
        const theme = docNow().theme;
        resetAll({ ...initialState(), theme });
      }}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
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

declare global {
  interface Window {
    __socialPost?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態、目前畫面的版面） */
function useTestHook() {
  useEffect(() => {
    window.__socialPost = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      layout: () => {
        const p = prefsNow();
        const l = buildScreen(makeEnv(docNow(), createCanvasMeasure(), false), p.screen, {
          postId: p.postId,
          storyId: p.storyId,
          cell: p.cell,
        });
        return { width: l.width, height: l.height, parts: l.parts, hits: l.hits };
      },
    };
  }, []);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  useAssetCleanup();
  useTestHook();
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: () => historyStep('undo') },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.redo,
        group: S.groupEdit,
        handler: () => historyStep('redo'),
      },
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.shortcutNudge,
        group: S.groupSticker,
      },
      { keys: ['delete', 'backspace'], label: S.shortcutDelete, group: S.groupSticker },
      { keys: 'escape', label: S.shortcutEsc, group: S.groupSticker },
    ],
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
          <ProjectActions />
        </>
      }
      settings={<Settings />}
      preview={<Preview />}
    />
  );
}
