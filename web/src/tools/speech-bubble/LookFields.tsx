/**
 * 樣式的欄位（規格 F57～F61）：「樣式」分頁的兩側預設與「泡泡」分頁的單獨調整共用。
 * 泡泡用的時候，單獨改過的項目在欄名旁標示「單獨調整」。
 */
import type { ReactNode } from 'react';
import {
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  GestureScope,
  OptionalNumberInput,
  Segmented,
  Select,
  Show,
  Slider,
  Toggle,
} from '@/ui';
import {
  CORNER_IDS,
  FMT_RANGES,
  type Look,
  type LookKey,
  META_MODE_IDS,
  PALETTE_KEYS,
  RANGES,
  SHADOW_MODE_IDS,
  TEXT_ALIGN_IDS,
} from './model';
import { gesture, type LookPatch, useSb } from './store';
import { CORNER_NAMES, META_MODE_NAMES, S, SHADOW_MODE_NAMES, TEXT_ALIGN_NAMES } from './strings';

export interface LookFieldsProps {
  look: Look;
  /** 單獨改過的項目（泡泡用；兩側的預設不給） */
  custom?: readonly LookKey[];
  onChange: (patch: LookPatch) => void;
}

/** 欄名旁的「單獨調整」標示 */
export function CustomBadge({ on }: { on: boolean }): ReactNode {
  if (!on) return null;
  return (
    <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent" data-custom-badge>
      {S.customBadge}
    </span>
  );
}

const badgeOf = (custom: readonly LookKey[] | undefined) => (k: LookKey) =>
  custom ? <CustomBadge on={custom.includes(k)} /> : null;

/** 拖曳中的滑桿：放開才記一步復原 */
function LiveSlider({
  value,
  range,
  unit,
  precision,
  onValue,
}: {
  value: number;
  range: { min: number; max: number; step: number };
  unit?: string;
  precision?: number;
  onValue: (v: number) => void;
}) {
  return (
    <Slider
      value={value}
      min={range.min}
      max={range.max}
      step={range.step}
      unit={unit}
      precision={precision}
      onChange={gesture.live(onValue)}
      onCommit={gesture.commit}
    />
  );
}

/** 配色（四個色彩欄） */
export function PaletteFields({ look, custom, onChange }: LookFieldsProps) {
  const badge = badgeOf(custom);
  return (
    <GestureScope gesture={gesture}>
      <FieldRow columns={2}>
        {PALETTE_KEYS.map((k) => (
          <Field
            key={k}
            label={S.colorNames[k]}
            labelSuffix={badge(k)}
            hint={k === 'accent' ? S.colorHints.accent : undefined}
          >
            <ColorField
              alpha
              value={look.colors[k]}
              onChange={(v) => onChange({ [k]: v.toLowerCase() })}
            />
          </Field>
        ))}
      </FieldRow>
    </GestureScope>
  );
}

/** 文字：字型、字級、行距、字距、對齊、整個內文的斜體／刪除線／底線、上下微調 */
export function TextFields({ look, custom, onChange }: LookFieldsProps) {
  const f = look.fmt;
  const badge = badgeOf(custom);
  const g = {
    font: useSb((s) => s.data.font),
    fontSize: useSb((s) => s.data.fontSize),
    lineHeight: useSb((s) => s.data.lineHeight),
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.font} labelSuffix={badge('font')}>
        <div className="flex flex-col gap-2">
          <Toggle
            label={S.fontInherit}
            checked={f.font === null}
            onCheckedChange={(on) => onChange({ font: on ? null : { ...g.font } })}
          />
          {f.font ? (
            <FontPicker
              value={f.font}
              previewText={S.fontPreview}
              onChange={(v) => onChange({ font: { ...v } })}
            />
          ) : null}
        </div>
      </Field>
      <FieldRow columns={2}>
        <Field label={S.fontSize} labelSuffix={badge('fontSize')}>
          <OptionalNumberInput
            value={f.fontSize}
            min={RANGES.fontSize.min}
            max={RANGES.fontSize.max}
            step={1}
            unit="px"
            placeholder={S.fontSizeAuto(g.fontSize)}
            fallback={g.fontSize}
            onChange={gesture.live((v: number | null) => onChange({ fontSize: v }))}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.lineHeight} labelSuffix={badge('lineHeight')}>
          <OptionalNumberInput
            value={f.lineHeight}
            min={RANGES.lineHeight.min}
            max={RANGES.lineHeight.max}
            step={0.05}
            precision={2}
            unit={S.lineHeightUnit}
            placeholder={S.lineHeightAuto(g.lineHeight)}
            fallback={g.lineHeight}
            onChange={gesture.live((v: number | null) => onChange({ lineHeight: v }))}
            onCommit={gesture.commit}
          />
        </Field>
      </FieldRow>
      <Field label={S.letterSpacing} labelSuffix={badge('letterSpacing')}>
        <LiveSlider
          value={f.letterSpacing}
          range={FMT_RANGES.letterSpacing}
          unit="px"
          precision={1}
          onValue={(v) => onChange({ letterSpacing: v })}
        />
      </Field>
      <Field label={S.textAlign} hint={S.textAlignHint} labelSuffix={badge('textAlign')}>
        <Segmented
          value={f.textAlign}
          onValueChange={(v) => onChange({ textAlign: v })}
          options={TEXT_ALIGN_IDS.map((v) => ({ value: v, label: TEXT_ALIGN_NAMES[v] }))}
          fullWidth
        />
      </Field>
      <Field label={S.wholeText} hint={S.wholeTextHint}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="whole-text">
          {(['italic', 'strike', 'underline'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <Toggle
                label={{ italic: S.italicAll, strike: S.strikeAll, underline: S.underlineAll }[k]}
                checked={f[k]}
                onCheckedChange={(on) => onChange({ [k]: on })}
              />
              {badge(k)}
            </span>
          ))}
        </div>
      </Field>
      <Field label={S.textDy} hint={S.textDyHint} labelSuffix={badge('textDy')}>
        <LiveSlider
          value={f.textDy}
          range={FMT_RANGES.textDy}
          unit="px"
          onValue={(v) => onChange({ textDy: v })}
        />
      </Field>
    </div>
  );
}

/** 外框與陰影：內距、圓角、尾巴與角、邊框、柔和陰影、實色陰影、寬度、雲朵 */
export function FrameFields({ look, custom, onChange }: LookFieldsProps) {
  const f = look.fmt;
  const badge = badgeOf(custom);
  return (
    <div className="flex flex-col gap-3">
      <FieldRow columns={2}>
        <Field label={S.padX} labelSuffix={badge('padX')}>
          <LiveSlider
            value={f.padX}
            range={FMT_RANGES.padX}
            unit={S.times}
            precision={2}
            onValue={(v) => onChange({ padX: v })}
          />
        </Field>
        <Field label={S.padY} labelSuffix={badge('padY')}>
          <LiveSlider
            value={f.padY}
            range={FMT_RANGES.padY}
            unit={S.times}
            precision={2}
            onValue={(v) => onChange({ padY: v })}
          />
        </Field>
      </FieldRow>
      <p className="-mt-1 m-0 text-xs text-muted">{S.padHint}</p>
      <Field label={S.radius} hint={S.radiusHint} labelSuffix={badge('radius')}>
        <OptionalNumberInput
          value={f.radius}
          min={FMT_RANGES.radius.min}
          max={FMT_RANGES.radius.max}
          step={1}
          unit="px"
          placeholder={S.radiusAuto}
          fallback={12}
          onChange={gesture.live((v: number | null) => onChange({ radius: v }))}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.corner} hint={S.cornerHint} labelSuffix={badge('corner')}>
        <Segmented
          value={f.corner}
          onValueChange={(v) => onChange({ corner: v })}
          options={CORNER_IDS.map((v) => ({ value: v, label: CORNER_NAMES[v] }))}
          fullWidth
        />
      </Field>
      <Field label={S.borderScale} hint={S.borderScaleHint} labelSuffix={badge('borderScale')}>
        <LiveSlider
          value={f.borderScale}
          range={FMT_RANGES.borderScale}
          unit={S.times}
          precision={1}
          onValue={(v) => onChange({ borderScale: v })}
        />
      </Field>
      <Field label={S.softShadow} hint={S.softShadowHint} labelSuffix={badge('softShadow')}>
        <Segmented
          value={f.softShadow}
          onValueChange={(v) => onChange({ softShadow: v })}
          options={SHADOW_MODE_IDS.map((v) => ({ value: v, label: SHADOW_MODE_NAMES[v] }))}
          fullWidth
        />
      </Field>
      <Field
        label={S.solidShadow}
        hint={S.solidShadowHint}
        layout="inline"
        labelSuffix={badge('solidShadow')}
      >
        <Toggle checked={f.solidShadow} onCheckedChange={(v) => onChange({ solidShadow: v })} />
      </Field>
      <Show when={f.solidShadow}>
        <FieldRow columns={2}>
          <Field label={S.solidColor} labelSuffix={badge('solidColor')}>
            <GestureScope gesture={gesture}>
              <ColorField
                alpha
                value={f.solidColor}
                onChange={(v) => onChange({ solidColor: v.toLowerCase() })}
              />
            </GestureScope>
          </Field>
          <Field label={S.solidOffset} labelSuffix={badge('solidOffset')}>
            <LiveSlider
              value={f.solidOffset}
              range={FMT_RANGES.solidOffset}
              unit="px"
              onValue={(v) => onChange({ solidOffset: v })}
            />
          </Field>
        </FieldRow>
      </Show>
      <Field
        label={S.fitWidth}
        hint={S.fitWidthHint}
        layout="inline"
        labelSuffix={badge('fitWidth')}
      >
        <Toggle checked={f.fitWidth} onCheckedChange={(v) => onChange({ fitWidth: v })} />
      </Field>
      <Field
        label={S.cloudPuff}
        hint={S.cloudPuffHint}
        labelSuffix={badge('cloudPuff')}
        hidden={look.style !== 'thought'}
      >
        <LiveSlider
          value={f.cloudPuff}
          range={FMT_RANGES.cloudPuff}
          unit={S.times}
          precision={2}
          onValue={(v) => onChange({ cloudPuff: v })}
        />
      </Field>
    </div>
  );
}

/** 說話者與日期的顯示：位置、顏色、字型、字級 */
export function MetaFields({ look, custom, onChange }: LookFieldsProps) {
  const f = look.fmt;
  const badge = badgeOf(custom);
  const off = f.meta === 'off';
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.metaMode} labelSuffix={badge('meta')}>
        <Select
          value={f.meta}
          onValueChange={(v) => onChange({ meta: v })}
          options={META_MODE_IDS.map((v) => ({ value: v, label: META_MODE_NAMES[v] }))}
        />
      </Field>
      <Show when={!off}>
        <FieldRow columns={2}>
          <Field label={S.metaColor} labelSuffix={badge('metaColor')}>
            <GestureScope gesture={gesture}>
              <ColorField
                alpha
                value={f.metaColor}
                onChange={(v) => onChange({ metaColor: v.toLowerCase() })}
              />
            </GestureScope>
          </Field>
          <Field label={S.metaScale} hint={S.metaScaleHint} labelSuffix={badge('metaScale')}>
            <LiveSlider
              value={f.metaScale}
              range={FMT_RANGES.metaScale}
              unit={S.times}
              precision={2}
              onValue={(v) => onChange({ metaScale: v })}
            />
          </Field>
        </FieldRow>
        <Field label={S.metaFont} labelSuffix={badge('metaFont')}>
          <div className="flex flex-col gap-2">
            <Toggle
              label={S.metaFontInherit}
              checked={f.metaFont === null}
              onCheckedChange={(on) =>
                onChange({ metaFont: on ? null : { ...(f.font ?? useSb.getState().data.font) } })
              }
            />
            {f.metaFont ? (
              <FontPicker
                value={f.metaFont}
                previewText={S.fontPreview}
                onChange={(v) => onChange({ metaFont: { ...v } })}
              />
            ) : null}
          </div>
        </Field>
      </Show>
    </div>
  );
}
