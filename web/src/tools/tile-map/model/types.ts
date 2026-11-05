/**
 * 圖塊地圖的資料（純資料，不依賴瀏覽器）。
 *
 * - 地圖是固定大小的方格（寬 × 高格），好幾個圖層，每個圖層每一格放一個圖塊（或空的）。
 * - 圖塊（TileDef）＝來源圖的一塊長方形；「大圖塊」佔好幾格（span），每一格記它是大圖塊的哪一塊（p）與屬於哪一次放置（i），
 *   所以裁切、圖層合成、分頁輸出都只看單格，而選取、搬動、擦掉時整個大圖塊一起動。
 * - 地圖用到的自訂圖塊的定義一律記在地圖裡（defs）：圖庫刪掉了、或把專案檔帶到別的瀏覽器，地圖上的圖照樣畫得出來。
 */

/** 順時針轉幾個 90° */
export type Turn = 0 | 1 | 2 | 3;

/** 圖層的不透明度（只有這五段） */
export type Opacity = 0 | 0.25 | 0.5 | 0.75 | 1;
export const OPACITIES: readonly Opacity[] = [0, 0.25, 0.5, 0.75, 1];

/** 來源圖上的長方形 [x, y, 寬, 高]（px） */
export type Rect = readonly [number, number, number, number];

export interface TileDef {
  id: string;
  name: string;
  /** 來源圖：內建圖塊組的圖（`builtin:<名稱>`）或自訂圖片的資產 id */
  src: string;
  rect: Rect;
  /** 大圖塊佔的格數 [欄, 列]（沒有＝1 × 1） */
  span?: readonly [number, number];
  /** 大圖塊在來源圖上每一小格之間的間隔（px；切圖塊表時的「間距」） */
  gap?: number;
  /** 像素圖（放大時不模糊；自訂圖塊預設是） */
  pixel: boolean;
  /** 分類（內建圖塊組才有：floor、wall、prop、character、item） */
  cat?: string;
  /** 所屬的圖塊組 id */
  set: string;
}

/** 一格放的圖塊 */
export interface Placed {
  /** 圖塊 id */
  t: string;
  /** 順時針轉幾個 90° */
  r: Turn;
  /** 左右翻轉 */
  f: boolean;
  /** 大圖塊：這一次放置的編號（同一個大圖塊的每一格相同） */
  i?: string;
  /** 大圖塊：這一格是來源的第幾欄、第幾列（未轉向的座標） */
  p?: readonly [number, number];
}

export type Cell = Placed | null;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: Opacity;
  /** 寬 × 高格，由左到右、由上到下 */
  cells: readonly Cell[];
}

export interface TileMap {
  name: string;
  /** 格數 */
  width: number;
  height: number;
  /** 背景色 #rrggbb */
  background: string;
  /** 由下到上（最後一個在最上面） */
  layers: readonly Layer[];
  /** 地圖用到的自訂圖塊的定義（內建圖塊不記） */
  defs: Readonly<Record<string, TileDef>>;
}

/** 數值與上限（規格第 3 節） */
export const LIMITS = {
  /** 地圖每邊的格數 */
  minSide: 4,
  maxSide: 200,
  /** 地圖的總格數 */
  maxCells: 40_000,
  /** 圖層數 */
  maxLayers: 12,
  /** 圖層名稱、地圖名稱、圖塊組名稱的字數 */
  maxName: 100,
  /** 復原的步數 */
  history: 100,
  /** 圖形對話框的寬高 */
  maxShape: 200,
} as const;

/** 畫面上 100% 時每格幾 px */
export const CELL_PX = 64;

export const DEFAULT_BACKGROUND = '#383d39';
export const DEFAULT_SIZE = { width: 40, height: 30 } as const;
