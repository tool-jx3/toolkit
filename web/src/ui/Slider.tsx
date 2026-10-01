/**
 * 滑桿＋數字欄（Radix Slider＋NumberInput）。可設單位、步進、小數位。
 * 鍵盤：滑桿上 ←／→ 一個 step，PageUp／PageDown 十個，Home／End 到兩端；數字欄見 NumberInput。
 */
import { Slider as S } from 'radix-ui';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';
import { decimalsOf, NumberInput } from './NumberInput';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** 小數位數（預設依 step 決定） */
  precision?: number;
  /** 單位：px、%、秒、° */
  unit?: string;
  /** 顯示數字欄（預設 true） */
  showInput?: boolean;
  /** 數字欄可以輸入超出滑桿範圍的值（例如滑桿 0～100，數字欄允許到 1000） */
  inputMin?: number;
  inputMax?: number;
  /** 拖曳結束、數字欄確定時呼叫 */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  unit,
  showInput = true,
  inputMin,
  inputMax,
  onCommit,
  disabled,
  className,
  ...rest
}: SliderProps) {
  const field = useFieldControl(rest);
  const p = precision ?? decimalsOf(step);
  const shown = Math.min(max, Math.max(min, value));
  return (
    <div className={cn('flex min-w-0 items-center gap-3', fullWidthUnless(className), className)}>
      <S.Root
        value={[shown]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(Number(v.toFixed(p)))}
        onValueCommit={([v]) => onCommit?.(Number(v.toFixed(p)))}
        className="relative flex h-5 min-w-0 flex-1 touch-none select-none items-center data-disabled:opacity-50"
      >
        <S.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
          <S.Range className="absolute h-full rounded-full bg-accent" />
        </S.Track>
        <S.Thumb
          aria-label={rest['aria-label']}
          aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
          aria-describedby={field['aria-describedby']}
          aria-valuetext={`${Number(value.toFixed(p))}${unit ? ` ${unit}` : ''}`}
          className="block size-4 rounded-full border-2 border-accent bg-surface shadow-1 transition-transform hover:scale-110"
        />
      </S.Root>
      {showInput ? (
        <NumberInput
          value={value}
          onChange={onChange}
          onCommit={onCommit}
          min={inputMin ?? min}
          max={inputMax ?? max}
          step={step}
          precision={p}
          unit={unit}
          disabled={disabled}
          id={field.id}
          aria-label={rest['aria-label']}
          aria-labelledby={field['aria-labelledby']}
          aria-describedby={field['aria-describedby']}
          className={unit ? 'w-24 shrink-0' : 'w-18 shrink-0'}
        />
      ) : null}
    </div>
  );
}
