/**
 * 房間的內裝預設（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「ワンクリック自動内装」；規格 F275、3.16.2）。純函式。
 *
 * 選一間房按一種預設（書房、會客室、臥室、研究室、儀式場、駕駛台、輪機室）：房間裡原本的家具換成這一組，
 * 位置交給「自動擺放家具」（arrange.ts，F253）排——靠牆的貼牆、桌椅成對、桌上的小物跟著桌子、門前與窗前留空。
 * 每一組有「一定要有的」與「房間夠大才加的」：先試全部，排不下就從最後一件開始少放，少到只剩一定要有的也排不下時**整個不改**。
 *
 * - 換掉的：中心在這間房裡（那一格是這間房的，不在巢狀的房間裡）的家具；貼牆素材（裂痕、彈孔…）與隱藏線索留著（線索不動、當成障礙）。
 * - 每一組的內容是本站自己定的（KIIN 的組合不照抄），只用本工具的家具。
 * - 不能用的房間：水邊、道路、鐵軌、田地（不是「房間」）。
 */
import { arrangeRoom } from './arrange';
import { ASSET, isWallMounted } from './assets';
import { ownerRoom } from './circle';
import { itemCorners, round2, uid } from './geometry';
import { roomMainRect } from './shape';
import type { Floor, Item, Room, RoomCategory } from './types';

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

/** 把一組排在房間中間（之後交給自動擺放）：兩欄、每 1.2 m 一格；桌上的放在桌面上、椅子放在前面 */
function layout(entries: readonly Entry[], room: Room): Item[] {
  const m = roomMainRect(room);
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const out: Item[] = [];
  let slot = 0;
  const onCount = new Map<number, number>();
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
      /* 桌面上：第一件在左邊 1/4、第二件在右邊 1/4 */
      const fx = k % 2 ? 0.72 : 0.28;
      x = s.x + s.w * fx - w / 2;
      y = s.y + s.h / 2 - h / 2;
    } else if (e.front !== undefined && out[e.front]) {
      const s = out[e.front];
      x = s.x + s.w / 2 - w / 2;
      y = s.y + s.h + 0.1;
    } else if (a.under) {
      x = cx - w / 2;
      y = cy - h / 2;
    } else {
      x = cx + ((slot % 2) - 0.5) * 2.4 - w / 2;
      y = cy + (Math.floor(slot / 2) - 1) * 2.4 - h / 2;
      slot++;
    }
    out.push({ id: uid('i'), t: e.t, x: round2(x), y: round2(y), w, h, rot: 0 });
  }
  return out;
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
  const owned = ownedItems(floor, room);
  const remove = owned.filter((it) => !isWallMounted(it.t) && !it.clue);
  const keep = new Set(owned.filter((it) => it.clue && !isWallMounted(it.t)).map((it) => it.id));
  const removeIds = new Set(remove.map((it) => it.id));
  const base: Floor = { ...floor, items: floor.items.filter((it) => !removeIds.has(it.id)) };
  const area = (room.w * room.h - (room.cut ? room.cut.w * room.cut.h : 0)) * 0.25;
  const all = area >= preset.extraArea ? [...preset.need, ...preset.extra] : [...preset.need];
  for (let n = all.length; n >= preset.need.length; n--) {
    /* 桌上的、前面的只會指著排在它前面的那一件，所以從後面少放不會留下沒有桌子的小物 */
    const add = layout(all.slice(0, n), room);
    /* 畫在底下的（地毯、魔法陣）不排，整個要在房間裡 */
    const unders = add.filter((it) => ASSET[it.t]?.under);
    if (
      unders.some((it) =>
        itemCorners(it).some((p) => {
          const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
          return ownerRoom(floor, p.x + (c.x - p.x) * 0.01, p.y + (c.y - p.y) * 0.01) !== room;
        }),
      )
    )
      continue;
    const temp: Floor = { ...base, items: base.items.concat(add) };
    const r = arrangeRoom(temp, roomId, { keep });
    if (!r.ok || r.pinned.length) continue;
    for (const it of add) {
      const mv = r.moves.get(it.id);
      if (mv) Object.assign(it, mv);
    }
    return { ok: true, remove: [...removeIds], add, count: add.length, dropped: all.length - n };
  }
  return { ok: false, reason: 'full' };
}
