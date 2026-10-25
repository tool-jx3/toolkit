/**
 * 紙面的 HTML（編輯畫面的預覽、列印、PDF、閱覽 HTML、頁面一覽共用同一套，外觀一致）。規格 3.2、3.6。
 */
import {
  gapPull,
  isOnlyPopup,
  isSecBlock,
  KIDS_FRAMED,
  KIDS_PARENT,
  popIsBlocks,
  spKey,
} from '../model/blocks';
import { POPUP_DEFAULT_LABEL, popupByLabel, popupLabel } from '../model/doc';
import { edgeGeom, flowColor, round2 as fnum } from '../model/flow';
import { natPt, ptStyle } from '../model/fontSize';
import {
  IMAGE_FRAME_W,
  imageFrameOf,
  imageOffset,
  imagePos,
  imageShadowOf,
  imageWidthMm,
  PAPER_H,
} from '../model/image';
import { pimgBox, pimgFlowBox, pimgShapes, pimgsOn, type ShapeBox } from '../model/pageImg';
import { MARGIN_PATTERNS, pageColor } from '../model/paper';
import { blockLabel, boxColor, procStyleOf } from '../model/proc';
import { hasRich } from '../model/rich';
import { sceneLinks } from '../model/scene';
import { cellList, tblCols, tblRows } from '../model/table';
import {
  blockComments,
  blockMarks,
  escapeHtml as esc,
  hasRuby,
  rubyHtml,
  rubyHtmlWithComments,
  rubyPlain,
  safeColor,
} from '../model/text';
import { tocEntries, tocEntriesFor, tocOf } from '../model/toc';
import type {
  Block,
  Doc,
  Flow,
  FlowNode,
  ImageFx,
  PageImg,
  PageSetting,
  Popup,
  Table,
} from '../model/types';
import { hoOf, varView, wrapVarsHtml } from '../model/vars';
import { npcHtml } from './npc';
import { richBlockHtml, richTextHtml } from './rich';

export interface RenderCtx {
  doc: Doc;
  /** 編輯畫面（彈出視窗按鈕可以按、註解可以點） */
  edit: boolean;
  /** 段落 id → 頁碼（1 起算；找不到時 null） */
  pageOf: (id: string) => number | null;
  /** 總頁數 */
  total: number;
  /** 匯出、列印、PDF：可以收進目錄的段落與目錄加錨點 id="b<段落 id>" */
  anchors?: boolean;
  /** 匯出：表格與 NPC 卡右上的複製按鈕、情報區塊與手冊按一下複製（F259） */
  copyButtons?: boolean;
  /** 列印、PDF、匯出：「→ 附錄」與「↩ 回到」的連結、場景轉換連到標題（F269、F270） */
  links?: PrintLinks;
}

/**
 * 列印、PDF、匯出用的連結（2026-10，上游 v3.15.0；3.17.4）：
 * 彈出視窗的按鈕後面放「→ 附錄「名稱」」（id＝pr<彈出視窗 id>-<第幾個>，連到附錄的 apx<彈出視窗 id>），
 * 附錄的每一節放「↩ 回到 P.n」（連回每個按鈕；附錄裡的按鈕不算）。頁面依序畫，附錄最後畫。
 */
export interface PrintLinks {
  /** 有附錄的彈出視窗：id → 名稱 */
  pops: Map<string, string>;
  /** 場景轉換 id → 連到的標題 id */
  scenes: Map<string, string>;
  /** 正在畫的頁（0 起算；附錄、不是頁面時 -1） */
  page: number;
  /** 頁碼的寫法（P.3） */
  pageLabel: (i: number) => string;
  /** 每個彈出視窗已經放了幾個連結 */
  count: Map<string, number>;
  /** 每個彈出視窗：連回去的地方（連結 id、頁碼） */
  refs: Map<string, { id: string; page: string }[]>;
}

/**
 * 列印、PDF、匯出用的連結的狀態。inRange：輸出範圍內的段落（場景轉換只連到範圍內的標題）。
 * 頁碼：顯示頁碼時用紙面的頁碼（第一頁的頁碼起算），不顯示時從 1 算。
 */
export function newPrintLinks(
  doc: Doc,
  all: readonly Block[],
  inRange: (id: string) => boolean,
): PrintLinks {
  const from = Number.isFinite(+doc.foot?.from) ? +doc.foot.from : 1;
  const num = doc.foot?.num !== false;
  return {
    pops: new Map(popupsWithContent(all).map((b) => [b.id, popupLabel(b)])),
    scenes: sceneLinks(doc, inRange),
    page: -1,
    pageLabel: (i) => `P.${num ? i + from : i + 1}`,
    count: new Map(),
    refs: new Map(),
  };
}

/** 彈出視窗按鈕後面的「→ 附錄「名稱」」（沒有附錄的彈出視窗沒有） */
function popLinkHtml(id: string, ctx: RenderCtx): string {
  const L = ctx.links;
  const label = L?.pops.get(id);
  if (!L || label == null) return '';
  const n = (L.count.get(id) ?? 0) + 1;
  L.count.set(id, n);
  const lid = `pr${id}-${n}`;
  if (L.page >= 0) {
    const list = L.refs.get(id) ?? [];
    list.push({ id: lid, page: L.pageLabel(L.page) });
    L.refs.set(id, list);
  }
  return `<a class="pop-plink" href="#apx${esc(id)}" id="${esc(lid)}">→ 附錄「${esc(label)}」</a>`;
}

/** 附錄一節的「↩ 回到 P.n」 */
function backLinksHtml(id: string, ctx: RenderCtx): string {
  const refs = ctx.links?.refs.get(id);
  if (!refs?.length) return '';
  return `<div class="ap-backs">${refs
    .map(
      (r) =>
        `<a class="ap-back" href="#${esc(r.id)}">↩ ${r.page ? `回到 ${esc(r.page)}` : '回到本文'}</a>`,
    )
    .join('')}</div>`;
}

/** 變數的位置包成顯示預設值的標記（F257；原稿沒有變數時原樣） */
const withVars = (html: string, doc: Pick<Doc, 'blocks' | 'vars'>): string =>
  wrapVarsHtml(html, varView(doc));

export interface Place {
  /** 所在頁的欄數 */
  cols: 1 | 2;
  /** 與前一段的間距重疊時往上拉的量（mm） */
  pull: number;
  /** 頁（或串列）的第一個段落 */
  top: boolean;
}

/* ---------- 彈出視窗 ---------- */

export function popRefHtml(name: string, ctx: RenderCtx): string {
  const n = String(name ?? '').trim();
  const t = popupByLabel(ctx.doc, n);
  if (!t)
    return `<button type="button" class="pop-btn pop-miss" data-popmake="${esc(n)}"><span class="pop-ic">▤ </span>${esc(n)}（按下即建立）</button>`;
  return popButton(t, ctx);
}

function popButton(b: Block, ctx: RenderCtx): string {
  const link = popLinkHtml(b.id, ctx);
  return `<button type="button" class="pop-btn${link ? ' has-plink' : ''}" data-popopen="${esc(b.id)}"><span class="pop-ic">▤ </span>${esc(popupLabel(b))}</button>${link}`;
}

/** 彈出視窗的內容（以段落保存的照紙面排，舊式的照巢狀書式） */
export function popupContentHtml(pop: Popup | undefined, ctx: RenderCtx): string {
  if (Array.isArray(pop?.blocks)) {
    const list = pop.blocks.filter((b) => b && b.type !== 'break' && b.type !== 'colbr');
    if (!list.length) return '<p class="pop-empty">（還沒有放入任何內容）</p>';
    return listHtml(list, ctx);
  }
  const out = richTextHtml(pop?.body ?? '', {
    pTag: 'pop-p',
    heads: true,
    popRef: (n) => popRefHtml(n, ctx),
  });
  return out ? withVars(out, ctx.doc) : '<p class="pop-empty">（還沒有寫任何內容）</p>';
}

/* ---------- 一串段落（彈出視窗的內容、儲存格；不分頁） ---------- */

export function listHtml(list: readonly Block[], ctx: RenderCtx): string {
  return listHtmlRaw(list, ctx, true);
}

/** wrap：變數包成標記（段落裡的段落由外面那段一起包） */
function listHtmlRaw(list: readonly Block[], ctx: RenderCtx, wrap: boolean): string {
  let prev: string | null = null;
  let first = true;
  let out = '';
  for (const b of list) {
    /* 上下間距依 spKey（特殊區塊依樣子；同原作） */
    const k = spKey(b) ?? b.type;
    const pull = gapPull(prev, k);
    prev = k;
    const place = { cols: 1 as const, pull, top: first };
    out += wrap ? blockHtml(b, ctx, place) : blockHtmlRaw(b, ctx, place);
    first = false;
  }
  return out;
}

/**
 * 段落裡的段落（第三批，同原作 kidsHTML）：放在外面那段的框裡（有框的書式、「■」開頭的描述文），
 * 其他往內縮 4 mm；外面那段指定了 pt 時，裡面的段落用本來的大小（不跟著外面的 pt）。
 */
export function kidsHtml(b: Block, ctx: RenderCtx, wrap = false): string {
  const l = Array.isArray(b.kids) ? b.kids : [];
  if (!l.length || !KIDS_PARENT.includes(b.type)) return '';
  const ind = KIDS_FRAMED.includes(b.type) || isSecBlock(b) ? '' : ' kids-ind';
  const fs = +(b.pt ?? 0) > 0 ? ` style="font-size:${+natPt(ctx.doc, b).toFixed(3)}pt"` : '';
  return `<div class="cellblk bx-kids${ind}"${fs}>${listHtmlRaw(l, ctx, wrap)}</div>`;
}

/* ---------- 表格 ---------- */

function cellHtml(t: Table, r: number, c: number, ctx: RenderCtx): string {
  const l = cellList(t, r, c);
  if (!l.length) return '';
  return `<div class="cellblk">${listHtml(l, ctx)}</div>`;
}

function tableGridHtml(t: Table, ctx: RenderCtx): string {
  let rows = '';
  for (let r = 0; r < tblRows(t); r++) {
    let tds = '';
    for (let c = 0; c < tblCols(t); c++) {
      const tag = (t.head && r === 0) || (t.rowhead && c === 0) ? 'th' : 'td';
      tds += `<${tag} data-cell="${r},${c}">${cellHtml(t, r, c, ctx)}</${tag}>`;
    }
    rows += `<tr>${tds}</tr>`;
  }
  return `<table class="tbl">${rows}</table>`;
}

const wrapCell = (t: Table, r: number, c: number, cls: string, ctx: RenderCtx) =>
  `<div class="cw w-${cls}" data-cell="${r},${c}"><div class="${cls}">${cellHtml(t, r, c, ctx)}</div></div>`;

function tableListHtml(t: Table, ctx: RenderCtx): string {
  const C = tblCols(t);
  let secs = '';
  for (let r = t.head ? 1 : 0; r < tblRows(t); r++) {
    const rest: string[] = [];
    for (let k = 2; k < C; k++) rest.push(wrapCell(t, r, k, 'tl-body', ctx));
    secs += `<div class="tl-sec"><div class="tl-h">${wrapCell(t, r, 0, 'tl-no', ctx)}<span class="tl-co">：</span>${C > 1 ? wrapCell(t, r, 1, 'tl-ttl', ctx) : ''}</div>${rest.join('')}</div>`;
  }
  return `<div class="tl-box">${secs || '<div class="tl-sec"></div>'}</div>`;
}

function tableCardHtml(t: Table, ctx: RenderCtx): string {
  const C = tblCols(t);
  const heads: string[] = [];
  if (t.head) for (let c = 0; c < C; c++) heads.push(cellHeadText(t, 0, c));
  let cards = '';
  for (let r = t.head ? 1 : 0; r < tblRows(t); r++) {
    const rest: string[] = [];
    for (let k = 1; k < C; k++) {
      const label = String(heads[k] ?? '').trim();
      rest.push(
        (C > 2 && label ? `<div class="cd-k">${esc(label)}</div>` : '') +
          wrapCell(t, r, k, 'cd-v', ctx),
      );
    }
    cards += `<div class="cd">${wrapCell(t, r, 0, 'cd-t', ctx)}<div class="cd-b">${rest.join('')}</div></div>`;
  }
  return `<div class="cd-wrap">${cards || '<div class="cd"></div>'}</div>`;
}

/** 一格讀成一個字串（標題框的欄名用） */
function cellHeadText(t: Table, r: number, c: number): string {
  return cellList(t, r, c)
    .filter(
      (x) =>
        ![
          'break',
          'colbr',
          'toc',
          'table',
          'npc',
          'image',
          'cover',
          'colophon',
          'flow',
          'popup',
        ].includes(x.type),
    )
    .map((x) => String(x.text ?? ''))
    .filter((x) => x !== '')
    .join('\n');
}

export function tableHtml(b: Block, ctx: RenderCtx): string {
  const t = b.tbl;
  if (!t) return '';
  const nm = String(t.name ?? '').trim();
  const cap = nm && t.capOn !== false ? `<div class="tbl-cap">${rubyHtml(t.name)}</div>` : '';
  const body =
    t.look === 'list'
      ? tableListHtml(t, ctx)
      : t.look === 'card'
        ? tableCardHtml(t, ctx)
        : tableGridHtml(t, ctx);
  return cap + body;
}

/* ---------- 目錄 ---------- */

export function tocHtml(b: Block | null, ctx: RenderCtx): string {
  const t = b ? tocOf(b) : { lb: '目　錄', pick: ['h1', 'h2', 'h3'], pn: true, dots: true };
  /* 範圍＝這一章時只收這一章的（2026-10，上游 v3.7.0） */
  const e = b
    ? tocEntriesFor(b, ctx.doc.blocks, ctx.pageOf)
    : tocEntries(ctx.doc.blocks, ctx.pageOf, t.pick);
  const head = String(t.lb ?? '').trim();
  return withVars(
    (head ? `<div class="toc-h">${esc(head)}</div>` : '') +
      `<div class="toc-list${t.dots ? '' : ' nodots'}">${e
        .map(
          (x) =>
            `<a class="toc-line toc-l${x.lv}" href="#b${esc(x.id)}"><span class="lb">${esc(rubyPlain(x.text))}</span><span class="dots${t.dots ? '' : ' plain'}"></span>${t.pn ? `<span class="pn">${x.page}</span>` : ''}</a>`,
        )
        .join('')}</div>`,
    ctx.doc,
  );
}

/* ---------- 流程圖 ---------- */

function flowShapeSvg(n: FlowNode): string {
  const c = flowColor(n);
  const st = ` fill="${c.fill}" stroke="${c.line}" stroke-width="0.4" vector-effect="non-scaling-stroke"`;
  const pts = (a: [number, number][]) => a.map((p) => `${fnum(p[0])},${fnum(p[1])}`).join(' ');
  if (n.kind === 'diamond')
    return `<polygon points="${pts([
      [n.x + n.w / 2, n.y],
      [n.x + n.w, n.y + n.h / 2],
      [n.x + n.w / 2, n.y + n.h],
      [n.x, n.y + n.h / 2],
    ])}"${st}/>`;
  if (n.kind === 'io') {
    const k = Math.min(n.w * 0.18, n.h * 0.7);
    return `<polygon points="${pts([
      [n.x + k, n.y],
      [n.x + n.w, n.y],
      [n.x + n.w - k, n.y + n.h],
      [n.x, n.y + n.h],
    ])}"${st}/>`;
  }
  const r = n.kind === 'term' ? Math.min(n.h / 2, n.w / 2) : n.kind === 'round' ? 2 : 0.8;
  return `<rect x="${fnum(n.x)}" y="${fnum(n.y)}" width="${fnum(n.w)}" height="${fnum(n.h)}" rx="${fnum(r)}" ry="${fnum(r)}"${st}/>`;
}

function flowSplitSvg(n: FlowNode): string {
  if (!n.t2) return '';
  const c = flowColor(n);
  const y = fnum(n.y + n.h / 2);
  let x1 = n.x;
  let x2 = n.x + n.w;
  if (n.kind === 'diamond') {
    x1 = n.x + n.w * 0.25;
    x2 = n.x + n.w * 0.75;
  }
  return `<line x1="${fnum(x1)}" y1="${y}" x2="${fnum(x2)}" y2="${y}" stroke="${c.line}" stroke-width="0.3" vector-effect="non-scaling-stroke"/>`;
}

export function flowEdgesSvg(f: Flow): string {
  const col = '#a8331f';
  return f.edges
    .map((e) => {
      const g = edgeGeom(f, e);
      if (!g) return '';
      let out =
        `<line x1="${fnum(g.p1[0])}" y1="${fnum(g.p1[1])}" x2="${fnum(g.end[0])}" y2="${fnum(g.end[1])}" stroke="${col}" stroke-width="0.4" vector-effect="non-scaling-stroke"/>` +
        `<polygon points="${[g.tip, g.w1, g.w2].map((p) => `${fnum(p[0])},${fnum(p[1])}`).join(' ')}" fill="${col}"/>`;
      if (String(e.lb ?? '').trim())
        out += `<text x="${fnum(g.mid[0])}" y="${fnum(g.mid[1] - 0.8)}" text-anchor="middle" class="fwe-t" font-size="2.6" fill="${col}">${esc(e.lb)}</text>`;
      return out;
    })
    .join('');
}

export function flowShapesSvg(f: Flow): string {
  return f.nodes.map((n) => flowShapeSvg(n) + flowSplitSvg(n)).join('');
}

/** 方框上的文字（HTML，疊在 SVG 上） */
export function flowTextsHtml(f: Flow, withIds = false): string {
  return f.nodes
    .map((n) => {
      const c = flowColor(n);
      return `<div class="fwn${n.t2 ? ' two' : ''} k-${n.kind}"${withIds ? ` data-fnode="${esc(n.id)}"` : ''} style="left:${fnum(n.x)}mm;top:${fnum(n.y)}mm;width:${fnum(n.w)}mm;height:${fnum(n.h)}mm;padding:${fnum(n.pad)}mm;--fwl:${c.line}"><div class="fwn-a">${rubyHtml(n.t)}</div>${n.t2 ? `<div class="fwn-b">${rubyHtml(n.t2)}</div>` : ''}</div>`;
    })
    .join('');
}

export function flowHtml(f: Flow | undefined, withIds = false): string {
  if (!f?.nodes.length)
    return '<div class="fw-empty">（流程圖還是空的。選取後按「開啟圖來繪製」）</div>';
  const svg = `<svg class="fwsvg" viewBox="0 0 ${fnum(f.w)} ${fnum(f.h)}" xmlns="http://www.w3.org/2000/svg">${flowEdgesSvg(f)}${flowShapesSvg(f)}</svg>`;
  return `<div class="fwc" style="width:${fnum(f.w)}mm;height:${fnum(f.h)}mm">${svg}${flowTextsHtml(f, withIds)}</div>`;
}

/* ---------- 圖片 ---------- */

/**
 * 圖片與說明。full：圖片寬＝外框寬（繞排、頁面圖片）；否則圖片寬＝設定的寬。
 * 知道長寬比時先用 aspect-ratio 留好高度（圖片解碼前也量得到；2026-10，上游 v3.15.1）。
 * 外框疊在圖片上（實際的元素 .imgfr-b，PDF 也畫得出來）；陰影是圖片的 drop-shadow（2026-10，上游 v3.16.0）。
 */
export function imageHtml(
  o: { img?: string | null; cap?: string; ar?: number } & ImageFx,
  wst: string,
): string {
  if (!o.img) return '<div class="t-imgph">（未設定圖片）</div>';
  const ar = +(o.ar ?? 0);
  const ast = ar > 0 ? `aspect-ratio:auto 1 / ${ar.toFixed(4)}` : '';
  const alt = esc(rubyPlain(o.cap ?? ''));
  const fr = imageFrameOf(o);
  const sh = imageShadowOf(o);
  const shc = sh ? ` class="sh-${sh}"` : '';
  const im = fr
    ? `<div class="imgfr" style="${wst}"><img src="${esc(o.img)}"${shc}${ast ? ` style="${ast}"` : ''} alt="${alt}"><span class="imgfr-b" aria-hidden="true" style="border:${IMAGE_FRAME_W[fr]} ${fr === 'double' ? 'double' : 'solid'} ${boxColor(o.frc ?? 'sumi').c}"></span></div>`
    : `<img src="${esc(o.img)}"${shc} style="${wst}${ast ? `;${ast}` : ''}" alt="${alt}">`;
  return im + (String(o.cap ?? '').trim() ? `<div class="t-imgcap">${rubyHtml(o.cap)}</div>` : '');
}

export function imageInnerHtml(b: Block, doc: Doc): string {
  const pos = imagePos(b);
  return imageHtml(
    b,
    pos === 'left' || pos === 'right'
      ? 'width:100%'
      : `width:${fnum(imageWidthMm(b, doc))}mm;max-width:100%`,
  );
}

/* ---------- 段落 ---------- */

/** 加錨點的段落：可以收進目錄的書式與目錄本身（場景轉換、副標題也有，目錄與「↑ 目錄」連得到；2026-10，上游 v3.7.0） */
const ANCHOR_TYPES = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'scene', 'toc']);

/** 特殊區塊的 class 與顏色（同原作 procClass、procStyle） */
export function procVars(b: Block): { cls: string; style: string } {
  const x = procStyleOf(b);
  const c = boxColor(x.col);
  const sp = spKey(b);
  return {
    cls:
      ` bx-l-${x.ln}` +
      (x.bar ? ' bx-bar' : '') +
      (x.bar && x.thin ? ' bx-thin' : '') +
      (x.bar && x.mid ? ' bx-mid' : '') +
      (x.fill ? ' bx-fill' : '') +
      (x.copy ? ' bx-copy' : '') +
      (x.xs ? ' bx-xs' : x.sm ? ' bx-sm' : '') +
      (x.ink ? ' bx-ink' : '') +
      (sp !== 'proc' ? ` sp-${sp}` : ''),
    style: `--bxc:${c.c};--bxl:${c.l};--bxf:${c.f};`,
  };
}

/** 段落內容（不含外框） */
export function blockInnerHtml(b: Block, ctx: RenderCtx): string {
  const popRef = (n: string) => popRefHtml(n, ctx);
  switch (b.type) {
    case 'npc':
      return b.npc ? npcHtml(b.npc) : '';
    case 'toc':
      return tocHtml(b, ctx);
    case 'image':
      return imageInnerHtml(b, ctx.doc);
    case 'table':
      return tableHtml(b, ctx);
    case 'popup':
      return popButton(b, ctx);
    case 'flow':
      return flowHtml(b.flow);
    case 'proc':
    case 'info': {
      const lb = blockLabel(b).trim();
      return (lb ? `<div class="blb">${esc(lb)}</div>` : '') + richBlockHtml(b, popRef);
    }
    case 'handout': {
      const h = hoOf(b);
      return `<div class="ho-h"><span class="ho-n">${esc(h.no)}</span>${h.ttl.trim() ? `<span class="ho-t">${esc(h.ttl)}</span>` : ''}</div>${richBlockHtml(b, popRef)}`;
    }
    case 'break':
    case 'colbr':
      return '';
    case 'hr': {
      const tx = String(b.text ?? '').trim();
      return tx
        ? `<span class="hrl"></span><span class="hrtx">${rubyHtmlWithComments(b)}</span><span class="hrl"></span>`
        : '';
    }
    default: {
      if ((b.type === 'desc' || b.type === 'note') && hasRich(b.text))
        return richBlockHtml(b, popRef);
      const spk =
        b.type === 'dialog' && String(b.sp ?? '').trim()
          ? `<span class="spk">${esc(b.sp)}</span>`
          : '';
      const mk = b.type === 'h3' ? '<span class="h3mk">◆ </span>' : '';
      const inner = spk + mk + rubyHtmlWithComments(b);
      /* 場景轉換連到標題（列印、PDF、匯出；F270） */
      const to = b.type === 'scene' ? ctx.links?.scenes.get(b.id) : undefined;
      return to ? `<a class="scene-link" href="#b${esc(to)}">${inner}</a>` : inner;
    }
  }
}

/** 段落（外框＋內容）。place：所在頁的欄數、與前一段的間距、是不是頁首 */
export function blockHtml(b: Block, ctx: RenderCtx, place: Place): string {
  if (b.type === 'break') return '';
  return withVars(blockHtmlRaw(b, ctx, place), ctx.doc);
}

/** 段落（變數還沒包成標記） */
function blockHtmlRaw(b: Block, ctx: RenderCtx, place: Place): string {
  if (b.type === 'break') return '';
  const pos = b.type === 'image' ? imagePos(b) : 'inline';
  const flc =
    b.type === 'image' && (pos === 'left' || pos === 'right')
      ? ` fl-${pos === 'left' ? 'l' : 'r'}`
      : '';
  const sp = spKey(b);
  const cls =
    `bp bp-${b.type}` +
    (sp && sp !== b.type ? ` sp-${sp}` : '') +
    (isSecBlock(b) ? ' sec' : '') +
    (b.cols === 1 && place.cols === 2 ? ' span' : '') +
    (place.top && b.type !== 'colbr' ? ' top' : '') +
    flc +
    (b.clr ? ' clr' : '') +
    (b.ind ? ` i${Math.min(4, b.ind)}` : '');
  let ost = '';
  if (flc) {
    const o = imageOffset(b, place.cols);
    const mt = o.dy - place.pull;
    ost = `width:${fnum(imageWidthMm(b, ctx.doc))}mm;`;
    if (mt) ost += `margin-top:${+mt.toFixed(3)}mm;`;
    if (o.dx) ost += `${pos === 'left' ? 'margin-left' : 'margin-right'}:${o.dx}mm;`;
    if (b.mt != null) ost += `padding-top:${b.mt}mm;`;
  } else {
    if (b.mt != null) ost += `padding-top:${b.mt}mm;`;
    if (place.pull) ost += `margin-top:-${place.pull}mm;`;
  }
  let inner = '';
  let icls = `b t-${b.type}`;
  let ist = '';
  if (b.mb != null) ist += `margin-bottom:${b.mb}mm;`;
  const col = safeColor(b.col);
  if (col) ist += `color:${col};`;
  /* 段落的文字大小（pt；F273） */
  ist += ptStyle(b);
  if (b.type === 'proc') {
    const v = procVars(b);
    icls += v.cls;
    ist = v.style + ist;
  } else if ((b.type === 'desc' || b.type === 'note') && hasRich(b.text)) icls += ' hasrich';
  else if (b.type === 'hr' && String(b.text ?? '').trim()) icls += ' hastx';
  inner = blockInnerHtml(b, ctx);
  const anchor = ctx.anchors && ANCHOR_TYPES.has(b.type) ? ` id="b${esc(b.id)}"` : '';
  let extra = '';
  if (ctx.copyButtons && b.type === 'table')
    extra = `<button type="button" class="copybtn" data-for="out${esc(b.id)}">複製輸出</button>`;
  if (ctx.copyButtons && b.type === 'npc')
    extra = `<button type="button" class="copybtn" data-for="ccf${esc(b.id)}">複製 CCFOLIA 棋子</button>`;
  /* 匯出：情報區塊、手冊、「按一下複製」的特殊區塊按一下（或 Enter／空白鍵）複製內文（F259、F305） */
  const copyAttr =
    ctx.copyButtons && copiesBody(b) ? ` tabindex="0" title="${COPY_BLOCK_TIP}"` : '';
  /* 段落裡的段落放在內容的最後（框的裡面） */
  const kids = kidsHtml(b, ctx);
  return `<div class="${cls}" data-id="${esc(b.id)}"${ost ? ` style="${ost}"` : ''}><div${anchor} class="${icls}"${ist ? ` style="${ist}"` : ''}${copyAttr}>${extra}${inner}${kids}</div></div>`;
}

/** 匯出 HTML 裡按一下複製內文的段落：情報區塊、手冊、勾了「按一下複製」的特殊區塊 */
export const copiesBody = (b: Block): boolean =>
  b.type === 'info' || b.type === 'handout' || (b.type === 'proc' && procStyleOf(b).copy);

/** 匯出 HTML：情報區塊、手冊的提示 */
export const COPY_BLOCK_TIP = '按一下複製內文';

/* ---------- 頁面 ---------- */

/** 背景花紋的 class（素色為空字串） */
export const bgClass = (p: PageSetting | undefined): string =>
  p?.bg.preset && p.bg.preset !== 'none' ? String(p.bg.preset).replace(/[^a-z0-9-]/gi, '') : '';

export function bgImageHtml(p: PageSetting | undefined): string {
  if (!p?.bg.img) return '';
  const fit = p.bg.fit === 'repeat' ? 'auto' : p.bg.fit === 'contain' ? 'contain' : 'cover';
  return `<div class="pg-img" style="background-image:url(&quot;${esc(p.bg.img)}&quot;);opacity:${(+p.bg.opa || 35) / 100};background-size:${fit};background-repeat:${p.bg.fit === 'repeat' ? 'repeat' : 'no-repeat'}"></div>`;
}

/** 頁尾（3.2.8；固定文字裡的變數顯示預設值，F257） */
export function footHtml(i: number, total: number, doc: Doc): string {
  const f = doc.foot ?? { num: true, text: '', from: 1 };
  const from = Number.isFinite(+f.from) ? +f.from : 1;
  const n = String(i + from);
  const t = String(f.text ?? '')
    .replace(/\{title\}/g, doc.title ?? '')
    .replace(/\{page\}/g, n)
    .replace(/\{total\}/g, String(total || 1));
  const num = f.num !== false ? n : '';
  if (!t && !num) return '';
  return withVars(
    `<div class="pg-foot">${t ? `<span class="ft">${esc(t)}</span>` : ''}${num ? `<span class="pn">${esc(num)}</span>` : ''}</div>`,
    doc,
  );
}

export function pageSettingAt(doc: Doc, i: number): PageSetting {
  return (
    doc.pages[i] ??
    doc.pages[doc.pages.length - 1] ?? {
      id: '',
      bg: { preset: 'none', img: null, fit: 'cover', opa: 35 },
      cols: 1,
    }
  );
}

/**
 * 頁面的 style：指定了紙色時 --paper；飾邊類的花紋要紙面間距（--mv 上下、--mh 左右；3.17.2）。
 * 沒有用到時不加（舊原稿的輸出不變）。
 */
export function pageStyleAttr(p: PageSetting | undefined, doc: Pick<Doc, 'padV' | 'padH'>): string {
  const c = pageColor(p?.bg);
  let st = '';
  if (p && MARGIN_PATTERNS.includes(p.bg.preset)) st += `--mv:${+doc.padV}mm;--mh:${+doc.padH}mm;`;
  if (c) st += `--paper:${c};`;
  return st ? ` style="${st}"` : '';
}

/** 頁面的外框：pg（背景、本文區、頁尾）。body 由呼叫端放進去 */
export function pageOpenHtml(
  i: number,
  ctx: RenderCtx,
  id?: string,
): { open: string; close: string } {
  const st = pageSettingAt(ctx.doc, i);
  const cls = bgClass(st);
  return {
    open: `<div class="pg ${cls}"${id ? ` id="${id}"` : ''}${pageStyleAttr(st, ctx.doc)}><div class="pg-bg ${cls}"></div>${bgImageHtml(st)}<div class="pg-body${st.cols === 2 ? ' cols2' : ''}" style="padding:${ctx.doc.padV}mm ${ctx.doc.padH}mm;font-size:${ctx.doc.base}pt">`,
    close: `</div>${footHtml(i, ctx.total, ctx.doc)}</div>`,
  };
}

/**
 * 文字避開頁面圖片的浮動框（放在本文最前面；3.18.1）：每個框前面是寬 0 的讓位框。
 * flow：不分頁的匯出（寬是版心寬的％）
 */
export function shapesHtml(list: readonly ShapeBox[], flow = false): string {
  return list
    .map(
      (s) =>
        `<div class="imgshape" aria-hidden="true" style="float:${s.side};clear:${s.side};width:0;height:${s.spacer.toFixed(2)}mm"></div><div class="imgshape" aria-hidden="true" style="float:${s.side};clear:${s.side};width:${flow ? `${fnum(s.widthPct)}%` : `${s.width.toFixed(2)}mm`};height:${s.height.toFixed(2)}mm"></div>`,
    )
    .join('');
}

/** 第 i 頁（0 起算）的避開框；n＝總頁數（不給時只收 pg＝i＋1 的，分頁時用） */
export function pageShapesHtml(doc: Doc, i: number, cols: number, n?: number): string {
  return shapesHtml(pimgShapes(pimgsOn(doc, i, n), doc, cols));
}

/** 頁面圖片（紙的左上角為原點；edit：編輯畫面可以點選） */
export function pimgHtml(o: PageImg, doc: Doc, edit: boolean): string {
  const b = pimgBox(o, doc);
  return withVars(
    `<div class="pimg"${edit ? ` data-pimg="${esc(o.id)}"` : ''} style="left:${fnum(b.x)}mm;top:${fnum(b.y)}mm;width:${fnum(b.w)}mm"><div class="t-image">${imageHtml(o, 'width:100%')}</div></div>`,
    doc,
  );
}

/** 不分頁的匯出：頁面圖片（這一頁本文的開頭為原點，寬與左是版心寬的％） */
export function pimgFlowHtml(o: PageImg, doc: Doc): string {
  const b = pimgFlowBox(o, doc);
  return withVars(
    `<div class="pimg" style="left:${fnum(b.left)}%;top:${fnum(b.top)}mm;width:${fnum(b.width)}%"><div class="t-image">${imageHtml(o, 'width:100%')}</div></div>`,
    doc,
  );
}

/** 一頁的完整 HTML（匯出、列印、PDF、頁面一覽）。ids：這頁放的段落 */
export function staticPageHtml(
  i: number,
  ids: readonly string[],
  ctx: RenderCtx,
  byId: Map<string, Block>,
): string {
  const st = pageSettingAt(ctx.doc, i);
  const { open, close } = pageOpenHtml(i, ctx, ctx.anchors ? `p${i + 1}` : undefined);
  if (ctx.links) ctx.links.page = i;
  let prev: string | null = null;
  let topDone = false;
  let body = '';
  for (const id of ids) {
    const b = byId.get(id);
    if (!b) continue;
    const k = spKey(b) ?? b.type;
    const pull = gapPull(prev, k);
    prev = k;
    let top = false;
    if (!topDone && b.type !== 'break' && b.type !== 'colbr') {
      top = true;
      topDone = true;
    }
    body += blockHtml(b, ctx, { cols: st.cols, pull, top });
  }
  /* 頁面圖片（超過總頁數的放在最後一頁） */
  const onPg = pimgsOn(ctx.doc, i, ctx.total);
  const shapes = shapesHtml(pimgShapes(onPg, ctx.doc, st.cols));
  const imgs = onPg.map((o) => pimgHtml(o, ctx.doc, false)).join('');
  if (ctx.links) ctx.links.page = -1;
  return open + shapes + body + imgs + close;
}

/** 有內容的彈出視窗（附錄用） */
export function popupsWithContent(all: readonly Block[]): Block[] {
  return all.filter(
    (b) =>
      b.type === 'popup' &&
      (popIsBlocks(b) ? (b.pop?.blocks ?? []).length > 0 : String(b.pop?.body ?? '').trim() !== ''),
  );
}

/** 附錄裡的一個項目（標題、段落）：依所在位置（頁首、與前一段的間距）產生 HTML */
export interface FlowItem {
  /** 決定間距的書式（spKey） */
  type: string;
  html: (place: Place) => string;
}

const pullStyle = (p: Place): string => (p.pull ? ` style="margin-top:-${p.pull}mm"` : '');

/** 附錄的項目：標題 1「附錄」＋每個有內容的彈出視窗（名稱為標題 2＋內容），依原稿順序（3.6.6） */
export function appendixItems(ctx: RenderCtx, all: readonly Block[]): FlowItem[] {
  const list = popupsWithContent(all);
  if (!list.length) return [];
  const out: FlowItem[] = [
    {
      type: 'h1',
      html: (p) =>
        `<div class="bp bp-h1 span${p.top ? ' top' : ''}"><div class="b t-h1">附錄</div></div>`,
    },
  ];
  for (const b of list) {
    const label = withVars(esc(b.pop?.label || POPUP_DEFAULT_LABEL), ctx.doc);
    /* 列印、PDF、匯出：這一節的錨點（apx<id>）與「↩ 回到 P.n」（F269） */
    const aid = ctx.links ? ` id="apx${esc(b.id)}"` : '';
    out.push({
      type: 'h2',
      html: (p) => {
        if (ctx.links) ctx.links.page = -1;
        return `<div class="bp bp-h2${p.top ? ' top' : ''}"${pullStyle(p)}><div class="b t-h2"${aid}>${label}</div>${backLinksHtml(b.id, ctx)}</div>`;
      },
    });
    if (popIsBlocks(b)) {
      for (const x of (b.pop?.blocks ?? []).filter((y) => y.type !== 'break' && y.type !== 'colbr'))
        out.push({ type: spKey(x) ?? x.type, html: (p) => blockHtml(x, ctx, p) });
    } else {
      out.push({
        type: 'desc',
        html: (p) =>
          `<div class="bp bp-desc${p.top ? ' top' : ''}"${pullStyle(p)}><div class="b t-desc" style="white-space:normal">${popupContentHtml(b.pop, ctx)}</div></div>`,
      });
    }
  }
  return out;
}

/** 附錄頁（一頁，高度隨內容延伸）：閱覽 HTML 列印時用 */
export function appendixHtml(ctx: RenderCtx, all: readonly Block[]): string {
  const items = appendixItems(ctx, all);
  if (!items.length) return '';
  const st = ctx.doc.pages[ctx.doc.pages.length - 1];
  const cls = bgClass(st);
  let prev: string | null = null;
  const body = items
    .map((it, i) => {
      const h = it.html({ cols: 1, pull: gapPull(prev, it.type), top: i === 0 });
      prev = it.type;
      return h;
    })
    .join('');
  return `<div class="pg pg-appx ${cls}"${pageStyleAttr(st, ctx.doc)}><div class="pg-bg ${cls}"></div><div class="pg-body" style="padding:${ctx.doc.padV}mm ${ctx.doc.padH}mm;font-size:${ctx.doc.base}pt;height:auto;min-height:${PAPER_H}mm">${body}</div></div>`;
}

/** 段落有沒有用到注音、註解或顏色（文字欄的提示用） */
export const hasDecor = (b: Block): boolean =>
  blockComments(b).length > 0 || blockMarks(b).length > 0 || hasRuby(b.text);

/** 是否放在紙面的流程裡（不含只給儲存格用的彈出視窗） */
export const inFlow = (b: Block): boolean => !isOnlyPopup(b);
