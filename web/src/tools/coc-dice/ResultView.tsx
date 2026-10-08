/**
 * 結果區（技能檢定與自訂擲骰共用）：骰子、結果數字、成功等級。
 * 新的結果出來時骰子跳動約 0.8 秒（每 0.05 秒換一次假的點數）再揭曉；有獎勵骰／懲罰骰時沒有採用的十位骰變暗。
 * 使用者設定「減少動態效果」時不跳動、直接顯示結果。
 * 跳動的假點數用 Math.random（不取用 core/coc 的亂數，注入的亂數序列只給真正的擲骰）。
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type PercentileRoll,
  type RolledTerm,
  SUCCESS_LEVEL_LABELS,
  type SuccessLevel,
  tensFace,
} from '@/core/coc';
import { Button, cn } from '@/ui';
import { S } from './strings';

/** 跳動的總時間與換數字的間隔（毫秒，舊版相同） */
export const ROLL_MS = 800;
export const TICK_MS = 50;

export type RollOutcome =
  | {
      kind: 'skill';
      id: number;
      roll: PercentileRoll;
      level: SuccessLevel | null;
      log: string;
    }
  | {
      kind: 'custom';
      id: number;
      terms: RolledTerm[];
      total: number;
      log: string;
    };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 成功等級的配色（只用 token） */
const LEVEL_CLASS: Record<SuccessLevel, string> = {
  critical: 'text-warning bg-warning-soft',
  extreme: 'text-accent bg-accent-soft',
  hard: 'text-accent',
  regular: 'text-success',
  failure: 'text-muted',
  fumble: 'text-danger bg-danger-soft',
};

interface DieView {
  key: string;
  /** 揭曉後的點數 */
  face: string;
  /** 跳動時的假點數 */
  fake: () => string;
  label: string;
  dimmed: boolean;
  kind: 'tens' | 'ones' | 'die';
}

const randomInt = (n: number) => Math.floor(Math.random() * n);

function diceOf(outcome: RollOutcome): DieView[] {
  if (outcome.kind === 'skill') {
    const { roll } = outcome;
    const tens: DieView[] = roll.tens.map((t, i) => {
      const used = roll.bonus === 0 || i === roll.chosen;
      return {
        key: `t${i}`,
        face: tensFace(t),
        fake: () => tensFace(randomInt(10) * 10),
        label: S.result.tensDie(tensFace(t), used),
        dimmed: !used,
        kind: 'tens',
      };
    });
    const ones: DieView = {
      key: 'o',
      face: String(roll.ones),
      fake: () => String(randomInt(10)),
      label: S.result.onesDie(String(roll.ones)),
      dimmed: false,
      kind: 'ones',
    };
    return [...tens, ones];
  }
  const out: DieView[] = [];
  for (const [ti, t] of outcome.terms.entries()) {
    if (t.kind !== 'dice') continue;
    for (const [ri, r] of t.rolls.entries()) {
      out.push({
        key: `${ti}-${ri}`,
        face: String(r),
        fake: () => String(randomInt(t.sides) + 1),
        label: S.result.die(r, t.sides),
        dimmed: false,
        kind: 'die',
      });
    }
  }
  return out;
}

/** 元素掛上時播一次 Web Animations（減少動態時不播） */
function usePop<T extends HTMLElement>(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const ref = useRef<T | null>(null);
  const spec = useRef({ keyframes, options });
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
    const a = el.animate(spec.current.keyframes, spec.current.options);
    return () => a.cancel();
  }, []);
  return ref;
}

const EASE_BACK = 'cubic-bezier(0.34,1.56,0.64,1)';

function Die({ die, shown, index }: { die: DieView; shown: string; index: number }) {
  const ref = usePop<HTMLLIElement>(
    [
      { opacity: 0, transform: 'scale(0.45)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: 280, delay: index * 30, easing: EASE_BACK, fill: 'backwards' },
  );
  return (
    <li
      ref={ref}
      aria-label={die.label}
      data-testid="die"
      data-kind={die.kind}
      data-dimmed={die.dimmed ? 'true' : undefined}
      className={cn(
        'flex size-[clamp(2.75rem,13vw,4.5rem)] items-center justify-center rounded-md border font-mono text-[clamp(1.25rem,6vw,2rem)] font-bold tabular-nums transition-[opacity,color] duration-300',
        die.dimmed
          ? 'border-border bg-surface-2 text-muted opacity-60'
          : 'border-border-strong bg-surface-2 text-fg',
      )}
    >
      <span aria-hidden>{shown}</span>
    </li>
  );
}

/** 揭曉時彈一下（結果數字、成功等級） */
function Bounce({
  children,
  className,
  testId,
  level,
}: {
  children: ReactNode;
  className?: string;
  testId: string;
  level?: string;
}) {
  const ref = usePop<HTMLDivElement>(
    [
      { opacity: 0, transform: 'scale(0.55) translateY(8px)' },
      { opacity: 1, transform: 'scale(1.07) translateY(-2px)', offset: 0.55 },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 320, easing: EASE_BACK, fill: 'backwards' },
  );
  return (
    <div ref={ref} className={className} data-testid={testId} data-level={level}>
      {children}
    </div>
  );
}

export interface ResultViewProps {
  outcome: RollOutcome | null;
  /** 自訂擲骰揭曉後的「帶入傷害計算」 */
  onSendToDamage?: (outcome: RollOutcome) => void;
  sentId?: number | null;
}

const TOTAL_CLASS = 'font-mono text-[clamp(2.5rem,14vw,5rem)] leading-none font-bold tabular-nums';

export function ResultView({ outcome, onSendToDamage, sentId }: ResultViewProps) {
  /* 動畫狀態屬於哪一次擲骰：新結果剛進來、效果還沒跑時也算「跳動中」，不會先閃出答案 */
  const [anim, setAnim] = useState<{ id: number | null; done: boolean }>({
    id: outcome?.id ?? null,
    done: true,
  });
  const [, setTick] = useState(0);
  const id = outcome?.id ?? null;

  useEffect(() => {
    if (id === null) return;
    if (prefersReducedMotion()) {
      setAnim({ id, done: true });
      return;
    }
    setAnim({ id, done: false });
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setTick(n);
      if (n >= ROLL_MS / TICK_MS) {
        window.clearInterval(timer);
        setAnim({ id, done: true });
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [id]);

  const done = id !== null && (anim.id === id ? anim.done : prefersReducedMotion());
  const phase = id === null ? 'idle' : done ? 'done' : 'rolling';
  const dice = outcome ? diceOf(outcome) : [];
  const level = outcome?.kind === 'skill' ? outcome.level : null;
  const total = outcome ? (outcome.kind === 'skill' ? outcome.roll.result : outcome.total) : null;

  return (
    <section
      aria-label={S.result.region}
      data-testid="dice-result"
      data-phase={phase}
      className="flex min-h-44 flex-col items-center lg:min-h-56 justify-center gap-3 rounded-lg border border-border bg-surface p-4 text-center"
    >
      {!outcome ? (
        <p className="m-0 text-sm text-muted">{S.result.empty}</p>
      ) : (
        <>
          {dice.length ? (
            <ul
              aria-label={S.result.diceList}
              className="m-0 flex max-w-full list-none flex-wrap justify-center gap-2 p-0"
            >
              {dice.map((d, i) => (
                <Die
                  key={`${outcome.id}-${d.key}`}
                  die={done ? d : { ...d, dimmed: false }}
                  shown={done ? d.face : d.fake()}
                  index={i}
                />
              ))}
            </ul>
          ) : null}
          {done ? (
            <Bounce testId="roll-total" className={cn(TOTAL_CLASS, 'text-fg')}>
              {total}
            </Bounce>
          ) : (
            <div aria-hidden className={cn(TOTAL_CLASS, 'text-muted')}>
              {S.result.rolling}
            </div>
          )}
          {done && level ? (
            <Bounce
              testId="roll-level"
              level={level}
              className={cn(
                'rounded-md px-3 py-0.5 text-[clamp(1.25rem,6vw,2rem)] font-bold',
                LEVEL_CLASS[level],
              )}
            >
              {SUCCESS_LEVEL_LABELS[level]}
            </Bounce>
          ) : null}
          {done && outcome.kind === 'custom' && onSendToDamage ? (
            <Button
              size="sm"
              variant="ghost"
              title={S.result.toDamageHint}
              disabled={sentId === outcome.id}
              onClick={() => onSendToDamage(outcome)}
            >
              {sentId === outcome.id ? S.result.toDamageDone : S.result.toDamage}
            </Button>
          ) : null}
        </>
      )}
      <p aria-live="polite" className="sr-only" data-testid="roll-announce">
        {outcome && done && total !== null
          ? S.result.announce(total, level ? SUCCESS_LEVEL_LABELS[level] : null)
          : ''}
      </p>
    </section>
  );
}
