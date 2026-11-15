/**
 * 開始的畫面：卡組、題材與氣氛、PC 人數與秘密卡、「隨機抽」與「照條件抽」、怎麼用。
 * 照條件抽：挑一張體驗的核心（三張）→ 挑想先決定的卡 → 抽剩下的。
 */
import { Dices, FileCheck2, RefreshCw, X } from 'lucide-react';
import { Button, cn, Field, Segmented, Toggle } from '@/ui';
import { Stepper } from '@/ui/Stepper';
import {
  chooseCore,
  redealCores,
  setDeck,
  setMission,
  setPcCount,
  setTone,
  setUseSecrets,
  setupBackToCore,
  setupCancel,
  setupDraw,
  setupToCards,
  startRandom,
  startSetup,
} from '../actions';
import { DECK_IDS, type DeckId, findCard, getDeck } from '../data';
import { missionToneLabel } from '../model/document';
import { PC_MAX, type Scenario, STORY_KEYS } from '../model/scenario';
import { setUi } from '../store';
import { S } from '../strings';
import { CardFace } from './CardFace';
import { DeskGroups } from './Desk';
import { ChoiceGrid, MissionToneStrip, missionOptions, toneOptions } from './Synopsis';

export function PcSettings({ sc }: { sc: Scenario }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3" data-testid="pc-settings">
      <Field label={S.start.pcCount}>
        <Segmented
          value={String(sc.pcCount)}
          onValueChange={(v) => setPcCount(Number(v))}
          options={Array.from({ length: PC_MAX }, (_, i) => ({
            value: String(i + 1),
            label: `${i + 1} ${S.start.pcUnit}`,
          }))}
        />
      </Field>
      <Field label={S.start.useSecrets} layout="inline" hint={S.start.useSecretsHint}>
        <Toggle checked={sc.useSecrets} onCheckedChange={setUseSecrets} />
      </Field>
    </div>
  );
}

export function DeckSwitch({ value, onChange }: { value: DeckId; onChange: (d: DeckId) => void }) {
  return (
    <Segmented
      aria-label={S.deckLabel}
      value={value}
      onValueChange={(v) => onChange(v as DeckId)}
      options={DECK_IDS.map((d) => ({ value: d, label: S.decks[d] }))}
    />
  );
}

export function StartScreen({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  return (
    <div className="flex flex-col gap-4" data-testid="start">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-xl font-bold text-fg">{S.start.title}</h2>
        <p className="m-0 text-sm text-muted">{S.start.lead}</p>
      </header>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <Field label={S.deckLabel} hint={S.start.deckHint}>
          <DeckSwitch value={sc.deck} onChange={setDeck} />
        </Field>
        <ChoiceGrid
          label={S.mission}
          hint={S.missionHint}
          options={missionOptions(deck, sc.tone)}
          value={sc.mission}
          onChange={setMission}
          autoLabel={S.auto}
        />
        <ChoiceGrid
          label={S.tone}
          hint={S.toneHint}
          options={toneOptions(deck, sc.mission)}
          value={sc.tone}
          onChange={setTone}
          autoLabel={S.auto}
        />
        <PcSettings sc={sc} />
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            ['random', S.start.random, S.start.randomDesc, <Dices key="i" />, startRandom],
            ['setup', S.start.setup, S.start.setupDesc, <FileCheck2 key="i" />, startSetup],
          ] as const
        ).map(([id, label, desc, icon, run]) => (
          <button
            key={id}
            type="button"
            data-start={id}
            onClick={run}
            className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left outline-none transition-colors hover:border-accent hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus [&_svg]:size-6 [&_svg]:text-accent"
          >
            {icon}
            <span className="text-lg font-bold text-fg">{label}</span>
            <span className="text-sm leading-relaxed text-muted">{desc}</span>
          </button>
        ))}
      </div>
      <section className="rounded-lg border border-border bg-surface p-3 sm:p-4">
        <h3 className="m-0 mb-2 text-base font-bold text-fg">{S.start.howTo}</h3>
        <ol className="m-0 flex flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {S.start.howToSteps.map(([t, d]) => (
            <li key={t}>
              <b className="text-fg">{t}</b>
              <span className="text-muted">：{d}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-2 text-xs text-muted">{S.start.note}</p>
      </section>
    </div>
  );
}

function SetupSteps({ value }: { value: number }) {
  return (
    <Stepper
      aria-label={S.setup.stepsLabel}
      steps={S.setup.steps.map((label) => ({ label }))}
      value={value}
      onValueChange={(i) => {
        if (i === 0) setupBackToCore();
        else if (i === 1) setupToCards();
      }}
    />
  );
}

/** 照條件抽 A：挑一張體驗的核心 */
export function CoreDeal({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const chosen = findCard(deck, sc.slots.core.card);
  const label = missionToneLabel(deck, sc);
  return (
    <div className="flex flex-col gap-4" data-testid="core-deal">
      <SetupSteps value={0} />
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-xl font-bold text-fg">{S.setup.coreTitle}</h2>
        <p className="m-0 text-sm text-muted">{S.setup.coreLead(label)}</p>
      </header>
      <MissionToneStrip sc={sc} changeable={false} />
      <div className="grid gap-3 md:grid-cols-3">
        {sc.coreDeal.map((id) => {
          const c = findCard(deck, id);
          if (!c) return null;
          const on = sc.slots.core.card === id;
          return (
            <button
              key={id}
              type="button"
              data-testid="core-option"
              data-card={id}
              aria-pressed={on}
              onClick={() => chooseCore(id)}
              className={cn(
                'flex min-w-0 flex-col items-start gap-2 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <span className="text-xs font-semibold text-accent">{S.cats.core}</span>
              <span className="text-lg font-bold text-fg">{c.title}</span>
              <span className="text-sm leading-relaxed text-muted">{c.text}</span>
              <span className="text-sm text-fg">
                <b className="mr-1 text-xs text-accent">{S.setup.climaxExample}</b>
                {c.answers[0]}
              </span>
              <span className="mt-auto text-sm font-semibold text-accent">
                {on ? S.setup.chosen : S.setup.choose}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<RefreshCw />} onClick={redealCores}>
          {S.setup.redeal}
        </Button>
        <Button onClick={() => setUi({ picker: 'core' })}>{S.setup.fromList}</Button>
        <span className="flex-1" />
        <Button variant="ghost" icon={<X />} onClick={setupCancel}>
          {S.setup.cancel}
        </Button>
        {chosen ? (
          <Button variant="primary" onClick={setupToCards}>
            {S.setup.nextWith(chosen.title)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** 照條件抽 B：挑想先決定的卡，C：抽剩下的 */
export function SetupDesk({ sc }: { sc: Scenario }) {
  const decided = STORY_KEYS.filter((k) => !!sc.slots[k].card).length;
  return (
    <div className="flex flex-col gap-4" data-testid="setup-desk">
      <SetupSteps value={1} />
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-xl font-bold text-fg">{S.setup.cardsTitle}</h2>
        <p className="m-0 text-sm text-muted">{S.setup.cardsLead}</p>
      </header>
      <MissionToneStrip sc={sc} changeable={false} />
      <p className="m-0 text-sm text-muted" data-testid="setup-count" aria-live="polite">
        {S.setup.decided(decided, STORY_KEYS.length)}
      </p>
      <DeskGroups sc={sc} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={setupBackToCore}>
          {S.setup.backToCore}
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" icon={<X />} onClick={setupCancel}>
          {S.setup.cancel}
        </Button>
        <Button variant="primary" icon={<Dices />} data-testid="setup-draw" onClick={setupDraw}>
          {S.setup.drawRest}
        </Button>
      </div>
    </div>
  );
}

export { CardFace };
