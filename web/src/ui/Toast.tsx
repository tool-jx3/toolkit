/**
 * 短暫通知（Radix Toast）。`const toast = useToast(); toast({ title: '已儲存', tone: 'success' })`
 *
 * Esc：每則通知都是 Radix 的可關閉圖層，而且是最上層，Radix 只把 Esc 交給它。有對話框（Dialog、確認對話框）開著、
 * 焦點在對話框裡或在 body 時，通知把 Esc 讓給對話框（通知留著，對話框照常關閉；room-zip 修正時新增）；
 * 其他時候照舊由 Esc 關閉最新的一則通知（焦點在通知上時關那一則）。
 */
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { Toast as T } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { cn } from './cn';
import { escapeOwner } from './Dialog';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** 顯示毫秒數（預設 4000；錯誤 7000） */
  duration?: number;
  /** 取代畫面上現有的通知（一次只顯示這一則；emotion-maker 移植時新增，不給時行為不變） */
  replace?: boolean;
  /**
   * 點通知本體（× 以外的地方）也立刻關閉（bg-motion 修正時新增，不給時行為不變：只有 × 與滑掉能關）。
   * 鍵盤照舊用 × 或 Esc。
   */
  dismissOnClick?: boolean;
  /**
   * 通知上的一個動作按鈕（例如「復原」）：按了呼叫 onClick 並關閉通知。室內平面圖移植時新增，不給時行為不變。
   * `altText` 給螢幕閱讀器（說明不用通知上的按鈕時怎麼做，預設＝label）。
   */
  action?: { label: string; onClick: () => void; altText?: string };
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
    setItems((list) => [...(o.replace ? [] : list.slice(-3)), { ...o, id, open: true }]);
  }, []);
  const close = useCallback((id: number) => {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, open: false } : x)));
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 300);
  }, []);
  /**
   * 這次的 Esc 要讓給對話框：Radix 處理完 onEscapeKeyDown 會接著呼叫 onOpenChange(false)，這時不關閉通知。
   * 不用 preventDefault，對話框才知道這個 Esc 還沒有人處理（見 Dialog.tsx 的 EscapeFallback）。
   */
  const yieldEscape = useRef(false);
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
              onEscapeKeyDown={(e) => {
                if (!escapeOwner(e.target)) return;
                yieldEscape.current = true;
                queueMicrotask(() => {
                  yieldEscape.current = false;
                });
              }}
              onOpenChange={(open) => {
                if (open) return;
                if (yieldEscape.current) {
                  yieldEscape.current = false;
                  return;
                }
                close(t.id);
              }}
              onClick={
                t.dismissOnClick
                  ? (e) => {
                      /* × 由 Radix 自己關；點在其他連結、按鈕上不攔 */
                      if ((e.target as Element).closest('a, button')) return;
                      close(t.id);
                    }
                  : undefined
              }
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-md border bg-surface px-3 py-2.5 text-fg shadow-2',
                t.dismissOnClick && 'cursor-pointer',
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
              {t.action ? (
                <T.Action
                  altText={t.action.altText ?? t.action.label}
                  onClick={t.action.onClick}
                  className="shrink-0 self-center rounded-sm border border-border-strong px-2 py-0.5 text-xs font-medium text-fg hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  data-testid="toast-action"
                >
                  {t.action.label}
                </T.Action>
              ) : null}
              <T.Close aria-label="關閉通知" className="rounded-sm p-0.5 text-muted hover:text-fg">
                <X aria-hidden className="size-4" />
              </T.Close>
            </T.Root>
          );
        })}
        <T.Viewport
          label="通知（{hotkey}）"
          className="pointer-events-none fixed right-0 bottom-0 z-[60] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none"
        />
      </T.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error('useToast 必須在 UiProvider（或 ToolShell）裡使用');
  return fn;
}
