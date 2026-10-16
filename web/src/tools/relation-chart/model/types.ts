/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 專案資料的型別（規格 3.8）。欄位的意義照原作（角色、關係類型＝原作的 tag、關係線＝rel、分頁層級設定），
 * 結構是本站自己的：圖片、頭像框、匯入的字型都存資產 id。
 *
 * 第三批：角色分成三層（原作的做法）——分頁上的角色（實例：座標、重要度、釘選）、變體（外觀：名字、顏色、頭像、
 * 尺寸、框、標籤、數值）、條目（這個人：角色資訊、角色字型、統一顏色）。實例上仍留著變體與條目的外觀欄位
 * （副本，畫法引擎照舊讀攤平的角色）；變體才是正本，改動由 state/store 的 updateProject 同步（model/library.ts）。
 * 關係類型同樣綁一件關係庫的變體（名稱與樣式是副本；顯示、圖例、捆綁忽略是各分頁自己的）。
 *
 * 第四批：分頁多了便利貼（含圖表節點）、世界觀、備忘錄；專案多了便利貼庫（關閉過的便利貼）與設定集。
 */
import type { FramePlacement } from '@/core/image';

/** 顏色：`auto`（跟分頁預設／畫布配色）或色碼（#rrggbb、#rrggbbaa） */
export type ColorValue = string;

export type LineStyle =
  | 'solid'
  | 'dashed'
  | 'dotted'
  | 'wavy'
  | 'zigzag'
  | 'square'
  | 'lace'
  | 'hearts'
  | 'stars'
  | 'melody';

export type CapStyle =
  | 'arrow'
  | 'harrow'
  | 'dot'
  | 'hdot'
  | 'diamond'
  | 'hdiamond'
  | 'block'
  | 'bar'
  | 'heart'
  | 'star'
  | 'none';

export type Shape = '' | 'circle' | 'square';

/** 頭像圖片：成品（256 px 方形）、原圖、在框裡的位置（重新調整範圍用） */
export interface Avatar {
  img: string;
  src: string | null;
  place: FramePlacement | null;
}

/** 角色的字型：''＝跟隨文件字型；內建字型組或 `f:<資產 id>`（匯入的字型） */
export type CharFont = '' | FontValue;

/** 實例（分頁上的角色）；name～frame、font 是變體與條目的副本 */
export interface Char {
  id: number;
  /** 條目 id、變體 id（角色庫） */
  lib: number;
  vari: number;
  name: string;
  x: number;
  y: number;
  /** 預設名稱「角色 N」的 N（名字空白時用） */
  defNo: number;
  /** 重要度（整數，可負；越大越重要） */
  level: number;
  locked: boolean;
  relIgnore: boolean;
  /** 外框（頭像外圈、名字外框線、圖示與首字） */
  color: ColorValue;
  /** 顏色（頭像背景、名字填色） */
  nameColor: ColorValue;
  avatar: Avatar | null;
  icon: string | null;
  noAvatar: boolean;
  shape: Shape;
  noBorder: boolean;
  noBg: boolean;
  borderOn: boolean;
  bgOn: boolean;
  size: number | null;
  nameSize: number | null;
  borderW: number | null;
  labels: number[];
  /** 頭像框：null＝跟隨標籤、''＝不使用框、資產 id＝那張框（變體的副本） */
  frame: string | null;
  /** 角色字型（條目的副本） */
  font: CharFont;
}

/** 一個狀態的數值（範本 id、狀態名、軸 id → 值） */
export interface RadarVals {
  tpl: number;
  state: string;
  vals: Record<string, number>;
}

/** 變體：衣櫃裡的一件（外觀） */
export interface Variant {
  id: number;
  name: string;
  color: ColorValue;
  nameColor: ColorValue;
  avatar: Avatar | null;
  icon: string | null;
  noAvatar: boolean;
  shape: Shape;
  noBorder: boolean;
  noBg: boolean;
  borderOn: boolean;
  bgOn: boolean;
  size: number | null;
  nameSize: number | null;
  borderW: number | null;
  labels: number[];
  frame: string | null;
  radars: RadarVals[];
}

/** 角色庫的條目（這個人） */
export interface CharEntry {
  id: number;
  variants: Variant[];
  /** 確保是同一人（所有變體共用顏色） */
  unified: boolean;
  /** 角色資訊（淨化過的 HTML；圖片寫成 `rcimg:<資產 id>`） */
  info: string;
  font: CharFont;
}

export interface Rel {
  id: number;
  from: number;
  to: number;
  type: number;
  both: boolean;
  note: string;
  /** 線上標籤的位置（0.05～0.95）；null＝自動 */
  labelT: number | null;
  /** 手動彎曲（1＝正向弧、-1＝反向弧、0＝自動） */
  curveDir: 0 | 1 | -1;
  /** 與分頁設定相反地顯示／隱藏名稱、備註 */
  flipName: boolean;
  flipNote: boolean;
  /** 捆綁忽略（這條線） */
  pairSkip: boolean;
  /** 磁力（這條線；0＝跟隨關係類型） */
  mag: number;
  /** 自我關係的縮小頭貼角度（弧度）；null＝自動 */
  selfAng: number | null;
}

export interface RelType {
  id: number;
  /** 關係庫的條目與變體（0＝沒有綁定：刪掉變體之後，下次改動或開檔時重新收錄） */
  lib: number;
  vari: number;
  label: string;
  color: ColorValue;
  outlineColor: ColorValue;
  lineStyle: LineStyle;
  capStyle: CapStyle;
  /** 線條粗細（≥ 1）；null＝分頁預設 */
  lineW: number | null;
  /** 外框寬度（≥ 0）；null＝1 */
  outlineW: number | null;
  /** 磁力等級 1～5（3＝預設） */
  mag: number;
  hidden: boolean;
  hideInLegend: boolean;
  pairSkip: boolean;
}

/** 關係庫的變體（同一個關係概念的一種樣式；分頁上的關係類型的正本） */
export interface RelVariant {
  id: number;
  label: string;
  color: ColorValue;
  outlineColor: ColorValue;
  lineStyle: LineStyle;
  capStyle: CapStyle;
  lineW: number | null;
  outlineW: number | null;
  mag: number;
}

export interface RelEntry {
  id: number;
  variants: RelVariant[];
}

/* ---- 數值圖表（第三批，F192） ---- */

export type ChartKind = 'radar' | 'bar' | 'line' | 'pie' | 'gauge';

export interface RadarAxis {
  id: number;
  label: string;
  /** 上限（> 0） */
  max: number;
  unit: string;
}

/** 數值圖表的範本（整個專案共用） */
export interface RadarTpl {
  id: number;
  name: string;
  chart: ChartKind;
  /** 雷達圖的格線：多邊形／圓形 */
  shape: 'poly' | 'circle';
  /** 環數（雷達圖）或格線數（長條、折線）1～8 */
  rings: number;
  valMode: 'raw' | 'pct' | 'none';
  /** 全軸共用刻度 */
  shared: boolean;
  /** 3～12 軸 */
  axes: RadarAxis[];
}

/** 頭像框（資產 id＋名稱） */
export interface FrameItem {
  id: string;
  name: string;
}

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

/** 匯入的字型（資產 id＋名稱＋格式） */
export interface FontItem {
  id: string;
  name: string;
  fmt: FontFormat;
}

export type LegendPos =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topOut'
  | 'bottomOut'
  | 'leftOut'
  | 'rightOut';

export type LayoutKind =
  | 'circle'
  | 'line'
  | 'vline'
  | 'cross'
  | 'triangle'
  | 'square'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'heart'
  | 'random';

export type Palette = 'dark' | 'light';

/** 分頁層級設定（原作的 per-sheet settings，第一批用到的部分＋畫布配色） */
export interface SheetSettings {
  palette: Palette;
  bgMode: 'none' | 'grid' | 'axis';
  gridStep: number;
  gridSnap: boolean;
  shapeSquare: boolean;
  bridgeMode: boolean;
  showNames: boolean;
  showLegend: boolean;
  showRelName: boolean;
  showRelNote: boolean;
  showCharLegend: boolean;
  legendPos: LegendPos;
  charLegendPos: LegendPos;
  noCollision: boolean;
  focusDim: number;
  relOpacity: number;
  defNoBorder: boolean;
  defNoBg: boolean;
  spacingPct: number;
  edgeGapPx: number;
  magCenter: number;
  magRepel: number;
  magLink: number;
  magDist: number;
  /** 磁鐵排列開著 */
  snapMode: boolean;
  /** 重要度反向排列 */
  pinFlip: boolean;
  /** 排列不出界 */
  fitLayout: boolean;
  lastLayout: LayoutKind;
  layoutNoStagger: boolean;
  /** 各重要度一排（圈）最多幾人 */
  wrapCaps: Record<string, number>;
  defCharSize: number;
  defBorderW: number;
  defNameSize: number;
  defRelNameSize: number;
  defNoteSize: number;
  defLineW: number;
  edgeStraight: boolean;
  colAvatarRing: ColorValue;
  colAvatarBg: ColorValue;
  colNameStroke: ColorValue;
  colNameText: ColorValue;
  colRelLine: ColorValue;
  colRelText: ColorValue;
  colRelOutline: ColorValue;
  /* ---- 第二批：標籤與陣營框的顯示（原作的同名設定） ---- */
  /** 標籤網：標籤畫成畫布上的節點 */
  showLabelNodes: boolean;
  /** 這張分頁沒有成員的標籤也畫 */
  showFreeLbls: boolean;
  /** 標籤節點大小倍率（0.5～2） */
  lblNodeScale: number;
  /** 互動網頁的角色卡也列出隱藏的標籤 */
  viewerHiddenLbls: boolean;
  /** 陣營框的總開關 */
  showZones: boolean;
  zoneOutline: boolean;
  /** 外框線粗細（0.5～8） */
  zoneEdgeW: number;
  /** 填色濃度（0.02～0.6） */
  zoneFillOp: number;
  /** 連結鬆緊、厚度、同心層距（0～10 的整數） */
  zoneLink: number;
  zoneThick: number;
  zoneLayerStep: number;
  /** 重疊處：true＝混色、false＝依標籤順序 */
  zoneBlend: boolean;
  showLblLegend: boolean;
  lblLegendPos: LegendPos;
  /** 標籤節點的位置（標籤 id → 座標；沒有＝自動） */
  labelPos: Record<string, { x: number; y: number }>;
  /** 陣營名稱的方向（標籤 id → 弧度；沒有＝正上方） */
  zoneNameAng: Record<string, number>;
  /* ---- 第三批 ---- */
  /** 預設頭像框（資產 id；''＝不使用框） */
  defFrame: string;
  /* ---- 第四批 ---- */
  /** 便利貼的分頁預設字級（0＝自動，1～200；原作的 defStickySize，不是關係備註的 defNoteSize） */
  defStickySize: number;
}

/** 群體關係的端點：`C<角色 id>` 或 `L<標籤 id>` */
export type GrelEnd = string;

/** 群體關係（一端或兩端是標籤的關係規則；原作的 grels） */
export interface GroupRel {
  id: number;
  from: GrelEnd;
  to: GrelEnd;
  type: number;
  both: boolean;
  /** 算到每位成員 */
  inherit: boolean;
  note: string;
  /** 例外（不適用）的角色 id */
  except: number[];
}

export interface Sheet {
  id: number;
  /** 預設名稱「分頁 N」的 N */
  defNo: number;
  name: string;
  W: number;
  H: number;
  chars: Char[];
  rels: Rel[];
  types: RelType[];
  /** 背景圖的資產 id */
  bg: string | null;
  settings: SheetSettings;
  /** 群體關係（第二批） */
  grels: GroupRel[];
  /** 收合中的陣營（標籤 id；第二批） */
  collapsed: number[];
  /** 看法：說話者的角色 id → 對象的角色 id → 一句話（第三批） */
  views: Record<string, Record<string, string>>;
  /** 便利貼與圖表節點（第四批；畫在所有圖層之上，不是角色） */
  notes: Note[];
  /** 世界觀（淨化過的 HTML；圖片寫成 `rcimg:<資產 id>`） */
  lore: string;
  /** 世界觀沿用的分頁 id（null＝本分頁自己的；只一層） */
  loreFrom: number | null;
  /** 備忘錄（純文字，最多 2 萬字；不進任何匯出） */
  memo: string;
}

/** 圖表節點的設定（原作的 note.chart：A、B 是這張分頁的角色 id，0＝沒有；stA／stB＝那位角色在這份範本的第幾個狀態） */
export interface NoteChart {
  tpl: number;
  a: number;
  b: number;
  stA: number;
  stB: number;
  legend: boolean;
}

/** 便利貼（原作的 sticky note；x、y 是中心，寬高是 50 的倍數、至少 100） */
export interface Note {
  id: number;
  /** 內文（原作的欄位名是 name）；圖表節點＝標題 */
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 字級（null＝跟隨分頁預設字級／自動） */
  size: number | null;
  /** 釘選＝不能拖、不能改大小 */
  locked: boolean;
  /** 隱藏紙面（只顯示文字） */
  bare: boolean;
  /** 圖表節點（null＝一般便利貼） */
  chart: NoteChart | null;
}

/** 便利貼庫的一筆關閉紀錄（沒有座標：放回畫布時重新配位置） */
export interface NoteBinItem {
  id: number;
  savedAt: number;
  text: string;
  w: number;
  h: number;
  size: number | null;
  bare: boolean;
  chart: NoteChart | null;
}

/** 設定集的一筆（原作的整體設定庫：分頁外觀設定的一組值；套用＝複製到目前分頁、不連動） */
export interface SettingsPreset {
  id: number;
  name: string;
  fav: boolean;
  /** 設定值（只有設定集涵蓋的鍵；讀原作的設定集時沒有的鍵不放＝套用時不動） */
  values: Partial<SheetSettings>;
}

export interface Label {
  id: number;
  text: string;
  /** 第二批：顏色（auto＝畫布配色的自動外框色）、隱藏、沒有引力、陣營框 */
  color: ColorValue;
  hidden: boolean;
  noPull: boolean;
  zone: boolean;
  /** 第三批：這個標籤的頭像框（資產 id；''＝不使用） */
  frame: string;
}

export type FontKey = 'sans' | 'serif' | 'round' | 'kai' | 'mono';
/** 字型：內建字型組或 `f:<資產 id>`（匯入的字型） */
export type FontValue = FontKey | `f:${string}`;

export interface Project {
  sheets: Sheet[];
  active: number;
  labels: Label[];
  nextId: number;
  /** 文件字型 */
  font: FontValue;
  /* ---- 第三批 ---- */
  /** 角色庫 */
  library: CharEntry[];
  /** 關係庫 */
  relLibrary: RelEntry[];
  /** 數值圖表的範本 */
  radarTpls: RadarTpl[];
  /** 頭像框庫 */
  frames: FrameItem[];
  /** 匯入的字型 */
  fonts: FontItem[];
  /* ---- 第四批 ---- */
  /** 便利貼庫：關閉過的便利貼（最新的在前，最多 60 筆） */
  noteBin: NoteBinItem[];
  /** 設定集 */
  settingsLib: SettingsPreset[];
}
