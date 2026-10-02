/**
 * 右欄：資訊卡片。
 * 新增卡片（F14）、專案（F29～F32）、類型篩選（F27）、狀態訊息（F38）、卡片清單（拖曳排序 F26）、清單捲動鈕（F28）。
 */
import { ArrowDown, ArrowUp, Plus, Undo2 } from 'lucide-react';
import { type KeyboardEvent, type Ref, useEffect, useRef, useState } from 'react';
import { Button, cn, IconButton, Select, useSortable, useTheme } from '@/ui';
import { CardItem } from './CardItem';
import { onTypeColor, TYPE_COLORS } from './colors';
import { prefersReducedMotion, revealInList } from './dom';
import {
  CARD_TYPES,
  type CardFilter,
  type CardType,
  pageScrollDistance,
  TYPE_INFO,
  TYPE_OPTIONS,
} from './logic';
import { ProjectBar } from './ProjectBar';
import {
  addBlankCard,
  moveCardTo,
  setFilter,
  setNewType,
  useCardUi,
  usePrefs,
  useStatus,
  useWorkspace,
} from './store';
import { S } from './strings';

/** 新卡片、移動後的卡片外框亮起的時間（F14：約 0.9 秒） */
const CARD_FLASH_MS = 900;

function StatusLine() {
  const { message, tone, undoData } = useStatus();
  const current = useWorkspace((s) => s.data);
  const canUndo = !!undoData && undoData === current;
  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={message ? tone : undefined}
      data-testid="status"
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm',
        !message && 'bg-transparent',
        message && tone === 'success' && 'bg-success-soft text-success',
        message && tone === 'warning' && 'bg-warning-soft text-warning',
        message && tone === 'danger' && 'bg-danger-soft text-danger',
        message && (tone === 'info' || tone === 'progress') && 'bg-surface-2 text-fg',
      )}
    >
      <span className="min-w-0 flex-1" data-testid="status-text">
        {message}
      </span>
      {canUndo ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Undo2 />}
          onClick={() => {
            useWorkspace.temporal.getState().undo();
            useStatus.setState({ message: '', undoData: null });
          }}
        >
          {S.undoAction}
        </Button>
      ) : null}
    </div>
  );
}

function FilterRow({
  filter,
  colors,
}: {
  filter: CardFilter;
  colors: Readonly<Record<CardType, string>>;
}) {
  /** color 為 null：「全部」鈕，用主色 */
  const button = (value: CardFilter, label: string, color: string | null, ho: boolean) => {
    const active = filter === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        data-filter={value}
        onClick={() => setFilter(value)}
        className={cn(
          'inline-flex h-7 shrink-0 items-center whitespace-nowrap border px-2 text-xs font-medium transition-colors',
          ho ? 'rounded-full border-dashed' : 'rounded-md',
          !active && 'bg-surface-2 hover:bg-surface-3',
          color === null &&
            (active
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border-strong text-fg'),
        )}
        style={
          color === null
            ? undefined
            : active
              ? { background: color, borderColor: color, color: onTypeColor(color) }
              : { borderColor: color, color }
        }
      >
        {label}
      </button>
    );
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一排切換鈕，不是表單欄位群組
    <div role="group" aria-label={S.filterLabel} className="flex flex-wrap gap-1">
      {button('all', S.filterAll, null, false)}
      {CARD_TYPES.map((t) =>
        button(t, `${TYPE_INFO[t].marker} ${TYPE_INFO[t].label}`, colors[t], TYPE_INFO[t].ho),
      )}
    </div>
  );
}

export function CardsPanel({ ref }: { ref?: Ref<HTMLElement> }) {
  const cards = useWorkspace((s) => s.data.cards);
  const filter = usePrefs((s) => s.data.filter);
  const newType = usePrefs((s) => s.data.newType);
  const reveal = useCardUi((s) => s.reveal);
  const [theme] = useTheme();
  const colors = TYPE_COLORS[theme];
  const list = useRef<HTMLElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [flashId, setFlashId] = useState<string | null>(null);

  const visible = filter === 'all' ? cards : cards.filter((c) => c.type === filter);

  const sortable = useSortable({
    count: visible.length,
    mode: 'drop',
    cancelOutside: true,
    onMove: (from, to) => {
      const source = visible[from];
      const target = visible[to];
      if (source && target) moveCardTo(source.id, target.id, 'before');
    },
  });

  /* 篩選改變時清單捲回頂端（F27） */
  const lastFilter = useRef(filter);
  useEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    if (list.current) list.current.scrollTop = 0;
  }, [filter]);

  /* 新卡片、移動後的卡片：捲到它、外框亮起；新卡片的游標移到標題欄並全選（F14、F26） */
  useEffect(() => {
    if (!reveal) return;
    const box = list.current;
    const el = box?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(reveal.id)}"]`);
    if (!box || !el) return;
    revealInList(box, el, reveal.title ? 'center' : 'nearest', !prefersReducedMotion());
    setFlashId(reveal.id);
    const t = setTimeout(() => setFlashId(null), CARD_FLASH_MS);
    if (reveal.title) {
      const title = el.querySelector<HTMLInputElement>('[data-role="title"]');
      title?.focus({ preventScroll: true });
      title?.select();
    }
    return () => clearTimeout(t);
  }, [reveal]);

  /** 把手聚焦時 ↑／↓ 移動一格（鍵盤也能排序） */
  const onHandleKey = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const card = visible[index];
    const neighbor = visible[e.key === 'ArrowUp' ? index - 1 : index + 1];
    e.preventDefault();
    if (!card || !neighbor) return;
    moveCardTo(card.id, neighbor.id, e.key === 'ArrowUp' ? 'before' : 'after');
    requestAnimationFrame(() => handles.current.get(card.id)?.focus());
  };

  const scrollPage = (dir: 1 | -1) => {
    const box = list.current;
    if (!box) return;
    box.scrollBy({
      top: pageScrollDistance(box.clientHeight) * dir,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const drag = sortable.dragIndex;
  return (
    <section
      ref={ref}
      aria-labelledby="sc-cards-title"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3 lg:h-full lg:min-h-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sc-cards-title" className="m-0 text-base font-semibold text-fg">
          {S.cardsTitle}
        </h2>
        <span className="mr-auto text-xs text-muted" data-testid="card-count">
          {S.cardCount(cards.length, visible.length)}
        </span>
        <Select<CardType>
          aria-label={S.newType}
          value={newType}
          onValueChange={setNewType}
          options={TYPE_OPTIONS}
          className="w-40"
        />
        <Button variant="primary" icon={<Plus />} onClick={() => addBlankCard()}>
          {S.addCard}
        </Button>
      </div>

      <ProjectBar />
      <FilterRow filter={filter} colors={colors} />
      <StatusLine />

      <div className="relative flex min-h-0 flex-col lg:flex-1">
        <section
          ref={list}
          aria-label={S.listLabel}
          tabIndex={-1}
          data-testid="card-list"
          className={cn(
            'flex max-h-[75dvh] min-h-40 flex-col gap-2 overflow-y-auto overscroll-contain p-0.5 pr-1.5 pb-14 outline-none lg:max-h-none lg:flex-1',
            drag !== null && 'select-none',
          )}
        >
          {visible.length ? (
            visible.map((card, i) => {
              const { ref: rowRef, ...pointer } = sortable.rowProps(i);
              return (
                <CardItem
                  key={card.id}
                  card={card}
                  colors={colors}
                  rowRef={rowRef}
                  handle={{
                    ...pointer,
                    onKeyDown: (e) => onHandleKey(i, e),
                  }}
                  handleRef={(el) => {
                    if (el) handles.current.set(card.id, el);
                    else handles.current.delete(card.id);
                  }}
                  dragging={drag === i}
                  over={drag !== null && drag !== i && sortable.overIndex === i}
                  flash={flashId === card.id}
                />
              );
            })
          ) : (
            <p className="m-0 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              {cards.length ? S.listFilteredEmpty : S.listEmpty}
            </p>
          )}
        </section>
        <div className="pointer-events-none absolute right-3 bottom-2 flex flex-col gap-1">
          <IconButton
            label={S.scrollUp}
            icon={<ArrowUp />}
            variant="secondary"
            className="pointer-events-auto shadow-2"
            onClick={() => scrollPage(-1)}
          />
          <IconButton
            label={S.scrollDown}
            icon={<ArrowDown />}
            variant="secondary"
            className="pointer-events-auto shadow-2"
            onClick={() => scrollPage(1)}
          />
        </div>
      </div>
    </section>
  );
}
