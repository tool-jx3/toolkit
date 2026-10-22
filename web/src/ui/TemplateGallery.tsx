/**
 * 範本庫：卡片格線（縮圖、名稱、說明、標籤），可依標籤篩選；套用前可要求確認（會取代目前設定）。
 * 範本內容一律自己做，不沿用原作的範本。
 * 縮圖可以是函式 `({ playing }) => 元素`：滑鼠停留或鍵盤聚焦的那張卡 playing＝true（例如 LoopThumb 循環播放），其他靜止。
 * 搜尋欄（`search`，選填；floor-plan 2026-10 第三批加）：比對的規則由呼叫端給，分類的按鈕照全部範本算（搜尋時一直看得到），
 * 搜尋與分類同時套用。
 */
import { Check } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { cn } from './cn';
import { useConfirm } from './Dialog';
import { Segmented } from './Segmented';
import { TextInput } from './TextInput';

export interface TemplateItem<T = unknown> {
  id: string;
  name: string;
  description?: string;
  /**
   * 圖片網址、自訂的縮圖元素（例如小 canvas、CSS 預覽），或 `({ playing }) => 元素`
   * （滑鼠停留或鍵盤聚焦時 playing＝true，給會動的縮圖用）
   */
  thumbnail?: string | ReactNode | ((state: { playing: boolean }) => ReactNode);
  tags?: readonly string[];
  data: T;
}

/** 範本庫的搜尋欄（選填） */
export interface TemplateSearch<T> {
  /** 搜尋欄的名稱（aria-label） */
  label: string;
  placeholder?: string;
  /** 這個範本符不符合（query 是使用者打的原文，已去掉前後空白、不是空的） */
  match: (template: TemplateItem<T>, query: string) => boolean;
  /** 沒有符合的範本時的文字（預設「找不到符合的範本。」） */
  empty?: string;
  /** 打字時的建議（例如 `#標籤`）：按一下把搜尋字串換成 value */
  suggest?: (query: string) => readonly { label: string; value: string }[];
  /** 建議那一排的名稱（aria-label，預設「建議」） */
  suggestLabel?: string;
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
  /** 搜尋欄（選填；不給時沒有，行為不變） */
  search?: TemplateSearch<T>;
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
  search,
  className,
  ...rest
}: TemplateGalleryProps<T>) {
  const ask = useConfirm();
  const tags = [...new Set(templates.flatMap((t) => t.tags ?? []))];
  const [tagState, setTag] = useState(defaultTag ?? '__all');
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  /* 範本清單換了（例如換模式）而標籤不存在時回到「全部」 */
  const tag = tagState === '__all' || tags.includes(tagState) ? tagState : '__all';
  const q = query.trim();
  const list = (
    tag === '__all' ? templates : templates.filter((t) => t.tags?.includes(tag))
  ).filter((t) => !search || !q || search.match(t, q));
  const suggestions = search?.suggest && query ? search.suggest(query) : [];
  const sm = size === 'sm';
  /* 停留或聚焦中的卡片（會動的縮圖只有這張在播放） */
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

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
      {search ? (
        <div className="flex flex-col gap-1.5">
          <TextInput
            ref={searchInput}
            type="search"
            value={query}
            placeholder={search.placeholder}
            aria-label={search.label}
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length ? (
            <fieldset
              className="m-0 flex flex-wrap gap-1 border-0 p-0"
              aria-label={search.suggestLabel ?? '建議'}
            >
              {suggestions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg hover:border-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onClick={() => {
                    setQuery(s.value);
                    searchInput.current?.focus();
                  }}
                >
                  {s.label}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}
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
                onPointerEnter={() => setHover(t.id)}
                onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}
                onFocus={() => setFocus(t.id)}
                onBlur={() => setFocus((f) => (f === t.id ? null : f))}
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
                  ) : typeof t.thumbnail === 'function' ? (
                    t.thumbnail({ playing: hover === t.id || focus === t.id })
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
      {search && q && !list.length ? (
        <p className="m-0 text-sm text-muted">{search.empty ?? '找不到符合的範本。'}</p>
      ) : null}
    </div>
  );
}
