/**
 * 版型畫布的場景描述：一串由下往上畫的節點（矩形、線、圖片、文字、格式化文字、群組、自訂繪圖）。
 * 版型（介紹圖、選角畫面…）只要描述「畫什麼、在哪裡、點了要開哪個項目」，預覽與匯出用同一段繪圖程式（drawScene）。
 */
import type { RichDoc } from '../richtext';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 線性漸層（座標是畫布座標） */
export interface LinearPaint {
  linear: { x0: number; y0: number; x1: number; y1: number; stops: readonly [number, string][] };
}

/** 填色：CSS 顏色字串或線性漸層 */
export type Paint = string | LinearPaint;

export interface Shadow {
  /** 含透明度的顏色，例如 'rgba(0,0,0,0.25)' */
  color: string;
  blur: number;
  x?: number;
  y?: number;
}

/** 圓角：一個數字（四角相同）或 [左上, 右上, 右下, 左下] */
export type Radius = number | readonly [number, number, number, number];

/** 點了會開啟的項目（點選區） */
export interface HitTarget {
  /** 交給工具的鍵（例如 'left/profile'） */
  key: string;
  /** 無障礙名稱（例如「左邊的角色：頭像」） */
  label: string;
}

interface Base {
  /** 不透明度 0～1 */
  opacity?: number;
  hit?: HitTarget;
}

export interface RectNode extends Base {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Paint;
  radius?: Radius;
  /** 圓形（以 w 為直徑，置中在框裡） */
  circle?: boolean;
  stroke?: { color: string; width: number; dash?: readonly number[] };
  shadow?: Shadow;
}

export interface LineNode extends Base {
  kind: 'line';
  /** x0, y0, x1, y1, … */
  points: readonly number[];
  color: string;
  width: number;
  dash?: readonly number[];
}

export type ImageFit = 'cover' | 'contain' | 'fill';

export interface ImageNode extends Base {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  image: CanvasImageSource | null;
  /** 預設 cover（蓋滿、置中） */
  fit?: ImageFit;
  radius?: Radius;
  circle?: boolean;
  /** 高斯模糊的標準差（px） */
  blur?: number;
  shadow?: Shadow;
  /** 沿某個方向淡出（0～1 的位置：from 處完全不透明、to 處完全透明；方向 'x' 或 'y'；reverse 反過來） */
  fade?: { axis: 'x' | 'y'; from: number; to: number; reverse?: boolean };
  /** 圖片縮放的畫質（預設 'high'） */
  quality?: ImageSmoothingQuality;
}

export interface TextFont {
  family: string;
  weight?: number;
  size: number;
  italic?: boolean;
}

export interface TextNode extends Base {
  kind: 'text';
  x: number;
  y: number;
  /** 框寬（不給時不換行、靠左對齊從 x 開始） */
  w?: number;
  /** 框高（不給時依行數；給了時多的行不畫，並依 valign 對齊） */
  h?: number;
  text: string;
  font: TextFont;
  color: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** 'none'：只依原文換行；'char'：超過框寬就換行（逐字） */
  wrap?: 'none' | 'char';
  /** 行高（倍數，預設 1.2） */
  lineHeight?: number;
  /** 每字的字距（px） */
  letterSpacing?: number;
  /** 描邊（畫在填色下面） */
  stroke?: { color: string; width: number };
  shadow?: Shadow;
  /** 單行（wrap none）放不下框寬時縮小字級，最小到這個比例（例如 0.5）；不給時不縮 */
  shrink?: number;
}

export interface RichNode extends Base {
  kind: 'rich';
  x: number;
  y: number;
  w: number;
  h: number;
  doc: RichDoc;
  font: TextFont;
  /** 粗體的字重（預設 700） */
  boldWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  /** 半形空白的寬度倍數（預設 1） */
  spaceScale?: number;
  /** 水平壓縮（預設 1） */
  scaleX?: number;
  indent?: number;
  continued?: boolean;
  align?: 'left' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** 最多幾行（預設依框高） */
  maxLines?: number;
}

export interface GroupNode extends Base {
  kind: 'group';
  /** 位移 */
  x?: number;
  y?: number;
  /** 裁切範圍（群組座標） */
  clip?: Rect & { radius?: Radius; circle?: boolean };
  /** 整組的高斯模糊（px） */
  blur?: number;
  children: readonly SceneNode[];
}

export interface CustomNode extends Base {
  kind: 'custom';
  /** 點選範圍與字型收集用的外框（不給就沒有點選區） */
  box?: Rect;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export type SceneNode =
  | RectNode
  | LineNode
  | ImageNode
  | TextNode
  | RichNode
  | GroupNode
  | CustomNode;

/** 點選區（畫布座標） */
export interface HitRegion extends HitTarget {
  box: Rect;
  circle?: boolean;
  radius?: number;
}
