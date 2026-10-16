/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 拖曳與磁鐵的快速路徑（原作的 fastDragFrame）：
 * - 拖曳角色或磁鐵跑著時，位置改在目前分頁的一份工作副本上，不每一格都改專案（改專案＝整張 SVG 重畫）。
 * - 畫面：動到的角色用 transform 平移（相對於上一次整張重畫時的位置），只重畫端點動到的線；
 *   一格裡動到的線超過 48 組時整層關係線一次重畫（磁鐵）。其他線的避讓弧度等放開（磁鐵停下）時整張重畫才更新。
 * - 跳線模式、出血範圍變了、拖曳時一次推動超過 40 位：整張重畫（照原作）。
 * - 拖曳（磁鐵關著）時，動到的線搬到底下另一張 SVG（連同背景）：重畫線時只要重新點陣化那一層，
 *   不用連其他的線、角色一起重畫（大張的圖每格省很多）；拖曳中這些線畫在其他線下面，放開整張重畫就恢復。
 * - 結束（放開、磁鐵停下）時位置一次寫回專案；中途有別的修改時，先把位置放回專案再改（store.updateProject）。
 * - 第二批：陣營框每一格整層重畫（照原作；拖曳時它在底層，只重新點陣化底層）；群體關係線每一格重畫；
 *   標籤網的虛線與圓點、收合的聚合線放開才更新（原作也一樣）。磁鐵跑著時標籤網開著或有收合＝每一格整張重畫（照原作）。
 *   標籤節點的位置（分頁設定 labelPos）也在工作副本裡，和角色的位置一起寫回。
 */
import { edgeLayerSvg } from '../engine/chart';
import { buildObstacles, type EdgeCtx, edgePairs, edgeSvg } from '../engine/edges';
import { bleedPad, type SheetCtx, sheetCtx } from '../engine/geom';
import { aliveGrels, grelEdgesSvg, labelInfo, zonesActive, zonesSvg } from '../engine/labels';
import type { ImageHref } from '../engine/nodes';
import type { Project, Sheet } from '../model/types';
import { activeSheet, projectNow, setBeforeUpdate, useProject } from '../state/store';

type Pt = { x: number; y: number };
type PosMap = Map<number, Pt>;

/** 拖曳時一格推動超過這麼多位就整張重畫（原作 fastDragFrame 的 40） */
export const DRAG_CAP = 40;
/** 一格裡動到的線組超過這個數就整層重畫（原作的 48） */
const LAYER_REBUILD = 48;

const posOf = (s: Sheet): PosMap => new Map(s.chars.map((c) => [c.id, { x: c.x, y: c.y }]));

/* ---------- 工作副本 ---------- */

interface Live {
  sheetId: number;
  sheet: Sheet;
  /** 誰在用（'drag'、'sim'）；都放掉才寫回 */
  holders: Set<string>;
  /** 專案裡的位置（上一次看到的）：專案裡的位置變了＝別的動作移動了角色，以專案的為準 */
  known: PosMap;
  /** 專案裡的標籤節點位置（上一次看到的，JSON） */
  knownLbl: string;
}
let live: Live | null = null;

/** 工作副本的 ctx（帶專案的標籤） */
export const liveCtx = (s: Sheet): SheetCtx => sheetCtx(s, projectNow().labels);

/** 目前分頁正在用的工作副本（沒有時 null） */
export function liveSheet(): Sheet | null {
  if (!live) return null;
  return live.sheetId === activeSheet().id ? live.sheet : null;
}

export function beginLive(holder: string): Sheet {
  const s = activeSheet();
  if (live && live.sheetId !== s.id) live = null;
  if (!live)
    live = {
      sheetId: s.id,
      sheet: structuredClone(s),
      holders: new Set(),
      known: posOf(s),
      knownLbl: JSON.stringify(s.settings.labelPos),
    };
  live.holders.add(holder);
  return live.sheet;
}

/** 放掉；最後一個放掉時把位置寫回專案、整張重畫 */
export function endLive(holder: string): void {
  if (!live?.holders.delete(holder) || live.holders.size) return;
  const L = live;
  live = null;
  writeBack(L);
  requestFull();
}

function copyPositions(target: Sheet, from: Sheet) {
  const m = new Map(from.chars.map((c) => [c.id, c]));
  for (const c of target.chars) {
    const w = m.get(c.id);
    if (w && (w.x !== c.x || w.y !== c.y)) {
      c.x = w.x;
      c.y = w.y;
    }
  }
  /* 標籤節點的位置（磁鐵、拖曳標籤） */
  if (JSON.stringify(target.settings.labelPos) !== JSON.stringify(from.settings.labelPos))
    target.settings.labelPos = structuredClone(from.settings.labelPos);
}

function writeBack(L: Live): void {
  useProject.getState().update((p) => {
    const s = p.sheets.find((x) => x.id === L.sheetId);
    if (s) copyPositions(s, L.sheet);
  });
}

/* 別的動作改專案之前：先把畫面上的位置放回去 */
setBeforeUpdate(
  (p) => {
    const L = live;
    if (!L) return;
    const s = p.sheets.find((x) => x.id === L.sheetId);
    if (s) copyPositions(s, L.sheet);
  },
  () => live !== null,
);

/* 專案改了（新增角色、改設定…）：工作副本跟上；專案裡位置變了的角色以專案為準 */
useProject.subscribe((st, prev) => {
  const L = live;
  if (!L || st.data === prev.data) return;
  const p: Project = st.data;
  const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
  if (!s || s.id !== L.sheetId) {
    /* 換了分頁、開了別的專案：工作副本作廢（畫面上的位置已經在改之前放回專案） */
    live = null;
    return;
  }
  const next = structuredClone(s);
  const old = new Map(L.sheet.chars.map((c) => [c.id, c]));
  for (const c of next.chars) {
    const k = L.known.get(c.id);
    const w = old.get(c.id);
    if (w && k && k.x === c.x && k.y === c.y) {
      c.x = w.x;
      c.y = w.y;
    }
  }
  /* 標籤節點的位置：專案裡的沒變（不是排列清掉、復原）＝用工作副本的 */
  const lbl = JSON.stringify(s.settings.labelPos);
  if (lbl === L.knownLbl) next.settings.labelPos = L.sheet.settings.labelPos;
  L.sheet = next;
  L.known = posOf(s);
  L.knownLbl = lbl;
});

/* ---------- 畫面 ---------- */

interface Dom {
  svg: SVGSVGElement;
  sheetId: number;
  /** 整張重畫時的位置（transform 的基準） */
  base: PosMap;
  /** 上一格畫出來的位置 */
  shown: PosMap;
  bleed: number;
  nodes: Map<number, Element> | null;
  edges: Map<number, Element> | null;
  labels: Map<number, Element> | null;
  /** 拖曳時動到的線所在的底層 SVG 的關係線層 */
  under: Element | null;
}
let dom: Dom | null = null;
let fullPending = false;

export interface LiveHooks {
  href: ImageHref;
  /** 重畫的線沒有聚焦的 class：重新套上 */
  refocus: () => void;
}
let hooks: LiveHooks | null = null;
export function bindLive(h: LiveHooks | null): void {
  hooks = h;
  if (!h) dom = null;
}

/* 整張重畫的請求（編輯畫面訂閱這個計數） */
let epoch = 0;
const listeners = new Set<() => void>();
export function subscribeLive(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const liveEpoch = (): number => epoch;
/** 整張重畫（標籤節點、收合節點的拖曳每一格都要；原作也是） */
export function liveRefresh(): void {
  requestFull();
}
function requestFull(): void {
  fullPending = true;
  epoch++;
  for (const fn of listeners) fn();
}

/* 小地圖：最多每 120 ms 跟一次 */
let tick = 0;
let tickAt = 0;
const tickListeners = new Set<() => void>();
export function subscribeLiveTick(fn: () => void): () => void {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}
export const liveTick = (): number => tick;
function bumpTick(): void {
  const now = performance.now();
  if (now - tickAt < 120) return;
  tickAt = now;
  tick++;
  for (const fn of tickListeners) fn();
}

/** 編輯畫面整張重畫之後（新的 SVG 元素）：記下基準位置 */
export function liveRebase(svg: SVGSVGElement, sheetId: number, pos: PosMap, bleed: number): void {
  dom = {
    svg,
    sheetId,
    base: pos,
    shown: new Map([...pos].map(([id, p]) => [id, { x: p.x, y: p.y }])),
    bleed,
    nodes: null,
    edges: null,
    labels: null,
    under: null,
  };
  fullPending = false;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 拖曳用的底層：同樣大小的 SVG 放在畫面那張的下面，背景（底色、背景圖、格線、畫布框）搬過去，
 * 上面那張變成透明底；之後動到的線一條條搬到底層的關係線層。
 */
function underLayer(D: Dom): Element | null {
  if (D.under?.isConnected) return D.under;
  const base = D.svg;
  const host = base.parentElement;
  const content = base.querySelector(':scope > .canvas-content');
  const edges = content?.querySelector(':scope > .layer-edges');
  if (!host || !content || !edges) return null;
  const u = document.createElementNS(SVG_NS, 'svg');
  for (const a of ['viewBox', 'width', 'height', 'font-family', 'style'])
    if (base.hasAttribute(a)) u.setAttribute(a, base.getAttribute(a) ?? '');
  u.setAttribute('class', `${base.getAttribute('class') ?? ''} rc-live-under`);
  u.setAttribute('aria-hidden', 'true');
  u.style.position = 'absolute';
  u.style.left = '0';
  u.style.top = '0';
  u.style.pointerEvents = 'none';
  /* 自己一層（合成層）：重畫線時只重新點陣化這一層 */
  u.style.willChange = 'transform';
  /* 最外面的底色與出血框（<defs> 之前的） */
  for (const el of [...base.children]) {
    if (el.tagName.toLowerCase() === 'defs') break;
    u.appendChild(el);
  }
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'canvas-content');
  g.setAttribute('transform', content.getAttribute('transform') ?? '');
  /* 畫布裡關係線之前的：背景、背景圖、畫布框、輔助線 */
  for (const el of [...content.children]) {
    if (el === edges) break;
    g.appendChild(el);
  }
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'layer-edges');
  if (edges.hasAttribute('opacity'))
    layer.setAttribute('opacity', edges.getAttribute('opacity') ?? '');
  g.appendChild(layer);
  u.appendChild(g);
  /* 上面那張要定位，才會畫在絕對定位的底層上面 */
  base.style.position = 'relative';
  host.insertBefore(u, base);
  D.under = layer;
  return layer;
}

/** 整張重畫時要用的位置（拖曳中、磁鐵跑著時是工作副本的） */
export function displaySheet(s: Sheet): Sheet {
  return live && live.sheetId === s.id ? live.sheet : s;
}

/** 陣營框：整層重畫（拖曳時在底層）；本來沒有這一層＝整張重畫（回傳 false） */
function liveZones(D: Dom, ctx: SheetCtx): boolean {
  const on = zonesActive(ctx);
  const host = D.svg.parentElement;
  const el = host?.querySelector('.layer-zones') ?? null;
  if (!on) return !el;
  const html = zonesSvg(ctx, true, '');
  if (!el) return !html;
  el.innerHTML = html;
  return true;
}

/** 群體關係線：整組重畫（數量少，直接換掉） */
function liveGrels(D: Dom, ctx: SheetCtx): boolean {
  const el = D.svg.querySelector('.layer-edges > .grel-layer');
  if (!aliveGrels(ctx).length) return !el;
  const html = grelEdgesSvg(ctx);
  if (!el) return !html;
  el.outerHTML = html;
  return true;
}

/** 新的 defs（自我關係縮小頭貼的 clipPath）蓋掉同 id 的舊的 */
function upsertDefs(svg: SVGSVGElement, defs: string[]): void {
  if (!defs.length) return;
  const holder = svg.querySelector('defs');
  if (!holder) return;
  for (const d of defs) {
    for (const m of d.matchAll(/\bid="([^"]+)"/g)) {
      const old = svg.querySelector(`[id="${CSS.escape(m[1])}"]`);
      old?.remove();
    }
    holder.insertAdjacentHTML('beforeend', d);
  }
}

function replaceWith(el: Element, html: string): Element | null {
  el.insertAdjacentHTML('beforebegin', html);
  const fresh = el.previousElementSibling;
  el.remove();
  return fresh;
}

let raf = 0;
/** 拖曳：下一格畫（同一格裡多次移動只畫一次） */
export function scheduleLiveFrame(): void {
  if (raf || typeof requestAnimationFrame === 'undefined') return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    liveFrame(DRAG_CAP);
  });
}

/** 把工作副本的位置畫到畫面上（cap＝一格最多幾位，超過就整張重畫；磁鐵不限） */
export function liveFrame(cap: number): void {
  const L = live;
  const D = dom;
  if (!L || !D || !hooks || fullPending) return;
  if (D.sheetId !== L.sheetId || !D.svg.isConnected) {
    requestFull();
    return;
  }
  const s = L.sheet;
  const ctx = liveCtx(s);
  const sim = cap === Number.POSITIVE_INFINITY;
  if (
    ctx.s.bridgeMode ||
    bleedPad(ctx) !== D.bleed ||
    s.chars.length !== D.base.size ||
    /* 磁鐵：標籤網會動、收合的節點與聚合線不在快速路徑（照原作） */
    (sim && (ctx.s.showLabelNodes || labelInfo(ctx).colHidden.size > 0))
  ) {
    requestFull();
    return;
  }
  const moved = new Set<number>();
  for (const c of s.chars) {
    const p = D.shown.get(c.id);
    if (!p) {
      requestFull();
      return;
    }
    if (p.x !== c.x || p.y !== c.y) moved.add(c.id);
  }
  if (!moved.size) return;
  if (moved.size > cap) {
    requestFull();
    return;
  }
  bumpTick();
  if (!D.nodes) {
    D.nodes = new Map();
    for (const g of D.svg.querySelectorAll('.layer-nodes .node[data-id]'))
      D.nodes.set(Number(g.getAttribute('data-id')), g);
  }
  for (const c of s.chars) {
    if (!moved.has(c.id)) continue;
    const p = D.shown.get(c.id) as Pt;
    p.x = c.x;
    p.y = c.y;
    const b = D.base.get(c.id) as Pt;
    D.nodes.get(c.id)?.setAttribute('transform', `translate(${c.x - b.x},${c.y - b.y})`);
  }
  if (!liveZones(D, ctx) || !liveGrels(D, ctx)) {
    requestFull();
    return;
  }
  const pairs = edgePairs(ctx).filter(({ list }) =>
    list.some((r) => moved.has(r.from) || moved.has(r.to)),
  );
  if (!pairs.length) return;
  const ectx: EdgeCtx = {
    ctx,
    bgColor: ctx.pal.bg,
    panelColor: ctx.pal.panel,
    bridge: false,
    geo: [],
    lblOut: [],
    grps: new Map(),
    obs: buildObstacles(ctx),
    href: hooks.href,
    idPrefix: '',
    defs: [],
  };
  const layer = D.svg.querySelector(':scope > .canvas-content > .layer-edges');
  if (!layer) {
    requestFull();
    return;
  }
  /* 拖曳（磁鐵關著）：動到的線畫在底層 */
  const dragOnly = cap === DRAG_CAP && L.holders.size === 1 && L.holders.has('drag');
  const under = dragOnly ? underLayer(D) : null;
  if (D.under && !under) {
    requestFull();
    return;
  }
  /* 一格動到很多組線（磁鐵）：整層一次重畫；拖曳時一條條搬到底層 */
  if (pairs.length > LAYER_REBUILD && !under) {
    layer.innerHTML = edgeLayerSvg(ctx, ectx, true);
    D.edges = null;
    D.labels = null;
    upsertDefs(D.svg, ectx.defs);
    hooks.refocus();
    return;
  }
  if (!D.edges || !D.labels) {
    D.edges = new Map();
    D.labels = new Map();
    for (const root of D.under ? [layer, D.under] : [layer])
      for (const g of root.querySelectorAll('.edge[data-relid]'))
        (g.classList.contains('edge-lbl') ? D.labels : D.edges).set(
          Number(g.getAttribute('data-relid')),
          g,
        );
  }
  const edges = D.edges;
  const labels = D.labels;
  const target = under ?? layer;
  for (const { list, loId } of pairs) {
    list.forEach((r, i) => {
      ectx.lblOut = [];
      const html = edgeSvg(ectx, r, i, list.length, loId);
      const el = edges.get(r.id);
      if (!html || !el?.isConnected) return;
      if (under && el.parentNode !== under) {
        under.appendChild(el);
        const ol = labels.get(r.id);
        if (ol?.isConnected) under.appendChild(ol);
      }
      const fresh = replaceWith(el, html);
      if (fresh) edges.set(r.id, fresh);
      const lbl = ectx.lblOut.join('');
      const old = labels.get(r.id);
      if (old?.isConnected) {
        if (lbl) {
          const fl = replaceWith(old, lbl);
          if (fl) labels.set(r.id, fl);
        } else {
          old.remove();
          labels.delete(r.id);
        }
      } else if (lbl) {
        target.insertAdjacentHTML('beforeend', lbl);
        if (target.lastElementChild) labels.set(r.id, target.lastElementChild);
      }
    });
  }
  upsertDefs(D.svg, ectx.defs);
  hooks.refocus();
}
