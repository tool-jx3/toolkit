/**
 * 這個工具專用的小元件：可個別切換的按鈕組、可留空的寬度欄、縮圖。
 */
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button, cn, TextInput, useFieldControl } from '@/ui';
import { normalizeWidth } from './model';

export interface PressOption {
  key: string;
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
}

/** 三個可以個別切換的按鈕（按下狀態以 aria-pressed 與底色表示） */
export function PressButtons({
  options,
  'aria-label': ariaLabel,
}: {
  options: readonly PressOption[];
  'aria-label'?: string;
}) {
  const field = useFieldControl({ 'aria-label': ariaLabel });
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組可個別切換的按鈕，不是表單分組
    <div
      role="group"
      id={field.id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o) => (
        <Button
          key={o.key}
          size="sm"
          variant={o.pressed ? 'primary' : 'secondary'}
          aria-pressed={o.pressed}
          icon={o.pressed ? <Check /> : undefined}
          onClick={() => o.onChange(!o.pressed)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * 寬度（px）：空白或 0 以下＝原尺寸（存成 null）。打字中的文字留在欄位裡，離開時才整理顯示。
 */
export function WidthInput({
  value,
  onChange,
  onCommit,
  placeholder,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onCommit?: () => void;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  return (
    <div className="relative inline-flex w-36 min-w-0 items-center">
      <TextInput
        {...rest}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const n = Number(text.replace(/[，,\s]/g, '').replace(/[－−]/g, '-'));
          onChange(text.trim() === '' || !Number.isFinite(n) ? null : normalizeWidth(n));
        }}
        onBlur={() => {
          setDraft(null);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-full pr-8 tabular-nums"
      />
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-muted">
        px
      </span>
    </div>
  );
}

/** 立繪的縮圖（棋盤格底）；沒有圖片時顯示文字 */
export function Thumb({
  src,
  alt,
  empty,
  size = 40,
  className,
}: {
  src: string | null;
  alt: string;
  empty: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'checker inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border text-sm font-semibold text-muted',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : (
        <span role="img" aria-label={alt}>
          {empty}
        </span>
      )}
    </span>
  );
}
