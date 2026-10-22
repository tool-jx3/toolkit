/**
 * 原作（TRPG 室內圖メーカー）v1.05～v1.14 存的地圖檔：本工具不認得的種類（將來的版本才有的）換成預設的種類或略過，
 * 換掉與略過的東西記下來（開檔時通知）。規格 2.2.1～2.2.3、D22～D25。
 *
 * 2026-10 第二批起，原作新增的房間 14 種、門窗 7 種、牆 3 種本工具都有（代號相同），照讀，不再換成最接近的種類；
 * 每間房的牆種類（`rooms[].wall`）、外觀層的「顯示內部」（`floors[].showInside`、`inside`）也照讀。
 * 棋子方格（v1.07 的 tokenGrid）2026-10 第一批起照讀。
 * 2026-10 第三批起原作新增的家具 234 種也都有了（代號相同），照讀；疊在牆上的牆洞、崩塌不再換成牆上的破洞（D46）。
 */
import type { OpeningKind, RoomCategory, WallKind } from './types';

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
 * 原作 v1.05～v1.10 新增的家具代號（2.2.1）。2026-10 第三批起本工具都有（代號相同、畫法與名稱是本站的），
 * 讀檔時原樣保留；疊在牆上的 5 種（牆洞、崩塌、裂痕、彈孔、觸手）是本工具的貼牆素材（F233），
 * 不再換成牆上的破洞（D46，原本 D23）。讀檔的程式不查這張表；留著當作對照與測試的依據。
 */
export const UPSTREAM_ITEMS_V105: readonly string[] = [
  'anvil',
  'armor_stand',
  'banner',
  'bunk_bed',
  'cauldron',
  'chest',
  'crystal_ball',
  'forge',
  'fountain',
  'gazebo',
  'grave',
  'hay',
  'hedge',
  'ladder',
  'quest_board',
  'shed',
  'spike_trap',
  'stairs_down',
  'statue',
  'throne',
  'torch',
  'trapdoor',
  'weapon_rack',
];

export const UPSTREAM_ITEMS_V106: readonly string[] = [
  'abyss',
  'ac_unit',
  'airplane',
  'alarm',
  'ambulance',
  'anchor',
  'andon',
  'antenna',
  'atm',
  'bag',
  'bamboo',
  'bamboo_fence',
  'barricade',
  'big_crate',
  'big_tank',
  'bird',
  'black_stain',
  'boiler',
  'bollard',
  'bollard_post',
  'bonsho',
  'breaker',
  'broken_furniture',
  'buddha_altar',
  'buffer_stop',
  'building_materials',
  'bulldozer',
  'bullet_holes',
  'burn',
  'byobu',
  'cable_rack',
  'camera',
  'card_reader',
  'cardboard',
  'casings',
  'cat',
  'cctv',
  'chains',
  'chart_table',
  'cliff',
  'collapse_wall',
  'cone',
  'confessional',
  'container',
  'control_panel',
  'conveyor',
  'crack_wall',
  'crane_truck',
  'crosswalk',
  'cursed_item',
  'decon_shower',
  'desk_island',
  'display_case',
  'dist_board',
  'dog',
  'dog_big',
  'drag_marks',
  'drum',
  'duct',
  'em_generator',
  'enemy_humanoid',
  'engawa_deck',
  'excavator',
  'ext_stairs',
  'extinguisher',
  'fence_item',
  'file_folder',
  'fingerprint',
  'fire_escape',
  'fire_truck',
  'flashlight',
  'flesh',
  'font',
  'forklift',
  'freezer',
  'fridge_case',
  'fume_hood',
  'fusuma',
  'garden_rock',
  'generator',
  'grating',
  'guardrail',
  'gun_rack',
  'gutter',
  'hand_cart',
  'handrail',
  'helicopter',
  'helm',
  'hydrant',
  'ind_tank',
  'katanakake',
  'kiosk',
  'landslide',
  'laptop',
  'lifeboat',
  'liferaft',
  'locomotive',
  'machine_tool',
  'manhole',
  'material_pile',
  'microscope',
  'monitor_wall',
  'monster',
  'monster_boss',
  'monster_huge',
  'monster_large',
  'monster_small',
  'moss',
  'npc_bound',
  'npc_child',
  'npc_doctor',
  'npc_elder',
  'npc_guard',
  'npc_lying',
  'npc_man',
  'npc_nurse',
  'npc_police',
  'npc_robed',
  'npc_sailor',
  'npc_scientist',
  'npc_sitting',
  'npc_soldier',
  'npc_standing',
  'npc_station',
  'npc_woman',
  'npc_worker',
  'offering',
  'ops_table',
  'organ',
  'painting',
  'pallet',
  'pallet_rack',
  'pallet_stack',
  'papers',
  'parking_stall',
  'partition',
  'pedestal',
  'pine',
  'pipe',
  'pipe_big',
  'platform_edge',
  'pod',
  'police_car',
  'pond',
  'puddle',
  'pump',
  'radar',
  'radio',
  'rail_switch',
  'rail_track',
  'recorder',
  'register',
  'ritual_table',
  'road',
  'road_arrow',
  'road_sign',
  'rope_barrier',
  'sandbags',
  'sarcophagus',
  'scaffold',
  'service_entrance',
  'ship_engine',
  'ship_hatch',
  'shishiodoshi',
  'shoji',
  'site_fence',
  'skeleton',
  'sleepers',
  'sluice',
  'station_bench',
  'station_sign',
  'stele',
  'stepping',
  'stone_bridge',
  'store_shelf',
  'streetlight',
  'supply_shelf',
  'suv',
  'tank_mil',
  'tatami',
  'tea_house',
  'temp_stairs',
  'tendrils',
  'ticket_gate',
  'ticket_machine',
  'tool_shelf',
  'tools',
  'totem',
  'traffic_light',
  'train_car',
  'truck',
  'tsukubai',
  'utility_pole',
  'valve',
  'van',
  'vent',
  'vent_unit',
  'wall_hole',
  'wallet',
  'water_pipe',
  'water_tower',
  'wild_animal',
  'wood_bridge',
  'workbench',
  'zabuton',
  'zataku',
];

export const UPSTREAM_ITEMS_V110: readonly string[] = [
  'bed_canopy',
  'jizo',
  'sandbox',
  'slide',
  'swing',
];

/** 原作疊在牆上的素材（本工具的貼牆素材，F233） */
export const UPSTREAM_WALL_ITEMS: readonly string[] = [
  'crack_wall',
  'collapse_wall',
  'wall_hole',
  'bullet_holes',
  'tendrils',
];

export type CompatType = 'room' | 'opening' | 'wall';

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
