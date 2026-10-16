/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 標籤的三種呈現與群體關係（規格 3.10、3.11；原作的 labelDisplayList、labelNetLayout、buildLabelNet、
 * zoneBlobPath、buildZoneLayer、computeColMaps、colNodeSvg、colEdgeSvg、buildGrelEdges、grelEntriesFor）。
 * - 陣營框：每位成員一顆球（圓／圓角矩形），沿最小生成樹在夠近的球之間長收束的頸子；一個陣營一條路徑；
 *   同心分層（逐成員的遞增鏈）；外框線＝同一條路徑加粗描邊再用遮罩挖掉內部。
 * - 標籤網：標籤畫成圓點（存過的位置或自動落點）＋到成員的虛線。
 * - 收合：陣營框標籤收成一顆節點，成員不畫，成員與外面的線聚合成一條。
 * - 群體關係：端點是標籤的規則（`C<角色 id>`／`L<標籤 id>`），畫成中空雙線＋膠囊。
 * 數字照原作寫成小數一位（toFixed），方便和原作的輸出逐一比對。
 */
import { charLabelIds } from '../model/charLabels';
import { ownColor } from '../model/normalize';
import type { Char, GroupRel, Label, Rel } from '../model/types';
import {
  avatarRadius,
  charIsSquare,
  charRadius,
  displayName,
  esc,
  exactTextWidth,
  NODE_R,
  relNameFS,
  type SheetCtx,
  typeLineColor,
  typeLineW,
} from './geom';

const zF = (v: number): string => v.toFixed(1);

/* ---------- 標籤 ---------- */

/** 標籤色（自動＝畫布配色的自動外框色） */
export const labelColor = (ctx: SheetCtx, l: Label): string => ownColor(l.color) || ctx.pal.auto;

export interface LabelEntry {
  id: number;
  label: Label;
  /** 這張分頁掛著這個標籤的角色（分頁裡的順序；含收合中的） */
  members: Char[];
}

export interface ColGroup {
  id: number;
  lbl: Label;
  members: Char[];
  x: number;
  y: number;
  r: number;
}

/** 收合時聚合的線（同一對端點、同關係類型一條） */
export interface ColAgg {
  a: string;
  b: string;
  type: number;
  rels: Rel[];
  dirs: Set<'ab' | 'ba' | 'both'>;
}

export interface LabelNode extends LabelEntry {
  x: number;
  y: number;
  /** 佔位半寬（含名稱） */
  hw: number;
}

export interface LabelInfo {
  /** 全部標籤（專案的順序）與這張分頁的成員 */
  entries: LabelEntry[];
  byId: Map<number, LabelEntry>;
  /** 收合：被藏起來的角色 → 擁有他的陣營 */
  colHidden: Map<number, number>;
  /** 收合中的陣營（有成員的） */
  colGroups: Map<number, ColGroup>;
  layout: LabelNode[] | null;
  agg: Map<string, ColAgg> | null;
}

const infoCache = new WeakMap<SheetCtx, LabelInfo>();

/** 這張分頁的標籤資訊（同一個 ctx 只算一次；ctx 每次畫都是新的） */
export function labelInfo(ctx: SheetCtx): LabelInfo {
  const hit = infoCache.get(ctx);
  if (hit) return hit;
  const used = new Map<number, Char[]>();
  if (ctx.labels.length)
    for (const c of ctx.sheet.chars)
      for (const id of charLabelIds(c)) {
        if (!ctx.lblById.has(id)) continue;
        let l = used.get(id);
        if (!l) {
          l = [];
          used.set(id, l);
        }
        l.push(c);
      }
  const entries = ctx.labels.map((l) => ({ id: l.id, label: l, members: used.get(l.id) ?? [] }));
  const colHidden = new Map<number, number>();
  const colGroups = new Map<number, ColGroup>();
  const set = new Set(ctx.sheet.collapsed.filter((id) => ctx.lblById.get(id)?.zone));
  if (set.size) {
    for (const c of ctx.sheet.chars) {
      const owner = charLabelIds(c).find((id) => set.has(id));
      if (owner === undefined) continue;
      colHidden.set(c.id, owner);
      let g = colGroups.get(owner);
      if (!g) {
        g = { id: owner, lbl: ctx.lblById.get(owner) as Label, members: [], x: 0, y: 0, r: 0 };
        colGroups.set(owner, g);
      }
      g.members.push(c);
    }
    for (const g of colGroups.values()) {
      let sx = 0;
      let sy = 0;
      let mr = 0;
      for (const c of g.members) {
        sx += c.x;
        sy += c.y;
        mr = Math.max(mr, charRadius(ctx, c));
      }
      g.x = sx / g.members.length;
      g.y = sy / g.members.length;
      g.r = mr + 16 + Math.min(56, 3 * g.members.length);
    }
  }
  const info: LabelInfo = {
    entries,
    byId: new Map(entries.map((e) => [e.id, e])),
    colHidden,
    colGroups,
    layout: null,
    agg: null,
  };
  infoCache.set(ctx, info);
  return info;
}

/** 畫面上看得到的角色（收合中的成員不算） */
export const visibleChars = (ctx: SheetCtx): Char[] => {
  const h = labelInfo(ctx).colHidden;
  return h.size ? ctx.sheet.chars.filter((c) => !h.has(c.id)) : ctx.sheet.chars;
};

/* ---------- 標籤網 ---------- */

export function labelNetMetrics(ctx: SheetCtx): { R: number; FS: number; LW: number } {
  const cs = ctx.sheet.chars;
  const rAvg = cs.length ? cs.reduce((a, c) => a + avatarRadius(ctx, c), 0) / cs.length : NODE_R;
  const v = ctx.s.lblNodeScale;
  const k = Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
  const R = Math.max(10 * k, Math.min(60 * k, rAvg * 0.38 * k));
  return { R, FS: Math.max(10, Math.min(46, R * 0.92)), LW: Math.max(1.5, R * 0.12) };
}

const lblHalfW = (label: Label, R: number, FS: number): number =>
  Math.max(R, String(label.text || '').length * FS * 0.5);

/** 這顆標籤圓點畫不畫：隱藏的不畫、有成員的陣營框由框代替、沒有成員的看「顯示游離標籤」 */
export const lblNodeDrawn = (ctx: SheetCtx, it: LabelEntry): boolean =>
  !it.label.hidden &&
  !(it.label.zone && it.members.length) &&
  (it.members.length > 0 || ctx.s.showFreeLbls);

function labelAutoPos(
  ctx: SheetCtx,
  entry: LabelEntry,
  freeIdx: number,
  placed: { x: number; y: number; hw: number }[],
  R: number,
  FS: number,
): { x: number; y: number; hw: number } {
  const { W, H } = ctx;
  const m = R + FS + 8;
  const clampX = (v: number) => Math.max(m, Math.min(W - m, v));
  const clampY = (v: number) => Math.max(m, Math.min(H - m, v));
  if (!entry.members.length) {
    const a0 = freeIdx * 2.399963 - Math.PI / 2;
    const rad = Math.min(W, H) * 0.45;
    return { x: clampX(W / 2 + Math.cos(a0) * rad), y: clampY(H / 2 + Math.sin(a0) * rad), hw: R };
  }
  const g = entry.members;
  const cx0 = g.reduce((a, c) => a + c.x, 0) / g.length;
  const cy0 = g.reduce((a, c) => a + c.y, 0) / g.length;
  const myHW = lblHalfW(entry.label, R, FS);
  let x = clampX(cx0);
  let y = clampY(cy0);
  /* 撞到角色或已放好的標籤（含下方名稱的方塊）：黃金角螺旋往外找；夾回畫布要在判斷之內做 */
  const clash = () =>
    ctx.sheet.chars.some((c) => Math.hypot(c.x - x, c.y - y) < charRadius(ctx, c) + R + 14) ||
    placed.some(
      (p) => Math.abs(p.x - x) < myHW + (p.hw || R) + 6 && Math.abs(p.y - y) < R * 2 + FS * 1.2 + 6,
    );
  for (let k = 1; k <= 80 && clash(); k++) {
    const a = k * 2.399963;
    const d = R + 11 + k * (R * 0.6);
    x = clampX(cx0 + Math.cos(a) * d);
    y = clampY(cy0 + Math.sin(a) * d);
  }
  return { x, y, hw: myHW };
}

/** 標籤節點的座標（存過的位置，否則自動落點）；畫與磁鐵共用 */
export function labelNetLayout(ctx: SheetCtx): LabelNode[] {
  const info = labelInfo(ctx);
  if (info.layout) return info.layout;
  const { R, FS } = labelNetMetrics(ctx);
  const saved = ctx.s.labelPos;
  const placed: { x: number; y: number; hw: number }[] = [];
  let freeIdx = 0;
  info.layout = info.entries.map((e) => {
    const s = saved[e.id];
    const p =
      s && Number.isFinite(s.x) && Number.isFinite(s.y)
        ? { x: s.x, y: s.y, hw: lblHalfW(e.label, R, FS) }
        : labelAutoPos(ctx, e, e.members.length ? 0 : freeIdx++, placed, R, FS);
    placed.push(p);
    return { ...e, ...p };
  });
  return info.layout;
}

/** 標籤網：到成員的虛線（關係線層的最上面）與圓點（角色層的最上面） */
export function labelNetSvg(ctx: SheetCtx): { lines: string; nodes: string } {
  const items = labelNetLayout(ctx).filter((it) => lblNodeDrawn(ctx, it));
  if (!items.length) return { lines: '', nodes: '' };
  const { R, FS, LW } = labelNetMetrics(ctx);
  const bg = ctx.pal.bg;
  let lines = '';
  let nodes = '';
  for (const it of items) {
    const col = labelColor(ctx, it.label);
    const { x, y } = it;
    let seg = '';
    for (const c of it.members)
      seg += `<line x1="${zF(c.x)}" y1="${zF(c.y)}" x2="${zF(x)}" y2="${zF(y)}" stroke="${col}" stroke-width="${zF(LW)}" stroke-dasharray="${zF(LW * 2.7)} ${zF(LW * 3.3)}" opacity="0.65"/>`;
    if (seg) lines += `<g class="lbl-links" data-lbllink="${it.id}">${seg}</g>`;
    const free = !it.members.length;
    nodes += `<g class="lbl-node${free ? ' lbl-free' : ''}" data-lblnode="${it.id}" style="cursor:move"${free ? ' opacity="0.72"' : ''}><circle cx="${zF(x)}" cy="${zF(y)}" r="${zF(R)}" fill="${col}" stroke="${bg}" stroke-width="${zF(LW * 1.4)}"/><text x="${zF(x)}" y="${zF(y + R + FS * 1.05)}" text-anchor="middle" font-size="${zF(FS)}" font-weight="700" fill="${col}" paint-order="stroke" stroke="${bg}" stroke-width="${zF(FS * 0.25)}" stroke-linejoin="round">${esc(it.label.text)}</text></g>`;
  }
  return {
    lines: `<g class="lbl-net" pointer-events="none">${lines}</g>`,
    nodes: `<g class="lbl-net">${nodes}</g>`,
  };
}

/* ---------- 陣營框 ---------- */

const step10 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : 5);

/** 陣營框厚度：球比頭像大多少（0→0.08、5→0.34、10→0.60 倍半徑，至少 3） */
export const zonePadOf = (ctx: SheetCtx, rAvg: number): number =>
  Math.max(3, rAvg * (0.08 + step10(ctx.s.zoneThick) * 0.052));
export const zoneEdgeOf = (ctx: SheetCtx): number => {
  const v = ctx.s.zoneEdgeW;
  return Number.isFinite(v) && v >= 0.5 && v <= 8 ? v : 1.5;
};
const zoneFillOpOf = (ctx: SheetCtx): number => {
  const v = ctx.s.zoneFillOp;
  return Number.isFinite(v) && v >= 0.02 && v <= 0.6 ? v : 0.13;
};
/** 連結鬆緊：中心距 ≤ (r1＋r2)×這個倍率才長頸子（0＝不連、10＝都連） */
function zoneLinkMax(ctx: SheetCtx): number {
  const v = step10(ctx.s.zoneLink);
  if (v <= 0) return 0;
  if (v >= 10) return Number.POSITIVE_INFINITY;
  return 1.15 + v * 0.21;
}

interface Ball {
  x: number;
  y: number;
  r: number;
  sq: boolean;
}
const ZONE_NECK_V = 0.5;
const ZONE_NECK_HANDLE = 2.4;
const zPt = (c: { x: number; y: number }, r: number, a: number) => ({
  x: c.x + r * Math.cos(a),
  y: c.y + r * Math.sin(a),
});

/** 從中心往 a 方向射出、打到球的邊界的距離（方形球＝圓角矩形的實際邊） */
function zoneRadAt(b: Ball, a: number): number {
  const r = b.r;
  if (!b.sq) return r;
  const k = Math.min(r * 0.42, r);
  const s = r - k;
  const ax = Math.abs(Math.cos(a));
  const ay = Math.abs(Math.sin(a));
  const tEdge = ax > 1e-9 ? r / ax : Number.POSITIVE_INFINITY;
  const tEdgeY = ay > 1e-9 ? r / ay : Number.POSITIVE_INFINITY;
  const hitX = tEdge <= tEdgeY;
  const tFlat = Math.min(tEdge, tEdgeY);
  const px = ax * tFlat;
  const py = ay * tFlat;
  if (hitX ? py <= s + 1e-6 : px <= s + 1e-6) return tFlat;
  const b2 = ax * s + ay * s;
  const c2 = 2 * s * s - k * k;
  const disc = b2 * b2 - c2;
  return disc > 0 ? b2 + Math.sqrt(disc) : tFlat;
}

/** 一顆球（順時針）：圓＝兩段 180° 弧；方形＝圓角矩形 */
function zoneBallD(b: Ball): string {
  const r = b.r;
  if (b.sq) {
    const k = Math.min(r * 0.42, r);
    const x0 = b.x - r;
    const y0 = b.y - r;
    const s = r * 2;
    return (
      `M ${zF(x0 + k)} ${zF(y0)} H ${zF(x0 + s - k)} A ${zF(k)} ${zF(k)} 0 0 1 ${zF(x0 + s)} ${zF(y0 + k)}` +
      ` V ${zF(y0 + s - k)} A ${zF(k)} ${zF(k)} 0 0 1 ${zF(x0 + s - k)} ${zF(y0 + s)}` +
      ` H ${zF(x0 + k)} A ${zF(k)} ${zF(k)} 0 0 1 ${zF(x0)} ${zF(y0 + s - k)}` +
      ` V ${zF(y0 + k)} A ${zF(k)} ${zF(k)} 0 0 1 ${zF(x0 + k)} ${zF(y0)} Z`
    );
  }
  return `M ${zF(b.x - r)} ${zF(b.y)} A ${zF(r)} ${zF(r)} 0 1 1 ${zF(b.x + r)} ${zF(b.y)} A ${zF(r)} ${zF(r)} 0 1 1 ${zF(b.x - r)} ${zF(b.y)} Z`;
}

/** 兩顆球之間的頸子（metaball 連接體；走向 p2→p4→p3→p1＝和球同為順時針）；太遠或互相包住＝null */
function zoneNeckD(b1: Ball, b2: Ball, maxK: number): string | null {
  const r1 = b1.r;
  const r2 = b2.r;
  const dx = b2.x - b1.x;
  const dy = b2.y - b1.y;
  const d = Math.hypot(dx, dy);
  if (!d || r1 <= 0 || r2 <= 0) return null;
  if (d > (r1 + r2) * maxK) return null;
  if (d <= Math.abs(r1 - r2)) return null;
  const v = ZONE_NECK_V;
  const HALF = Math.PI / 2;
  const cl = (x: number) => Math.max(-1, Math.min(1, x));
  let u1 = 0;
  let u2 = 0;
  if (d < r1 + r2) {
    u1 = Math.acos(cl((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d)));
    u2 = Math.acos(cl((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d)));
  }
  const a0 = Math.atan2(dy, dx);
  const a2 = Math.acos(cl((r1 - r2) / d));
  const a1a = a0 + u1 + (a2 - u1) * v;
  const a1b = a0 - u1 - (a2 - u1) * v;
  const a2a = a0 + Math.PI - u2 - (Math.PI - u2 - a2) * v;
  const a2b = a0 - Math.PI + u2 + (Math.PI - u2 - a2) * v;
  const p1 = zPt(b1, zoneRadAt(b1, a1a), a1a);
  const p2 = zPt(b1, zoneRadAt(b1, a1b), a1b);
  const p3 = zPt(b2, zoneRadAt(b2, a2a), a2a);
  const p4 = zPt(b2, zoneRadAt(b2, a2b), a2b);
  const tot = r1 + r2;
  const base = Math.min(v * ZONE_NECK_HANDLE, Math.hypot(p1.x - p3.x, p1.y - p3.y) / tot);
  const k = base * Math.min(1, (d * 2) / tot);
  const h1 = r1 * k;
  const h2 = r2 * k;
  const c1 = zPt(p1, h1, a1a - HALF);
  const c2 = zPt(p3, h2, a2a + HALF);
  const c3 = zPt(p4, h2, a2b - HALF);
  const c4 = zPt(p2, h1, a1b + HALF);
  return (
    `M ${zF(p2.x)} ${zF(p2.y)} C ${zF(c4.x)} ${zF(c4.y)} ${zF(c3.x)} ${zF(c3.y)} ${zF(p4.x)} ${zF(p4.y)}` +
    ` L ${zF(p3.x)} ${zF(p3.y)} C ${zF(c2.x)} ${zF(c2.y)} ${zF(c1.x)} ${zF(c1.y)} ${zF(p1.x)} ${zF(p1.y)} Z`
  );
}

/** 成員 → 一條聯集路徑（球＋沿最小生成樹〔Prim，從第一位成員開始〕的頸子）與外接框 */
export function zoneBlobPath(
  ctx: SheetCtx,
  members: readonly Char[],
  padAt: (c: Char) => number,
): { fill: string; bbox: { x: number; y: number; w: number; h: number } | null } {
  if (!members.length) return { fill: '', bbox: null };
  const maxK = zoneLinkMax(ctx);
  const balls: Ball[] = members.map((c) => ({
    x: c.x,
    y: c.y,
    r: charRadius(ctx, c) + padAt(c),
    sq: charIsSquare(ctx, c),
  }));
  const n = balls.length;
  let fill = balls.map(zoneBallD).join(' ');
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const b of balls) {
    x0 = Math.min(x0, b.x - b.r);
    y0 = Math.min(y0, b.y - b.r);
    x1 = Math.max(x1, b.x + b.r);
    y1 = Math.max(y1, b.y + b.r);
  }
  if (n > 1) {
    const inT = new Array<boolean>(n).fill(false);
    const best = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
    const from = new Array<number>(n).fill(-1);
    inT[0] = true;
    for (let j = 1; j < n; j++) {
      best[j] = Math.hypot(balls[j].x - balls[0].x, balls[j].y - balls[0].y);
      from[j] = 0;
    }
    for (let it = 1; it < n; it++) {
      let k = -1;
      for (let j = 0; j < n; j++) if (!inT[j] && (k < 0 || best[j] < best[k])) k = j;
      if (k < 0) break;
      inT[k] = true;
      const neck = maxK > 0 ? zoneNeckD(balls[from[k]], balls[k], maxK) : null;
      if (neck) fill += ` ${neck}`;
      for (let j = 0; j < n; j++) {
        if (inT[j]) continue;
        const dd = Math.hypot(balls[j].x - balls[k].x, balls[j].y - balls[k].y);
        if (dd < best[j]) {
          best[j] = dd;
          from[j] = k;
        }
      }
    }
  }
  return { fill, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** 兩個 #rrggbb 的線性混合（t＝a 的比重）；不是 #rrggbb 時 null */
export function mixHex(a: string, b: string, t: number): string | null {
  const rgb = (h: string) => {
    const m = String(h || '')
      .trim()
      .match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16));
  };
  const pa = rgb(a);
  const pb = rgb(b);
  if (!pa || !pb) return null;
  return `#${pa
    .map((v, i) =>
      Math.max(0, Math.min(255, Math.round(v * t + pb[i] * (1 - t))))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** 有沒有要畫的陣營框（總開關開著、有沒隱藏的陣營框標籤） */
export const zonesActive = (ctx: SheetCtx): boolean =>
  ctx.s.showZones && ctx.labels.some((l) => l.zone && !l.hidden);

/**
 * 陣營框圖層的內容。edit＝編輯畫面（名稱上蓋一塊點擊區）；idPrefix＋序號＝遮罩 id（全文件唯一）。
 */
export function zonesSvg(ctx: SheetCtx, edit: boolean, idPrefix: string): string {
  if (!ctx.s.showZones) return '';
  let zs = ctx.labels.filter((l) => l.zone && !l.hidden);
  if (!zs.length) return '';
  const info = labelInfo(ctx);
  const { colHidden, colGroups } = info;
  const rad = new Map<number, number>();
  const radius = (c: Char) => {
    let r = rad.get(c.id);
    if (r === undefined) {
      r = charRadius(ctx, c);
      rad.set(c.id, r);
    }
    return r;
  };
  /* 同心分層：逐成員的遞增鏈（照標籤順序；只有真的畫出來的陣營佔一層） */
  const ringPad = new Map<string, number>();
  {
    const pre = new Map<number, number>();
    for (const l of zs) {
      const e = info.byId.get(l.id);
      if (!e?.members.length || colGroups.has(l.id)) continue;
      const vism = e.members.filter((c) => !colHidden.has(c.id));
      if (!vism.length) continue;
      pre.set(l.id, zonePadOf(ctx, vism.reduce((a, c) => a + radius(c), 0) / vism.length));
    }
    const last = new Map<number, number>();
    const stepMul = step10(ctx.s.zoneLayerStep) * 0.1;
    for (const l of zs) {
      const base = pre.get(l.id);
      if (base === undefined) continue;
      for (const c of (info.byId.get(l.id) as LabelEntry).members) {
        if (colHidden.has(c.id)) continue;
        const prev = last.get(c.id);
        const gap = stepMul * zonePadOf(ctx, radius(c));
        const mine = prev === undefined || gap <= 0 ? base : Math.max(base, prev + gap);
        ringPad.set(`${c.id}:${l.id}`, mine);
        last.set(c.id, mine);
      }
    }
  }
  const solid = !ctx.s.zoneBlend;
  if (solid) zs = zs.slice().reverse();
  const { FS } = labelNetMetrics(ctx);
  const bg = ctx.pal.bg;
  const lw = zoneEdgeOf(ctx);
  const fop = zoneFillOpOf(ctx);
  let seq = 0;
  let out = '';
  for (const l of zs) {
    const e = info.byId.get(l.id);
    if (!e?.members.length || colGroups.has(l.id)) continue;
    const vism = e.members.filter((c) => !colHidden.has(c.id));
    if (!vism.length) continue;
    const pad = zonePadOf(ctx, vism.reduce((a, c) => a + radius(c), 0) / vism.length);
    const padOf = (c: Char) => ringPad.get(`${c.id}:${l.id}`) ?? pad;
    const blob = zoneBlobPath(ctx, vism, padOf);
    if (!blob.fill) continue;
    const col = labelColor(ctx, l);
    /* 名稱：從質心往 θ 射出，取離開每顆球的最遠距離（射線與圓求交） */
    const cx0 = vism.reduce((a, c) => a + c.x, 0) / vism.length;
    const cy0 = vism.reduce((a, c) => a + c.y, 0) / vism.length;
    const ang = ctx.s.zoneNameAng[l.id];
    const nameAng = Number.isFinite(ang) ? ang : -Math.PI / 2;
    const dx0 = Math.cos(nameAng);
    const dy0 = Math.sin(nameAng);
    let reach = 0;
    for (const c of vism) {
      const fx = cx0 - c.x;
      const fy = cy0 - c.y;
      const rr = radius(c) + padOf(c);
      const b2 = fx * dx0 + fy * dy0;
      const disc = b2 * b2 - (fx * fx + fy * fy - rr * rr);
      if (disc >= 0) reach = Math.max(reach, -b2 + Math.sqrt(disc));
    }
    if (reach <= 0) reach = Math.max(...vism.map((c) => radius(c) + padOf(c)));
    const tx = cx0 + dx0 * reach;
    const ty = cy0 + dy0 * reach;
    const mm = vism.map((c) => c.id).join(',');
    let outline = '';
    if (ctx.s.zoneOutline && blob.bbox) {
      const bb = blob.bbox;
      const m = lw * 2 + 4;
      const mid = `${idPrefix}crzm${++seq}`;
      outline =
        `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${zF(bb.x - m)}" y="${zF(bb.y - m)}" width="${zF(bb.w + m * 2)}" height="${zF(bb.h + m * 2)}">` +
        `<rect x="${zF(bb.x - m)}" y="${zF(bb.y - m)}" width="${zF(bb.w + m * 2)}" height="${zF(bb.h + m * 2)}" fill="#fff"/>` +
        `<path d="${blob.fill}" fill="#000" fill-rule="nonzero"/></mask>` +
        `<path d="${blob.fill}" fill="none" stroke="${col}" stroke-opacity="0.55" stroke-width="${zF(lw * 2)}" stroke-linejoin="round" mask="url(#${mid})"/>`;
    }
    const nameY = ty + dy0 * FS * 0.75 + (dy0 < -0.3 ? -FS * 0.15 : FS * 0.35);
    const hotW = Math.max(FS * 2.4, l.text.length * FS * 1.06 + FS * 0.8);
    const name = ctx.s.showLblLegend
      ? ''
      : `<text x="${zF(tx)}" y="${zF(nameY)}" text-anchor="middle" font-size="${zF(FS)}" font-weight="700" fill="${col}" paint-order="stroke" stroke="${bg}" stroke-width="${zF(FS * 0.25)}" stroke-linejoin="round">${esc(l.text)}</text>` +
        (edit
          ? `<rect class="zone-colhot" data-zonecol="${l.id}" pointer-events="all" x="${zF(tx - hotW / 2)}" y="${zF(nameY - FS * 1.1)}" width="${zF(hotW)}" height="${zF(FS * 1.55)}" fill="rgba(0,0,0,0)"><title>點一下＝收合這個陣營（成員縮成一顆節點）；拖曳＝改名稱的位置</title></rect>`
          : '');
    const solidCol = solid ? mixHex(col, bg, fop) : null;
    const fillAttr = solidCol ? `fill="${solidCol}"` : `fill="${col}" fill-opacity="${fop}"`;
    out += `<g class="zone-g" data-zone="${l.id}" data-members="${mm}"><path d="${blob.fill}" ${fillAttr} fill-rule="nonzero"/>${outline}${name}</g>`;
  }
  return out;
}

/* ---------- 收合 ---------- */

export function colNodeSvg(ctx: SheetCtx, g: ColGroup, edit: boolean): string {
  const col = labelColor(ctx, g.lbl);
  const FS = Math.max(15, Math.min(26, g.r * 0.32));
  const bg = ctx.pal.bg;
  return (
    `<g class="colnode" data-collbl="${g.id}">${edit ? '<title>收合的陣營：點一下展開；拖曳＝整組搬移</title>' : ''}` +
    `<circle cx="${zF(g.x)}" cy="${zF(g.y)}" r="${zF(g.r)}" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="3"/>` +
    `<text x="${zF(g.x)}" y="${zF(g.y - FS * 0.15)}" text-anchor="middle" font-size="${zF(FS)}" font-weight="800" fill="${col}" paint-order="stroke" stroke="${bg}" stroke-width="${zF(FS * 0.22)}" stroke-linejoin="round">${esc(g.lbl.text)}</text>` +
    `<text x="${zF(g.x)}" y="${zF(g.y + FS * 1.05)}" text-anchor="middle" font-size="${zF(FS * 0.78)}" font-weight="700" fill="${col}" opacity="0.85" paint-order="stroke" stroke="${bg}" stroke-width="${zF(FS * 0.16)}" stroke-linejoin="round">×${g.members.length}</text></g>`
  );
}

/** 收合時的聚合線：一般線裡端點被收合的那些（同組內的線不畫） */
export function colAggregate(ctx: SheetCtx): Map<string, ColAgg> {
  const info = labelInfo(ctx);
  if (info.agg) return info.agg;
  const agg = new Map<string, ColAgg>();
  info.agg = agg;
  const h = info.colHidden;
  if (!h.size) return agg;
  for (const r of ctx.sheet.rels) {
    const t = ctx.typeById.get(r.type);
    if (!t || t.hidden) continue;
    const hf = h.get(r.from);
    const ht = h.get(r.to);
    if (hf === undefined && ht === undefined) continue;
    if (hf !== undefined && hf === ht) continue;
    const tokF = hf !== undefined ? `L${hf}` : `C${r.from}`;
    const tokT = ht !== undefined ? `L${ht}` : `C${r.to}`;
    const flip = tokT < tokF;
    const a = flip ? tokT : tokF;
    const b = flip ? tokF : tokT;
    const key = `${a}|${b}|${r.type}`;
    let bk = agg.get(key);
    if (!bk) {
      bk = { a, b, type: r.type, rels: [], dirs: new Set() };
      agg.set(key, bk);
    }
    bk.rels.push(r);
    bk.dirs.add(r.both ? 'both' : flip ? 'ba' : 'ab');
  }
  return agg;
}

/** 這條線畫不畫成一般線（端點被收合＝聚合或不畫） */
export const relHiddenByCollapse = (ctx: SheetCtx, r: Rel): boolean => {
  const h = labelInfo(ctx).colHidden;
  return h.size > 0 && (h.has(r.from) || h.has(r.to));
};

function colEndPt(ctx: SheetCtx, tok: string): { x: number; y: number; r: number } | null {
  if (tok[0] === 'L') {
    const g = labelInfo(ctx).colGroups.get(Number(tok.slice(1)));
    return g ? { x: g.x, y: g.y, r: g.r } : null;
  }
  const c = ctx.byId.get(Number(tok.slice(1)));
  return c ? { x: c.x, y: c.y, r: charRadius(ctx, c) + 4 } : null;
}

export function colEdgeSvg(ctx: SheetCtx, bk: ColAgg, key: string, edit: boolean): string {
  const tg = ctx.typeById.get(bk.type);
  if (!tg) return '';
  const A = colEndPt(ctx, bk.a);
  const B = colEndPt(ctx, bk.b);
  if (!A || !B) return '';
  let dx = B.x - A.x;
  let dy = B.y - A.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  const x1 = A.x + dx * A.r;
  const y1 = A.y + dy * A.r;
  const x2 = B.x - dx * B.r;
  const y2 = B.y - dy * B.r;
  const col = ownColor(tg.color) || ctx.pal.auto;
  const w = Math.max(2, typeLineW(ctx, tg));
  const dash =
    tg.lineStyle === 'dashed'
      ? ` stroke-dasharray="${zF(Math.max(12, w * 0.9))} ${zF(Math.max(9, w * 1.4))}"`
      : tg.lineStyle === 'dotted'
        ? ` stroke-dasharray="0.1 ${zF(Math.max(9, w * 1.4))}" stroke-linecap="round"`
        : '';
  const only = bk.dirs.size === 1 ? [...bk.dirs][0] : null;
  let cap = '';
  if (only === 'ab' || only === 'ba') {
    const tx = only === 'ab' ? x2 : x1;
    const ty = only === 'ab' ? y2 : y1;
    const ux = only === 'ab' ? dx : -dx;
    const uy = only === 'ab' ? dy : -dy;
    const s = Math.max(10, w * 3);
    const px2 = -uy;
    const py2 = ux;
    cap = `<polygon points="${zF(tx)},${zF(ty)} ${zF(tx - ux * s + px2 * s * 0.55)},${zF(ty - uy * s + py2 * s * 0.55)} ${zF(tx - ux * s - px2 * s * 0.55)},${zF(ty - uy * s - py2 * s * 0.55)}" fill="${col}"/>`;
  }
  const n = bk.rels.length;
  const lb = `${tg.label}${n > 1 ? ` ×${n}` : ''}`;
  const fsL = relNameFS(ctx);
  const wpx = lb.length * fsL * 1.02 + 18;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const label = `<g><rect x="${zF(mx - wpx / 2)}" y="${zF(my - fsL * 0.95)}" width="${zF(wpx)}" height="${zF(fsL * 1.9)}" rx="${zF(fsL * 0.95)}" fill="${ctx.pal.panel}" stroke="${col}" stroke-width="1.5"/><text x="${zF(mx)}" y="${zF(my + fsL * 0.35)}" text-anchor="middle" font-size="${fsL}" font-weight="700" fill="${col}">${esc(lb)}</text></g>`;
  return (
    `<g class="col-edge" data-colkey="${esc(key)}">${edit ? '<title>聚合的關係線：點一下看組成的關係</title>' : ''}` +
    `<line x1="${zF(x1)}" y1="${zF(y1)}" x2="${zF(x2)}" y2="${zF(y2)}" stroke="rgba(0,0,0,0)" stroke-width="${Math.max(16, w + 12)}"/>` +
    `<line x1="${zF(x1)}" y1="${zF(y1)}" x2="${zF(x2)}" y2="${zF(y2)}" stroke="${col}" stroke-width="${w}" opacity="0.92"${dash}/>` +
    `${cap}${label}</g>`
  );
}

export function colEdgesSvg(ctx: SheetCtx, edit: boolean): string {
  let out = '';
  for (const [key, bk] of colAggregate(ctx)) out += colEdgeSvg(ctx, bk, key, edit);
  return out;
}

export function colNodesSvg(ctx: SheetCtx, edit: boolean): string {
  let out = '';
  for (const g of labelInfo(ctx).colGroups.values()) out += colNodeSvg(ctx, g, edit);
  return out;
}

/* ---------- 群體關係 ---------- */

export const grelEndIsLbl = (e: string): boolean => e[0] === 'L';
export const grelEndId = (e: string): number => Number(e.slice(1));
export const grelTok = (isLbl: boolean, id: number): string => `${isLbl ? 'L' : 'C'}${id}`;

export const grelEndAlive = (ctx: SheetCtx, e: string): boolean =>
  grelEndIsLbl(e) ? ctx.lblById.has(grelEndId(e)) : ctx.byId.has(grelEndId(e));

export function grelEndName(ctx: SheetCtx, e: string): string {
  if (grelEndIsLbl(e)) return ctx.lblById.get(grelEndId(e))?.text ?? '?';
  const c = ctx.byId.get(grelEndId(e));
  return c ? displayName(c) : '?';
}

export function grelEndMembers(ctx: SheetCtx, e: string): Char[] {
  if (grelEndIsLbl(e)) return labelInfo(ctx).byId.get(grelEndId(e))?.members ?? [];
  const c = ctx.byId.get(grelEndId(e));
  return c ? [c] : [];
}

export const grelExcluded = (g: GroupRel, charId: number): boolean => g.except.includes(charId);

/** 這條規則還有效（端點、關係類型都在） */
export const grelAlive = (ctx: SheetCtx, g: GroupRel): boolean =>
  g.from !== g.to &&
  grelEndAlive(ctx, g.from) &&
  grelEndAlive(ctx, g.to) &&
  ctx.typeById.has(g.type);

export const aliveGrels = (ctx: SheetCtx): GroupRel[] =>
  ctx.sheet.grels.filter((g) => grelAlive(ctx, g));

export interface GrelEntry {
  g: GroupRel;
  /** 自己就是端點 */
  own: boolean;
  /** 自己在起點那一端 */
  dirOut: boolean;
  /** 以成員身分繼承時：來自哪個標籤 */
  via: Label | null;
  other: string;
  /** 被例外排除 */
  ex: boolean;
}

/** 角色身上「因群體關係而有」的條目：自己是端點的一定列；成員身分只有「算到每位成員」開著才列；兩端都在＝跳過 */
export function grelEntriesFor(ctx: SheetCtx, charId: number): GrelEntry[] {
  const out: GrelEntry[] = [];
  for (const g of ctx.sheet.grels) {
    if (!grelAlive(ctx, g)) continue;
    const memF = grelEndMembers(ctx, g.from).some((c) => c.id === charId);
    const memT = grelEndMembers(ctx, g.to).some((c) => c.id === charId);
    if (memF === memT) continue;
    const mine = memF ? g.from : g.to;
    const own = !grelEndIsLbl(mine);
    if (!own && !g.inherit) continue;
    out.push({
      g,
      own,
      dirOut: memF,
      via: own ? null : (ctx.lblById.get(grelEndId(mine)) ?? null),
      other: memF ? g.to : g.from,
      ex: !own && grelExcluded(g, charId),
    });
  }
  return out;
}

/** 標籤端的有效成員數（扣掉同時是另一端的角色、例外的）；兩端都是標籤或都是角色＝null */
export function grelCount(ctx: SheetCtx, g: GroupRel): number | null {
  if (grelEndIsLbl(g.from) === grelEndIsLbl(g.to)) return null;
  const lblEnd = grelEndIsLbl(g.from) ? g.from : g.to;
  const chrEnd = grelEndIsLbl(g.from) ? g.to : g.from;
  return grelEndMembers(ctx, lblEnd).filter((c) => `C${c.id}` !== chrEnd && !grelExcluded(g, c.id))
    .length;
}

/** 群體關係線（一般線之上、線上標籤之下） */
export function grelEdgesSvg(ctx: SheetCtx): string {
  const gs = aliveGrels(ctx);
  if (!gs.length) return '';
  const lay = labelNetLayout(ctx);
  const lblR = labelNetMetrics(ctx).R;
  const bg = ctx.pal.bg;
  const anchor = (e: string): { x: number; y: number; r: number } | null => {
    if (!grelEndIsLbl(e)) {
      const c = ctx.byId.get(grelEndId(e)) as Char;
      return { x: c.x, y: c.y, r: charRadius(ctx, c) + 8 };
    }
    const id = grelEndId(e);
    const L = ctx.lblById.get(id) as Label;
    const mem = grelEndMembers(ctx, e);
    if (L.zone && mem.length) {
      const cx = mem.reduce((a, c) => a + c.x, 0) / mem.length;
      const cy = mem.reduce((a, c) => a + c.y, 0) / mem.length;
      let R = 0;
      for (const c of mem) R = Math.max(R, Math.hypot(c.x - cx, c.y - cy) + charRadius(ctx, c));
      return { x: cx, y: cy, r: R + 16 };
    }
    const it = lay.find((x) => x.id === id);
    return it ? { x: it.x, y: it.y, r: lblR + 8 } : null;
  };
  let out = '';
  for (const g of gs) {
    const A = anchor(g.from);
    const B = anchor(g.to);
    if (!A || !B) continue;
    const tg = ctx.typeById.get(g.type);
    if (!tg) continue;
    const col = typeLineColor(ctx, tg);
    const cnt = grelCount(ctx, g);
    const empty =
      (grelEndIsLbl(g.from) && !grelEndMembers(ctx, g.from).length) ||
      (grelEndIsLbl(g.to) && !grelEndMembers(ctx, g.to).length);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const x1 = A.x + ux * A.r;
    const y1 = A.y + uy * A.r;
    const x2 = B.x - ux * B.r;
    const y2 = B.y - uy * B.r;
    const span = d - A.r - B.r;
    const label = tg.label + (cnt !== null && ctx.s.showRelName ? ` ×${cnt}` : '');
    const FS = 14;
    const pillW = Math.round((exactTextWidth(label) * FS) / 15) + 18;
    const pillH = 22;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dimAttr = empty ? ' opacity="0.45"' : '';
    const dash = empty ? ' stroke-dasharray="7 7"' : '';
    const arrow = (px: number, py: number, vx: number, vy: number) => {
      const a = Math.atan2(vy, vx);
      const s2 = 13;
      return `<path d="M ${zF(px)} ${zF(py)} L ${zF(px - Math.cos(a - 0.42) * s2)} ${zF(py - Math.sin(a - 0.42) * s2)} L ${zF(px - Math.cos(a + 0.42) * s2)} ${zF(py - Math.sin(a + 0.42) * s2)} Z" fill="${col}"/>`;
    };
    let body = '';
    const lineOk = span > pillW + 30;
    if (lineOk) {
      const seg = `M ${zF(x1)} ${zF(y1)} L ${zF(x2)} ${zF(y2)}`;
      body =
        `<path d="${seg}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="18"/>` +
        `<path d="${seg}" fill="none" stroke="${col}" stroke-width="5"${dash}/>` +
        `<path d="${seg}" fill="none" stroke="${bg}" stroke-width="1.8"${dash}/>` +
        arrow(x2, y2, ux, uy) +
        (g.both ? arrow(x1, y1, -ux, -uy) : '');
    }
    if (ctx.s.showRelName || !lineOk)
      body += `<g class="grel-pill"><rect x="${zF(mx - pillW / 2)}" y="${zF(my - pillH / 2)}" width="${pillW}" height="${pillH}" rx="11" fill="${bg}" stroke="${col}" stroke-width="1.6"/><text x="${zF(mx)}" y="${zF(my + FS * 0.34)}" text-anchor="middle" font-size="${FS}" font-weight="700" fill="${col}">${esc(label)}${g.both && !lineOk ? ' ⇄' : ''}</text></g>`;
    /* 滑過＝暫時展開到成員的扇形虛線（最多 80 條；平常看不到） */
    let fan = '';
    let left = 80;
    for (const [e2, opp] of [
      [g.from, B],
      [g.to, A],
    ] as const) {
      if (!grelEndIsLbl(e2)) continue;
      for (const c of grelEndMembers(ctx, e2)) {
        if (grelExcluded(g, c.id)) continue;
        if (left-- <= 0) break;
        fan += `<line x1="${zF(c.x)}" y1="${zF(c.y)}" x2="${zF(opp.x)}" y2="${zF(opp.y)}" stroke="${col}" stroke-width="1.4" stroke-dasharray="3 5"/>`;
      }
    }
    if (fan) fan = `<g class="grel-fan">${fan}</g>`;
    out += `<g class="grel-edge" data-grelid="${g.id}"${dimAttr}><title>${esc(grelEndName(ctx, g.from))} ${g.both ? '⇄' : '→'} ${esc(grelEndName(ctx, g.to))}：${esc(tg.label)}</title>${fan}${body}</g>`;
  }
  return out ? `<g class="grel-layer">${out}</g>` : '';
}

/* ---------- 聚焦 ---------- */

/** 聚焦的對象（編輯畫面與互動網頁共用） */
export type FocusTarget =
  | { kind: 'node'; id: number }
  | { kind: 'edge'; id: number }
  | { kind: 'type'; id: number }
  | { kind: 'label'; id: number };

export interface FocusSets {
  nodes: Set<number>;
  edges: Set<number>;
  lbls: Set<number>;
}

/** 聚焦時維持亮的角色、線、標籤（原作的 highlight1stDegree） */
/**
 * views：點擊聚焦（不是滑過）時，對這個角色寫過看法的人也一起亮（沒有關係線也算；第三批，原作的 highlight1stDegree）
 */
export function focusSets(
  ctx: SheetCtx,
  f: FocusTarget,
  opts: { views?: boolean } = {},
): FocusSets {
  const nodes = new Set<number>();
  const edges = new Set<number>();
  const lbls = new Set<number>();
  const vis = (r: Rel) => {
    const t = ctx.typeById.get(r.type);
    return !!t && !t.hidden;
  };
  if (f.kind === 'node') {
    nodes.add(f.id);
    for (const r of ctx.sheet.rels)
      if (vis(r) && (r.from === f.id || r.to === f.id)) {
        edges.add(r.id);
        nodes.add(r.from);
        nodes.add(r.to);
      }
    if (opts.views)
      for (const [a, row] of Object.entries(ctx.sheet.views ?? {}))
        if (row[f.id] && ctx.byId.has(Number(a))) nodes.add(Number(a));
    const c = ctx.byId.get(f.id);
    if (c)
      for (const lid of charLabelIds(c)) {
        const L = ctx.lblById.get(lid);
        if (L && !L.hidden && (L.zone || ctx.s.showLabelNodes)) lbls.add(lid);
      }
  } else if (f.kind === 'edge') {
    edges.add(f.id);
    const r = ctx.sheet.rels.find((x) => x.id === f.id);
    if (r) {
      nodes.add(r.from);
      nodes.add(r.to);
    }
  } else if (f.kind === 'label') {
    lbls.add(f.id);
    const mem = labelInfo(ctx).byId.get(f.id)?.members ?? [];
    const mset = new Set(mem.map((c) => c.id));
    for (const c of mem) nodes.add(c.id);
    for (const r of ctx.sheet.rels)
      if (vis(r) && mset.has(r.from) && mset.has(r.to)) edges.add(r.id);
  } else {
    for (const r of ctx.sheet.rels)
      if (r.type === f.id && vis(r)) {
        edges.add(r.id);
        nodes.add(r.from);
        nodes.add(r.to);
      }
  }
  return { nodes, edges, lbls };
}

/** 收合節點亮不亮：標籤在聚焦裡，或成員有人在（代位） */
export function colFocusHit(ctx: SheetCtx, fs: FocusSets, lblId: number): boolean {
  if (fs.lbls.has(lblId)) return true;
  const g = labelInfo(ctx).colGroups.get(lblId);
  return !!g && g.members.some((c) => fs.nodes.has(c.id));
}

/** 聚合線亮不亮：組成的關係有一條在聚焦裡 */
export function colEdgeFocusHit(ctx: SheetCtx, fs: FocusSets, key: string): boolean {
  const bk = colAggregate(ctx).get(key);
  return !!bk && bk.rels.some((r) => fs.edges.has(r.id));
}
