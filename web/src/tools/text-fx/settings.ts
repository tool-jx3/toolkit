/**
 * 設定的型別、各模式的基礎預設、修正（壞存檔、舊版存檔的轉換）。
 */
import type { GradientStop } from '@/core/typeset';
import { DEFAULT_FONT, usedWeight } from './fonts';
import { HOLD, INTRO, OUTRO } from './motion';
import { BACKDROP_CHOICES, DECO_CHOICES } from './ornament';

export type Mode = 'title' | 'long' | 'caption';

export const MODES: readonly (readonly [Mode, string])[] = [
  ['title', '標語'],
  ['long', '長文'],
  ['caption', '字幕'],
];

export interface FontRef {
  source: 'google' | 'local' | 'upload';
  family: string;
}

export interface LineRef {
  on: boolean;
  width: number;
  color: string;
}

export interface FillSettings {
  mode: 'solid' | 'gradient';
  color: string;
  /** 漸層色標（舊版的 2～3 色＝平均分布的色標） */
  stops: GradientStop[];
  /** v：縱向（每行）、h：橫向（整段）、d：斜向（整段） */
  dir: 'v' | 'h' | 'd';
  opacity: number;
}

export interface ShadowSettings {
  on: boolean;
  color: string;
  opacity: number;
  blur: number;
  x: number;
  y: number;
}

export interface GlowSettings {
  on: boolean;
  color: string;
  spread: number;
  strength: number;
}

export interface MotionSettings {
  fx: string;
  dur: number;
  gap: number;
  order: string;
  curve: string;
  power: number;
  dir: string;
}

export interface FlowSettings {
  kind: string;
  cps: number;
  punctPause: number;
  linePause: number;
  cursor: boolean;
  cursorColor: string;
  charFx: string;
  charDur: number;
  bigRatio: number;
  bigPause: number;
  impact: number;
  stackHold: number;
  spreadTime: number;
  lineGap: number;
  scanTime: number;
  speed: number;
  edgeFade: boolean;
  pageGap: number;
}

export interface DecoSettings {
  kind: string;
  gap: number;
  lineWidth: number;
  lineColor: string;
  fillColor: string;
  fillAlpha: number;
  anim: 'grow' | 'fade' | 'none';
  animTime: number;
  outline: boolean;
  extend: number;
  radius: number;
  softEdge: number;
  sideFade: number;
  tapeWidth: number;
  tapeSpeed: number;
  tapeBlink: number;
  tapeA: string;
  tapeB: string;
  corner: 'none' | 'square' | 'diamond';
}

export interface BackdropSettings {
  kind: string;
  color: string;
  alpha: number;
  sync: boolean;
}

export type LoopMode = 'once' | 'infinite' | 'count';

export interface Settings {
  mode: Mode;
  text: string;
  sub: string;
  canvasW: number;
  canvasH: number;
  anchor: string;
  marginX: number;
  marginY: number;
  offsetX: number;
  offsetY: number;
  vertical: boolean;
  latinUpright: boolean;
  punctCenter: boolean;
  align: 'start' | 'center' | 'end';
  subPos: 'before' | 'after';
  autoShrink: boolean;
  minSize: number;
  wrapChars: number;
  wrapWidth: boolean;
  paging: boolean;
  font: FontRef;
  weight: number;
  italic: boolean;
  size: number;
  tracking: number;
  leading: number;
  /** null＝同主文字 */
  subFont: FontRef | null;
  subWeight: number;
  subItalic: boolean;
  subScale: number;
  subTracking: number;
  subGap: number;
  /** ''＝同主文字的塗色 */
  subColor: string;
  fill: FillSettings;
  stroke: LineRef;
  outer: LineRef;
  shadow: ShadowSettings;
  glow: GlowSettings;
  glitchA: string;
  glitchB: string;
  /** 登場動畫（P11 新增）：false 時每一頁從頭就是完成狀態（向上捲動不適用） */
  introOn: boolean;
  intro: MotionSettings;
  subIntro: string;
  subOffset: number;
  hold: { fx: string; power: number };
  holdTime: number;
  outroOn: boolean;
  outro: MotionSettings;
  flow: FlowSettings;
  deco: DecoSettings;
  bg: BackdropSettings;
  preBlank: number;
  postBlank: number;
  fps: number;
  loop: LoopMode;
  loopCount: number;
  colors: 256 | 'full';
  stillFallback: boolean;
  autoCrop: boolean;
}

export const FPS_CHOICES = [12, 15, 20, 24, 30, 60] as const;

export const FLOW_NAMES: Record<string, string> = {
  seq: '逐字打出',
  big: '中央逐字',
  stack: '中央展開',
  line: '逐行',
  scan: '流動掃過',
  all: '整段浮現',
  scroll: '向上捲動',
};

/** 2～3 個顏色 → 平均分布的色標（空字串＝不用） */
export function evenStops(colors: readonly string[]): GradientStop[] {
  const list = colors.filter(Boolean);
  if (list.length < 2) return list.map((color) => ({ offset: 0, color }));
  return list.map((color, i) => ({ offset: i / (list.length - 1), color }));
}

export function baseSettings(mode: Mode): Settings {
  const long = mode === 'long';
  const caption = mode === 'caption';
  return {
    mode,
    text: '',
    sub: '',
    canvasW: 1280,
    canvasH: 720,
    anchor: 'mc',
    marginX: 64,
    marginY: 56,
    offsetX: 0,
    offsetY: 0,
    vertical: false,
    latinUpright: false,
    punctCenter: false,
    align: 'center',
    subPos: 'after',
    autoShrink: true,
    minSize: 12,
    wrapChars: 0,
    wrapWidth: long,
    paging: true,
    font: { ...DEFAULT_FONT },
    weight: 700,
    italic: false,
    size: long ? 46 : caption ? 110 : 130,
    tracking: 0.08,
    leading: long ? 1.9 : 1.5,
    subFont: null,
    subWeight: 400,
    subItalic: false,
    subScale: 0.3,
    subTracking: 0.25,
    subGap: 0.3,
    subColor: '',
    fill: {
      mode: 'solid',
      color: '#ffffff',
      stops: evenStops(['#fff7d6', '#f2c14e', '#9c6a12']),
      dir: 'v',
      opacity: 1,
    },
    stroke: { on: true, width: 5, color: '#1a1a1a' },
    outer: { on: false, width: 6, color: '#ffffff' },
    shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 5 },
    glow: { on: false, color: '#8fd3ff', spread: 28, strength: 1 },
    glitchA: '#ff2a6d',
    glitchB: '#23e5ff',
    introOn: true,
    intro: {
      fx: long ? 'fade' : 'rise',
      dur: long ? 0.6 : 0.8,
      gap: long ? 0 : 0.06,
      order: 'normal',
      curve: 'auto',
      power: 1,
      dir: 'left',
    },
    subIntro: 'same',
    subOffset: -0.2,
    hold: { fx: 'none', power: 1 },
    holdTime: long ? 2 : 1.5,
    outroOn: true,
    outro: {
      fx: 'fadeOut',
      dur: 0.6,
      gap: 0,
      order: 'normal',
      curve: 'auto',
      power: 1,
      dir: 'left',
    },
    flow: {
      kind: 'seq',
      cps: 12,
      punctPause: 0.25,
      linePause: 0.35,
      cursor: false,
      cursorColor: '',
      charFx: 'fade',
      charDur: 0.4,
      bigRatio: 0.55,
      bigPause: 0.4,
      impact: 1,
      stackHold: 0.5,
      spreadTime: 0.9,
      lineGap: 0.9,
      scanTime: 1.2,
      speed: 90,
      edgeFade: true,
      pageGap: 0.3,
    },
    deco: {
      kind: 'none',
      gap: 0.4,
      lineWidth: 3,
      lineColor: '#ffffff',
      fillColor: '#000000',
      fillAlpha: 0.55,
      anim: 'grow',
      animTime: 0.45,
      outline: false,
      extend: 0.8,
      radius: 0.2,
      softEdge: 0.25,
      sideFade: 0.15,
      tapeWidth: 40,
      tapeSpeed: 90,
      tapeBlink: 0.5,
      tapeA: '#f5c518',
      tapeB: '#151515',
      corner: 'none',
    },
    bg: { kind: 'none', color: '#000000', alpha: 0.45, sync: true },
    preBlank: 0.1,
    postBlank: 0.3,
    fps: 24,
    loop: 'once',
    loopCount: 3,
    colors: 256,
    stillFallback: true,
    autoCrop: false,
  };
}

/* ---------- 合併與修正 ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export function deepClone<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** 只把 patch 有的欄位疊上去（物件遞迴、陣列整個替換） */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(patch)) return base;
  const b = base as Obj;
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(b[k])) deepMerge(b[k], v);
    else b[k] = Array.isArray(v) ? v.slice() : v;
  }
  return base;
}

/** 舊版的字型參照 { src, id } → { source, family }（舊版「我的字型」無法對應，改回預設） */
function legacyFont(v: unknown): FontRef | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  if (typeof v.source === 'string' && typeof v.family === 'string') return v as unknown as FontRef;
  if (typeof v.src === 'string') {
    const id = typeof v.id === 'string' ? v.id : '';
    if (v.src === 'google' && id) return { source: 'google', family: id };
    if (v.src === 'local' && id) return { source: 'local', family: id };
    return { ...DEFAULT_FONT };
  }
  return undefined;
}

/** 舊版存檔（或舊格式的差異）轉成新版格式：字型參照、漸層的 colors → stops */
export function upgradeLegacy(s: unknown): unknown {
  if (!isObj(s)) return s;
  const out: Obj = { ...s };
  if ('font' in out) {
    const f = legacyFont(out.font);
    if (f === undefined || f === null) delete out.font;
    else out.font = f;
  }
  if ('subFont' in out) {
    const f = legacyFont(out.subFont);
    if (f === undefined) delete out.subFont;
    else out.subFont = f;
  }
  if (isObj(out.fill)) {
    const fill: Obj = { ...out.fill };
    if (Array.isArray(fill.colors)) {
      if (!Array.isArray(fill.stops))
        fill.stops = evenStops(fill.colors.filter((c): c is string => typeof c === 'string'));
      delete fill.colors;
    }
    out.fill = fill;
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 基礎預設＋存檔／範本差異，並修正不認得的值 */
export function normalizeSettings(mode: Mode, s: unknown): Settings {
  const out = deepMerge(baseSettings(mode), upgradeLegacy(deepClone(s ?? {})));
  out.mode = mode;
  if (!out.font?.family) out.font = { ...DEFAULT_FONT };
  out.weight = usedWeight(out.font, out.weight);
  out.canvasW = clamp(Math.round(out.canvasW) || 1280, 16, 2048);
  out.canvasH = clamp(Math.round(out.canvasH) || 720, 16, 2048);
  /* 舊版或壞掉的存檔：不認得的效果名稱改回預設 */
  if (!INTRO[out.intro.fx]) out.intro.fx = 'fade';
  if (!OUTRO[out.outro.fx]) out.outro.fx = 'fadeOut';
  if (!HOLD[out.hold.fx]) out.hold.fx = 'none';
  if (!INTRO[out.flow.charFx]) out.flow.charFx = 'fade';
  if (!FLOW_NAMES[out.flow.kind]) out.flow.kind = 'seq';
  if (!DECO_CHOICES.some((d) => d[0] === out.deco.kind)) out.deco.kind = 'none';
  if (!BACKDROP_CHOICES.some((d) => d[0] === out.bg.kind)) out.bg.kind = 'none';
  if (!(FPS_CHOICES as readonly number[]).includes(out.fps)) out.fps = 24;
  if (!Array.isArray(out.fill.stops) || !out.fill.stops.length)
    out.fill.stops = evenStops(['#fff7d6', '#f2c14e', '#9c6a12']);
  return out;
}

/** 輸出的播放次數（0＝無限） */
export function playsOf(s: Pick<Settings, 'loop' | 'loopCount'>): number {
  return s.loop === 'infinite'
    ? 0
    : s.loop === 'count'
      ? clamp(Math.round(s.loopCount), 1, 999)
      : 1;
}

/** 長文：依空白行分頁（paging 關閉時整段一頁） */
export function splitPages(text: string, paging: boolean): string[] {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return [];
  if (!paging) return [lines.join('\n')];
  const pages: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) {
        pages.push(cur.join('\n'));
        cur = [];
      }
    } else cur.push(l);
  }
  if (cur.length) pages.push(cur.join('\n'));
  return pages;
}

/** 有沒有可以匯出的文字 */
export function hasText(s: Pick<Settings, 'mode' | 'text' | 'sub'>): boolean {
  return !!(s.text.trim() || (s.mode !== 'long' && s.sub.trim()));
}
