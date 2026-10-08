/**
 * 目前 NPC 的編輯表單：基本資料、屬性、衍生值、技能、指令、備註。
 */
import { Dices, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CHARACTERISTICS, type Characteristic, type CocEdition } from '@/core/coc';
import {
  Button,
  Field,
  IconButton,
  NativeNumberInput,
  NumberInput,
  Section,
  Segmented,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';
import {
  addCommand,
  addSkill,
  patchCommand,
  patchCurrent,
  patchCurrentStep,
  patchSkill,
  removeCommand,
  removeSkill,
  rollAll,
  rollOne,
  setAbilityDice,
  setAbilityValue,
  setEdition,
} from './actions';
import { type CommandType, diceError, movLabel, type Npc } from './logic';
import { S } from './strings';

const EDITION_OPTIONS = ([7, 6] as const).map((e) => ({
  value: String(e),
  label: S.basic.editions[e],
}));

const CHECK_OPTIONS = (['CC', 'CCB'] as const).map((v) => ({ value: v, label: v }));

function AbilityRow({ npc, stat }: { npc: Npc; stat: Characteristic }) {
  const ability = npc.abilities[stat];
  const error = diceError(ability.dice);
  return (
    <li className="flex flex-col gap-1" data-testid={`ability-${stat}`}>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_5.5rem] items-center gap-2">
        <span className="font-mono text-sm font-bold">{stat}</span>
        <TextInput
          aria-label={S.abilities.expr(stat)}
          value={ability.dice}
          invalid={!!error}
          placeholder={stat === 'STR' ? '3D6' : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setAbilityDice(stat, e.target.value)}
          className="font-mono"
        />
        <IconButton
          label={S.abilities.roll(stat)}
          icon={<Dices />}
          variant="secondary"
          disabled={!ability.dice || !!error}
          onClick={() => rollOne(stat)}
        />
        <NumberInput
          aria-label={S.abilities.value(stat)}
          value={ability.value}
          onChange={(v) => setAbilityValue(stat, v)}
          min={0}
          max={999}
        />
      </div>
      {error ? (
        <p className="m-0 text-xs text-danger" role="alert">
          {S.abilities.errors[error]}
        </p>
      ) : null}
    </li>
  );
}

export function EditForm({ npc }: { npc: Npc }) {
  const [rollErrors, setRollErrors] = useState<string | null>(null);

  const doRollAll = () => {
    const errors = rollAll();
    setRollErrors(errors.length ? S.abilities.rolledWithErrors(errors) : null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="npc-form">
      <Section title={S.basic.title} fixed>
        <Field label={S.basic.name}>
          <TextInput
            value={npc.name}
            placeholder={S.basic.namePlaceholder}
            onChange={(e) => patchCurrent({ name: e.target.value })}
          />
        </Field>
        <Field label={S.basic.edition} hint={S.basic.editionHint}>
          <Segmented
            value={String(npc.edition)}
            onValueChange={(v) => setEdition(Number(v) as CocEdition)}
            options={EDITION_OPTIONS}
          />
        </Field>
      </Section>

      <Section
        title={S.abilities.title}
        description={S.abilities.description}
        persistKey="coc-npc:abilities"
      >
        <ul aria-label={S.abilities.title} className="m-0 flex list-none flex-col gap-2 p-0">
          {CHARACTERISTICS.map((stat) => (
            <AbilityRow key={stat} npc={npc} stat={stat} />
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {rollErrors ? <p className="m-0 flex-1 text-xs text-warning">{rollErrors}</p> : null}
          <Button variant="primary" icon={<Dices />} onClick={doRollAll}>
            {S.abilities.rollAll}
          </Button>
        </div>
      </Section>

      <Section
        title={S.derived.title}
        description={S.derived.description}
        persistKey="coc-npc:derived"
      >
        <Field label={S.derived.san} hint={S.derived.sanHint} layout="inline">
          <Toggle
            checked={npc.sanEnabled}
            onCheckedChange={(v) => patchCurrentStep({ sanEnabled: v })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          <Field label={S.derived.hp}>
            <NumberInput
              value={npc.hp}
              onChange={(v) => patchCurrent({ hp: v })}
              min={0}
              max={9999}
            />
          </Field>
          <Field label={S.derived.mp}>
            <NumberInput
              value={npc.mp}
              onChange={(v) => patchCurrent({ mp: v })}
              min={0}
              max={9999}
            />
          </Field>
          <Field label={S.derived.sanValue}>
            <NumberInput
              value={npc.san}
              onChange={(v) => patchCurrent({ san: v })}
              min={0}
              max={9999}
              disabled={!npc.sanEnabled}
            />
          </Field>
          <Field label={S.derived.db}>
            <TextInput
              value={npc.db}
              spellCheck={false}
              onChange={(e) => patchCurrent({ db: e.target.value })}
              className="font-mono"
            />
          </Field>
          {npc.edition === 7 ? (
            <Field label={S.derived.build}>
              <NumberInput
                value={npc.build}
                onChange={(v) => patchCurrent({ build: v })}
                min={-99}
                max={99}
              />
            </Field>
          ) : null}
          <Field label={movLabel(npc.edition)} hint={S.derived.movHint}>
            <NativeNumberInput
              value={npc.mov}
              onChange={(v) => patchCurrent({ mov: v })}
              step={1}
              placeholder={S.derived.movPlaceholder}
            />
          </Field>
        </div>
      </Section>

      <Section title={S.skills.title} description={S.skills.hint} persistKey="coc-npc:skills">
        {npc.edition === 6 ? (
          <Field label={S.skills.check} hint={S.skills.checkHint}>
            <Segmented
              value={npc.commandType}
              onValueChange={(v) => patchCurrentStep({ commandType: v as CommandType })}
              options={CHECK_OPTIONS}
            />
          </Field>
        ) : null}
        {npc.skills.length ? (
          <ul aria-label={S.skills.title} className="m-0 flex list-none flex-col gap-2 p-0">
            {npc.skills.map((sk, i) => (
              <li
                key={sk.id}
                className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2"
              >
                <TextInput
                  aria-label={S.skills.name(i + 1)}
                  value={sk.name}
                  placeholder={S.skills.namePlaceholder}
                  onChange={(e) => patchSkill(sk.id, { name: e.target.value })}
                />
                <NumberInput
                  aria-label={S.skills.value(i + 1)}
                  value={sk.value}
                  onChange={(v) => patchSkill(sk.id, { value: v })}
                  min={0}
                  max={999}
                  unit="%"
                />
                <IconButton
                  label={S.skills.remove(i + 1)}
                  icon={<Trash2 />}
                  onClick={() => removeSkill(sk.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.skills.empty}</p>
        )}
        <Button size="sm" icon={<Plus />} onClick={addSkill} className="self-start">
          {S.skills.add}
        </Button>
      </Section>

      <Section title={S.commands.title} description={S.commands.hint} persistKey="coc-npc:commands">
        {npc.commands.length ? (
          <ul aria-label={S.commands.title} className="m-0 flex list-none flex-col gap-2 p-0">
            {npc.commands.map((c, i) => (
              <li
                key={c.id}
                className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] items-center gap-2"
              >
                <TextInput
                  aria-label={S.commands.name(i + 1)}
                  value={c.name}
                  placeholder={S.commands.namePlaceholder}
                  onChange={(e) => patchCommand(c.id, { name: e.target.value })}
                />
                <TextInput
                  aria-label={S.commands.expr(i + 1)}
                  value={c.expr}
                  placeholder={S.commands.exprPlaceholder}
                  spellCheck={false}
                  onChange={(e) => patchCommand(c.id, { expr: e.target.value })}
                  className="font-mono"
                />
                <IconButton
                  label={S.commands.remove(i + 1)}
                  icon={<Trash2 />}
                  onClick={() => removeCommand(c.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.commands.empty}</p>
        )}
        <Button size="sm" icon={<Plus />} onClick={addCommand} className="self-start">
          {S.commands.add}
        </Button>
      </Section>

      <Section title={S.memo.title} persistKey="coc-npc:memo">
        <TextArea
          aria-label={S.memo.title}
          rows={4}
          value={npc.memo}
          placeholder={S.memo.placeholder}
          onChange={(e) => patchCurrent({ memo: e.target.value })}
        />
      </Section>
    </div>
  );
}
