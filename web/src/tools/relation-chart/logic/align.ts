/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 對齊與分佈（原作的 doAlign、doDistribute、doEqualSpacing）：釘選的角色不參與基準也不移動；
 * 選取 2 位以上時彼此對齊，否則以畫布為對象（未釘選角色整組平移）。
 */
import { charRadius, type SheetCtx } from '../engine/geom';
import type { Char } from '../model/types';

export type AlignAction =
  | 'left'
  | 'hcenter'
  | 'right'
  | 'top'
  | 'vcenter'
  | 'bottom'
  | 'distH'
  | 'distV'
  | 'gapH'
  | 'gapV';

const MAP: Partial<Record<AlignAction, ['x' | 'y', 'min' | 'mid' | 'max']>> = {
  left: ['x', 'min'],
  hcenter: ['x', 'mid'],
  right: ['x', 'max'],
  top: ['y', 'min'],
  vcenter: ['y', 'mid'],
  bottom: ['y', 'max'],
};

function bbox(ctx: SheetCtx, list: Char[], axis: 'x' | 'y') {
  let mn = Number.POSITIVE_INFINITY;
  let mx = Number.NEGATIVE_INFINITY;
  for (const c of list) {
    const h = charRadius(ctx, c);
    mn = Math.min(mn, c[axis] - h);
    mx = Math.max(mx, c[axis] + h);
  }
  return { mn, mx, mid: (mn + mx) / 2 };
}

/** 均分與等間隔需要 3 位以上未釘選角色 */
export const canDistribute = (targets: Char[]): boolean =>
  targets.filter((c) => !c.locked).length >= 3;

/**
 * 對 targets（選取的角色；沒有選取 2 位以上時傳全部角色、toCanvas＝true）執行動作。回傳有沒有移動。
 */
export function applyAlign(
  ctx: SheetCtx,
  targets: Char[],
  action: AlignAction,
  toCanvas: boolean,
): boolean {
  const movable = targets.filter((c) => !c.locked);
  if (!movable.length) return false;
  const m = MAP[action];
  if (m) {
    const [axis, edge] = m;
    const bb = bbox(ctx, movable, axis);
    if (toCanvas) {
      const size = axis === 'x' ? ctx.W : ctx.H;
      const d = edge === 'min' ? 0 - bb.mn : edge === 'max' ? size - bb.mx : size / 2 - bb.mid;
      for (const c of movable) c[axis] += d;
    } else {
      for (const c of movable) {
        const h = charRadius(ctx, c);
        c[axis] = edge === 'min' ? bb.mn + h : edge === 'max' ? bb.mx - h : bb.mid;
      }
    }
    return true;
  }
  if (movable.length < 3) return false;
  const axis = action === 'distH' || action === 'gapH' ? 'x' : 'y';
  const so = [...movable].sort((a, b) => a[axis] - b[axis]);
  const n = so.length;
  if (action === 'distH' || action === 'distV') {
    const first = so[0][axis];
    const last = so[n - 1][axis];
    so.forEach((c, i) => {
      if (i === 0 || i === n - 1) return;
      c[axis] = first + ((last - first) * i) / (n - 1);
    });
    return true;
  }
  const start = so[0][axis] - charRadius(ctx, so[0]);
  const end = so[n - 1][axis] + charRadius(ctx, so[n - 1]);
  const total = so.reduce((s, c) => s + 2 * charRadius(ctx, c), 0);
  const gap = (end - start - total) / (n - 1);
  let cur = start;
  so.forEach((c, i) => {
    const h = charRadius(ctx, c);
    if (i !== 0 && i !== n - 1) c[axis] = cur + h;
    cur += 2 * h + gap;
  });
  return true;
}
