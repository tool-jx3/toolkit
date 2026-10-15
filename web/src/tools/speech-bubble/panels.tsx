/**
 * 編輯畫面的設定（規格 1.2～1.4）：範本列、泡泡（清單、造型、文字、配色）、動畫、版面。
 */
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  GripVertical,
  LayoutGrid,
  Paintbrush,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addImageFile, useAssetImage } from '@/core/assets';
import {
  AnchorPicker,
  Button,
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  GestureScope,
  IconButton,
  ImageDrop,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  SortableList,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { BodyEditor } from './BodyEditor';
import { ImportDialog } from './ImportDialog';
import { CustomBadge, FrameFields, MetaFields, PaletteFields, TextFields } from './LookFields';
import {
  ALIGNS,
  ARRANGES,
  type Bubble,
  bubbleCustom,
  CANVAS_MODES,
  CARD_RANGES,
  type CardStyle,
  CURSOR_IDS,
  DIVIDER_IDS,
  ENTER_IDS,
  EXIT_IDS,
  ICON_IDS,
  IDLE_IDS,
  IMAGE_FIT_IDS,
  type LookKey,
  lookOf,
  MAX_BUBBLES,
  MAX_BUTTON,
  MAX_NOTE,
  MAX_SPEAKER,
  MAX_TIME,
  MAX_TITLE,
  NOTE_ALIGN_IDS,
  ORDER_IDS,
  RANGES,
  type SbData,
  TEXT_ANIM_IDS,
  TEXTURE_IDS,
} from './model';
import { applyPreset, PRESETS, presetOf } from './presets';
import { StyleChoice } from './StyleChoice';
import { filterPresets } from './search';
import {
  addBubble,
  applyLookToAll,
  assets,
  choosePreset,
  duplicateBubble,
  edit,
  editCard,
  gesture,
  hasOffset,
  type LookPatch,
  moveBubble,
  patchBubble,
  patchBubbleLook,
  removeBubble,
  resetBubbleLook,
  resetOffsets,
  saveBubbleAsSide,
  select,
  selectedBubble,
  setAlign,
  setStyle,
  usePrefs,
  useSb,
  useUi,
} from './store';
import {
  ALIGN_NAMES,
  ARRANGE_HINTS,
  ARRANGE_NAMES,
  CURSOR_NAMES,
  DIVIDER_NAMES,
  ENTER_NAMES,
  EXIT_NAMES,
  ICON_NAMES,
  IDLE_NAMES,
  IMAGE_FIT_NAMES,
  NOTE_ALIGN_NAMES,
  ORDER_NAMES,
  S,
  SIDE_NAMES,
  STYLE_NAMES,
  TEXT_ANIM_NAMES,
  TEXTURE_NAMES,
  TITLE_LABELS,
} from './strings';
import { styleDefaults, styleFields } from './styles';

/* ---------- 共用 ---------- */

type NumKey = keyof typeof RANGES;

function RangeSlider({
  k,
  unit,
  precision,
}: {
  k: Exclude<NumKey, 'width' | 'height'>;
  unit?: string;
  precision?: number;
}) {
  const value = useSb((s) => s.data[k]) as number;
  const r = RANGES[k];
  return (
    <Slider
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      unit={unit}
      precision={precision}
      onChange={gesture.live((v: number) =>
        edit((d) => {
          (d[k] as number) = v;
        }),
      )}
      onCommit={gesture.commit}
    />
  );
}

const set = <K extends keyof SbData>(key: K, value: SbData[K]) =>
  edit((d) => {
    d[key] = value;
  });

/** 範本列：目前的範本（已修改）、上一個／下一個（在範本一覽目前的篩選裡輪流）、回到範本一覽（F09、F12） */
export function isModified(d: SbData): boolean {
  const p = presetOf(d.presetId);
  if (!p) return true;
  const strip = (x: SbData) =>
    JSON.stringify({ ...x, bubbles: x.bubbles.map(({ id: _id, ...b }) => b) });
  return strip(applyPreset(p)) !== strip(d);
}

export function stepPreset(dir: 1 | -1): void {
  const prefs = usePrefs.getState().data;
  const list = filterPresets(PRESETS, prefs.category, prefs.query);
  const pool = list.length ? list : PRESETS;
  const cur = useSb.getState().data.presetId;
  const i = pool.findIndex((p) => p.id === cur);
  const next =
    pool[i < 0 ? (dir > 0 ? 0 : pool.length - 1) : (i + dir + pool.length) % pool.length];
  if (next) choosePreset(next);
}

export function PresetBar() {
  const d = useSb((s) => s.data);
  const p = presetOf(d.presetId);
  const modified = isModified(d);
  /* 從範本一覽進來時（卡片已經不在了）焦點不掉到 body：移到範本名稱，鍵盤可以從這裡接著走 */
  const nameRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) nameRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="preset-bar">
      <p
        ref={nameRef}
        tabIndex={-1}
        className="m-0 min-w-0 flex-1 rounded-sm text-sm outline-none focus-visible:focus-ring"
        data-testid="preset-name"
      >
        <span className="text-muted">{S.presetNow}：</span>
        <span className="font-semibold text-fg">{p ? p.name : S.custom}</span>
        {p && modified ? (
          <span className="ml-1.5 rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
            {S.modified}
          </span>
        ) : null}
      </p>
      <IconButton
        size="sm"
        label={`${S.prevPreset}（［）`}
        icon={<ChevronLeft />}
        onClick={() => stepPreset(-1)}
      />
      <IconButton
        size="sm"
        label={`${S.nextPreset}（］）`}
        icon={<ChevronRight />}
        onClick={() => stepPreset(1)}
      />
      <Button size="sm" icon={<LayoutGrid />} onClick={() => useUi.setState({ screen: 'gallery' })}>
        {S.backToGallery}
      </Button>
    </div>
  );
}

/* ---------- 泡泡 ---------- */

const excerpt = (b: Bubble): string => {
  const s = `${b.title ? `${b.title}：` : ''}${b.text}`.replace(/\s+/g, ' ').trim();
  return s || S.untitled;
};

function BubbleList() {
  const bubbles = useSb((s) => s.data.bubbles);
  const [importing, setImporting] = useState(false);
  const selectedId = useUi((u) => u.selectedId);
  const sel = bubbles.find((b) => b.id === selectedId) ?? bubbles[0];
  const full = bubbles.length >= MAX_BUBBLES;
  return (
    <Section title={S.listTitle} persistKey="speech-bubble:list">
      {bubbles.length > 1 ? <p className="m-0 text-xs text-muted">{S.listHint}</p> : null}
      <SortableList
        aria-label={S.listLabel}
        items={bubbles}
        getId={(b) => b.id}
        selectedId={sel.id}
        onSelect={select}
        onMove={moveBubble}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        renderItem={(b, { index }) => {
          const name = S.rowLabel(index + 1);
          return (
            <div className="flex min-h-11 items-center gap-2 px-2 py-1" data-bubble-row={b.id}>
              <span
                data-drag-handle
                aria-hidden
                className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
              >
                <GripVertical />
              </span>
              <span className="w-5 shrink-0 text-center text-xs text-muted tabular-nums">
                {index + 1}
              </span>
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full border border-border-strong"
                style={{ background: b.colors.fill }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-fg" title={excerpt(b)}>
                  {excerpt(b)}
                </span>
                <span className="text-xs text-muted">{STYLE_NAMES[b.style]}</span>
              </div>
              <div className="flex shrink-0">
                <IconButton
                  size="sm"
                  label={`${S.duplicate}：${name}`}
                  icon={<Copy />}
                  disabled={full}
                  onClick={() => duplicateBubble(b.id)}
                />
                <IconButton
                  size="sm"
                  label={bubbles.length <= 1 ? S.removeDisabled : `${S.remove}：${name}`}
                  icon={<Trash2 />}
                  disabled={bubbles.length <= 1}
                  onClick={() => removeBubble(b.id)}
                />
              </div>
            </div>
          );
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plus />} disabled={full} onClick={() => addBubble(sel.id)}>
          {S.addBubble}
        </Button>
        <Button icon={<ClipboardPaste />} onClick={() => setImporting(true)}>
          {S.importButton}
        </Button>
        {full ? <span className="text-xs text-muted">{S.addLimit(MAX_BUBBLES)}</span> : null}
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </Section>
  );
}

function BubbleEditor({
  bubble,
  number,
  total,
}: {
  bubble: Bubble;
  number: number;
  total: number;
}) {
  const f = styleFields(bubble.style);
  const patch = (p: Partial<Omit<Bubble, 'id'>>) => patchBubble(bubble.id, p);
  const look = (p: LookPatch) => patchBubbleLook(bubble.id, p);
  const custom = bubbleCustom(bubble);
  const badge = (k: LookKey) => <CustomBadge on={custom.includes(k)} />;
  const toast = useToast();
  return (
    <Section title={S.editing(number)} persistKey="speech-bubble:bubble">
      <div className="flex flex-col gap-3" data-testid="bubble-editor" data-bubble={bubble.id}>
        <BodyEditor bubble={bubble} />
        <Field label={TITLE_LABELS[bubble.style]}>
          <TextInput
            value={bubble.title}
            placeholder={S.titlePlaceholder}
            data-testid="bubble-title"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) =>
              patch({
                title: Array.from(e.target.value.replace(/\n/g, ' ')).slice(0, MAX_TITLE).join(''),
              })
            }
          />
        </Field>
        <Show when={f.button}>
          <Field label={S.button}>
            <TextInput
              value={bubble.button}
              placeholder={S.buttonPlaceholder}
              data-testid="bubble-button"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) =>
                patch({ button: Array.from(e.target.value).slice(0, MAX_BUTTON).join('') })
              }
            />
          </Field>
        </Show>
        <FieldRow columns={2}>
          <Field label={S.speaker}>
            <TextInput
              value={bubble.speaker ?? ''}
              placeholder={S.speakerPlaceholder}
              data-testid="bubble-speaker"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) =>
                patch({
                  speaker: Array.from(e.target.value.replace(/\n/g, ' '))
                    .slice(0, MAX_SPEAKER)
                    .join(''),
                })
              }
            />
          </Field>
          <Field label={S.time}>
            <TextInput
              value={bubble.time ?? ''}
              placeholder={S.timePlaceholder}
              data-testid="bubble-time"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) =>
                patch({
                  time: Array.from(e.target.value.replace(/\n/g, ' ')).slice(0, MAX_TIME).join(''),
                })
              }
            />
          </Field>
        </FieldRow>
        <p className="-mt-1 m-0 text-xs text-muted">{S.metaHint}</p>
        <FieldRow columns={2}>
          <Field label={S.align} hint={S.alignHint}>
            <Segmented<Bubble['align']>
              value={bubble.align}
              onValueChange={(v) => setAlign(bubble.id, v)}
              options={ALIGNS.map((a) => ({ value: a, label: ALIGN_NAMES[a] }))}
              fullWidth
            />
          </Field>
          <Field label={S.icon} hidden={!f.icon} labelSuffix={badge('icon')}>
            <Select<Bubble['icon']>
              value={bubble.icon}
              onValueChange={(v) => look({ icon: v })}
              options={ICON_IDS.map((i) => ({ value: i, label: ICON_NAMES[i] }))}
            />
          </Field>
        </FieldRow>
        {hasOffset(bubble) ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="bubble-offset">
            <span className="text-xs text-muted">
              {S.offsetLabel}：{S.offsetValue(bubble.dx ?? 0, bubble.dy ?? 0)}
            </span>
            <Button size="sm" icon={<Undo2 />} onClick={() => resetOffsets(bubble.id)}>
              {S.resetOffset}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h4 className="m-0 text-sm font-semibold">{S.colors}</h4>
        <PaletteFields look={lookOf(bubble)} custom={custom} onChange={look} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<RotateCcw />}
            onClick={() => {
              const d = styleDefaults(bubble.style).colors;
              look({ fill: d.fill, border: d.border, text: d.text, accent: d.accent });
            }}
          >
            {S.resetColors}
          </Button>
          <Button
            size="sm"
            icon={<Paintbrush />}
            title={S.applyAllHint}
            disabled={total < 2}
            onClick={() => {
              const n = applyLookToAll(bubble.id);
              if (n) toast({ title: S.appliedAll(n), tone: 'success' });
            }}
          >
            {S.applyAll}
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** 這個泡泡的樣式：單獨調整（文字、外框與陰影、說話者與日期）；回到這一側的預設、存成這一側的預設 */
function BubbleLookSection({ bubble }: { bubble: Bubble }) {
  const custom = bubbleCustom(bubble);
  const lk = lookOf(bubble);
  const change = (p: LookPatch) => patchBubbleLook(bubble.id, p);
  const toast = useToast();
  return (
    <Section
      title={S.lookSection}
      description={S.lookHint}
      persistKey="speech-bubble:bubble-look"
      defaultOpen={false}
    >
      <div className="flex flex-wrap items-center gap-2" data-testid="bubble-look-actions">
        <span className="text-xs text-muted" data-testid="custom-count">
          {S.customCount(custom.length)}
        </span>
        <Button
          size="sm"
          icon={<RotateCcw />}
          title={S.resetLookHint}
          disabled={!custom.length}
          onClick={() => resetBubbleLook(bubble.id)}
        >
          {S.resetLook}
        </Button>
        <Button
          size="sm"
          icon={<Save />}
          title={S.saveAsSideHint}
          onClick={() => {
            saveBubbleAsSide(bubble.id);
            toast({ title: S.savedAsSide(SIDE_NAMES[bubble.align]), tone: 'success' });
          }}
        >
          {S.saveAsSide}
        </Button>
      </div>
      <h4 className="m-0 text-sm font-semibold">{S.textGroup}</h4>
      <TextFields look={lk} custom={custom} onChange={change} />
      <h4 className="m-0 border-t border-border pt-3 text-sm font-semibold">{S.frameGroup}</h4>
      <FrameFields look={lk} custom={custom} onChange={change} />
      <h4 className="m-0 border-t border-border pt-3 text-sm font-semibold">{S.metaGroup}</h4>
      <MetaFields look={lk} custom={custom} onChange={change} />
    </Section>
  );
}

export function BubblesPanel() {
  const d = useSb((s) => s.data);
  const selectedId = useUi((u) => u.selectedId);
  const bubble = selectedBubble(d, selectedId);
  const number = d.bubbles.findIndex((b) => b.id === bubble.id) + 1;
  const custom = bubbleCustom(bubble);
  return (
    <div className="flex flex-col gap-3">
      <BubbleList />
      <BubbleEditor bubble={bubble} number={number} total={d.bubbles.length} />
      <Section
        title={S.style}
        persistKey="speech-bubble:style"
        description={S.styleHint}
        actions={<CustomBadge on={custom.includes('style')} />}
      >
        <StyleChoice
          label={S.style}
          value={bubble.style}
          onChange={(v) => setStyle(bubble.id, v)}
        />
      </Section>
      <BubbleLookSection bubble={bubble} />
    </div>
  );
}

/* ---------- 動畫 ---------- */

export function MotionPanel() {
  const d = useSb((s) => s.data);
  const swap = d.arrange === 'swap';
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.enterSection} persistKey="speech-bubble:enter">
        <Field label={S.enter}>
          <Select
            value={d.enter}
            onValueChange={(v) => set('enter', v)}
            options={ENTER_IDS.map((v) => ({ value: v, label: ENTER_NAMES[v] }))}
          />
        </Field>
        <Field label={S.enterDur}>
          <RangeSlider k="enterDur" unit={S.sec} precision={2} />
        </Field>
      </Section>
      <Section title={S.textSection} persistKey="speech-bubble:text">
        <Field label={S.textAnim}>
          <Select
            value={d.textAnim}
            onValueChange={(v) => set('textAnim', v)}
            options={TEXT_ANIM_IDS.map((v) => ({ value: v, label: TEXT_ANIM_NAMES[v] }))}
          />
        </Field>
        <Show when={d.textAnim === 'type'}>
          <Field label={S.typeSpeed}>
            <RangeSlider k="typeSpeed" unit={S.perSec} />
          </Field>
          <Field label={S.cursor}>
            <Segmented
              value={d.cursor}
              onValueChange={(v) => set('cursor', v)}
              options={CURSOR_IDS.map((v) => ({ value: v, label: CURSOR_NAMES[v] }))}
              fullWidth
            />
          </Field>
        </Show>
      </Section>
      <Section title={S.idleSection} persistKey="speech-bubble:idle">
        <Field label={S.idle}>
          <Select
            value={d.idle}
            onValueChange={(v) => set('idle', v)}
            options={IDLE_IDS.map((v) => ({ value: v, label: IDLE_NAMES[v] }))}
          />
        </Field>
        <Field label={S.hold} hint={S.holdHint}>
          <RangeSlider k="hold" unit={S.sec} precision={1} />
        </Field>
      </Section>
      <Section title={S.exitSection} persistKey="speech-bubble:exit">
        <Field label={S.exit}>
          <Select
            value={d.exit}
            onValueChange={(v) => set('exit', v)}
            options={EXIT_IDS.map((v) => ({ value: v, label: EXIT_NAMES[v] }))}
          />
        </Field>
        <Field label={S.exitDur} hidden={d.exit === 'none'}>
          <RangeSlider k="exitDur" unit={S.sec} precision={2} />
        </Field>
      </Section>
      <Section title={S.orderSection} persistKey="speech-bubble:order">
        <Field label={S.stagger} hint={S.staggerHint} hidden={swap}>
          <RangeSlider k="stagger" unit={S.sec} precision={2} />
        </Field>
        <Field label={S.order} hint={S.orderHint}>
          <Segmented
            value={d.order}
            onValueChange={(v) => set('order', v)}
            options={ORDER_IDS.map((v) => ({ value: v, label: ORDER_NAMES[v] }))}
            fullWidth
          />
        </Field>
        <Field
          label={S.exitTogether}
          hint={S.exitTogetherHint}
          layout="inline"
          hidden={swap || d.exit === 'none'}
        >
          <Toggle checked={d.exitTogether} onCheckedChange={(v) => set('exitTogether', v)} />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 版面 ---------- */

export function LayoutPanel() {
  const d = useSb((s) => s.data);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.fontSection} persistKey="speech-bubble:font">
        <Field label={S.font}>
          <FontPicker
            value={d.font}
            previewText={S.fontPreview}
            onChange={(v) =>
              edit((x) => {
                x.font = { ...v };
              })
            }
          />
        </Field>
        <Field label={S.fontSize}>
          <RangeSlider k="fontSize" unit="px" />
        </Field>
        <Field label={S.lineHeight}>
          <RangeSlider k="lineHeight" unit={S.lineHeightUnit} precision={2} />
        </Field>
        <Field label={S.wrapWidth}>
          <RangeSlider k="wrapWidth" unit="px" />
        </Field>
      </Section>
      <Section title={S.arrangeSection} persistKey="speech-bubble:arrange">
        <Field label={S.arrange} hint={ARRANGE_HINTS[d.arrange]}>
          <Segmented
            value={d.arrange}
            onValueChange={(v) => set('arrange', v)}
            options={ARRANGES.map((v) => ({ value: v, label: ARRANGE_NAMES[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.columns} hidden={d.arrange !== 'grid'}>
          <RangeSlider k="columns" />
        </Field>
        <Field label={d.arrange === 'pile' ? S.pileGap : S.gap} hidden={d.arrange === 'swap'}>
          <RangeSlider k="gap" unit="px" />
        </Field>
        <Field label={S.indent} hint={S.indentHint} hidden={d.arrange !== 'column'}>
          <RangeSlider k="indent" unit="px" />
        </Field>
        <Field label={S.shadow} hint={S.shadowHint} layout="inline">
          <Toggle checked={d.shadow} onCheckedChange={(v) => set('shadow', v)} />
        </Field>
      </Section>
      <Section title={S.canvasSection} persistKey="speech-bubble:canvas">
        <Field
          label={S.canvasMode}
          hint={d.canvasMode !== 'auto' && d.canvasMode !== 'fixed' ? S.ratioHint : undefined}
        >
          <Segmented
            value={d.canvasMode}
            onValueChange={(v) => set('canvasMode', v)}
            options={CANVAS_MODES.map((v) => ({
              value: v,
              label: S.canvasModes[v],
              ariaLabel: v === 'auto' || v === 'fixed' ? undefined : S.canvasModeLabels[v],
            }))}
            fullWidth
          />
        </Field>
        <Field label={S.margin} hint={d.canvasMode === 'auto' ? S.marginHint : S.marginFixedHint}>
          <RangeSlider k="margin" unit="px" />
        </Field>
        <Field label={S.minHeight} hint={S.minHeightHint} hidden={d.canvasMode === 'fixed'}>
          <RangeSlider k="minHeight" unit="px" />
        </Field>
        <Show when={d.canvasMode === 'fixed'}>
          <FieldRow columns={2}>
            <Field label={S.width}>
              <NumberInput
                value={d.width}
                min={RANGES.width.min}
                max={RANGES.width.max}
                step={1}
                unit="px"
                onChange={gesture.live((v: number) => set('width', Math.round(v)))}
                onCommit={gesture.commit}
              />
            </Field>
            <Field label={S.height}>
              <NumberInput
                value={d.height}
                min={RANGES.height.min}
                max={RANGES.height.max}
                step={1}
                unit="px"
                onChange={gesture.live((v: number) => set('height', Math.round(v)))}
                onCommit={gesture.commit}
              />
            </Field>
          </FieldRow>
        </Show>
        <Field label={S.anchor} hidden={d.canvasMode === 'auto' && d.minHeight <= 0}>
          <AnchorPicker value={d.anchor} onChange={(v) => set('anchor', v)} />
        </Field>
      </Section>
      <CardSection />
      <NotesSection />
    </div>
  );
}

/* ---------- 卡片底、頁首與頁尾（F62、F63） ---------- */

type CardNumKey = keyof typeof CARD_RANGES;

function CardSlider({ k, unit }: { k: CardNumKey; unit?: string }) {
  const value = useSb((s) => s.data.card[k]);
  const r = CARD_RANGES[k];
  return (
    <Slider
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      unit={unit}
      onChange={gesture.live((v: number) =>
        editCard((c) => {
          c[k] = v;
        }),
      )}
      onCommit={gesture.commit}
    />
  );
}

const setCard = <K extends keyof CardStyle>(k: K, v: CardStyle[K]) =>
  editCard((c) => {
    c[k] = v;
  });

function CardSection() {
  const c = useSb((s) => s.data.card);
  const toast = useToast();
  const img = useAssetImage(assets, c.image);
  const addImage = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const { ref, persisted } = await addImageFile(assets, file, { maxSide: 2048 });
      setCard('image', ref.id);
      if (!persisted) toast({ title: S.imageNotSaved, tone: 'warning' });
    } catch {
      toast({ title: S.imageFailed(file.name), tone: 'danger' });
    }
  };
  return (
    <Section title={S.cardSection} persistKey="speech-bubble:card">
      <Field label={S.cardBg} hint={S.cardBgHint} layout="inline">
        <Toggle checked={c.bg} onCheckedChange={(v) => setCard('bg', v)} />
      </Field>
      <Show when={c.bg}>
        <FieldRow columns={2}>
          <Field label={S.cardColor}>
            <GestureScope gesture={gesture}>
              <ColorField
                alpha
                value={c.color}
                onChange={(v) => setCard('color', v.toLowerCase())}
              />
            </GestureScope>
          </Field>
          <Field label={S.cardRadius}>
            <CardSlider k="radius" unit="px" />
          </Field>
        </FieldRow>
        <Field label={S.cardImage} hint={S.cardImageHint}>
          {c.image ? (
            <div className="flex flex-col gap-2" data-testid="card-image">
              {img.status === 'missing' ? <Notice tone="warning">{S.imageMissing}</Notice> : null}
              <div>
                <Button size="sm" icon={<Trash2 />} onClick={() => setCard('image', null)}>
                  {S.removeImage}
                </Button>
              </div>
            </div>
          ) : (
            <ImageDrop
              compact
              paste="focus"
              label={S.cardImageDrop}
              onFiles={(files) => void addImage(files)}
            />
          )}
        </Field>
        <Show when={!!c.image}>
          <FieldRow columns={2}>
            <Field label={S.imageFit}>
              <Segmented
                value={c.imageFit}
                onValueChange={(v) => setCard('imageFit', v)}
                options={IMAGE_FIT_IDS.map((v) => ({ value: v, label: IMAGE_FIT_NAMES[v] }))}
                fullWidth
              />
            </Field>
            <Field label={S.imageOpacity}>
              <CardSlider k="imageOpacity" unit="%" />
            </Field>
          </FieldRow>
        </Show>
        <Field label={S.texture}>
          <Select
            value={c.texture}
            onValueChange={(v) => setCard('texture', v)}
            options={TEXTURE_IDS.map((v) => ({ value: v, label: TEXTURE_NAMES[v] }))}
          />
        </Field>
        <Show when={c.texture !== 'none'}>
          <Field label={S.textureStrength}>
            <CardSlider k="strength" unit="%" />
          </Field>
          <Field label={S.darkBoost} hint={S.darkBoostHint} layout="inline">
            <Toggle checked={c.darkBoost} onCheckedChange={(v) => setCard('darkBoost', v)} />
          </Field>
        </Show>
      </Show>
    </Section>
  );
}

const noteText = (v: string) => Array.from(v).slice(0, MAX_NOTE).join('');

function NotesSection() {
  const c = useSb((s) => s.data.card);
  const globalFont = useSb((s) => s.data.font);
  const hasNotes = !!(c.header.trim() || c.footer.trim());
  return (
    <Section title={S.notesSection} persistKey="speech-bubble:notes">
      <Field label={S.header}>
        <TextArea
          rows={2}
          value={c.header}
          placeholder={S.notePlaceholder}
          data-testid="card-header"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setCard('header', noteText(e.target.value))}
        />
      </Field>
      <Field label={S.footer}>
        <TextArea
          rows={2}
          value={c.footer}
          placeholder={S.notePlaceholder}
          data-testid="card-footer"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setCard('footer', noteText(e.target.value))}
        />
      </Field>
      <Show when={hasNotes}>
        <FieldRow columns={2}>
          <Field label={S.noteAlign}>
            <Segmented
              value={c.noteAlign}
              onValueChange={(v) => setCard('noteAlign', v)}
              options={NOTE_ALIGN_IDS.map((v) => ({ value: v, label: NOTE_ALIGN_NAMES[v] }))}
              fullWidth
            />
          </Field>
          <Field label={S.noteSize}>
            <CardSlider k="noteSize" unit="px" />
          </Field>
        </FieldRow>
        <Field label={S.noteColor}>
          <GestureScope gesture={gesture}>
            <ColorField
              alpha
              value={c.noteColor}
              onChange={(v) => setCard('noteColor', v.toLowerCase())}
            />
          </GestureScope>
        </Field>
        <Field label={S.noteFont}>
          <div className="flex flex-col gap-2">
            <Toggle
              label={S.noteFontInherit}
              checked={c.noteFont === null}
              onCheckedChange={(on) => setCard('noteFont', on ? null : { ...globalFont })}
            />
            {c.noteFont ? (
              <FontPicker
                value={c.noteFont}
                previewText={S.fontPreview}
                onChange={(v) => setCard('noteFont', { ...v })}
              />
            ) : null}
          </div>
        </Field>
      </Show>
      <Field label={S.divider} hint={S.dividerHint}>
        <Segmented
          value={c.divider}
          onValueChange={(v) => setCard('divider', v)}
          options={DIVIDER_IDS.map((v) => ({ value: v, label: DIVIDER_NAMES[v] }))}
          fullWidth
        />
      </Field>
      <Show when={c.divider !== 'none'}>
        <Field label={S.dividerColor}>
          <GestureScope gesture={gesture}>
            <ColorField
              alpha
              value={c.dividerColor}
              onChange={(v) => setCard('dividerColor', v.toLowerCase())}
            />
          </GestureScope>
        </Field>
      </Show>
    </Section>
  );
}
