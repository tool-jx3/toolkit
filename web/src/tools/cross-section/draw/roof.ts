/**
 * 屋頂（RF 顯示時；畫在 y＝0 以上 3 格）：平屋頂＋天線（女兒牆、欄杆、空調機、天線，通到頂樓的電梯或樓梯上有機房）、
 * 切妻（洋館：瓦的橫紋、兩根煙囪、中間的老虎窗）、鋸齒（工廠：一排斜的天窗、排氣筒）。圖形是本站自己畫的。
 */
import { isGmShaft, type Layout } from '../model/layout';
import type { SectionDoc } from '../model/types';
import { hatchRect } from './backdrop';
import type { Kit } from './kit';
import { box, dot, poly, seg } from './kit';
import { alpha } from './palette';

export function drawRoof(k: Kit, doc: SectionDoc, L: Layout): void {
  if (!doc.building.rooftop) return;
  const { p } = k;
  const W = L.width;
  const roof = doc.building.roof;
  if (roof === 'gable') {
    poly(k, [-0.7, 0, 3.2, -2.55, W - 3.2, -2.55, W + 0.7, 0], p.roofing, 0.06);
    for (let y = -0.4; y > -2.5; y -= 0.42) {
      const t = -y / 2.55;
      const x0 = -0.7 + t * 3.9;
      const x1 = W + 0.7 - t * 3.9;
      seg(k, x0, y, x1, y, 0.022, alpha(p.ink, 0.35));
    }
    for (const cx of [W * 0.18, W * 0.8]) {
      box(k, cx, -3.4, 1.4, 2.0, p.walls.brick, 0.045);
      for (let y = -3.0; y < -1.6; y += 0.4) seg(k, cx, y, cx + 1.4, y, 0.015, alpha(p.ink, 0.4));
      box(k, cx - 0.15, -3.62, 1.7, 0.24, p.slab, 0.04);
    }
    const mx = W / 2;
    poly(
      k,
      [mx - 1.8, -0.15, mx - 1.8, -1.7, mx, -2.85, mx + 1.8, -1.7, mx + 1.8, -0.15],
      p.walls.plaster,
      0.045,
    );
    dot(k, mx, -1.25, 0.55, alpha(p.pane, 0.7), 0.035);
    seg(k, mx - 0.55, -1.25, mx + 0.55, -1.25, 0.025);
    seg(k, mx, -1.8, mx, -0.7, 0.025);
    seg(k, mx, -2.85, mx, -3.3, 0.04);
    dot(k, mx, -3.35, 0.08, p.gilt, 0.02);
    return;
  }
  if (roof === 'sawtooth') {
    const teeth = Math.max(3, Math.round(W / 9));
    const bw = W / teeth;
    for (let i = 0; i < teeth; i++) {
      const x = i * bw;
      poly(k, [x, 0, x + bw * 0.3, -2.25, x + bw, 0], p.roofing, 0.05);
      seg(k, x + 0.12, -0.2, x + bw * 0.3 - 0.06, -2.05, 0.13, alpha(p.pane, 0.75));
    }
    box(k, W - 4.0, -3.3, 1.3, 3.3, p.iron, 0.045);
    box(k, W - 4.25, -3.52, 1.8, 0.24, p.slab, 0.04);
    hatchRect(k.c, -0.2, -0.36, W + 0.4, 0.36, p.slab, p.hatch);
    box(k, -0.2, -0.36, W + 0.4, 0.36, null, 0.05);
    return;
  }
  /* 平屋頂 */
  seg(k, 0.2, -1.2, W - 0.2, -1.2, 0.035);
  seg(k, 0.2, -0.8, W - 0.2, -0.8, 0.02, alpha(p.ink, 0.7));
  for (let x = 0.4; x < W; x += 1.5) seg(k, x, -1.2, x, -0.38, 0.025);
  const highest = L.floors[0]?.floor.level;
  for (const s of L.shafts) {
    if (isGmShaft(s.shaft) || s.shaft.top !== highest || s.shaft.kind === 'ladder') continue;
    box(k, s.x - 0.3, -2.5, s.w + 0.6, 2.14, p.walls.concrete, 0.05);
    box(k, s.x - 0.5, -2.72, s.w + 1.0, 0.24, p.slab, 0.04);
    for (let y = -2.15; y <= -1.4; y += 0.24)
      seg(k, s.x + 0.35, y, s.x + s.w - 0.35, y, 0.022, alpha(p.ink, 0.65));
  }
  /* 空調機 */
  box(k, 2.6, -1.7, 3.4, 1.34, p.iron, 0.045, p.ink, 0.08);
  dot(k, 3.6, -1.03, 0.42, p.ironLit, 0.03);
  for (let i = 0; i < 3; i++)
    seg(k, 3.6, -1.03, 3.6 + Math.cos(i * 2.1) * 0.38, -1.03 + Math.sin(i * 2.1) * 0.38, 0.03);
  for (let x = 4.4; x < 5.9; x += 0.3) seg(k, x, -1.5, x, -0.55, 0.02, alpha(p.ink, 0.6));
  /* 天線 */
  const ax = Math.min(W - 3, 8.6);
  seg(k, ax, -0.38, ax, -3.2, 0.05);
  seg(k, ax - 0.75, -2.75, ax + 0.75, -2.75, 0.03);
  seg(k, ax - 0.5, -2.3, ax + 0.5, -2.3, 0.03);
  poly(k, [ax + 0.3, -1.6, ax + 0.95, -2.05, ax + 1.05, -1.25], p.tint, 0.03);
  dot(k, ax, -3.22, 0.06, p.alarm, 0);
  hatchRect(k.c, -0.2, -0.4, W + 0.4, 0.4, p.slab, p.hatch);
  box(k, -0.2, -0.4, W + 0.4, 0.4, null, 0.055);
}
