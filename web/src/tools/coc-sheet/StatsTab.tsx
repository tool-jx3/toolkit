/**
 * 屬性與狀態分頁（規格 F17～F27）：8 項屬性（困難／極限自動算）、幸運、移動力、生命值、魔法值、理智、狀態勾選。
 */
import { Checkbox, Field, FieldRow, OptionalNumberInput, Section } from '@/ui';
import { step, updateSheet } from './actions';
import { AutoNumberField } from './controls';
import { FLAG_KEYS, type FlagKey, type Sheet, STAT_KEYS, type StatKey } from './model';
import { autoDerived, thresholds } from './rules';
import { S, SHEET, STAT_NAMES } from './strings';

function StatField({ sheet, k }: { sheet: Sheet; k: StatKey }) {
  const v = sheet.stats[k];
  const t = thresholds(v);
  const alias = k === 'INT' ? `（${SHEET.idea}）` : k === 'EDU' ? `（${SHEET.know}）` : '';
  return (
    <Field
      label={`${S.stats.statLabel(k, STAT_NAMES[k])}${alias}`}
      hint={
        <span data-testid={`stat-${k}-thresholds`}>{S.stats.halfFifth(t.hard, t.extreme)}</span>
      }
    >
      <OptionalNumberInput
        value={v}
        min={0}
        max={999}
        onChange={(n) =>
          updateSheet((s) => {
            s.stats[k] = n;
          })
        }
      />
    </Field>
  );
}

const FLAG_LABELS: Record<FlagKey, string> = {
  majorWound: S.stats.majorWound,
  dying: S.stats.dying,
  unconscious: S.stats.unconscious,
  temporary: S.stats.temporary,
  indefinite: S.stats.indefinite,
};

function Flag({ sheet, k }: { sheet: Sheet; k: FlagKey }) {
  return (
    <Checkbox
      checked={sheet.flags[k]}
      label={FLAG_LABELS[k]}
      onCheckedChange={(v) =>
        step(() =>
          updateSheet((s) => {
            s.flags[k] = v;
          }),
        )
      }
    />
  );
}

function Current({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  max: number;
}) {
  return (
    <Field label={label} hint={S.stats.currentHint}>
      <OptionalNumberInput value={value} onChange={onChange} min={0} max={max} />
    </Field>
  );
}

export function StatsTab({ sheet }: { sheet: Sheet }) {
  const a = autoDerived(sheet);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.stats.characteristics} description={S.stats.characteristicsHint} fixed>
        <div className="grid grid-cols-2 gap-3">
          {STAT_KEYS.map((k) => (
            <StatField key={k} sheet={sheet} k={k} />
          ))}
        </div>
        <FieldRow columns={2}>
          <Field label={S.stats.luck} hint={S.stats.luckHint}>
            <OptionalNumberInput
              value={sheet.luck}
              min={0}
              max={99}
              onChange={(n) =>
                updateSheet((s) => {
                  s.luck = n;
                })
              }
            />
          </Field>
          <AutoNumberField
            label={S.stats.mov}
            value={sheet.mov}
            auto={a.mov}
            formula={S.stats.movFormula}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.mov = n;
              })
            }
          />
        </FieldRow>
      </Section>
      <Section title={S.stats.hp} persistKey="coc-sheet:hp">
        <FieldRow columns={2}>
          <AutoNumberField
            label={S.stats.hpMax}
            value={sheet.hp.max}
            auto={a.hpMax}
            formula={S.stats.hpFormula}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.hp.max = n;
              })
            }
          />
          <Current
            label={S.stats.hpNow}
            value={sheet.hp.current}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.hp.current = n;
              })
            }
          />
        </FieldRow>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {FLAG_KEYS.slice(0, 3).map((k) => (
            <Flag key={k} sheet={sheet} k={k} />
          ))}
        </div>
      </Section>
      <Section title={S.stats.mp} persistKey="coc-sheet:mp">
        <FieldRow columns={2}>
          <AutoNumberField
            label={S.stats.mpMax}
            value={sheet.mp.max}
            auto={a.mpMax}
            formula={S.stats.mpFormula}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.mp.max = n;
              })
            }
          />
          <Current
            label={S.stats.mpNow}
            value={sheet.mp.current}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.mp.current = n;
              })
            }
          />
        </FieldRow>
      </Section>
      <Section title={S.stats.san} persistKey="coc-sheet:san">
        <FieldRow columns={2}>
          <AutoNumberField
            label={S.stats.sanStart}
            value={sheet.san.start}
            auto={a.sanStart}
            formula={S.stats.sanStartFormula}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.san.start = n;
              })
            }
          />
          <AutoNumberField
            label={S.stats.sanMax}
            value={sheet.san.max}
            auto={a.sanMax}
            formula={S.stats.sanMaxFormula}
            max={99}
            onChange={(n) =>
              updateSheet((s) => {
                s.san.max = n;
              })
            }
          />
        </FieldRow>
        <Current
          label={S.stats.sanNow}
          value={sheet.san.current}
          max={99}
          onChange={(n) =>
            updateSheet((s) => {
              s.san.current = n;
            })
          }
        />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {FLAG_KEYS.slice(3).map((k) => (
            <Flag key={k} sheet={sheet} k={k} />
          ))}
        </div>
      </Section>
      <Section title={S.stats.luck} persistKey="coc-sheet:luck">
        <Current
          label={S.stats.luckNow}
          value={sheet.luckNow}
          max={99}
          onChange={(n) =>
            updateSheet((s) => {
              s.luckNow = n;
            })
          }
        />
      </Section>
    </div>
  );
}
