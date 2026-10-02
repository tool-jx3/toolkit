/**
 * 動態分頁（規格 1.8）：基準元素的效果、開始、持續、加速曲線、筆畫方向、複本延遲與順序、保持顯示、動態預設。
 */
import { Button, Field, FieldRow, NumberInput, Section, Segmented, Select, Toggle } from '@/ui';
import { applyMotionPreset, setPrimaryAnimation, step } from './actions';
import { gesture, Placeholder, usePrimary } from './controls';
import { clamp } from './geometry';
import {
  COPY_ORDERS,
  type CopyOrder,
  EASINGS,
  type EasingName,
  MOTION_MODES,
  type MotionMode,
  RANGE,
  type StrokeDirection,
} from './model';
import { MOTION_PRESET_IDS } from './motion';
import { useProject } from './store';
import { S } from './strings';

export function MotionPanel() {
  const el = usePrimary();
  const total = useProject((s) => s.data.animation.duration);
  if (!el) return <Placeholder>{S.motion.placeholder}</Placeholder>;
  const a = el.animation;
  const discrete = (patch: Parameters<typeof setPrimaryAnimation>[0]) =>
    step(() => setPrimaryAnimation(patch));
  return (
    <>
      <Section title={S.motion.enter} fixed>
        <Field label={S.motion.mode}>
          <Select<MotionMode>
            value={a.mode}
            onValueChange={(v) => discrete({ mode: v })}
            options={MOTION_MODES.map((m) => ({ value: m, label: S.motion.modes[m] }))}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.motion.start}>
            <NumberInput
              value={Math.round(a.start * 1000) / 1000}
              onChange={gesture.live((v) => setPrimaryAnimation({ start: clamp(v, 0, total) }))}
              onCommit={gesture.commit}
              min={0}
              max={total}
              step={0.05}
              precision={3}
              unit="秒"
            />
          </Field>
          <Field label={S.motion.duration}>
            <NumberInput
              value={Math.round(a.duration * 1000) / 1000}
              onChange={gesture.live((v) =>
                setPrimaryAnimation({ duration: clamp(v, ...RANGE.duration) }),
              )}
              onCommit={gesture.commit}
              min={RANGE.duration[0]}
              max={RANGE.duration[1]}
              step={0.05}
              precision={3}
              unit="秒"
            />
          </Field>
        </FieldRow>
        <Field label={S.motion.easing}>
          <Select<EasingName>
            value={a.easing}
            onValueChange={(v) => discrete({ easing: v })}
            options={EASINGS.map((m) => ({ value: m, label: S.motion.easings[m] }))}
          />
        </Field>
        <Field label={S.motion.direction}>
          <Segmented<StrokeDirection>
            value={a.direction}
            onValueChange={(v) => discrete({ direction: v })}
            options={(['forward', 'reverse'] as const).map((v) => ({
              value: v,
              label: S.motion.directions[v],
            }))}
            fullWidth
          />
        </Field>
      </Section>
      <Section title={S.motion.copies} fixed>
        <FieldRow columns={2}>
          <Field label={S.motion.stagger}>
            <NumberInput
              value={Math.round(a.copyStagger * 1000) / 1000}
              onChange={gesture.live((v) =>
                setPrimaryAnimation({ copyStagger: clamp(v, ...RANGE.stagger) }),
              )}
              onCommit={gesture.commit}
              min={RANGE.stagger[0]}
              max={RANGE.stagger[1]}
              step={0.01}
              precision={3}
              unit="秒"
            />
          </Field>
          <Field label={S.motion.order}>
            <Select<CopyOrder>
              value={a.copyOrder}
              onValueChange={(v) => discrete({ copyOrder: v })}
              options={COPY_ORDERS.map((m) => ({ value: m, label: S.motion.orders[m] }))}
            />
          </Field>
        </FieldRow>
        <Field label={S.motion.hold} layout="inline">
          <Toggle checked={a.holdAfter} onCheckedChange={(v) => discrete({ holdAfter: v })} />
        </Field>
      </Section>
      <Section title={S.motion.presets} fixed>
        <div className="grid grid-cols-2 gap-2">
          {MOTION_PRESET_IDS.map((id) => (
            <Button key={id} size="sm" onClick={() => applyMotionPreset(id)} data-preset={id}>
              {S.motion.preset[id]}
            </Button>
          ))}
        </div>
      </Section>
    </>
  );
}
