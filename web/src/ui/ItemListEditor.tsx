/**
 * 可新增、刪除、選取、改名的項目清單（角色清單、使用者、預設集、已儲存的組合…）。
 * - 標題附數量；沒有項目時顯示空清單提示。
 * - onSelect 有給時每一列可以點選（目前選取的醒目標示）；onRename 有給時名稱可以直接改；
 *   新增後游標自動移到新項目的名稱欄。
 * - 刪除：confirmRemove 回傳確認內容時先詢問（共用的確認對話框），回傳 null 時直接刪。
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { type ConfirmOptions, useConfirm } from './Dialog';
import { TextInput } from './TextInput';

export interface ItemListEditorProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** 顯示名稱（空白時顯示 placeholder） */
  getName: (item: T) => string;
  /** 名稱空白時的佔位（預設「未命名」） */
  placeholder?: string;
  /** 清單的無障礙名稱 */
  'aria-label': string;
  /** 標題（會在後面附上數量）；不給就不顯示標題列（新增按鈕仍會顯示） */
  title?: ReactNode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  onRemove?: (id: string) => void;
  /** 刪除前的確認內容（例如說明會連帶刪掉哪些資料）；null 表示不用確認 */
  confirmRemove?: (item: T) => ConfirmOptions | null;
  /** 有給時名稱可以直接改（每打一個字就呼叫） */
  onRename?: (id: string, name: string) => void;
  /** 名稱欄的標籤（預設「名稱」） */
  renameLabel?: string;
  /** 名稱左邊（縮圖、色塊…） */
  renderLeading?: (item: T) => ReactNode;
  /** 名稱下方的小字（ID、提示…） */
  renderMeta?: (item: T) => ReactNode;
  /** 刪除鈕左邊的其他按鈕 */
  renderActions?: (item: T) => ReactNode;
  /** 每一列下方的展開內容（例如角色卡的其他欄位） */
  renderDetails?: (item: T) => ReactNode;
  emptyText?: ReactNode;
  className?: string;
}

export function ItemListEditor<T>({
  items,
  getId,
  getName,
  placeholder = '未命名',
  title,
  selectedId,
  onSelect,
  onAdd,
  addLabel = '新增',
  onRemove,
  confirmRemove,
  onRename,
  renameLabel = '名稱',
  renderLeading,
  renderMeta,
  renderActions,
  renderDetails,
  emptyText = '還沒有任何項目。',
  className,
  ...rest
}: ItemListEditorProps<T>) {
  const confirm = useConfirm();
  const list = useRef<HTMLUListElement>(null);
  const prevCount = useRef(items.length);

  /* 新增後：游標移到新項目的名稱欄 */
  useEffect(() => {
    if (items.length > prevCount.current && onRename) {
      const inputs = list.current?.querySelectorAll<HTMLInputElement>('input[data-item-name]');
      inputs?.[inputs.length - 1]?.focus();
    }
    prevCount.current = items.length;
  }, [items.length, onRename]);

  const remove = async (item: T) => {
    const id = getId(item);
    const opts = confirmRemove?.(item);
    if (opts && !(await confirm({ danger: true, confirmLabel: '刪除', ...opts }))) return;
    onRemove?.(id);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {title || onAdd ? (
        <div className="flex items-center gap-2">
          {title ? (
            <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {title}
              <span className="ml-1 font-normal text-muted tabular-nums">（{items.length}）</span>
            </h3>
          ) : (
            <span className="flex-1" />
          )}
          {onAdd ? (
            <Button size="sm" icon={<Plus />} onClick={onAdd}>
              {addLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      {items.length ? (
        <ul
          ref={list}
          aria-label={rest['aria-label']}
          className="m-0 flex list-none flex-col gap-1.5 p-0"
        >
          {items.map((item) => {
            const id = getId(item);
            const name = getName(item);
            const selected = selectedId === id;
            const label = name.trim() || placeholder;
            return (
              <li
                key={id}
                className={cn(
                  'flex flex-col gap-2 rounded-md border px-2.5 py-2',
                  selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {renderLeading ? <div className="shrink-0">{renderLeading(item)}</div> : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {onRename ? (
                      <TextInput
                        data-item-name=""
                        aria-label={`${renameLabel}（${label}）`}
                        value={name}
                        placeholder={placeholder}
                        onChange={(e) => onRename(id, e.target.value)}
                      />
                    ) : onSelect ? (
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onSelect(id)}
                        className={cn(
                          'min-w-0 truncate rounded-sm text-left text-sm hover:text-accent',
                          name.trim() ? 'text-fg' : 'text-muted',
                        )}
                      >
                        {label}
                      </button>
                    ) : (
                      <span
                        className={cn('truncate text-sm', name.trim() ? 'text-fg' : 'text-muted')}
                      >
                        {label}
                      </span>
                    )}
                    {renderMeta ? (
                      <div className="min-w-0 text-xs text-muted">{renderMeta(item)}</div>
                    ) : null}
                  </div>
                  {onRename && onSelect ? (
                    <Button
                      size="sm"
                      variant={selected ? 'primary' : 'secondary'}
                      aria-pressed={selected}
                      onClick={() => onSelect(id)}
                    >
                      {selected ? '編輯中' : '選取'}
                    </Button>
                  ) : null}
                  {renderActions?.(item)}
                  {onRemove ? (
                    <IconButton
                      label={`刪除「${label}」`}
                      icon={<Trash2 />}
                      size="sm"
                      onClick={() => remove(item)}
                    />
                  ) : null}
                </div>
                {renderDetails ? renderDetails(item) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
          {emptyText}
        </p>
      )}
    </div>
  );
}
