/**
 * 元件需要的 Provider（提示、通知、確認對話框）。ToolShell 已經包好；單獨使用元件時才需要自己包。
 */
import { Tooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { ConfirmProvider } from './Dialog';
import { ToastProvider } from './Toast';

export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={200}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </Tooltip.Provider>
  );
}
