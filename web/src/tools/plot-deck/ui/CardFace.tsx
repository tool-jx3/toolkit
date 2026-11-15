/**
 * 卡片：種類、序號、卡名、說明、提問、回答、搭在哪裡的小標與按鈕（重抽、自己挑、鎖定、放大看）。
 * 放大看（CardZoom）與自己挑（CardPicker）是對話框；Esc 或點外面關閉，關閉後焦點回到打開它的按鈕。
 */
import { ListChecks, Lock, LockOpen, Maximize2, RefreshCw, X } from 'lucide-react';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { Button, cn, Dialog, IconButton } from '@/ui';
import { clearSlot, toggleLock } from '../actions';
import { cardNo, cardsOf, type Deck, getDeck } from '../data';
import { drawWeight, type Reason, reasonsOf } from '../model/draw';
import {
  catName,
  isPcKey,
  replyOf,
  type Scenario,
  slotCard,
  slotCat,
  slotWho,
} from '../model/scenario';
import { openDialog, openerOf, setUi, useUi } from '../store';
import { S } from '../strings';
import { useCardOps, useCurrent } from './hooks';

export function reasonText(r: Reason): string {
  switch (r.kind) {
    case 'core':
      return S.reasons.core;
    case 'truth':
      return S.reasons.truth;
    case 'locked':
      return S.reasons.locked;
    case 'mission':
      return S.reasons.mission(r.name);
    case 'tone':
      return S.reasons.tone(r.name);
  }
}

export function ReasonChips({ reasons }: { reasons: Reason[] }) {
  if (!reasons.length) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0" data-testid="card-reasons">
      {reasons.map((r) => (
        <li key={reasonText(r)} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-fg">
          {reasonText(r)}
        </li>
      ))}
    </ul>
  );
}

export interface CardFaceProps {
  sc: Scenario;
  slotKey: string;
  /** 放大看的對話框裡（字大一點、不再有打開鈕） */
  large?: boolean;
  className?: string;
}

/** 欄上的一張卡（目前的劇本） */
export function CardFace({ sc, slotKey, large, className }: CardFaceProps) {
  const deck = getDeck(sc.deck);
  const ops = useCardOps();
  const flashing = useUi((s) => s.flash.includes(slotKey));
  const card = slotCard(deck, sc, slotKey);
  const slot = sc.slots[slotKey];
  const setup = sc.phase === 'setup';
  const cat = slotCat(slotKey);
  const name = catName(deck, sc, cat);
  const who = slotWho(deck, sc, slotKey);
  const answer = replyOf(sc, slotKey);
  const q = card
    ? sc.questions[slotKey]?.card === card.id
      ? sc.questions[slotKey].text
      : card.question
    : '';
  const reasons = card ? reasonsOf(deck, sc, card) : [];
  const pickFor = (e: MouseEvent<HTMLElement>) =>
    openDialog('picker', { zoom: null, picker: slotKey }, e.currentTarget);

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
    if (large) return;
    if (setup) pickFor(e);
    else if (card) openDialog('zoom', { zoom: slotKey }, e.currentTarget);
  };

  const actions: ReactNode = setup ? (
    <>
      <Button size="sm" icon={<ListChecks />} data-action="pick" onClick={pickFor}>
        {S.card.pick}
      </Button>
      {card ? (
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => clearSlot(slotKey)}>
          {S.setup.clear}
        </Button>
      ) : null}
    </>
  ) : (
    <>
      <Button
        size="sm"
        icon={<RefreshCw />}
        disabled={slot.locked}
        onClick={() => void ops.reroll(slotKey)}
        aria-label={S.card.rerollFull(name)}
      >
        {S.card.reroll}
      </Button>
      <Button
        size="sm"
        icon={<ListChecks />}
        disabled={slot.locked}
        data-action="pick"
        onClick={pickFor}
      >
        {S.card.pick}
      </Button>
      <Button
        size="sm"
        variant={slot.locked ? 'primary' : 'ghost'}
        icon={slot.locked ? <Lock /> : <LockOpen />}
        aria-pressed={slot.locked}
        title={S.card.lockHint}
        disabled={!card}
        onClick={() => toggleLock(slotKey)}
      >
        {slot.locked ? S.card.locked : S.card.lock}
      </Button>
    </>
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 點卡片的空白處＝放大看（鍵盤用「放大看」的按鈕）
    <article
      data-testid="card"
      data-slot={slotKey}
      data-card={card?.id ?? ''}
      data-locked={slot.locked ? 'true' : undefined}
      data-flash={flashing ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-3 transition-colors',
        card ? 'border-border' : 'border-dashed border-border-strong',
        slot.locked && 'border-accent',
        flashing && 'bg-accent-soft',
        !large && (setup || card) && 'cursor-pointer hover:bg-surface-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 text-xs text-muted">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold text-accent">{name}</span>
          {who ? <span data-testid="card-who">{who}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {card ? <span className="tabular-nums">{S.card.no(cardNo(deck, card.id))}</span> : null}
          {card && !large && !setup ? (
            <IconButton
              size="sm"
              variant="ghost"
              label={S.card.zoom}
              icon={<Maximize2 />}
              data-action="zoom"
              onClick={(e) => openDialog('zoom', { zoom: slotKey }, e.currentTarget)}
            />
          ) : null}
        </span>
      </div>
      {card ? (
        <>
          <h3 className={cn('m-0 font-bold leading-snug text-fg', large ? 'text-xl' : 'text-base')}>
            {card.title}
          </h3>
          <p className={cn('m-0 leading-relaxed text-muted', large ? 'text-base' : 'text-sm')}>
            {card.text}
          </p>
          <p className={cn('m-0 leading-relaxed text-fg', large ? 'text-base' : 'text-sm')}>
            <span className="mr-1.5 text-xs font-semibold text-accent">{S.card.question}</span>
            <span data-testid="card-question">{q}</span>
          </p>
          {answer ? (
            <p
              data-testid="card-answer"
              className="m-0 whitespace-pre-wrap break-words rounded-sm border-l-2 border-accent bg-surface-2 px-2 py-1 text-sm text-fg"
            >
              {answer}
            </p>
          ) : null}
          {cat === 'core' ? (
            <p className="m-0 text-xs font-semibold text-accent">
              {setup ? S.card.coreSetup : S.card.coreBase}
            </p>
          ) : cat === 'truth' && !setup ? (
            <p className="m-0 text-xs font-semibold text-accent">{S.card.truthBase}</p>
          ) : null}
          <ReasonChips reasons={reasons} />
        </>
      ) : (
        <p className="m-0 text-base font-semibold text-muted">{S.card.empty}</p>
      )}
      {isPcKey(slotKey) ? null : (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">{actions}</div>
      )}
    </article>
  );
}

/** 關閉後焦點的備用位置：頁面上同一欄的按鈕（卡面、列表、填答） */
const backTo = (key: string, actions: readonly string[]): string[] =>
  actions.flatMap((a) => [
    `[data-testid="card"][data-slot="${key}"] [data-action="${a}"]`,
    `[data-testid="desk-row"][data-slot="${key}"] [data-action="${a}"]`,
    `[data-testid="qa"][data-slot="${key}"] [data-action="${a}"]`,
  ]);

/** 放大看（目前的劇本的一張卡） */
export function CardZoom() {
  const sc = useCurrent();
  const key = useUi((s) => s.zoom);
  const deck = sc ? getDeck(sc.deck) : null;
  const card = sc && deck && key ? slotCard(deck, sc, key) : null;
  const open = !!(sc && card && key && sc.phase === 'done');
  /* 關閉的那一次重繪時 key 已經是 null，焦點要回去的地方用最後打開的那一欄算 */
  const last = useRef<string | null>(null);
  if (key) last.current = key;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setUi({ zoom: null });
      }}
      title={
        sc && deck && card && key
          ? S.card.zoomTitle(catName(deck, sc, slotCat(key)), card.title)
          : ''
      }
      description={S.card.zoomHint}
      size="md"
      returnFocus={last.current ? openerOf('zoom', backTo(last.current, ['zoom', 'pick'])) : null}
    >
      {sc && key && open ? (
        <div data-testid="card-zoom">
          <CardFace sc={sc} slotKey={key} large />
        </div>
      ) : null}
    </Dialog>
  );
}

function pickerNote(sc: Scenario, key: string): string {
  if (key === 'core') return sc.phase === 'done' ? S.picker.coreNoteDone : S.picker.coreNoteSetup;
  if (sc.phase === 'setup') return S.picker.setupNote;
  if (key === 'truth') return S.picker.truthNote;
  return '';
}

/** 自己挑（目前的劇本的一個欄） */
export function CardPicker() {
  const sc = useCurrent();
  const key = useUi((s) => s.picker);
  const ops = useCardOps();
  const deck: Deck | null = sc ? getDeck(sc.deck) : null;
  const open = !!(sc && deck && key && sc.slots[key]);
  const cat = key ? slotCat(key) : 'core';
  const cards = deck ? cardsOf(deck, cat) : [];
  const used = new Set(
    sc && key
      ? Object.entries(sc.slots)
          .filter(([k, s]) => k !== key && slotCat(k) === cat && s.card)
          .map(([, s]) => s.card as string)
      : [],
  );
  const current = sc && key ? sc.slots[key]?.card : null;
  const close = () => setUi({ picker: null });
  const curRef = useRef<HTMLButtonElement>(null);
  const last = useRef<string | null>(null);
  if (key) last.current = key;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={
        sc && deck && key ? S.picker.title(catName(deck, sc, cat), slotWho(deck, sc, key)) : ''
      }
      description={sc && key ? pickerNote(sc, key) || S.picker.count(cards.length) : undefined}
      size="lg"
      initialFocus={current ? curRef : undefined}
      returnFocus={last.current ? openerOf('picker', backTo(last.current, ['pick', 'zoom'])) : null}
    >
      {open && sc && deck && key ? (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="picker-list">
          {cards.map((c) => {
            const isUsed = used.has(c.id);
            const isCurrent = c.id === current;
            const w = drawWeight(deck, sc, c);
            const notes = reasonsOf(deck, sc, c).map(reasonText);
            const note = isUsed
              ? S.picker.usedElsewhere
              : isCurrent
                ? S.picker.current
                : w === 0
                  ? S.picker.unfit
                  : notes.join('・');
            return (
              <li key={c.id} className="min-w-0">
                <button
                  type="button"
                  data-testid="picker-option"
                  data-card={c.id}
                  ref={isCurrent ? curRef : undefined}
                  aria-current={isCurrent ? 'true' : undefined}
                  disabled={isUsed}
                  onClick={() => {
                    close();
                    void ops.pick(key, c.id);
                  }}
                  className={cn(
                    'flex h-full w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
                    isCurrent
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-surface hover:bg-surface-2',
                    w === 0 && !isCurrent && 'opacity-70',
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="tabular-nums">{S.card.no(cardNo(deck, c.id))}</span>
                    {note ? <span className="font-semibold text-accent">{note}</span> : null}
                  </span>
                  <strong className="text-sm text-fg">{c.title}</strong>
                  <span className="text-xs leading-relaxed text-muted">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Dialog>
  );
}
