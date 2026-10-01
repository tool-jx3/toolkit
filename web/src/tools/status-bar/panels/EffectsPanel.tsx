/**
 * 「演出」分頁：紅字（F62）、危急（F63～F69）、歸零（F70）、裂痕（F71）、道具（F72、F73）、損壞瞬間發光（F74）。
 */
import { Field, Notice, Section, Select } from '@/ui';
import { ColorPathField, NumField, SegField, ToggleField, useS } from '../controls';
import type { ItemKind } from '../settings';
import { setSetting, usePreview } from '../store';
import { S } from '../strings';

function ItemKinds() {
  const s = useS();
  /* 選擇器要回傳穩定的值（不要在選擇器裡 map 出新陣列，否則會一直重繪） */
  const tests = usePreview((st) => st.data.tests);
  const labels = tests.map((t) => t.label);
  return (
    <Field label={S.effects.itemKinds}>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: s.barCount }, (_, i) => {
          const title = `${S.bar.barN(i + 1)}${labels[i] ? `（${labels[i]}）` : ''}`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 第 n 條固定對應 CCFOLIA 的第 n 個狀態
            <div key={i} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-xs text-muted">{title}</span>
              <Select
                aria-label={`${S.bar.barN(i + 1)}：${S.bar.item}`}
                value={s.bars[i].item}
                onValueChange={(v) => setSetting(`bars.${i}.item`, v as ItemKind)}
                options={S.items.map(([value, label]) => ({ value, label }))}
              />
            </div>
          );
        })}
      </div>
    </Field>
  );
}

export function EffectsPanel() {
  const s = useS();
  const c = s.critical;
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info" className="text-xs">
        {S.effects.obsNote}
      </Notice>
      <Section title={S.effects.redSection} persistKey="status-bar:red">
        <ToggleField label={S.effects.redOn} path="red.on" hint={S.effects.redHint} />
        <ColorPathField label={S.effects.redColor} path="red.color" hidden={!s.red.on} />
        <ToggleField label={S.effects.redBlink} path="red.blink" hidden={!s.red.on} />
      </Section>
      <Section title={S.effects.critSection} persistKey="status-bar:critical">
        <ToggleField label={S.effects.critOn} path="critical.on" hint={S.effects.critHint} />
        {c.on ? (
          <>
            <NumField
              label={S.effects.threshold}
              path="critical.threshold"
              unit="%"
              format={S.effects.thresholdText}
            />
            <ColorPathField label={S.effects.critColor} path="critical.color" />
            <ToggleField label={S.effects.pulse} path="critical.pulse" />
            <ToggleField label={S.effects.blink} path="critical.blink" />
            <ToggleField label={S.effects.shake} path="critical.shake" />
            <ToggleField label={S.effects.barColor} path="critical.barColor" />
            <ToggleField label={S.effects.valueColor} path="critical.valueColor" />
          </>
        ) : null}
      </Section>
      <Section title={S.effects.zeroSection} persistKey="status-bar:zero">
        <ToggleField label={S.effects.zeroOn} path="zero.on" hint={S.effects.zeroHint} />
        <ToggleField label={S.effects.gray} path="zero.gray" hidden={!s.zero.on} />
        <ToggleField label={S.effects.zeroBlink} path="zero.blink" hidden={!s.zero.on} />
      </Section>
      <Section title={S.effects.damageSection} persistKey="status-bar:damage">
        <ToggleField label={S.effects.cracks} path="cracks.on" hint={S.effects.cracksHint} />
        <ColorPathField label={S.effects.crackColor} path="cracks.color" hidden={!s.cracks.on} />
        <NumField
          label={S.effects.crackOpacity}
          path="cracks.opacity"
          unit="%"
          hidden={!s.cracks.on}
        />
        <ToggleField label={S.effects.items} path="items.on" hint={S.effects.itemsHint} />
        {s.items.on ? (
          <>
            <ItemKinds />
            <NumField label={S.effects.itemCount} path="items.count" unit="個" />
            <NumField label={S.effects.itemSize} path="items.size" unit="px" />
            <NumField
              label={S.effects.itemGap}
              path="items.gap"
              unit="px"
              hint={S.effects.itemGapHint}
              hidden={s.items.count <= 1}
            />
            <SegField label={S.effects.itemSide} path="items.side" options={S.itemSide} />
            <NumField label={S.effects.itemDistance} path="items.distance" unit="px" />
          </>
        ) : null}
        <ToggleField
          label={S.effects.flash}
          path="damageFlash"
          hint={S.effects.flashHint}
          hidden={!s.cracks.on && !s.items.on}
        />
      </Section>
    </div>
  );
}
