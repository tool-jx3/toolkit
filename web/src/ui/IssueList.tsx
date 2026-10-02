/**
 * 檢查清單：錯誤（紅）／警告（琥珀）／資訊（灰）三級，設定一改就重算（例如匯出用途的檢查）。
 * 錯誤排最前面；上方可以另外放一則錯誤（匯出失敗）或提示（已複製、已無可再降的項目）。
 * 清單本身是 role="status"（polite），內容改變時螢幕閱讀器會念出來。
 */
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface IssueItem {
  level: IssueLevel;
  message: ReactNode;
  /** React key（預設用索引） */
  id?: string;
}

export interface IssueListProps {
  items: readonly IssueItem[];
  /** 清單上方的一則訊息（例如匯出失敗、已複製） */
  notice?: { tone: 'error' | 'info' | 'success'; message: ReactNode } | null;
  /** 沒有任何問題時顯示的文字（不給就什麼都不顯示） */
  empty?: ReactNode;
  'aria-label'?: string;
  className?: string;
}

export const ISSUE_LEVEL_LABELS: Record<IssueLevel, string> = {
  error: '錯誤',
  warning: '警告',
  info: '資訊',
};

const ORDER: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };

const STYLE: Record<IssueLevel, { row: string; icon: ReactNode }> = {
  error: { row: 'bg-danger-soft text-danger', icon: <CircleAlert /> },
  warning: { row: 'bg-warning-soft text-warning', icon: <TriangleAlert /> },
  info: { row: 'bg-surface-2 text-muted', icon: <Info /> },
};

export function IssueList({
  items,
  notice,
  empty,
  className,
  'aria-label': ariaLabel = '檢查結果',
}: IssueListProps) {
  const sorted = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => ORDER[a.it.level] - ORDER[b.it.level] || a.i - b.i);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          data-tone={notice.tone}
          className={cn(
            'm-0 rounded-md px-3 py-1.5 text-sm',
            notice.tone === 'error'
              ? 'bg-danger-soft text-danger'
              : notice.tone === 'success'
                ? 'bg-success-soft text-success'
                : 'bg-accent-soft text-fg',
          )}
        >
          {notice.message}
        </p>
      ) : null}
      <ul role="status" aria-label={ariaLabel} className="m-0 flex list-none flex-col gap-1 p-0">
        {sorted.length === 0 && empty ? <li className="text-xs text-muted">{empty}</li> : null}
        {sorted.map(({ it, i }) => (
          <li
            key={it.id ?? i}
            data-level={it.level}
            className={cn(
              'flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm',
              STYLE[it.level].row,
            )}
          >
            <span aria-hidden className="mt-0.5 inline-flex shrink-0 [&_svg]:size-4">
              {STYLE[it.level].icon}
            </span>
            <span className="sr-only">{ISSUE_LEVEL_LABELS[it.level]}：</span>
            <span className="min-w-0 flex-1">{it.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
