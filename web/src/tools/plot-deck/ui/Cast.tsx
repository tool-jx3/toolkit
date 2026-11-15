/**
 * PC 與 NPC：每位 PC 的稱呼、立場、關係（對象）與秘密的卡；NPC 卡的名字與和真相的關係；追加的 NPC。
 */
import { ArrowRight, Dices, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Field, Select, TextArea, TextInput, useConfirm, useToast } from '@/ui';
import {
  addExtraNpc,
  drawPc,
  fillAnswers,
  removeExtraNpc,
  setExtraField,
  setNpcField,
  setPcField,
  setPcTarget,
  setStep,
} from '../actions';
import { getDeck } from '../data';
import {
  answeredKeys,
  npcList,
  pcKeys,
  pcLabel,
  relKey,
  relTarget,
  type Scenario,
  secKey,
  slotCard,
} from '../model/scenario';
import { S } from '../strings';
import { CardFace } from './CardFace';
import { textGesture } from './hooks';
import { QaCard } from './QaCard';
import { PcSettings } from './Start';

function TargetSelect({ sc, i }: { sc: Scenario; i: number }) {
  const deck = getDeck(sc.deck);
  const options = [
    ...Array.from({ length: sc.pcCount }, (_, k) => k + 1)
      .filter((j) => j !== i)
      .map((j) => ({ value: `pc${j}`, label: pcLabel(sc, j) })),
    ...npcList(deck, sc).map((n) => ({ value: n.id, label: S.cast.targetNpc(n.label) })),
  ];
  if (!options.length) return null;
  return (
    <Field label={S.cast.target}>
      <Select
        size="sm"
        data-testid="rel-target"
        value={relTarget(deck, sc, i)}
        onValueChange={(v) => setPcTarget(i, v)}
        options={options}
      />
    </Field>
  );
}

function PcColumn({ sc, i }: { sc: Scenario; i: number }) {
  const p = sc.pcs[i - 1];
  const keys = pcKeys(sc, i);
  const undrawn = keys.filter((k) => !sc.slots[k].card);
  const what = undrawn.map((k) => (k.startsWith('rel') ? S.cats.relation : S.cats.secret));
  return (
    <section
      data-testid="pc-column"
      data-pc={i}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
    >
      <h3 className="m-0 text-base font-bold text-fg">{S.cast.pc(i)}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={S.cast.name}>
          <TextInput
            value={p.name}
            maxLength={40}
            data-field="pc-name"
            onFocus={textGesture.begin}
            onBlur={textGesture.commit}
            onChange={(e) => setPcField(i, 'name', e.target.value)}
          />
        </Field>
        <Field label={S.cast.role}>
          <TextInput
            value={p.role}
            maxLength={200}
            data-field="pc-role"
            onFocus={textGesture.begin}
            onBlur={textGesture.commit}
            onChange={(e) => setPcField(i, 'role', e.target.value)}
          />
        </Field>
      </div>
      {undrawn.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border-strong p-2">
          <span className="text-sm text-muted">{S.cast.drawWhat(what.join(S.cast.and))}</span>
          <Button size="sm" icon={<Dices />} onClick={() => drawPc(i)}>
            {S.cast.drawPc(S.cast.pc(i))}
          </Button>
        </div>
      ) : null}
      {sc.slots[relKey(i)].card ? (
        <QaCard sc={sc} slotKey={relKey(i)} extra={<TargetSelect sc={sc} i={i} />} />
      ) : null}
      {sc.useSecrets && sc.slots[secKey(i)].card ? <QaCard sc={sc} slotKey={secKey(i)} /> : null}
    </section>
  );
}

function NpcColumn({ sc }: { sc: Scenario }) {
  const deck = getDeck(sc.deck);
  const confirm = useConfirm();
  const card = slotCard(deck, sc, 'npc');
  return (
    <section
      data-testid="npc-column"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
    >
      <h3 className="m-0 text-base font-bold text-fg">{S.cast.npcTitle}</h3>
      {card ? (
        <div className="flex flex-col gap-2">
          <CardFace sc={sc} slotKey="npc" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={S.cast.npcName}>
              <TextInput
                value={sc.npc.name}
                maxLength={40}
                placeholder={deck.npcPlaceholder}
                data-field="npc-name"
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setNpcField('name', e.target.value)}
              />
            </Field>
            <Field label={S.cast.npcTie}>
              <TextArea
                rows={2}
                value={sc.npc.tie}
                data-field="npc-tie"
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setNpcField('tie', e.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : (
        <p className="m-0 text-sm text-muted">{S.cast.noNpcCard}</p>
      )}
      {sc.extras.map((x, k) => (
        <div
          key={x.id}
          data-testid="extra-npc"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2"
        >
          <span className="text-xs font-semibold text-accent">{S.cast.extraNpc(k + 1)}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={S.cast.npcName}>
              <TextInput
                value={x.name}
                maxLength={40}
                data-field="extra-name"
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setExtraField(x.id, 'name', e.target.value)}
              />
            </Field>
            <Field label={S.cast.npcRole}>
              <TextInput
                value={x.role}
                maxLength={200}
                placeholder={S.cast.npcRolePlaceholder}
                onFocus={textGesture.begin}
                onBlur={textGesture.commit}
                onChange={(e) => setExtraField(x.id, 'role', e.target.value)}
              />
            </Field>
          </div>
          <Field label={S.cast.npcTie}>
            <TextArea
              rows={2}
              value={x.tie}
              onFocus={textGesture.begin}
              onBlur={textGesture.commit}
              onChange={(e) => setExtraField(x.id, 'tie', e.target.value)}
            />
          </Field>
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              onClick={async () => {
                if (
                  (x.name + x.role + x.tie).trim() &&
                  !(await confirm({
                    title: S.cast.deleteNpcTitle,
                    description: S.cast.deleteNpcDesc,
                    confirmLabel: S.plot.deleteItem,
                    danger: true,
                  }))
                )
                  return;
                removeExtraNpc(x.id);
              }}
            >
              {S.cast.deleteNpc}
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            const id = addExtraNpc();
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLInputElement>(
                  `[data-testid="extra-npc"]:last-of-type [data-field="extra-name"]`,
                )
                ?.focus(),
            );
            return id;
          }}
        >
          {S.cast.addNpc}
        </Button>
      </div>
    </section>
  );
}

export function CastView({ sc }: { sc: Scenario }) {
  const toast = useToast();
  const keys = pcKeys(sc);
  const drawn = keys.filter((k) => !!sc.slots[k].card);
  const undrawn = keys.length - drawn.length;
  return (
    <div className="flex flex-col gap-3" data-testid="cast">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-lg font-bold text-fg">{S.cast.title}</h2>
          <span className="text-sm text-muted" data-testid="cast-count" aria-live="polite">
            {S.cast.answered(answeredKeys(sc, drawn).length, drawn.length)}
          </span>
          <span className="flex-1" />
          {undrawn ? (
            <Button variant="primary" icon={<Dices />} onClick={() => drawPc()}>
              {S.cast.drawAll}
            </Button>
          ) : (
            <Button
              icon={<Sparkles />}
              onClick={() => {
                fillAnswers(keys, true);
                toast({ title: S.cast.filled, tone: 'success', replace: true });
              }}
            >
              {S.cast.fill}
            </Button>
          )}
        </div>
        <p className="m-0 text-sm text-muted">{S.cast.lead(sc.useSecrets)}</p>
        <PcSettings sc={sc} />
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: sc.pcCount }, (_, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: PC1～PC4 是固定的位置
          <PcColumn key={k + 1} sc={sc} i={k + 1} />
        ))}
      </div>
      <NpcColumn sc={sc} />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={() => setStep('cards')}>
          {S.back(S.steps.cards.label)}
        </Button>
        <span className="flex-1" />
        <Button variant="primary" icon={<ArrowRight />} onClick={() => setStep('answers')}>
          {S.next(S.steps.answers.label)}
        </Button>
      </div>
    </div>
  );
}
