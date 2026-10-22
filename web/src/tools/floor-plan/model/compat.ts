/**
 * 原作（TRPG 室內圖メーカー）v1.05～v1.14 存的地圖檔：本工具沒有的家具略過、疊在牆上的牆洞與崩塌換成牆上的破洞，
 * 換掉與略過的東西記下來（開檔時通知）。規格 2.2.1～2.2.3、D22～D25。
 *
 * 2026-10 第二批起，原作新增的房間 14 種、門窗 7 種、牆 3 種本工具都有（代號相同），照讀，不再換成最接近的種類；
 * 每間房的牆種類（`rooms[].wall`）、外觀層的「顯示內部」（`floors[].showInside`、`inside`）也照讀。
 * 棋子方格（v1.07 的 tokenGrid）2026-10 第一批起照讀。新的家具（第三批）仍然略過。
 */
import { snap } from './geometry';
import type { Opening, OpeningKind, RoomCategory, WallKind } from './types';
import type { WallRun } from './walls';

/**
 * 原作 v1.05～v1.14 新增的種類（2.2.1）→ 本工具的種類。2026-10 第二批起代號相同、原樣保留（第一批以前換成最接近的種類，D22）。
 * 讀檔不查這張表（本工具本來就認得這些代號）；留著當作對照與測試的依據。
 */
export const UPSTREAM_ROOM_CATS: Readonly<Record<string, RoomCategory>> = {
  engawa: 'engawa',
  studio: 'studio',
  stone: 'stone',
  roof: 'roof',
  industrial: 'industrial',
  grate: 'grate',
  platform: 'platform',
  track: 'track',
  road: 'road',
  slab: 'slab',
  dirt: 'dirt',
  gravel: 'gravel',
  rooftop: 'rooftop',
  shipdeck: 'shipdeck',
};

export const UPSTREAM_OPENINGS: Readonly<Record<string, OpeningKind>> = {
  steel: 'steel',
  firedoor: 'firedoor',
  gate: 'gate',
  big2: 'big2',
  revolve: 'revolve',
  sealed: 'sealed',
  platewin: 'platewin',
};

export const UPSTREAM_WALLS: Readonly<Record<string, WallKind>> = {
  stone: 'stone',
  sound: 'sound',
  cracked: 'cracked',
};

/**
 * 原作「疊在牆上的素材」（家具）裡換成「牆上的破洞」的：長邊長度 → 破洞的長度（取中間一段）。
 * 牆洞畫的是牆中間被打穿的一個洞（約一半長），崩塌是兩端各留一點牆、中間塌掉。
 */
export const LEGACY_WALL_HOLES: Readonly<Record<string, (len: number) => number>> = {
  wall_hole: (len) => len / 2,
  collapse_wall: (len) => len - 1,
};

export const isLegacyWallHole = (t: string): boolean => Object.hasOwn(LEGACY_WALL_HOLES, t);

export type CompatType = 'room' | 'opening' | 'wall' | 'overlay';

export interface CompatEntry {
  type: CompatType;
  /** 原作的種類代號（房間、門窗、牆：本工具不認得的代號，將來的版本才有的） */
  from: string;
  /** 換成的種類 */
  to: string;
  n: number;
}

/** 讀檔時換掉與略過的東西 */
export interface CompatReport {
  /** 換成最接近的種類（依出現的順序） */
  converted: CompatEntry[];
  /** 本工具沒有而略過的家具（代號 → 件數） */
  droppedItems: { t: string; n: number }[];
  /** 不認得而略過的門窗 */
  droppedOpenings: { kind: string; n: number }[];
  /** 每間房的牆種類是本工具不認得的種類（改回自動）的房間數 */
  roomWalls: number;
}

export function emptyCompatReport(): CompatReport {
  return {
    converted: [],
    droppedItems: [],
    droppedOpenings: [],
    roomWalls: 0,
  };
}

function bump<T extends { n: number }>(list: T[], match: (e: T) => boolean, make: () => T): void {
  const hit = list.find(match);
  if (hit) hit.n++;
  else list.push(make());
}

export const noteConverted = (r: CompatReport, type: CompatType, from: string, to: string) =>
  bump(
    r.converted,
    (e) => e.type === type && e.from === from,
    () => ({ type, from, to, n: 1 }),
  );
export const noteDroppedItem = (r: CompatReport, t: string) =>
  bump(
    r.droppedItems,
    (e) => e.t === t,
    () => ({ t, n: 1 }),
  );
export const noteDroppedOpening = (r: CompatReport, kind: string) =>
  bump(
    r.droppedOpenings,
    (e) => e.kind === kind,
    () => ({ kind, n: 1 }),
  );

export interface CompatCounts {
  /** 換成相近種類的個數 */
  converted: number;
  /** 略過的家具件數 */
  items: number;
  /** 略過的門窗個數 */
  openings: number;
  /** 略過的設定項數 */
  settings: number;
}

const sum = (list: readonly { n: number }[]) => list.reduce((s, e) => s + e.n, 0);

export function compatCounts(r: CompatReport): CompatCounts {
  return {
    converted: sum(r.converted),
    items: sum(r.droppedItems),
    openings: sum(r.droppedOpenings),
    settings: r.roomWalls,
  };
}

export const hasCompatNotes = (r: CompatReport | undefined): r is CompatReport =>
  !!r && Object.values(compatCounts(r)).some((n) => n > 0);

/**
 * 疊在牆上的素材離牆線多遠還算在那條牆上（格）。原作放的時候會吸到牆線，但範本裡有偏 0.05 格的
 * （v1.10／v1.13 的廢工廠）；牆線之間至少隔 0.5 格，取一半以內就不會選錯牆（對等驗證後放寬，規格 7.4）。
 */
export const OVERLAY_REACH = 0.25;

/**
 * 疊在牆上的牆洞、崩塌 → 那條牆上的「牆上的破洞」。
 * 長邊的中心線離牆線 OVERLAY_REACH 格以內時算在那條牆上（有好幾條時取最近的）；取中間一段、對齊 0.25 格，
 * 超出牆段的部分切掉。附近沒有牆、切完不到 0.5 格、和既有的門窗重疊時 null（當作本工具沒有的家具略過）。
 */
export function overlayToHole(
  item: { t: string; x: number; y: number; w: number; h: number; gm?: boolean },
  lines: readonly WallRun[],
  openings: readonly Opening[],
): Opening | null {
  const keep = LEGACY_WALL_HOLES[item.t];
  if (!keep || !(item.w > 0) || !(item.h > 0)) return null;
  const o = item.w >= item.h ? 'h' : 'v';
  const line = o === 'h' ? item.y + item.h / 2 : item.x + item.w / 2;
  const start = o === 'h' ? item.x : item.y;
  const len = o === 'h' ? item.w : item.h;
  const size = Math.max(0.5, keep(len));
  const a = snap(start + (len - size) / 2, 0.25);
  const b = snap(start + (len + size) / 2, 0.25);
  /* 最近的牆線；同一條線上有好幾段（種類不同、被隔開）時取重疊最長的 */
  let best: { d: number; c: number; s: number; e: number } | null = null;
  for (const r of lines) {
    const d = Math.abs(r.c - line);
    if (r.o !== o || d > OVERLAY_REACH + 1e-6) continue;
    const s = Math.max(a, r.a);
    const e = Math.min(b, r.b);
    if (e - s <= 1e-6) continue;
    if (!best || d < best.d - 1e-6 || (d < best.d + 1e-6 && e - s > best.e - best.s))
      best = { d, c: r.c, s, e };
  }
  if (!best || best.e - best.s < 0.5 - 1e-6) return null;
  const { c, s, e } = best;
  const clash = openings.some((op) => {
    if (op.o !== o || Math.abs((op.o === 'h' ? op.y : op.x) - c) > 1e-6) return false;
    const os = op.o === 'h' ? op.x : op.y;
    return os < e - 1e-6 && s < os + op.len - 1e-6;
  });
  if (clash) return null;
  const hole: Opening = {
    id: '',
    kind: 'hole',
    o,
    x: o === 'h' ? s : c,
    y: o === 'h' ? c : s,
    len: Math.round((e - s) * 100) / 100,
    side: 1,
    hinge: 0,
  };
  if (item.gm) hole.gm = true;
  return hole;
}
