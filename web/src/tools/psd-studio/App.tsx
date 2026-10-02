/**
 * CCFOLIA & 圖片調色工作室：房間 ZIP、PSD、一批圖片一起調色，打包成 ZIP 下載。
 * 規格：docs/refactor/specs/psd-studio.md（第 7 節主控裁定優先）。
 */
import {
  Download,
  FolderOpen,
  Grid3x3,
  ImagePlus,
  Maximize,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  type ChangeEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { naturalCompare } from '@/core/files';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  cn,
  Field,
  IconButton,
  NumberInput,
  ProjectMenu,
  Section,
  Select,
  type Shortcut,
  Tabs,
  TextInput,
  Toggle,
  ToolShell,
  Tooltip,
  useConfirm,
  useToast,
  WindowDrop,
} from '@/ui';
import { CurveControls, GradientControls, ToneControls } from './AdjustControls';
import { AssetGrid } from './AssetGrid';
import { adjustKey, defaultGlobalAdjust, GLOBAL_TONE_RANGES, type GlobalAdjust } from './adjust';
import { BusyOverlay, useBusy } from './Busy';
import { createStudioRunner } from './client';
import { TARGET_CHOICES } from './compress';
import { CanvasSizeFields, Inspector } from './Inspector';
import { LayerPanel } from './LayerPanel';
import { clampZoom, LayoutView, type LayoutViewProps } from './LayoutView';
import { buildRoomLayout, type PanelRow, roomPanelRows, roomRoleRanks } from './layout';
import { type GlobalLoopMode, loopCount, MAX_LOOP_COUNT, matchesSearch } from './naming';
import { PresetsSection } from './Presets';
import {
  clearSavedSession,
  isSavedSession,
  type SavedSession,
  saveSession,
  serializeWorkspace,
} from './session';
import {
  type Asset,
  type Camera,
  DEFAULT_CAMERA,
  emptyWorkspace,
  type Mode,
  type Settings,
  type SortKey,
  sanitizeSettings,
  TOOL_ID,
  useSettings,
  useWorkspace,
  type ViewTab,
  visibilityOf,
} from './store';
import { S } from './strings';
import { setSelectedPriority, ThumbCanvas } from './ThumbCanvas';
import { clearThumbs, requestThumbs } from './thumbs';
import {
  type Ctx,
  clearWork,
  compileFor,
  downloadOne,
  exportAll,
  handleFiles,
  padAll,
  padAsset,
  resizeAsset,
  restoreFrom,
  restoreOnStart,
  setAssetAdjust,
  testOne,
} from './workflows';

const ACCEPT = 'image/*,.zip,.psd';
const AUTOSAVE_MS = 400;

/** ToolShell 裡面才拿得到確認對話框與通知：交給流程使用 */
function UiBridge({ api }: { api: RefObject<Pick<Ctx, 'toast' | 'confirm'> | null> }) {
  const confirm = useConfirm();
  const toast = useToast();
  useLayoutEffect(() => {
    api.current = { confirm, toast };
  }, [api, confirm, toast]);
  return null;
}

/* ---------- 載入區（F01～F05） ---------- */

function LoadArea({
  onFiles,
  active,
  big,
  extra,
}: {
  onFiles: (files: File[]) => void;
  active: boolean;
  big?: boolean;
  extra?: React.ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const take = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (list.length) onFiles(list);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: 載入區是一組控制項（拖放＋兩個選檔按鈕），不是表單分組
    // biome-ignore lint/a11y/useKeyWithClickEvents: 點空白處只是讓滑鼠也能選檔（F03、F04）；鍵盤用裡面的按鈕
    <div
      role="group"
      aria-label={big ? S.emptyTitle : S.loadLabel}
      data-testid={big ? 'empty-drop' : 'load-area'}
      data-active={active || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,a')) return;
        fileInput.current?.click();
      }}
      className={cn(
        'flex cursor-pointer rounded-lg border-2 border-dashed transition-colors',
        big
          ? 'min-h-[min(60dvh,520px)] flex-col items-center justify-center gap-3 p-6 text-center'
          : 'flex-wrap items-center gap-2 px-3 py-2',
        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent',
      )}
    >
      {big ? <ImagePlus aria-hidden className="size-10 text-muted" /> : null}
      <div className={cn('min-w-0', big ? 'max-w-md' : 'mr-auto flex-1')}>
        <p className={cn('m-0 font-semibold', big ? 'text-base' : 'text-sm')}>
          {big ? S.emptyTitle : S.loadLabel}
        </p>
        <p className="m-0 text-xs text-muted">{big ? S.emptyBody : S.loadHint}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          icon={<ImagePlus />}
          variant={big ? 'primary' : 'secondary'}
          onClick={() => fileInput.current?.click()}
        >
          {S.pickFiles}
        </Button>
        <Button icon={<FolderOpen />} onClick={() => folderInput.current?.click()}>
          {S.pickFolder}
        </Button>
        {extra}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        data-testid={big ? 'empty-file-input' : 'file-input'}
        onChange={take}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        data-testid={big ? 'empty-folder-input' : 'folder-input'}
        onChange={take}
        {...{ webkitdirectory: '', directory: '' }}
      />
    </div>
  );
}

/* ---------- 選取的素材（F59～F65） ---------- */

function SelectedSummary({
  asset,
  mode,
  onOpen,
  onReset,
  onResize,
  onPad,
}: {
  asset: Asset | null;
  mode: Mode;
  onOpen: () => void;
  onReset: () => void;
  onResize: (w: number, h: number) => void;
  onPad: () => void;
}) {
  const [size, setSize] = useState({ w: asset?.width ?? 1, h: asset?.height ?? 1 });
  useEffect(() => {
    if (asset) setSize({ w: asset.width, h: asset.height });
  }, [asset?.id, asset?.width, asset?.height, asset]);
  if (!asset)
    return (
      <p className="m-0 text-sm text-muted" data-testid="no-selection">
        {S.noSelection}
      </p>
    );
  const kind =
    mode === 'psd' && asset.layer
      ? S.kindPsdAt(asset.layer.left, asset.layer.top)
      : asset.apng
        ? S.kindApng
        : S.kindStaticImage;
  return (
    <div className="flex flex-col gap-3" data-testid="selected-summary">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={S.openViewerOf(asset.label)}
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 outline-none focus-visible:focus-ring"
        >
          <ThumbCanvas assetId={asset.id} testId="summary-thumb" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="truncate text-sm" title={asset.name} data-testid="selected-name">
            {asset.label}
          </strong>
          <span className="text-xs text-muted" data-testid="selected-meta">
            {S.assetMeta(asset.width, asset.height, kind)}
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={onOpen}>
              {S.openViewer}
            </Button>
            <Tooltip content={S.resetAssetHint}>
              <Button size="sm" onClick={onReset}>
                {S.resetAsset}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
      <Field label={S.canvasSize} hint={S.canvasHint}>
        <CanvasSizeFields
          width={size.w}
          height={size.h}
          onChange={(w, h) => setSize({ w, h })}
          onApply={() => onResize(size.w, size.h)}
          onPad={onPad}
          idPrefix="summary"
        />
      </Field>
    </div>
  );
}

/* ---------- 模式標記（F13） ---------- */

const MODE_CLASS: Record<Mode, string> = {
  idle: 'bg-surface-3 text-muted',
  image: 'bg-accent-soft text-accent',
  psd: 'bg-success-soft text-success',
  room: 'bg-warning-soft text-warning',
};

function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span
      data-testid="mode-badge"
      data-mode={mode}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        MODE_CLASS[mode],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      <span className="sr-only">{S.modeLabel}：</span>
      {S.modes[mode]}
    </span>
  );
}

/* ---------- 配置檢視的縮放（只有這裡跟著平移、縮放重畫） ---------- */

const setCamera = (camera: Camera) => useWorkspace.getState().set({ camera });

function ZoomControls() {
  const camera = useWorkspace((s) => s.camera);
  return (
    <>
      <IconButton
        label={S.zoomOut}
        icon={<Minus />}
        onClick={() => setCamera({ ...camera, zoom: clampZoom(camera.zoom / 1.2) })}
      />
      <span className="w-12 text-center text-xs text-muted tabular-nums" data-testid="zoom-value">
        {S.zoomValue(camera.zoom)}
      </span>
      <IconButton
        label={S.zoomIn}
        icon={<Plus />}
        onClick={() => setCamera({ ...camera, zoom: clampZoom(camera.zoom * 1.2) })}
      />
      <Button size="sm" onClick={() => setCamera({ ...DEFAULT_CAMERA })}>
        {S.center}
      </Button>
    </>
  );
}

function CameraLayoutView(props: Omit<LayoutViewProps, 'camera' | 'onCamera'>) {
  const camera = useWorkspace((s) => s.camera);
  return <LayoutView {...props} camera={camera} onCamera={setCamera} />;
}

/* ---------- 自動存檔（F104） ---------- */

function Autosave({ onSaved, onError }: { onSaved: (t: number) => void; onError: () => void }) {
  useAutosave(onSaved, onError);
  return null;
}

/* ---------- 主程式 ---------- */

function useAutosave(onSaved: (t: number) => void, onError: () => void) {
  const revision = useWorkspace((s) => s.revision);
  const pending = useRef<number | null>(null);
  const saving = useRef<Promise<unknown> | null>(null);
  const flush = useCallback(() => {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    const w = useWorkspace.getState();
    if (!w.assets.length) return;
    const run = async () => {
      await saving.current;
      try {
        if (await saveSession(useWorkspace.getState())) onSaved(Date.now());
      } catch {
        onError();
      }
    };
    saving.current = run();
  }, [onSaved, onError]);
  useEffect(() => {
    if (!revision || !useWorkspace.getState().assets.length) return;
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(flush, AUTOSAVE_MS);
  }, [revision, flush]);
  useEffect(() => {
    const onHide = () => {
      if (pending.current !== null) flush();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [flush]);
}

interface ProjectData {
  settings: Settings;
  session: SavedSession;
}

export function App() {
  const stored = useSettings((s) => s.data);
  const st = useMemo(() => sanitizeSettings(stored), [stored]);
  const patch = useSettings((s) => s.patch);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const w = useWorkspace(
    useShallow((s) => ({
      mode: s.mode,
      assets: s.assets,
      origin: s.origin,
      roomJson: s.roomJson,
      psd: s.psd,
      selectedId: s.selectedId,
      tab: s.tab,
      search: s.search,
      sort: s.sort,
      set: s.set,
      updateAsset: s.updateAsset,
      updateAssets: s.updateAssets,
    })),
  );
  const busyActive = useBusy((s) => s.active);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const settingsSavedAt = useSaveStatus(TOOL_ID);

  const ui = useRef<Pick<Ctx, 'toast' | 'confirm'> | null>(null);
  const runner = useMemo(() => createStudioRunner('調色處理'), []);
  const viewRunner = useMemo(() => createStudioRunner('檢視器'), []);
  useEffect(
    () => () => {
      runner.dispose();
      viewRunner.dispose();
    },
    [runner, viewRunner],
  );
  const ctx = useCallback(
    (): Ctx => ({
      runner,
      toast: (o) => ui.current?.toast(o),
      confirm: (o) => ui.current?.confirm(o) ?? Promise.resolve(false),
      setStatus,
    }),
    [runner],
  );

  /* 開頁自動還原（F105） */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void restoreOnStart(ctx());
  }, [ctx]);

  const onSaved = useCallback((t: number) => {
    setSavedAt(t);
    setSaveError(false);
  }, []);
  const onSaveError = useCallback(() => setSaveError(true), []);

  const isVisible = useMemo(() => visibilityOf(w.assets), [w.assets]);
  const selected = w.assets.find((a) => a.id === w.selectedId) ?? null;

  /* 預覽縮圖：整體或個別調色變了就重算（thumbs.ts 依畫面排優先順序） */
  useEffect(() => {
    requestThumbs(
      w.assets.map((a) => ({
        id: a.id,
        key: `${a.rev}|${adjustKey(st.global, a.adjust)}`,
        compile: compileFor(st, a),
      })),
    );
  }, [w.assets, st]);
  useEffect(() => setSelectedPriority(w.selectedId), [w.selectedId]);
  /* 選取的素材不見了（換了一批檔案、清除作業）就關掉檢視器 */
  useEffect(() => {
    if (!selected) setViewerOpen(false);
  }, [selected]);

  /* ---------- 房間／PSD 的配置 ---------- */

  const room = useMemo(
    () => (w.mode === 'room' ? buildRoomLayout(w.roomJson, w.assets) : null),
    [w.mode, w.roomJson, w.assets],
  );
  const panelRows: PanelRow[] = useMemo(() => {
    if (w.mode === 'room' && room) return roomPanelRows(room, w.assets);
    if (w.mode === 'psd')
      return w.assets.map((a) => ({ key: a.id, assetId: a.id, kind: 'layer', name: '' }));
    return [];
  }, [w.mode, room, w.assets]);

  /* ---------- 圖片清單：搜尋與排序（F18、F19） ---------- */

  const roleRanks = useMemo(
    () => (w.mode === 'room' && w.sort === 'role' ? roomRoleRanks(w.roomJson, w.assets) : null),
    [w.mode, w.sort, w.roomJson, w.assets],
  );
  const listAssets = useMemo(() => {
    const list = w.assets.filter((a) => matchesSearch(w.search, a.name, a.label));
    const order = new Map(w.assets.map((a, i) => [a.id, i]));
    const byOrder = (a: Asset, b: Asset) => order.get(a.id)! - order.get(b.id)!;
    if (w.sort === 'name')
      return [...list].sort((a, b) => naturalCompare(a.label, b.label) || byOrder(a, b));
    if (w.sort === 'type')
      return [...list].sort((a, b) => Number(b.apng) - Number(a.apng) || byOrder(a, b));
    if (w.sort === 'role' && roleRanks)
      return [...list].sort((a, b) => roleRanks.get(a.id)! - roleRanks.get(b.id)! || byOrder(a, b));
    return list;
  }, [w.assets, w.search, w.sort, roleRanks]);

  /* ---------- 操作 ---------- */

  const select = (id: string) => w.set({ selectedId: id });
  const openViewer = (id: string) => {
    w.set({ selectedId: id });
    setViewerOpen(true);
  };
  const navigate = (dir: -1 | 1) => {
    const list = useWorkspace.getState().assets;
    if (!list.length) return;
    const i = list.findIndex((a) => a.id === useWorkspace.getState().selectedId);
    const next = list[(i < 0 ? 0 : i + dir + list.length) % list.length];
    w.set({ selectedId: next.id });
  };
  const updateGlobal = (fn: (g: GlobalAdjust) => GlobalAdjust) =>
    patch({ global: fn(sanitizeSettings(useSettings.getState().data).global) });
  const onFiles = (files: File[]) => void handleFiles(ctx(), files);

  const tabLabel =
    w.mode === 'room' ? S.tabLayout.room : w.mode === 'psd' ? S.tabLayout.psd : S.tabLayout.other;
  const layoutDisabled = w.mode === 'image';
  const tab: ViewTab = layoutDisabled ? 'list' : w.tab;

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.shortcutUndo, group: S.shortcutGroup, handler: () => undo() },
    {
      keys: ['mod+shift+z', 'mod+y'],
      label: S.shortcutRedo,
      group: S.shortcutGroup,
      handler: () => redo(),
    },
  ];

  /* ---------- 設定欄 ---------- */

  const globalPanel = (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<RotateCcw />}
          onClick={() => {
            patch({ global: defaultGlobalAdjust() });
            ui.current?.toast({
              title: S.resetGlobalDone,
              tone: 'info',
              replace: true,
              duration: 2500,
            });
          }}
        >
          {S.resetGlobal}
        </Button>
        <IconButton label={S.undo} icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
        <IconButton label={S.redo} icon={<Redo2 />} onClick={redo} disabled={!canRedo} />
      </div>
      <Section title={S.tone} persistKey="psd-studio:tone">
        <ToneControls
          value={st.global}
          ranges={GLOBAL_TONE_RANGES}
          idPrefix="global"
          onChange={(key, v) => updateGlobal((g) => ({ ...g, [key]: v }))}
        />
      </Section>
      <Section title={S.gradient} persistKey="psd-studio:gradient">
        <GradientControls
          name="整體"
          toggleLabel={S.gradientToggle}
          value={st.global.gradient}
          onChange={(gradient) => updateGlobal((g) => ({ ...g, gradient }))}
        />
      </Section>
      <Section title={S.curves} persistKey="psd-studio:curves">
        <CurveControls
          name="整體"
          curves={st.global.curves}
          channel={st.curveChannel}
          onChannel={(curveChannel) => patch({ curveChannel })}
          onChange={(ch, pts) =>
            updateGlobal((g) => ({ ...g, curves: { ...g.curves, [ch]: pts } }))
          }
        />
      </Section>
      <PresetsSection
        current={st.global}
        onApply={(g) => patch({ global: g })}
        toast={(o) => ui.current?.toast(o)}
        confirm={(o) => ui.current?.confirm(o) ?? Promise.resolve(false)}
      />
    </div>
  );

  const exportPanel = (
    <div className="flex flex-col gap-3 pt-3">
      <Field label={S.compress} hint={S.compressHint} layout="inline">
        <Toggle checked={st.compress} onCheckedChange={(compress) => patch({ compress })} />
      </Field>
      <Field label={S.target}>
        <Select
          value={String(st.targetMb)}
          onValueChange={(v) => patch({ targetMb: Number(v) })}
          options={TARGET_CHOICES.map((mb) => ({
            value: String(mb),
            label: S.targetOptions[String(mb)],
          }))}
        />
      </Field>
      <Field label={S.frameSkip} hint={S.frameSkipHint} layout="inline">
        <Toggle checked={st.frameSkip} onCheckedChange={(frameSkip) => patch({ frameSkip })} />
      </Field>
      <Field
        label={S.compressStatic}
        hint={S.compressStaticHint(S.targetOptions[String(st.targetMb)])}
        layout="inline"
      >
        <Toggle
          checked={st.compressStatic}
          onCheckedChange={(compressStatic) => patch({ compressStatic })}
        />
      </Field>
      <Field label={S.loopsGlobal} hint={S.loopsHint}>
        <Select<GlobalLoopMode>
          value={st.loopMode}
          onValueChange={(loopMode) => patch({ loopMode })}
          options={(Object.keys(S.loopOptions) as GlobalLoopMode[]).map((v) => ({
            value: v,
            label: S.loopOptions[v],
          }))}
        />
      </Field>
      <Field label={S.loopCount} hidden={st.loopMode !== 'custom'}>
        <NumberInput
          value={st.loopCount}
          onChange={(v) => patch({ loopCount: loopCount(v) })}
          min={1}
          max={MAX_LOOP_COUNT}
          unit="次"
        />
      </Field>
    </div>
  );

  const settingsColumn = (
    <>
      <Section title={S.selected} persistKey="psd-studio:selected">
        <SelectedSummary
          asset={selected}
          mode={w.mode}
          onOpen={() => selected && openViewer(selected.id)}
          onReset={() => selected && setAssetAdjust(selected.id, null)}
          onResize={(wd, ht) => selected && void resizeAsset(ctx(), selected.id, wd, ht)}
          onPad={() => selected && void padAsset(ctx(), selected.id)}
        />
      </Section>
      <Tabs
        aria-label={S.tabsLabel}
        keepMounted
        items={[
          { value: 'global', label: S.tabGlobal, content: globalPanel },
          { value: 'export', label: S.tabExport, content: exportPanel },
        ]}
      />
    </>
  );

  /* ---------- 預覽欄 ---------- */

  const exportButton = (
    <Button
      variant="primary"
      icon={<Download />}
      disabled={!w.assets.length || busyActive}
      onClick={() => void exportAll(ctx())}
      data-testid="export"
    >
      {S.exportZip(w.mode)}
    </Button>
  );

  const layoutTab = (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ZoomControls />
        <IconButton label={S.fit} icon={<Maximize />} onClick={() => setFitSignal((n) => n + 1)} />
        {w.mode === 'room' ? (
          <span className="ml-1 inline-flex items-center gap-1.5">
            <Grid3x3 aria-hidden className="size-4 text-muted" />
            <Toggle
              checked={st.showGrid}
              onCheckedChange={(showGrid) => patch({ showGrid })}
              label={S.grid}
            />
          </span>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.layoutHint}</p>
      <div className="flex flex-col gap-2 md:relative">
        <div className="relative h-[min(62dvh,600px)] min-h-72 overflow-hidden rounded-lg border border-border bg-surface-2">
          <CameraLayoutView
            mode={w.mode}
            assets={w.assets}
            isVisible={isVisible}
            selectedId={w.selectedId}
            showGrid={st.showGrid}
            room={room}
            psd={w.psd}
            onSelect={select}
            onOpen={openViewer}
            fitSignal={fitSignal}
          />
        </div>
        {panelRows.length ? (
          <LayerPanel
            mode={w.mode}
            rows={panelRows}
            assets={w.assets}
            isVisible={isVisible}
            selectedId={w.selectedId}
            onSelect={select}
            onToggleVisible={(id) => w.updateAsset(id, (a) => ({ ...a, visible: !a.visible }))}
            onToggleSolo={(id) => w.updateAsset(id, (a) => ({ ...a, solo: !a.solo }))}
            onShowAll={() => w.updateAssets((a) => ({ ...a, visible: true }))}
            onHideAll={() => w.updateAssets((a) => ({ ...a, visible: false }))}
            onUnsolo={() => w.updateAssets((a) => ({ ...a, solo: false }))}
          />
        ) : null}
      </div>
    </div>
  );

  const listTab = (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={S.search} className="min-w-40 flex-1">
          <TextInput
            type="search"
            value={w.search}
            placeholder={S.searchPlaceholder}
            onChange={(e) => w.set({ search: e.target.value })}
          />
        </Field>
        <Field label={S.sort} className="w-44">
          <Select<SortKey>
            value={w.sort}
            onValueChange={(sort) => w.set({ sort })}
            options={(Object.keys(S.sortOptions) as SortKey[]).map((v) => ({
              value: v,
              label: S.sortOptions[v],
              disabled: v === 'role' && w.mode !== 'room',
            }))}
          />
        </Field>
        <Tooltip content={S.padAllHint}>
          <Button onClick={() => void padAll(ctx())} data-testid="pad-all">
            {S.padAll}
          </Button>
        </Tooltip>
      </div>
      {listAssets.length ? (
        <AssetGrid
          assets={listAssets}
          mode={w.mode}
          isVisible={isVisible}
          selectedId={w.selectedId}
          onOpen={openViewer}
        />
      ) : (
        <p className="m-0 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {S.listEmptySearch}
        </p>
      )}
    </div>
  );

  const preview = (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <ModeBadge mode={w.mode} />
        <span className="text-sm text-muted" data-testid="stats">
          {S.stats(w.assets.length, w.mode)}
        </span>
        <span
          className="ml-auto min-h-5 text-xs text-accent"
          role="status"
          data-testid="compress-status"
        >
          {status}
        </span>
        {exportButton}
      </div>
      <LoadArea
        onFiles={onFiles}
        active={dragActive}
        extra={
          <Tooltip content={S.clearWorkHint}>
            <Button
              icon={<Trash2 />}
              variant="ghost"
              onClick={() => void clearWork(ctx())}
              disabled={!w.assets.length}
            >
              {S.clearWork}
            </Button>
          </Tooltip>
        }
      />
      {w.assets.length ? (
        <Tabs<ViewTab>
          aria-label={S.viewTabsLabel}
          value={tab}
          onValueChange={(t) => w.set({ tab: t })}
          items={[
            { value: 'layout', label: tabLabel, content: layoutTab, disabled: layoutDisabled },
            { value: 'list', label: S.tabList, content: listTab },
          ]}
        />
      ) : (
        <LoadArea onFiles={onFiles} active={dragActive} big />
      )}
    </>
  );

  /* ---------- 專案選單 ---------- */

  const projectMenu = (
    <ProjectMenu<ProjectData>
      toolId={TOOL_ID}
      fileName={TOOL_ID}
      getData={() => ({
        settings: useSettings.getState().data,
        session: serializeWorkspace(useWorkspace.getState()).session,
      })}
      getFiles={() =>
        serializeWorkspace(useWorkspace.getState()).files.map((f) => ({
          name: f.name,
          data: f.data,
        }))
      }
      onLoad={async (data, _file, files) => {
        if (!data || typeof data !== 'object' || !isSavedSession(data.session))
          throw new Error(S.projectBadData);
        useSettings.getState().replace(sanitizeSettings(data.settings));
        await restoreFrom(ctx(), data.session, async (name) => files.get(name));
      }}
      onReset={() => {
        resetToolStore(useSettings);
        void clearSavedSession().catch(() => {});
        clearThumbs();
        useWorkspace.getState().load(emptyWorkspace());
      }}
      resetText={{
        label: S.projectReset,
        title: S.projectResetTitle,
        description: S.projectResetBody,
      }}
      savedAt={Math.max(savedAt ?? 0, settingsSavedAt ?? 0) || null}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      headerActions={projectMenu}
      shortcuts={shortcuts}
      usage={<Usage />}
      settings={settingsColumn}
      preview={
        <>
          <UiBridge api={ui} />
          <Autosave onSaved={onSaved} onError={onSaveError} />
          {preview}
          <WindowDrop
            onDrop={(files) => onFiles(files)}
            label={S.dropOverlay}
            hint={S.dropOverlayHint}
            disabled={busyActive}
            onActiveChange={setDragActive}
          />
          <Inspector
            open={viewerOpen}
            asset={selected}
            mode={w.mode}
            global={st.global}
            compressOn={st.compress}
            runner={viewRunner}
            onClose={() => setViewerOpen(false)}
            onNavigate={navigate}
            onAdjust={setAssetAdjust}
            onLoop={(id, loopMode, count) =>
              w.updateAsset(id, (a) => ({ ...a, loopMode, loopCount: count }))
            }
            onResize={(id, wd, ht) => void resizeAsset(ctx(), id, wd, ht)}
            onPad={(id) => void padAsset(ctx(), id)}
            onDownload={(id) => void downloadOne(ctx(), id)}
            onTest={(id) => testOne(ctx(), id)}
            status={status}
          />
          <BusyOverlay />
        </>
      }
    />
  );
}

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}
