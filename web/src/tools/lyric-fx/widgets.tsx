/**
 * 這個工具自己的小元件：時間欄（分:秒.百分秒，離開或 Enter 時確定、看不懂時還原）、會記一步復原的文字欄、放開才記一步的滑桿。
 */
import { type ComponentProps, useEffect, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { Slider, TextArea, TextInput } from '@/ui';
import { formatLyricTime, parseLyricTime } from './model';
import { useSettings } from './store';

export const gesture = historyGesture(useSettings);

/** 時間欄：顯示「分:秒.百分秒」；只有文字真的改了才解析 */
export function TimeInput({
  value,
  onCommit,
  accept = (v) => v >= 0,
  disabled,
  'aria-label': ariaLabel,
  className,
  testId,
}: {
  value: number;
  onCommit: (seconds: number) => void;
  accept?: (seconds: number) => boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  testId?: string;
}) {
  const [text, setText] = useState(formatLyricTime(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatLyricTime(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (text === formatLyricTime(value)) return;
    const v = parseLyricTime(text);
    if (Number.isFinite(v) && accept(v)) {
      onCommit(Math.round(v * 100) / 100);
      setText(formatLyricTime(v));
    } else setText(formatLyricTime(value));
  };
  return (
    <TextInput
      aria-label={ariaLabel}
      value={text}
      inputMode="decimal"
      disabled={disabled}
      className={className}
      data-testid={testId}
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
          setText(formatLyricTime(value));
        }
      }}
    />
  );
}

/** 文字欄：離開或 Enter 時才確定（逐句清單用：打字中不重排） */
export function CommitInput({
  value,
  onCommit,
  ...rest
}: Omit<ComponentProps<typeof TextInput>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (text !== value) onCommit(text);
  };
  return (
    <TextInput
      {...rest}
      value={text}
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
          setText(value);
        }
      }}
    />
  );
}

/** 多行文字欄：打字中的變更在離開欄位時才算一步復原 */
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
export function GestureSlider(props: ComponentProps<typeof Slider>) {
  return <Slider {...props} onChange={gesture.live(props.onChange)} onCommit={gesture.commit} />;
}
