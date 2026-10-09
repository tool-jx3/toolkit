/**
 * 傷害計算：護甲＋貼上 BCDice 的擲骰結果 →「計算」→ 合計與 `:HP-合計` 指令（點一下複製）。
 */
import { Calculator, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { Button, Field, NativeNumberInput, Notice, Section, TextArea } from '@/ui';
import { calculateDamage, type DamageResult } from './logic';
import { useSettings } from './store';
import { S } from './strings';

export function DamageTab() {
  const armor = useSettings((s) => s.data.armor);
  const text = useSettings((s) => s.data.damageText);
  const update = useSettings((s) => s.update);
  const [result, setResult] = useState<DamageResult | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const calculate = () => {
    setCopy('idle');
    setResult(calculateDamage(armor, text));
  };

  const copyCommand = async (command: string) => {
    window.clearTimeout(timer.current);
    const ok = await copyText(command);
    setCopy(ok ? 'copied' : 'failed');
    timer.current = window.setTimeout(() => setCopy('idle'), 2000);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.damage.title} fixed>
        <Field label={S.damage.armor} hint={S.damage.armorHint}>
          <NativeNumberInput
            value={armor}
            onChange={(v) =>
              update((d) => {
                d.armor = v;
              })
            }
            step={1}
            className="w-32"
          />
        </Field>
        <Field label={S.damage.rolls} hint={S.damage.rollsHint}>
          <TextArea
            rows={10}
            spellCheck={false}
            value={text}
            placeholder={S.damage.placeholder}
            onChange={(e) =>
              update((d) => {
                d.damageText = e.target.value;
              })
            }
            className="font-mono text-xs"
            data-testid="damage-text"
          />
        </Field>
        <Button variant="primary" icon={<Calculator />} onClick={calculate} className="w-full">
          {S.damage.calculate}
        </Button>
      </Section>

      {result ? (
        result.ok ? (
          <section
            aria-label={S.damage.total(result.total)}
            data-testid="damage-result"
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <p className="m-0 text-xl font-bold" data-testid="damage-total">
              {S.damage.total(result.total)}
            </p>
            <div className="flex flex-col gap-0.5 text-xs text-muted" data-testid="damage-detail">
              <span>{S.damage.found(result.values)}</span>
              {result.armor !== 0 ? (
                <span>{S.damage.afterArmor(result.armor, result.each)}</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{S.damage.command}</span>
              <button
                type="button"
                aria-label={S.damage.commandAria(result.command)}
                data-testid="damage-command"
                onClick={() => void copyCommand(result.command)}
                className="flex items-center justify-between gap-2 rounded-md border border-accent bg-accent-soft px-3 py-2 text-left font-mono text-lg text-fg hover:bg-surface-3"
              >
                <span>{result.command}</span>
                <Copy aria-hidden className="size-4 shrink-0 text-accent" />
              </button>
              <span className="text-xs text-muted">{S.damage.commandHint}</span>
            </div>
            {copy === 'copied' ? (
              <Notice tone="success">
                <span data-testid="damage-copied">{S.damage.copied}</span>
              </Notice>
            ) : copy === 'failed' ? (
              <Notice tone="danger">{S.damage.copyFailed}</Notice>
            ) : null}
          </section>
        ) : (
          <Notice tone="danger">
            <span data-testid="damage-error">{S.damage.errors[result.error]}</span>
          </Notice>
        )
      ) : null}
    </div>
  );
}
