/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 專案資料的型別（規格 3.8）。欄位的意義照原作（角色、關係類型＝原作的 tag、關係線＝rel、分頁層級設定），
 * 結構是本站自己的：沒有角色庫（D5），圖片存資產 id。
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

export interface Char {
  id: number;
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
}

export interface Label {
  id: number;
  text: string;
  /** 第二批：顏色（auto＝畫布配色的自動外框色）、隱藏、沒有引力、陣營框 */
  color: ColorValue;
  hidden: boolean;
  noPull: boolean;
  zone: boolean;
}

export type FontKey = 'sans' | 'serif' | 'round' | 'kai' | 'mono';

export interface Project {
  sheets: Sheet[];
  active: number;
  labels: Label[];
  nextId: number;
  font: FontKey;
}
