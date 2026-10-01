/**
 * 下拉選單（Radix Select）。選項多於 5 個時使用；少的話用 Segmented。
 */
import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** 選單裡的第二行說明 */
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectGroup<V extends string = string> {
  label: string;
  options: readonly SelectOption<V>[];
}

export interface SelectProps<V extends string = string> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly (SelectOption<V> | SelectGroup<V>)[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const isGroup = <V extends string>(o: SelectOption<V> | SelectGroup<V>): o is SelectGroup<V> =>
  'options' in o;

function Item<V extends string>({ o }: { o: SelectOption<V> }) {
  return (
    <S.Item
      value={o.value}
      disabled={o.disabled}
      className="relative flex cursor-pointer select-none flex-col rounded-sm py-1.5 pr-2 pl-7 text-sm text-fg outline-none data-disabled:opacity-40 data-highlighted:bg-accent-soft"
    >
      <S.ItemIndicator className="absolute top-2 left-1.5 text-accent">
        <Check className="size-4" aria-hidden />
      </S.ItemIndicator>
      <S.ItemText>{o.label}</S.ItemText>
      {o.description ? <span className="text-xs text-muted">{o.description}</span> : null}
    </S.Item>
  );
}

export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  size = 'md',
  className,
  ...rest
}: SelectProps<V>) {
  const field = useFieldControl(rest);
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled}>
      <S.Trigger
        id={field.id}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
        aria-describedby={field['aria-describedby']}
        className={cn(
          'inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface-2 px-2.5 text-left text-fg',
          fullWidthUnless(className),
          'hover:bg-surface-3 disabled:opacity-50 data-placeholder:text-muted',
          size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
          className,
        )}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface shadow-2"
        >
          <S.Viewport className="p-1">
            {options.map((o) =>
              isGroup(o) ? (
                <S.Group key={`g-${o.label}`}>
                  <S.Label className="px-2 pt-2 pb-1 text-xs font-medium text-muted">
                    {o.label}
                  </S.Label>
                  {o.options.map((x) => (
                    <Item key={x.value} o={x} />
                  ))}
                </S.Group>
              ) : (
                <Item key={o.value} o={o} />
              ),
            )}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
