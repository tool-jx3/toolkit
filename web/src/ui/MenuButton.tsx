/**
 * 按鈕＋下拉選單（scenario-editor 2026-10 新增；外觀同 ProjectMenu 的選單）：按下按鈕打開選單，
 * 每一項可以有第二行說明、快捷鍵提示、停用。焦點與鍵盤照 Radix DropdownMenu（↑↓ 移動、Enter 選取、Esc 關閉）。
 *
 * ```tsx
 * <MenuButton label="儲存" icon={<Save />} items={[
 *   { label: '存到瀏覽器', description: '加上名稱留在「過去的版本」', onSelect: saveToBrowser },
 *   { label: '存成 JSON 檔', shortcut: 'mod+s', onSelect: saveFile },
 * ]} />
 * ```
 */
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { type ButtonSize, type ButtonVariant, buttonClass } from './Button';
import { comboText } from './shortcuts';

export interface MenuButtonItem {
  label: ReactNode;
  /** 第二行的說明（小字） */
  description?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** 快捷鍵（例 'mod+s'；顯示在右邊） */
  shortcut?: string;
  /** 測試用 */
  'data-testid'?: string;
}

export interface MenuButtonProps {
  /** 按鈕上的字 */
  label: ReactNode;
  icon?: ReactNode;
  items: readonly MenuButtonItem[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 按鈕的提示（title） */
  title?: string;
  'aria-label'?: string;
  /** 選單的名稱（螢幕閱讀器念；預設同按鈕） */
  menuLabel?: string;
  /** 選單對齊按鈕的哪一邊（預設 start） */
  align?: 'start' | 'end';
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

const itemClass =
  'flex cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-fg outline-none data-highlighted:bg-accent-soft data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted';

export function MenuButton({
  label,
  icon,
  items,
  variant = 'secondary',
  size = 'sm',
  title,
  menuLabel,
  align = 'start',
  disabled,
  className,
  ...rest
}: MenuButtonProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={buttonClass(variant, size, className)}
        disabled={disabled}
        title={title}
        aria-label={rest['aria-label']}
        data-testid={rest['data-testid']}
      >
        {icon ? (
          <span aria-hidden className="inline-flex [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        {label}
        <ChevronDown aria-hidden className="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          aria-label={menuLabel ?? (typeof label === 'string' ? label : undefined)}
          /* 有給 menuLabel 時用它當名稱（Radix 預設以按鈕當名稱的 aria-labelledby 會蓋過 aria-label） */
          {...(menuLabel ? { 'aria-labelledby': undefined } : {})}
          className="z-50 min-w-56 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-1 shadow-2"
        >
          {items.map((it, i) => (
            <DropdownMenu.Item
              // biome-ignore lint/suspicious/noArrayIndexKey: 選單項目的順序固定
              key={i}
              className={itemClass}
              disabled={it.disabled}
              onSelect={it.onSelect}
              data-testid={it['data-testid']}
            >
              {it.icon ? <span aria-hidden>{it.icon}</span> : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{it.label}</span>
                {it.description ? (
                  <span className="text-xs text-muted">{it.description}</span>
                ) : null}
              </span>
              {it.shortcut ? (
                <span className="ml-3 shrink-0 text-xs text-muted">{comboText(it.shortcut)}</span>
              ) : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
