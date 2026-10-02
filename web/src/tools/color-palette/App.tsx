import { Download, Plus, Redo2, Scissors, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
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
  type Shortcut,
  Slider,
  Stage,
  Toggle,
  ToolShell,
  UsageSection,
} from '@/ui';
import { BarCard } from './BarCard';
import { Handles } from './Handles';
import {
  FILE_CROP,
  FILE_FULL,
  layoutPalette,
  MAX_BARS,
  RANGE,
  type Settings,
  sanitizeSettings,
  tooLarge,
} from './logic';
import { PickerDialog, type PickerHandle } from './PickerDialog';
import { canvasToPng, drawPalette, renderCrop, renderFull } from './render';
import { actions, TOOL_ID, useSettings } from './store';
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
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

export function App() {
  const s = useSettings((st) => st.data);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
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
    window.__colorPalette = { useSettings, layoutPalette };
  }, []);

  /* ---------- 預覽畫布（與儲存用同一段繪圖程式） ---------- */

  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || big) return;
    const ctx = c.getContext('2d');
    if (ctx) drawPalette(ctx, layout, s.background);
  }, [layout, s.background, big]);

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
        getData={() => useSettings.getState().data}
        onLoad={(d) => {
          /* 不是配色條的資料：回傳 false，ProjectMenu 會顯示錯誤 */
          if (!d || typeof d !== 'object' || !Array.isArray((d as Partial<Settings>).bars))
            return false;
          useSettings.getState().replace(sanitizeSettings(d));
          clear();
          return true;
        }}
        onReset={() => resetToolStore(useSettings)}
        savedAt={savedAt}
        fileName="配色條"
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

  const settings = (
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
      <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
    </>
  );

  /* ---------- 預覽 ---------- */

  const preview = (
    <div className="flex flex-col gap-3">
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
              onChange={({ barId, k, ratios }) => actions.setPair(barId, k, ratios)}
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
      {/* 取色視窗（Portal；放在 ToolShell 裡才拿得到 UiProvider） */}
      <PickerDialog
        ref={picker}
        onApply={(barId, picks) => {
          actions.replaceSegments(barId, picks);
          const index = useSettings.getState().data.bars.findIndex((b) => b.id === barId);
          setStatus({ tone: 'success', text: S.applied(index + 1, picks.length) });
        }}
      />
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
