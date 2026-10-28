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

/**
 * 輪播（F91、F130）：照片框裡是可以左右滑的一排照片（手指滑動、滑鼠點左右兩半、焦點在上面時按 ←／→），
 * 「目前／總數」膠囊與圓點各是每張一張的小圖，滑到哪一張就顯示哪一張。只有照片框可以滑、可以點（同原作）。
 * 座標都是 layer 圖的座標。
 */
export interface VCar {
  rect: VRect;
  /** 每張照片（只有照片，不含膠囊） */
  photos: VImg[];
  /** 膠囊：共同的範圍；每張一張透明的圖（膠囊靠右） */
  pill: { rect: VRect; imgs: VImg[] } | null;
  /** 圓點那一條（新式：照片下的圓點列；舊式：按鈕列）；每張一張 */
  dots: { rect: VRect; imgs: VImg[] } | null;
  index: number;
  label: string;
}

export interface VLayer {
  img: VImg;
  spots?: VSpot[];
  sticky?: 'top' | 'bottom';
  cars?: VCar[];
  /**
   * 橫向捲動（首頁動態的限時動態列，F128）：圖比畫面寬時，這一層可以左右捲動；view＝畫面的寬（畫面單位），
   * spots 的座標是整張圖的座標。
   */
  view?: number;
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
  /**
   * 進度條（auto 時圖上不畫，由檢視程式畫）：位置（限時動態的座標）、這則自己的段數與目前第幾段。
   * 一次接著看好幾則時改成一則一段（F126）。
   */
  bars: { rect: VRect; count: number; current: number; gap: number } | null;
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

function carHtml(c: VCar, img: VImg): string {
  const many = (list: VImg[], index: number) =>
    list.map((x, i) => image(x, i === index ? '' : ' hidden')).join('');
  const slides = c.photos.map((x) => `<div class="v-slide">${image(x)}</div>`).join('');
  return `<div class="v-cg"><div class="v-car" style="${box(c.rect, img)}"><div class="v-track" data-start="${c.index}" tabindex="0" role="group" aria-label="${escapeHtmlAttr(c.label)}">${slides}</div></div>${
    c.pill
      ? `<div class="v-pill" style="${box(c.pill.rect, img)}">${many(c.pill.imgs, c.index)}</div>`
      : ''
  }${c.dots ? `<div class="v-dots" style="${box(c.dots.rect, img)}">${many(c.dots.imgs, c.index)}</div>` : ''}</div>`;
}

function layerHtml(l: VLayer): string {
  const cls = `v-layer${l.sticky ? ` v-sticky-${l.sticky}` : ''}`;
  const inner = `${image(l.img)}${(l.cars ?? []).map((c) => carHtml(c, l.img)).join('')}${(l.spots ?? []).map((s) => spotHtml(s, l.img)).join('')}`;
  if (l.view && l.img.w > l.view)
    return `<div class="${cls} v-hscroll"><div class="v-hin" style="width:${((l.img.w / l.view) * 100).toFixed(4)}%">${inner}</div></div>`;
  return `<div class="${cls}">${inner}</div>`;
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
  const bar = s.bars
    ? `<div class="v-bars" data-n="${s.bars.count}" data-c="${s.bars.current}" data-gap="${((s.bars.gap / s.bars.rect.width) * 100).toFixed(4)}" style="${box(s.bars.rect, s.img)}"></div>`
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
.v-spot:focus-visible,.v-track:focus-visible{outline:2px solid #3f63e0;outline-offset:-2px}
.v-hscroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.v-hscroll::-webkit-scrollbar,.v-track::-webkit-scrollbar{display:none}
.v-hin{position:relative}
.v-cg{position:absolute;inset:0;pointer-events:none}
.v-car{position:absolute;pointer-events:auto}
.v-track{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;cursor:pointer}
.v-slide{position:relative;flex:0 0 100%;height:100%;scroll-snap-align:start;scroll-snap-stop:always}
.v-slide img{height:100%}
.v-pill,.v-dots{position:absolute}
.v-pill img,.v-dots img{position:absolute;inset:0;height:100%}
.v-ov{position:fixed;inset:0;z-index:20}
.v-dim{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.v-sheet{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:470px;height:78%;display:flex;flex-direction:column;border-radius:16px 16px 0 0;overflow:hidden}
.v-sheet .v-head{position:relative;flex:none}
.v-list{flex:1;min-height:0;overflow-y:auto}
.v-plain{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.v-st{background:#000;display:flex;align-items:center;justify-content:center}
.v-story{position:relative;width:min(100vw,56.25vh);width:min(100vw,56.25dvh);cursor:pointer}
.v-bars{position:absolute}
.v-bars i{position:absolute;top:0;bottom:0;background:rgba(255,255,255,.35);border-radius:9px;overflow:hidden}
.v-bars b{display:block;height:100%;width:0;background:#fff}`;

/** 檢視程式（不依賴任何東西，以 toString() 直接嵌進 HTML） */
export function viewerRuntime(): void {
  const all = (q: string, root: ParentNode = document) =>
    Array.prototype.slice.call(root.querySelectorAll(q)) as HTMLElement[];
  let timer: number | undefined;
  /* 換畫面：記著從哪裡來（‹ 回到上一個畫面） */
  const stack: string[] = [];
  const current = () => all('.v-scr').filter((x) => !x.hidden)[0]?.id ?? '';
  function show(id: string, back?: boolean) {
    const el = document.getElementById(id);
    if (!el) return;
    const c = current();
    if (!back && c && c !== id) stack.push(c);
    all('.v-scr').forEach((x) => {
      x.hidden = x !== el;
    });
    window.scrollTo(0, 0);
    carInit();
    all('[data-end]', el).forEach((b) => {
      b.scrollTop = b.scrollHeight;
    });
  }
  function closeAll() {
    all('.v-ov[data-closable]').forEach((o) => {
      o.hidden = true;
    });
    document.body.classList.remove('v-lock');
    clearTimeout(timer);
    seq = [];
  }
  function open(id: string) {
    const el = document.getElementById(id);
    if (!el) return null;
    el.hidden = false;
    document.body.classList.add('v-lock');
    return el;
  }
  /* 進度條：n 段、目前第 cur 段（前面的滿、目前那段 5 秒跑滿、後面的空） */
  function bars(el: HTMLElement, n: number, cur: number, run: boolean) {
    const g = Number(el.getAttribute('data-gap')) || 0;
    const w = (100 - g * (n - 1)) / n;
    let html = '';
    for (let i = 0; i < n; i++)
      html += `<i style="left:${i * (w + g)}%;width:${w}%"><b style="width:${i < cur - 1 ? 100 : 0}%"${i === cur - 1 ? ' data-cur' : ''}></b></i>`;
    el.innerHTML = html;
    const b = el.querySelector('[data-cur]') as HTMLElement | null;
    if (b && run) {
      void b.offsetWidth;
      b.style.transition = 'width 5s linear';
      b.style.width = '100%';
    }
  }
  /* 接著看：同一個人的限時動態一則接一則，5 秒換下一則；看完關掉 */
  let seq: string[] = [];
  let pos = 0;
  function showStory() {
    clearTimeout(timer);
    all('.v-st').forEach((o) => {
      o.hidden = true;
    });
    const el = open(`ov-s-${seq[pos]}`);
    if (!el) {
      closeAll();
      return;
    }
    const auto = el.hasAttribute('data-auto');
    const b = el.querySelector('.v-bars') as HTMLElement | null;
    if (b) {
      if (seq.length > 1) bars(b, seq.length, pos + 1, auto);
      else
        bars(b, Number(b.getAttribute('data-n')) || 1, Number(b.getAttribute('data-c')) || 1, auto);
    }
    if (auto) timer = window.setTimeout(() => step(1), 5000);
  }
  function step(d: number) {
    pos += d;
    if (pos >= seq.length) {
      closeAll();
      return;
    }
    if (pos < 0) pos = 0;
    showStory();
  }
  /* 輪播：照片可以左右滑；滑鼠點左右兩半、←／→ 換一張 */
  const carIndex = (t: HTMLElement) => Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
  function carSync(t: HTMLElement) {
    const i = carIndex(t);
    const g = t.closest('.v-cg');
    if (!g) return;
    all('.v-pill,.v-dots', g).forEach((box) => {
      const imgs = box.querySelectorAll('img');
      for (let k = 0; k < imgs.length; k++) imgs[k].hidden = k !== Math.min(i, imgs.length - 1);
    });
  }
  function carInit() {
    all('.v-track').forEach((t) => {
      const tt = t as HTMLElement & { _v?: boolean; _s?: boolean };
      if (!tt._s && t.clientWidth) {
        tt._s = true;
        t.scrollLeft = (Number(t.getAttribute('data-start')) || 0) * t.clientWidth;
      }
      if (!tt._v) {
        tt._v = true;
        t.addEventListener('scroll', () => carSync(t), { passive: true });
      }
    });
  }
  function carGo(t: HTMLElement, d: number) {
    t.scrollTo({ left: (carIndex(t) + d) * t.clientWidth, behavior: 'smooth' });
  }
  window.addEventListener('load', () => {
    carInit();
    all('[data-end]').forEach((b) => {
      b.scrollTop = b.scrollHeight;
    });
  });
  let pointer = 'mouse';
  document.addEventListener(
    'pointerdown',
    (e) => {
      pointer = e.pointerType;
    },
    true,
  );
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const st = target.closest('.v-st') as HTMLElement | null;
    if (st && !target.closest('[data-close]')) {
      if (seq.length) {
        const r = st.getBoundingClientRect();
        step(e.clientX < r.left + r.width / 3 ? -1 : 1);
      }
      return;
    }
    const track = target.closest('.v-track') as HTMLElement | null;
    if (track) {
      if (pointer !== 'mouse') return;
      const r = track.getBoundingClientRect();
      carGo(track, e.clientX > r.left + r.width / 2 ? 1 : -1);
      return;
    }
    const t = target.closest(
      '[data-close],[data-back],[data-go],[data-open],[data-story]',
    ) as HTMLElement | null;
    if (!t) return;
    if (t.hasAttribute('data-close')) closeAll();
    else if (t.hasAttribute('data-back')) {
      const first = all('.v-scr')[0];
      show(stack.pop() || first?.id || '', true);
    } else if (t.getAttribute('data-go')) show(t.getAttribute('data-go') as string);
    else if (t.getAttribute('data-open')) open(`ov-c-${t.getAttribute('data-open')}`);
    else if (t.getAttribute('data-story')) {
      seq = (t.getAttribute('data-story') as string).split(',');
      pos = 0;
      showStory();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const d = e.key === 'ArrowRight' ? 1 : -1;
    const open1 = seq.length ? document.getElementById(`ov-s-${seq[pos]}`) : null;
    if (open1 && !open1.hidden) {
      e.preventDefault();
      step(d);
      return;
    }
    const t = (e.target as Element | null)?.closest?.('.v-track') as HTMLElement | null;
    if (t) {
      e.preventDefault();
      carGo(t, d);
    }
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
