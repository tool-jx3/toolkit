/**
 * 抽骨架那一步：餘韻與收尾、開場與阻礙、幕後與線頭三組卡；卡面或列表兩種排法。
 */
import { ArrowRight, ListChecks, Lock, LockOpen, RefreshCw, Shuffle } from 'lucide-react';
import { Button, cn, Segmented } from '@/ui';
import { setStep, toggleLock } from '../actions';
import { getDeck } from '../data';
import {
  catName,
  DESK_GROUPS,
  promptOf,
  replyOf,
  type Scenario,
  slotCard,
  slotCat,
} from '../model/scenario';
import { type DeskMode, openDialog, usePrefs, useUi } from '../store';
import { S } from '../strings';
import { MissionToneStrip } from './Brief';
import { CardFace } from './CardFace';
import { useCardOps } from './hooks';

/** 每一組的欄位寬：兩張的一組並排、三張與四張的一組在寬畫面排成一列 */
const GRID: Record<number, string> = {
  2: 'grid gap-3 md:grid-cols-2',
  3: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
};

/** 三組卡（先挑餘韻與抽好之後共用） */
export function DeskGroups({ sc }: { sc: Scenario }) {
  return (
    <div className="flex flex-col gap-4">
      {DESK_GROUPS.map((g) => {
        const G = S.desk.groups[g.id];
        return (
          <section key={g.id} className="flex flex-col gap-2" data-testid={`group-${g.id}`}>
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="m-0 text-base font-bold text-fg">{G.title}</h3>
              <p className="m-0 text-xs text-muted">{G.lead}</p>
            </header>
            <div className={GRID[g.keys.length] ?? GRID[4]}>
              {g.keys.map((k) => (
                <CardFace key={k} sc={sc} slotKey={k} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 列表的排法：一張卡一列 */
function DeskRows({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const ops = useCardOps();
  const flash = useUi((s) => s.flash);
  return (
    <div className="flex flex-col gap-3" data-testid="desk-rows">
      {DESK_GROUPS.map((g) => (
        <section key={g.id} className="flex flex-col gap-1">
          <h3 className="m-0 text-sm font-bold text-fg">{S.desk.groups[g.id].title}</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {g.keys.map((k) => {
              const card = slotCard(deck, sc, k);
              const slot = sc.slots[k];
              const a = replyOf(sc, k);
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
                      data-action="zoom"
                      className="m-0 w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-bold text-fg underline-offset-2 hover:underline"
                      onClick={(e) => openDialog('zoom', { zoom: k }, e.currentTarget)}
                    >
                      {card.title}
                    </button>
                    <span className="text-xs text-muted">{card.text}</span>
                    <span className="text-xs text-fg">
                      {S.card.question}：{promptOf(deck, sc, k)}
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
                      data-action="pick"
                      onClick={(e) => openDialog('picker', { picker: k }, e.currentTarget)}
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

/** 抽好之後的抽骨架畫面 */
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
