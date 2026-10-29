/**
 * 桌上的小物（2026-10-29，參考 KIIN マップ制作スタジオ；規格 F255、F256、3.14.4、D70）。
 *
 * 小物（`TABLETOP`）的中心在有桌面的家具（`SURFACES`）上、而且面積 70% 以上在桌面上時算「放在桌上」：
 * 移動、旋轉、複製桌子時一起動；整理家具、家具跟著房間縮放時和桌子當成一組；格局檢查的「家具不重疊」不算（F242 的例外②）。
 * 名單原本在測試輔助（`tests/helpers/floorPlanLayout.ts`，2026-10-22 依 7.18），2026-10-29 搬到這裡共用。
 */
import type { Floor, Item, SelRef } from './types';

/** 有桌面的家具：桌子、書桌、祭壇、工作台、櫃台…，上面可以放 `TABLETOP` 的小物 */
export const SURFACES: ReadonlySet<string> = new Set([
  'table',
  'table_round',
  'lowtable',
  'desk',
  'desk_set',
  'office_desk',
  'nightstand',
  'dresser',
  'altar',
  'ritual_table',
  'counter',
  'workbench',
  'lab_bench',
  'island',
  'reception',
  'register',
  'zataku',
  'chart_table',
  'ops_table',
  'holo_table',
  'display_case',
  'pedestal',
  'picnic',
]);

/**
 * 放在桌面上的小物（線索、文件、蠟燭、神像、水晶球、筆電、顯微鏡…；2026-10-29 加盆栽、紙燈籠、檯燈、桌上螢幕）
 */
export const TABLETOP: ReadonlySet<string> = new Set([
  'memo',
  'diary',
  'key',
  'knife',
  'photo',
  'phone',
  'pills',
  'papers',
  'file_folder',
  'laptop',
  'recorder',
  'camera',
  'wallet',
  'flashlight',
  'tools',
  'bag',
  'candle',
  'idol',
  'crystal_ball',
  'cursed_item',
  'microscope',
  /* 2026-10-29 */
  'plant',
  'andon',
  'desk_lamp',
  'desk_monitor',
]);

/** 面積多少比例在桌面上才算放在桌上 */
export const TABLETOP_SHARE = 0.7;

type Box = Pick<Item, 't' | 'x' | 'y' | 'w' | 'h'>;

const EPS = 1e-6;

/**
 * 圓形的桌面（畫成橢圓或圓的）：放在桌上的判定用桌面的形狀，不用外框（2026-10-29 驗證後修訂，D70）。
 * 值＝桌面的半徑（橫、縱）佔外框的一半的比例：圓桌是內接的橢圓；全像投影桌是內接的圓（短邊）。
 */
export const ROUND_SURFACES: ReadonlyMap<string, 'ellipse' | 'circle'> = new Map([
  ['table_round', 'ellipse'],
  ['holo_table', 'circle'],
]);

/** 長方形與橢圓重疊的面積（沿 x 分 48 段的中點積分；誤差遠小於 70% 的門檻需要的精度） */
function rectEllipseOverlap(
  r: Pick<Box, 'x' | 'y' | 'w' | 'h'>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  const x0 = Math.max(r.x, cx - rx);
  const x1 = Math.min(r.x + r.w, cx + rx);
  if (x1 <= x0) return 0;
  const N = 48;
  const dx = (x1 - x0) / N;
  let area = 0;
  for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) * dx;
    const t = (x - cx) / rx;
    const half = ry * Math.sqrt(Math.max(0, 1 - t * t));
    const lo = Math.max(r.y, cy - half);
    const hi = Math.min(r.y + r.h, cy + half);
    if (hi > lo) area += (hi - lo) * dx;
  }
  return area;
}

/** small 放在 surface 上：中心在桌面上（含邊）、面積 70% 以上在桌面上；圓桌的桌面是橢圓（圓） */
export function restsOn(small: Box, surface: Box): boolean {
  if (small === surface || !TABLETOP.has(small.t) || !SURFACES.has(surface.t)) return false;
  const cx = small.x + small.w / 2;
  const cy = small.y + small.h / 2;
  const round = ROUND_SURFACES.get(surface.t);
  if (round) {
    const ex = surface.x + surface.w / 2;
    const ey = surface.y + surface.h / 2;
    const r = Math.min(surface.w, surface.h) / 2;
    const rx = round === 'circle' ? r : surface.w / 2;
    const ry = round === 'circle' ? r : surface.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    if (((cx - ex) / rx) ** 2 + ((cy - ey) / ry) ** 2 > 1 + EPS) return false;
    return rectEllipseOverlap(small, ex, ey, rx, ry) >= small.w * small.h * TABLETOP_SHARE - 1e-3;
  }
  if (
    cx < surface.x - EPS ||
    cx > surface.x + surface.w + EPS ||
    cy < surface.y - EPS ||
    cy > surface.y + surface.h + EPS
  )
    return false;
  const ox = Math.min(small.x + small.w, surface.x + surface.w) - Math.max(small.x, surface.x);
  const oy = Math.min(small.y + small.h, surface.y + surface.h) - Math.max(small.y, surface.y);
  if (ox <= 0 || oy <= 0) return false;
  return ox * oy >= small.w * small.h * TABLETOP_SHARE - EPS;
}

/** 小物放在哪一件上（好幾件時取桌面最小的，一樣大時取後放的；不在桌上時 null） */
export function supportOf<T extends Box>(small: T, items: readonly T[]): T | null {
  if (!TABLETOP.has(small.t)) return null;
  let best: T | null = null;
  for (const it of items) {
    if (it === small || !restsOn(small, it)) continue;
    if (!best || it.w * it.h <= best.w * best.h) best = it;
  }
  return best;
}

/** 放在 surface 上的小物 */
export function restingOn<T extends Box>(surface: T, items: readonly T[]): T[] {
  if (!SURFACES.has(surface.t)) return [];
  return items.filter((it) => it !== surface && supportOf(it, items) === surface);
}

/**
 * 選取的東西＋放在選取的桌子上的小物（移動、複製桌子時一起帶著；小物本身也選了時不重複）。
 * 小物接在後面（順序：原本的選取、再來是帶著的小物）。
 */
export function withTabletop(floor: Pick<Floor, 'items'>, refs: readonly SelRef[]): SelRef[] {
  const picked = new Set(refs.filter((r) => r.type === 'item').map((r) => r.id));
  const out = [...refs];
  for (const r of refs) {
    if (r.type !== 'item') continue;
    const surface = floor.items.find((i) => i.id === r.id);
    if (!surface || !SURFACES.has(surface.t)) continue;
    for (const small of restingOn(surface, floor.items))
      if (!picked.has(small.id)) {
        picked.add(small.id);
        out.push({ type: 'item', id: small.id });
      }
  }
  return out;
}
