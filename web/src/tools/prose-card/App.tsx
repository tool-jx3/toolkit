/**
 * 短文圖片產生器：把一段文字（台詞、後日談、劇本宣傳文句、心得）排成 1200 × 1600 的直式圖片，放不下時自動接到下一頁。
 * 規格：docs/refactor/specs/prose-card.md。
 */
import { Download, Eye, PenLine, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  cn,
  type ExportPanelHandle,
  IconButton,
  ImageFrameDialog,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { applyPlacement, closeFrame, useFrame } from './media';
import { initialState, PAGE_H, PAGE_W, type ProseState, ZOOM_MAX } from './model';
import { LayoutPicker, SettingsTabs, useImageLoader } from './Panel';
import { Preview, usePlan } from './Preview';
import { importProject, PROJECT_VERSION, projectData, projectFiles } from './project';
import { containRatio, GEO } from './render';
import {
  assets,
  docNow,
  historyStep,
  initialPrefs,
  prefsNow,
  referencedImages,
  resetAll,
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

function SaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: S.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

/** 「調整位置與縮放」對話框：照片（框＝照片框的比例）、背景圖片（框＝整頁） */
function FrameHost() {
  const req = useFrame((s) => s.request);
  const photo = useDoc((s) => s.data.photo);
  const bgPlace = useDoc((s) => s.data.bg.place);
  const slot = req?.slot ?? 'photo';
  const box =
    slot === 'photo' ? { width: GEO.cw, height: photo.height } : { width: PAGE_W, height: PAGE_H };
  const contain = slot === 'photo' && photo.fit === 'contain';
  const ratio = req && contain ? containRatio(req.bitmap, box, photo.place.turns) : 1;
  const stored = slot === 'photo' ? photo.place : bgPlace;
  return (
    <ImageFrameDialog
      open={!!req}
      onOpenChange={(o) => {
        if (!o) closeFrame();
      }}
      image={req?.bitmap ?? null}
      aspect={box.width / box.height}
      cover={contain ? undefined : { maxZoom: ZOOM_MAX }}
      initialPlacement={{ ...stored, zoom: stored.zoom * ratio }}
      title={slot === 'photo' ? S.photoDialog : S.bgDialog}
      note={S.frameNote}
      onApply={(place) => {
        if (!req) return;
        const r = contain ? containRatio(req.bitmap, box, place.turns) : 1;
        applyPlacement(req.slot, { ...place, zoom: place.zoom / r });
      }}
    />
  );
}

/** 整個視窗都可以拖放圖片：「照片＋文字」版面時換照片，其他版面換背景圖片 */
function WindowDropHost() {
  const load = useImageLoader();
  const layout = useDoc((s) => s.data.layout);
  return (
    <WindowDrop
      accept="image/*"
      label={S.imageDropAll}
      hint={S.imageDropAllHint}
      onDrop={(files) => load(layout === 'photo' ? 'photo' : 'bg', files)}
    />
  );
}

function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={PROJECT_VERSION}
      getData={() => projectData()}
      getFiles={() => projectFiles()}
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      onLoad={async (data, _file, files) => {
        const r = await importProject(data, files);
        resetAll(r.state);
        return { warnings: r.warnings };
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
        const p = prefsNow();
        usePrefs.getState().replace({
          ...initialPrefs(),
          tab: p.tab,
          scale: p.scale,
          textPresets: p.textPresets,
          highlightPresets: p.highlightPresets,
        });
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
    __proseCard?: {
      doc: () => ProseState;
      pages: () => number;
    };
  }
}

type MobileView = 'edit' | 'preview';

/** 手機：下方的「編輯／預覽／儲存」切換列 */
function MobileBar({
  view,
  onView,
  pages,
  onSave,
}: {
  view: MobileView;
  onView: (v: MobileView) => void;
  pages: number;
  onSave: () => void;
}) {
  const item =
    'flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold [&_svg]:size-5';
  return (
    <nav
      aria-label={S.mobileBar}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2 backdrop-blur lg:hidden"
      data-testid="mobile-bar"
    >
      <div className="mx-auto flex max-w-xl gap-2">
        <button
          type="button"
          aria-pressed={view === 'edit'}
          onClick={() => onView('edit')}
          className={cn(item, view === 'edit' ? 'bg-accent-soft text-accent' : 'text-muted')}
        >
          <PenLine aria-hidden />
          {S.mobileEdit}
        </button>
        <button
          type="button"
          aria-pressed={view === 'preview'}
          onClick={() => onView('preview')}
          className={cn(item, view === 'preview' ? 'bg-accent-soft text-accent' : 'text-muted')}
        >
          <Eye aria-hidden />
          {S.mobilePreview}
          {pages > 1 ? (
            <span className="rounded-full bg-accent px-1.5 text-xs text-accent-contrast tabular-nums">
              {pages}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onSave}
          className={cn(item, 'bg-accent text-accent-contrast')}
        >
          <Download aria-hidden />
          {S.mobileSave}
        </button>
      </div>
    </nav>
  );
}

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const exportRef = useRef<ExportPanelHandle>(null);
  const planInfo = usePlan();
  const pages = planInfo.plan.pages.length;
  const [view, setView] = useState<MobileView>('edit');
  useAssetCleanup();

  useEffect(() => {
    window.__proseCard = { doc: () => docNow(), pages: () => planInfo.plan.pages.length };
  }, [planInfo]);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'mod+code:keyz',
        label: S.undo,
        group: S.groupEdit,
        handler: () => historyStep('undo'),
        allowInInput: true,
      },
      {
        keys: ['shift+mod+code:keyz', 'mod+code:keyy'],
        label: S.redo,
        group: S.groupEdit,
        handler: () => historyStep('redo'),
        allowInInput: true,
      },
      { keys: 'mod+b', label: S.boldKey, group: S.groupText },
      { keys: 'mod+i', label: S.italicKey, group: S.groupText },
      { keys: 'shift+mod+x', label: S.strikeKey, group: S.groupText },
      { keys: 'mod+enter', label: S.pageBreakKey, group: S.groupText },
    ],
    [],
  );

  const save = () => {
    setView('preview');
    requestAnimationFrame(() => {
      document.getElementById('prose-export')?.scrollIntoView({ block: 'start' });
      exportRef.current?.exportNow('png');
    });
  };

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
      settings={
        <div
          className={cn(
            'flex min-w-0 flex-col gap-3',
            /* 觸控螢幕：輸入欄 16 px（iOS 點輸入欄時不會放大畫面） */
            '[@media(pointer:coarse)]:[&_input]:text-[16px]',
            view === 'preview' && 'max-lg:hidden',
          )}
          data-testid="settings"
        >
          <SaveErrorNotice />
          <LayoutPicker />
          <SettingsTabs pages={pages} />
          <WindowDropHost />
          <FrameHost />
          <div aria-hidden className="h-16 lg:hidden" />
        </div>
      }
      preview={
        <div className={cn('flex min-w-0 flex-col gap-3', view === 'edit' && 'max-lg:hidden')}>
          <Preview exportRef={exportRef} planInfo={planInfo} />
          <div aria-hidden className="h-16 lg:hidden" />
          {createPortal(
            <MobileBar
              view={view}
              pages={pages}
              onView={(v) => {
                setView(v);
                window.scrollTo({ top: 0 });
              }}
              onSave={save}
            />,
            document.body,
          )}
        </div>
      }
    />
  );
}
