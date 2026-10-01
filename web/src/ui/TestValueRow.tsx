/**
 * 預覽用的數值測試列（狀態條的 HP／MP…）與快捷鈕。這些值只影響預覽、不寫進輸出，通常放在 createPreviewStore 裡（不列入復原）。
 * - TestValueRow：名稱（可改）、目前值滑桿（0～最大值，旁邊顯示數字）、最大值欄（1～9999）；改最大值時滑桿上限跟著改。
 * - TestValueShortcuts：−3、＋3、減半、危急、歸零、全部回復（一次套用到所有列，由呼叫端用 applyTestShortcut 計算）。
 */
import { Slider as S } from 'radix-ui';
import { Button } from './Button';
import { cn } from './cn';
import { NumberInput } from './NumberInput';
import { TextInput } from './TextInput';

export type TestShortcut = 'minus' | 'plus' | 'half' | 'critical' | 'zero' | 'full';

export const TEST_SHORTCUTS: readonly TestShortcut[] = [
  'minus',
  'plus',
  'half',
  'critical',
  'zero',
  'full',
];

export interface TestShortcutOptions {
  /** −／＋ 的量（預設 3） */
  step?: number;
  /** 危急門檻（剩餘比例 %，預設 25） */
  threshold?: number;
}

/**
 * 快捷鈕的計算：minus＝−step（不低於 0）、plus＝＋step（不超過最大值）、half＝最大值 ÷ 2 四捨五入、
 * critical＝剛好低於危急門檻（⌈最大值 × 門檻 ÷ 100⌉ − 1，不低於 0）、zero＝0、full＝最大值。
 */
export function applyTestShortcut(
  kind: TestShortcut,
  value: number,
  max: number,
  { step = 3, threshold = 25 }: TestShortcutOptions = {},
): number {
  switch (kind) {
    case 'minus':
      return Math.max(0, value - step);
    case 'plus':
      return Math.min(max, value + step);
    case 'half':
      return Math.round(max / 2);
    case 'critical':
      return Math.max(0, Math.ceil((max * threshold) / 100) - 1);
    case 'zero':
      return 0;
    default:
      return max;
  }
}

export function testShortcutLabel(kind: TestShortcut, step = 3): string {
  return {
    minus: `−${step}`,
    plus: `＋${step}`,
    half: '減半',
    critical: '危急',
    zero: '歸零',
    full: '全部回復',
  }[kind];
}

export interface TestValueRowProps {
  /** 狀態名稱 */
  label: string;
  /** 有給時名稱可以改 */
  onLabelChange?: (label: string) => void;
  value: number;
  max: number;
  onValueChange: (value: number) => void;
  onMaxChange: (max: number) => void;
  /** 最大值的上限（預設 9999） */
  maxLimit?: number;
  className?: string;
}

export function TestValueRow({
  label,
  onLabelChange,
  value,
  max,
  onValueChange,
  onMaxChange,
  maxLimit = 9999,
  className,
}: TestValueRowProps) {
  const name = label || '（未命名）';
  const v = Math.min(max, Math.max(0, value));
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {onLabelChange ? (
        <TextInput
          aria-label="狀態名稱"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="w-20 shrink-0"
        />
      ) : (
        <span className="w-20 shrink-0 truncate text-sm">{name}</span>
      )}
      <S.Root
        value={[v]}
        min={0}
        max={Math.max(1, max)}
        step={1}
        onValueChange={([n]) => onValueChange(n)}
        className="relative flex h-5 min-w-24 flex-1 touch-none select-none items-center"
      >
        <S.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
          <S.Range className="absolute h-full rounded-full bg-accent" />
        </S.Track>
        <S.Thumb
          aria-label={`${name} 目前值`}
          aria-valuetext={`${v}／${max}`}
          className="block size-4 rounded-full border-2 border-accent bg-surface shadow-1"
        />
      </S.Root>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums" aria-hidden>
        {v}
      </span>
      <span className="text-sm text-muted" aria-hidden>
        ／
      </span>
      <NumberInput
        aria-label={`${name} 最大值`}
        value={max}
        onChange={(m) => {
          if (Number.isFinite(m) && m >= 1) onMaxChange(Math.round(m));
        }}
        min={1}
        max={maxLimit}
        size="sm"
        className="w-20 shrink-0"
      />
    </div>
  );
}

export interface TestValueShortcutsProps {
  onApply: (kind: TestShortcut) => void;
  kinds?: readonly TestShortcut[];
  step?: number;
  className?: string;
}

export function TestValueShortcuts({
  onApply,
  kinds = TEST_SHORTCUTS,
  step = 3,
  className,
}: TestValueShortcutsProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組快捷鈕，不是表單欄位群組
    <div role="group" aria-label="測試快捷鈕" className={cn('flex flex-wrap gap-1.5', className)}>
      {kinds.map((k) => (
        <Button key={k} size="sm" onClick={() => onApply(k)}>
          {testShortcutLabel(k, step)}
        </Button>
      ))}
    </div>
  );
}
