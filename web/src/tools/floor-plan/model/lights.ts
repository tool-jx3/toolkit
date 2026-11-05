/**
 * 夜的暗度與光源（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「夜の暗さと明かり」；規格 F273、F274、3.16.1）。
 *
 * - 地圖設定的「夜的暗度」（5%～85%）：房間（含戶外的區塊）蓋上一層夜色；房間外面（圖的留白、透明背景）不蓋。
 * - 光源：燭台、檯燈、立燈、紙燈籠、石燈籠、火把、營火、壁爐、路燈（火光）；魔法陣、水晶球（神祕的光）；
 *   培養槽、控制台、桌上螢幕、監控螢幕牆、全像投影桌、電視櫃、自動販賣機（螢幕的光）；窗、落地窗、鐵窗、破掉的窗（月光）。
 *   照亮的範圍是一個圓（半徑照種類，家具放大縮小時跟著變），**只照亮所在的房間**（光源中心那一格的主人；
 *   巢狀的房間是另一間），窗照亮牆兩側的房間。不是陰影的模擬（光會穿過房間裡的家具）。
 * - 看不到的光源不亮：PL 檢視（與 PL 用的圖）裡 GM 專用的家具、門窗、在 GM 專用房間裡的東西都已經拿掉（visibleFloor），
 *   藏起來的隱藏線索也是；PL 檢視蓋灰的 GM 房間不會被照亮。
 *
 * 半徑、亮度是本站自己定的（KIIN 的數值只參考了大小的級距）。
 */
import { ASSET } from './assets';
import { OPEN } from './catalog';
import type { ShownFloor, ShownRoom } from './geometry';
import { roomCells } from './shape';
import type { Rect } from './types';

/** 光的顏色（畫法在 draw/night.ts） */
export type LightTone = 'fire' | 'mystic' | 'screen' | 'moon';

export interface LightSpec {
  /** 照亮的半徑（格；家具是預設大小時） */
  r: number;
  /** 光暈的強度（0～1） */
  glow: number;
  tone: LightTone;
}

/** 家具的光源（代號 → 半徑、光暈、顏色） */
export const LIGHT_ITEMS: Readonly<Record<string, LightSpec>> = {
  candle: { r: 5, glow: 0.3, tone: 'fire' },
  desk_lamp: { r: 4.4, glow: 0.26, tone: 'fire' },
  lamp: { r: 6, glow: 0.28, tone: 'fire' },
  andon: { r: 4.6, glow: 0.26, tone: 'fire' },
  lantern: { r: 5.4, glow: 0.26, tone: 'fire' },
  torch: { r: 5.6, glow: 0.32, tone: 'fire' },
  campfire: { r: 7.6, glow: 0.38, tone: 'fire' },
  fireplace: { r: 6.8, glow: 0.36, tone: 'fire' },
  streetlight: { r: 8, glow: 0.24, tone: 'fire' },
  magic_circle: { r: 5.6, glow: 0.24, tone: 'mystic' },
  crystal_ball: { r: 3.4, glow: 0.22, tone: 'mystic' },
  tank: { r: 4.2, glow: 0.18, tone: 'screen' },
  console: { r: 4.2, glow: 0.18, tone: 'screen' },
  desk_monitor: { r: 3.6, glow: 0.16, tone: 'screen' },
  monitor_wall: { r: 6, glow: 0.2, tone: 'screen' },
  holo_table: { r: 5, glow: 0.22, tone: 'screen' },
  tv: { r: 3.6, glow: 0.16, tone: 'screen' },
  vending: { r: 4, glow: 0.18, tone: 'screen' },
};

/** 會透進月光的窗（封住的、鐵板的不算） */
export const LIGHT_WINDOWS: ReadonlySet<string> = new Set([
  'window',
  'window2',
  'barred',
  'brokenwin',
]);
/** 窗的光：半徑＝max(3.6, 寬度 × 1.3) 格 */
export const WINDOW_LIGHT = { min: 3.6, k: 1.3, glow: 0.12 } as const;

export interface Light {
  x: number;
  y: number;
  r: number;
  glow: number;
  tone: LightTone;
  /** 照亮的房間（id） */
  rooms: string[];
}

const key = (x: number, y: number) => `${x},${y}`;

/** 每一格的主人（最後蓋上去的房間） */
export function cellOwners(rooms: readonly ShownRoom[]): Map<string, ShownRoom> {
  const owner = new Map<string, ShownRoom>();
  for (const r of rooms) for (const [x, y] of roomCells(r)) owner.set(key(x, y), r);
  return owner;
}

/** 這一層的光源（看得到的樓層：visibleFloor 的結果） */
export function lightsOf(floor: ShownFloor, owner = cellOwners(floor.rooms)): Light[] {
  const out: Light[] = [];
  const lit = (r: ShownRoom | undefined) => (r && !r.masked ? r.id : null);
  for (const it of floor.items) {
    const spec = LIGHT_ITEMS[it.t];
    const a = ASSET[it.t];
    if (!spec || !a) continue;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    const room = lit(owner.get(key(Math.floor(cx), Math.floor(cy))));
    if (!room) continue;
    /* 放大縮小（F278）：半徑跟著面積的比例的平方根 */
    const k = Math.min(3, Math.max(0.5, Math.sqrt((it.w * it.h) / (a.w * a.h))));
    out.push({ x: cx, y: cy, r: spec.r * k, glow: spec.glow, tone: spec.tone, rooms: [room] });
  }
  for (const o of floor.openings) {
    if (!LIGHT_WINDOWS.has(o.kind) || OPEN[o.kind]?.group !== 'window') continue;
    const h = o.o === 'h';
    const mx = h ? o.x + o.len / 2 : o.x;
    const my = h ? o.y : o.y + o.len / 2;
    const a = h ? key(Math.floor(mx), o.y - 1) : key(o.x - 1, Math.floor(my));
    const b = h ? key(Math.floor(mx), o.y) : key(o.x, Math.floor(my));
    const rooms = [...new Set([lit(owner.get(a)), lit(owner.get(b))])].filter(
      (id): id is string => !!id,
    );
    if (!rooms.length) continue;
    out.push({
      x: mx,
      y: my,
      r: Math.max(WINDOW_LIGHT.min, o.len * WINDOW_LIGHT.k),
      glow: WINDOW_LIGHT.glow,
      tone: 'moon',
      rooms,
    });
  }
  return out;
}

/** 房間擁有的格子，合成每一列的長方形（光只照亮這個範圍） */
export function ownedRegions(owner: ReadonlyMap<string, ShownRoom>): Map<string, Rect[]> {
  const rows = new Map<string, Map<number, number[]>>();
  for (const [k, r] of owner) {
    const [x, y] = k.split(',').map(Number);
    const m = rows.get(r.id) ?? new Map<number, number[]>();
    rows.set(r.id, m);
    const xs = m.get(y);
    if (xs) xs.push(x);
    else m.set(y, [x]);
  }
  const out = new Map<string, Rect[]>();
  for (const [id, m] of rows) {
    const rects: Rect[] = [];
    for (const [y, xs] of m) {
      xs.sort((a, b) => a - b);
      let start = xs[0];
      let prev = xs[0];
      for (const x of xs.slice(1)) {
        if (x === prev + 1) {
          prev = x;
          continue;
        }
        rects.push({ x: start, y, w: prev + 1 - start, h: 1 });
        start = x;
        prev = x;
      }
      rects.push({ x: start, y, w: prev + 1 - start, h: 1 });
    }
    out.set(id, rects);
  }
  return out;
}

/** 某一點在夜裡的暗度（0～level）：光源照到的地方變亮（單元測試、說明用；畫法同 draw/night.ts） */
export function darknessAt(
  floor: ShownFloor,
  level: number,
  x: number,
  y: number,
  owner = cellOwners(floor.rooms),
): number {
  const room = owner.get(key(Math.floor(x), Math.floor(y)));
  if (!room) return 0;
  let d = level;
  for (const l of lightsOf(floor, owner)) {
    if (!l.rooms.includes(room.id)) continue;
    d *= 1 - lightHole(Math.hypot(x - l.x, y - l.y) / l.r);
  }
  return d;
}

/** 光照亮的程度（0～1，離中心的距離 ÷ 半徑 t）：中心 0.9、一半 0.5、邊緣 0（直線內插；畫法的漸層同） */
export function lightHole(t: number): number {
  if (t >= 1) return 0;
  if (t <= 0.5) return 0.9 - (0.4 * t) / 0.5;
  return 0.5 * (1 - (t - 0.5) / 0.5);
}

export const LIGHT_STOPS: readonly [number, number][] = [
  [0, 0.9],
  [0.5, 0.5],
  [1, 0],
];
