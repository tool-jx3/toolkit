/**
 * 快速怪物數值：選挑戰等級 → AC／DC、HP（範圍）、熟練加值、每輪傷害、攻擊次數與每次傷害、範例怪物、經驗值；
 * 一行的數值卡（複製）、加進戰鬥追蹤（名字、數量）、全部挑戰等級的表、怪物的特色、狀態一覽。網址的 ?cr= 同步。
 */
import { ChevronLeft, ChevronRight, ClipboardCopy, Swords } from 'lucide-react';
import { useEffect } from 'react';
import { copyText } from '@/core/files';
import { CR_VALUES, type Cr, crIndex, parseCr } from '@/core/srd5/cr';
import {
  diceText,
  MONSTER_FEATURES,
  MONSTER_FEATURES_INTRO,
  oneLineStatBlock,
  QUICK_MONSTER_STATS,
  quickStats,
  signed,
} from '@/core/srd5/lgmrd/monsters';
import { conditionLabel, SRD_CONDITIONS } from '@/core/srd5/srd52/conditions';
import { CR_XP } from '@/core/srd5/srd52/encounter';
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
import { LIMITS, monsterSeeds } from './model';
import { sendSeeds } from './send';
import { calc, edit, step, useCalc } from './store';
import { S } from './strings';

const CR_OPTIONS = CR_VALUES.map((v) => ({ value: v, label: `CR ${v}` }));

/** 開頁時讀網址的 ?cr=（原作的做法）；之後換 CR 時改網址（不留歷史紀錄） */
export function readCrFromUrl(): Cr | null {
  try {
    const v = new URLSearchParams(location.search).get('cr');
    return v ? parseCr(v) : null;
  } catch {
    return null;
  }
}

function writeCrToUrl(cr: Cr) {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('cr') === cr) return;
    url.searchParams.set('cr', cr);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* 改不了網址就算了 */
  }
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 text-lg font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
      {hint ? <p className="m-0 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function MonsterTab() {
  const toast = useToast();
  const q = useCalc((s) => s.data.quick);
  const st = quickStats(q.cr);
  const i = crIndex(q.cr);
  useEffect(() => writeCrToUrl(q.cr), [q.cr]);
  const setCr = (cr: Cr) =>
    step((d) => {
      d.quick.cr = cr;
    });
  const line = oneLineStatBlock(st);

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Section title={S.monster.statsTitle(q.cr)} fixed>
          <div className="flex flex-col gap-3" data-testid="quick-stats">
            <div className="flex items-end gap-2">
              <Field label={S.monster.cr} className="w-40">
                <Select<Cr> value={q.cr} options={CR_OPTIONS} onValueChange={setCr} />
              </Field>
              <IconButton
                label={S.monster.prev}
                icon={<ChevronLeft />}
                disabled={i <= 0}
                onClick={() => setCr(CR_VALUES[i - 1])}
              />
              <IconButton
                label={S.monster.next}
                icon={<ChevronRight />}
                disabled={i >= CR_VALUES.length - 1}
                onClick={() => setCr(CR_VALUES[i + 1])}
              />
            </div>
            <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label={S.monster.acDc} value={String(st.acDc)} testId="stat-acdc" />
              <Stat
                label={S.monster.hp}
                value={String(st.hp)}
                hint={S.monster.hpRange(st.hpMin, st.hpMax)}
                testId="stat-hp"
              />
              <Stat label={S.monster.prof} value={signed(st.prof)} testId="stat-prof" />
              <Stat label={S.monster.dpr} value={String(st.dpr)} testId="stat-dpr" />
              <Stat
                label={S.monster.damage}
                value={`${st.attacks} × ${st.damage}`}
                hint={diceText(st.dice)}
                testId="stat-attacks"
              />
              <Stat label={S.monster.level} value={st.level} testId="stat-level" />
            </dl>
            <ul className="m-0 flex flex-col gap-0.5 pl-5 text-xs text-muted">
              <li>{S.monster.levelHint}</li>
              <li>{S.monster.acDcHint}</li>
              <li>{S.monster.profHint}</li>
              <li>{S.monster.dprHint}</li>
              <li>{S.monster.init}</li>
            </ul>
            <p className="m-0 text-sm">
              <span className="text-muted">{S.monster.examples}：</span>
              {st.examples.join('、')}
              <span className="ml-3 text-muted">{S.monster.xp}：</span>
              <span className="tabular-nums">{S.xp(CR_XP[q.cr])}</span>
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{S.monster.oneLine}</span>
              <div className="flex items-start gap-2">
                <code
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm break-words"
                  data-testid="one-line"
                >
                  {line}
                </code>
                <Button
                  size="sm"
                  icon={<ClipboardCopy />}
                  onClick={() =>
                    void copyText(line).then((ok) =>
                      toast(
                        ok
                          ? { title: S.monster.copied, tone: 'success' }
                          : { title: S.monster.copyFailed, tone: 'danger' },
                      ),
                    )
                  }
                >
                  {S.monster.copy}
                </Button>
              </div>
            </div>
          </div>
        </Section>
        <Section title={S.monster.table} persistKey="5e-calc:table" defaultOpen={false}>
          <div className="max-w-full overflow-x-auto" data-testid="cr-table">
            <table className="w-full min-w-[40rem] border-collapse text-xs tabular-nums">
              <caption className="pb-1 text-left text-muted">{S.monster.tableCaption}</caption>
              <thead>
                <tr className="text-left text-muted">
                  <th scope="col" className="py-1 pr-2 font-medium">
                    CR
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {S.monster.level}
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {S.monster.acDc}
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    HP
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {S.monster.prof}
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {S.monster.dpr}
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {S.monster.damage}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {S.monster.examples}
                  </th>
                </tr>
              </thead>
              <tbody>
                {QUICK_MONSTER_STATS.map((r) => (
                  <tr
                    key={r.cr}
                    className={cn(
                      'border-t border-border',
                      r.cr === q.cr && 'bg-accent-soft font-semibold',
                    )}
                  >
                    <th scope="row" className="py-1 pr-2 text-left">
                      <button
                        type="button"
                        className="focus-visible:focus-ring text-accent underline"
                        onClick={() => setCr(r.cr)}
                      >
                        {r.cr}
                      </button>
                    </th>
                    <td className="py-1 pr-2">{r.level}</td>
                    <td className="py-1 pr-2">{r.acDc}</td>
                    <td className="py-1 pr-2">
                      {r.hp}（{r.hpMin}～{r.hpMax}）
                    </td>
                    <td className="py-1 pr-2">{signed(r.prof)}</td>
                    <td className="py-1 pr-2">{r.dpr}</td>
                    <td className="py-1 pr-2">
                      {r.attacks} × {r.damage}（{diceText(r.dice)}）
                    </td>
                    <td className="py-1">{r.examples.join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title={S.monster.features} persistKey="5e-calc:features">
          <p className="m-0 mb-2 text-sm">{MONSTER_FEATURES_INTRO}</p>
          <dl className="m-0 flex flex-col gap-2 text-sm" data-testid="features">
            {MONSTER_FEATURES.map((f) => (
              <div key={f.en}>
                <dt className="font-semibold">
                  {f.name}（{f.en}）
                </dt>
                <dd className="m-0">{f.text}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title={S.monster.conditions} persistKey="5e-calc:conditions" defaultOpen={false}>
          <p className="m-0 mb-2 text-sm">{S.monster.conditionsLead}</p>
          <dl className="m-0 flex flex-col gap-2 text-sm">
            {SRD_CONDITIONS.filter((c) => !c.marker).map((c) => (
              <div key={c.key}>
                <dt className="font-semibold">{conditionLabel(c)}</dt>
                <dd className="m-0">
                  <ul className="m-0 pl-5">
                    {c.effects.map((e) => (
                      <li key={e.title}>
                        <strong className="font-semibold">{e.title}。</strong>
                        {e.text}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
      <div className="min-w-0 lg:sticky-pane">
        <Section title={S.monster.sendTitle} fixed>
          <div className="flex flex-col gap-3" data-testid="quick-send">
            <Field label={S.monster.name}>
              <TextInput
                value={q.name}
                maxLength={LIMITS.name}
                placeholder={S.enc.monsterNamePlaceholder(q.cr)}
                onFocus={() => useCalc.beginGesture()}
                onBlur={() => queueMicrotask(() => useCalc.endGesture())}
                onChange={(e) =>
                  edit((d) => {
                    d.quick.name = e.target.value;
                  })
                }
              />
            </Field>
            <Field label={S.monster.count}>
              <NumberInput
                value={q.count}
                min={LIMITS.monsterCount[0]}
                max={LIMITS.monsterCount[1]}
                onChange={(v) =>
                  edit((d) => {
                    d.quick.count = v;
                  })
                }
              />
            </Field>
            <Button
              variant="primary"
              icon={<Swords />}
              onClick={() => {
                const qq = calc().quick;
                const seeds = monsterSeeds([qq]);
                sendSeeds(seeds, seeds[0].name, toast);
              }}
            >
              {S.monster.send}
            </Button>
            <p className="m-0 text-xs text-muted">{S.enc.sendHint}</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
