/**
 * 立繪裁切器的規則（純函式，不依賴 React／DOM），依規格 docs/refactor/specs/ccfolia-cropper.md
 * 第 3 節與第 7 節的主控裁定：
 * - 角色高度＝不透明範圍的列數（修正舊版少算的 1 px）；
 * - 頭部看角色最上方約 35%、上半身約 55%（至少 20 列）的左右界中點；
 * - 輸出一比一複製像素、不縮放；框比圖寬時右側補透明。
 */
import {
  type ImageKind,
  opaqueBounds,
  opaqueSpanInRows,
  type PixelBuffer,
  type Rect,
} from '@/core/image';

/* ---------- 設定值 ---------- */

export type Aspect = '3:4' | '1:1';
export const ASPECTS: readonly Aspect[] = ['3:4', '1:1'];
/** 框寬 ÷ 框高 */
export const ASPECT_RATIO: Record<Aspect, number> = { '3:4': 0.75, '1:1': 1 };

/** 裁切基準：頭部、上半身、角色範圍中心、整張圖中心、手動 */
export type Anchor = 'head' | 'upper' | 'figure' | 'image' | 'manual';
export const ANCHORS: readonly Anchor[] = ['head', 'upper', 'figure', 'image', 'manual'];

/** 裁切範圍（角色高度的 %） */
export const RANGE = { min: 10, max: 100, step: 1, keyStep: 5, default: 60 } as const;

/** 頭部、上半身：從角色最上緣往下多少 % 的列找左右界；角色很矮時至少看這麼多列 */
export const BAND = { head: 35, upper: 55, minRows: 20 } as const;

export type EffectStyle = 'stroke' | 'glow-soft' | 'glow-strong' | 'shadow';
export const EFFECT_STYLES: readonly EffectStyle[] = [
  'stroke',
  'glow-soft',
  'glow-strong',
  'shadow',
];

/** 效果參數的範圍（px；不透明度為 %） */
export const EFFECT_RANGE = {
  width: { min: 1, max: 30, default: 5 },
  blur: { min: 0, max: 40, default: 12 },
  offset: { min: 0, max: 30, default: 8 },
  opacity: { min: 0, max: 100, default: 100 },
} as const;

/** 自動存檔的設定（圖片清單、全部套用勾選框不存） */
export interface Settings {
  aspect: Aspect;
  /** 裁切範圍 %（10～100） */
  range: number;
  /** 最後一次在選單上選的基準 */
  anchor: Anchor;
  effectOn: boolean;
  effectStyle: EffectStyle;
  effectColor: string;
  effectWidth: number;
  effectBlur: number;
  effectOffset: number;
  /** 0～100 % */
  effectOpacity: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aspect: '3:4',
  range: RANGE.default,
  anchor: 'head',
  effectOn: false,
  effectStyle: 'stroke',
  effectColor: '#ffffff',
  effectWidth: EFFECT_RANGE.width.default,
  effectBlur: EFFECT_RANGE.blur.default,
  effectOffset: EFFECT_RANGE.offset.default,
  effectOpacity: EFFECT_RANGE.opacity.default,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** 裁切範圍夾在 10～100 的整數 */
export function clampRange(v: number): number {
  return num(v, RANGE.min, RANGE.max, RANGE.default);
}

/** 整理存檔讀回的設定（被改壞的值換成預設、數值夾在範圍內） */
export function sanitizeSettings(d: Partial<Settings>): Settings {
  const D = DEFAULT_SETTINGS;
  const E = EFFECT_RANGE;
  return {
    aspect: oneOf(d.aspect, ASPECTS, D.aspect),
    range: num(d.range, RANGE.min, RANGE.max, D.range),
    anchor: oneOf(d.anchor, ANCHORS, D.anchor),
    effectOn: typeof d.effectOn === 'boolean' ? d.effectOn : D.effectOn,
    effectStyle: oneOf(d.effectStyle, EFFECT_STYLES, D.effectStyle),
    effectColor:
      typeof d.effectColor === 'string' && /^#[0-9a-f]{6}$/i.test(d.effectColor)
        ? d.effectColor.toLowerCase()
        : D.effectColor,
    effectWidth: num(d.effectWidth, E.width.min, E.width.max, D.effectWidth),
    effectBlur: num(d.effectBlur, E.blur.min, E.blur.max, D.effectBlur),
    effectOffset: num(d.effectOffset, E.offset.min, E.offset.max, D.effectOffset),
    effectOpacity: num(d.effectOpacity, E.opacity.min, E.opacity.max, D.effectOpacity),
  };
}

/* ---------- 角色範圍（3.1） ---------- */

export interface Figure {
  /** 圖片尺寸 */
  width: number;
  height: number;
  /** 角色範圍：透明度大於 0 的像素的最小外接矩形；整張透明時是整張圖 */
  bounds: Rect;
  /** 頭部中心 x：角色最上方約 35% 的左右界中點 */
  headX: number;
  /** 上半身中心 x：角色最上方約 55% 的左右界中點 */
  upperX: number;
}

/** 某幾列（y0 ≤ y < y1，y1 無條件進位）裡不透明像素的最左與最右 x */
export type SpanReader = (y0: number, y1: number) => { left: number; right: number } | null;

/**
 * 頭部／上半身那一段的下緣（不含，小數無條件進位）：角色最上列＋max(20, 角色高度 × percent%)。
 * 先乘再除，避免 1000 × 0.55 ＝ 550.0000000000001 這種誤差多算一列。
 */
export function bandEnd(bounds: Rect, percent: number): number {
  return bounds.y + Math.max(BAND.minRows, (bounds.height * percent) / 100);
}

/**
 * 量角色：opaque 是不透明範圍（整張透明時傳 null），span 讀某幾列的左右界。
 * 角色高度＝不透明範圍的列數（bounds.height）。
 */
export function measureFigure(
  width: number,
  height: number,
  opaque: Rect | null,
  span: SpanReader,
): Figure {
  const bounds = opaque ?? { x: 0, y: 0, width, height };
  const mid = bounds.x + (bounds.width - 1) / 2;
  const centerOf = (percent: number) => {
    if (!opaque) return mid;
    const s = span(bounds.y, bandEnd(bounds, percent));
    return s ? (s.left + s.right) / 2 : mid;
  };
  return { width, height, bounds, headX: centerOf(BAND.head), upperX: centerOf(BAND.upper) };
}

/** 直接從像素量角色（測試與不經過畫布時用；瀏覽器裡用 render.ts 的 measureBitmap） */
export function figureFromPixels(px: PixelBuffer): Figure {
  return measureFigure(px.width, px.height, opaqueBounds(px, 0), (y0, y1) =>
    opaqueSpanInRows(px, y0, y1, 0),
  );
}

/* ---------- 裁切框（3.2） ---------- */

export interface CropInput {
  aspect: Aspect;
  /** 裁切範圍 % */
  range: number;
  anchor: Anchor;
  /** 水平位移（原圖 px，往右為正） */
  offset: number;
}

export interface CropGeometry {
  /** 輸出在原圖上的左上角（整數；框比圖寬時 x 為 0、右側超出圖片） */
  x: number;
  y: number;
  /** 輸出尺寸（整數，至少 1 px） */
  width: number;
  height: number;
  /** 依基準算出、還沒加位移也還沒夾住的框左緣（拖曳時換算位移用） */
  baseLeft: number;
}

/**
 * 框高＝角色高度 × 範圍、框寬＝框高 × 比例；水平依基準＋位移、垂直依基準；
 * 左緣夾在 0～（圖寬 − 框寬）（框比圖寬時固定 0）、上緣夾在 0～（圖高 − 框高）；
 * 尺寸與位置各自四捨五入（四捨五入後仍放得進圖內時，不會因為進位多出 1 px 透明邊）。
 */
export function cropGeometry(
  fig: Figure,
  { aspect, range, anchor, offset }: CropInput,
): CropGeometry {
  const b = fig.bounds;
  const H = (b.height * clampRange(range)) / 100;
  const W = H * (ASPECT_RATIO[aspect] ?? ASPECT_RATIO['3:4']);
  const figureCx = b.x + (b.width - 1) / 2;
  const figureCy = b.y + (b.height - 1) / 2;
  let cx: number;
  let top: number;
  switch (anchor) {
    case 'upper':
      cx = fig.upperX;
      top = b.y;
      break;
    case 'figure':
      cx = figureCx;
      top = figureCy - H / 2;
      break;
    case 'image':
      cx = fig.width / 2;
      top = fig.height / 2 - H / 2;
      break;
    default:
      /* 頭部、手動 */
      cx = fig.headX;
      top = b.y;
  }
  const baseLeft = cx - W / 2;
  const left = W > fig.width ? 0 : clamp(baseLeft + (offset || 0), 0, fig.width - W);
  top = clamp(top, 0, Math.max(0, fig.height - H));
  const width = Math.max(1, Math.round(W));
  const height = Math.max(1, Math.round(H));
  const x = width <= fig.width ? clamp(Math.round(left), 0, fig.width - width) : 0;
  const y = height <= fig.height ? clamp(Math.round(top), 0, fig.height - height) : 0;
  return { x, y, width, height, baseLeft };
}

/** 從框的新左緣換算位移（拖曳用；位移以原圖 px 記，不四捨五入） */
export function offsetFor(geo: CropGeometry, left: number): number {
  return left - geo.baseLeft;
}

export interface RgbaBuffer {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/** 依裁切框一比一複製像素（圖片外的部分透明）。測試用的參考做法；瀏覽器裡用畫布做同樣的事。 */
export function cropPixels(
  src: PixelBuffer,
  g: Pick<CropGeometry, 'x' | 'y' | 'width' | 'height'>,
): RgbaBuffer {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let y = 0; y < g.height; y++) {
    const sy = g.y + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < g.width; x++) {
      const sx = g.x + x;
      if (sx < 0 || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (y * g.width + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { data: out, width: g.width, height: g.height };
}

/* ---------- 每張圖各自的基準與位移（F08、F11、F16～F18、F20） ---------- */

export interface Slot {
  anchor: Anchor;
  /** 水平位移（原圖 px） */
  offset: number;
}

const applyAnchor = <T extends Slot>(it: T, anchor: Anchor): T => ({
  ...it,
  anchor,
  /* 選非「手動」的基準時位移歸零；手動保留拖過的位置 */
  offset: anchor === 'manual' ? it.offset : 0,
});

/**
 * 在選單上選基準：不勾「全部套用」時只改目前這張；勾選時套用到所有圖片（主控裁定）。
 */
export function chooseAnchor<T extends Slot>(
  items: readonly T[],
  index: number,
  anchor: Anchor,
  applyAll: boolean,
): T[] {
  return items.map((it, i) => (applyAll || i === index ? applyAnchor(it, anchor) : it));
}

/**
 * 勾選「全部套用同一基準」的當下：所有圖片改用選單上的基準
 * （基準本來就相同的圖保留位移；不同的依選基準的規則，非手動時位移歸零）。
 */
export function syncAnchors<T extends Slot>(items: readonly T[], anchor: Anchor): T[] {
  return items.map((it) => (it.anchor === anchor ? it : applyAnchor(it, anchor)));
}

/** 目前這張的位移歸零（回到基準位置、切換比例） */
export function resetOffset<T extends Slot>(items: readonly T[], index: number): T[] {
  return items.map((it, i) => (i === index && it.offset !== 0 ? { ...it, offset: 0 } : it));
}

/* ---------- 輸入與檔名（2、3.4） ---------- */

/** 可以載入的格式 */
export type SourceKind = 'png' | 'webp';

/**
 * 選檔、拖放的檔案收不收：依檔頭判斷 PNG（含 APNG）與 WebP（主控核准的改善）；
 * 檔頭認不得、但瀏覽器回報是 PNG／WebP 的照收（內容損壞的檔案到解碼時才報錯）；其他類型不收。
 */
export function sourceKind(header: ImageKind | null, mime: string): SourceKind | null {
  if (header === 'png' || header === 'apng') return 'png';
  if (header === 'webp') return 'webp';
  const t = mime.toLowerCase();
  if (header === null && t === 'image/png') return 'png';
  if (header === null && t === 'image/webp') return 'webp';
  return null;
}

/**
 * 下載檔名：結尾的 .png（WebP 為 .webp，不分大小寫）換成「_crop.png」；
 * 結尾不是這兩種的檔名原樣加上「.png」（與舊版由瀏覽器補副檔名的結果相同）。
 */
export function outputFileName(name: string): string {
  const m = /\.(png|webp)$/i.exec(name);
  if (m) return `${name.slice(0, m.index)}_crop.png`;
  return `${name}.png`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 貼上的圖片的檔名：clipboard_年月日時分秒.png（本地時間，主控裁定） */
export function clipboardFileName(d: Date): string {
  const stamp =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `clipboard_${stamp}.png`;
}
