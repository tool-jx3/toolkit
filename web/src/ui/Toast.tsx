/**
 * 短暫通知（Radix Toast）。`const toast = useToast(); toast({ title: '已儲存', tone: 'success' })`
 */
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { Toast as T } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { cn } from './cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** 顯示毫秒數（預設 4000；錯誤 7000） */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

type ToastFn = (options: ToastOptions) => void;
const ToastContext = createContext<ToastFn | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  info: <Info className="size-4 text-accent" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
  danger: <XCircle className="size-4 text-danger" />,
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback<ToastFn>((o) => {
    const id = ++seq;
    setItems((list) => [...list.slice(-3), { ...o, id, open: true }]);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      <T.Provider swipeDirection="right" label="通知">
        {children}
        {items.map((t) => {
          const tone = t.tone ?? 'info';
          return (
            <T.Root
              key={t.id}
              open={t.open}
              duration={t.duration ?? (tone === 'danger' ? 7000 : 4000)}
              type={tone === 'danger' ? 'foreground' : 'background'}
              onOpenChange={(open) => {
                if (!open) {
                  setItems((list) => list.map((x) => (x.id === t.id ? { ...x, open: false } : x)));
                  setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 300);
                }
              }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-md border bg-surface px-3 py-2.5 text-fg shadow-2',
                tone === 'danger'
                  ? 'border-danger'
                  : tone === 'warning'
                    ? 'border-warning'
                    : 'border-border',
              )}
            >
              <span aria-hidden className="mt-0.5 inline-flex">
                {ICONS[tone]}
              </span>
              <div className="min-w-0 flex-1">
                <T.Title className="text-sm font-medium">{t.title}</T.Title>
                {t.description ? (
                  <T.Description className="mt-0.5 text-xs text-muted">
                    {t.description}
                  </T.Description>
                ) : null}
              </div>
              <T.Close aria-label="關閉通知" className="rounded-sm p-0.5 text-muted hover:text-fg">
                <X aria-hidden className="size-4" />
              </T.Close>
            </T.Root>
          );
        })}
        <T.Viewport className="pointer-events-none fixed right-0 bottom-0 z-[60] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none" />
      </T.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error('useToast 必須在 UiProvider（或 ToolShell）裡使用');
  return fn;
}
