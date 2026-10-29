/**
 * 分頁（Radix Tabs）。設定面板的第一層：例如「文字／樣式／動畫」。
 * 方向鍵切換分頁；內容在切換時保留（forceMount 時）或卸載（預設）。
 *
 * 用滑鼠點分頁時，先讓目前有焦點的輸入欄（input、textarea、select、contenteditable；不在分頁列裡的）失去焦點，
 * 再交給 Radix 切換：Radix 在 mousedown 就換掉內容，欄位被卸載時瀏覽器不送 blur，欄位的 onBlur（例如結束「從進入到離開算一步」
 * 的復原手勢）就不會跑（pl-profile 驗證後修正，2026-10）。鍵盤切換時焦點本來就在分頁上，不受影響。
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

/** 分頁列以外、有焦點的輸入欄先失去焦點（讓它的 onBlur 在被卸載之前跑完） */
export function blurFieldBeforeTabSwitch(trigger: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return;
  if (trigger.closest('[role="tablist"]')?.contains(el)) return;
  if (el.matches('input, textarea, select') || el.isContentEditable) el.blur();
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
            onMouseDown={(e) => {
              if (e.button === 0 && !e.ctrlKey) blurFieldBeforeTabSwitch(e.currentTarget);
            }}
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
