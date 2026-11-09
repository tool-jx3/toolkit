/**
 * 立體樓層圖與樓層總覽的畫法（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的立体積層図・統合ボード；規格 F303～F306、3.18）。
 * 投影與版面在 model/stack.ts；這裡只畫。編輯畫面與匯出共用。
 *
 * 立體圖：由下往上，每一層——
 * 1. 樓板：房間的外形往下 SLAB 格的側面（由後往前畫）與影子；
 * 2. 平面圖：照那一層的變換畫（drawFloor 的 stacked＝'stack'：家具是平面的圖示，名字與文字不畫）；
 * 3. 立體的樓梯（直的樓梯、螺旋梯）；PL 檢視的 GM 專用房間是封起來的黑箱；
 * 4. 左邊的樓層牌、面向看的人的房間名牌與樓梯牌；
 * 5. 往上一層的連接（樓梯、梯子、電梯的直線）。
 * 祕密樓層（F307）在 PL 檢視只有輪廓與「？？？」的牌子。
 * 配色由樣式的背景色與牆色混出來（本站自己配的）。
 */

import { parseColor } from '@/core/color';
import { deviceResolutionLimits, limitResolution, type ResolutionLimits } from '@/core/image';
import { ASSET } from '../model/assets';
import { GROUND_CATS } from '../model/floorCopy';
import { revealFloor, type ShownFloor, visibleFloor } from '../model/geometry';
import { roomContainsRoom, roomMainRect, roomPolygon } from '../model/shape';
import {
  type BoardLayout,
  boardLayout,
  itemFrame,
  levelMatrix,
  linkKind,
  PLATE_W,
  type Projected,
  plateRect,
  SLAB,
  type StackLayout,
  stackLayout,
  stackProject,
  stairTravel,
  type VerticalLink,
  verticalLinks,
} from '../model/stack';
import type { Floor, Item, Rect, SizeMode, StackCamera, ThemeId } from '../model/types';
import { S } from '../strings';
import { drawThemeEffect, drawWear } from './effects';
import { haloText, measureText } from './labels';
import { drawFloor, drawVeilPlate } from './render';
import { type FloorTheme, getTheme } from './themes';

type Ctx = CanvasRenderingContext2D;

/* ---------- 顏色 ---------- */

function mix(a: string, b: string, t: number): string {
  const p = parseColor(a);
  const q = parseColor(b);
  if (!p || !q) return a;
  const ch = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  return `rgb(${ch(p.r, q.r)},${ch(p.g, q.g)},${ch(p.b, q.b)})`;
}

function isDark(color: string): boolean {
  const c = parseColor(color);
  if (!c) return false;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 110;
}

export interface StackColors {
  /** 紙（樣式的背景；透明背景的匯出也用樣式原本的背景色混色） */
  paper: string;
  ink: string;
  floor: string;
  /** 樓板的側面（亮、暗）與底 */
  side: string;
  sideDark: string;
  /** 影、蹴込み（深的面） */
  shade: string;
  /** 樓梯、連接線、目前樓層的強調色（深色的樣式是暖金色） */
  accent: string;
}

export function stackColors(theme: FloorTheme): StackColors {
  const base = getTheme(theme.id);
  const paper = base.bg;
  const ink = theme.wall;
  const dark = isDark(paper);
  const shade = dark ? mix(paper, '#000000', 0.55) : mix(paper, ink, 0.55);
  return {
    paper,
    ink,
    floor: theme.defaultFill,
    side: mix(paper, ink, 0.3),
    sideDark: mix(paper, ink, 0.52),
    shade,
    accent: dark ? '#f2c96b' : ink,
  };
}

/* ---------- 小工具 ---------- */

function path(c: Ctx, pts: readonly { x: number; y: number }[]): void {
  c.beginPath();
  for (const [i, p] of pts.entries()) {
    if (i) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  }
  c.closePath();
}

function face(
  c: Ctx,
  pts: readonly { x: number; y: number }[],
  fill: string | null,
  stroke: string | null,
  width: number,
  alpha = 1,
): void {
  path(c, pts);
  c.save();
  c.globalAlpha = alpha;
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke && width > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.stroke();
  }
  c.restore();
}

function line(c: Ctx, a: Projected, b: Projected, color: string, width: number, dash?: number[]) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
  c.restore();
}

function ellipse(
  c: Ctx,
  p: Projected,
  rx: number,
  ry: number,
  fill: string | null,
  stroke: string,
  width: number,
  dash?: number[],
) {
  c.save();
  c.beginPath();
  c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    c.globalAlpha = 0.18;
    c.fillStyle = fill;
    c.fill();
    c.globalAlpha = 1;
  }
  if (dash) c.setLineDash(dash);
  c.strokeStyle = stroke;
  c.lineWidth = width;
  c.stroke();
  c.restore();
}

/** 面向看的人的牌子（圓角長方形＋置中的字；字太寬時壓扁；演出的「？？？」也用，draw/stage.ts） */
export function tag(
  c: Ctx,
  x: number,
  y: number,
  text: string,
  o: {
    size: number;
    weight: number;
    font: string;
    fill: string;
    fillAlpha?: number;
    stroke: string | null;
    strokeW: number;
    color: string;
    minW: number;
    maxW: number;
    h: number;
    radius: number;
  },
): Rect {
  const f = { weight: o.weight, size: o.size, family: o.font };
  const tw = measureText(c, text, f);
  const w = Math.min(o.maxW, Math.max(o.minW, tw + o.size * 1.8));
  const box = { x: x - w / 2, y: y - o.h / 2, w, h: o.h };
  c.save();
  c.beginPath();
  c.roundRect(box.x, box.y, box.w, box.h, o.radius);
  c.globalAlpha = o.fillAlpha ?? 1;
  c.fillStyle = o.fill;
  c.fill();
  c.globalAlpha = 1;
  if (o.stroke) {
    c.strokeStyle = o.stroke;
    c.lineWidth = o.strokeW;
    c.stroke();
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const room = w - o.size * 0.9;
  c.translate(x, y + o.size * 0.06);
  if (tw > room) c.scale(room / tw, 1);
  haloText(c, text, 0, 0, f, o.color, null, 0);
  c.restore();
  return box;
}

/* ---------- 立體的樓梯（原作的 3D 階段：直的樓梯分「上」「下」兩條，螺旋梯一段一段扇形） ---------- */

function drawStair3D(
  c: Ctx,
  L: StackLayout,
  level: number,
  item: Item,
  travel: { up: boolean; down: boolean },
  col: StackColors,
): void {
  const rise = L.cam.rise;
  const f = itemFrame(item);
  const rad = (f.rot * Math.PI) / 180;
  const rx = Math.cos(rad);
  const ry = Math.sin(rad);
  const fx = -Math.sin(rad);
  const fy = Math.cos(rad);
  const P = (u: number, v: number, z: number) =>
    stackProject(L, f.cx + rx * u + fx * v, f.cy + ry * u + fy * v, level, z);
  const tread = mix(col.floor, col.accent, 0.26);
  const riser = mix(col.paper, col.shade, 0.82);
  const sideFill = mix(col.floor, col.ink, 0.42);
  const landing = mix(col.floor, col.accent, 0.18);
  const pit = mix(col.paper, col.shade, 0.88);
  const ink = col.ink;

  if (linkKind(item.t) === 'spiral') {
    const cw = item.t !== 'spiral_ccw';
    const R = Math.max(0.5, Math.min(f.w, f.h) / 2 - 0.24);
    const total = 3.3 * rise;
    const steps = 9;
    const start = -90 + f.rot;
    const at = (deg: number, r: number, z: number) => {
      const a = (deg * Math.PI) / 180;
      return stackProject(L, f.cx + Math.cos(a) * r, f.cy + Math.sin(a) * r, level, z);
    };
    for (let k = 0; k < steps; k++) {
      const a0 = start + (cw ? 1 : -1) * k * 32;
      const a1 = start + (cw ? 1 : -1) * (k + 1) * 32;
      const z0 = (total * k) / steps;
      const z1 = (total * (k + 1)) / steps;
      const c0 = at(0, 0, z0);
      const c1 = at(0, 0, z1);
      const o0b = at(a0, R, z0);
      const o0t = at(a0, R, z1);
      const o1t = at(a1, R, z1);
      const o1b = at(a1, R, z0);
      face(c, [c0, o0b, o0t, c1], riser, ink, 0.04);
      face(c, [o0b, o1b, o1t, o0t], sideFill, ink, 0.04);
      face(c, [c1, o0t, o1t], tread, ink, 0.048);
      line(c, c1, o0t, col.accent, 0.056);
    }
    const bot = at(0, 0, 0);
    const top = at(0, 0, total + 0.4);
    line(c, bot, top, ink, 0.26);
    line(c, bot, top, col.accent, 0.12);
    return;
  }

  /* 直的樓梯：前面（v＝＋h/2）是上下樓的地方（z＝0），後面是平台 */
  const rawW = f.w;
  const rawH = f.h;
  const w = rawW * 0.86;
  const h = rawH * 0.84;
  const hw = w / 2;
  const landBot = Math.min(1.16, h * 0.18);
  const landTop = Math.min(1.56, h * 0.25);
  const vStart = h / 2 - landBot;
  const vEnd = -h / 2 + landTop;
  const flight = (
    u0: number,
    u1: number,
    vFrom: number,
    vTo: number,
    zFrom: number,
    zTo: number,
  ) => {
    const steps = 5;
    const stepH = Math.abs(zTo - zFrom) / steps;
    const skirt = Math.max(0.28, stepH * 0.85);
    for (const u of [u0, u1])
      face(
        c,
        [
          P(u, vFrom, zFrom),
          P(u, vFrom, zFrom - skirt * 0.6),
          P(u, vTo, zTo - skirt),
          P(u, vTo, zTo),
        ],
        sideFill,
        ink,
        0.036,
        0.92,
      );
    const blocks: { k: number; va: number; vb: number; za: number; zb: number; depth: number }[] =
      [];
    for (let k = 0; k < steps; k++) {
      const va = vFrom + ((vTo - vFrom) * k) / steps;
      const vb = vFrom + ((vTo - vFrom) * (k + 1)) / steps;
      const za = zFrom + ((zTo - zFrom) * k) / steps;
      const zb = zFrom + ((zTo - zFrom) * (k + 1)) / steps;
      blocks.push({ k, va, vb, za, zb, depth: P((u0 + u1) / 2, (va + vb) / 2, zb).depth });
    }
    blocks.sort((a, b) => a.depth - b.depth);
    for (const { k, va, vb, za, zb } of blocks) {
      const base = Math.min(za, zb) - skirt * 0.75;
      const tone = mix(tread, col.accent, (k / (steps - 1)) * 0.16);
      face(
        c,
        [P(u0, va, base), P(u0, vb, base), P(u0, vb, zb), P(u0, va, zb)],
        sideFill,
        ink,
        0.036,
      );
      face(
        c,
        [P(u1, va, base), P(u1, vb, base), P(u1, vb, zb), P(u1, va, zb)],
        sideFill,
        ink,
        0.036,
      );
      face(c, [P(u0, va, za), P(u1, va, za), P(u1, va, zb), P(u0, va, zb)], riser, ink, 0.048);
      face(c, [P(u0, vb, za), P(u1, vb, za), P(u1, vb, zb), P(u0, vb, zb)], riser, ink, 0.044);
      face(c, [P(u0, va, zb), P(u1, va, zb), P(u1, vb, zb), P(u0, vb, zb)], tone, ink, 0.048);
      line(c, P(u0, va, zb), P(u1, va, zb), col.accent, 0.06);
    }
    const railH = 0.44 * Math.sqrt(rise);
    line(c, P(u0 + 0.06, vFrom, zFrom + railH), P(u0 + 0.06, vTo, zTo + railH), col.accent, 0.076);
    line(c, P(u1 - 0.06, vFrom, zFrom + railH), P(u1 - 0.06, vTo, zTo + railH), col.accent, 0.076);
  };
  const slab = (u0: number, u1: number, v0: number, v1: number, zTop: number, thick: number) => {
    const corners: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    const top = corners.map(([u, v]) => P(u, v, zTop));
    const bot = corners.map(([u, v]) => P(u, v, zTop - thick));
    face(c, bot, riser, ink, 0.036);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      face(c, [top[i], top[j], bot[j], bot[i]], sideFill, ink, 0.04);
    }
    face(c, top, landing, col.accent, 0.056);
  };
  face(
    c,
    [
      P(-rawW / 2 + 0.1, -rawH / 2 + 0.1, 0),
      P(rawW / 2 - 0.1, -rawH / 2 + 0.1, 0),
      P(rawW / 2 - 0.1, rawH / 2 - 0.1, 0),
      P(-rawW / 2 + 0.1, rawH / 2 - 0.1, 0),
    ],
    col.floor,
    null,
    0,
  );
  face(
    c,
    [P(-hw, vStart, 0), P(hw, vStart, 0), P(hw, h / 2, 0), P(-hw, h / 2, 0)],
    landing,
    ink,
    0.044,
  );
  /* 兩個方向都有時左半上、右半下（原作）；只有一個方向：一般的樓梯用整個寬，折返樓梯照樣用半邊 */
  const both = travel.up && travel.down;
  const split = both || item.t === 'stairs_u';
  const zUp = 2.5 * rise;
  const zDown = -1.64 * rise;
  const upLane: [number, number] = split ? [-hw, -0.1] : [-hw, hw];
  const downLane: [number, number] = split ? [0.1, hw] : [-hw, hw];
  if (travel.down) {
    const [r0, r1] = downLane;
    face(
      c,
      [P(r0, -h / 2, 0), P(r1, -h / 2, 0), P(r1, vStart, 0), P(r0, vStart, 0)],
      pit,
      col.accent,
      0.048,
    );
    slab(r0, r1, -h / 2, vEnd, zDown, 0.32 * rise);
    flight(r0, r1, vStart, vEnd, 0, zDown);
  }
  if (travel.up) {
    const [l0, l1] = upLane;
    flight(l0, l1, vStart, vEnd, 0, zUp);
    slab(l0, l1, -h / 2, vEnd, zUp, 0.36 * rise);
  }
}

/* ---------- 立體圖 ---------- */

export interface StackDrawOptions {
  theme: FloorTheme;
  /** 每個單位幾 px（線寬） */
  zoom: number;
  showSize: SizeMode;
  hideNames: boolean;
  playerView: boolean;
  hideClues: boolean;
  reveal?: boolean;
  night?: number;
  /** 目前的樓層（立體圖的第幾層；樓層牌加框）；沒有＝−1 */
  activeLevel: number;
  /**
   * 快速建立的「＋」（編輯畫面、GM 檢視）：只有一層時在上面多一層（level＝1）、空的樓層各一個。
   * text＝牌子上的字；沒有＝不畫。
   */
  ghosts?: { level: number; text: string }[];
  /**
   * 演出（2026-11-09，F313～；沒有＝不畫，輸出不變）：每一層的名牌之後（`levelOverlay`）、全部畫完之後（`overlay`）
   * 再畫的東西（「？？？」的牌子、移動路線、走樓梯的線；draw/stage.ts）。
   */
  levelOverlay?: (c: Ctx, L: StackLayout, level: number) => void;
  overlay?: (c: Ctx, L: StackLayout) => void;
}

/** 每一層要畫的東西：樓層（照檢視整理過）與名稱 */
export interface StackFloorView {
  floor: ShownFloor;
  name: string;
  secret: boolean;
}

export function shownStackFloors(
  floors: readonly Floor[],
  o: Pick<StackDrawOptions, 'playerView' | 'hideClues' | 'reveal'>,
): StackFloorView[] {
  return floors.map((f) => ({
    floor: visibleFloor(o.reveal ? revealFloor(f) : f, o.playerView, o.hideClues),
    name: f.name,
    secret: !!f.secret,
  }));
}

/** 房間名牌要寫的名字（PL 檢視有 PL 名字時用它） */
function roomTagName(r: ShownFloor['rooms'][number], o: StackDrawOptions): string {
  if (r.masked || r.hideLabel || o.hideNames) return '';
  return (o.playerView && r.plName) || r.name || '';
}

/** 樓層牌上的房間摘要：前三間（走廊・樓梯類、地面、不顯示名字的不算） */
function roomSummary(f: ShownFloor, o: StackDrawOptions): string {
  return f.rooms
    .filter((r) => r.cat !== 'hall' && !GROUND_CATS.has(r.cat))
    .map((r) => roomTagName(r, o))
    .filter(Boolean)
    .slice(0, 3)
    .join('・');
}

/** 樓板：房間的外形往下 SLAB 格（巢狀的房間不另外畫）；側面由後往前 */
function drawSlab(c: Ctx, L: StackLayout, level: number, f: ShownFloor, col: StackColors) {
  const outer = f.rooms.filter((r) => !f.rooms.some((o) => o !== r && roomContainsRoom(o, r)));
  for (const r of outer) {
    const pts = roomPolygon(r).map(([x, y]) => stackProject(L, x, y, level));
    if (pts.length < 3) continue;
    const bottom = pts.map((p) => ({ ...p, y: p.y + SLAB }));
    c.save();
    c.translate(0.28, 0.44);
    face(c, bottom, col.shade, null, 0, 0.28);
    c.restore();
    face(c, bottom, col.sideDark, col.ink, 0.07);
    const sides = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return { p, q, mid: (p.y + q.y) / 2 };
    });
    sides.sort((a, b) => a.mid - b.mid);
    for (const { p, q } of sides)
      face(
        c,
        [p, q, { x: q.x, y: q.y + SLAB }, { x: p.x, y: p.y + SLAB }],
        q.x >= p.x ? col.side : col.sideDark,
        col.ink,
        0.044,
      );
  }
}

/** PL 檢視的 GM 專用房間：封起來的黑箱（原作的封印された部屋） */
function drawSealed(c: Ctx, L: StackLayout, level: number, f: ShownFloor, col: StackColors) {
  for (const r of f.rooms) {
    if (!r.masked) continue;
    const poly = roomPolygon(r);
    const top = poly.map(([x, y]) => stackProject(L, x, y, level, 0.72));
    const bot = poly.map(([x, y]) => stackProject(L, x, y, level));
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      face(c, [top[i], top[j], bot[j], bot[i]], col.shade, col.accent, 0.05, 0.86);
    }
    c.save();
    c.setLineDash([0.36, 0.2]);
    face(c, top, col.shade, col.accent, 0.11);
    c.restore();
  }
}

/** 左邊的樓層牌（點一下切到那一層） */
function drawPlate(
  c: Ctx,
  L: StackLayout,
  level: number,
  v: StackFloorView,
  o: StackDrawOptions,
  col: StackColors,
) {
  const r = plateRect(L, level);
  const current = level === o.activeLevel;
  const y0 = -level * L.gap;
  c.save();
  c.setLineDash([0.32, 0.24]);
  c.globalAlpha = 0.65;
  c.strokeStyle = current ? col.accent : col.ink;
  c.lineWidth = 0.06;
  c.beginPath();
  c.moveTo(r.x + r.w, y0);
  c.lineTo(-L.spanX / 2 + 0.8, y0);
  c.stroke();
  c.restore();
  c.save();
  c.beginPath();
  c.roundRect(r.x, r.y, r.w, r.h, 0.2);
  c.fillStyle = col.floor;
  c.fill();
  c.strokeStyle = current ? col.accent : col.ink;
  c.lineWidth = current ? 0.13 : 0.06;
  c.stroke();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const font = o.theme.font;
  const veiled = !!v.floor.veiled;
  const nameF = { weight: 800, size: 0.76, family: font };
  const nameW = measureText(c, v.name || '—', nameF);
  const squeeze = (w: number, max: number) => (w > max ? max / w : 1);
  c.save();
  c.translate(r.x + 0.56, y0 - 0.24);
  c.scale(squeeze(nameW, PLATE_W - 1.2), 1);
  haloText(c, v.name || '—', 0, 0, nameF, current ? col.accent : o.theme.label, null, 0);
  c.restore();
  /* GM 檢視的祕密樓層：名字後面小字「祕密」 */
  if (v.secret && !o.playerView && !o.reveal && nameW < PLATE_W - 3)
    haloText(
      c,
      S.view3d.secretTag,
      r.x + 0.9 + nameW,
      y0 - 0.26,
      { weight: 700, size: 0.34, family: font },
      col.accent,
      null,
      0,
    );
  const summary = veiled ? S.view3d.unexplored : roomSummary(v.floor, o);
  if (summary) {
    const f = { weight: 600, size: 0.32, family: font };
    const sw = measureText(c, summary, f);
    c.save();
    c.translate(r.x + 0.56, y0 + 0.56);
    c.scale(squeeze(sw, PLATE_W - 1.1), 1);
    c.globalAlpha = 0.85;
    haloText(c, summary, 0, 0, f, o.theme.label, null, 0);
    c.restore();
  }
  c.restore();
}

/** 房間的名牌與樓梯牌（面向看的人） */
function drawTags(
  c: Ctx,
  L: StackLayout,
  level: number,
  v: StackFloorView,
  o: StackDrawOptions,
  col: StackColors,
  links: readonly VerticalLink[],
  count: number,
) {
  const font = o.theme.font;
  for (const r of v.floor.rooms) {
    const name = roomTagName(r, o);
    if (!name) continue;
    const m = roomMainRect(r);
    const p = stackProject(L, m.x + m.w / 2 + (r.lx || 0), m.y + m.h / 2 + (r.ly || 0), level);
    tag(c, p.x, p.y, name, {
      size: 0.42,
      weight: 700,
      font,
      fill: col.paper,
      fillAlpha: 0.82,
      stroke: col.ink,
      strokeW: 0.04,
      color: o.theme.label,
      minW: 2.4,
      maxW: 6.4,
      h: 0.84,
      radius: 0.12,
    });
  }
  for (const it of v.floor.items) {
    const kind = linkKind(it.t);
    if (!kind || kind === 'hatch') continue;
    const t = stairTravel(it, level, count, links);
    const icon = t.up && t.down ? '▲▼' : t.up ? '▲' : '▼';
    const z =
      (kind === 'spiral' ? 4.1 : kind === 'lift' ? 2 : t.down && !t.up ? 1.3 : 3.1) * L.cam.rise;
    const f = itemFrame(it);
    const p = stackProject(L, f.cx, f.cy, level, z);
    tag(c, p.x, p.y, `${icon} ${it.label || ASSET[it.t]?.name || ''}`, {
      size: 0.36,
      weight: 800,
      font,
      fill: col.accent,
      stroke: col.paper,
      strokeW: 0.05,
      color: col.paper,
      minW: 3.4,
      maxW: 7,
      h: 0.76,
      radius: 0.36,
    });
  }
}

/** 往上一層的連接（樓梯：上樓的平台到上一層的入口；梯子是一節一節的梯子） */
function drawShafts(
  c: Ctx,
  L: StackLayout,
  level: number,
  links: readonly VerticalLink[],
  col: StackColors,
) {
  for (const l of links) {
    if (l.level !== level) continue;
    const stairs = l.kind === 'stairs';
    const lo = stackProject(L, l.low.x, l.low.y, level, stairs ? 2.7 * L.cam.rise : 0);
    const hi = stackProject(L, l.high.x, l.high.y, level + 1, stairs ? 0.2 : 0);
    ellipse(c, lo, 0.76, 0.44, col.accent, col.accent, 0.08);
    if (l.kind === 'hatch') {
      line(c, lo, hi, col.accent, 0.13, [0.4, 0.24]);
      line(c, { ...lo, x: lo.x - 0.24 }, { ...hi, x: hi.x - 0.24 }, col.accent, 0.076);
      line(c, { ...lo, x: lo.x + 0.24 }, { ...hi, x: hi.x + 0.24 }, col.accent, 0.076);
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        const x = lo.x + (hi.x - lo.x) * t;
        const y = lo.y + (hi.y - lo.y) * t;
        line(c, { x: x - 0.24, y, depth: 0 }, { x: x + 0.24, y, depth: 0 }, col.accent, 0.06);
      }
    } else {
      c.save();
      c.globalAlpha = 0.75;
      line(c, lo, hi, col.paper, 0.22);
      c.restore();
      line(c, lo, hi, col.accent, 0.11, [0.44, 0.28]);
    }
    ellipse(c, hi, 0.76, 0.44, null, col.accent, 0.08, [0.24, 0.16]);
  }
}

/** 快速建立的「＋」：那一層的範圍（虛線）＋牌子 */
function drawGhost(
  c: Ctx,
  L: StackLayout,
  level: number,
  text: string,
  o: StackDrawOptions,
  col: StackColors,
) {
  const b = L.content;
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ].map(([x, y]) => stackProject(L, x, y, level));
  c.save();
  c.globalAlpha = 0.82;
  c.setLineDash([0.56, 0.36]);
  face(c, pts, col.floor, col.accent, 0.1, 0.25);
  path(c, pts);
  c.strokeStyle = col.accent;
  c.lineWidth = 0.1;
  c.stroke();
  c.restore();
  const p = stackProject(L, L.cx, L.cy, level);
  tag(c, p.x, p.y, text, {
    size: 0.48,
    weight: 800,
    font: o.theme.font,
    fill: col.paper,
    stroke: col.accent,
    strokeW: 0.1,
    color: col.accent,
    minW: 12.4,
    maxW: Math.max(14, L.spanX),
    h: 2.08,
    radius: 0.32,
  });
}

/**
 * 畫立體圖（座標＝立體圖的座標；呼叫端先設好「1 單位＝zoom px」的變換）。`floors` 是立體圖由下往上的樓層（原本的資料）。
 */
export function drawStack(
  c: Ctx,
  L: StackLayout,
  floors: readonly Floor[],
  o: StackDrawOptions,
): void {
  const col = stackColors(o.theme);
  const views = shownStackFloors(floors, o);
  const links = verticalLinks(views.map((v) => v.floor as Floor));
  const ghosts = new Map((o.ghosts ?? []).map((g) => [g.level, g.text]));
  const levels = Math.max(floors.length, ...[...ghosts.keys()].map((l) => l + 1));
  for (let level = 0; level < levels; level++) {
    const v = views[level];
    if (!v) {
      const text = ghosts.get(level);
      if (text) drawGhost(c, L, level, text, o, col);
      continue;
    }
    const f = v.floor;
    if (f.rooms.length) drawSlab(c, L, level, f, col);
    c.save();
    c.transform(...levelMatrix(L, level));
    drawFloor(c, floors[level], {
      theme: o.theme,
      zoom: o.zoom,
      showSize: o.showSize,
      hideNames: true,
      playerView: o.playerView,
      hideClues: o.hideClues,
      editor: false,
      grid: false,
      background: false,
      stacked: 'stack',
      ...(o.night ? { night: o.night } : {}),
      ...(o.reveal ? { reveal: true } : {}),
    });
    c.restore();
    if (f.veiled) {
      if (f.rooms.length) {
        const p = stackProject(L, L.cx, L.cy, level);
        drawVeilPlate(c, p.x, p.y, S.secret.veil(v.name), o.theme, 0.56);
      }
    } else {
      for (const it of f.items) {
        const kind = linkKind(it.t);
        if (kind === 'stairs' || kind === 'spiral')
          drawStair3D(c, L, level, it, stairTravel(it, level, floors.length, links), col);
      }
      if (o.playerView) drawSealed(c, L, level, f, col);
    }
    drawPlate(c, L, level, v, o, col);
    drawShafts(c, L, level, links, col);
    /* 名牌畫在上下樓層的連接之後（驗證後修訂 2026-11-09：「▲▼ 樓梯」的牌子不被虛線與橢圓壓住） */
    if (!f.veiled) drawTags(c, L, level, v, o, col, links, floors.length);
    o.levelOverlay?.(c, L, level);
    const text = ghosts.get(level);
    if (text && !f.rooms.length) drawGhost(c, L, level, text, o, col);
  }
  o.overlay?.(c, L);
}

/* ---------- 樓層總覽 ---------- */

export interface BoardDrawOptions extends StackDrawOptions {
  /** 地圖名稱（標題） */
  title: string;
  /** 透明背景（立體圖那一欄的底色、卡片的底照畫） */
  transparent?: boolean;
  /** 演出（2026-11-09；沒有＝不畫）：每一張卡片的平面圖之後再畫（卡片的平面座標、剪在卡片裡） */
  cardOverlay?: (c: Ctx, level: number, zoom: number) => void;
}

/** 總覽：左邊立體圖、右邊每一層的平面圖（原作「統合ボード」的排法） */
export function drawBoard(
  c: Ctx,
  B: BoardLayout,
  floors: readonly Floor[],
  o: BoardDrawOptions,
): void {
  const col = stackColors(o.theme);
  const font = o.theme.font;
  /* 透明背景（匯出）：紙與外框不畫，標題、立體圖那一欄、卡片照畫 */
  if (!o.transparent) {
    c.fillStyle = col.paper;
    c.fillRect(0, 0, B.width, B.height);
    c.save();
    c.globalAlpha = 0.45;
    c.strokeStyle = col.ink;
    c.lineWidth = 0.044;
    c.strokeRect(1.1, 1.1, B.width - 2.2, B.height - 2.2);
    c.restore();
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  haloText(
    c,
    o.title || S.untitled,
    2.4,
    4.2,
    { weight: 800, size: 1.12, family: font },
    o.theme.label,
    null,
    0,
  );
  c.save();
  c.globalAlpha = 0.68;
  haloText(
    c,
    S.view3d.boardSubtitle(floors.map((f) => f.name || '—').join('／')),
    2.4,
    5.36,
    { weight: 600, size: 0.36, family: font },
    o.theme.label,
    null,
    0,
  );
  c.restore();
  /* 左欄：立體圖 */
  c.save();
  c.beginPath();
  c.roundRect(B.panel.x, B.panel.y, B.panel.w, B.panel.h, 0.2);
  c.globalAlpha = 0.22;
  c.fillStyle = col.floor;
  c.fill();
  c.globalAlpha = 0.35;
  c.strokeStyle = col.ink;
  c.lineWidth = 0.04;
  c.stroke();
  c.restore();
  c.save();
  c.transform(B.stackScale, 0, 0, B.stackScale, B.stackTx, B.stackTy);
  drawStack(c, B.stack, floors, { ...o, zoom: o.zoom * B.stackScale });
  c.restore();
  /* 右邊：卡片 */
  const views = shownStackFloors(floors, o);
  const multi = floors.length > 1;
  const footprint = multi
    ? views.flatMap((v) =>
        v.floor.veiled ? [] : v.floor.rooms.filter((r) => !r.masked && !GROUND_CATS.has(r.cat)),
      )
    : [];
  for (const card of B.cards) {
    const v = views[card.level];
    const current = card.level === o.activeLevel;
    c.save();
    c.beginPath();
    c.roundRect(card.x, card.y, card.w, card.h, 0.2);
    c.globalAlpha = 0.9;
    c.fillStyle = col.paper;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = current ? col.accent : col.ink;
    c.lineWidth = current ? 0.12 : 0.056;
    c.stroke();
    c.beginPath();
    c.roundRect(card.x, card.y, card.w, 1.7, [0.2, 0.2, 0, 0]);
    c.globalAlpha = 0.65;
    c.fillStyle = col.floor;
    c.fill();
    c.restore();
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    haloText(
      c,
      v.name || '—',
      card.x + 0.7,
      card.y + 1.14,
      { weight: 800, size: 0.56, family: font },
      current ? col.accent : o.theme.label,
      null,
      0,
    );
    c.save();
    c.beginPath();
    c.rect(card.x, card.y + 1.7, card.w, card.h - 1.7);
    c.clip();
    c.transform(B.scale, 0, 0, B.scale, card.tx, card.ty);
    if (footprint.length && !v.floor.veiled) {
      c.save();
      c.globalAlpha = 0.16;
      c.strokeStyle = col.ink;
      c.lineWidth = 0.07;
      c.setLineDash([0.44, 0.28]);
      for (const r of footprint) {
        const pts = roomPolygon(r);
        c.beginPath();
        for (const [i, [x, y]] of pts.entries()) {
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.closePath();
        c.stroke();
      }
      c.restore();
    }
    drawFloor(c, floors[card.level], {
      theme: o.theme,
      zoom: o.zoom * B.scale,
      showSize: o.showSize,
      hideNames: o.hideNames,
      playerView: o.playerView,
      hideClues: o.hideClues,
      editor: false,
      grid: false,
      background: false,
      stacked: 'card',
      ...(o.night ? { night: o.night } : {}),
      ...(o.reveal ? { reveal: true } : {}),
    });
    o.cardOverlay?.(c, card.level, o.zoom * B.scale);
    c.restore();
  }
}

/* ---------- 匯出 ---------- */

export type StackKind = 'stack' | 'board';

export interface StackImageOptions {
  kind: StackKind;
  theme: ThemeId;
  cam: StackCamera;
  /** 每格的像素數（同平面圖的匯出；太大時自動縮小） */
  px: number;
  title: string;
  showSize: SizeMode;
  hideNames: boolean;
  playerView: boolean;
  hideClues: boolean;
  transparent: boolean;
  /** GM 用的標示（右上角；null＝不加。立體圖、總覽的版面不因此改變，GM 用與揭露用對得齊） */
  gmBadge?: string | null;
  reveal?: boolean;
  night?: number;
  wear?: { strength: number; seed: number } | null;
  noNoise?: boolean;
  limit?: ResolutionLimits;
}

export interface StackImageLayout {
  /** 整張圖（立體圖的座標；總覽從 0, 0 開始） */
  rect: Rect;
  scale: number;
  pxWidth: number;
  pxHeight: number;
  stack: StackLayout | null;
  board: BoardLayout | null;
}

/**
 * 看得到的樓層（版面用）：PL 用的圖只算 PL 看得到的東西（祕密樓層只有房間的外形、GM 專用的東西不算），
 * GM 用、揭露用算全部（驗證後修訂 2026-11-09，同平面圖的匯出範圍）
 */
export function stackLayoutFloors(
  floors: readonly Floor[],
  o: Pick<StackDrawOptions, 'playerView' | 'hideClues' | 'reveal'>,
): Floor[] {
  return shownStackFloors(floors, o).map((v) => v.floor as Floor);
}

/** 匯出的版面（不畫）：立體圖的範圍或總覽的大小 × 每格 px，太大時自動縮小 */
export function stackImageLayout(floors: readonly Floor[], o: StackImageOptions): StackImageLayout {
  const shown = stackLayoutFloors(floors, o);
  const stack = o.kind === 'stack' ? stackLayout(shown, o.cam) : null;
  const board = o.kind === 'board' ? boardLayout(shown, o.cam) : null;
  const rect = stack ? stack.bounds : { x: 0, y: 0, w: board?.width ?? 1, h: board?.height ?? 1 };
  const scale = limitResolution(
    o.px,
    { width: rect.w, height: rect.h },
    o.limit ?? deviceResolutionLimits(),
  );
  return {
    rect,
    scale,
    pxWidth: Math.max(1, Math.round(rect.w * scale)),
    pxHeight: Math.max(1, Math.round(rect.h * scale)),
    stack,
    board,
  };
}

/** 版面的位置（共同範圍與圖的大小）：兩張圖這個相同才疊得齊（揭露用與 PL 用的比較，2026-11-09） */
export function stackFrameKey(L: StackImageLayout): string {
  const s = L.stack ?? L.board?.stack;
  return JSON.stringify([L.rect, s?.content, L.board?.shared ?? null]);
}

/** 立體圖或總覽畫成 canvas */
export function renderStackImage(
  floors: readonly Floor[],
  o: StackImageOptions,
): HTMLCanvasElement {
  const base = getTheme(o.theme);
  const theme = o.transparent ? { ...base, bg: 'transparent' } : base;
  const L = stackImageLayout(floors, o);
  const canvas = document.createElement('canvas');
  canvas.width = L.pxWidth;
  canvas.height = L.pxHeight;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  const s = L.scale;
  const draw: StackDrawOptions = {
    theme,
    zoom: s,
    showSize: o.showSize,
    hideNames: o.hideNames,
    playerView: o.playerView,
    hideClues: o.hideClues,
    activeLevel: -1,
    ...(o.reveal ? { reveal: true } : {}),
    ...(o.night ? { night: o.night } : {}),
  };
  c.save();
  c.setTransform(s, 0, 0, s, -L.rect.x * s, -L.rect.y * s);
  if (L.stack) {
    if (!o.transparent) {
      c.fillStyle = base.bg;
      c.fillRect(L.rect.x, L.rect.y, L.rect.w, L.rect.h);
    }
    const title = o.title || S.untitled;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    haloText(
      c,
      title,
      L.rect.x + 2.2,
      L.rect.y + 3.6,
      { weight: 800, size: 1.04, family: theme.font },
      theme.label,
      null,
      0,
    );
    c.save();
    c.globalAlpha = 0.68;
    haloText(
      c,
      S.view3d.stackSubtitle(floors.map((f) => f.name || '—').join('／'), o.cam.angle),
      L.rect.x + 2.2,
      L.rect.y + 4.8,
      { weight: 600, size: 0.36, family: theme.font },
      theme.label,
      null,
      0,
    );
    c.restore();
    drawStack(c, L.stack, floors, draw);
  } else if (L.board)
    drawBoard(c, L.board, floors, { ...draw, title: o.title, transparent: o.transparent });
  if (o.gmBadge) {
    c.save();
    c.globalAlpha = 0.55;
    c.textAlign = 'right';
    c.textBaseline = 'top';
    haloText(
      c,
      o.gmBadge,
      L.rect.x + L.rect.w - 1.6,
      L.rect.y + 1.4,
      { weight: 900, size: 1.4, family: theme.font },
      theme.gm,
      null,
      0,
    );
    c.restore();
  }
  c.restore();
  if (!o.transparent && (o.wear || base.effect)) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (o.wear)
      drawWear(
        c,
        { x: 0, y: 0, w: canvas.width, h: canvas.height },
        o.wear.seed,
        o.wear.strength,
        base,
      );
    drawThemeEffect(c, base, canvas.width, canvas.height, Math.max(1, s / 24), !o.noNoise);
    c.restore();
  }
  return canvas;
}
