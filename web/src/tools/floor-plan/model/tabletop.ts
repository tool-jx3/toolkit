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

/** small 放在 surface 上：中心在桌面上（含邊）、面積 70% 以上在桌面上 */
export function restsOn(small: Box, surface: Box): boolean {
  if (small === surface || !TABLETOP.has(small.t) || !SURFACES.has(surface.t)) return false;
  const cx = small.x + small.w / 2;
  const cy = small.y + small.h / 2;
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
