/**
 * 表單的小元件：「空白＝自動」的數字欄、綁在目前角色卡上的文字欄。
 */
import type { ReactNode } from 'react';
import { Button, Field, OptionalNumberInput, TextArea, TextInput } from '@/ui';
import { S } from './strings';

/** 自動算、也可以手改的數字欄：空白時提示自動的值；有填時旁邊顯示「改回自動」 */
export function AutoNumberField({
  label,
  value,
  auto,
  formula,
  onChange,
  min = 0,
  max = 999,
}: {
  label: ReactNode;
  value: number | null;
  auto: number | string | null;
  formula?: string;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
}) {
  const autoText = auto === null ? null : `${auto}${formula ? `（${formula}）` : ''}`;
  return (
    <Field
      label={label}
      hint={autoText === null ? S.stats.autoNone : S.stats.auto(autoText)}
      labelSuffix={
        value !== null ? (
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => onChange(null)}>
            {S.stats.resetAuto}
          </Button>
        ) : null
      }
    >
      <OptionalNumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        placeholder={auto === null ? '' : String(auto)}
        fallback={typeof auto === 'number' ? auto : null}
      />
    </Field>
  );
}

/** 自動的傷害加值（文字）：空白時提示自動的值 */
export function AutoTextField({
  label,
  value,
  auto,
  formula,
  onChange,
}: {
  label: ReactNode;
  value: string;
  auto: string | null;
  formula?: string;
  onChange: (v: string) => void;
}) {
  const autoText = auto === null ? null : `${auto}${formula ? `（${formula}）` : ''}`;
  return (
    <Field
      label={label}
      hint={autoText === null ? S.stats.autoNone : S.stats.auto(autoText)}
      labelSuffix={
        value.trim() ? (
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => onChange('')}>
            {S.stats.resetAuto}
          </Button>
        ) : null
      }
    >
      <TextInput
        value={value}
        placeholder={auto ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextArea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
