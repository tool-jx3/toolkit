/**
 * 證件與票券產生器：跑團用的證件（員工證、學生證、記者證…，正反兩面、600 dpi 印刷用 PNG）與票券
 * （電影票、登機證、車票、收據，PNG 或浮起加閃光的 GIF）道具圖。規格：docs/refactor/specs/id-ticket.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ImageFrameDialog,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { closeFrame } from './media';
import { initialState } from './model';
import {
  CaptionsSection,
  FieldsSection,
  IdStyleSection,
  ItemsSection,
  PhotoSection,
  TemplateSection,
  TicketStyleSection,
  usePhotoLoader,
} from './Panel';
import { Preview } from './Preview';
import { importProject, projectAssetIds } from './project';
import { fontUsesOf } from './render';
import {
  assets,
  DATA_VERSION,
  docNow,
  historyStep,
  initialPrefs,
  photoSlot,
  prefsNow,
  referencedImages,
  resetAll,
  setPhotoPlace,
  setPrefs,
  TOOL_ID,
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

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function PhotoWindowDrop() {
  const loader = usePhotoLoader();
  const hasSlot = useDoc((s) => !!photoSlot(s.data));
  return (
    <WindowDrop
      label={S.windowDrop}
      hint={S.windowDropHint}
      disabled={!hasSlot}
      onDrop={(files) => void loader.load(files)}
    />
  );
}

function FrameDialog() {
  const req = useUi((s) => s.frame);
  return (
    <ImageFrameDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) closeFrame();
      }}
      image={req?.bitmap ?? null}
      aspect={req?.aspect ?? 1}
      cover={{ maxZoom: req?.maxZoom ?? 4 }}
      initialPlacement={req?.photo.place ?? null}
      shape={req?.circle ? 'circle' : 'rect'}
      outline={req?.circle ? 'shape' : 'frame'}
      title={S.photoFrameTitle}
      note={S.photoFrameNote}
      onApply={(place) => setPhotoPlace(place)}
    />
  );
}

function Settings() {
  const tab = usePrefs((p) => p.data.tab);
  const kind = useDoc((s) => s.data.kind);
  const items: { value: TabId; label: string; content: React.ReactNode }[] = [
    {
      value: 'content',
      label: S.tabs.content,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          <PhotoSection />
          <FieldsSection />
          <ItemsSection />
          <CaptionsSection />
        </div>
      ),
    },
    {
      value: 'style',
      label: S.tabs.style,
      content: (
        <div className="flex min-w-0 flex-col gap-3">
          {kind === 'id' ? <IdStyleSection /> : <TicketStyleSection />}
        </div>
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaveErrorNotice />
      <TemplateSection />
      <Tabs<TabId>
        aria-label={S.tabsLabel}
        value={tab}
        onValueChange={(v) => setPrefs({ tab: v })}
        items={items}
        keepMounted
      />
      <PhotoWindowDrop />
      <FrameDialog />
    </div>
  );
}

/** 頁首的「專案」選單（結果合成一則通知） */
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
    __idTicket?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀狀態） */
function useTestHook() {
  useEffect(() => {
    window.__idTicket = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      fonts: () => fontUsesOf(docNow()),
    };
  }, []);
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const kind = useDoc((s) => s.data.kind);
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
        keys: 'f',
        label: S.shortcutFlip,
        group: S.groupPreview,
        handler:
          kind === 'id'
            ? () => setPrefs({ side: prefsNow().side === 'front' ? 'back' : 'front' })
            : undefined,
      },
    ],
    [kind],
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
