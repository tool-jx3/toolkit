/**
 * 可以留白的數字輸入框（role="spinbutton"）：值是 number 或 null（空白）。
 * 規則與 NumberInput 相同（打字時在範圍內即時套用；離開欄位或 Enter 夾到範圍並對齊小數位；Esc 還原；
 * 全形數字與符號先做 NFKC），差別：
 * - 清空＝null（打字中清空就立刻套用；不會被改回原本的值）；看不懂的字（例如「abc」）離開時還原。
 * - `placeholder`：空白時顯示的提示（例如自動算出的值「12」）。
 * - 空白時按 ↑／↓：從 `fallback`（預設 min，再沒有就 0）開始加減；例如自動值 12 的欄位按 ↑ 變成 13。
 *
 * 用途：「自動算、也可以手改」的欄位（空白＝用自動值）、可以不填的數值（目前 HP、屬性還沒擲）。
 * （coc-sheet 移植時新增）
 */
import { type KeyboardEvent, useState } from 'react';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';
import { clampStep, decimalsOf } from './NumberInput';
import { inputClass } from './TextInput';

export interface OptionalNumberInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  /** 空白時的提示（例如自動算出的值） */
  placeholder?: string;
  /** 空白時按 ↑／↓ 的起點（預設 min，再沒有就 0） */
  fallback?: number | null;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** 確定修改時（離開欄位、Enter、方向鍵、清空）呼叫 */
  onCommit?: (value: number | null) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** 全形數字、全形符號、千分位逗號、減號「−」都接受；空白是 ''、看不懂是 null */
export function parseOptionalNumber(text: string): number | '' | null {
  const t = text.normalize('NFKC').replace(/,/g, '').replace(/−/g, '-').trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function OptionalNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  unit,
  placeholder,
  fallback,
  disabled,
  size = 'md',
  className,
  onCommit,
  onFocus,
  onBlur,
  ...rest
}: OptionalNumberInputProps) {
  const field = useFieldControl(rest);
  const p = precision ?? decimalsOf(step);
  const has = value !== null && Number.isFinite(value);
  const fmt = (v: number | null) =>
    v !== null && Number.isFinite(v) ? String(Number(v.toFixed(p))) : '';
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (v: number | null) => {
    const c = v === null ? null : clampStep(v, { min, max, step, precision: p });
    onChange(c);
    onCommit?.(c);
    setDraft(null);
  };
  const commitDraft = (s: string) => {
    const n = parseOptionalNumber(s);
    if (n === '') commit(null);
    else if (n === null) setDraft(null);
    else commit(n);
  };
  const start = () => {
    const n = draft === null ? value : parseOptionalNumber(draft);
    if (typeof n === 'number') return n;
    return fallback ?? min ?? 0;
  };
  const nudge = (delta: number) => commit(start() + delta);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        nudge(step * mult);
        break;
      case 'ArrowDown':
        e.preventDefault();
        nudge(-step * mult);
        break;
      case 'PageUp':
        e.preventDefault();
        nudge(step * 10);
        break;
      case 'PageDown':
        e.preventDefault();
        nudge(-step * 10);
        break;
      case 'Enter':
        commitDraft(draft ?? fmt(value));
        break;
      case 'Escape':
        if (draft !== null) {
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
        }
        break;
    }
  };

  return (
    <div
      className={cn(
        'relative inline-flex min-w-0 items-center',
        fullWidthUnless(className),
        className,
      )}
    >
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        id={field.id}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field['aria-invalid'] || undefined}
        aria-valuenow={has ? (value as number) : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={
          has ? (unit ? `${fmt(value)} ${unit}` : undefined) : placeholder ? placeholder : '空白'
        }
        value={draft ?? fmt(value)}
        onFocus={onFocus}
        onChange={(e) => {
          const s = e.target.value;
          setDraft(s);
          const n = parseOptionalNumber(s);
          if (n === '') onChange(null);
          else if (
            typeof n === 'number' &&
            (min === undefined || n >= min) &&
            (max === undefined || n <= max)
          )
            onChange(n);
        }}
        onBlur={() => {
          if (draft !== null) commitDraft(draft);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        className={inputClass(
          !!field['aria-invalid'],
          cn('tabular-nums', size === 'sm' ? 'h-7 px-1.5 text-xs' : 'h-8', unit ? 'pr-8' : ''),
        )}
      />
      {unit ? (
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-muted">
          {unit}
        </span>
      ) : null}
    </div>
  );
}
