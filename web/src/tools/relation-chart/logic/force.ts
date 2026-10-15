/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 磁鐵排列＝常駐的力導向（原作的 runForceSimulationStep）：連線像彈簧（雙向較硬）、角色互斥（含最小間距硬推）、
 * 往畫布中心集中；間距倍率同步縮放。積分用速度制：v = (v + F·α·0.55)·0.6，x += v。
 * 被拖曳的角色與釘選的角色是固定點（不積分，但照樣對別人施力）。
 */
import { charRadius, clampToCanvas, type SheetCtx, SNAP_GAP, spacingFactor } from '../engine/geom';
import type { Rel } from '../model/types';

/** 磁力等級：[理想長度倍率, 硬度倍率]（3＝預設） */
export const MAG_LEVELS: Record<number, [number, number]> = {
  1: [3.6, 1.4],
  2: [2.0, 1.1],
  3: [1, 1],
  4: [0.45, 1.5],
  5: [0.12, 2.4],
};

export type Velocities = Map<number, { x: number; y: number }>;

/** 這條線的磁力（線自己設了就蓋過關係類型） */
export function relMag(ctx: SheetCtx, r: Rel): number {
  if (r.mag >= 1 && r.mag <= 5) return r.mag;
  const t = ctx.typeById.get(r.type);
  return t && t.mag >= 1 && t.mag <= 5 ? t.mag : 3;
}

/** 走一步，回傳總移動量 */
export function forceStep(
  ctx: SheetCtx,
  vel: Velocities,
  alpha: number,
  pinned: ReadonlySet<number>,
): number {
  const chars = ctx.sheet.chars;
  const n = chars.length;
  if (n <= 1) return 0;
  const { W, H } = ctx;
  const centerX = W / 2;
  const centerY = H / 2;
  const fx = new Array<number>(n).fill(0);
  const fy = new Array<number>(n).fill(0);
  const sf = spacingFactor(ctx.s);
  const kRepel = ctx.s.magRepel;
  const kCenter = ctx.s.magCenter;
  const kLink = ctx.s.magLink;
  const kDist = ctx.s.magDist;
  const repulsion = 45000 * (sf * sf) * (kRepel / 10);
  const radii = chars.map((c) => charRadius(ctx, c));
  if (!ctx.s.noCollision) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = chars[i].x - chars[j].x;
        let dy = chars[i].y - chars[j].y;
        if (dx === 0 && dy === 0) {
          const a = j * 2.3999632;
          dx = Math.cos(a);
          dy = Math.sin(a);
        }
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        const minReq = (radii[i] + radii[j] + SNAP_GAP) * sf;
        let f = repulsion / (distSq + 100);
        if (dist < minReq) f += (minReq - dist) * 1.5;
        const nx = dx / dist;
        const ny = dy / dist;
        fx[i] += nx * f;
        fy[i] += ny * f;
        fx[j] -= nx * f;
        fy[j] -= ny * f;
      }
    }
  }
  const idx = new Map(chars.map((c, i) => [c.id, i]));
  for (const r of ctx.sheet.rels) {
    if (r.from === r.to) continue;
    const a = idx.get(r.from);
    const b = idx.get(r.to);
    if (a === undefined || b === undefined) continue;
    const dx = chars[b].x - chars[a].x;
    const dy = chars[b].y - chars[a].y;
    const dist = Math.hypot(dx, dy) || 1;
    const mag = MAG_LEVELS[relMag(ctx, r)] ?? MAG_LEVELS[3];
    const ideal = (radii[a] + radii[b] + kDist * mag[0]) * sf;
    const f = (dist - ideal) * (r.both ? 0.08 : 0.04) * kLink * mag[1];
    fx[a] += (dx / dist) * f;
    fy[a] += (dy / dist) * f;
    fx[b] -= (dx / dist) * f;
    fy[b] -= (dy / dist) * f;
  }
  let total = 0;
  chars.forEach((c, i) => {
    if (c.locked || pinned.has(c.id)) {
      vel.delete(c.id);
      return;
    }
    fx[i] += (centerX - c.x) * 0.03 * kCenter;
    fy[i] += (centerY - c.y) * 0.03 * kCenter;
    let v = vel.get(c.id);
    if (!v) {
      v = { x: 0, y: 0 };
      vel.set(c.id, v);
    }
    v.x = (v.x + fx[i] * alpha * 0.55) * 0.6;
    v.y = (v.y + fy[i] * alpha * 0.55) * 0.6;
    let sp = Math.hypot(v.x, v.y);
    const cap = 30 * alpha + 2;
    if (sp > cap) {
      v.x = (v.x / sp) * cap;
      v.y = (v.y / sp) * cap;
      sp = cap;
    }
    c.x += v.x;
    c.y += v.y;
    clampToCanvas(ctx, c);
    total += sp;
  });
  return total;
}

/** α 每格的衰減、停止條件（原作 simStep 的數值） */
export const SIM = {
  decay: 0.985,
  dragAlpha: 0.3,
  calmMove: 0.3,
  calmFrames: 24,
  minAlpha: 0.02,
} as const;
