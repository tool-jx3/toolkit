/**
 * 魔法陣製作器的資料：作品、元素、樣式與動態的型別、預設值、新元素、範本，以及讀入時的修正（規格 3.5、3.8）。
 * 純資料與純函式，不依賴畫布或 React（單元測試在 Node 跑）。
 */
import { catmullRomAnchors, clamp, regularPolygonPoints, starPoints } from './geometry';
import { S } from './strings';

export const TOOL_ID = 'magic-circle';
/** 舊版專案檔（.arcana.json）的版本 */
export const LEGACY_VERSION = 2;
/** 舊版的自動儲存鍵 */
export const LEGACY_AUTOSAVE_KEY = 'magic-circle-maker-autosave-v2';

export type ElementType = 'path' | 'circle' | 'text';
export type LineCap = 'round' | 'butt' | 'square';
export type LineJoin = 'round' | 'miter' | 'bevel';
export type BlendMode = 'source-over' | 'screen' | 'lighter' | 'multiply' | 'overlay';
export type MotionMode =
  | 'none'
  | 'draw'
  | 'drawGlow'
  | 'fadeIn'
  | 'fadeOut'
  | 'centerSpread'
  | 'scaleIn'
  | 'spinIn'
  | 'pulse';
export type EasingName = 'linear' | 'easeOut' | 'easeIn' | 'easeInOut' | 'overshoot';
export type StrokeDirection = 'forward' | 'reverse';
export type CopyOrder = 'clockwise' | 'counter' | 'alternate' | 'random';
export type TextAlign = 'left' | 'center' | 'right';

export const LINE_CAPS: readonly LineCap[] = ['round', 'butt', 'square'];
export const LINE_JOINS: readonly LineJoin[] = ['round', 'miter', 'bevel'];
export const BLEND_MODES: readonly BlendMode[] = [
  'source-over',
  'screen',
  'lighter',
  'multiply',
  'overlay',
];
export const MOTION_MODES: readonly MotionMode[] = [
  'none',
  'draw',
  'drawGlow',
  'fadeIn',
  'fadeOut',
  'centerSpread',
  'scaleIn',
  'spinIn',
  'pulse',
];
export const EASINGS: readonly EasingName[] = [
  'linear',
  'easeOut',
  'easeIn',
  'easeInOut',
  'overshoot',
];
export const COPY_ORDERS: readonly CopyOrder[] = ['clockwise', 'counter', 'alternate', 'random'];
export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];

export interface McStyle {
  /** #rrggbb 或 #rrggbbaa */
  stroke: string;
  strokeWidth: number;
  fillEnabled: boolean;
  fill: string;
  /** 0～1 */
  opacity: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  dash: number[];
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  glowStrength: number;
  blendMode: BlendMode;
}

export interface McAnimation {
  mode: MotionMode;
  start: number;
  duration: number;
  easing: EasingName;
  direction: StrokeDirection;
  copyStagger: number;
  copyOrder: CopyOrder;
  holdAfter: boolean;
}

export interface PathPoint {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  smooth: boolean;
}

interface ElementBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 這個元素要不要依對稱尺複製 */
  symmetry: boolean;
  style: McStyle;
  animation: McAnimation;
}

export interface PathElement extends ElementBase {
  type: 'path';
  closed: boolean;
  points: PathPoint[];
}

export interface CircleElement extends ElementBase {
  type: 'circle';
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface TextElement extends ElementBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  rotation: number;
}

export type McElement = PathElement | CircleElement | TextElement;

export interface McDocument {
  name: string;
  width: number;
  height: number;
  /** #rrggbb */
  background: string;
  transparent: boolean;
}

export interface McSymmetry {
  enabled: boolean;
  count: number;
  mirror: boolean;
  centerX: number;
  centerY: number;
  /** 度 */
  offset: number;
}

export interface McSnap {
  enabled: boolean;
  grid: boolean;
  gridSize: number;
  center: boolean;
  radial: boolean;
  angles: boolean;
  angleStep: number;
  /** 螢幕 px */
  threshold: number;
}

export interface McTimeline {
  duration: number;
  fps: number;
  /** 播放次數；0＝無限循環（時間軸的「循環」） */
  plays: number;
}

export interface McProject {
  document: McDocument;
  symmetry: McSymmetry;
  snap: McSnap;
  animation: McTimeline;
  elements: McElement[];
}

/** 範圍（規格 1. 各列） */
export const RANGE = {
  size: [64, 4096],
  strokeWidth: [0, 200],
  shadowBlur: [0, 100],
  shadowOffset: [-100, 100],
  glowBlur: [0, 120],
  glowStrength: [0, 3],
  fontSize: [4, 600],
  start: [0, 60],
  duration: [0.05, 60],
  stagger: [0, 10],
  count: [1, 64],
  offset: [-360, 360],
  gridSize: [2, 500],
  angleStep: [1, 90],
  threshold: [2, 40],
  timelineDuration: [0.5, 60],
  fps: [1, 60],
  plays: [0, 999],
  freehandTolerance: [0.5, 8],
  polygonSides: [3, 32],
  starPoints: [3, 24],
  starInner: [0.05, 0.95],
  zoom: [0.04, 8],
} as const satisfies Record<string, readonly [number, number]>;

/* ---------- 預設值（規格 3.5） ---------- */

export function defaultStyle(overrides: Partial<McStyle> = {}): McStyle {
  return {
    stroke: '#77d9ff',
    strokeWidth: 5,
    fillEnabled: false,
    fill: '#6f5bff44',
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    dash: [],
    shadowColor: '#1c68ff',
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: true,
    glowColor: '#64ddff',
    glowBlur: 24,
    glowStrength: 1.15,
    blendMode: 'screen',
    ...overrides,
  };
}

export function defaultAnimation(overrides: Partial<McAnimation> = {}): McAnimation {
  return {
    mode: 'draw',
    start: 0,
    duration: 1.2,
    easing: 'easeInOut',
    direction: 'forward',
    copyStagger: 0,
    copyOrder: 'clockwise',
    holdAfter: true,
    ...overrides,
  };
}

export const DEFAULT_SNAP: McSnap = {
  enabled: true,
  grid: true,
  gridSize: 25,
  center: true,
  radial: true,
  angles: true,
  angleStep: 15,
  threshold: 11,
};

/** 虛線欄：數字以逗號或空白分隔，空的片段、負數與非數字略過，最多 16 個（規格 F70、5. D13） */
export function parseDash(text: string): number[] {
  return String(text)
    .split(/[ ,]+/)
    .filter((t) => t !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .slice(0, 16);
}

/* ---------- id ---------- */

let seq = 0;
export function uid(prefix = 'el'): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/* ---------- 元素 ---------- */

export function pathPoint(
  x: number,
  y: number,
  inPoint: { x: number; y: number } | null = null,
  outPoint: { x: number; y: number } | null = null,
  smooth = false,
): PathPoint {
  return {
    x,
    y,
    inX: inPoint ? inPoint.x : x,
    inY: inPoint ? inPoint.y : y,
    outX: outPoint ? outPoint.x : x,
    outY: outPoint ? outPoint.y : y,
    smooth,
  };
}

interface ElementOptions {
  name?: string;
  symmetry?: boolean;
  style?: Partial<McStyle>;
  animation?: Partial<McAnimation>;
}

export function createPath(
  points: readonly PathPoint[],
  options: ElementOptions & { closed?: boolean } = {},
): PathElement {
  return {
    id: uid('path'),
    name: options.name || S.names.path,
    type: 'path',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? true,
    closed: options.closed ?? false,
    points: points.map((p) => ({ ...p })),
    style: defaultStyle(options.style),
    animation: defaultAnimation(options.animation),
  };
}

export function createCircle(
  x: number,
  y: number,
  rx: number,
  ry = rx,
  options: ElementOptions & { rotation?: number } = {},
): CircleElement {
  return {
    id: uid('circle'),
    name: options.name || S.names.circle,
    type: 'circle',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? false,
    x,
    y,
    rx,
    ry,
    rotation: options.rotation || 0,
    style: defaultStyle(options.style),
    animation: defaultAnimation(options.animation),
  };
}

export function createText(
  x: number,
  y: number,
  text = 'ᚱ',
  options: ElementOptions & {
    fontSize?: number;
    fontFamily?: string;
    textAlign?: TextAlign;
    rotation?: number;
  } = {},
): TextElement {
  return {
    id: uid('text'),
    name: options.name || S.names.text,
    type: 'text',
    visible: true,
    locked: false,
    symmetry: options.symmetry ?? true,
    x,
    y,
    text,
    fontSize: options.fontSize || 54,
    fontFamily: options.fontFamily || 'serif',
    textAlign: options.textAlign || 'center',
    rotation: options.rotation || 0,
    style: defaultStyle({ fillEnabled: true, fill: '#a5f0ff', strokeWidth: 1.5, ...options.style }),
    animation: defaultAnimation({ mode: 'fadeIn', ...options.animation }),
  };
}

/** 新元素的開始時間：min(長度 − 0.2, 元素數 × 0.08) */
export function newElementStart(project: McProject): number {
  return Math.min(project.animation.duration - 0.2, project.elements.length * 0.08);
}

/* ---------- 作品與範本（規格 3.5） ---------- */

export function baseProject(
  name: string = S.names.newProject,
  width = 1000,
  height = 1000,
): McProject {
  return {
    document: { name, width, height, background: '#070a17', transparent: false },
    symmetry: {
      enabled: true,
      count: 8,
      mirror: false,
      centerX: width / 2,
      centerY: height / 2,
      offset: 0,
    },
    snap: { ...DEFAULT_SNAP },
    animation: { duration: 4, fps: 24, plays: 0 },
    elements: [],
  };
}

export interface TemplateResult {
  project: McProject;
  /** 套用後選取的元素 */
  selectedId: string | null;
}

export function classicTemplate(): TemplateResult {
  const p = baseProject(S.names.classicProject, 1000, 1000);
  p.symmetry.count = 12;
  const N = S.names.classic;
  const outer = createCircle(500, 500, 378, 378, {
    name: N.outerRing,
    symmetry: false,
    style: { stroke: '#79e7ff', strokeWidth: 8, glowBlur: 34, glowStrength: 1.35 },
    animation: { mode: 'drawGlow', start: 0, duration: 1.15 },
  });
  const outer2 = createCircle(500, 500, 354, 354, {
    name: N.outerGuide,
    symmetry: false,
    style: {
      stroke: '#7e7cff',
      strokeWidth: 2.5,
      glowColor: '#7e7cff',
      glowBlur: 18,
      dash: [13, 8],
    },
    animation: { mode: 'draw', start: 0.18, duration: 1.25 },
  });
  const inner = createCircle(500, 500, 255, 255, {
    name: N.innerRing,
    symmetry: false,
    style: { stroke: '#c7b4ff', strokeWidth: 4, glowColor: '#9e83ff', glowBlur: 22 },
    animation: { mode: 'centerSpread', start: 0.45, duration: 0.85 },
  });
  const star = createPath(starPoints(500, 500, 246, 96, 6), {
    name: N.hexagram,
    symmetry: false,
    closed: true,
    style: {
      stroke: '#8cebff',
      strokeWidth: 5,
      glowBlur: 26,
      fillEnabled: true,
      fill: '#5e4fff12',
    },
    animation: { mode: 'drawGlow', start: 0.72, duration: 1.3 },
  });
  const spoke = createPath(
    [
      pathPoint(500, 170),
      pathPoint(500, 128),
      pathPoint(520, 146),
      pathPoint(500, 95),
      pathPoint(480, 146),
      pathPoint(500, 128),
    ],
    {
      name: N.radialRunes,
      symmetry: true,
      closed: false,
      style: { stroke: '#b8f3ff', strokeWidth: 4, glowBlur: 20 },
      animation: { mode: 'drawGlow', start: 1.05, duration: 0.75, copyStagger: 0.055 },
    },
  );
  const gem = createCircle(500, 130, 7, 7, {
    name: N.radialGems,
    symmetry: true,
    style: {
      stroke: '#ffffff',
      strokeWidth: 2,
      fillEnabled: true,
      fill: '#7feaff',
      glowBlur: 28,
      glowStrength: 1.9,
    },
    animation: { mode: 'scaleIn', start: 1.25, duration: 0.45, copyStagger: 0.045 },
  });
  const core = createCircle(500, 500, 48, 48, {
    name: N.core,
    symmetry: false,
    style: {
      stroke: '#ffffff',
      strokeWidth: 3,
      fillEnabled: true,
      fill: '#8c76ff44',
      glowColor: '#9b83ff',
      glowBlur: 44,
      glowStrength: 2,
    },
    animation: { mode: 'pulse', start: 1.8, duration: 1.2 },
  });
  p.elements = [outer, outer2, inner, star, spoke, gem, core];
  return { project: p, selectedId: spoke.id };
}

export function runeTemplate(): TemplateResult {
  const p = baseProject(S.names.runeProject, 1000, 1000);
  p.document.background = '#100711';
  p.symmetry.count = 10;
  const colors = { stroke: '#ff9eea', glowColor: '#ff58d0', shadowColor: '#c52e9e' };
  const N = S.names.rune;
  const glyph = createText(500, 162, 'ᛟ', {
    name: N.glyph,
    symmetry: true,
    fontSize: 52,
    style: { ...colors, fill: '#ffd4f6', stroke: '#ffd4f6' },
    animation: { mode: 'fadeIn', start: 1.15, duration: 0.55, copyStagger: 0.08 },
  });
  p.elements = [
    createCircle(500, 500, 388, 388, {
      name: N.outerCircle,
      style: { ...colors, strokeWidth: 7, glowBlur: 34 },
      animation: { mode: 'drawGlow', start: 0, duration: 1 },
    }),
    createCircle(500, 500, 308, 308, {
      name: N.runeCircle,
      style: { ...colors, strokeWidth: 3, glowBlur: 18, dash: [4, 10] },
      animation: { mode: 'draw', start: 0.25, duration: 1.2 },
    }),
    createPath(regularPolygonPoints(500, 500, 292, 5), {
      name: N.pentagon,
      symmetry: false,
      closed: true,
      style: { ...colors, strokeWidth: 5, fillEnabled: true, fill: '#e945c010' },
      animation: { mode: 'drawGlow', start: 0.65, duration: 1.3 },
    }),
    glyph,
    createCircle(500, 500, 74, 74, {
      name: N.core,
      style: {
        ...colors,
        strokeWidth: 3,
        fillEnabled: true,
        fill: '#ff64d944',
        glowBlur: 55,
        glowStrength: 2.1,
      },
      animation: { mode: 'pulse', start: 1.9, duration: 1 },
    }),
  ];
  return { project: p, selectedId: glyph.id };
}

export const SIGIL_POINTS: readonly [number, number][] = [
  [185, 365],
  [310, 180],
  [410, 390],
  [510, 215],
  [620, 390],
  [730, 190],
  [820, 355],
  [1015, 250],
];

export function sigilTemplate(): TemplateResult {
  const p = baseProject(S.names.sigilProject, 1200, 600);
  p.document.transparent = true;
  p.document.background = '#0b0d18';
  p.symmetry.enabled = false;
  p.symmetry.count = 1;
  p.snap.grid = false;
  p.snap.radial = false;
  p.snap.angles = false;
  p.animation.duration = 3;
  const smooth = catmullRomAnchors(
    SIGIL_POINTS.map(([x, y]) => ({ x, y })),
    false,
    0.9,
  );
  const stroke = createPath(smooth, {
    name: S.names.sigilStroke,
    symmetry: false,
    style: {
      stroke: '#f4f6ff',
      strokeWidth: 16,
      lineCap: 'round',
      lineJoin: 'round',
      glowColor: '#8774ff',
      glowBlur: 34,
      glowStrength: 1.7,
      shadowColor: '#442bb8',
      shadowBlur: 8,
      blendMode: 'screen',
    },
    animation: { mode: 'drawGlow', start: 0.15, duration: 2.15, easing: 'easeInOut' },
  });
  p.elements = [stroke];
  return { project: p, selectedId: stroke.id };
}

/** 空白：保留畫布、對稱、吸附、時間軸設定，只清空元素 */
export function blankFrom(project: McProject): McProject {
  return { ...structuredCloneProject(project), elements: [] };
}

function structuredCloneProject(p: McProject): McProject {
  return JSON.parse(JSON.stringify(p)) as McProject;
}

/* ---------- 讀入時的修正（規格 3.8） ---------- */

const num = (v: unknown, fallback: number): number => {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** #rgb／#rrggbb／#rrggbbaa → 小寫；看不懂時 fallback */
export function normalizeColor(v: unknown, fallback: string, withAlpha = true): string {
  const t = String(v ?? '')
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{8}$/.test(t)) return withAlpha ? t : t.slice(0, 7);
  if (/^#[0-9a-f]{3}$/.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return fallback;
}

function normalizeStyle(raw: unknown): McStyle {
  const d = defaultStyle();
  const s = isObj(raw) ? raw : {};
  return {
    stroke: normalizeColor(s.stroke, d.stroke),
    strokeWidth: num(s.strokeWidth, d.strokeWidth),
    fillEnabled: bool(s.fillEnabled, d.fillEnabled),
    fill: normalizeColor(s.fill, d.fill),
    opacity: num(s.opacity, d.opacity),
    lineCap: oneOf(s.lineCap, LINE_CAPS, d.lineCap),
    lineJoin: oneOf(s.lineJoin, LINE_JOINS, d.lineJoin),
    dash: Array.isArray(s.dash)
      ? s.dash
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 0)
          .slice(0, 16)
      : [],
    shadowColor: normalizeColor(s.shadowColor, d.shadowColor),
    shadowBlur: num(s.shadowBlur, d.shadowBlur),
    shadowOffsetX: num(s.shadowOffsetX, d.shadowOffsetX),
    shadowOffsetY: num(s.shadowOffsetY, d.shadowOffsetY),
    glowEnabled: bool(s.glowEnabled, d.glowEnabled),
    glowColor: normalizeColor(s.glowColor, d.glowColor),
    glowBlur: num(s.glowBlur, d.glowBlur),
    glowStrength: num(s.glowStrength, d.glowStrength),
    blendMode: oneOf(s.blendMode, BLEND_MODES, d.blendMode),
  };
}

function normalizeAnimation(raw: unknown): McAnimation {
  const d = defaultAnimation();
  const a = isObj(raw) ? raw : {};
  return {
    mode: oneOf(a.mode, MOTION_MODES, d.mode),
    start: num(a.start, d.start),
    duration: num(a.duration, d.duration),
    easing: oneOf(a.easing, EASINGS, d.easing),
    direction: oneOf(a.direction, ['forward', 'reverse'] as const, d.direction),
    copyStagger: num(a.copyStagger, d.copyStagger),
    copyOrder: oneOf(a.copyOrder, COPY_ORDERS, d.copyOrder),
    holdAfter: bool(a.holdAfter, d.holdAfter),
  };
}

function normalizeElement(raw: unknown, used: Set<string>): McElement | null {
  if (!isObj(raw)) return null;
  const type = oneOf(raw.type, ['path', 'circle', 'text'] as const, 'path');
  let id = typeof raw.id === 'string' && raw.id ? raw.id : uid(type);
  if (used.has(id)) id = uid(type);
  used.add(id);
  const base = {
    id,
    name:
      typeof raw.name === 'string' && raw.name
        ? raw.name
        : type === 'circle'
          ? S.names.circle
          : type === 'text'
            ? S.names.textShort
            : S.names.path,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    symmetry: raw.symmetry !== false,
    style: normalizeStyle(raw.style),
    animation: normalizeAnimation(raw.animation),
  };
  if (type === 'circle') {
    return {
      ...base,
      type,
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      rx: num(raw.rx, 1),
      ry: num(raw.ry, num(raw.rx, 1)),
      rotation: num(raw.rotation, 0),
    };
  }
  if (type === 'text') {
    return {
      ...base,
      type,
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      text: str(raw.text, ''),
      fontSize: num(raw.fontSize, 54),
      fontFamily: str(raw.fontFamily, 'serif') || 'serif',
      textAlign: oneOf(raw.textAlign, TEXT_ALIGNS, 'center'),
      rotation: num(raw.rotation, 0),
    };
  }
  const pts = Array.isArray(raw.points) ? raw.points : [];
  return {
    ...base,
    type: 'path',
    closed: raw.closed === true,
    points: pts.filter(isObj).map((p) => {
      const x = num(p.x, 0);
      const y = num(p.y, 0);
      return {
        x,
        y,
        inX: finite(p.inX) ?? x,
        inY: finite(p.inY) ?? y,
        outX: finite(p.outX) ?? x,
        outY: finite(p.outY) ?? y,
        smooth: p.smooth === true,
      };
    }),
  };
}

export interface NormalizedProject {
  project: McProject;
  /** 舊版專案檔裡的播放頭（新版的專案檔沒有） */
  playhead: number | null;
  /** 舊版專案檔裡的選取 */
  selectedId: string | null;
}

/**
 * 讀入作品（舊版 .arcana.json、舊版自動儲存、新版的專案資料都可以）：修正數值、補預設值。
 * 不是物件時丟出錯誤（訊息可直接顯示）。
 */
export function normalizeProject(
  raw: unknown,
  loadedName: string = S.names.loadedProject,
): NormalizedProject {
  if (!isObj(raw)) throw new Error(S.project.invalid);
  const doc = isObj(raw.document) ? raw.document : {};
  const width = clamp(num(doc.width, 1000) || 1000, 64, 4096);
  const height = clamp(num(doc.height, 1000) || 1000, 64, 4096);
  const document: McDocument = {
    name: typeof doc.name === 'string' && doc.name ? doc.name : loadedName,
    width,
    height,
    background: normalizeColor(doc.background, '#070a17', false),
    transparent: doc.transparent === true,
  };
  const sym = isObj(raw.symmetry) ? raw.symmetry : {};
  const symmetry: McSymmetry = {
    enabled: bool(sym.enabled, true),
    count: num(sym.count, 8),
    mirror: bool(sym.mirror, false),
    centerX: num(sym.centerX, width / 2),
    centerY: num(sym.centerY, height / 2),
    offset: num(sym.offset, 0),
  };
  const sn = isObj(raw.snap) ? raw.snap : {};
  const snap: McSnap = {
    enabled: bool(sn.enabled, DEFAULT_SNAP.enabled),
    grid: bool(sn.grid, DEFAULT_SNAP.grid),
    gridSize: num(sn.gridSize, DEFAULT_SNAP.gridSize),
    center: bool(sn.center, DEFAULT_SNAP.center),
    radial: bool(sn.radial, DEFAULT_SNAP.radial),
    angles: bool(sn.angles, DEFAULT_SNAP.angles),
    angleStep: num(sn.angleStep, DEFAULT_SNAP.angleStep),
    threshold: num(sn.threshold, DEFAULT_SNAP.threshold),
  };
  const an = isObj(raw.animation) ? raw.animation : {};
  const plays =
    typeof an.plays === 'number' && Number.isFinite(an.plays)
      ? Math.max(0, Math.round(an.plays))
      : an.loop === false
        ? 1
        : 0;
  const animation: McTimeline = {
    duration: num(an.duration, 4),
    fps: num(an.fps, 24),
    plays,
  };
  const used = new Set<string>();
  const elements = (Array.isArray(raw.elements) ? raw.elements : [])
    .map((e) => normalizeElement(e, used))
    .filter((e): e is McElement => !!e);
  const project: McProject = { document, symmetry, snap, animation, elements };
  const playhead =
    typeof an.playhead === 'number' && Number.isFinite(an.playhead) ? an.playhead : null;
  const sel = typeof raw.selectedId === 'string' ? raw.selectedId : null;
  const selectedId = elements.some((e) => e.id === sel) ? sel : (elements.at(-1)?.id ?? null);
  return { project, playhead, selectedId };
}

/** 是不是舊版的作品 JSON（.arcana.json、舊版自動儲存） */
export function looksLikeLegacyProject(raw: unknown): boolean {
  return isObj(raw) && isObj(raw.document) && Array.isArray(raw.elements);
}

/** 舊版專案檔的檔名：<名稱主體>-<YYYYMMDD-HHMM>.arcana.json */
export function projectFileName(name: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${fileBase(name)}-${stamp}.arcana.json`;
}

/** 檔名主體（規格 3.7）：去頭尾空白、禁用字元換成 -、空白換成 -、前 80 字，空白時 arcana */
export function fileBase(name: string): string {
  const s = Array.from(
    String(name || 'arcana')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-'),
  )
    .slice(0, 80)
    .join('');
  return s || 'arcana';
}
