/**
 * 抽卡的一步：體驗的核心、故事的骨架（導入 → 障礙 → 真相 → 結局）、舞台與氣氛卡；卡片或清單兩種顯示方式。
 */
import { ArrowRight, ListChecks, Lock, LockOpen, RefreshCw, Shuffle } from 'lucide-react';
import { Button, cn, Segmented } from '@/ui';
import { setStep, toggleLock } from '../actions';
import { getDeck } from '../data';
import {
  answerOf,
  catName,
  FLOW_KEYS,
  questionOf,
  type Scenario,
  STAGE_KEYS,
  slotCard,
  slotCat,
  toneSlotName,
} from '../model/scenario';
import { type DeskMode, setUi, usePrefs, useUi } from '../store';
import { S } from '../strings';
import { CardFace } from './CardFace';
import { useCardOps } from './hooks';
import { MissionToneStrip } from './Synopsis';

function Group({
  title,
  lead,
  children,
  testId,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="m-0 text-base font-bold text-fg">{title}</h3>
        <p className="m-0 text-xs text-muted">{lead}</p>
      </header>
      {children}
    </section>
  );
}

/** 三組卡（照條件抽與抽好之後共用） */
export function DeskGroups({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const G = S.desk.groups;
  const stage = G.stage(toneSlotName(deck, sc));
  return (
    <div className="flex flex-col gap-4">
      <Group title={G.core.title} lead={G.core.lead} testId="group-core">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CardFace sc={sc} slotKey="core" className="md:col-span-2" />
        </div>
      </Group>
      <Group title={G.flow.title} lead={G.flow.lead} testId="group-flow">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FLOW_KEYS.map((k, i) => (
            <CardFace key={k} sc={sc} slotKey={k} step={i + 1} />
          ))}
        </div>
      </Group>
      <Group title={stage.title} lead={stage.lead} testId="group-stage">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STAGE_KEYS.map((k) => (
            <CardFace key={k} sc={sc} slotKey={k} />
          ))}
        </div>
      </Group>
    </div>
  );
}

/** 清單的顯示方式：一張卡一列 */
function DeskRows({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const ops = useCardOps();
  const flash = useUi((s) => s.flash);
  const G = S.desk.groups;
  const groups: [string, readonly string[]][] = [
    [G.core.title, ['core']],
    [G.flow.title, FLOW_KEYS],
    [G.stage(toneSlotName(deck, sc)).title, STAGE_KEYS],
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="desk-rows">
      {groups.map(([title, keys]) => (
        <section key={title} className="flex flex-col gap-1">
          <h3 className="m-0 text-sm font-bold text-fg">{title}</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {keys.map((k) => {
              const card = slotCard(deck, sc, k);
              const slot = sc.slots[k];
              const a = answerOf(sc, k);
              if (!card) return null;
              return (
                <li
                  key={k}
                  data-testid="desk-row"
                  data-slot={k}
                  className={cn(
                    'grid gap-x-3 gap-y-1 rounded-md border bg-surface px-3 py-2 md:grid-cols-[7rem_minmax(0,1fr)_auto]',
                    slot.locked ? 'border-accent' : 'border-border',
                    flash.includes(k) && 'bg-accent-soft',
                  )}
                >
                  <span className="text-xs font-semibold text-accent">
                    {catName(deck, sc, slotCat(k))}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <button
                      type="button"
                      className="m-0 w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-bold text-fg underline-offset-2 hover:underline"
                      onClick={() => setUi({ zoom: k })}
                    >
                      {card.title}
                    </button>
                    <span className="text-xs text-muted">{card.text}</span>
                    <span className="text-xs text-fg">
                      {S.card.question}：{questionOf(deck, sc, k)}
                    </span>
                    {a ? (
                      <span className="text-xs text-fg">
                        {S.card.answer}：{a}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-start gap-1">
                    <Button
                      size="sm"
                      icon={<RefreshCw />}
                      disabled={slot.locked}
                      aria-label={S.card.rerollFull(catName(deck, sc, slotCat(k)))}
                      onClick={() => void ops.reroll(k)}
                    >
                      {S.card.reroll}
                    </Button>
                    <Button
                      size="sm"
                      icon={<ListChecks />}
                      disabled={slot.locked}
                      onClick={() => setUi({ picker: k })}
                    >
                      {S.card.pick}
                    </Button>
                    <Button
                      size="sm"
                      variant={slot.locked ? 'primary' : 'ghost'}
                      icon={slot.locked ? <Lock /> : <LockOpen />}
                      aria-pressed={slot.locked}
                      onClick={() => toggleLock(k)}
                    >
                      {slot.locked ? S.card.locked : S.card.lock}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** 抽好之後的抽卡畫面 */
export function DeskView({ sc }: { sc: Scenario }) {
  const ops = useCardOps();
  const mode = usePrefs((s) => s.data.deskMode);
  const patch = usePrefs((s) => s.patch);
  return (
    <div className="flex flex-col gap-3" data-testid="desk">
      <MissionToneStrip sc={sc} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          aria-label={S.desk.viewLabel}
          size="sm"
          value={mode}
          onValueChange={(v) => patch({ deskMode: v as DeskMode })}
          options={[
            { value: 'cards', label: S.desk.viewCards },
            { value: 'rows', label: S.desk.viewRows },
          ]}
        />
        <p className="m-0 flex-1 text-xs text-muted">{S.desk.hint}</p>
      </div>
      {mode === 'rows' ? <DeskRows sc={sc} /> : <DeskGroups sc={sc} />}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button icon={<Shuffle />} onClick={() => void ops.redrawAll()}>
          {S.desk.redrawAll}
        </Button>
        <span className="flex-1" />
        <Button variant="primary" icon={<ArrowRight />} onClick={() => setStep('cast')}>
          {S.next(S.steps.cast.label)}
        </Button>
      </div>
    </div>
  );
}
