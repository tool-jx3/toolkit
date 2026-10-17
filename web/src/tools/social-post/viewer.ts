/**
 * HTML 檔（規格 F89～F96、3.8、D6）：每個畫面先畫成圖片（data URL 內嵌），可以點的地方疊透明的按鈕；
 * 一段很小的檢視程式負責換畫面、輪播、打開／關閉留言面板與限時動態、限時動態的進度條。不連任何外部資源。
 * 這個檔只組 HTML 文字（純函式，可以在 Node 測試）；畫圖在 viewerBuild.ts。
 */
import { escapeHtml, escapeHtmlAttr } from '@/core/html';

export interface VImg {
  src: string;
  /** 畫面單位的寬高（顯示時依螢幕寬度縮放） */
  w: number;
  h: number;
}

export interface VRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 疊在圖上的透明按鈕（attr 例：data-go="s-post-0"） */
export interface VSpot {
  rect: VRect;
  attr: string;
  label: string;
}

export interface VLayer {
  img: VImg;
  spots?: VSpot[];
  sticky?: 'top' | 'bottom';
  /**
   * 輪播：照片框＋膠囊＋圓點那一段，每張照片一張圖；hit＝可以點的照片框（同 rect 的座標；不給時整段）。
   * 原作只有照片可以點（左半上一張、右半下一張），照片下面的圓點列、舊式的按鈕列不換照片（F91）。
   */
  car?: {
    rect: VRect;
    hit?: VRect;
    slides: VImg[];
    index: number;
    prev: string;
    next: string;
  };
}

export interface VScreen {
  id: string;
  hidden: boolean;
  layers: VLayer[];
  /** 只有面板的留言（整頁、清單撐開） */
  plain?: { head: VImg; list: VImg; foot: VImg | null; background: string };
}

export interface VComments {
  id: string;
  opened: boolean;
  head: VImg;
  list: VImg;
  foot: VImg | null;
  background: string;
  closeLabel: string;
}

export interface VStory {
  id: string;
  opened: boolean;
  closable: boolean;
  auto: boolean;
  img: VImg;
  bar: VRect | null;
  close: VRect | null;
  closeLabel: string;
}

export interface ViewerDoc {
  title: string;
  theme: 'light' | 'dark';
  screens: VScreen[];
  comments: VComments[];
  stories: VStory[];
}

const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`;

function box(r: VRect, img: VImg): string {
  return `left:${pct(r.x, img.w)};top:${pct(r.y, img.h)};width:${pct(r.width, img.w)};height:${pct(r.height, img.h)}`;
}

const image = (img: VImg, extra = '') =>
  `<img src="${img.src}" width="${Math.round(img.w)}" height="${Math.round(img.h)}" alt=""${extra}>`;

function spotHtml(s: VSpot, img: VImg): string {
  return `<button type="button" class="v-spot" ${s.attr} style="${box(s.rect, img)}" aria-label="${escapeHtmlAttr(s.label)}"></button>`;
}

/** 輪播的左右兩半（可以點的照片框，以輪播那一段為 100%） */
function carSpots(c: NonNullable<VLayer['car']>): string {
  const hit = c.hit ?? c.rect;
  const top = pct(hit.y - c.rect.y, c.rect.height);
  const height = pct(hit.height, c.rect.height);
  const half = (dir: -1 | 1, label: string) =>
    `<button type="button" class="v-spot v-half" data-car="${dir}" style="left:${dir < 0 ? '0' : '50%'};width:50%;top:${top};height:${height}" aria-label="${escapeHtmlAttr(label)}"></button>`;
  return half(-1, c.prev) + half(1, c.next);
}

function layerHtml(l: VLayer): string {
  const cls = `v-layer${l.sticky ? ` v-sticky-${l.sticky}` : ''}`;
  const car = l.car
    ? `<div class="v-car" style="${box(l.car.rect, l.img)}">${l.car.slides
        .map((s, i) => image(s, i === l.car?.index ? '' : ' hidden'))
        .join('')}${carSpots(l.car)}</div>`
    : '';
  return `<div class="${cls}">${image(l.img)}${car}${(l.spots ?? []).map((s) => spotHtml(s, l.img)).join('')}</div>`;
}

function screenHtml(s: VScreen): string {
  const hidden = s.hidden ? ' hidden' : '';
  if (s.plain)
    return `<section class="v-scr" id="${s.id}"${hidden}><div class="v-plain" style="background:${s.plain.background}">${image(s.plain.head)}<div class="v-list">${image(s.plain.list)}</div>${s.plain.foot ? image(s.plain.foot) : ''}</div></section>`;
  return `<section class="v-scr" id="${s.id}"${hidden}>${s.layers.map(layerHtml).join('')}</section>`;
}

function commentsHtml(c: VComments): string {
  return `<div class="v-ov" id="${c.id}" data-closable${c.opened ? '' : ' hidden'}><div class="v-dim" data-close></div><div class="v-sheet" style="background:${c.background}"><div class="v-head">${image(c.head)}<button type="button" class="v-spot" data-close style="left:0;top:0;width:100%;height:40%" aria-label="${escapeHtmlAttr(c.closeLabel)}"></button></div><div class="v-list">${image(c.list)}</div>${c.foot ? image(c.foot) : ''}</div></div>`;
}

function storyHtml(s: VStory): string {
  const attrs = `${s.closable ? ' data-closable' : ''}${s.auto ? ' data-auto' : ''}${s.opened ? '' : ' hidden'}`;
  const bar = s.bar
    ? `<div class="v-bar" data-w="${pct(s.bar.width, s.img.w)}" style="left:${pct(s.bar.x, s.img.w)};top:${pct(s.bar.y, s.img.h)};height:${pct(s.bar.height, s.img.h)};width:0"></div>`
    : '';
  const close =
    s.closable && s.close
      ? `<button type="button" class="v-spot" data-close style="${box(s.close, s.img)}" aria-label="${escapeHtmlAttr(s.closeLabel)}"></button>`
      : '';
  return `<div class="v-ov v-st" id="${s.id}"${attrs}><div class="v-story">${image(s.img)}${bar}${close}</div></div>`;
}

const CSS = `*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;min-height:100dvh;display:flex;justify-content:center;align-items:flex-start;background:#fff}
body.v-dark{background:#000}
body.v-lock{overflow:hidden}
.v-scr{width:100%;max-width:470px}
.v-scr[hidden],.v-ov[hidden]{display:none}
img{display:block;width:100%;height:auto}
img[hidden]{display:none}
.v-layer{position:relative}
.v-sticky-top{position:sticky;top:0;z-index:3}
.v-sticky-bottom{position:sticky;bottom:0;z-index:3}
.v-spot{position:absolute;display:block;margin:0;padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.v-spot:focus-visible{outline:2px solid #3f63e0;outline-offset:-2px}
.v-car{position:absolute;overflow:hidden}
.v-car img{position:absolute;inset:0;height:100%}
.v-ov{position:fixed;inset:0;z-index:20}
.v-dim{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.v-sheet{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:470px;height:78%;display:flex;flex-direction:column;border-radius:16px 16px 0 0;overflow:hidden}
.v-sheet .v-head{position:relative;flex:none}
.v-list{flex:1;min-height:0;overflow-y:auto}
.v-plain{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.v-st{background:#000;display:flex;align-items:center;justify-content:center}
.v-story{position:relative;width:min(100vw,56.25vh);width:min(100vw,56.25dvh)}
.v-bar{position:absolute;background:#fff;border-radius:2px}`;

/** 檢視程式（不依賴任何東西，以 toString() 直接嵌進 HTML；進度條跑滿的寬度在 data-w） */
export function viewerRuntime(): void {
  const all = (q: string) =>
    Array.prototype.slice.call(document.querySelectorAll(q)) as HTMLElement[];
  let timer: number | undefined;
  function show(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    all('.v-scr').forEach((x) => {
      x.hidden = x !== el;
    });
    window.scrollTo(0, 0);
  }
  function closeAll() {
    all('.v-ov[data-closable]').forEach((o) => {
      o.hidden = true;
    });
    document.body.classList.remove('v-lock');
    clearTimeout(timer);
  }
  function open(id: string) {
    const el = document.getElementById(id);
    if (!el) return null;
    el.hidden = false;
    document.body.classList.add('v-lock');
    return el;
  }
  function play(el: HTMLElement) {
    const b = el.querySelector('.v-bar') as HTMLElement | null;
    if (!b) return;
    b.style.transition = 'none';
    b.style.width = '0';
    void b.offsetWidth;
    b.style.transition = 'width 5s linear';
    b.style.width = b.getAttribute('data-w') || '';
    clearTimeout(timer);
    timer = window.setTimeout(closeAll, 5000);
  }
  function slide(car: HTMLElement, dir: number) {
    const imgs = car.querySelectorAll('img');
    const n = imgs.length;
    let cur = 0;
    for (let i = 0; i < n; i++) if (!imgs[i].hidden) cur = i;
    const nx = Math.max(0, Math.min(n - 1, cur + dir));
    for (let j = 0; j < n; j++) imgs[j].hidden = j !== nx;
  }
  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest(
      '[data-car],[data-close],[data-back],[data-go],[data-open],[data-story]',
    ) as HTMLElement | null;
    if (!t) return;
    if (t.hasAttribute('data-car'))
      slide(t.parentElement as HTMLElement, Number(t.getAttribute('data-car')));
    else if (t.hasAttribute('data-close')) closeAll();
    else if (t.hasAttribute('data-back')) show('s-home');
    else if (t.getAttribute('data-go')) show(t.getAttribute('data-go') as string);
    else if (t.getAttribute('data-open')) open(`ov-c-${t.getAttribute('data-open')}`);
    else if (t.getAttribute('data-story')) {
      const el = open(`ov-s-${t.getAttribute('data-story')}`);
      if (el?.hasAttribute('data-auto')) play(el);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

/** 組出整份 HTML */
export function viewerHtml(doc: ViewerDoc): string {
  const body = [
    ...doc.screens.map(screenHtml),
    ...doc.comments.map(commentsHtml),
    ...doc.stories.map(storyHtml),
  ].join('\n');
  return `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(doc.title)}</title>
<style>
${CSS}
</style>
</head>
<body class="v-${doc.theme}">
${body}
<script>
(${viewerRuntime.toString()})();
</script>
</body>
</html>
`;
}
