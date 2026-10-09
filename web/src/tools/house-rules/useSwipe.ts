/**
 * 手機（觸控）的滑動手勢（規格 F33）：一列往右滑超過 60 px 切換放不放進表，自己加的規則往左滑超過 60 px 刪除。
 * - 只認觸控；從欄位、按鈕上開始的不算。
 * - 先往上下移動超過 10 px（而且比左右多）就當作捲動頁面，不再處理。
 * - 左右移動 12 px 以上才開始滑；列跟著手指移動（最多 ±140 px；內建規則往左最多 24 px）。
 * - 滑動中 `data-swipe` 是 "toggle"／"remove"（列的底色提示放開後會發生什麼）。
 */
import { type PointerEvent, useRef } from 'react';

export const SWIPE_START = 12;
export const SWIPE_COMMIT = 60;
export const SWIPE_MAX = 140;
export const SWIPE_RESIST = 24;

interface Drag {
  el: HTMLElement;
  id: number;
  x: number;
  y: number;
  dx: number;
  active: boolean;
}

export function useSwipe({
  onRight,
  onLeft,
}: {
  onRight: () => void;
  /** 沒給時往左只能滑一點點（內建規則不能刪） */
  onLeft?: () => void;
}) {
  const drag = useRef<Drag | null>(null);
  const reset = (el: HTMLElement) => {
    el.style.transform = '';
    el.style.transition = '';
    delete el.dataset.swipe;
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, button, select, a, [role="spinbutton"]')) return;
      drag.current = {
        el: e.currentTarget,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dx: 0,
        active: false,
      };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          drag.current = null;
          return;
        }
        if (Math.abs(dx) < SWIPE_START) return;
        d.active = true;
        d.el.style.transition = 'none';
      }
      d.dx =
        dx < 0 && !onLeft
          ? Math.max(dx, -SWIPE_RESIST)
          : Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
      d.el.style.transform = `translateX(${d.dx}px)`;
      const action = d.dx > SWIPE_COMMIT ? 'toggle' : d.dx < -SWIPE_COMMIT ? 'remove' : '';
      if (action) d.el.dataset.swipe = action;
      else delete d.el.dataset.swipe;
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      reset(d.el);
      if (d.dx > SWIPE_COMMIT) onRight();
      else if (d.dx < -SWIPE_COMMIT) onLeft?.();
    },
    onPointerCancel: () => {
      const d = drag.current;
      drag.current = null;
      if (d) reset(d.el);
    },
  };
}
