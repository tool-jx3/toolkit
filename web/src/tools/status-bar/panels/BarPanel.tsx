/**
 * 「條」分頁：形狀與外框（F26～F29）、底槽與填色（F30～F35）、符號（F40）、每一條的設定（F36～F39）。
 */
import { Field, FieldRow, Section, Select, TextInput, Toggle } from '@/ui';
import {
  ColorPathField,
  GestureColor,
  NumField,
  SegField,
  SelectField,
  ToggleField,
  useS,
} from '../controls';
import type { BarSlot, SymbolKind } from '../settings';
import { setSetting, usePreview } from '../store';
import { S } from '../strings';

function BarCard({ index }: { index: number }) {
  const s = useS();
  const b = s.bars[index];
  const testLabel = usePreview((st) => st.data.tests[index]?.label ?? '');
  const set = <K extends keyof BarSlot>(k: K, v: BarSlot[K]) => setSetting(`bars.${index}.${k}`, v);
  const title = S.bar.barN(index + 1);
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 rounded-md border border-border px-3 pt-1 pb-3">
      <legend className="px-1 text-sm font-semibold text-fg">
        {title}
        {testLabel ? <span className="ml-1.5 font-normal text-muted">（{testLabel}）</span> : null}
      </legend>
      <Field label={S.bar.label} hint={index === 0 ? S.bar.labelHint : undefined}>
        <TextInput
          value={b.label}
          placeholder={testLabel}
          aria-label={`${title}：${S.bar.label}`}
          onChange={(e) => set('label', e.target.value)}
        />
      </Field>
      <FieldRow>
        <Field label={S.bar.color1}>
          <GestureColor
            aria-label={`${title}：${S.bar.color1}`}
            value={b.color1}
            onChange={(v) => set('color1', v)}
          />
        </Field>
        <Field label={S.bar.color2}>
          <GestureColor
            aria-label={`${title}：${S.bar.color2}`}
            value={b.color2}
            onChange={(v) => set('color2', v)}
          />
        </Field>
      </FieldRow>
      <Field label={S.bar.symbol} hidden={!s.symbols.show || s.items.on}>
        <Select
          aria-label={`${title}：${S.bar.symbol}`}
          value={b.symbol}
          onValueChange={(v) => set('symbol', v as SymbolKind)}
          options={S.symbols.map(([value, label]) => ({ value, label }))}
        />
      </Field>
      <Toggle
        label={S.bar.critical}
        aria-label={`${title}：${S.bar.critical}`}
        checked={b.critical}
        onCheckedChange={(on) => set('critical', on)}
      />
    </fieldset>
  );
}

export function BarPanel() {
  const s = useS();
  const polygon = s.shape === 'chamfer' || s.shape === 'arrow' || s.shape === 'notch';
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.bar.shapeSection} persistKey="status-bar:shape">
        <SelectField label={S.bar.shape} path="shape" options={S.shape} />
        <NumField label={S.bar.radius} path="radius" unit="px" hidden={s.shape !== 'round'} />
        <NumField label={S.bar.cut} path="cut" unit="px" hidden={!polygon} />
        <NumField label={S.bar.skew} path="skew" unit="px" hidden={s.shape !== 'slant'} />
        <NumField label={S.bar.borderWidth} path="border.width" unit="px" hint={S.bar.borderHint} />
        <ColorPathField
          label={S.bar.borderColor}
          path="border.color"
          alpha
          hidden={s.border.width === 0}
        />
        <ToggleField
          label={S.bar.borderDouble}
          path="border.double"
          hidden={s.border.width === 0}
        />
      </Section>
      <Section title={S.bar.fillSection} persistKey="status-bar:fill">
        <SegField
          label={S.bar.trough}
          path="trough.kind"
          options={S.trough}
          hint={S.bar.troughHint}
        />
        <ColorPathField
          label={S.bar.troughColor}
          path="trough.color"
          alpha
          hidden={s.trough.kind === 'none'}
        />
        <NumField
          label={S.bar.troughMix}
          path="trough.mix"
          unit="%"
          hidden={s.trough.kind !== 'mix'}
        />
        <SelectField label={S.bar.fill} path="fill" options={S.fill} />
        <ToggleField label={S.bar.stripeFlow} path="stripeFlow" hidden={s.fill !== 'stripe'} />
        <NumField
          label={S.bar.segments}
          path="segments"
          hint={S.bar.segmentsHint}
          format={(v) => (v <= 1 ? '無' : `${v} 個`)}
        />
        <NumField label={S.bar.segmentGap} path="segmentGap" unit="px" hidden={s.segments <= 1} />
        <NumField
          label={S.bar.speed}
          path="speed"
          unit="秒"
          precision={2}
          hint={S.bar.speedHint}
          format={(v) => (v <= 0 ? '無' : `${v} 秒`)}
        />
        <NumField label={S.bar.shadow} path="shadow" unit="%" />
      </Section>
      <Section title={S.bar.symbolSection} persistKey="status-bar:symbols">
        <ToggleField label={S.bar.symbolsShow} path="symbols.show" hint={S.bar.symbolsHint} />
        {s.symbols.show && s.items.on ? (
          <p className="m-0 text-xs text-warning">{S.bar.symbolsOffByItems}</p>
        ) : null}
        <NumField label={S.bar.symbolSize} path="symbols.size" unit="px" hidden={!s.symbols.show} />
        <NumField label={S.bar.symbolGap} path="symbols.gap" unit="px" hidden={!s.symbols.show} />
      </Section>
      <Section title={S.bar.barsSection} description={S.bar.barsHint} persistKey="status-bar:bars">
        {Array.from({ length: s.barCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 第 n 條固定對應 CCFOLIA 的第 n 個狀態
          <BarCard key={i} index={i} />
        ))}
      </Section>
    </div>
  );
}
