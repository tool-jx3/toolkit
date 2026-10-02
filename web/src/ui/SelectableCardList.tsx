/**
 * 可勾選的卡片清單（例如已儲存的表情）：每筆有勾選框、縮圖、標題與摘要、編輯／複製／刪除；
 * 正在編輯的那筆醒目標示；標題列有總數、「已勾選 x／共 y」、全選／全不選／刪除勾選的。
 * 刪除與刪除勾選的確認由工具負責（onDelete、onDeleteChecked 裡呼叫 useConfirm）。
 *
 * ```tsx
 * <SelectableCardList title="表情清單" items={list.map((e) => ({ id: e.id, title: e.label, summary: summaryOf(e), thumbnail: thumbs[e.id], checked: e.checked }))}
 *   editingId={editing} onCheckedChange={setChecked} onEdit={edit} onDuplicate={duplicate} onDelete={remove}
 *   onCheckAll={checkAll} onDeleteChecked={removeChecked} empty="先選部件，再按「儲存表情」。" />
 * ```
 */
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { ThumbnailImage, type ThumbnailSource } from './ThumbnailList';

export interface CardItem {
  id: string;
  /** 標題（空白時顯示 untitled 文字） */
  title: string;
  summary?: ReactNode;
  thumbnail?: ThumbnailSource | null;
  checked: boolean;
}

export interface SelectableCardListProps {
  items: readonly CardItem[];
  /** 清單標題（旁邊顯示總數） */
  title?: string;
  /** 正在編輯的那筆 */
  editingId?: string | null;
  onCheckedChange: (id: string, checked: boolean) => void;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** 全選（true）／全不選（false） */
  onCheckAll?: (checked: boolean) => void;
  onDeleteChecked?: () => void;
  /** 標題空白時的文字（預設「無標籤」） */
  untitled?: string;
  /** 勾選數的說明（預設「已勾選 x／共 y」） */
  checkedLabel?: (checked: number, total: number) => string;
  /** 縮圖大小（px，預設 64） */
  thumbSize?: number;
  empty?: ReactNode;
  /** 標題列右側的其他按鈕 */
  actions?: ReactNode;
  className?: string;
}

export function SelectableCardList({
  items,
  title,
  editingId,
  onCheckedChange,
  onEdit,
  onDuplicate,
  onDelete,
  onCheckAll,
  onDeleteChecked,
  untitled = '無標籤',
  checkedLabel = (c, t) => `已勾選 ${c}／共 ${t}`,
  thumbSize = 64,
  empty,
  actions,
  className,
}: SelectableCardListProps) {
  const checked = items.filter((it) => it.checked).length;
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)} aria-label={title ?? '清單'}>
      <div className="flex flex-wrap items-center gap-2">
        {title ? (
          <h3 className="m-0 text-sm font-semibold text-fg">
            {title}
            <span className="ml-1 font-normal text-muted">（{items.length}）</span>
          </h3>
        ) : null}
        {items.length ? (
          <span className="text-xs text-muted" data-testid="card-list-checked">
            {checkedLabel(checked, items.length)}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {onCheckAll ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={!items.length}
                onClick={() => onCheckAll(true)}
              >
                全選
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!items.length}
                onClick={() => onCheckAll(false)}
              >
                全不選
              </Button>
            </>
          ) : null}
          {onDeleteChecked ? (
            <Button size="sm" variant="ghost" disabled={!items.length} onClick={onDeleteChecked}>
              刪除勾選的
            </Button>
          ) : null}
          {actions}
        </div>
      </div>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((it) => {
            const name = it.title.trim() ? it.title : untitled;
            const editing = it.id === editingId;
            return (
              <li
                key={it.id}
                data-editing={editing || undefined}
                aria-current={editing || undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-1.5',
                  editing ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                )}
              >
                <Checkbox.Root
                  checked={it.checked}
                  onCheckedChange={(v) => onCheckedChange(it.id, v === true)}
                  aria-label={`勾選「${name}」`}
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=checked]:border-accent data-[state=checked]:bg-accent"
                >
                  <Checkbox.Indicator className="text-accent-contrast">
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                      <path
                        d="M3 8.5 6.5 12 13 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <div
                  className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2"
                  style={{ width: thumbSize, height: thumbSize }}
                >
                  <ThumbnailImage source={it.thumbnail} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn('truncate text-sm', it.title.trim() ? 'text-fg' : 'text-muted')}
                    title={it.title}
                  >
                    {name}
                    {editing ? <span className="ml-1 text-xs text-accent">（編輯中）</span> : null}
                  </span>
                  {it.summary ? (
                    <span className="truncate text-xs text-muted">{it.summary}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0">
                  {onEdit ? (
                    <IconButton
                      size="sm"
                      label={`編輯「${name}」`}
                      icon={<Pencil />}
                      onClick={() => onEdit(it.id)}
                    />
                  ) : null}
                  {onDuplicate ? (
                    <IconButton
                      size="sm"
                      label={`複製「${name}」`}
                      icon={<Copy />}
                      onClick={() => onDuplicate(it.id)}
                    />
                  ) : null}
                  {onDelete ? (
                    <IconButton
                      size="sm"
                      label={`刪除「${name}」`}
                      icon={<Trash2 />}
                      onClick={() => onDelete(it.id)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : empty ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {empty}
        </div>
      ) : null}
    </section>
  );
}
