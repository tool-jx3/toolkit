/**
 * 文字輸入框與多行文字框。放在 Field 裡會自動關聯標籤與說明。
 */
import type { ComponentPropsWithRef } from 'react';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';

export const inputClass = (invalid?: boolean, className?: string) =>
  cn(
    'min-w-0 rounded-md border bg-surface-2 px-2.5 text-sm text-fg placeholder:text-muted',
    fullWidthUnless(className),
    'transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-danger' : 'border-border-strong',
    className,
  );

export interface TextInputProps extends ComponentPropsWithRef<'input'> {
  invalid?: boolean;
}

export function TextInput({ invalid, className, type = 'text', ...rest }: TextInputProps) {
  const field = useFieldControl(rest);
  return (
    <input
      type={type}
      {...rest}
      {...field}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-invalid={invalid || field['aria-invalid'] || undefined}
      className={inputClass(invalid || !!field['aria-invalid'], cn('h-8', className))}
    />
  );
}

export interface TextAreaProps extends ComponentPropsWithRef<'textarea'> {
  invalid?: boolean;
}

export function TextArea({ invalid, className, rows = 4, ...rest }: TextAreaProps) {
  const field = useFieldControl(rest);
  return (
    <textarea
      rows={rows}
      {...rest}
      {...field}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-invalid={invalid || field['aria-invalid'] || undefined}
      className={inputClass(
        invalid || !!field['aria-invalid'],
        cn('resize-y py-1.5 leading-relaxed', className),
      )}
    />
  );
}
