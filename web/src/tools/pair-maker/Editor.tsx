/**
 * 編輯畫面：左邊（窄畫面在預覽下方）是版型資訊與設定欄，右邊是預覽與下載；頁首有復原／重做與「專案」選單
 * （存成專案檔、開啟專案檔、存檔槽、重設）。文字記錄在背景自動分頁。
 */
import { Archive, LayoutGrid, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readAsBytes } from '@/core/files';
import {
  parseProjectBytes,
  type ToolStore,
  useSaveError,
  useSaveStatus,
  useUndoRedo,
} from '@/core/storage';
import {
  Button,
  type CanvasPicker,
  createCanvasPicker,
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  Select,
  type Shortcut,
  ToolShell,
  useConfirm,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { paginateNow } from './autoPaginate';
import { type Draft, draftAssets, type TemplateDef } from './model';
import { Panel } from './Panel';
import { Preview } from './Preview';
import { importProject, projectData } from './project';
import { outputName } from './render';
import { SlotsDialog } from './SlotsDialog';
import {
  assets,
  draftToolId,
  type OpenResult,
  openDraft,
  PROJECT_VERSION,
  TOOL_ID,
  useUi,
} from './store';
import { S } from './strings';
import { TEMPLATES } from './templates';
import { Usage } from './Usage';

/** 文字記錄：變更後約 0.2 秒（本文欄有焦點時不分頁）或離開格式化文字欄時自動分頁 */
function usePagination(def: TemplateDef, store: ToolStore<Draft>) {
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warned = useRef(false);
  const run = useCallback(async () => {
    if (document.activeElement?.closest?.('[data-rich-editor]')) return;
    const r = await paginateNow(def, store);
    if (!r) return;
    if (r.capped && !warned.current) toast({ title: S.pagesCapped, tone: 'warning' });
    warned.current = r.capped;
  }, [def, store, toast]);
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), 200);
  }, [run]);
  useEffect(() => {
    if (def.kind !== 'textlog') return;
    const unsub = store.subscribe((s, prev) => {
      if (s.data !== prev.data) schedule();
    });
    schedule();
    return () => {
      unsub();
      clearTimeout(timer.current);
    };
  }, [def, store, schedule]);
  return schedule;
}

function TemplateBar({
  def,
  onBack,
  onSwitch,
}: {
  def: TemplateDef;
  onBack: () => void;
  onSwitch: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
      data-testid="template-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
          #{def.tag}
        </span>
        <h2
          className="m-0 min-w-0 flex-1 truncate text-base font-semibold text-fg"
          data-testid="template-name"
        >
          {def.name}
        </h2>
        <Button size="sm" icon={<LayoutGrid />} onClick={onBack}>
          {S.backToGallery}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{def.tip}</p>
      <Select
        aria-label={S.switchTemplate}
        size="sm"
        value={def.id}
        onValueChange={(v) => v !== def.id && onSwitch(v)}
        options={TEMPLATES.map((t) => ({ value: t.id, label: `${t.name}（#${t.tag}）` }))}
      />
    </div>
  );
}

/** 設定欄（在 ToolShell 的 Provider 裡：通知、確認對話框、自動分頁、存檔槽、拖進來的專案檔都在這裡） */
function SettingsArea({
  def,
  opened,
  d,
  picker,
  saveError,
  slotsOpen,
  setSlotsOpen,
  onBack,
  onSwitch,
}: {
  def: TemplateDef;
  opened: OpenResult;
  d: Draft;
  picker: CanvasPicker;
  saveError: unknown;
  slotsOpen: boolean;
  setSlotsOpen: (open: boolean) => void;
  onBack: () => void;
  onSwitch: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const store = opened.store;
  const paginateSoon = usePagination(def, store);

  /* 開啟時的通知：讀回上次的編輯、或讀不回來 */
  const told = useRef(false);
  useEffect(() => {
    if (told.current) return;
    told.current = true;
    if (opened.restored) toast({ title: S.restored });
    if (opened.failed) toast({ title: S.restoreFailed, tone: 'warning' });
  }, [opened, toast]);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);

  /* 拖進視窗的 ZIP＝開啟專案檔 */
  const loadZip = async (file: File) => {
    const ok = await confirm({
      title: S.openConfirmTitle,
      description: S.openConfirmDesc,
      confirmLabel: S.openConfirmLabel,
    });
    if (!ok) return;
    try {
      const project = parseProjectBytes<unknown>(await readAsBytes(file), TOOL_ID);
      const next = await importProject(def, project.data, project.files, file.size);
      store.getState().replace(next);
      useUi.getState().setSticker(null);
      toast({ title: S.projectOpened, description: file.name, tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), tone: 'danger' });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TemplateBar def={def} onBack={onBack} onSwitch={onSwitch} />
      <Panel def={def} store={store} d={d} picker={picker} onRichBlur={paginateSoon} />
      <SlotsDialog open={slotsOpen} onOpenChange={setSlotsOpen} def={def} store={store} />
      <WindowDrop
        accept=".zip,application/zip"
        label={S.archiveDrop}
        onDrop={(files) => {
          const f = files[0];
          if (f) void loadZip(f);
        }}
      />
    </div>
  );
}

export function Editor({
  def,
  onBack,
  onSwitch,
}: {
  def: TemplateDef;
  onBack: () => void;
  onSwitch: (id: string) => void;
}) {
  const opened = useMemo(() => openDraft(def), [def]);
  const store = opened.store;
  const d = store((s) => s.data);
  const picker = useMemo(() => createCanvasPicker(), []);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(store);
  const savedAt = useSaveStatus(draftToolId(def.id));
  const saveError = useSaveError(draftToolId(def.id));
  const [slotsOpen, setSlotsOpen] = useState(false);
  useEffect(() => () => picker.cancel(), [picker]);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: '編輯', handler: redo },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={<Usage />}
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
          <ProjectMenu<unknown>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={() => projectData(def, store.getState().data)}
            getFiles={() => assets.exportFiles(draftAssets(store.getState().data))}
            fileNameFor={(t) => outputName(def, 'zip', t).replace(/\.zip$/, '')}
            confirmOpen={{
              title: S.openConfirmTitle,
              description: S.openConfirmDesc,
              confirmLabel: S.openConfirmLabel,
            }}
            openedMessage={S.projectOpened}
            onLoad={async (data, _file, files, source) => {
              const next = await importProject(def, data, files, source.size);
              store.getState().replace(next);
              useUi.getState().setSticker(null);
              return true;
            }}
            onReset={() => {
              store.getState().replace(def.initial());
              useUi.getState().setSticker(null);
            }}
            resetText={{ title: S.resetTitle, description: S.resetDesc }}
            savedAt={savedAt}
            statusText={saveError ? S.saveFailed : undefined}
            extraItems={
              <ProjectMenuItem icon={<Archive aria-hidden />} onSelect={() => setSlotsOpen(true)}>
                {S.slots}
              </ProjectMenuItem>
            }
          />
        </>
      }
      settings={
        <SettingsArea
          def={def}
          opened={opened}
          d={d}
          picker={picker}
          saveError={saveError}
          slotsOpen={slotsOpen}
          setSlotsOpen={setSlotsOpen}
          onBack={onBack}
          onSwitch={onSwitch}
        />
      }
      preview={<Preview def={def} store={store} d={d} picker={picker} />}
    />
  );
}
