/**
 * 編輯畫面的設定（規格 1.2～1.4）：範本列、泡泡（清單、造型、文字、配色）、動畫、版面。
 */
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  LayoutGrid,
  Paintbrush,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { canvasMeasure } from '@/core/typeset/measure';
import {
  AnchorPicker,
  Button,
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  GestureScope,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  SortableList,
  TextArea,
  TextInput,
  ThumbChoice,
  Toggle,
  useToast,
} from '@/ui';
import { drawBubble, FULL_TEXT } from './draw';
import { useFontTick } from './fontTick';
import { cachedUnit, layoutBubble } from './layout';
import {
  ALIGNS,
  ARRANGES,
  type Bubble,
  CANVAS_MODES,
  CURSOR_IDS,
  ENTER_IDS,
  EXIT_IDS,
  ICON_IDS,
  IDLE_IDS,
  MAX_BUBBLES,
  MAX_BUTTON,
  MAX_TEXT,
  MAX_TITLE,
  ORDER_IDS,
  PALETTE_KEYS,
  RANGES,
  type SbData,
  STYLE_IDS,
  type StyleId,
  TEXT_ANIM_IDS,
} from './model';
import { applyPreset, PRESETS, presetOf } from './presets';
import { filterPresets } from './search';
import {
  addBubble,
  applyLookToAll,
  choosePreset,
  duplicateBubble,
  edit,
  gesture,
  moveBubble,
  patchBubble,
  removeBubble,
  select,
  selectedBubble,
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
  ENTER_NAMES,
  EXIT_NAMES,
  ICON_NAMES,
  IDLE_NAMES,
  ORDER_NAMES,
  S,
  STYLE_GROUP_NAMES,
  STYLE_NAMES,
  TEXT_ANIM_NAMES,
  TITLE_LABELS,
} from './strings';
import { STYLE_GROUPS, styleDefaults, styleFields, styleOf } from './styles';

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
        {full ? <span className="text-xs text-muted">{S.addLimit(MAX_BUBBLES)}</span> : null}
      </div>
    </Section>
  );
}

/** 造型縮圖：各造型的預設配色＋範例文字，畫在中性的灰底上 */
function useStyleThumb() {
  const font = useSb((s) => s.data.font);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  return useCallback(
    (ctx: CanvasRenderingContext2D, style: StyleId) => {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      ctx.fillStyle = '#4b505c';
      ctx.fillRect(0, 0, W, H);
      const d = styleDefaults(style);
      const b: Bubble = {
        id: 'thumb',
        style,
        title:
          style === 'news'
            ? '快訊'
            : style === 'card' || style === 'capsule' || style === 'tag'
              ? 'A'
              : '標題',
        text: '對話',
        icon: d.icon,
        button: '好',
        align: 'left',
        colors: d.colors,
      };
      const unit = cachedUnit(canvasMeasure);
      const L = layoutBubble(
        b,
        { font, fontSize: 18, lineHeight: 1.4, wrapWidth: 200, shadow: true },
        unit,
      );
      const vw = L.w + L.ext.l + L.ext.r;
      const vh = L.h + L.ext.t + L.ext.b;
      const k = Math.min((W * 0.9) / vw, (H * 0.86) / vh);
      ctx.translate((W - vw * k) / 2 + L.ext.l * k, (H - vh * k) / 2 + L.ext.t * k);
      ctx.scale(k, k);
      if (L.spec.tilt) {
        ctx.translate(L.w / 2, L.h / 2);
        ctx.rotate((L.spec.tilt * Math.PI) / 180);
        ctx.translate(-L.w / 2, -L.h / 2);
      }
      drawBubble(ctx, L, b, {
        shadow: true,
        u: 0.3,
        seed: 1,
        text: FULL_TEXT,
        shine: null,
        scan: null,
      });
    },
    [font, tick],
  );
}

function StyleSection({ bubble }: { bubble: Bubble }) {
  const draw = useStyleThumb();
  const options = useMemo(
    () =>
      STYLE_GROUPS.flatMap((g) =>
        STYLE_IDS.filter((s) => styleOf(s).group === g).map((s) => ({
          value: s,
          label: STYLE_NAMES[s],
          description: STYLE_GROUP_NAMES[g],
        })),
      ),
    [],
  );
  return (
    <Section title={S.style} persistKey="speech-bubble:style" description={S.styleHint}>
      <ThumbChoice<StyleId>
        aria-label={S.style}
        options={options}
        value={bubble.style}
        onValueChange={(v) => setStyle(bubble.id, v)}
        draw={(ctx, v) => draw(ctx, v)}
        thumbWidth={160}
        thumbHeight={96}
        minItemWidth={76}
      />
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
  const toast = useToast();
  return (
    <Section title={S.editing(number)} persistKey="speech-bubble:bubble">
      <div className="flex flex-col gap-3" data-testid="bubble-editor" data-bubble={bubble.id}>
        <Field label={S.text} hint={S.textHint}>
          <TextArea
            rows={3}
            value={bubble.text}
            placeholder={S.textPlaceholder}
            data-testid="bubble-text"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) =>
              patch({ text: Array.from(e.target.value).slice(0, MAX_TEXT).join('') })
            }
          />
        </Field>
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
          <Field label={S.align} hint={S.alignHint}>
            <Segmented<Bubble['align']>
              value={bubble.align}
              onValueChange={(v) => patch({ align: v })}
              options={ALIGNS.map((a) => ({ value: a, label: ALIGN_NAMES[a] }))}
              fullWidth
            />
          </Field>
          <Field label={S.icon} hidden={!f.icon}>
            <Select<Bubble['icon']>
              value={bubble.icon}
              onValueChange={(v) => patch({ icon: v })}
              options={ICON_IDS.map((i) => ({ value: i, label: ICON_NAMES[i] }))}
            />
          </Field>
        </FieldRow>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h4 className="m-0 text-sm font-semibold">{S.colors}</h4>
        <GestureScope gesture={gesture}>
          <FieldRow columns={2}>
            {PALETTE_KEYS.map((k) => (
              <Field
                key={k}
                label={S.colorNames[k]}
                hint={k === 'accent' ? S.colorHints.accent : undefined}
              >
                <ColorField
                  alpha
                  value={bubble.colors[k]}
                  onChange={(v) => patch({ colors: { ...bubble.colors, [k]: v.toLowerCase() } })}
                />
              </Field>
            ))}
          </FieldRow>
        </GestureScope>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<RotateCcw />}
            onClick={() => patch({ colors: styleDefaults(bubble.style).colors })}
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

export function BubblesPanel() {
  const d = useSb((s) => s.data);
  const selectedId = useUi((u) => u.selectedId);
  const bubble = selectedBubble(d, selectedId);
  const number = d.bubbles.findIndex((b) => b.id === bubble.id) + 1;
  return (
    <div className="flex flex-col gap-3">
      <BubbleList />
      <BubbleEditor bubble={bubble} number={number} total={d.bubbles.length} />
      <StyleSection bubble={bubble} />
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
        <Field label={S.canvasMode}>
          <Segmented
            value={d.canvasMode}
            onValueChange={(v) => set('canvasMode', v)}
            options={CANVAS_MODES.map((v) => ({ value: v, label: S.canvasModes[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.margin} hint={d.canvasMode === 'auto' ? S.marginHint : S.marginFixedHint}>
          <RangeSlider k="margin" unit="px" />
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
          <Field label={S.anchor}>
            <AnchorPicker value={d.anchor} onChange={(v) => set('anchor', v)} />
          </Field>
        </Show>
      </Section>
    </div>
  );
}
