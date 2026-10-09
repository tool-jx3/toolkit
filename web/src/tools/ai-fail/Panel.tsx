/**
 * 設定欄：照片（載入、放大、重設位置）、圖片比例、框（模式）、選取的框、框的清單、標籤字型。
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  FontPicker,
  GestureScope,
  IconButton,
  Section,
  Segmented,
  Slider,
  SortableList,
  TextInput,
} from '@/ui';
import {
  ASPECT_IDS,
  type AspectId,
  canvasSize,
  clipLabel,
  DEFAULT_COLOR,
  FONT_RANGE,
  LABEL_ALIGNS,
  LABEL_MAX,
  LABEL_POSITIONS,
  type LabelAlign,
  type LabelPos,
  LINE_RANGE,
  listToDraw,
  type MemeBox,
  ZOOM_RANGE,
} from './model';
import {
  edit,
  gesture,
  moveBoxLayer,
  patchBox,
  removeBox,
  resetView,
  select,
  selectedBox,
  setAspect,
  setZoom,
  useMeme,
  useUi,
} from './store';
import { S } from './strings';

/** 色彩欄的常用色：預設綠在第一個，其餘是醒目的辨識框顏色 */
const SWATCHES = [
  DEFAULT_COLOR,
  '#ff3b30',
  '#ff9500',
  '#ffd60a',
  '#00c7be',
  '#0a84ff',
  '#bf5af2',
  '#ff2d92',
  '#ffffff',
  '#000000',
] as const;

const ALIGN_ICON: Record<LabelAlign, ReactNode> = {
  left: <AlignLeft />,
  center: <AlignCenter />,
  right: <AlignRight />,
};

export function PhotoSection({
  onFiles,
  onReject,
}: {
  onFiles: (files: File[]) => void;
  onReject: (files: File[]) => void;
}) {
  const photo = useMeme((s) => s.data.photo);
  const zoom = useMeme((s) => s.data.view.zoom);
  return (
    <Section title={S.sectionPhoto}>
      <div data-testid="load-area" data-state={photo ? 'loaded' : 'empty'}>
        <FileDrop
          aria-label={S.dropAreaLabel}
          accept="image/*"
          paste="document"
          compact={!!photo}
          icon={photo ? <ImageIcon /> : <ImagePlus />}
          label={
            photo ? (
              <span className="flex min-w-0" data-testid="photo-name">
                <span className="shrink-0">{S.loadedPrefix}</span>
                <span className="truncate" title={photo.name}>
                  {photo.name || '—'}
                </span>
              </span>
            ) : (
              S.dropLabel
            )
          }
          hint={photo ? S.loadedHint : S.dropHint}
          buttonLabel={photo ? S.changePhoto : S.choosePhoto}
          onFiles={onFiles}
          onReject={onReject}
        />
      </div>
      <Field label={S.zoom} hint={S.zoomHint}>
        <Slider
          value={zoom}
          min={ZOOM_RANGE.min}
          max={ZOOM_RANGE.max}
          step={ZOOM_RANGE.step}
          precision={2}
          unit={S.zoomUnit}
          disabled={!photo}
          onChange={gesture.live(setZoom)}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<RotateCcw />} onClick={resetView} disabled={!photo}>
          {S.resetView}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.privacy}</p>
    </Section>
  );
}

export function AspectSection() {
  const aspect = useMeme((s) => s.data.aspect);
  const photo = useMeme((s) => s.data.photo);
  const size = canvasSize(aspect, photo);
  return (
    <Section title={S.sectionAspect}>
      <Field
        label={S.aspect}
        hint={<span data-testid="aspect-hint">{S.aspectHint(size.width, size.height)}</span>}
      >
        <Segmented<AspectId>
          value={aspect}
          onValueChange={setAspect}
          options={ASPECT_IDS.map((a) => ({
            value: a,
            label: S.aspects[a],
            ariaLabel: S.aspectAria[a],
          }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

export function SelectedSection() {
  const selectedId = useUi((s) => s.selectedId);
  const box = useMeme((s) => selectedBox(s.data, selectedId));
  if (!box) return null;
  const set = (patch: Partial<Omit<MemeBox, 'id'>>) => patchBox(box.id, patch);
  return (
    <Section title={S.sectionSelected}>
      <div className="flex flex-col gap-3" data-testid="selected-panel" data-box={box.id}>
        <Field label={S.label} hint={S.labelHint(Array.from(box.label).length, LABEL_MAX)}>
          <TextInput
            value={box.label}
            maxLength={LABEL_MAX}
            placeholder={S.labelPlaceholder}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => set({ label: clipLabel(e.target.value) })}
          />
        </Field>
        <Field label={S.color} hint={S.colorHint}>
          <GestureScope gesture={gesture}>
            <ColorField
              value={box.color}
              swatches={SWATCHES}
              onChange={(v) => set({ color: v.slice(0, 7).toLowerCase() })}
            />
          </GestureScope>
        </Field>
        <Field label={S.lineWidth}>
          <Slider
            value={box.lineWidth}
            min={LINE_RANGE.min}
            max={LINE_RANGE.max}
            step={1}
            unit="px"
            inputMax={100}
            onChange={gesture.live((v: number) => set({ lineWidth: v }))}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.fontSize}>
          <Slider
            value={box.fontSize}
            min={FONT_RANGE.min}
            max={FONT_RANGE.max}
            step={1}
            unit="px"
            inputMin={1}
            inputMax={400}
            onChange={gesture.live((v: number) => set({ fontSize: v }))}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.align}>
          <Segmented<LabelAlign>
            value={box.align}
            onValueChange={(v) => set({ align: v })}
            options={LABEL_ALIGNS.map((a) => ({
              value: a,
              label: S.aligns[a],
              icon: ALIGN_ICON[a],
            }))}
            fullWidth
          />
        </Field>
        <Field label={S.labelPos} hint={S.labelPosHint}>
          <Segmented<LabelPos>
            value={box.labelPos}
            onValueChange={(v) => set({ labelPos: v })}
            options={LABEL_POSITIONS.map((p) => ({ value: p, label: S.labelPositions[p] }))}
            fullWidth
          />
        </Field>
        <div>
          <Button variant="danger" icon={<Trash2 />} onClick={() => removeBox(box.id)}>
            {S.deleteBox}
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function ListSection() {
  const boxes = useMeme((s) => s.data.boxes);
  const selectedId = useUi((s) => s.selectedId);
  const n = boxes.length;
  /* 清單上層在前：第 i 列＝畫的順序 n − 1 − i */
  const rows = boxes.map((b, i) => ({ box: b, number: i + 1 })).reverse();
  return (
    <Section title={S.sectionList}>
      {n > 1 ? <p className="m-0 text-xs text-muted">{S.listHint}</p> : null}
      <SortableList
        aria-label={S.listLabel}
        items={rows}
        getId={(r) => r.box.id}
        selectedId={selectedId}
        onSelect={(id) => select(id)}
        onMove={(from, to) => moveBoxLayer(listToDraw(n, from), listToDraw(n, to))}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        empty={S.listEmpty}
        renderItem={({ box, number }, { index }) => {
          const name = box.label.trim() ? box.label : S.noLabel;
          const rowName = S.rowName(name, number);
          return (
            <div className="flex min-h-12 items-center gap-2 px-2 py-1" data-box-row={box.id}>
              <span
                data-drag-handle
                aria-hidden
                className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
              >
                <GripVertical />
              </span>
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full border border-border-strong"
                style={{ background: box.color }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={
                    box.label.trim() ? 'truncate text-sm text-fg' : 'truncate text-sm text-muted'
                  }
                  title={box.label}
                >
                  {name}
                </span>
                <span className="flex gap-2 text-xs text-muted tabular-nums">
                  <span>{S.boxNumber(number)}</span>
                  <span data-testid="box-size">
                    {S.boxSize(Math.round(box.width), Math.round(box.height))}
                  </span>
                </span>
              </div>
              <div className="flex shrink-0">
                <IconButton
                  size="sm"
                  label={`${S.forward}：${rowName}`}
                  icon={<ArrowUp />}
                  disabled={index === 0}
                  onClick={() => moveBoxLayer(listToDraw(n, index), listToDraw(n, index) + 1)}
                />
                <IconButton
                  size="sm"
                  label={`${S.backward}：${rowName}`}
                  icon={<ArrowDown />}
                  disabled={index === n - 1}
                  onClick={() => moveBoxLayer(listToDraw(n, index), listToDraw(n, index) - 1)}
                />
                <IconButton
                  size="sm"
                  label={`${S.remove}：${rowName}`}
                  icon={<Trash2 />}
                  onClick={() => removeBox(box.id)}
                />
              </div>
            </div>
          );
        }}
      />
    </Section>
  );
}

export function FontSection() {
  const font = useMeme((s) => s.data.font);
  return (
    <Section title={S.sectionFont}>
      <Field label={S.font} hint={S.fontHint}>
        <FontPicker
          value={font}
          previewText={S.fontPreview}
          onChange={(v) =>
            edit((d) => {
              d.font = { ...v };
            })
          }
        />
      </Field>
    </Section>
  );
}
