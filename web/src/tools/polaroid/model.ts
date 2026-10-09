/**
 * 拍立得相框產生器的資料與純計算（規格 docs/refactor/specs/polaroid.md）：
 * 相框尺寸、照片鋪滿與放大／位移的夾值、文字自動縮小、筆畫的線寬與點、貼紙的初始大小與夾值、讀檔時的整理。
 * 這裡不碰 DOM，單元測試直接用。所有座標都是「相框單位」（相框寬 688；輸出 × 3）。
 */

/* ---------- 型別 ---------- */

export type AspectId = 'square' | 'landscape' | 'portrait';
export const ASPECT_IDS: readonly AspectId[] = ['square', 'landscape', 'portrait'];

export type CaptionFont = 'bold' | 'cursive';
export const CAPTION_FONTS: readonly CaptionFont[] = ['bold', 'cursive'];

export type ToolId = 'pen' | 'eraser' | 'move';
export const TOOL_IDS: readonly ToolId[] = ['pen', 'eraser', 'move'];

/** 照片（圖片本身存在資產庫，這裡只記 id、原檔名與原始尺寸） */
export interface PhotoRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 放大倍率與位移（照片中心對照片範圍中心的距離，相框單位） */
export interface PhotoView {
  zoom: number;
  ox: number;
  oy: number;
}

export interface Caption {
  text: string;
  font: CaptionFont;
  color: string;
  size: number;
}

/** 一筆（點存成 [x0, y0, x1, y1, …]，相框單位、四捨五入到 0.1） */
export interface Stroke {
  color: string;
  /** 粗細（滑桿的值） */
  size: number;
  /** 整條筆畫的平均壓力（0～1） */
  pressure: number;
  eraser: boolean;
  points: number[];
}

export interface PenLayer {
  id: string;
  visible: boolean;
  strokes: Stroke[];
}

/** 貼紙（位置以中心＋寬高＋角度記錄，同共用的 Placement） */
export interface Sticker {
  id: string;
  /** 資產庫裡的圖片 id */
  asset: string;
  name: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** 度，順時針 */
  rotation: number;
}

export interface PolaroidState {
  aspect: AspectId;
  photo: PhotoRef | null;
  view: PhotoView;
  /** 相框顏色 */
  cardBg: string;
  caption: Caption;
  /** 畫的順序：第一張在最下面 */
  stickers: Sticker[];
  /** 畫的順序：第一個在最下面（圖層 1） */
  layers: PenLayer[];
}

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

export interface Point {
  x: number;
  y: number;
}

/* ---------- 數值 ---------- */

/** 照片範圍的寬 */
export const PHOTO_W = 620;
/** 照片左、右、上的邊 */
export const SIDE = 34;
/** 下方文字白邊的高 */
export const CAP_H = 190;
/** 相框的圓角 */
export const CORNER = 10;
/** 照片範圍的圓角 */
export const PHOTO_CORNER = 3;
/** 沒有照片時照片範圍的底色 */
export const EMPTY_FILL = '#e7e5e2';
/** 輸出倍率 */
export const EXPORT_SCALE = 3;
/** 預覽畫布的倍率（固定，D16） */
export const PREVIEW_SCALE = 2;
/** 照片寬 ÷ 照片高 */
export const ASPECT_RATIO: Record<AspectId, number> = {
  square: 1,
  landscape: 4 / 3,
  portrait: 3 / 4,
};

export const ZOOM_RANGE = { min: 1, max: 4, step: 0.01 } as const;
/** 滾輪：倍率 × e^(−deltaY × 這個值) */
export const WHEEL_ZOOM_K = 0.0015;
export const CAPTION_MAX = 40;
export const CAPTION_SIZE_RANGE = { min: 16, max: 72 } as const;
/** 自動縮小的下限 */
export const CAPTION_MIN_SIZE = 10;
/** 文字可用的寬＝相框寬 − 這個值 */
export const CAPTION_MARGIN = 60;
export const BRUSH_RANGE = { min: 3, max: 40 } as const;
export const BRUSH_PRESETS = [4, 8, 14, 22, 34] as const;
export const PEN_PRESETS = ['#ffffff', '#111111', '#ffd400', '#ff4d6d', '#14b8a6'] as const;
export const STICKER_MAX = 5;
/** 新貼紙等比縮到放得進這個正方形（小圖不放大） */
export const STICKER_BASE = 180;
/** 貼紙寬高的範圍（共用貼紙控點的 stickerRange） */
export const STICKER_RANGE = { min: 12, max: 720 } as const;
export const LAYER_COUNT = 3;
export const LAYER_IDS = ['l1', 'l2', 'l3'] as const;

export const DEFAULT_CARD_BG = '#fbfbfa';
export const DEFAULT_CAPTION_COLOR = '#1c1c1c';
export const DEFAULT_PEN_COLOR = '#14b8a6';
export const DEFAULT_BRUSH = 14;

export function initialLayers(): PenLayer[] {
  return LAYER_IDS.map((id) => ({ id, visible: true, strokes: [] }));
}

export function initialState(): PolaroidState {
  return {
    aspect: 'square',
    photo: null,
    view: { zoom: 1, ox: 0, oy: 0 },
    cardBg: DEFAULT_CARD_BG,
    caption: { text: '', font: 'bold', color: DEFAULT_CAPTION_COLOR, size: 40 },
    stickers: [],
    layers: initialLayers(),
  };
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/* ---------- 相框 ---------- */

/** 照片範圍的高 */
export const photoHeight = (aspect: AspectId): number => PHOTO_W / ASPECT_RATIO[aspect];

/** 相框尺寸（相框單位，高不四捨五入；規格 3.1） */
export function cardSize(aspect: AspectId): Size {
  return { width: PHOTO_W + SIDE * 2, height: SIDE + photoHeight(aspect) + CAP_H };
}

/** 輸出 PNG 的尺寸（3 倍，四捨五入） */
export function exportSize(aspect: AspectId, scale = EXPORT_SCALE): Size {
  const c = cardSize(aspect);
  return { width: Math.round(c.width * scale), height: Math.round(c.height * scale) };
}

export function photoArea(aspect: AspectId): Rect {
  return { x: SIDE, y: SIDE, width: PHOTO_W, height: photoHeight(aspect) };
}

export function captionArea(aspect: AspectId): Rect {
  const c = cardSize(aspect);
  return { x: 0, y: SIDE + photoHeight(aspect), width: c.width, height: CAP_H };
}

/* ---------- 照片 ---------- */

/** 照片蓋滿範圍 × 放大倍率時的大小 */
export function coverSize(area: Size, photo: Size, zoom: number): Size {
  const s = Math.max(area.width / photo.width, area.height / photo.height) * zoom;
  return { width: photo.width * s, height: photo.height * s };
}

/** 位移夾回「照片蓋滿範圍」之內（規格 F08） */
export function clampView(area: Size, photo: Size | null, view: PhotoView): PhotoView {
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : 1, ZOOM_RANGE.min, ZOOM_RANGE.max);
  if (!photo || photo.width <= 0 || photo.height <= 0) return { zoom, ox: 0, oy: 0 };
  const d = coverSize(area, photo, zoom);
  const mx = Math.max(0, (d.width - area.width) / 2);
  const my = Math.max(0, (d.height - area.height) / 2);
  return {
    zoom,
    ox: clamp(Number.isFinite(view.ox) ? view.ox : 0, -mx, mx),
    oy: clamp(Number.isFinite(view.oy) ? view.oy : 0, -my, my),
  };
}

/** 照片畫在哪裡（相框單位） */
export function photoDrawRect(area: Rect, photo: Size, view: PhotoView): Rect {
  const v = clampView(area, photo, view);
  const d = coverSize(area, photo, v.zoom);
  return {
    x: area.x + area.width / 2 + v.ox - d.width / 2,
    y: area.y + area.height / 2 + v.oy - d.height / 2,
    width: d.width,
    height: d.height,
  };
}

/** 放大：位移不變，再夾值（規格 F09） */
export function zoomView(area: Size, photo: Size | null, view: PhotoView, zoom: number) {
  return clampView(area, photo, { ...view, zoom });
}

/** 拖曳取景：從按下時的位移加上指標的移動量，再夾值（F10） */
export function panView(area: Size, photo: Size | null, start: PhotoView, dx: number, dy: number) {
  return clampView(area, photo, { zoom: start.zoom, ox: start.ox + dx, oy: start.oy + dy });
}

/** 滾輪放大的新倍率（F11） */
export const wheelZoom = (zoom: number, deltaY: number): number =>
  clamp(zoom * Math.exp(-deltaY * WHEEL_ZOOM_K), ZOOM_RANGE.min, ZOOM_RANGE.max);

/* ---------- 文字 ---------- */

/** 實際要畫的文字（前後空白不畫） */
export const captionText = (c: Caption): string => c.text.trim();

/** 截到最多 40 字（以字元計，emoji 算一個） */
export const clipCaption = (s: string): string => Array.from(s).slice(0, CAPTION_MAX).join('');

/**
 * 自動縮小（F19）：從設定的字級開始，寬度超過 maxWidth 就減 1，最小 10。
 * measure(size) 回傳這個字級下的文字寬度。
 */
export function fitCaptionSize(
  measure: (size: number) => number,
  start: number,
  maxWidth: number,
): number {
  let size = Math.round(start);
  while (size > CAPTION_MIN_SIZE) {
    if (measure(size) <= maxWidth) break;
    size -= 1;
  }
  return size;
}

/* ---------- 筆畫 ---------- */

/** 指標的壓力（F24）：滑鼠 0.55、手指 0.6、觸控筆＝筆壓（0 時 0.5） */
export function pointerPressure(pointerType: string, pressure: number): number {
  if (pointerType === 'pen') return pressure > 0 ? clamp(pressure, 0, 1) : 0.5;
  if (pointerType === 'touch') return 0.6;
  return 0.55;
}

/** 實際線寬＝粗細 ×（0.55 ＋ 壓力 × 0.9） */
export const strokeWidth = (size: number, pressure: number): number =>
  size * (0.55 + clamp(pressure, 0, 1) * 0.9);

/** 點四捨五入到 0.1 */
export const roundPoint = (v: number): number => Math.round(v * 10) / 10;

/** 點夾回相框內（F26） */
export function clampToCard(p: Point, card: Size): Point {
  return { x: clamp(p.x, 0, card.width), y: clamp(p.y, 0, card.height) };
}

/** 一筆裡的點數 */
export const pointCount = (s: Pick<Stroke, 'points'>): number => Math.floor(s.points.length / 2);

export const hasStrokes = (layers: readonly PenLayer[]): boolean =>
  layers.some((l) => l.strokes.length > 0);

/** 圖層的位置編號（1 起算，圖層 1 在最下面） */
export const layerNumber = (layers: readonly PenLayer[], id: string): number =>
  layers.findIndex((l) => l.id === id) + 1;

/* ---------- 貼紙 ---------- */

/** 貼紙的字母（依位置，A 在最下面） */
export const stickerLetter = (index: number): string => String.fromCharCode(65 + index);

/** 新貼紙的大小：等比縮到放得進 180 × 180，小圖不放大（F34） */
export function stickerBaseSize(img: Size): Size {
  const k = Math.min(STICKER_BASE / img.width, STICKER_BASE / img.height, 1);
  return { width: img.width * k, height: img.height * k };
}

/** 新貼紙的中心：相框寬的一半、相框高 − min(115, 190 × 0.55) */
export function stickerStart(aspect: AspectId): Point {
  const c = cardSize(aspect);
  return { x: c.width / 2, y: c.height - Math.min(115, CAP_H * 0.55) };
}

/** 貼紙的白邊寬度（F35）：寬、高較小者 × 0.07，夾在 5～10 */
export const stickerOutline = (s: Size): number => clamp(Math.min(s.width, s.height) * 0.07, 5, 10);

/** 貼紙中心夾在相框範圍內（F37） */
export function clampStickerCenter<T extends { cx: number; cy: number }>(s: T, card: Size): T {
  const cx = clamp(s.cx, 0, card.width);
  const cy = clamp(s.cy, 0, card.height);
  return cx === s.cx && cy === s.cy ? s : { ...s, cx, cy };
}

/** 新的貼紙 id：s1、s2…（取目前最大的號碼＋1） */
export function nextStickerId(list: readonly { id: string }[]): string {
  let n = 0;
  for (const s of list) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `s${n + 1}`;
}

/** 把 from 移到 to（畫的順序；夾在範圍內） */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  const t = clamp(to, 0, list.length - 1);
  if (from < 0 || from >= list.length || from === t) return out;
  const [it] = out.splice(from, 1);
  out.splice(t, 0, it);
  return out;
}

/** 清單（上層在前）的第 i 列 ↔ 畫的順序 */
export const listToDraw = (count: number, i: number): number => count - 1 - i;

/* ---------- 讀檔、還原時的整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const HEX = /^#[0-9a-f]{6}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function normalizeColor(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (HEX.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  return fallback;
}

function normalizePhoto(raw: unknown): PhotoRef | null {
  if (!isObj(raw)) return null;
  const w = num(raw.width);
  const h = num(raw.height);
  if (typeof raw.id !== 'string' || !ASSET_ID.test(raw.id)) return null;
  if (w === null || h === null || w < 1 || h < 1) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : '',
    width: Math.round(w),
    height: Math.round(h),
  };
}

function normalizeCaption(raw: unknown): Caption {
  const base = initialState().caption;
  if (!isObj(raw)) return base;
  return {
    text: typeof raw.text === 'string' ? clipCaption(raw.text.replace(/[\r\n]+/g, ' ')) : '',
    font: CAPTION_FONTS.includes(raw.font as CaptionFont) ? (raw.font as CaptionFont) : 'bold',
    color: normalizeColor(raw.color, DEFAULT_CAPTION_COLOR),
    size: Math.round(clamp(num(raw.size) ?? base.size, 1, 400)),
  };
}

export function normalizeStroke(raw: unknown): Stroke | null {
  if (!isObj(raw) || !Array.isArray(raw.points)) return null;
  const pts = raw.points.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (pts.length !== raw.points.length || pts.length < 2) return null;
  const even = pts.length - (pts.length % 2);
  return {
    color: normalizeColor(raw.color, DEFAULT_PEN_COLOR),
    size: clamp(num(raw.size) ?? DEFAULT_BRUSH, 1, 400),
    pressure: Math.round(clamp(num(raw.pressure) ?? 0.55, 0, 1) * 100) / 100,
    eraser: raw.eraser === true,
    points: pts.slice(0, even).map(roundPoint),
  };
}

function normalizeLayers(raw: unknown): PenLayer[] {
  const list = Array.isArray(raw) ? raw.filter(isObj) : [];
  const used = new Set<string>();
  const out: PenLayer[] = [];
  for (const l of list.slice(0, LAYER_COUNT)) {
    let id = typeof l.id === 'string' && /^l\d+$/.test(l.id) ? l.id : '';
    if (!id || used.has(id)) id = LAYER_IDS.find((x) => !used.has(x)) ?? `l${used.size + 1}`;
    used.add(id);
    out.push({
      id,
      visible: l.visible !== false,
      strokes: Array.isArray(l.strokes)
        ? l.strokes.map(normalizeStroke).filter((s): s is Stroke => s !== null)
        : [],
    });
  }
  /* 一律三個圖層：缺的補空白圖層 */
  for (const id of LAYER_IDS) {
    if (out.length >= LAYER_COUNT) break;
    if (!used.has(id)) {
      used.add(id);
      out.push({ id, visible: true, strokes: [] });
    }
  }
  return out;
}

function normalizeSticker(raw: unknown, used: Set<string>, card: Size): Sticker | null {
  if (!isObj(raw)) return null;
  const w = num(raw.width);
  const h = num(raw.height);
  const cx = num(raw.cx);
  const cy = num(raw.cy);
  if (typeof raw.asset !== 'string' || !ASSET_ID.test(raw.asset)) return null;
  if (w === null || h === null || cx === null || cy === null || w <= 0 || h <= 0) return null;
  let id = typeof raw.id === 'string' && /^s\d+$/.test(raw.id) ? raw.id : '';
  if (!id || used.has(id)) id = nextStickerId([...used].map((u) => ({ id: u })));
  used.add(id);
  const rot = num(raw.rotation) ?? 0;
  let rotation = rot % 360;
  if (rotation > 180) rotation -= 360;
  if (rotation <= -180) rotation += 360;
  return clampStickerCenter(
    {
      id,
      asset: raw.asset,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : '',
      cx,
      cy,
      width: clamp(w, 1, STICKER_RANGE.max * 4),
      height: clamp(h, 1, STICKER_RANGE.max * 4),
      rotation,
    },
    card,
  );
}

/**
 * 自動儲存、專案檔讀回時的整理（規格 3.4）：尺寸不認得時用正方形；數值夾在範圍內；位移夾回蓋滿的範圍；
 * 壞掉的筆畫、貼紙丟掉；貼紙最多 5 張；圖層一律三個。
 */
export function normalizeState(raw: unknown): PolaroidState {
  const d = isObj(raw) ? raw : {};
  const aspect = ASPECT_IDS.includes(d.aspect as AspectId) ? (d.aspect as AspectId) : 'square';
  const photo = normalizePhoto(d.photo);
  const v = isObj(d.view) ? d.view : {};
  const view = clampView(photoArea(aspect), photo, {
    zoom: num(v.zoom) ?? 1,
    ox: num(v.ox) ?? 0,
    oy: num(v.oy) ?? 0,
  });
  const card = cardSize(aspect);
  const used = new Set<string>();
  const stickers = (Array.isArray(d.stickers) ? d.stickers : [])
    .map((s) => normalizeSticker(s, used, card))
    .filter((s): s is Sticker => s !== null)
    .slice(0, STICKER_MAX);
  return {
    aspect,
    photo,
    view,
    cardBg: normalizeColor(d.cardBg, DEFAULT_CARD_BG),
    caption: normalizeCaption(d.caption),
    stickers,
    layers: normalizeLayers(d.layers),
  };
}
