/**
 * 截圖演出產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/screenshot-fx.md）：
 * 狀態與預設值、整理存檔、畫面大小與截圖的擺放、演出框（放大框、螢光筆、塗黑）的座標換算、
 * 時間軸（開場、彈出、動作、結尾；依序／同時）、各框的進度、塗黑蓋住的範圍、放大框彈出後的位置、匯出的影格與檔名。
 */
import { clamp, clamp01, EASE, frameCount, frameTime, type TimelineSegment } from '@/core/timeline';

/* ---------- 尺寸 ---------- */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 畫面大小：三種預設與「原圖大小」 */
export type CanvasPreset = '1920x1080' | '1080x1920' | '1200x900' | 'original';
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  '1920x1080',
  '1080x1920',
  '1200x900',
  'original',
];
export const PRESET_SIZE: Record<Exclude<CanvasPreset, 'original'>, Size> = {
  '1920x1080': { width: 1920, height: 1080 },
  '1080x1920': { width: 1080, height: 1920 },
  '1200x900': { width: 1200, height: 900 },
};
/** 原圖大小時的長邊上限（太大的圖等比縮小；自訂） */
export const ORIGINAL_MAX_SIDE = 4096;
/** 還沒有圖時「原圖大小」用的大小 */
export const FALLBACK_SIZE: Size = { width: 1920, height: 1080 };

/** 畫面大小 */
export function canvasSize(preset: CanvasPreset, image: Size | null): Size {
  if (preset !== 'original') return PRESET_SIZE[preset];
  if (!image || !(image.width > 0) || !(image.height > 0)) return FALLBACK_SIZE;
  const k = Math.min(1, ORIGINAL_MAX_SIDE / Math.max(image.width, image.height));
  return {
    width: Math.max(1, Math.round(image.width * k)),
    height: Math.max(1, Math.round(image.height * k)),
  };
}

/** 影片要偶數的寬高（往下取偶數，至少 2） */
export const evenSize = (s: Size): Size => ({
  width: Math.max(2, s.width - (s.width % 2)),
  height: Math.max(2, s.height - (s.height % 2)),
});

/** 介面比例：短邊 1080 為 1（線寬、邊框、出處字級都乘這個；自訂） */
export const unitOf = (canvas: Size): number => Math.min(canvas.width, canvas.height) / 1080;

/* ---------- 選項 ---------- */

export type BgMode = 'blur' | 'transparent' | 'solid';
export const BG_MODES: readonly BgMode[] = ['blur', 'transparent', 'solid'];
export type CreditPos = 'below' | 'bottom' | 'badge';
export const CREDIT_POSITIONS: readonly CreditPos[] = ['below', 'bottom', 'badge'];
export type CreditSize = 'sm' | 'md' | 'lg';
export const CREDIT_SIZES: readonly CreditSize[] = ['sm', 'md', 'lg'];
export type Order = 'sequential' | 'simultaneous';
export const ORDERS: readonly Order[] = ['sequential', 'simultaneous'];
export type Fps = 15 | 30 | 60;
export const FPS_CHOICES: readonly Fps[] = [15, 30, 60];
export const VIDEO_FPS: readonly number[] = [30, 60];

export type FrameKind = 'zoom' | 'marker' | 'redact';
export const FRAME_KINDS: readonly FrameKind[] = ['zoom', 'marker', 'redact'];
export type ZoomStyle = 'card' | 'torn' | 'cyber' | 'shadow';
export const ZOOM_STYLES: readonly ZoomStyle[] = ['card', 'torn', 'cyber', 'shadow'];
export type Border = 2 | 4 | 6;
export const BORDERS: readonly Border[] = [2, 4, 6];
export type MarkerStyle = 'yellow' | 'pink' | 'green' | 'blue' | 'redBox' | 'redLine' | 'redStrike';
export const MARKER_STYLES: readonly MarkerStyle[] = [
  'yellow',
  'pink',
  'green',
  'blue',
  'redBox',
  'redLine',
  'redStrike',
];
/** 螢光筆（色塊，色彩增值） */
export const HIGHLIGHT_COLORS: Record<'yellow' | 'pink' | 'green' | 'blue', string> = {
  yellow: '#ffe14f',
  pink: '#ff9fd0',
  green: '#93ea8c',
  blue: '#8fd0ff',
};
export const RED_PEN = '#e2262f';
export const isHighlight = (s: MarkerStyle): s is keyof typeof HIGHLIGHT_COLORS =>
  s in HIGHLIGHT_COLORS;
export type Dir = 'h' | 'v';
export const DIRS: readonly Dir[] = ['h', 'v'];
export type RedactStyle = 'black' | 'mosaic' | 'frost';
export const REDACT_STYLES: readonly RedactStyle[] = ['black', 'mosaic', 'frost'];
export type RedactMode = 'static' | 'reveal' | 'conceal';
export const REDACT_MODES: readonly RedactMode[] = ['static', 'reveal', 'conceal'];

/** 範圍（畫面、時間照原作；濃度、粒大小是新版自訂） */
export const RANGES = {
  blur: { min: 4, max: 60, step: 2 },
  brightness: { min: 15, max: 85, step: 5 },
  scale: { min: 50, max: 100, step: 1 },
  radius: { min: 0, max: 40, step: 1 },
  shadow: { min: 0, max: 64, step: 2 },
  spotlight: { min: 0, max: 90, step: 5 },
  intro: { min: 0, max: 5, step: 0.1 },
  popup: { min: 0, max: 3, step: 0.1 },
  action: { min: 0.1, max: 6, step: 0.1 },
  outro: { min: 0, max: 10, step: 0.1 },
  zoomScale: { min: 1.05, max: 1.65, step: 0.05 },
  density: { min: 20, max: 100, step: 5 },
  grain: { min: 4, max: 48, step: 2 },
} as const;
export type RangeKey = keyof typeof RANGES;

/** 防呆的上限 */
export const LIMITS = {
  credit: 120,
  frames: 60,
  /** 框最小幾 px（原圖 px） */
  minSize: 4,
} as const;

/** 複製的框往右下移幾 px（原圖 px） */
export const DUPLICATE_OFFSET = 16;

/* ---------- 狀態 ---------- */

/** 資產庫裡的一張圖（原檔） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

interface FrameBase extends Rect {
  id: string;
}
export interface ZoomFrame extends FrameBase {
  kind: 'zoom';
  scale: number;
  style: ZoomStyle;
  border: Border;
}
export interface MarkerFrame extends FrameBase {
  kind: 'marker';
  style: MarkerStyle;
  dir: Dir;
}
export interface RedactFrame extends FrameBase {
  kind: 'redact';
  style: RedactStyle;
  mode: RedactMode;
  dir: Dir;
  /** 濃度（%）：黑塊的不透明度、毛玻璃的模糊與霧 */
  density: number;
  /** 馬賽克的粒大小（畫面 px，以截圖原本的大小計） */
  grain: number;
}
export type Frame = ZoomFrame | MarkerFrame | RedactFrame;

export interface BgSettings {
  mode: BgMode;
  /** 模糊半徑（px） */
  blur: number;
  /** 亮度（%） */
  brightness: number;
  color: string;
}
export interface ShotSettings {
  /** 截圖佔畫面的比例（%） */
  scale: number;
  radius: number;
  shadow: number;
  /** 聚光：彈出時周圍變暗（%） */
  spotlight: number;
}
export interface CreditSettings {
  text: string;
  pos: CreditPos;
  size: CreditSize;
}
export interface TimingSettings {
  intro: number;
  popup: number;
  action: number;
  outro: number;
  order: Order;
  fps: Fps;
}

export interface FxState {
  image: ImageRef | null;
  canvas: CanvasPreset;
  bg: BgSettings;
  shot: ShotSettings;
  credit: CreditSettings;
  timing: TimingSettings;
  frames: Frame[];
}

export const initialState = (): FxState => ({
  image: null,
  canvas: '1920x1080',
  bg: { mode: 'blur', blur: 24, brightness: 40, color: '#10131a' },
  shot: { scale: 86, radius: 10, shadow: 32, spotlight: 55 },
  credit: { text: '', pos: 'below', size: 'md' },
  timing: { intro: 0.5, popup: 0.6, action: 1.2, outro: 2, order: 'sequential', fps: 15 },
  frames: [],
});

/* ---------- 新畫的框的預設（不列入復原） ---------- */

export interface FrameDefaults {
  zoom: Pick<ZoomFrame, 'scale' | 'style' | 'border'>;
  marker: Pick<MarkerFrame, 'style' | 'dir'>;
  redact: Pick<RedactFrame, 'style' | 'mode' | 'dir' | 'density' | 'grain'>;
}

export const initialDefaults = (): FrameDefaults => ({
  zoom: { scale: 1.25, style: 'card', border: 4 },
  marker: { style: 'yellow', dir: 'h' },
  redact: { style: 'black', mode: 'reveal', dir: 'h', density: 100, grain: 12 },
});

/* ---------- 整理（存檔、專案檔、測試入口） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = <T>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** 夾在範圍內並對齊每格（step 的小數位數） */
export function snapRange(key: RangeKey, v: unknown, fallback: number): number {
  const r = RANGES[key];
  const n = clamp(num(v, fallback), r.min, r.max);
  const k = Math.round((n - r.min) / r.step);
  const decimals = (String(r.step).split('.')[1] ?? '').length;
  return Number(clamp(r.min + k * r.step, r.min, r.max).toFixed(decimals));
}

const HEX = /^#[0-9a-f]{6}$/;
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v.toLowerCase()) ? v.toLowerCase() : fallback;

const text = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? Array.from(v.replace(/\r?\n|\r/g, ' '))
        .slice(0, max)
        .join('')
    : '';

function normalizeImage(v: unknown): ImageRef | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const w = Math.round(num(v.width, 0));
  const h = Math.round(num(v.height, 0));
  if (w < 1 || h < 1) return null;
  return { id: v.id, name: typeof v.name === 'string' ? v.name : '', width: w, height: h };
}

/** 框的範圍：取整、至少 minSize、夾在圖裡 */
export function clampRect(r: Rect, image: Size): Rect {
  const W = Math.max(1, Math.round(image.width));
  const H = Math.max(1, Math.round(image.height));
  const min = Math.min(LIMITS.minSize, W, H);
  const w = clamp(Math.round(r.w), min, W);
  const h = clamp(Math.round(r.h), min, H);
  return { x: clamp(Math.round(r.x), 0, W - w), y: clamp(Math.round(r.y), 0, H - h), w, h };
}

let idSeq = 0;
/** 新的框 id */
export function newFrameId(taken?: Iterable<string>): string {
  const used = new Set(taken ?? []);
  for (;;) {
    idSeq = (idSeq + 1) % 1_000_000;
    const id = `f${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296)
      .toString(36)
      .padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
}

export function normalizeFrame(v: unknown, image: Size, d = initialDefaults()): Frame | null {
  if (!isObj(v)) return null;
  if (!FRAME_KINDS.includes(v.kind as FrameKind)) return null;
  const kind = v.kind as FrameKind;
  const id = typeof v.id === 'string' && v.id ? v.id.slice(0, 40) : newFrameId();
  const rect = clampRect({ x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 0), h: num(v.h, 0) }, image);
  if (kind === 'zoom')
    return {
      id,
      kind,
      ...rect,
      scale: snapRange('zoomScale', v.scale, d.zoom.scale),
      style: pick(v.style, ZOOM_STYLES, d.zoom.style),
      border: pick(v.border, BORDERS, d.zoom.border),
    };
  if (kind === 'marker')
    return {
      id,
      kind,
      ...rect,
      style: pick(v.style, MARKER_STYLES, d.marker.style),
      dir: pick(v.dir, DIRS, d.marker.dir),
    };
  return {
    id,
    kind,
    ...rect,
    style: pick(v.style, REDACT_STYLES, d.redact.style),
    mode: pick(v.mode, REDACT_MODES, d.redact.mode),
    dir: pick(v.dir, DIRS, d.redact.dir),
    density: snapRange('density', v.density, d.redact.density),
    grain: snapRange('grain', v.grain, d.redact.grain),
  };
}

/** 存檔可能缺欄位或被改壞：補預設值、夾範圍、拿掉看不懂的框；沒有圖時框也清掉 */
export function normalizeState(raw: unknown): FxState {
  const d = initialState();
  const s = isObj(raw) ? raw : {};
  const image = normalizeImage(s.image);
  const bg = isObj(s.bg) ? s.bg : {};
  const shot = isObj(s.shot) ? s.shot : {};
  const credit = isObj(s.credit) ? s.credit : {};
  const timing = isObj(s.timing) ? s.timing : {};
  const frames: Frame[] = [];
  if (image && Array.isArray(s.frames)) {
    const seen = new Set<string>();
    for (const f of s.frames) {
      if (frames.length >= LIMITS.frames) break;
      const n = normalizeFrame(f, image);
      if (!n) continue;
      if (seen.has(n.id)) n.id = newFrameId(seen);
      seen.add(n.id);
      frames.push(n);
    }
  }
  return {
    image,
    canvas: pick(s.canvas, CANVAS_PRESETS, d.canvas),
    bg: {
      mode: pick(bg.mode, BG_MODES, d.bg.mode),
      blur: snapRange('blur', bg.blur, d.bg.blur),
      brightness: snapRange('brightness', bg.brightness, d.bg.brightness),
      color: color(bg.color, d.bg.color),
    },
    shot: {
      scale: snapRange('scale', shot.scale, d.shot.scale),
      radius: snapRange('radius', shot.radius, d.shot.radius),
      shadow: snapRange('shadow', shot.shadow, d.shot.shadow),
      spotlight: snapRange('spotlight', shot.spotlight, d.shot.spotlight),
    },
    credit: {
      text: text(credit.text, LIMITS.credit),
      pos: pick(credit.pos, CREDIT_POSITIONS, d.credit.pos),
      size: pick(credit.size, CREDIT_SIZES, d.credit.size),
    },
    timing: {
      intro: snapRange('intro', timing.intro, d.timing.intro),
      popup: snapRange('popup', timing.popup, d.timing.popup),
      action: snapRange('action', timing.action, d.timing.action),
      outro: snapRange('outro', timing.outro, d.timing.outro),
      order: pick(timing.order, ORDERS, d.timing.order),
      fps: pick(timing.fps, FPS_CHOICES, d.timing.fps),
    },
    frames,
  };
}

export function normalizeDefaults(raw: unknown): FrameDefaults {
  const d = initialDefaults();
  const s = isObj(raw) ? raw : {};
  const z = isObj(s.zoom) ? s.zoom : {};
  const m = isObj(s.marker) ? s.marker : {};
  const r = isObj(s.redact) ? s.redact : {};
  return {
    zoom: {
      scale: snapRange('zoomScale', z.scale, d.zoom.scale),
      style: pick(z.style, ZOOM_STYLES, d.zoom.style),
      border: pick(z.border, BORDERS, d.zoom.border),
    },
    marker: {
      style: pick(m.style, MARKER_STYLES, d.marker.style),
      dir: pick(m.dir, DIRS, d.marker.dir),
    },
    redact: {
      style: pick(r.style, REDACT_STYLES, d.redact.style),
      mode: pick(r.mode, REDACT_MODES, d.redact.mode),
      dir: pick(r.dir, DIRS, d.redact.dir),
      density: snapRange('density', r.density, d.redact.density),
      grain: snapRange('grain', r.grain, d.redact.grain),
    },
  };
}

/** 用目前的預設做一個新框 */
export function makeFrame(kind: FrameKind, rect: Rect, defaults: FrameDefaults, id: string): Frame {
  if (kind === 'zoom') return { id, kind, ...rect, ...defaults.zoom };
  if (kind === 'marker') return { id, kind, ...rect, ...defaults.marker };
  return { id, kind, ...rect, ...defaults.redact };
}

/** 複製：往右下移一點（夾在圖裡）、新的 id */
export function duplicateFrame(f: Frame, image: Size, id: string): Frame {
  const r = clampRect(
    { x: f.x + DUPLICATE_OFFSET, y: f.y + DUPLICATE_OFFSET, w: f.w, h: f.h },
    image,
  );
  return { ...f, ...r, id };
}

/** 同一種框裡的序號（1 起；清單與輔助線上的「放大框 2」） */
export function kindIndex(frames: readonly Frame[], id: string): number {
  const f = frames.find((x) => x.id === id);
  if (!f) return 0;
  let n = 0;
  for (const x of frames) {
    if (x.kind === f.kind) n++;
    if (x.id === id) return n;
  }
  return n;
}

/* ---------- 擺放 ---------- */

/** 截圖在畫面上的範圍（畫面 px）與縮放（畫面 px ÷ 原圖 px） */
export interface Placement extends Rect {
  f: number;
}

/** 出處的字級（畫面 px；小中大＝短邊 1080 時 20、26、34，自訂） */
export const CREDIT_PX: Record<CreditSize, number> = { sm: 20, md: 26, lg: 34 };
export const creditPx = (size: CreditSize, canvas: Size): number =>
  Math.max(10, Math.round(CREDIT_PX[size] * unitOf(canvas)));

export interface CreditLayout {
  px: number;
  /** 文字的基準點 */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
}

export interface Layout {
  canvas: Size;
  shot: Placement;
  credit: CreditLayout | null;
}

/**
 * 截圖：等比放進「畫面 × 比例」的範圍、置中（小圖也放大）。出處在圖下時，圖與出處一起置中（先扣掉一行字的高度）；
 * 在畫面底時放在畫面底部中央；圖內徽章在截圖的右下角（字的右下角，徽章的底另外畫）。
 */
export function computeLayout(s: FxState, image: Size | null): Layout {
  const canvas = canvasSize(s.canvas, image);
  const src = image && image.width > 0 && image.height > 0 ? image : canvas;
  const hasCredit = s.credit.text.trim() !== '';
  const px = creditPx(s.credit.size, canvas);
  const boxW = (canvas.width * s.shot.scale) / 100;
  const boxH = (canvas.height * s.shot.scale) / 100;
  const reserve = hasCredit && s.credit.pos === 'below' ? Math.round(px * 1.9) : 0;
  const f = Math.min(boxW / src.width, Math.max(1, boxH - reserve) / src.height);
  const w = src.width * f;
  const h = src.height * f;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h - reserve) / 2;
  const shot = { x, y, w, h, f };
  let credit: CreditLayout | null = null;
  if (hasCredit) {
    const u = unitOf(canvas);
    if (s.credit.pos === 'below')
      credit = { px, x: x + w, y: y + h + Math.round(px * 1.45), align: 'right' };
    else if (s.credit.pos === 'bottom')
      credit = {
        px,
        x: canvas.width / 2,
        y: canvas.height - Math.max(px * 0.8, 28 * u),
        align: 'center',
      };
    else {
      const pad = Math.round(px * 0.9);
      credit = { px, x: x + w - pad, y: y + h - pad, align: 'right' };
    }
  }
  return { canvas, shot, credit };
}

/** 原圖範圍 → 畫面範圍 */
export const toCanvasRect = (p: Placement, r: Rect): Rect => ({
  x: p.x + r.x * p.f,
  y: p.y + r.y * p.f,
  w: r.w * p.f,
  h: r.h * p.f,
});

/** 畫面範圍 → 原圖範圍（未取整、未夾範圍） */
export const toSourceRect = (p: Placement, r: Rect): Rect => ({
  x: (r.x - p.x) / p.f,
  y: (r.y - p.y) / p.f,
  w: r.w / p.f,
  h: r.h / p.f,
});

/** 畫面上的一點 → 原圖上的一點（夾在圖裡） */
export function toSourcePoint(p: Placement, image: Size, x: number, y: number) {
  return {
    x: clamp((x - p.x) / p.f, 0, image.width),
    y: clamp((y - p.y) / p.f, 0, image.height),
  };
}

/** 拖曳畫出的範圍（原圖 px）；太小（任一邊小於 minSize）時 null＝當成點一下 */
export function rectFromDrag(
  a: { x: number; y: number },
  b: { x: number; y: number },
  image: Size,
): Rect | null {
  const x0 = clamp(Math.min(a.x, b.x), 0, image.width);
  const y0 = clamp(Math.min(a.y, b.y), 0, image.height);
  const x1 = clamp(Math.max(a.x, b.x), 0, image.width);
  const y1 = clamp(Math.max(a.y, b.y), 0, image.height);
  if (x1 - x0 < LIMITS.minSize || y1 - y0 < LIMITS.minSize) return null;
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, image);
}

/** 兩個範圍有沒有重疊（邊相接不算） */
export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* ---------- 時間軸 ---------- */

export type PhaseId = 'intro' | 'popup' | 'action' | 'outro';
export const PHASES: readonly PhaseId[] = ['intro', 'popup', 'action', 'outro'];

/** 會動的框：螢光筆、解除與抹消的塗黑（靜止的塗黑一直蓋著，不佔動作時間） */
export const isActionFrame = (f: Frame): boolean =>
  f.kind === 'marker' || (f.kind === 'redact' && f.mode !== 'static');

export interface Window {
  start: number;
  end: number;
}

export interface Timeline {
  phases: Record<PhaseId, Window>;
  total: number;
  /** 會動的框的動作時間（清單順序） */
  windows: Record<string, Window>;
  /** 會動的框的 id（清單順序） */
  actionIds: string[];
}

/**
 * 四段依序排列：開場（等待）→ 彈出（所有放大框一起彈出、周圍變暗）→ 動作 → 結尾（停在完成的樣子）。
 * 動作：依序＝會動的框照清單順序一個接一個、每個佔「動作」秒數（動作段＝個數 × 秒數）；同時＝全部一起、動作段＝秒數。
 * 沒有會動的框時動作段照樣是「動作」秒數（自訂）。
 */
export function buildTimeline(timing: TimingSettings, frames: readonly Frame[]): Timeline {
  const actionIds = frames.filter(isActionFrame).map((f) => f.id);
  const n = Math.max(1, actionIds.length);
  const actionLen = timing.order === 'sequential' ? n * timing.action : timing.action;
  /* 取到微秒（0.1 秒的加總不會變成 4.6999…） */
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const win = (start: number, len: number): Window => ({ start: r6(start), end: r6(start + len) });
  const intro = win(0, timing.intro);
  const popup = win(intro.end, timing.popup);
  const action = win(popup.end, actionLen);
  const outro = win(action.end, timing.outro);
  const windows: Record<string, Window> = {};
  actionIds.forEach((id, i) => {
    windows[id] = win(
      timing.order === 'sequential' ? action.start + i * timing.action : action.start,
      timing.action,
    );
  });
  return { phases: { intro, popup, action, outro }, total: outro.end, windows, actionIds };
}

/** 時間軸的分段色條 */
export function timelineSegments(
  tl: Timeline,
  labels: Record<PhaseId, string>,
  colors?: Partial<Record<PhaseId, string>>,
): TimelineSegment[] {
  return PHASES.filter((id) => tl.phases[id].end > tl.phases[id].start).map((id) => ({
    id,
    label: labels[id],
    start: tl.phases[id].start,
    end: tl.phases[id].end,
    color: colors?.[id],
  }));
}

/** w 之間的進度 0～1（長度 0 時到了就是 1） */
export const windowProgress = (w: Window, t: number): number =>
  w.end <= w.start ? (t >= w.start ? 1 : 0) : clamp01((t - w.start) / (w.end - w.start));

/** 彈出的進度（線性 0～1） */
export const popupProgress = (tl: Timeline, t: number): number =>
  windowProgress(tl.phases.popup, t);

/** 一個框的動作進度（線性 0～1）；不會動的框一律 1 */
export function actionProgress(tl: Timeline, id: string, t: number): number {
  const w = tl.windows[id];
  return w ? windowProgress(w, t) : 1;
}

/** 放大框彈出後的倍率（過衝回彈：中間會略超過再回到設定的倍率） */
export const zoomFactor = (scale: number, p: number): number =>
  p <= 0 ? 1 : p >= 1 ? scale : 1 + (scale - 1) * EASE.back(p);

/** 放大框的外框、陰影與周圍變暗的濃度（緩停） */
export const popupAlpha = (p: number): number => EASE.out(clamp01(p));

/** 螢光筆、塗黑的動作曲線（平滑 S 形） */
export const actionEase = (q: number): number => EASE.smooth(clamp01(q));

/**
 * 塗黑蓋住的範圍（框的比例 [a, b]，沿方向；q＝已經走了多少，已套曲線）：
 * 靜止＝一直全蓋；解除＝從起點那一側剝開（[q, 1]）；抹消＝從起點那一側蓋上（[0, q]）。
 */
export function coverSpan(mode: RedactMode, q: number): [number, number] {
  const v = clamp01(q);
  if (mode === 'static') return [0, 1];
  if (mode === 'reveal') return [v, 1];
  return [0, v];
}

/** 範圍的一段（沿方向，比例 a～b） */
export function spanRect(r: Rect, dir: Dir, a: number, b: number): Rect {
  if (dir === 'h') return { x: r.x + r.w * a, y: r.y, w: r.w * Math.max(0, b - a), h: r.h };
  return { x: r.x, y: r.y + r.h * a, w: r.w, h: r.h * Math.max(0, b - a) };
}

/**
 * 放大框彈出後在畫面上的範圍：以框的中心放大 k 倍，超出畫面時推回來（留 margin；比畫面還大時置中）。
 */
export function cardRect(src: Rect, shot: Placement, canvas: Size, k: number, margin = 0): Rect {
  const c = toCanvasRect(shot, src);
  const w = c.w * k;
  const h = c.h * k;
  let x = c.x + c.w / 2 - w / 2;
  let y = c.y + c.h / 2 - h / 2;
  const place = (pos: number, len: number, total: number) =>
    len > total - margin * 2 ? (total - len) / 2 : clamp(pos, margin, total - margin - len);
  x = place(x, w, canvas.width);
  y = place(y, h, canvas.height);
  return { x, y, w, h };
}

/* ---------- 匯出 ---------- */

/** APNG 的取樣時間（每格 1 ÷ FPS 秒；最後一格是完成的樣子） */
export function apngTimes(total: number, fps: number): number[] {
  const n = frameCount(total, fps);
  return Array.from({ length: n }, (_, i) => frameTime(i, n, total, fps));
}

/** 影片的格數與取樣時間（同 APNG：最後一格是完成的樣子） */
export const videoTimes = apngTimes;

const pad = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export type FileKind = 'png' | 'apng' | 'mp4' | 'webm' | 'mov';
/** 檔名：screenshot-fx-年月日-時分秒（APNG 加 -anim） */
export function exportFileName(kind: FileKind, now: Date): string {
  const base = `screenshot-fx-${stamp(now)}`;
  if (kind === 'apng') return `${base}-anim.png`;
  return `${base}.${kind}`;
}

/** 專案檔用到的圖 */
export const stateAssetIds = (s: FxState): string[] => (s.image ? [s.image.id] : []);
