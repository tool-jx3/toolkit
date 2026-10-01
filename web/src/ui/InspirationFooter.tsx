/**
 * 頁尾：只放「靈感來源：<名稱>」連結（CLAUDE.md 第 5 條）。原創工具不給 inspiration 時不顯示；
 * 出處不明、沒有網址時只顯示名稱（不加連結）。
 */
import type { Inspiration } from '@/registry';
import { cn } from './cn';

export function InspirationFooter({
  inspiration,
  className,
}: {
  inspiration?: Inspiration | null;
  className?: string;
}) {
  if (!inspiration) return null;
  return (
    <footer
      className={cn('border-t border-border px-4 py-3 text-center text-xs text-muted', className)}
    >
      靈感來源：
      {inspiration.url ? (
        <a href={inspiration.url} target="_blank" rel="noopener noreferrer">
          {inspiration.name}
        </a>
      ) : (
        <span>{inspiration.name}</span>
      )}
    </footer>
  );
}
