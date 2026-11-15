/**
 * 回答問題的一張卡：卡的內容、可以改寫的問題、回答，與「隨機回答」「清除回答」「問題還原」。
 * PC 的卡另有「重抽這張卡」「從清單挑卡」；關係的卡上面有對象的選單（由呼叫端放進 extra）。
 */
import { Eraser, ListChecks, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button, cn, TextArea } from '@/ui';
import { randomAnswerFor, resetQuestion, setAnswer, setQuestion } from '../actions';
import { cardNo, getDeck } from '../data';
import {
  answerOf,
  catName,
  isPcKey,
  questionEdited,
  questionOf,
  type Scenario,
  slotCard,
  slotCat,
  slotWho,
} from '../model/scenario';
import { setUi, useUi } from '../store';
import { S } from '../strings';
import { textGesture, useCardOps } from './hooks';

export function QaCard({
  sc,
  slotKey,
  extra,
  className,
}: {
  sc: Scenario;
  slotKey: string;
  extra?: ReactNode;
  className?: string;
}) {
  const deck = getDeck(sc.deck);
  const ops = useCardOps();
  const flashing = useUi((s) => s.flash.includes(slotKey));
  const card = slotCard(deck, sc, slotKey);
  /* 打字中的問題（清空也照樣顯示空白，離開後才回到原本的問題） */
  const [draftQ, setDraftQ] = useState<string | null>(null);
  const qId = useId();
  const aId = useId();
  if (!card) return null;
  const answer = answerOf(sc, slotKey);
  const edited = questionEdited(sc, slotKey);
  const who = slotWho(deck, sc, slotKey);
  const pc = isPcKey(slotKey);
  return (
    <article
      data-testid="qa"
      data-slot={slotKey}
      data-card={card.id}
      data-answered={answer ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-3',
        answer ? 'border-accent' : 'border-border',
        flashing && 'bg-accent-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 text-xs text-muted">
        <span className="flex min-w-0 flex-wrap gap-x-2">
          <span className="font-semibold text-accent">{catName(deck, sc, slotCat(slotKey))}</span>
          {who ? <span data-testid="card-who">{who}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums">{S.card.no(cardNo(deck, card.id))}</span>
      </div>
      {extra}
      <h3 className="m-0 text-base font-bold text-fg">{card.title}</h3>
      <p className="m-0 text-sm leading-relaxed text-muted">{card.text}</p>
      <label htmlFor={qId} className="text-xs font-semibold text-fg">
        {S.answers.questionLabel}
      </label>
      <TextArea
        id={qId}
        rows={2}
        data-field="question"
        value={draftQ ?? questionOf(deck, sc, slotKey)}
        onFocus={() => {
          textGesture.begin();
          setDraftQ(questionOf(deck, sc, slotKey));
        }}
        onChange={(e) => {
          setDraftQ(e.target.value);
          setQuestion(slotKey, e.target.value);
        }}
        onBlur={() => {
          setDraftQ(null);
          textGesture.commit();
        }}
      />
      <label htmlFor={aId} className="text-xs font-semibold text-fg">
        {S.answers.answerLabel}
      </label>
      <TextArea
        id={aId}
        rows={3}
        data-field="answer"
        placeholder={S.answers.answerPlaceholder}
        value={answer}
        onFocus={textGesture.begin}
        onChange={(e) => setAnswer(slotKey, e.target.value)}
        onBlur={textGesture.commit}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Sparkles />} onClick={() => randomAnswerFor(slotKey)}>
          {S.answers.random}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Eraser />}
          disabled={!answer}
          onClick={() => setAnswer(slotKey, '')}
        >
          {S.answers.clear}
        </Button>
        {edited ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() => resetQuestion(slotKey)}
          >
            {S.answers.resetQuestion}
          </Button>
        ) : null}
        {pc ? (
          <>
            <span className="flex-1" />
            <Button size="sm" icon={<RefreshCw />} onClick={() => void ops.reroll(slotKey)}>
              {S.answers.rerollCard}
            </Button>
            <Button size="sm" icon={<ListChecks />} onClick={() => setUi({ picker: slotKey })}>
              {S.answers.pickCard}
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
