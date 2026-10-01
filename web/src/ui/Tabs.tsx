/**
 * 分頁（Radix Tabs）。設定面板的第一層：例如「文字／樣式／動畫」。
 * 方向鍵切換分頁；內容在切換時保留（forceMount 時）或卸載（預設）。
 */
import { Tabs as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string> {
  items: readonly TabItem<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  /** 分頁列的無障礙名稱，例如「設定分類」 */
  'aria-label'?: string;
  /** 切換時保留各分頁內容（例如有捲動位置或未存的輸入） */
  keepMounted?: boolean;
  className?: string;
  listClassName?: string;
}

export function Tabs<V extends string = string>({
  items,
  value,
  defaultValue,
  onValueChange,
  keepMounted,
  className,
  listClassName,
  ...rest
}: TabsProps<V>) {
  return (
    <T.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(v) => onValueChange?.(v as V)}
      className={cn('flex min-w-0 flex-col', className)}
    >
      <T.List
        aria-label={rest['aria-label']}
        className={cn('flex shrink-0 flex-wrap gap-x-1 border-b border-border', listClassName)}
      >
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            disabled={it.disabled}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-sm font-medium text-muted',
              'hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg disabled:opacity-40 [&_svg]:size-4',
            )}
          >
            {it.icon ? (
              <span aria-hidden className="inline-flex">
                {it.icon}
              </span>
            ) : null}
            {it.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((it) => (
        <T.Content
          key={it.value}
          value={it.value}
          forceMount={keepMounted ? true : undefined}
          className="min-w-0 pt-3 data-[state=inactive]:hidden"
        >
          {it.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
