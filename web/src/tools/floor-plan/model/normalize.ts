/**
 * 讀進來的資料整理成可以用的專案（自動存檔、專案檔、原作的 .trpgmap.json 共用）：
 * 只留認得的欄位、數值不是數字的丟掉、範圍外的夾回來、不認得的種類換成預設值。
 * 原作新版（v1.05～v1.15）的房間、門窗、牆種類、每間房的牆種類、外觀層的「顯示內部」照讀（2026-10 第二批），
 * 家具（含疊在牆上的素材）也照讀（2026-10 第三批）；不認得的種類（將來的版本才有的）換成預設值或略過，
 * 都記在 report.compat（compat.ts）。
 */
import { formatHex, parseColor } from '@/core/color';
import {
  isCategory,
  isOpeningKind,
  isSizeMode,
  isThemeId,
  isTokenGridSize,
  isWallKind,
  TOKEN_GRID_OPACITY,
  TOKEN_GRID_OPACITY_MIN,
  WEAR_MIN,
  WEAR_SEEDS,
} from './catalog';
import {
  type CompatReport,
  emptyCompatReport,
  noteConverted,
  noteDroppedItem,
  noteDroppedOpening,
} from './compat';
import { clamp, emptyFloor, uid } from './geometry';
import { isCorner, validCut } from './shape';
import type {
  Floor,
  Item,
  Opening,
  OpeningKind,
  Project,
  Room,
  RoomCategory,
  RoomCut,
  TextLabel,
  Wall,
  WallKind,
} from './types';

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};
const isNum = (v: unknown) => Number.isFinite(num(v, Number.NaN));
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    : [];
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const optStr = (v: unknown, max = 4000): string | undefined =>
  typeof v === 'string' && v !== '' ? v.slice(0, max) : undefined;
const color = (v: unknown): string | undefined => {
  const c = typeof v === 'string' && v ? parseColor(v) : null;
  return c ? formatHex(c, c.a < 1) : undefined;
};
const flag = (v: unknown): true | undefined => (v === true ? true : undefined);

/** undefined 的欄位拿掉（存檔小一點、比較時穩定） */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

export interface NormalizeReport {
  /** 家具種類不認得而丟掉的個數 */
  droppedItems: number;
  /** 換成最接近的種類、略過的東西（2026-10；normalizeProject 填入） */
  compat?: CompatReport;
}

/**
 * 不認得的種類（將來的版本才有的）：房間換成客廳類、牆換成內牆、門窗丟掉；有寫種類代號時記下來。
 * 原作 v1.05～v1.15 新增的種類本工具都有（2026-10 第二批），照讀。
 */
function roomCat(v: unknown, report: CompatReport): RoomCategory {
  if (isCategory(v)) return v;
  if (typeof v !== 'string' || !v) return 'living';
  noteConverted(report, 'room', v, 'living');
  return 'living';
}

function wallKind(v: unknown, report: CompatReport): WallKind {
  if (isWallKind(v)) return v;
  if (typeof v !== 'string' || !v) return 'int';
  noteConverted(report, 'wall', v, 'int');
  return 'int';
}

function openingKind(v: unknown, report: CompatReport): OpeningKind | null {
  if (isOpeningKind(v)) return v;
  if (typeof v !== 'string' || !v) return null;
  noteDroppedOpening(report, v);
  return null;
}

/** 每間房的牆種類（原作 v1.05 的 `wall`）：認得的照讀（戶外房間也留著，只是沒有作用）；不認得的改回自動並記下來 */
function roomWall(v: unknown, report: CompatReport): WallKind | undefined {
  if (isWallKind(v)) return v;
  if (typeof v === 'string' && v) report.roomWalls++;
  return undefined;
}

/** L 形的缺角（2026-10-29）：角認得、寬深是整數而且 1～外框減 1 才留著，不然當成長方形 */
function roomCut(v: unknown, w: number, h: number): RoomCut | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Record<string, unknown>;
  if (!isCorner(c.c)) return undefined;
  const cut: RoomCut = { c: c.c, w: Math.round(num(c.w, 0)), h: Math.round(num(c.h, 0)) };
  return validCut({ w, h }, cut) ? cut : undefined;
}

/** 每一類的 id 不重複（重複或沒有的給新的） */
function ids<T extends { id: string }>(arr: T[], prefix: string): T[] {
  const seen = new Set<string>();
  for (const o of arr) {
    if (!o.id || seen.has(o.id)) o.id = uid(prefix);
    seen.add(o.id);
  }
  return arr;
}

function room(r: Record<string, unknown>, report: CompatReport): Room | null {
  const w = Math.round(num(r.w, 0));
  const h = Math.round(num(r.h, 0));
  if (w < 1 || h < 1 || !isNum(r.x) || !isNum(r.y)) return null;
  const cat = roomCat(r.cat, report);
  return compact<Room>({
    id: str(r.id),
    x: Math.round(num(r.x)),
    y: Math.round(num(r.y)),
    w,
    h,
    name: str(r.name).slice(0, 200),
    cat,
    plName: optStr(r.plName, 200),
    note: optStr(r.note),
    color: color(r.color),
    gm: flag(r.gm),
    hideLabel: flag(r.hideLabel),
    noWall: flag(r.noWall),
    locked: flag(r.locked),
    lx: isNum(r.lx) && num(r.lx) !== 0 ? num(r.lx) : undefined,
    ly: isNum(r.ly) && num(r.ly) !== 0 ? num(r.ly) : undefined,
    wall: roomWall(r.wall, report),
    cut: roomCut(r.cut, w, h),
  });
}

function wall(w: Record<string, unknown>, report: CompatReport): Wall | null {
  if (!['x1', 'y1', 'x2', 'y2'].every((k) => isNum(w[k]))) return null;
  return compact<Wall>({
    id: str(w.id),
    x1: num(w.x1),
    y1: num(w.y1),
    x2: num(w.x2),
    y2: num(w.y2),
    kind: wallKind(w.kind, report),
    gm: flag(w.gm),
  });
}

function opening(o: Record<string, unknown>, report: CompatReport): Opening | null {
  if ((o.o !== 'h' && o.o !== 'v') || !(num(o.len) > 0)) return null;
  if (!isNum(o.x) || !isNum(o.y)) return null;
  const kind = openingKind(o.kind, report);
  if (!kind) return null;
  return compact<Opening>({
    id: str(o.id),
    kind,
    o: o.o,
    x: num(o.x),
    y: num(o.y),
    len: num(o.len, 1),
    side: num(o.side) === -1 ? -1 : 1,
    hinge: o.hinge ? 1 : 0,
    gm: flag(o.gm),
  });
}

function item(i: Record<string, unknown>, isAsset: (t: string) => boolean): Item | null {
  if (typeof i.t !== 'string' || !isAsset(i.t)) return null;
  if (!(num(i.w) > 0) || !(num(i.h) > 0) || !isNum(i.x) || !isNum(i.y)) return null;
  const rot = num(i.rot);
  return compact<Item>({
    id: str(i.id),
    t: i.t,
    x: num(i.x),
    y: num(i.y),
    w: num(i.w),
    h: num(i.h),
    rot: [0, 90, 180, 270].includes(rot) ? rot : 0,
    flip: flag(i.flip),
    label: optStr(i.label, 200),
    color: color(i.color),
    gm: flag(i.gm),
    clue: flag(i.clue),
  });
}

function text(t: Record<string, unknown>): TextLabel | null {
  if (typeof t.text !== 'string' || !isNum(t.x) || !isNum(t.y)) return null;
  return compact<TextLabel>({
    id: str(t.id),
    x: num(t.x),
    y: num(t.y),
    text: t.text.slice(0, 2000),
    size: isNum(t.size) ? clamp(num(t.size), 0.3, 4) : undefined,
    bold: t.bold === false ? false : undefined,
    color: color(t.color),
    gm: flag(t.gm),
    clue: flag(t.clue),
    badge: flag(t.badge),
  });
}

/**
 * 整理專案資料；不是專案（沒有 floors 陣列）時 null。
 * 原作的 .trpgmap.json 也走這裡：欄位相同，面積顯示的「帖」換成「坪」。
 */
export function normalizeProject(
  raw: unknown,
  isAsset: (t: string) => boolean,
  report?: NormalizeReport,
): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.floors)) return null;
  const compat = emptyCompatReport();
  let dropped = 0;
  const floors: Floor[] = list(p.floors).map((f) => {
    const items: Item[] = [];
    for (const i of list(f.items)) {
      const it = item(i, isAsset);
      if (it) items.push(it);
      else if (typeof i.t === 'string' && !isAsset(i.t)) {
        dropped++;
        noteDroppedItem(compat, i.t);
      }
    }
    const floor: Floor = {
      id: str(f.id) || uid('f'),
      name: str(f.name).slice(0, 60),
      rooms: ids(
        list(f.rooms)
          .map((r) => room(r, compat))
          .filter((x): x is Room => !!x),
        'r',
      ),
      walls: ids(
        list(f.walls)
          .map((w) => wall(w, compat))
          .filter((x): x is Wall => !!x),
        'w',
      ),
      openings: list(f.openings)
        .map((o) => opening(o, compat))
        .filter((x): x is Opening => !!x),
      items: ids(items, 'i'),
      texts: ids(
        list(f.texts)
          .map(text)
          .filter((x): x is TextLabel => !!x),
        't',
      ),
    };
    ids(floor.openings, 'o');
    /* 外觀層的「顯示內部」（原作 v1.12；2026-10 第二批起照讀）：疊上來的樓層的 id 在下面樓層的 id 確定之後檢查 */
    if (f.showInside === true) floor.showInside = true;
    const inside = optStr(f.inside, 200);
    if (inside) floor.inside = inside;
    return floor;
  });
  ids(floors, 'f');
  /* 「顯示內部」：只有一層時沒有作用，拿掉；疊上來的樓層不存在（或是自己）時拿掉（用第一個別的樓層） */
  for (const f of floors) {
    if (f.showInside && floors.length < 2) delete f.showInside;
    if (f.inside !== undefined && !floors.some((o) => o !== f && o.id === f.inside))
      delete f.inside;
  }
  if (report) {
    report.droppedItems = dropped;
    report.compat = compat;
  }
  const showSize = p.showSize === 'jo' ? 'ping' : p.showSize;
  const out: Project = {
    name: str(p.name).slice(0, 120),
    theme: isThemeId(p.theme) ? p.theme : 'clean',
    showSize: isSizeMode(showSize) ? showSize : 'none',
    showNames: p.showNames !== false,
    floors: floors.length ? floors : [emptyFloor('1F')],
    active: 0,
  };
  out.active = clamp(Math.round(num(p.active)), 0, out.floors.length - 1);
  /* 棋子方格（2026-10；原作 v1.07 的 tokenGrid 也是這個欄位，0＝不顯示）：大小只認 1／2／3／4／6 格 */
  const tokenGrid = num(p.tokenGrid, 0);
  if (isTokenGridSize(tokenGrid)) out.tokenGrid = tokenGrid;
  const tokenColor = color(p.tokenGridColor)?.slice(0, 7);
  if (tokenColor) out.tokenGridColor = tokenColor;
  if (isNum(p.tokenGridOpacity)) {
    const o = Math.round(clamp(num(p.tokenGridOpacity), TOKEN_GRID_OPACITY_MIN, 1) * 100) / 100;
    if (o !== TOKEN_GRID_OPACITY) out.tokenGridOpacity = o;
  }
  /* 2026-10-29（參考 KIIN）：紙的污漬與摺痕、座標標示、家具不跟著房間（都只在有設定時寫） */
  /* 0 以下＝關（不寫這個欄位）；0～0.1 的夾到 0.1、超過 1 的夾到 1（2026-10-29 驗證後修訂：原本 0 也變成 0.1） */
  if (isNum(p.wear) && num(p.wear) > 0)
    out.wear = Math.round(clamp(num(p.wear), WEAR_MIN, 1) * 100) / 100;
  if (isNum(p.wearSeed)) out.wearSeed = Math.abs(Math.round(num(p.wearSeed))) % WEAR_SEEDS;
  if (p.coords === true) out.coords = true;
  if (p.fixedFurniture === true) out.fixedFurniture = true;
  return out;
}

/** 原作（TRPG 室內圖メーカー）存的檔案：`app: 'indoor-map-maker'` 或至少有 floors 陣列 */
export function isLegacyMapFile(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as Record<string, unknown>;
  return p.app === 'indoor-map-maker' || (Array.isArray(p.floors) && !('format' in p));
}
