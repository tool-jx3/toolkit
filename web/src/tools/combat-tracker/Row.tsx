/**
 * 清單的一列：拖曳把手、勾選、先攻（擲骰）、名字與標記、AC、HP（±、打字、上限、臨時）、狀態、死亡豁免、更多操作。
 * 窄畫面時自動換行（名字一行、數值一行、狀態一行）。
 */
import { Copy, Dices, Ellipsis, Eye, EyeOff, GripVertical, Skull, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { conditionText, srdCondition } from '@/core/srd5/srd52/conditions';
import {
  Button,
  Checkbox,
  cn,
  IconButton,
  MenuButton,
  NumberInput,
  TextInput,
  useConfirm,
  useToast,
} from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import { damage, heal, hpEntry, rollDeath } from './actions';
import {
  type Combatant,
  condName,
  duplicateCombatant,
  LIMITS,
  removeCombatants,
  rollInitiatives,
  type Settings,
  SIDES,
  setDead,
  setDeathCount,
  setInit,
  setMaxHp,
  setTemp,
  statusOf,
} from './model';
import { edit, step, toggleSelected, useUi } from './store';
import { S } from './strings';

export const SIDE_STRIPE = { pc: 'bg-accent', ally: 'bg-success', enemy: 'bg-danger' } as const;

export const SIDE_CLASS = {
  pc: 'bg-accent-soft text-accent',
  ally: 'bg-success-soft text-success',
  enemy: 'bg-danger-soft text-danger',
} as const;

/** 名字欄：打字時只改欄位，離開或按 Enter 才寫回（空白時還原，原作的規則） */
function NameField({ c }: { c: Combatant }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Array.from(draft.trim()).slice(0, LIMITS.name).join('');
    if (v && v !== c.name)
      step((d) => {
        const x = d.list.find((y) => y.id === c.id);
        if (x) x.name = v;
      });
    setDraft(null);
  };
  return (
    <TextInput
      aria-label={S.list.nameOf(c.name)}
      value={draft ?? c.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="min-w-[4.5rem] flex-1 font-medium"
      data-field="name"
    />
  );
}

/** HP 欄：顯示目前的 HP；打「-8」「+5」「12」按 Enter 或離開時套用，看不懂時還原 */
function HpField({ c }: { c: Combatant }) {
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  /* HP 被別的地方改了（按鈕、傷害與治療）時丟掉打到一半的字 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: c.hp 變了才重設
  useEffect(() => {
    setDraft(null);
  }, [c.hp]);
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t !== String(c.hp ?? '')) hpEntry(c.id, t, toast);
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setDraft(null);
  };
  return (
    <TextInput
      aria-label={S.list.hpOf(c.name)}
      inputMode="text"
      value={draft ?? String(c.hp ?? '')}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      className="w-14 text-center tabular-nums"
      data-field="hp"
    />
  );
}

function DeathSaves({ c }: { c: Combatant }) {
  const toast = useToast();
  const pips = (which: 'ok' | 'ng') =>
    [1, 2, 3].map((i) => {
      const n = which === 'ok' ? c.death.ok : c.death.ng;
      const on = n >= i;
      return (
        <button
          key={i}
          type="button"
          aria-label={which === 'ok' ? S.death.okOf(i, c.name) : S.death.ngOf(i, c.name)}
          aria-pressed={on}
          onClick={() => step((d) => setDeathCount(d, c.id, which, on ? i - 1 : i))}
          className={cn(
            'focus-visible:focus-ring size-4 rounded-full border',
            which === 'ok' ? 'border-success' : 'border-danger',
            on && (which === 'ok' ? 'bg-success' : 'bg-danger'),
          )}
        />
      );
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="death-saves">
      <span className="font-medium text-muted">{S.death.label}</span>
      <span className="flex items-center gap-1">
        <span className="text-success">{S.death.ok}</span>
        {pips('ok')}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-danger">{S.death.ng}</span>
        {pips('ng')}
      </span>
      <Button size="sm" variant="secondary" icon={<Dices />} onClick={() => rollDeath(c.id, toast)}>
        <span aria-hidden>{S.death.roll}</span>
        <span className="sr-only">{S.death.rollOf(c.name)}</span>
      </Button>
    </div>
  );
}

export function Row({
  c,
  settings,
  current,
  locked,
}: {
  c: Combatant;
  settings: Settings;
  current: boolean;
  locked: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const selected = useUi((s) => s.selected.includes(c.id));
  const st = statusOf(c, settings);
  const out = st === 'down' || st === 'dead';
  const showDeath = settings.deathSaves && c.side === 'pc' && c.hp === 0 && !c.death.dead;

  const remove = async () => {
    if (
      await confirm({
        title: S.rowMenu.removeTitle(c.name),
        description: S.rowMenu.removeDesc,
        confirmLabel: S.rowMenu.remove,
        danger: true,
      })
    )
      step((d) => removeCombatants(d, [c.id]));
  };

  return (
    <div
      className={cn('flex flex-col gap-1.5 p-2', out && 'opacity-60')}
      data-testid="combatant"
      data-name={c.name}
      data-current={current || undefined}
      data-status={st}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1 rounded-l-md', SIDE_STRIPE[c.side])}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span
          data-drag-handle
          aria-hidden
          title={locked ? undefined : S.list.drag(c.name)}
          className={cn(
            'flex h-8 w-4 shrink-0 items-center justify-center text-muted',
            locked ? 'cursor-not-allowed opacity-40' : 'cursor-grab touch-none',
          )}
        >
          <GripVertical className="size-4" />
        </span>
        <Checkbox
          aria-label={S.list.select(c.name)}
          checked={selected}
          onCheckedChange={(v) => toggleSelected(c.id, v)}
        />
        <div className="flex items-center gap-0.5">
          <OptionalNumberInput
            aria-label={S.list.initOf(c.name)}
            value={c.init}
            onChange={() => {}}
            onCommit={(v) => step((d) => setInit(d, c.id, v))}
            min={LIMITS.init[0]}
            max={LIMITS.init[1]}
            placeholder="—"
            className="w-12 [&_input]:text-center"
          />
          {settings.initDie !== 'none' ? (
            <IconButton
              label={S.list.roll(c.name)}
              icon={<Dices />}
              size="sm"
              variant="ghost"
              onClick={() => step((d) => rollInitiatives(d, c.id))}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 basis-[9rem] items-center gap-1.5">
          {current ? (
            <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-contrast">
              {S.turn.current}
            </span>
          ) : null}
          <NameField c={c} />
          {/* 窄畫面只用左邊的色條表示陣營（名字的空間不夠） */}
          <span
            className={cn(
              'hidden shrink-0 rounded-sm px-1.5 py-0.5 text-xs sm:inline',
              SIDE_CLASS[c.side],
            )}
          >
            {S.side[c.side]}
          </span>
          <span className="sr-only sm:hidden">{S.side[c.side]}</span>
          {st !== 'ok' ? (
            <span
              className={cn(
                'shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium',
                st === 'dead' || st === 'dying'
                  ? 'bg-danger-soft text-danger'
                  : 'bg-warning-soft text-warning',
                st === 'stable' && 'bg-success-soft text-success',
              )}
              data-testid="status"
            >
              {S.status[st]}
            </span>
          ) : null}
          {c.hidden ? (
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted">
              <EyeOff aria-hidden className="size-3.5" />
              {S.list.hidden}
            </span>
          ) : null}
        </div>
        <MenuButton
          label=""
          aria-label={S.list.menu(c.name)}
          icon={<Ellipsis />}
          variant="ghost"
          align="end"
          items={[
            ...SIDES.filter((s) => s !== c.side).map((s) => ({
              label: `${S.rowMenu.side}：${S.side[s]}`,
              onSelect: () =>
                step((d) => {
                  const x = d.list.find((y) => y.id === c.id);
                  if (x) x.side = s;
                }),
            })),
            {
              label: c.hidden ? S.rowMenu.show : S.rowMenu.hide,
              icon: c.hidden ? <Eye /> : <EyeOff />,
              onSelect: () =>
                step((d) => {
                  const x = d.list.find((y) => y.id === c.id);
                  if (x) x.hidden = !x.hidden;
                }),
            },
            {
              label: S.rowMenu.duplicate,
              icon: <Copy />,
              onSelect: () => step((d) => void duplicateCombatant(d, c.id)),
            },
            {
              label: c.death.dead ? S.rowMenu.unmarkDead : S.rowMenu.markDead,
              icon: <Skull />,
              onSelect: () => step((d) => setDead(d, c.id, !c.death.dead)),
            },
            {
              label: S.rowMenu.remove,
              icon: <Trash2 />,
              onSelect: () => void remove(),
              'data-testid': 'row-remove',
            },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:pl-6">
        <span className="flex items-center gap-1 text-xs text-muted">
          {S.list.ac}
          <OptionalNumberInput
            aria-label={S.list.acOf(c.name)}
            value={c.ac}
            onChange={() => {}}
            onCommit={(v) =>
              step((d) => {
                const x = d.list.find((y) => y.id === c.id);
                if (x) x.ac = v;
              })
            }
            min={LIMITS.ac[0]}
            max={LIMITS.ac[1]}
            placeholder="—"
            className="w-12 [&_input]:text-center"
          />
        </span>
        <div className="flex flex-wrap items-center gap-1" data-testid="hp">
          <span className="text-xs text-muted">{S.list.hp}</span>
          {c.maxHp !== null ? (
            <>
              {/* 窄畫面只留 ±1（HP 欄可以直接打 -8、+5） */}
              <span className="hidden sm:contents">
                <IconButton
                  label={S.list.minus(5, c.name)}
                  icon={<span className="text-xs font-semibold">−5</span>}
                  size="sm"
                  variant="ghost"
                  onClick={() => damage([c.id], 5, toast)}
                />
              </span>
              <IconButton
                label={S.list.minus(1, c.name)}
                icon={<span className="text-xs font-semibold">−1</span>}
                size="sm"
                variant="ghost"
                onClick={() => damage([c.id], 1, toast)}
              />
              <HpField c={c} />
              <span className="text-muted">／</span>
            </>
          ) : null}
          <OptionalNumberInput
            aria-label={S.list.maxOf(c.name)}
            value={c.maxHp}
            onChange={() => {}}
            onCommit={(v) => step((d) => setMaxHp(d, c.id, v))}
            min={LIMITS.hp[0]}
            max={LIMITS.hp[1]}
            placeholder={S.list.hpUntracked}
            className={c.maxHp !== null ? 'w-14 [&_input]:text-center' : 'w-20'}
          />
          {c.maxHp !== null ? (
            <>
              <IconButton
                label={S.list.plus(1, c.name)}
                icon={<span className="text-xs font-semibold">+1</span>}
                size="sm"
                variant="ghost"
                onClick={() => heal([c.id], 1, toast)}
              />
              {/* 窄畫面只留 ±1（HP 欄可以直接打 -8、+5） */}
              <span className="hidden sm:contents">
                <IconButton
                  label={S.list.plus(5, c.name)}
                  icon={<span className="text-xs font-semibold">+5</span>}
                  size="sm"
                  variant="ghost"
                  onClick={() => heal([c.id], 5, toast)}
                />
              </span>
            </>
          ) : null}
        </div>
        <span className="flex items-center gap-1 text-xs text-muted">
          {S.list.temp}
          <NumberInput
            aria-label={S.list.tempOf(c.name)}
            value={c.temp}
            onChange={() => {}}
            onCommit={(v) => step((d) => setTemp(d, c.id, v))}
            min={0}
            max={LIMITS.temp[1]}
            className={cn('w-14 [&_input]:text-center', c.temp > 0 && '[&_input]:text-accent')}
          />
        </span>
      </div>
      {showDeath ? (
        <div className="sm:pl-6">
          <DeathSaves c={c} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 sm:pl-6" data-testid="conds">
        {c.conds.map((k) => {
          const srd = k.kind === 'srd' ? srdCondition(k.key) : undefined;
          const label = condName(k);
          return (
            <span
              key={k.id}
              className="inline-flex items-center rounded-full border border-border bg-surface-2 text-xs"
              data-cond={k.key}
            >
              <button
                type="button"
                className="focus-visible:focus-ring rounded-l-full py-0.5 pr-1 pl-2 hover:text-accent"
                title={srd ? `${srd.name}（${srd.en}）\n${conditionText(srd)}` : undefined}
                aria-label={S.list.editCond(
                  k.rounds ? `${label} ${S.list.rounds(k.rounds)}` : label,
                )}
                onClick={() => useUi.setState({ condFor: { id: c.id, condId: k.id } })}
              >
                {label}
                {k.rounds ? (
                  <span className="ml-1 text-muted">{S.list.rounds(k.rounds)}</span>
                ) : null}
              </button>
              <button
                type="button"
                aria-label={S.list.removeCond(label)}
                className="focus-visible:focus-ring rounded-r-full py-0.5 pr-1.5 pl-0.5 text-muted hover:text-danger"
                onClick={() =>
                  step((d) => {
                    const x = d.list.find((y) => y.id === c.id);
                    if (x) x.conds = x.conds.filter((y) => y.id !== k.id);
                  })
                }
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useUi.setState({ condFor: { id: c.id, condId: null } })}
          aria-label={S.list.addCondOf(c.name)}
        >
          {S.list.addCond}
        </Button>
        <NoteField c={c} />
      </div>
    </div>
  );
}

/** 備註（只有 GM 看得到；不送到玩家視圖） */
function NoteField({ c }: { c: Combatant }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Array.from(draft).slice(0, LIMITS.note).join('');
    if (v !== c.note)
      edit((d) => {
        const x = d.list.find((y) => y.id === c.id);
        if (x) x.note = v;
      });
    setDraft(null);
  };
  return (
    <TextInput
      aria-label={S.list.noteOf(c.name)}
      placeholder={S.list.note}
      value={draft ?? c.note}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-7 min-w-[6rem] flex-1 text-xs"
    />
  );
}
