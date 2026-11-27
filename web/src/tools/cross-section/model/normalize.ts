/**
 * 讀進來的資料整理成可以用的斷面圖：本站的專案檔（版本 1）與自動儲存（`normalizeDoc`），
 * 以及原作存的作業 JSON（`fromOriginal`；讀得懂的照讀，讀不懂的略過並列出來）。
 *
 * 壞掉的部分一律換成預設值或拿掉，不丟例外；整份認不出來（沒有任何樓層）時回傳 null。
 */
import { isFixtureKind, isRoomUse } from './catalog';
import { baseDoc } from './factory';
import { roomIdsOf } from './layout';
import { clamp, settle, uid } from './ops';
import {
  CAB_STATES,
  type CabState,
  ENV_IDS,
  type EnvId,
  type Fixture,
  type Floor,
  LIMITS,
  MAX_FLOORS,
  type Moment,
  type Note,
  RANGES,
  ROOF_IDS,
  type RoofId,
  type Room,
  type SectionDoc,
  SHAFT_KINDS,
  type Shaft,
  type ShaftKind,
  SKY_IDS,
  type SkyId,
  STYLE_IDS,
  type StyleId,
  WALL_TONES,
  type WallTone,
  WIDTHS,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback: string, max: number): string =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v: unknown, fallback: number, lo: number, hi: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const moment = (v: unknown): Moment | undefined =>
  v === 'before' || v === 'after' ? v : undefined;

/** 建築寬：最接近的可選寬度 */
const snapWidth = (v: number): number =>
  WIDTHS.reduce((best, w) => (Math.abs(w - v) < Math.abs(best - v) ? w : best), 36);

/** id：合法又沒重複就照用，否則換新的 */
const SAFE_ID = /^[\w-]{1,48}$/;

function idPool() {
  const taken = new Set<string>();
  const claim = (id: string) => {
    taken.add(id);
    return id;
  };
  return (v: unknown, prefix: string): string => {
    const given = typeof v === 'string' ? v.trim() : '';
    if (SAFE_ID.test(given) && !taken.has(given)) return claim(given);
    let fresh = uid(prefix);
    while (taken.has(fresh)) fresh = uid(prefix);
    return claim(fresh);
  };
}

interface Draft {
  floors: Floor[];
  shafts: Shaft[];
  items: Fixture[];
  notes: Note[];
}

/* ---------- 本站的專案檔 ---------- */

export function normalizeDoc(raw: unknown): SectionDoc | null {
  if (!isObj(raw) || !isObj(raw.building)) return null;
  const rb = raw.building;
  if (!Array.isArray(rb.floors)) return null;
  const id = idPool();
  const d = baseDoc();
  const width = snapWidth(num(rb.width, 36, 24, 60));
  const floors: Floor[] = [];
  const levels = new Set<number>();
  for (const f of rb.floors) {
    if (!isObj(f) || floors.length >= MAX_FLOORS) continue;
    let level = Math.round(num(f.level, Number.NaN, -20, 20));
    if (!Number.isFinite(level)) continue;
    if (level === 0) level = 1;
    if (levels.has(level)) continue;
    levels.add(level);
    const rooms: Room[] = [];
    for (const r of Array.isArray(f.rooms) ? f.rooms : []) {
      if (!isObj(r)) continue;
      const room: Room = {
        id: id(r.id, 'rm'),
        name: str(r.name, '', LIMITS.name),
        use: isRoomUse(r.use) ? r.use : 'empty',
        wall: oneOf<WallTone>(WALL_TONES, r.wall, 'plaster'),
        secret: r.secret === true,
        hideName: r.hideName === true,
        x0: Math.round(num(r.x0, 0, 0, width)),
        x1: Math.round(num(r.x1, width, 0, width)),
      };
      if (r.open === true) room.open = true;
      rooms.push(room);
    }
    floors.push({ id: id(f.id, 'fl'), level, name: str(f.name, '', LIMITS.name), rooms });
  }
  if (!floors.length) return null;
  const shafts: Shaft[] = [];
  for (const s of Array.isArray(rb.shafts) ? rb.shafts : []) {
    if (!isObj(s)) continue;
    const kind = oneOf<ShaftKind>(SHAFT_KINDS, s.kind, 'elevator');
    shafts.push({
      id: id(s.id, 'sh'),
      kind,
      x: Math.round(num(s.x, 0, 0, width)),
      top: Math.round(num(s.top, 1, -20, 20)),
      bottom: Math.round(num(s.bottom, 1, -20, 20)),
      cab: Math.round(num(s.cab, 1, -20, 20)),
      cabState: oneOf<CabState>(CAB_STATES, s.cabState, 'normal'),
      secret: kind === 'duct' || s.secret === true,
    });
  }
  const roomIds = roomIdsOf(floors);
  const items: Fixture[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!isObj(it) || items.length >= LIMITS.items) continue;
    if (typeof it.room !== 'string' || !roomIds.has(it.room) || !isFixtureKind(it.kind)) continue;
    const f: Fixture = {
      id: id(it.id, 'it'),
      room: it.room,
      kind: it.kind,
      rx: num(it.rx, 0.5, RANGES.rx.min, RANGES.rx.max),
      ry: num(it.ry, 0.44, RANGES.ry.min, RANGES.ry.max),
      scale: num(it.scale, 1, RANGES.scale.min, RANGES.scale.max),
      flip: it.flip === true,
    };
    const only = moment(it.only);
    if (only) f.only = only;
    if (it.upset === true) f.upset = true;
    if (it.smashed === true) f.smashed = true;
    if (it.secret === true) f.secret = true;
    if (typeof it.variant === 'string' && it.variant) f.variant = it.variant.slice(0, 16);
    items.push(f);
  }
  const notes: Note[] = [];
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    if (!isObj(n) || notes.length >= LIMITS.notes) continue;
    const room = typeof n.room === 'string' && roomIds.has(n.room) ? n.room : null;
    const note: Note = {
      id: id(n.id, 'nt'),
      text: str(n.text, '', LIMITS.note),
      style: n.style === 'badge' ? 'badge' : 'box',
      size: num(n.size, RANGES.noteSize.def, RANGES.noteSize.min, RANGES.noteSize.max),
      room,
      rx: num(n.rx, 0.5, 0.02, 0.98),
      ry: num(n.ry, 0.5, 0.02, 0.98),
      x: num(n.x, 0, -200, 400),
      y: num(n.y, 0, -200, 400),
    };
    const only = moment(n.only);
    if (only) note.only = only;
    if (n.secret === true) note.secret = true;
    notes.push(note);
  }
  return finish(d, raw, { floors, shafts, items, notes }, width);
}

function finish(d: SectionDoc, raw: Obj, draft: Draft, width: number): SectionDoc {
  const rb = isObj(raw.building) ? raw.building : {};
  d.title = str(raw.title, d.title, LIMITS.title);
  d.subtitle = str(raw.subtitle, d.subtitle, LIMITS.subtitle);
  d.style = oneOf<StyleId>(STYLE_IDS, raw.style, 'color');
  d.env = oneOf<EnvId>(ENV_IDS, raw.env, 'day');
  d.sky = oneOf<SkyId>(SKY_IDS, raw.sky, 'clear');
  d.flood = raw.flood === true;
  d.floodLevel = Math.round(num(raw.floodLevel, 0, 0, 100));
  d.wear = Math.round(num(raw.wear, 18, 0, 100));
  d.seed = Math.round(num(raw.seed, d.seed, 0, 999_999_999));
  for (const key of ['grid', 'labels', 'elevation', 'frame'] as const)
    d[key] = raw[key] === undefined ? true : raw[key] === true;
  d.building = {
    width,
    storey: num(rb.storey, 6, 5, 6) < 5.5 ? 5 : 6,
    roof: oneOf<RoofId>(ROOF_IDS, rb.roof, 'flat'),
    rooftop: rb.rooftop === undefined ? true : rb.rooftop === true,
    floors: draft.floors,
    shafts: draft.shafts,
  };
  d.items = draft.items;
  d.notes = draft.notes;
  if (raw.train !== undefined) d.train = raw.train;
  if (raw.ccfolia !== undefined) d.ccfolia = raw.ccfolia;
  settle(d);
  return d;
}

/* ---------- 原作的作業 JSON ---------- */

export const ORIGINAL_FORMAT = 'kiin-cross-section-studio';

export class OriginalFileError extends Error {}

/** 讀了但沒有用到的部分（讀完通知用；縱向的作業檔裡原作預設的車廂不算） */
export interface OriginalSkipped {
  /** 列車專用的設備（第二批）與認不出來的設備 */
  items: number;
  /** 車廂裡的備註 */
  notes: number;
  /** 超過 12 層、重複的樓層 */
  floors: number;
  /** 建築寬換成最接近的可選寬度（原本的寬） */
  width: number | null;
}

const ORIG_ROOF: Record<string, RoofId> = {
  modern: 'flat',
  pitched: 'gable',
  industrial: 'sawtooth',
};
const ORIG_SKY: Record<string, SkyId> = {
  day: 'clear',
  dusk: 'dusk',
  rain: 'rain',
  storm: 'storm',
};
const ORIG_SHAFT: Record<string, ShaftKind> = {
  elevator: 'elevator',
  'stairs-switchback': 'switchback',
  'stairs-straight': 'stairs',
  ladder: 'ladder',
  'vent-duct': 'duct',
};
const ORIG_CAB: Record<string, CabState> = {
  normal: 'normal',
  broken: 'fallsAfter',
  fallen: 'fallen',
};
const ORIG_USE: Record<string, Room['use']> = {
  lobby: 'lobby',
  office: 'office',
  biolab: 'lab',
  surgery: 'surgery',
  control: 'control',
  isolation: 'cell',
  bedroom: 'ward',
  archives: 'library',
  boiler: 'machine',
  storage: 'storage',
  altar: 'ritual',
  empty: 'empty',
};
/** 原作的設備 → 本站的種類（列車專用的 6 種沒有對應） */
const ORIG_KIND: Record<string, string> = {
  'bio-tank': 'tank',
  console: 'console',
  'operating-table': 'surgery',
  'lab-bench': 'bench',
  'hospital-bed': 'bed',
  bookshelf: 'shelf',
  'desk-chair': 'desk',
  'reception-desk': 'counter',
  'safe-locker': 'locker',
  boiler: 'boiler',
  pipes: 'pipes',
  crates: 'crates',
  altar: 'altar',
  'ceiling-light': 'lamp',
  cctv: 'camera',
  'exit-sign': 'exit',
  'door-single': 'door',
  'door-bulkhead': 'blastdoor',
  'door-bars': 'bars',
  'window-framed': 'window',
  'hatch-ladder': 'hatch',
  'blood-wall': 'bloodwall',
  'blood-floor': 'bloodpool',
  'chalk-outline': 'chalk',
  'toppled-furniture': 'upset',
  barricade: 'boards',
  'broken-glass': 'glass',
  'electric-spark': 'spark',
  'talisman-seal': 'talisman',
  'fire-rubble': 'rubble',
};
const ORIG_VARIANT: Record<string, Record<string, string>> = {
  boiler: { electric: 'electric' },
  bench: { galley: 'kitchen' },
};

/** 看起來是原作的作業檔嗎（有 format 標記，或有原作格式的樓層） */
export function isOriginalFile(raw: unknown): raw is Obj {
  if (!isObj(raw)) return false;
  if (raw.format === ORIGINAL_FORMAT) return true;
  if (raw.format !== undefined) return false;
  const b = raw.building;
  return (
    isObj(b) &&
    Array.isArray(b.floors) &&
    b.floors.some(
      (f) => isObj(f) && typeof f.level === 'number' && Array.isArray(f.rooms) && 'widthCells' in b,
    )
  );
}

export function fromOriginal(raw: Obj): { doc: SectionDoc; skipped: OriginalSkipped } {
  if (raw.mode === 'horizontal') throw new OriginalFileError('train');
  const rb = isObj(raw.building) ? raw.building : null;
  if (!rb || !Array.isArray(rb.floors)) throw new OriginalFileError('empty');
  const id = idPool();
  const rawWidth = Math.round(num(rb.widthCells, 36, 24, 60));
  const width = snapWidth(rawWidth);
  const skipped: OriginalSkipped = {
    items: 0,
    notes: 0,
    floors: 0,
    width: width === rawWidth ? null : rawWidth,
  };
  const floors: Floor[] = [];
  const levels = new Set<number>();
  const roomIds = new Map<string, string>();
  for (const f of rb.floors) {
    if (!isObj(f) || !Array.isArray(f.rooms) || typeof f.level !== 'number') continue;
    let level = Math.round(num(f.level, 1, -20, 20));
    if (level === 0) level = 1;
    if (levels.has(level) || floors.length >= MAX_FLOORS) {
      skipped.floors++;
      continue;
    }
    levels.add(level);
    const rooms: Room[] = [];
    for (const r of f.rooms) {
      if (!isObj(r)) continue;
      const rid = id(r.id, 'rm');
      if (typeof r.id === 'string') roomIds.set(r.id, rid);
      const room: Room = {
        id: rid,
        name: str(r.name, '', LIMITS.name),
        use: ORIG_USE[String(r.preset)] ?? 'empty',
        wall: oneOf<WallTone>(WALL_TONES, r.wallTone, 'plaster'),
        secret: r.secret === true,
        hideName: r.labelPrivate === true,
        x0: Math.round(num(r.x0, 0, 0, rawWidth)),
        x1: Math.round(num(r.x1, rawWidth, 0, rawWidth)),
      };
      if (r.startOpen === true) room.open = true;
      rooms.push(room);
    }
    floors.push({ id: id(f.id, 'fl'), level, name: str(f.label, '', LIMITS.name), rooms });
  }
  if (!floors.length) throw new OriginalFileError('empty');
  /* 寬換掉時，區域的左右照比例縮放（之後 settle 排成整數格） */
  if (skipped.width !== null)
    for (const f of floors)
      for (const r of f.rooms) {
        r.x0 = Math.round((r.x0 * width) / rawWidth);
        r.x1 = Math.round((r.x1 * width) / rawWidth);
      }
  const shafts: Shaft[] = [];
  for (const s of Array.isArray(rb.shafts) ? rb.shafts : []) {
    if (!isObj(s)) continue;
    const kind = ORIG_SHAFT[String(s.type)] ?? 'elevator';
    const x = num(s.xCell, 0, 0, rawWidth);
    shafts.push({
      id: id(s.id, 'sh'),
      kind,
      x: Math.round(skipped.width !== null ? (x * width) / rawWidth : x),
      top: Math.round(num(s.fromLevel, 1, -20, 20)),
      bottom: Math.round(num(s.toLevel, -1, -20, 20)),
      cab: Math.round(num(s.cabLevel, 1, -20, 20)),
      cabState: ORIG_CAB[String(s.cabState)] ?? 'normal',
      secret: kind === 'duct' || s.secret === true,
    });
  }
  const items: Fixture[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!isObj(it)) continue;
    if (it.mode === 'horizontal') {
      skipped.items++;
      continue;
    }
    const room = roomIds.get(String(it.roomId));
    const kind = ORIG_KIND[String(it.asset)];
    if (!room || !kind || items.length >= LIMITS.items) {
      skipped.items++;
      continue;
    }
    const f: Fixture = {
      id: id(it.id, 'it'),
      room,
      kind,
      rx: num(it.rx, 0.5, RANGES.rx.min, RANGES.rx.max),
      ry: num(it.ry, 0.44, RANGES.ry.min, RANGES.ry.max),
      scale: num(it.scale, 1, RANGES.scale.min, RANGES.scale.max),
      flip: it.flip === true,
    };
    const only = moment(it.phase);
    if (only) f.only = only;
    if (it.toppled === true) f.upset = true;
    if (it.brokenAfter === true) f.smashed = true;
    if (it.secret === true) f.secret = true;
    const variant = ORIG_VARIANT[kind]?.[String(it.variant)];
    if (variant) f.variant = variant;
    items.push(f);
  }
  const notes: Note[] = [];
  for (const n of Array.isArray(raw.annotations) ? raw.annotations : []) {
    if (!isObj(n)) continue;
    if (n.mode === 'horizontal' || notes.length >= LIMITS.notes) {
      skipped.notes++;
      continue;
    }
    const room = typeof n.roomId === 'string' ? (roomIds.get(n.roomId) ?? null) : null;
    const note: Note = {
      id: id(n.id, 'nt'),
      text: str(n.text, '', LIMITS.note),
      style: n.variant === 'badge' ? 'badge' : 'box',
      size: num(n.size, RANGES.noteSize.def, RANGES.noteSize.min, RANGES.noteSize.max),
      room,
      rx: num(n.rx, 0.5, 0.02, 0.98),
      ry: num(n.ry, 0.5, 0.02, 0.98),
      x: num(n.x, 0, -200, 400),
      y: num(n.y, 0, -200, 400),
    };
    const only = moment(n.phase);
    if (only) note.only = only;
    if (n.secret === true) note.secret = true;
    notes.push(note);
  }
  const doc = finish(
    baseDoc(),
    {
      title: raw.title,
      subtitle: raw.subtitle,
      style: raw.style,
      env: raw.environment,
      sky: ORIG_SKY[String(raw.skyTheme)],
      flood: raw.floodEnabled,
      floodLevel: raw.floodLevel,
      wear: raw.age,
      seed: raw.seed,
      grid: raw.showGrid,
      labels: raw.showLabels,
      elevation: raw.showElevation,
      frame: raw.showFrame,
      building: {
        storey: rb.floorHeightCells,
        roof: ORIG_ROOF[String(rb.roofStyle)],
        rooftop: rb.hasRoof,
      },
    },
    { floors, shafts, items, notes },
    width,
  );
  return { doc, skipped };
}
