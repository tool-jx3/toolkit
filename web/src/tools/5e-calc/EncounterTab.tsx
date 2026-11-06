/**
 * 遭遇預算：隊伍（幾組人數＋等級）、怪物（幾組名字＋CR＋數量）→ XP 總和、SRD 5.2.1 的預算與難度、簡易遭遇基準、提醒；
 * 加進戰鬥追蹤、匯出原作格式的 JSON、複製結果。
 */
import { ClipboardCopy, Download, Plus, Swords, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { copyText, downloadText } from '@/core/files';
import { CR_VALUES, type Cr } from '@/core/srd5/cr';
import { BENCHMARK_TEXT } from '@/core/srd5/lgmrd/benchmark';
import { CR_XP, DIFFICULTIES, DIFFICULTY_TEXT, ENCOUNTER_TIPS } from '@/core/srd5/srd52/encounter';
import {
  Button,
  cn,
  Field,
  IconButton,
  NumberInput,
  Section,
  Select,
  TextInput,
  useToast,
} from '@/ui';
import {
  type EncounterSummary,
  encounterSummary,
  LIMITS,
  monsterName,
  monsterSeeds,
  newId,
  trackerJson,
  trackerJsonName,
} from './model';
import { sendSeeds } from './send';
import { calc, edit, step, useCalc } from './store';
import { S } from './strings';

const CR_OPTIONS = CR_VALUES.map((v) => ({ value: v, label: `CR ${v}` }));
const LEVEL_OPTIONS = Array.from({ length: 20 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} 級`,
}));

const fraction = (f: number) =>
  f === 0.25 ? '1/4' : f === 0.5 ? '1/2' : f === 0.75 ? '3/4' : String(f);
const crText = (n: number) =>
  n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n);

function PartyEditor() {
  const party = useCalc((s) => s.data.party);
  return (
    <Section title={S.enc.party} description={S.enc.partyHint} fixed>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="party">
        {party.map((g, i) => (
          <li key={g.id} className="flex items-end gap-2">
            <Field label={S.enc.count} className="w-24">
              <NumberInput
                aria-label={S.enc.countOf(i + 1)}
                value={g.count}
                min={LIMITS.partyCount[0]}
                max={LIMITS.partyCount[1]}
                onChange={(v) =>
                  edit((d) => {
                    d.party[i].count = v;
                  })
                }
              />
            </Field>
            <Field label={S.enc.level} className="w-28">
              <Select
                aria-label={S.enc.levelOf(i + 1)}
                value={String(g.level)}
                options={LEVEL_OPTIONS}
                onValueChange={(v) =>
                  step((d) => {
                    d.party[i].level = Number(v);
                  })
                }
              />
            </Field>
            {party.length > 1 ? (
              <IconButton
                label={S.enc.removeParty(i + 1)}
                icon={<Trash2 />}
                variant="ghost"
                onClick={() =>
                  step((d) => {
                    d.party.splice(i, 1);
                  })
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        icon={<Plus />}
        className="mt-2"
        disabled={party.length >= LIMITS.partyGroups}
        onClick={() =>
          step((d) => {
            d.party.push({
              id: newId('p'),
              count: 1,
              level: d.party[d.party.length - 1]?.level ?? 1,
            });
          })
        }
      >
        {S.enc.addParty}
      </Button>
    </Section>
  );
}

function MonsterEditor() {
  const monsters = useCalc((s) => s.data.monsters);
  return (
    <Section title={S.enc.monsters} fixed>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" data-testid="monsters">
        {monsters.map((g, i) => (
          <li
            key={g.id}
            className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2"
          >
            <div className="flex flex-wrap items-end gap-2">
              <Field label={S.enc.monsterName} className="min-w-[8rem] flex-1">
                <TextInput
                  aria-label={S.enc.monsterNameOf(i + 1)}
                  value={g.name}
                  maxLength={LIMITS.name}
                  placeholder={S.enc.monsterNamePlaceholder(g.cr)}
                  onFocus={() => useCalc.beginGesture()}
                  onBlur={() => queueMicrotask(() => useCalc.endGesture())}
                  onChange={(e) =>
                    edit((d) => {
                      d.monsters[i].name = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="CR" className="w-28">
                <Select<Cr>
                  aria-label={S.enc.crOf(i + 1)}
                  value={g.cr}
                  options={CR_OPTIONS}
                  onValueChange={(v) =>
                    step((d) => {
                      d.monsters[i].cr = v;
                    })
                  }
                />
              </Field>
              <Field label={S.monster.count} className="w-24">
                <NumberInput
                  aria-label={S.enc.monsterCountOf(i + 1)}
                  value={g.count}
                  min={LIMITS.monsterCount[0]}
                  max={LIMITS.monsterCount[1]}
                  onChange={(v) =>
                    edit((d) => {
                      d.monsters[i].count = v;
                    })
                  }
                />
              </Field>
              {monsters.length > 1 ? (
                <IconButton
                  label={S.enc.removeMonster(i + 1)}
                  icon={<Trash2 />}
                  variant="ghost"
                  onClick={() =>
                    step((d) => {
                      d.monsters.splice(i, 1);
                    })
                  }
                />
              ) : null}
            </div>
            <p className="m-0 text-xs text-muted tabular-nums" data-testid="group-xp">
              {S.enc.groupXp(CR_XP[g.cr], g.count)} ＝ {S.xp(CR_XP[g.cr] * g.count)}
            </p>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        icon={<Plus />}
        className="mt-2"
        disabled={monsters.length >= LIMITS.monsterGroups}
        onClick={() =>
          step((d) => {
            d.monsters.push({
              id: newId('m'),
              name: '',
              cr: d.monsters[d.monsters.length - 1]?.cr ?? '1',
              count: 1,
            });
          })
        }
      >
        {S.enc.addMonster}
      </Button>
      {monsters.some((m) => m.cr === '0') ? (
        <p className="m-0 mt-2 text-xs text-muted">{S.enc.cr0Note}</p>
      ) : null}
    </Section>
  );
}

const VERDICT_CLASS = {
  none: 'bg-surface-2 text-muted',
  low: 'bg-success-soft text-success',
  moderate: 'bg-warning-soft text-warning',
  high: 'bg-danger-soft text-danger',
  over: 'bg-danger text-danger-contrast',
} as const;

/** 複製的文字 */
export function encounterText(s: EncounterSummary): string {
  const lines = [
    S.enc.summary(s.characters, s.avgLevel, s.monsters),
    `${S.enc.totalXp}：${S.xp(s.xp)}`,
    `${S.enc.srdTitle}：${DIFFICULTIES.map((k) => `${DIFFICULTY_TEXT[k].name} ${s.budget[k].toLocaleString('en-US')}`).join('／')}　→ ${S.enc.verdict[s.difficulty]}`,
  ];
  const b = s.benchmark;
  if (b) {
    lines.push(
      `${S.enc.benchTitle}：${S.enc.benchLine(b.totalLevels, fraction(b.factor), b.benchmark, b.totalCr)}${b.scaled ? `；${S.enc.benchScaled(fraction(b.scaled.factor), b.scaled.benchmark)}` : ''}　→ ${S.enc.benchVerdict[b.verdict]}`,
    );
  }
  return lines.join('\n');
}

function Results() {
  const toast = useToast();
  const party = useCalc((s) => s.data.party);
  const monsters = useCalc((s) => s.data.monsters);
  const [more, setMore] = useState(false);
  const s = useMemo(() => encounterSummary(party, monsters), [party, monsters]);
  const b = s.benchmark;
  const benchDeadly = b && b.verdict !== 'safe';
  return (
    <Section title={S.enc.result} fixed>
      <div className="flex flex-col gap-4" data-testid="enc-result">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-sm text-muted">
            {S.enc.summary(s.characters, s.avgLevel, s.monsters)}
          </p>
          <p className="m-0 text-sm">
            {S.enc.totalXp}：
            <strong className="text-lg tabular-nums" data-testid="total-xp">
              {S.xp(s.xp)}
            </strong>
          </p>
        </div>

        <section className="flex flex-col gap-2" aria-label={S.enc.srdTitle}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-sm font-semibold">{S.enc.srdTitle}</h3>
            <span
              className={cn(
                'rounded-sm px-2 py-0.5 text-sm font-semibold',
                VERDICT_CLASS[s.difficulty],
              )}
              data-testid="verdict"
            >
              {S.enc.verdict[s.difficulty]}
            </span>
          </div>
          <p className="m-0 text-xs text-muted">{S.enc.srdLead}</p>
          <table className="w-full border-collapse text-sm tabular-nums" data-testid="budget">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium" scope="col" />
                <th className="py-1 text-right font-medium" scope="col">
                  {S.enc.budget}
                </th>
                <th className="py-1 text-right font-medium" scope="col">
                  {S.enc.left}
                </th>
              </tr>
            </thead>
            <tbody>
              {DIFFICULTIES.map((k) => {
                const left = s.budget[k] - s.xp;
                return (
                  <tr
                    key={k}
                    className={cn(
                      'border-t border-border',
                      s.difficulty === k && 'bg-accent-soft font-semibold',
                    )}
                  >
                    <th scope="row" className="py-1 pl-1 text-left font-medium">
                      {DIFFICULTY_TEXT[k].name}（{DIFFICULTY_TEXT[k].en}）
                    </th>
                    <td className="py-1 text-right">{s.budget[k].toLocaleString('en-US')}</td>
                    <td className={cn('py-1 pr-1 text-right', left < 0 && 'text-danger')}>
                      {left < 0 ? S.enc.over(-left) : S.enc.remain(left)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {s.difficulty === 'none' ? null : (
            <p className="m-0 text-xs">
              {s.difficulty === 'over' ? S.enc.overText : DIFFICULTY_TEXT[s.difficulty].text}
            </p>
          )}
        </section>

        {b ? (
          <section
            className="flex flex-col gap-1.5"
            aria-label={S.enc.benchTitle}
            data-testid="benchmark"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-sm font-semibold">{S.enc.benchTitle}</h3>
              <span
                className={cn(
                  'rounded-sm px-2 py-0.5 text-sm font-semibold',
                  benchDeadly ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
                )}
                data-testid="bench-verdict"
              >
                {S.enc.benchVerdict[b.verdict]}
              </span>
            </div>
            <p className="m-0 text-sm tabular-nums">
              {S.enc.benchLine(b.totalLevels, fraction(b.factor), b.benchmark, b.totalCr)}
            </p>
            {b.scaled ? (
              <p className="m-0 text-sm tabular-nums">
                {S.enc.benchScaled(fraction(b.scaled.factor), b.scaled.benchmark)}
              </p>
            ) : null}
            <p className="m-0 text-sm tabular-nums">
              {S.enc.benchSingle(crText(b.singleCap), crText(b.highestCr))}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
            >
              {S.enc.benchMore}
            </Button>
            {more ? (
              <ul className="m-0 flex flex-col gap-1 pl-5 text-xs text-muted">
                {Object.values(BENCHMARK_TEXT).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {s.tips.length ? (
          <section
            className="flex flex-col gap-1 rounded-md border border-warning bg-warning-soft p-2"
            data-testid="tips"
          >
            <h3 className="m-0 text-sm font-semibold text-warning">{S.enc.tipsTitle}</h3>
            <ul className="m-0 flex flex-col gap-1 pl-5 text-xs">
              {s.tips.map((t) => (
                <li key={t}>{ENCOUNTER_TIPS[t]}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            icon={<Swords />}
            disabled={!monsters.length}
            onClick={() =>
              sendSeeds(
                monsterSeeds(calc().monsters),
                monsterName(calc().monsters[0] ?? { name: '', cr: '1' }),
                toast,
              )
            }
          >
            {S.enc.send}
          </Button>
          <p className="m-0 text-xs text-muted">{S.enc.sendHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ClipboardCopy />}
              onClick={() =>
                void copyText(encounterText(s)).then((ok) =>
                  toast(
                    ok
                      ? { title: S.enc.copied, tone: 'success' }
                      : { title: S.monster.copyFailed, tone: 'danger' },
                  ),
                )
              }
            >
              {S.enc.copy}
            </Button>
            <Button
              size="sm"
              icon={<Download />}
              title={S.enc.exportHint}
              onClick={() => {
                const now = new Date();
                downloadText(
                  trackerJson(calc().monsters, now),
                  trackerJsonName(now),
                  'application/json',
                );
              }}
            >
              {S.enc.exportJson}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function EncounterTab() {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-3">
        <PartyEditor />
        <MonsterEditor />
      </div>
      <div className="min-w-0 lg:sticky-pane">
        <Results />
      </div>
    </div>
  );
}
