/**
 * 對話框（Radix Dialog）、確認對話框（Radix AlertDialog）與 useConfirm()。
 */
import { X } from 'lucide-react';
import { AlertDialog, Dialog as D } from 'radix-ui';
import {
  createContext,
  type ReactElement,
  type ReactNode,
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
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className={overlayClass} />
        <D.Content className={contentClass(size, className)}>
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
