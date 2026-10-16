/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 磁鐵排列＝常駐的力導向（原作的 runForceSimulationStep）：連線像彈簧（雙向較硬）、角色互斥（含最小間距硬推）、
 * 往畫布中心集中；間距倍率同步縮放。積分用速度制：v = (v + F·α·0.55)·0.6，x += v。
 * 被拖曳的角色與釘選的角色是固定點（不積分，但照樣對別人施力）。
 * 第二批：標籤網開著（全部標籤）或「陣營框＋引力」的標籤也參與——標籤與成員之間的彈簧（比關係線強）、
 * 畫出來的標籤圓點與角色、其他圓點互斥、受向心力；位置存在分頁設定的 labelPos。收合中的成員不動也不受力。
 */
import { charRadius, clampToCanvas, type SheetCtx, SNAP_GAP, spacingFactor } from '../engine/geom';
import { labelInfo, labelNetLayout, labelNetMetrics, lblNodeDrawn } from '../engine/labels';
import type { Char, Rel } from '../model/types';

/** 磁力等級：[理想長度倍率, 硬度倍率]（3＝預設） */
export const MAG_LEVELS: Record<number, [number, number]> = {
  1: [3.6, 1.4],
  2: [2.0, 1.1],
  3: [1, 1],
  4: [0.45, 1.5],
  5: [0.12, 2.4],
};

/** 速度：角色 id、標籤是 `L<id>` */
export type Velocities = Map<number | string, { x: number; y: number }>;

/** 這條線的磁力（線自己設了就蓋過關係類型） */
export function relMag(ctx: SheetCtx, r: Rel): number {
  if (r.mag >= 1 && r.mag <= 5) return r.mag;
  const t = ctx.typeById.get(r.type);
  return t && t.mag >= 1 && t.mag <= 5 ? t.mag : 3;
}

/** 標籤要不要參與磁鐵：標籤網開著，或有「陣營框＋沒隱藏＋有引力」的標籤 */
export const labelsInForce = (ctx: SheetCtx): boolean =>
  ctx.s.showLabelNodes || ctx.labels.some((l) => l.zone && !l.hidden && !l.noPull);

/** 走一步，回傳總移動量（pinnedLbl＝拖著的標籤） */
export function forceStep(
  ctx: SheetCtx,
  vel: Velocities,
  alpha: number,
  pinned: ReadonlySet<number>,
  pinnedLbl: number | null = null,
): number {
  const hidden = labelInfo(ctx).colHidden;
  const chars = hidden.size ? ctx.sheet.chars.filter((c) => !hidden.has(c.id)) : ctx.sheet.chars;
  const n = chars.length;
  const lblActive = labelsInForce(ctx);
  if (n <= 1 && !lblActive) return 0;
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
  const lblMove = lblActive
    ? labelForces(ctx, chars, radii, idx, fx, fy, vel, alpha, pinnedLbl, repulsion, sf)
    : 0;
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
  return total + lblMove;
}

/** 標籤的力（原作 runForceSimulationStep 的標籤段）：對角色的力加進 fx／fy，標籤自己積分並存位置；回傳移動量 */
function labelForces(
  ctx: SheetCtx,
  chars: readonly Char[],
  radii: readonly number[],
  idx: ReadonlyMap<number, number>,
  fx: number[],
  fy: number[],
  vel: Velocities,
  alpha: number,
  pinnedLbl: number | null,
  repulsion: number,
  sf: number,
): number {
  const all = labelNetLayout(ctx);
  const items = ctx.s.showLabelNodes ? all : all.filter((it) => it.label.zone);
  if (!items.length) return 0;
  const { W, H } = ctx;
  const kCenter = ctx.s.magCenter;
  const kLink = ctx.s.magLink;
  const kDist = ctx.s.magDist;
  const lblR = labelNetMetrics(ctx).R;
  const hidden = labelInfo(ctx).colHidden;
  const lf = items.map(() => ({ x: 0, y: 0 }));
  const solid = items.map((it) => lblNodeDrawn(ctx, it));
  items.forEach((L, li) => {
    /* 引力：標籤與成員之間的彈簧（雙向）；收合中的成員不拉 */
    if (!L.label.noPull)
      for (const c of L.members) {
        if (hidden.has(c.id)) continue;
        const i = idx.get(c.id);
        const dx = c.x - L.x;
        const dy = c.y - L.y;
        const d = Math.hypot(dx, dy) || 1;
        const ideal = (charRadius(ctx, c) + lblR + kDist * 0.4) * sf;
        const f = (d - ideal) * 0.12 * kLink;
        const ux = dx / d;
        const uy = dy / d;
        lf[li].x += ux * f;
        lf[li].y += uy * f;
        if (i !== undefined) {
          fx[i] -= ux * f;
          fy[i] -= uy * f;
        }
      }
    /* 畫出來的圓點才佔位：和角色互斥 */
    if (solid[li] && !ctx.s.noCollision)
      chars.forEach((c, i) => {
        let dx = L.x - c.x;
        let dy = L.y - c.y;
        if (dx === 0 && dy === 0) {
          const a = i * 2.3999632;
          dx = Math.cos(a);
          dy = Math.sin(a);
        }
        const d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const minReq = (radii[i] + lblR + SNAP_GAP * 0.6) * sf;
        let f = (repulsion * 0.5) / (d2 + 100);
        if (d < minReq) f += (minReq - d) * 1.2;
        const ux = dx / d;
        const uy = dy / d;
        lf[li].x += ux * f;
        lf[li].y += uy * f;
        fx[i] -= ux * f;
        fy[i] -= uy * f;
      });
  });
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (!solid[i] || !solid[j]) continue;
      let dx = items[i].x - items[j].x;
      let dy = items[i].y - items[j].y;
      if (dx === 0 && dy === 0) {
        const a = j * 2.3999632;
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
      const d2 = dx * dx + dy * dy || 1;
      const d = Math.sqrt(d2);
      const minReq = (lblR * 2 + 18) * sf;
      let f = (repulsion * 0.4) / (d2 + 100);
      if (d < minReq) f += (minReq - d) * 1.2;
      const ux = dx / d;
      const uy = dy / d;
      lf[i].x += ux * f;
      lf[i].y += uy * f;
      lf[j].x -= ux * f;
      lf[j].y -= uy * f;
    }
  const pos = ctx.s.labelPos;
  const edge = Math.max(40, lblR + 14);
  let move = 0;
  items.forEach((L, li) => {
    const key = `L${L.id}`;
    if (L.id === pinnedLbl) {
      vel.delete(key);
      return;
    }
    lf[li].x += (W / 2 - L.x) * 0.03 * kCenter;
    lf[li].y += (H / 2 - L.y) * 0.03 * kCenter;
    let v = vel.get(key);
    if (!v) {
      v = { x: 0, y: 0 };
      vel.set(key, v);
    }
    v.x = (v.x + lf[li].x * alpha * 0.55) * 0.6;
    v.y = (v.y + lf[li].y * alpha * 0.55) * 0.6;
    let sp = Math.hypot(v.x, v.y);
    const cap = 30 * alpha + 2;
    if (sp > cap) {
      v.x = (v.x / sp) * cap;
      v.y = (v.y / sp) * cap;
      sp = cap;
    }
    pos[L.id] = {
      x: Math.round(Math.max(edge, Math.min(W - edge, L.x + v.x)) * 10) / 10,
      y: Math.round(Math.max(edge, Math.min(H - edge, L.y + v.y)) * 10) / 10,
    };
    move += sp;
  });
  return move;
}

/** α 每格的衰減、停止條件（原作 simStep 的數值） */
export const SIM = {
  decay: 0.985,
  dragAlpha: 0.3,
  calmMove: 0.3,
  calmFrames: 24,
  minAlpha: 0.02,
} as const;
