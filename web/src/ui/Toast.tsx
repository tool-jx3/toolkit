/**
 * 短暫通知（Radix Toast）。`const toast = useToast(); toast({ title: '已儲存', tone: 'success' })`
 *
 * Esc：每則通知都是 Radix 的可關閉圖層，而且是最上層，Radix 只把 Esc 交給它。有對話框（Dialog、確認對話框）開著、
 * 焦點在對話框裡或在 body 時，通知把 Esc 讓給對話框（通知留著，對話框照常關閉；room-zip 修正時新增）；
 * 其他時候照舊由 Esc 關閉最新的一則通知（焦點在通知上時關那一則）。
 *
 * 焦點：關掉焦點所在的通知時，Radix 會把焦點放到通知區（viewport），它在焦點進入通知區時暫停所有通知的倒數、
 * 離開時才繼續；最後一則通知關掉時它會拿掉這些監聽，暫停狀態就一直留著，之後的通知都不會自己消失
 * （height-board 修正時發現：按過通知上的動作鈕之後）。所以關掉焦點所在的通知時把焦點移出通知區，
 * 讓通知區照常收到「焦點離開」而解除暫停：用滑鼠／觸控關的交給 body（不去聚焦別的輸入欄，觸控時不會跳出鍵盤）；
 * 用鍵盤關掉最後一則時還給進通知區之前的元素（不在了就交給 body）；
 * 用鍵盤關、而且還有別的通知時照 Radix 的做法留在通知區，可以繼續用 Tab 走到下一則。
 *
 * `toast()` 傳回一個關閉函式（height-board 修正時新增；不用它時行為不變）：呼叫就關掉那一則（已經關了就沒事）。
 */
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { Toast as T } from 'radix-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from './cn';
import { escapeOwner } from './Dialog';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** 顯示毫秒數（預設 4000；錯誤 7000） */
  duration?: number;
  /**
   * 取代之前同樣用 replace 發的通知（這一類一次只顯示一則；emotion-maker 移植時新增，不給時行為不變）。
   * 沒有用 replace 發的通知不受影響：同一批先發出的錯誤、存檔失敗、「已開啟專案檔」等留著，
   * 不會被之後的成功通知清掉（圖片資產稽核時修正；原本會清掉畫面上所有的通知）。
   */
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

/** 發一則通知，傳回關閉它的函式（不用也可以） */
type ToastFn = (options: ToastOptions) => () => void;
const ToastContext = createContext<ToastFn | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  info: <Info className="size-4 text-accent" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
  danger: <XCircle className="size-4 text-danger" />,
};

let seq = 0;

/** 在通知上按下指標之後這段時間內關掉通知，算是用滑鼠／觸控關的 */
const POINTER_CLOSE_MS = 1500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const viewportRef = useRef<HTMLOListElement>(null);
  /** 焦點進通知區之前所在的元素 */
  const lastOutside = useRef<HTMLElement | null>(null);
  /** 最近一次在通知上按下指標的時間 */
  const pointerAt = useRef(-Infinity);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const region = viewportRef.current?.parentElement;
      const t = e.target;
      if (t instanceof HTMLElement && !region?.contains(t)) lastOutside.current = t;
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);
  /** 見檔頭「焦點」：在 Radix 拿掉監聽之前（通知還沒卸下）把焦點移出通知區 */
  const releaseFocus = useCallback((id: number) => {
    const vp = viewportRef.current;
    const active = document.activeElement;
    if (!vp || !active || !vp.contains(active)) return;
    const byPointer = performance.now() - pointerAt.current <= POINTER_CLOSE_MS;
    const others = itemsRef.current.some((x) => x.open && x.id !== id);
    if (others && !byPointer) return;
    const back = lastOutside.current;
    if (!byPointer && back?.isConnected && !vp.parentElement?.contains(back)) {
      back.focus({ preventScroll: true });
      if (document.activeElement === back) return;
    }
    (active as HTMLElement).blur?.();
  }, []);
  const close = useCallback(
    (id: number) => {
      releaseFocus(id);
      setItems((list) => list.map((x) => (x.id === id ? { ...x, open: false } : x)));
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 300);
    },
    [releaseFocus],
  );
  const toast = useCallback<ToastFn>(
    (o) => {
      const id = ++seq;
      /* replace 只換掉之前的 replace 通知；其他的照舊最多留 3 則＋新的一則 */
      setItems((list) => [
        ...(o.replace ? list.filter((x) => !x.replace) : list).slice(-3),
        { ...o, id, open: true },
      ]);
      return () => {
        if (itemsRef.current.find((x) => x.id === id)?.open === false) return;
        close(id);
      };
    },
    [close],
  );
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
              onPointerDownCapture={() => {
                pointerAt.current = performance.now();
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
          ref={viewportRef}
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
