/**
 * 勾選框（Radix Checkbox）：清單裡的多選（配色、字型池…）。單一開關仍用 Toggle。
 * 可單獨使用（帶 label），或放在 Field layout="inline" 裡（不帶 label）。
 */
import { Check } from 'lucide-react';
import { Checkbox as RCheckbox } from 'radix-ui';
import { type ReactNode, useId } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 勾選框右邊的文字（可以是元素，例如色塊＋名稱） */
  label?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
  ...rest
}: CheckboxProps) {
  const field = useFieldControl(rest);
  const auto = useId();
  const labelId = label ? `${auto}-l` : undefined;
  const box = (
    <RCheckbox.Root
      id={field.id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      aria-label={rest['aria-label']}
      aria-labelledby={labelId ?? (rest['aria-label'] ? undefined : field['aria-labelledby'])}
      aria-describedby={field['aria-describedby']}
      className={cn(
        'focus-ring inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-2 transition-colors',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-contrast disabled:opacity-50',
        !label && className,
      )}
    >
      <RCheckbox.Indicator>
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
  if (!label) return box;
  return (
    <div className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {box}
      <label
        id={labelId}
        htmlFor={field.id}
        className={cn('min-w-0 text-sm text-fg', disabled && 'opacity-50')}
      >
        {label}
      </label>
    </div>
  );
}
