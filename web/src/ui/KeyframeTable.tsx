/**
 * 節點表編輯器（G2）：時間／數值／曲線三欄的節點清單，可新增、刪除、恢復預設。整理規則在 `@/core/timeline` 的 keyframes：
 * - 第一個節點可固定（例如 0 秒 0%：整列停用）；最後一個節點的值可固定（例如 100%）；
 * - 新增：插在時間間隔最大的兩個節點正中間（時間、值取中間，曲線用 defaultCurve）；滿了按鈕停用；
 * - 刪除：頭尾不能刪、至少留 minCount 個；
 * - 打字中只改那一格；離開欄位（或 Enter、方向鍵）時整理：依時間排序、相鄰至少相隔 minGap、值不倒退（monotonic）。
 * 下方顯示摘要（「0 秒 0% → 1 秒 30% → …」）與節點數。
 *
 * ```tsx
 * <KeyframeTable aria-label="自訂時間表" value={s.schedule} onChange={(k) => set({ schedule: k })}
 *   curves={CURVE_OPTIONS} defaults={DEFAULT_SCHEDULE} onReset={() => toast({ title: '已恢復預設節點' })} />
 * ```
 */
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useId } from 'react';
import {
  canAddKeyframe,
  canRemoveKeyframe,
  insertKeyframe,
  type Keyframe,
  type KeyframeRules,
  keyframesSummary,
  normalizeKeyframes,
  removeKeyframe,
} from '@/core/timeline/keyframes';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { NumberInput } from './NumberInput';
import { Select } from './Select';

export interface KeyframeTableProps {
  value: readonly Keyframe[];
  onChange: (keys: Keyframe[]) => void;
  /** 曲線選項（值＝core/timeline 的曲線名稱） */
  curves: readonly { value: string; label: string }[];
  /** 整理規則（預設：2～16 個、相隔 0.05 秒、第一個 0 秒 0%、最後 100%、值不倒退、0～100、最長 120 秒） */
  rules?: KeyframeRules;
  /** 給了就顯示「恢復預設」 */
  defaults?: readonly Keyframe[];
  onReset?: () => void;
  timeUnit?: string;
  valueUnit?: string;
  /** 欄名 */
  labels?: { time?: string; value?: string; curve?: string };
  timeStep?: number;
  valueStep?: number;
  addLabel?: string;
  resetLabel?: string;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}

export function KeyframeTable({
  value,
  onChange,
  curves,
  rules,
  defaults,
  onReset,
  timeUnit = '秒',
  valueUnit = '%',
  labels,
  timeStep = 0.05,
  valueStep = 1,
  addLabel = '新增節點',
  resetLabel = '恢復預設節點',
  disabled,
  className,
  ...rest
}: KeyframeTableProps) {
  const titleId = useId();
  const firstLocked = rules?.first !== null;
  const lastLocked = rules?.lastValue !== null;
  const max = rules?.maxCount ?? 16;
  const vMin = rules?.valueMin ?? 0;
  const vMax = rules?.valueMax ?? 100;
  const tMax = rules?.timeMax ?? 120;

  /** 打字中：只改這一格（不排序） */
  const patch = (i: number, p: Partial<Keyframe>) =>
    onChange(value.map((k, j) => (j === i ? { ...k, ...p } : { ...k })));
  /** 確定：整理整張表 */
  const commit = (i: number, p: Partial<Keyframe>) =>
    onChange(
      normalizeKeyframes(
        value.map((k, j) => (j === i ? { ...k, ...p } : k)),
        rules,
      ),
    );

  const t = labels?.time ?? `時間（${timeUnit}）`;
  const v = labels?.value ?? `數值（${valueUnit}）`;
  const c = labels?.curve ?? '曲線';
  const summary = keyframesSummary(value, { unit: valueUnit, timeUnit: ` ${timeUnit}` });

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)} data-testid="keyframe-table">
      {/* biome-ignore lint/a11y/useSemanticElements: 欄位列表，不是表單分組 */}
      <div role="group" aria-labelledby={titleId} className="flex min-w-0 flex-col gap-1">
        <span id={titleId} className="sr-only">
          {rest['aria-label']}
        </span>
        <div
          aria-hidden
          className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_1.75rem] items-center gap-1 text-xs text-muted"
        >
          <span>#</span>
          <span>{t}</span>
          <span>{v}</span>
          <span>{c}</span>
          <span />
        </div>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {value.map((k, i) => {
            const isFirst = i === 0;
            const isLast = i === value.length - 1;
            const lockRow = isFirst && firstLocked;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: 節點沒有 id，位置就是身分（排序後整列重畫）
                key={i}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_1.75rem] items-center gap-1"
                data-keyframe={i}
              >
                <span className="text-xs tabular-nums text-muted">{i + 1}</span>
                <NumberInput
                  aria-label={`第 ${i + 1} 個節點的${t}`}
                  value={k.time}
                  onChange={(time) => patch(i, { time })}
                  onCommit={(time) => commit(i, { time })}
                  min={0}
                  max={tMax}
                  step={timeStep}
                  precision={2}
                  size="sm"
                  disabled={disabled || lockRow}
                />
                <NumberInput
                  aria-label={`第 ${i + 1} 個節點的${v}`}
                  value={k.value}
                  onChange={(val) => patch(i, { value: val })}
                  onCommit={(val) => commit(i, { value: val })}
                  min={vMin}
                  max={vMax}
                  step={valueStep}
                  precision={valueStep < 1 ? 2 : 0}
                  size="sm"
                  disabled={disabled || lockRow || (isLast && lastLocked && value.length > 1)}
                />
                {isFirst ? (
                  <span className="truncate px-1 text-xs text-muted">起點</span>
                ) : (
                  <Select
                    aria-label={`進入第 ${i + 1} 個節點的${c}`}
                    value={String(k.curve)}
                    onValueChange={(curve) => commit(i, { curve })}
                    options={curves}
                    size="sm"
                    disabled={disabled}
                  />
                )}
                <IconButton
                  size="sm"
                  label={`刪除第 ${i + 1} 個節點`}
                  icon={<Trash2 />}
                  disabled={disabled || !canRemoveKeyframe(value, i, rules)}
                  onClick={() => onChange(removeKeyframe(value, i, rules))}
                />
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={disabled || !canAddKeyframe(value, rules)}
          onClick={() => onChange(insertKeyframe(value, rules).keys)}
        >
          {addLabel}
        </Button>
        {defaults ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            disabled={disabled}
            onClick={() => {
              onChange(defaults.map((d) => ({ ...d })));
              onReset?.();
            }}
          >
            {resetLabel}
          </Button>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-muted" data-testid="keyframe-count">
          {value.length}／{max} 個節點
        </span>
      </div>
      <p className="m-0 text-xs break-words text-muted" data-testid="keyframe-summary">
        {summary}
      </p>
    </div>
  );
}
