/**
 * 圖片演出引擎的資料：尺寸、畫面與背景、出處、時間軸、運鏡的設定，框的共用欄位（放大框、塗黑），
 * 範圍與整理存檔的小工具。工具自己的框（螢光筆、路線…）與選項在工具目錄。
 */
import { clamp } from '@/core/timeline';

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

export interface Point {
  x: number;
  y: number;
}

/* ---------- 畫面、背景、出處、時間軸、運鏡 ---------- */

/** 畫面大小：三種預設與「原圖大小」 */
export type CanvasPreset = '1920x1080' | '1080x1920' | '1200x900' | 'original';
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  '1920x1080',
  '1080x1920',
  '1200x900',
  'original',
];

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

/** 運鏡：沒有／從某個框放大開始，慢慢拉回全圖 */
export type CameraMode = 'off' | 'pullback';
export const CAMERA_MODES: readonly CameraMode[] = ['off', 'pullback'];
/** 一開始看的位置：演出開始的那一端／框的中央 */
export type CameraFocus = 'start' | 'center';
export const CAMERA_FOCUSES: readonly CameraFocus[] = ['start', 'center'];

export interface BgSettings {
  mode: BgMode;
  /** 模糊半徑（px） */
  blur: number;
  /** 亮度（%） */
  brightness: number;
  color: string;
}
export interface ShotSettings {
  /** 圖佔畫面的比例（%） */
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
export interface CameraSettings {
  mode: CameraMode;
  /** 對象：'auto' 或框的 id */
  target: string;
  focus: CameraFocus;
  /** 一開始的倍率 */
  zoom: number;
  /** 拉回全圖的秒數 */
  duration: number;
}

/* ---------- 框 ---------- */

/** 資產庫裡的一張圖（原檔） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 每個框都有的欄位（範圍是原圖 px）；kind 'zoom'（放大框）、'redact'（塗黑）由引擎畫，其他種類由工具畫 */
export interface FrameBase extends Rect {
  id: string;
  kind: string;
}

export type Border = 2 | 4 | 6;
export const BORDERS: readonly Border[] = [2, 4, 6];

/** 放大框：以框的中心放大、彈出（樣式由工具畫） */
export interface ZoomFrameBase<Style extends string = string> extends FrameBase {
  kind: 'zoom';
  scale: number;
  style: Style;
  border: Border;
}

export type RedactMode = 'static' | 'reveal' | 'conceal';
export const REDACT_MODES: readonly RedactMode[] = ['static', 'reveal', 'conceal'];
/** 塗黑的方向：橫向、直向（從起點那一側掀開或蓋上）；fade＝整塊淡出（淡入） */
export type RedactDir = 'h' | 'v' | 'fade';
/** 塗黑揭開、蓋上時的邊界演出：金光（光點）、掃描線、不加 */
export type EdgeFx = 'glow' | 'scan' | 'none';
export const EDGE_FXS: readonly EdgeFx[] = ['glow', 'scan', 'none'];

/** 塗黑：蓋住一塊，可以揭開或蓋上（樣式由引擎或工具畫） */
export interface RedactFrameBase<Style extends string = string, Dir extends RedactDir = RedactDir>
  extends FrameBase {
  kind: 'redact';
  style: Style;
  mode: RedactMode;
  dir: Dir;
  /** 濃度（%）：黑塊的不透明度、毛玻璃的模糊與霧 */
  density: number;
  /** 馬賽克的粒大小（畫面 px，以圖原本的大小計） */
  grain: number;
  /** 揭開、蓋上時邊界的演出 */
  edge: EdgeFx;
  /** 發光強度（%） */
  glow: number;
}

/** 引擎看到的內容（工具的狀態可以多放欄位） */
export interface FxDoc<F extends FrameBase = FrameBase> {
  image: ImageRef | null;
  canvas: CanvasPreset;
  bg: BgSettings;
  shot: ShotSettings;
  credit: CreditSettings;
  timing: TimingSettings;
  /** 運鏡（沒有運鏡的工具不給） */
  camera?: CameraSettings;
  frames: F[];
}

export const isZoom = (f: FrameBase): f is ZoomFrameBase => f.kind === 'zoom';
export const isRedact = (f: FrameBase): f is RedactFrameBase => f.kind === 'redact';
/** 標記：放大框、塗黑以外的框（工具畫；圖層 ZIP 的第三張） */
export const isMark = (f: FrameBase): boolean => f.kind !== 'zoom' && f.kind !== 'redact';

/* ---------- 範圍與預設 ---------- */

export interface RangeSpec {
  min: number;
  max: number;
  step: number;
}

/** 共用的範圍（畫面、時間照原作；濃度、粒大小、發光強度是本站自訂） */
export const BASE_RANGES = {
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
  glow: { min: 0, max: 100, step: 5 },
  camZoom: { min: 1.2, max: 4, step: 0.1 },
  camDuration: { min: 1, max: 8, step: 0.1 },
} as const satisfies Record<string, RangeSpec>;
export type BaseRangeKey = keyof typeof BASE_RANGES;

/** 防呆的上限 */
export const LIMITS = {
  credit: 120,
  frames: 60,
  /** 框最小幾 px（原圖 px） */
  minSize: 4,
} as const;

/** 複製的框往右下移幾 px（原圖 px） */
export const DUPLICATE_OFFSET = 16;

export const initialBg = (): BgSettings => ({
  mode: 'blur',
  blur: 24,
  brightness: 40,
  color: '#10131a',
});
export const initialShot = (): ShotSettings => ({
  scale: 86,
  radius: 10,
  shadow: 32,
  spotlight: 55,
});
export const initialCredit = (): CreditSettings => ({ text: '', pos: 'below', size: 'md' });
export const initialTiming = (): TimingSettings => ({
  intro: 0.5,
  popup: 0.6,
  action: 1.2,
  outro: 2,
  order: 'sequential',
  fps: 15,
});
export const initialCamera = (): CameraSettings => ({
  mode: 'off',
  target: 'auto',
  focus: 'start',
  zoom: 2.4,
  duration: 3.6,
});

/* ---------- 整理（存檔、專案檔、測試入口） ---------- */

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const pick = <T>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
export const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** 夾在範圍內並對齊每格（step 的小數位數） */
export function snapTo(r: RangeSpec, v: unknown, fallback: number): number {
  const n = clamp(num(v, fallback), r.min, r.max);
  const k = Math.round((n - r.min) / r.step);
  const decimals = (String(r.step).split('.')[1] ?? '').length;
  return Number(clamp(r.min + k * r.step, r.min, r.max).toFixed(decimals));
}

const HEX = /^#[0-9a-f]{6}$/;
export const hexColor = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v.toLowerCase()) ? v.toLowerCase() : fallback;

/** 單行文字：換行變空白、截到 max 個字 */
export const lineText = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? Array.from(v.replace(/\r?\n|\r/g, ' '))
        .slice(0, max)
        .join('')
    : '';

export function normalizeImage(v: unknown): ImageRef | null {
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

/** 框的 id 與範圍（整理存檔用；看不懂的 id 換新的） */
export function normalizeFrameBase(v: Record<string, unknown>, image: Size): { id: string } & Rect {
  const id = typeof v.id === 'string' && v.id ? v.id.slice(0, 40) : newFrameId();
  return {
    id,
    ...clampRect({ x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 0), h: num(v.h, 0) }, image),
  };
}

/** 框的清單：整理每個、拿掉看不懂的、重複的 id 換新的、最多 60 個；沒有圖時清空 */
export function normalizeFrames<F extends FrameBase>(
  raw: unknown,
  image: Size | null,
  one: (v: unknown, image: Size) => F | null,
): F[] {
  const frames: F[] = [];
  if (!image || !Array.isArray(raw)) return frames;
  const seen = new Set<string>();
  for (const f of raw) {
    if (frames.length >= LIMITS.frames) break;
    const n = one(f, image);
    if (!n) continue;
    if (seen.has(n.id)) n.id = newFrameId(seen);
    seen.add(n.id);
    frames.push(n);
  }
  return frames;
}

/** 畫面、背景、截圖的擺放、出處、時間軸（存檔可能缺欄位或被改壞：補預設值、夾範圍） */
export function normalizeDocBase(s: Record<string, unknown>) {
  const bg = isObj(s.bg) ? s.bg : {};
  const shot = isObj(s.shot) ? s.shot : {};
  const credit = isObj(s.credit) ? s.credit : {};
  const timing = isObj(s.timing) ? s.timing : {};
  const R = BASE_RANGES;
  const dBg = initialBg();
  const dShot = initialShot();
  const dCredit = initialCredit();
  const dTiming = initialTiming();
  return {
    image: normalizeImage(s.image),
    canvas: pick(s.canvas, CANVAS_PRESETS, '1920x1080' as CanvasPreset),
    bg: {
      mode: pick(bg.mode, BG_MODES, dBg.mode),
      blur: snapTo(R.blur, bg.blur, dBg.blur),
      brightness: snapTo(R.brightness, bg.brightness, dBg.brightness),
      color: hexColor(bg.color, dBg.color),
    },
    shot: {
      scale: snapTo(R.scale, shot.scale, dShot.scale),
      radius: snapTo(R.radius, shot.radius, dShot.radius),
      shadow: snapTo(R.shadow, shot.shadow, dShot.shadow),
      spotlight: snapTo(R.spotlight, shot.spotlight, dShot.spotlight),
    },
    credit: {
      text: lineText(credit.text, LIMITS.credit),
      pos: pick(credit.pos, CREDIT_POSITIONS, dCredit.pos),
      size: pick(credit.size, CREDIT_SIZES, dCredit.size),
    },
    timing: {
      intro: snapTo(R.intro, timing.intro, dTiming.intro),
      popup: snapTo(R.popup, timing.popup, dTiming.popup),
      action: snapTo(R.action, timing.action, dTiming.action),
      outro: snapTo(R.outro, timing.outro, dTiming.outro),
      order: pick(timing.order, ORDERS, dTiming.order),
      fps: pick(timing.fps, FPS_CHOICES, dTiming.fps),
    },
  };
}

/** 運鏡（指定的框不在了、或不是候選時回到自動） */
export function normalizeCamera<F extends FrameBase>(
  raw: unknown,
  frames: readonly F[],
  isCandidate: (f: F) => boolean,
): CameraSettings {
  const c = isObj(raw) ? raw : {};
  const d = initialCamera();
  return {
    mode: pick(c.mode, CAMERA_MODES, d.mode),
    target:
      typeof c.target === 'string' && frames.some((f) => f.id === c.target && isCandidate(f))
        ? c.target
        : 'auto',
    focus: pick(c.focus, CAMERA_FOCUSES, d.focus),
    zoom: snapTo(BASE_RANGES.camZoom, c.zoom, d.zoom),
    duration: snapTo(BASE_RANGES.camDuration, c.duration, d.duration),
  };
}

/** 同一種框裡的序號（1 起；清單與輔助線上的「放大框 2」） */
export function kindIndex(frames: readonly FrameBase[], id: string): number {
  const f = frames.find((x) => x.id === id);
  if (!f) return 0;
  let n = 0;
  for (const x of frames) {
    if (x.kind === f.kind) n++;
    if (x.id === id) return n;
  }
  return n;
}
