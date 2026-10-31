/**
 * 編輯面板共用的小元件：一組兩色（可「自動」、可對調）、離開才記一步的文字欄、留空＝自動的數字欄。
 */
import { ArrowLeftRight, GripVertical } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ColorField, IconButton, TextArea, TextInput } from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import type { ColorValue } from '../model/types';
import { gesture } from '../state/store';
import { S } from '../strings';

/** 色彩欄的連續變更（拖調色盤、打色碼）停下來 0.5 秒才記一步 */
let colorTimer: ReturnType<typeof setTimeout> | null = null;
function liveColor(apply: () => void): void {
  gesture.begin();
  apply();
  if (colorTimer) clearTimeout(colorTimer);
  colorTimer = setTimeout(() => {
    colorTimer = null;
    gesture.commit();
  }, 500);
}

/** 一個色彩欄＋「自動」鈕 */
function ColorSlot({
  label,
  value,
  autoColor,
  onChange,
  testId,
}: {
  label: string;
  value: ColorValue;
  autoColor: string;
  onChange: (v: ColorValue) => void;
  testId?: string;
}) {
  const isAuto = value === 'auto';
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <span className="text-xs text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <ColorField
          value={isAuto ? autoColor : value}
          onChange={(v) => liveColor(() => onChange(v))}
          alpha
          aria-label={label}
          className="min-w-0 flex-1"
        />
      </div>
      <button
        type="button"
        className={`self-start rounded-sm border px-1.5 text-xs ${isAuto ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg'}`}
        aria-pressed={isAuto}
        title={S.char.autoHint}
        onClick={() => {
          gesture.commit();
          onChange('auto');
        }}
      >
        {S.char.auto}
      </button>
    </div>
  );
}

/** 一組兩色（左＝顏色、右＝外框；中間對調） */
export function ColorPair({
  a,
  b,
  labels,
  autoA,
  autoB,
  onA,
  onB,
  onSwap,
  testId,
}: {
  a: ColorValue;
  b: ColorValue;
  labels: [string, string];
  autoA: string;
  autoB: string;
  onA: (v: ColorValue) => void;
  onB: (v: ColorValue) => void;
  onSwap: () => void;
  testId?: string;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1"
      data-testid={testId}
    >
      <ColorSlot label={labels[0]} value={a} autoColor={autoA} onChange={onA} />
      <IconButton
        size="sm"
        className="mt-5"
        icon={<ArrowLeftRight />}
        label={S.char.swap}
        onClick={onSwap}
      />
      <ColorSlot label={labels[1]} value={b} autoColor={autoB} onChange={onB} />
    </div>
  );
}

/** 文字欄：打字立刻反映、離開才記一步復原 */
export function LiveText({
  value,
  onChange,
  onCommit,
  multiline,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  /** 離開欄位時（記成一步之前）：例如把空白的名稱補上預設名 */
  onCommit?: () => void;
  multiline?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  rows?: number;
  className?: string;
  'data-testid'?: string;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  const common = {
    value: draft,
    onFocus: () => {
      editing.current = true;
      gesture.begin();
    },
    onBlur: () => {
      editing.current = false;
      onCommit?.();
      gesture.commit();
      setDraft(value);
    },
  };
  if (multiline)
    return (
      <TextArea
        {...rest}
        {...common}
        rows={rest.rows ?? 2}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
      />
    );
  return (
    <TextInput
      {...rest}
      {...common}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

/**
 * 清單列的拖曳把手：滑鼠從整列都能拖，觸控只能從把手開始（整列留給捲動；共用 SortableList 的規則）。
 */
export function DragHandle({ title }: { title: string }) {
  return (
    <span
      data-drag-handle
      aria-hidden
      title={title}
      className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
    >
      <GripVertical />
    </span>
  );
}

/** 留空＝自動的數字欄（0／null＝自動；placeholder 預設「自動」，批次面板不一致時是「混合」） */
export function AutoNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  placeholder = S.char.sizeAuto,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  className?: string;
}) {
  return (
    <OptionalNumberInput
      {...rest}
      value={value && value > 0 ? value : null}
      onChange={(v) => onChange(v)}
      min={min}
      max={max}
      step={step}
      unit={unit}
      placeholder={placeholder}
      size="sm"
    />
  );
}

/** 面板的小節 */
export function Block({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      {title || actions ? (
        <div className="flex items-center gap-2">
          {title ? (
            <h3 className="text-xs font-semibold tracking-wide text-muted">{title}</h3>
          ) : null}
          {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
