/**
 * VTT 棋子產生器：把角色圖放進有花紋的圓形外框，頭、角、武器可以「出框」蓋在外框上，匯出透明背景的 PNG。
 * 規格：docs/refactor/specs/token-maker.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { downloadBlob, pickFiles } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import {
  type BatchNotice,
  changeMask,
  loadImageFiles,
  renderTokenBlob,
  tokenFileName,
} from './actions';
import { initialState, RANGES } from './model';
import { ExportTab, FrameTab, ImageTab, PopoutTab } from './Panels';
import { Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  currentToken,
  DATA_VERSION,
  docNow,
  exportSizeOf,
  historyStep,
  initialPrefs,
  keyRotate,
  nudgeView,
  prefsNow,
  referencedImages,
  resetAll,
  resetView,
  setPrefs,
  setTool,
  stepZoom,
  TOOL_ID,
  tokenPad,
  useDoc,
  usePrefs,
  useUi,
} from './store';
import { S, type TabId } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/**
 * 通知：App 本身在 ToolShell（UiProvider）外面，拿不到 useToast；由 ToolShell 裡的 ToastBridge 接上，
 * 快捷鍵與預覽的「點一下選圖」也能通知。
 */
const toaster: { current: ((n: BatchNotice) => void) | null } = { current: null };

function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    toaster.current = (n) => toast({ title: n.title, description: n.description, tone: n.tone });
    return () => {
      toaster.current = null;
    };
  }, [toast]);
  return null;
}

function useNotify() {
  return (n: BatchNotice | null) => {
    if (n) toaster.current?.(n);
  };
}

function useImageLoader() {
  const notify = useNotify();
  const load = async (files: File[]) => notify(await loadImageFiles(files));
  const pick = async () => {
    const files = await pickFiles({ accept: 'image/*' });
    if (files.length) await load(files);
  };
  return { load, pick };
}

/** 按住 Alt（暫時改成去掉／擦掉）與空白鍵（暫時平移） */
function useHeldKeys() {
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      !!t.closest('input,textarea,select,[contenteditable="true"],[role="slider"]');
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && !useUi.getState().alt) useUi.setState({ alt: true });
      if (e.key === ' ' && !typing(e.target) && !(e.target instanceof HTMLButtonElement)) {
        if (!currentToken()?.image) return;
        e.preventDefault();
        if (!useUi.getState().space) useUi.setState({ space: true });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') useUi.setState({ alt: false });
      if (e.key === ' ') useUi.setState({ space: false });
    };
    const blur = () => useUi.setState({ alt: false, space: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
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

function Settings() {
  const loader = useImageLoader();
  const tab = usePrefs((s) => s.data.tab);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    {
      value: 'image',
      label: S.tabs.image,
      content: <ImageTab onFiles={(f) => void loader.load(f)} />,
    },
    { value: 'popout', label: S.tabs.popout, content: <PopoutTab /> },
    { value: 'frame', label: S.tabs.frame, content: <FrameTab /> },
    { value: 'export', label: S.tabs.export, content: <ExportTab /> },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToastBridge />
      <SaveErrorNotice />
      <Tabs<TabId>
        aria-label={S.tabsLabel}
        value={tab}
        onValueChange={(v) => setPrefs({ tab: v })}
        items={items}
        keepMounted
      />
      <WindowDrop
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => void loader.load(files)}
      />
    </div>
  );
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
      getFiles={() => assets.exportFiles(projectAssetIds(docNow()))}
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      onLoad={async (data, _file, files) => {
        const r = await importProject(data, files);
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
        resetAll(initialState());
        usePrefs.getState().replace(initialPrefs());
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
    __tokenMaker?: unknown;
  }
}

function useTestHook() {
  useEffect(() => {
    window.__tokenMaker = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      pad: () => tokenPad(docNow().look, currentToken()),
      ui: () => {
        const u = useUi.getState();
        return { alt: u.alt, space: u.space, painting: u.painting, busy: u.busy, wand: u.wand };
      },
    };
  }, []);
}

/** 快捷鍵的下載（Ctrl＋S） */
function useQuickDownload() {
  const notify = useNotify();
  return async () => {
    const token = currentToken();
    if (!token?.image) return;
    const p = prefsNow();
    const N = exportSizeOf(p);
    const fmt = p.format;
    try {
      const blob = await renderTokenBlob(token, docNow().look, N, fmt);
      const name = tokenFileName(token, N, fmt);
      downloadBlob(blob, name);
      notify({ title: S.downloaded(name), tone: 'success' });
    } catch {
      notify({ title: S.exportFailed, tone: 'danger' });
    }
  };
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const loader = useImageLoader();
  const notify = useNotify();
  const quickDownload = useQuickDownload();
  useAssetCleanup();
  useTestHook();
  useHeldKeys();

  const shortcuts = useMemo<Shortcut[]>(() => {
    const nudge = (dx: number, dy: number) => () => nudgeView(dx, dy);
    const bracket = (dir: 1 | -1, big: boolean) => () => {
      if (prefsNow().tool === 'brush') {
        const b = prefsNow().brush + dir * 2;
        setPrefs({ brush: Math.max(RANGES.brush.min, Math.min(RANGES.brush.max, b)) });
      } else keyRotate(dir * (big ? 15 : 1));
    };
    return [
      { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: () => historyStep('undo') },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.redo,
        group: S.groupEdit,
        handler: () => historyStep('redo'),
      },
      {
        keys: ['delete', 'backspace'],
        label: S.shortcutClear,
        group: S.groupEdit,
        handler: () => void changeMask('clear').then(notify),
      },
      { keys: 'v', label: S.shortcutMove, group: S.groupTool, handler: () => setTool('move') },
      { keys: 'w', label: S.shortcutWand, group: S.groupTool, handler: () => setTool('wand') },
      { keys: 'b', label: S.shortcutBrush, group: S.groupTool, handler: () => setTool('brush') },
      { keys: 'escape', label: S.shortcutEsc, group: S.groupTool, handler: () => setTool('move') },
      { keys: 'alt', label: S.shortcutAlt, group: S.groupTool },
      { keys: 'space', label: S.shortcutSpace, group: S.groupTool },
      { keys: '[', label: S.shortcutBracket, group: S.groupTool, handler: bracket(-1, false) },
      { keys: ']', label: S.shortcutBracket, group: S.groupTool, handler: bracket(1, false) },
      { keys: '{', label: S.shortcutBracket, group: S.groupTool, handler: bracket(-1, true) },
      { keys: '}', label: S.shortcutBracket, group: S.groupTool, handler: bracket(1, true) },
      { keys: 'arrowleft', label: S.shortcutNudge, group: S.groupView, handler: nudge(-0.01, 0) },
      { keys: 'arrowright', label: S.shortcutNudge, group: S.groupView, handler: nudge(0.01, 0) },
      { keys: 'arrowup', label: S.shortcutNudge, group: S.groupView, handler: nudge(0, -0.01) },
      { keys: 'arrowdown', label: S.shortcutNudge, group: S.groupView, handler: nudge(0, 0.01) },
      {
        keys: 'shift+arrowleft',
        label: S.shortcutNudge,
        group: S.groupView,
        handler: nudge(-0.05, 0),
      },
      {
        keys: 'shift+arrowright',
        label: S.shortcutNudge,
        group: S.groupView,
        handler: nudge(0.05, 0),
      },
      {
        keys: 'shift+arrowup',
        label: S.shortcutNudge,
        group: S.groupView,
        handler: nudge(0, -0.05),
      },
      {
        keys: 'shift+arrowdown',
        label: S.shortcutNudge,
        group: S.groupView,
        handler: nudge(0, 0.05),
      },
      { keys: '=', label: S.shortcutZoomIn, group: S.groupView, handler: () => stepZoom(0.02) },
      { keys: '+', label: S.shortcutZoomInBig, group: S.groupView, handler: () => stepZoom(0.1) },
      { keys: '-', label: S.shortcutZoomOut, group: S.groupView, handler: () => stepZoom(-0.02) },
      { keys: '_', label: S.shortcutZoomOutBig, group: S.groupView, handler: () => stepZoom(-0.1) },
      { keys: '0', label: S.shortcutReset, group: S.groupView, handler: resetView },
      {
        keys: 'mod+s',
        label: S.shortcutDownload,
        group: S.groupFile,
        handler: () => void quickDownload(),
        allowInInput: true,
      },
    ];
  }, [notify, quickDownload]);

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
      preview={<Preview onPick={() => void loader.pick()} />}
    />
  );
}
