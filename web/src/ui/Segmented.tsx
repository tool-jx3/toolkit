/**
 * 分段選擇（Radix ToggleGroup，單選）。選項少（2～5 個）時取代下拉選單。
 * 方向鍵在選項間移動；不能取消選取（一定有一個值）。
 */
import { ToggleGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  /** 只有圖示時必填，給螢幕閱讀器 */
  ariaLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  'aria-label'?: string;
  'aria-labelledby'?: string;
  size?: 'sm' | 'md';
  /** 撐滿寬度、平均分配 */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  fullWidth,
  disabled,
  className,
  ...rest
}: SegmentedProps<V>) {
  const field = useFieldControl(rest);
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as V);
      }}
      disabled={disabled}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      id={field.id}
      className={cn(
        'inline-flex max-w-full rounded-md border border-border bg-surface-2 p-0.5',
        fullWidth && 'flex w-full flex-wrap',
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.ariaLabel}
          className={cn(
            'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm px-2.5 font-medium text-muted transition-colors',
            'hover:text-fg data-[state=on]:bg-accent data-[state=on]:text-accent-contrast disabled:opacity-40',
            '[&_svg]:size-4',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
            fullWidth && 'flex-[1_0_auto]',
          )}
        >
          {o.icon ? (
            <span aria-hidden className="inline-flex">
              {o.icon}
            </span>
          ) : null}
          {o.label ? <span className="truncate">{o.label}</span> : null}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
