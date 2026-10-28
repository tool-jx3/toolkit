import { Download, LayoutGrid, Palette, Plus, Redo2, Scissors, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { splitImageFiles } from '@/core/assets';
import { downloadBlob } from '@/core/files';
import { resetToolStore, useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  IconButton,
  Notice,
  type NoticeTone,
  NumberInput,
  ProjectMenu,
  Section,
  Segmented,
  type Shortcut,
  Slider,
  Stage,
  Toggle,
  ToolShell,
  UsageSection,
  useToast,
  WindowDrop,
} from '@/ui';
import { AddFlow } from './AddFlow';
import { BarCard } from './BarCard';
import { CharacterDialog } from './CharacterDialog';
import { roomLeft } from './characters';
import { openEditor, startJob, useFlow } from './flow';
import { Handles } from './Handles';
import {
  FILE_CROP,
  FILE_FULL,
  imageIds,
  layoutPalette,
  MAX_BARS,
  RANGE,
  type Settings,
  tooLarge,
} from './logic';
import { PickerDialog, type PickerHandle } from './PickerDialog';
import { importProject, projectFiles } from './project';
import { canvasToPng, drawPalette, renderCrop, renderFull } from './render';
import { ShelfPreview, ShelfSettings } from './ShelfView';
import {
  actions,
  assets,
  DATA_VERSION,
  referencedImages,
  setMode,
  settingsNow,
  TOOL_ID,
  useSettings,
  useView,
  type ViewMode,
} from './store';
import { S } from './strings';

interface Status {
  tone: NoticeTone;
  text: string;
}

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __colorPalette?: unknown;
  }
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
      <p className="mt-2 font-semibold">{S.usageShelfTitle}</p>
      <ul>
        {S.usageShelf.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

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
 * 拖進視窗、貼上的圖片（色票櫃：新增角色）。要在 ToolShell 裡面用（通知）。
 */
function useIncoming(mode: ViewMode) {
  const toast = useToast();
  return useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const { images, others } = await splitImageFiles(files);
      if (others.length)
        toast({ title: S.notImage(others.map((f) => f.name).join('、')), tone: 'warning' });
      if (!images.length) return;
      if (mode === 'shelf') {
        if (!roomLeft(settingsNow().bars)) {
          toast({ title: S.listFull(MAX_BARS), tone: 'warning' });
          return;
        }
        startJob({ kind: 'add', files: images });
      }
    },
    [mode, toast],
  );
}

/** 拖進視窗、貼上的圖片（色票櫃）；有對話框開著時不收 */
function Incoming({ mode, disabled }: { mode: ViewMode; disabled: boolean }) {
  const take = useIncoming(mode);
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('input,textarea,[contenteditable="true"],[role="dialog"]')) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void take(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [take, disabled]);
  return (
    <WindowDrop
      accept="image/*"
      disabled={disabled}
      label={S.windowDrop}
      hint={S.windowDropHint}
      onDrop={(files) => void take(files)}
    />
  );
}

/** 呈現方式（配色條／色票櫃） */
function ModeSwitch({ mode }: { mode: ViewMode }) {
  return (
    <Segmented<ViewMode>
      aria-label={S.viewLabel}
      value={mode}
      onValueChange={setMode}
      fullWidth
      options={[
        { value: 'bar', label: S.modes.bar, ariaLabel: S.modeAria.bar, icon: <Palette /> },
        { value: 'shelf', label: S.modes.shelf, ariaLabel: S.modeAria.shelf, icon: <LayoutGrid /> },
      ]}
    />
  );
}

export function App() {
  const s = useSettings((st) => st.data);
  const mode = useView((st) => st.data.mode);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const flowBusy = useFlow((st) => !!st.job || !!st.editing);
  const [shelfStatus, setShelfStatus] = useState<{
    tone: 'success' | 'warning' | 'danger';
    text: string;
  } | null>(null);
  const hasImages = imageIds(s).length > 0;
  useAssetCleanup();
  /* 預覽倍率與畫布把手是畫面狀態，不存、不列入復原 */
  const [zoom, setZoom] = useState(1);
  const [handles, setHandles] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState<'full' | 'crop' | null>(null);
  const picker = useRef<PickerHandle>(null);

  const layout = useMemo(() => layoutPalette(s), [s]);
  /* 畫布太大：不畫預覽、兩種儲存都停用；只有裁邊範圍太大（手動的小畫布）：只停用裁邊儲存 */
  const big = tooLarge(layout);
  const bigCrop = tooLarge(layout.crop);
  const n = s.bars.length;

  useEffect(() => {
    window.__colorPalette = { useSettings, useView, useFlow, layoutPalette, assets, openEditor };
  }, []);

  /* ---------- 預覽畫布（與儲存用同一段繪圖程式） ---------- */

  const canvas = useRef<HTMLCanvasElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換回配色條時畫布是新的，要重畫
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || big) return;
    const ctx = c.getContext('2d');
    if (ctx) drawPalette(ctx, layout, s.background);
  }, [layout, s.background, big, mode]);

  /* ---------- 儲存（F23～F25） ---------- */

  const save = async (kind: 'full' | 'crop') => {
    if (saving) return;
    const data = useSettings.getState().data;
    const lay = layoutPalette(data);
    if (!data.bars.length || !lay.crop) {
      setStatus({ tone: 'warning', text: S.noBars });
      return;
    }
    if (tooLarge(lay) || (kind === 'crop' && tooLarge(lay.crop))) return;
    const name = kind === 'full' ? FILE_FULL : FILE_CROP;
    setSaving(kind);
    try {
      const full = renderFull(lay, data.background);
      const out = kind === 'full' ? full : renderCrop(full, lay.crop, data.background);
      downloadBlob(await canvasToPng(out), name);
      setStatus({ tone: 'success', text: S.saved(name) });
    } catch {
      setStatus({ tone: 'danger', text: S.saveError });
    } finally {
      setSaving(null);
    }
  };

  /* ---------- 快捷鍵與頁首 ---------- */

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
  ];

  const headerActions = (
    <>
      <IconButton label={S.undo} icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
      <IconButton label={S.redo} icon={<Redo2 />} onClick={redo} disabled={!canRedo} />
      <ProjectMenu<Settings>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => useSettings.getState().data}
        /* 有圖片（角色的立繪）時存成 ZIP；沒有時和以前一樣是 JSON */
        getFiles={hasImages ? projectFiles : undefined}
        openAccept=".zip,.json,application/zip,application/json"
        openedMessage={S.projectOpened}
        onLoad={async (d, _project, files) => {
          /* 不是配色條的資料：丟出的錯誤訊息照原文顯示 */
          const r = await importProject(d, files);
          useSettings.getState().replace(r.settings);
          clear();
          return { warnings: [r.notSaved ? S.imageNotSaved : ''] };
        }}
        /* 全部重來可以復原（復原紀錄不清掉） */
        onReset={() => resetToolStore(useSettings, { clearHistory: false })}
        savedAt={savedAt}
        statusText={saveError ? S.saveFailed : undefined}
        fileName={S.projectFile}
        resetText={{
          label: S.resetLabel,
          title: S.resetTitle,
          description: S.resetDescription,
        }}
      />
    </>
  );

  /* ---------- 設定面板 ---------- */

  const usage = <Usage />;

  const barSettings = (
    <>
      <Section
        title={
          <>
            {S.sectionBars}{' '}
            <span className="text-xs font-normal text-muted tabular-nums" data-testid="bar-count">
              {S.barCount(n, MAX_BARS)}
            </span>
          </>
        }
        fixed
        description={S.dragHint}
        actions={
          <Button
            size="sm"
            variant="primary"
            icon={<Plus />}
            disabled={n >= MAX_BARS}
            title={n >= MAX_BARS ? S.addBarFull(MAX_BARS) : undefined}
            onClick={actions.addBar}
          >
            {S.addBar}
          </Button>
        }
      >
        {n ? (
          s.bars.map((bar, i) => (
            <BarCard
              key={bar.id}
              bar={bar}
              index={i}
              highlight={handles}
              onPick={(b, index) => picker.current?.open({ barId: b.id, number: index + 1 })}
              onEdit={(b) => openEditor(b.id)}
            />
          ))
        ) : (
          <p className="m-0 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            {S.barsEmpty}
          </p>
        )}
      </Section>
      <Section title={S.sectionCanvas} fixed>
        <Field label={S.background}>
          <ColorField
            value={s.background}
            onChange={(background) => actions.patch({ background })}
          />
        </Field>
        <FieldRow>
          <Field label={S.thickness}>
            <NumberInput
              value={s.thickness}
              onChange={(thickness) => actions.patch({ thickness })}
              min={RANGE.thickness.min}
              max={RANGE.thickness.max}
              step={1}
              precision={2}
              unit="px"
            />
          </Field>
          <Field label={S.padding}>
            <NumberInput
              value={s.padding}
              onChange={(padding) => actions.patch({ padding })}
              min={RANGE.padding.min}
              max={RANGE.padding.max}
              step={1}
              precision={2}
              unit="px"
            />
          </Field>
        </FieldRow>
        <p className="m-0 -mt-1 text-xs text-muted">{S.thicknessPaddingHint}</p>
        <FieldRow>
          <Field label={S.baseLength}>
            <NumberInput
              value={s.baseLength}
              onChange={(baseLength) => actions.patch({ baseLength })}
              min={RANGE.baseLength.min}
              max={RANGE.baseLength.max}
              step={1}
              precision={2}
              unit="px"
            />
          </Field>
          <Field label={S.baseScale}>
            <NumberInput
              value={s.baseScale}
              onChange={(baseScale) => actions.patch({ baseScale })}
              min={RANGE.baseScale.min}
              step={0.1}
              precision={2}
            />
          </Field>
        </FieldRow>
        <p className="m-0 -mt-1 text-xs text-muted">{S.baseHint}</p>
        <Field label={S.autoSize} hint={S.autoSizeHint} layout="inline">
          <Toggle
            checked={s.autoSize}
            onCheckedChange={(autoSize) => actions.patch({ autoSize })}
          />
        </Field>
        <FieldRow>
          <Field label={S.canvasWidth}>
            <NumberInput
              value={s.width}
              onChange={(width) => actions.patch({ width })}
              min={RANGE.canvas.min}
              max={RANGE.canvas.max}
              step={1}
              unit="px"
              disabled={s.autoSize}
            />
          </Field>
          <Field label={S.canvasHeight}>
            <NumberInput
              value={s.height}
              onChange={(height) => actions.patch({ height })}
              min={RANGE.canvas.min}
              max={RANGE.canvas.max}
              step={1}
              unit="px"
              disabled={s.autoSize}
            />
          </Field>
        </FieldRow>
        <p className="m-0 -mt-1 text-xs text-muted">{S.manualHint}</p>
      </Section>
    </>
  );

  const settings = (
    <>
      {mode === 'shelf' ? <ShelfSettings onStatus={setShelfStatus} /> : barSettings}
      <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
    </>
  );

  /* ---------- 預覽 ---------- */

  const barPreview = (
    <>
      <div className="grid items-end gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label={S.previewZoom}>
          <Slider
            value={Math.round(zoom * 100)}
            onChange={(v) => setZoom(v / 100)}
            min={RANGE.previewZoom.min}
            max={RANGE.previewZoom.max}
            step={RANGE.previewZoom.step}
            unit="%"
          />
        </Field>
        <Field label={S.handles} layout="inline" className="pb-1.5">
          <Toggle checked={handles} onCheckedChange={setHandles} />
        </Field>
      </div>
      {!big && bigCrop && layout.crop ? (
        <Notice tone="warning">
          <span data-testid="too-large">
            {S.cropTooLarge(layout.crop.width, layout.crop.height)}
          </span>
        </Notice>
      ) : null}
      {big ? (
        <Notice tone="warning">
          <span data-testid="too-large">{S.tooLarge(layout.width, layout.height)}</span>
        </Notice>
      ) : (
        <Stage
          width={layout.width}
          height={layout.height}
          toolbar={false}
          zoom={zoom}
          onZoomChange={(z) => setZoom(typeof z === 'number' ? z : 1)}
          wheelLinear={0.5}
          zoomRange={[RANGE.previewZoom.min / 100, RANGE.previewZoom.max / 100]}
          aria-label={S.stageLabel}
          viewportClassName="h-[min(60dvh,560px)]"
        >
          <canvas
            ref={canvas}
            width={layout.width}
            height={layout.height}
            className="block size-full"
            data-testid="palette-canvas"
          />
          {handles ? (
            <Handles
              bars={s.bars}
              layouts={layout.bars}
              thickness={s.thickness}
              onChange={({ barId, pair, ratios }) => actions.setPair(barId, pair, ratios)}
              onDragStart={useSettings.beginGesture}
              onDragEnd={useSettings.endGesture}
            />
          ) : null}
        </Stage>
      )}
      <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
        <span data-testid="canvas-size">{S.sizeInfo(layout.width, layout.height)}</span>
        {layout.crop ? (
          <span data-testid="crop-size">{S.cropInfo(layout.crop.width, layout.crop.height)}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          loading={saving === 'full'}
          disabled={big || saving !== null}
          onClick={() => void save('full')}
        >
          {S.saveFull}
        </Button>
        <Button
          icon={<Scissors />}
          loading={saving === 'crop'}
          disabled={big || bigCrop || saving !== null}
          onClick={() => void save('crop')}
        >
          {S.saveCrop}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.saveHint}</p>
      {status ? (
        <Notice tone={status.tone}>
          <span data-testid="status-text">{status.text}</span>
        </Notice>
      ) : null}
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3">
      <ModeSwitch mode={mode} />
      {mode === 'shelf' ? (
        <ShelfPreview status={shelfStatus} onStatus={setShelfStatus} />
      ) : (
        barPreview
      )}
      {/* 取色視窗、角色的編輯視窗、新增角色的流程（Portal；放在 ToolShell 裡才拿得到 UiProvider） */}
      <PickerDialog
        ref={picker}
        onApply={(barId, picks) => {
          actions.replaceSegments(barId, picks);
          const index = useSettings.getState().data.bars.findIndex((b) => b.id === barId);
          setStatus({ tone: 'success', text: S.applied(index + 1, picks.length) });
        }}
      />
      <CharacterDialog />
      <AddFlow />
      {mode === 'shelf' ? <Incoming mode={mode} disabled={flowBusy} /> : null}
    </div>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={settings}
      preview={preview}
    />
  );
}
