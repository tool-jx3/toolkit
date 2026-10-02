/**
 * 這個工具的小元件：「下一步」按鈕、分頁標籤、附示意圖的版型按鈕。
 */
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, cn } from '@/ui';
import { setTab, type TabId } from './store';
import { S } from './strings';

/** 分頁上的標籤（編號＋名稱） */
export function TabLabel({ id }: { id: TabId }) {
  const t = S.tabs[id];
  return (
    <span className="inline-flex items-baseline gap-1.5" title={t.sub} data-cs-tab={id}>
      <span className="text-xs text-muted tabular-nums">{t.n}</span>
      <span>{t.label}</span>
    </span>
  );
}

/** 「下一步：…」（規格 F06）：切到下一個分頁、焦點移到分頁列；窄畫面時把設定欄捲到最上面 */
export function NextStep({ to }: { to: TabId }) {
  return (
    <Button
      variant="primary"
      className="self-stretch"
      onClick={() => {
        setTab(to);
        requestAnimationFrame(() => {
          const tab = document.querySelector<HTMLElement>(`[data-cs-tab="${to}"]`);
          const trigger = tab?.closest<HTMLElement>('[role="tab"]');
          trigger?.focus({ preventScroll: true });
          if (window.matchMedia('(max-width: 1023px)').matches)
            (trigger ?? tab)
              ?.closest<HTMLElement>('[role="tablist"]')
              ?.scrollIntoView({ block: 'start' });
        });
      }}
    >
      {S.next(S.tabs[to].label)}
      <ArrowRight aria-hidden className="size-4" />
    </Button>
  );
}

/** 附示意圖的按鈕（主格版型） */
export function DiagramButton({
  pressed,
  onClick,
  diagram,
  title,
  sub,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  diagram: ReactNode;
  title: string;
  sub: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 rounded-md border p-2 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50',
        pressed
          ? 'border-accent bg-accent-soft'
          : 'border-border bg-surface-2 hover:border-border-strong',
      )}
    >
      <span className="block w-full text-muted [&_svg]:h-auto [&_svg]:w-full">{diagram}</span>
      <strong className="text-xs font-semibold text-fg">{title}</strong>
      <small className="text-xs text-muted">{sub}</small>
    </button>
  );
}

export const PortraitDiagram = (
  <svg viewBox="0 0 120 76" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="34" y="4" width="52" height="43" rx="4" fill="currentColor" fillOpacity=".25" />
    <rect x="34" y="53" width="52" height="18" rx="2" />
    <path d="M47 53v18M60 53v18M73 53v18" />
  </svg>
);

export const LandscapeDiagram = (
  <svg viewBox="0 0 120 76" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="12" width="65" height="52" rx="4" fill="currentColor" fillOpacity=".25" />
    <rect x="82" y="12" width="28" height="52" rx="2" />
    <path d="M96 12v52M82 25h28M82 38h28M82 51h28" />
  </svg>
);
