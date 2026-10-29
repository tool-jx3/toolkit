/**
 * QR Code 產生器：網址或文字做成有樣式的 QR code（點與三個角的樣式和顏色、漸層、背景、中間的圖、圓形），
 * 匯出 PNG、JPEG、WebP、SVG，產生後自動讀一次確認掃得出來。
 * 規格：docs/refactor/specs/qr-maker.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { downloadBlob } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { exportCurrent, type Notice, setImageFile } from './actions';
import { initialDoc } from './model';
import { ContentTab, ExportTab, ImageTab, StyleTab } from './Panels';
import { Preview, useCheck } from './Preview';
import { importProject, projectAssetIds } from './project';
import {
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPrefs,
  prefsNow,
  referencedImages,
  resetAll,
  setPrefs,
  type TabId,
  TOOL_ID,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** App 在 ToolShell（UiProvider）外面，快捷鍵的通知經由 ToolShell 裡的 ToastBridge */
const toaster: { current: ((n: Notice) => void) | null } = { current: null };
const notify = (n: Notice | null) => {
  if (n) toaster.current?.(n);
};

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

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function Settings({ exportRef }: { exportRef: React.Ref<ExportPanelHandle> }) {
  const tab = usePrefs((s) => s.data.tab);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    { value: 'content', label: S.tabs.content, content: <ContentTab /> },
    { value: 'style', label: S.tabs.style, content: <StyleTab /> },
    { value: 'image', label: S.tabs.image, content: <ImageTab /> },
    { value: 'export', label: S.tabs.export, content: <ExportTab exportRef={exportRef} /> },
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
        accept="image/*,.svg"
        label={S.windowDrop}
        hint={S.windowDropHint}
        onDrop={(files) => {
          const f = files[0];
          if (f) void setImageFile(f).then(notify);
        }}
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
      getFiles={async () => {
        const ids = projectAssetIds(docNow());
        return ids.length ? assets.exportFiles(ids) : [];
      }}
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
        resetAll(initialDoc());
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
    __qrMaker?: unknown;
  }
}

function useTestHook() {
  useEffect(() => {
    window.__qrMaker = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      check: () => {
        const c = useCheck.getState();
        return {
          state: c.state,
          decoded: c.result?.decoded ?? null,
          finders: c.result?.finders ?? null,
          wrong: c.result?.wrong ?? null,
          view: c.view,
          grid: c.grid,
        };
      },
      canUndo: () => useDoc.temporal.getState().pastStates.length > 0,
    };
  }, []);
}

/** Ctrl＋S：用目前的格式與倍率直接下載 */
async function quickDownload() {
  try {
    const out = await exportCurrent();
    downloadBlob(out.blob, out.fileName);
    notify({ title: S.downloaded(out.fileName), tone: 'success' });
  } catch (e) {
    notify({
      title: S.exportFailed,
      description: e instanceof Error ? e.message : undefined,
      tone: 'danger',
    });
  }
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const exportRef = useRef<ExportPanelHandle>(null);
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
        keys: 'mod+s',
        label: S.shortcutDownload,
        group: S.groupFile,
        handler: () => void quickDownload(),
        allowInInput: true,
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
      settings={<Settings exportRef={exportRef} />}
      preview={<Preview />}
    />
  );
}
