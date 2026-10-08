/**
 * 「擲骰」分頁：技能檢定、自訂擲骰（含快速加骰）、共用的結果區與擲骰紀錄。
 * 窄畫面由上而下：技能檢定 → 結果 → 自訂擲骰 → 紀錄；寬畫面左邊兩個輸入區、右邊結果與紀錄。
 * 技能值欄、算式欄按 Enter 就擲骰（各自是一個表單，擲骰鈕是送出鈕；選字中的 Enter 不算）。
 */
import { Dices, X } from 'lucide-react';
import type { FormEvent } from 'react';
import {
  Button,
  Field,
  IconButton,
  NativeNumberInput,
  Section,
  Segmented,
  TextInput,
  useToast,
} from '@/ui';
import { LogPanel } from './LogPanel';
import { BONUS_MAX, BONUS_MIN, QUICK_DICE } from './logic';
import { ResultView, type RollOutcome } from './ResultView';
import { settingsStep, usePrefs, useSettings } from './store';
import { S } from './strings';

const BONUS_OPTIONS = Array.from({ length: BONUS_MAX - BONUS_MIN + 1 }, (_, i) => {
  const v = BONUS_MIN + i;
  return {
    value: String(v),
    label: v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0',
    ariaLabel: S.skill.bonusOption(v),
  };
});

/** 表單送出（在輸入欄按 Enter，或按擲骰鈕）時擲骰；不讓瀏覽器檢查範圍、不換頁 */
function submitTo(fn: () => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fn();
  };
}

export interface RollTabProps {
  outcome: RollOutcome | null;
  customError: string | null;
  onSkillRoll: () => void;
  onCustomRoll: () => void;
  onQuickDice: (token: string) => void;
  onExprChange: (expr: string) => void;
  onSendToDamage: (outcome: RollOutcome) => void;
  sentId: number | null;
}

export function RollTab({
  outcome,
  customError,
  onSkillRoll,
  onCustomRoll,
  onQuickDice,
  onExprChange,
  onSendToDamage,
  sentId,
}: RollTabProps) {
  const s = useSettings((st) => st.data);
  const update = useSettings((st) => st.update);
  const logOpen = usePrefs((p) => p.data.logOpen);
  const log = usePrefs((p) => p.data.log);
  const patchPrefs = usePrefs((p) => p.patch);
  const toast = useToast();
  const send = (o: RollOutcome) => {
    onSendToDamage(o);
    toast({ title: S.result.toDamageDone, tone: 'success', duration: 2000 });
  };

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      {/* 窄畫面時兩欄是 display: contents，四塊依 order 排成「技能 → 結果 → 自訂 → 紀錄」 */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
        <div className="order-1 min-w-0">
          <Section title={S.skill.title} fixed>
            <form
              noValidate
              onSubmit={submitTo(onSkillRoll)}
              className="flex min-w-0 flex-col gap-3"
              data-testid="skill-form"
            >
              <Field label={S.skill.bonus} hint={S.skill.bonusHint}>
                <Segmented
                  fullWidth
                  value={String(s.bonus)}
                  onValueChange={(v) =>
                    settingsStep(() =>
                      update((d) => {
                        d.bonus = Number(v);
                      }),
                    )
                  }
                  options={BONUS_OPTIONS}
                />
              </Field>
              <Field label={S.skill.value} hint={S.skill.valueHint}>
                <NativeNumberInput
                  value={s.skill}
                  onChange={(v) =>
                    update((d) => {
                      d.skill = v;
                    })
                  }
                  min={0}
                  max={999}
                  step={1}
                  placeholder={S.skill.valuePlaceholder}
                  stepLabels={{ up: S.skill.valueUp, down: S.skill.valueDown }}
                  className="w-full"
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon={<Dices />}
                aria-label={S.skill.rollAria}
                className="w-full"
              >
                {S.skill.roll}
              </Button>
            </form>
          </Section>
        </div>

        <div className="order-3 min-w-0">
          <Section title={S.custom.title} fixed>
            <form
              noValidate
              onSubmit={submitTo(onCustomRoll)}
              className="flex min-w-0 flex-col gap-3"
              data-testid="custom-form"
            >
              <Field label={S.custom.expr} hint={S.custom.hint} error={customError ?? undefined}>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="relative flex min-w-0 flex-1 items-center">
                    <TextInput
                      value={s.expr}
                      onChange={(e) => onExprChange(e.target.value)}
                      placeholder={S.custom.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      className="h-10 pr-9 font-mono text-base"
                      data-testid="custom-expr"
                    />
                    {s.expr ? (
                      <IconButton
                        label={S.custom.clear}
                        icon={<X />}
                        size="sm"
                        onClick={() => settingsStep(() => onExprChange(''))}
                        className="absolute right-1"
                      />
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    icon={<Dices />}
                    aria-label={S.custom.rollAria}
                    className="h-10"
                  >
                    {S.custom.roll}
                  </Button>
                </div>
              </Field>
              <fieldset className="m-0 grid min-w-0 grid-cols-3 gap-1.5 border-0 p-0 sm:grid-cols-5">
                <legend className="sr-only">{S.custom.quickLabel}</legend>
                {QUICK_DICE.map((token) => (
                  <Button
                    key={token}
                    size="sm"
                    aria-label={S.custom.quickAria(token)}
                    onClick={() => onQuickDice(token)}
                    className="font-mono"
                  >
                    +{token}
                  </Button>
                ))}
              </fieldset>
            </form>
          </Section>
        </div>
      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
        <div className="order-2 min-w-0">
          <ResultView outcome={outcome} onSendToDamage={send} sentId={sentId} />
        </div>
        <div className="order-4 min-w-0">
          <LogPanel
            entries={log}
            open={logOpen}
            onOpenChange={(open) => patchPrefs({ logOpen: open })}
            onClear={() => patchPrefs({ log: [] })}
          />
        </div>
      </div>
    </div>
  );
}
