/**
 * 畫面上的小工具（需要 DOM）：文字區裡某個位置的縱向座標、把卡片捲到清單中央、卡片內文欄的高度。
 */
import { bodyHeight } from './logic';

const MIRROR_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'wordSpacing',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'wordBreak',
] as const;

/**
 * 文字區裡第 index 個字（UTF-16 碼元）所在那一行的上緣，以文字區的捲動座標計（含上內距）。
 * 用一個排版相同的隱藏 div 量（文字區會自動換行，不能只數換行字元）。
 */
export function textareaLineTop(ta: HTMLTextAreaElement, index: number): number {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  const st = mirror.style;
  for (const p of MIRROR_PROPS) st[p] = cs[p];
  st.position = 'absolute';
  st.visibility = 'hidden';
  st.top = '0';
  st.left = '-99999px';
  st.boxSizing = 'border-box';
  st.width = `${ta.clientWidth}px`;
  st.border = '0';
  st.whiteSpace = 'pre-wrap';
  st.overflowWrap = 'break-word';
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = ta.value.slice(index, index + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

/** 選取文字區的一段，並捲動讓那一行約在文字區中央（F08） */
export function selectInTextarea(ta: HTMLTextAreaElement, start: number, end: number): void {
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, end, 'forward');
  const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const top = textareaLineTop(ta, start);
  ta.scrollTop = Math.max(0, top + lineHeight / 2 - ta.clientHeight / 2);
  /* 窄畫面：文字區不在畫面上時把它捲進來 */
  const r = ta.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) ta.scrollIntoView({ block: 'center' });
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 只捲清單自己：把 el 捲到清單中央（center）或剛好看得到（nearest）。
 * 清單本身不在畫面上時（窄畫面），再把頁面捲最少的距離讓卡片露出來。
 */
export function revealInList(
  list: HTMLElement,
  el: HTMLElement,
  block: 'center' | 'nearest',
  smooth: boolean,
): void {
  const lr = list.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const offset = er.top - lr.top + list.scrollTop;
  let top = list.scrollTop;
  if (block === 'center') top = offset - (list.clientHeight - er.height) / 2;
  else if (er.top < lr.top) top = offset;
  else if (er.bottom > lr.bottom) top = offset + er.height - list.clientHeight;
  const max = list.scrollHeight - list.clientHeight;
  top = Math.max(0, Math.min(max, top));
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  if (Math.abs(top - list.scrollTop) > 1) list.scrollTo({ top, behavior });
  /*
   * 卡片最後的位置（畫面座標，只算清單露出的部分）不在畫面上時才捲頁面：
   * 寬畫面的清單整個在畫面裡，不會動到頁面；窄畫面的清單比畫面長，才需要把卡片捲進來。
   */
  const cardTop = Math.max(er.top - (top - list.scrollTop), lr.top);
  const cardBottom = Math.min(cardTop + Math.min(er.height, 160), lr.bottom);
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const topLimit = Math.max(0, header);
  if (cardTop < topLimit) window.scrollBy({ top: cardTop - topLimit - 8, behavior });
  else if (cardBottom > window.innerHeight)
    window.scrollBy({ top: cardBottom - window.innerHeight + 8, behavior });
}

/** 卡片內文欄的高度（F21）：4～6 行自動長高，使用者拉得更高時維持 */
export function fitBodyTextarea(ta: HTMLTextAreaElement): void {
  const cs = getComputedStyle(ta);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const currentHeight = ta.offsetHeight;
  const metrics = {
    lineHeight: px(cs.lineHeight) || px(cs.fontSize) * 1.5,
    paddingY: px(cs.paddingTop) + px(cs.paddingBottom),
    borderY: px(cs.borderTopWidth) + px(cs.borderBottomWidth),
    currentHeight,
    scrollHeight: 0,
  };
  const preliminary = bodyHeight({ ...metrics, scrollHeight: 0 });
  if (preliminary.height === null) {
    ta.style.overflowY = 'auto';
    return;
  }
  ta.style.height = 'auto';
  const r = bodyHeight({ ...metrics, scrollHeight: ta.scrollHeight });
  ta.style.height = `${r.height}px`;
  ta.style.overflowY = r.scroll ? 'auto' : 'hidden';
}
