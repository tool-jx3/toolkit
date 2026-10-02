/**
 * 調色的控制項（整體調色與檢視器裡的個別調色共用）：色調五項（F36～F41、F72）、漸層對應（F42～F49、F73）、
 * RGB 曲線（F50～F52、F74）。
 */
import { useMemo } from 'react';
import type { Gradient } from '@/core/gradient';
import { Button, Field, GradientField, Segmented, Select, Slider, Toggle } from '@/ui';
import {
  type Adjust,
  BLEND_MODES,
  type BlendMode,
  CURVE_CHANNELS,
  CURVE_PRESETS,
  type CurveChannel,
  type CurvePoint,
  GRADIENT_PRESETS,
  type GradientMap,
  type ToneRange,
  type ToneValues,
} from './adjust';
import { CurveEditor } from './CurveEditor';
import { S } from './strings';

/* ---------- 色調 ---------- */

export function ToneControls({
  value,
  ranges,
  onChange,
  onCommit,
  idPrefix,
  satHint,
}: {
  value: ToneValues;
  ranges: readonly ToneRange[];
  onChange: (key: keyof ToneValues, v: number) => void;
  onCommit?: () => void;
  idPrefix: string;
  satHint?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {ranges.map((r) => (
        <Field
          key={r.key}
          label={S.toneLabels[r.key]}
          hint={r.key === 'saturation' && satHint ? satHint : S.toneHints[r.key]}
        >
          <Slider
            id={`${idPrefix}-${r.key}`}
            value={value[r.key]}
            onChange={(v) => onChange(r.key, v)}
            onCommit={onCommit}
            min={r.min}
            max={r.max}
            step={1}
            unit={r.unit}
          />
        </Field>
      ))}
    </div>
  );
}

/* ---------- 漸層對應 ---------- */

const toGradient = (g: GradientMap): Gradient => ({
  kind: 'linear',
  angle: 90,
  stops: g.stops.map((s) => ({ offset: s.pos / 100, color: s.color })),
});

export function GradientControls({
  value,
  onChange,
  toggleLabel,
  name,
}: {
  value: GradientMap;
  onChange: (g: GradientMap) => void;
  toggleLabel: string;
  name: string;
}) {
  const gradient = useMemo(() => toGradient(value), [value]);
  const blendOptions = BLEND_MODES.map((m) => ({ value: m, label: S.blendModes[m] }));
  return (
    <div className="flex flex-col gap-3" data-testid={`${name}-gradient`}>
      <Field label={toggleLabel} layout="inline">
        <Toggle
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </Field>
      <Field
        label={S.gradientStops}
        hint={value.stops.length <= 2 ? S.gradientMinStops : S.gradientHint}
      >
        <GradientField
          aria-label={`${name}漸層`}
          value={gradient}
          alpha={false}
          allowRadial={false}
          showAngle={false}
          maxStops={16}
          onChange={(g) =>
            onChange({
              ...value,
              stops: g.stops.map((s) => ({
                pos: Math.min(100, Math.max(0, Math.round(s.offset * 100))),
                color: s.color.slice(0, 7).toLowerCase(),
              })),
            })
          }
        />
      </Field>
      <Field label={S.gradientOpacity}>
        <Slider
          value={value.opacity}
          onChange={(opacity) => onChange({ ...value, opacity })}
          min={0}
          max={100}
          unit="%"
        />
      </Field>
      <Field label={S.gradientMode}>
        <Select<BlendMode>
          value={value.mode}
          onValueChange={(mode) => onChange({ ...value, mode })}
          options={blendOptions}
        />
      </Field>
      <Field label={S.gradientPresets} hint={S.gradientPresetHint}>
        <fieldset
          className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          aria-label={`${name}${S.gradientPresets}`}
        >
          {GRADIENT_PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              onClick={() =>
                onChange({ ...value, enabled: true, stops: p.stops.map((s) => ({ ...s })) })
              }
            >
              <span
                aria-hidden
                className="inline-block h-3 w-6 rounded-sm border border-border"
                style={{
                  background: `linear-gradient(90deg, ${p.stops.map((s) => `${s.color} ${s.pos}%`).join(', ')})`,
                }}
              />
              {S.gradientPresetNames[p.id]}
            </Button>
          ))}
        </fieldset>
      </Field>
    </div>
  );
}

/* ---------- 曲線 ---------- */

export function CurveControls({
  curves,
  channel,
  onChannel,
  onChange,
  name,
}: {
  curves: Adjust['curves'];
  channel: CurveChannel;
  onChannel: (ch: CurveChannel) => void;
  onChange: (ch: CurveChannel, pts: CurvePoint[]) => void;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={`${name}-curves`}>
      <Field label={S.curveChannel}>
        <Segmented<CurveChannel>
          value={channel}
          onValueChange={onChannel}
          options={CURVE_CHANNELS.map((c) => ({ value: c, label: S.curveChannels[c] }))}
          fullWidth
          size="sm"
        />
      </Field>
      <Field label={S.curveEditor(`${name}${S.curveChannels[channel]}`)} hint={S.curveHint}>
        <CurveEditor
          aria-label={S.curveEditor(`${name}${S.curveChannels[channel]}`)}
          points={curves[channel]}
          channel={channel}
          onChange={(pts) => onChange(channel, pts)}
        />
      </Field>
      <Field label={S.curvePresets} hint={S.curvePresetHint}>
        <fieldset
          className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          aria-label={`${name}${S.curvePresets}`}
        >
          {CURVE_PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              onClick={() =>
                onChange(
                  channel,
                  p.points.map((q) => ({ ...q })),
                )
              }
            >
              {S.curvePresetNames[p.id]}
            </Button>
          ))}
        </fieldset>
      </Field>
    </div>
  );
}
