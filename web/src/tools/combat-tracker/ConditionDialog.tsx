/**
 * 加狀態／編輯狀態的對話框：5e 的狀態（SRD 5.2.1，選項開著時；名稱＋英文、點了看說明）、專注、自訂狀態（候選＋自己取名）；
 * 持續（不限或幾輪）、力竭的等級。從某一列的「＋狀態」打開；那一列也在勾選裡、勾選了好幾位時一起加。
 */
import { useEffect, useMemo, useState } from 'react';
import { conditionLabel, SRD_CONDITIONS, srdCondition } from '@/core/srd5/srd52/conditions';
import { Button, cn, Dialog, DialogClose, Field, NumberInput, Segmented, TextInput } from '@/ui';
import {
  addCondition,
  type CondInst,
  condName,
  LIMITS,
  removeCondition,
  updateCondition,
} from './model';
import { step, useCombat, useUi } from './store';
import { S } from './strings';

type Pick = { kind: 'srd' | 'custom'; key: string } | null;

export function ConditionDialog() {
  const target = useUi((s) => s.condFor);
  const selected = useUi((s) => s.selected);
  const list = useCombat((s) => s.data.list);
  const settings = useCombat((s) => s.data.settings);
  const customConds = useCombat((s) => s.data.customConds);
  const c = target ? list.find((x) => x.id === target.id) : undefined;
  const editing: CondInst | undefined =
    c && target?.condId ? c.conds.find((k) => k.id === target.condId) : undefined;
  const ids = useMemo(() => {
    if (!c) return [];
    return selected.includes(c.id) && selected.length > 1 ? selected : [c.id];
  }, [c, selected]);

  const [pick, setPick] = useState<Pick>(null);
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<'forever' | 'rounds'>('forever');
  const [rounds, setRounds] = useState(1);
  const [level, setLevel] = useState(1);

  const open = !!c;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 打開時（換了對象）才重設
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPick({ kind: editing.kind, key: editing.key });
      setMode(editing.rounds === null ? 'forever' : 'rounds');
      setRounds(editing.rounds ?? 1);
      setLevel(editing.level ?? 1);
    } else {
      setPick(null);
      setMode('forever');
      setRounds(1);
      setLevel(1);
    }
    setCustom('');
  }, [open, target?.id, target?.condId]);

  const close = () => useUi.setState({ condFor: null });
  if (!c) return null;

  const chosenKey = pick?.kind === 'custom' ? pick.key : pick?.key;
  const srd = pick?.kind === 'srd' ? srdCondition(pick.key) : undefined;
  const customText = custom.trim();
  const effective: Pick = customText ? { kind: 'custom', key: customText } : pick;

  const apply = () => {
    const r = mode === 'forever' ? null : rounds;
    if (editing) {
      step((d) => updateCondition(d, c.id, editing.id, { rounds: r, level }));
      close();
      return;
    }
    if (!effective) return;
    step((d) => {
      addCondition(d, ids, { kind: effective.kind, key: effective.key, rounds: r, level });
      if (
        effective.kind === 'custom' &&
        !d.customConds.includes(effective.key) &&
        d.customConds.length < LIMITS.customConds
      )
        d.customConds.push(Array.from(effective.key).slice(0, LIMITS.customName).join(''));
    });
    close();
  };

  const chip = (kind: 'srd' | 'custom', key: string, label: string, title?: string) => {
    const on = !customText && pick?.kind === kind && pick.key === key;
    return (
      <button
        key={`${kind}:${key}`}
        type="button"
        aria-pressed={on}
        title={title}
        onClick={() => {
          setPick({ kind, key });
          setCustom('');
        }}
        className={cn(
          'focus-visible:focus-ring rounded-full border px-2.5 py-1 text-xs transition-colors',
          on
            ? 'border-accent bg-accent text-accent-contrast'
            : 'border-border bg-surface-2 hover:border-accent',
        )}
      >
        {label}
      </button>
    );
  };

  const title = editing
    ? S.cond.editTitle(condName(editing), c.name)
    : ids.length > 1
      ? S.cond.titleMany(ids.length)
      : S.cond.title(c.name);

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={title}
      size="lg"
      footer={
        <>
          {editing ? (
            <Button
              variant="danger"
              onClick={() => {
                step((d) => removeCondition(d, c.id, editing.id));
                close();
              }}
            >
              {S.cond.remove}
            </Button>
          ) : null}
          <DialogClose />
          <Button variant="primary" onClick={apply} disabled={!editing && !effective}>
            {editing ? S.cond.save : S.cond.add}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="cond-dialog">
        {!editing ? (
          <>
            {settings.srdConds ? (
              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">{S.cond.srd}</h3>
                {/* biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組 */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={S.cond.srd}>
                  {SRD_CONDITIONS.filter((x) => !x.marker).map((x) =>
                    chip('srd', x.key, conditionLabel(x)),
                  )}
                </div>
                <h3 className="m-0 text-sm font-semibold">{S.cond.marker}</h3>
                {/* biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組 */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={S.cond.marker}>
                  {SRD_CONDITIONS.filter((x) => x.marker).map((x) =>
                    chip('srd', x.key, conditionLabel(x)),
                  )}
                </div>
              </section>
            ) : null}
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-semibold">{S.cond.custom}</h3>
              {customConds.length ? (
                // biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={S.cond.custom}>
                  {customConds.map((n) => chip('custom', n, n))}
                </div>
              ) : null}
              <Field label={S.cond.customName}>
                <TextInput
                  value={custom}
                  maxLength={LIMITS.customName}
                  placeholder={S.cond.customPlaceholder}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customText) apply();
                  }}
                />
              </Field>
            </section>
          </>
        ) : null}
        {srd ? (
          <section
            className="rounded-md border border-border bg-surface-2 p-3 text-sm"
            aria-label={S.cond.details}
            data-testid="cond-details"
          >
            <p className="m-0 mb-1 font-semibold">{conditionLabel(srd)}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {srd.effects.map((e) => (
                <li key={e.title}>
                  <strong className="font-semibold">{e.title}。</strong>
                  {e.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {chosenKey || customText || editing ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={S.cond.duration} hint={S.cond.durationHint}>
              <div className="flex items-center gap-2">
                <Segmented
                  value={mode}
                  onValueChange={setMode}
                  options={[
                    { value: 'forever', label: S.cond.forever },
                    { value: 'rounds', label: S.cond.roundsN },
                  ]}
                />
                {mode === 'rounds' ? (
                  <NumberInput
                    aria-label={S.cond.roundsN}
                    value={rounds}
                    onChange={setRounds}
                    min={LIMITS.rounds[0]}
                    max={LIMITS.rounds[1]}
                    unit="輪"
                    className="w-24"
                  />
                ) : null}
              </div>
            </Field>
            {srd?.maxLevel && !customText ? (
              <Field label={S.cond.level}>
                <NumberInput
                  value={level}
                  onChange={setLevel}
                  min={1}
                  max={srd.maxLevel}
                  className="w-20"
                />
              </Field>
            ) : null}
          </div>
        ) : (
          <p className="m-0 text-sm text-muted">{S.cond.pick}</p>
        )}
      </div>
    </Dialog>
  );
}
