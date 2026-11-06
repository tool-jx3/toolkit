/**
 * 能力值點數購買：27 點、每項 8～15（－／＋、直接打）、花費、調整值；規則切換 2024（SRD 5.2.1 背景的 +2／+1 或三項 +1）／
 * 2014（SRD 5.1 種族）；最後的能力值與調整值；標準數組與依職業的分配；全部回到 8；複製結果。
 */
import { ClipboardCopy, Minus, Plus, RotateCcw } from 'lucide-react';
import { copyText } from '@/core/files';
import { RACES_51 } from '@/core/srd5/srd51/races';
import {
  ABILITIES,
  type Ability,
  BACKGROUNDS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  POINT_BUY_TOTAL,
  POINT_COST,
  STANDARD_ARRAY,
  STANDARD_ARRAY_BY_CLASS,
} from '@/core/srd5/srd52/abilities';
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  useToast,
} from '@/ui';
import {
  type BuyState,
  backgroundAbilities,
  baseScores,
  bonuses,
  buyText,
  canDecrease,
  canIncrease,
  finalScores,
  fixBackground,
  fixRaceChoice,
  modText,
  pointsLeft,
  typedScore,
} from './model';
import { step, useCalc } from './store';
import { S } from './strings';

const setBuy = (recipe: (b: BuyState) => void) =>
  step((d) => {
    recipe(d.buy);
  });

const nameOf = (k: Ability) => ABILITIES.find((a) => a.key === k)?.name ?? k;

function BackgroundPicker({ b }: { b: BuyState }) {
  const abilities = backgroundAbilities(b);
  const bgOptions = [
    { value: 'none', label: S.buy.bgNone },
    ...BACKGROUNDS.map((x) => ({
      value: x.key,
      label: `${x.name}（${x.en}）`,
      description: S.buy.bgAbilities(x.abilities.map(nameOf).join('、')),
    })),
    { value: 'custom', label: S.buy.bgCustom },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.buy.background}>
        <Select
          value={b.bg}
          options={bgOptions}
          onValueChange={(v) =>
            setBuy((x) => {
              x.bg = v as BuyState['bg'];
              fixBackground(x);
            })
          }
        />
      </Field>
      {b.bg === 'custom' ? (
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{S.buy.bgCustomPick}</legend>
          <div className="flex flex-wrap gap-3">
            {ABILITIES.map((a) => {
              const on = b.bgCustom.includes(a.key);
              return (
                <Checkbox
                  key={a.key}
                  label={a.name}
                  checked={on}
                  disabled={!on && b.bgCustom.length >= 3}
                  onCheckedChange={(v) =>
                    setBuy((x) => {
                      x.bgCustom = v
                        ? [...x.bgCustom, a.key].slice(0, 3)
                        : x.bgCustom.filter((k) => k !== a.key);
                      if (x.bgCustom.length === 3) fixBackground(x);
                    })
                  }
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {abilities && abilities.length === 3 ? (
        <>
          <Field label={S.buy.bgMode}>
            <Segmented
              value={b.bgMode}
              onValueChange={(v) =>
                setBuy((x) => {
                  x.bgMode = v;
                })
              }
              options={[
                { value: '2-1', label: S.buy.bgMode21 },
                { value: '1-1-1', label: S.buy.bgMode111 },
              ]}
              fullWidth
            />
          </Field>
          {b.bgMode === '2-1' ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label={S.buy.plus2}>
                <Segmented
                  value={b.bgPlus2}
                  onValueChange={(v) =>
                    setBuy((x) => {
                      if (x.bgPlus1 === v) x.bgPlus1 = x.bgPlus2;
                      x.bgPlus2 = v;
                      fixBackground(x);
                    })
                  }
                  options={abilities.map((k) => ({ value: k, label: nameOf(k) }))}
                  fullWidth
                />
              </Field>
              <Field label={S.buy.plus1}>
                <Segmented
                  value={b.bgPlus1}
                  onValueChange={(v) =>
                    setBuy((x) => {
                      if (x.bgPlus2 === v) x.bgPlus2 = x.bgPlus1;
                      x.bgPlus1 = v;
                      fixBackground(x);
                    })
                  }
                  options={abilities.map((k) => ({ value: k, label: nameOf(k) }))}
                  fullWidth
                />
              </Field>
            </div>
          ) : null}
          <p className="m-0 text-xs text-muted">{S.buy.bgRule}</p>
        </>
      ) : null}
    </div>
  );
}

function RacePicker({ b }: { b: BuyState }) {
  const race = RACES_51.find((r) => r.key === b.race);
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.buy.race} hint={S.buy.raceRule}>
        <Select
          value={b.race}
          options={[
            { value: 'none', label: S.buy.raceNone },
            ...RACES_51.map((r) => ({
              value: r.key,
              label: `${r.name}（${r.en}）`,
              description: [
                ...Object.entries(r.bonus).map(([k, v]) => `${nameOf(k as Ability)} +${v}`),
                ...(r.choice ? [`自選兩項 +${r.choice.amount}`] : []),
              ].join('、'),
            })),
          ]}
          onValueChange={(v) =>
            setBuy((x) => {
              x.race = v as BuyState['race'];
              fixRaceChoice(x);
            })
          }
        />
      </Field>
      {race?.choice ? (
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{S.buy.raceChoice}</legend>
          <div className="flex flex-wrap gap-3">
            {ABILITIES.filter((a) => !race.choice?.exclude.includes(a.key)).map((a) => {
              const on = b.raceChoice.includes(a.key);
              return (
                <Checkbox
                  key={a.key}
                  label={a.name}
                  checked={on}
                  disabled={!on && b.raceChoice.length >= (race.choice?.count ?? 2)}
                  onCheckedChange={(v) =>
                    setBuy((x) => {
                      x.raceChoice = v
                        ? [...x.raceChoice, a.key]
                        : x.raceChoice.filter((k) => k !== a.key);
                    })
                  }
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function PointBuyTab() {
  const toast = useToast();
  const b = useCalc((s) => s.data.buy);
  const left = pointsLeft(b.scores);
  const bonus = bonuses(b);
  const fin = finalScores(b);
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <Section title={S.tabs.buy} fixed>
        <div className="flex flex-col gap-3" data-testid="point-buy">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className="m-0 text-lg font-semibold tabular-nums"
              data-testid="points-left"
              aria-live="polite"
            >
              {S.buy.points(left, POINT_BUY_TOTAL)}
            </p>
            <Button
              size="sm"
              icon={<RotateCcw />}
              onClick={() =>
                setBuy((x) => {
                  x.scores = baseScores();
                })
              }
            >
              {S.buy.reset}
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">{S.buy.pointsLead}</p>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {ABILITIES.map((a) => {
              const s = b.scores[a.key];
              return (
                <li
                  key={a.key}
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2"
                  data-ability={a.key}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {a.name}
                      <span className="ml-1 text-xs font-normal text-muted">
                        {a.abbr}（{a.en}）
                      </span>
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {S.buy.cost(POINT_COST[s])}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconButton
                      label={S.buy.minus(a.name)}
                      icon={<Minus />}
                      disabled={!canDecrease(b.scores, a.key)}
                      onClick={() =>
                        setBuy((x) => {
                          x.scores[a.key] -= 1;
                        })
                      }
                    />
                    <NumberInput
                      aria-label={S.buy.scoreOf(a.name)}
                      value={s}
                      min={POINT_BUY_MIN}
                      max={POINT_BUY_MAX}
                      onChange={() => {}}
                      onCommit={(v) =>
                        setBuy((x) => {
                          x.scores[a.key] = typedScore(x.scores, a.key, v);
                        })
                      }
                      className="w-16 [&_input]:text-center"
                    />
                    <IconButton
                      label={S.buy.plus(a.name)}
                      icon={<Plus />}
                      disabled={!canIncrease(b.scores, a.key)}
                      onClick={() =>
                        setBuy((x) => {
                          x.scores[a.key] += 1;
                        })
                      }
                    />
                    <span className="ml-auto text-sm tabular-nums text-muted">{modText(s)}</span>
                  </div>
                  <div
                    className="flex items-center justify-between text-sm tabular-nums"
                    data-testid="final"
                  >
                    <span className="text-xs text-muted">
                      {S.buy.bonus} {bonus[a.key] ? `+${bonus[a.key]}` : '—'}
                    </span>
                    <span>
                      {S.buy.final} <strong className="text-lg">{fin[a.key]}</strong>
                      <span className="ml-1 text-muted">（{modText(fin[a.key])}）</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 rounded-md border border-border p-2">
            <p className="m-0 text-xs text-muted">{S.buy.standardHint}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  setBuy((x) => {
                    ABILITIES.forEach((a, i) => {
                      x.scores[a.key] = STANDARD_ARRAY[i];
                    });
                  })
                }
              >
                {S.buy.standard}
              </Button>
              <Select
                aria-label={S.buy.standardPick}
                placeholder={S.buy.standardPick}
                value=""
                options={STANDARD_ARRAY_BY_CLASS.map((c) => ({
                  value: c.key,
                  label: `${c.name}（${c.en}）`,
                }))}
                onValueChange={(v) => {
                  const c = STANDARD_ARRAY_BY_CLASS.find((x) => x.key === v);
                  if (c)
                    setBuy((x) => {
                      ABILITIES.forEach((a, i) => {
                        x.scores[a.key] = c.scores[i];
                      });
                    });
                }}
                className="w-48"
              />
            </div>
          </div>
        </div>
      </Section>
      <div className="flex min-w-0 flex-col gap-3 lg:sticky-pane">
        <Section title={S.buy.rules} fixed>
          <div className="flex flex-col gap-3">
            <Segmented
              aria-label={S.buy.rules}
              value={b.rules}
              onValueChange={(v) =>
                setBuy((x) => {
                  x.rules = v;
                })
              }
              options={[
                { value: '2024', label: S.buy.rules2024 },
                { value: '2014', label: S.buy.rules2014 },
              ]}
              fullWidth
            />
            {b.rules === '2024' ? <BackgroundPicker b={b} /> : <RacePicker b={b} />}
            <Button
              size="sm"
              icon={<ClipboardCopy />}
              onClick={() =>
                void copyText(buyText(b)).then((ok) =>
                  toast(
                    ok
                      ? { title: S.buy.copied, tone: 'success' }
                      : { title: S.monster.copyFailed, tone: 'danger' },
                  ),
                )
              }
            >
              {S.buy.copy}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
