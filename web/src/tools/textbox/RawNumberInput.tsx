/**
 * 保留原始文字的數字欄（文字方框產生器專用）。
 *
 * 規格要求數值欄照使用者打的文字解析（取整數部分、「3e1」只取到 3、可以超出微調範圍、空白有退回值），
 * 所以這裡不用共用的 NumberInput（它會在離開欄位時夾到範圍內）：
 * - 打字：原封不動交給 onChange，不夾範圍、不改寫；
 * - 微調（↑／↓、PageUp／PageDown、旁邊的兩個按鈕）：從目前實際使用的值加減 step，並限制在 min～max。
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { cn, IconButton, TextInput } from '@/ui';

export interface RawNumberInputProps {
  /** 欄位裡的原始文字 */
  value: string;
  onChange: (value: string) => void;
  /** 目前實際用來計算的值（微調從這裡開始；也作為 aria-valuenow） */
  effective: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** 微調按鈕的名稱 */
  stepUpLabel: string;
  stepDownLabel: string;
  invalid?: boolean;
}

function decimals(step: number): number {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** 從 current 往 dir 方向微調一格：對齊到 step 的倍數，並限制在 min～max */
export function stepRaw(
  current: number,
  dir: 1 | -1,
  { min, max, step }: { min: number; max: number; step: number },
): string {
  const k = current / step;
  const aligned = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  const next = Math.min(max, Math.max(min, aligned * step));
  return String(Number(next.toFixed(decimals(step))));
}

export function RawNumberInput({
  value,
  onChange,
  effective,
  min,
  max,
  step,
  unit,
  stepUpLabel,
  stepDownLabel,
  invalid,
}: RawNumberInputProps) {
  const nudge = (dir: 1 | -1, times = 1) => {
    let v = effective;
    let out = value;
    for (let i = 0; i < times; i++) {
      out = stepRaw(v, dir, { min, max, step });
      v = Number(out);
    }
    onChange(out);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const keys: Record<string, [1 | -1, number]> = {
      ArrowUp: [1, 1],
      ArrowDown: [-1, 1],
      PageUp: [1, 10],
      PageDown: [-1, 10],
    };
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    nudge(k[0], k[1]);
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="relative inline-flex min-w-0 flex-1 items-center">
        <TextInput
          inputMode="decimal"
          role="spinbutton"
          autoComplete="off"
          spellCheck={false}
          invalid={invalid}
          aria-valuenow={effective}
          aria-valuemin={min}
          aria-valuemax={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn('tabular-nums', unit && 'pr-8')}
        />
        {unit ? (
          <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-muted">
            {unit}
          </span>
        ) : null}
      </div>
      <IconButton
        size="sm"
        variant="secondary"
        label={stepDownLabel}
        icon={<ChevronDown />}
        onClick={() => nudge(-1)}
      />
      <IconButton
        size="sm"
        variant="secondary"
        label={stepUpLabel}
        icon={<ChevronUp />}
        onClick={() => nudge(1)}
      />
    </div>
  );
}
