/**
 * 設定面板：效果、外觀、形狀設定（依效果出現）、時間、字幕、進階。
 * 每個確定的變更記一步復原：滑桿放開、文字欄離開焦點、色彩確定（GestureScope），選單與開關每次一步。
 */
import { Shuffle } from 'lucide-react';
import { useState } from 'react';
import type { TransitionShape } from '@/core/transition';
import {
  Button,
  ColorField,
  Field,
  GestureScope,
  LocalFontDialog,
  Section,
  Segmented,
  Select,
  Slider,
  supportsLocalFontList,
  TextArea,
  TextInput,
  Toggle,
  Tooltip,
} from '@/ui';
import { CATEGORIES, EFFECTS, effectById } from './effects';
import { CAPTION_FONTS, CUSTOM_FONT, FONT_GROUPS } from './fonts';
import { visibleFields } from './model';
import {
  COUNT_RANGE,
  CURVE_IDS,
  DIRECTIONS,
  FPS_OPTIONS,
  MODES,
  ORDERS,
  RANGES,
  type Settings,
  SHAPE_OPTIONS,
  SIZE_IDS,
  TEXT_POSITIONS,
} from './settings';
import { chooseEffect, gesture, reseed, setValue, useSt } from './store';
import { S } from './strings';

type Range = readonly [number, number, number];

/** 放開才記一步的滑桿 */
function NumSlider({
  k,
  range,
  unit,
  precision,
  showInput = true,
  valueText,
  'aria-label': ariaLabel,
}: {
  k: keyof Settings;
  range: Range;
  unit?: string;
  precision?: number;
  showInput?: boolean;
  valueText?: (v: number) => string;
  'aria-label'?: string;
}) {
  const value = useSt((st) => st.data[k]) as number;
  return (
    <Slider
      value={value}
      onChange={gesture.live((v: number) => setValue(k, v as never))}
      onCommit={gesture.commit}
      min={range[0]}
      max={range[1]}
      step={range[2]}
      unit={unit}
      precision={precision}
      showInput={showInput}
      valueText={valueText}
      aria-label={ariaLabel}
    />
  );
}

/** 色彩欄：調色盤拖曳中的變更合成一步 */
function Color({ k, label }: { k: 'color' | 'glowColor' | 'color2' | 'textColor'; label: string }) {
  const value = useSt((st) => st.data[k]);
  return (
    <GestureScope gesture={gesture}>
      <ColorField value={value} onChange={(v) => setValue(k, v)} aria-label={label} />
    </GestureScope>
  );
}

const EFFECT_OPTIONS = CATEGORIES.map((c) => ({
  label: c.label,
  options: EFFECTS.filter((e) => e.category === c.id).map((e) => ({ value: e.id, label: e.name })),
}));

export function EffectSection() {
  const id = useSt((st) => st.data.effect);
  const e = effectById(id);
  return (
    <Section title={S.effectSection} fixed>
      <Field label={S.effect}>
        <Select value={e.id} onValueChange={chooseEffect} options={EFFECT_OPTIONS} />
      </Field>
      <p className="m-0 text-sm text-muted" data-testid="st-effect-desc">
        {e.description}
        <span className="block text-xs">{S.keepNote}</span>
      </p>
    </Section>
  );
}

export function LookSection() {
  const s = useSt((st) => st.data);
  const show = visibleFields(s);
  return (
    <Section title={S.lookSection} persistKey="scene-transition:look">
      <Field label={S.color}>
        <Color k="color" label={S.color} />
      </Field>
      <Field label={S.glow} layout="inline" hint={S.glowHint}>
        <Toggle checked={s.glow} onCheckedChange={(v) => setValue('glow', v)} />
      </Field>
      <Field label={S.glowColor} hidden={!show.has('glowColor')}>
        <Color k="glowColor" label={S.glowColor} />
      </Field>
      <Field
        label={S.strobe}
        hint={S.strobeHint}
        labelSuffix={
          <span className="text-xs text-muted tabular-nums" data-testid="st-strobe-value">
            {s.strobe > 0 ? S.strobeTimes(s.strobe) : S.strobeOff}
          </span>
        }
      >
        <NumSlider
          k="strobe"
          range={RANGES.strobe}
          showInput={false}
          valueText={(v) => (v > 0 ? S.strobeTimes(v) : S.strobeOff)}
        />
      </Field>
      <Field label={S.color2} hidden={!show.has('color2')}>
        <Color k="color2" label={S.color2} />
      </Field>
      <Field label={S.size}>
        <Select
          value={s.size}
          onValueChange={(v) => setValue('size', v)}
          options={SIZE_IDS.map((v) => ({ value: v, label: S.sizes[v] }))}
        />
      </Field>
      <Field label={S.softness} hint={S.softnessHint}>
        <NumSlider k="softness" range={RANGES.softness} />
      </Field>
    </Section>
  );
}

function optionList(shape: TransitionShape) {
  const names = S.optionNames[shape] ?? {};
  return (SHAPE_OPTIONS[shape] ?? []).map((v) => ({ value: v, label: names[v] ?? v }));
}

export function ShapeSection() {
  const s = useSt((st) => st.data);
  const shape = effectById(s.effect).shape;
  const show = visibleFields(s);
  const shapeKeys = [...show].filter((k) => k !== 'glowColor' && k !== 'color2');
  if (!shapeKeys.length) return null;
  const countRange = COUNT_RANGE[shape];
  const strengthLabel = S.strengthLabel[shape] ?? '強度';
  return (
    <Section title={S.shapeSection} persistKey="scene-transition:shape">
      {show.has('option') ? (
        <Field label={S.optionLabel[shape] ?? '形狀'}>
          <Select
            value={s.option}
            onValueChange={(v) => setValue('option', v)}
            options={optionList(shape)}
          />
        </Field>
      ) : null}
      {show.has('order') ? (
        <Field label={S.order} hint={S.orderHints[s.order]}>
          <Segmented
            fullWidth
            value={s.order}
            onValueChange={(v) => setValue('order', v)}
            options={ORDERS.map((v) => ({ value: v, label: S.orders[v] }))}
          />
        </Field>
      ) : null}
      {show.has('direction') ? (
        <Field label={S.direction}>
          <Select
            value={s.direction}
            onValueChange={(v) => setValue('direction', v)}
            options={DIRECTIONS.map((v) => ({ value: v, label: S.directions[v] }))}
          />
        </Field>
      ) : null}
      {show.has('axis') ? (
        <Field label={S.axis}>
          <Segmented
            fullWidth
            value={s.axis}
            onValueChange={(v) => setValue('axis', v)}
            options={[
              { value: 'vertical', label: S.axes.vertical },
              { value: 'horizontal', label: S.axes.horizontal },
            ]}
          />
        </Field>
      ) : null}
      {show.has('count') && countRange ? (
        <Field label={S.countLabel[shape] ?? '數量'}>
          <NumSlider k="count" range={[countRange[0], countRange[1], 1]} />
        </Field>
      ) : null}
      {show.has('strength') ? (
        shape === 'rotate' ? (
          <Field
            label={strengthLabel}
            labelSuffix={
              <span className="text-xs text-muted tabular-nums" data-testid="st-strength-value">
                {S.degrees(s.strength)}
              </span>
            }
          >
            <NumSlider
              k="strength"
              range={RANGES.strength}
              showInput={false}
              valueText={S.degrees}
            />
          </Field>
        ) : (
          <Field label={strengthLabel}>
            <NumSlider k="strength" range={RANGES.strength} />
          </Field>
        )
      ) : null}
      {show.has('blockSize') ? (
        <Field label={S.blockSize} hint={S.blockHint}>
          <NumSlider k="blockSize" range={RANGES.blockSize} unit="px" />
        </Field>
      ) : null}
      {show.has('ellipse') ? (
        <Field label={S.ellipse}>
          <Segmented
            fullWidth
            value={s.ellipse ? 'ellipse' : 'circle'}
            onValueChange={(v) => setValue('ellipse', v === 'ellipse')}
            options={[
              { value: 'circle', label: S.ellipses.circle },
              { value: 'ellipse', label: S.ellipses.ellipse },
            ]}
          />
        </Field>
      ) : null}
      {show.has('center') ? (
        <Field label={S.center}>
          <div className="grid grid-cols-2 gap-3">
            <Tooltip content={S.centerX}>
              <div>
                <NumSlider
                  k="centerX"
                  range={RANGES.center}
                  showInput={false}
                  aria-label={S.centerX}
                />
              </div>
            </Tooltip>
            <Tooltip content={S.centerY}>
              <div>
                <NumSlider
                  k="centerY"
                  range={RANGES.center}
                  showInput={false}
                  aria-label={S.centerY}
                />
              </div>
            </Tooltip>
          </div>
        </Field>
      ) : null}
      {show.has('bandWidth') ? (
        <Field label={S.bandWidth} hint={S.bandHint}>
          <NumSlider k="bandWidth" range={RANGES.bandWidth} />
        </Field>
      ) : null}
      {show.has('seed') ? (
        <Field label={S.seed} hint={S.seedHint}>
          <div className="flex items-center gap-3">
            <output className="min-w-14 text-sm tabular-nums" data-testid="st-seed">
              {S.seedNo(s.seed)}
            </output>
            <Button size="sm" icon={<Shuffle />} onClick={reseed}>
              {S.reseed}
            </Button>
          </div>
        </Field>
      ) : null}
    </Section>
  );
}

export function TimeSection() {
  const s = useSt((st) => st.data);
  const roundTrip = s.mode === 'roundtrip';
  return (
    <Section title={S.timeSection} persistKey="scene-transition:time">
      <Field label={S.duration} hint={S.durationHint}>
        <NumSlider k="duration" range={RANGES.duration} unit="秒" precision={2} />
      </Field>
      <Field
        label={roundTrip ? S.holdRoundTrip : S.hold}
        hint={roundTrip ? S.holdRoundTripHint : S.holdHint}
      >
        <NumSlider k="hold" range={RANGES.hold} unit="秒" precision={1} />
      </Field>
      <Field label={S.curve}>
        <Select
          value={s.curve}
          onValueChange={(v) => setValue('curve', v)}
          options={CURVE_IDS.map((v) => ({
            value: v,
            label: S.curves[v],
            description: S.curveNotes[v],
          }))}
        />
      </Field>
      <Field label={S.fps}>
        <Segmented
          fullWidth
          value={String(s.fps)}
          onValueChange={(v) => setValue('fps', Number(v) as Settings['fps'])}
          options={FPS_OPTIONS.map((f) => ({ value: String(f), label: S.fpsLabel(f) }))}
        />
      </Field>
      <Field label={S.loop} layout="inline" hint={S.loopHint}>
        <Toggle checked={s.loop} onCheckedChange={(v) => setValue('loop', v)} />
      </Field>
    </Section>
  );
}

const FONT_OPTIONS = FONT_GROUPS.map((g) => ({
  label: g.label,
  options: CAPTION_FONTS.filter((f) => f.group === g.id).map((f) => ({
    value: f.id,
    label: f.label,
    description: f.note,
  })),
}));

export function CaptionSection() {
  const s = useSt((st) => st.data);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canList = supportsLocalFontList();
  return (
    <Section title={S.captionSection} persistKey="scene-transition:caption">
      <Field label={S.caption} hint={S.captionHint}>
        <TextArea
          rows={2}
          value={s.caption}
          placeholder={S.captionPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setValue('caption', e.target.value)}
        />
      </Field>
      <Field label={S.textColor}>
        <Color k="textColor" label={S.textColor} />
      </Field>
      <Field label={S.fontSize} hint={S.fontSizeHint}>
        <NumSlider k="fontSize" range={RANGES.fontSize} unit="px" />
      </Field>
      <Field label={S.font} hint={S.fontHint}>
        <Select value={s.font} onValueChange={(v) => setValue('font', v)} options={FONT_OPTIONS} />
      </Field>
      <Field label={S.fontName} hint={S.fontNameHint} hidden={s.font !== CUSTOM_FONT}>
        <div className="flex min-w-0 items-center gap-2">
          <TextInput
            value={s.fontName}
            placeholder={S.fontNamePlaceholder}
            spellCheck={false}
            autoComplete="off"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => setValue('fontName', e.target.value)}
            className="min-w-0 flex-1"
          />
          {canList ? (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              {S.pickFont}
            </Button>
          ) : null}
        </div>
      </Field>
      {canList ? (
        <LocalFontDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={s.fontName}
          title={S.pickFontTitle}
          onPick={(family) => {
            setValue('fontName', family);
            setPickerOpen(false);
          }}
        />
      ) : null}
      <Field label={S.textPos}>
        <Segmented
          fullWidth
          value={s.textPos}
          onValueChange={(v) => setValue('textPos', v)}
          options={TEXT_POSITIONS.map((v) => ({ value: v, label: S.textPositions[v] }))}
        />
      </Field>
      <Field label={S.outline} layout="inline" hint={S.outlineHint}>
        <Toggle checked={s.outline} onCheckedChange={(v) => setValue('outline', v)} />
      </Field>
    </Section>
  );
}

export function AdvancedSection() {
  const s = useSt((st) => st.data);
  return (
    <Section title={S.advancedSection} persistKey="scene-transition:advanced">
      <Field label={S.mode}>
        <Select
          value={s.mode}
          onValueChange={(v) => setValue('mode', v)}
          options={MODES.map((v) => ({ value: v, label: S.modes[v], description: S.modeNotes[v] }))}
        />
      </Field>
      <Field label={S.reach} hint={S.reachHint}>
        <NumSlider k="reach" range={RANGES.reach} unit="%" />
      </Field>
      <Field label={S.reverseOrder} layout="inline" hint={S.reverseOrderHint}>
        <Toggle checked={s.reverseOrder} onCheckedChange={(v) => setValue('reverseOrder', v)} />
      </Field>
      <Field label={S.reversePlay} layout="inline" hint={S.reversePlayHint}>
        <Toggle checked={s.reversePlay} onCheckedChange={(v) => setValue('reversePlay', v)} />
      </Field>
    </Section>
  );
}
