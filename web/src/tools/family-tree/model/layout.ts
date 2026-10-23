/**
 * 家系圖的排版（規格 3.1，與原作逐張卡片相同）：一代一列；每個子樹記住每一列的左右輪廓，
 * 兄弟姊妹往左靠到每一代都至少相隔 HG；家系之間 3 × HG。純函式。
 */
import { indexTree, type LineOptions, type TreeIndex } from './tree';
import type { Align, Member, People, Spouse } from './types';

/** 卡片與間距（px） */
export interface Dims {
  /** 卡片寬 */
  W: number;
  /** 卡片高 */
  H: number;
  /** 配偶卡片寬 */
  SPW: number;
  /** 配偶卡片與卡片的間距 */
  GAP: number;
  /** 同一列相鄰子樹的最小間距 */
  HG: number;
  /** 上下兩列卡片之間的距離 */
  VG: number;
}

export const DIMS = {
  full: { W: 140, H: 90, SPW: 108, GAP: 6, HG: 24, VG: 78 },
  fullMemo: { W: 140, H: 126, SPW: 108, GAP: 6, HG: 24, VG: 78 },
  compact: { W: 104, H: 68, SPW: 92, GAP: 5, HG: 16, VG: 54 },
  /** 匯出「只有名字」 */
  name: { W: 84, H: 36, SPW: 84, GAP: 4, HG: 14, VG: 40 },
  /** 匯出「名字＋讀音」 */
  reading: { W: 96, H: 52, SPW: 96, GAP: 4, HG: 14, VG: 40 },
} as const satisfies Record<string, Dims>;

export type CardMode = 'full' | 'compact';

/** 畫面上的尺寸：簡易卡片／詳細卡片（顯示備註時比較高） */
export function viewDims(mode: CardMode, memo: boolean): Dims {
  if (mode === 'compact') return DIMS.compact;
  return memo ? DIMS.fullMemo : DIMS.full;
}

export interface LayoutOptions extends LineOptions {
  dims: Dims;
  /** 顯示配偶（關掉時區塊只有卡片的寬） */
  spouses: boolean;
  align: Align;
  /** 折疊的人（當作沒有孩子） */
  collapsed?: ReadonlySet<string> | readonly string[];
  /** 家系之間的間距倍數（原作 3） */
  rootGapFactor?: number;
}

export interface LayoutNode {
  id: string;
  person: Member;
  /** 卡片左上角 */
  x: number;
  y: number;
  /** 代數 */
  gen: number;
  /** 血緣上的父母的節點（始祖是 null） */
  parent: LayoutNode | null;
  /** 顯示的配偶卡片（依排序值；不顯示配偶時是空的） */
  chips: Spouse[];
  /** 區塊寬（卡片＋配偶卡片） */
  width: number;
  /** 有孩子（顯示中的；折疊的也算） */
  hasKids: boolean;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  minGen: number;
  maxGen: number;
  dims: Dims;
  index: TreeIndex;
}

interface Item {
  p: Member;
  kids: Item[];
  /** 每一列的左緣、右緣（相對於這個人的卡片左邊） */
  L: number[];
  R: number[];
  /** 在兄弟姊妹之間的位置（孩子們的座標） */
  pos: number;
  /** 相對於父母的位移 */
  off: number;
}

const gapOf = (p: Member) => Math.max(0, p.gap || 0);

export function layoutTree(people: People, opts: LayoutOptions): TreeLayout {
  const { dims, spouses, align } = opts;
  const { W, H, SPW, GAP, HG, VG } = dims;
  const collapsed = opts.collapsed instanceof Set ? opts.collapsed : new Set(opts.collapsed ?? []);
  const index = indexTree(people, opts);
  const chipsOf = (p: Member): Spouse[] => (spouses ? (index.spouses.get(p.id) ?? []) : []);
  const blockW = (p: Member) => W + chipsOf(p).length * (SPW + GAP);

  /* 防止資料有環時無限遞迴：同一條路徑上出現過的人不再往下 */
  const onPath = new Set<string>();

  const measure = (p: Member): Item => {
    const bw = blockW(p);
    const item: Item = { p, kids: [], L: [0], R: [bw], pos: 0, off: 0 };
    if (collapsed.has(p.id) || onPath.has(p.id)) return item;
    onPath.add(p.id);
    item.kids = (index.kids.get(p.id) ?? []).map(measure);
    onPath.delete(p.id);
    const n = item.kids.length;
    if (!n) return item;
    const accL: number[] = [];
    const accR: number[] = [];
    let lead = 0;
    /* 對齊長子：排序最前的非女性孩子，沒有時第一個孩子；只有一個孩子時不適用 */
    let eldest = -1;
    if (align === 'eldest' && n > 1) {
      eldest = item.kids.findIndex((k) => k.p.gender !== 'F');
      if (eldest < 0) eldest = 0;
    }
    item.kids.forEach((k, i) => {
      let g = gapOf(k.p);
      let s = 0;
      /* 好幾個孩子中的第一個：間距把孩子們往右推、父母不動（前導） */
      if (i === 0 && n > 1 && eldest < 0) {
        lead = g;
        s = g;
        g = 0;
      }
      if (i > 0) {
        s = Number.NEGATIVE_INFINITY;
        for (let d = 0; d < k.L.length && d < accR.length; d++)
          s = Math.max(s, accR[d] - (k.L[d] - g) + HG);
      }
      k.pos = s;
      for (let d = 0; d < k.L.length; d++) {
        accL[d] = Math.min(accL[d] ?? Number.POSITIVE_INFINITY, k.L[d] - g + s);
        accR[d] = Math.max(accR[d] ?? Number.NEGATIVE_INFINITY, k.R[d] + s);
      }
    });
    let pl = (item.kids[0].pos + item.kids[n - 1].pos) / 2 - lead;
    if (eldest >= 0) pl = item.kids[eldest].pos;
    else if (align === 'manual') pl += p.shift || 0;
    for (const k of item.kids) k.off = k.pos - pl;
    item.L = [0, ...accL.map((v) => v - pl)];
    item.R = [bw, ...accR.map((v) => v - pl)];
    return item;
  };

  const nodes: LayoutNode[] = [];
  const byId = new Map<string, LayoutNode>();
  const roots = index.roots;
  const minGen = roots.length ? Math.min(...roots.map((r) => r.gen || 1)) : 1;

  const place = (item: Item, x: number, gen: number, parent: LayoutNode | null) => {
    const node: LayoutNode = {
      id: item.p.id,
      person: item.p,
      x,
      y: (gen - minGen) * (H + VG),
      gen,
      parent,
      chips: chipsOf(item.p),
      width: blockW(item.p),
      hasKids: (index.kids.get(item.p.id)?.length ?? 0) > 0,
    };
    nodes.push(node);
    byId.set(node.id, node);
    for (const k of item.kids) place(k, x + k.off, gen + 1, node);
  };

  const factor = opts.rootGapFactor ?? 3;
  const accR: Record<number, number> = {};
  let maxR = Number.NEGATIVE_INFINITY;
  roots.forEach((r, i) => {
    const it = measure(r);
    const g0 = r.gen || 1;
    const g = gapOf(r);
    let s = 0;
    if (i > 0) {
      s = Number.NEGATIVE_INFINITY;
      it.L.forEach((v, d) => {
        const G = g0 + d;
        if (accR[G] !== undefined) s = Math.max(s, accR[G] - (v - g) + HG * factor);
      });
      /* 沒有共同的世代：接在最右邊之後 */
      if (s === Number.NEGATIVE_INFINITY) s = maxR - Math.min(...it.L) + HG * factor + g;
    }
    place(it, s, g0, null);
    it.R.forEach((v, d) => {
      const G = g0 + d;
      accR[G] = Math.max(accR[G] ?? Number.NEGATIVE_INFINITY, v + s);
      maxR = Math.max(maxR, v + s);
    });
  });
  const maxGen = nodes.reduce((m, n) => Math.max(m, n.gen), minGen);
  return { nodes, byId, minGen, maxGen, dims, index };
}

/* ---------- 由排版算出的其他位置（畫面與匯出共用） ---------- */

/** 配偶卡片 i 的左上角（縱向） */
export function chipX(node: LayoutNode, i: number, dims: Dims): number {
  return node.x + dims.W + dims.GAP + i * (dims.SPW + dims.GAP);
}

/** 親子連線（SVG 路徑；縱向） */
export function edgePath(child: LayoutNode, dims: Dims): string | null {
  const p = child.parent;
  if (!p) return null;
  const x1 = p.x + dims.W / 2;
  const y1 = p.y + dims.H;
  const x2 = child.x + dims.W / 2;
  const y2 = child.y;
  const m = y1 + dims.VG / 2;
  return `M${x1} ${y1} V${m} H${x2} V${y2}`;
}

export interface GenRow {
  gen: number;
  /** 這一列卡片的頂端 */
  y: number;
}

export interface Guides {
  rows: GenRow[];
  /** 世代標籤的左邊 */
  labelX: number;
  /** 虛線的左邊與長度（列與列之間，y＝列頂 ＋ H ＋ VG ÷ 2） */
  lineX: number;
  lineWidth: number;
  /** 卡片範圍（不含標籤） */
  minX: number;
  maxX: number;
}

/** 世代標籤與虛線的位置（規格 F14） */
export function guides(L: TreeLayout): Guides {
  let minX = 0;
  let maxX = 0;
  for (const n of L.nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.width);
  }
  const rows: GenRow[] = [];
  if (L.nodes.length)
    for (let g = L.minGen; g <= L.maxGen; g++)
      rows.push({ gen: g, y: (g - L.minGen) * (L.dims.H + L.dims.VG) });
  return { rows, labelX: minX - 84, lineX: minX - 84, lineWidth: maxX - minX + 120, minX, maxX };
}

/** 世代間的虛線的 y */
export function rowLineY(row: GenRow, dims: Dims): number {
  return row.y + dims.H + dims.VG / 2;
}
