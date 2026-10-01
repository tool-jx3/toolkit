/**
 * 綁定到設定 store 的欄位小元件：滑桿（放開才記一步）、顏色＋不透明度、分段選擇、開關、字型。
 */
import type { ReactNode } from 'react';
import type { FontValue } from '@/core/fonts';
import {
  ColorField,
  Field,
  FontPicker,
  GestureScope,
  Segmented,
  type SegmentedOption,
  Slider,
  Toggle,
} from '@/ui';
import { type MbFont, type MbSettings, RANGES, type RangeKey } from './settings';
import { gesture, useSettings } from './store';
import { S } from './strings';

type KeysOf<V> = { [K in keyof MbSettings]: MbSettings[K] extends V ? K : never }[keyof MbSettings];

/** 改一個設定（一個復原步驟；在手勢中時併進那一步） */
export function setSetting<K extends keyof MbSettings>(key: K, value: MbSettings[K]): void {
  useSettings.getState().update((d) => {
    (d as MbSettings)[key] = value;
  });
}

export function NumField({
  k,
  label,
  unit = 'px',
  hint,
  precision,
}: {
  k: RangeKey & KeysOf<number>;
  label: ReactNode;
  unit?: string;
  hint?: ReactNode;
  precision?: number;
}) {
  const value = useSettings((st) => st.data[k]);
  const r = RANGES[k];
  return (
    <Field label={label} hint={hint}>
      <Slider
        value={value}
        onChange={gesture.live((v: number) => setSetting(k, v))}
        onCommit={gesture.commit}
        min={r.min}
        max={r.max}
        step={r.step}
        unit={unit}
        precision={precision}
      />
    </Field>
  );
}

/** 顏色（色碼欄＋調色盤；拖曳調色盤到放開算一步） */
export function ColorOnly({ k, label }: { k: KeysOf<string>; label: string }) {
  const value = useSettings((st) => st.data[k]) as string;
  return (
    <Field label={label}>
      <GestureScope gesture={gesture}>
        <ColorField value={value} onChange={(v) => setSetting(k, v as never)} />
      </GestureScope>
    </Field>
  );
}

/** 顏色＋不透明度（0～100%） */
export function ColorOpacity({
  colorKey,
  opacityKey,
  label,
  hint,
}: {
  colorKey: KeysOf<string>;
  opacityKey: RangeKey & KeysOf<number>;
  label: string;
  hint?: ReactNode;
}) {
  const color = useSettings((st) => st.data[colorKey]) as string;
  const opacity = useSettings((st) => st.data[opacityKey]);
  const r = RANGES[opacityKey];
  return (
    <Field label={label} hint={hint}>
      <div className="flex min-w-0 flex-col gap-2">
        <GestureScope gesture={gesture}>
          <ColorField value={color} onChange={(v) => setSetting(colorKey, v as never)} />
        </GestureScope>
        <Slider
          aria-label={`${label}${S.opacity}`}
          value={opacity}
          onChange={gesture.live((v: number) => setSetting(opacityKey, v))}
          onCommit={gesture.commit}
          min={r.min}
          max={r.max}
          step={r.step}
          unit="%"
        />
      </div>
    </Field>
  );
}

export function SegField<K extends keyof MbSettings>({
  k,
  label,
  options,
  hint,
}: {
  k: K;
  label: ReactNode;
  options: Record<string, string>;
  hint?: ReactNode;
}) {
  const value = useSettings((st) => st.data[k]) as string;
  const opts: SegmentedOption<string>[] = Object.entries(options).map(([v, l]) => ({
    value: v,
    label: l,
  }));
  return (
    <Field label={label} hint={hint}>
      <Segmented
        value={value}
        onValueChange={(v) => setSetting(k, v as MbSettings[K])}
        options={opts}
        fullWidth
      />
    </Field>
  );
}

export function ToggleField({
  k,
  label,
  hint,
}: {
  k: KeysOf<boolean>;
  label: ReactNode;
  hint?: ReactNode;
}) {
  const value = useSettings((st) => st.data[k]) as boolean;
  return (
    <Field label={label} hint={hint} layout="inline">
      <Toggle checked={value} onCheckedChange={(v) => setSetting(k, v as never)} />
    </Field>
  );
}

export function FontField({
  k,
  label,
  previewText,
}: {
  k: KeysOf<MbFont>;
  label: ReactNode;
  previewText: string;
}) {
  const value = useSettings((st) => st.data[k]) as MbFont;
  return (
    <Field label={label}>
      <FontPicker
        mode="css"
        value={value as FontValue}
        previewText={previewText}
        onChange={(f) => {
          if (f.source === 'upload') return;
          setSetting(k, { source: f.source, family: f.family, weight: f.weight } as never);
        }}
      />
    </Field>
  );
}
