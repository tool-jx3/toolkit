/**
 * 對話框（Radix Dialog）、確認對話框（Radix AlertDialog）與 useConfirm()。
 */
import { X } from 'lucide-react';
import { AlertDialog, Dialog as D } from 'radix-ui';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { FieldScope } from './Field';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

const overlayClass = 'fixed inset-0 z-40 bg-overlay';
const contentClass = (size: keyof typeof SIZES, className?: string) =>
  cn(
    'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
    'rounded-lg border border-border bg-surface text-fg shadow-2 outline-none',
    SIZES[size],
    className,
  );

export interface DialogProps {
  title: ReactNode;
  /** 標題下的說明（也是螢幕閱讀器朗讀的描述） */
  description?: ReactNode;
  children?: ReactNode;
  /** 底部按鈕列 */
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 開啟對話框的按鈕（不受控用法） */
  trigger?: ReactElement;
  size?: keyof typeof SIZES;
  className?: string;
  /** 內容區不加內距（例如放圖片編輯區） */
  flush?: boolean;
  /** 開啟時把焦點放在這個元素（預設是第一個可聚焦的元素） */
  initialFocus?: RefObject<HTMLElement | null>;
  /** 點對話框外面是否關閉（預設 true）。對話框裡有使用者做到一半、關了就會丟掉的東西時設 false（Esc 與關閉鈕照常作用） */
  dismissOnOutside?: boolean;
}

export function Dialog({
  title,
  description,
  children,
  footer,
  open,
  onOpenChange,
  trigger,
  size = 'md',
  className,
  flush,
  initialFocus,
  dismissOnOutside = true,
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className={overlayClass} />
        <D.Content
          className={contentClass(size, className)}
          onInteractOutside={dismissOnOutside ? undefined : (e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            const el = initialFocus?.current;
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <FieldScope>
            <div className="flex items-start gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <D.Title className="m-0 text-lg font-semibold">{title}</D.Title>
                {description ? (
                  <D.Description className="m-0 mt-0.5 text-sm text-muted">
                    {description}
                  </D.Description>
                ) : (
                  <D.Description className="sr-only">
                    {typeof title === 'string' ? title : '對話框'}
                  </D.Description>
                )}
              </div>
              <D.Close asChild>
                <IconButton label="關閉" icon={<X />} size="sm" noTooltip />
              </D.Close>
            </div>
            <div className={cn('min-h-0 flex-1 overflow-auto', !flush && 'px-4 py-3')}>
              {children}
            </div>
            {footer ? (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                {footer}
              </div>
            ) : null}
          </FieldScope>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** 對話框裡的「關閉」按鈕（放在 footer） */
export function DialogClose({
  children = '關閉',
  variant = 'secondary',
}: {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <D.Close asChild>
      <Button variant={variant}>{children}</Button>
    </D.Close>
  );
}

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  /** 預設「確定」 */
  confirmLabel?: string;
  /** 預設「取消」 */
  cancelLabel?: string;
  /** 會刪除或覆蓋資料的操作：確定按鈕用紅色 */
  danger?: boolean;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

/** 確認對話框（受控） */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={contentClass('sm', 'p-4')}>
          <AlertDialog.Title className="m-0 text-lg font-semibold">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="m-0 mt-2 text-sm text-muted">
              {description}
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="sr-only">
              {typeof title === 'string' ? title : '確認'}
            </AlertDialog.Description>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button onClick={onCancel}>{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/* ---------- useConfirm ---------- */

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => {
    resolver.current?.(false);
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <ConfirmDialog
          {...state}
          open={state.open}
          onOpenChange={(o) => {
            if (!o) settle(false);
          }}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

/**
 * 以 Promise 形式詢問：
 * ```ts
 * const confirm = useConfirm();
 * if (await confirm({ title: '要重設嗎？', danger: true })) reset();
 * ```
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm 必須在 UiProvider（或 ToolShell）裡使用');
  return fn;
}

/* ---------- 多選一確認（例如「加入／取代／取消」） ---------- */

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: string;
  /** 外觀（預設第一個 primary、其他 secondary）；會覆蓋或刪除資料的選項用 danger */
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface ChoiceOptions<V extends string = string> {
  title: ReactNode;
  description?: ReactNode;
  /** 選項（由左到右；不含取消） */
  choices: readonly ChoiceOption<V>[];
  /** 取消按鈕的文字（預設「取消」）；按取消、Esc、點外面都回傳 null */
  cancelLabel?: string;
}

export interface ChoiceDialogProps<V extends string = string> extends ChoiceOptions<V> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (value: V | null) => void;
}

/** 多選一確認對話框（受控）。取消在最左邊，其他選項依序排在右邊。 */
export function ChoiceDialog<V extends string = string>({
  open,
  onOpenChange,
  onChoose,
  title,
  description,
  choices,
  cancelLabel = '取消',
}: ChoiceDialogProps<V>) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={contentClass('sm', 'p-4')}>
          <AlertDialog.Title className="m-0 text-lg font-semibold">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="m-0 mt-2 text-sm text-muted">
              {description}
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="sr-only">
              {typeof title === 'string' ? title : '請選擇'}
            </AlertDialog.Description>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button onClick={() => onChoose(null)}>{cancelLabel}</Button>
            </AlertDialog.Cancel>
            {choices.map((c, i) => (
              <AlertDialog.Action asChild key={c.value}>
                <Button
                  variant={c.variant ?? (i === 0 ? 'primary' : 'secondary')}
                  onClick={() => onChoose(c.value)}
                >
                  {c.label}
                </Button>
              </AlertDialog.Action>
            ))}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

type ChoiceFn = <V extends string>(options: ChoiceOptions<V>) => Promise<V | null>;
const ChoiceContext = createContext<ChoiceFn | null>(null);

export function ChoiceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ChoiceOptions<string> & { open: boolean }) | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const choose = useCallback((options: ChoiceOptions<string>) => {
    resolver.current?.(null);
    setState({ ...options, open: true });
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []) as ChoiceFn;
  const settle = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  };
  return (
    <ChoiceContext.Provider value={choose}>
      {children}
      {state ? (
        <ChoiceDialog
          {...state}
          open={state.open}
          onOpenChange={(o) => {
            if (!o) settle(null);
          }}
          onChoose={settle}
        />
      ) : null}
    </ChoiceContext.Provider>
  );
}

/**
 * 多選一確認（三選一以上），以 Promise 回傳選到的值；取消、Esc、點外面回傳 null：
 * ```ts
 * const choose = useChoice();
 * const how = await choose({
 *   title: '匯入 12 個表情',
 *   description: '目前清單已有 5 個表情。',
 *   choices: [{ value: 'append', label: '加在後面' }, { value: 'replace', label: '取代目前的清單', variant: 'danger' }],
 * });
 * if (how === 'append') … else if (how === 'replace') …
 * ```
 */
export function useChoice(): ChoiceFn {
  const fn = useContext(ChoiceContext);
  if (!fn) throw new Error('useChoice 必須在 UiProvider（或 ToolShell）裡使用');
  return fn;
}
