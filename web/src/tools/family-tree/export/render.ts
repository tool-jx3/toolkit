/**
 * 匯出 PNG／SVG（規格 3.3；第二批 F80～F88）：版面（畫布大小、每張卡片的位置）照原作；配色、字型是本站的。
 * planExport 是純函式（Node 可以測），drawExport 畫在 canvas（PNG）或 SvgContext（SVG）上——同一份畫法。
 * 第二批：「出」字小卡與紅色虛線、「入」與狀態的印記、說明行（過繼、外孫、婚姻）、女兒的寫法、婚姻連線、
 * 框選範圍、PL 用／GM 用（PL 用拿掉 GM 專用的人與欄位；GM 用標題列寫「GM 用」、GM 專用的人畫斜線）、頭像。
 */
import { ensureFont, fetchGoogleFontSubset } from '@/core/fonts';
import { DEFAULT_PLACEMENT, drawPlacedCrop, roundRectPath } from '@/core/image';
import { hasSecrets, hiddenIds, plPeople } from '../model/gm';
import {
  AVATAR,
  type CardMode,
  DIMS,
  type Dims,
  type LayoutNode,
  layoutTree,
  viewDims,
} from '../model/layout';
import { avatarIds, hasGmInfo, usedCategories } from '../model/ops';
import { EXPORT_COLORS } from '../model/palette';
import { chipText, initialOf, memberText, stubText } from '../model/present';
import { descendants, hostOf, linkedBy, linkOf } from '../model/tree';
import type { Board, Category, People, Person } from '../model/types';
import { S } from '../strings';
import { SvgContext } from './svgctx';

export type ExportRange = 'all' | 'sub' | 'area';
/** 對象：PL 用（拿掉 GM 專用，規格 F86）／GM 用 */
export type ExportAudience = 'pl' | 'gm';
export type ExportFormat = 'png' | 'svg';
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
  /** 沒寫＝PL 用 */
  audience?: ExportAudience;
}

export interface ViewSettings {
  cardMode: CardMode;
  memo: boolean;
  colors: boolean;
  collapsed: readonly string[];
  /** 母系外孫（沒寫＝顯示） */
  maternal?: boolean;
  /** 「出」字小卡（沒寫＝顯示） */
  stubs?: boolean;
  /** 婚姻連線（沒寫＝畫） */
  links?: boolean;
  /** 女兒寫成「女（適 丈夫）」 */
  daughterName?: boolean;
  /** 頭像（沒寫＝畫；有人有頭像時「照顯示設定」的卡片多頭像那一欄） */
  avatars?: boolean;
}

/** 畫法：詳細卡片、簡易卡片（照顯示設定的簡易）、只有名字、名字＋讀音 */
export type DrawMode = 'full' | 'compact' | 'name' | 'reading';

export interface PlacedNode {
  node: LayoutNode;
  x: number;
  y: number;
  parent: PlacedNode | null;
}

/** 婚姻連線（匯出座標的三次貝茲） */
export interface ExportLink {
  x0: number;
  y0: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x1: number;
  y1: number;
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
  /** 畫的人物資料（PL 用時是 PL 版） */
  people: People;
  audience: ExportAudience;
  /** GM 用而且有 GM 專用的東西：標題列寫「GM 用」、畫 GM 的標記 */
  gmMarks: boolean;
  /** PL 版會拿掉的人（GM 專用的人連同子孫、他們的配偶、連到他們的婚姻的配偶卡片；GM 用的圖畫斜線） */
  gmScope: ReadonlySet<string>;
  daughterName: boolean;
  links: ExportLink[];
  /** 用到的頭像（資產 id；dims.AV 有值時才畫） */
  avatars: string[];
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

function dimsOf(mode: DrawMode, memo: boolean, avatar: boolean): Dims {
  if (mode === 'name') return DIMS.name;
  if (mode === 'reading') return DIMS.reading;
  return viewDims(mode, memo, avatar);
}

export interface PlanInput {
  board: Board;
  view: ViewSettings;
  options: ExportOptions;
  /** 「選取的人以下」的那個人 */
  selectedId?: string | null;
  /** 框選的卡片（成員 m:id、「出」字小卡 s:id） */
  areaKeys?: readonly string[] | null;
  /** 選的倍率（1 或 2） */
  scale: number;
}

const keyOf = (n: LayoutNode) => `${n.stub ? 's' : 'm'}:${n.id}`;

/** 卡片位置與畫布大小；沒有可以匯出的卡片時 null（F67） */
export function planExport({
  board,
  view,
  options,
  selectedId,
  areaKeys,
  scale,
}: PlanInput): ExportPlan | null {
  const audience: ExportAudience = options.audience ?? 'pl';
  const people = audience === 'pl' ? plPeople(board.people) : board.people;
  const mode = drawModeOf(options, view);
  const avatars =
    view.avatars !== false && (mode === 'full' || mode === 'compact') ? avatarIds(people) : [];
  const D = dimsOf(mode, view.memo, avatars.length > 0);
  const hz = options.orient === 'h';
  const full = mode === 'full';
  /* 橫向：兄弟姊妹方向的寬換成卡片高，排好後 x、y 對調 */
  const layoutDims: Dims = hz
    ? { W: D.H, H: D.W, SPW: D.H, GAP: D.GAP, HG: full ? 16 : 10, VG: full ? 64 : 44 }
    : D;
  const DG = layoutDims.VG;
  const L = layoutTree(people, {
    dims: layoutDims,
    spouses: options.spouses,
    align: board.align,
    collapsed: view.collapsed,
    maternal: view.maternal !== false,
    stubs: view.stubs !== false,
    daughterName: !!view.daughterName,
  });
  let keep: ((n: LayoutNode) => boolean) | null = null;
  if (options.range === 'sub') {
    const host = selectedId ? hostOf(people, people[selectedId]) : null;
    if (!host) return null;
    const ids = new Set([host.id, ...descendants(people, host.id)]);
    keep = (n) => (n.stub ? !!n.parent && ids.has(n.parent.id) : ids.has(n.id));
  } else if (options.range === 'area') {
    if (!areaKeys?.length) return null;
    const keys = new Set(areaKeys);
    keep = (n) => keys.has(keyOf(n));
  }
  const map = new Map<LayoutNode, PlacedNode>();
  const nodes: PlacedNode[] = [];
  for (const n of L.nodes) {
    const placed: PlacedNode = { node: n, x: hz ? n.y : n.x, y: hz ? n.x : n.y, parent: null };
    map.set(n, placed);
    if (!keep || keep(n)) nodes.push(placed);
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
  /* 圖例：範圍內的成員與（畫配偶時）他們所有的配偶（原作同） */
  const ids = new Set<string>();
  for (const p of nodes) {
    if (p.node.stub) continue;
    ids.add(p.node.id);
    if (options.spouses) for (const s of L.index.spouses.get(p.node.id) ?? []) ids.add(s.id);
  }
  const legend = view.colors ? usedCategories({ ...board, people }, ids) : [];
  const gmMarks = audience === 'gm' && hasSecrets(board.people);
  const title = options.title ? board.title || S.untitledBoard : null;
  const pad = 40;
  const head = title || legend.length || gmMarks ? 40 : 0;
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
  /* GM 用：PL 版會拿掉的人都畫斜線（連到只有 GM 看得到的人的配偶卡片也是） */
  const gmScope: ReadonlySet<string> = gmMarks ? hiddenIds(people) : new Set<string>();
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
    people,
    audience,
    gmMarks,
    gmScope,
    daughterName: !!view.daughterName,
    links: view.links !== false && options.spouses ? exportLinks(people, nodes, D, hz, DG, L) : [],
    avatars: D.AV ? avatars : [],
  };
}

/** 卡片＋配偶卡片的範圍（「出」字小卡沒有配偶卡片） */
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

/**
 * 婚姻連線（匯出，同原作）：範圍內兩邊都有的才畫。縱向同畫面；橫向時同一欄往右拱（min(60, DG × 0.8)）、
 * 不同欄從左邊那張的右邊到右邊那張的左邊畫 S 形。
 */
function exportLinks(
  people: People,
  nodes: PlacedNode[],
  D: Dims,
  hz: boolean,
  DG: number,
  L: ReturnType<typeof layoutTree>,
): ExportLink[] {
  const { W, H, SPW } = D;
  const pos = new Map<string, { x: number; y: number }>();
  const chips = new Map<string, { x: number; y: number; w: number }>();
  for (const n of nodes) {
    if (n.node.stub) continue;
    pos.set(n.node.id, { x: n.x, y: n.y });
    n.node.chips.forEach((s, i) => {
      chips.set(s.id, { ...chipPos(n, i, D, hz), w: SPW });
    });
    if (!n.node.chips.length)
      for (const s of L.index.spouses.get(n.node.id) ?? [])
        chips.set(s.id, { x: n.x, y: n.y, w: W });
  }
  const out: ExportLink[] = [];
  const seen = new Set<string>();
  for (const s of Object.values(people)) {
    const l = linkOf(people, s);
    if (!l || s.kind !== 'spouse') continue;
    const a = chips.get(s.id);
    const b = pos.get(l.id);
    if (!a || !b || !pos.has(s.spouseOf)) continue;
    const key = [s.spouseOf, l.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (hz) {
      const aw = a.w || SPW;
      const ay = a.y + H / 2;
      const by = b.y + H / 2;
      if (Math.abs(a.x - b.x) < 1) {
        const xr = Math.max(a.x + aw, b.x + W);
        const k = Math.min(60, DG * 0.8);
        out.push({
          x0: a.x + aw,
          y0: ay,
          c1x: xr + k,
          c1y: ay,
          c2x: xr + k,
          c2y: by,
          x1: b.x + W,
          y1: by,
        });
      } else {
        const L1 = a.x < b.x ? { x: a.x + aw, y: ay } : { x: b.x + W, y: by };
        const R1 = a.x < b.x ? { x: b.x, y: by } : { x: a.x, y: ay };
        const k = (R1.x - L1.x) / 2;
        out.push({
          x0: L1.x,
          y0: L1.y,
          c1x: L1.x + k,
          c1y: L1.y,
          c2x: R1.x - k,
          c2y: R1.y,
          x1: R1.x,
          y1: R1.y,
        });
      }
    } else {
      const ax = a.x + (a.w || SPW) / 2;
      const bx = b.x + W / 2;
      if (Math.abs(a.y - b.y) < 1) {
        const up = Math.min(70, DG * 0.8);
        out.push({
          x0: ax,
          y0: a.y,
          c1x: ax,
          c1y: a.y - up,
          c2x: bx,
          c2y: b.y - up,
          x1: bx,
          y1: b.y,
        });
      } else {
        const T = a.y < b.y ? { x: ax, y: a.y + H } : { x: bx, y: b.y + H };
        const B = a.y < b.y ? { x: bx, y: b.y } : { x: ax, y: a.y };
        const k = (B.y - T.y) / 2;
        out.push({
          x0: T.x,
          y0: T.y,
          c1x: T.x,
          c1y: T.y + k,
          c2x: B.x,
          c2y: B.y - k,
          x1: B.x,
          y1: B.y,
        });
      }
    }
  }
  return out;
}

/* ---------- 畫 ---------- */

/** 匯出用的字型：思源黑體，載不到時用系統的黑體 */
export const EXPORT_FONT = 'Noto Sans TC';
const FAMILY = `"${EXPORT_FONT}", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif`;
const font = (weight: number, px: number) => `${weight} ${px}px ${FAMILY}`;

/** 畫法用到的 canvas 功能（真的 canvas 與 SvgContext 都有） */
export type DrawCtx = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'scale'
  | 'translate'
  | 'fillRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'arc'
  | 'bezierCurveTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillText'
  | 'measureText'
  | 'setLineDash'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
> & { drawImage(img: HTMLCanvasElement, x: number, y: number, w: number, h: number): void };

type Ctx = DrawCtx;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundRectPath(ctx as unknown as CanvasPath, x, y, w, h, r);
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

/** 字型下載用：圖上會出現的字 */
export function exportText(plan: ExportPlan): string {
  const parts: string[] = [plan.title ?? '', ...plan.legend.map((c) => c.name), S.gmBand];
  const lb = linkedBy(plan.people);
  for (const p of plan.nodes) {
    const m = p.node.person;
    if (p.node.stub) {
      const t = stubText(plan.people, m);
      parts.push(t.name, t.meta, S.sealOut);
      continue;
    }
    const t = memberText(plan.people, m, lb, plan.daughterName);
    parts.push(
      t.name,
      t.reading,
      t.meta ?? '',
      t.alias ?? '',
      years(m),
      plan.memo ? (m.note ?? '') : '',
    );
    parts.push(S.sealIn, S.statusSeal.dead, S.statusSeal.missing, initialOf(m.name));
    for (const s of p.node.chips) {
      const c = chipText(plan.people, m, s);
      parts.push(
        c.rel,
        S.linkedChip,
        c.src.name,
        c.src.reading ?? '',
        years(c.src),
        s.origin ?? '',
      );
    }
  }
  return `${parts.join('')}${S.genLabel(plan.box.gmax)}${S.unnamed}·–…0123456789`;
}

/** 等字型（只下載用到的字）；載不到時用系統字型照畫 */
export async function ensureExportFonts(text: string): Promise<void> {
  await Promise.all([400, 500, 600, 700].map((w) => ensureFont(EXPORT_FONT, w, text)));
}

/** 頭像：每個資產 id 先畫成圓形的小圖（匯出的倍率），畫的時候直接貼上 */
export type AvatarImages = ReadonlyMap<string, HTMLCanvasElement>;

/** 把頭像畫成圓形（直徑 size × scale 的畫布；位置照 avatarPos） */
export function prepareAvatars(
  people: People,
  ids: readonly string[],
  bitmaps: ReadonlyMap<string, ImageBitmap>,
  size: number,
  scale: number,
): Map<string, HTMLCanvasElement> {
  const out = new Map<string, HTMLCanvasElement>();
  const px = Math.max(1, Math.ceil(size * scale * 1.25));
  for (const p of Object.values(people)) {
    if (!p.avatar || !ids.includes(p.avatar)) continue;
    const key = avatarKey(p);
    if (out.has(key)) continue;
    const bmp = bitmaps.get(p.avatar);
    if (!bmp) continue;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    ctx.clip();
    drawPlacedCrop(
      ctx,
      bmp,
      { width: bmp.width, height: bmp.height },
      { x: 0, y: 0, width: px, height: px },
      p.avatarPos ?? DEFAULT_PLACEMENT,
    );
    out.set(key, c);
  }
  return out;
}

/** 頭像圖的鍵（同一張圖、不同位置是不同的圓） */
const avatarKey = (p: Person) =>
  `${p.avatar}|${p.avatarPos ? `${p.avatarPos.zoom},${p.avatarPos.x},${p.avatarPos.y},${p.avatarPos.turns}` : ''}`;

/** 在 ctx 上畫整張圖（PNG：ctx 已經是 canvasWidth × canvasHeight；SVG：plan.scale＝1） */
export function drawExport(
  ctx: Ctx,
  plan: ExportPlan,
  board: Board,
  avatars: AvatarImages = new Map(),
): void {
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

  /* 標題與圖例；GM 用的圖再加「GM 用」 */
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
  if (plan.gmMarks) {
    ctx.font = font(700, 12);
    const w = ctx.measureText(S.gmBand).width + 14;
    ctx.fillStyle = C.gm;
    rr(ctx, lx, 27, w, 22, 6);
    ctx.fill();
    ctx.fillStyle = C.gmText;
    ctx.fillText(S.gmBand, lx + 7, 42);
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

  /* 親子連線（「出」字小卡是紅色虛線） */
  const kept = new Set(plan.nodes);
  ctx.lineWidth = 1.3;
  for (const n of plan.nodes) {
    const q = n.parent;
    if (!q || !kept.has(q)) continue;
    ctx.strokeStyle = n.node.stub ? C.out : C.edge;
    ctx.setLineDash(n.node.stub ? [4, 3] : []);
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
  ctx.setLineDash([]);

  /* 跨家系的婚姻連線（紫色虛線） */
  if (plan.links.length) {
    ctx.strokeStyle = C.link;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    for (const l of plan.links) {
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      ctx.bezierCurveTo(l.c1x, l.c1y, l.c2x, l.c2y, l.x1, l.y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (plan.mode === 'full') drawFullCards(ctx, plan, avatars);
  else drawCompactCards(ctx, plan, avatars);
  ctx.restore();
  void board;
}

function catOf(plan: ExportPlan, p: Person): Category | null {
  if (!plan.colors || !p.cat) return null;
  return plan.cats.find((c) => c.id === p.cat) ?? null;
}

/** GM 專用的人：GM 色的淡斜線（剪在卡片的圓角裡） */
function hatch(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.clip();
  ctx.strokeStyle = EXPORT_COLORS.gmHatch;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  for (let t = -h; t < w; t += 9) {
    ctx.beginPath();
    ctx.moveTo(x + t, y + h);
    ctx.lineTo(x + t + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 有 GM 筆記或 PL 看不到的欄位：右上角的小三角（剪在卡片的圓角裡） */
function secretCorner(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.clip();
  ctx.fillStyle = EXPORT_COLORS.gm;
  ctx.beginPath();
  ctx.moveTo(x + w - 12, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 卡片底與框：色分類時底色混 14%、框線 60%；連結的配偶卡片是紫色實線 */
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
  stroke: string = EXPORT_COLORS.border,
  strokeAlpha = 1,
) {
  ctx.fillStyle = fill;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.fill();
  if (cat) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = cat ? cat.color : stroke;
  ctx.globalAlpha = cat ? 0.6 : strokeAlpha;
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

type SealKind = 'in' | 'out' | 'dead' | 'missing';

/** 印記：18 px 高的圓角方塊（同原作的「入」「出」；狀態「歿」「失蹤」是本站的） */
function seal(ctx: Ctx, x: number, y: number, w: number, t: string, kind: SealKind) {
  const C = EXPORT_COLORS;
  const fg = { in: C.in, out: C.out, dead: C.deadText, missing: C.missing }[kind];
  const bg = { in: C.inBg, out: C.outBg, dead: C.dead, missing: C.missingBg }[kind];
  ctx.fillStyle = bg;
  rr(ctx, x, y, w, 18, 5);
  ctx.fill();
  if (kind !== 'dead') {
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash(kind === 'missing' ? [2, 2] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = fg;
  ctx.font = font(600, 11);
  ctx.textAlign = 'center';
  ctx.fillText(t, x + w / 2, y + 13);
  ctx.textAlign = 'left';
}

const sealWidth = (t: string) => (Array.from(t).length > 1 ? 28 : 18);

/** 卡片右上的印記（狀態在「入」的左邊）；回傳占掉的寬（名字的空間要扣掉；原作的「入」是 24） */
function drawSeals(
  ctx: Ctx,
  x: number,
  y: number,
  W: number,
  list: { kind: SealKind; text: string }[],
): number {
  let r = x + W - 10;
  let used = 0;
  for (const s of [...list].reverse()) {
    const w = sealWidth(s.text);
    seal(ctx, r - w, y, w, s.text, s.kind);
    r -= w + 6;
    used += w + 6;
  }
  return used;
}

function sealList(t: { adopted: boolean; status: 'dead' | 'missing' | null }) {
  const out: { kind: SealKind; text: string }[] = [];
  if (t.status) out.push({ kind: t.status, text: S.statusSeal[t.status] });
  if (t.adopted) out.push({ kind: 'in', text: S.sealIn });
  return out;
}

/** 配偶卡片的狀態印記（小的，接在「妻／夫」後面；F85） */
function chipStatus(ctx: Ctx, p: Person, x: number, y: number) {
  const st = p.status === 'dead' || p.status === 'missing' ? p.status : null;
  if (!st) return;
  const C = EXPORT_COLORS;
  const t = S.statusSeal[st];
  const w = Array.from(t).length > 1 ? 22 : 14;
  ctx.fillStyle = st === 'dead' ? C.dead : C.missingBg;
  rr(ctx, x, y, w, 14, 4);
  ctx.fill();
  ctx.fillStyle = st === 'dead' ? C.deadText : C.missing;
  ctx.font = font(600, 9.5);
  ctx.textAlign = 'center';
  ctx.fillText(t, x + w / 2, y + 10.5);
  ctx.textAlign = 'left';
}

/** 頭像（圓形）；沒有圖時名字的第一個字 */
function drawAvatar(ctx: Ctx, p: Person, cx: number, cy: number, d: number, avatars: AvatarImages) {
  const C = EXPORT_COLORS;
  const img = p.avatar ? avatars.get(avatarKey(p)) : undefined;
  if (img) {
    ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d);
  } else {
    ctx.fillStyle = C.avatarBg;
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fill();
    const ch = initialOf(p.name);
    if (ch) {
      ctx.fillStyle = C.muted;
      ctx.font = font(600, Math.round(d * 0.42));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, cx, cy + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2 - 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function gmMarkFor(plan: ExportPlan, p: Person) {
  if (!plan.gmMarks) return { only: false, info: false };
  return { only: plan.gmScope.has(p.id), info: hasGmInfo(p) };
}

function drawFullCards(ctx: Ctx, plan: ExportPlan, avatars: AvatarImages) {
  const C = EXPORT_COLORS;
  const D = plan.dims;
  const { W, H, SPW } = D;
  const AV = D.AV ?? 0;
  const hz = plan.orient === 'h';
  const people = plan.people;
  const lb = linkedBy(people);
  for (const n of plan.nodes) {
    const p = n.node.person;
    const { x, y } = n;
    /* 頭像那一欄：卡片的內容整個往右移 AV */
    const tx = x + AV;
    const TW = W - AV;
    if (n.node.stub) {
      const t = stubText(people, p);
      cardBox(ctx, x, y, W, H, 10, C.outBg, null, true, C.out);
      if (AV) drawAvatar(ctx, p, x + AVATAR.full.left + 20, y + AVATAR.full.top + 20, 40, avatars);
      symbol(ctx, tx + 10, y + 14, p.gender === 'F');
      ctx.fillStyle = C.text;
      ctx.font = font(600, 13.5);
      ctx.fillText(fitText(ctx, t.name, TW - 50), tx + 23, y + 22);
      drawSeals(ctx, x, y + 9, W, [{ kind: 'out', text: S.sealOut }]);
      ctx.fillStyle = C.out;
      ctx.font = font(400, 11.5);
      ctx.fillText(fitText(ctx, t.meta, TW - 20), tx + 10, y + 42);
      continue;
    }
    const gm = gmMarkFor(plan, p);
    cardBox(ctx, x, y, W, H, 10, C.bg, catOf(plan, p), false);
    if (gm.only) hatch(ctx, x, y, W, H, 10);
    if (gm.info) secretCorner(ctx, x, y, W, H, 10);
    if (AV) drawAvatar(ctx, p, x + AVATAR.full.left + 20, y + AVATAR.full.top + 20, 40, avatars);
    symbol(ctx, tx + 10, y + 13, p.gender === 'F');
    const t = memberText(people, p, lb, plan.daughterName);
    const nm = t.name || S.unnamed;
    const hj = t.reading;
    const used = drawSeals(ctx, x, y + 8, W, sealList(t));
    ctx.font = font(600, 14);
    const w0 = ctx.measureText(nm).width;
    ctx.font = font(400, 12);
    const w1 = hj ? ctx.measureText(hj).width : 0;
    const avail = TW - 33 - (hj ? 5 : 0) - used;
    const k = Math.min(1, Math.max(0.6, avail / (w0 + w1 || 1)));
    ctx.fillStyle = C.text;
    ctx.font = font(600, 14 * k);
    const name = fitText(ctx, nm, avail);
    ctx.fillText(name, tx + 23, y + 22);
    const nw = ctx.measureText(name).width;
    if (hj) {
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 12 * k);
      const room = avail - nw;
      if (room > 8) ctx.fillText(fitText(ctx, hj, room), tx + 28 + nw, y + 22);
    }
    ctx.fillStyle = C.muted;
    ctx.font = font(400, 12);
    const yr = years(p);
    if (yr) ctx.fillText(yr, tx + 10, y + 40);
    if (t.meta) {
      ctx.font = font(400, 11.5);
      (t.metaIsAlias ? aliasLines(ctx, t.meta, TW - 20) : [fitText(ctx, t.meta, TW - 20)]).forEach(
        (l, i) => {
          ctx.fillText(l, tx + 10, y + 57 + i * 14);
        },
      );
      if (t.alias) {
        const al = aliasLines(ctx, t.alias, TW - 20);
        const more = al.length > 1 || t.alias.trim().includes('\n');
        ctx.fillText(more ? fitText(ctx, `${al[0]}…`, TW - 20) : al[0], tx + 10, y + 71);
      }
    }
    if (plan.memo && p.note) {
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 0.8;
      ctx.font = font(400, 11.5);
      wrap2(ctx, p.note, TW - 20).forEach((l, i) => {
        ctx.fillText(l, tx + 10, y + H - 24 + i * 15);
      });
      ctx.globalAlpha = 1;
    }
    n.node.chips.forEach((s, i) => {
      const c = chipPos(n, i, D, hz);
      const ct = chipText(people, p, s);
      const sgm = gmMarkFor(plan, s);
      cardBox(
        ctx,
        c.x,
        c.y,
        SPW,
        H,
        10,
        C.chip,
        catOf(plan, s),
        !ct.linked,
        ct.linked ? C.link : C.border,
        ct.linked ? 0.5 : 1,
      );
      if (sgm.only) hatch(ctx, c.x, c.y, SPW, H, 10);
      if (sgm.info) secretCorner(ctx, c.x, c.y, SPW, H, 10);
      if (AV && ct.src.avatar) drawAvatar(ctx, ct.src, c.x + SPW - 18, c.y + 16, 20, avatars);
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 11);
      const rel = ct.linked ? `${ct.rel} · ${S.linkedChip}` : ct.rel;
      ctx.fillText(rel, c.x + 9, c.y + 18);
      chipStatus(ctx, ct.src, c.x + 9 + ctx.measureText(rel).width + 4, c.y + 7);
      ctx.fillStyle = C.text;
      ctx.font = font(600, 13);
      ctx.fillText(fitText(ctx, nameOf(ct.src), SPW - 18), c.x + 9, c.y + 36);
      ctx.fillStyle = C.muted;
      ctx.font = font(400, 11);
      const sy = years(ct.src);
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

function drawCompactCards(ctx: Ctx, plan: ExportPlan, avatars: AvatarImages) {
  const C = EXPORT_COLORS;
  const D = plan.dims;
  const { W, H, SPW } = D;
  const AV = D.AV ?? 0;
  const hz = plan.orient === 'h';
  const people = plan.people;
  const lb = linkedBy(people);
  interface Lines {
    name: string;
    reading?: string;
    birth?: string;
    death?: string;
  }
  const text = (bx: number, y: number, w: number, o: Lines, big: number) => {
    const cx = bx + w / 2;
    const room = w - 14;
    if (plan.mode === 'compact') {
      const yt = o.birth || o.death ? `${o.birth || ''} – ${o.death || ''}` : '';
      const rows: [string, number, number, string][] = [
        [o.name || S.unnamed, 700, big - 1, C.text],
      ];
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
      centerLine(ctx, o.name || S.unnamed, cx, y + H * 0.36, 700, big, C.text, room);
      centerLine(ctx, o.reading, cx, y + H * 0.72, 500, big - 2, C.muted, room);
    } else centerLine(ctx, o.name || S.unnamed, cx, y + H / 2 + 0.5, 700, big, C.text, room);
  };
  /** 右上角的小字印記（原作的「入」「出」；狀態在左邊） */
  const marks = (x: number, y: number, list: { kind: SealKind; text: string }[]) => {
    let r = x + W - 3;
    for (const m of [...list].reverse()) {
      ctx.font = font(700, 10);
      const w = ctx.measureText(m.text).width;
      ctx.fillStyle = { in: C.in, out: C.out, dead: C.deadMark, missing: C.missing }[m.kind];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.text, r - Math.max(10, w) / 2, y + 9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      r -= Math.max(10, w) + 4;
    }
  };
  const av = AVATAR.compact;
  for (const n of plan.nodes) {
    const p = n.node.person;
    const tx = n.x + AV;
    const TW = W - AV;
    if (n.node.stub) {
      cardBox(ctx, n.x, n.y, W, H, 7, C.outBg, null, true, C.out);
      if (AV) drawAvatar(ctx, p, n.x + av.left + av.size / 2, n.y + H / 2, av.size, avatars);
      text(tx, n.y, TW, plan.mode === 'compact' ? { name: p.name, reading: p.reading } : p, 15);
      marks(n.x, n.y, [{ kind: 'out', text: S.sealOut }]);
      continue;
    }
    const gm = gmMarkFor(plan, p);
    const t = memberText(people, p, lb, plan.daughterName);
    cardBox(ctx, n.x, n.y, W, H, 7, C.bg, catOf(plan, p), false);
    if (gm.only) hatch(ctx, n.x, n.y, W, H, 7);
    if (gm.info) secretCorner(ctx, n.x, n.y, W, H, 7);
    if (AV) drawAvatar(ctx, p, n.x + av.left + av.size / 2, n.y + H / 2, av.size, avatars);
    text(
      tx,
      n.y,
      TW,
      t.daughter ? { name: t.name, reading: t.reading, birth: p.birth, death: p.death } : p,
      17,
    );
    marks(n.x, n.y, sealList(t));
    n.node.chips.forEach((s, i) => {
      const c = chipPos(n, i, D, hz);
      const ct = chipText(people, p, s);
      const sgm = gmMarkFor(plan, s);
      /* 原作以卡片寬畫配偶卡片的框（簡易卡片時比預留的寬，D13）；新版以配偶卡片的寬 */
      cardBox(
        ctx,
        c.x,
        c.y,
        SPW,
        H,
        7,
        C.chip,
        catOf(plan, s),
        !ct.linked,
        ct.linked ? C.link : C.border,
      );
      if (sgm.only) hatch(ctx, c.x, c.y, SPW, H, 7);
      if (sgm.info) secretCorner(ctx, c.x, c.y, SPW, H, 7);
      if (AV && ct.src.avatar) drawAvatar(ctx, ct.src, c.x + SPW - 12, c.y + 12, 16, avatars);
      chipStatus(ctx, ct.src, c.x + 4, c.y + 3);
      text(c.x, c.y, SPW, ct.src, 15);
    });
  }
}

/* ---------- 輸出 ---------- */

/** 畫成 PNG */
export async function renderExportPng(
  plan: ExportPlan,
  board: Board,
  bitmaps: ReadonlyMap<string, ImageBitmap> = new Map(),
): Promise<Blob> {
  await ensureExportFonts(exportText(plan));
  const canvas = document.createElement('canvas');
  canvas.width = plan.canvasWidth;
  canvas.height = plan.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const size = plan.mode === 'full' ? AVATAR.full.size : AVATAR.compact.size;
  const avatars = prepareAvatars(plan.people, plan.avatars, bitmaps, size, plan.scale);
  drawExport(ctx as unknown as Ctx, plan, board, avatars);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('toBlob');
  return blob;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const uRange = (chars: string[]) =>
  chars.map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(',');

/**
 * 嵌入字型：每種粗細下載只含用到的字的子集（Google Fonts），寫成 @font-face（每批字一條，附 unicode-range）。
 * 下載不到時 null（SVG 用看的人電腦上的字型）。
 */
async function embedFonts(
  chars: Map<string, Set<string>>,
  timeoutMs = 12000,
): Promise<string | null> {
  const work = (async () => {
    const rules: string[] = [];
    for (const [weight, set] of chars) {
      const list = [...set].filter((c) => c.trim());
      for (let i = 0; i < list.length; i += 200) {
        const part = list.slice(i, i + 200);
        const files = await fetchGoogleFontSubset(
          EXPORT_FONT,
          Number(weight) || 400,
          part.join(''),
          {
            maxChars: 200,
          },
        );
        for (const f of files)
          rules.push(
            `@font-face{font-family:"${EXPORT_FONT}";font-weight:${weight};src:url(data:font/woff2;base64,${toBase64(f)}) format("woff2");unicode-range:${uRange(part)};}`,
          );
      }
    }
    return rules.join('\n');
  })();
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}

/** 畫成 SVG（向量；倍率 1）。fontEmbedded：字型有沒有嵌進去 */
export async function renderExportSvg(
  plan: ExportPlan,
  board: Board,
  bitmaps: ReadonlyMap<string, ImageBitmap> = new Map(),
): Promise<{ blob: Blob; fontEmbedded: boolean }> {
  await ensureExportFonts(exportText(plan));
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('canvas');
  const flat: ExportPlan = { ...plan, scale: 1 };
  const svg = new SvgContext(measure);
  const size = plan.mode === 'full' ? AVATAR.full.size : AVATAR.compact.size;
  const avatars = prepareAvatars(plan.people, plan.avatars, bitmaps, size, 2);
  drawExport(svg as unknown as Ctx, flat, board, avatars);
  const css = await embedFonts(svg.chars);
  const text = svg.toSvg(plan.width, plan.height, css ?? '', plan.title ?? '');
  return { blob: new Blob([text], { type: 'image/svg+xml' }), fontEmbedded: !!css };
}
