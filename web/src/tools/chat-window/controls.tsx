/**
 * 設定面板用的小元件：把共用控制項接上這個工具的 store（復原手勢、拖曳中不改變顯示／隱藏）。
 */
import { type KeyboardEvent, type ReactNode, type Ref, useRef, useState } from 'react';
import type { FontValue } from '@/core/fonts';
import {
  ColorField,
  Field,
  FontPicker,
  NativeNumberInput,
  Segmented,
  type SegmentedOption,
  Slider,
  TextInput,
  Toggle,
  Tooltip,
} from '@/ui';
import { type ChatSettings, type NumberKey, normalizeSourceSize, RANGES } from './settings';
import { gesture, setSetting, setter, useChat, useDrag } from './store';
import { S } from './strings';

/** 目前的設定 */
export const useSettings = (): ChatSettings => useChat((st) => st.data);

/**
 * 決定設定列顯示／隱藏用的設定：拖曳滑桿途中維持拖曳前的狀態，放開才更新（避免拖曳被打斷）。
 */
export function useVisibility(): ChatSettings {
  const s = useSettings();
  const dragging = useDrag((st) => st.dragging);
  const frozen = useRef(s);
  if (!dragging) frozen.current = s;
  return frozen.current;
}

/** 只在 OBS 31 以上有效的選項 */
export function ObsBadge() {
  return (
    <Tooltip content={S.obsBadgeHint}>
      <span
        className="ml-1.5 inline-flex shrink-0 items-center rounded-sm border border-border-strong px-1 align-middle text-[11px] leading-4 font-medium text-muted"
        data-obs-badge=""
      >
        {S.obsBadge}
      </span>
    </Tooltip>
  );
}

interface RowProps {
  label: ReactNode;
  hint?: ReactNode;
  hidden?: boolean;
}

/** 滑桿（拖曳中即時預覽，放開才記一步復原） */
export function SliderRow({
  k,
  label,
  unit,
  hint,
  hidden,
  valueLabel,
}: RowProps & {
  k: NumberKey;
  unit?: string;
  /** 不用數字欄、改在標籤旁顯示的文字（例：0 行顯示「不截斷」） */
  valueLabel?: (v: number) => string;
}) {
  const v = useChat((st) => st.data[k]);
  const [min, max, step] = RANGES[k];
  return (
    <Field
      label={label}
      hint={hint}
      hidden={hidden}
      labelSuffix={valueLabel ? <span data-value="">{valueLabel(v)}</span> : undefined}
    >
      <Slider
        value={v}
        min={min}
        max={max}
        step={step}
        unit={unit}
        showInput={!valueLabel}
        valueText={valueLabel}
        onChange={gesture.slide((x: number) => setSetting(k, x))}
        onCommit={gesture.release}
      />
    </Field>
  );
}

type KeysOf<V> = {
  [K in keyof ChatSettings]: ChatSettings[K] extends V ? K : never;
}[keyof ChatSettings];

/** 開關 */
export function ToggleRow({
  k,
  label,
  hint,
  hidden,
  badge,
  onChange,
}: RowProps & {
  k: KeysOf<boolean>;
  badge?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const v = useChat((st) => st.data[k]) as boolean;
  return (
    <Field
      label={
        <>
          {label}
          {badge ? <ObsBadge /> : null}
        </>
      }
      hint={hint}
      hidden={hidden}
      layout="inline"
    >
      <Toggle checked={v} onCheckedChange={onChange ?? (setter(k) as (v: boolean) => void)} />
    </Field>
  );
}

/** 分段選擇 */
export function SegmentRow<K extends KeysOf<string>>({
  k,
  label,
  hint,
  hidden,
  options,
}: RowProps & {
  k: K;
  options: readonly SegmentedOption<Extract<ChatSettings[K], string>>[];
}) {
  const v = useChat((st) => st.data[k]) as Extract<ChatSettings[K], string>;
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <Segmented
        value={v}
        onValueChange={(x) => setSetting(k, x as ChatSettings[K])}
        options={options}
        fullWidth
      />
    </Field>
  );
}

/** 顏色（可選不透明度）；拖曳調色盤放開、或離開欄位時才記一步復原 */
export function ColorRow({
  k,
  label,
  hint,
  hidden,
  alpha,
}: RowProps & { k: KeysOf<string>; alpha?: boolean }) {
  const v = useChat((st) => st.data[k]) as string;
  const onKeyUp = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    /* 色碼欄、不透明度欄打字中不結束手勢（離開欄位才記一步） */
    if (t instanceof HTMLInputElement || t.getAttribute('role') === 'spinbutton') return;
    gesture.release();
  };
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <div
        className="min-w-0"
        onPointerUpCapture={gesture.release}
        onKeyUpCapture={onKeyUp}
        onBlurCapture={gesture.release}
      >
        <ColorField
          value={v}
          alpha={alpha}
          onChange={gesture.slide((x: string) => setSetting(k, x as ChatSettings[typeof k]))}
        />
      </div>
    </Field>
  );
}

/** 字型（CSS 用：Google 字型、電腦字型、自行輸入名稱）＋字重 */
export function FontRow({
  k,
  label,
  hidden,
  previewText,
}: RowProps & {
  k: 'titleFont' | 'nameFont' | 'bodyFont' | 'resultFont';
  previewText?: string;
}) {
  const v = useChat((st) => st.data[k]);
  return (
    <Field label={label} hidden={hidden}>
      <FontPicker
        mode="css"
        value={v}
        onChange={(f: FontValue) => setSetting(k, f)}
        previewText={previewText}
      />
    </Field>
  );
}

/** 單行文字欄（離開欄位才記一步復原） */
export function TextRow({
  k,
  label,
  hint,
  hidden,
  placeholder,
  inputRef,
}: RowProps & {
  k: 'titleText' | 'participantPrefix' | 'room' | 'fileName';
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const v = useChat((st) => st.data[k]);
  return (
    <Field label={label} hint={hint} hidden={hidden}>
      <TextInput
        ref={inputRef}
        value={v}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={gesture.begin}
        onChange={(e) => setSetting(k, e.target.value)}
        onBlur={gesture.commit}
      />
    </Field>
  );
}

/** 來源寬高欄：上下鍵每 10；離開欄位（或 Enter）時修正並回填 */
export function SourceSizeInput({ axis, label }: { axis: 'width' | 'height'; label: string }) {
  const v = useChat((st) => st.data[axis]);
  const [draft, setDraft] = useState<string | null>(null);
  const [min, max] = RANGES[axis];
  /* 打字或微調時：是範圍內的整數就即時套用（同一次編輯只記一步復原） */
  const onChange = (x: string) => {
    setDraft(x);
    const n = Number(x);
    if (x.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) {
      gesture.begin();
      setSetting(axis, n);
    }
  };
  const commit = () => {
    if (draft !== null) {
      const n = normalizeSourceSize(axis, draft);
      setDraft(null);
      if (n !== useChat.getState().data[axis]) {
        gesture.begin();
        setSetting(axis, n);
      }
    }
    gesture.commit();
  };
  return (
    <Field label={label}>
      <div
        onBlurCapture={commit}
        onKeyDownCapture={(e) => {
          if (e.key === 'Enter') commit();
        }}
      >
        <NativeNumberInput
          value={draft ?? String(v)}
          onChange={onChange}
          min={min}
          max={max}
          step={10}
          unit="px"
          stepLabels={{ up: S.source.stepUp(label), down: S.source.stepDown(label) }}
        />
      </div>
    </Field>
  );
}
