/**
 * 元件展示頁「模組」分頁：core/coc（CoC 規則）的示範——骰子算式、7 版技能檢定、DB／體格表。
 */
import { useState } from 'react';
import {
  damageBonus6,
  damageBonus7,
  formatDiceDetail,
  rollDiceExpression,
  rollPercentile,
  SUCCESS_LEVEL_LABELS,
  successLevel,
} from '@/core/coc';
import { Button, Field, NumberInput, Section, Segmented, TextInput } from '@/ui';

const BONUS = ['-2', '-1', '0', '1', '2'].map((v) => ({ value: v, label: v }));

export function CocDemo() {
  const [expr, setExpr] = useState('2D6+1D4+3');
  const [exprOut, setExprOut] = useState('');
  const [skill, setSkill] = useState(50);
  const [bonus, setBonus] = useState('0');
  const [skillOut, setSkillOut] = useState('');
  const [strSiz, setStrSiz] = useState(130);
  const db7 = damageBonus7(strSiz);

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
    </Section>
  );
}
