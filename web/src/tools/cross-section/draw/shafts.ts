/**
 * 縱向通道：電梯（導軌、頂部的滑輪、每層的指示燈、車廂；掉落時歪斜、纜線斷開）、折返樓梯（每層兩段＋中間的平台）、
 * 直樓梯（每層一段）、梯子、祕密通風管（GM 專用：細的管道與每層天花板的分支）。
 * 每層和相鄰的一般區域（不是祕密區域）之間畫出入口。
 */
import type { Layout, ShaftBox } from '../model/layout';
import { FLOOR_T } from '../model/layout';
import type { EnvId } from '../model/types';
import { hatchRect } from './backdrop';
import { box, dot, type Kit, seg, shape } from './kit';
import { alpha, mix } from './palette';

const SIDE = 0.2;
const CAP = 0.52;

export function drawShaft(k: Kit, L: Layout, s: ShaftBox, env: EnvId): void {
  const { c, p } = k;
  const sh = s.shaft;
  if (sh.kind === 'duct') {
    const cx = s.x + s.w / 2;
    box(k, s.x + 0.12, s.y + 0.25, s.w - 0.24, s.h - 0.5, alpha(p.iron, 0.5), 0.055, p.gm);
    for (const f of s.floors) {
      c.setLineDash([0.22, 0.12]);
      seg(k, cx - 1.4, f.y0 + 0.48, cx + 1.4, f.y0 + 0.48, 0.16, alpha(p.gm, 0.7));
      c.setLineDash([]);
      box(k, cx - 0.34, f.y0 + 0.37, 0.68, 0.22, p.paper, 0.03, p.gm);
    }
    return;
  }
  const stairs = sh.kind === 'switchback' || sh.kind === 'stairs';
  const bg = stairs
    ? p.dark
      ? mix(p.walls.plaster, p.ink, 0.08)
      : mix(p.walls.plaster, p.walls.concrete, 0.4)
    : p.dark
      ? mix(p.walls.plaster, '#000000', 0.3)
      : mix(p.walls.concrete, p.ink, 0.15);
  c.fillStyle = bg;
  c.fillRect(s.x, s.y, s.w, s.h);
  hatchRect(c, s.x, s.y, SIDE, s.h, p.slab, p.hatch);
  hatchRect(c, s.x + s.w - SIDE, s.y, SIDE, s.h, p.slab, p.hatch);
  hatchRect(c, s.x, s.y, s.w, CAP, p.slab, p.hatch);
  hatchRect(c, s.x, s.y + s.h - FLOOR_T, s.w, FLOOR_T, p.slab, p.hatch);
  box(k, s.x, s.y, s.w, s.h, null, 0.04);

  /* 每層的出入口（相鄰的一般區域） */
  for (const f of s.floors) {
    const floorLine = f.y1 - FLOOR_T;
    const dh = Math.min(3.2, L.storey - 1.35);
    const left = f.floor.rooms.some((r) => r.x1 === s.x && !r.secret);
    const right = f.floor.rooms.some((r) => r.x0 === s.x + s.w && !r.secret);
    const door = sh.kind === 'elevator' ? p.gilt : p.walls.plaster;
    if (left) box(k, s.x + 0.02, floorLine - dh, 0.16, dh, door, 0.025);
    if (right) box(k, s.x + s.w - 0.18, floorLine - dh, 0.16, dh, door, 0.025);
  }

  const ix = s.x + SIDE;
  const iw = s.w - SIDE * 2;
  const cx = s.x + s.w / 2;
  if (sh.kind === 'elevator') {
    for (const x of [ix + 0.2, ix + iw - 0.2])
      seg(k, x, s.y + CAP, x, s.y + s.h - FLOOR_T, 0.045, alpha(p.ink, 0.5));
    const py = s.y + 0.75;
    dot(k, cx, py, 0.2, p.iron, 0.03);
    dot(k, cx, py, 0.06, p.ink, 0);
    const lampColor = env === 'blackout' ? p.alarm : p.gilt;
    s.floors.forEach((f, i) => {
      c.setLineDash([0.16, 0.14]);
      seg(k, ix, f.y1 - FLOOR_T, ix + iw, f.y1 - FLOOR_T, 0.03, alpha(p.ink, 0.5));
      c.setLineDash([]);
      const lx = i === 0 ? cx + 0.42 : cx - 0.3;
      box(k, lx, f.y0 + 0.6, 0.6, 0.2, p.paper, 0.02, p.ink, 0.05);
      dot(k, lx + 0.3, f.y0 + 0.7, 0.06, lampColor, 0);
    });
    const at = s.floors.find((f) => f.floor.level === sh.cab) ?? s.floors[0];
    const ch = Math.min(L.storey - 1.75, 4.15);
    const cw = iw - 0.32;
    const cy = at.y1 - FLOOR_T - 0.04 - ch;
    const fallen = sh.cabState === 'fallen' || (sh.cabState === 'fallsAfter' && env === 'after');
    if (fallen) {
      /* 斷掉的纜線 */
      shape(
        k,
        () => {
          c.moveTo(cx - 0.1, py);
          c.lineTo(cx - 0.1, cy - 0.9);
          c.quadraticCurveTo(cx - 0.45, cy - 0.4, cx - 0.12, cy - 0.15);
        },
        null,
        0.03,
      );
      seg(k, cx + 0.1, py, cx + 0.1, py + 1.2, 0.03);
    } else {
      seg(k, cx - 0.1, py, cx - 0.1, cy, 0.03);
      seg(k, cx + 0.1, py, cx + 0.1, cy, 0.03);
    }
    c.save();
    if (fallen) {
      c.translate(cx, cy + ch / 2);
      c.rotate(0.19);
      c.translate(-cx, -(cy + ch / 2));
    }
    box(k, cx - cw / 2, cy, cw, ch, p.iron, 0.05, p.ink, 0.05);
    box(k, cx - cw / 2 + 0.15, cy + 0.32, cw - 0.3, ch - 0.42, p.walls.plaster, 0.025);
    seg(k, cx, cy + 0.32, cx, cy + ch - 0.1, 0.025, alpha(p.ink, 0.7));
    box(
      k,
      cx - cw / 2 + 0.32,
      cy + 0.1,
      cw - 0.64,
      0.13,
      env === 'blackout' ? p.alarm : p.amber,
      0.015,
    );
    seg(
      k,
      cx - cw / 2 + 0.22,
      cy + ch * 0.62,
      cx + cw / 2 - 0.22,
      cy + ch * 0.62,
      0.03,
      alpha(p.ink, 0.5),
    );
    c.restore();
    /* 緩衝器 */
    c.setLineDash([0.08, 0.06]);
    for (const x of [cx - 0.45, cx + 0.45])
      seg(k, x, s.y + s.h - FLOOR_T, x, s.y + s.h - 0.85, 0.08);
    c.setLineDash([]);
    return;
  }
  if (stairs) {
    const tread = p.dark ? mix(p.ink, p.paper, 0.55) : p.iron;
    const tread2 = p.dark ? mix(p.ink, p.paper, 0.38) : p.slab;
    const rail = p.dark ? p.amber : p.gilt;
    const flight = (x0: number, y0: number, x1: number, y1: number, n: number, fill: string) => {
      shape(
        k,
        () => {
          c.moveTo(x0, y0);
          for (let i = 1; i <= n; i++) {
            const t = i / n;
            c.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * (t - 1 / n));
            c.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
          }
          c.lineTo(x1, y1 + 0.38);
          c.lineTo(x0, y0 + 0.38);
          c.closePath();
        },
        fill,
        0.045,
      );
      for (let i = 0; i <= n; i += 2) {
        const t = i / n;
        const bx = x0 + (x1 - x0) * t;
        const by = y0 + (y1 - y0) * t;
        seg(k, bx, by, bx, by - 0.7, 0.024, alpha(p.ink, 0.85));
      }
      seg(k, x0, y0 - 0.7, x1, y1 - 0.7, 0.07, rail);
    };
    s.floors.forEach((f, i) => {
      const y = f.y1 - FLOOR_T;
      box(k, ix, y, iw * 0.34, 0.3, tread2, 0.04);
      const next = s.floors[i + 1];
      if (!next) return;
      const ny = next.y1 - FLOOR_T;
      if (sh.kind === 'switchback') {
        const mid = (y + ny) / 2;
        const a = ix + iw * 0.32;
        const b = ix + iw * 0.68;
        box(k, b, mid, iw * 0.32, 0.28, tread2, 0.04);
        flight(a, y, b, mid, 6, tread);
        flight(b, mid, a, ny, 6, tread2);
      } else flight(ix + 0.18, y, ix + iw - 0.18, ny, 9, tread2);
    });
    return;
  }
  /* 梯子 */
  for (const x of [cx - 0.38, cx + 0.38]) seg(k, x, s.y + 0.55, x, s.y + s.h - 0.36, 0.055);
  for (let y = s.y + 0.82; y < s.y + s.h - 0.4; y += 0.46)
    seg(k, cx - 0.38, y, cx + 0.38, y, 0.036);
  for (const f of s.floors) box(k, ix, f.y1 - 0.36, iw, 0.16, p.iron, 0.028);
}

/** GM 專用（祕密）的通道：外面再框一圈 GM 的虛線 */
export function drawGmMark(k: Kit, s: ShaftBox): void {
  k.c.setLineDash([0.26, 0.16]);
  box(k, s.x + 0.06, s.y + 0.06, s.w - 0.12, s.h - 0.12, null, 0.07, k.p.gm);
  k.c.setLineDash([]);
}
