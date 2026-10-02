/**
 * 調色（psd-studio 規格 1.3、1.5 的 F72～F74、3.8）：純函式，不依賴 React 與 DOM，預覽（主執行緒）與匯出（Worker）共用。
 *
 * 處理順序（3.8.1）：曝光 → 亮度 → 對比 → 截到 0～255 → 整體曲線（三色、各通道）→ 個別曲線 → 漸層對應 → 色相／飽和度 → 四捨五入。
 * 完全透明的像素不處理；不透明度不變（F54）。
 *
 * - 曲線：控制點之間以直線相連的折線，兩端以外照端點延伸（3.8.2）。
 * - 漸層對應：以 Rec. 601 加權的亮度（第 1、2 步之後）在漸層上取色，六種混合模式，依強度與原色內插（3.8.3）。
 * - 個別調色與整體疊加（3.8.4）：色相、亮度、曝光相加；對比相加後夾在 ±100；飽和度是乘；
 *   個別漸層勾選套用（而且至少 2 個色標）時**取代**整體漸層。
 */

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'color';
export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'color',
];

export type CurveChannel = 'all' | 'r' | 'g' | 'b';
export const CURVE_CHANNELS: readonly CurveChannel[] = ['all', 'r', 'g', 'b'];

/** 曲線的控制點（輸入 x → 輸出 y，0～255 的整數） */
export interface CurvePoint {
  x: number;
  y: number;
}
export type Curves = Record<CurveChannel, CurvePoint[]>;

/** 漸層的色標：位置 0～100（%，整數）、顏色 #rrggbb */
export interface GradStop {
  pos: number;
  color: string;
}

export interface GradientMap {
  /** 整體：漸層對應開關；個別：「套用」 */
  enabled: boolean;
  /** 混合強度 0～100（%） */
  opacity: number;
  mode: BlendMode;
  stops: GradStop[];
}

/** 色調五項：整體的飽和度是 0～200（%，100 不變）；個別的是 −100～100（%，乘在整體上） */
export interface ToneValues {
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
  exposure: number;
}

export interface Adjust extends ToneValues {
  gradient: GradientMap;
  curves: Curves;
}

/** 整體調色（F36～F51） */
export type GlobalAdjust = Adjust;
/** 個別調色（F72～F74）：色調五項是加在整體上的量 */
export type AssetAdjust = Adjust;

/* ---------- 預設值與範圍 ---------- */

export const LINEAR_CURVE: readonly CurvePoint[] = Object.freeze([
  { x: 0, y: 0 },
  { x: 255, y: 255 },
]);

/** 開頁的漸層色標（第 7 節裁定：預設漸層色照用） */
export const DEFAULT_STOPS: readonly GradStop[] = Object.freeze([
  { pos: 0, color: '#0f172a' },
  { pos: 50, color: '#64748b' },
  { pos: 100, color: '#f8fafc' },
]);

/** 拖曳、新增色標時漸層關閉的顏色（F43） */
export const NEUTRAL_STOP_COLOR = '#888888';

export const linearCurves = (): Curves => ({
  all: LINEAR_CURVE.map((p) => ({ ...p })),
  r: LINEAR_CURVE.map((p) => ({ ...p })),
  g: LINEAR_CURVE.map((p) => ({ ...p })),
  b: LINEAR_CURVE.map((p) => ({ ...p })),
});

export const defaultGradient = (): GradientMap => ({
  enabled: false,
  opacity: 100,
  mode: 'overlay',
  stops: DEFAULT_STOPS.map((s) => ({ ...s })),
});

export const defaultGlobalAdjust = (): GlobalAdjust => ({
  hue: 0,
  saturation: 100,
  brightness: 0,
  contrast: 0,
  exposure: 0,
  gradient: defaultGradient(),
  curves: linearCurves(),
});

export const defaultAssetAdjust = (): AssetAdjust => ({
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  exposure: 0,
  gradient: defaultGradient(),
  curves: linearCurves(),
});

export interface ToneRange {
  key: keyof ToneValues;
  min: number;
  max: number;
  unit?: string;
}

/** 整體的五項（F36～F40） */
export const GLOBAL_TONE_RANGES: readonly ToneRange[] = [
  { key: 'hue', min: -180, max: 180, unit: '°' },
  { key: 'saturation', min: 0, max: 200, unit: '%' },
  { key: 'brightness', min: -100, max: 100 },
  { key: 'contrast', min: -100, max: 100 },
  { key: 'exposure', min: -100, max: 100 },
];

/** 個別的五項（F72） */
export const ASSET_TONE_RANGES: readonly ToneRange[] = [
  { key: 'hue', min: -180, max: 180, unit: '°' },
  { key: 'saturation', min: -100, max: 100, unit: '%' },
  { key: 'brightness', min: -100, max: 100 },
  { key: 'contrast', min: -100, max: 100 },
  { key: 'exposure', min: -100, max: 100 },
];

/* ---------- 預設集（F49、F52：名稱與數值為本站自訂） ---------- */

export interface GradientPreset {
  id: string;
  stops: GradStop[];
}

/** 漸層預設：黑白、懷舊暖褐、霓虹、夕陽、雙色（名稱在 strings.ts） */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  {
    id: 'mono',
    stops: [
      { pos: 0, color: '#101010' },
      { pos: 100, color: '#f4f4f4' },
    ],
  },
  {
    id: 'sepia',
    stops: [
      { pos: 0, color: '#2b1a0e' },
      { pos: 45, color: '#8a5a32' },
      { pos: 100, color: '#f3e2c4' },
    ],
  },
  {
    id: 'neon',
    stops: [
      { pos: 0, color: '#120a2e' },
      { pos: 55, color: '#ff3fa4' },
      { pos: 100, color: '#3ff0ff' },
    ],
  },
  {
    id: 'sunset',
    stops: [
      { pos: 0, color: '#2a1240' },
      { pos: 35, color: '#c2304a' },
      { pos: 70, color: '#ff8a3d' },
      { pos: 100, color: '#ffe29a' },
    ],
  },
  {
    id: 'duo',
    stops: [
      { pos: 0, color: '#1f2a6b' },
      { pos: 100, color: '#f6c445' },
    ],
  },
];

export interface CurvePreset {
  id: 'linear' | 'scurve' | 'darken' | 'lighten';
  points: CurvePoint[];
}

/** 曲線預設：直線、S 形、中間調壓暗、中間調提亮（只換目前通道） */
export const CURVE_PRESETS: readonly CurvePreset[] = [
  { id: 'linear', points: LINEAR_CURVE.map((p) => ({ ...p })) },
  {
    id: 'scurve',
    points: [
      { x: 0, y: 0 },
      { x: 70, y: 45 },
      { x: 186, y: 212 },
      { x: 255, y: 255 },
    ],
  },
  {
    id: 'darken',
    points: [
      { x: 0, y: 0 },
      { x: 128, y: 92 },
      { x: 255, y: 255 },
    ],
  },
  {
    id: 'lighten',
    points: [
      { x: 0, y: 0 },
      { x: 128, y: 164 },
      { x: 255, y: 255 },
    ],
  },
];

/* ---------- 讀入的值整理（存檔、自訂組合、專案檔） ---------- */

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  Math.min(max, Math.max(min, Math.round(num(v, fallback))));
const HEX_RE = /^#[0-9a-f]{6}$/i;

function sanitizeCurve(v: unknown): CurvePoint[] {
  if (!Array.isArray(v)) return LINEAR_CURVE.map((p) => ({ ...p }));
  const pts = v
    .filter((p): p is CurvePoint => !!p && typeof p === 'object')
    .map((p) => ({ x: clampInt(p.x, 0, 255, 0), y: clampInt(p.y, 0, 255, 0) }));
  return pts.length >= 2 ? pts : LINEAR_CURVE.map((p) => ({ ...p }));
}

function sanitizeGradient(v: unknown): GradientMap {
  const d = defaultGradient();
  if (!v || typeof v !== 'object') return d;
  const g = v as Partial<GradientMap>;
  const stops = Array.isArray(g.stops)
    ? g.stops
        .filter((s): s is GradStop => !!s && typeof s === 'object' && HEX_RE.test(String(s.color)))
        .map((s) => ({ pos: clampInt(s.pos, 0, 100, 0), color: String(s.color).toLowerCase() }))
    : [];
  return {
    enabled: !!g.enabled,
    opacity: clampInt(g.opacity, 0, 100, 100),
    mode: BLEND_MODES.includes(g.mode as BlendMode) ? (g.mode as BlendMode) : 'overlay',
    stops: stops.length >= 2 ? stops : d.stops,
  };
}

/** 存檔或自訂組合讀回來的值整理成完整、合法的調色（缺的欄位補預設值、超出範圍夾回） */
export function sanitizeAdjust(v: unknown, kind: 'global' | 'asset'): Adjust {
  const base = kind === 'global' ? defaultGlobalAdjust() : defaultAssetAdjust();
  if (!v || typeof v !== 'object') return base;
  const o = v as Partial<Adjust>;
  const ranges = kind === 'global' ? GLOBAL_TONE_RANGES : ASSET_TONE_RANGES;
  const out = { ...base };
  for (const r of ranges) out[r.key] = clampInt(o[r.key], r.min, r.max, base[r.key]);
  const curves = (o.curves ?? {}) as Partial<Curves>;
  out.curves = {
    all: sanitizeCurve(curves.all),
    r: sanitizeCurve(curves.r),
    g: sanitizeCurve(curves.g),
    b: sanitizeCurve(curves.b),
  };
  out.gradient = sanitizeGradient(o.gradient);
  return out;
}

const sameCurve = (a: readonly CurvePoint[], b: readonly CurvePoint[]) =>
  a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

/** 個別調色有沒有實際作用（「個別調整」角標，第 5 節第 9 項） */
export function isAssetAdjustActive(a: AssetAdjust | null | undefined): boolean {
  if (!a) return false;
  if (a.hue || a.saturation || a.brightness || a.contrast || a.exposure) return true;
  if (a.gradient.enabled && a.gradient.stops.length >= 2) return true;
  return CURVE_CHANNELS.some((ch) => !sameCurve(a.curves[ch], LINEAR_CURVE));
}

/* ---------- 查表 ---------- */

/** 曲線 → 0～255 的查表（折線、兩端以外照端點延伸；F51、3.8.2） */
export function buildCurveLut(points: readonly CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (!pts.length) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 0; i < 256; i++) {
    if (i <= first.x) {
      lut[i] = clamp255(first.y);
      continue;
    }
    if (i >= last.x) {
      lut[i] = clamp255(last.y);
      continue;
    }
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j];
      const b = pts[j + 1];
      if (i >= a.x && i <= b.x) {
        const span = b.x - a.x;
        const t = span === 0 ? 1 : (i - a.x) / span;
        lut[i] = clamp255(Math.round(a.y * (1 - t) + b.y * t));
        break;
      }
    }
  }
  return lut;
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * 漸層 → 256 階的取色表（每階 R、G、B，浮點數不取整）：色標依位置排序，第一個之前、最後一個之後照該色標延伸，
 * 相鄰色標之間線性內插（3.8.3）。
 */
export function buildGradientLut(stops: readonly GradStop[]): Float64Array | null {
  if (!stops.length) return null;
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (s.length === 1) s.push({ pos: 100, color: s[0].color });
  if (s[0].pos > 0) s.unshift({ pos: 0, color: s[0].color });
  if (s[s.length - 1].pos < 100) s.push({ pos: 100, color: s[s.length - 1].color });
  const rgb = s.map((x) => hexToRgb(x.color));
  const lut = new Float64Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const pct = (i / 255) * 100;
    let l = 0;
    let r = s.length - 1;
    for (let j = 0; j < s.length - 1; j++) {
      if (pct >= s[j].pos && pct <= s[j + 1].pos) {
        l = j;
        r = j + 1;
        break;
      }
    }
    const range = s[r].pos - s[l].pos;
    const t = range === 0 ? 0 : (pct - s[l].pos) / range;
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = rgb[l][k] * (1 - t) + rgb[r][k] * t;
  }
  return lut;
}

/** 漸層在某個位置（0～100）的顏色，#rrggbb（點色帶新增色標時用） */
export function gradientColorAt(stops: readonly GradStop[], pos: number): string {
  const lut = buildGradientLut(stops);
  if (!lut) return NEUTRAL_STOP_COLOR;
  const i = Math.round((Math.min(100, Math.max(0, pos)) / 100) * 255);
  return `#${[0, 1, 2]
    .map((k) =>
      Math.min(255, Math.max(0, Math.round(lut[i * 3 + k])))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/* ---------- 編譯 ---------- */

export interface CompiledAdjust {
  /** 什麼都不改（可以跳過整個處理） */
  identity: boolean;
  lutR: Uint8Array;
  lutG: Uint8Array;
  lutB: Uint8Array;
  grad: { lut: Float64Array; opacity: number; mode: BlendMode } | null;
  hueShift: number;
  satScale: number;
}

/**
 * 整體＋個別 → 套用時用的查表。對比的倍率 259(c+255)/(255(259−c))（−100 → 約 0.44、100 → 約 2.27）；
 * 曝光的倍率 2^(e/50)（每 +50 加倍）。
 */
export function compileAdjust(global: GlobalAdjust, asset: AssetAdjust | null): CompiledAdjust {
  const br = global.brightness + (asset?.brightness ?? 0);
  const ct = Math.min(100, Math.max(-100, global.contrast + (asset?.contrast ?? 0)));
  const ex = global.exposure + (asset?.exposure ?? 0);
  const contrastFactor = (259 * (ct + 255)) / (255 * (259 - ct));
  const expFactor = 2 ** (ex / 50);
  const gAll = buildCurveLut(global.curves.all);
  const aAll = asset ? buildCurveLut(asset.curves.all) : null;
  const channel = (key: 'r' | 'g' | 'b') => {
    const gCh = buildCurveLut(global.curves[key]);
    const aCh = asset ? buildCurveLut(asset.curves[key]) : null;
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let v = i * expFactor;
      v += br;
      v = (v - 128) * contrastFactor + 128;
      v = clamp255(v);
      v = gAll[Math.round(v)];
      v = gCh[v];
      if (aAll && aCh) {
        v = aAll[v];
        v = aCh[v];
      }
      lut[i] = v;
    }
    return lut;
  };
  const lutR = channel('r');
  const lutG = channel('g');
  const lutB = channel('b');

  let grad: CompiledAdjust['grad'] = null;
  if (asset?.gradient.enabled && asset.gradient.stops.length >= 2) {
    /* 個別漸層勾選套用時取代整體的（強度 0% 也一樣：整體的漸層因此消失，3.8.4） */
    const lut = buildGradientLut(asset.gradient.stops);
    if (lut && asset.gradient.opacity > 0)
      grad = { lut, opacity: asset.gradient.opacity / 100, mode: asset.gradient.mode };
  } else if (global.gradient.enabled && global.gradient.opacity > 0) {
    const lut = buildGradientLut(global.gradient.stops);
    if (lut) grad = { lut, opacity: global.gradient.opacity / 100, mode: global.gradient.mode };
  }

  const hueShift = (global.hue + (asset?.hue ?? 0)) % 360;
  const satScale = Math.max(0, (global.saturation / 100) * (1 + (asset?.saturation ?? 0) / 100));
  let identityLut = true;
  for (let i = 0; i < 256 && identityLut; i++) {
    if (lutR[i] !== i || lutG[i] !== i || lutB[i] !== i) identityLut = false;
  }
  return {
    identity: identityLut && !grad && hueShift === 0 && satScale === 1,
    lutR,
    lutG,
    lutB,
    grad,
    hueShift,
    satScale,
  };
}

/* ---------- 套用 ---------- */

/* HSL 轉換的暫存（避免每個像素配置物件） */
let H = 0;
let S = 0;
let L = 0;
let R = 0;
let G = 0;
let B = 0;

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  L = (max + min) / 2;
  if (max === min) {
    H = 0;
    S = 0;
    return;
  }
  const d = max - min;
  S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  H = (h / 6) * 360;
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number) {
  h /= 360;
  if (s === 0) {
    R = G = B = l * 255;
    return;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  R = hue2rgb(p, q, h + 1 / 3) * 255;
  G = hue2rgb(p, q, h) * 255;
  B = hue2rgb(p, q, h - 1 / 3) * 255;
}

/** 混合（原色 r1…、漸層色 r2…；結果寫到 R、G、B） */
function blend(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  mode: BlendMode,
) {
  switch (mode) {
    case 'multiply':
      R = (r1 * r2) / 255;
      G = (g1 * g2) / 255;
      B = (b1 * b2) / 255;
      return;
    case 'screen':
      R = 255 - ((255 - r1) * (255 - r2)) / 255;
      G = 255 - ((255 - g1) * (255 - g2)) / 255;
      B = 255 - ((255 - b1) * (255 - b2)) / 255;
      return;
    case 'overlay':
      R = r1 < 128 ? (2 * r1 * r2) / 255 : 255 - (2 * (255 - r1) * (255 - r2)) / 255;
      G = g1 < 128 ? (2 * g1 * g2) / 255 : 255 - (2 * (255 - g1) * (255 - g2)) / 255;
      B = b1 < 128 ? (2 * b1 * b2) / 255 : 255 - (2 * (255 - b1) * (255 - b2)) / 255;
      return;
    case 'soft-light':
      R = softLight(r1, r2);
      G = softLight(g1, g2);
      B = softLight(b1, b2);
      return;
    case 'color': {
      /* 亮度（Rec. 601）等於原色、色調來自漸層色，超出範圍的通道截掉 */
      const diff = 0.299 * r1 + 0.587 * g1 + 0.114 * b1 - (0.299 * r2 + 0.587 * g2 + 0.114 * b2);
      R = clamp255(r2 + diff);
      G = clamp255(g2 + diff);
      B = clamp255(b2 + diff);
      return;
    }
    default:
      R = r2;
      G = g2;
      B = b2;
  }
}

/** 柔光：依漸層色的明暗決定變暗或變亮（暗部變亮的幅度以平方根近似） */
const softLight = (a: number, b: number): number =>
  b < 128
    ? a - ((128 - b) * a * (255 - a)) / 32640
    : a + ((b - 128) * (Math.sqrt(a / 255) * 255 - a)) / 128;

/** 就地套用調色（RGBA，未預乘）。完全透明的像素不處理；不透明度不變。 */
export function applyAdjust(rgba: Uint8ClampedArray | Uint8Array, c: CompiledAdjust): void {
  if (c.identity) return;
  const { lutR, lutG, lutB, grad, hueShift, satScale } = c;
  const hsl = hueShift !== 0 || satScale !== 1;
  const glut = grad?.lut ?? null;
  const op = grad?.opacity ?? 0;
  const mode = grad?.mode ?? 'normal';
  const len = rgba.length;
  for (let i = 0; i < len; i += 4) {
    if (rgba[i + 3] === 0) continue;
    let r = lutR[rgba[i]];
    let g = lutG[rgba[i + 1]];
    let b = lutB[rgba[i + 2]];
    if (glut) {
      const k = Math.round(0.299 * r + 0.587 * g + 0.114 * b) * 3;
      blend(r, g, b, glut[k], glut[k + 1], glut[k + 2], mode);
      r = r * (1 - op) + R * op;
      g = g * (1 - op) + G * op;
      b = b * (1 - op) + B * op;
    }
    if (hsl) {
      rgbToHsl(r, g, b);
      const h = (H + hueShift + 360) % 360;
      const s = Math.min(1, Math.max(0, S * satScale));
      hslToRgb(h, s, L);
      r = R;
      g = G;
      b = B;
    }
    rgba[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
    rgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
    rgba[i + 2] = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
  }
}

/** 調色的識別字串（同樣的設定得到同樣的字串；預覽的快取鍵） */
export const adjustKey = (global: GlobalAdjust, asset: AssetAdjust | null): string =>
  JSON.stringify([global, asset]);
