/**
 * 設定欄最上面的一行：目前選取的東西＋右邊的「×」（取消選取、關閉設定欄；同 Esc。
 * 2026-10 第三批，上游 v3.10.1；規格 F314）。
 */
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/ui';
import { clearAll } from '../ops';

export function PanelHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1">
      <p className="m-0 min-w-0 flex-1 text-sm text-muted" aria-live="polite">
        {children}
      </p>
      <IconButton
        size="sm"
        variant="ghost"
        label="關閉（取消選取，Esc）"
        icon={<X />}
        data-testid="se-panel-close"
        onClick={clearAll}
      />
    </div>
  );
}
