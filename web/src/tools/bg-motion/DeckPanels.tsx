/**
 * 「圖片切換」模式的設定欄（規格 F110～F126）：模式切換、圖片清單（加入、一次設定、第一張出現、各張的秒數與效果、
 * 最後一張消失）、整體設定（輸出尺寸、放法、背景、切回第一張、緩急曲線）。
 */
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  ImagePlus,
  RotateCw,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  SortableList,
  ThumbnailImage,
  Toggle,
  WindowDrop,
} from '@/ui';
import { notify } from './actions';
import {
  DECK_EASINGS,
  DECK_FITS,
  type DeckFit,
  type DeckSlide,
  type DeckState,
  deckAssetIds,
  LIMITS,
  SIZE_PRESETS,
} from './deck';
import {
  addDeckImages,
  addDeckSamples,
  duplicateDeckSlide,
  fitDeckToFirst,
  setDeckSize,
} from './deckActions';
import { edgeOn, pickRandom } from './deckPlan';
import {
  applyBulk,
  assets,
  gesture,
  moveSlide,
  patchBulk,
  patchDeck,
  patchEdge,
  patchSlide,
  randomAssign,
  removeSlide,
  rerollSeed,
  useDeck,
} from './deckStore';
import { patchSettings, useSession, useSettings } from './store';
import { DECK } from './strings';
import { TransitionPicker } from './TransitionPicker';

/* ---------- 模式 ---------- */

export function ModeSwitch() {
  const mode = useSettings((st) => st.data.mode);
  const exporting = useSession((st) => st.exporting);
  return (
    <Field label={DECK.modeLabel} hint={DECK.modeHint}>
      <Segmented
        aria-label={DECK.modeLabel}
        value={mode}
        onValueChange={(m) => patchSettings({ mode: m })}
        disabled={exporting}
        options={[
          { value: 'motion', label: DECK.modeMotion },
          { value: 'deck', label: DECK.modeDeck },
        ]}
        fullWidth
      />
    </Field>
  );
}

/* ---------- 圖片清單 ---------- */

const DISPLAY_HOLD = { min: LIMITS.hold.min, max: LIMITS.hold.max, step: 0.1, precision: 2 };
const DISPLAY_DUR = { min: LIMITS.dur.min, max: LIMITS.dur.max, step: 0.1, precision: 2 };

function SecondsInput({
  value,
  onChange,
  limits,
  label,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  limits: { min: number; max: number; step: number; precision: number };
  label: string;
  disabled?: boolean;
}) {
  return (
    <NumberInput
      aria-label={label}
      size="sm"
      value={value}
      onChange={onChange}
      {...limits}
      unit={DECK.secondsUnit}
      disabled={disabled}
      className="w-24"
    />
  );
}

/** 最後一張的「切回第一張」這一行沒有作用時的原因（有作用回傳 null） */
function lastInactiveReason(d: Pick<DeckState, 'slides' | 'outro' | 'loopBack'>): string | null {
  const n = d.slides.length;
  if (edgeOn(d.outro)) return DECK.connInactive.outro;
  if (n <= 1) return DECK.connInactive.single;
  if (!d.loopBack) return DECK.connInactive.noLoop;
  return null;
}

function SlideRow({
  slide,
  index,
  count,
  bitmap,
  missing,
  inactive,
  seed,
}: {
  slide: DeckSlide;
  index: number;
  count: number;
  bitmap: ImageBitmap | null;
  missing: boolean;
  inactive: string | null;
  seed: number;
}) {
  const no = index + 1;
  const last = index === count - 1;
  const name = slide.image.name || `${no}`;
  const act = (a: string) => DECK.rowAction(a, no, name);
  return (
    <div
      className="flex flex-col"
      data-testid="deck-row"
      data-uid={slide.uid}
      data-image-id={slide.image.id}
    >
      <div className="flex min-w-0 items-start gap-2 p-2">
        <span
          data-drag-handle
          aria-hidden
          className="mt-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
        >
          <GripVertical />
        </span>
        <div className="relative flex h-11 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
          <ThumbnailImage source={bitmap} />
          <span
            className="absolute top-0.5 left-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-contrast"
            data-testid="deck-row-no"
          >
            {no}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium" title={slide.image.name}>
              {slide.image.name || '—'}
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {slide.image.width}×{slide.image.height}
            </span>
          </div>
          {missing ? (
            <p className="m-0 text-xs text-danger" data-testid="deck-row-missing">
              {DECK.imageMissing}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted">{DECK.holdLabel}</span>
            <SecondsInput
              label={DECK.holdAria(no)}
              value={slide.hold}
              limits={DISPLAY_HOLD}
              onChange={(v) => patchSlide(slide.uid, { hold: v })}
            />
            <span className="ml-auto flex shrink-0">
              <IconButton
                size="sm"
                label={act(DECK.moveUp)}
                icon={<ArrowUp />}
                disabled={index === 0}
                onClick={() => moveSlide(index, index - 1)}
              />
              <IconButton
                size="sm"
                label={act(DECK.moveDown)}
                icon={<ArrowDown />}
                disabled={last}
                onClick={() => moveSlide(index, index + 1)}
              />
              <IconButton
                size="sm"
                label={act(DECK.duplicate)}
                icon={<Copy />}
                onClick={() => duplicateDeckSlide(slide.uid)}
              />
              <IconButton
                size="sm"
                label={act(DECK.remove)}
                icon={<Trash2 />}
                onClick={() => removeSlide(slide.uid)}
              />
            </span>
          </div>
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-dashed border-border px-2 py-1.5 data-[inactive]:opacity-50"
        data-testid="deck-conn"
        data-inactive={inactive ? '' : undefined}
        title={inactive ?? undefined}
      >
        <span className="text-xs font-medium text-accent">{last ? DECK.toFirst : DECK.toNext}</span>
        <TransitionPicker
          value={slide.trans}
          onChange={(k) => patchSlide(slide.uid, { trans: k })}
          target={DECK.pickSlide(no)}
          resolved={slide.trans === 'random' ? pickRandom(index, seed) : null}
          data-testid="deck-trans"
        />
        <SecondsInput
          label={DECK.durAria(no)}
          value={slide.dur}
          limits={DISPLAY_DUR}
          onChange={(v) => patchSlide(slide.uid, { dur: v })}
        />
        {inactive ? <span className="basis-full text-xs text-muted">{inactive}</span> : null}
      </div>
    </div>
  );
}

function EdgeRow({ which }: { which: 'intro' | 'outro' }) {
  const edge = useDeck((s) => s.data[which]);
  const seed = useDeck((s) => s.data.seed);
  const title = which === 'intro' ? DECK.introTitle : DECK.outroTitle;
  const hint = which === 'intro' ? DECK.introHint : DECK.outroHint;
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-dashed border-border-strong bg-surface-2 px-2.5 py-2"
      data-testid={`deck-${which}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-sm font-medium">
          {which === 'intro' ? '▶' : '■'} {title}
        </span>
        <TransitionPicker
          edge
          value={edge.trans}
          onChange={(k) => patchEdge(which, { trans: k })}
          target={title}
          resolved={edge.trans === 'random' ? pickRandom(which === 'intro' ? 50 : 51, seed) : null}
          data-testid={`deck-${which}-trans`}
        />
        <SecondsInput
          label={DECK.edgeAria(title)}
          value={edge.dur}
          limits={DISPLAY_DUR}
          onChange={(v) => patchEdge(which, { dur: v })}
        />
      </div>
      <p className="m-0 text-xs text-muted">{hint}</p>
    </div>
  );
}

function BulkBox() {
  const bulk = useDeck((s) => s.data.bulk);
  const count = useDeck((s) => s.data.slides.length);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 p-2.5"
      data-testid="deck-bulk"
    >
      <span className="text-sm font-medium">{DECK.bulkTitle}</span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-xs text-muted">{DECK.bulkHold}</span>
        <SecondsInput
          label={`${DECK.bulkTitle}：顯示秒數`}
          value={bulk.hold}
          limits={DISPLAY_HOLD}
          onChange={(v) => patchBulk({ hold: v })}
        />
        <TransitionPicker
          value={bulk.trans}
          onChange={(k) => patchBulk({ trans: k })}
          target={DECK.pickTargets.bulk}
          data-testid="deck-bulk-trans"
        />
        <span className="text-xs text-muted">{DECK.bulkDur}</span>
        <SecondsInput
          label={`${DECK.bulkTitle}：切換秒數`}
          value={bulk.dur}
          limits={DISPLAY_DUR}
          onChange={(v) => patchBulk({ dur: v })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!count}
          onClick={() => {
            applyBulk();
            notify({ title: DECK.bulkApplied, tone: 'success', duration: 2400 });
          }}
        >
          {DECK.bulkApply}
        </Button>
        <Button
          size="sm"
          icon={<Shuffle />}
          disabled={!count}
          onClick={() => {
            randomAssign();
            notify({ title: DECK.randomAssigned, tone: 'success', duration: 2400 });
          }}
        >
          {DECK.randomAssign}
        </Button>
        <Button
          size="sm"
          icon={<RotateCw />}
          disabled={!count}
          onClick={() => {
            rerollSeed();
            notify({ title: DECK.rerolled, tone: 'info', duration: 2000 });
          }}
        >
          {DECK.reroll}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{DECK.bulkHint}</p>
    </div>
  );
}

export function DeckImagesSection() {
  const slides = useDeck((s) => s.data.slides);
  const outro = useDeck((s) => s.data.outro);
  const loopBack = useDeck((s) => s.data.loopBack);
  const seed = useDeck((s) => s.data.seed);
  const exporting = useSession((st) => st.exporting);
  const ids = useMemo(() => deckAssetIds({ slides }), [slides]);
  const { bitmaps, missing, pending } = useAssetBitmaps(assets, ids);
  const missingSet = useMemo(() => new Set(missing), [missing]);
  const inactive = lastInactiveReason({ slides, outro, loopBack });
  return (
    <Section title={DECK.sectionImages} persistKey="bg-motion:deck-images">
      <div className="flex flex-col gap-3">
        <FileDrop
          accept="image/*"
          filterByAccept={false}
          multiple
          clickable
          paste="document"
          icon={<ImagePlus />}
          label={DECK.dropLabel}
          buttonLabel={DECK.dropButton}
          hint={DECK.dropHint}
          disabled={exporting}
          aria-label={DECK.dropLabel}
          onFiles={(files) => void addDeckImages(files)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<Sparkles />}
            onClick={() => void addDeckSamples()}
            disabled={exporting}
            title={DECK.sampleHint}
          >
            {DECK.sample}
          </Button>
          <span className="text-sm text-muted tabular-nums" data-testid="deck-count">
            {DECK.count(slides.length)}
          </span>
          {pending ? (
            <span className="text-xs text-muted">{DECK.loadingImages(pending)}</span>
          ) : null}
        </div>
        <BulkBox />
        <EdgeRow which="intro" />
        <SortableList<DeckSlide>
          aria-label={DECK.listLabel}
          items={slides}
          getId={(s) => s.uid}
          mode="live"
          onMove={moveSlide}
          onMoveStart={gesture.begin}
          onMoveEnd={gesture.commit}
          empty={DECK.empty}
          className="-m-0.5! max-h-[60rem] gap-2 overflow-y-auto p-0.5!"
          renderItem={(slide, { index }) => (
            <SlideRow
              slide={slide}
              index={index}
              count={slides.length}
              bitmap={bitmaps.get(slide.image.id) ?? null}
              missing={missingSet.has(slide.image.id)}
              inactive={index === slides.length - 1 ? inactive : null}
              seed={seed}
            />
          )}
        />
        <EdgeRow which="outro" />
        {/* 整個視窗都可以拖放圖片（放在載入區上的由載入區處理，不會重複） */}
        <WindowDrop
          label={DECK.dropOverlay}
          hint={DECK.dropOverlayHint}
          disabled={exporting}
          onDrop={(files) => void addDeckImages(files)}
        />
      </div>
    </Section>
  );
}

/* ---------- 整體設定 ---------- */

const FIT_OPTIONS = DECK_FITS.map((f) => ({ value: f, label: DECK.fits[f] }));
const EASING_OPTIONS = DECK_EASINGS.map((e) => ({ value: e, label: DECK.easings[e] }));
const PRESET_OPTIONS = SIZE_PRESETS.map(([w, h]) => ({ value: `${w}x${h}`, label: `${w} × ${h}` }));

export function DeckGlobalSection() {
  const d = useDeck((s) => s.data);
  const first = d.slides[0] ?? null;
  const outroOn = edgeOn(d.outro);
  return (
    <Section title={DECK.sectionGlobal} persistKey="bg-motion:deck-global">
      <div className="flex flex-col gap-3">
        <Field label={DECK.size} hint={DECK.sizeHint}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput
                aria-label={DECK.width}
                value={d.width}
                onChange={(v) => setDeckSize(v, d.height)}
                min={LIMITS.width.min}
                max={LIMITS.width.max}
                precision={0}
                unit="px"
                className="w-28"
              />
              <span aria-hidden className="text-muted">
                ×
              </span>
              <NumberInput
                aria-label={DECK.height}
                value={d.height}
                onChange={(v) => setDeckSize(d.width, v)}
                min={LIMITS.height.min}
                max={LIMITS.height.max}
                precision={0}
                unit="px"
                className="w-28"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={DECK.preset}
                value=""
                placeholder={DECK.presetPlaceholder}
                onValueChange={(v) => {
                  const [w, h] = v.split('x').map(Number);
                  if (w && h) setDeckSize(w, h);
                }}
                options={PRESET_OPTIONS}
              />
              <Button disabled={!first} onClick={fitDeckToFirst} title={DECK.fitFirstHint}>
                {DECK.fitFirst}
              </Button>
            </div>
          </div>
        </Field>
        <Field label={DECK.fit} hint={DECK.fitHint}>
          <Segmented<DeckFit>
            value={d.fit}
            onValueChange={(fit) => patchDeck({ fit })}
            options={FIT_OPTIONS}
            fullWidth
          />
        </Field>
        <Field label={DECK.background} hint={DECK.transparentHint}>
          <div className="flex flex-wrap items-center gap-3">
            <ColorField
              aria-label={DECK.background}
              value={d.bg}
              onChange={(bg) => patchDeck({ bg })}
              disabled={d.transparent}
            />
            <Toggle
              label={DECK.transparent}
              checked={d.transparent}
              onCheckedChange={(transparent) => patchDeck({ transparent })}
            />
          </div>
        </Field>
        <Field
          label={DECK.loopBack}
          layout="inline"
          hint={outroOn ? DECK.loopBackIgnored : DECK.loopBackHint}
        >
          <Toggle checked={d.loopBack} onCheckedChange={(loopBack) => patchDeck({ loopBack })} />
        </Field>
        <Field label={DECK.easing} hint={DECK.easingHint}>
          <Segmented
            value={d.easing}
            onValueChange={(easing) => patchDeck({ easing })}
            options={EASING_OPTIONS}
            fullWidth
          />
        </Field>
      </div>
    </Section>
  );
}
