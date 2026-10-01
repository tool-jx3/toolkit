/** 鍵盤按鍵的外觀 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-sm border border-border-strong bg-surface-2 px-1.5 py-0.5 text-xs text-fg shadow-1',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
