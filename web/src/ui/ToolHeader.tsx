/**
 * 工具頁首：← TRPG Toolkit（回首頁）、工具名、群組分頁、右側動作（說明、快捷鍵、深淺色＋工具自己的按鈕）。
 */
import { ArrowLeft, CircleHelp, Keyboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';
import { GroupTabs } from './GroupTabs';
import { ThemeToggle } from './ThemeToggle';

export interface ToolHeaderProps {
  toolId: string;
  title: string;
  /** 工具自己的按鈕（復原／重做、專案選單…） */
  actions?: ReactNode;
  onHelp?: () => void;
  onShortcuts?: () => void;
  /** 首頁網址（預設 ../../，工具頁都在根目錄下兩層） */
  homeHref?: string;
  className?: string;
}

export function ToolHeader({
  toolId,
  title,
  actions,
  onHelp,
  onShortcuts,
  homeHref = '../../',
  className,
}: ToolHeaderProps) {
  return (
    <header className={cn('z-30 border-b border-border bg-surface lg:sticky lg:top-0', className)}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 lg:px-4">
        <a
          href={homeHref}
          title="回到首頁"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm text-muted no-underline hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          TRPG Toolkit
        </a>
        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
        <h1 className="m-0 min-w-0 shrink-0 text-lg font-semibold text-fg">{title}</h1>
        {/* 寬畫面：分頁列吃掉標題與按鈕之間剩下的寬度，放不下就橫向捲動（不折行，頁首高度不隨工具數量改變） */}
        <GroupTabs
          toolId={toolId}
          className="order-last w-full lg:order-none lg:w-auto lg:min-w-0 lg:flex-1"
        />
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {actions}
          {onHelp ? <IconButton label="說明" icon={<CircleHelp />} onClick={onHelp} /> : null}
          {onShortcuts ? (
            <IconButton label="快捷鍵（?）" icon={<Keyboard />} onClick={onShortcuts} />
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
