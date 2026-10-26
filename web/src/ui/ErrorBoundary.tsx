/**
 * 錯誤邊界：裡面的元件丟出錯誤（包括 `React.lazy` 的區塊下載失敗）時，只有這一塊換成說明與「重試」，頁面其他部分照常可用。
 *
 * - 預設的說明框：標題（預設「這一塊沒辦法顯示」）、說明（`description`）、「重試」按鈕；`fallback` 可以整個換掉。
 * - 「重試」：先呼叫 `onRetry`（例如換一個新的 `lazy()`，重新下載區塊），再重新畫裡面的內容。
 * - `resetKey` 改變時自動重來（例如換了分頁、換了資料）。
 * - 錯誤用 `console.warn` 記下（`onError` 可以另外處理）；不會把英文的錯誤訊息顯示給使用者。
 *
 * ```tsx
 * <ErrorBoundary description="3D 預覽載入失敗，可能是網路斷了。" onRetry={() => setLazy(() => lazy(load))}>
 *   <Suspense fallback={…}><WalkPreview /></Suspense>
 * </ErrorBoundary>
 * ```
 */
import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出錯時的內容；不給時用預設的說明框 */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** 預設說明框的標題（預設「這一塊沒辦法顯示」） */
  title?: ReactNode;
  /** 預設說明框的說明 */
  description?: ReactNode;
  /** 重試按鈕的文字（預設「重試」） */
  retryLabel?: string;
  /** 按「重試」時先做的事（例如重新建立 lazy 元件） */
  onRetry?: () => void;
  /** 出錯時另外處理（例如記錄） */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** 值改變時清掉錯誤、重新畫 */
  resetKey?: unknown;
  className?: string;
}

interface State {
  error: Error | null;
  key: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    if (!Object.is(props.resetKey, state.key)) return { key: props.resetKey, error: null };
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('ErrorBoundary：', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  retry = (): void => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.retry);
    return (
      <div
        role="alert"
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-muted',
          this.props.className,
        )}
        data-testid="error-boundary"
      >
        <TriangleAlert aria-hidden className="size-7 text-warning" />
        <p className="m-0 text-base font-semibold text-fg">
          {this.props.title ?? '這一塊沒辦法顯示'}
        </p>
        {this.props.description ? (
          <p className="m-0 max-w-[36em]">{this.props.description}</p>
        ) : null}
        <Button variant="primary" onClick={this.retry}>
          {this.props.retryLabel ?? '重試'}
        </Button>
      </div>
    );
  }
}
