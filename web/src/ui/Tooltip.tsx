/** 滑鼠停留／鍵盤聚焦時的提示（Radix Tooltip）。需要 UiProvider（ToolShell 已包好）。 */
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
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-sm bg-fg px-2 py-1 text-xs text-bg shadow-2 data-[state=closed]:hidden"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
