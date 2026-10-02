/**
 * 處理中畫面（F12）：讀檔、匯出、改畫布尺寸、還原時蓋住整個畫面；標題與副標隨進度改寫，進度條顯示真正的進度，
 * 可以取消的工作（匯出）有「取消」按鈕（Esc 也算；第 5 節第 30 項）。
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Button } from '@/ui';
import { S } from './strings';

export interface BusyState {
  active: boolean;
  title: string;
  sub: string;
  /** 0～1；null＝不確定 */
  progress: number | null;
  onCancel: (() => void) | null;
}

export const useBusy = create<BusyState>(() => ({
  active: false,
  title: '',
  sub: '',
  progress: null,
  onCancel: null,
}));

export const busy = {
  start(title: string, sub = '', onCancel: (() => void) | null = null) {
    useBusy.setState({ active: true, title, sub, progress: null, onCancel });
  },
  update(patch: Partial<Omit<BusyState, 'active'>>) {
    useBusy.setState(patch);
  },
  end() {
    useBusy.setState({ active: false, onCancel: null, progress: null });
  },
};

export function BusyOverlay() {
  const s = useBusy();
  const titleId = useId();
  const subId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!s.active) return;
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        useBusy.getState().onCancel?.();
      } else if (e.key === 'Tab') {
        /* 處理中只能停在這個視窗裡 */
        e.preventDefault();
        box.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, [s.active]);
  if (!s.active) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      data-testid="busy"
    >
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        tabIndex={-1}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-fg shadow-2 outline-none"
      >
        <div className="flex items-center gap-2">
          <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-accent" />
          <h2 id={titleId} className="m-0 text-base font-semibold" data-testid="busy-title">
            {s.title}
          </h2>
        </div>
        <p id={subId} className="m-0 min-h-5 break-all text-sm text-muted" data-testid="busy-sub">
          {s.sub}
        </p>
        <div
          role="progressbar"
          aria-label={s.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.progress === null ? undefined : Math.round(s.progress * 100)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={
              s.progress === null
                ? 'h-full w-1/3 animate-pulse rounded-full bg-accent'
                : 'h-full rounded-full bg-accent transition-[width]'
            }
            style={s.progress === null ? undefined : { width: `${Math.round(s.progress * 100)}%` }}
          />
        </div>
        {s.onCancel ? (
          <div className="flex justify-end">
            <Button onClick={() => s.onCancel?.()}>{S.cancel}</Button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
