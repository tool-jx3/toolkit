/**
 * 設定欄（規格 1.1～1.5）：三個分頁——圖片（截圖、畫面、背景、截圖的擺放、出處）、
 * 演出框（新畫的框的預設、框的清單與每個框的設定）、時間軸（四段秒數、依序／同時、APNG 的影格率）。
 */
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Highlighter,
  ImageIcon,
  ImagePlus,
  Sparkles,
  SquareDashed,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  ColorField,
  cn,
  Field,
  IconButton,
  ImageDrop,
  Notice,
  Section,
  Segmented,
  Select,
  Slider,
  Tabs,
  TextInput,
  useConfirm,
} from '@/ui';
import {
  BG_MODES,
  BORDERS,
  buildTimeline,
  CANVAS_PRESETS,
  type CanvasPreset,
  CREDIT_POSITIONS,
  CREDIT_SIZES,
  type CreditPos,
  type CreditSize,
  canvasSize,
  DIRS,
  type Dir,
  FPS_CHOICES,
  type Fps,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  type FxState,
  isHighlight,
  kindIndex,
  LIMITS,
  MARKER_STYLES,
  type MarkerFrame,
  type MarkerStyle,
  ORDERS,
  type Order,
  PHASES,
  type PhaseId,
  RANGES,
  type RangeKey,
  REDACT_MODES,
  REDACT_STYLES,
  type RedactFrame,
  type RedactMode,
  type RedactStyle,
  ZOOM_STYLES,
  type ZoomFrame,
  type ZoomStyle,
} from './model';
import {
  clearFrames,
  clearImage,
  duplicate,
  edit,
  gesture,
  moveFrame,
  type PanelTab,
  removeFrame,
  select,
  setDefaults,
  updateFrame,
  useDoc,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';

const KIND_ICON: Record<FrameKind, ReactNode> = {
  zoom: <ZoomIn />,
  marker: <Highlighter />,
  redact: <SquareDashed />,
};

/** 滑桿的數值寫法 */
const fmt = (key: RangeKey, v: number) => {
  const step = RANGES[key].step;
  return step < 1 ? v.toFixed(String(step).split('.')[1]?.length ?? 1) : String(v);
};

/** 內容的滑桿：拖曳中即時套用，放開才記一步 */
function DocSlider({
  k,
  value,
  set,
  unit,
}: {
  k: RangeKey;
  value: number;
  set: (d: FxState, v: number) => void;
  unit?: string;
}) {
  const r = RANGES[k];
  return (
    <Slider
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      unit={unit}
      precision={r.step < 1 ? (String(r.step).split('.')[1]?.length ?? 1) : 0}
      onChange={gesture.live((v: number) => edit((d) => set(d, v)))}
      onCommit={gesture.commit}
      valueText={(v) => `${fmt(k, v)}${unit ?? ''}`}
    />
  );
}

/* ---------- 圖片 ---------- */

function ImageSection({
  onFiles,
  onSample,
}: {
  onFiles: (f: File[]) => void;
  onSample: (demo: boolean) => void;
}) {
  const image = useDoc((s) => s.data.image);
  return (
    <Section title={S.sectionImage} persistKey="screenshot-fx:image">
      <div data-testid="image-load" data-state={image ? 'loaded' : 'empty'}>
        <ImageDrop
          aria-label={S.dropArea}
          paste="document"
          filterByAccept={false}
          compact={!!image}
          icon={image ? <ImageIcon /> : <ImagePlus />}
          label={
            image ? (
              <span className="flex min-w-0" data-testid="image-name">
                <span className="shrink-0">{S.current}</span>
                <span className="truncate" title={image.name}>
                  {image.name || '—'}
                </span>
              </span>
            ) : (
              S.drop
            )
          }
          hint={S.dropHint}
          buttonLabel={image ? S.change : S.choose}
          onFiles={onFiles}
        />
      </div>
      {image ? (
        <p className="m-0 text-xs text-muted tabular-nums" data-testid="image-size">
          {S.imageSize(image.width, image.height)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<ImagePlus />} onClick={() => onSample(false)}>
          {S.sample}
        </Button>
        <Button size="sm" icon={<Sparkles />} onClick={() => onSample(true)}>
          {S.demo}
        </Button>
        {image ? (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={clearImage}>
            {S.removeImage}
          </Button>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.sampleHint}</p>
      <p className="m-0 text-xs text-muted">{S.privacy}</p>
    </Section>
  );
}

function CanvasSection() {
  const preset = useDoc((s) => s.data.canvas);
  const image = useDoc((s) => s.data.image);
  const bg = useDoc((s) => s.data.bg);
  const size = canvasSize(preset, image);
  return (
    <Section title={S.sectionCanvas} persistKey="screenshot-fx:canvas">
      <Field
        label={S.canvas}
        hint={
          preset === 'original'
            ? `${S.outputSize(size.width, size.height)}。${S.originalHint}`
            : S.outputSize(size.width, size.height)
        }
      >
        <Select<CanvasPreset>
          value={preset}
          onValueChange={(v) =>
            edit((d) => {
              d.canvas = v;
            })
          }
          options={CANVAS_PRESETS.map((p) => ({ value: p, label: S.presets[p] }))}
        />
      </Field>
      <Field label={S.bgMode} hint={S.bgHint[bg.mode]}>
        <Segmented
          value={bg.mode}
          onValueChange={(v) =>
            edit((d) => {
              d.bg.mode = v;
            })
          }
          options={BG_MODES.map((m) => ({ value: m, label: S.bgModes[m] }))}
          fullWidth
        />
      </Field>
      {bg.mode === 'blur' ? (
        <>
          <Field label={S.blur}>
            <DocSlider
              k="blur"
              value={bg.blur}
              unit=" px"
              set={(d, v) => {
                d.bg.blur = v;
              }}
            />
          </Field>
          <Field label={S.brightness}>
            <DocSlider
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
        <Field label={S.bgColor}>
          <ColorField
            value={bg.color}
            onChange={(c) =>
              edit((d) => {
                d.bg.color = c.slice(0, 7);
              })
            }
          />
        </Field>
      ) : null}
    </Section>
  );
}

function ShotSection() {
  const shot = useDoc((s) => s.data.shot);
  return (
    <Section title={S.sectionShot} persistKey="screenshot-fx:shot">
      <Field label={S.scale} hint={S.scaleHint}>
        <DocSlider
          k="scale"
          value={shot.scale}
          unit="%"
          set={(d, v) => {
            d.shot.scale = v;
          }}
        />
      </Field>
      <Field label={S.radius}>
        <DocSlider
          k="radius"
          value={shot.radius}
          unit=" px"
          set={(d, v) => {
            d.shot.radius = v;
          }}
        />
      </Field>
      <Field label={S.shadow}>
        <DocSlider
          k="shadow"
          value={shot.shadow}
          set={(d, v) => {
            d.shot.shadow = v;
          }}
        />
      </Field>
      <Field label={S.spotlight} hint={S.spotlightHint}>
        <DocSlider
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

function CreditSection() {
  const credit = useDoc((s) => s.data.credit);
  return (
    <Section title={S.sectionCredit} persistKey="screenshot-fx:credit">
      <Field label={S.creditText}>
        <TextInput
          value={credit.text}
          maxLength={LIMITS.credit}
          placeholder={S.creditPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => {
            const v = Array.from(e.target.value.replace(/\r?\n|\r/g, ' '))
              .slice(0, LIMITS.credit)
              .join('');
            gesture.live(() =>
              edit((d) => {
                d.credit.text = v;
              }),
            )();
          }}
        />
      </Field>
      <Field label={S.creditPos}>
        <Select<CreditPos>
          value={credit.pos}
          onValueChange={(v) =>
            edit((d) => {
              d.credit.pos = v;
            })
          }
          options={CREDIT_POSITIONS.map((p) => ({ value: p, label: S.creditPositions[p] }))}
        />
      </Field>
      <Field label={S.creditSize}>
        <Segmented<CreditSize>
          value={credit.size}
          onValueChange={(v) =>
            edit((d) => {
              d.credit.size = v;
            })
          }
          options={CREDIT_SIZES.map((v) => ({ value: v, label: S.creditSizes[v] }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

/* ---------- 各種框的設定（新畫的框的預設與每個框共用） ---------- */

type Setter<T> = (patch: Partial<T>, live?: boolean) => void;

function RangeSlider({
  k,
  value,
  onChange,
  onCommit,
  unit,
}: {
  k: RangeKey;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  unit?: string;
}) {
  const r = RANGES[k];
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
      valueText={(v) => `${fmt(k, v)}${unit ?? ''}`}
    />
  );
}

type ZoomProps = FrameDefaults['zoom'];
function ZoomControls({
  v,
  set,
  commit,
}: {
  v: ZoomProps;
  set: Setter<ZoomProps>;
  commit: () => void;
}) {
  return (
    <>
      <Field label={S.zoomScale}>
        <RangeSlider
          k="zoomScale"
          value={v.scale}
          unit=" 倍"
          onChange={(scale) => set({ scale }, true)}
          onCommit={commit}
        />
      </Field>
      <Field label={S.zoomStyle}>
        <Select<ZoomStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={ZOOM_STYLES.map((z) => ({ value: z, label: S.zoomStyles[z] }))}
        />
      </Field>
      <Field label={S.border}>
        <Segmented
          value={String(v.border)}
          onValueChange={(b) => set({ border: Number(b) as ZoomProps['border'] })}
          options={BORDERS.map((b) => ({
            value: String(b),
            label: S.borders[b],
            ariaLabel: `${S.borders[b]}（${S.borderAria(b)}）`,
          }))}
          fullWidth
        />
      </Field>
    </>
  );
}

type MarkerProps = FrameDefaults['marker'];
function MarkerControls({ v, set }: { v: MarkerProps; set: Setter<MarkerProps> }) {
  return (
    <>
      <Field label={S.markerStyle}>
        <Select<MarkerStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={[
            {
              label: S.markerGroups.highlight,
              options: MARKER_STYLES.filter(isHighlight).map((m) => ({
                value: m,
                label: S.markerStyles[m],
              })),
            },
            {
              label: S.markerGroups.pen,
              options: MARKER_STYLES.filter((m) => !isHighlight(m)).map((m) => ({
                value: m,
                label: S.markerStyles[m],
              })),
            },
          ]}
        />
      </Field>
      <Field label={S.dir}>
        <Segmented<Dir>
          value={v.dir}
          onValueChange={(dir) => set({ dir })}
          options={DIRS.map((d) => ({ value: d, label: S.dirs[d] }))}
          fullWidth
        />
      </Field>
    </>
  );
}

type RedactProps = FrameDefaults['redact'];
function RedactControls({
  v,
  set,
  commit,
}: {
  v: RedactProps;
  set: Setter<RedactProps>;
  commit: () => void;
}) {
  return (
    <>
      <Field label={S.redactStyle}>
        <Segmented<RedactStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={REDACT_STYLES.map((r) => ({ value: r, label: S.redactStyles[r] }))}
          fullWidth
        />
      </Field>
      <Field label={S.redactMode}>
        <Select<RedactMode>
          value={v.mode}
          onValueChange={(mode) => set({ mode })}
          options={REDACT_MODES.map((m) => ({ value: m, label: S.redactModes[m] }))}
        />
      </Field>
      <Field label={S.dir} hidden={v.mode === 'static'}>
        <Segmented<Dir>
          value={v.dir}
          onValueChange={(dir) => set({ dir })}
          options={DIRS.map((d) => ({ value: d, label: S.dirs[d] }))}
          fullWidth
        />
      </Field>
      {v.style === 'mosaic' ? (
        <Field label={S.grain} hint={S.grainHint}>
          <RangeSlider
            k="grain"
            value={v.grain}
            unit=" px"
            onChange={(grain) => set({ grain }, true)}
            onCommit={commit}
          />
        </Field>
      ) : (
        <Field label={S.density} hint={S.densityHint}>
          <RangeSlider
            k="density"
            value={v.density}
            unit="%"
            onChange={(density) => set({ density }, true)}
            onCommit={commit}
          />
        </Field>
      )}
    </>
  );
}

/* ---------- 演出框 ---------- */

function DefaultsSection() {
  const tool = usePrefs((p) => p.data.tool);
  const d = usePrefs((p) => p.data.defaults);
  const noop = () => undefined;
  return (
    <Section
      title={S.sectionDefaults}
      persistKey="screenshot-fx:defaults"
      description={S.defaultsHint(S.kinds[tool])}
    >
      <div className="flex flex-col gap-3" data-testid="defaults" data-kind={tool}>
        {tool === 'zoom' ? (
          <ZoomControls
            v={d.zoom}
            set={(p) => setDefaults((x) => void Object.assign(x.zoom, p))}
            commit={noop}
          />
        ) : tool === 'marker' ? (
          <MarkerControls
            v={d.marker}
            set={(p) => setDefaults((x) => void Object.assign(x.marker, p))}
          />
        ) : (
          <RedactControls
            v={d.redact}
            set={(p) => setDefaults((x) => void Object.assign(x.redact, p))}
            commit={noop}
          />
        )}
      </div>
    </Section>
  );
}

/** 一個框的設定（一步復原；滑桿放開才記） */
function FrameEditor({ frame }: { frame: Frame }) {
  const set = <T,>(patch: Partial<T>, live?: boolean) => {
    const apply = () => updateFrame(frame.id, (f) => void Object.assign(f, patch));
    if (live) gesture.live(apply)();
    else apply();
  };
  return (
    <div
      className="flex flex-col gap-3 border-t border-border px-3 pt-3 pb-1"
      data-testid="frame-editor"
    >
      {frame.kind === 'zoom' ? (
        <ZoomControls v={frame} set={set} commit={gesture.commit} />
      ) : frame.kind === 'marker' ? (
        <MarkerControls v={frame} set={set} />
      ) : (
        <RedactControls v={frame} set={set} commit={gesture.commit} />
      )}
    </div>
  );
}

const short = (label: string) => label.replace(/（.*）$/, '');

function frameSummary(f: Frame): string {
  if (f.kind === 'zoom') {
    const z = f as ZoomFrame;
    return `×${z.scale.toFixed(2)}・${short(S.zoomStyles[z.style])}`;
  }
  if (f.kind === 'marker') {
    const m = f as MarkerFrame;
    return `${S.markerStyles[m.style]}・${short(S.dirs[m.dir])}`;
  }
  const r = f as RedactFrame;
  return r.mode === 'static'
    ? `${S.redactStyles[r.style]}・${short(S.redactModes[r.mode])}`
    : `${S.redactStyles[r.style]}・${short(S.redactModes[r.mode])}・${short(S.dirs[r.dir])}`;
}

function FrameRow({
  frame,
  index,
  count,
  frames,
}: {
  frame: Frame;
  index: number;
  count: number;
  frames: readonly Frame[];
}) {
  const selected = useLive((l) => l.selected === frame.id);
  const name = S.frameName(frame.kind, kindIndex(frames, frame.id));
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
          onClick={() => select(selected ? null : frame.id)}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold tabular-nums">
            {index + 1}
          </span>
          <span aria-hidden className="shrink-0 text-muted [&_svg]:size-4">
            {KIND_ICON[frame.kind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted">{frameSummary(frame)}</span>
          </span>
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          label={`${S.moveUp}：${name}`}
          icon={<ArrowUp />}
          disabled={index === 0}
          onClick={() => moveFrame(frame.id, -1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${S.moveDown}：${name}`}
          icon={<ArrowDown />}
          disabled={index === count - 1}
          onClick={() => moveFrame(frame.id, 1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${S.duplicate}：${name}`}
          icon={<Copy />}
          disabled={count >= LIMITS.frames}
          onClick={() => duplicate(frame.id)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`${S.remove}：${name}`}
          icon={<Trash2 />}
          onClick={() => removeFrame(frame.id)}
        />
      </div>
      {selected ? <FrameEditor frame={frame} /> : null}
    </li>
  );
}

function FramesSection() {
  const frames = useDoc((s) => s.data.frames);
  const hasImage = useDoc((s) => !!s.data.image);
  const confirm = useConfirm();
  return (
    <Section
      title={S.sectionFrames(frames.length)}
      persistKey="screenshot-fx:frames"
      actions={
        frames.length ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={async () => {
              if (
                await confirm({
                  title: S.clearAllTitle,
                  description: S.clearAllDesc,
                  danger: true,
                  confirmLabel: S.clearAll,
                })
              )
                clearFrames();
            }}
          >
            {S.clearAll}
          </Button>
        ) : null
      }
    >
      {frames.length ? (
        <ol
          className="m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label={S.tabs.frames}
          data-testid="frame-list"
        >
          {frames.map((f, i) => (
            <FrameRow key={f.id} frame={f} index={i} count={frames.length} frames={frames} />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted" data-testid="frames-empty">
          {hasImage ? S.framesEmpty : S.framesNeedImage}
        </p>
      )}
      {frames.length >= LIMITS.frames ? (
        <Notice tone="warning">{S.frameLimit(LIMITS.frames)}</Notice>
      ) : null}
      <ul className="m-0 flex flex-col gap-1 pl-4 text-xs text-muted">
        <li>{S.followNote}</li>
        <li>{S.orderNote}</li>
        <li>{S.privacyNote}</li>
      </ul>
    </Section>
  );
}

/* ---------- 時間軸 ---------- */

function TimingSection() {
  const timing = useDoc((s) => s.data.timing);
  const frames = useDoc((s) => s.data.frames);
  const total = buildTimeline(timing, frames).total;
  return (
    <Section title={S.sectionTiming} persistKey="screenshot-fx:timing">
      {PHASES.map((p: PhaseId) => (
        <Field key={p} label={S.phaseFields[p]} hint={S.phaseHints[p]}>
          <DocSlider
            k={p}
            value={timing[p]}
            unit=" 秒"
            set={(d, v) => {
              d.timing[p] = v;
            }}
          />
        </Field>
      ))}
      <Field label={S.order} hint={S.orderHints[timing.order]}>
        <Segmented<Order>
          value={timing.order}
          onValueChange={(v) =>
            edit((d) => {
              d.timing.order = v;
            })
          }
          options={ORDERS.map((o) => ({ value: o, label: S.orders[o] }))}
          fullWidth
        />
      </Field>
      <Field label={S.fps} hint={S.fpsHint}>
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
        {S.total(total)}
      </p>
    </Section>
  );
}

/* ---------- 設定欄 ---------- */

export function Settings({
  onFiles,
  onSample,
}: {
  onFiles: (files: File[]) => void;
  onSample: (demo: boolean) => void;
}) {
  const tab = useLive((l) => l.tab);
  return (
    <Tabs<PanelTab>
      aria-label={S.tabsLabel}
      value={tab}
      onValueChange={(v) => useLive.setState({ tab: v })}
      keepMounted
      items={[
        {
          value: 'image',
          label: S.tabs.image,
          content: (
            <div className="flex flex-col gap-3">
              <ImageSection onFiles={onFiles} onSample={onSample} />
              <CanvasSection />
              <ShotSection />
              <CreditSection />
            </div>
          ),
        },
        {
          value: 'frames',
          label: S.tabs.frames,
          content: (
            <div className="flex flex-col gap-3">
              <DefaultsSection />
              <FramesSection />
            </div>
          ),
        },
        {
          value: 'timing',
          label: S.tabs.timing,
          content: <TimingSection />,
        },
      ]}
    />
  );
}
