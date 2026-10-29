/**
 * 建議詞按鈕組：一排小按鈕，點一下就把那個詞交給 onPick（例如把差分名填進選取中的那張）。
 *
 * ```tsx
 * <Chips aria-label="差分名建議" items={['普通', '笑', '生氣', '哭', '驚訝']} onPick={(v) => setVariantName(v)} />
 * ```
 *
 * 複選（pl-profile 加的，選填）：給 `values` 時每個在清單裡的按鈕都標示選取中（aria-pressed），
 * 點一下照樣呼叫 onPick，由呼叫端切換：
 * `<Chips aria-label="喜歡的風格" items={…} values={picked} onPick={toggle} />`
 */
import { cn } from './cn';

export type ChipItem = string | { value: string; label?: string; title?: string };

export interface ChipsProps {
  items: readonly ChipItem[];
  onPick: (value: string) => void;
  /** 目前的值（相同的按鈕標示為選取中） */
  value?: string | null;
  /** 複選：在這個清單裡的按鈕都標示為選取中（給了就不看 value） */
  values?: readonly string[];
  disabled?: boolean;
  size?: 'sm' | 'md';
  'aria-label': string;
  className?: string;
}

export function Chips({
  items,
  onPick,
  value,
  values,
  disabled,
  size = 'sm',
  className,
  ...rest
}: ChipsProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組
    <div
      role="group"
      aria-label={rest['aria-label']}
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {items.map((it) => {
        const v = typeof it === 'string' ? it : it.value;
        const label = typeof it === 'string' ? it : (it.label ?? it.value);
        const on = values ? values.includes(v) : value != null && value === v;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={values || value !== undefined ? on : undefined}
            title={typeof it === 'string' ? undefined : it.title}
            onClick={() => onPick(v)}
            className={cn(
              'rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              on
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
