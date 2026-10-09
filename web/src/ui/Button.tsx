/**
 * 按鈕與圖示按鈕。圖示按鈕一定要給 label（會成為 aria-label 與提示文字）。
 */
import { Loader2 } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover border border-transparent',
  secondary:
    'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-danger-contrast border border-transparent hover:opacity-90',
};

/** 切換型按鈕按下時：取代變體的底色、字色與框（兩個底色並存時哪個生效看 CSS 的順序，按下的樣子會被蓋掉） */
const PRESSED = 'bg-accent-soft text-accent border border-accent';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-base gap-2',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
  pressed?: boolean,
) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium',
    'transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    pressed ? PRESSED : VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 文字左邊的圖示 */
  icon?: ReactNode;
  /** 顯示轉圈並停用 */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : icon ? (
        <span aria-hidden className="inline-flex [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  /** 按鈕的文字說明（aria-label＋提示） */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 切換型按鈕的狀態（aria-pressed） */
  pressed?: boolean;
  /** 不顯示滑鼠提示 */
  noTooltip?: boolean;
}

const ICON_SIZES: Record<ButtonSize, string> = { sm: 'size-7', md: 'size-8', lg: 'size-10' };

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  pressed,
  noTooltip,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const btn = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        buttonClass(variant, size, undefined, pressed),
        ICON_SIZES[size],
        'px-0 [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      <span aria-hidden className="inline-flex">
        {icon}
      </span>
    </button>
  );
  return noTooltip ? btn : <Tooltip content={label}>{btn}</Tooltip>;
}
