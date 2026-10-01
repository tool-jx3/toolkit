/**
 * 把清單裡的一列捲進看得見的地方，但**只捲清單自己**，不讓整頁跟著捲。
 *
 * `el.scrollIntoView()` 會連頁面一起捲（清單面板超出視窗時，整頁跟著往下跑）。這裡改成：
 * 1. 只調整最近的捲動容器（清單面板）的 scrollTop，讓這一列落在「容器露出在畫面上的範圍」裡
 *    （容器可見區與畫面的交集；畫面上緣扣掉黏在頂端的頁首）。
 * 2. 只有容器本身有一部分在畫面外、而且只捲容器不夠時（例如視窗很矮），才把頁面捲動最少的距離。
 *    容器整個在畫面外時（例如窄畫面清單在預覽下方）不捲頁面，只捲容器。
 */

/** 一個方向上的範圍（畫面座標，px） */
export interface RevealSpan {
  top: number;
  bottom: number;
}

export interface RevealInput {
  /** 要看到的那一列 */
  row: RevealSpan;
  /** 捲動容器的可見區（client 區域） */
  box: RevealSpan;
  /** 畫面（扣掉黏在頂端的頁首） */
  viewport: RevealSpan;
  /** 容器目前還能往上捲多少（＝scrollTop） */
  canUp: number;
  /** 容器目前還能往下捲多少（＝scrollHeight − clientHeight − scrollTop） */
  canDown: number;
}

export interface RevealResult {
  /** 容器的 scrollTop 要加多少（正數往下捲） */
  box: number;
  /** 頁面要捲多少（正數往下捲；0＝不動） */
  page: number;
}

/** 讓 span 進入 view 需要捲多少（span 比 view 高時對齊上緣）；已經在裡面時 0 */
function delta(span: RevealSpan, view: RevealSpan): number {
  if (span.top < view.top || span.bottom - span.top > view.bottom - view.top) {
    return span.top - view.top;
  }
  if (span.bottom > view.bottom) return span.bottom - view.bottom;
  return 0;
}

/** 純計算：容器與頁面各要捲多少（單元測試直接測） */
export function revealDelta({ row, box, viewport, canUp, canDown }: RevealInput): RevealResult {
  const shown: RevealSpan = {
    top: Math.max(box.top, viewport.top),
    bottom: Math.min(box.bottom, viewport.bottom),
  };
  const onScreen = shown.bottom > shown.top;
  /* 容器有露出來：讓列落在露出的範圍；整個在畫面外：落在容器自己的可見區 */
  const want = delta(row, onScreen ? shown : box);
  const boxDelta = Math.max(-canUp, Math.min(canDown, want));
  if (!onScreen) return { box: boxDelta, page: 0 };
  const moved: RevealSpan = { top: row.top - boxDelta, bottom: row.bottom - boxDelta };
  return { box: boxDelta, page: delta(moved, viewport) };
}

/** 最近的可捲動祖先（overflow-y auto／scroll 而且內容比較高） */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/** 黏在畫面頂端的頁首（ToolShell 在寬畫面時的頁首）蓋住的高度 */
function stickyTopInset(): number {
  let inset = 0;
  for (const h of document.querySelectorAll<HTMLElement>('header')) {
    const pos = getComputedStyle(h).position;
    if (pos !== 'sticky' && pos !== 'fixed') continue;
    const r = h.getBoundingClientRect();
    if (r.top <= 0.5 && r.bottom > inset) inset = r.bottom;
  }
  return inset;
}

/**
 * 只捲 el 所在的清單（最近的捲動容器），把 el 捲進看得見的地方；必要時才把頁面捲最少的距離（見檔頭）。
 * 沒有捲動容器時（清單沒有超出面板），el 有一部分在畫面上才把頁面捲最少的距離；整個在畫面外時不動。
 */
export function revealInScroller(el: HTMLElement): void {
  if (typeof window === 'undefined') return;
  const r = el.getBoundingClientRect();
  const viewport: RevealSpan = { top: stickyTopInset(), bottom: window.innerHeight };
  const box = scrollParentOf(el);
  if (!box) {
    const partly = r.bottom > viewport.top && r.top < viewport.bottom;
    const page = partly ? delta({ top: r.top, bottom: r.bottom }, viewport) : 0;
    if (page) window.scrollBy({ top: page, behavior: 'instant' });
    return;
  }
  const b = box.getBoundingClientRect();
  const top = b.top + box.clientTop;
  const result = revealDelta({
    row: { top: r.top, bottom: r.bottom },
    box: { top, bottom: top + box.clientHeight },
    viewport,
    canUp: box.scrollTop,
    canDown: box.scrollHeight - box.clientHeight - box.scrollTop,
  });
  if (result.box) box.scrollTop += result.box;
  if (result.page) window.scrollBy({ top: result.page, behavior: 'instant' });
}
