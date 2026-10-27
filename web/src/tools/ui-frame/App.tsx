/**
 * UI 框素材產生器：從一個主色做出整套透明 PNG 的 UI 框——文字冒險（TyranoScript）的訊息框、名字框、選項與系統按鈕
 * （各 4 種狀態，附配置程式碼），或 TRPG・直播（CCFOLIA 的螢幕面板、OBS）的畫面外框、角色框、狀態、骰子面板、留言板。
 * 規格：docs/refactor/specs/ui-frame.md。
 */
import { Palette, Redo2, SlidersHorizontal, Type, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  withShortcut,
} from '@/ui';
import { useTestHook } from './hook';
import { DATA_VERSION, initialState, normalizeState, TOOL_ID } from './model';
import { DesignPanel, ModeSwitch, StylePanel, TextPanel } from './Panel';
import { Preview } from './Preview';
import {
  assets,
  docNow,
  historyStep,
  prefsNow,
  replaceDoc,
  setPrefs,
  settleGesture,
  type TabId,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：試看的圖以外、以前留下的都刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      const p = prefsNow();
      const keep = new Set<string>();
      if (p.bg) keep.add(p.bg.id);
      if (p.char) keep.add(p.char.id);
      void assets.gcStale(keep).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => docNow()}
      onLoad={(data) => {
        replaceDoc(normalizeState(data));
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast({ title: S.projectOpened, description: n.fileName, tone: 'success' });
        else if (n.kind === 'saved')
          toast({ title: S.projectSaved, description: n.fileName, tone: 'success' });
        else if (n.kind === 'open-failed')
          toast({ title: S.projectOpenFailed, description: n.message, tone: 'danger' });
        else toast({ title: S.projectReset });
      }}
      onReset={() =>
        /* 重設外觀與文字；畫面大小保留（規格 F46） */
        replaceDoc({ ...initialState(), resolution: docNow().resolution })
      }
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}

function Usage() {
  const u = S.usage;
  const list = (items: readonly string[]) => (
    <ol className="m-0 flex flex-col gap-1.5 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
  return (
    <div className="flex flex-col gap-3">
      {list(u.steps)}
      <p className="m-0 font-medium">{u.tyranoTitle}</p>
      {list(u.tyrano)}
      <p className="m-0 font-medium">{u.ccfoliaTitle}</p>
      {list(u.ccfolia)}
      <p className="m-0 font-medium">{u.obsTitle}</p>
      {list(u.obs)}
      <p className="m-0 text-xs text-muted">{u.privacy}</p>
      <p className="m-0 text-xs text-muted">{u.unofficial}</p>
    </div>
  );
}

function Settings() {
  const tab = usePrefs((s) => s.data.tab);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <ModeSwitch />
      <Tabs<TabId>
        aria-label={S.tabsAria}
        value={tab}
        onValueChange={(v) => {
          /* 打字中直接換分頁：先把這一筆編輯收尾（不然之後的復原會卡住） */
          settleGesture();
          setPrefs({ tab: v });
        }}
        items={[
          { value: 'style', label: S.tabs.style, icon: <Palette />, content: <StylePanel /> },
          {
            value: 'design',
            label: S.tabs.design,
            icon: <SlidersHorizontal />,
            content: <DesignPanel />,
          },
          { value: 'text', label: S.tabs.text, icon: <Type />, content: <TextPanel /> },
        ]}
      />
    </div>
  );
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
