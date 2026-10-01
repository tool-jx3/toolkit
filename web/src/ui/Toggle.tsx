/**
 * 開關（Radix Switch）。可單獨使用（帶 label），或放在 Field layout="inline" 裡（不帶 label）。
 */
import { Switch } from 'radix-ui';
import { useId } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 直接寫在開關右邊的文字；放在 Field 裡時不用給 */
  label?: string;
  /** 沒有可見文字時的無障礙名稱 */
  'aria-label'?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
  ...rest
}: ToggleProps) {
  const field = useFieldControl(rest);
  const auto = useId();
  const labelId = label ? `${auto}-l` : undefined;
  const sw = (
    <Switch.Root
      id={field.id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={rest['aria-label']}
      aria-labelledby={labelId ?? (rest['aria-label'] ? undefined : field['aria-labelledby'])}
      aria-describedby={field['aria-describedby']}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border-strong transition-colors',
        'bg-surface-3 data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50',
        !label && className,
      )}
    >
      <Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-fg shadow-1 transition-transform data-[state=checked]:translate-x-[1.1rem] data-[state=checked]:bg-accent-contrast" />
    </Switch.Root>
  );
  if (!label) return sw;
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      {sw}
      <label
        id={labelId}
        htmlFor={field.id}
        className={cn('text-sm text-fg', disabled && 'opacity-50')}
      >
        {label}
      </label>
    </div>
  );
}
