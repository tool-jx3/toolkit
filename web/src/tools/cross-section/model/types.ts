/**
 * 斷面圖的資料：一棟建築從側面切開的樣子（地上與地下的樓層、每層的區域、貫穿樓層的通道、側面的設備與家具、備註）。
 *
 * 座標的單位是「格」（1 格約 0.55 m）：建築的左上角是 (0, 0)，x 往右、y 往下；最上面一層的頂是 y＝0。
 * 區域的左右是整數格（`x0`～`x1`），樓層的高度是 5 或 6 格。
 *
 * 第二批（2026-11-27）：橫向的連結車廂（`mode: 'train'`、`train`：最多 10 節、每節 14 × 6 格，車廂裡的區域、連結器、
 * 床下的祕密空間；列車的設備與備註放在 `train.items`、`train.notes`，和建築的分開），區域的 `open`（CCFOLIA 房間 ZIP
 * 一開始就公開、不蓋遮罩）。同一份作品同時帶建築與列車，`mode` 決定畫面上編輯哪一邊。`ccfolia` 照原樣保留（不用）。
 */

/** 圖面的樣式 */
export type StyleId = 'color' | 'blueprint' | 'parchment' | 'draft' | 'noir' | 'terminal';
export const STYLE_IDS: readonly StyleId[] = [
  'color',
  'blueprint',
  'parchment',
  'draft',
  'noir',
  'terminal',
];

/** 環境：前三種是事件前（平常），最後一種是事件後 */
export type EnvId = 'day' | 'night' | 'blackout' | 'after';
export const ENV_IDS: readonly EnvId[] = ['day', 'night', 'blackout', 'after'];

/** 地上的天空與天候 */
export type SkyId = 'clear' | 'dusk' | 'rain' | 'storm';
export const SKY_IDS: readonly SkyId[] = ['clear', 'dusk', 'rain', 'storm'];

/** 屋頂：平屋頂＋天線、切妻（洋館）、鋸齒（工廠） */
export type RoofId = 'flat' | 'gable' | 'sawtooth';
export const ROOF_IDS: readonly RoofId[] = ['flat', 'gable', 'sawtooth'];

/** 內牆的材質 */
export type WallTone = 'plaster' | 'concrete' | 'tile' | 'wood' | 'stone' | 'brick' | 'metal';
export const WALL_TONES: readonly WallTone[] = [
  'plaster',
  'concrete',
  'tile',
  'wood',
  'stone',
  'brick',
  'metal',
];

/** 縱向通道 */
export type ShaftKind = 'elevator' | 'switchback' | 'stairs' | 'ladder' | 'duct';
export const SHAFT_KINDS: readonly ShaftKind[] = [
  'elevator',
  'switchback',
  'stairs',
  'ladder',
  'duct',
];

/** 電梯車廂：照常／事件後掉落／一直是掉落、傾斜的樣子 */
export type CabState = 'normal' | 'fallsAfter' | 'fallen';
export const CAB_STATES: readonly CabState[] = ['normal', 'fallsAfter', 'fallen'];

/** 事件前、事件後（和室內平面圖相同的叫法） */
export type Moment = 'before' | 'after';

/** 給誰看：GM 用、PL 用（祕密區域偽裝）、公開差分用（祕密區域照常畫，GM 專用的東西拿掉） */
export type Audience = 'gm' | 'player' | 'reveal';

export type NoteStyle = 'box' | 'badge';

/** 區域的用途（選了會重新擺那種用途的設備） */
export type RoomUse =
  | 'lobby'
  | 'office'
  | 'lab'
  | 'surgery'
  | 'control'
  | 'cell'
  | 'ward'
  | 'library'
  | 'kitchen'
  | 'machine'
  | 'storage'
  | 'ritual'
  | 'empty';

export interface Room {
  id: string;
  name: string;
  use: RoomUse;
  wall: WallTone;
  /** 祕密區域：PL 用的圖裡偽裝成牆或地層 */
  secret: boolean;
  /** PL 用的圖不寫名字 */
  hideName: boolean;
  x0: number;
  x1: number;
  /** 第二批（CCFOLIA 房間 ZIP）：一開始就公開，不蓋遮罩 */
  open?: boolean;
}

export interface Floor {
  id: string;
  /** 1＝1F、2＝2F…；-1＝B1F；沒有 0 */
  level: number;
  /** 樓層的名字（清單與房間的屬性裡顯示，不畫在圖上） */
  name: string;
  rooms: Room[];
}

export interface Shaft {
  id: string;
  kind: ShaftKind;
  /** 左端的格 */
  x: number;
  /** 上端、下端的樓層（level；top ≥ bottom） */
  top: number;
  bottom: number;
  /** 電梯車廂停在哪一層 */
  cab: number;
  cabState: CabState;
  /** GM 專用（祕密通風管一律是） */
  secret: boolean;
}

export interface Fixture {
  id: string;
  /** 放在哪一個區域 */
  room: string;
  kind: string;
  /** 在區域裡的左右位置（0～1） */
  rx: number;
  /** 牆上的東西的高度（0＝天花板、1＝地板） */
  ry: number;
  scale: number;
  flip: boolean;
  /** 出現的時機：沒有＝都有 */
  only?: Moment;
  /** 事件後倒下・翻亂 */
  upset?: boolean;
  /** 事件後破損（門、窗） */
  smashed?: boolean;
  /** GM 專用 */
  secret?: boolean;
  /** 樣式（鍋爐／變電設備、實驗台／廚房流理台） */
  variant?: string;
}

export interface Note {
  id: string;
  text: string;
  style: NoteStyle;
  /** 字級（格） */
  size: number;
  only?: Moment;
  secret?: boolean;
  /** 放在哪一個區域（跟著區域移動）；null＝放在區域外（世界座標 x、y） */
  room: string | null;
  rx: number;
  ry: number;
  x: number;
  y: number;
}

export interface Building {
  /** 建築寬（格） */
  width: number;
  /** 樓層高（格） */
  storey: number;
  roof: RoofId;
  /** 顯示屋頂層（RF） */
  rooftop: boolean;
  floors: Floor[];
  shafts: Shaft[];
}

/** 編輯哪一邊：縱向的建築斷面、橫向的連結車廂 */
export type Mode = 'building' | 'train';

/* ---------- 橫向的連結車廂（第二批） ---------- */

/** 車廂的種類（9 種）：機關車、一等個室臥鋪、二段臥鋪、餐車、休息・沙龍車、普通客車、行李・貨物車、展望車（最後尾）、監視・護送車 */
export type CarType =
  | 'loco'
  | 'suite'
  | 'berth'
  | 'dining'
  | 'lounge'
  | 'coach'
  | 'baggage'
  | 'observation'
  | 'escort';
export const CAR_TYPES: readonly CarType[] = [
  'loco',
  'suite',
  'berth',
  'dining',
  'lounge',
  'coach',
  'baggage',
  'observation',
  'escort',
];

/** 和下一節之間的連結器：照常、上鎖、鐵柵、分離 */
export type Coupler = 'normal' | 'locked' | 'bars' | 'split';
export const COUPLERS: readonly Coupler[] = ['normal', 'locked', 'bars', 'split'];

/** 車外的景色：夜行・星空與鐵軌、暴風雪・雪原、霧中高架橋、隧道內（完全封閉）、白天的田園 */
export type Scenery = 'starlit' | 'blizzard' | 'viaduct' | 'tunnel' | 'meadow';
export const SCENERIES: readonly Scenery[] = ['starlit', 'blizzard', 'viaduct', 'tunnel', 'meadow'];

/** 排法：自動（4 節以上兩段折返）、一列、兩段折返 */
export type Arrange = 'auto' | 'single' | 'folded';
export const ARRANGES: readonly Arrange[] = ['auto', 'single', 'folded'];

/** 機關車：蒸氣、電氣 */
export type LocoKind = 'steam' | 'electric';
export const LOCO_KINDS: readonly LocoKind[] = ['steam', 'electric'];

/** 車廂裡的一間（左右是車廂裡的格：0～14） */
export interface CarRoom {
  id: string;
  name: string;
  wall: WallTone;
  secret: boolean;
  hideName: boolean;
  x0: number;
  x1: number;
  /** CCFOLIA 房間 ZIP：一開始就公開 */
  open?: boolean;
  /** 機關車的駕駛室、機器室；展望車最後面的展望台 */
  role?: 'cab' | 'engine' | 'deck';
}

export interface Car {
  id: string;
  type: CarType;
  name: string;
  rooms: CarRoom[];
  /** 和下一節之間的連結器（最後一節不畫） */
  coupler: Coupler;
  /** 車頂的艙口 */
  hatch: boolean;
  /** 床下的祕密空間（前後轉向架之間；機關車沒有） */
  under: boolean;
  underName: string;
}

export interface Train {
  arrange: Arrange;
  loco: LocoKind;
  scenery: Scenery;
  /** 車頂的移動路線 */
  roofRoute: boolean;
  cars: Car[];
  /** 列車的設備與備註（和建築的分開放，room 是車廂裡的區域） */
  items: Fixture[];
  notes: Note[];
}

export interface SectionDoc {
  /** 畫面上編輯哪一邊（第二批加 'train'） */
  mode: Mode;
  title: string;
  subtitle: string;
  style: StyleId;
  env: EnvId;
  sky: SkyId;
  flood: boolean;
  /** 淹水的水位（地下部分的百分比） */
  floodLevel: number;
  /** 紙的老舊（0～100） */
  wear: number;
  /** 污漬、地層顆粒、樹林剪影的配置 */
  seed: number;
  grid: boolean;
  labels: boolean;
  elevation: boolean;
  frame: boolean;
  building: Building;
  items: Fixture[];
  notes: Note[];
  /** 橫向的連結車廂（第二批；第一次切到橫向時才建立） */
  train?: Train;
  /** 讀進來的資料照原樣保留（CCFOLIA 房間 ZIP 的設定放在偏好，不放這裡） */
  ccfolia?: unknown;
}

/* ---------- 數值 ---------- */

export const WIDTHS = [30, 36, 40, 44, 48] as const;
export const STOREYS = [5, 6] as const;
export const MAX_FLOORS = 12;
/** 一間區域最窄幾格 */
export const MIN_ROOM = 4;
/** 一層最多幾間 */
export const MAX_ROOMS = 5;

export const SHAFT_WIDTH: Record<ShaftKind, number> = {
  elevator: 3,
  switchback: 4,
  stairs: 3,
  ladder: 2,
  duct: 1,
};

export const CAPS = {
  title: 64,
  subtitle: 80,
  name: 48,
  note: 60,
  /** 一張圖最多幾件設備、幾則備註（存檔的安全上限） */
  items: 600,
  notes: 200,
} as const;

export const RANGES = {
  rx: { min: 0.05, max: 0.95 },
  ry: { min: 0.18, max: 0.82 },
  scale: { min: 0.6, max: 1.4, step: 0.05 },
  flood: { min: 0, max: 100, step: 2, def: 34 },
  wear: { min: 0, max: 100, step: 2 },
  noteSize: { min: 0.3, max: 1.2, def: 0.46 },
} as const;

/** 列車：每節 14 × 6 格、連結的間隔 1 格、最多 10 節；車廂裡一間至少 3 格（所以最多 4 間） */
export const CAR_W = 14;
export const CAR_H = 6;
export const CAR_GAP = 1;
export const MAX_CARS = 10;
export const MIN_CAR_ROOM = 3;
export const MAX_CAR_ROOMS = 4;

/** 1 格約幾公尺（比例尺） */
export const CELL_M = 0.55;

export const isEnv = (v: unknown): v is EnvId => ENV_IDS.includes(v as EnvId);
export const momentOfEnv = (env: EnvId): Moment => (env === 'after' ? 'after' : 'before');

/** 樓層的代號：1F、2F…、B1F… */
export const levelTag = (level: number): string => (level > 0 ? `${level}F` : `B${-level}F`);

export type SelKind = 'room' | 'shaft' | 'item' | 'note' | 'car';
export interface SelRef {
  kind: SelKind;
  id: string;
}
