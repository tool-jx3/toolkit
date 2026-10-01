/**
 * 3 × 3 的基準位置（錨點）選擇：左上、上中、右上、左中、正中央、右中、左下、下中、右下。
 * 單選（role="radiogroup"），方向鍵在格子間移動並選取，每格有名稱提示。
 */
import { type KeyboardEvent, useRef } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';
import { Tooltip } from './Tooltip';

export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** 由左上到右下的順序 */
export const ANCHORS: readonly Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

export const ANCHOR_LABELS: Readonly<Record<Anchor, string>> = {
  'top-left': '左上',
  top: '上中',
  'top-right': '右上',
  left: '左中',
  center: '正中央',
  right: '右中',
  'bottom-left': '左下',
  bottom: '下中',
  'bottom-right': '右下',
};

/** 錨點的水平與垂直基準：anchorAxes('bottom-left') → { x: 'left', y: 'bottom' } */
export function anchorAxes(a: Anchor): {
  x: 'left' | 'center' | 'right';
  y: 'top' | 'center' | 'bottom';
} {
  const i = ANCHORS.indexOf(a);
  return {
    x: (['left', 'center', 'right'] as const)[i % 3],
    y: (['top', 'center', 'bottom'] as const)[Math.floor(i / 3)],
  };
}

export interface AnchorGridProps {
  value: Anchor;
  onValueChange: (value: Anchor) => void;
  /** 每格的大小 px（預設 28） */
  cellSize?: number;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function AnchorGrid({
  value,
  onValueChange,
  cellSize = 28,
  disabled,
  className,
  ...rest
}: AnchorGridProps) {
  const field = useFieldControl(rest);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    let to = -1;
    if (delta[e.key]) {
      const [dr, dc] = delta[e.key];
      to = ((r + dr + 3) % 3) * 3 + ((c + dc + 3) % 3);
    } else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = 8;
    if (to < 0) return;
    e.preventDefault();
    onValueChange(ANCHORS[to]);
    refs.current[to]?.focus();
  };
  return (
    <div
      role="radiogroup"
      id={field.id}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      className={cn(
        'inline-grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-2 p-1',
        className,
      )}
    >
      {ANCHORS.map((a, i) => {
        const checked = a === value;
        return (
          <Tooltip key={a} content={ANCHOR_LABELS[a]}>
            {/* biome-ignore lint/a11y/useSemanticElements: 3×3 格子要用上下左右在兩個方向移動，原生 radio 做不到 */}
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={ANCHOR_LABELS[a]}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => onValueChange(a)}
              onKeyDown={(e) => move(e, i)}
              className={cn(
                'flex items-center justify-center rounded-sm border transition-colors disabled:opacity-50',
                checked ? 'border-accent bg-accent' : 'border-border bg-surface hover:bg-surface-3',
              )}
              style={{ width: cellSize, height: cellSize }}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  checked ? 'bg-accent-contrast' : 'bg-muted opacity-60',
                )}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
