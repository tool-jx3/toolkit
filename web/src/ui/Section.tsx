/**
 * 可收合的區塊（Radix Collapsible）。設定面板的第二層。
 * persistKey 有給時，展開狀態會記在 localStorage。
 */
import { ChevronRight } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { cn } from './cn';

export interface SectionProps {
  title: ReactNode;
  children: ReactNode;
  /** 標題右側的按鈕等（不會觸發收合） */
  actions?: ReactNode;
  /** 標題下方的一行說明 */
  description?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 記住展開狀態用的鍵名（同一工具內唯一） */
  persistKey?: string;
  /** 不能收合（一直展開） */
  fixed?: boolean;
  className?: string;
}

function readPersisted(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const v = localStorage.getItem(`trpg-toolkit:section:${key}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function Section({
  title,
  children,
  actions,
  description,
  defaultOpen = true,
  open,
  onOpenChange,
  persistKey,
  fixed,
  className,
}: SectionProps) {
  const [inner, setInner] = useState(() => readPersisted(persistKey, defaultOpen));
  const isOpen = fixed ? true : (open ?? inner);
  const setOpen = (v: boolean) => {
    if (fixed) return;
    setInner(v);
    if (persistKey) {
      try {
        localStorage.setItem(`trpg-toolkit:section:${persistKey}`, v ? '1' : '0');
      } catch {
        /* 無法存就算了 */
      }
    }
    onOpenChange?.(v);
  };
  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setOpen}
      className={cn('rounded-lg border border-border bg-surface', className)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {fixed ? (
          <h3 className="m-0 flex-1 text-sm font-semibold text-fg">{title}</h3>
        ) : (
          <Collapsible.Trigger className="group -mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-sm font-semibold text-fg hover:text-accent">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted transition-transform group-data-[state=open]:rotate-90"
            />
            <span className="truncate">{title}</span>
          </Collapsible.Trigger>
        )}
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <Collapsible.Content className="flex flex-col gap-3 px-3 pb-3 data-[state=closed]:hidden">
        {description ? <p className="m-0 -mt-1 text-xs text-muted">{description}</p> : null}
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
