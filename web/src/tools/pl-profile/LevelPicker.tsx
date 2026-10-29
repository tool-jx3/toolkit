/**
 * 五級量表的選擇（規格 F21）：一排五個按鈕（radiogroup，一個 Tab 停留點）。
 * 點一下選；再點一次已選的就清掉（JC 的做法）。鍵盤：←／→ 移動並選取、Home／End、Delete／Backspace 清掉。
 */
import { memo, useRef } from 'react';
import { cn } from '@/ui';
import { LEVELS, type LevelId } from './model';
import { OUT, S } from './strings';

/** 選取中的配色（介面用，配合深淺色主題） */
export const LEVEL_UI: Record<LevelId, string> = {
  love: 'data-[on=true]:bg-success data-[on=true]:text-success-contrast data-[on=true]:border-success',
  like: 'data-[on=true]:bg-success-soft data-[on=true]:text-fg data-[on=true]:border-success',
  ok: 'data-[on=true]:bg-surface-3 data-[on=true]:text-fg data-[on=true]:border-border-strong',
  ask: 'data-[on=true]:bg-warning data-[on=true]:text-warning-contrast data-[on=true]:border-warning',
  ng: 'data-[on=true]:bg-danger data-[on=true]:text-danger-contrast data-[on=true]:border-danger',
};

export const LevelPicker = memo(function LevelPicker({
  value,
  onChange,
  label,
}: {
  value: LevelId | null;
  onChange: (level: LevelId | null) => void;
  /** 主題名稱（radiogroup 的名稱） */
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = value ? LEVELS.indexOf(value) : 0;
  const move = (i: number) => {
    const n = (i + LEVELS.length) % LEVELS.length;
    onChange(LEVELS[n]);
    refs.current[n]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={S.jirai.levelAria(label)}
      className="flex shrink-0 gap-1"
      data-level={value ?? ''}
    >
      {LEVELS.map((l, i) => {
        const on = value === l;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 要能「再點一次清掉」與自訂外觀，用按鈕實作 radio
          <button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={OUT.levels[l]}
            title={`${OUT.levels[l]}：${OUT.levelHints[l]}`}
            tabIndex={i === focusIndex ? 0 : -1}
            data-on={on}
            data-value={l}
            onClick={() => onChange(on ? null : l)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i - 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                move(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                move(LEVELS.length - 1);
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                onChange(null);
              }
            }}
            className={cn(
              'inline-flex h-8 w-9 items-center justify-center rounded-md border border-border bg-surface text-base text-muted outline-none transition-colors',
              'hover:border-border-strong hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus',
              LEVEL_UI[l],
            )}
          >
            <span aria-hidden>{OUT.symbols[l]}</span>
          </button>
        );
      })}
    </div>
  );
});
