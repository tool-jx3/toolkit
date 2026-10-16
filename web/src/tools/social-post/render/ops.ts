/**
 * 畫面的描述（display list）：版面計算（純函式）產生一串由下往上畫的指令，`paint.ts` 照著畫在 canvas 上。
 * 預覽、PNG、HTML 用同一份描述（規格 5「同一份畫法」）；座標是畫面單位（CSS px），畫的時候整個乘上倍率。
 */
import type { FramePlacement } from '@/core/image';
import type { ImageRef } from '../model';
import type { FontSpec } from '../text';
import type { IconName } from './icons';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 線性漸層（畫面座標） */
export interface LinearPaint {
  linear: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    stops: readonly (readonly [number, string])[];
  };
}
export type Paint = string | LinearPaint;

export interface Shadow {
  color: string;
  blur: number;
  x?: number;
  y?: number;
}

export type Radius = number | readonly [number, number, number, number];

export interface Stroke {
  color: string;
  width: number;
  dash?: readonly number[];
}

export interface RectOp {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: Radius;
  fill?: Paint;
  stroke?: Stroke;
  /** 框線畫在裡面（inset，CSS 的 box-shadow inset 那樣） */
  inset?: boolean;
  shadow?: Shadow;
}

export interface CircleOp {
  t: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: Paint;
  stroke?: Stroke;
}

export interface TextOp {
  t: 'text';
  /** 對齊點的 x（align 決定是左、中、右） */
  x: number;
  /** 行框的上緣（基線依字型的上下高度置中在行框裡，同 CSS 的半行距） */
  y: number;
  /** 行高 */
  lh: number;
  text: string;
  font: FontSpec;
  color: Paint;
  align?: 'left' | 'center' | 'right';
  shadow?: Shadow;
  /** 霓虹的光暈：同一行字疊幾次不同模糊的陰影 */
  glow?: { color: string; blurs: readonly number[] };
  /** 字母間距（px） */
  spacing?: number;
}

export interface IconOp {
  t: 'icon';
  name: IconName;
  /** 圖示框的左上角與邊長（圖示以 24 × 24 設計） */
  x: number;
  y: number;
  size: number;
  color: string;
  /** 填滿（實心的愛心、書籤）；不給時只描邊 */
  fill?: string;
  /** 描邊粗細（24 單位裡；預設 2） */
  sw?: number;
  shadow?: Shadow;
}

export interface ImageOp {
  t: 'image';
  img: ImageRef | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 蓋滿時的位置（不給＝置中蓋滿） */
  place?: FramePlacement;
  /** 'contain'：整張放進框（照片貼紙） */
  fit?: 'cover' | 'contain';
  r?: Radius;
  circle?: boolean;
  /** 圖讀不到時塗的顏色 */
  fallback?: string;
}

export interface GroupOp {
  t: 'group';
  ops: Op[];
  clip?: Rect & { r?: Radius; circle?: boolean };
  /** 先移到 (tx, ty)、再轉 rot 度、再縮放 scale */
  tx?: number;
  ty?: number;
  rot?: number;
  scale?: number;
  opacity?: number;
  shadow?: Shadow;
}

export interface LineOp {
  t: 'line';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  width: number;
}

/** 預設的人像（灰底、白色的頭與肩膀） */
export interface AvatarOp {
  t: 'avatar';
  img: ImageRef | null;
  cx: number;
  cy: number;
  r: number;
  /** 預設人像的底色 */
  bg: string;
}

export type Op = RectOp | CircleOp | TextOp | IconOp | ImageOp | GroupOp | LineOp | AvatarOp;

/** 可以點的地方（編輯時的點選區、HTML 的透明按鈕） */
export interface Hit {
  key: string;
  label: string;
  box: Rect;
  circle?: boolean;
}

/** 一個畫面的版面 */
export interface ScreenLayout {
  width: number;
  height: number;
  /** 背景色（PNG 的底色；限時動態是黑） */
  background: string;
  ops: Op[];
  hits: Hit[];
  /** 有名字的區塊（HTML 切圖、測試用） */
  parts: Record<string, Rect>;
}

export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
