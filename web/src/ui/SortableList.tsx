/**
 * 可拖曳排序的清單（SortableList）與圖層清單（LayerList）。
 *
 * SortableList：只管排序與選取，每列的內容由 renderItem 決定。
 * - 拖曳排序（指標事件；門檻 4 px；拖到捲動範圍上下邊緣自動捲動）；`mode="live"`（預設）拖過中線就換位置，
 *   整次拖曳以 onMoveStart／onMoveEnd 包起來（工具在這兩個時機 beginGesture／endGesture，整次拖曳算一步復原）；
 *   `mode="drop"` 放開時才移動。
 * - 鍵盤：列有焦點時 ↑／↓ 移到上一列／下一列並選取，Alt＋↑／↓ 調整順序。
 * - `sortDisabled`（例如篩選中）：不能拖，按住只會選取。
 *
 * LayerList：SortableList＋常見的圖層列：選取、縮圖（底部對齊、左右置中）、名稱、列內數字欄、顯示／隱藏、上移／下移按鈕、緊密列距。
 *
 * ```tsx
 * const g = historyGesture(useBoard);
 * <LayerList aria-label="角色清單" items={rows} selectedId={sel} onSelect={select}
 *   onMove={(a, b) => update((d) => { d.characters = moveItem(d.characters, a, b); })}
 *   onMoveStart={g.begin} onMoveEnd={g.commit}
 *   onVisibleChange={(id, v) => …} number={{ label: '身高', unit: 'cm', min: 1, max: 1000, step: 0.1, onChange: (id, v) => … }}
 *   sortDisabled={filtering} />
 * ```
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';
import { NumberInput } from './NumberInput';
import { ThumbnailImage, type ThumbnailSource } from './ThumbnailList';
import { useSortable } from './useSortable';

export interface SortableItemState {
  index: number;
  selected: boolean;
  /** 正在被拖曳 */
  dragging: boolean;
  /** drop 模式下是目標列 */
  over: boolean;
}

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  renderItem: (item: T, state: SortableItemState) => ReactNode;
  /** 把 from 移到 to（往下落在目標後、往上落在目標前） */
  onMove: (from: number, to: number) => void;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
  mode?: 'live' | 'drop';
  /** 不能排序（例如篩選中）：按住只會選取 */
  sortDisabled?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 沒有項目時 */
  empty?: ReactNode;
  'aria-label': string;
  className?: string;
  /** 每列的 class（可以依狀態） */
  itemClassName?: string | ((item: T, state: SortableItemState) => string | undefined);
}

export function SortableList<T>({
  items,
  getId,
  renderItem,
  onMove,
  onMoveStart,
  onMoveEnd,
  mode = 'live',
  sortDisabled,
  selectedId,
  onSelect,
  empty,
  className,
  itemClassName,
  ...rest
}: SortableListProps<T>) {
  const list = useRef<HTMLUListElement>(null);
  const sortable = useSortable({
    count: items.length,
    mode,
    disabled: sortDisabled,
    onMove,
    onMoveStart: () => onMoveStart?.(),
    onMoveEnd: () => onMoveEnd?.(),
    onClick: (i) => {
      const it = items[i];
      if (it) onSelect?.(getId(it));
    },
  });

  if (!items.length) {
    return empty ? (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        {empty}
      </div>
    ) : null;
  }

  const focusRow = (i: number) => {
    const el = list.current?.querySelectorAll<HTMLElement>(':scope > li')[i];
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest' });
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (sortable.keyMove(i, e)) {
      requestAnimationFrame(() => focusRow(e.key === 'ArrowUp' ? i - 1 : i + 1));
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to >= 0 && to < items.length) {
      e.preventDefault();
      onSelect?.(getId(items[to]));
      focusRow(to);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(getId(items[i]));
    }
  };

  return (
    <ul
      ref={list}
      aria-label={rest['aria-label']}
      className={cn(
        'm-0 flex list-none flex-col gap-1 p-0',
        sortable.dragIndex !== null && 'select-none',
        className,
      )}
      data-sort-disabled={sortDisabled || undefined}
    >
      {items.map((item, index) => {
        const id = getId(item);
        const state: SortableItemState = {
          index,
          selected: id === selectedId,
          dragging: sortable.dragIndex === index,
          over: mode === 'drop' && sortable.overIndex === index && sortable.dragIndex !== index,
        };
        const extra =
          typeof itemClassName === 'function' ? itemClassName(item, state) : itemClassName;
        return (
          <li
            key={id}
            {...sortable.rowProps(index)}
            tabIndex={state.selected || (selectedId == null && index === 0) ? 0 : -1}
            aria-current={state.selected || undefined}
            data-dragging={state.dragging || undefined}
            data-over={state.over || undefined}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cn(
              'relative rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-focus',
              state.selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
              state.dragging && (mode === 'drop' ? 'opacity-50' : 'shadow-2'),
              state.over && 'ring-2 ring-accent',
              extra,
            )}
          >
            {renderItem(item, state)}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- LayerList ---------- */

export interface LayerListItem {
  id: string;
  name: string;
  /** 縮圖（網址或可畫的影像） */
  thumbnail?: ThumbnailSource | null;
  /** 顯示中（預設 true）；隱藏的列整列變淡 */
  visible?: boolean;
  /** 列內數字欄的值 */
  value?: number;
  /** 名稱下的補充說明 */
  meta?: ReactNode;
}

export interface LayerListProps
  extends Omit<SortableListProps<LayerListItem>, 'getId' | 'renderItem' | 'itemClassName'> {
  /** 顯示／隱藏切換（有給才顯示按鈕） */
  onVisibleChange?: (id: string, visible: boolean) => void;
  /** 列內數字欄（有給才顯示） */
  number?: {
    label: string;
    onChange: (id: string, value: number) => void;
    /** 確定修改（離開欄位、Enter、方向鍵）時；搭配 historyGesture 讓一次修改算一步 */
    onCommit?: (id: string, value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    unit?: string;
  };
  /** 上移／下移按鈕（例如「往前一層」「往後一層」）；給了才顯示 */
  moveButtons?: { up: string; down: string };
  /** 縮圖框大小（預設 60 × 84） */
  thumbSize?: { width: number; height: number };
  /** 緊密列距 */
  compact?: boolean;
  /** 列右側的額外按鈕 */
  renderActions?: (item: LayerListItem, index: number) => ReactNode;
}

export function LayerList({
  onVisibleChange,
  number,
  moveButtons,
  thumbSize = { width: 60, height: 84 },
  compact,
  renderActions,
  onMove,
  onMoveStart,
  onMoveEnd,
  items,
  ...rest
}: LayerListProps) {
  const th = compact
    ? { width: thumbSize.width * 0.55, height: thumbSize.height * 0.45 }
    : thumbSize;
  return (
    <SortableList<LayerListItem>
      {...rest}
      items={items}
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      getId={(it) => it.id}
      itemClassName={(it) => cn(it.visible === false && 'opacity-55')}
      renderItem={(item, { index }) => (
        <div
          className={cn(
            'flex items-center gap-2 px-2',
            compact ? 'min-h-11 py-0.5' : 'min-h-17 py-1',
          )}
          data-layer-row={item.id}
        >
          {rest.sortDisabled ? null : (
            <span
              data-drag-handle
              aria-hidden
              className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
            >
              <GripVertical />
            </span>
          )}
          {item.thumbnail !== undefined ? (
            <div
              className="flex shrink-0 items-end justify-center overflow-hidden rounded-sm bg-surface-2"
              style={{ width: th.width, height: th.height }}
            >
              <ThumbnailImage source={item.thumbnail} />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm text-fg" title={item.name}>
              {item.name}
            </span>
            {item.meta && !compact ? (
              <span className="truncate text-xs text-muted">{item.meta}</span>
            ) : null}
          </div>
          {number ? (
            <div className="w-24 shrink-0" data-no-drag>
              <NumberInput
                aria-label={`${item.name}的${number.label}`}
                value={item.value ?? 0}
                onChange={(v) => number.onChange(item.id, v)}
                onCommit={number.onCommit ? (v) => number.onCommit?.(item.id, v) : undefined}
                min={number.min}
                max={number.max}
                step={number.step}
                precision={number.precision}
                unit={number.unit}
                size="sm"
              />
            </div>
          ) : null}
          {moveButtons ? (
            <div className="flex shrink-0">
              <IconButton
                size="sm"
                label={`${moveButtons.up}：${item.name}`}
                icon={<ArrowUp />}
                disabled={index === 0}
                onClick={() => {
                  onMoveStart?.();
                  onMove(index, index - 1);
                  onMoveEnd?.();
                }}
              />
              <IconButton
                size="sm"
                label={`${moveButtons.down}：${item.name}`}
                icon={<ArrowDown />}
                disabled={index === items.length - 1}
                onClick={() => {
                  onMoveStart?.();
                  onMove(index, index + 1);
                  onMoveEnd?.();
                }}
              />
            </div>
          ) : null}
          {renderActions?.(item, index)}
          {onVisibleChange ? (
            <IconButton
              size="sm"
              label={item.visible === false ? `顯示「${item.name}」` : `隱藏「${item.name}」`}
              icon={item.visible === false ? <EyeOff /> : <Eye />}
              pressed={item.visible !== false}
              onClick={() => onVisibleChange(item.id, item.visible === false)}
            />
          ) : null}
        </div>
      )}
    />
  );
}
