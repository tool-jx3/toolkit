/**
 * 數字輸入框（role="spinbutton"）。
 * - 打字時，數字在範圍內就即時套用；離開欄位或按 Enter 時夾到範圍內並對齊小數位（四捨五入）；Esc 還原。
 * - 全形數字與全形符號照樣接受（先做 NFKC 正規化：「６０」→ 60、「－５」→ -5、「１，２００」→ 1200）。
 * - ↑／↓ 加減一個 step（Shift ×10、Alt ×0.1）；PageUp／PageDown ×10；Home／End 到最小／最大值。
 */
import { type KeyboardEvent, useState } from 'react';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';
import { inputClass } from './TextInput';

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 小數位數（預設依 step 決定） */
  precision?: number;
  /** 單位（顯示在框內右側，例如 px、%、秒） */
  unit?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** 確定修改時（離開欄位、Enter、方向鍵）呼叫 */
  onCommit?: (value: number) => void;
}

export function decimalsOf(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function clampStep(
  v: number,
  {
    min,
    max,
    step = 1,
    precision,
  }: { min?: number; max?: number; step?: number; precision?: number },
): number {
  let x = v;
  if (min !== undefined) x = Math.max(min, x);
  if (max !== undefined) x = Math.min(max, x);
  const p = precision ?? decimalsOf(step);
  return Number(x.toFixed(p));
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  unit,
  disabled,
  size = 'md',
  className,
  onCommit,
  ...rest
}: NumberInputProps) {
  const field = useFieldControl(rest);
  const p = precision ?? decimalsOf(step);
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(p))) : '');
  /* 打字中的字串；沒在打字時為 null，直接顯示 value（外部改值、復原時自動跟上） */
  const [draft, setDraft] = useState<string | null>(null);

  const parse = (s: string) => {
    /* 全形數字與符號先做 NFKC（「６０」→ 60、「－５」→ -5、「１２．５」→ 12.5）；減號 − 另外換 */
    const t = s.normalize('NFKC').replace(/,/g, '').replace(/−/g, '-').trim();
    const n = Number(t);
    return t === '' || !Number.isFinite(n) ? null : n;
  };
  const commit = (v: number) => {
    const c = clampStep(v, { min, max, step, precision: p });
    onChange(c);
    onCommit?.(c);
    setDraft(null);
  };
  const nudge = (delta: number) => commit((parse(draft ?? '') ?? value) + delta);

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
      case 'Home':
        if (min !== undefined) {
          e.preventDefault();
          commit(min);
        }
        break;
      case 'End':
        if (max !== undefined) {
          e.preventDefault();
          commit(max);
        }
        break;
      case 'Enter': {
        const n = parse(draft ?? fmt(value));
        commit(n ?? value);
        break;
      }
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
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field['aria-invalid'] || undefined}
        aria-valuenow={Number.isFinite(value) ? value : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={unit ? `${fmt(value)} ${unit}` : undefined}
        value={draft ?? fmt(value)}
        onChange={(e) => {
          const s = e.target.value;
          setDraft(s);
          const n = parse(s);
          if (n !== null && (min === undefined || n >= min) && (max === undefined || n <= max))
            onChange(n);
        }}
        onBlur={() => {
          if (draft !== null) commit(parse(draft) ?? value);
        }}
        onKeyDown={onKeyDown}
        className={inputClass(
          !!field['aria-invalid'],
          cn('tabular-nums', size === 'sm' ? 'h-7 text-xs' : 'h-8', unit ? 'pr-8' : ''),
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
