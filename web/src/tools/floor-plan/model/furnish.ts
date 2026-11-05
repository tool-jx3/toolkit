/**
 * 房間的內裝預設（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「ワンクリック自動内装」；規格 F275、3.16.2）。純函式。
 *
 * 選一間房按一種預設（書房、會客室、臥室、研究室、儀式場、駕駛台、輪機室）：房間裡原本的家具換成這一組，
 * 先排在房間裡（主要的長方形；超出的往裡面推），位置再交給「自動擺放家具」（arrange.ts，F253）排——
 * 靠牆的貼牆、桌椅成對、桌上的小物跟著桌子、門前與窗前留空。
 * 每一組有「一定要有的」與「房間夠大才加的」：先試全部，排不下就從最後一件開始少放，少到只剩一定要有的也排不下時**整個不改**。
 * 排好之後再檢查一次（2026-11-05 驗證後修訂）：每件新家具的外框都在這間房的格子裡（L 形的缺角、巢狀的房間都算房外）、
 * 擋路的不和別的家具疊在一起（放在桌上的小物和它的桌子不算）、不碰到門的開門範圍與門前；不合格的照「排不下」處理。
 *
 * - 換掉的：中心在這間房裡（那一格是這間房的，不在巢狀的房間裡）的家具；貼牆素材（裂痕、彈孔…）與隱藏線索留著（線索不動、當成障礙）。
 * - 每一組的內容是本站自己定的（KIIN 的組合不照抄），只用本工具的家具。
 * - 不能用的房間：水邊、道路、鐵軌、田地（不是「房間」）。
 */
import { arrangeRoom } from './arrange';
import { ASSET, isWallMounted } from './assets';
import { ownerRoom } from './circle';
import { itemFootprint, round2, uid } from './geometry';
import { blocking, doorKinds, EPS, hitsDoor, rectHits } from './layoutRules';
import { cutRect, roomCells, roomMainRect } from './shape';
import { supportOf } from './tabletop';
import type { Floor, Item, Rect, Room, RoomCategory } from './types';

export type FurnishPresetId =
  | 'study'
  | 'parlor'
  | 'bedroom'
  | 'lab'
  | 'ritual'
  | 'bridge'
  | 'engine';

/** 一件：放在第幾件的桌面上（on）、第幾件的前面（front，椅子） */
interface Entry {
  t: string;
  on?: number;
  front?: number;
}

interface FurnishPreset {
  id: FurnishPresetId;
  /** 一定要有的 */
  need: Entry[];
  /** 房間夠大（㎡）才加的 */
  extra: Entry[];
  extraArea: number;
}

/** 七種預設（本站自己定的組合；`on`、`front` 是在 need＋extra 這個順序裡的位置） */
export const FURNISH_PRESETS: readonly FurnishPreset[] = [
  {
    id: 'study',
    need: [{ t: 'desk' }, { t: 'chair', front: 0 }, { t: 'bookshelf' }, { t: 'bookshelf' }],
    extra: [{ t: 'desk_lamp', on: 0 }, { t: 'armchair' }, { t: 'plant' }],
    extraArea: 9,
  },
  {
    id: 'parlor',
    need: [{ t: 'rug' }, { t: 'sofa2' }, { t: 'lowtable' }, { t: 'armchair' }],
    extra: [{ t: 'armchair' }, { t: 'lamp' }, { t: 'cabinet' }, { t: 'plant' }],
    extraArea: 14,
  },
  {
    id: 'bedroom',
    need: [{ t: 'bed_double' }, { t: 'nightstand' }, { t: 'wardrobe' }],
    extra: [{ t: 'desk_lamp', on: 1 }, { t: 'dresser' }, { t: 'rug' }],
    extraArea: 10,
  },
  {
    id: 'lab',
    need: [{ t: 'lab_bench' }, { t: 'microscope', on: 0 }, { t: 'cabinet' }],
    extra: [{ t: 'stool', front: 0 }, { t: 'tank' }, { t: 'bookshelf' }],
    extraArea: 14,
  },
  {
    id: 'ritual',
    need: [{ t: 'magic_circle' }, { t: 'altar' }, { t: 'candle', on: 1 }, { t: 'candle', on: 1 }],
    extra: [{ t: 'idol' }, { t: 'candle' }, { t: 'candle' }],
    extraArea: 12,
  },
  {
    id: 'bridge',
    need: [{ t: 'helm' }, { t: 'chart_table' }, { t: 'console' }],
    extra: [{ t: 'chair', front: 2 }, { t: 'radar' }, { t: 'candle', on: 1 }],
    extraArea: 12,
  },
  {
    id: 'engine',
    need: [{ t: 'boiler' }, { t: 'control_panel' }, { t: 'valve' }],
    extra: [{ t: 'generator' }, { t: 'pipe' }, { t: 'crate' }, { t: 'tools' }],
    extraArea: 12,
  },
];

export const FURNISH_PRESET: Record<FurnishPresetId, FurnishPreset> = Object.fromEntries(
  FURNISH_PRESETS.map((p) => [p.id, p]),
) as Record<FurnishPresetId, FurnishPreset>;

/** 不能套用內裝的房間種類 */
export const NO_FURNISH: ReadonlySet<RoomCategory> = new Set(['water', 'road', 'track', 'field']);

export type FurnishResult =
  | { ok: true; remove: string[]; add: Item[]; count: number; dropped: number }
  | { ok: false; reason: 'noRoom' | 'kind' | 'full' };

/** 這間房擁有的家具（中心在房間裡、那一格是這間房的） */
function ownedItems(floor: Floor, room: Room): Item[] {
  return floor.items.filter((it) => ownerRoom(floor, it.x + it.w / 2, it.y + it.h / 2) === room);
}

/** 把 [v, v＋size] 推進 [lo, lo＋len]（比範圍大的置中，之後的檢查會判成放不下） */
function pushIn(v: number, size: number, lo: number, len: number): number {
  if (size > len) return lo + (len - size) / 2;
  return Math.min(Math.max(v, lo), lo + len - size);
}

/** 房間裡的長方形：主要的那一塊在前；L 形另加沒缺的另一條（整列或整欄） */
function roomArms(room: Room): Rect[] {
  const m = roomMainRect(room);
  const k = cutRect(room);
  if (!k) return [m];
  const row: Rect =
    k.y === room.y
      ? { x: room.x, y: room.y + k.h, w: room.w, h: room.h - k.h }
      : { x: room.x, y: room.y, w: room.w, h: room.h - k.h };
  const col: Rect =
    k.x === room.x
      ? { x: room.x + k.w, y: room.y, w: room.w - k.w, h: room.h }
      : { x: room.x, y: room.y, w: room.w - k.w, h: room.h };
  return m.w === row.w && m.h === row.h && m.x === row.x && m.y === row.y ? [m, col] : [m, row];
}

/**
 * 把一組排進房間（之後交給自動擺放）：兩欄、每 1.2 m 一格，從房間中間往外排；每件的外框都在房間主要的長方形裡
 * （L 形不碰缺角；超出的往裡面推，重疊的交給自動擺放）。桌上的放在桌面上（一件的放中間、兩件的左右各一）、
 * 椅子放在前面（前面放不下時放後面）；畫在底下的（地毯、魔法陣，自動擺放不動）放在放得下的那一塊的中間
 */
function layout(entries: readonly Entry[], room: Room, owned: Owned): Item[] {
  const arms = roomArms(room);
  const m = arms[0];
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const out: Item[] = [];
  let slot = 0;
  const onCount = new Map<number, number>();
  const onTotal = new Map<number, number>();
  for (const e of entries) if (e.on !== undefined) onTotal.set(e.on, (onTotal.get(e.on) ?? 0) + 1);
  for (const e of entries) {
    const a = ASSET[e.t];
    const w = a.w;
    const h = a.h;
    let x: number;
    let y: number;
    if (e.on !== undefined && out[e.on]) {
      const s = out[e.on];
      const k = onCount.get(e.on) ?? 0;
      onCount.set(e.on, k + 1);
      /* 桌面上：只有一件的放中間；兩件以上的左邊 1/4、右邊 1/4 輪流 */
      const fx = (onTotal.get(e.on) ?? 0) < 2 ? 0.5 : k % 2 ? 0.72 : 0.28;
      x = s.x + s.w * fx - w / 2;
      y = s.y + s.h / 2 - h / 2;
    } else if (e.front !== undefined && out[e.front]) {
      const s = out[e.front];
      x = s.x + s.w / 2 - w / 2;
      y = s.y + s.h + 0.1;
      if (y + h > m.y + m.h + EPS) y = s.y - h - 0.1;
    } else if (a.under) {
      const r = arms.find((q) => w <= q.w + EPS && h <= q.h + EPS) ?? m;
      x = r.x + r.w / 2 - w / 2;
      y = r.y + r.h / 2 - h / 2;
    } else {
      x = cx + ((slot % 2) - 0.5) * 2.4 - w / 2;
      y = cy + (Math.floor(slot / 2) - 1) * 2.4 - h / 2;
      slot++;
    }
    /* 桌上的小物跟著桌子（桌子已經在房間裡），其他的推進房間；碰到巢狀的房間時找最近的空地 */
    if (e.on === undefined || !out[e.on]) {
      if (!a.under) {
        x = pushIn(x, w, m.x, m.w);
        y = pushIn(y, h, m.y, m.h);
      }
      ({ x, y } = settle({ x, y, w, h }, room, owned));
    }
    out.push({ id: uid('i'), t: e.t, x: round2(x), y: round2(y), w, h, rot: 0 });
  }
  return out;
}

/**
 * 不在這間房的格子裡時（巢狀的房間、L 形的缺角）：0.25 格一步、找離原本的位置最近的、整個在這間房裡的地方；找不到時不動
 * （之後的檢查會判成放不下）
 */
function settle(b: Rect, room: Room, owned: Owned): { x: number; y: number } {
  if (owned(b)) return b;
  let best: { x: number; y: number; d: number } | null = null;
  for (let x = room.x; x + b.w <= room.x + room.w + EPS; x += 0.25)
    for (let y = room.y; y + b.h <= room.y + room.h + EPS; y += 0.25) {
      const d = Math.hypot(x - b.x, y - b.y);
      if ((!best || d < best.d - EPS) && owned({ x, y, w: b.w, h: b.h })) best = { x, y, d };
    }
  return best ?? b;
}

/** 長方形整個在這間房的格子裡（最後一間蓋到那一格的房間才是那一格的主人） */
type Owned = (b: Rect) => boolean;

function ownedBy(floor: Floor, room: Room): Owned {
  const owner = new Map<string, Room>();
  for (const r of floor.rooms) for (const [x, y] of roomCells(r)) owner.set(`${x},${y}`, r);
  return (b) => {
    for (let x = Math.floor(b.x + EPS); x < b.x + b.w - EPS; x++)
      for (let y = Math.floor(b.y + EPS); y < b.y + b.h - EPS; y++)
        if (owner.get(`${x},${y}`) !== room) return false;
    return true;
  };
}

/**
 * 排好的新家具合不合格（2026-11-05 驗證後修訂）：每件的外框都在這間房的格子裡（L 形的缺角、巢狀的房間、房間外面都不行）；
 * 擋路的不和別的擋路家具疊在一起（放在桌上的小物和它的桌子不算）、不碰到門的開門範圍與門前（F194）
 */
function fits(floor: Floor, owned: Owned, add: readonly Item[]): boolean {
  const doors = floor.openings.filter(doorKinds);
  const solid = floor.items.filter(blocking);
  for (const it of add) {
    const b = itemFootprint(it);
    if (!owned(b)) return false;
    if (!blocking(it)) continue;
    if (doors.some((o) => hitsDoor(o, b))) return false;
    const support = supportOf(it, floor.items);
    for (const other of solid) {
      if (other === it || other === support || supportOf(other, floor.items) === it) continue;
      if (rectHits(b, itemFootprint(other))) return false;
    }
  }
  return true;
}

/** 套用內裝預設（成功時回傳要拿掉的與要加的家具；加的家具已經排好位置） */
export function furnishRoom(
  floor: Floor,
  roomId: string,
  presetId: FurnishPresetId,
): FurnishResult {
  const room = floor.rooms.find((r) => r.id === roomId);
  const preset = FURNISH_PRESET[presetId];
  if (!room || !preset) return { ok: false, reason: 'noRoom' };
  if (NO_FURNISH.has(room.cat)) return { ok: false, reason: 'kind' };
  const mine = ownedItems(floor, room);
  const remove = mine.filter((it) => !isWallMounted(it.t) && !it.clue);
  const keep = new Set(mine.filter((it) => it.clue && !isWallMounted(it.t)).map((it) => it.id));
  const removeIds = new Set(remove.map((it) => it.id));
  const base: Floor = { ...floor, items: floor.items.filter((it) => !removeIds.has(it.id)) };
  const area = (room.w * room.h - (room.cut ? room.cut.w * room.cut.h : 0)) * 0.25;
  const all = area >= preset.extraArea ? [...preset.need, ...preset.extra] : [...preset.need];
  const owned = ownedBy(floor, room);
  for (let n = all.length; n >= preset.need.length; n--) {
    /* 桌上的、前面的只會指著排在它前面的那一件，所以從後面少放不會留下沒有桌子的小物 */
    const add = layout(all.slice(0, n), room, owned);
    const temp: Floor = { ...base, items: base.items.concat(add) };
    const r = arrangeRoom(temp, roomId, { keep });
    if (!r.ok || r.pinned.length) continue;
    const placed = add.map((it) => {
      const mv = r.moves.get(it.id);
      return mv ? { ...it, ...mv } : it;
    });
    if (!fits({ ...base, items: base.items.concat(placed) }, owned, placed)) continue;
    return {
      ok: true,
      remove: [...removeIds],
      add: placed,
      count: placed.length,
      dropped: all.length - n,
    };
  }
  return { ok: false, reason: 'full' };
}
