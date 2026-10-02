/**
 * 流程圖：方框與線的資料、舊式文字的轉換、邊緣的交點、對齊（規格 3.6.5、F130～F140）。座標單位都是 mm。
 */
import { BOX_COLORS, boxColor } from './proc';
import { uid } from './text';
import type { Block, Flow, FlowEdge, FlowKind, FlowNode } from './types';

export const FLOW_KINDS: readonly { k: FlowKind; name: string }[] = [
  { k: 'box', name: '方形' },
  { k: 'round', name: '圓角' },
  { k: 'diamond', name: '菱形' },
  { k: 'term', name: '圓端' },
  { k: 'io', name: '平行四邊形' },
];

export const FLOW_MIN_W = 8;
export const FLOW_MIN_H = 6;
export const FLOW_MAX_W = 400;
export const FLOW_MAX_H = 600;

export const newFlow = (): Flow => ({ w: 105, h: 170, nodes: [], edges: [] });

export function newFlowNode(x: number, y: number, t = ''): FlowNode {
  return {
    id: uid(),
    x: +x || 0,
    y: +y || 0,
    w: 44,
    h: 14,
    t: String(t ?? ''),
    t2: '',
    kind: 'box',
    pad: 2,
    col: '',
  };
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const halfMm = (v: number): number => Math.round(v * 2) / 2;

/** 舊式文字（一行一個方框，行首 - 或 ・ 是分支）轉成圖 */
export function flowFromText(text: unknown): Flow {
  const f = newFlow();
  type Row = { kind: 'box'; t: string } | { kind: 'br'; items: string[] };
  const rows: Row[] = [];
  for (const ln of String(text ?? '').split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    const br = t.match(/^[・-]\s*(.*)$/);
    if (br) {
      const last = rows[rows.length - 1];
      if (last?.kind === 'br') last.items.push(br[1]);
      else rows.push({ kind: 'br', items: [br[1]] });
    } else rows.push({ kind: 'box', t });
  }
  const W = f.w;
  const NH = 13;
  const GAP = 9;
  let y = 5;
  let prev: FlowNode[] = [];
  for (const r of rows) {
    const cur: FlowNode[] = [];
    if (r.kind === 'box') {
      const nw = Math.min(72, W * 0.72);
      const n = newFlowNode((W - nw) / 2, y, r.t);
      n.w = nw;
      n.h = NH;
      f.nodes.push(n);
      cur.push(n);
    } else {
      const k = r.items.length;
      const g = 4;
      const nw = Math.max(FLOW_MIN_W, (W - 8 - (k - 1) * g) / k);
      r.items.forEach((t, i) => {
        const n = newFlowNode(4 + i * (nw + g), y, t);
        n.w = nw;
        n.h = NH;
        n.kind = 'round';
        n.col = 'aka';
        f.nodes.push(n);
        cur.push(n);
      });
    }
    for (const p of prev)
      for (const c of cur) f.edges.push({ id: uid(), a: p.id, b: c.id, lb: '' });
    prev = cur;
    y += NH + GAP;
  }
  if (rows.length) f.h = Math.max(60, y - GAP + 5);
  return f;
}

/** 補齊流程圖資料（沒有圖時從文字轉換） */
export function ensureFlow(b: Block): Flow {
  let f = b.flow;
  if (!f || typeof f !== 'object' || !Array.isArray(f.nodes)) {
    f = flowFromText(b.text);
    b.flow = f;
  }
  f.w = Math.max(30, Math.min(FLOW_MAX_W, +f.w || 150));
  f.h = Math.max(20, Math.min(FLOW_MAX_H, +f.h || 95));
  f.nodes = f.nodes.filter((n) => n && typeof n === 'object');
  for (const n of f.nodes) {
    if (!n.id) n.id = uid();
    n.x = +n.x || 0;
    n.y = +n.y || 0;
    n.w = Math.max(FLOW_MIN_W, +n.w || 44);
    n.h = Math.max(FLOW_MIN_H, +n.h || 14);
    n.t = String(n.t ?? '');
    n.t2 = String(n.t2 ?? '');
    n.kind = FLOW_KINDS.some((k) => k.k === n.kind) ? n.kind : 'box';
    n.pad = Math.max(0, Math.min(20, +n.pad || 0));
    n.col = BOX_COLORS.some((c) => c.k === n.col) ? n.col : '';
  }
  if (!Array.isArray(f.edges)) f.edges = [];
  const ids = new Set(f.nodes.map((n) => n.id));
  f.edges = f.edges.filter(
    (e) => e && typeof e === 'object' && ids.has(e.a) && ids.has(e.b) && e.a !== e.b,
  );
  for (const e of f.edges) {
    if (!e.id) e.id = uid();
    e.lb = String(e.lb ?? '');
  }
  return f;
}

export const flowNode = (f: Flow, id: string | null | undefined): FlowNode | null =>
  f.nodes.find((n) => n.id === id) ?? null;

/** 方框的顏色：沒指定就是墨色 */
export function flowColor(n: Pick<FlowNode, 'col'>): { line: string; fill: string; soft: string } {
  const c = n.col ? boxColor(n.col) : BOX_COLORS[1];
  return { line: c.c, fill: c.f, soft: c.l };
}

/** 從方框中心朝 (tx, ty) 的線與方框邊緣的交點（菱形依菱形邊緣） */
export function flowClip(n: FlowNode, tx: number, ty: number): [number, number] {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const hw = n.w / 2;
  const hh = n.h / 2;
  if (n.kind === 'diamond') {
    const s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return [cx + dx * s, cy + dy * s];
  }
  const s = Math.min(
    dx ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );
  return [cx + dx * s, cy + dy * s];
}

export interface EdgeGeom {
  p1: [number, number];
  p2: [number, number];
  /** 線的終點（在箭頭底部） */
  end: [number, number];
  tip: [number, number];
  w1: [number, number];
  w2: [number, number];
  mid: [number, number];
}

/** 線的幾何：起終點、箭頭三角形（長 2.2 mm、張角 ±0.38 rad） */
export function edgeGeom(f: Flow, e: FlowEdge): EdgeGeom | null {
  const a = flowNode(f, e.a);
  const b = flowNode(f, e.b);
  if (!a || !b) return null;
  const p1 = flowClip(a, b.x + b.w / 2, b.y + b.h / 2);
  const p2 = flowClip(b, a.x + a.w / 2, a.y + a.h / 2);
  const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const s = 2.2;
  return {
    p1,
    p2,
    end: [p2[0] - s * 0.8 * Math.cos(ang), p2[1] - s * 0.8 * Math.sin(ang)],
    tip: [p2[0], p2[1]],
    w1: [p2[0] - s * Math.cos(ang - 0.38), p2[1] - s * Math.sin(ang - 0.38)],
    w2: [p2[0] - s * Math.cos(ang + 0.38), p2[1] - s * Math.sin(ang + 0.38)],
    mid: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
  };
}

/** 收在圖的範圍內 */
export function flowFit(f: Flow, n: FlowNode): void {
  n.w = Math.max(FLOW_MIN_W, Math.min(n.w, f.w));
  n.h = Math.max(FLOW_MIN_H, Math.min(n.h, f.h));
  n.x = Math.max(0, Math.min(n.x, f.w - n.w));
  n.y = Math.max(0, Math.min(n.y, f.h - n.h));
}

export type FlowAlign =
  | 'left'
  | 'hcenter'
  | 'right'
  | 'top'
  | 'vcenter'
  | 'bottom'
  | 'wsame'
  | 'hsame'
  | 'hgap'
  | 'vgap';

export const FLOW_ALIGNS: readonly { k: FlowAlign; name: string }[] = [
  { k: 'left', name: '靠左對齊' },
  { k: 'hcenter', name: '左右置中' },
  { k: 'right', name: '靠右對齊' },
  { k: 'top', name: '靠上對齊' },
  { k: 'vcenter', name: '上下置中' },
  { k: 'bottom', name: '靠下對齊' },
  { k: 'wsame', name: '寬度一致' },
  { k: 'hsame', name: '高度一致' },
  { k: 'hgap', name: '水平間距平均' },
  { k: 'vgap', name: '垂直間距平均' },
];

/** 對齊選取的方框（至少 2 個）；之後四捨五入到 0.5 mm 並收在圖內 */
export function flowAlign(f: Flow, ns: FlowNode[], mode: FlowAlign): boolean {
  if (ns.length < 2) return false;
  const L = Math.min(...ns.map((n) => n.x));
  const R = Math.max(...ns.map((n) => n.x + n.w));
  const T = Math.min(...ns.map((n) => n.y));
  const B = Math.max(...ns.map((n) => n.y + n.h));
  if (mode === 'left') for (const n of ns) n.x = L;
  if (mode === 'right') for (const n of ns) n.x = R - n.w;
  if (mode === 'hcenter') for (const n of ns) n.x = (L + R) / 2 - n.w / 2;
  if (mode === 'top') for (const n of ns) n.y = T;
  if (mode === 'bottom') for (const n of ns) n.y = B - n.h;
  if (mode === 'vcenter') for (const n of ns) n.y = (T + B) / 2 - n.h / 2;
  if (mode === 'wsame') {
    const w = Math.max(...ns.map((n) => n.w));
    for (const n of ns) n.w = w;
  }
  if (mode === 'hsame') {
    const h = Math.max(...ns.map((n) => n.h));
    for (const n of ns) n.h = h;
  }
  if (mode === 'hgap') {
    const a = [...ns].sort((p, q) => p.x - q.x);
    const sum = a.reduce((s, n) => s + n.w, 0);
    const gap = (R - L - sum) / (a.length - 1);
    let x = L;
    for (const n of a) {
      n.x = x;
      x += n.w + gap;
    }
  }
  if (mode === 'vgap') {
    const a = [...ns].sort((p, q) => p.y - q.y);
    const sum = a.reduce((s, n) => s + n.h, 0);
    const gap = (B - T - sum) / (a.length - 1);
    let y = T;
    for (const n of a) {
      n.y = y;
      y += n.h + gap;
    }
  }
  for (const n of ns) {
    n.x = halfMm(n.x);
    n.y = halfMm(n.y);
    n.w = halfMm(n.w);
    n.h = halfMm(n.h);
    flowFit(f, n);
  }
  return true;
}

/** 「配合內容」：剛好放下所有方框＋5 mm */
export function flowFitContent(f: Flow): void {
  let mx = 0;
  let my = 0;
  for (const n of f.nodes) {
    mx = Math.max(mx, n.x + n.w);
    my = Math.max(my, n.y + n.h);
  }
  f.w = Math.max(30, Math.min(FLOW_MAX_W, Math.ceil(mx + 5)));
  f.h = Math.max(20, Math.min(FLOW_MAX_H, Math.ceil(my + 5)));
}

/** 加入方框（F130）：有基準方框時放在它下方 10 mm 並連線，否則放在中上 */
export function flowAddNode(f: Flow, kind: FlowKind, base: FlowNode | null): FlowNode {
  const n = newFlowNode(base ? base.x : (f.w - 44) / 2, base ? base.y + base.h + 10 : 8, '');
  n.kind = kind;
  if (kind === 'diamond') {
    n.w = 40;
    n.h = 20;
  }
  if (kind === 'term') n.h = 12;
  /* 放不下時把圖加高（舊版先收進圖內再判斷，結果永遠不會加高；規格第 5 節） */
  if (n.y + n.h > f.h) f.h = Math.min(FLOW_MAX_H, n.y + n.h + 6);
  flowFit(f, n);
  f.nodes.push(n);
  if (base) f.edges.push({ id: uid(), a: base.id, b: n.id, lb: '' });
  return n;
}

/** 複製方框（往右下 4 mm）；回傳新的方框 */
export function flowDupNodes(f: Flow, ns: readonly FlowNode[]): FlowNode[] {
  const made = ns.map((x) => {
    const y = { ...x, id: uid(), x: x.x + 4, y: x.y + 4 };
    flowFit(f, y);
    return y;
  });
  f.nodes.push(...made);
  return made;
}

/** 刪除方框（連帶刪除相連的線） */
export function flowDeleteNodes(f: Flow, ids: ReadonlySet<string>): void {
  f.nodes = f.nodes.filter((x) => !ids.has(x.id));
  f.edges = f.edges.filter((x) => !ids.has(x.a) && !ids.has(x.b));
}

/** 文字溢出時把方框延伸到需要的高度（mm），圖也跟著延伸；回傳有沒有改變 */
export function flowGrowNode(f: Flow, n: FlowNode, needMm: number): boolean {
  const k = n.kind === 'diamond' ? 1.7 : n.kind === 'io' ? 1.08 : 1;
  const need = needMm * k;
  if (need <= n.h + 0.3) return false;
  n.h = Math.ceil(need * 2) / 2;
  let my = 0;
  for (const x of f.nodes) my = Math.max(my, x.y + x.h);
  if (my > f.h) f.h = Math.min(FLOW_MAX_H, Math.ceil(my + 4));
  for (const x of f.nodes) flowFit(f, x);
  return true;
}
