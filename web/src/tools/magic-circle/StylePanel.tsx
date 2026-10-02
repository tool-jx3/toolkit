/**
 * 樣式分頁（規格 1.6）：基準元素的線條、填色、線端、轉角、虛線、混合、陰影、發光與樣式預設。
 */
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
} from '@/ui';
import { applyStylePreset, setPrimaryStyle, step } from './actions';
import { BufferedText, gesture, Placeholder, usePrimary } from './controls';
import { clamp } from './geometry';
import {
  BLEND_MODES,
  type BlendMode,
  LINE_CAPS,
  LINE_JOINS,
  type LineCap,
  type LineJoin,
  parseDash,
  RANGE,
} from './model';
import { STYLE_PRESET_IDS } from './motion';
import { S } from './strings';

export function StylePanel() {
  const el = usePrimary();
  if (!el) return <Placeholder>{S.style.placeholder}</Placeholder>;
  const s = el.style;
  const set = setPrimaryStyle;
  const discrete = (patch: Parameters<typeof set>[0]) => step(() => set(patch));
  return (
    <>
      <Section title={S.style.basic} fixed>
        <Field label={S.style.stroke}>
          <ColorField alpha value={s.stroke} onChange={(v) => set({ stroke: v })} />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.style.strokeWidth}>
            <NumberInput
              value={s.strokeWidth}
              onChange={gesture.live((v) => set({ strokeWidth: clamp(v, ...RANGE.strokeWidth) }))}
              onCommit={gesture.commit}
              min={RANGE.strokeWidth[0]}
              max={RANGE.strokeWidth[1]}
              step={0.5}
              unit="px"
            />
          </Field>
          <Field label={S.style.opacity}>
            <NumberInput
              value={Math.round(s.opacity * 100)}
              onChange={gesture.live((v) => set({ opacity: clamp(v / 100, 0, 1) }))}
              onCommit={gesture.commit}
              min={0}
              max={100}
              step={1}
              unit="%"
            />
          </Field>
        </FieldRow>
        <Field label={S.style.fillEnabled} layout="inline">
          <Toggle checked={s.fillEnabled} onCheckedChange={(v) => discrete({ fillEnabled: v })} />
        </Field>
        <Field label={S.style.fill} className={s.fillEnabled ? undefined : 'opacity-55'}>
          <ColorField alpha value={s.fill} onChange={(v) => set({ fill: v })} />
        </Field>
        <Field label={S.style.lineCap}>
          <Segmented<LineCap>
            value={s.lineCap}
            onValueChange={(v) => discrete({ lineCap: v })}
            options={LINE_CAPS.map((v) => ({ value: v, label: S.style.cap[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.style.lineJoin}>
          <Segmented<LineJoin>
            value={s.lineJoin}
            onValueChange={(v) => discrete({ lineJoin: v })}
            options={LINE_JOINS.map((v) => ({ value: v, label: S.style.join[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.style.dash} hint={S.style.dashHint}>
          <BufferedText
            key={el.id}
            value={s.dash.join(', ')}
            placeholder={S.style.dashPlaceholder}
            onText={(t) => set({ dash: parseDash(t) })}
          />
        </Field>
        <Field label={S.style.blend}>
          <Select<BlendMode>
            value={s.blendMode}
            onValueChange={(v) => discrete({ blendMode: v })}
            options={BLEND_MODES.map((v) => ({ value: v, label: S.style.blends[v] }))}
          />
        </Field>
      </Section>

      <Section title={S.style.shadow} persistKey="magic-circle:shadow">
        <Field label={S.style.shadowColor}>
          <ColorField value={s.shadowColor} onChange={(v) => set({ shadowColor: v })} />
        </Field>
        <Field label={S.style.shadowBlur}>
          <Slider
            value={s.shadowBlur}
            onChange={gesture.live((v) => set({ shadowBlur: clamp(v, ...RANGE.shadowBlur) }))}
            onCommit={gesture.commit}
            min={RANGE.shadowBlur[0]}
            max={RANGE.shadowBlur[1]}
            step={1}
            unit="px"
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.style.shadowX}>
            <NumberInput
              value={s.shadowOffsetX}
              onChange={gesture.live((v) =>
                set({ shadowOffsetX: clamp(v, ...RANGE.shadowOffset) }),
              )}
              onCommit={gesture.commit}
              min={RANGE.shadowOffset[0]}
              max={RANGE.shadowOffset[1]}
              step={1}
              unit="px"
            />
          </Field>
          <Field label={S.style.shadowY}>
            <NumberInput
              value={s.shadowOffsetY}
              onChange={gesture.live((v) =>
                set({ shadowOffsetY: clamp(v, ...RANGE.shadowOffset) }),
              )}
              onCommit={gesture.commit}
              min={RANGE.shadowOffset[0]}
              max={RANGE.shadowOffset[1]}
              step={1}
              unit="px"
            />
          </Field>
        </FieldRow>
      </Section>

      <Section
        title={S.style.glow}
        persistKey="magic-circle:glow"
        actions={
          <Toggle
            aria-label={S.style.glowEnabled}
            checked={s.glowEnabled}
            onCheckedChange={(v) => discrete({ glowEnabled: v })}
          />
        }
      >
        <div className={s.glowEnabled ? 'flex flex-col gap-3' : 'flex flex-col gap-3 opacity-55'}>
          <Field label={S.style.glowColor}>
            <ColorField value={s.glowColor} onChange={(v) => set({ glowColor: v })} />
          </Field>
          <Field label={S.style.glowBlur}>
            <Slider
              value={s.glowBlur}
              onChange={gesture.live((v) => set({ glowBlur: clamp(v, ...RANGE.glowBlur) }))}
              onCommit={gesture.commit}
              min={RANGE.glowBlur[0]}
              max={RANGE.glowBlur[1]}
              step={1}
              unit="px"
            />
          </Field>
          <Field label={S.style.glowStrength}>
            <Slider
              value={s.glowStrength}
              onChange={gesture.live((v) => set({ glowStrength: clamp(v, ...RANGE.glowStrength) }))}
              onCommit={gesture.commit}
              min={RANGE.glowStrength[0]}
              max={RANGE.glowStrength[1]}
              step={0.05}
              unit="×"
            />
          </Field>
        </div>
      </Section>

      <Section title={S.style.presets} fixed>
        <div className="grid grid-cols-2 gap-2">
          {STYLE_PRESET_IDS.map((id) => (
            <Button key={id} size="sm" onClick={() => applyStylePreset(id)} data-preset={id}>
              {S.style.preset[id]}
            </Button>
          ))}
        </div>
      </Section>
    </>
  );
}
