/**
 * AI 誤判梗圖產生器的資料與純計算（規格 docs/refactor/specs/ai-fail.md）：
 * 畫布尺寸、照片鋪滿與平移／放大的夾值、改比例時框的換算、畫框與控制點、標籤的位置、讀檔時的整理。
 * 這裡不碰 DOM，單元測試直接用。所有座標都是畫布 px。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import { type Box, type BoxHandle, pointInBox, resizeBox } from '@/core/layout';

/* ---------- 型別 ---------- */

export type AspectId = 'native' | '1:1' | '3:4' | '4:3';
export const ASPECT_IDS: readonly AspectId[] = ['native', '1:1', '3:4', '4:3'];

export type LabelPos = 'top' | 'inside';
export const LABEL_POSITIONS: readonly LabelPos[] = ['top', 'inside'];

export type LabelAlign = 'left' | 'center' | 'right';
export const LABEL_ALIGNS: readonly LabelAlign[] = ['left', 'center', 'right'];

/** 一個辨識框（位置與大小是畫布 px；不四捨五入） */
export interface MemeBox extends Box {
  id: string;
  label: string;
  /** 方框與標籤的顏色（小寫 #rrggbb） */
  color: string;
  lineWidth: number;
  fontSize: number;
  labelPos: LabelPos;
  align: LabelAlign;
}

/** 照片（圖片本身存在資產庫，這裡只記 id 與原始尺寸） */
export interface PhotoRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 照片目前的放大倍率與左上角（畫布 px）；大小＝鋪滿時的大小 × zoom */
export interface PhotoView {
  zoom: number;
  x: number;
  y: number;
}

export interface MemeState {
  aspect: AspectId;
  photo: PhotoRef | null;
  view: PhotoView;
  /** 畫的順序：第一個在最下層 */
  boxes: MemeBox[];
  /** 所有標籤共用的字型 */
  font: FontValue;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/* ---------- 數值 ---------- */

/** 「原圖」比例的長邊 */
export const MAX_SIDE = 1200;
/** 沒有照片時「原圖」的畫布 */
export const EMPTY_CANVAS: Size = { width: 1000, height: 1000 };
export const FIXED_CANVAS: Record<Exclude<AspectId, 'native'>, Size> = {
  '1:1': { width: 1000, height: 1000 },
  '3:4': { width: 900, height: 1200 },
  '4:3': { width: 1200, height: 900 },
};

/** 拖曳畫框：寬、高都要大於這個值才建立 */
export const MIN_DRAW = 12;
/** 控制點調整大小的下限 */
export const MIN_BOX = 24;
/** 控制點周圍多少螢幕 px 算按到 */
export const HANDLE_HIT = 16;
/** 畫框中的暫時框線寬 */
export const DRAFT_LINE_WIDTH = 3;
/** 上方標籤與框的距離 */
export const LABEL_GAP = 6;
/** 框內標籤的最小內距 */
export const INSIDE_PAD_MIN = 10;

export const ZOOM_RANGE = { min: 1, max: 4, step: 0.01 } as const;
export const LINE_RANGE = { min: 1, max: 10 } as const;
export const FONT_RANGE = { min: 14, max: 72 } as const;
export const LABEL_MAX = 40;
/** 讀檔時接受的範圍（改比例之後可能超出滑桿範圍，照舊保留） */
const LINE_LIMIT = { min: 1, max: 100 } as const;
const FONT_LIMIT = { min: 1, max: 400 } as const;

export const DEFAULT_COLOR = '#59b64c';

/** 新框的預設（規格 F18） */
export const NEW_BOX: Omit<MemeBox, 'id' | 'x' | 'y' | 'width' | 'height'> = {
  label: 'object',
  color: DEFAULT_COLOR,
  lineWidth: 4,
  fontSize: 40,
  labelPos: 'top',
  align: 'left',
};

export const DEFAULT_LABEL_FONT: FontValue = {
  ...DEFAULT_FONT,
  family: 'Noto Sans TC',
  weight: 400,
};

export function initialState(): MemeState {
  return {
    aspect: 'native',
    photo: null,
    view: { zoom: 1, x: 0, y: 0 },
    boxes: [],
    font: { ...DEFAULT_LABEL_FONT },
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ---------- 畫布與照片 ---------- */

/** 畫布尺寸（規格 3.1） */
export function canvasSize(aspect: AspectId, photo: Size | null): Size {
  if (aspect !== 'native') return { ...FIXED_CANVAS[aspect] };
  if (!photo || photo.width <= 0 || photo.height <= 0) return { ...EMPTY_CANVAS };
  const s = MAX_SIDE / Math.max(photo.width, photo.height);
  return {
    width: Math.max(1, Math.round(photo.width * s)),
    height: Math.max(1, Math.round(photo.height * s)),
  };
}

/** 照片等比縮放到剛好蓋滿畫布、置中（放大 1 倍時的位置與大小） */
export function coverRect(canvas: Size, photo: Size): Box {
  const s = Math.max(canvas.width / photo.width, canvas.height / photo.height);
  const width = photo.width * s;
  const height = photo.height * s;
  return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

export function centeredView(canvas: Size, photo: Size): PhotoView {
  const r = coverRect(canvas, photo);
  return { zoom: 1, x: r.x, y: r.y };
}

/** 照片在畫布上的位置與大小 */
export function photoRect(canvas: Size, photo: Size, view: PhotoView): Box {
  const base = coverRect(canvas, photo);
  return { x: view.x, y: view.y, width: base.width * view.zoom, height: base.height * view.zoom };
}

/** 把照片夾回「蓋滿畫布」的範圍：左緣 ≤ 0、右緣 ≥ 畫布寬（上下相同） */
export function clampPhotoPosition(canvas: Size, rect: Box): Point {
  return {
    x: Math.min(0, Math.max(canvas.width - rect.width, rect.x)),
    y: Math.min(0, Math.max(canvas.height - rect.height, rect.y)),
  };
}

/** 平移：從按下時的位置加上位移，再夾回蓋滿的範圍 */
export function panView(canvas: Size, photo: Size, start: PhotoView, dx: number, dy: number) {
  const r = photoRect(canvas, photo, start);
  const p = clampPhotoPosition(canvas, { ...r, x: r.x + dx, y: r.y + dy });
  return { zoom: start.zoom, x: p.x, y: p.y };
}

/** 放大：畫布中心對著照片上的同一點，換算新大小後再夾值（規格 F09） */
export function zoomView(canvas: Size, photo: Size, view: PhotoView, zoom: number): PhotoView {
  const z = clamp(zoom, ZOOM_RANGE.min, ZOOM_RANGE.max);
  const cur = photoRect(canvas, photo, view);
  const fx = (canvas.width / 2 - cur.x) / cur.width;
  const fy = (canvas.height / 2 - cur.y) / cur.height;
  const base = coverRect(canvas, photo);
  const width = base.width * z;
  const height = base.height * z;
  const p = clampPhotoPosition(canvas, {
    x: canvas.width / 2 - fx * width,
    y: canvas.height / 2 - fy * height,
    width,
    height,
  });
  return { zoom: z, x: p.x, y: p.y };
}

/* ---------- 改比例 ---------- */

/**
 * 換比例時框的換算（規格 F13）：x、寬乘上寬的比值，y、高乘上高的比值（不四捨五入）；
 * 字級乘上較小的比值後四捨五入；線寬同樣、至少 1。
 */
export function scaleBoxes(boxes: readonly MemeBox[], from: Size, to: Size): MemeBox[] {
  if (!from.width || !from.height) return boxes.map((b) => ({ ...b }));
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const sf = Math.min(sx, sy);
  return boxes.map((b) => ({
    ...b,
    x: b.x * sx,
    y: b.y * sy,
    width: b.width * sx,
    height: b.height * sy,
    fontSize: Math.round(b.fontSize * sf),
    lineWidth: Math.max(1, Math.round(b.lineWidth * sf)),
  }));
}

/* ---------- 畫框 ---------- */

/** 兩點拉出的範圍（任何方向；左上角取較小的座標） */
export function rectFromPoints(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** 夠大才建立（寬、高都要大於 12；等於 12 不建立） */
export const bigEnough = (r: Size): boolean => r.width > MIN_DRAW && r.height > MIN_DRAW;

/** 新框的 id：b1、b2…（取目前最大的號碼＋1） */
export function nextBoxId(boxes: readonly { id: string }[]): string {
  let n = 0;
  for (const b of boxes) {
    const m = /^b(\d+)$/.exec(b.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `b${n + 1}`;
}

export function createBox(rect: Box, id: string): MemeBox {
  return { id, ...rect, ...NEW_BOX };
}

/* ---------- 選取、控制點 ---------- */

export const HANDLES: readonly BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 控制點的位置（四角與四邊中點） */
export function handlePoint(b: Box, h: BoxHandle): Point {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : b.x + b.width / 2;
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.height : b.y + b.height / 2;
  return { x, y };
}

/**
 * 按到哪個控制點（周圍 ±radius 畫布 px 的正方形）；好幾個都在範圍內時（框很小）取最近的那個。
 */
export function hitHandle(b: Box, p: Point, radius: number): BoxHandle | null {
  let best: BoxHandle | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const h of HANDLES) {
    const c = handlePoint(b, h);
    const dx = Math.abs(p.x - c.x);
    const dy = Math.abs(p.y - c.y);
    if (dx > radius || dy > radius) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** 按到哪個框（最上層優先，含邊上）；沒有時 -1 */
export function hitBox(boxes: readonly Box[], p: Point): number {
  for (let i = boxes.length - 1; i >= 0; i--) if (pointInBox(boxes[i], p.x, p.y)) return i;
  return -1;
}

/** 拖曳控制點：對邊不動，寬高至少 24 */
export function resizeWithHandle(b: Box, h: BoxHandle, dx: number, dy: number): Box {
  return resizeBox(b, h, dx, dy, { minWidth: MIN_BOX, minHeight: MIN_BOX });
}

/* ---------- 標籤 ---------- */

export interface LabelPlacement {
  /** 實際畫在框內（設定是框內，或上方放不下） */
  inside: boolean;
  x: number;
  y: number;
  align: LabelAlign;
  /** 'bottom'：y 是字的 em 框下緣；'top'：y 是 em 框上緣 */
  baseline: 'top' | 'bottom';
}

/** 標籤的位置（規格 3.4、F30） */
export function labelPlacement(b: MemeBox): LabelPlacement {
  const inside = b.labelPos === 'inside' || b.y - LABEL_GAP - b.fontSize < 0;
  if (inside) {
    const pad = Math.max(INSIDE_PAD_MIN, b.lineWidth * 2 + 4);
    const x =
      b.align === 'left'
        ? b.x + pad
        : b.align === 'right'
          ? b.x + b.width - pad
          : b.x + b.width / 2;
    return { inside, x, y: b.y + pad, align: b.align, baseline: 'top' };
  }
  const x = b.align === 'left' ? b.x : b.align === 'right' ? b.x + b.width : b.x + b.width / 2;
  return { inside, x, y: b.y - LABEL_GAP, align: b.align, baseline: 'bottom' };
}

/* ---------- 上下層 ---------- */

/** 把 from 移到 to（畫的順序；夾在範圍內） */
export function moveLayer<T>(list: readonly T[], from: number, to: number): T[] {
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

export function normalizeColor(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_COLOR;
  const s = v.trim().toLowerCase();
  if (HEX.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return DEFAULT_COLOR;
}

/** 截到最多 40 字（以字元計，emoji 算一個） */
export const clipLabel = (s: string): string => Array.from(s).slice(0, LABEL_MAX).join('');

function normalizeBox(raw: unknown, used: Set<string>): MemeBox | null {
  if (!isObj(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.width);
  const h = num(raw.height);
  if (x === null || y === null || w === null || h === null) return null;
  let id = typeof raw.id === 'string' && /^b\d+$/.test(raw.id) ? raw.id : '';
  if (!id || used.has(id)) id = nextBoxId([...used].map((u) => ({ id: u })));
  used.add(id);
  return {
    id,
    x,
    y,
    width: Math.max(1, w),
    height: Math.max(1, h),
    label: typeof raw.label === 'string' ? clipLabel(raw.label) : '',
    color: normalizeColor(raw.color),
    lineWidth: Math.round(
      clamp(num(raw.lineWidth) ?? NEW_BOX.lineWidth, LINE_LIMIT.min, LINE_LIMIT.max),
    ),
    fontSize: Math.round(
      clamp(num(raw.fontSize) ?? NEW_BOX.fontSize, FONT_LIMIT.min, FONT_LIMIT.max),
    ),
    labelPos: LABEL_POSITIONS.includes(raw.labelPos as LabelPos)
      ? (raw.labelPos as LabelPos)
      : 'top',
    align: LABEL_ALIGNS.includes(raw.align as LabelAlign) ? (raw.align as LabelAlign) : 'left',
  };
}

function normalizePhoto(raw: unknown): PhotoRef | null {
  if (!isObj(raw)) return null;
  const w = num(raw.width);
  const h = num(raw.height);
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)) return null;
  if (w === null || h === null || w < 1 || h < 1) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : '',
    width: Math.round(w),
    height: Math.round(h),
  };
}

function normalizeFont(raw: unknown): FontValue {
  if (!isObj(raw)) return { ...DEFAULT_LABEL_FONT };
  const source = raw.source === 'google' || raw.source === 'local' || raw.source === 'upload';
  const family = typeof raw.family === 'string' ? raw.family.slice(0, 200) : '';
  const weight = num(raw.weight);
  if (!source || !family) return { ...DEFAULT_LABEL_FONT };
  return {
    source: raw.source as FontValue['source'],
    family,
    weight: weight === null ? 400 : Math.round(clamp(weight, 100, 900) / 100) * 100,
  };
}

/** 照片的位置夾回蓋滿的範圍、倍率夾在 1～4 */
export function normalizeView(canvas: Size, photo: Size | null, raw: unknown): PhotoView {
  if (!photo) return { zoom: 1, x: 0, y: 0 };
  const v = isObj(raw) ? raw : {};
  const zoom = clamp(num(v.zoom) ?? 1, ZOOM_RANGE.min, ZOOM_RANGE.max);
  const base = centeredView(canvas, photo);
  const r = photoRect(canvas, photo, { zoom, x: num(v.x) ?? base.x, y: num(v.y) ?? base.y });
  const p = clampPhotoPosition(canvas, r);
  return { zoom, x: p.x, y: p.y };
}

/**
 * 自動保存、專案檔讀回時的整理（規格 3.6）：認不得的比例用原圖；壞掉的框丟掉；數值夾在合理範圍；
 * 照片的位置夾回蓋滿畫布。
 */
export function normalizeState(raw: unknown): MemeState {
  const d = isObj(raw) ? raw : {};
  const aspect = ASPECT_IDS.includes(d.aspect as AspectId) ? (d.aspect as AspectId) : 'native';
  const photo = normalizePhoto(d.photo);
  const used = new Set<string>();
  const boxes = Array.isArray(d.boxes)
    ? d.boxes.map((b) => normalizeBox(b, used)).filter((b): b is MemeBox => b !== null)
    : [];
  const canvas = canvasSize(aspect, photo);
  return {
    aspect,
    photo,
    view: normalizeView(canvas, photo, d.view),
    boxes,
    font: normalizeFont(d.font),
  };
}
