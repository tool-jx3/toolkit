/**
 * 頁面的排版與畫法（預覽與匯出共用）：本文排行、分頁（core/richtext 的 paginateRows），每一頁組成場景節點（core/scene），
 * 再疊在背景（background.ts）上。版面的位置、大小是本站自己設計的（規格 3.1）。
 *
 * 座標：頁面 1200 × 1600（輸出時 × 倍率）。
 */
import { drawPlaced, makeCanvas } from '@/core/image';
import {
  layoutRich,
  paginateRows,
  plainDoc,
  type RichDoc,
  type RichRow,
  sliceDoc,
} from '@/core/richtext';
import {
  drawScene,
  type Rect,
  type RichNode,
  richAdvance,
  richRowMetrics,
  type SceneNode,
  type TextFont,
  textWidth,
} from '@/core/scene';
import { drawTexture } from './background';
import {
  footerRightText,
  MAX_PAGES,
  PAGE_H,
  PAGE_W,
  PHOTO_BODY_SHRINK,
  type ProseState,
} from './model';
import { DEFAULT_ICON, UNTITLED } from './strings';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/* ---------- 版面（本站自己設計的位置與大小） ---------- */

export const GEO = {
  /** 左右邊界與內容寬 */
  mx: 120,
  cw: PAGE_W - 240,
  /** 頁首一列（圖示、細線、頁首文字）的上緣與高 */
  headerTop: 112,
  headerH: 44,
  /** 頁尾的細線、文字 */
  footerRule: 1448,
  footerTextTop: 1470,
  footerTextH: 26,
  footerSize: 16,
  /** 本文最低到這裡 */
  bodyBottom: 1392,
  /** 小標 */
  kickerSize: 17,
  kickerH: 26,
  kickerGap: { cover: 20, page: 20, photo: 16 },
  /** 標題 */
  titleLineHeight: 1.3,
  titleMaxLines: 3,
  titleSize: { cover: 56, page: 56, photo: 44 },
  titleGap: { cover: 44, page: 48, photo: 28 },
  /** 封面：上方的裝飾、文字區塊最高到這裡、第一頁本文最多多高 */
  coverIconY: 152,
  coverHeaderY: 186,
  coverMinTop: 300,
  coverBodyMax: 640,
  /** 內文頁：小標的上緣 */
  pageKickerTop: 236,
  /** 照片＋文字：照片框的上緣、照片下方到小標的距離 */
  photoTop: 84,
  photoGap: 34,
  /** 接續的頁：標題一行的上緣、本文的上緣（有標題／沒有標題） */
  contTitleTop: 228,
  contBodyTop: 294,
  contBodyTopNoTitle: 236,
} as const;

const RULE_ALPHA = 0.4;
const SOFT_ALPHA = 0.6;
const FOOTER_ALPHA = 0.62;

/* ---------- 量字 ---------- */

let measureCtx: Ctx | null = null;
/** 量字寬用的 context（共用） */
export function measureContext(): Ctx {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d') as Ctx;
  return measureCtx;
}

/** 本文的字級（「照片＋文字」小 4 px） */
export const bodySizeOf = (s: ProseState): number =>
  s.layout === 'photo' ? s.bodySize - PHOTO_BODY_SHRINK : s.bodySize;

/** 本文的節點（位置之外的設定；分頁與畫圖共用） */
export function bodyTemplate(s: ProseState): RichNode {
  return {
    kind: 'rich',
    x: GEO.mx,
    y: 0,
    w: GEO.cw,
    h: 0,
    doc: s.body,
    font: { family: s.font, size: bodySizeOf(s), weight: 400 },
    boldWeight: 700,
    lineHeight: s.lineHeight,
    letterSpacing: 0,
    color: s.textColor,
    wrap: 'word',
    align: s.align,
    bleed: 10,
  };
}

const titleText = (s: ProseState) => s.title.trim() || UNTITLED;

function titleNode(s: ProseState, y: number): RichNode {
  const size = GEO.titleSize[s.layout];
  return {
    kind: 'rich',
    x: GEO.mx,
    y,
    w: GEO.cw,
    h: size * GEO.titleLineHeight * GEO.titleMaxLines + 1,
    doc: plainDoc(titleText(s), s.textColor),
    font: { family: s.font, size, weight: 700 },
    boldWeight: 700,
    lineHeight: GEO.titleLineHeight,
    letterSpacing: -0.5,
    color: s.textColor,
    wrap: 'word',
    align: 'left',
    maxLines: GEO.titleMaxLines,
    bleed: 10,
  };
}

/** 標題排成幾行（最多 3 行） */
function titleRows(ctx: Ctx, s: ProseState): number {
  const n = titleNode(s, 0);
  const rows = layoutRich(n.doc, {
    width: n.w,
    advance: (ch, bold, run) => richAdvance(ctx, n, ch, bold, run),
    wrap: 'word',
  });
  return Math.max(1, Math.min(GEO.titleMaxLines, rows.length));
}

/* ---------- 分頁 ---------- */

export interface PagePlan {
  /** 這一頁的本文（沒有本文時 null） */
  doc: RichDoc | null;
  /** 本文的高度（這一頁的行高總和） */
  bodyHeight: number;
  /** 最後一行接到下一頁（左右對齊時撐滿） */
  openEnd: boolean;
  /** 開頭接續上一頁 */
  continued: boolean;
}

export interface Plan {
  pages: PagePlan[];
  /** 頁數到上限、還有放不下的字 */
  capped: boolean;
  /** 第一頁放不下本文（本文從第 2 頁開始） */
  firstEmpty: boolean;
  /** 第一頁的版面（標題行數、小標、本文的上緣） */
  first: FirstGeo;
}

interface FirstGeo {
  titleRows: number;
  /** 小標＋間距的高度（沒有小標時 0） */
  kickerBlock: number;
  titleBlock: number;
  /** 第一頁本文最多多高 */
  capacity: number;
}

function firstGeo(ctx: Ctx, s: ProseState): FirstGeo {
  const rows = titleRows(ctx, s);
  const kickerBlock = s.kicker.trim() ? GEO.kickerH + GEO.kickerGap[s.layout] : 0;
  const titleBlock = rows * GEO.titleSize[s.layout] * GEO.titleLineHeight;
  const gap = GEO.titleGap[s.layout];
  let capacity: number;
  if (s.layout === 'cover')
    capacity = Math.min(
      GEO.coverBodyMax,
      GEO.bodyBottom - GEO.coverMinTop - kickerBlock - titleBlock - gap,
    );
  else if (s.layout === 'page')
    capacity = GEO.bodyBottom - (GEO.pageKickerTop + kickerBlock + titleBlock + gap);
  else
    capacity =
      GEO.bodyBottom -
      (GEO.photoTop + s.photo.height + GEO.photoGap + kickerBlock + titleBlock + gap);
  return { titleRows: rows, kickerBlock, titleBlock, capacity };
}

const contBodyTop = (s: ProseState) => (s.title.trim() ? GEO.contBodyTop : GEO.contBodyTopNoTitle);

/** 本文排行、分頁 */
export function planPages(s: ProseState, ctx: Ctx = measureContext()): Plan {
  const node = bodyTemplate(s);
  const rows: RichRow[] = layoutRich(s.body, {
    width: node.w,
    advance: (ch, bold, run) => richAdvance(ctx, node, ch, bold, run),
    wrap: 'word',
  });
  const heights = rows.map((r) => richRowMetrics(ctx, node, r).height);
  const first = firstGeo(ctx, s);
  const rest = GEO.bodyBottom - contBodyTop(s);
  const indexOf = new Map(rows.map((r, i) => [r, i]));
  const r = paginateRows(s.body, rows, {
    pageHeight: (i) => (i === 0 ? first.capacity : rest),
    rowHeight: (row) => heights[indexOf.get(row) ?? 0] ?? 0,
    maxPages: MAX_PAGES,
    minFirst: node.font.size * (node.lineHeight ?? 1.3),
  });
  const pages: PagePlan[] = r.pages.map((p) => {
    let h = 0;
    for (let i = p.from; i < p.to; i++) h += heights[i];
    return {
      doc: p.to > p.from ? sliceDoc(s.body, p.start, p.end) : null,
      bodyHeight: h,
      openEnd: p.openEnd,
      continued: p.continued,
    };
  });
  const firstEmpty = pages.length > 1 && !pages[0].doc && rows.some((x) => x.end > x.start);
  return { pages, capped: r.capped, firstEmpty, first };
}

/* ---------- 每一頁的節點 ---------- */

export interface PageEnv {
  /** 照片（已解碼；沒有時 null） */
  photo: { source: CanvasImageSource; width: number; height: number } | null;
  measure: Ctx;
}

const font = (s: ProseState, size: number, weight = 700): TextFont => ({
  family: s.font,
  size,
  weight,
});

/** 頁首一列：左邊圖示、右邊頁首文字、中間細線 */
function headerRow(s: ProseState, ctx: Ctx): SceneNode[] {
  const y = GEO.headerTop;
  const cy = y + GEO.headerH / 2;
  const icon = s.icon.trim() || DEFAULT_ICON;
  const iconFont = font(s, 28, 400);
  const iconW = textWidth(ctx, { font: iconFont }, icon);
  const headFont = font(s, 15);
  const ls = 2.4;
  const head = s.header.trim();
  const headW = head ? textWidth(ctx, { font: headFont, letterSpacing: ls }, head) : 0;
  const left = GEO.mx + iconW + 22;
  const right = head ? GEO.mx + GEO.cw - headW - 22 : GEO.mx + GEO.cw;
  const out: SceneNode[] = [
    {
      kind: 'text',
      x: GEO.mx,
      y,
      h: GEO.headerH,
      text: icon,
      font: iconFont,
      color: s.textColor,
      valign: 'middle',
      lineHeight: 1,
    },
  ];
  if (right - left > 8)
    out.push({
      kind: 'line',
      points: [left, cy, right, cy],
      color: s.textColor,
      width: 1,
      opacity: RULE_ALPHA,
    });
  if (head)
    out.push({
      kind: 'text',
      x: GEO.mx,
      y,
      w: GEO.cw,
      h: GEO.headerH,
      text: head,
      font: headFont,
      color: s.textColor,
      align: 'right',
      valign: 'middle',
      letterSpacing: ls,
      lineHeight: 1,
      shrink: 0.5,
      opacity: SOFT_ALPHA,
    });
  return out;
}

/** 封面上方的裝飾：圖示置中、左右兩條細線，下面是頁首文字 */
function coverOrnament(s: ProseState): SceneNode[] {
  const cx = PAGE_W / 2;
  const y = GEO.coverIconY;
  const icon = s.icon.trim() || DEFAULT_ICON;
  const out: SceneNode[] = [
    {
      kind: 'text',
      x: GEO.mx,
      y: y - 24,
      w: GEO.cw,
      h: 48,
      text: icon,
      font: font(s, 34, 400),
      color: s.textColor,
      align: 'center',
      valign: 'middle',
      lineHeight: 1,
      shrink: 0.4,
    },
    {
      kind: 'line',
      points: [cx - 150, y, cx - 40, y],
      color: s.textColor,
      width: 1,
      opacity: RULE_ALPHA,
    },
    {
      kind: 'line',
      points: [cx + 40, y, cx + 150, y],
      color: s.textColor,
      width: 1,
      opacity: RULE_ALPHA,
    },
  ];
  const head = s.header.trim();
  if (head)
    out.push({
      kind: 'text',
      x: GEO.mx,
      y: GEO.coverHeaderY,
      w: GEO.cw,
      h: 26,
      text: head,
      font: font(s, 15),
      color: s.textColor,
      align: 'center',
      valign: 'middle',
      letterSpacing: 3,
      lineHeight: 1,
      shrink: 0.5,
      opacity: SOFT_ALPHA,
    });
  return out;
}

/** 小標（一行，太長時縮小） */
function kickerNode(s: ProseState, y: number): SceneNode {
  return {
    kind: 'text',
    x: GEO.mx,
    y,
    w: GEO.cw,
    h: GEO.kickerH,
    text: s.kicker.trim(),
    font: font(s, GEO.kickerSize),
    color: s.textColor,
    valign: 'middle',
    letterSpacing: 3.4,
    lineHeight: 1,
    shrink: 0.55,
    opacity: SOFT_ALPHA,
  };
}

/** 頁尾：細線、左邊文字、右邊文字（頁碼） */
function footer(s: ProseState, index: number, ctx: Ctx): SceneNode[] {
  const out: SceneNode[] = [
    {
      kind: 'line',
      points: [GEO.mx, GEO.footerRule, GEO.mx + GEO.cw, GEO.footerRule],
      color: s.textColor,
      width: 1,
      opacity: RULE_ALPHA,
    },
  ];
  const right = footerRightText(s, index).trim();
  const f = font(s, GEO.footerSize);
  const rightW = right ? textWidth(ctx, { font: f, letterSpacing: 2 }, right) : 0;
  const left = s.footerLeft.trim();
  if (left)
    out.push({
      kind: 'text',
      x: GEO.mx,
      y: GEO.footerTextTop,
      w: Math.max(40, GEO.cw - rightW - 32),
      h: GEO.footerTextH,
      text: left,
      font: f,
      color: s.textColor,
      valign: 'middle',
      letterSpacing: 2,
      lineHeight: 1,
      shrink: 0.5,
      opacity: FOOTER_ALPHA,
    });
  if (right)
    out.push({
      kind: 'text',
      x: GEO.mx,
      y: GEO.footerTextTop,
      w: GEO.cw,
      h: GEO.footerTextH,
      text: right,
      font: f,
      color: s.textColor,
      align: 'right',
      valign: 'middle',
      letterSpacing: 2,
      lineHeight: 1,
      shrink: 0.5,
      opacity: FOOTER_ALPHA,
    });
  return out;
}

/** 照片框（照片依「蓋滿／完整顯示」與位置畫進框裡；沒有照片時是空的框）；頁首文字放在照片右下角 */
function photoBlock(s: ProseState, env: PageEnv): SceneNode[] {
  const box: Rect = { x: GEO.mx, y: GEO.photoTop, width: GEO.cw, height: s.photo.height };
  const out: SceneNode[] = [
    {
      kind: 'rect',
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
      fill: s.textColor,
      opacity: 0.06,
    },
  ];
  const ph = env.photo;
  if (ph) {
    out.push({
      kind: 'custom',
      box,
      draw: (ctx) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.width, box.height);
        ctx.clip();
        drawPlaced(ctx, ph.source, ph, box, photoPlacement(s, ph, box));
        ctx.restore();
      },
    });
  } else {
    out.push(
      {
        kind: 'rect',
        x: box.x + 1,
        y: box.y + 1,
        w: box.width - 2,
        h: box.height - 2,
        stroke: { color: s.textColor, width: 2 },
        opacity: 0.16,
      },
      {
        kind: 'text',
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
        text: s.icon.trim() || DEFAULT_ICON,
        font: font(s, 44, 400),
        color: s.textColor,
        align: 'center',
        valign: 'middle',
        lineHeight: 1,
        shrink: 0.4,
        opacity: 0.45,
      },
    );
  }
  const head = s.header.trim();
  if (head) {
    const f = font(s, 13);
    const ls = 1.8;
    const w = Math.min(
      box.width - 44,
      textWidth(env.measure, { font: f, letterSpacing: ls }, head) + 24,
    );
    const h = 32;
    const x = box.x + box.width - 22 - w;
    const y = box.y + box.height - 18 - h;
    out.push(
      { kind: 'rect', x, y, w, h, fill: 'rgba(24, 24, 21, 0.74)' },
      {
        kind: 'text',
        x: x + 12,
        y,
        w: w - 24,
        h,
        text: head,
        font: f,
        color: '#ffffff',
        valign: 'middle',
        letterSpacing: ls,
        lineHeight: 1,
        shrink: 0.5,
      },
    );
  }
  return out;
}

/**
 * 照片實際用的位置：存的是「以蓋滿或完整顯示為 1」的縮放，畫的時候換成以蓋滿為 1（core/image 的 drawPlaced）。
 */
export function photoPlacement(
  s: ProseState,
  img: { width: number; height: number },
  box: { width: number; height: number },
) {
  const p = s.photo.place;
  if (s.photo.fit === 'cover') return p;
  return { ...p, zoom: p.zoom * containRatio(img, box, p.turns) };
}

/** 完整顯示的縮放 ÷ 蓋滿的縮放（≤ 1） */
export function containRatio(
  img: { width: number; height: number },
  box: { width: number; height: number },
  turns = 0,
): number {
  const odd = Math.round(turns) % 2 !== 0;
  const iw = odd ? img.height : img.width;
  const ih = odd ? img.width : img.height;
  if (!(iw > 0 && ih > 0 && box.width > 0 && box.height > 0)) return 1;
  const cover = Math.max(box.width / iw, box.height / ih);
  const contain = Math.min(box.width / iw, box.height / ih);
  return contain / cover;
}

/** 本文節點（這一頁的） */
function bodyNode(s: ProseState, page: PagePlan, y: number): RichNode | null {
  if (!page.doc) return null;
  return {
    ...bodyTemplate(s),
    y,
    h: page.bodyHeight + 1,
    doc: page.doc,
    openEnd: page.openEnd,
    continued: page.continued,
  };
}

/** 第 index 頁的場景節點（背景與紋理以外的全部） */
export function pageNodes(s: ProseState, plan: Plan, index: number, env: PageEnv): SceneNode[] {
  const page = plan.pages[index];
  const out: SceneNode[] = [];
  if (s.texture) out.push({ kind: 'custom', draw: (ctx) => drawTexture(ctx) });
  const g = plan.first;
  if (index > 0) {
    out.push(...headerRow(s, env.measure));
    const title = s.title.trim();
    if (title)
      out.push({
        ...kickerNode(s, GEO.contTitleTop),
        text: title,
      } as SceneNode);
    const body = bodyNode(s, page, contBodyTop(s));
    if (body) out.push(body);
  } else if (s.layout === 'cover') {
    out.push(...coverOrnament(s));
    const bodyTop = GEO.bodyBottom - page.bodyHeight;
    const titleBottom = page.doc ? bodyTop - GEO.titleGap.cover : GEO.bodyBottom;
    const titleTop = titleBottom - g.titleBlock;
    if (g.kickerBlock) out.push(kickerNode(s, titleTop - g.kickerBlock));
    out.push(titleNode(s, titleTop));
    const body = bodyNode(s, page, bodyTop);
    if (body) out.push(body);
  } else if (s.layout === 'page') {
    out.push(...headerRow(s, env.measure));
    let y = GEO.pageKickerTop;
    if (g.kickerBlock) out.push(kickerNode(s, y));
    y += g.kickerBlock;
    out.push(titleNode(s, y));
    y += g.titleBlock + GEO.titleGap.page;
    const body = bodyNode(s, page, y);
    if (body) out.push(body);
  } else {
    out.push(...photoBlock(s, env));
    let y = GEO.photoTop + s.photo.height + GEO.photoGap;
    if (g.kickerBlock) out.push(kickerNode(s, y));
    y += g.kickerBlock;
    out.push(titleNode(s, y));
    y += g.titleBlock + GEO.titleGap.photo;
    const body = bodyNode(s, page, y);
    if (body) out.push(body);
  }
  out.push(...footer(s, index, env.measure));
  return out;
}

/** 整頁畫到 ctx（背景畫布＋節點；頁面座標） */
export function paintPage(
  ctx: Ctx,
  background: CanvasImageSource,
  nodes: readonly SceneNode[],
): void {
  ctx.drawImage(background, 0, 0, PAGE_W, PAGE_H);
  drawScene(ctx, nodes);
}

/** 畫一頁成新的畫布（倍率 scale） */
export function renderPage(
  background: CanvasImageSource,
  nodes: readonly SceneNode[],
  scale: number,
): HTMLCanvasElement | OffscreenCanvas {
  const c = makeCanvas(Math.round(PAGE_W * scale), Math.round(PAGE_H * scale));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  paintPage(ctx, background, nodes);
  return c;
}
