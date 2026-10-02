/**
 * 分頁共用的小元件：疊放清單的一列（顯示勾選、名稱、往前／往後）、各差分是否顯示（F45）。
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Checkbox, cn, Field, IconButton } from '@/ui';
import { useFrame } from '../store';
import { S } from '../strings';

export function StackRow({
  selected,
  onSelect,
  visible,
  onVisibleChange,
  visibleLabel,
  name,
  leading,
  tag,
  canForward,
  canBackward,
  onForward,
  onBackward,
  forwardLabel,
  backwardLabel,
  extra,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  visible: boolean;
  onVisibleChange: (v: boolean) => void;
  visibleLabel: string;
  name: ReactNode;
  leading?: ReactNode;
  tag?: ReactNode;
  canForward: boolean;
  canBackward: boolean;
  onForward: () => void;
  onBackward: () => void;
  forwardLabel: string;
  backwardLabel: string;
  extra?: ReactNode;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1',
        selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2',
        !visible && 'opacity-60',
      )}
    >
      <Checkbox checked={visible} onCheckedChange={onVisibleChange} aria-label={visibleLabel} />
      {leading}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-sm py-1 text-left text-sm text-fg hover:underline"
      >
        <span className="truncate">{name}</span>
        {tag ? (
          <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 text-xs text-muted">{tag}</span>
        ) : null}
      </button>
      {extra}
      <IconButton
        label={forwardLabel}
        icon={<ArrowUp />}
        size="sm"
        variant="ghost"
        disabled={!canForward}
        onClick={onForward}
      />
      <IconButton
        label={backwardLabel}
        icon={<ArrowDown />}
        size="sm"
        variant="ghost"
        disabled={!canBackward}
        onClick={onBackward}
      />
    </li>
  );
}

/** F45：每個差分一個勾選（沒勾的差分不畫）；只在開了差分時出現 */
export function VariantVisibility({
  hideIn,
  onChange,
  testId,
}: {
  hideIn: Record<string, boolean>;
  onChange: (id: string, show: boolean) => void;
  testId?: string;
}) {
  const v = useFrame((st) => st.data.variants);
  if (!v.enabled) return null;
  return (
    <Field label={S.deco.showIn}>
      <div className="flex flex-wrap gap-x-4 gap-y-2" data-testid={testId}>
        {v.items.map((item) => (
          <Checkbox
            key={item.id}
            checked={!hideIn[item.id]}
            onCheckedChange={(on) => onChange(item.id, on)}
            label={item.name || S.variant.noName}
          />
        ))}
      </div>
    </Field>
  );
}
