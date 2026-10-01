/**
 * 設定面板的欄位：標籤＋控制項＋說明／錯誤。
 * 包在 Field 裡的基本控制項（TextInput、Slider、Select…）會自動拿到 id、aria-labelledby、aria-describedby。
 */
import { createContext, type ReactNode, useContext, useId } from 'react';
import { cn } from './cn';

interface FieldContextValue {
  id: string;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * 切斷 Field 的關聯：對話框、彈出面板的內容雖然在 React 樹上位於某個 Field 裡，
 * 但裡面的控制項不屬於那個欄位，不能沿用它的 id 與標籤。
 */
export function FieldScope({ children }: { children: ReactNode }) {
  return <FieldContext.Provider value={null}>{children}</FieldContext.Provider>;
}

export interface FieldControlProps {
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
}

/** 控制項用：合併自己的屬性與所在 Field 提供的 id／說明 */
export function useFieldControl<P extends FieldControlProps>(
  props: P,
): Required<Pick<FieldControlProps, 'id'>> & FieldControlProps {
  const ctx = useContext(FieldContext);
  const fallback = useId();
  /* 自己有 aria-label 的是 Field 裡的次要控制項（例如字型旁的字重）：不搶 Field 的 id，避免重複 */
  const own = !!(props as { 'aria-label'?: string })['aria-label'];
  return {
    id: props.id ?? (own ? fallback : (ctx?.id ?? fallback)),
    'aria-labelledby': props['aria-labelledby'] ?? (own ? undefined : ctx?.labelId),
    'aria-describedby':
      [
        ...new Set(
          [props['aria-describedby'], ctx?.describedBy]
            .filter(Boolean)
            .join(' ')
            .split(' ')
            .filter(Boolean),
        ),
      ].join(' ') || undefined,
    'aria-invalid': props['aria-invalid'] ?? (ctx?.invalid ? true : undefined),
  };
}

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** 說明文字（灰色小字） */
  hint?: ReactNode;
  /** 錯誤訊息（紅字，會讓控制項標成無效） */
  error?: ReactNode;
  /** stack：標籤在上（預設）；inline：標籤在左、控制項在右（開關、短數字） */
  layout?: 'stack' | 'inline';
  /** 標籤右側的附加內容（例如目前值、重設按鈕） */
  labelSuffix?: ReactNode;
  /**
   * 條件顯示：true 時整個欄位不顯示（設定值保留不變）。
   * `<Field label="欄數" hidden={layout !== 'grid'}>…</Field>`
   */
  hidden?: boolean;
  id?: string;
  className?: string;
}

export function Field({
  label,
  children,
  hint,
  error,
  layout = 'stack',
  labelSuffix,
  hidden,
  id,
  className,
}: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto}`;
  const labelId = `${controlId}-label`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const value: FieldContextValue = {
    id: controlId,
    labelId,
    describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined,
    invalid: !!error,
  };
  const labelEl = (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <label id={labelId} htmlFor={controlId} className="text-sm font-medium text-fg">
        {label}
      </label>
      {labelSuffix ? <div className="shrink-0 text-xs text-muted">{labelSuffix}</div> : null}
    </div>
  );
  if (hidden) return null;
  return (
    <FieldContext.Provider value={value}>
      <div
        className={cn(
          layout === 'inline'
            ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1'
            : 'flex flex-col gap-1.5',
          className,
        )}
        data-field=""
      >
        {labelEl}
        <div className={cn('min-w-0', layout === 'inline' && 'justify-self-end')}>{children}</div>
        {hint ? (
          <p
            id={hintId}
            className={cn('m-0 text-xs text-muted', layout === 'inline' && 'col-span-2')}
          >
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className={cn('m-0 text-xs text-danger', layout === 'inline' && 'col-span-2')}
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export interface FieldRowProps {
  children: ReactNode;
  /** 欄數（窄螢幕仍維持；內容太寬時請改用 1） */
  columns?: 2 | 3 | 4;
  className?: string;
}

/** 一列放多個欄位（例如寬、高） */
export function FieldRow({ children, columns = 2, className }: FieldRowProps) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
  return <div className={cn('grid items-start gap-3', cols, className)}>{children}</div>;
}

/**
 * 條件顯示的一組欄位（when 為 false 時不顯示，設定值保留不變）：
 * `<Show when={s.textPos === 'inside'}><Field …/><Field …/></Show>`
 */
export function Show({ when, children }: { when: unknown; children: ReactNode }) {
  return when ? children : null;
}
