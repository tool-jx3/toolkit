/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 一張分頁的 SVG（原作的 render()）：編輯畫面、PNG、分層 SVG／PSD、互動網頁共用同一份畫法（規格 3.4）。
 * 圖層由下而上：背景（底色、背景圖）→ 輔助線 →（陣營框）→ 關係線（一般線 → 聚合線 → 群體關係線 → 線上標籤 → 標籤網的虛線）
 * → 角色（角色 → 收合節點 → 標籤網的圓點）→（名稱）→ 圖例（圖例 → 標籤圖例 → 名冊）→ 便利貼（第四批；沒有便利貼時不出這一層）。
 */

import type { TweenFx } from '../logic/tween';
import type {
  CharEntry,
  FontItem,
  FontValue,
  FrameItem,
  Label,
  RadarTpl,
  Sheet,
} from '../model/types';
import { S } from '../strings';
import { buildObstacles, type EdgeCtx, edgesSvg } from './edges';
import {
  bleedPad,
  charLevel,
  esc,
  fontStack,
  framePad,
  opAttr,
  type SheetCtx,
  sheetCtx,
} from './geom';
import { colEdgesSvg, colNodesSvg, grelEdgesSvg, labelInfo, labelNetSvg, zonesSvg } from './labels';
import { type LegendOut, legendOutPad, legendsSvg } from './legend';
import { f1 } from './lines';
import { type ImageHref, type NodeLod, type NodeUi, nodeSvg } from './nodes';
import { noteBleedPad, noteLook, notesOutside, notesSvg } from './notes';

export type RenderMode = 'edit' | 'export' | 'viewer';

export interface RenderOpts {
  mode: RenderMode;
  /** 圖片資產（頭像、背景圖、頭像框）→ 網址 */
  href: ImageHref;
  /** 文件字型 */
  font: FontValue;
  /** 匯入的字型、頭像框庫（第三批；沒給＝沒有） */
  fonts?: readonly FontItem[];
  frames?: readonly FrameItem[];
  /** 匯出時內嵌在根元素最前面的 @font-face（PNG／分層 SVG／PSD；編輯畫面由頁面註冊、互動網頁放在頁面樣式） */
  fontFaceCss?: string;
  /** 同一份文件放好幾張圖時，clipPath 等 id 的前綴 */
  idPrefix?: string;
  /** 編輯畫面的標記 */
  ui?: NodeUi;
  /** 名字另外放一層（分層匯出） */
  splitNames?: boolean;
  /** 專案的標籤（陣營框、標籤網、標籤圖例、群體關係用；沒給＝沒有標籤） */
  labels?: readonly Label[];
  /** 數值範本與角色庫（圖表節點用；第四批） */
  radarTpls?: readonly RadarTpl[];
  library?: readonly CharEntry[];
  /** 遠近簡化的標記（F116；60 位以上才真的標）：編輯畫面拉遠時、互動網頁；匯出不標 */
  lod?: boolean;
  /** 時間軸的補間覆寫表（第五批；sheet 是 logic/tween 算出來的暫時分頁） */
  tween?: TweenFx | null;
}

/** 遠近簡化的密度門檻：畫面上看得到的角色（收合藏起來的不算）≥ 60 位 */
export const LOD_DENSE_MIN = 60;
export const lodDense = (ctx: SheetCtx): boolean =>
  ctx.sheet.chars.length - labelInfo(ctx).colHidden.size >= LOD_DENSE_MIN;
/** 拉遠的大名字最多幾位（重要度高的優先、同級編號小的優先；原作的 FARNAME_MAX） */
const FARNAME_MAX = 20;

export interface ChartParts {
  ctx: SheetCtx;
  defs: string;
  /** 底色 rect */
  bgRect: string;
  /** 背景圖 image（沒有時空字串） */
  bgImage: string;
  guides: string;
  /** 陣營框（沒有時空字串＝不出這一層） */
  zones: string;
  edges: string;
  nodes: string;
  names: string;
  legend: string;
  legendInfo: LegendOut;
  /** 便利貼與圖表節點（沒有時空字串＝不出這一層） */
  notes: string;
  /** 角色超出畫布的出血 */
  bleed: number;
  /** 實際外擴（出血 ∪ 界外的圖例／名冊 ∪ 頭像框 ∪ 界外的便利貼） */
  pad: number;
  /** 不算便利貼的外擴（互動網頁的可視範圍從這裡起算） */
  padBase: number;
}

/** 整層關係線：一般線 → 聚合線 → 群體關係線 → 線上標籤 → 標籤網的虛線（拖曳的快速路徑也用） */
export function edgeLayerSvg(ctx: SheetCtx, ectx: EdgeCtx, edit: boolean): string {
  const out = edgesSvg(ectx, colEdgesSvg(ctx, edit) + grelEdgesSvg(ctx));
  return ctx.s.showLabelNodes ? out + labelNetSvg(ctx).lines : out;
}

export function chartParts(sheet: Sheet, opts: RenderOpts): ChartParts {
  const ctx = sheetCtx(sheet, opts.labels ?? [], {
    font: opts.font,
    fonts: opts.fonts,
    frames: opts.frames,
    tw: opts.tween,
  });
  const tw = opts.tween ?? null;
  const edit = opts.mode === 'edit';
  const { W, H, pal } = ctx;
  const pre = opts.idPrefix ?? '';
  const ui = opts.mode === 'edit' ? (opts.ui ?? {}) : null;
  const defs: string[] = [];
  const bgRect = `<rect class="layer-bg" x="0" y="0" width="${W}" height="${H}" fill="${pal.bg}"/>`;
  const bgImg = (id: string | null, op = 1) => {
    const url = id ? opts.href(id) : null;
    return url
      ? `<image class="layer-bg canvas-bgimg" href="${esc(url)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" pointer-events="none"${opAttr(op)}/>`
      : '';
  };
  /* 補間中：兩格不同＝前一張留著、後一張淡入；只有一邊＝淡入或淡出（原作） */
  let bgImage: string;
  if (tw?.bg) {
    const { a, b, t } = tw.bg;
    const bb = a && b && a === b ? null : b;
    bgImage = bgImg(a, !bb && !b ? 1 - t : 1) + bgImg(bb, t);
  } else bgImage = bgImg(sheet.bg);
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
  const lodOn = !!opts.lod && opts.mode !== 'export' && lodDense(ctx);
  if (lodOn) ectx.lod = true;
  const edges = edgeLayerSvg(ctx, ectx, edit);
  let nodes = '';
  let names = '';
  const hidden = labelInfo(ctx).colHidden;
  let lod: NodeLod | null = null;
  if (lodOn) {
    let farKeep: Set<number> | null = null;
    if (ctx.s.showNames) {
      const cand = sheet.chars.filter((c) => charLevel(c) > 0 && c.name && !hidden.has(c.id));
      if (cand.length > FARNAME_MAX) {
        cand.sort((a, b) => charLevel(b) - charLevel(a) || (a.defNo || 0) - (b.defNo || 0));
        farKeep = new Set(cand.slice(0, FARNAME_MAX).map((c) => c.id));
      }
    }
    lod = { farKeep };
  }
  const order = ctx.s.noCollision ? [...sheet.chars].reverse() : sheet.chars;
  for (const c of order) {
    if (hidden.has(c.id)) continue;
    const n = nodeSvg(ctx, c, pre, opts.href, ui, opts.splitNames, lod);
    if (tw) {
      /* 補間：不透明度（進退場、交叉淡化）與翻面（以角色中心為軸橫向縮放；原作的 _op、_flip） */
      const op = opAttr(tw.charOp.get(c.id));
      const f = tw.charFlip.get(c.id);
      const tf =
        f !== undefined
          ? ` transform="translate(${(c.x * (1 - f)).toFixed(2)} 0) scale(${f} 1)"`
          : '';
      const wrap = (s: string) => (s && (op || tf) ? `<g${op}${tf}>${s}</g>` : s);
      nodes += wrap(n.svg);
      names += wrap(n.name);
    } else {
      nodes += n.svg;
      names += n.name;
    }
    if (n.defs) defs.push(n.defs);
  }
  nodes += colNodesSvg(ctx, edit);
  /* 標籤網：虛線在關係線的最上面（edgeLayerSvg）、圓點在角色之上；建立關係模式中標籤網關著時，臨時畫出可以點的圓點 */
  if (ctx.s.showLabelNodes) nodes += labelNetSvg(ctx).nodes;
  else if (ui?.linking) {
    const net = labelNetSvg(ctx);
    if (net.nodes) nodes += `<g class="lbl-temp">${net.nodes}</g>`;
  }
  const zones = zonesSvg(ctx, edit, pre);
  const legendInfo = legendsSvg(ctx, pre, opts.href, edit);
  if (legendInfo.defs) defs.push(legendInfo.defs);
  const notes = notesSvg(ctx, {
    look: noteLook(ctx.s.palette),
    radarTpls: opts.radarTpls,
    library: opts.library,
    ui: edit ? { editing: ui?.noteEdit ?? null } : null,
  });
  const bleed = bleedPad(ctx);
  const padBase = Math.max(
    bleed,
    legendOutPad([legendInfo.rel, legendInfo.lbl, legendInfo.chars], W, H),
    framePad(ctx),
  );
  const pad = Math.max(padBase, noteBleedPad(ctx));
  return {
    ctx,
    defs: defs.join(''),
    bgRect,
    bgImage,
    guides,
    zones,
    edges,
    nodes,
    names,
    legend: legendInfo.svg,
    legendInfo,
    notes,
    bleed,
    pad,
    padBase,
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
  const zones = p.zones ? `<g class="layer-zones" pointer-events="none">${p.zones}</g>` : '';
  const notes = p.notes ? `<g class="layer-notes">${p.notes}</g>` : '';
  return `${bg}${frame}<g class="layer-guides">${opts.transparent ? '' : p.guides}</g>${zones}<g class="layer-edges"${relOpacityAttr(p)}>${p.edges}</g><g class="layer-nodes">${p.nodes}</g>${p.names ? `<g class="layer-names">${p.names}</g>` : ''}<g class="layer-legend">${p.legend}</g>${notes}`;
}

/** 根元素（字型組；匯出時第一個子元素是內嵌的 @font-face） */
export const svgOpen = (ctx: SheetCtx, attrs: string, faceCss?: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs} font-family="${esc(fontStack(ctx.docFont, ctx.fontIds))}">${faceCss ? `<style>${faceCss}</style>` : ''}`;

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
  /* 界外的便利貼：註記等級的告知（不是出血那種警告） */
  const out = notesOutside(p.ctx);
  if (out)
    notes += `<text class="note-out-hint" x="${W / 2}" y="${boundaryY + Math.round(noteFS * 1.5)}" text-anchor="middle" font-size="${noteFS}" font-weight="700" fill="${pal.guide}" opacity="0.9">${esc(S.note.outHint(out))}</text>`;
  if (p.bleed > 0) {
    const text = '角色超出畫布了：外圈的出血區不會進 PNG，請把角色拉回畫布內，或修改畫布尺寸。';
    const fitFS = (viewW * 0.96) / Math.max(1, text.length * 1.02);
    const fs = Math.max(12, Math.round(Math.min(p.bleed * 0.6, fitFS)));
    notes += `<text x="${W / 2}" y="${f1(H + p.bleed * 0.82)}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="${pal.ink}" opacity="0.92">${text}</text>`;
  }
  const svg = `${svgOpen(p.ctx, `class="rc-chart" viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}"`)}${outer}<defs>${p.defs}</defs><g class="canvas-content" transform="translate(${pad},${pad})">${contentLayers(p, { frame: true })}</g><g class="canvas-notes" transform="translate(${pad},${pad})" pointer-events="none">${notes}</g></svg>`;
  return { svg, pad, viewW, viewH, parts: p };
}

/** PNG 用：畫布範圍（W × H），去背時不畫背景與格線 */
export function exportSvg(
  sheet: Sheet,
  opts: Omit<RenderOpts, 'mode'> & { transparent?: boolean },
): string {
  const p = chartParts(sheet, { ...opts, mode: 'export' });
  const { W, H } = p.ctx;
  return `${svgOpen(p.ctx, `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"`, opts.fontFaceCss)}<defs>${p.defs}</defs>${contentLayers(p, { transparent: opts.transparent })}</svg>`;
}

/**
 * 互動網頁的可視範圍：畫布＋外擴（界外的圖例／名冊、出血、頭像框）；有便利貼在畫布外時再併入
 * 「畫布 ∪ 便利貼」外加 16（原作的 viewerViewBox），夾在實際畫出的範圍內。沒有界外便利貼＝和以前相同。
 */
function viewerBox(p: ChartParts): string {
  const { W, H } = p.ctx;
  const b = p.padBase;
  let x0 = 0;
  let y0 = 0;
  let x1 = W;
  let y1 = H;
  for (const n of p.ctx.sheet.notes ?? []) {
    x0 = Math.min(x0, n.x - n.w / 2);
    y0 = Math.min(y0, n.y - n.h / 2);
    x1 = Math.max(x1, n.x + n.w / 2);
    y1 = Math.max(y1, n.y + n.h / 2);
  }
  if (x0 === 0 && y0 === 0 && x1 === W && y1 === H)
    return `${-p.pad} ${-p.pad} ${W + p.pad * 2} ${H + p.pad * 2}`;
  const m = 16;
  x0 = Math.max(-p.pad, Math.min(-b, x0 - m));
  y0 = Math.max(-p.pad, Math.min(-b, y0 - m));
  x1 = Math.min(W + p.pad, Math.max(W + b, x1 + m));
  y1 = Math.min(H + p.pad, Math.max(H + b, y1 + m));
  return `${f1(x0)} ${f1(y0)} ${f1(x1 - x0)} ${f1(y1 - y0)}`;
}

/** 互動網頁用：含界外的圖例／名冊（viewBox 外擴），不含編輯用的標記 */
export function viewerSvg(sheet: Sheet, opts: Omit<RenderOpts, 'mode'>): string {
  const p = chartParts(sheet, { ...opts, mode: 'viewer' });
  return `${svgOpen(p.ctx, `class="chart" viewBox="${viewerBox(p)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`)}<defs>${p.defs}</defs>${contentLayers(p, {})}</svg>`;
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
    { id: 'layer-zones', label: '陣營框', body: p.zones },
    {
      id: 'layer-edges',
      label: '關係線',
      body: p.edges ? `<g${relOpacityAttr(p)}>${p.edges}</g>` : '',
    },
    { id: 'layer-nodes', label: '角色', body: p.nodes },
    { id: 'layer-names', label: '名稱', body: p.names },
    { id: 'layer-legend', label: '圖例', body: p.legend },
    { id: 'layer-notes', label: S.note.layer, body: p.notes },
  ];
  return { defs: p.defs, W: p.ctx.W, H: p.ctx.H, layers: all.filter((l) => l.body) };
}
