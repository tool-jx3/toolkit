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
  /** 一開始選的標籤（預設「全部」） */
  defaultTag?: string;
  /** sm：小卡（縮圖 16:9、不顯示說明，說明改放在滑鼠提示），範本很多時用 */
  size?: 'md' | 'sm';
  'aria-label'?: string;
  className?: string;
}

export function TemplateGallery<T>({
  templates,
  onApply,
  activeId,
  confirm = true,
  filter = true,
  defaultTag,
  size = 'md',
  className,
  ...rest
}: TemplateGalleryProps<T>) {
  const ask = useConfirm();
  const tags = [...new Set(templates.flatMap((t) => t.tags ?? []))];
  const [tagState, setTag] = useState(defaultTag ?? '__all');
  /* 範本清單換了（例如換模式）而標籤不存在時回到「全部」 */
  const tag = tagState === '__all' || tags.includes(tagState) ? tagState : '__all';
  const list = tag === '__all' ? templates : templates.filter((t) => t.tags?.includes(tag));
  const sm = size === 'sm';

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
          className={sm ? 'flex-wrap' : undefined}
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
        className={cn(
          'm-0 grid list-none gap-2 p-0',
          sm
            ? 'grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]'
            : 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]',
        )}
      >
        {list.map((t) => {
          const active = t.id === activeId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => apply(t)}
                aria-pressed={active}
                title={sm ? t.description : undefined}
                className={cn(
                  'flex w-full flex-col overflow-hidden rounded-md border bg-surface-2 text-left transition-colors hover:border-accent',
                  active ? 'border-accent ring-1 ring-accent' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'checker relative flex w-full items-center justify-center overflow-hidden',
                    sm ? 'aspect-video' : 'aspect-[4/3]',
                  )}
                >
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
                <span className={cn('flex flex-col gap-0.5', sm ? 'px-1.5 py-1' : 'px-2 py-1.5')}>
                  <span className={cn('truncate font-medium text-fg', sm ? 'text-xs' : 'text-sm')}>
                    {t.name}
                  </span>
                  {t.description && !sm ? (
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
