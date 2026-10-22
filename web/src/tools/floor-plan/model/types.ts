/**
 * 室內平面圖的資料（存檔、專案檔、範本共用）。
 *
 * 座標單位是「格」（1 格 = 0.5 m）：房間在整數格上，家具、門窗、文字以 0.25 格為單位。
 * 牆壁不存：每次由房間的範圍算出來（walls.ts）；`walls` 只放手畫的牆（隔間、圍籬…）。
 */

/** 房間種類（決定底色、地板花紋、外牆畫法） */
export type RoomCategory =
  | 'living'
  | 'bedroom'
  | 'washitsu'
  | 'kitchen'
  | 'wet'
  | 'hall'
  | 'storage'
  | 'public'
  | 'office'
  | 'medical'
  | 'special'
  | 'danger'
  | 'garage'
  | 'balcony'
  | 'garden'
  | 'porch'
  | 'doma'
  | 'tech'
  | 'field'
  | 'water'
  | 'cave'
  /* 2026-10 第二批（原作 v1.05）：室內 */
  | 'engawa'
  | 'studio'
  | 'stone'
  | 'roof'
  /* 2026-10 第二批（原作 v1.06）：室內 */
  | 'industrial'
  | 'grate'
  /* 2026-10 第二批（原作 v1.06）：戶外 */
  | 'platform'
  | 'track'
  | 'road'
  | 'rooftop'
  | 'slab'
  | 'dirt'
  | 'gravel'
  | 'shipdeck';

/** 門窗種類 */
export type OpeningKind =
  | 'door'
  | 'door2'
  | 'sliding'
  | 'sliding2'
  | 'folding'
  | 'auto'
  | 'shutter'
  | 'open'
  | 'locked'
  | 'secret'
  | 'broken'
  | 'hole'
  | 'window'
  | 'window2'
  | 'barred'
  | 'boarded'
  | 'brokenwin'
  /* 2026-10 第二批（原作 v1.06） */
  | 'steel'
  | 'firedoor'
  | 'gate'
  | 'big2'
  | 'sealed'
  /* 2026-10 第二批（原作 v1.10） */
  | 'revolve'
  | 'platewin';

/**
 * 牆的種類。自動牆依房間產生 ext、int、rail、rock，或房間設的牆種類（`Room.wall`，2026-10 第二批）；其他是手畫的牆。
 */
export type WallKind =
  | 'ext'
  | 'int'
  | 'thin'
  | 'glass'
  | 'rail'
  | 'fence'
  | 'bars'
  | 'broken'
  | 'rock'
  /* 2026-10 第二批（原作 v1.05、v1.10） */
  | 'stone'
  | 'sound'
  | 'cracked';

export type ThemeId = 'clean' | 'mono' | 'blueprint' | 'paper' | 'horror';

/** 房間面積的顯示：不顯示、坪、平方公尺、長寬（m） */
export type SizeMode = 'none' | 'ping' | 'm2' | 'm';

export interface Room {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  cat: RoomCategory;
  /** 給 PL 看的名字（空白＝與 name 相同） */
  plName?: string;
  /** GM 筆記（不會畫進圖） */
  note?: string;
  /** 自訂底色（沒有時依種類） */
  color?: string;
  /** 只有 GM 看得到（PL 檢視只留牆框、裡面蓋灰） */
  gm?: boolean;
  /** 不畫名字 */
  hideLabel?: boolean;
  /** 不產生牆（例如客餐廳的分區） */
  noWall?: boolean;
  /** 鎖定（不能移動、縮放、旋轉、刪除） */
  locked?: boolean;
  /** 名字的位移（格） */
  lx?: number;
  ly?: number;
  /**
   * 這間房外圍的自動牆的種類（沒有＝依規則的外牆／內牆；2026-10 第二批，原作 v1.05 的 `wall`）。
   * 相鄰的兩間都有設時取比較厚的；戶外房間沒有作用（walls.ts）。
   */
  wall?: WallKind;
}

/** 手畫的牆（線段） */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WallKind;
  gm?: boolean;
}

/**
 * 門窗：放在橫線（o＝'h'，y 固定、x 從 x 到 x＋len）或直線（o＝'v'，x 固定、y 從 y 到 y＋len）上。
 * side：門往哪一側開（橫線 +1＝往下、直線 +1＝往右）。hinge：鉸鍊在起點（0）或終點（1）。
 */
export interface Opening {
  id: string;
  kind: OpeningKind;
  o: 'h' | 'v';
  x: number;
  y: number;
  len: number;
  side: 1 | -1;
  hinge: 0 | 1;
  gm?: boolean;
}

/** 家具、小物：外框 (x, y, w, h) 是轉向後的範圍；rot 0／90／180／270（順時針） */
export interface Item {
  id: string;
  /** 家具種類（furniture 目錄的 id） */
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flip?: boolean;
  label?: string;
  color?: string;
  gm?: boolean;
  /** 隱藏線索（可以另外切換顯示） */
  clue?: boolean;
}

/** 地圖上的文字（x、y 是中心） */
export interface TextLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  /** 字級（格；預設 0.7） */
  size?: number;
  /** false＝一般粗細（預設粗體） */
  bold?: boolean;
  color?: string;
  gm?: boolean;
  clue?: boolean;
  /** 圓標（深色的圓裡寫白字，例如房間編號；2026-10） */
  badge?: boolean;
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  items: Item[];
  texts: TextLabel[];
  /**
   * 外觀層的「顯示內部」（2026-10 第二批，原作 v1.12）：拿掉這一層的屋頂，把 `inside` 那一層的內容疊在同樣的位置
   * （畫面與匯出；model/interior.ts）。只在 true 時寫。
   */
  showInside?: boolean;
  /** 疊上來的樓層的 id（沒有或找不到時用第一個別的樓層） */
  inside?: string;
}

/** 棋子方格的大小（格；1 格＝0.5 m）：0.5／1／1.5／2／3 m */
export type TokenGridSize = 1 | 2 | 3 | 4 | 6;

export interface Project {
  name: string;
  theme: ThemeId;
  showSize: SizeMode;
  showNames: boolean;
  floors: Floor[];
  /** 目前編輯的樓層 */
  active: number;
  /** 棋子方格的大小（格；1／2／3／4／6＝0.5／1／1.5／2／3 m）；沒有或 0＝不顯示（2026-10，原作 v1.07） */
  tokenGrid?: TokenGridSize;
  /** 棋子方格的線色（#rrggbb；沒有＝依樣式） */
  tokenGridColor?: string;
  /** 棋子方格的不透明度（0.1～1；沒有＝0.4） */
  tokenGridOpacity?: number;
}

/** 可以選取的東西 */
export type ObjType = 'room' | 'item' | 'opening' | 'wall' | 'text';

export interface SelRef {
  type: ObjType;
  id: string;
}

/** 種類 → 樓層裡的陣列 */
export const TYPE_KEY = {
  room: 'rooms',
  item: 'items',
  opening: 'openings',
  wall: 'walls',
  text: 'texts',
} as const satisfies Record<ObjType, keyof Floor>;

export const OBJ_TYPES: readonly ObjType[] = ['room', 'item', 'opening', 'wall', 'text'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
