/**
 * 範本庫：卡片格線（縮圖、名稱、說明、標籤），可依標籤篩選；套用前可要求確認（會取代目前設定）。
 * 範本內容一律自己做，不沿用原作的範本。
 */
import { Check } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from './cn';
import { useConfirm } from './Dialog';
import { Segmented } from './Segmented';

export interface TemplateItem<T = unknown> {
  id: string;
  name: string;
  description?: string;
  /** 圖片網址，或自訂的縮圖元素（例如小 canvas、CSS 預覽） */
  thumbnail?: string | ReactNode;
  tags?: readonly string[];
  data: T;
}

export interface TemplateGalleryProps<T> {
  templates: readonly TemplateItem<T>[];
  onApply: (template: TemplateItem<T>) => void;
  /** 目前套用中的範本 id（顯示勾勾） */
  activeId?: string | null;
  /** 套用前確認：true 用預設文字，字串為自訂說明，false 不確認（預設 true） */
  confirm?: boolean | string;
  /** 顯示標籤篩選（預設 true，有標籤時） */
  filter?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function TemplateGallery<T>({
  templates,
  onApply,
  activeId,
  confirm = true,
  filter = true,
  className,
  ...rest
}: TemplateGalleryProps<T>) {
  const ask = useConfirm();
  const tags = [...new Set(templates.flatMap((t) => t.tags ?? []))];
  const [tag, setTag] = useState('__all');
  const list = tag === '__all' ? templates : templates.filter((t) => t.tags?.includes(tag));

  const apply = async (t: TemplateItem<T>) => {
    if (confirm) {
      const ok = await ask({
        title: `套用範本「${t.name}」？`,
        description:
          typeof confirm === 'string' ? confirm : '目前的設定會被範本取代（可以用「復原」回來）。',
        confirmLabel: '套用',
      });
      if (!ok) return;
    }
    onApply(t);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {filter && tags.length > 1 ? (
        <Segmented
          aria-label="範本分類"
          size="sm"
          value={tag}
          onValueChange={setTag}
          options={[
            { value: '__all', label: '全部' },
            ...tags.map((t) => ({ value: t, label: t })),
          ]}
        />
      ) : null}
      <ul
        aria-label={rest['aria-label'] ?? '範本'}
        className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 p-0"
      >
        {list.map((t) => {
          const active = t.id === activeId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => apply(t)}
                aria-pressed={active}
                className={cn(
                  'flex w-full flex-col overflow-hidden rounded-md border bg-surface-2 text-left transition-colors hover:border-accent',
                  active ? 'border-accent ring-1 ring-accent' : 'border-border',
                )}
              >
                <span className="checker relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden">
                  {typeof t.thumbnail === 'string' ? (
                    <img
                      src={t.thumbnail}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    t.thumbnail
                  )}
                  {active ? (
                    <span className="absolute top-1 right-1 rounded-full bg-accent p-0.5 text-accent-contrast">
                      <Check aria-hidden className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col gap-0.5 px-2 py-1.5">
                  <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                  {t.description ? (
                    <span className="line-clamp-2 text-xs text-muted">{t.description}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
