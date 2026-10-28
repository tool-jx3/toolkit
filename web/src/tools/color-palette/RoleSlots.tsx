/**
 * 髮色、瞳色的格子（新增角色的取色視窗、角色的編輯視窗共用）：每一格是一個顏色（「無」畫透明格子、
 * 未指定畫問號），選中的格子有主色外框，滴管取的顏色放進選中的格子；「＋」加一格（最多 5 格），
 * 格子右上角的 × 拿掉那一格（滑過、聚焦、選中時顯示；觸控裝置一直顯示）。
 */
import { Plus, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/ui';
import type { PartColor } from './characters';
import { S } from './strings';

/** CSS 的「無」：透明格子 */
export const CHECKER_CSS =
  'conic-gradient(#dcdcdc 90deg, #f7f7f7 90deg 180deg, #dcdcdc 180deg 270deg, #f7f7f7 270deg) 0 0 / 10px 10px';

export const swatchStyle = (c: PartColor | null): CSSProperties =>
  c ? { background: c.none ? CHECKER_CSS : c.color } : {};

export interface RoleSlotsProps {
  label: string;
  /** 每一格（null＝未指定） */
  slots: readonly (PartColor | null)[];
  /** 選中的格子（null＝這一列沒有選中） */
  active: number | null;
  onSelect: (i: number) => void;
  onAdd?: () => void;
  onRemove?: (i: number) => void;
  max: number;
  /** 只剩一格時也可以拿掉（編輯視窗：拿掉＝沒有這個部位） */
  removeLast?: boolean;
  testId?: string;
}

export function RoleSlots({
  label,
  slots,
  active,
  onSelect,
  onAdd,
  onRemove,
  max,
  removeLast = false,
  testId,
}: RoleSlotsProps) {
  const canRemove = onRemove && (removeLast || slots.length > 1);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      {slots.map((c, i) => {
        const name = S.slotLabel(label, i + 1);
        const value = c ? (c.none ? S.noneLabel : c.color.toUpperCase()) : S.slotUnset;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 位置固定的格子
            key={i}
            className="group relative"
          >
            <button
              type="button"
              aria-label={`${name}：${value}`}
              aria-pressed={active === i}
              data-slot={i}
              data-color={c && !c.none ? c.color : undefined}
              data-none={c?.none || undefined}
              onClick={() => onSelect(i)}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border text-xs font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus',
                active === i
                  ? 'border-accent ring-2 ring-accent'
                  : 'border-border-strong hover:border-accent',
                !c && 'bg-surface-3',
              )}
              style={swatchStyle(c)}
            >
              {c ? slots.length > 1 ? <span className="sr-only">{i + 1}</span> : null : '?'}
            </button>
            {canRemove ? (
              <button
                type="button"
                aria-label={`${S.slotRemove(label)}（${i + 1}）`}
                onClick={() => onRemove?.(i)}
                className={cn(
                  'absolute -top-1.5 -right-1.5 size-4 items-center justify-center rounded-full border border-border-strong bg-surface text-fg [&_svg]:size-3',
                  /* 滑過、聚焦、選中的格子才顯示；觸控裝置（沒有滑過）一直顯示 */
                  active === i
                    ? 'flex'
                    : 'hidden group-focus-within:flex group-hover:flex [@media(hover:none)]:flex',
                )}
              >
                <X aria-hidden />
              </button>
            ) : null}
          </span>
        );
      })}
      {onAdd && slots.length < max ? (
        <button
          type="button"
          aria-label={S.slotAdd(label)}
          onClick={onAdd}
          className="flex size-9 items-center justify-center rounded-md border border-dashed border-border-strong text-muted outline-none hover:border-accent hover:text-fg focus-visible:ring-2 focus-visible:ring-focus [&_svg]:size-4"
        >
          <Plus aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
