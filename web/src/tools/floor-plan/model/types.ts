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
  | 'platewin'
  /* 2026-10-29 跟進原作 v1.15 */
  | 'slidingc';

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

/**
 * 顯示樣式。2026-10-29 加 `noir`（黑色電影）、`terminal`（監視終端），參考 KIIN マップ制作スタジオ的兩種樣式，
 * 配色與效果本站自己設計（規格 F261、F262）。
 */
export type ThemeId = 'clean' | 'mono' | 'blueprint' | 'paper' | 'horror' | 'noir' | 'terminal';

/** 房間面積的顯示：不顯示、坪、平方公尺、長寬（m） */
export type SizeMode = 'none' | 'ping' | 'm2' | 'm';

/** 房間外框的角：左上、右上、右下、左下 */
export type Corner = 'nw' | 'ne' | 'se' | 'sw';

/**
 * L 形房間的缺角（2026-10-29，參考 KIIN；規格 F257、3.14.1）：外框的 c 那個角缺一塊 w × h（整格；
 * 1～外框減 1）。model/shape.ts。
 */
export interface RoomCut {
  c: Corner;
  w: number;
  h: number;
}

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
  /** L 形房間的缺角（沒有＝長方形；2026-10-29） */
  cut?: RoomCut;
  /**
   * 地板（沒有＝依種類的底色與花紋；2026-11-05 參考 KIIN v2.0 的「床の素材」，規格 F282）：地毯、水面、格柵。
   * 只換底色與花紋，牆照種類的規則。
   */
  floor?: FloorMaterial;
  /**
   * 曲線的房間（2026-11-05 跟進 KIIN v2.0 第二批，規格 F289、3.17.1）：外框（x、y、w、h）裡的形狀，沒有＝長方形（或 L 形）。
   * 和 `cut` 不會同時有。model/curve.ts。
   */
  shape?: RoomShape;
  /** 圓角的半徑、八角形的倒角寬（格，0.5 一格；沒有＝預設），只有 `round`、`chamfer` 用 */
  radius?: number;
  /**
   * 甲板的外圍（2026-11-05 第二批，F299；主控裁定 D102）：甲板類的房間（陽台・露台、屋頂平台、甲板）疊在戶外房間上時
   * 疊放的邊畫欄杆、疊在甲板上時畫段差線。只在 true 時寫；新畫的甲板類房間才有，舊的地圖沒有＝照以前的規則（沒有牆）。
   */
  deck?: boolean;
  /**
   * 榻榻米的鋪法（2026-11-12 參考 KIIN v3.0，規格 F334）：祝儀鋪法、不祝儀鋪法、半疊市松。只在地板是榻榻米時有作用
   * （和室、或地板選了榻榻米）；沒有＝原本的畫法（依房間大小交錯排）。
   */
  tatami?: TatamiLayout;
}

/** 榻榻米的鋪法（2026-11-12，F334；model/tatami.ts） */
export type TatamiLayout = 'shugi' | 'fushugi' | 'ryukyu';

/**
 * 曲線的房間的形狀（2026-11-05，F289）：圓・橢圓、圓角、八角形（倒角）、圓頂（半圓）、船首、船體；
 * 後三種是「朝哪一邊」（n 上、e 右、s 下、w 左）。
 */
export type RoomShape =
  | 'ellipse'
  | 'round'
  | 'chamfer'
  | 'dome-n'
  | 'dome-e'
  | 'dome-s'
  | 'dome-w'
  | 'bow-n'
  | 'bow-e'
  | 'bow-s'
  | 'bow-w'
  | 'hull-n'
  | 'hull-e'
  | 'hull-s'
  | 'hull-w';

/** 房間的地板（2026-11-05，F282；2026-11-12 加榻榻米，F334） */
export type FloorMaterial = 'carpet' | 'water' | 'grating' | 'tatami';

/** 手畫的牆（線段） */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WallKind;
  gm?: boolean;
  /** 出現的時機（2026-11-12，F329）：只在事件前／只在事件後；沒有＝兩種狀態都有 */
  only?: Moment;
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
  /** 出現的時機（2026-11-12，F329） */
  only?: Moment;
  /** 事件後破損（2026-11-12，F331：事件後的狀態畫成破掉的門窗、碎片散在兩側；只在 true 時寫） */
  smashed?: boolean;
}

/**
 * 家具、小物：外框 (x, y, w, h) 是轉向後的範圍；rot 是順時針的角度。
 * 2026-11-05（參考 KIIN v2.0，規格 F277）：rot 可以是 0～359 的任何整數度（15° 轉、1° 輸入、圓形配置）；
 * 外框照「最接近的 90°」決定寬深要不要對調（geometry.ts 的 itemLocalSize），畫的時候照實際的角度轉。
 */
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
  /**
   * 圓形配置的群組（2026-11-05，F279）：同一層、同一個 id 的家具是一圈，可以整圈換成 6／8 個、內外反轉；
   * 單獨移動或複製的那幾件離開群組。
   */
  ring?: string;
  /** 出現的時機（2026-11-12，F329） */
  only?: Moment;
  /** 事件後倒下・翻亂（2026-11-12，F331：事件後的狀態畫成歪倒的樣子；只在 true 時寫） */
  upset?: boolean;
}

/**
 * 自由線（2026-11-05，參考 KIIN v2.0 的「自由線」，規格 F285、F286）：兩端 (x1, y1)、(x2, y2) 與控制點 (cx, cy) 的二次曲線。
 * 只是畫在圖上的線（曲線的欄杆、內牆、段差、繩索、箭頭），不產生牆、不擋家具。
 */
export type LineKind = 'rail' | 'wall' | 'step' | 'rope' | 'arrow';

export interface FreeLine {
  id: string;
  kind: LineKind;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  /** 線的粗細倍率（0.5～3；沒有＝1） */
  w?: number;
  gm?: boolean;
  /** 出現的時機（2026-11-12，F329） */
  only?: Moment;
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
  /** 出現的時機（2026-11-12，F329） */
  only?: Moment;
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  items: Item[];
  texts: TextLabel[];
  /** 自由線（2026-11-05，F285；沒有或空的時候不寫） */
  lines?: FreeLine[];
  /**
   * 外觀層的「顯示內部」（2026-10 第二批，原作 v1.12）：拿掉這一層的屋頂，把 `inside` 那一層的內容疊在同樣的位置
   * （畫面與匯出；model/interior.ts）。只在 true 時寫。
   */
  showInside?: boolean;
  /** 疊上來的樓層的 id（沒有或找不到時用第一個別的樓層） */
  inside?: string;
  /**
   * 祕密樓層（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的「PL秘密階」，規格 F307）：PL 檢視、PL 用的圖與連結裡
   * 整層只剩房間的輪廓與「？？？」。GM 檢視、GM 用與揭露用的圖照常。只在 true 時寫。
   */
  secret?: boolean;
  /**
   * 畫的時候用的標記（不存檔）：這一份已經照「事件前／事件後」整理過（model/moment.ts 的 momentFloor），不要再整理一次。
   */
  shownAt?: Moment;
}

/**
 * 事件前後（2026-11-12 參考 KIIN「マップ制作スタジオ」v3.0 的「状態差分」，規格 F329～F336、3.20）：
 * 同一張地圖有「事件前」與「事件後」兩種狀態。家具、文字、自由線、手畫的牆、門窗可以設「只在事件前」「只在事件後」
 * （`only`；沒有＝兩種都有），家具可以設「事件後倒下・翻亂」（`upset`）、門窗「事件後破損」（`smashed`），
 * 地圖可以設「事件後才停電」（`Project.blackout`）。房間不分狀態（兩種狀態的格局一樣，圖對得齊）。
 */
export type Moment = 'before' | 'after';

/**
 * 立體樓層圖的視角（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」，規格 F304、3.18）：
 * angle＝水平旋轉（度，−180～180）、pitch＝俯視的壓扁比例（0.35～0.82，畫面上的縱向＝sin(俯角)）、
 * gap＝樓層間距的倍率（0.65～1.8）、rise＝樓梯段高的倍率（0.5～2.2）。model/stack.ts。
 */
export interface StackCamera {
  angle: number;
  pitch: number;
  gap: number;
  rise: number;
}

/**
 * 演出（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的「04 演出」，規格 F313～F328、3.19）：
 * 一開始藏起來的房間與樓層、移動路線（箭頭）。**演出用的狀態**：只在演出的畫面（播放、逐步公開、演出的匯出）作用，
 * 平面編輯、一般的 PL 檢視與匯出照舊（PL 永遠看不到的請用 GM 專用與祕密樓層）。model/stage.ts。
 *
 * 房間什麼時候公開（`when`）：沒有＝自動（第一條碰到這間房的路線、或經過這間房的樓梯的路線）；
 * `route:<id>`＝和那一條路線同時；`after`＝所有路線之後依序（`order` 小的先）；`manual`＝播放時不公開，點一下才公開。
 */
export type StageWhen = 'after' | 'manual' | `route:${string}`;

export interface StageRoom {
  /** 樓層的 id */
  floor: string;
  /** 房間的 id */
  room: string;
  when?: StageWhen;
  /** 「所有路線之後」的順序（小的先；沒有＝排在後面） */
  order?: number;
}

/**
 * 移動路線（箭頭）：一條在一層樓上（`floor`）。兩端 (x1, y1)、(x2, y2) 與控制點 (cx, cy)；
 * `pts`＝照門、走廊、樓梯算出來的折線（點房間連起來的；沒有＝自由的二次曲線）。播放的順序＝陣列的順序。
 */
export interface StageRoute {
  id: string;
  floor: string;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  pts?: [number, number][];
  /** 線的粗細倍率（沒有＝1；點房間連起來的是 1.15） */
  w?: number;
}

export interface StagePlan {
  /** 一開始藏起來（「？？？」）的房間 */
  rooms?: StageRoom[];
  /** 一開始整層藏起來的樓層（id） */
  floors?: string[];
  routes?: StageRoute[];
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
  /** 紙的污漬與摺痕的強度（0.1～1；沒有＝不畫；2026-10-29，F263） */
  wear?: number;
  /** 污漬與摺痕的位置的種子（整數；關掉時也留著，再打開是同一組） */
  wearSeed?: number;
  /** 座標標示（A1、B2…；2026-10-29，F264） */
  coords?: boolean;
  /** 改房間大小時家具不跟著移動（2026-10-29，F254；沒有＝跟著） */
  fixedFurniture?: boolean;
  /**
   * 夜的暗度（0.05～0.85；沒有＝白天，不畫；2026-11-05 參考 KIIN v2.0 的「夜の暗さと明かり」，規格 F273）。
   * 燭台、壁爐、魔法陣、螢幕、窗…是光源，照亮所在的房間。
   */
  night?: number;
  /**
   * 立體樓層圖與樓層總覽的視角（2026-11-09，F304；沒有＝預設的視角，和預設相同時不寫）。
   * 改視角不算復原的步驟（同切換樓層）。
   */
  stack?: StackCamera;
  /**
   * 演出（2026-11-09，F313、F327；沒有或空的時候不寫）：藏起來的房間與樓層、移動路線。和祕密樓層（`floors[].secret`）分開存。
   * 編輯演出算復原的步驟；播放時的公開是暫時的（不改這裡）。
   */
  stage?: StagePlan;
  /**
   * 目前顯示的狀態（2026-11-12，F330）：`after`＝事件後；沒有＝事件前。同切換樓層，不算一步復原。
   */
  moment?: 'after';
  /**
   * 事件後才停電（2026-11-12，F332）：事件前不畫夜色；事件後畫夜色（沒設夜的暗度時用 55%）。只在 true 時寫。
   */
  blackout?: boolean;
}

/** 可以選取的東西 */
export type ObjType = 'room' | 'item' | 'opening' | 'wall' | 'text' | 'line';

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
  line: 'lines',
} as const satisfies Record<ObjType, keyof Floor>;

export const OBJ_TYPES: readonly ObjType[] = ['room', 'item', 'opening', 'wall', 'text', 'line'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
