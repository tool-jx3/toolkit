export type Vec2 = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** 位置 u∈[0,1]（グラデ方向）と時刻 t∈[0,1) から色を返す */
export interface ColorRamp {
  kind: ColorSpec['kind'];
  /** @returns 'rgb(r,g,b)' or '#rrggbb' */
  sample(u: number, t: number): string;
  /** Canvas に流し込む用。矩形領域を渡すと CanvasGradient を返す */
  toGradient(ctx: CanvasRenderingContext2D, box: Box, t: number): string | CanvasGradient;
}

/** シリアライズ可能な色指定（ColorRamp のファクトリ引数） */
export type ColorSpec =
  | { kind: 'solid'; color: string }
  | { kind: 'rainbow'; saturation: number; lightness: number; cycles: number; speed: number; angle: number }
  | { kind: 'linear'; stops: Array<{ at: number; color: string }>; angle: number; scrollSpeed: number }
  | { kind: 'metal'; base: 'gold' | 'silver'; angle: number };

/** 文字装飾の1パス。背面から順に適用される */
export type TextDecoSpec =
  | { type: 'stroke'; widthRatio: number; color: ColorSpec }
  | { type: 'fill'; color: ColorSpec }
  | { type: 'extrude'; depth: number; angle: number; color: ColorSpec }
  | { type: 'shadow'; blur: number; offset: Vec2; color: string; opacity: number }
  | { type: 'glow'; color: ColorSpec; radius: number; passes: number; intensity: number }
  | { type: 'offsetCopy'; offset: Vec2; color: string; blend: GlobalCompositeOperation; jitter: number }
  | { type: 'pattern'; kind: 'stripe' | 'check' | 'dots'; colors: [string, string]; scale: number; angle: number; scrollSpeed: number }
  | { type: 'knockout' };

export interface TextSpec {
  lines: string[];
  fontId: string;
  /** 文字サイズは自動算出。ユーザーは倍率のみ触る */
  scale: number;
  lineHeight: number;
  letterSpacing: number;
  /** 背面→前面の順 */
  decorations: TextDecoSpec[];
  perChar: boolean;
}

export interface LayerSpec {
  type: string;
  z: 'back' | 'front';
  params: Record<string, number | string | boolean>;
}

export type OutputFormat = 'apng' | 'gif' | 'png';

export type MotionSpec = { type: 'none' | 'pulse' | 'shake' | 'bounce' | 'rotate' | 'wave'; amount: number };

export type BackgroundSpec = ColorSpec | { kind: 'transparent' };

export interface RenderParams {
  version: 1;
  canvas: { w: number; h: number };
  frameCount: number;
  fps: number;
  seed: number;
  background: BackgroundSpec;
  /** 文字と演出をまとめて縮小する率。1=いっぱいに描く。円い演出を切らずに収めたいときに下げる */
  contentScale?: number;
  text: TextSpec;
  layers: LayerSpec[];
  motion: MotionSpec;
  output: {
    format: OutputFormat;
    /** APNG: 量子化色数。0=無損失。既定 256 */
    colors: number;
    budgetBytes: number;
    /** GIF出力時、半透明ピクセルをこの色で合成して不透明化する。null=透過のまま */
    matte: string | null;
  };
}

export interface DrawContext {
  w: number;
  h: number;
  /** 長さ系パラメータの基準。min(w, h) */
  unit: number;
  center: Vec2;
  /** テキストの外接矩形 */
  textBox: Box;
  rng: () => number;
  params: Record<string, any>;
}

/** 全レイヤーの共通インタフェース */
export interface Layer {
  readonly type: string;
  /** @param t 0<=t<1。t=0 と t=1 の見た目が一致すること（ループ保証） */
  draw(ctx: CanvasRenderingContext2D, t: number, c: DrawContext): void;
}
