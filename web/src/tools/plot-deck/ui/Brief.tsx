/**
 * 故事梗概（用抽到的卡串出來的幾段話）、題材與氣氛的一行、改題材與氣氛的對話框。
 */
import { Pencil, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, cn, Dialog, DialogClose, useMediaQuery } from '@/ui';
import { cardsOf, type Deck, findMission, findTone, getDeck } from '../data';
import { briefOf } from '../model/document';
import type { Scenario } from '../model/scenario';
import { openDialog, openerOf, setUi, useUi } from '../store';
import { S } from '../strings';
import { useCardOps, useCurrent } from './hooks';

export function SynopsisBody({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const brief = briefOf(deck, sc);
  if (!brief) return <p className="m-0 text-sm text-muted">{S.desk.synopsisEmpty}</p>;
  return (
    <dl data-testid="synopsis" className="m-0 flex flex-col gap-2 text-sm leading-relaxed text-fg">
      {brief.map((p) => (
        <div
          key={p.id}
          data-brief={p.id}
          className={cn(
            'flex flex-col gap-0.5 rounded-md px-2.5 py-1.5',
            p.id === 'backstage' ? 'bg-accent-soft' : 'bg-surface-2',
          )}
        >
          <dt className="text-xs font-semibold text-muted">{p.label}</dt>
          {p.lines.map((l) => (
            <dd key={l} className="m-0">
              {l}
            </dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

/** 寬畫面：固定在左邊；窄畫面：收合在上面 */
export function SynopsisPanel({ sc }: { sc: Scenario }) {
  const wide = useMediaQuery('(min-width: 1024px)', true);
  if (wide)
    return (
      <section
        aria-label={S.desk.synopsis}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <h2 className="m-0 text-sm font-bold text-fg">{S.desk.synopsis}</h2>
        <SynopsisBody sc={sc} />
      </section>
    );
  return (
    <details className="rounded-lg border border-border bg-surface p-3" data-testid="synopsis-fold">
      <summary className="cursor-pointer text-sm font-bold text-fg">{S.desk.synopsisShow}</summary>
      <div className="mt-2">
        <SynopsisBody sc={sc} />
      </div>
    </details>
  );
}

/** 題材與氣氛的一行（＋「改」） */
export function MissionToneStrip({
  sc,
  changeable = true,
}: {
  sc: Scenario;
  changeable?: boolean;
}) {
  const deck = getDeck(sc.deck);
  const m = findMission(deck, sc.mission);
  const t = findTone(deck, sc.tone);
  return (
    <div
      data-testid="mt-strip"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-2 px-3 py-1.5 text-sm"
    >
      <span className="text-xs text-muted">{S.deckLabel}</span>
      <span className="font-semibold text-fg">{deck.name}</span>
      <span className="text-xs text-muted">{S.mission}</span>
      <span className="font-semibold text-fg" data-testid="mt-mission">
        {m?.name ?? S.undecided}
      </span>
      <span className="text-xs text-muted">{S.tone}</span>
      <span className="font-semibold text-fg" data-testid="mt-tone">
        {t?.name ?? S.undecided}
      </span>
      {changeable ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Pencil />}
          className="ml-auto"
          data-testid="mt-change"
          onClick={(e) => openDialog('mt', { mtOpen: true }, e.currentTarget)}
        >
          {S.mt.change}
        </Button>
      ) : null}
    </div>
  );
}

/** 題材或氣氛的一組按鈕（單選；名稱、說明、可以選的餘韻張數） */
export function ChoiceGrid({
  label,
  hint,
  options,
  value,
  onChange,
  onRandom,
  autoLabel,
}: {
  label: string;
  hint: string;
  options: { id: string; name: string; desc: string; extra?: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  onRandom?: () => void;
  /** 有給時多一個「抽的時候再決定」（null） */
  autoLabel?: string;
}) {
  const all = autoLabel ? [{ id: '', name: autoLabel, desc: '', extra: '' }, ...options] : options;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="flex w-full flex-wrap items-baseline gap-2 p-0">
        <span className="text-sm font-bold text-fg">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
        {onRandom ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Shuffle />}
            className="ml-auto"
            onClick={onRandom}
          >
            {S.mt.random}
          </Button>
        ) : null}
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {all.map((o) => {
          const on = (value ?? '') === o.id;
          return (
            <button
              key={o.id || 'auto'}
              type="button"
              aria-pressed={on}
              data-choice={o.id || 'auto'}
              onClick={() => onChange(o.id || null)}
              className={cn(
                'flex min-w-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <span className="text-sm font-semibold text-fg">{o.name}</span>
              {o.desc ? <span className="text-xs text-muted">{o.desc}</span> : null}
              {o.extra ? <span className="text-xs text-accent">{o.extra}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 題材與氣氛的選項（給 ChoiceGrid） */
export function missionOptions(deck: Deck, tone: string | null) {
  return deck.missions.map((m) => ({
    id: m.id,
    name: m.name,
    desc: m.desc,
    extra: tone ? S.mt.fitCores(fitCores(deck, m.id, tone)) : '',
  }));
}

export function toneOptions(deck: Deck, mission: string | null) {
  return deck.tones.map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    extra: `${S.mt.slot(t.slot)}${mission ? `／${S.mt.fitCores(fitCores(deck, mission, t.id))}` : ''}`,
  }));
}

/** 這個題材與氣氛有幾張餘韻（同一種氣氛、題材也合） */
export function fitCores(deck: Deck, mission: string, tone: string): number {
  return cardsOf(deck, 'core').filter(
    (c) => c.tones?.includes(tone) && (c.missions ?? []).includes(mission),
  ).length;
}

/** 抽好之後改題材與氣氛 */
export function MissionToneDialog() {
  const sc = useCurrent();
  const open = useUi((s) => s.mtOpen);
  const ops = useCardOps();
  const [m, setM] = useState<string | null>(null);
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (open && sc) {
      setM(sc.mission);
      setT(sc.tone);
    }
  }, [open, sc]);
  if (!sc) return null;
  const deck = getDeck(sc.deck);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
  return (
    <Dialog
      open={open && sc.phase === 'done'}
      onOpenChange={(o) => setUi({ mtOpen: o })}
      title={S.mt.dialogTitle}
      description={S.mt.dialogLead}
      size="lg"
      returnFocus={openerOf('mt', ['[data-testid="mt-change"]'])}
      footer={
        <>
          <DialogClose>{S.confirm.cancel}</DialogClose>
          <Button
            variant="primary"
            disabled={!m || !t}
            onClick={() => {
              setUi({ mtOpen: false });
              void ops.changeMissionTone(m, t);
            }}
          >
            {S.mt.apply}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="mt-dialog">
        <ChoiceGrid
          label={S.mission}
          hint={S.missionHint}
          options={missionOptions(deck, t)}
          value={m}
          onChange={setM}
          onRandom={() => setM(pick(deck.missions).id)}
        />
        <ChoiceGrid
          label={S.tone}
          hint={S.toneHint}
          options={toneOptions(deck, m)}
          value={t}
          onChange={setT}
          onRandom={() => setT(pick(deck.tones).id)}
        />
      </div>
    </Dialog>
  );
}
