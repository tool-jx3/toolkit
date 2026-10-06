/**
 * 這個工具自己的小元件：時間欄（分:秒，離開或 Enter 時確定、看不懂時還原）、會記一步復原的文字欄。
 */
import { type ComponentProps, useEffect, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { TextArea, TextInput } from '@/ui';
import { formatClock, parseClock } from './model';
import { useSettings } from './store';

const gesture = historyGesture(useSettings);

/**
 * 時間欄：顯示「分:秒」，確定時解析（分:秒、時:分:秒、秒數）；accept 不接受時還原成原本的值。
 * 只有文字真的改了才解析（同原作的 change）：顯示的「分:秒」捨去了小數，沒改就重新解析會把 12.5 秒變成 12 秒。
 */
export function ClockInput({
  value,
  onCommit,
  accept = (v) => v >= 0,
  disabled,
  id,
  'aria-label': ariaLabel,
  className,
}: {
  value: number;
  onCommit: (seconds: number) => void;
  accept?: (seconds: number) => boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}) {
  const [text, setText] = useState(formatClock(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatClock(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    /* 沒有改（含 Enter 確定後再離開欄位）：保留原本的值 */
    if (text === formatClock(value)) return;
    const v = parseClock(text);
    if (Number.isFinite(v) && accept(v)) {
      onCommit(v);
      setText(formatClock(v));
    } else setText(formatClock(value));
  };
  return (
    <TextInput
      id={id}
      aria-label={ariaLabel}
      value={text}
      inputMode="numeric"
      disabled={disabled}
      className={className}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setEditing(true);
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setEditing(false);
          setText(formatClock(value));
        }
      }}
    />
  );
}

/** 文字欄：打字中的變更在離開欄位時才算一步復原 */
export function HistoryInput(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        gesture.begin();
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        gesture.commit();
        props.onBlur?.(e);
      }}
    />
  );
}

/** 多行文字欄：同上 */
export function HistoryTextArea(props: ComponentProps<typeof TextArea>) {
  return (
    <TextArea
      {...props}
      onFocus={(e) => {
        gesture.begin();
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        gesture.commit();
        props.onBlur?.(e);
      }}
    />
  );
}

/** 滑桿：拖曳中的變更放開時算一步 */
export const sliderGesture = gesture;
