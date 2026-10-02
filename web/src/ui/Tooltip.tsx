/**
 * 滑鼠停留／鍵盤聚焦時的提示（Radix Tooltip）。需要 UiProvider（ToolShell 已包好）。
 * 提示不接收滑鼠事件：密集的清單裡提示會蓋住相鄰的按鈕，點擊要穿過提示落到按鈕上
 * （滑鼠移到提示上時仍照 Radix 的緩衝區規則保持顯示）。
 */
import { Tooltip as T } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          data-tk-tooltip=""
          side={side}
          sideOffset={6}
          className="pointer-events-none z-50 max-w-64 rounded-sm bg-fg px-2 py-1 text-xs text-bg shadow-2 data-[state=closed]:hidden"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
