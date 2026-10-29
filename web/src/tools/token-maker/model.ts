/**
 * VTT 棋子產生器的資料與純計算（規格 docs/refactor/specs/token-maker.md）：
 * 外觀（外框、顏色、光照、質感、背景、邊距、出框的柔邊與陰影）、每個棋子（圖片、擺放、出框遮罩）、
 * 擺放的座標換算（棋子 ↔ 圖片）、自動邊距、匯出尺寸與檔名、讀檔時的整理。不碰 DOM，單元測試直接用。
 *
 * 座標：棋子是 N × N 的正方形，中心 c＝N／2；外框的外半徑 R＝N × (0.5 − 邊距)。
 * 圖片的位移以 R 為單位（邊距改變時圖片跟著外框一起縮放），旋轉是度、順時針。
 */
import { normalizeHex } from '@/core/color';
import { safeFileName } from '@/core/files';

/* ---------- 外框 ---------- */

/** 浮雕環（金屬、石材；token-workshop 的 16 種） */
export const RELIEF_FRAMES = [
  'plain',
  'gear',
  'scallop',
  'facet',
  'segments',
  'rope',
  'chain',
  'braid',
  'moire',
  'studs',
  'gems',
  'thorns',
  'flames',
  'tally',
  'twin',
  'scales',
] as const;

/** 霓虹與幾何（eidolon-ui 的 12 種） */
export const NEON_FRAMES = [
  'ring',
  'double',
  'arcs',
  'glitch',
  'circuit',
  'square',
  'box',
  'clip',
  'hex',
  'octa',
  'diamond',
  'none',
] as const;

export type FrameId = (typeof RELIEF_FRAMES)[number] | (typeof NEON_FRAMES)[number];
export const FRAME_IDS: readonly FrameId[] = [...RELIEF_FRAMES, ...NEON_FRAMES];

export type TextureId = 'none' | 'stone' | 'scratched' | 'hammered' | 'wood' | 'liquid' | 'energy';
export const TEXTURE_IDS: readonly TextureId[] = [
  'none',
  'stone',
  'scratched',
  'hammered',
  'wood',
  'liquid',
  'energy',
];
/** 選了質感時的預設強度（%） */
export const TEXTURE_AMOUNT: Record<Exclude<TextureId, 'none'>, number> = {
  stone: 85,
  scratched: 85,
  hammered: 80,
  wood: 65,
  liquid: 60,
  energy: 80,
};

export type GlowMode = 'off' | 'inner' | 'outer' | 'all';
export const GLOW_MODES: readonly GlowMode[] = ['off', 'inner', 'outer', 'all'];

export type BgMode = 'none' | 'color' | 'extend';
export const BG_MODES: readonly BgMode[] = ['none', 'color', 'extend'];

/** 材質色票（金屬、寶石、石材；token-workshop） */
export const METALS: readonly { key: string; hex: string }[] = [
  { key: 'gold', hex: '#d9a521' },
  { key: 'silver', hex: '#b5bcc6' },
  { key: 'bronze', hex: '#b8733a' },
  { key: 'copper', hex: '#b4693c' },
  { key: 'brass', hex: '#b5923a' },
  { key: 'steel', hex: '#8a9199' },
  { key: 'iron', hex: '#5a6068' },
  { key: 'ruby', hex: '#b3202e' },
  { key: 'sapphire', hex: '#2457b8' },
  { key: 'emerald', hex: '#1e8a4c' },
  { key: 'amethyst', hex: '#7b3fb0' },
  { key: 'ice', hex: '#8fd3f0' },
  { key: 'bone', hex: '#d9cdb0' },
  { key: 'wood', hex: '#7a5230' },
  { key: 'onyx', hex: '#2b2d33' },
  { key: 'granite', hex: '#7d7f84' },
  { key: 'slate', hex: '#4a5560' },
  { key: 'sandstone', hex: '#b89d78' },
];

/** 霓虹色票（eidolon-ui 的兩排） */
export const NEONS: readonly { key: string; hex: string }[] = [
  { key: 'n-yellow', hex: '#fcee0a' },
  { key: 'n-cyan', hex: '#00f0ff' },
  { key: 'n-red', hex: '#ff003c' },
  { key: 'n-green', hex: '#39ff14' },
  { key: 'n-orange', hex: '#ff8800' },
  { key: 'n-purple', hex: '#c800ff' },
  { key: 'n-pink', hex: '#ff10f0' },
  { key: 's-coral', hex: '#ff6b6b' },
  { key: 's-apricot', hex: '#ff9f43' },
  { key: 's-lemon', hex: '#feca57' },
  { key: 's-mint', hex: '#1dd1a1' },
  { key: 's-teal', hex: '#00d2d3' },
  { key: 's-sky', hex: '#54a0ff' },
  { key: 's-lavender', hex: '#a29bfe' },
];

/** 漸層（token-workshop；角度 0°＝由左到右、90°＝由上到下） */
export const GRADIENTS: readonly { key: string; from: string; to: string; angle: number }[] = [
  { key: 'enemy', from: '#ff8a1f', to: '#7a0c10', angle: 45 },
  { key: 'ally', from: '#3ddc84', to: '#0b4f3a', angle: 45 },
  { key: 'arcane', from: '#b36cff', to: '#1a2a8c', angle: 45 },
  { key: 'lava', from: '#ffd23f', to: '#b3111a', angle: 90 },
  { key: 'toxic', from: '#d4ff3d', to: '#1b5e20', angle: 45 },
  { key: 'frost', from: '#e6f8ff', to: '#2a6fb0', angle: 90 },
];

/* ---------- 外觀（所有棋子共用） ---------- */

export interface Look {
  frame: FrameId;
  /** 外框寬度（R 的 %） */
  width: number;
  /** 樣式參數：數量、深度（%）、線寬（%） */
  count: number;
  depth: number;
  lineW: number;
  /** 主色：單色或漸層 */
  colorMode: 'solid' | 'gradient';
  color: string;
  /** 色票的 key（材質、霓虹、漸層、'image'＝圖片取色的漸層）或 'custom' */
  colorKey: string;
  g1: string;
  g2: string;
  /** 漸層角度（度） */
  gAngle: number;
  /** 第二色；霓虹與幾何的樣式要打開 accentOn 才畫配色細節 */
  accent: string;
  accentOn: boolean;
  /** 光從哪個方向來（度：0 右、90 下、180 左、270 上）與強度（%；0＝平塗） */
  lightAngle: number;
  lightStrength: number;
  texture: TextureId;
  /** 質感強度、密度、旋轉（%、%、度） */
  texAmount: number;
  texScale: number;
  texRotate: number;
  /** 能量質感的顏色 */
  energy: string;
  /** 質感的亂數種子（「換一個花紋」） */
  texSeed: number;
  glow: GlowMode;
  /** 外框不透明度（%） */
  opacity: number;
  bg: BgMode;
  bgColor: string;
  /** 自動邊距（不讓出框的部分被切掉）；關掉時用 margin（%） */
  autoMargin: boolean;
  margin: number;
  /** 出框的柔邊（遮罩 px）與陰影（%） */
  feather: number;
  shadow: number;
}

export const DEFAULT_LOOK: Readonly<Look> = Object.freeze({
  frame: 'plain',
  width: 11,
  count: 1,
  depth: 50,
  lineW: 10,
  colorMode: 'solid',
  color: '#d9a521',
  colorKey: 'gold',
  g1: '#ff8a1f',
  g2: '#7a0c10',
  gAngle: 45,
  accent: '#2b2d33',
  accentOn: false,
  lightAngle: 135,
  lightStrength: 100,
  texture: 'none',
  texAmount: 60,
  texScale: 100,
  texRotate: 0,
  energy: '#5ec8ff',
  texSeed: 1,
  glow: 'off',
  opacity: 100,
  bg: 'color',
  bgColor: '#2b2f3a',
  autoMargin: true,
  margin: 8,
  feather: 0.5,
  shadow: 0,
} satisfies Look);

/** 數值的範圍（滑桿與讀檔時的夾值） */
export const RANGES = {
  width: { min: 2, max: 30, step: 1 },
  depth: { min: 0, max: 100, step: 1 },
  gAngle: { min: 0, max: 360, step: 1 },
  lightAngle: { min: 0, max: 360, step: 1 },
  lightStrength: { min: 0, max: 150, step: 1 },
  texAmount: { min: 5, max: 100, step: 1 },
  texScale: { min: 50, max: 400, step: 1 },
  texRotate: { min: 0, max: 360, step: 1 },
  opacity: { min: 0, max: 100, step: 1 },
  margin: { min: 0, max: 45, step: 0.5 },
  feather: { min: 0, max: 12, step: 0.5 },
  shadow: { min: 0, max: 100, step: 1 },
  zoom: { min: 10, max: 800, step: 1 },
  rotate: { min: -180, max: 180, step: 1 },
  tolerance: { min: 1, max: 100, step: 1 },
  brush: { min: 2, max: 40, step: 1 },
} as const;

/* ---------- 棋子 ---------- */

/** 圖片（存在資產庫；寬高是存下來的尺寸，長邊最多 IMAGE_MAX_SIDE） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 出框遮罩（PNG 存在資產庫；在圖片的座標裡，長邊最多 MASK_MAX_SIDE） */
export interface MaskRef {
  id: string;
  width: number;
  height: number;
}

/** 擺放：位移（R 為單位）、縮放（1＝圖片的短邊剛好等於外框的直徑）、旋轉（度）、鏡像 */
export interface TokenView {
  x: number;
  y: number;
  zoom: number;
  rotate: number;
  flip: boolean;
}

export interface TokenItem {
  id: string;
  image: ImageRef | null;
  view: TokenView;
  mask: MaskRef | null;
  /** 顯示出框 */
  popOn: boolean;
  /** 名稱（檔名） */
  name: string;
}

export interface DocState {
  look: Look;
  tokens: TokenItem[];
  /** 目前的棋子 */
  current: string | null;
}

export const IMAGE_MAX_SIDE = 2048;
export const MASK_MAX_SIDE = 1024;
/** 預覽畫布的解析度 */
export const PREVIEW_SIZE = 1024;

export const defaultView = (): TokenView => ({ x: 0, y: 0, zoom: 1, rotate: 0, flip: false });

export function newToken(id: string, image: ImageRef | null = null): TokenItem {
  return { id, image, view: defaultView(), mask: null, popOn: true, name: '' };
}

export const initialState = (): DocState => ({
  look: { ...DEFAULT_LOOK },
  tokens: [],
  current: null,
});

export function nextTokenId(used: readonly { id: string }[]): string {
  const ids = new Set(used.map((t) => t.id));
  let i = used.length + 1;
  while (ids.has(`t${i}`)) i++;
  return `t${i}`;
}

/* ---------- 幾何 ---------- */

export interface Geom {
  N: number;
  c: number;
  R: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** N × N 的棋子、邊距 pad（0～0.45，N 的比例）時的外半徑 */
export function geom(N: number, pad: number): Geom {
  return { N, c: N / 2, R: N * (0.5 - clamp(pad, 0, 0.45)) };
}

export interface ImageTransform {
  /** 圖片中心在棋子上的位置 */
  tx: number;
  ty: number;
  /** 每個圖片 px 在棋子上幾 px */
  scale: number;
  /** 弧度 */
  angle: number;
  flip: 1 | -1;
}

/** 圖片 w × h 依擺放畫在棋子上的轉換（縮放 1＝短邊等於外框直徑） */
export function imageTransform(
  g: Geom,
  size: { width: number; height: number },
  v: TokenView,
): ImageTransform {
  return {
    tx: g.c + v.x * g.R,
    ty: g.c + v.y * g.R,
    scale: ((2 * g.R) / Math.max(1, Math.min(size.width, size.height))) * v.zoom,
    angle: (v.rotate * Math.PI) / 180,
    flip: v.flip ? -1 : 1,
  };
}

/** 棋子上的點 → 圖片的 px（圖片左上角為原點） */
export function tokenToImage(
  t: ImageTransform,
  size: { width: number; height: number },
  px: number,
  py: number,
): { u: number; v: number } {
  const dx = px - t.tx;
  const dy = py - t.ty;
  const co = Math.cos(t.angle);
  const si = Math.sin(t.angle);
  return {
    u: (dx * co + dy * si) / (t.scale * t.flip) + size.width / 2,
    v: (-dx * si + dy * co) / t.scale + size.height / 2,
  };
}

/** 圖片的 px → 棋子上的點 */
export function imageToToken(
  t: ImageTransform,
  size: { width: number; height: number },
  u: number,
  v: number,
): { x: number; y: number } {
  const lx = (u - size.width / 2) * t.scale * t.flip;
  const ly = (v - size.height / 2) * t.scale;
  const co = Math.cos(t.angle);
  const si = Math.sin(t.angle);
  return { x: t.tx + lx * co - ly * si, y: t.ty + lx * si + ly * co };
}

/** 以棋子上的一點（R 為單位、相對中心）為中心縮放：那一點下的圖片不動 */
export function zoomViewAt(v: TokenView, zoom: number, ax: number, ay: number): TokenView {
  const z = clamp(zoom, RANGES.zoom.min / 100, RANGES.zoom.max / 100);
  const k = z / v.zoom;
  return { ...v, zoom: z, x: ax - k * (ax - v.x), y: ay - k * (ay - v.y) };
}

/** 鏡像：以棋子的中線翻轉（位移的 x 與旋轉反過來，畫面上的擺放不跑掉） */
export function flipView(v: TokenView): TokenView {
  return { ...v, flip: !v.flip, x: -v.x, rotate: -v.rotate };
}

/** 旋轉加減（夾在 −180～180） */
export function rotateView(v: TokenView, delta: number): TokenView {
  return { ...v, rotate: clamp(Math.round((v.rotate + delta) * 100) / 100, -180, 180) };
}

/* ---------- 自動邊距 ---------- */

/**
 * 出框的邊界點（圖片 px，以圖片中心為原點，xy 交錯）依擺放算出最遠的半徑（R 為單位），
 * 換成「剛好不切到出框」的邊距（N 的比例，0～0.45）。柔邊與陰影各留一點空間；外光暈另外留。
 */
export function autoPad(
  boundary: Float32Array | null,
  size: { width: number; height: number },
  v: TokenView,
  look: Pick<Look, 'feather' | 'shadow' | 'glow'>,
  maskScale = 1,
): number {
  let d = 1;
  if (boundary?.length) {
    const k = (2 / Math.max(1, Math.min(size.width, size.height))) * v.zoom;
    const a = (v.rotate * Math.PI) / 180;
    const co = Math.cos(a);
    const si = Math.sin(a);
    const f = v.flip ? -1 : 1;
    let far = 0;
    for (let i = 0; i + 1 < boundary.length; i += 2) {
      const x = boundary[i] * k * f;
      const y = boundary[i + 1] * k;
      const r = Math.hypot(x * co - y * si + v.x, x * si + y * co + v.y);
      if (r > far) far = r;
    }
    if (far > 1) {
      d = far * 1.005 + (look.feather > 0 ? look.feather * maskScale * k : 0);
      if (look.shadow > 0) d += 0.01 + 0.05 * (look.shadow / 100);
    }
  }
  if (look.glow === 'outer' || look.glow === 'all') d = Math.max(d, 1.06);
  return clamp(0.5 - 0.5 / d, 0, 0.45);
}

/* ---------- 匯出 ---------- */

/** 尺寸選項（px；280＝Roll20、400＝Foundry） */
export const SIZE_PRESETS = [256, 280, 400, 512, 1024, 2048] as const;
export const DEFAULT_SIZE = 512;
export const CUSTOM_SIZE = { min: 16, max: 4096 } as const;

export type ExportFormat = 'png' | 'webp';

/**
 * 圖片在目前的縮放與邊距下，約可以清楚地匯出到幾 px（再大就是放大，可能會糊）：
 * 圖片的短邊 ÷ 縮放 ÷ 外框直徑佔整張的比例。
 */
export function sharpSize(
  size: { width: number; height: number },
  zoom: number,
  pad: number,
): number {
  return Math.round(
    Math.min(size.width, size.height) / Math.max(0.01, zoom) / Math.max(0.1, 1 - 2 * pad),
  );
}

/** 檔名的基本名稱：棋子的名稱 → 圖片的檔名（拿掉副檔名）→「棋子」 */
export function tokenBaseName(t: Pick<TokenItem, 'name' | 'image'>): string {
  const name = t.name.trim();
  if (name) return name;
  const img = t.image?.name.replace(/\.[^.]+$/, '').trim();
  return img || '棋子';
}

/** 下載的檔名：〈名稱〉_〈尺寸〉.〈副檔名〉（不能用的字元拿掉） */
export function tokenFileName(
  token: Pick<TokenItem, 'name' | 'image'>,
  N: number,
  format: ExportFormat,
): string {
  const base = safeFileName(tokenBaseName(token), { fallback: '棋子', maxLength: 60 });
  return `${base}_${N}.${format}`;
}

/* ---------- 讀檔時的整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? normalizeHex(v, fallback, false) : fallback;
const ranged = (v: unknown, r: { min: number; max: number }, fallback: number): number => {
  const n = num(v);
  return n === undefined ? fallback : clamp(n, r.min, r.max);
};

export function normalizeLook(raw: unknown): Look {
  const d = isObj(raw) ? raw : {};
  const D = DEFAULT_LOOK;
  return {
    frame: pick(d.frame, FRAME_IDS, D.frame),
    width: ranged(d.width, RANGES.width, D.width),
    count: Math.round(ranged(d.count, { min: 1, max: 120 }, D.count)),
    depth: ranged(d.depth, RANGES.depth, D.depth),
    lineW: ranged(d.lineW, { min: 1, max: 40 }, D.lineW),
    colorMode: d.colorMode === 'gradient' ? 'gradient' : 'solid',
    color: color(d.color, D.color),
    colorKey: typeof d.colorKey === 'string' ? d.colorKey.slice(0, 40) : D.colorKey,
    g1: color(d.g1, D.g1),
    g2: color(d.g2, D.g2),
    gAngle: ranged(d.gAngle, RANGES.gAngle, D.gAngle),
    accent: color(d.accent, D.accent),
    accentOn: typeof d.accentOn === 'boolean' ? d.accentOn : D.accentOn,
    lightAngle: ranged(d.lightAngle, RANGES.lightAngle, D.lightAngle),
    lightStrength: ranged(d.lightStrength, RANGES.lightStrength, D.lightStrength),
    texture: pick(d.texture, TEXTURE_IDS, D.texture),
    texAmount: ranged(d.texAmount, RANGES.texAmount, D.texAmount),
    texScale: ranged(d.texScale, RANGES.texScale, D.texScale),
    texRotate: ranged(d.texRotate, RANGES.texRotate, D.texRotate),
    energy: color(d.energy, D.energy),
    texSeed: Math.round(ranged(d.texSeed, { min: 1, max: 99999 }, D.texSeed)),
    glow: pick(d.glow, GLOW_MODES, D.glow),
    opacity: ranged(d.opacity, RANGES.opacity, D.opacity),
    bg: pick(d.bg, BG_MODES, D.bg),
    bgColor: color(d.bgColor, D.bgColor),
    autoMargin: typeof d.autoMargin === 'boolean' ? d.autoMargin : D.autoMargin,
    margin: ranged(d.margin, RANGES.margin, D.margin),
    feather: ranged(d.feather, RANGES.feather, D.feather),
    shadow: ranged(d.shadow, RANGES.shadow, D.shadow),
  };
}

function normalizeImage(raw: unknown): ImageRef | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const width = num(raw.width);
  const height = num(raw.height);
  if (!width || !height || width < 1 || height < 1) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : '',
    width: Math.round(width),
    height: Math.round(height),
  };
}

function normalizeMask(raw: unknown): MaskRef | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const width = num(raw.width);
  const height = num(raw.height);
  if (!width || !height || width < 1 || height < 1) return null;
  return { id: raw.id, width: Math.round(width), height: Math.round(height) };
}

export function normalizeView(raw: unknown): TokenView {
  const v = isObj(raw) ? raw : {};
  return {
    x: clamp(num(v.x) ?? 0, -20, 20),
    y: clamp(num(v.y) ?? 0, -20, 20),
    zoom: clamp(num(v.zoom) ?? 1, RANGES.zoom.min / 100, RANGES.zoom.max / 100),
    rotate: clamp(num(v.rotate) ?? 0, -180, 180),
    flip: v.flip === true,
  };
}

export function normalizeToken(raw: unknown, used: Set<string>): TokenItem | null {
  if (!isObj(raw)) return null;
  let id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : '';
  if (!id || used.has(id)) {
    let i = used.size + 1;
    while (used.has(`t${i}`)) i++;
    id = `t${i}`;
  }
  used.add(id);
  const image = normalizeImage(raw.image);
  return {
    id,
    image,
    view: normalizeView(raw.view),
    mask: image ? normalizeMask(raw.mask) : null,
    popOn: typeof raw.popOn === 'boolean' ? raw.popOn : true,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
  };
}

export const TOKEN_MAX = 60;

export function normalizeState(raw: unknown): DocState {
  const d = isObj(raw) ? raw : {};
  const used = new Set<string>();
  const tokens = (Array.isArray(d.tokens) ? d.tokens : [])
    .map((t) => normalizeToken(t, used))
    .filter((t): t is TokenItem => t !== null)
    .slice(0, TOKEN_MAX);
  const current =
    typeof d.current === 'string' && tokens.some((t) => t.id === d.current)
      ? d.current
      : (tokens[0]?.id ?? null);
  return { look: normalizeLook(d.look), tokens, current };
}
