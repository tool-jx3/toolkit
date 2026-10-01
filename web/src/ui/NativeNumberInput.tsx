/**
 * 原生數字欄（<input type="number">）：解析、全形數字、無效輸入與微調都照瀏覽器原生的規則。
 *
 * 跟 NumberInput 的差別：NumberInput 自己解析文字、離開欄位時夾到範圍內；這個元件的值就是原生數字欄的值字串，
 * 不夾範圍、不改寫，由工具自己決定怎麼解讀——
 * - 全形數字（「１２」）由瀏覽器轉成「12」；
 * - 瀏覽器視為無效的字串（「5-」「1e」「12e」）值是空字串（欄位裡仍顯示使用者打的字）；
 * - 有效的寫法照原樣（「12.9」「3e1」），可以超出 min／max。
 * 適合規格要求「與瀏覽器原生數字欄相同」的欄位（例如文字方框產生器的寬度上限）。
 *
 * 微調：鍵盤 ↑／↓、滑鼠滾輪由瀏覽器處理。給了 stepLabels 時，右邊顯示「減少／增加」兩個按鈕
 * （取代原生的小箭頭，觸控也按得到），規則與原生微調鈕相同（spinStep）。
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRef } from 'react';
import { IconButton } from './Button';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';
import { inputClass } from './TextInput';

export interface NativeNumberInputProps {
  /** 原生數字欄的值字串（無效的輸入是空字串） */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** 微調的間距（預設 1） */
  step?: number;
  /** 單位（顯示在框內右側） */
  unit?: string;
  /** 給了就在右邊顯示減少／增加按鈕（按鈕的名稱，例如「寬度：增加」） */
  stepLabels?: { up: string; down: string };
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** 小數位數（避免 0.01 這類間距相加時出現 0.020000000000000004） */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const [mant, exp] = String(n).split('e');
  const frac = mant.split('.')[1]?.length ?? 0;
  return Math.max(0, frac - (exp ? Number(exp) : 0));
}

function attrNumber(s: string, fallback: number): number {
  if (s.trim() === '') return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 依瀏覽器原生微調鈕的規則（Chromium 的 spin button）把數字欄加減一格；值有變時送出 input 與 change 事件。
 * - 值不是數字（空白、無效的輸入）：當成 0，先移到「再走一格會落在範圍內」的位置，再走一格
 *   （例：min 10、空白按增加或減少都是 10）；
 * - 比最小值小時按增加 → 最小值；比最大值大時按減少 → 最大值；
 * - 已經在走的方向的邊界上或外面：不變（例：max 100、1000 按增加不變）；
 * - 其他：原生 stepUp()／stepDown()，不在格點上時先對齊格點（例：12.9 按減少 → 12、3e1 按增加 → 31）。
 */
export function spinStep(el: HTMLInputElement, dir: 1 | -1): void {
  if (el.disabled || el.readOnly) return;
  const before = el.value;
  const min = attrNumber(el.min, Number.NEGATIVE_INFINITY);
  const max = attrNumber(el.max, Number.POSITIVE_INFINITY);
  const rawStep = attrNumber(el.step, 1);
  const step = rawStep > 0 ? rawStep : 1;
  let current = el.valueAsNumber;
  if (!Number.isFinite(current)) {
    const diff = step * dir;
    let c = 0;
    if (c < min - diff) c = min - diff;
    if (c > max - diff) c = max - diff;
    const p = Math.max(decimalsOf(step), decimalsOf(min), decimalsOf(max));
    current = Number(c.toFixed(Math.min(p, 20)));
    el.valueAsNumber = current;
  }
  if (dir > 0 && current < min) el.valueAsNumber = min;
  else if (dir < 0 && current > max) el.valueAsNumber = max;
  else if ((dir > 0 && current >= max) || (dir < 0 && current <= min)) {
    /* 已在邊界：不變 */
  } else if (dir > 0) el.stepUp();
  else el.stepDown();
  if (el.value !== before) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function NativeNumberInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  stepLabels,
  invalid,
  disabled,
  placeholder,
  size = 'md',
  className,
  ...rest
}: NativeNumberInputProps) {
  const field = useFieldControl(rest);
  const ref = useRef<HTMLInputElement>(null);
  const bad = invalid || !!field['aria-invalid'];
  const input = (
    <div
      className={cn(
        'relative inline-flex min-w-0 items-center',
        stepLabels ? 'flex-1' : fullWidthUnless(className),
        stepLabels ? undefined : className,
      )}
    >
      <input
        ref={ref}
        type="number"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        id={field.id}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
        aria-describedby={field['aria-describedby']}
        aria-invalid={bad || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(
          bad,
          cn(
            'tabular-nums',
            size === 'sm' ? 'h-7 text-xs' : 'h-8',
            unit && 'pr-8',
            /* 有自己的增減按鈕時藏起原生的小箭頭 */
            stepLabels &&
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          ),
        )}
      />
      {unit ? (
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-muted">
          {unit}
        </span>
      ) : null}
    </div>
  );
  if (!stepLabels) return input;
  const spin = (dir: 1 | -1) => {
    if (ref.current) spinStep(ref.current, dir);
  };
  return (
    <div className={cn('flex min-w-0 items-center gap-1', fullWidthUnless(className), className)}>
      {input}
      <IconButton
        size="sm"
        variant="secondary"
        label={stepLabels.down}
        icon={<ChevronDown />}
        disabled={disabled}
        onClick={() => spin(-1)}
      />
      <IconButton
        size="sm"
        variant="secondary"
        label={stepLabels.up}
        icon={<ChevronUp />}
        disabled={disabled}
        onClick={() => spin(1)}
      />
    </div>
  );
}
