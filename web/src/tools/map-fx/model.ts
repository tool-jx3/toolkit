/**
 * 地圖演出產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/map-fx.md）。
 * 畫面、背景、擺放、時間軸、編輯區、匯出的流程在共用的圖片演出引擎（core/imagefx）；這裡是地圖演出自己的：
 * 三種演出框（區域放大、路線・地點、房間遮罩）與它們的選項、預設值、整理存檔；路線的形狀與點；
 * 房間遮罩 ZIP 的檔名與格數、X 用 MP4 的大小。
 */
import {
  BASE_RANGES,
  type BaseRangeKey,
  BORDERS,
  type Border,
  buildTimeline as buildFxTimeline,
  clampRect,
  DRAG_CORNERS,
  type DragCorner,
  DUPLICATE_OFFSET,
  EDGE_FXS,
  type FxDoc,
  fxFileName,
  stepFrames as fxStepFrames,
  stepProgress as fxStepProgress,
  initialBg,
  initialCredit,
  initialShot,
  initialTiming,
  isObj,
  LIMITS,
  lineText,
  normalizeDocBase,
  normalizeFrameBase,
  normalizeFrames,
  num,
  type Point,
  type Progress,
  pick,
  REDACT_MODES,
  type Rect,
  type RedactFrameBase,
  type Size,
  snapTo,
  type Timeline,
  type TimelineKit,
  type TimingSettings,
  type VideoMode,
  type ZoomFrameBase,
} from '@/core/imagefx';
import { clamp } from '@/core/timeline';
import { initialWalk, normalizeWalk, type WalkState } from './walk';

export type {
  Border,
  EdgeFx,
  ImageRef,
  LayerId,
  Layout,
  Placement,
  Point,
  Progress,
  Rect,
  RedactMode,
  Size,
  Timeline,
  TimingSettings,
} from '@/core/imagefx';
export {
  actionProgress,
  apngTimes,
  BG_MODES,
  BORDERS,
  CANVAS_PRESETS,
  canvasSize,
  cardRect,
  clampRect,
  computeLayout,
  EDGE_FXS,
  evenSize,
  frameAt,
  frameFileName,
  kindIndex,
  LIMITS,
  layerFileName,
  popupProgress,
  REDACT_MODES,
  rectFromDrag,
  rectInCard,
  redactCover,
  stackOrder,
  stepFileName,
  toCanvasRect,
  toSourcePoint,
  toSourceRect,
  unitOf,
  VIDEO_FPS,
  windowProgress,
} from '@/core/imagefx';

/* ---------- 選項 ---------- */

export type FrameKind = 'zoom' | 'route' | 'redact';
export const FRAME_KINDS: readonly FrameKind[] = ['zoom', 'route', 'redact'];

/** 區域放大的四種框（外觀本站自己設計） */
export type ZoomStyle = 'plain' | 'oldmap' | 'tactical' | 'shadow';
export const ZOOM_STYLES: readonly ZoomStyle[] = ['plain', 'oldmap', 'tactical', 'shadow'];

/** 路線・地點的七種：四種路線、目的地圖釘、鎖定準星、危險區 */
export type RouteStyle = 'dashed' | 'footprints' | 'neon' | 'march' | 'pin' | 'target' | 'danger';
export const ROUTE_STYLES: readonly RouteStyle[] = [
  'dashed',
  'footprints',
  'neon',
  'march',
  'pin',
  'target',
  'danger',
];
/** 沿著路線畫的四種（點選建立的路線也能用） */
export const PATH_STYLES: readonly RouteStyle[] = ['dashed', 'footprints', 'neon', 'march'];
export const isPathStyle = (s: RouteStyle): boolean => PATH_STYLES.includes(s);

/** 拖曳畫出的路線形狀（在拖出的範圍裡）：直線四個方向、L 字兩種、Z 字 */
export type RouteShape = 'right' | 'left' | 'down' | 'up' | 'hv' | 'vh' | 'z';
export const ROUTE_SHAPES: readonly RouteShape[] = ['right', 'left', 'down', 'up', 'hv', 'vh', 'z'];

/** 房間遮罩的四種 */
export type RedactStyle = 'dark' | 'keepout' | 'fog' | 'mosaic';
export const REDACT_STYLES: readonly RedactStyle[] = ['dark', 'keepout', 'fog', 'mosaic'];
/** 揭開（蓋上）的效果：淡出、由左往右掃、由上往下掃 */
export type RevealFx = 'fade' | 'h' | 'v';
export const REVEAL_FXS: readonly RevealFx[] = ['fade', 'h', 'v'];

/** 範圍（畫面、時間照原作；濃度、粒大小、發光強度、格的大小是本站自訂） */
export const RANGES = {
  ...BASE_RANGES,
  grid: { min: 8, max: 200, step: 1 },
} as const;
export type RangeKey = BaseRangeKey | 'grid';

export const snapRange = (key: RangeKey, v: unknown, fallback: number): number =>
  snapTo(RANGES[key], v, fallback);

/** 地圖演出自己的上限 */
export const MAP_LIMITS = {
  /** 標籤、房名的字數 */
  label: 40,
  /** 點選建立的路線最多幾個點 */
  points: 64,
} as const;

/* ---------- 狀態 ---------- */

export type ZoomFrame = ZoomFrameBase<ZoomStyle>;

export interface RouteFrame extends Rect {
  id: string;
  kind: 'route';
  style: RouteStyle;
  /** 拖曳畫出的形狀，或 points（點選建立：照 points 依序經過） */
  shape: RouteShape | 'points';
  /** 點選建立的路線經過的點（原圖 px）；其他形狀是空的 */
  points: Point[];
  /** 標籤（例：「0:10 潛入」） */
  label: string;
  /**
   * 拖曳畫出時從哪個角開始（L 字與 Z 字從這個角出發、走到對角；直線照形狀的方向）。
   * 左上（nw）時不寫（舊的存檔、點選建立的路線都沒有這個欄位）。
   */
  from?: DragCorner;
}

export interface RedactFrame extends RedactFrameBase<RedactStyle, RevealFx> {
  /** 房名（黑暗遮罩寫在「？」下面） */
  label: string;
}

export type Frame = ZoomFrame | RouteFrame | RedactFrame;

/** 內容：共用的圖片演出內容（地圖、畫面、背景、擺放、出處、時間軸、框）＋進階 3D 的設定（walk.ts） */
export type MapState = FxDoc<Frame> & { walk: WalkState };

export const initialState = (): MapState => ({
  image: null,
  canvas: '1920x1080',
  bg: initialBg(),
  shot: initialShot(),
  credit: initialCredit(),
  timing: initialTiming(),
  frames: [],
  walk: initialWalk(),
});

/* ---------- 新畫的框的預設（不列入復原） ---------- */

export interface FrameDefaults {
  zoom: Pick<ZoomFrame, 'scale' | 'style' | 'border'>;
  route: Pick<RouteFrame, 'style' | 'label'> & { shape: RouteShape };
  redact: Pick<
    RedactFrame,
    'style' | 'mode' | 'dir' | 'density' | 'grain' | 'edge' | 'glow' | 'label'
  >;
}

export const initialDefaults = (): FrameDefaults => ({
  zoom: { scale: 1.25, style: 'plain', border: 4 },
  route: { style: 'dashed', shape: 'right', label: '' },
  redact: {
    style: 'dark',
    mode: 'reveal',
    dir: 'fade',
    density: 100,
    grain: 12,
    edge: 'glow',
    glow: 70,
    label: '',
  },
});

/* ---------- 路線的形狀與點 ---------- */

/** 點的範圍（原圖 px；至少 minSize，夾在圖裡） */
export function boundsOf(points: readonly Point[], image: Size): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  const w = Math.max(LIMITS.minSize, x1 - x0);
  const h = Math.max(LIMITS.minSize, y1 - y0);
  return clampRect({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }, image);
}

/** 點夾在圖裡、取到 0.1 px */
export const clampPoint = (p: Point, image: Size): Point => ({
  x: Math.round(clamp(p.x, 0, image.width) * 10) / 10,
  y: Math.round(clamp(p.y, 0, image.height) * 10) / 10,
});

/**
 * 路線經過的點（原圖 px）：點選建立的照 points；拖曳畫出的在範圍裡——
 * 直線走範圍的中線（左→右、右→左、上→下、下→上，照形狀的選項），
 * L 字從拖曳的起點那一角（from，預設左上）出發、走到對角（先橫後直、先直後橫），
 * Z 字從起點那一角橫走到一半、直走、再橫走到對角。地點（圖釘、準星、危險區）不是路線，回傳空的。
 */
export function routePath(f: RouteFrame): Point[] {
  if (f.shape === 'points') return f.points.map((p) => ({ ...p }));
  if (!isPathStyle(f.style)) return [];
  const { x, y, w, h } = f;
  const x1 = x + w;
  const y1 = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (f.shape) {
    case 'right':
      return [
        { x, y: cy },
        { x: x1, y: cy },
      ];
    case 'left':
      return [
        { x: x1, y: cy },
        { x, y: cy },
      ];
    case 'down':
      return [
        { x: cx, y },
        { x: cx, y: y1 },
      ];
    case 'up':
      return [
        { x: cx, y: y1 },
        { x: cx, y },
      ];
  }
  /* L 字、Z 字：起點那一角 → 對角 */
  const from = f.from ?? 'nw';
  const sx = from.endsWith('e') ? x1 : x;
  const ex = from.endsWith('e') ? x : x1;
  const sy = from.startsWith('s') ? y1 : y;
  const ey = from.startsWith('s') ? y : y1;
  if (f.shape === 'hv')
    return [
      { x: sx, y: sy },
      { x: ex, y: sy },
      { x: ex, y: ey },
    ];
  if (f.shape === 'vh')
    return [
      { x: sx, y: sy },
      { x: sx, y: ey },
      { x: ex, y: ey },
    ];
  return [
    { x: sx, y: sy },
    { x: cx, y: sy },
    { x: cx, y: ey },
    { x: ex, y: ey },
  ];
}

/** 折線的長度 */
export function pathLength(pts: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

/** 沿折線走 d 的位置與前進的方向（弧度）；d 超出範圍時夾到頭尾 */
export function pointAlong(
  pts: readonly Point[],
  d: number,
): { x: number; y: number; angle: number } {
  if (!pts.length) return { x: 0, y: 0, angle: 0 };
  let left = Math.max(0, d);
  let angle = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l <= 1e-9) continue;
    angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= l) {
      const u = left / l;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle };
    }
    left -= l;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, angle };
}

/** 折線的前 d 那一段（給部分畫線用） */
export function pathUntil(pts: readonly Point[], d: number): Point[] {
  if (pts.length < 2 || d <= 0) return pts.slice(0, 1);
  const out: Point[] = [{ ...pts[0] }];
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l >= left) {
      const u = l > 0 ? left / l : 0;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      return out;
    }
    out.push({ ...b });
    left -= l;
  }
  return out;
}

/** 範圍改了（移動、改大小）：點選路線的點照比例跟著動 */
export function movePoints(points: readonly Point[], from: Rect, to: Rect): Point[] {
  const kx = from.w > 0 ? to.w / from.w : 1;
  const ky = from.h > 0 ? to.h / from.h : 1;
  return points.map((p) => ({
    x: Math.round((to.x + (p.x - from.x) * kx) * 10) / 10,
    y: Math.round((to.y + (p.y - from.y) * ky) * 10) / 10,
  }));
}

/** 點選建立的路線能不能確定：至少兩個點、而且不是全部在同一個位置 */
export function canFinishPoints(points: readonly Point[]): boolean {
  return points.length >= 2 && pathLength(points) >= 1;
}

/** 點到線段的距離（原圖 px） */
function segmentDistance(p: Point, a: Point, b: Point): { d: number; u: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return { d: Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u)), u };
}

/** 離這一點最近的線段（第幾段、距離）；沒有線段時 null */
export function nearestSegment(
  points: readonly Point[],
  p: Point,
): { index: number; distance: number } | null {
  let best: { index: number; distance: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const { d } = segmentDistance(p, points[i - 1], points[i]);
    if (!best || d < best.distance) best = { index: i - 1, distance: d };
  }
  return best;
}

/** 在第 index 段（points[index]～points[index+1]）中間插入一點 */
export function insertPoint(points: readonly Point[], index: number, p: Point): Point[] {
  const out = points.map((x) => ({ ...x }));
  out.splice(index + 1, 0, { ...p });
  return out.slice(0, MAP_LIMITS.points);
}

/** 拿掉第 i 個點（至少留兩個） */
export function removePoint(points: readonly Point[], i: number): Point[] {
  if (points.length <= 2 || i < 0 || i >= points.length) return points.map((x) => ({ ...x }));
  return points.filter((_, j) => j !== i).map((x) => ({ ...x }));
}

/** 把拖曳畫出的路線換成點選的（編輯點的時候） */
export function toPointRoute(f: RouteFrame, image: Size): RouteFrame {
  const points = f.shape === 'points' ? f.points : routePath(f);
  const { from: _from, ...rest } = f;
  return { ...rest, shape: 'points', points: points.map((p) => clampPoint(p, image)) };
}

/* ---------- 整理（存檔、專案檔、測試入口） ---------- */

function normalizePoints(v: unknown, image: Size): Point[] {
  if (!Array.isArray(v)) return [];
  const out: Point[] = [];
  for (const p of v) {
    if (out.length >= MAP_LIMITS.points) break;
    if (!isObj(p)) continue;
    const x = num(p.x, Number.NaN);
    const y = num(p.y, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(clampPoint({ x, y }, image));
  }
  return out;
}

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
  if (kind === 'route') {
    const style = pick(v.style, ROUTE_STYLES, d.route.style);
    if (v.shape === 'points') {
      const points = normalizePoints(v.points, image);
      if (!canFinishPoints(points)) return null;
      return {
        id,
        kind,
        ...boundsOf(points, image),
        style: isPathStyle(style) ? style : 'dashed',
        shape: 'points',
        points,
        label: lineText(v.label, MAP_LIMITS.label),
      };
    }
    const from = pick(v.from, DRAG_CORNERS, 'nw');
    return {
      id,
      kind,
      ...rect,
      style,
      shape: pick(v.shape, ROUTE_SHAPES, d.route.shape),
      points: [],
      label: lineText(v.label, MAP_LIMITS.label),
      ...(from === 'nw' ? null : { from }),
    };
  }
  return {
    id,
    kind,
    ...rect,
    style: pick(v.style, REDACT_STYLES, d.redact.style),
    mode: pick(v.mode, REDACT_MODES, d.redact.mode),
    dir: pick(v.dir, REVEAL_FXS, d.redact.dir),
    density: snapRange('density', v.density, d.redact.density),
    grain: snapRange('grain', v.grain, d.redact.grain),
    edge: pick(v.edge, EDGE_FXS, d.redact.edge),
    glow: snapRange('glow', v.glow, d.redact.glow),
    label: lineText(v.label, MAP_LIMITS.label),
  };
}

/** 存檔可能缺欄位或被改壞：補預設值、夾範圍、拿掉看不懂的框；沒有圖時框（與 3D 的房間、入口、路線）也清掉 */
export function normalizeState(raw: unknown): MapState {
  const s = isObj(raw) ? raw : {};
  const base = normalizeDocBase(s);
  const frames = normalizeFrames(s.frames, base.image, (f, image) => normalizeFrame(f, image));
  return { ...base, frames, walk: normalizeWalk(s.walk, base.image) };
}

export function normalizeDefaults(raw: unknown): FrameDefaults {
  const d = initialDefaults();
  const s = isObj(raw) ? raw : {};
  const z = isObj(s.zoom) ? s.zoom : {};
  const r = isObj(s.route) ? s.route : {};
  const m = isObj(s.redact) ? s.redact : {};
  return {
    zoom: {
      scale: snapRange('zoomScale', z.scale, d.zoom.scale),
      style: pick(z.style, ZOOM_STYLES, d.zoom.style),
      border: pick(z.border, BORDERS, d.zoom.border),
    },
    route: {
      style: pick(r.style, ROUTE_STYLES, d.route.style),
      shape: pick(r.shape, ROUTE_SHAPES, d.route.shape),
      label: lineText(r.label, MAP_LIMITS.label),
    },
    redact: {
      style: pick(m.style, REDACT_STYLES, d.redact.style),
      mode: pick(m.mode, REDACT_MODES, d.redact.mode),
      dir: pick(m.dir, REVEAL_FXS, d.redact.dir),
      density: snapRange('density', m.density, d.redact.density),
      grain: snapRange('grain', m.grain, d.redact.grain),
      edge: pick(m.edge, EDGE_FXS, d.redact.edge),
      glow: snapRange('glow', m.glow, d.redact.glow),
      label: lineText(m.label, MAP_LIMITS.label),
    },
  };
}

/** 用目前的預設做一個新框（拖曳畫出；from：拖曳的起點那一角，L 字與 Z 字從這裡出發） */
export function makeFrame(
  kind: FrameKind,
  rect: Rect,
  defaults: FrameDefaults,
  id: string,
  from: DragCorner = 'nw',
): Frame {
  if (kind === 'zoom') return { id, kind, ...rect, ...defaults.zoom };
  if (kind === 'route')
    return {
      id,
      kind,
      ...rect,
      ...defaults.route,
      points: [],
      ...(from === 'nw' ? null : { from }),
    };
  return { id, kind, ...rect, ...defaults.redact };
}

/** 點選建立的路線（樣式不是路線的四種時用移動路線） */
export function makePointRoute(
  points: readonly Point[],
  defaults: FrameDefaults,
  image: Size,
  id: string,
): RouteFrame {
  const pts = points.slice(0, MAP_LIMITS.points).map((p) => clampPoint(p, image));
  return {
    id,
    kind: 'route',
    ...boundsOf(pts, image),
    style: isPathStyle(defaults.route.style) ? defaults.route.style : 'dashed',
    shape: 'points',
    points: pts,
    label: defaults.route.label,
  };
}

/** 範圍改了（拖曳、控點、方向鍵）：點選路線的點跟著動 */
export function applyRect(draft: Frame, r: Rect): void {
  if (draft.kind === 'route' && draft.shape === 'points')
    draft.points = movePoints(draft.points, draft, r);
  Object.assign(draft, r);
}

/** 複製：往右下移一點（夾在圖裡）、新的 id */
export function duplicateFrame(f: Frame, image: Size, id: string): Frame {
  const r = clampRect(
    { x: f.x + DUPLICATE_OFFSET, y: f.y + DUPLICATE_OFFSET, w: f.w, h: f.h },
    image,
  );
  const copy = structuredClone(f);
  copy.id = id;
  applyRect(copy, r);
  return copy;
}

/** 點選路線的點改了：範圍重算 */
export function setRoutePoints(draft: RouteFrame, points: readonly Point[], image: Size): void {
  draft.shape = 'points';
  delete draft.from;
  draft.points = points.slice(0, MAP_LIMITS.points).map((p) => clampPoint(p, image));
  Object.assign(draft, boundsOf(draft.points, image));
  if (!isPathStyle(draft.style)) draft.style = 'dashed';
}

/* ---------- 時間軸 ---------- */

/** 會動的框：路線・地點、揭開與蓋上的房間遮罩（一直蓋著的不佔動作時間） */
export const isActionFrame = (f: Frame): boolean =>
  f.kind === 'route' || (f.kind === 'redact' && f.mode !== 'static');

/** 地圖演出沒有運鏡 */
export const timelineKit: TimelineKit<Frame> = { isAction: isActionFrame };

export const buildTimeline = (timing: TimingSettings, frames: readonly Frame[]): Timeline =>
  buildFxTimeline(timing, frames, timelineKit);

export const timelineOf = (s: MapState): Timeline => buildTimeline(s.timing, s.frames);

export const stepFrames = (frames: readonly Frame[]): Frame[] =>
  fxStepFrames(frames, isActionFrame);

export const stepProgress = (frames: readonly Frame[], k: number): Progress =>
  fxStepProgress(frames, k, isActionFrame);

/* ---------- 匯出 ---------- */

export const TOOL_PREFIX = 'map-fx';

/** 檔名：map-fx-年月日-時分秒…（X 用 MP4 加 -x、房間遮罩 ZIP 是 -rooms.zip） */
export function exportFileName(kind: string, now: Date): string {
  if (kind === 'x') return `${fxFileName(TOOL_PREFIX, 'mp4', now).replace(/\.mp4$/, '')}-x.mp4`;
  if (kind === 'rooms') return fxFileName(TOOL_PREFIX, 'rooms', now, true);
  return fxFileName(TOOL_PREFIX, kind, now);
}

/** 3D 移動影片：map-fx-年月日-時分秒-3d.mp4（不能逐格編碼、即時錄成 WebM 時 .webm） */
export const walkFileName = (ext: string, now: Date): string =>
  `${fxFileName(TOOL_PREFIX, 'mp4', now).replace(/\.mp4$/, '')}-3d.${ext === 'webm' ? 'webm' : 'mp4'}`;

/** X 用 MP4：30 fps、長邊 1280 以內（整張畫面等比縮小、寬高偶數）；只用 H.264（X 收的編碼） */
export const X_MAX_SIDE = 1280;
export const X_FPS = 30;
export function xVideoSize(canvas: Size): Size {
  const k = Math.min(1, X_MAX_SIDE / Math.max(canvas.width, canvas.height));
  const w = Math.max(2, Math.round(canvas.width * k));
  const h = Math.max(2, Math.round(canvas.height * k));
  return { width: w - (w % 2), height: h - (h % 2) };
}

/**
 * 這個編法做得出 X 收的影片嗎：只有 H.264 的 MP4 算（WebCodecs 的 avc1，或即時錄影的 video/mp4;codecs=avc1…）；
 * VP9 的 MP4、WebM、沒寫編碼的 video/mp4 都不算（X 可能不收）。
 */
export function xVideoUsable(mode: VideoMode | null | undefined): boolean {
  if (!mode) return false;
  if (mode.kind === 'mp4') return mode.plan.video.codec === 'avc1';
  if (mode.kind === 'realtime') return /^video\/mp4;\s*codecs="?avc1/i.test(mode.mimeType);
  return false;
}

/** 房間遮罩 ZIP：1 格幾 px（預設 24，CCFOLIA 的一格） */
export const DEFAULT_GRID = 24;

/** 格數：px ÷ 一格的 px，取到小數一位（整數不寫 .0） */
export function cellCount(px: number, grid: number): string {
  const v = Math.round((px / Math.max(1, grid)) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 檔名裡不能用的字換成底線、最多 24 個字 */
export function safeName(text: string): string {
  return Array.from(
    text
      .trim()
      .replace(/[\\/:*?"<>|\s.]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  )
    .slice(0, 24)
    .join('');
}

/**
 * 房間遮罩的裁切範圍：以地圖左上角為原點，往外擴到整格（原圖 px；可能超出地圖，超出的地方透明）。
 * cells：在第幾格（0 起，左上角＝x0y0）與寬高幾格。
 */
export function gridRect(
  r: Pick<Rect, 'x' | 'y' | 'w' | 'h'>,
  grid: number,
): { rect: Rect; cells: Rect } {
  const g = Math.max(1, grid);
  /* 浮點誤差：剛好在格線上的不要多擴一格 */
  const cx = Math.floor(r.x / g + 1e-9);
  const cy = Math.floor(r.y / g + 1e-9);
  const cx1 = Math.max(cx + 1, Math.ceil((r.x + r.w) / g - 1e-9));
  const cy1 = Math.max(cy + 1, Math.ceil((r.y + r.h) / g - 1e-9));
  return {
    rect: { x: cx * g, y: cy * g, w: (cx1 - cx) * g, h: (cy1 - cy) * g },
    cells: { x: cx, y: cy, w: cx1 - cx, h: cy1 - cy },
  };
}

/**
 * 房間遮罩（清單裡的房間遮罩，照清單順序）的檔名：01_房名_full.png（地圖大小）、
 * 01_房名_x5y2_6x4.png（往外對齊格線的裁切：在第 5、2 格〔0 起〕、寬 6 高 4 格）
 */
export function roomFileNames(
  rooms: readonly Pick<RedactFrame, 'label' | 'x' | 'y' | 'w' | 'h'>[],
  grid: number,
): { full: string; crop: string; rect: Rect; cells: Rect }[] {
  return rooms.map((r, i) => {
    const n = String(i + 1).padStart(2, '0');
    const name = safeName(r.label);
    const base = name ? `${n}_${name}` : n;
    const { rect, cells } = gridRect(r, grid);
    return {
      full: `${base}_full.png`,
      crop: `${base}_x${cells.x}y${cells.y}_${cells.w}x${cells.h}.png`,
      rect,
      cells,
    };
  });
}

/** 原地圖的檔名：map_40x30.png（以格數） */
export const mapFileName = (image: Size, grid: number): string =>
  `map_${cellCount(image.width, grid)}x${cellCount(image.height, grid)}.png`;

/** 專案檔用到的圖 */
export const stateAssetIds = (s: MapState): string[] => (s.image ? [s.image.id] : []);
