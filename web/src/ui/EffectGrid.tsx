/**
 * 效果卡片格（G2：轉場、動態、濾鏡的選擇）：單選的卡片格線，每張有示意動畫（LoopThumb）、名稱與一行副標，可分組。
 *
 * - 鍵盤（標準單選群組）：只有選中的卡片（沒有選取時第一張）可以用 Tab 聚焦進入，Tab 離開格子；
 *   ←／→ 移到上一張／下一張並立即選取，↑／↓ 移到上一列／下一列（依實際排版，跨分組也可以），Home／End 到第一張／最後一張。
 * - `allowDeselect`：再按一次已選中的卡片（點擊、空白鍵、Enter）就取消選取（onValueChange(null)）。
 * - 示意動畫：`draw(ctx, value, t)`（t＝0～1 的循環進度）；預設滑鼠停留或鍵盤聚焦的那一張與選中的那一張播放，其他靜止
 *   （`animate="always"` 全部播放、`"none"` 都不播）。沒給 draw 時不顯示縮圖。
 * - 選中的卡片有主色外框與勾選標記（aria-checked）。
 *
 * ```tsx
 * <EffectGrid aria-label="動態效果" items={EFFECTS} value={effect} onValueChange={setEffect} allowDeselect
 *   draw={drawEffectThumb} thumbWidth={160} thumbHeight={90} period={2} columns={3} />
 * ```
 */
import { Check } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { cn } from './cn';
import { LoopThumb } from './ThumbChoice';

export interface EffectGridItem<V extends string> {
  value: V;
  label: string;
  /** 一行副標（卡片上）；滑鼠停留時也顯示 */
  description?: string;
  /** 分組標題（相同的放在一起，順序依第一次出現） */
  group?: string;
  disabled?: boolean;
}

export interface EffectGridProps<V extends string> {
  items: readonly EffectGridItem<V>[];
  value: V | null;
  onValueChange: (value: V | null) => void;
  /** 再按一次已選中的卡片時取消選取 */
  allowDeselect?: boolean;
  /** 畫示意動畫（t＝循環進度 0～1）；用 useCallback 包好 */
  draw?: (ctx: CanvasRenderingContext2D, value: V, t: number) => void;
  /** 縮圖畫布的像素（預設 160 × 90） */
  thumbWidth?: number;
  thumbHeight?: number;
  /** 示意動畫一輪幾秒（預設 2） */
  period?: number;
  /** 靜止時畫的時間點（預設 0.5） */
  stillTime?: number;
  animate?: 'hover' | 'always' | 'none';
  /** 固定欄數（寬畫面時）；不給時依 minItemWidth 自動排 */
  columns?: number;
  /** 每張卡片的最小寬度（px，預設 132） */
  minItemWidth?: number;
  /** 卡片右上角的額外標記（例如「循環」） */
  renderBadge?: (item: EffectGridItem<V>) => ReactNode;
  'aria-label': string;
  className?: string;
}

/** 一張卡片的示意動畫（draw 與 value 不變時不重畫） */
function EffectThumb<V extends string>({
  draw,
  value,
  ...rest
}: {
  draw: (ctx: CanvasRenderingContext2D, value: V, t: number) => void;
  value: V;
  width: number;
  height: number;
  playing: boolean;
  stillTime: number;
  period: number;
}) {
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, t: number) => draw(ctx, value, t),
    [draw, value],
  );
  return <LoopThumb draw={paint} {...rest} />;
}

interface Group<V extends string> {
  name: string | null;
  items: { item: EffectGridItem<V>; index: number }[];
}

export function EffectGrid<V extends string>({
  items,
  value,
  onValueChange,
  allowDeselect = false,
  draw,
  thumbWidth = 160,
  thumbHeight = 90,
  period = 2,
  stillTime = 0.5,
  animate = 'hover',
  columns,
  minItemWidth = 132,
  renderBadge,
  className,
  ...rest
}: EffectGridProps<V>) {
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const [hot, setHot] = useState<number | null>(null);
  const groups = useMemo(() => {
    const out: Group<V>[] = [];
    items.forEach((item, index) => {
      const name = item.group ?? null;
      let g = out.find((x) => x.name === name);
      if (!g) {
        g = { name, items: [] };
        out.push(g);
      }
      g.items.push({ item, index });
    });
    return out;
  }, [items]);
  /* 依顯示順序（分組後）的索引 */
  const order = useMemo(() => groups.flatMap((g) => g.items.map((x) => x.index)), [groups]);
  const selectedIndex = items.findIndex((it) => it.value === value);
  const tabIndexOf = (i: number) => {
    const target =
      selectedIndex >= 0 && !items[selectedIndex].disabled
        ? selectedIndex
        : (order.find((k) => !items[k].disabled) ?? -1);
    return i === target ? 0 : -1;
  };

  const choose = (i: number, toggle: boolean) => {
    const it = items[i];
    if (!it || it.disabled) return;
    if (toggle && allowDeselect && it.value === value) onValueChange(null);
    else if (it.value !== value) onValueChange(it.value);
  };
  const focusIndex = (i: number) => {
    refs.current.get(i)?.focus();
    choose(i, false);
  };

  /** ↑／↓：依實際位置找上一列／下一列最接近的那一張 */
  const vertical = (from: number, dir: 1 | -1): number | null => {
    const el = refs.current.get(from);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best: number | null = null;
    let bestRow = Infinity;
    let bestDx = Infinity;
    for (const k of order) {
      if (k === from || items[k].disabled) continue;
      const q = refs.current.get(k)?.getBoundingClientRect();
      if (!q) continue;
      const dy = (q.top - r.top) * dir;
      if (dy <= r.height / 2) continue;
      const dx = Math.abs(q.left + q.width / 2 - cx);
      if (dy < bestRow - 1 || (Math.abs(dy - bestRow) <= 1 && dx < bestDx)) {
        best = k;
        bestRow = dy;
        bestDx = dx;
      }
    }
    return best;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const pos = order.indexOf(i);
    const enabled = order.filter((k) => !items[k].disabled);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      for (let s = pos + dir; s >= 0 && s < order.length; s += dir) {
        if (!items[order[s]].disabled) {
          next = order[s];
          break;
        }
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      next = vertical(i, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Home') next = enabled[0] ?? null;
    else if (e.key === 'End') next = enabled[enabled.length - 1] ?? null;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      choose(i, true);
      return;
    } else return;
    e.preventDefault();
    if (next !== null) focusIndex(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn('flex min-w-0 flex-col gap-3', className)}
      data-testid="effect-grid"
    >
      {groups.map((g) => (
        <div key={g.name ?? '_'} className="flex min-w-0 flex-col gap-1.5">
          {g.name ? <div className="text-xs font-semibold text-muted">{g.name}</div> : null}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: columns
                ? `repeat(auto-fill, minmax(min(max(${minItemWidth}px, calc((100% - ${(columns - 1) * 8}px) / ${columns})), 100%), 1fr))`
                : `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))`,
            }}
          >
            {g.items.map(({ item, index }) => {
              const selected = index === selectedIndex;
              const playing =
                animate === 'always' || (animate === 'hover' && (hot === index || selected));
              return (
                // biome-ignore lint/a11y/useSemanticElements: 卡片要放縮圖動畫與說明，用按鈕實作 radio（roving tabindex）
                <button
                  key={item.value}
                  ref={(el) => {
                    if (el) refs.current.set(index, el);
                    else refs.current.delete(index);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={item.description ? `${item.label}：${item.description}` : item.label}
                  title={item.description}
                  disabled={item.disabled}
                  tabIndex={tabIndexOf(index)}
                  data-value={item.value}
                  data-selected={selected || undefined}
                  data-playing={(draw && playing) || undefined}
                  onClick={() => choose(index, true)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  onPointerEnter={() => setHot(index)}
                  onPointerLeave={() => setHot((h) => (h === index ? null : h))}
                  onFocus={() => setHot(index)}
                  onBlur={() => setHot((h) => (h === index ? null : h))}
                  className={cn(
                    'relative flex min-w-0 flex-col overflow-hidden rounded-md border bg-surface text-left',
                    'outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
                    selected
                      ? 'border-accent bg-accent-soft shadow-1'
                      : 'border-border hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  {draw ? (
                    <div
                      className="checker w-full"
                      style={{ aspectRatio: `${thumbWidth} / ${thumbHeight}` }}
                    >
                      <EffectThumb
                        draw={draw}
                        value={item.value}
                        width={thumbWidth}
                        height={thumbHeight}
                        playing={playing}
                        stillTime={stillTime}
                        period={period}
                      />
                    </div>
                  ) : null}
                  <span className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
                    <span className="truncate text-xs font-medium text-fg">{item.label}</span>
                    {item.description ? (
                      <span className="truncate text-xs text-muted">{item.description}</span>
                    ) : null}
                  </span>
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-1 [&_svg]:size-3.5"
                    >
                      <Check />
                    </span>
                  ) : null}
                  {renderBadge ? (
                    <span className="absolute top-1.5 right-1.5">{renderBadge(item)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
