/**
 * 演出的畫法（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的「04 演出」；規格 F313～F328、3.19）。
 * 資料與時間軸在 model/stage.ts、路線怎麼走在 model/route.ts；這裡只畫。編輯畫面（GM 的準備、PL 的演出畫面）與匯出共用。
 *
 * - 藏起來的房間（PL）：外形蓋灰（同祕密樓層、GM 專用房間的蓋灰）、牆色的虛線輪廓、正中間「？？？」的牌子；
 *   房間裡的家具、文字、手畫的牆、自由線、房間邊上的門窗都不畫。立體圖裡是封起來的黑箱＋面向看的人的「？？？」。
 * - 整層藏起來（PL）：照祕密樓層的畫法（輪廓＋「樓層・未探索　？？？」）。
 * - 移動路線：紅色虛線＋紙色的光暈＋箭頭＋起點的編號圓標（顏色同地圖演出產生器的「移動路線」）；立體圖裡畫在
 *   那一層的地板上方 0.36 格，前一條路線在別一層時畫出走樓梯的線（樓梯的平台到另一層的平台、螺旋梯繞一圈）。
 *   畫出來的動畫＝沿著線長畫到進度 q，q＝1 時才有箭頭。
 * - GM 的準備（不是 PL 用時）：房間照畫，藏起來的房間加淡紅的底、紅色虛線與「藏起來・什麼時候公開」的牌子；路線全部畫。
 * 配色、牌子的大小、線的粗細都是本站自己定的（原作的意思：藏成「？？？」、走過的路線一條一條出現）。
 */

import type { ShownRoom } from '../model/geometry';
import { floorBounds, visibleFloor } from '../model/geometry';
import {
  type BridgeHop,
  type Pt,
  polyOf,
  roomKey,
  routePolyline,
  splitRoomKey,
} from '../model/route';
import { roomMainRect, roomPolygon, traceRoom } from '../model/shape';
import {
  type BoardLayout,
  boardLayout,
  type StackLayout,
  stackCamera,
  stackFocus,
  stackLayout,
  stackLevels,
  stackProject,
} from '../model/stack';
import {
  type RevealWhen,
  type StageFocus,
  type StageFrame,
  type StageState,
  type StageTimeline,
  stagePlanOf,
} from '../model/stage';
import type { Floor, Project, Rect, Room, SizeMode, StageRoute } from '../model/types';
import { pointOwner } from '../model/walls';
import { ST } from '../stageStrings';
import { haloText, measureText } from './labels';
import { drawFloor, lineWidthFor } from './render';
import { drawBoard, drawStack, stackColors, stackLayoutFloors, tag } from './stack';
import type { FloorTheme } from './themes';

type Ctx = CanvasRenderingContext2D;

/** 路線的顏色（同地圖演出產生器的移動路線） */
export const ROUTE_COLOR = '#e5323b';
/** GM 準備時藏起來的房間的標記 */
const MARK_FILL = 'rgba(229, 50, 59, 0.16)';

/* ---------- 藏起來的樓層 ---------- */

/**
 * PL 的演出畫面的一層：藏起來的房間只剩外形（蓋灰，`masked`；牆的種類照舊，牆不會變），裡面的家具、文字、手畫的牆、
 * 自由線與房間邊上的門窗拿掉；整層藏起來的換成祕密樓層（visibleFloor 的 PL 檢視只留輪廓）。之後照一般的 PL 檢視畫。
 */
export function stageFloor(
  f: Floor,
  hidden: ReadonlySet<string>,
  hiddenFloors: ReadonlySet<string>,
): Floor {
  if (hiddenFloors.has(f.id)) return { ...f, secret: true };
  const ids = new Set(f.rooms.filter((r) => hidden.has(roomKey(f.id, r.id))).map((r) => r.id));
  if (!ids.size) return f;
  const own = pointOwner(f.rooms);
  const inHidden = (x: number, y: number) => {
    const r = own(x, y);
    return !!r && ids.has(r.id);
  };
  return {
    ...f,
    rooms: f.rooms.map((r) =>
      ids.has(r.id) ? ({ ...r, name: '', plName: '', masked: true } as ShownRoom) : r,
    ),
    walls: f.walls.filter((w) => !inHidden((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)),
    openings: f.openings.filter((o) => {
      const mx = o.o === 'h' ? o.x + o.len / 2 : o.x;
      const my = o.o === 'h' ? o.y : o.y + o.len / 2;
      const nx = o.o === 'h' ? 0 : 0.3;
      const ny = o.o === 'h' ? 0.3 : 0;
      return !inHidden(mx - nx, my - ny) && !inHidden(mx + nx, my + ny);
    }),
    items: f.items.filter((i) => !inHidden(i.x + i.w / 2, i.y + i.h / 2)),
    texts: f.texts.filter((t) => !inHidden(t.x, t.y)),
    ...(f.lines
      ? { lines: f.lines.filter((l) => !inHidden((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2)) }
      : {}),
  };
}

/** 這一層看得到的藏起來的房間（整層藏起來、祕密樓層時沒有：整層畫成輪廓） */
function hiddenRoomsOn(f: Floor, state: Pick<StageState, 'hidden' | 'hiddenFloors'>): Room[] {
  if (state.hiddenFloors.has(f.id) || f.secret) return [];
  return f.rooms.filter((r) => state.hidden.has(roomKey(f.id, r.id)));
}

/** 「？？？」的牌子（房間裡最大的那一塊的正中間；字級依房間的大小 0.32～0.6 格） */
function veilTag(c: Ctx, room: Room, theme: FloorTheme): void {
  const m = roomMainRect(room);
  const fs = Math.max(0.32, Math.min(0.6, Math.min(m.w, m.h) * 0.2));
  const text = ST.veil;
  const f = { weight: 800, size: fs, family: theme.font };
  const w = Math.min(
    Math.max(m.w - 0.3, fs * 2),
    Math.max(fs * 4.4, measureText(c, text, f) + fs * 1.6),
  );
  const h = fs * 1.9;
  const x = m.x + m.w / 2;
  const y = m.y + m.h / 2;
  c.save();
  c.beginPath();
  c.roundRect(x - w / 2, y - h / 2, w, h, fs * 0.35);
  c.fillStyle = theme.bg === 'transparent' ? theme.defaultFill : theme.bg;
  c.fill();
  c.strokeStyle = theme.wall;
  c.lineWidth = fs * 0.12;
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  haloText(c, text, x, y + fs * 0.06, f, theme.label, null, 0);
  c.restore();
}

/** PL：藏起來的房間的虛線輪廓與「？？？」（蓋灰由 drawFloor 畫） */
export function drawHiddenRooms(
  c: Ctx,
  f: Floor,
  state: Pick<StageState, 'hidden' | 'hiddenFloors'>,
  theme: FloorTheme,
  lw: number,
): void {
  const rooms = hiddenRoomsOn(f, state);
  if (!rooms.length) return;
  c.save();
  c.strokeStyle = theme.wall;
  c.lineWidth = lw * 1.6;
  c.setLineDash([0.48, 0.28]);
  for (const r of rooms) {
    c.beginPath();
    traceRoom(c, r);
    c.stroke();
  }
  c.restore();
  for (const r of rooms) veilTag(c, r, theme);
}

/** 公開時機的說明（GM 的標記、清單的小字） */
export function revealText(w: RevealWhen | undefined): string {
  const I = ST.info;
  if (!w) return '';
  if (w.mode === 'manual') return I.manual;
  if (w.mode === 'route') return w.via === 'stairs' ? I.stairs(w.index + 1) : I.route(w.index + 1);
  if (w.missing) return I.missing;
  return w.sequential ? I.sequential : I.after;
}

/** GM 的準備：藏起來的房間的標記（淡紅的底、紅色虛線、「藏起來・什麼時候公開」）；整層藏起來的樓層每一間都加虛線 */
export function drawStageMarks(
  c: Ctx,
  f: Floor,
  tl: StageTimeline,
  theme: FloorTheme,
  lw: number,
): void {
  const floorHidden = stagePlanOf(tl.ctx.project).floors?.includes(f.id) ?? false;
  const rooms = f.rooms.filter((r) => floorHidden || tl.info.has(roomKey(f.id, r.id)));
  if (!rooms.length) return;
  c.save();
  for (const r of rooms) {
    c.beginPath();
    traceRoom(c, r);
    c.fillStyle = MARK_FILL;
    c.fill();
  }
  c.strokeStyle = ROUTE_COLOR;
  c.lineWidth = Math.max(lw * 2, 0.08);
  c.setLineDash([0.36, 0.2]);
  for (const r of rooms) {
    c.beginPath();
    traceRoom(c, r);
    c.stroke();
  }
  c.restore();
  for (const r of rooms) {
    const info = tl.info.get(roomKey(f.id, r.id));
    const text = info ? `${ST.badgeHidden}・${revealText(info)}` : ST.badgeFloor;
    const m = roomMainRect(r);
    const fs = Math.max(0.26, Math.min(0.36, m.w * 0.06));
    const y = m.y + m.h / 2 + Math.min(m.h / 2 - fs, fs * 2.2);
    markTag(c, m.x + m.w / 2, y, text, fs, Math.max(1.6, m.w - 0.4), theme);
  }
}

function markTag(
  c: Ctx,
  x: number,
  y: number,
  text: string,
  fs: number,
  maxW: number,
  theme: FloorTheme,
): void {
  const f = { weight: 700, size: fs, family: theme.font };
  const tw = measureText(c, text, f);
  const w = Math.min(maxW, tw + fs * 1.4);
  const h = fs * 1.7;
  c.save();
  c.beginPath();
  c.roundRect(x - w / 2, y - h / 2, w, h, fs * 0.3);
  c.fillStyle = theme.bg === 'transparent' ? theme.defaultFill : theme.bg;
  c.fill();
  c.strokeStyle = ROUTE_COLOR;
  c.lineWidth = fs * 0.1;
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.translate(x, y + fs * 0.06);
  const room = w - fs * 0.6;
  if (tw > room) c.scale(room / tw, 1);
  haloText(c, text, 0, 0, f, ROUTE_COLOR, null, 0);
  c.restore();
}

/* ---------- 路線 ---------- */

/** 折線的前 q（0～1）的部分 */
export function partialPath(pts: readonly Pt[], q: number): Pt[] {
  if (q >= 1 || pts.length < 2) return [...pts];
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total * Math.max(0, q);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d >= left) {
      const t = d ? left / d : 0;
      out.push({
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      });
      return out;
    }
    left -= d;
    out.push(pts[i]);
  }
  return out;
}

export interface RouteStyle {
  /** 光暈、虛線的粗細，虛線的長短，箭頭的長度、張開的角度、箭頭的線寬（光暈、本體） */
  halo: number;
  line: number;
  dash: [number, number];
  head: number;
  spread: number;
  headHalo: number;
  headLine: number;
  /** 編號圓標的半徑、字級 */
  marker: number;
  markerText: number;
}

/** 平面圖的路線（格；原作 2D 的比例放大一點，看得清楚） */
export const ROUTE_2D: RouteStyle = {
  halo: 0.26,
  line: 0.13,
  dash: [0.4, 0.22],
  head: 0.5,
  spread: 0.48,
  headHalo: 0.3,
  headLine: 0.15,
  marker: 0.42,
  markerText: 0.42,
};
/** 立體圖的路線（原作 3D：光暈 .16 m、線 .09 m、虛線 .22／.12 m、箭頭 .34 m ±0.5 rad、圓標 .28 m；換成格） */
export const ROUTE_3D: RouteStyle = {
  halo: 0.32,
  line: 0.18,
  dash: [0.44, 0.24],
  head: 0.68,
  spread: 0.5,
  headHalo: 0.3,
  headLine: 0.19,
  marker: 0.56,
  markerText: 0.48,
};

/** 一條路線（已經投影好的折線）：光暈、虛線、q＝1 時箭頭 */
export function strokeRoute(
  c: Ctx,
  pts: readonly Pt[],
  progress: number,
  head: boolean,
  w: number,
  st: RouteStyle,
  paper: string,
): void {
  const part = partialPath(pts, progress);
  if (part.length < 2) return;
  const trace = () => {
    c.beginPath();
    c.moveTo(part[0].x, part[0].y);
    for (let i = 1; i < part.length; i++) c.lineTo(part[i].x, part[i].y);
  };
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  trace();
  c.globalAlpha = 0.85;
  c.strokeStyle = paper;
  c.lineWidth = st.halo * w;
  c.stroke();
  c.globalAlpha = 1;
  c.setLineDash(st.dash.map((d) => d * w));
  c.strokeStyle = ROUTE_COLOR;
  c.lineWidth = st.line * w;
  c.stroke();
  c.setLineDash([]);
  if (head) {
    const end = part[part.length - 1];
    let prev = part[part.length - 2];
    for (let i = part.length - 2; i >= 0 && Math.hypot(end.x - prev.x, end.y - prev.y) < 1e-6; i--)
      prev = part[i];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    const L = st.head * w;
    c.beginPath();
    c.moveTo(end.x - Math.cos(ang - st.spread) * L, end.y - Math.sin(ang - st.spread) * L);
    c.lineTo(end.x, end.y);
    c.lineTo(end.x - Math.cos(ang + st.spread) * L, end.y - Math.sin(ang + st.spread) * L);
    c.strokeStyle = paper;
    c.lineWidth = st.headHalo * w;
    c.stroke();
    c.strokeStyle = ROUTE_COLOR;
    c.lineWidth = st.headLine * w;
    c.stroke();
  }
  c.restore();
}

/** 起點的編號圓標 */
export function routeMarker(
  c: Ctx,
  p: Pt,
  n: number,
  st: RouteStyle,
  paper: string,
  font: string,
): void {
  c.save();
  c.beginPath();
  c.arc(p.x, p.y, st.marker, 0, Math.PI * 2);
  c.fillStyle = ROUTE_COLOR;
  c.fill();
  c.strokeStyle = paper;
  c.lineWidth = st.marker * 0.16;
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  haloText(
    c,
    String(n),
    p.x,
    p.y + st.markerText * 0.06,
    { weight: 800, size: st.markerText, family: font },
    paper,
    null,
    0,
  );
  c.restore();
}

/** 平面圖上路線的形狀（轉角的圓弧不比房間的外形近） */
export function routeShape(r: StageRoute, f: Floor | undefined): Pt[] {
  return routePolyline(r, r.pts && f ? f.rooms.map((x) => roomPolygon(x)) : []);
}

/** 路線在這個狀態看得到嗎（PL：藏起來的樓層、祕密樓層上的不畫） */
function routeFloorVisible(floor: Floor | undefined, state: StageState | null): boolean {
  if (!floor) return false;
  if (!state) return true;
  return !state.hiddenFloors.has(floor.id) && !floor.secret;
}

/** 平面圖（一層）的路線：PL＝狀態裡的（畫到的進度）、GM＝全部 */
export function drawRoutesPlan(
  c: Ctx,
  f: Floor,
  tl: StageTimeline,
  state: StageState | null,
  theme: FloorTheme,
): void {
  const paper = theme.bg === 'transparent' ? theme.defaultFill : theme.bg;
  const routes = tl.ctx.routes;
  const draws = state ? state.routes : routes.map((r) => ({ id: r.id, progress: 1, head: true }));
  if (!routeFloorVisible(f, state)) return;
  for (const d of draws) {
    const i = routes.findIndex((r) => r.id === d.id);
    const r = routes[i];
    if (!r || r.floor !== f.id) continue;
    const pts = routeShape(r, f);
    strokeRoute(c, pts, d.progress, d.head, r.w ?? 1, ROUTE_2D, paper);
    routeMarker(c, pts[0], i + 1, ROUTE_2D, paper, theme.font);
  }
}

/** 立體圖裡路線的高度（格；原作 0.18 m）、走樓梯的線的高度（0.22 m） */
const ROUTE_Z = 0.36;
const BRIDGE_Z = 0.44;

/** 走樓梯的線（立體圖的座標）：前一條路線的終點 → 經過的樓梯 → 這一條的起點（原作的 bridge） */
export function bridgePath(
  L: StackLayout,
  hops: readonly BridgeHop[],
  prev: StageRoute,
  next: StageRoute,
  prevLevel: number,
  nextLevel: number,
): Pt[] {
  const rise = L.cam.rise;
  const out: Pt[] = [stackProject(L, prev.x2, prev.y2, prevLevel, BRIDGE_Z)];
  for (const h of hops) {
    const up = h.toLevel > h.fromLevel;
    for (const p of h.approach) out.push(stackProject(L, p.x, p.y, h.fromLevel, BRIDGE_Z));
    out.push(stackProject(L, h.from.x, h.from.y, h.fromLevel, BRIDGE_Z));
    if (h.from.landing)
      out.push(
        stackProject(
          L,
          h.from.landing.x,
          h.from.landing.y,
          h.fromLevel,
          BRIDGE_Z + (up ? 2.5 : -1.64) * rise,
        ),
      );
    if (h.to.landing)
      out.push(
        stackProject(
          L,
          h.to.landing.x,
          h.to.landing.y,
          h.toLevel,
          BRIDGE_Z + (up ? -1.64 : 2.5) * rise,
        ),
      );
    if (h.link.kind === 'spiral') {
      const a = stackProject(L, h.from.x, h.from.y, h.fromLevel, BRIDGE_Z);
      const b = stackProject(L, h.to.x, h.to.y, h.toLevel, BRIDGE_Z);
      const hand =
        h.link.low.item?.t === 'spiral_ccw' || h.link.high.item?.t === 'spiral_ccw' ? -1 : 1;
      for (let k = 1; k < 20; k++) {
        const t = k / 20;
        const ang = t * Math.PI * 2 * hand * (up ? 1 : -1);
        const rad = 0.68 * Math.sin(Math.PI * t);
        out.push({
          x: a.x + (b.x - a.x) * t + Math.cos(ang) * rad,
          y: a.y + (b.y - a.y) * t + Math.sin(ang) * rad * L.sy,
        });
      }
    }
    out.push(stackProject(L, h.to.x, h.to.y, h.toLevel, BRIDGE_Z));
    for (const p of h.exit) out.push(stackProject(L, p.x, p.y, h.toLevel, BRIDGE_Z));
  }
  out.push(stackProject(L, next.x1, next.y1, nextLevel, BRIDGE_Z));
  return out.filter((p, i) => !i || Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y) > 1e-6);
}

/** 立體圖的路線與走樓梯的線（全部樓層畫完之後） */
export function drawRoutesStack(
  c: Ctx,
  L: StackLayout,
  levels: readonly Floor[],
  tl: StageTimeline,
  state: StageState | null,
  theme: FloorTheme,
): void {
  const col = stackColors(theme);
  const paper = col.paper;
  const routes = tl.ctx.routes;
  const levelOf = (id: string) => levels.findIndex((f) => f.id === id);
  const visible = (r: StageRoute) => routeFloorVisible(levels[levelOf(r.floor)], state);
  const hopVisible = (hops: readonly BridgeHop[]) =>
    !state ||
    hops.every(
      (h) =>
        !state.hiddenFloors.has(levels[h.fromLevel]?.id ?? '') &&
        !state.hiddenFloors.has(levels[h.toLevel]?.id ?? '') &&
        !levels[h.fromLevel]?.secret &&
        !levels[h.toLevel]?.secret &&
        h.rooms.every((k) => !state.hidden.has(k)),
    );
  const bridges = state
    ? state.bridges
    : routes
        .map((r, i) => ({ id: r.id, index: i, progress: 1, head: true }))
        .filter((b) => b.index > 0);
  for (const b of bridges) {
    const r = routes[b.index];
    const prev = routes[b.index - 1];
    const hops = tl.ctx.hops[b.index];
    if (!r || !prev || !hops?.length || !visible(prev) || !hopVisible(hops)) continue;
    const pts = bridgePath(L, hops, prev, r, levelOf(prev.floor), levelOf(r.floor));
    strokeRoute(c, pts, b.progress, b.head, 1, { ...ROUTE_3D, head: 0.6 }, paper);
  }
  const draws = state ? state.routes : routes.map((r) => ({ id: r.id, progress: 1, head: true }));
  for (const d of draws) {
    const i = routes.findIndex((r) => r.id === d.id);
    const r = routes[i];
    const level = r ? levelOf(r.floor) : -1;
    if (!r || level < 0 || !visible(r)) continue;
    const pts = routeShape(r, levels[level]).map((p) => stackProject(L, p.x, p.y, level, ROUTE_Z));
    strokeRoute(c, pts, d.progress, d.head, r.w ?? 1, ROUTE_3D, paper);
    routeMarker(c, pts[0], i + 1, ROUTE_3D, paper, theme.font);
  }
}

/** 立體圖：一層的「？？？」（PL）或 GM 的標記 */
function drawStackMarks(
  c: Ctx,
  L: StackLayout,
  level: number,
  f: Floor,
  tl: StageTimeline,
  state: StageState | null,
  theme: FloorTheme,
): void {
  const col = stackColors(theme);
  if (state) {
    for (const r of hiddenRoomsOn(f, state)) {
      const m = roomMainRect(r);
      const p = stackProject(L, m.x + m.w / 2, m.y + m.h / 2, level, 0.72);
      tag(c, p.x, p.y, ST.veil, {
        size: 0.42,
        weight: 800,
        font: theme.font,
        fill: col.paper,
        stroke: col.accent,
        strokeW: 0.05,
        color: theme.label,
        minW: 2.4,
        maxW: 4,
        h: 0.84,
        radius: 0.12,
      });
    }
    return;
  }
  const floorHidden = stagePlanOf(tl.ctx.project).floors?.includes(f.id) ?? false;
  for (const r of f.rooms) {
    const info = tl.info.get(roomKey(f.id, r.id));
    if (!info && !floorHidden) continue;
    const poly = polyOf(r);
    const top = poly.map((q) => stackProject(L, q.x, q.y, level, 0.72));
    c.save();
    c.beginPath();
    for (const [k, q] of top.entries()) {
      if (k) c.lineTo(q.x, q.y);
      else c.moveTo(q.x, q.y);
    }
    c.closePath();
    c.fillStyle = MARK_FILL;
    c.fill();
    c.setLineDash([0.36, 0.2]);
    c.strokeStyle = ROUTE_COLOR;
    c.lineWidth = 0.1;
    c.stroke();
    c.restore();
    const m = roomMainRect(r);
    const p = stackProject(L, m.x + m.w / 2, m.y + m.h / 2, level, 0.72);
    tag(c, p.x, p.y + 0.9, info ? `${ST.badgeHidden}・${revealText(info)}` : ST.badgeFloor, {
      size: 0.32,
      weight: 700,
      font: theme.font,
      fill: col.paper,
      stroke: ROUTE_COLOR,
      strokeW: 0.04,
      color: ROUTE_COLOR,
      minW: 2,
      maxW: 6.4,
      h: 0.64,
      radius: 0.1,
    });
  }
}

/* ---------- 演出的畫面 ---------- */

export type StageView = 'plan' | 'stack' | 'board';

export interface StageScene {
  view: StageView;
  project: Project;
  tl: StageTimeline;
  /** 立體圖由下往上的樓層（原本的資料） */
  levels: Floor[];
  stack: StackLayout | null;
  board: BoardLayout | null;
  /** 那一層看的全體（立體圖、總覽是整張） */
  whole: (floor: string) => Rect;
  /** 這一步的範圍在畫面上的位置（鏡頭跟隨） */
  focusBox: (f: StageFocus) => Rect | null;
}

/** 沒有東西時平面圖的範圍 */
const EMPTY_PLAN: Rect = { x: 0, y: 0, w: 24, h: 16 };

/**
 * 演出的畫面的版面：平面圖（一層一層）、立體樓層圖、樓層總覽。PL 用時版面照 PL 看得到的東西算（同 PL 用的匯出，
 * GM 專用的東西、祕密樓層的內容不影響大小；藏起來只是暫時的，不影響版面，播放時畫面不會跳）。
 */
export function stageScene(
  p: Project,
  tl: StageTimeline,
  view: StageView,
  o: { playerView: boolean; hideClues: boolean },
): StageScene {
  const levels = stackLevels(p.floors).map((l) => l.floor);
  const cam = stackCamera(p);
  const layoutFloors = o.playerView ? stackLayoutFloors(levels, { ...o, reveal: false }) : levels;
  const board = view === 'board' ? boardLayout(layoutFloors, cam) : null;
  const stack = view === 'stack' ? stackLayout(layoutFloors, cam) : (board?.stack ?? null);
  const byId = new Map(p.floors.map((f) => [f.id, f]));
  const planRect = (id: string): Rect => {
    const f = byId.get(id) ?? p.floors[p.active];
    if (!f) return { ...EMPTY_PLAN };
    let b = floorBounds(visibleFloor(f, o.playerView, o.hideClues) as Floor);
    for (const r of tl.ctx.routes) {
      if (r.floor !== f.id) continue;
      for (const q of routeShape(r, f)) {
        const pr = { x: q.x - 0.6, y: q.y - 0.6, w: 1.2, h: 1.2 };
        b = b
          ? {
              x: Math.min(b.x, pr.x),
              y: Math.min(b.y, pr.y),
              w: Math.max(b.x + b.w, pr.x + pr.w) - Math.min(b.x, pr.x),
              h: Math.max(b.y + b.h, pr.y + pr.h) - Math.min(b.y, pr.y),
            }
          : pr;
      }
    }
    const r = b ?? EMPTY_PLAN;
    const x0 = Math.floor(r.x - 2);
    const y0 = Math.floor(r.y - 3.4);
    return { x: x0, y: y0, w: Math.ceil(r.x + r.w + 2) - x0, h: Math.ceil(r.y + r.h + 2) - y0 };
  };
  const levelIndex = (id: string) => levels.findIndex((f) => f.id === id);
  return {
    view,
    project: p,
    tl,
    levels,
    stack,
    board,
    whole: (id) =>
      view === 'plan'
        ? planRect(id)
        : board
          ? { x: 0, y: 0, w: board.width, h: board.height }
          : (stack as StackLayout).bounds,
    focusBox: (f) => {
      if (view === 'plan') return f.rect;
      const level = levelIndex(f.floor);
      if (level < 0 || !stack) return null;
      const b = stackFocus(stack, f.rect, level);
      if (!board) return b;
      return {
        x: board.stackTx + b.x * board.stackScale,
        y: board.stackTy + b.y * board.stackScale,
        w: b.w * board.stackScale,
        h: b.h * board.stackScale,
      };
    },
  };
}

export interface StageDrawOptions {
  theme: FloorTheme;
  /** 每格幾 px（線寬） */
  zoom: number;
  showSize: SizeMode;
  hideNames: boolean;
  hideClues: boolean;
  night?: number;
  /** 鋪底色的範圍（沒有＝不鋪；透明背景的樣式也不鋪） */
  viewRect?: Rect;
  /** 立體圖的樓層牌加框的那一層（−1＝不加） */
  activeLevel: number;
  /** 平面圖：這一層（GM 的準備時是目前的樓層；PL 的演出畫面照狀態） */
  planFloor?: string;
  /** 平面圖：左上角寫樓層名稱（匯出） */
  floorTitle?: boolean;
}

/**
 * 畫一個狀態。`state` 有＝PL 的演出畫面（藏起來的照狀態、路線照進度）；null＝GM 的準備（照原本的畫、加標記、路線全部）。
 */
export function drawStageState(
  c: Ctx,
  scene: StageScene,
  o: StageDrawOptions,
  state: StageState | null,
): void {
  const { tl } = scene;
  const theme = o.theme;
  const p = scene.project;
  const pl = !!state;
  if (o.viewRect && theme.bg !== 'transparent') {
    c.fillStyle = theme.bg;
    c.fillRect(o.viewRect.x, o.viewRect.y, o.viewRect.w, o.viewRect.h);
  }
  const shown = (f: Floor) => (state ? stageFloor(f, state.hidden, state.hiddenFloors) : f);
  const base = {
    theme,
    showSize: o.showSize,
    hideNames: o.hideNames,
    playerView: pl,
    hideClues: o.hideClues,
    ...(o.night ? { night: o.night } : {}),
  };
  if (scene.view === 'plan') {
    const id = state?.floor ?? o.planFloor;
    const f = p.floors.find((x) => x.id === id) ?? p.floors[p.active];
    if (!f) return;
    const lw = lineWidthFor(o.zoom);
    drawFloor(c, shown(f), { ...base, zoom: o.zoom, editor: false, grid: false });
    if (state) drawHiddenRooms(c, f, state, theme, lw);
    else drawStageMarks(c, f, tl, theme, lw);
    drawRoutesPlan(c, f, tl, state, theme);
    if (o.floorTitle) {
      const r = scene.whole(f.id);
      c.save();
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      haloText(
        c,
        f.name || '—',
        r.x + 1,
        r.y + 2.2,
        { weight: 800, size: 1, family: theme.font },
        theme.label,
        null,
        0,
      );
      c.restore();
    }
    return;
  }
  const floors = scene.levels.map(shown);
  const stackOpts = {
    ...base,
    zoom: o.zoom,
    activeLevel: o.activeLevel,
    levelOverlay: (cc: Ctx, L: StackLayout, level: number) => {
      const f = scene.levels[level];
      if (f) drawStackMarks(cc, L, level, f, tl, state, theme);
    },
    overlay: (cc: Ctx, L: StackLayout) => drawRoutesStack(cc, L, scene.levels, tl, state, theme),
  };
  if (scene.board)
    drawBoard(c, scene.board, floors, {
      ...stackOpts,
      title: p.name,
      cardOverlay: (cc: Ctx, level: number, zoom: number) => {
        const f = scene.levels[level];
        if (!f) return;
        const lw = lineWidthFor(zoom);
        if (state) drawHiddenRooms(cc, f, state, theme, lw);
        else drawStageMarks(cc, f, tl, theme, lw);
        drawRoutesPlan(cc, f, tl, state, theme);
      },
    });
  else if (scene.stack) drawStack(c, scene.stack, floors, stackOpts);
}

let layerCanvas: HTMLCanvasElement | null = null;

/** 一格：淡入時先畫底下的畫面，再把這一步的畫面以不透明度 alpha 疊上去（另一張畫布畫好再疊，裡面的半透明照舊） */
export function drawStageFrame(
  c: Ctx,
  scene: StageScene,
  o: StageDrawOptions,
  frame: Pick<StageFrame, 'from' | 'to' | 'alpha'>,
): void {
  if (!frame.from || frame.alpha >= 1) {
    drawStageState(c, scene, o, frame.to);
    return;
  }
  drawStageState(c, scene, o, frame.from);
  if (frame.alpha <= 0) return;
  const w = c.canvas.width;
  const h = c.canvas.height;
  if (!layerCanvas || layerCanvas.width !== w || layerCanvas.height !== h) {
    layerCanvas = document.createElement('canvas');
    layerCanvas.width = w;
    layerCanvas.height = h;
  }
  const lc = layerCanvas.getContext('2d');
  if (!lc) {
    drawStageState(c, scene, o, frame.to);
    return;
  }
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, w, h);
  lc.setTransform(c.getTransform());
  drawStageState(lc, scene, o, frame.to);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = frame.alpha;
  c.drawImage(layerCanvas, 0, 0);
  c.restore();
}

/** 範圍 → 畫布的變換（範圍放進 w × h 的畫面正中間，寬高比不同時多看一點） */
export function viewTransform(box: Rect, w: number, h: number): [number, number, number] {
  const s = Math.min(w / box.w, h / box.h);
  return [s, w / 2 - (box.x + box.w / 2) * s, h / 2 - (box.y + box.h / 2) * s];
}

/** 房間的鍵 → 名字（時間軸、清單用；PL 名字優先不用：這是 GM 的介面） */
export function roomName(p: Project, key: string): { floor: string; name: string } {
  const { floor, room } = splitRoomKey(key);
  const f = p.floors.find((x) => x.id === floor);
  const r = f?.rooms.find((x) => x.id === room);
  return { floor: f?.name || '—', name: r?.name || ST.unnamed };
}
