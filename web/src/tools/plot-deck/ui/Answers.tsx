/**
 * 回答問題：體驗的核心與真相 → 舞台與氣氛卡 → 故事的流程，一張卡一列（PC 的卡在「PC 與 NPC」一步）。
 */
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button, useToast } from '@/ui';
import { fillAnswers, setStep } from '../actions';
import { getDeck } from '../data';
import { ANSWER_GROUPS, answeredKeys, type Scenario, toneSlotName } from '../model/scenario';
import { S } from '../strings';
import { QaCard } from './QaCard';

export function AnswersView({ sc }: { sc: Scenario }) {
  const toast = useToast();
  const deck = getDeck(sc.deck);
  const all = ANSWER_GROUPS.flat().filter((k) => !!sc.slots[k].card);
  const slot = toneSlotName(deck, sc);
  return (
    <div className="flex flex-col gap-3" data-testid="answers">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-lg font-bold text-fg">{S.answers.title}</h2>
          <span className="text-sm text-muted" data-testid="answers-count" aria-live="polite">
            {S.answers.answered(answeredKeys(sc, all).length, all.length)}
          </span>
          <span className="flex-1" />
          <Button
            icon={<Sparkles />}
            onClick={() => {
              fillAnswers(all);
              toast({ title: S.answers.filled, tone: 'success', replace: true });
            }}
          >
            {S.answers.fillAll}
          </Button>
        </div>
        <p className="m-0 text-sm text-muted">{S.answers.lead}</p>
      </header>
      {ANSWER_GROUPS.map((keys, gi) => {
        const g = S.answers.groups[gi];
        const title = gi === 1 ? g.title.replace(S.cats.tone, slot) : g.title;
        return (
          <section key={g.title} className="flex flex-col gap-2" data-testid="answer-group">
            <header className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="m-0 text-base font-bold text-fg">
                <span className="mr-2 text-xs text-accent tabular-nums">
                  {String(gi + 1).padStart(2, '0')}
                </span>
                {title}
              </h3>
              <p className="m-0 text-xs text-muted">{g.lead.replace(S.cats.tone, slot)}</p>
            </header>
            <div className="grid gap-3 xl:grid-cols-2">
              {keys.map((k) => (
                <QaCard key={k} sc={sc} slotKey={k} />
              ))}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <p className="m-0 text-xs text-muted">{S.answers.autosaved}</p>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => setStep('cast')}>
          {S.back(S.steps.cast.label)}
        </Button>
        <Button variant="primary" icon={<ArrowRight />} onClick={() => setStep('plot')}>
          {S.next(S.steps.plot.label)}
        </Button>
      </div>
    </div>
  );
}
