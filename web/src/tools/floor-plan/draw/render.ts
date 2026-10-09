/**
 * 畫一層樓：地板（底色、花紋）、下一層的影子、家具、牆、門窗、GM 房間的斜線、房間名字、文字、格線。
 * ctx 要先換算成「1 單位＝1 格」。編輯畫面與匯出共用。
 */
import { ASSET, VERTICAL_LINKS } from '../model/assets';
import { CAT, CELL_M, OPEN, wallThickness } from '../model/catalog';
import { itemLocalSize, type ShownFloor, type ShownRoom, visibleFloor } from '../model/geometry';
import type { Floor, Item, Opening, Rect, SizeMode, TextLabel, Wall } from '../model/types';
import { computeWalls, type WallRun } from '../model/walls';
import { FURNITURE_DRAW, type FurnStyle } from './furniture';
import { seeded } from './furniture/kit';
import { haloText, labelLayout, textFont, verticalText } from './labels';
import { type FloorTheme, roomFill } from './themes';

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;

/** 線寬（格）：畫面上至少 0.8 px，放大時跟著變粗 */
export function lineWidthFor(zoom: number): number {
  return Math.max(1 / 22, 0.8 / zoom);
}

/** 路徑加一段線（不描邊） */
function seg2(c: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
}

/* ---------- 地板花紋 ---------- */

function tatami(c: Ctx, room: Rect, lw: number): void {
  /* 一張疊約 0.9 × 1.8 m：以半張（約 0.9 m 見方）為單位排，2 × 2 一組，橫兩張與直兩張交錯（網代） */
  const cols = Math.max(1, Math.round((room.w * CELL_M) / 0.9));
  const rows = Math.max(1, Math.round((room.h * CELL_M) / 0.9));
  const cw = room.w / cols;
  const ch = room.h / rows;
  const used = new Set<string>();
  c.beginPath();
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < cols; q++) {
      if (used.has(`${q},${r}`)) continue;
      used.add(`${q},${r}`);
      const across = ((q >> 1) + (r >> 1)) % 2 === 0;
      if (across && q + 1 < cols && !used.has(`${q + 1},${r}`)) {
        used.add(`${q + 1},${r}`);
        c.rect(room.x + q * cw, room.y + r * ch, cw * 2, ch);
      } else if (r + 1 < rows && !used.has(`${q},${r + 1}`)) {
        used.add(`${q},${r + 1}`);
        c.rect(room.x + q * cw, room.y + r * ch, cw, ch * 2);
      } else c.rect(room.x + q * cw, room.y + r * ch, cw, ch);
    }
  c.lineWidth = lw * 0.9;
  c.stroke();
}

export function drawPattern(c: Ctx, room: ShownRoom, theme: FloorTheme, lw: number): void {
  const p = CAT[room.cat]?.pattern;
  if (!p) return;
  const { x, y, w, h } = room;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.strokeStyle = theme.pattern;
  c.fillStyle = theme.pattern;
  c.lineWidth = lw * 0.8;
  const rnd = seeded((x * 7919) ^ (y * 104729) ^ 0x2f6b);
  c.beginPath();
  switch (p) {
    case 'tile':
      for (let xx = x + 0.5; xx < x + w; xx += 0.5) seg2(c, xx, y, xx, y + h);
      for (let yy = y + 0.5; yy < y + h; yy += 0.5) seg2(c, x, yy, x + w, yy);
      c.stroke();
      break;
    case 'deck':
      if (w >= h) for (let yy = y + 0.5; yy < y + h; yy += 0.5) seg2(c, x, yy, x + w, yy);
      else for (let xx = x + 0.5; xx < x + w; xx += 0.5) seg2(c, xx, y, xx, y + h);
      c.stroke();
      break;
    case 'tatami':
      tatami(c, room, lw);
      break;
    case 'grass': {
      const n = Math.floor(w * h * 0.5);
      for (let i = 0; i < n; i++) {
        const gx = x + rnd() * w;
        const gy = y + rnd() * h;
        c.moveTo(gx - 0.07, gy - 0.05);
        c.lineTo(gx, gy + 0.06);
        c.lineTo(gx + 0.08, gy - 0.07);
      }
      c.stroke();
      break;
    }
    case 'speckle': {
      const n = Math.floor(w * h * 0.85);
      for (let i = 0; i < n; i++) {
        const sx = x + rnd() * w;
        const sy = y + rnd() * h;
        const r = 0.025 + rnd() * 0.055;
        c.moveTo(sx + r, sy);
        c.arc(sx, sy, r, 0, TAU);
      }
      c.fill();
      break;
    }
    case 'water':
      for (let yy = y + 0.55, row = 0; yy < y + h; yy += 0.85, row++)
        for (let xx = x + (row % 2 ? 0.25 : 0.95); xx < x + w - 0.6; xx += 1.5) {
          c.moveTo(xx, yy);
          c.bezierCurveTo(xx + 0.2, yy - 0.18, xx + 0.4, yy + 0.18, xx + 0.75, yy);
        }
      c.lineWidth = lw * 1.1;
      c.stroke();
      break;
    case 'rows':
      if (w >= h)
        for (let yy = y + 0.55; yy < y + h; yy += 0.8) seg2(c, x + 0.3, yy, x + w - 0.3, yy);
      else for (let xx = x + 0.55; xx < x + w; xx += 0.8) seg2(c, xx, y + 0.3, xx, y + h - 0.3);
      c.lineWidth = lw * 1.4;
      c.stroke();
      break;
    case 'panel':
      for (let xx = x + 2; xx < x + w; xx += 2) seg2(c, xx, y, xx, y + h);
      for (let yy = y + 2; yy < y + h; yy += 2) seg2(c, x, yy, x + w, yy);
      c.stroke();
      c.beginPath();
      for (let xx = x; xx < x + w; xx += 2)
        for (let yy = y; yy < y + h; yy += 2)
          for (const [dx, dy] of [
            [0.22, 0.22],
            [1.78, 0.22],
            [0.22, 1.78],
            [1.78, 1.78],
          ] as const)
            if (xx + dx < x + w && yy + dy < y + h) {
              c.moveTo(xx + dx + 0.05, yy + dy);
              c.arc(xx + dx, yy + dy, 0.05, 0, TAU);
            }
      c.fill();
      break;
    case 'stone':
      for (let yy = y, row = 0; yy < y + h; yy += 1, row++) {
        c.moveTo(x, yy);
        c.lineTo(x + w, yy);
        for (let xx = x + (row % 2 ? 0.7 : 0); xx < x + w; xx += 1.4) seg2(c, xx, yy, xx, yy + 1);
      }
      c.stroke();
      break;
  }
  c.restore();
}

/* ---------- 牆 ---------- */

/** 沿線方向的一段：橫線畫 (a→b, c)、直線畫 (c, a→b) */
function lineAlong(c: Ctx, o: 'h' | 'v', line: number, a: number, b: number, off = 0): void {
  if (o === 'h') {
    c.moveTo(a, line + off);
    c.lineTo(b, line + off);
  } else {
    c.moveTo(line + off, a);
    c.lineTo(line + off, b);
  }
}

export function drawRun(
  c: Ctx,
  run: WallRun,
  theme: FloorTheme,
  lw: number,
  editor: boolean,
): void {
  if (run.kind === 'zone') {
    if (!editor) return;
    c.save();
    c.strokeStyle = theme.rail;
    c.globalAlpha = 0.5;
    c.lineWidth = lw;
    c.setLineDash([lw * 4, lw * 4]);
    c.beginPath();
    lineAlong(c, run.o, run.c, run.a, run.b);
    c.stroke();
    c.restore();
    return;
  }
  const t = wallThickness(run.kind);
  const a = run.a - (run.capA ? t / 2 : 0);
  const b = run.b + (run.capB ? t / 2 : 0);
  c.save();
  switch (run.kind) {
    case 'fence':
      c.strokeStyle = theme.rail;
      c.lineWidth = lw * 1.2;
      c.setLineDash([lw * 5, lw * 3]);
      c.beginPath();
      lineAlong(c, run.o, run.c, a, b);
      c.stroke();
      break;
    case 'bars': {
      c.strokeStyle = theme.wall;
      c.fillStyle = theme.wall;
      c.lineWidth = lw * 0.8;
      c.beginPath();
      lineAlong(c, run.o, run.c, a, b);
      c.stroke();
      const n = Math.max(1, Math.round((b - a) / 0.3));
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const p = a + ((b - a) * i) / n;
        const [px, py] = run.o === 'h' ? [p, run.c] : [run.c, p];
        c.moveTo(px + t * 0.5, py);
        c.arc(px, py, t * 0.5, 0, TAU);
      }
      c.fill();
      break;
    }
    case 'rail':
      c.strokeStyle = theme.rail;
      c.lineWidth = lw * 0.9;
      c.beginPath();
      lineAlong(c, run.o, run.c, a, b, -t / 2);
      lineAlong(c, run.o, run.c, a, b, t / 2);
      c.stroke();
      break;
    case 'glass':
      c.fillStyle = theme.glass;
      c.strokeStyle = theme.window;
      c.lineWidth = lw * 0.8;
      if (run.o === 'h') {
        c.fillRect(a, run.c - t / 2, b - a, t);
        c.strokeRect(a, run.c - t / 2, b - a, t);
      } else {
        c.fillRect(run.c - t / 2, a, t, b - a);
        c.strokeRect(run.c - t / 2, a, t, b - a);
      }
      break;
    case 'rock':
      drawRock(c, run, a, b, t, theme);
      break;
    case 'broken':
      drawCrumbled(c, run, a, b, t, theme);
      break;
    default:
      c.fillStyle = theme.wall;
      if (run.o === 'h') c.fillRect(a, run.c - t / 2, b - a, t);
      else c.fillRect(run.c - t / 2, a, t, b - a);
  }
  c.restore();
}

/** 位置決定的雜訊（0～1）：同一條線上的段可以接起來 */
function noise(p: number, line: number, k: number): number {
  let h = (Math.round(p * 4) * 2654435761 + Math.round(line * 4) * 40503 + k * 97531) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawRock(c: Ctx, run: WallRun, a: number, b: number, t: number, theme: FloorTheme): void {
  c.fillStyle = theme.wall;
  const pts: number[] = [];
  for (let p = a; ; p = Math.min(b, p + 0.25)) {
    pts.push(p);
    if (p >= b) break;
  }
  const off = (p: number, k: number) => (t / 2) * (0.6 + noise(p, run.c, k) * 0.8);
  c.beginPath();
  pts.forEach((p, i) => {
    const d = -off(p, 1);
    const [x, y] = run.o === 'h' ? [p, run.c + d] : [run.c + d, p];
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  for (const p of pts.slice().reverse()) {
    const d = off(p, 2);
    const [x, y] = run.o === 'h' ? [p, run.c + d] : [run.c + d, p];
    c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
  for (const [cap, p] of [
    [run.capA, run.a],
    [run.capB, run.b],
  ] as const) {
    if (!cap) continue;
    const [x, y] = run.o === 'h' ? [p, run.c] : [run.c, p];
    c.beginPath();
    c.arc(x, y, t * 0.55, 0, TAU);
    c.fill();
  }
}

function drawCrumbled(
  c: Ctx,
  run: WallRun,
  a: number,
  b: number,
  t: number,
  theme: FloorTheme,
): void {
  c.fillStyle = theme.wall;
  const rnd = seeded(Math.floor(run.a * 977 + run.c * 131) + 17);
  let pos = a;
  while (pos < b) {
    const len = Math.min(b - pos, 0.5 + rnd() * 1.5);
    const gap = rnd() < 0.4 ? 0.2 + rnd() * 0.5 : 0;
    const t1 = t * (0.5 + rnd() * 0.5);
    const t2 = t * (0.5 + rnd() * 0.5);
    const local: [number, number][] = [
      [pos + rnd() * 0.1, -t1 / 2],
      [pos + len - rnd() * 0.1, -t / 2 + rnd() * 0.06],
      [pos + len, t2 / 2],
      [pos + rnd() * 0.12, t / 2],
    ];
    c.beginPath();
    local.forEach(([u, v], i) => {
      const [x, y] = run.o === 'h' ? [u, run.c + v] : [run.c + v, u];
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.closePath();
    c.fill();
    pos += len + gap;
  }
}

export function drawDiagonalWall(c: Ctx, w: Wall, theme: FloorTheme, lw: number): void {
  const t = wallThickness(w.kind);
  c.save();
  c.lineCap = 'butt';
  if (w.kind === 'fence' || w.kind === 'rail') {
    c.strokeStyle = theme.rail;
    c.lineWidth = lw * 1.2;
    if (w.kind === 'fence') c.setLineDash([lw * 5, lw * 3]);
  } else if (w.kind === 'bars') {
    c.strokeStyle = theme.wall;
    c.fillStyle = theme.wall;
    c.lineWidth = lw * 0.8;
    c.beginPath();
    c.moveTo(w.x1, w.y1);
    c.lineTo(w.x2, w.y2);
    c.stroke();
    const n = Math.max(1, Math.round(Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 0.3));
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = w.x1 + ((w.x2 - w.x1) * i) / n;
      const y = w.y1 + ((w.y2 - w.y1) * i) / n;
      c.moveTo(x + t * 0.5, y);
      c.arc(x, y, t * 0.5, 0, TAU);
    }
    c.fill();
    c.restore();
    return;
  } else {
    c.strokeStyle = w.kind === 'glass' ? theme.glass : theme.wall;
    c.lineWidth = t;
    c.lineCap = 'square';
  }
  c.beginPath();
  c.moveTo(w.x1, w.y1);
  c.lineTo(w.x2, w.y2);
  c.stroke();
  c.restore();
}

/* ---------- 門窗 ---------- */

/** 以門窗為原點的座標：u 沿著線、v 垂直於線（side 那一側是 +）；橫線不轉、直線轉 90° */
function local(c: Ctx, o: Pick<Opening, 'o' | 'x' | 'y'>, fn: () => void): void {
  c.save();
  c.translate(o.x, o.y);
  if (o.o === 'v') c.rotate(Math.PI / 2);
  fn();
  c.restore();
}

/** 單扇開門：鉸鍊在 start（hingeAtStart）或 start＋len，往 side 開；broken＝門板歪掉、沒有弧線 */
function swing(
  c: Ctx,
  o: Opening,
  hingeAtStart: boolean,
  len: number,
  start: number,
  door: string,
  arc: string,
  lw: number,
  broken: boolean,
): void {
  const s = o.side || 1;
  /* 在「橫線」的座標系裡算，直線的情況交給 local() 轉；直線時 side＋ 是右側＝轉過去之後的 −v，所以反過來 */
  const sv = o.o === 'h' ? s : -s;
  local(c, o, () => {
    const u0 = start - (o.o === 'h' ? o.x : o.y);
    const hu = hingeAtStart ? u0 : u0 + len;
    const dir = hingeAtStart ? 1 : -1;
    const leaf = sv > 0 ? Math.PI / 2 : -Math.PI / 2;
    const closed = dir > 0 ? 0 : Math.PI;
    if (!broken) {
      c.strokeStyle = arc;
      c.lineWidth = lw * 0.8;
      c.setLineDash([lw * 3, lw * 2.5]);
      let delta = closed - leaf;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      c.beginPath();
      c.arc(hu, 0, len, leaf, leaf + delta, delta < 0);
      c.stroke();
      c.setLineDash([]);
    }
    c.strokeStyle = door;
    c.lineWidth = lw * 1.7;
    c.beginPath();
    if (broken) {
      const ang = leaf + (closed - leaf) * 0.35;
      c.moveTo(hu + Math.cos(ang) * 0.2, Math.sin(ang) * 0.2);
      c.lineTo(hu + Math.cos(ang) * len, Math.sin(ang) * len);
    } else {
      c.moveTo(hu, 0);
      c.lineTo(hu, sv * len);
    }
    c.stroke();
  });
}

function lockBadge(c: Ctx, x: number, y: number, size: number, theme: FloorTheme): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = theme.id === 'mono' ? '#ffffff' : '#f0ad1c';
  c.strokeStyle = '#3a2a00';
  c.lineWidth = size * 0.12;
  c.beginPath();
  c.arc(0, -size * 0.18, size * 0.27, Math.PI, 0);
  c.stroke();
  c.fillRect(-size * 0.4, -size * 0.18, size * 0.8, size * 0.6);
  c.strokeRect(-size * 0.4, -size * 0.18, size * 0.8, size * 0.6);
  c.restore();
}

function holeInWall(c: Ctx, o: Opening, t: number, theme: FloorTheme, lw: number): void {
  const rnd = seeded(Math.floor((o.x * 89 + o.y * 157) * 4) + 23);
  local(c, o, () => {
    const len = o.len;
    c.fillStyle = theme.wall;
    for (const [u0, dir] of [
      [0, 1],
      [len, -1],
    ] as const) {
      c.beginPath();
      c.moveTo(u0, -t / 2);
      for (let i = 0; i <= 4; i++) c.lineTo(u0 + dir * (0.08 + rnd() * 0.3), -t / 2 + (t / 4) * i);
      c.lineTo(u0, t / 2);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = theme.furn.ink;
    c.lineWidth = lw * 0.6;
    const n = Math.max(4, Math.round(len * 3));
    for (let i = 0; i < n; i++) {
      const u = 0.2 + rnd() * Math.max(0, len - 0.4);
      const v = (rnd() - 0.5) * (t + 1.1);
      const r = 0.06 + rnd() * 0.13;
      const k = 4 + Math.floor(rnd() * 2);
      c.beginPath();
      for (let j = 0; j < k; j++) {
        const a = (j / k) * TAU + rnd() * 0.6;
        const px = u + Math.cos(a) * r;
        const py = v + Math.sin(a) * r;
        if (j) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fillStyle = i % 2 ? theme.furn.shade : theme.furn.tint;
      c.fill();
      c.stroke();
    }
  });
}

export interface OpeningDrawOptions {
  playerView: boolean;
  editor: boolean;
}

export function drawOpening(
  c: Ctx,
  o: Opening,
  t: number,
  theme: FloorTheme,
  lw: number,
  opts: OpeningDrawOptions,
): void {
  const kind = o.kind;
  const len = o.len;
  if ((o.gm || kind === 'secret') && opts.playerView) return;
  c.save();
  if (OPEN[kind]?.group === 'window') {
    local(c, o, () => {
      c.fillStyle = theme.bg === 'transparent' ? '#ffffff' : theme.bg;
      c.fillRect(0, -t / 2, len, t);
      c.strokeStyle = theme.window;
      c.lineWidth = lw * 0.8;
      c.strokeRect(0, -t / 2, len, t);
      c.beginPath();
      if (kind === 'window2') {
        c.moveTo(0, -t * 0.14);
        c.lineTo(len * 0.55, -t * 0.14);
        c.moveTo(len * 0.45, t * 0.14);
        c.lineTo(len, t * 0.14);
      } else if (kind === 'brokenwin') {
        c.moveTo(0, 0);
        const n = Math.max(4, Math.round(len * 3));
        for (let i = 1; i <= n; i++) c.lineTo((len / n) * i, (i % 2 ? 1 : -1) * t * 0.3);
      } else {
        c.moveTo(0, 0);
        c.lineTo(len, 0);
      }
      c.stroke();
      if (kind === 'barred') {
        c.lineWidth = lw * 1.3;
        c.strokeStyle = theme.door;
        c.beginPath();
        for (let u = 0.25; u < len; u += 0.3) {
          c.moveTo(u, -t * 0.9);
          c.lineTo(u, t * 0.9);
        }
        c.stroke();
      }
      if (kind === 'boarded') {
        const bh = t * 1.5;
        c.fillStyle = theme.furn.wood;
        c.strokeStyle = theme.door;
        c.lineWidth = lw * 0.8;
        c.fillRect(-0.1, -bh / 2, len + 0.2, bh);
        c.strokeRect(-0.1, -bh / 2, len + 0.2, bh);
        c.save();
        c.beginPath();
        c.rect(-0.1, -bh / 2, len + 0.2, bh);
        c.clip();
        c.lineWidth = lw * 0.6;
        c.beginPath();
        for (let u = -bh; u < len + bh; u += 0.35) {
          c.moveTo(u, bh / 2);
          c.lineTo(u + bh, -bh / 2);
        }
        c.stroke();
        c.restore();
      }
    });
    c.restore();
    return;
  }
  const start = o.o === 'h' ? o.x : o.y;
  switch (kind) {
    case 'open':
      if (opts.editor)
        local(c, o, () => {
          c.strokeStyle = theme.rail;
          c.globalAlpha = 0.45;
          c.lineWidth = lw * 0.8;
          c.setLineDash([lw * 2, lw * 3]);
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(len, 0);
          c.stroke();
        });
      break;
    case 'hole':
      holeInWall(c, o, t, theme, lw);
      break;
    case 'secret':
      c.globalAlpha = 0.9;
      local(c, o, () => {
        c.strokeStyle = theme.gm;
        c.lineWidth = lw * 0.9;
        c.setLineDash([lw * 2.5, lw * 2]);
        c.strokeRect(0, -t / 2, len, t);
      });
      swing(c, o, !o.hinge, len, start, theme.gm, theme.gm, lw, false);
      break;
    case 'door':
    case 'locked':
    case 'broken':
      swing(c, o, !o.hinge, len, start, theme.door, theme.arc, lw, kind === 'broken');
      if (kind === 'locked') {
        const cx = o.o === 'h' ? o.x + len / 2 : o.x;
        const cy = o.o === 'h' ? o.y : o.y + len / 2;
        lockBadge(c, cx, cy, Math.max(0.28, t * 0.9), theme);
      }
      break;
    case 'door2':
      swing(c, o, true, len / 2, start, theme.door, theme.arc, lw, false);
      swing(c, o, false, len / 2, start + len / 2, theme.door, theme.arc, lw, false);
      break;
    case 'sliding':
    case 'sliding2':
    case 'auto':
      local(c, o, () => {
        /* 拉門的 side 以線的方向為準（直線轉 90° 之後 +v 是左側） */
        const s = o.side || 1;
        const pt = Math.max(t * 0.28, 0.07);
        c.fillStyle = kind === 'auto' ? theme.glass : theme.furn.paper;
        c.strokeStyle = theme.door;
        c.lineWidth = lw * 0.9;
        if (kind === 'sliding') {
          const x0 = o.hinge ? len * 0.08 : 0;
          c.fillRect(x0, -pt / 2 + s * pt * 0.4, len * 0.92, pt);
          c.strokeRect(x0, -pt / 2 + s * pt * 0.4, len * 0.92, pt);
          c.lineWidth = lw * 0.7;
          const ay = s * (t / 2 + 0.14);
          const dir = o.hinge ? -1 : 1;
          const ax0 = len / 2 - dir * len * 0.2;
          const ax1 = len / 2 + dir * len * 0.2;
          c.beginPath();
          c.moveTo(ax0, ay);
          c.lineTo(ax1, ay);
          c.moveTo(ax1 - dir * 0.12, ay - 0.08);
          c.lineTo(ax1, ay);
          c.lineTo(ax1 - dir * 0.12, ay + 0.08);
          c.stroke();
        } else {
          c.fillRect(0, -pt, len * 0.55, pt);
          c.strokeRect(0, -pt, len * 0.55, pt);
          c.fillRect(len * 0.45, 0, len * 0.55, pt);
          c.strokeRect(len * 0.45, 0, len * 0.55, pt);
          if (kind === 'auto') {
            c.strokeStyle = theme.arc;
            c.lineWidth = lw * 0.7;
            c.setLineDash([lw * 2, lw * 2]);
            c.strokeRect(-0.1, -len * 0.35, len + 0.2, len * 0.7);
          }
        }
      });
      break;
    case 'folding':
      local(c, o, () => {
        const s = o.side || 1;
        c.strokeStyle = theme.door;
        c.lineWidth = lw * 1.1;
        const panels = len >= 2.4 ? 2 : 1;
        const pw = len / panels;
        c.beginPath();
        for (let i = 0; i < panels; i++) {
          c.moveTo(pw * i + 0.05, 0);
          c.lineTo(pw * i + pw / 2, s * pw * 0.42);
          c.lineTo(pw * (i + 1) - 0.05, 0);
        }
        c.stroke();
      });
      break;
    case 'shutter':
      local(c, o, () => {
        c.strokeStyle = theme.door;
        c.lineWidth = lw * 0.8;
        c.setLineDash([lw * 3, lw * 2]);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(len, 0);
        c.stroke();
        c.setLineDash([]);
        c.strokeRect(0, -Math.max(t * 0.2, 0.05), len, Math.max(t * 0.4, 0.1));
      });
      break;
  }
  c.restore();
}

/* ---------- 家具 ---------- */

export function furnStyle(theme: FloorTheme, lw: number, color?: string): FurnStyle {
  return {
    ...theme.furn,
    ...(color ? { paper: color } : null),
    lw,
    wall: theme.wall,
    font: theme.font,
  };
}

/** 隱藏線索的標記（只在編輯畫面）：右上角的小放大鏡 */
export function drawClueMark(c: Ctx, x: number, y: number, theme: FloorTheme, lw: number): void {
  const r = 0.26;
  c.save();
  c.fillStyle = theme.clue;
  c.beginPath();
  c.arc(x, y, r + 0.1, 0, TAU);
  c.fill();
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(lw, 0.06);
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x - 0.04, y - 0.04, r * 0.48, 0, TAU);
  c.moveTo(x + r * 0.26, y + r * 0.26);
  c.lineTo(x + r * 0.62, y + r * 0.62);
  c.stroke();
  c.restore();
}

export function drawItem(
  c: Ctx,
  item: Item,
  theme: FloorTheme,
  lw: number,
  opts: { editor: boolean },
): void {
  const asset = ASSET[item.t];
  const draw = FURNITURE_DRAW[item.t];
  if (!asset || !draw) return;
  const loc = itemLocalSize(item);
  const S = furnStyle(theme, lw, item.color);
  c.save();
  if (item.gm && opts.editor) c.globalAlpha = 0.72;
  c.translate(item.x + item.w / 2, item.y + item.h / 2);
  c.rotate(((item.rot || 0) * Math.PI) / 180);
  if (item.flip) c.scale(-1, 1);
  c.translate(-loc.w / 2, -loc.h / 2);
  c.lineWidth = lw;
  c.strokeStyle = S.ink;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c, S, loc.w, loc.h, { label: item.label });
  c.restore();
  if (item.clue && opts.editor) drawClueMark(c, item.x + item.w, item.y, theme, lw);
  if (item.gm && opts.editor) {
    c.save();
    c.strokeStyle = theme.gm;
    c.lineWidth = lw;
    c.setLineDash([lw * 2, lw * 2]);
    c.strokeRect(item.x - 0.08, item.y - 0.08, item.w + 0.16, item.h + 0.16);
    c.restore();
  }
  if (item.label && !asset.labelInside) {
    const size = Math.max(0.36, Math.min(0.55, Math.min(item.w, item.h) * 0.4));
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    haloText(
      c,
      item.label,
      item.x + item.w / 2,
      item.y + item.h / 2,
      { weight: 700, size, family: theme.font },
      theme.label,
      theme.halo,
      size * 0.3,
    );
    c.restore();
  }
}

/* ---------- 名字與文字 ---------- */

export interface LabelDrawOptions {
  playerView: boolean;
  hideNames: boolean;
  showSize: SizeMode;
  editor: boolean;
}

export function drawRoomLabel(
  c: Ctx,
  room: ShownRoom,
  theme: FloorTheme,
  opts: LabelDrawOptions,
): void {
  if (room.hideLabel) return;
  const m = labelLayout(c, room, opts, theme);
  if (!m) return;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const halo = theme.halo;
  const nameFont = { weight: 800, size: m.fs, family: theme.font };
  const sizeFont = { weight: 700, size: m.sizeFs, family: theme.font };
  if (m.rotated) {
    c.translate(m.cx, m.cy);
    c.rotate(-Math.PI / 2);
    if (m.name)
      haloText(
        c,
        m.name,
        0,
        m.size ? -m.sizeFs * 0.55 : 0,
        nameFont,
        theme.label,
        halo,
        m.fs * 0.28,
      );
    if (m.size) {
      haloText(c, m.size, 0, m.name ? m.fs * 0.55 : 0, sizeFont, theme.sub, halo, m.sizeFs * 0.28);
    }
  } else if (m.vertical) {
    verticalText(
      c,
      m.name,
      m.cx,
      m.cy - (m.size ? m.sizeFs * 0.6 : 0),
      nameFont,
      theme.label,
      halo,
      m.fs * 0.28,
    );
    if (m.size) {
      haloText(
        c,
        m.size,
        m.cx,
        m.box.y + m.box.h - m.sizeFs * 0.5,
        sizeFont,
        theme.sub,
        halo,
        m.sizeFs * 0.28,
      );
    }
  } else {
    if (m.name)
      haloText(
        c,
        m.name,
        m.cx,
        m.size ? m.cy - m.sizeFs * 0.55 : m.cy,
        nameFont,
        theme.label,
        halo,
        m.fs * 0.28,
      );
    if (m.size) {
      haloText(
        c,
        m.size,
        m.cx,
        m.name ? m.cy + m.fs * 0.55 : m.cy,
        sizeFont,
        theme.sub,
        halo,
        m.sizeFs * 0.28,
      );
    }
  }
  c.restore();
}

export function drawText(c: Ctx, t: TextLabel, theme: FloorTheme, opts: { editor: boolean }): void {
  const size = t.size || 0.7;
  const font = textFont(t, theme.font);
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (t.gm && opts.editor) c.globalAlpha = 0.75;
  const color = t.color || (t.gm ? theme.gm : t.clue && opts.editor ? theme.clue : theme.label);
  const lines = String(t.text || '').split('\n');
  lines.forEach((ln, i) => {
    haloText(
      c,
      ln,
      t.x,
      t.y + (i - (lines.length - 1) / 2) * size * 1.25,
      font,
      color,
      theme.halo,
      size * 0.3,
    );
  });
  c.restore();
}

/* ---------- 格線 ---------- */

/** 格線：每 1 m（2 格）一條粗線；細線依倍率每 1／2／4 格（太小時跳著畫） */
export function drawGrid(c: Ctx, rect: Rect, theme: FloorTheme, zoom: number): void {
  const x0 = Math.floor(rect.x);
  const x1 = Math.ceil(rect.x + rect.w);
  const y0 = Math.floor(rect.y);
  const y1 = Math.ceil(rect.y + rect.h);
  const step = zoom < 7 ? 4 : zoom < 12 ? 2 : 1;
  c.save();
  c.lineWidth = 1 / zoom;
  c.strokeStyle = theme.grid;
  c.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step)
    if (x % 2) {
      c.moveTo(x, y0);
      c.lineTo(x, y1);
    }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step)
    if (y % 2) {
      c.moveTo(x0, y);
      c.lineTo(x1, y);
    }
  c.stroke();
  c.strokeStyle = theme.gridMajor;
  c.beginPath();
  const major = Math.max(2, step);
  for (let x = Math.ceil(x0 / major) * major; x <= x1; x += major) {
    c.moveTo(x, y0);
    c.lineTo(x, y1);
  }
  for (let y = Math.ceil(y0 / major) * major; y <= y1; y += major) {
    c.moveTo(x0, y);
    c.lineTo(x1, y);
  }
  c.stroke();
  c.restore();
}

/* ---------- 一層樓 ---------- */

export interface DrawFloorOptions {
  theme: FloorTheme;
  /** 每格幾 px（決定線寬、格線的密度） */
  zoom: number;
  showSize: SizeMode;
  hideNames: boolean;
  playerView: boolean;
  hideClues: boolean;
  /** 編輯畫面（GM 標示、分區線、線索標記…） */
  editor: boolean;
  grid: boolean;
  /** 看得到的範圍（鋪底色、格線） */
  viewRect?: Rect;
  /** 鋪底色（預設 true） */
  background?: boolean;
  /** 下一層（淡淡地畫牆與樓梯） */
  ghost?: Floor | null;
}

export function drawFloor(c: Ctx, floorIn: Floor, opts: DrawFloorOptions): ShownFloor {
  const theme = opts.theme;
  const floor = visibleFloor(floorIn, opts.playerView, opts.hideClues);
  const lw = lineWidthFor(opts.zoom);
  if (opts.viewRect && opts.background !== false && theme.bg !== 'transparent') {
    c.fillStyle = theme.bg;
    c.fillRect(opts.viewRect.x, opts.viewRect.y, opts.viewRect.w, opts.viewRect.h);
  }
  if (opts.grid && opts.viewRect) drawGrid(c, opts.viewRect, theme, opts.zoom);

  for (const room of floor.rooms) {
    if (room.masked) {
      c.fillStyle = theme.defaultFill;
      c.fillRect(room.x, room.y, room.w, room.h);
      c.save();
      c.globalAlpha = 0.38;
      c.fillStyle = theme.arc;
      c.fillRect(room.x, room.y, room.w, room.h);
      c.restore();
      continue;
    }
    c.fillStyle = roomFill(theme, room, Boolean(CAT[room.cat]?.outdoor));
    c.fillRect(room.x, room.y, room.w, room.h);
    drawPattern(c, room, theme, lw);
  }

  if (opts.ghost) {
    const ghost = visibleFloor(opts.ghost, opts.playerView);
    const g = computeWalls(ghost, { playerView: opts.playerView });
    const tinted = { ...theme, wall: theme.gm, rail: theme.gm };
    c.save();
    c.globalAlpha = 0.14;
    for (const run of g.runs) drawRun(c, run, tinted, lw, false);
    for (const item of ghost.items)
      if (VERTICAL_LINKS.has(item.t)) drawItem(c, item, theme, lw, { editor: false });
    c.restore();
  }

  const isUnder = (i: Item) => Boolean(ASSET[i.t]?.under);
  for (const item of floor.items) if (isUnder(item)) drawItem(c, item, theme, lw, opts);
  for (const item of floor.items) if (!isUnder(item)) drawItem(c, item, theme, lw, opts);

  const walls = computeWalls(floor, { playerView: opts.playerView });
  for (const run of walls.runs) drawRun(c, run, theme, lw, opts.editor);
  for (const w of walls.diagonal) drawDiagonalWall(c, w, theme, lw);
  for (const o of floor.openings)
    drawOpening(c, o, wallThickness(walls.openingKind.get(o.id)), theme, lw, opts);

  if (!opts.playerView) {
    for (const room of floor.rooms) {
      if (!room.gm) continue;
      c.save();
      c.beginPath();
      c.rect(room.x, room.y, room.w, room.h);
      c.clip();
      c.strokeStyle = theme.gm;
      c.globalAlpha = 0.28;
      c.lineWidth = lw;
      c.beginPath();
      for (let d = -room.h; d < room.w; d += 0.6) {
        c.moveTo(room.x + d, room.y + room.h);
        c.lineTo(room.x + d + room.h, room.y);
      }
      c.stroke();
      c.restore();
    }
  }

  for (const room of floor.rooms) if (!room.masked) drawRoomLabel(c, room, theme, opts);
  for (const t of floor.texts) drawText(c, t, theme, opts);
  return floor;
}
