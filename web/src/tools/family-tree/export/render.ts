/**
 * 匯出 PNG（規格 3.3）：版面（畫布大小、每張卡片的位置）照原作；配色、字型是本站的。
 * planExport 是純函式（Node 可以測），drawExport 在 canvas 上畫。
 */
import { ensureFont } from '@/core/fonts';
import { roundRectPath } from '@/core/image';
import {
  type CardMode,
  DIMS,
  type Dims,
  type LayoutNode,
  layoutTree,
  viewDims,
} from '../model/layout';
import { usedCategories } from '../model/ops';
import { EXPORT_COLORS } from '../model/palette';
import { descendants, hostOf, shownOf } from '../model/tree';
import type { Board, Category, Member, Person, Spouse } from '../model/types';
import { S } from '../strings';

export type ExportRange = 'all' | 'sub';
export type ExportOrient = 'v' | 'h';
/** 卡片內容：照顯示設定／只有名字／名字＋讀音 */
export type ExportCard = 'view' | 'name' | 'reading';

export interface ExportOptions {
  range: ExportRange;
  orient: ExportOrient;
  card: ExportCard;
  title: boolean;
  gens: boolean;
  spouses: boolean;
}

export interface ViewSettings {
  cardMode: CardMode;
  memo: boolean;
  colors: boolean;
  collapsed: readonly string[];
}

/** 畫法：詳細卡片、簡易卡片（照顯示設定的簡易）、只有名字、名字＋讀音 */
export type DrawMode = 'full' | 'compact' | 'name' | 'reading';

export interface PlacedNode {
  node: LayoutNode;
  x: number;
  y: number;
  parent: PlacedNode | null;
}

export interface ExportPlan {
  mode: DrawMode;
  orient: ExportOrient;
  /** 卡片的尺寸（畫的時候；不對調） */
  dims: Dims;
  /** 世代之間的距離 */
  DG: number;
  minGen: number;
  nodes: PlacedNode[];
  /** 卡片範圍 */
  box: { x0: number; y0: number; x1: number; y1: number; gmin: number; gmax: number };
  /** 圖的大小（倍率 1） */
  width: number;
  height: number;
  /** 卡片範圍左上角在圖上的位置 */
  left: number;
  top: number;
  pad: number;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  title: string | null;
  legend: Category[];
  gens: boolean;
  memo: boolean;
  colors: boolean;
  cats: Category[];
}

/** 輸出的上限（原作）：寬、高 16,000 px，總像素 6,400 萬 */
export const MAX_SIDE = 16000;
export const MAX_PIXELS = 64e6;

export function drawModeOf(
  opts: Pick<ExportOptions, 'card'>,
  view: Pick<ViewSettings, 'cardMode'>,
): DrawMode {
  if (opts.card === 'name') return 'name';
  if (opts.card === 'reading') return 'reading';
  return view.cardMode === 'compact' ? 'compact' : 'full';
}

function dimsOf(mode: DrawMode, memo: boolean): Dims {
  if (mode === 'name') return DIMS.name;
  if (mode === 'reading') return DIMS.reading;
  return viewDims(mode, memo);
}

export interface PlanInput {
  board: Board;
  view: ViewSettings;
  options: ExportOptions;
  /** 「選取的人以下」的那個人 */
  selectedId?: string | null;
  /** 選的倍率（1 或 2） */
  scale: number;
}

/** 卡片位置與畫布大小；沒有可以匯出的卡片時 null（F67） */
export function planExport({
  board,
  view,
  options,
  selectedId,
  scale,
}: PlanInput): ExportPlan | null {
  const mode = drawModeOf(options, view);
  const D = dimsOf(mode, view.memo);
  const hz = options.orient === 'h';
  const full = mode === 'full';
  /* 橫向：兄弟姊妹方向的寬換成卡片高，排好後 x、y 對調 */
  const layoutDims: Dims = hz
    ? { W: D.H, H: D.W, SPW: D.H, GAP: D.GAP, HG: full ? 16 : 10, VG: full ? 64 : 44 }
    : D;
  const DG = layoutDims.VG;
  const L = layoutTree(board.people, {
    dims: layoutDims,
    spouses: options.spouses,
    align: board.align,
    collapsed: view.collapsed,
  });
  let keep: Set<string> | null = null;
  if (options.range === 'sub') {
    const host = selectedId ? hostOf(board.people, board.people[selectedId]) : null;
    if (!host) return null;
    keep = new Set([host.id, ...descendants(board.people, host.id)]);
  }
  const map = new Map<LayoutNode, PlacedNode>();
  const nodes: PlacedNode[] = [];
  for (const n of L.nodes) {
    const placed: PlacedNode = { node: n, x: hz ? n.y : n.x, y: hz ? n.x : n.y, parent: null };
    map.set(n, placed);
    if (!keep || keep.has(n.id)) nodes.push(placed);
  }
  for (const p of nodes) p.parent = p.node.parent ? (map.get(p.node.parent) ?? null) : null;
  if (!nodes.length) return null;

  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  let gmin = Number.POSITIVE_INFINITY;
  let gmax = Number.NEGATIVE_INFINITY;
  for (const p of nodes) {
    const e = extent(p, D, hz);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + e.w);
    y1 = Math.max(y1, p.y + e.h);
    gmin = Math.min(gmin, p.node.gen);
    gmax = Math.max(gmax, p.node.gen);
  }
  const ids = new Set<string>();
  for (const p of nodes) {
    ids.add(p.node.id);
    for (const s of p.node.chips) ids.add(s.id);
  }
  const legend = view.colors ? usedCategories(board, ids) : [];
  const title = options.title ? board.title || S.untitledBoard : null;
  const pad = 40;
  const head = title || legend.length ? 40 : 0;
  const top = pad + head + (hz && options.gens ? 30 : 0);
  const left = !hz && options.gens ? 96 : pad;
  const width = x1 - x0 + left + pad;
  const height = y1 - y0 + top + pad;
  const s = Math.min(
    scale,
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  return {
    mode,
    orient: options.orient,
    dims: D,
    DG,
    minGen: L.minGen,
    nodes,
    box: { x0, y0, x1, y1, gmin, gmax },
    width,
    height,
    left,
    top,
    pad,
    scale: s,
    canvasWidth: Math.ceil(width * s),
    canvasHeight: Math.ceil(height * s),
    title,
    legend,
    gens: options.gens,
    memo: view.memo && mode === 'full',
    colors: view.colors,
    cats: board.cats,
  };
}

/** 卡片＋配偶卡片的範圍 */
function extent(p: PlacedNode, D: Dims, hz: boolean): { w: number; h: number } {
  const n = p.node.chips.length;
  return hz ? { w: D.W, h: D.H + n * (D.H + D.GAP) } : { w: D.W + n * (D.SPW + D.GAP), h: D.H };
}

/** 配偶卡片 i 的左上角 */
export function chipPos(p: PlacedNode, i: number, D: Dims, hz: boolean): { x: number; y: number } {
  return hz
    ? { x: p.x, y: p.y + D.H + D.GAP + i * (D.H + D.GAP) }
    : { x: p.x + D.W + D.GAP + i * (D.SPW + D.GAP), y: p.y };
}

/* ---------- 畫 ---------- */

/** 匯出用的字型：思源黑體，載不到時用系統的黑體 */
export const EXPORT_FONT = 'Noto Sans TC';
const FAMILY = `"${EXPORT_FONT}", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif`;
const font = (weight: number, px: number) => `${weight} ${px}px ${FAMILY}`;

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.closePath();
}

/** 放不下時逐字去掉、加「…」 */
export function fitText(ctx: Pick<Ctx, 'measureText'>, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** 別名：每字換行、最多 2 行，超過的第 2 行末尾加「…」 */
export function aliasLines(ctx: Pick<Ctx, 'measureText'>, t: string, max: number): string[] {
  const out: string[] = [];
  for (const part of t.split('\n')) {
    let line = '';
    for (const ch of part) {
      if (ctx.measureText(line + ch).width > max) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
    out.push(line);
  }
  const L = out.filter((l, i) => l || i < out.length - 1).slice(0, 3);
  if (L.length > 2) L[1] = fitText(ctx, `${L[1]}…`, max);
  return L.slice(0, 2);
}

/** 備註：換行當空白、最多 2 行 */
export function wrap2(ctx: Pick<Ctx, 'measureText'>, t: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of t.replace(/\n/g, ' ')) {
    if (ctx.measureText(line + ch).width > max) {
      out.push(line);
      line = ch;
      if (out.length === 2) {
        line = '';
        break;
      }
    } else line += ch;
  }
  if (out.length < 2 && line) out.push(line);
  if (out.length === 2 && ctx.measureText(t).width > max * 2)
    out[1] = fitText(ctx, `${out[1]}…`, max);
  return out;
}

const years = (p: Person) => (p.birth || p.death ? `${p.birth || ''} – ${p.death || ''}` : '');
const nameOf = (p: Person) => p.name || S.unnamed;

export function exportText(plan: ExportPlan, board: Board): string {
  const parts: string[] = [plan.title ?? '', ...plan.legend.map((c) => c.name)];
  for (const p of plan.nodes) {
    const m = p.node.person;
    parts.push(m.name, m.reading ?? '', m.alias ?? '', years(m), plan.memo ? (m.note ?? '') : '');
    for (const s of p.node.chips) {
      const src = shownOf(board.people, s);
      parts.push(src.name, src.reading ?? '', years(src), s.origin ?? '');
    }
  }
  return `${parts.join('')}${S.genLabel(plan.box.gmax)}${S.unnamed}–…0123456789`;
}

/** 等字型（只下載用到的字）；載不到時用系統字型照畫 */
export async function ensureExportFonts(text: string): Promise<void> {
  await Promise.all([400, 500, 600, 700].map((w) => ensureFont(EXPORT_FONT, w, text)));
}

/** 在 ctx 上畫整張圖（ctx 已經是 canvasWidth × canvasHeight） */
export function drawExport(ctx: Ctx, plan: ExportPlan, board: Board): void {
  const C = EXPORT_COLORS;
  const D = plan.dims;
  const hz = plan.orient === 'h';
  const { x0, y0, x1, y1, gmin, gmax } = plan.box;
  ctx.save();
  ctx.scale(plan.scale, plan.scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  /* 標題與圖例 */
  let lx = plan.pad;
  if (plan.title) {
    ctx.fillStyle = C.text;
    ctx.font = font(700, 22);
    ctx.fillText(plan.title, lx, 44);
    lx += ctx.measureText(plan.title).width + 28;
  }
  if (plan.legend.length) {
    ctx.font = font(400, 12);
    for (const c of plan.legend) {
      const label = c.name || S.catFallback;
      ctx.fillStyle = c.color;
      rr(ctx, lx, 34, 10, 10, 3);
      ctx.fill();
      ctx.fillStyle = C.muted;
      ctx.fillText(label, lx + 15, 43);
      lx += ctx.measureText(label).width + 34;
    }
  }
  ctx.translate(plan.left - x0, plan.top - y0);

  /* 世代標籤與虛線 */
  if (plan.gens) {
    for (let g = gmin; g <= gmax; g++) {
      const d = (g - plan.minGen) * ((hz ? D.W : D.H) + plan.DG);
      ctx.font = font(700, 14);
      ctx.fillStyle = C.text;
      const label = S.genLabel(g);
      if (hz) {
        ctx.textAlign = 'center';
        ctx.fillText(label, d + D.W / 2, y0 - 14);
        ctx.textAlign = 'left';
      } else ctx.fillText(label, x0 - 84, d + D.H / 2 + 5);
      if (g < gmax) {
        ctx.strokeStyle = C.border;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (hz) {
          ctx.moveTo(d + D.W + plan.DG / 2, y0 - 30);
          ctx.lineTo(d + D.W + plan.DG / 2, y1 + 20);
        } else {
          ctx.moveTo(x0 - 84, d + D.H + plan.DG / 2);
          ctx.lineTo(x1 + 20, d + D.H + plan.DG / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /* 親子連線 */
  const kept = new Set(plan.nodes);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1.3;
  for (const n of plan.nodes) {
    const q = n.parent;
    if (!q || !kept.has(q)) continue;
    ctx.beginPath();
    if (hz) {
      const ax = q.x + D.W;
      const ay = q.y + D.H / 2;
      const by = n.y + D.H / 2;
      const m = ax + plan.DG / 2;
      ctx.moveTo(ax, ay);
      ctx.lineTo(m, ay);
      ctx.lineTo(m, by);
      ctx.lineTo(n.x, by);
    } else {
      const ax = q.x + D.W / 2;
      const ay = q.y + D.H;
      const bx = n.x + D.W / 2;
      const m = ay + plan.DG / 2;
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, m);
      ctx.lineTo(bx, m);
      ctx.lineTo(bx, n.y);
    }
    ctx.stroke();
  }

  if (plan.mode === 'full') drawFullCards(ctx, plan, board);
  else drawCompactCards(ctx, plan, board);
  ctx.restore();
}

function catOf(plan: ExportPlan, p: Person): Category | null {
  if (!plan.colors || !p.cat) return null;
  return plan.cats.find((c) => c.id === p.cat) ?? null;
}

/** 卡片底與框：色分類時底色混 14%、框線 60% */
function cardBox(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  cat: Category | null,
  dashed: boolean,
) {
  const C = EXPORT_COLORS;
  ctx.fillStyle = fill;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.fill();
  if (cat) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = cat ? cat.color : C.border;
  ctx.globalAlpha = cat ? 0.6 : 1;
  ctx.lineWidth = 1;
  ctx.setLineDash(dashed && !cat ? [4, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function symbol(ctx: Ctx, x: number, y: number, female: boolean) {
  ctx.fillStyle = EXPORT_COLORS.symbol;
  if (female) {
    ctx.beginPath();
    ctx.arc(x + 4, y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    rr(ctx, x, y, 8, 8, 1.5);
    ctx.fill();
  }
}

const relLabel = (host: Member) => (host.gender === 'F' ? S.husband : S.wife);

function drawFullCards(ctx: Ctx, plan: ExportPlan, board: Board) {
  const C = EXPORT_COLORS;
  const D = plan.dims;
  const { W, H, SPW } = D;
  const hz = plan.orient === 'h';
  for (const n of plan.nodes) {
    const p = n.node.person;
    const { x, y } = n;
    cardBox(ctx, x, y, W, H, 10, C.bg, catOf(plan, p), false);
    symbol(ctx, x + 10, y + 13, p.gender === 'F');
    const nm = nameOf(p);
    const hj = p.reading || '';
    ctx.font = font(600, 14);
    const w0 = ctx.measureText(nm).width;
    ctx.font = font(400, 12);
    const w1 = hj ? ctx.measureText(hj).width : 0;
    const avail = W - 33 - (hj ? 5 : 0);
    const k = Math.min(1, Math.max(0.6, avail / (w0 + w1 || 1)));
    ctx.fillStyle = C.text;
    ctx.font = font(600, 14 * k);
    const name = fitText(ctx, nm, avail);
    ctx.fillText(name, x + 23, y + 22);
    const nw = ctx.measureText(name).width;
    if (hj) {
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 12 * k);
      const room = avail - nw;
      if (room > 8) ctx.fillText(fitText(ctx, hj, room), x + 28 + nw, y + 22);
    }
    ctx.fillStyle = C.muted;
    ctx.font = font(400, 12);
    const yr = years(p);
    if (yr) ctx.fillText(yr, x + 10, y + 40);
    if (p.alias) {
      ctx.font = font(400, 11.5);
      aliasLines(ctx, p.alias, W - 20).forEach((l, i) => {
        ctx.fillText(l, x + 10, y + 57 + i * 14);
      });
    }
    if (plan.memo && p.note) {
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 0.8;
      ctx.font = font(400, 11.5);
      wrap2(ctx, p.note, W - 20).forEach((l, i) => {
        ctx.fillText(l, x + 10, y + H - 24 + i * 15);
      });
      ctx.globalAlpha = 1;
    }
    n.node.chips.forEach((s, i) => {
      const c = chipPos(n, i, D, hz);
      const src = shownOf(board.people, s);
      cardBox(ctx, c.x, c.y, SPW, H, 10, C.chip, catOf(plan, s), true);
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 11);
      ctx.fillText(relLabel(p), c.x + 9, c.y + 18);
      ctx.fillStyle = C.text;
      ctx.font = font(600, 13);
      ctx.fillText(fitText(ctx, nameOf(src), SPW - 18), c.x + 9, c.y + 36);
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 11);
      const sy = years(src);
      if (sy) ctx.fillText(fitText(ctx, sy, SPW - 18), c.x + 9, c.y + 52);
      if (s.origin) ctx.fillText(fitText(ctx, s.origin, SPW - 18), c.x + 9, c.y + 67);
    });
  }
}

/** 一行置中的字：放不下時每次縮小 0.5 px（最小 9 px），再省略 */
function centerLine(
  ctx: Ctx,
  t: string,
  cx: number,
  cy: number,
  weight: number,
  max: number,
  color: string,
  room: number,
) {
  let sz = max;
  ctx.font = font(weight, sz);
  while (sz > 9 && ctx.measureText(t).width > room) {
    sz -= 0.5;
    ctx.font = font(weight, sz);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, t, room), cx, cy);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCompactCards(ctx: Ctx, plan: ExportPlan, board: Board) {
  const C = EXPORT_COLORS;
  const D = plan.dims;
  const { W, H, SPW } = D;
  const hz = plan.orient === 'h';
  const text = (bx: number, y: number, w: number, o: Person, big: number) => {
    const cx = bx + w / 2;
    const room = w - 14;
    if (plan.mode === 'compact') {
      const yt = years(o);
      const rows: [string, number, number, string][] = [[nameOf(o), 700, big - 1, C.text]];
      if (o.reading) rows.push([o.reading, 500, 12.5, C.muted]);
      if (yt) rows.push([yt, 400, 11.5, C.muted]);
      const lh = [17, 15, 14];
      const tot = rows.reduce((a, _, i) => a + lh[i], 0);
      let yy = y + H / 2 - tot / 2;
      rows.forEach((r, i) => {
        centerLine(ctx, r[0], cx, yy + lh[i] / 2 + 1, r[1], r[2], r[3], room);
        yy += lh[i];
      });
    } else if (plan.mode === 'reading' && o.reading) {
      centerLine(ctx, nameOf(o), cx, y + H * 0.36, 700, big, C.text, room);
      centerLine(ctx, o.reading, cx, y + H * 0.72, 500, big - 2, C.muted, room);
    } else centerLine(ctx, nameOf(o), cx, y + H / 2 + 0.5, 700, big, C.text, room);
  };
  for (const n of plan.nodes) {
    const p = n.node.person;
    cardBox(ctx, n.x, n.y, W, H, 7, C.bg, catOf(plan, p), false);
    text(n.x, n.y, W, p, 17);
    n.node.chips.forEach((s: Spouse, i) => {
      const c = chipPos(n, i, D, hz);
      /* 原作以卡片寬畫配偶卡片的框（簡易卡片時比預留的寬，D13）；新版以配偶卡片的寬 */
      cardBox(ctx, c.x, c.y, SPW, H, 7, C.chip, catOf(plan, s), true);
      text(c.x, c.y, SPW, shownOf(board.people, s), 15);
    });
  }
}

/** 畫成 PNG */
export async function renderExportPng(plan: ExportPlan, board: Board): Promise<Blob> {
  await ensureExportFonts(exportText(plan, board));
  const canvas = document.createElement('canvas');
  canvas.width = plan.canvasWidth;
  canvas.height = plan.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  drawExport(ctx, plan, board);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('toBlob');
  return blob;
}
