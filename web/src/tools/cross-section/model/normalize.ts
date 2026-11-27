/**
 * 讀進來的資料整理成可以用的斷面圖：本站的專案檔（版本 1）與自動儲存（`normalizeDoc`），
 * 以及原作存的作業 JSON（`fromOriginal`；讀得懂的照讀，讀不懂的略過並列出來）。
 *
 * 壞掉的部分一律換成預設值或拿掉，不丟例外；整份認不出來（沒有任何樓層）時回傳 null。
 */

import { S } from '../strings';
import { isFixtureKind, isRoomUse } from './catalog';
import { blankDoc, emptyDoc } from './factory';
import { roomIdsOf } from './layout';
import { clamp, settle, uid } from './ops';
import { underId } from './trainLayout';
import { settleTrain } from './trainOps';
import {
  ARRANGES,
  type Arrange,
  CAB_STATES,
  CAPS,
  CAR_TYPES,
  CAR_W,
  type CabState,
  type Car,
  type CarRoom,
  type CarType,
  COUPLERS,
  type Coupler,
  ENV_IDS,
  type EnvId,
  type Fixture,
  type Floor,
  LOCO_KINDS,
  type LocoKind,
  MAX_CARS,
  MAX_FLOORS,
  type Moment,
  type Note,
  RANGES,
  ROOF_IDS,
  type RoofId,
  type Room,
  SCENERIES,
  type Scenery,
  type SectionDoc,
  SHAFT_KINDS,
  type Shaft,
  type ShaftKind,
  SKY_IDS,
  type SkyId,
  STYLE_IDS,
  type StyleId,
  type Train,
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

type Pool = ReturnType<typeof idPool>;

/** 設備（本站的格式）：指到不存在的區域、認不出來的種類拿掉 */
function readItems(list: unknown, roomIds: ReadonlySet<string>, id: Pool): Fixture[] {
  const items: Fixture[] = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!isObj(it) || items.length >= CAPS.items) continue;
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
  return items;
}

/** 備註（本站的格式）：指到不存在的區域的改成區域外 */
function readNotes(list: unknown, roomIds: ReadonlySet<string>, id: Pool): Note[] {
  const notes: Note[] = [];
  for (const n of Array.isArray(list) ? list : []) {
    if (!isObj(n) || notes.length >= CAPS.notes) continue;
    const room = typeof n.room === 'string' && roomIds.has(n.room) ? n.room : null;
    const note: Note = {
      id: id(n.id, 'nt'),
      text: str(n.text, '', CAPS.note),
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
  return notes;
}

const ROLES = ['cab', 'engine', 'deck'] as const;

/** 列車（本站的格式）：車廂認不出來或一節都沒有時回傳 undefined */
function normalizeTrain(raw: unknown, id: Pool): Train | undefined {
  if (!isObj(raw) || !Array.isArray(raw.cars)) return undefined;
  const cars: Car[] = [];
  for (const c of raw.cars) {
    if (!isObj(c) || cars.length >= MAX_CARS) continue;
    const type = oneOf<CarType>(CAR_TYPES, c.type, 'coach');
    const rooms: CarRoom[] = [];
    for (const r of Array.isArray(c.rooms) ? c.rooms : []) {
      if (!isObj(r)) continue;
      const room: CarRoom = {
        id: id(r.id, 'cr'),
        name: str(r.name, '', CAPS.name),
        wall: oneOf<WallTone>(WALL_TONES, r.wall, 'wood'),
        secret: r.secret === true,
        hideName: r.hideName === true,
        x0: Math.round(num(r.x0, 0, 0, CAR_W)),
        x1: Math.round(num(r.x1, CAR_W, 0, CAR_W)),
      };
      if (r.open === true) room.open = true;
      if (ROLES.includes(r.role as (typeof ROLES)[number])) room.role = r.role as CarRoom['role'];
      rooms.push(room);
    }
    cars.push({
      id: id(c.id, 'car'),
      type,
      name: str(c.name, S.cars[type], CAPS.name),
      rooms,
      coupler: oneOf<Coupler>(COUPLERS, c.coupler, 'normal'),
      hatch: c.hatch === undefined ? type !== 'loco' : c.hatch === true,
      under: c.under === true && type !== 'loco',
      underName: str(c.underName, S.train.underName, CAPS.name),
    });
  }
  if (!cars.length) return undefined;
  const roomIds = new Set(cars.flatMap((c) => c.rooms.map((r) => r.id)));
  const boxIds = new Set([...roomIds, ...cars.filter((c) => c.under).map((c) => underId(c.id))]);
  const t: Train = {
    arrange: oneOf<Arrange>(ARRANGES, raw.arrange, 'auto'),
    loco: oneOf<LocoKind>(LOCO_KINDS, raw.loco, 'steam'),
    scenery: oneOf<Scenery>(SCENERIES, raw.scenery, 'starlit'),
    roofRoute: raw.roofRoute === undefined ? true : raw.roofRoute === true,
    cars,
    items: readItems(raw.items, roomIds, id),
    notes: readNotes(raw.notes, boxIds, id),
  };
  settleTrain(t);
  return t;
}

export function normalizeDoc(raw: unknown): SectionDoc | null {
  if (!isObj(raw) || !isObj(raw.building)) return null;
  const rb = raw.building;
  if (!Array.isArray(rb.floors)) return null;
  const id = idPool();
  const d = emptyDoc();
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
        name: str(r.name, '', CAPS.name),
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
    floors.push({ id: id(f.id, 'fl'), level, name: str(f.name, '', CAPS.name), rooms });
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
  /* 區域的 id 先全部認領（建築、車廂），之後才是設備與備註 */
  const train = normalizeTrain(raw.train, id);
  const items = readItems(raw.items, roomIds, id);
  const notes = readNotes(raw.notes, roomIds, id);
  if (train) d.train = train;
  if (raw.mode === 'train' && train) d.mode = 'train';
  return finish(d, raw, { floors, shafts, items, notes }, width);
}

function finish(d: SectionDoc, raw: Obj, draft: Draft, width: number): SectionDoc {
  const rb = isObj(raw.building) ? raw.building : {};
  d.title = str(raw.title, d.title, CAPS.title);
  d.subtitle = str(raw.subtitle, d.subtitle, CAPS.subtitle);
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
  if (raw.ccfolia !== undefined) d.ccfolia = raw.ccfolia;
  settle(d);
  return d;
}

/* ---------- 原作的作業 JSON ---------- */

export const ORIGINAL_FORMAT = 'kiin-cross-section-studio';

export class OriginalFileError extends Error {}

/** 讀了但沒有用到的部分（讀完通知用；縱向的作業檔裡原作預設的車廂不算） */
export interface OriginalSkipped {
  /** 認不出來的設備（2026-11-27 第二批起列車專用的 6 種與車廂裡的設備都讀） */
  items: number;
  /** 超過上限的備註（2026-11-27 第二批起車廂裡的備註也讀） */
  notes: number;
  /** 超過 12 層、重複的樓層 */
  floors: number;
  /** 沒讀進來的樓層裡的設備、備註（和上面的分開算） */
  floorItems: number;
  floorNotes: number;
  /** 建築寬換成最接近的可選寬度（原本的寬） */
  width: number | null;
  /** 超過 10 節的車廂 */
  cars: number;
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
/** 原作的設備 → 本站的種類（2026-11-27 第二批加列車專用的 6 種） */
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
  'loco-console': 'cabdesk',
  'dining-table': 'diner',
  'sleeper-berth': 'bunk',
  'lounge-sofa': 'settee',
  'luggage-stack': 'luggage',
  'cargo-container': 'freight',
};
const ORIG_VARIANT: Record<string, Record<string, string>> = {
  boiler: { electric: 'electric' },
  bench: { galley: 'kitchen' },
  cabdesk: { electric: 'electric' },
  diner: { coach: 'coach' },
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
  /* 橫向車廂的檔（第二批）：列車一定要讀得到；建築讀得到就讀，讀不到換成空白的建築 */
  const horizontal = raw.mode === 'horizontal';
  const rb = isObj(raw.building) ? raw.building : {};
  if (!horizontal && !Array.isArray(rb.floors)) throw new OriginalFileError('empty');
  const id = idPool();
  const rawWidth = Math.round(num(rb.widthCells, 36, 24, 60));
  const width = snapWidth(rawWidth);
  const skipped: OriginalSkipped = {
    items: 0,
    notes: 0,
    floors: 0,
    floorItems: 0,
    floorNotes: 0,
    width: width === rawWidth ? null : rawWidth,
    cars: 0,
  };
  const floors: Floor[] = [];
  const levels = new Set<number>();
  const roomIds = new Map<string, string>();
  /** 沒讀進來的樓層的區域（原作的 id） */
  const droppedRooms = new Set<string>();
  for (const f of Array.isArray(rb.floors) ? rb.floors : []) {
    if (!isObj(f) || !Array.isArray(f.rooms) || typeof f.level !== 'number') continue;
    let level = Math.round(num(f.level, 1, -20, 20));
    if (level === 0) level = 1;
    if (levels.has(level) || floors.length >= MAX_FLOORS) {
      skipped.floors++;
      for (const r of f.rooms) if (isObj(r) && typeof r.id === 'string') droppedRooms.add(r.id);
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
        name: str(r.name, '', CAPS.name),
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
    floors.push({ id: id(f.id, 'fl'), level, name: str(f.label, '', CAPS.name), rooms });
  }
  if (!floors.length && !horizontal) throw new OriginalFileError('empty');
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
  const train = originalTrain(raw, id, skipped);
  if (horizontal && !train) throw new OriginalFileError('empty-train');
  const items: Fixture[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!isObj(it)) continue;
    if (it.mode === 'horizontal') {
      const f = train && originalItem(it, train.rooms.get(String(it.roomId)), id);
      if (f && train.t.items.length < CAPS.items) train.t.items.push(f);
      else skipped.items++;
      continue;
    }
    if (droppedRooms.has(String(it.roomId)) && !roomIds.has(String(it.roomId))) {
      skipped.floorItems++;
      continue;
    }
    const f = originalItem(it, roomIds.get(String(it.roomId)), id);
    if (!f || items.length >= CAPS.items) {
      skipped.items++;
      continue;
    }
    items.push(f);
  }
  const notes: Note[] = [];
  for (const n of Array.isArray(raw.annotations) ? raw.annotations : []) {
    if (!isObj(n)) continue;
    if (n.mode === 'horizontal') {
      const list = train?.t.notes;
      if (!train || !list || list.length >= CAPS.notes) {
        skipped.notes++;
        continue;
      }
      const room =
        typeof n.roomId === 'string'
          ? (train.rooms.get(n.roomId) ?? null)
          : typeof n.underfloorCarId === 'string'
            ? (train.unders.get(n.underfloorCarId) ?? null)
            : null;
      list.push(originalNote(n, room, id));
      continue;
    }
    if (notes.length >= CAPS.notes) {
      skipped.notes++;
      continue;
    }
    if (typeof n.roomId === 'string' && droppedRooms.has(n.roomId) && !roomIds.has(n.roomId)) {
      skipped.floorNotes++;
      continue;
    }
    const room = typeof n.roomId === 'string' ? (roomIds.get(n.roomId) ?? null) : null;
    notes.push(originalNote(n, room, id));
  }
  const doc = finish(
    emptyDoc(),
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
  if (!floors.length) {
    /* 橫向的檔裡沒有建築：換成空白的建築（切到縱向時用） */
    const blank = blankDoc();
    doc.building = blank.building;
    doc.items = blank.items;
    doc.notes = [];
  }
  if (train) {
    settleTrain(train.t);
    doc.train = train.t;
  }
  if (horizontal) {
    doc.mode = 'train';
    if (typeof raw.subtitle !== 'string') doc.subtitle = S.train.subtitle;
  }
  return { doc, skipped };
}

/** 原作的一件設備 → 本站的（認不出來的種類、區域不在時 null） */
function originalItem(it: Obj, room: string | undefined, id: Pool): Fixture | null {
  const kind = ORIG_KIND[String(it.asset)];
  if (!room || !kind) return null;
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
  return f;
}

function originalNote(n: Obj, room: string | null, id: Pool): Note {
  const note: Note = {
    id: id(n.id, 'nt'),
    text: str(n.text, '', CAPS.note),
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
  return note;
}

const ORIG_CAR: Record<string, CarType> = {
  locomotive: 'loco',
  sleeper1: 'suite',
  sleeper2: 'berth',
  dining: 'dining',
  lounge: 'lounge',
  coach: 'coach',
  baggage: 'baggage',
  observation: 'observation',
  guard: 'escort',
};
const ORIG_COUPLER: Record<string, Coupler> = {
  normal: 'normal',
  locked: 'locked',
  bars: 'bars',
  decoupled: 'split',
};
const ORIG_SCENERY: Record<string, Scenery> = {
  'night-star': 'starlit',
  blizzard: 'blizzard',
  'fog-viaduct': 'viaduct',
  tunnel: 'tunnel',
  'day-country': 'meadow',
};

/** 車廂名字前面原作自動加的「N号車 · 」（日、英、韓）拿掉 */
const stripCarNumber = (name: string): string =>
  name.replace(/^\s*(?:\d+号車|Car\s*\d+|\d+호차)\s*[·・:-]\s*/i, '').trim();

/** 原作的列車（車廂、區域、連結器、床下）；一節都讀不到時 null。rooms／unders＝原作的 id → 本站的 */
function originalTrain(
  raw: Obj,
  id: Pool,
  skipped: OriginalSkipped,
): { t: Train; rooms: Map<string, string>; unders: Map<string, string> } | null {
  const rt = isObj(raw.train) ? raw.train : null;
  if (!rt || !Array.isArray(rt.cars)) return null;
  const carW = Math.round(num(rt.carWidthCells, CAR_W, 10, 20));
  const rooms = new Map<string, string>();
  const unders = new Map<string, string>();
  const cars: Car[] = [];
  for (const c of rt.cars) {
    if (!isObj(c) || !Array.isArray(c.rooms)) continue;
    if (cars.length >= MAX_CARS) {
      skipped.cars++;
      continue;
    }
    const type = ORIG_CAR[String(c.type)] ?? 'berth';
    const list: CarRoom[] = [];
    for (const r of c.rooms) {
      if (!isObj(r)) continue;
      const rid = id(r.id, 'cr');
      if (typeof r.id === 'string') rooms.set(r.id, rid);
      const room: CarRoom = {
        id: rid,
        name: str(r.name, '', CAPS.name),
        wall: oneOf<WallTone>(WALL_TONES, r.wallTone, 'wood'),
        secret: r.secret === true,
        hideName: r.labelPrivate === true,
        /* 車廂寬不是 14 格的檔照比例換算（之後整理成整數格） */
        x0: Math.round((num(r.x0, 0, 0, carW) * CAR_W) / carW),
        x1: Math.round((num(r.x1, carW, 0, carW) * CAR_W) / carW),
      };
      if (r.startOpen === true) room.open = true;
      if (r.isDeck === true) room.role = 'deck';
      else if (type === 'loco') room.role = r.isCab === true ? 'cab' : 'engine';
      list.push(room);
    }
    const car: Car = {
      id: id(c.id, 'car'),
      type,
      name: stripCarNumber(str(c.name, '', CAPS.name)) || S.cars[type],
      rooms: list,
      coupler: ORIG_COUPLER[String(c.couplerAfter)] ?? 'normal',
      hatch: c.roofHatch === undefined ? type !== 'loco' : c.roofHatch === true,
      under: c.underfloorSecret === true && type !== 'loco',
      underName: str(c.underfloorName, S.train.underName, CAPS.name) || S.train.underName,
    };
    if (typeof c.id === 'string' && car.under) unders.set(c.id, underId(car.id));
    cars.push(car);
  }
  if (!cars.length) return null;
  const arrange = String(rt.layout);
  const t: Train = {
    arrange: arrange === 'single' || arrange === 'folded' ? arrange : 'auto',
    loco: rt.locoStyle === 'electric' ? 'electric' : 'steam',
    scenery: ORIG_SCENERY[String(raw.sceneryTheme)] ?? 'starlit',
    roofRoute: rt.rooftopRoute === undefined ? true : rt.rooftopRoute === true,
    cars,
    items: [],
    notes: [],
  };
  return { t, rooms, unders };
}
