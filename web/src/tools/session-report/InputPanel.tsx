/**
 * 左欄：輸入（範本與文字樣式、劇本、主持人、參加者、日期與標籤、文字裝飾）。
 * 規格：docs/refactor/specs/session-report.md 1.2～1.7。
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { UNICODE_TEXT_STYLES, type UnicodeTextStyle } from '@/core/social';
import {
  Button,
  Chips,
  Field,
  FieldRow,
  IconButton,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '@/ui';
import { DECORATIONS } from './decorations';
import {
  DL_SYSTEMS,
  GM_ROLES,
  type GmRole,
  type Honorific,
  type NameOrder,
  newGm,
  newPlayer,
  type PlayerRow,
  SLOT_BASES,
  type SlotBase,
  SYSTEMS,
  type SystemKey,
} from './model';
import { slotFor } from './report';
import { setField, updateReport, useReport } from './store';
import { S } from './strings';
import { TEMPLATES, type TemplateId } from './templates';

export const TEMPLATE_OPTIONS = TEMPLATES.map((t, i) => ({
  value: t.id as TemplateId,
  label: `${i + 1}. ${t.label}`,
  description: t.description,
}));

export const STYLE_OPTIONS = UNICODE_TEXT_STYLES.map((s) => ({
  value: s.id,
  label: `${s.sample}　${s.label}`,
}));

const SYSTEM_OPTIONS: { value: SystemKey; label: string }[] = [
  ...SYSTEMS.map((s) => ({ value: s.key as SystemKey, label: s.name })),
  { value: 'custom', label: S.system.custom },
];

const ROLE_OPTIONS = GM_ROLES.map((r) => ({ value: r, label: r }));

const SLOT_OPTIONS = SLOT_BASES.map((v) => ({
  value: v,
  label: S.slotOptions[v].label,
  description: S.slotOptions[v].description,
}));

/** 選系統（F12：Emoklore 時所有主持人的身分改成 DL） */
export function setSystem(system: SystemKey) {
  updateReport((d) => {
    d.system = system;
    if (DL_SYSTEMS.includes(system)) for (const g of d.gms) g.role = 'DL';
  });
}

function TemplateSection() {
  const template = useReport((s) => s.data.template);
  const fontStyle = useReport((s) => s.data.fontStyle);
  return (
    <Section title={S.sections.template} persistKey="session-report:template">
      <Field label={S.template.label} hint={S.template.hint}>
        <Select<TemplateId>
          value={template}
          onValueChange={(v) => setField('template', v)}
          options={TEMPLATE_OPTIONS}
        />
      </Field>
      <Field label={S.fontStyle.label} hint={S.fontStyle.hint}>
        <Select<UnicodeTextStyle>
          value={fontStyle}
          onValueChange={(v) => setField('fontStyle', v)}
          options={STYLE_OPTIONS}
        />
      </Field>
    </Section>
  );
}

function ScenarioSection() {
  const system = useReport((s) => s.data.system);
  const customSystem = useReport((s) => s.data.customSystem);
  const author = useReport((s) => s.data.author);
  const scenario = useReport((s) => s.data.scenario);
  const result = useReport((s) => s.data.result);
  return (
    <Section title={S.sections.scenario} persistKey="session-report:scenario">
      <FieldRow className="max-sm:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Field label={S.system.label}>
            <Select<SystemKey> value={system} onValueChange={setSystem} options={SYSTEM_OPTIONS} />
          </Field>
          {system === 'custom' ? (
            <TextInput
              aria-label={S.system.customLabel}
              placeholder={S.system.customPlaceholder}
              value={customSystem}
              onChange={(e) => setField('customSystem', e.target.value)}
            />
          ) : null}
        </div>
        <Field label={S.author.label} hint={S.author.hint}>
          <TextInput
            placeholder={S.author.placeholder}
            value={author}
            onChange={(e) => setField('author', e.target.value)}
          />
        </Field>
      </FieldRow>
      <FieldRow className="max-sm:grid-cols-1">
        <Field label={S.scenario.label}>
          <TextInput
            placeholder={S.scenario.placeholder}
            value={scenario}
            onChange={(e) => setField('scenario', e.target.value)}
          />
        </Field>
        <Field label={S.result.label}>
          <TextInput
            placeholder={S.result.placeholder}
            value={result}
            onChange={(e) => setField('result', e.target.value)}
          />
        </Field>
      </FieldRow>
    </Section>
  );
}

/** 新增一列後把焦點移到那一列的名字欄 */
function useFocusAfterAdd() {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!pending) return;
    document.getElementById(pending)?.focus();
    setPending(null);
  }, [pending]);
  return setPending;
}

function GmSection() {
  const honorific = useReport((s) => s.data.honorific);
  const gms = useReport((s) => s.data.gms);
  const focusLater = useFocusAfterAdd();
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <Section title={S.sections.gms} persistKey="session-report:gms">
      <Field label={S.honorific.label} hint={S.honorific.hint}>
        <Segmented<Honorific>
          value={honorific}
          onValueChange={(v) => setField('honorific', v)}
          options={[
            { value: 'none', label: S.honorific.none },
            { value: 'sama', label: S.honorific.sama },
            { value: 'san', label: S.honorific.san },
          ]}
        />
      </Field>
      <ul
        aria-label={S.gm.listLabel}
        className="m-0 flex list-none flex-col gap-1.5 p-0"
        data-testid="gm-list"
      >
        {gms.map((g, i) => (
          <li
            key={g.id}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-1.5"
          >
            <Select<GmRole>
              aria-label={S.gm.role(i + 1)}
              value={g.role}
              onValueChange={(v) =>
                updateReport((d) => {
                  const row = d.gms.find((x) => x.id === g.id);
                  if (row) row.role = v;
                })
              }
              options={ROLE_OPTIONS}
            />
            <TextInput
              id={`gm-name-${g.id}`}
              aria-label={S.gm.name(i + 1)}
              placeholder={S.gm.namePlaceholder}
              value={g.name}
              onChange={(e) =>
                updateReport((d) => {
                  const row = d.gms.find((x) => x.id === g.id);
                  if (row) row.name = e.target.value;
                })
              }
            />
            <IconButton
              label={S.gm.remove(i + 1)}
              icon={<Trash2 />}
              onClick={() => {
                updateReport((d) => {
                  d.gms = d.gms.filter((x) => x.id !== g.id);
                });
                addRef.current?.focus();
              }}
            />
          </li>
        ))}
      </ul>
      {gms.length === 0 ? <p className="m-0 text-xs text-muted">{S.gm.empty}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={addRef}
          size="sm"
          icon={<Plus />}
          onClick={() => {
            const row = newGm();
            updateReport((d) => {
              d.gms.push(row);
            });
            focusLater(`gm-name-${row.id}`);
          }}
        >
          {S.gm.add}
        </Button>
        <span className="text-xs text-muted">{S.gm.hint}</span>
      </div>
    </Section>
  );
}

function PlayerFields({ p, n, plFirst }: { p: PlayerRow; n: number; plFirst: boolean }) {
  const set = (key: 'pc' | 'pl') => (e: ChangeEvent<HTMLInputElement>) =>
    updateReport((d) => {
      const row = d.players.find((x) => x.id === p.id);
      if (row) row[key] = e.target.value;
    });
  const pc = (
    <TextInput
      key="pc"
      id={`player-pc-${p.id}`}
      aria-label={S.player.pc(n)}
      placeholder={S.player.pcPlaceholder}
      value={p.pc}
      onChange={set('pc')}
    />
  );
  const pl = (
    <TextInput
      key="pl"
      id={`player-pl-${p.id}`}
      aria-label={S.player.pl(n)}
      placeholder={S.player.plPlaceholder}
      value={p.pl}
      onChange={set('pl')}
    />
  );
  return (
    <div className="col-span-3 grid grid-cols-2 gap-1.5" data-testid="player-names">
      {plFirst ? [pl, pc] : [pc, pl]}
    </div>
  );
}

function PlayerSection() {
  const nameOrder = useReport((s) => s.data.nameOrder);
  const slot = useReport((s) => s.data.slot);
  const players = useReport((s) => s.data.players);
  const focusLater = useFocusAfterAdd();
  const addRef = useRef<HTMLButtonElement>(null);
  const plFirst = nameOrder === 'plpc';
  return (
    <Section title={S.sections.players} persistKey="session-report:players">
      <Field label={S.nameOrder.label} hint={S.nameOrder.hint}>
        <Segmented<NameOrder>
          value={nameOrder}
          onValueChange={(v) => setField('nameOrder', v)}
          options={[
            { value: 'pcpl', label: S.nameOrder.pcpl },
            { value: 'plpc', label: S.nameOrder.plpc },
          ]}
        />
      </Field>
      <ul
        aria-label={S.player.listLabel}
        className="m-0 flex list-none flex-col gap-2 p-0"
        data-testid="player-list"
      >
        {players.map((p, i) => (
          <li
            key={p.id}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-1.5 rounded-md border border-border bg-surface-2 p-1.5"
          >
            {i === 0 ? (
              <Select<SlotBase>
                aria-label={S.player.slot(1)}
                value={slot}
                onValueChange={(v) => setField('slot', v)}
                options={SLOT_OPTIONS}
              />
            ) : (
              <span
                className="flex h-8 items-center truncate rounded-md border border-border px-2.5 text-sm text-muted"
                aria-label={S.player.slotFixed(i + 1, slotFor(slot, i + 1))}
                role="note"
                data-testid="slot-fixed"
              >
                {slotFor(slot, i + 1)}
              </span>
            )}
            <TextInput
              aria-label={S.player.ho(i + 1)}
              placeholder={S.player.hoPlaceholder}
              value={p.ho}
              onChange={(e) =>
                updateReport((d) => {
                  const row = d.players.find((x) => x.id === p.id);
                  if (row) row.ho = e.target.value;
                })
              }
            />
            <IconButton
              label={S.player.remove(i + 1)}
              icon={<Trash2 />}
              onClick={() => {
                updateReport((d) => {
                  d.players = d.players.filter((x) => x.id !== p.id);
                });
                addRef.current?.focus();
              }}
            />
            <PlayerFields p={p} n={i + 1} plFirst={plFirst} />
          </li>
        ))}
      </ul>
      {players.length === 0 ? <p className="m-0 text-xs text-muted">{S.player.empty}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={addRef}
          size="sm"
          icon={<Plus />}
          onClick={() => {
            const row = newPlayer();
            updateReport((d) => {
              d.players.push(row);
            });
            focusLater(plFirst ? `player-pl-${row.id}` : `player-pc-${row.id}`);
          }}
        >
          {S.player.add}
        </Button>
        <span className="text-xs text-muted">{S.player.hint}</span>
      </div>
    </Section>
  );
}

function MiscSection({ today }: { today: string }) {
  const date = useReport((s) => s.data.date);
  const hashtags = useReport((s) => s.data.hashtags);
  const memo = useReport((s) => s.data.memo);
  return (
    <Section title={S.sections.misc} persistKey="session-report:misc">
      <FieldRow className="max-sm:grid-cols-1">
        <Field label={S.date.label} hint={S.date.hint}>
          <TextInput
            placeholder={today}
            value={date}
            onChange={(e) => setField('date', e.target.value)}
          />
        </Field>
        <Field label={S.hashtags.label}>
          <TextInput
            placeholder={S.hashtags.placeholder}
            value={hashtags}
            onChange={(e) => setField('hashtags', e.target.value)}
          />
        </Field>
      </FieldRow>
      <Field label={S.memo.label}>
        <TextArea
          rows={3}
          placeholder={S.memo.placeholder}
          value={memo}
          onChange={(e) => setField('memo', e.target.value)}
        />
      </Field>
    </Section>
  );
}

function DecorationSection({ onInsert }: { onInsert: (text: string) => void }) {
  return (
    <Section title={S.sections.deco} persistKey="session-report:deco" description={S.deco.hint}>
      {DECORATIONS.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <h4 className="m-0 text-xs font-medium text-muted">{S.deco.groups[g.id]}</h4>
          <Chips
            aria-label={S.deco.groups[g.id]}
            items={g.items.map((it) => ({ value: it.value, label: it.label, title: it.value }))}
            onPick={onInsert}
          />
        </div>
      ))}
    </Section>
  );
}

export function InputPanel({
  today,
  onInsert,
}: {
  today: string;
  onInsert: (text: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TemplateSection />
      <ScenarioSection />
      <GmSection />
      <PlayerSection />
      <MiscSection today={today} />
      <DecorationSection onInsert={onInsert} />
    </div>
  );
}
