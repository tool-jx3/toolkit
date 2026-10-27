/**
 * 給 ToolShell 外面（快捷鍵、拖曳結束、頁首按鈕）用的通知：ToolShell 裡的 NotifyBridge 把 useToast() 接過來。
 */
import { useEffect } from 'react';
import { type ToastOptions, useToast } from '@/ui';

let impl: ((options: ToastOptions) => void) | null = null;

export function notify(options: ToastOptions): void {
  impl?.({ duration: 2600, ...options });
}

export function NotifyBridge(): null {
  const toast = useToast();
  useEffect(() => {
    impl = toast;
    return () => {
      if (impl === toast) impl = null;
    };
  }, [toast]);
  return null;
}
