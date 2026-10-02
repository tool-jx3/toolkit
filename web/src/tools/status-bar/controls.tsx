/**
 * 綁定設定路徑的欄位（滑桿、分段、選單、開關、色彩欄），一律照「放開才記一步復原」：
 * 滑桿拖曳中即時更新、放開時記一步；色彩欄拖曳調色盤時同理；選單、開關、分段每次選定是一步。
 */
import { type ReactNode, useRef } from 'react';
import { ColorField, Field, Segmented, Select, Slider, Toggle } from '@/ui';
import { getPath, RANGES, type RangeKey, type Settings } from './settings';
import { gesture, setSetting, useSettings } from './store';

export const useS = (): Settings => useSettings((st) => st.data);

type Choices<T extends string> = readonly (readonly [T, string])[];

interface Base {
  label: ReactNode;
  path: string;
  hint?: ReactNode;
  hidden?: boolean;
}

/** 滑桿（範圍取自 RANGES）；format 有給時在標籤右邊顯示格式化後的值（例：「無」「25% 以下」） */
export function NumField({
  label,
  path,
  hint,
  hidden,
  unit,
  format,
  precision,
}: Base & { unit?: string; format?: (v: number) => string; precision?: number }) {
  const s = useS();
  const r = RANGES[path as RangeKey];
  const v = Number(getPath(s, path));
  return (
    <Field label={label} hint={hint} hidden={hidden} labelSuffix={format ? format(v) : undefined}>
      <Slider
        value={v}
        min={r.min}
        max={r.max}
        step={r.step}
        unit={unit}
        precision={precision}
        onChange={gesture.live((n: number) => setSetting(path, n))}
        onCommit={gesture.commit}
      />
    </Field>
  );
}

export function SegField<T extends string>({
  label,
  path,
  hint,
  hidden,
  options,
}: Base & { options: Choices<T> }) {
  const s = useS();
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <Segmented
        value={String(getPath(s, path)) as T}
        onValueChange={(v) => setSetting(path, v)}
        options={options.map(([value, l]) => ({ value, label: l }))}
        fullWidth
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  path,
  hint,
  hidden,
  options,
}: Base & { options: Choices<T> }) {
  const s = useS();
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <Select
        value={String(getPath(s, path)) as T}
        onValueChange={(v) => setSetting(path, v)}
        options={options.map(([value, l]) => ({ value, label: l }))}
      />
    </Field>
  );
}

export function ToggleField({ label, path, hint, hidden }: Base) {
  const s = useS();
  return (
    <Field label={label} hint={hint} hidden={hidden} layout="inline">
      <Toggle checked={!!getPath(s, path)} onCheckedChange={(on) => setSetting(path, on)} />
    </Field>
  );
}

/**
 * 色彩欄（放開才記一步）：調色盤拖曳中只更新、放開才記；點常用色、打色碼、改不透明度各記一步。
 * 調色盤是 portal，但 React 的事件仍沿著元件樹傳到這裡的外層，所以抓得到指標放開與離開欄位。
 */
export function GestureColor({
  value,
  onChange,
  alpha,
  'aria-label': ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  alpha?: boolean;
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
        alpha={alpha}
        onChange={(v) => {
          gesture.begin();
          onChange(v);
          if (!down.current) commit();
        }}
      />
    </div>
  );
}

export function ColorPathField({ label, path, hint, hidden, alpha }: Base & { alpha?: boolean }) {
  const s = useS();
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <GestureColor
        value={String(getPath(s, path) || '#ffffff')}
        alpha={alpha}
        onChange={(c) => setSetting(path, c)}
      />
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
