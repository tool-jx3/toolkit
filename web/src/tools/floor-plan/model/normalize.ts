/**
 * 讀進來的資料整理成可以用的專案（自動存檔、專案檔、原作的 .trpgmap.json 共用）：
 * 只留認得的欄位、數值不是數字的丟掉、範圍外的夾回來、不認得的種類換成預設值。
 */
import { formatHex, parseColor } from '@/core/color';
import { isCategory, isOpeningKind, isSizeMode, isThemeId, isWallKind } from './catalog';
import { clamp, emptyFloor, uid } from './geometry';
import type { Floor, Item, Opening, Project, Room, TextLabel, Wall } from './types';

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

function room(r: Record<string, unknown>): Room | null {
  const w = Math.round(num(r.w, 0));
  const h = Math.round(num(r.h, 0));
  if (w < 1 || h < 1 || !isNum(r.x) || !isNum(r.y)) return null;
  return compact<Room>({
    id: str(r.id),
    x: Math.round(num(r.x)),
    y: Math.round(num(r.y)),
    w,
    h,
    name: str(r.name).slice(0, 200),
    cat: isCategory(r.cat) ? r.cat : 'living',
    plName: optStr(r.plName, 200),
    note: optStr(r.note),
    color: color(r.color),
    gm: flag(r.gm),
    hideLabel: flag(r.hideLabel),
    noWall: flag(r.noWall),
    locked: flag(r.locked),
    lx: isNum(r.lx) && num(r.lx) !== 0 ? num(r.lx) : undefined,
    ly: isNum(r.ly) && num(r.ly) !== 0 ? num(r.ly) : undefined,
  });
}

function wall(w: Record<string, unknown>): Wall | null {
  if (!['x1', 'y1', 'x2', 'y2'].every((k) => isNum(w[k]))) return null;
  return compact<Wall>({
    id: str(w.id),
    x1: num(w.x1),
    y1: num(w.y1),
    x2: num(w.x2),
    y2: num(w.y2),
    kind: isWallKind(w.kind) ? w.kind : 'int',
    gm: flag(w.gm),
  });
}

function opening(o: Record<string, unknown>): Opening | null {
  if (!isOpeningKind(o.kind) || (o.o !== 'h' && o.o !== 'v') || !(num(o.len) > 0)) return null;
  if (!isNum(o.x) || !isNum(o.y)) return null;
  return compact<Opening>({
    id: str(o.id),
    kind: o.kind,
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
  let dropped = 0;
  const floors: Floor[] = list(p.floors).map((f) => {
    const items: Item[] = [];
    for (const i of list(f.items)) {
      const it = item(i, isAsset);
      if (it) items.push(it);
      else if (typeof i.t === 'string' && !isAsset(i.t)) dropped++;
    }
    return {
      id: str(f.id) || uid('f'),
      name: str(f.name).slice(0, 60),
      rooms: ids(
        list(f.rooms)
          .map(room)
          .filter((x): x is Room => !!x),
        'r',
      ),
      walls: ids(
        list(f.walls)
          .map(wall)
          .filter((x): x is Wall => !!x),
        'w',
      ),
      openings: ids(
        list(f.openings)
          .map(opening)
          .filter((x): x is Opening => !!x),
        'o',
      ),
      items: ids(items, 'i'),
      texts: ids(
        list(f.texts)
          .map(text)
          .filter((x): x is TextLabel => !!x),
        't',
      ),
    };
  });
  ids(floors, 'f');
  if (report) report.droppedItems = dropped;
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
  return out;
}

/** 原作（TRPG 室內圖メーカー）存的檔案：`app: 'indoor-map-maker'` 或至少有 floors 陣列 */
export function isLegacyMapFile(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as Record<string, unknown>;
  return p.app === 'indoor-map-maker' || (Array.isArray(p.floors) && !('format' in p));
}
