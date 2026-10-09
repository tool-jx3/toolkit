/**
 * 技能分頁（規格 F28～F37）：技能點數（職業 EDU×4、興趣 INT×2，已用／總數）、技能表
 * （成長勾選、名稱／專長、初始、職業、興趣、成長、技能值〔空白＝自動〕、困難／極限；插入、刪除、拖曳或 Alt＋↑／↓ 調整順序；搜尋）。
 */
import { GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Checkbox,
  cn,
  Field,
  FieldRow,
  IconButton,
  OptionalNumberInput,
  Section,
  SortableList,
  TextInput,
} from '@/ui';
import { insertSkill, moveSkill, removeSkill, updateSheet, updateSkill } from './actions';
import { AutoNumberField } from './controls';
import { type Sheet, SKILL_SLOTS, type Skill } from './model';
import {
  autoDerived,
  autoSkillValue,
  baseLabel,
  baseValue,
  skillDisplayName,
  thresholds,
  usedPoints,
} from './rules';
import { useSheets } from './store';
import { S } from './strings';

const C = S.skills.columns;

/** 技能表的版面：窄的時候兩行（點數在第二行），寬的時候一行（container query） */
export const SKILL_TABLE_CSS = `
.cs-skt{container-type:inline-size}
.cs-skr{display:grid;align-items:center;gap:.25rem .375rem;padding:.25rem .375rem;grid-template-columns:1rem 1.25rem minmax(0,1fr) 3.4rem 3.6rem 5.5rem;grid-template-areas:"drag check name total thr act" ". . pts pts pts pts"}
.cs-skr>.a-drag{grid-area:drag}.cs-skr>.a-check{grid-area:check}.cs-skr>.a-name{grid-area:name;min-width:0}
.cs-skr>.a-pts{grid-area:pts;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.25rem}
.cs-skr>.a-total{grid-area:total}.cs-skr>.a-thr{grid-area:thr}.cs-skr>.a-act{grid-area:act;display:flex;gap:.125rem;justify-content:flex-end}
.cs-skr .a-pts>.cs-pt{display:flex;flex-direction:column;gap:.0625rem;min-width:0}
.cs-skr .a-pts>.cs-pt>span[aria-hidden]{font-size:.6875rem;color:var(--text-muted);line-height:1}
.cs-skh{display:none}
@container (min-width:34rem){
.cs-skr{grid-template-columns:1rem 1.25rem minmax(0,1fr) 10.6rem 3rem 3.4rem 5.5rem;grid-template-areas:"drag check name pts total thr act"}
.cs-skr .a-pts>.cs-pt>span[aria-hidden]{display:none}
.cs-skh{display:grid;font-size:.75rem;color:var(--text-muted);padding:0 .375rem .25rem calc(.375rem + 1px)}
.cs-skh>.a-pts>span{text-align:center}
.cs-skh>.a-thr{white-space:nowrap;overflow:visible}
}
`;

interface RowProps {
  skill: Skill;
  index: number;
  stats: Sheet['stats'];
  dragging: boolean;
}

const SkillRow = memo(function SkillRow({ skill, index, stats }: RowProps) {
  const label = skillDisplayName(skill) || S.skills.rowLabel(index + 1);
  const auto = autoSkillValue(skill, stats);
  const total = skill.value ?? auto;
  const t = thresholds(total);
  const set = (recipe: (k: Skill) => void) => updateSkill(skill.id, recipe);
  const formula = skill.base === 'DEX/2' || skill.base === 'EDU';
  const pts = (key: 'occupation' | 'interest' | 'growth', text: string) => (
    <div className="cs-pt">
      <span aria-hidden>{text}</span>
      <OptionalNumberInput
        size="sm"
        aria-label={`${text}（${label}）`}
        value={skill[key]}
        min={0}
        max={999}
        onChange={(v) =>
          set((k) => {
            k[key] = v;
          })
        }
      />
    </div>
  );
  return (
    <div className="cs-skr" data-skill-row={skill.id}>
      <span
        className="a-drag flex cursor-grab touch-none items-center justify-center text-muted"
        data-drag-handle=""
        title={S.skills.drag(label)}
      >
        <GripVertical className="size-4" aria-hidden />
      </span>
      <span className="a-check flex items-center justify-center">
        {skill.checkable ? (
          <Checkbox
            aria-label={`${C.checkLabel}（${label}）`}
            checked={skill.checked}
            onCheckedChange={(v) =>
              set((k) => {
                k.checked = v;
              })
            }
          />
        ) : (
          <span className="text-xs text-muted" title={S.skills.noCheck}>
            －
          </span>
        )}
      </span>
      <span className="a-name flex min-w-0 gap-1">
        <TextInput
          className={cn('h-7 text-xs', skill.kind === 'specialty' ? 'w-[45%]' : 'w-full')}
          aria-label={`${S.skills.name}（${S.skills.rowLabel(index + 1)}）`}
          value={skill.name}
          placeholder={skill.kind === 'custom' ? S.skills.customPlaceholder : ''}
          onChange={(e) =>
            set((k) => {
              k.name = e.target.value;
            })
          }
        />
        {skill.kind === 'specialty' ? (
          <TextInput
            className="h-7 min-w-0 flex-1 text-xs"
            aria-label={`${S.skills.specialty}（${skill.name || label}）`}
            value={skill.specialty}
            placeholder={S.skills.specialtyPlaceholder}
            onChange={(e) =>
              set((k) => {
                k.specialty = e.target.value;
              })
            }
          />
        ) : null}
      </span>
      <span className="a-pts">
        <div className="cs-pt">
          <span aria-hidden>{C.base}</span>
          {formula ? (
            <span
              className="flex h-7 items-center justify-center rounded-md border border-border px-1 text-xs whitespace-nowrap text-muted tabular-nums"
              data-testid="skill-base-formula"
            >
              <span className="sr-only">{`${C.base}（${label}）：${baseLabel(skill.base)}＝`}</span>
              <span
                title={S.skills.baseFormula(baseLabel(skill.base), baseValue(skill.base, stats))}
              >
                {baseValue(skill.base, stats) ?? (skill.base === 'DEX/2' ? 'DEX½' : 'EDU')}
              </span>
            </span>
          ) : (
            <OptionalNumberInput
              size="sm"
              aria-label={`${C.base}（${label}）`}
              value={typeof skill.base === 'number' ? skill.base : null}
              min={0}
              max={999}
              onChange={(v) =>
                set((k) => {
                  k.base = v;
                })
              }
            />
          )}
        </div>
        {pts('occupation', C.occupation)}
        {pts('interest', C.interest)}
        {pts('growth', C.growth)}
      </span>
      <span className="a-total">
        <OptionalNumberInput
          size="sm"
          aria-label={`${C.total}（${label}）`}
          className={skill.value !== null ? 'font-semibold [&_input]:border-accent' : undefined}
          value={skill.value}
          placeholder={auto === null ? '' : String(auto)}
          fallback={auto}
          min={0}
          max={999}
          onChange={(v) =>
            set((k) => {
              k.value = v;
            })
          }
        />
      </span>
      <span
        className="a-thr text-center text-xs text-muted tabular-nums whitespace-nowrap"
        data-testid="skill-thresholds"
      >
        <span className="sr-only">{`${C.thresholds}（${label}）：`}</span>
        {t.hard === null ? '—' : `${t.hard}／${t.extreme}`}
      </span>
      <span className="a-act">
        {skill.value !== null ? (
          <IconButton
            size="sm"
            label={`${S.stats.resetAuto}（${label}）`}
            icon={<RotateCcw />}
            onClick={() =>
              set((k) => {
                k.value = null;
              })
            }
          />
        ) : null}
        <IconButton
          size="sm"
          label={S.skills.insert(label)}
          icon={<Plus />}
          onClick={() => insertSkill(skill.id)}
        />
        <IconButton
          size="sm"
          label={S.skills.remove(label)}
          icon={<Trash2 />}
          onClick={() => removeSkill(skill.id)}
        />
      </span>
    </div>
  );
});

function Budget({ sheet }: { sheet: Sheet }) {
  const a = autoDerived(sheet).budget;
  const used = usedPoints(sheet);
  const status = (u: number, total: number | null) => {
    const over = total !== null && u > total ? u - total : 0;
    return (
      <span className={over ? 'text-warning' : undefined}>
        {S.skills.used(u, total)}
        {over ? `（${S.skills.over(over)}）` : ''}
      </span>
    );
  };
  return (
    <Section
      title={S.skills.budget}
      description={S.skills.budgetHint}
      persistKey="coc-sheet:budget"
    >
      <FieldRow columns={2}>
        <div className="flex min-w-0 flex-col gap-1">
          <AutoNumberField
            label={S.skills.occupation}
            value={sheet.budget.occupation}
            auto={a.occupation}
            formula={S.skills.occupationFormula}
            max={9999}
            onChange={(v) =>
              updateSheet((s) => {
                s.budget.occupation = v;
              })
            }
          />
          <p className="m-0 text-sm" data-testid="budget-occupation">
            {status(used.occupation, sheet.budget.occupation ?? a.occupation)}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <AutoNumberField
            label={S.skills.interest}
            value={sheet.budget.interest}
            auto={a.interest}
            formula={S.skills.interestFormula}
            max={9999}
            onChange={(v) =>
              updateSheet((s) => {
                s.budget.interest = v;
              })
            }
          />
          <p className="m-0 text-sm" data-testid="budget-interest">
            {status(used.interest, sheet.budget.interest ?? a.interest)}
          </p>
        </div>
      </FieldRow>
    </Section>
  );
}

export function SkillsTab({ sheet }: { sheet: Sheet }) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useMemo(() => historyGesture(useSheets), []);
  const q = filter.trim().toLowerCase();
  const items = q
    ? sheet.skills.filter((s) => `${s.name} ${s.specialty}`.toLowerCase().includes(q))
    : sheet.skills;
  const over = sheet.skills.length > SKILL_SLOTS;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Budget sheet={sheet} />
      <Section
        title={`${S.skills.section}（${sheet.skills.length}）`}
        fixed
        actions={
          <Button size="sm" icon={<Plus />} onClick={() => setSelected(insertSkill())}>
            {S.skills.add}
          </Button>
        }
      >
        <Field label={S.skills.filter}>
          <TextInput
            type="search"
            value={filter}
            placeholder={S.skills.filterPlaceholder}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Field>
        {over ? (
          <p className="m-0 text-sm text-warning">{S.skills.printLimit(sheet.skills.length)}</p>
        ) : null}
        <div className="cs-skt">
          <div className="cs-skr cs-skh" aria-hidden>
            <span className="a-drag" />
            <span className="a-check text-center">{C.check}</span>
            <span className="a-name">{C.name}</span>
            <span className="a-pts">
              <span>{C.base}</span>
              <span>{C.occupation}</span>
              <span>{C.interest}</span>
              <span>{C.growth}</span>
            </span>
            <span className="a-total text-center">{C.total}</span>
            <span className="a-thr text-center">{C.thresholds}</span>
            <span className="a-act" />
          </div>
          <SortableList<Skill>
            aria-label={S.skills.aria}
            items={items}
            getId={(s) => s.id}
            handleOnly
            sortDisabled={!!q}
            selectedId={selected}
            onSelect={setSelected}
            onMove={moveSkill}
            onMoveStart={gesture.begin}
            onMoveEnd={gesture.commit}
            empty={S.skills.filterEmpty}
            itemClassName={(s) =>
              sheet.skills.indexOf(s) >= SKILL_SLOTS ? 'opacity-60' : undefined
            }
            renderItem={(s, st) => (
              <SkillRow
                skill={s}
                index={sheet.skills.indexOf(s)}
                stats={sheet.stats}
                dragging={st.dragging}
              />
            )}
          />
        </div>
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => setSelected(insertSkill())}
          >
            {S.skills.add}
          </Button>
        </div>
      </Section>
    </div>
  );
}
