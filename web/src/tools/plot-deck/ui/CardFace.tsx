/**
 * 卡片：種類、序號、標題、說明、問題、回答、合得來的理由與按鈕（重抽、從清單挑、鎖定、放大看）。
 * 放大看（CardZoom）與從清單挑（CardPicker）是對話框；Esc 或點外面關閉。
 */
import { ListChecks, Lock, LockOpen, Maximize2, RefreshCw, X } from 'lucide-react';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { Button, cn, Dialog, IconButton } from '@/ui';
import { clearSlot, toggleLock } from '../actions';
import { cardNo, cardsOf, type Deck, getDeck } from '../data';
import { type Reason, reasonsOf, weightOf } from '../model/draw';
import {
  answerOf,
  catName,
  isPcKey,
  type Scenario,
  slotCard,
  slotCat,
  slotWho,
} from '../model/scenario';
import { setUi, useUi } from '../store';
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
  /** 故事骨架的順序（1～4） */
  step?: number;
  /** 放大看的對話框裡（字大一點、不再有放大鈕） */
  large?: boolean;
  className?: string;
}

/** 欄上的一張卡（目前的劇本） */
export function CardFace({ sc, slotKey, step, large, className }: CardFaceProps) {
  const deck = getDeck(sc.deck);
  const ops = useCardOps();
  const flashing = useUi((s) => s.flash.includes(slotKey));
  const card = slotCard(deck, sc, slotKey);
  const slot = sc.slots[slotKey];
  const setup = sc.phase === 'setup';
  const cat = slotCat(slotKey);
  const name = catName(deck, sc, cat);
  const who = slotWho(deck, sc, slotKey);
  const answer = answerOf(sc, slotKey);
  const q = card
    ? sc.questions[slotKey]?.card === card.id
      ? sc.questions[slotKey].text
      : card.question
    : '';
  const reasons = card ? reasonsOf(deck, sc, card) : [];
  const openPicker = () => setUi({ zoom: null, picker: slotKey });

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
    if (large) return;
    if (setup) openPicker();
    else if (card) setUi({ zoom: slotKey });
  };

  const actions: ReactNode = setup ? (
    <>
      <Button size="sm" icon={<ListChecks />} onClick={openPicker}>
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
      <Button size="sm" icon={<ListChecks />} disabled={slot.locked} onClick={openPicker}>
        {S.card.pick}
      </Button>
      <Button
        size="sm"
        variant={slot.locked ? 'primary' : 'ghost'}
        icon={slot.locked ? <Lock /> : <LockOpen />}
        aria-pressed={slot.locked}
        title={S.card.lockHint}
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
          {step ? (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-contrast">
              {step}
            </span>
          ) : null}
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
              onClick={() => setUi({ zoom: slotKey })}
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

/** 放大看（目前的劇本的一張卡） */
export function CardZoom() {
  const sc = useCurrent();
  const key = useUi((s) => s.zoom);
  const deck = sc ? getDeck(sc.deck) : null;
  const card = sc && deck && key ? slotCard(deck, sc, key) : null;
  const open = !!(sc && card && key && sc.phase === 'done');
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

/** 從清單挑（目前的劇本的一個欄） */
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
    >
      {open && sc && deck && key ? (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="picker-list">
          {cards.map((c) => {
            const isUsed = used.has(c.id);
            const isCur = c.id === current;
            const w = weightOf(deck, sc, c);
            const notes = reasonsOf(deck, sc, c).map(reasonText);
            const note = isUsed
              ? S.picker.usedElsewhere
              : isCur
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
                  ref={isCur ? curRef : undefined}
                  aria-current={isCur ? 'true' : undefined}
                  disabled={isUsed}
                  onClick={() => {
                    close();
                    void ops.pick(key, c.id);
                  }}
                  className={cn(
                    'flex h-full w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
                    isCur
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-surface hover:bg-surface-2',
                    w === 0 && !isCur && 'opacity-70',
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
