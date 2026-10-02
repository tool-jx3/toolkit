/**
 * 這個工具的欄位：滑桿（拖曳中即時更新、放開才記一步復原）、百分比滑桿、顏色參照欄（F15）、色彩欄、開關。
 */
import { type ReactNode, useRef } from 'react';
import { ColorField, Field, Select, Slider, Toggle } from '@/ui';
import { isHex } from './model';
import { gesture } from './store';
import { S } from './strings';

/** 滑桿；format 有給時在標籤右邊顯示格式化後的目前值 */
export function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  hidden,
  precision,
  testId,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
  hidden?: boolean;
  precision?: number;
  testId?: string;
}) {
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <div className="contents" data-testid={testId}>
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          precision={precision}
          onChange={gesture.live(onChange)}
          onCommit={gesture.commit}
        />
      </div>
    </Field>
  );
}

/** 0～1 的值以百分比顯示（整數） */
export function PctField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  hint,
  hidden,
  testId,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  hidden?: boolean;
  testId?: string;
}) {
  return (
    <NumField
      label={label}
      value={Math.round(value * 100)}
      onChange={(v) => onChange(Math.round(v) / 100)}
      min={Math.round(min * 100)}
      max={Math.round(max * 100)}
      step={Math.max(1, Math.round(step * 100))}
      unit="%"
      precision={0}
      hint={hint}
      hidden={hidden}
      testId={testId}
    />
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
  hidden,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <Field label={label} layout="inline" hint={hint} hidden={hidden}>
      <Toggle checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

/**
 * 色彩欄（放開才記一步）：調色盤拖曳中只更新、放開才記；點常用色、打色碼各記一步。
 * 調色盤是 portal，但 React 的事件仍沿著元件樹傳到外層，所以抓得到指標放開與離開欄位。
 */
export function GestureColor({
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label'?: string;
  className?: string;
}) {
  const down = useRef(false);
  const commit = () => gesture.commit();
  return (
    <div
      className={className ?? 'min-w-0'}
      onPointerDownCapture={() => {
        down.current = true;
      }}
      onPointerUpCapture={() => {
        down.current = false;
        commit();
      }}
      onKeyUpCapture={commit}
      onBlurCapture={commit}
    >
      <ColorField
        aria-label={ariaLabel}
        value={value}
        onChange={(v) => {
          gesture.begin();
          onChange(v.slice(0, 7).toLowerCase());
          if (!down.current) commit();
        }}
      />
    </div>
  );
}

export function ColorFieldRow({
  label,
  value,
  onChange,
  hint,
  hidden,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <GestureColor value={value} onChange={onChange} />
    </Field>
  );
}

const REF_KEYS = ['accent', 'text', 'frame1', 'frame2'] as const;

/**
 * 顏色參照欄（F15）：選單（強調色、文字色、框色 1、框色 2、自訂顏色）＋選「自訂顏色」時出現的色塊。
 * allowNone：圖片換色多一個「不換色」。
 */
export function ColorRefField({
  label,
  value,
  onChange,
  allowNone,
  hint,
  hidden,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  hint?: ReactNode;
  hidden?: boolean;
  testId?: string;
}) {
  const custom = isHex(value);
  const lastCustom = useRef(custom ? value : '#ffffff');
  if (custom) lastCustom.current = value;
  const options = [
    ...(allowNone ? [{ value: 'none', label: S.colorRef.none }] : []),
    ...REF_KEYS.map((k) => ({ value: k, label: S.colorRef[k] })),
    { value: 'custom', label: S.colorRef.custom },
  ];
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={testId}>
        <Select
          value={custom ? 'custom' : value}
          onValueChange={(v) => onChange(v === 'custom' ? lastCustom.current : v)}
          options={options}
          className="w-36 shrink-0"
        />
        {custom ? (
          <GestureColor
            aria-label={S.colorRef.customAria(label)}
            value={value}
            onChange={onChange}
            className="min-w-0 flex-1"
          />
        ) : null}
      </div>
    </Field>
  );
}

/**
 * 包住設定面板：在文字欄（含數字欄、色碼欄）裡的變更從聚焦到離開合成一步復原。
 */
export function TextGestureScope({ children }: { children: ReactNode }) {
  const isText = (t: EventTarget | null) =>
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'range', 'button', 'color', 'file'].includes(t.type));
  return (
    <div
      className="contents"
      onFocusCapture={(e) => {
        if (isText(e.target)) gesture.begin();
      }}
      onBlurCapture={(e) => {
        if (isText(e.target)) gesture.commit();
      }}
    >
      {children}
    </div>
  );
}
