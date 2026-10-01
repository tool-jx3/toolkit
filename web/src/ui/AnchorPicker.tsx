/**
 * 九宮格位置選擇（錨點）：左上、上方中央、右上…右下。
 * 鍵盤：方向鍵在九格之間移動並選取（radiogroup，只有選中的格子在 Tab 順序裡）。
 * 值的寫法：t／m／b（上中下）＋ l／c／r（左中右），例如 'mc'＝正中央、'bl'＝左下（同 core/typeset 的 Anchor）。
 */
import { type KeyboardEvent, useRef } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export type AnchorValue = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export const ANCHOR_VALUES: readonly AnchorValue[] = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mc',
  'mr',
  'bl',
  'bc',
  'br',
];

export const ANCHOR_LABELS: Record<AnchorValue, string> = {
  tl: '左上',
  tc: '上方中央',
  tr: '右上',
  ml: '左側中央',
  mc: '正中央',
  mr: '右側中央',
  bl: '左下',
  bc: '下方中央',
  br: '右下',
};

export interface AnchorPickerProps {
  value: AnchorValue | string;
  onChange: (value: AnchorValue) => void;
  /** 每格的名稱（預設 ANCHOR_LABELS） */
  labels?: Partial<Record<AnchorValue, string>>;
  /** 在格子右邊顯示目前選到的名稱（預設 true） */
  showLabel?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function AnchorPicker({
  value,
  onChange,
  labels,
  showLabel = true,
  disabled,
  className,
  ...rest
}: AnchorPickerProps) {
  const field = useFieldControl(rest);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const name = (v: AnchorValue) => labels?.[v] ?? ANCHOR_LABELS[v];
  const current = ANCHOR_VALUES.indexOf(value as AnchorValue);
  const focusIndex = current >= 0 ? current : 4;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    let r = row;
    let c = col;
    if (e.key === 'ArrowLeft') c = Math.max(0, col - 1);
    else if (e.key === 'ArrowRight') c = Math.min(2, col + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, row - 1);
    else if (e.key === 'ArrowDown') r = Math.min(2, row + 1);
    else if (e.key === 'Home') {
      r = 0;
      c = 0;
    } else if (e.key === 'End') {
      r = 2;
      c = 2;
    } else return;
    e.preventDefault();
    const next = r * 3 + c;
    onChange(ANCHOR_VALUES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="radiogroup"
        id={field.id}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
        aria-describedby={field['aria-describedby']}
        className="grid shrink-0 grid-cols-3 gap-1 rounded-md border border-border bg-surface-2 p-1"
      >
        {ANCHOR_VALUES.map((v, i) => {
          const on = v === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: 九宮格要自訂外觀與上下左右的方向鍵，用按鈕實作 radio
            <button
              key={v}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={name(v)}
              title={name(v)}
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(v)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'flex size-7 items-center justify-center rounded-sm transition-colors hover:bg-surface-3 disabled:opacity-50',
                on && 'bg-accent hover:bg-accent',
              )}
            >
              <span
                aria-hidden
                className={cn('block size-2 rounded-full', on ? 'bg-accent-contrast' : 'bg-muted')}
              />
            </button>
          );
        })}
      </div>
      {showLabel ? (
        <span className="text-sm text-muted" aria-hidden>
          {name(value as AnchorValue) ?? ''}
        </span>
      ) : null}
    </div>
  );
}
