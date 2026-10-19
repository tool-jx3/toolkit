/**
 * 點預覽上的字 → 設定欄切到「內容」、捲到對應的欄位並聚焦，欄位閃一下（同原作點選單類欄位時的做法）。
 * 欄位用 data 屬性找：`data-field`（欄位）、`data-item`（收據品項的品名）、`data-caption`（票上的欄位名稱）。
 */
import { setAdvancedMode } from '@/ui';
import { setPrefs, TOOL_ID } from './store';

export type FocusTarget =
  | { kind: 'field'; key: string }
  | { kind: 'item'; id: string }
  | { kind: 'caption'; key: string };

const selectorOf = (t: FocusTarget): string =>
  t.kind === 'field'
    ? `[data-field="${CSS.escape(t.key)}"]`
    : t.kind === 'item'
      ? `[data-item="${CSS.escape(t.id)}"]`
      : `[data-caption="${CSS.escape(t.key)}"]`;

function flash(el: HTMLElement): void {
  el.dataset.flash = '';
  el.animate?.(
    [
      { boxShadow: '0 0 0 3px var(--accent)' },
      { boxShadow: '0 0 0 3px var(--accent)', offset: 0.6 },
      { boxShadow: '0 0 0 0 transparent' },
    ],
    { duration: 900, easing: 'ease-out' },
  );
  setTimeout(() => {
    delete el.dataset.flash;
  }, 900);
}

/** 找到欄位、捲到中央、聚焦、閃一下（等分頁切好再找，最多等 10 格畫面） */
export function focusTarget(t: FocusTarget): void {
  setPrefs({ tab: 'content' });
  if (t.kind === 'caption') setAdvancedMode(TOOL_ID, true);
  let tries = 0;
  const find = () => {
    const el = document.querySelector<HTMLElement>(selectorOf(t));
    if (!el || el.offsetParent === null) {
      if (tries++ < 10) requestAnimationFrame(find);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement) el.select();
    flash(el);
  };
  requestAnimationFrame(find);
}
