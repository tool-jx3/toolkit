/**
 * 圖片演出的設定區塊（截圖演出、地圖演出共用）：圖片（載入、範例、拿掉）、畫面（大小、背景）、圖的擺放（大小、圓角、
 * 陰影、聚光）、出處、時間軸（四段秒數、依序／同時、APNG 的影格率）、演出框的清單（序號、圖示、名稱、摘要、上移下移、
 * 複製、刪除、展開的個別設定），以及放大框的設定（倍率、樣式、邊框粗細）與滑桿。
 * 文字由工具提供（同一種控制項在兩個工具裡的名稱可以不同，例如「截圖大小」「地圖大小」）。
 */
import { ArrowDown, ArrowUp, Copy, ImageIcon, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  BASE_RANGES,
  type BaseRangeKey,
  BG_MODES,
  type BgMode,
  BORDERS,
  type Border,
  buildTimeline,
  CANVAS_PRESETS,
  type CanvasPreset,
  CREDIT_POSITIONS,
  CREDIT_SIZES,
  type CreditPos,
  type CreditSize,
  canvasSize,
  FPS_CHOICES,
  type Fps,
  type FrameBase,
  type FxDoc,
  type FxStore,
  kindIndex,
  LIMITS,
  ORDERS,
  type Order,
  PHASES,
  type PhaseId,
  type RangeSpec,
  type RenderKit,
} from '@/core/imagefx';
import { Button, IconButton } from './Button';
import { ColorField } from './ColorField';
import { cn } from './cn';
import { useConfirm } from './Dialog';
import { Field } from './Field';
import { ImageDrop } from './ImageDrop';
import { Notice } from './Notice';
import { Section } from './Section';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Slider } from './Slider';
import { TextInput } from './TextInput';

// biome-ignore lint/suspicious/noExplicitAny: 各工具的框、內容、偏好、分頁型別不同，這裡只用共同的部分
type AnyFxStore = FxStore<any, any, any, any>;

/** 滑桿的數值寫法 */
export const fxRangeText = (r: RangeSpec, v: number): string => {
  const step = r.step;
  return step < 1 ? v.toFixed(String(step).split('.')[1]?.length ?? 1) : String(v);
};

/** 內容的滑桿：拖曳中即時套用，放開才記一步 */
export function FxDocSlider<S extends FxDoc>({
  fx,
  k,
  value,
  set,
  unit,
}: {
  fx: AnyFxStore;
  k: BaseRangeKey;
  value: number;
  set: (d: S, v: number) => void;
  unit?: string;
}) {
  const r = BASE_RANGES[k];
  return (
    <Slider
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      unit={unit}
      precision={r.step < 1 ? (String(r.step).split('.')[1]?.length ?? 1) : 0}
      onChange={fx.gesture.live((v: number) => fx.edit((d: S) => set(d, v)))}
      onCommit={fx.gesture.commit}
      valueText={(v) => `${fxRangeText(r, v)}${unit ?? ''}`}
    />
  );
}

/** 框的設定用的滑桿（值與手勢由呼叫的人處理） */
export function FxRangeSlider({
  range,
  value,
  onChange,
  onCommit,
  unit,
}: {
  range: RangeSpec;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  unit?: string;
}) {
  const r = range;
  return (
    <Slider
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      unit={unit}
      precision={r.step < 1 ? 2 : 0}
      onChange={onChange}
      onCommit={onCommit}
      valueText={(v) => `${fxRangeText(r, v)}${unit ?? ''}`}
    />
  );
}

/* ---------- 圖片 ---------- */

export interface ImageFxImageText {
  sectionImage: string;
  dropArea: string;
  drop: string;
  dropHint: string;
  choose: string;
  change: string;
  current: string;
  imageSize: (w: number, h: number) => string;
  removeImage: string;
  sample: string;
  demo: string;
  sampleHint: string;
  privacy: string;
}

export function ImageFxImageSection({
  fx,
  text,
  onFiles,
  onSample,
}: {
  fx: AnyFxStore;
  text: ImageFxImageText;
  onFiles: (f: File[]) => void;
  onSample: (demo: boolean) => void;
}) {
  const image = fx.useDoc((s: { data: FxDoc }) => s.data.image);
  return (
    <Section title={text.sectionImage} persistKey={`${fx.toolId}:image`}>
      <div data-testid="image-load" data-state={image ? 'loaded' : 'empty'}>
        <ImageDrop
          aria-label={text.dropArea}
          paste="document"
          filterByAccept={false}
          compact={!!image}
          icon={image ? <ImageIcon /> : <ImagePlus />}
          label={
            image ? (
              <span className="flex min-w-0" data-testid="image-name">
                <span className="shrink-0">{text.current}</span>
                <span className="truncate" title={image.name}>
                  {image.name || '—'}
                </span>
              </span>
            ) : (
              text.drop
            )
          }
          hint={text.dropHint}
          buttonLabel={image ? text.change : text.choose}
          onFiles={onFiles}
        />
      </div>
      {image ? (
        <p className="m-0 text-xs text-muted tabular-nums" data-testid="image-size">
          {text.imageSize(image.width, image.height)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<ImagePlus />} onClick={() => onSample(false)}>
          {text.sample}
        </Button>
        <Button size="sm" icon={<Sparkles />} onClick={() => onSample(true)}>
          {text.demo}
        </Button>
        {image ? (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={fx.clearImage}>
            {text.removeImage}
          </Button>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{text.sampleHint}</p>
      <p className="m-0 text-xs text-muted">{text.privacy}</p>
    </Section>
  );
}

/* ---------- 畫面 ---------- */

export interface ImageFxCanvasText {
  sectionCanvas: string;
  canvas: string;
  presets: Record<CanvasPreset, string>;
  presetHints: Record<CanvasPreset, string>;
  outputSize: (w: number, h: number) => string;
  originalHint: string;
  bgMode: string;
  bgModes: Record<BgMode, string>;
  bgHint: Record<BgMode, string>;
  blur: string;
  brightness: string;
  bgColor: string;
}

export function ImageFxCanvasSection({ fx, text }: { fx: AnyFxStore; text: ImageFxCanvasText }) {
  const preset: CanvasPreset = fx.useDoc((s: { data: FxDoc }) => s.data.canvas);
  const image = fx.useDoc((s: { data: FxDoc }) => s.data.image);
  const bg = fx.useDoc((s: { data: FxDoc }) => s.data.bg);
  const size = canvasSize(preset, image);
  const edit = fx.edit as (recipe: (d: FxDoc) => void) => void;
  return (
    <Section title={text.sectionCanvas} persistKey={`${fx.toolId}:canvas`}>
      <Field
        label={text.canvas}
        hint={
          preset === 'original'
            ? `${text.presetHints[preset]}${text.outputSize(size.width, size.height)}。${text.originalHint}`
            : `${text.presetHints[preset]}${text.outputSize(size.width, size.height)}。`
        }
      >
        <Select<CanvasPreset>
          value={preset}
          onValueChange={(v) =>
            edit((d) => {
              d.canvas = v;
            })
          }
          options={CANVAS_PRESETS.map((p) => ({ value: p, label: text.presets[p] }))}
        />
      </Field>
      <Field label={text.bgMode} hint={text.bgHint[bg.mode]}>
        <Segmented
          value={bg.mode}
          onValueChange={(v) =>
            edit((d) => {
              d.bg.mode = v;
            })
          }
          options={BG_MODES.map((m) => ({ value: m, label: text.bgModes[m] }))}
          fullWidth
        />
      </Field>
      {bg.mode === 'blur' ? (
        <>
          <Field label={text.blur}>
            <FxDocSlider<FxDoc>
              fx={fx}
              k="blur"
              value={bg.blur}
              unit=" px"
              set={(d, v) => {
                d.bg.blur = v;
              }}
            />
          </Field>
          <Field label={text.brightness}>
            <FxDocSlider<FxDoc>
              fx={fx}
              k="brightness"
              value={bg.brightness}
              unit="%"
              set={(d, v) => {
                d.bg.brightness = v;
              }}
            />
          </Field>
        </>
      ) : null}
      {bg.mode === 'solid' ? (
        <Field label={text.bgColor}>
          <ColorField
            value={bg.color}
            onChange={(c) =>
              (fx.editMerged as (recipe: (d: FxDoc) => void) => void)((d) => {
                d.bg.color = c.slice(0, 7);
              })
            }
          />
        </Field>
      ) : null}
    </Section>
  );
}

/* ---------- 圖的擺放 ---------- */

export interface ImageFxShotText {
  sectionShot: string;
  scale: string;
  scaleHint: string;
  radius: string;
  shadow: string;
  spotlight: string;
  spotlightHint: string;
}

export function ImageFxShotSection({ fx, text }: { fx: AnyFxStore; text: ImageFxShotText }) {
  const shot = fx.useDoc((s: { data: FxDoc }) => s.data.shot);
  return (
    <Section title={text.sectionShot} persistKey={`${fx.toolId}:shot`}>
      <Field label={text.scale} hint={text.scaleHint}>
        <FxDocSlider<FxDoc>
          fx={fx}
          k="scale"
          value={shot.scale}
          unit="%"
          set={(d, v) => {
            d.shot.scale = v;
          }}
        />
      </Field>
      <Field label={text.radius}>
        <FxDocSlider<FxDoc>
          fx={fx}
          k="radius"
          value={shot.radius}
          unit=" px"
          set={(d, v) => {
            d.shot.radius = v;
          }}
        />
      </Field>
      <Field label={text.shadow}>
        <FxDocSlider<FxDoc>
          fx={fx}
          k="shadow"
          value={shot.shadow}
          set={(d, v) => {
            d.shot.shadow = v;
          }}
        />
      </Field>
      <Field label={text.spotlight} hint={text.spotlightHint}>
        <FxDocSlider<FxDoc>
          fx={fx}
          k="spotlight"
          value={shot.spotlight}
          unit="%"
          set={(d, v) => {
            d.shot.spotlight = v;
          }}
        />
      </Field>
    </Section>
  );
}

/* ---------- 出處 ---------- */

export interface ImageFxCreditText {
  sectionCredit: string;
  creditText: string;
  creditPlaceholder: string;
  creditPos: string;
  creditPositions: Record<CreditPos, string>;
  creditPosHints: Record<CreditPos, string>;
  creditSize: string;
  creditSizes: Record<CreditSize, string>;
}

export function ImageFxCreditSection({ fx, text }: { fx: AnyFxStore; text: ImageFxCreditText }) {
  const credit = fx.useDoc((s: { data: FxDoc }) => s.data.credit);
  const edit = fx.edit as (recipe: (d: FxDoc) => void) => void;
  return (
    <Section title={text.sectionCredit} persistKey={`${fx.toolId}:credit`}>
      <Field label={text.creditText}>
        <TextInput
          value={credit.text}
          maxLength={LIMITS.credit}
          placeholder={text.creditPlaceholder}
          onFocus={fx.gesture.begin}
          onBlur={fx.gesture.commit}
          onChange={(e) => {
            const v = Array.from(e.target.value.replace(/\r?\n|\r/g, ' '))
              .slice(0, LIMITS.credit)
              .join('');
            fx.gesture.live(() =>
              edit((d) => {
                d.credit.text = v;
              }),
            )();
          }}
        />
      </Field>
      <Field label={text.creditPos} hint={text.creditPosHints[credit.pos as CreditPos]}>
        <Select<CreditPos>
          value={credit.pos}
          onValueChange={(v) =>
            edit((d) => {
              d.credit.pos = v;
            })
          }
          options={CREDIT_POSITIONS.map((p) => ({ value: p, label: text.creditPositions[p] }))}
        />
      </Field>
      <Field label={text.creditSize}>
        <Segmented<CreditSize>
          value={credit.size}
          onValueChange={(v) =>
            edit((d) => {
              d.credit.size = v;
            })
          }
          options={CREDIT_SIZES.map((v) => ({ value: v, label: text.creditSizes[v] }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

/* ---------- 時間軸 ---------- */

export interface ImageFxTimingText {
  sectionTiming: string;
  phaseFields: Record<PhaseId, string>;
  phaseHints: Record<PhaseId, string>;
  order: string;
  orders: Record<Order, string>;
  orderHints: Record<Order, string>;
  fps: string;
  fpsHint: string;
  total: (sec: number) => string;
}

export function ImageFxTimingSection<F extends FrameBase>({
  fx,
  kit,
  text,
}: {
  fx: AnyFxStore;
  kit: RenderKit<F>;
  text: ImageFxTimingText;
}) {
  const doc: FxDoc<F> = fx.useDoc((s: { data: FxDoc<F> }) => s.data);
  const timing = doc.timing;
  const total = buildTimeline(doc.timing, doc.frames, kit, doc.camera).total;
  const edit = fx.edit as (recipe: (d: FxDoc) => void) => void;
  return (
    <Section title={text.sectionTiming} persistKey={`${fx.toolId}:timing`}>
      {PHASES.map((p: PhaseId) => (
        <Field key={p} label={text.phaseFields[p]} hint={text.phaseHints[p]}>
          <FxDocSlider<FxDoc>
            fx={fx}
            k={p}
            value={timing[p]}
            unit=" 秒"
            set={(d, v) => {
              d.timing[p] = v;
            }}
          />
        </Field>
      ))}
      <Field label={text.order} hint={text.orderHints[timing.order]}>
        <Segmented<Order>
          value={timing.order}
          onValueChange={(v) =>
            edit((d) => {
              d.timing.order = v;
            })
          }
          options={ORDERS.map((o) => ({ value: o, label: text.orders[o] }))}
          fullWidth
        />
      </Field>
      <Field label={text.fps} hint={text.fpsHint}>
        <Segmented
          value={String(timing.fps)}
          onValueChange={(v) =>
            edit((d) => {
              d.timing.fps = Number(v) as Fps;
            })
          }
          options={FPS_CHOICES.map((f) => ({ value: String(f), label: `${f} fps` }))}
          fullWidth
        />
      </Field>
      <p className="m-0 text-sm tabular-nums" data-testid="timing-total">
        {text.total(total)}
      </p>
    </Section>
  );
}

/* ---------- 放大框的設定（新畫的框的預設與每個框共用） ---------- */

export interface ImageFxZoomText<Style extends string> {
  zoomScale: string;
  zoomStyle: string;
  zoomStyles: Record<Style, string>;
  zoomStyleHints: Record<Style, string>;
  border: string;
  borders: Record<Border, string>;
  borderAria: (b: number) => string;
}

export interface FxZoomProps<Style extends string> {
  scale: number;
  style: Style;
  border: Border;
}

export function ImageFxZoomControls<Style extends string>({
  v,
  set,
  commit,
  styles,
  text,
}: {
  v: FxZoomProps<Style>;
  set: (patch: Partial<FxZoomProps<Style>>, live?: boolean) => void;
  commit: () => void;
  styles: readonly Style[];
  text: ImageFxZoomText<Style>;
}) {
  return (
    <>
      <Field label={text.zoomScale}>
        <FxRangeSlider
          range={BASE_RANGES.zoomScale}
          value={v.scale}
          unit=" 倍"
          onChange={(scale) => set({ scale }, true)}
          onCommit={commit}
        />
      </Field>
      <Field label={text.zoomStyle} hint={text.zoomStyleHints[v.style]}>
        <Select<Style>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={styles.map((z) => ({ value: z, label: text.zoomStyles[z] }))}
        />
      </Field>
      <Field label={text.border}>
        <Segmented
          value={String(v.border)}
          onValueChange={(b) => set({ border: Number(b) as Border })}
          options={BORDERS.map((b) => ({
            value: String(b),
            label: text.borders[b],
            ariaLabel: `${text.borders[b]}（${text.borderAria(b)}）`,
          }))}
          fullWidth
        />
      </Field>
    </>
  );
}

/* ---------- 演出框的清單 ---------- */

export interface ImageFxFramesText {
  sectionFrames: (n: number) => string;
  listLabel: string;
  framesEmpty: string;
  framesNeedImage: string;
  frameLimit: (n: number) => string;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  remove: string;
  clearAll: string;
  clearAllTitle: string;
  clearAllDesc: string;
}

function FrameRow<F extends FrameBase>({
  fx,
  frame,
  index,
  count,
  name,
  icon,
  summary,
  editor,
  text,
}: {
  fx: AnyFxStore;
  frame: F;
  index: number;
  count: number;
  name: string;
  icon: ReactNode;
  summary: string;
  editor: ReactNode;
  text: ImageFxFramesText;
}) {
  const selected: boolean = fx.useLive((l) => l.selected === frame.id);
  return (
    <li
      className={cn('rounded-md border bg-surface-2', selected ? 'border-accent' : 'border-border')}
      data-frame-id={frame.id}
      data-kind={frame.kind}
      data-selected={selected || undefined}
    >
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left outline-none focus-visible:focus-ring"
          aria-pressed={selected}
          onClick={() => fx.select(selected ? null : frame.id)}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold tabular-nums">
            {index + 1}
          </span>
          <span aria-hidden className="shrink-0 text-muted [&_svg]:size-4">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted">{summary}</span>
          </span>
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          label={`${text.moveUp}：${name}`}
          icon={<ArrowUp />}
          disabled={index === 0}
          onClick={() => fx.moveFrame(frame.id, -1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${text.moveDown}：${name}`}
          icon={<ArrowDown />}
          disabled={index === count - 1}
          onClick={() => fx.moveFrame(frame.id, 1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${text.duplicate}：${name}`}
          icon={<Copy />}
          disabled={count >= LIMITS.frames}
          onClick={() => fx.duplicate(frame.id)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${text.remove}：${name}`}
          icon={<Trash2 />}
          onClick={() => fx.removeFrame(frame.id)}
        />
      </div>
      {selected ? editor : null}
    </li>
  );
}

/** 演出框的清單；選取的那一列展開 editor(frame) */
export function ImageFxFramesSection<F extends FrameBase>({
  fx,
  text,
  frameName,
  icon,
  summary,
  editor,
  notes,
}: {
  fx: AnyFxStore;
  text: ImageFxFramesText;
  /** 框的名稱（預設：種類名稱＋同種類的序號，由呼叫的人組） */
  frameName: (f: F, frames: readonly F[]) => string;
  icon: (f: F) => ReactNode;
  summary: (f: F) => string;
  editor: (f: F) => ReactNode;
  /** 清單下方的注意事項 */
  notes: readonly ReactNode[];
}) {
  const frames: F[] = fx.useDoc((s: { data: FxDoc<F> }) => s.data.frames);
  const hasImage: boolean = fx.useDoc((s: { data: FxDoc }) => !!s.data.image);
  const confirm = useConfirm();
  return (
    <Section
      title={text.sectionFrames(frames.length)}
      persistKey={`${fx.toolId}:frames`}
      actions={
        frames.length ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={async () => {
              if (
                await confirm({
                  title: text.clearAllTitle,
                  description: text.clearAllDesc,
                  danger: true,
                  confirmLabel: text.clearAll,
                })
              )
                fx.clearFrames();
            }}
          >
            {text.clearAll}
          </Button>
        ) : null
      }
    >
      {frames.length ? (
        <ol
          className="m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label={text.listLabel}
          data-testid="frame-list"
        >
          {frames.map((f, i) => (
            <FrameRow
              key={f.id}
              fx={fx}
              frame={f}
              index={i}
              count={frames.length}
              name={frameName(f, frames)}
              icon={icon(f)}
              summary={summary(f)}
              editor={editor(f)}
              text={text}
            />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted" data-testid="frames-empty">
          {hasImage ? text.framesEmpty : text.framesNeedImage}
        </p>
      )}
      {frames.length >= LIMITS.frames ? (
        <Notice tone="warning">{text.frameLimit(LIMITS.frames)}</Notice>
      ) : null}
      <ul className="m-0 flex flex-col gap-1 pl-4 text-xs text-muted">
        {notes.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定的說明
          <li key={i}>{n}</li>
        ))}
      </ul>
    </Section>
  );
}

/** 「種類名稱＋同種類的序號」（例「放大框 2」） */
export const fxFrameName = <F extends FrameBase>(
  kinds: Record<string, string>,
  f: F,
  frames: readonly F[],
): string => `${kinds[f.kind]} ${kindIndex(frames, f.id)}`;
