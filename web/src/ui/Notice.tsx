/**
 * 狀態訊息列：載入幾個檔案、處理進度、完成、錯誤…（頁面上固定位置的一行文字，會被螢幕閱讀器朗讀）。
 * 短暫通知用 Toast；需要一直看得到的狀態用 Notice。
 */
import { CheckCircle2, Info, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'progress';

const TONES: Record<NoticeTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-surface-2 text-fg', icon: <Info className="text-accent" /> },
  success: { box: 'bg-success-soft text-success', icon: <CheckCircle2 /> },
  warning: { box: 'bg-warning-soft text-warning', icon: <TriangleAlert /> },
  danger: { box: 'bg-danger-soft text-danger', icon: <XCircle /> },
  progress: {
    box: 'bg-accent-soft text-fg',
    icon: <Loader2 className="animate-spin text-accent" />,
  },
};

export interface NoticeProps {
  tone?: NoticeTone;
  children: ReactNode;
  /** 右側的按鈕等 */
  action?: ReactNode;
  className?: string;
}

/** 錯誤用 role="alert"（立即朗讀），其他用 role="status" */
export function Notice({ tone = 'info', children, action, className }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-sm', t.box, className)}
    >
      <span aria-hidden className="mt-0.5 inline-flex shrink-0 [&_svg]:size-4">
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
