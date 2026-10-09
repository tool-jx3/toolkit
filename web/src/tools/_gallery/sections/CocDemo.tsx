/**
 * 元件展示頁「模組」分頁：core/coc（CoC 規則）的示範——骰子算式、7 版技能檢定、DB／體格表、
 * 7 版調查員的移動力與困難／極限（coc-sheet 移植時新增；技能值欄示範可以留白的 OptionalNumberInput）。
 */
import { useState } from 'react';
import {
  damageBonus6,
  damageBonus7,
  formatDiceDetail,
  movementRate7,
  rollDiceExpression,
  rollPercentile,
  SUCCESS_LEVEL_LABELS,
  skillThresholds,
  successLevel,
} from '@/core/coc';
import {
  Button,
  Field,
  FieldRow,
  NumberInput,
  OptionalNumberInput,
  Section,
  Segmented,
  TextInput,
} from '@/ui';

const BONUS = ['-2', '-1', '0', '1', '2'].map((v) => ({ value: v, label: v }));

export function CocDemo() {
  const [expr, setExpr] = useState('2D6+1D4+3');
  const [exprOut, setExprOut] = useState('');
  const [skill, setSkill] = useState(50);
  const [bonus, setBonus] = useState('0');
  const [skillOut, setSkillOut] = useState('');
  const [strSiz, setStrSiz] = useState(130);
  const db7 = damageBonus7(strSiz);
  const [mov, setMov] = useState<{ STR: number; DEX: number; SIZ: number; age: number | null }>({
    STR: 50,
    DEX: 65,
    SIZ: 60,
    age: null,
  });
  const [value, setValue] = useState<number | null>(null);
  const shown = value ?? 15;
  const th = skillThresholds(shown);

  return (
    <Section title="CoC 規則（core/coc）">
      <Field label="骰子算式" hint="NdM±常數、可以用全形；亂數可以注入（window.__cocRandom）。">
        <div className="flex min-w-0 gap-2">
          <TextInput value={expr} onChange={(e) => setExpr(e.target.value)} className="font-mono" />
          <Button
            onClick={() => {
              const r = rollDiceExpression(expr);
              setExprOut(r.ok ? `${formatDiceDetail(r.terms)} ＞ ${r.total}` : `錯誤：${r.error}`);
            }}
          >
            擲骰
          </Button>
        </div>
      </Field>
      {exprOut ? <p className="m-0 font-mono text-sm">{exprOut}</p> : null}
      <Field label="技能檢定（7 版）">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <NumberInput value={skill} onChange={setSkill} min={1} max={999} className="w-24" />
          <Segmented value={bonus} onValueChange={setBonus} options={BONUS} size="sm" />
          <Button
            onClick={() => {
              const r = rollPercentile(Number(bonus));
              setSkillOut(
                `${r.candidates.join(', ')} ＞ ${r.result} ＞ ${SUCCESS_LEVEL_LABELS[successLevel(r.result, skill)]}`,
              );
            }}
          >
            擲 1D100
          </Button>
        </div>
      </Field>
      {skillOut ? <p className="m-0 font-mono text-sm">{skillOut}</p> : null}
      <Field label="STR＋SIZ" hint="7 版用 ×5 之後的值、6 版用原始值查表。">
        <NumberInput value={strSiz} onChange={setStrSiz} min={0} max={999} className="w-24" />
      </Field>
      <p className="m-0 text-sm">
        7 版：DB {db7.db}、體格 {db7.build}；6 版：DB {damageBonus6(strSiz)}
      </p>
      <FieldRow columns={4}>
        {(['STR', 'DEX', 'SIZ'] as const).map((k) => (
          <Field key={k} label={k}>
            <NumberInput
              value={mov[k]}
              onChange={(v) => setMov((m) => ({ ...m, [k]: v }))}
              min={0}
              max={999}
            />
          </Field>
        ))}
        <Field label="年齡">
          <OptionalNumberInput
            value={mov.age}
            onChange={(v) => setMov((m) => ({ ...m, age: v }))}
            min={0}
            max={150}
            placeholder="未填"
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-sm" data-testid="coc-demo-mov">
        移動力（7 版）：{movementRate7(mov) ?? '—'}
      </p>
      <Field
        label="技能值（OptionalNumberInput：可以留白）"
        hint="留白時用初始值 15（灰字提示）；空白時按 ↑ 從 15 開始加。"
      >
        <OptionalNumberInput
          value={value}
          onChange={setValue}
          min={0}
          max={999}
          placeholder="15"
          fallback={15}
          className="w-28"
        />
      </Field>
      <p className="m-0 text-sm" data-testid="coc-demo-thresholds">
        一般 {th.regular}／困難 {th.hard}／極限 {th.extreme}
        {value === null ? '（自動）' : ''}
      </p>
    </Section>
  );
}
