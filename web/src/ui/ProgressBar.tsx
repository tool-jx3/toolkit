/**
 * 進度條（role=progressbar）：value 0～1；null＝不確定（來回閃動的一段）。
 * 文字（例如「12.3／176.1 MB（7%）」）由呼叫端放在旁邊；label 是給螢幕閱讀器的名稱。
 */
import { cn } from './cn';

export interface ProgressBarProps {
  /** 0～1；null＝不確定 */
  value: number | null;
  /** 螢幕閱讀器念的名稱（或用 aria-labelledby） */
  label?: string;
  'aria-labelledby'?: string;
  /** 螢幕閱讀器念的進度文字（例如「12.3／176.1 MB」） */
  valueText?: string;
  className?: string;
}

export function ProgressBar({
  value,
  label,
  valueText,
  className,
  'aria-labelledby': labelledBy,
}: ProgressBarProps) {
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      role="progressbar"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(pct)}
      aria-valuetext={valueText}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={
          pct === null
            ? 'h-full w-1/3 animate-pulse rounded-full bg-accent'
            : 'h-full rounded-full bg-accent transition-[width] duration-(--duration-fast)'
        }
        style={pct === null ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
