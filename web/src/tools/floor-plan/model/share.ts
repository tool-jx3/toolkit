/**
 * 分享連結（規格 F215～F217、3.7）：地圖放進網址 `#m=`（共用 core/share：deflate 壓縮的 `{ v: 1, d: 地圖 }`、base64url）。
 *
 * - 為了變短：不放 id（讀回時給新的）；門窗 side＝1、hinge＝0，家具 rot＝0、大小＝那種家具的預設大小時不寫。
 *   外觀層「顯示內部」疊上來的樓層（`inside`）寫成樓層的順序（從 0 起；2026-10 第二批），讀回時換成新的 id。
 * - PL 用連結：照 PL 檢視＋藏起隱藏線索另外做一份地圖（GM 專用的房間只留牆框），GM 的資料根本不在連結裡。
 * - 讀回來的內容是任何人都能編的輸入：補回省略的欄位之後一律交給 normalizeProject 整理（呼叫端做）。
 */
import { encodeShareHash, readShareHash } from '@/core/share';
import { ASSET, assetDims } from './assets';
import { clueCount, visibleFloor } from './geometry';
import { momentOf, singleMomentProject } from './moment';
import type { Floor, Item, Moment, Opening, Project, Room } from './types';

/** # 後面的鍵名：`#m=…` */
export const SHARE_KEY = 'm';
/** 連結格式的版本（和專案檔的版本分開） */
export const SHARE_VERSION = 1;
/** # 後面最多幾個字（產生與讀回同一個上限） */
export const SHARE_MAX_LENGTH = 8000;

export type ShareMode = 'full' | 'pl';

/** PL 用連結拿掉了什麼（對話框上的說明） */
export interface PlRemoved {
  /** GM 專用的房間（只留牆框） */
  gmRooms: number;
  /** 其他 GM 專用的東西（含 GM 房間裡面的房間、家具、文字、手畫的牆、門窗） */
  gmThings: number;
  /** 暗門（當成牆） */
  secretDoors: number;
  /** 隱藏線索（家具、文字） */
  clues: number;
  /** GM 筆記 */
  notes: number;
  /** 祕密樓層（2026-11-09，F307：整層只留房間的輪廓） */
  secretFloors: number;
  /** 演出（2026-11-09，F327：藏起來的房間與樓層、移動路線；PL 用連結不帶，1＝有拿掉） */
  stage: number;
  /** 另一個狀態（事件前／事件後）才有的東西（2026-11-12，F335） */
  moment: number;
}

const EMPTY_REMOVED: PlRemoved = {
  gmRooms: 0,
  gmThings: 0,
  secretDoors: 0,
  clues: 0,
  notes: 0,
  secretFloors: 0,
  stage: 0,
  moment: 0,
};

/** PL 用連結裡祕密樓層的房間的種類（中性：祕密樓層的 PL 畫法不看種類） */
export const VEILED_CAT: Room['cat'] = 'living';

/**
 * PL 用的地圖：每一層照 PL 檢視＋藏起隱藏線索；原本的地圖不動。
 * 事件前後（2026-11-12，F335）：先整理成只剩一個狀態（`moment`；沒有＝地圖目前顯示的狀態）——另一個狀態才有的東西拿掉，
 * 事件前不帶事件後才發生的倒下、破損與停電。
 */
export function playerProject(
  p0: Project,
  moment: Moment = momentOf(p0),
): { project: Project; removed: PlRemoved } {
  const removed = { ...EMPTY_REMOVED };
  const single = singleMomentProject(p0, moment);
  const p = single.project;
  removed.moment = single.removed;
  const floors = p.floors.map((f): Floor => {
    const v = visibleFloor(f, true, true);
    /*
     * 祕密樓層（2026-11-09，F307）：房間只留 PL 看得到的外形（GM 專用的房間與在它裡面的房間拿掉），其他全部拿掉。
     * 驗證後修訂（2026-11-09）：種類換成中性的「客廳・起居室」（祕密樓層的 PL 畫法不看種類；原本的種類是劇透），
     * 不標 GM 專用（PL 檢視的祕密樓層本來就不畫 GM 專用的房間）。
     */
    if (v.veiled) {
      removed.secretFloors += 1;
      return {
        id: f.id,
        name: f.name,
        rooms: v.rooms.map((r): Room => {
          const out: Room = { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, name: '', cat: VEILED_CAT };
          if (r.cut) out.cut = { ...r.cut };
          if (r.shape) out.shape = r.shape;
          if (r.radius) out.radius = r.radius;
          return out;
        }),
        walls: [],
        openings: [],
        items: [],
        texts: [],
        secret: true,
      };
    }
    const clueItems = f.items.filter((i) => i.clue).length;
    const clueTexts = f.texts.filter((t) => t.clue).length;
    const secrets = f.openings.filter((o) => o.kind === 'secret').length;
    removed.gmRooms += f.rooms.filter((r) => r.gm).length;
    removed.notes += f.rooms.filter((r) => r.note).length;
    removed.secretDoors += secrets;
    removed.gmThings +=
      f.rooms.length -
      v.rooms.length +
      (f.walls.length - v.walls.length) +
      (f.openings.length - secrets - v.openings.length) +
      (f.items.length - clueItems - v.items.length) +
      (f.texts.length - clueTexts - v.texts.length) +
      ((f.lines?.length ?? 0) - (v.lines?.length ?? 0));
    const rooms = v.rooms.map((r): Room => {
      if (r.masked) {
        const out: Room = { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, name: '', cat: r.cat };
        out.gm = true;
        if (r.noWall) out.noWall = true;
        /* 房間的牆種類決定牆框的樣子（PL 檢視也看得到），留著（2026-10 第二批） */
        if (r.wall) out.wall = r.wall;
        /* L 形的牆框（2026-10-29） */
        if (r.cut) out.cut = { ...r.cut };
        /* 曲線的牆框（2026-11-05） */
        if (r.shape) out.shape = r.shape;
        if (r.radius) out.radius = r.radius;
        /* 甲板的外圍（F299）：疊放的邊的牆 */
        if (r.deck) out.deck = true;
        return out;
      }
      const { plName, note: _note, masked: _m, ...rest } = r;
      return { ...rest, name: plName || r.name };
    });
    const out: Floor = {
      id: f.id,
      name: f.name,
      rooms,
      walls: v.walls.map(({ gm: _g, ...w }) => w),
      openings: v.openings.map(({ gm: _g, ...o }) => o),
      items: v.items.map(({ gm: _g, clue: _c, ...i }) => i),
      texts: v.texts.map(({ gm: _g, clue: _c, ...t }) => t),
    };
    /* 自由線（2026-11-05）：GM 專用的已經拿掉 */
    if (v.lines?.length) out.lines = v.lines.map(({ gm: _g, ...l }) => l);
    /* 外觀層的「顯示內部」不是祕密（疊上來的樓層本身也照 PL 檢視整理過） */
    if (f.showInside) out.showInside = true;
    if (f.inside) out.inside = f.inside;
    return out;
  });
  /* 隱藏線索的個數＝線索開關的通知的算法（一件小物＋說明算一個；7.7）；祕密樓層的不另外算（整層都拿掉了） */
  removed.clues = clueCount(p.floors.filter((f) => !f.secret));
  /* 演出（2026-11-09，D122）：PL 用連結不帶（藏起來的房間、路線是之後才公開的東西） */
  const { stage, ...rest } = p;
  if (stage) removed.stage = 1;
  return { project: { ...rest, floors }, removed };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function packItem({ id: _id, w, h, rot, ...rest }: Item): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rest };
  if (rot) out.rot = rot;
  const a = ASSET[rest.t];
  const d = a ? assetDims(a, rot) : null;
  if (!d || !near(d.w, w) || !near(d.h, h)) {
    out.w = w;
    out.h = h;
  }
  return out;
}

function packOpening({ id: _id, side, hinge, ...rest }: Opening): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rest };
  if (side !== 1) out.side = side;
  if (hinge) out.hinge = hinge;
  return out;
}

const dropId = <T extends { id: string }>({ id: _id, ...rest }: T) => rest;

/**
 * 演出（2026-11-09，F327、D122）：id 不放進連結，房間寫成 [樓層的順序, 房間的順序, 時機?, 順序?]、樓層寫成順序、
 * 路線的樓層寫成順序，「和路線 #n 同時」寫成 `route:<第幾條>`。指到不存在的東西的略過。
 */
function packStage(p: Project): { stage: Record<string, unknown> } | null {
  const s = p.stage;
  if (!s) return null;
  const fi = (id: string) => p.floors.findIndex((f) => f.id === id);
  const routes = (s.routes ?? []).filter((r) => fi(r.floor) >= 0);
  const out: Record<string, unknown> = {};
  const rooms = (s.rooms ?? []).flatMap((e) => {
    const f = fi(e.floor);
    const r = f >= 0 ? p.floors[f].rooms.findIndex((x) => x.id === e.room) : -1;
    if (r < 0) return [];
    let when: string | number = e.when ?? '';
    if (typeof when === 'string' && when.startsWith('route:')) {
      const i = routes.findIndex((x) => `route:${x.id}` === when);
      when = i >= 0 ? `route:${i}` : 'after';
    }
    const row: unknown[] = [f, r];
    if (when || e.order !== undefined) row.push(when);
    if (e.order !== undefined) row.push(e.order);
    return [row];
  });
  if (rooms.length) out.rooms = rooms;
  const floors = (s.floors ?? []).map(fi).filter((i) => i >= 0);
  if (floors.length) out.floors = floors;
  if (routes.length)
    out.routes = routes.map(({ id: _id, floor, ...r }) => ({ ...r, floor: fi(floor) }));
  return Object.keys(out).length ? { stage: out } : null;
}

/** 連結裡的演出 → 存檔的形狀（樓層、房間、路線給 id；normalizeStage 再整理） */
function unpackStage(
  d: unknown,
  floorId: (i: number) => string,
  roomId: (f: number, r: number) => string,
): unknown {
  if (!isObj(d)) return undefined;
  const routes = Array.isArray(d.routes)
    ? d.routes.filter(isObj).map((r, i) => ({
        ...r,
        id: `sa${i}`,
        floor: Number.isInteger(r.floor) ? floorId(r.floor as number) : '',
      }))
    : [];
  const rooms = Array.isArray(d.rooms)
    ? d.rooms.flatMap((row) => {
        if (!Array.isArray(row) || !Number.isInteger(row[0]) || !Number.isInteger(row[1]))
          return [];
        const [f, r, when, order] = row as [number, number, unknown, unknown];
        const e: Record<string, unknown> = { floor: floorId(f), room: roomId(f, r) };
        if (typeof when === 'string' && when.startsWith('route:')) {
          const i = Number(when.slice(6));
          e.when = Number.isInteger(i) && routes[i] ? `route:${routes[i].id}` : 'after';
        } else if (when) e.when = when;
        if (order !== undefined) e.order = order;
        return [e];
      })
    : [];
  const floors = Array.isArray(d.floors)
    ? d.floors.filter((i): i is number => Number.isInteger(i)).map(floorId)
    : [];
  return { rooms, floors, routes };
}

/** 連結裡的地圖（不放 id、省略預設值） */
export function packProject(p: Project): Record<string, unknown> {
  return {
    name: p.name,
    theme: p.theme,
    showSize: p.showSize,
    showNames: p.showNames,
    active: p.active,
    /* 棋子方格（不是祕密，PL 用連結也帶著；沒設定時不寫） */
    ...(p.tokenGrid ? { tokenGrid: p.tokenGrid } : {}),
    ...(p.tokenGridColor ? { tokenGridColor: p.tokenGridColor } : {}),
    ...(p.tokenGridOpacity ? { tokenGridOpacity: p.tokenGridOpacity } : {}),
    /* 2026-10-29（參考 KIIN）：污漬與摺痕、座標標示、家具不跟著房間（有設定時才寫） */
    ...(p.wear ? { wear: p.wear } : {}),
    ...(p.wearSeed !== undefined ? { wearSeed: p.wearSeed } : {}),
    ...(p.coords ? { coords: true } : {}),
    ...(p.fixedFurniture ? { fixedFurniture: true } : {}),
    /* 2026-11-05（參考 KIIN v2.0）：夜的暗度（不是祕密；PL 用的連結也帶，光源已經照 PL 檢視整理過） */
    ...(p.night ? { night: p.night } : {}),
    /* 2026-11-09：立體樓層圖的視角（不是祕密；預設時不寫） */
    ...(p.stack ? { stack: p.stack } : {}),
    /* 2026-11-12：事件前後（目前顯示的狀態、事件後才停電；PL 用連結在 playerProject 換成只剩一個狀態） */
    ...(p.moment ? { moment: p.moment } : {}),
    ...(p.blackout ? { blackout: true } : {}),
    /* 2026-11-09：演出（完整連結才有；PL 用連結在 playerProject 拿掉了）：房間、樓層寫成順序 */
    ...(packStage(p) ?? {}),
    floors: p.floors.map((f) => {
      const out: Record<string, unknown> = {
        name: f.name,
        rooms: f.rooms.map(dropId),
        walls: f.walls.map(dropId),
        openings: f.openings.map(packOpening),
        items: f.items.map(packItem),
        texts: f.texts.map(dropId),
      };
      /* 自由線（2026-11-05，F285）：有的時候才寫 */
      if (f.lines?.length) out.lines = f.lines.map(dropId);
      /* 外觀層的「顯示內部」（2026-10 第二批）：疊上來的樓層寫成順序 */
      if (f.showInside) out.showInside = true;
      /* 祕密樓層（2026-11-09；PL 用連結裡內容已經拿掉，只剩輪廓） */
      if (f.secret) out.secret = true;
      const inside = f.inside ? p.floors.findIndex((o) => o !== f && o.id === f.inside) : -1;
      if (inside >= 0) out.inside = inside;
      return out;
    }),
  };
}

/** 連結裡疊上來的樓層（順序）讀回時的 id：被指到的樓層用這個 id（normalizeProject 會檢查有沒有重複） */
const shareFloorId = (i: number) => `s${i}`;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 讀回來的地圖：補回省略的家具大小（其他省略的欄位 normalizeProject 本來就有預設值） */
export function unpackProject(d: unknown): unknown {
  if (!isObj(d) || !Array.isArray(d.floors)) return d;
  const floors: unknown[] = d.floors;
  /* 疊上來的樓層（順序）→ id（2026-10 第二批）：被指到的樓層給 `s<順序>` 的 id */
  const targets = new Set<number>();
  for (const f of floors)
    if (isObj(f) && Number.isInteger(f.inside) && isObj(floors[f.inside as number]))
      targets.add(f.inside as number);
  /* 演出（2026-11-09）：指到的樓層、房間給 id（樓層 `s<順序>`、房間 `s<樓層>r<順序>`） */
  const stageRooms = new Set<string>();
  const stage = isObj(d.stage)
    ? unpackStage(
        d.stage,
        (i) => {
          if (isObj(floors[i])) targets.add(i);
          return shareFloorId(i);
        },
        (f, r) => {
          stageRooms.add(`${f}:${r}`);
          return `${shareFloorId(f)}r${r}`;
        },
      )
    : undefined;
  return {
    ...d,
    ...(stage ? { stage } : {}),
    floors: floors.map((f0, index) => {
      if (!isObj(f0)) return f0;
      let f: Record<string, unknown> = f0;
      if (targets.has(index) && f.id === undefined) f = { ...f, id: shareFloorId(index) };
      if (Array.isArray(f.rooms) && [...stageRooms].some((k) => k.startsWith(`${index}:`)))
        f = {
          ...f,
          rooms: f.rooms.map((r, ri) =>
            isObj(r) && r.id === undefined && stageRooms.has(`${index}:${ri}`)
              ? { ...r, id: `${shareFloorId(index)}r${ri}` }
              : r,
          ),
        };
      if (typeof f.inside === 'number')
        f = targets.has(f.inside)
          ? { ...f, inside: shareFloorId(f.inside) }
          : { ...f, inside: undefined };
      if (!Array.isArray(f.items)) return f;
      return {
        ...f,
        items: f.items.map((i) => {
          if (!isObj(i) || typeof i.t !== 'string' || ('w' in i && 'h' in i)) return i;
          const a = Object.hasOwn(ASSET, i.t) ? ASSET[i.t] : null;
          if (!a) return i;
          const rot = typeof i.rot === 'number' ? i.rot : 0;
          return { ...i, ...assetDims(a, rot) };
        }),
      };
    }),
  };
}

export interface MapShare {
  /** `#m=…`（含 #） */
  hash: string;
  /** # 後面的字數 */
  length: number;
  tooLong: boolean;
  /** PL 用連結拿掉了什麼（完整連結時都是 0） */
  removed: PlRemoved;
}

/** 地圖 → 分享連結的 # 部分（`moment`：PL 用連結的狀態，沒有＝地圖目前顯示的狀態，F335） */
export function encodeMapHash(p: Project, mode: ShareMode, moment?: Moment): MapShare {
  const pl = mode === 'pl' ? playerProject(p, moment) : null;
  const data = packProject(pl ? pl.project : p);
  if (pl) data.pl = 1;
  const hash = encodeShareHash(data, { version: SHARE_VERSION, key: SHARE_KEY });
  const length = hash.length - 1;
  return {
    hash,
    length,
    tooLong: length > SHARE_MAX_LENGTH,
    removed: pl ? pl.removed : { ...EMPTY_REMOVED },
  };
}

/** 完整的分享網址（目前的網址換掉 #） */
export function mapShareUrl(hash: string, base: string): string {
  const u = new URL(base);
  u.hash = hash.slice(1);
  return u.toString();
}

export type ReadShare =
  | { kind: 'none' }
  | { kind: 'broken' }
  /** raw：補回省略的欄位之後、還沒整理的地圖；pl：PL 用連結 */
  | { kind: 'ok'; raw: unknown; pl: boolean };

/** 網址的 # 部分 → 分享的地圖（沒有 `m=` 時 none；讀不出來、版本不對、太長時 broken） */
export function readMapHash(hash: string): ReadShare {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h) return { kind: 'none' };
  let has = false;
  try {
    has = new URLSearchParams(h).has(SHARE_KEY);
  } catch {
    has = false;
  }
  if (!has) return { kind: 'none' };
  const raw = readShareHash(hash, {
    version: SHARE_VERSION,
    key: SHARE_KEY,
    maxLength: SHARE_MAX_LENGTH,
  });
  if (raw === null) return { kind: 'broken' };
  return { kind: 'ok', raw: unpackProject(raw), pl: isObj(raw) && raw.pl === 1 };
}
