/**
 * 步驟列（例如 ①使用者 → ②立繪與效果 → ③組合與輸出）與「上一步／下一步」。
 * - Stepper：帶編號的步驟按鈕，各附一句短說明（窄螢幕可隱藏）；目前步驟醒目、之前的步驟標示已完成；任何一步都能直接點過去。
 *   方向鍵在步驟間移動焦點（Home／End 到頭尾）。
 * - StepNav：上一步／下一步＋「步驟 n／N」。第一步時上一步不顯示（保留位置），最後一步時下一步停用。
 */
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export interface StepItem {
  label: ReactNode;
  /** 一句短說明 */
  description?: ReactNode;
}

export interface StepperProps {
  steps: readonly StepItem[];
  /** 目前步驟（0 起算） */
  value: number;
  onValueChange: (index: number) => void;
  /** 已完成的步驟（預設：目前步驟之前的都算完成） */
  completed?: (index: number) => boolean;
  /** 窄螢幕（< 640 px）隱藏說明（預設 true） */
  hideDescriptionOnNarrow?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function Stepper({
  steps,
  value,
  onValueChange,
  completed = (i) => i < value,
  hideDescriptionOnNarrow = true,
  className,
  ...rest
}: StepperProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = steps.length;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };
  return (
    <nav aria-label={rest['aria-label'] ?? '步驟'} className={cn('min-w-0', className)}>
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {steps.map((s, i) => {
          const current = i === value;
          const done = !current && completed(i);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 步驟是固定順序的清單
            <li key={i} className="min-w-0 flex-1">
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onValueChange(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn(
                  'flex h-full w-full min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                  current
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    current
                      ? 'bg-accent text-accent-contrast'
                      : done
                        ? 'bg-success text-success-contrast'
                        : 'bg-surface-3 text-fg',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">
                    {s.label}
                    {done ? <span className="sr-only">（已完成）</span> : null}
                  </span>
                  {s.description ? (
                    <span
                      className={cn(
                        'text-xs text-muted',
                        hideDescriptionOnNarrow && 'max-sm:hidden',
                      )}
                    >
                      {s.description}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface StepNavProps {
  value: number;
  count: number;
  onValueChange: (index: number) => void;
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}

export function StepNav({
  value,
  count,
  onValueChange,
  prevLabel = '上一步',
  nextLabel = '下一步',
  className,
}: StepNavProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        icon={<ChevronLeft />}
        onClick={() => onValueChange(value - 1)}
        className={cn(value <= 0 && 'invisible')}
        aria-hidden={value <= 0 ? true : undefined}
        tabIndex={value <= 0 ? -1 : undefined}
      >
        {prevLabel}
      </Button>
      <span className="flex-1 text-center text-sm text-muted tabular-nums">
        步驟 {value + 1}／{count}
      </span>
      <Button
        variant="primary"
        onClick={() => onValueChange(value + 1)}
        disabled={value >= count - 1}
      >
        {nextLabel}
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    </div>
  );
}
