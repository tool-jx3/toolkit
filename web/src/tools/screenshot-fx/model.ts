/**
 * 截圖演出產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/screenshot-fx.md）。
 * 畫面、背景、擺放、時間軸、運鏡、編輯區、檔名的規則在共用的圖片演出引擎（core/imagefx）；這裡是截圖演出自己的：
 * 三種演出框（放大框、螢光筆、塗黑）與它們的選項、預設值、整理存檔，以及綁好這些框的時間軸。
 * 引擎的名稱照舊從這裡匯出（測試與其他檔案不必改）。
 */
import {
  BASE_RANGES,
  type BaseRangeKey,
  BORDERS,
  type Border,
  buildTimeline as buildFxTimeline,
  type CameraSettings,
  clampRect,
  DUPLICATE_OFFSET,
  EDGE_FXS,
  type EdgeFx,
  type FileKind,
  type FxDoc,
  cameraTarget as fxCameraTarget,
  fxFileName,
  stepFrames as fxStepFrames,
  stepProgress as fxStepProgress,
  initialBg,
  initialCamera,
  initialCredit,
  initialShot,
  initialTiming,
  isObj,
  normalizeCamera,
  normalizeDocBase,
  normalizeFrameBase,
  normalizeFrames,
  type Progress,
  pick,
  REDACT_MODES,
  type Rect,
  type RedactFrameBase,
  type RedactMode,
  type Size,
  snapTo,
  type Timeline,
  type TimelineKit,
  type TimingSettings,
  type ZoomFrameBase,
} from '@/core/imagefx';

export type {
  BgMode,
  BgSettings,
  Border,
  CameraFocus,
  CameraMode,
  CameraSettings,
  CanvasPreset,
  CreditLayout,
  CreditPos,
  CreditSettings,
  CreditSize,
  EdgeFx,
  FileKind,
  Fps,
  ImageRef,
  LayerId,
  Layout,
  Order,
  PhaseId,
  Placement,
  Progress,
  Rect,
  RedactMode,
  ShotSettings,
  Size,
  Timeline,
  TimingSettings,
  Window,
} from '@/core/imagefx';
export {
  actionEase,
  actionProgress,
  apngTimes,
  BG_MODES,
  BORDERS,
  badgeDiameter,
  CAMERA_FOCUSES,
  CAMERA_MODES,
  CAMERA_START_INSET,
  CANVAS_PRESETS,
  CARD_MARGIN,
  CREDIT_POSITIONS,
  CREDIT_PX,
  CREDIT_SIZES,
  cameraFocusRect,
  cameraView,
  canvasSize,
  cardRect,
  clampRect,
  computeLayout,
  coverSpan,
  creditPx,
  DUPLICATE_OFFSET,
  EDGE_FXS,
  EDIT_ZOOM_MAX,
  EDIT_ZOOMS,
  edgeEnvelope,
  editZoomFor,
  evenSize,
  FALLBACK_SIZE,
  FPS_CHOICES,
  frameAt,
  frameFileName,
  initialCamera,
  intersects,
  kindIndex,
  LAYERS,
  LIMITS,
  layerFileName,
  newFrameId,
  ORDERS,
  ORIGINAL_MAX_SIDE,
  PHASES,
  PRESET_SIZE,
  popupAlpha,
  popupProgress,
  REDACT_MODES,
  rectFromDrag,
  rectInCard,
  SEQUENCE_MAX_FRAMES,
  spanRect,
  stackOrder,
  stamp,
  stepEditZoom,
  stepFileName,
  timelineSegments,
  timeProgress,
  toCanvasRect,
  toSourcePoint,
  toSourceRect,
  unitOf,
  VIDEO_FPS,
  videoTimes,
  windowProgress,
  zoomFactor,
} from '@/core/imagefx';

/* ---------- 選項 ---------- */

export type FrameKind = 'zoom' | 'marker' | 'redact';
export const FRAME_KINDS: readonly FrameKind[] = ['zoom', 'marker', 'redact'];
export type ZoomStyle = 'card' | 'torn' | 'cyber' | 'shadow';
export const ZOOM_STYLES: readonly ZoomStyle[] = ['card', 'torn', 'cyber', 'shadow'];
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

/** 範圍（畫面、時間照原作；濃度、粒大小是新版自訂） */
export const RANGES = BASE_RANGES;
export type RangeKey = BaseRangeKey;

/** 夾在範圍內並對齊每格（step 的小數位數） */
export const snapRange = (key: RangeKey, v: unknown, fallback: number): number =>
  snapTo(RANGES[key], v, fallback);

/* ---------- 狀態 ---------- */

export interface ZoomFrame extends ZoomFrameBase<ZoomStyle> {}
export interface MarkerFrame extends Rect {
  id: string;
  kind: 'marker';
  style: MarkerStyle;
  dir: Dir;
}
export interface RedactFrame extends RedactFrameBase<RedactStyle, Dir> {}
export type Frame = ZoomFrame | MarkerFrame | RedactFrame;

export interface FxState extends FxDoc<Frame> {
  camera: CameraSettings;
}

export const initialState = (): FxState => ({
  image: null,
  canvas: '1920x1080',
  bg: initialBg(),
  shot: initialShot(),
  credit: initialCredit(),
  timing: initialTiming(),
  camera: initialCamera(),
  frames: [],
});

/* ---------- 新畫的框的預設（不列入復原） ---------- */

export interface FrameDefaults {
  zoom: Pick<ZoomFrame, 'scale' | 'style' | 'border'>;
  marker: Pick<MarkerFrame, 'style' | 'dir'>;
  redact: Pick<RedactFrame, 'style' | 'mode' | 'dir' | 'density' | 'grain' | 'edge' | 'glow'>;
}

export const initialDefaults = (): FrameDefaults => ({
  zoom: { scale: 1.25, style: 'card', border: 4 },
  marker: { style: 'yellow', dir: 'h' },
  redact: {
    style: 'black',
    mode: 'reveal',
    dir: 'h',
    density: 100,
    grain: 12,
    edge: 'glow',
    glow: 70,
  },
});

/* ---------- 整理（存檔、專案檔、測試入口） ---------- */

export function normalizeFrame(v: unknown, image: Size, d = initialDefaults()): Frame | null {
  if (!isObj(v)) return null;
  if (!FRAME_KINDS.includes(v.kind as FrameKind)) return null;
  const kind = v.kind as FrameKind;
  const { id, ...rect } = normalizeFrameBase(v, image);
  if (kind === 'zoom')
    return {
      id,
      kind,
      ...rect,
      scale: snapRange('zoomScale', v.scale, d.zoom.scale),
      style: pick(v.style, ZOOM_STYLES, d.zoom.style),
      border: pick(v.border, BORDERS, d.zoom.border as Border),
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
    mode: pick(v.mode, REDACT_MODES, d.redact.mode as RedactMode),
    dir: pick(v.dir, DIRS, d.redact.dir),
    density: snapRange('density', v.density, d.redact.density),
    grain: snapRange('grain', v.grain, d.redact.grain),
    edge: pick(v.edge, EDGE_FXS, d.redact.edge as EdgeFx),
    glow: snapRange('glow', v.glow, d.redact.glow),
  };
}

/** 運鏡的對象可以選的框：螢光筆與塗黑 */
export const isCameraCandidate = (f: Frame): boolean => f.kind === 'marker' || f.kind === 'redact';

/** 存檔可能缺欄位或被改壞：補預設值、夾範圍、拿掉看不懂的框；沒有圖時框也清掉 */
export function normalizeState(raw: unknown): FxState {
  const s = isObj(raw) ? raw : {};
  const base = normalizeDocBase(s);
  const frames = normalizeFrames(s.frames, base.image, (f, image) => normalizeFrame(f, image));
  return {
    ...base,
    camera: normalizeCamera(s.camera, frames, isCameraCandidate),
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
      edge: pick(r.edge, EDGE_FXS, d.redact.edge),
      glow: snapRange('glow', r.glow, d.redact.glow),
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

/* ---------- 時間軸 ---------- */

/** 會動的框：螢光筆、揭開與蓋上的塗黑（靜止的塗黑一直蓋著，不佔動作時間） */
export const isActionFrame = (f: Frame): boolean =>
  f.kind === 'marker' || (f.kind === 'redact' && f.mode !== 'static');

/** 引擎看的「哪些框會動、哪些可以當運鏡的對象」 */
export const timelineKit: TimelineKit<Frame> = { isAction: isActionFrame, isCameraCandidate };

/**
 * 運鏡的對象：指定的框（螢光筆或塗黑）；自動或指定的框不在了時，第一個會動的螢光筆或塗黑，沒有時第一個螢光筆或塗黑。
 * 運鏡關掉、沒有候選時 null。
 */
export const cameraTarget = (frames: readonly Frame[], camera: CameraSettings): Frame | null =>
  fxCameraTarget(frames, camera, timelineKit);

/**
 * 四段依序排列：開場 → 彈出 → 動作 → 結尾（規則見 core/imagefx 的 buildTimeline）。
 */
export const buildTimeline = (
  timing: TimingSettings,
  frames: readonly Frame[],
  camera?: CameraSettings,
): Timeline => buildFxTimeline(timing, frames, timelineKit, camera);

/** 整份內容的時間軸（含運鏡） */
export const timelineOf = (s: FxState): Timeline => buildTimeline(s.timing, s.frames, s.camera);

/** 段階公開的順序：放大框與會動的框，照清單順序（靜止的塗黑一直蓋著，不算一個階段） */
export const stepFrames = (frames: readonly Frame[]): Frame[] =>
  fxStepFrames(frames, isActionFrame);

/** 第 k 個階段（0＝演出前）：前 k 個框做完、其他的還沒開始 */
export const stepProgress = (frames: readonly Frame[], k: number): Progress =>
  fxStepProgress(frames, k, isActionFrame);

/* ---------- 匯出 ---------- */

/** 檔名：screenshot-fx-年月日-時分秒（APNG 加 -anim） */
export const exportFileName = (kind: FileKind, now: Date): string =>
  fxFileName('screenshot-fx', kind, now);

/** 專案檔用到的圖 */
export const stateAssetIds = (s: FxState): string[] => (s.image ? [s.image.id] : []);
