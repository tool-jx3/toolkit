/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 一張分頁的 SVG（原作的 render()）：編輯畫面、PNG、分層 SVG／PSD、互動網頁共用同一份畫法（規格 3.4）。
 * 圖層由下而上：背景（底色、背景圖）→ 輔助線 → 關係線（含線上標籤）→ 角色 →（名稱）→ 圖例與名冊。
 */
import type { FontKey, Sheet } from '../model/types';
import { buildObstacles, type EdgeCtx, edgesSvg } from './edges';
import { bleedPad, esc, FONT_STACKS, type SheetCtx, sheetCtx } from './geom';
import { type LegendOut, legendOutPad, legendsSvg } from './legend';
import { f1 } from './lines';
import { type ImageHref, type NodeUi, nodeSvg } from './nodes';

export type RenderMode = 'edit' | 'export' | 'viewer';

export interface RenderOpts {
  mode: RenderMode;
  href: ImageHref;
  font: FontKey;
  /** 同一份文件放好幾張圖時，clipPath 等 id 的前綴 */
  idPrefix?: string;
  /** 編輯畫面的標記 */
  ui?: NodeUi;
  /** 名字另外放一層（分層匯出） */
  splitNames?: boolean;
}

export interface ChartParts {
  ctx: SheetCtx;
  defs: string;
  /** 底色 rect */
  bgRect: string;
  /** 背景圖 image（沒有時空字串） */
  bgImage: string;
  guides: string;
  edges: string;
  nodes: string;
  names: string;
  legend: string;
  legendInfo: LegendOut;
  /** 角色超出畫布的出血 */
  bleed: number;
  /** 實際外擴（出血 ∪ 界外的圖例／名冊） */
  pad: number;
}

export function chartParts(sheet: Sheet, opts: RenderOpts): ChartParts {
  const ctx = sheetCtx(sheet);
  const { W, H, pal } = ctx;
  const pre = opts.idPrefix ?? '';
  const ui = opts.mode === 'edit' ? (opts.ui ?? {}) : null;
  const defs: string[] = [];
  const bgUrl = sheet.bg ? opts.href(sheet.bg) : null;
  const bgRect = `<rect class="layer-bg" x="0" y="0" width="${W}" height="${H}" fill="${pal.bg}"/>`;
  const bgImage = bgUrl
    ? `<image class="layer-bg canvas-bgimg" href="${esc(bgUrl)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" pointer-events="none"/>`
    : '';
  let guides = '';
  if (ctx.s.bgMode === 'grid') {
    const G = ctx.s.gridStep >= 10 && ctx.s.gridStep <= 200 ? ctx.s.gridStep : 50;
    defs.push(
      `<pattern id="${pre}gridPattern" width="${G}" height="${G}" patternUnits="userSpaceOnUse"><path d="M ${G} 0 L 0 0 0 ${G}" fill="none" stroke="${pal.guide}" stroke-width="1" opacity="0.45"/></pattern>`,
    );
    guides = `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${pre}gridPattern)"/>`;
  } else if (ctx.s.bgMode === 'axis') {
    guides = `<g class="bgGuides" stroke="${pal.guide}" stroke-width="1.5" opacity="0.7" stroke-dasharray="10 7"><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/></g>`;
  }
  const ectx: EdgeCtx = {
    ctx,
    bgColor: pal.bg,
    panelColor: pal.panel,
    bridge: ctx.s.bridgeMode,
    geo: [],
    lblOut: [],
    grps: new Map(),
    obs: buildObstacles(ctx),
    href: opts.href,
    idPrefix: pre,
    defs,
  };
  const edges = edgesSvg(ectx);
  let nodes = '';
  let names = '';
  const order = ctx.s.noCollision ? [...sheet.chars].reverse() : sheet.chars;
  for (const c of order) {
    const n = nodeSvg(ctx, c, pre, opts.href, ui, opts.splitNames);
    nodes += n.svg;
    names += n.name;
    if (n.defs) defs.push(n.defs);
  }
  const legendInfo = legendsSvg(ctx, pre, opts.href, opts.mode === 'edit');
  if (legendInfo.defs) defs.push(legendInfo.defs);
  const bleed = bleedPad(ctx);
  const pad = Math.max(bleed, legendOutPad([legendInfo.rel, legendInfo.chars], W, H));
  return {
    ctx,
    defs: defs.join(''),
    bgRect,
    bgImage,
    guides,
    edges,
    nodes,
    names,
    legend: legendInfo.svg,
    legendInfo,
    bleed,
    pad,
  };
}

const relOpacityAttr = (p: ChartParts) => {
  const v = p.ctx.s.relOpacity;
  return v >= 0.25 && v < 1 ? ` opacity="${Math.round(v * 100) / 100}"` : '';
};

/** 畫布內容（translate 之前的座標）：背景、輔助線、關係線、角色、名稱、圖例 */
function contentLayers(p: ChartParts, opts: { transparent?: boolean; frame?: boolean }): string {
  const { W, H, pal } = p.ctx;
  const bg = opts.transparent ? '' : p.bgRect + p.bgImage;
  const frame = opts.frame
    ? `<rect class="canvas-frame" x="0.5" y="0.5" width="${Math.max(0, W - 1)}" height="${Math.max(0, H - 1)}" fill="none" stroke="${pal.guide}" stroke-width="2" opacity="0.9" vector-effect="non-scaling-stroke" pointer-events="none"/>`
    : '';
  return `${bg}${frame}<g class="layer-guides">${opts.transparent ? '' : p.guides}</g><g class="layer-edges"${relOpacityAttr(p)}>${p.edges}</g><g class="layer-nodes">${p.nodes}</g>${p.names ? `<g class="layer-names">${p.names}</g>` : ''}<g class="layer-legend">${p.legend}</g>`;
}

const svgOpen = (font: FontKey, attrs: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs} font-family="${esc(FONT_STACKS[font] ?? FONT_STACKS.sans)}">`;

export interface EditorSvg {
  svg: string;
  pad: number;
  viewW: number;
  viewH: number;
  parts: ChartParts;
}

/** 編輯畫面：含出血區、畫布邊框、邊界說明、選取等標記 */
export function editorSvg(sheet: Sheet, opts: Omit<RenderOpts, 'mode'>): EditorSvg {
  const p = chartParts(sheet, { ...opts, mode: 'edit' });
  const { W, H, pal } = p.ctx;
  const pad = p.pad;
  const noteFS = Math.max(10, Math.round(Math.max(W, 300) * 0.012));
  const notePad = Math.max(0, Math.round(noteFS * 3.4) - pad);
  const viewW = W + pad * 2;
  const viewH = H + pad * 2 + notePad;
  let outer = `<rect x="0" y="0" width="${viewW}" height="${viewH}" fill="${pal.bg}"/>`;
  if (p.bleed > 0)
    outer += `<rect class="canvas-bleed-frame" x="0.5" y="0.5" width="${viewW - 1}" height="${H + pad * 2 - 1}" fill="none" stroke="${pal.guide}" stroke-width="1.5" opacity="0.65" stroke-dasharray="10 7" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  const boundaryY = H + Math.round(noteFS * 2.4);
  let notes = `<text x="${W / 2}" y="${boundaryY}" text-anchor="middle" font-size="${noteFS}" font-weight="700" fill="${pal.guide}" opacity="0.9">畫布邊界（不會出現在匯出圖裡）</text>`;
  if (p.bleed > 0) {
    const text = '角色超出畫布了：外圈的出血區不會進 PNG，請把角色拉回畫布內，或修改畫布尺寸。';
    const fitFS = (viewW * 0.96) / Math.max(1, text.length * 1.02);
    const fs = Math.max(12, Math.round(Math.min(p.bleed * 0.6, fitFS)));
    notes += `<text x="${W / 2}" y="${f1(H + p.bleed * 0.82)}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="${pal.ink}" opacity="0.92">${text}</text>`;
  }
  const svg = `${svgOpen(opts.font, `class="rc-chart" viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}"`)}${outer}<defs>${p.defs}</defs><g class="canvas-content" transform="translate(${pad},${pad})">${contentLayers(p, { frame: true })}</g><g class="canvas-notes" transform="translate(${pad},${pad})" pointer-events="none">${notes}</g></svg>`;
  return { svg, pad, viewW, viewH, parts: p };
}

/** PNG 用：畫布範圍（W × H），去背時不畫背景與格線 */
export function exportSvg(
  sheet: Sheet,
  opts: Omit<RenderOpts, 'mode'> & { transparent?: boolean },
): string {
  const p = chartParts(sheet, { ...opts, mode: 'export' });
  const { W, H } = p.ctx;
  return `${svgOpen(opts.font, `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"`)}<defs>${p.defs}</defs>${contentLayers(p, { transparent: opts.transparent })}</svg>`;
}

/** 互動網頁用：含界外的圖例／名冊（viewBox 外擴），不含編輯用的標記 */
export function viewerSvg(sheet: Sheet, opts: Omit<RenderOpts, 'mode'>): string {
  const p = chartParts(sheet, { ...opts, mode: 'viewer' });
  const { W, H } = p.ctx;
  const pad = p.pad;
  return `${svgOpen(opts.font, `class="chart" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" width="${W + pad * 2}" height="${H + pad * 2}"`)}<defs>${p.defs}</defs>${contentLayers(p, {})}</svg>`;
}

export interface LayerPart {
  id: string;
  label: string;
  body: string;
}

/** 分層匯出的圖層（空的略過） */
export function exportLayers(
  sheet: Sheet,
  opts: Omit<RenderOpts, 'mode' | 'splitNames'>,
): {
  defs: string;
  W: number;
  H: number;
  layers: LayerPart[];
} {
  const p = chartParts(sheet, { ...opts, mode: 'export', splitNames: true });
  const all: LayerPart[] = [
    { id: 'layer-bg', label: '背景', body: p.bgRect + p.bgImage },
    { id: 'layer-guides', label: '輔助線', body: p.guides },
    {
      id: 'layer-edges',
      label: '關係線',
      body: p.edges ? `<g${relOpacityAttr(p)}>${p.edges}</g>` : '',
    },
    { id: 'layer-nodes', label: '角色', body: p.nodes },
    { id: 'layer-names', label: '名稱', body: p.names },
    { id: 'layer-legend', label: '圖例', body: p.legend },
  ];
  return { defs: p.defs, W: p.ctx.W, H: p.ctx.H, layers: all.filter((l) => l.body) };
}
