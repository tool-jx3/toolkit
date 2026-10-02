/**
 * 一張資訊卡片（F17～F25）：
 * 頁首（記號＋頁首標示、拖曳把手、複製）→ 類型圖示列＋建立副本、刪除 → 色塊、標題欄前綴、標題、後綴（技能成功另有第二標題）→ 內文。
 * 左緣一道代表色的粗色條。內文欄 4～6 行自動長高（F21）。
 */
import { Copy, CopyPlus, GripVertical, Trash2 } from 'lucide-react';
import {
  type KeyboardEvent,
  memo,
  type PointerEventHandler,
  type Ref,
  useLayoutEffect,
  useRef,
} from 'react';
import { Button, cn, IconButton, TextInput, Tooltip } from '@/ui';
import { onTypeColor } from './colors';
import { fitBodyTextarea } from './dom';
import { CARD_TYPES, type Card, type CardType, TYPE_INFO } from './logic';
import { copyCard, deleteCard, duplicateCard, setCardType, updateCard } from './store';
import { S } from './strings';

export interface CardHandleProps {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface CardItemProps {
  card: Card;
  /** 這個主題下各類型的代表色 */
  colors: Readonly<Record<CardType, string>>;
  rowRef: Ref<HTMLElement>;
  handle: CardHandleProps;
  /** 拖曳把手（鍵盤移動後把焦點放回來） */
  handleRef?: Ref<HTMLButtonElement>;
  dragging: boolean;
  /** 拖曳中經過這張（放開時會插到它之前） */
  over: boolean;
  flash: boolean;
}

/** 12 個類型圖示（目前類型實心醒目，滑鼠停留顯示類型名；F18）。卡片其他欄位改變時不重畫 */
const TypeIcons = memo(function TypeIcons({
  id,
  type,
  colors,
}: {
  id: string;
  type: CardType;
  colors: Readonly<Record<CardType, string>>;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一排切換鈕，不是表單欄位群組
    <div role="group" aria-label={S.typeGroup} className="flex flex-wrap gap-0.5">
      {CARD_TYPES.map((t) => {
        const active = t === type;
        const c = colors[t];
        return (
          <Tooltip key={t} content={TYPE_INFO[t].label}>
            <button
              type="button"
              aria-label={TYPE_INFO[t].label}
              aria-pressed={active}
              onClick={() => {
                if (!active) setCardType(id, t);
              }}
              className={cn(
                'flex size-[22px] items-center justify-center rounded-sm border text-xs leading-none transition-colors sm:size-6',
                active ? 'font-bold' : 'border-transparent bg-transparent hover:bg-surface-3',
              )}
              style={
                active ? { background: c, borderColor: c, color: onTypeColor(c) } : { color: c }
              }
            >
              {TYPE_INFO[t].marker}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
});

export function CardItem({
  card,
  colors,
  rowRef,
  handle,
  handleRef,
  dragging,
  over,
  flash,
}: CardItemProps) {
  const t = TYPE_INFO[card.type];
  const color = colors[card.type];
  const body = useRef<HTMLTextAreaElement>(null);
  const name = card.title.trim() || S.untitled;

  /* 內文改變（打字、復原、讀取）時重算高度 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 量的是 DOM，內文改變時要重量
  useLayoutEffect(() => {
    if (body.current) fitBodyTextarea(body.current);
  }, [card.body]);

  return (
    <article
      ref={rowRef}
      data-card-id={card.id}
      data-type={card.type}
      data-dragging={dragging || undefined}
      data-over={over || undefined}
      data-flash={flash || undefined}
      aria-label={`${t.header}：${name}`}
      className={cn(
        'relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-l-[6px] border-border bg-surface p-2 pl-2.5 shadow-1',
        'transition-[opacity,transform,box-shadow] duration-(--duration-fast)',
        dragging && 'scale-[0.995] opacity-[0.48]',
        flash && 'ring-2 ring-accent',
      )}
      style={{ borderLeftColor: color }}
    >
      {over ? (
        <span
          aria-hidden
          data-testid="drop-line"
          className="pointer-events-none absolute -top-[5px] right-1 left-1 h-[3px] rounded-full"
          style={{ background: color }}
        />
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="min-w-0 truncate text-sm font-semibold"
          style={{ color }}
          data-testid="card-header"
        >
          {t.marker} {t.header}
        </span>
        <Tooltip content={S.dragHint}>
          <button
            type="button"
            ref={handleRef}
            data-drag-handle
            aria-label={S.dragHandle(name)}
            {...handle}
            className="flex size-7 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg active:cursor-grabbing [&_svg]:size-4"
          >
            <GripVertical aria-hidden />
          </button>
        </Tooltip>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5">
          <IconButton
            label={S.duplicate}
            icon={<CopyPlus />}
            size="sm"
            onClick={() => duplicateCard(card.id)}
          />
          <IconButton
            label={S.remove}
            icon={<Trash2 />}
            size="sm"
            className="hover:text-danger"
            onClick={() => deleteCard(card.id)}
          />
        </div>
        <Tooltip content={S.copyTitle}>
          <Button
            size="sm"
            variant="primary"
            icon={<Copy />}
            onClick={() => void copyCard(card.id)}
          >
            {S.copy}
          </Button>
        </Tooltip>
      </div>

      <TypeIcons id={card.id} type={card.type} colors={colors} />

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-bold"
          style={{ background: color, color: onTypeColor(color) }}
        >
          {t.marker}
        </span>
        {t.prefix ? (
          <span className="shrink-0 text-sm text-muted" data-testid="title-prefix">
            {t.prefix}
          </span>
        ) : null}
        <TextInput
          aria-label={S.titleLabel(t.header)}
          data-role="title"
          value={card.title}
          placeholder={S.titlePlaceholders[card.type]}
          onChange={(e) => updateCard(card.id, { title: e.target.value })}
          autoComplete="off"
          className="min-w-28 flex-1"
        />
        {t.suffix ? (
          <span className="shrink-0 text-sm text-muted" data-testid="title-suffix">
            {t.suffix}
          </span>
        ) : null}
        {card.type === 'skill' ? (
          <TextInput
            aria-label={S.extraLabel}
            data-role="extra"
            value={card.extra}
            placeholder={S.extraPlaceholder}
            onChange={(e) => updateCard(card.id, { extra: e.target.value })}
            autoComplete="off"
            className="min-w-28 flex-1"
          />
        ) : null}
      </div>

      <textarea
        ref={body}
        aria-label={`${name}：${S.bodyLabel}`}
        data-role="body"
        rows={4}
        value={card.body}
        placeholder={S.bodyPlaceholder}
        onChange={(e) => {
          updateCard(card.id, { body: e.target.value });
          fitBodyTextarea(e.currentTarget);
        }}
        className="block w-full min-w-0 resize-y rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-sm leading-relaxed text-fg placeholder:text-muted hover:border-accent"
      />
    </article>
  );
}
