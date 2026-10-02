/**
 * 前景框的設定（一個純資料物件）：型別、預設值、範本套用、差分的產生、專案檔讀回的整理。
 *
 * 所有長度以「畫布高＝1080 單位」計（規格 0.），換輸出尺寸時設計維持比例。
 * 不依賴 React 與 DOM（單元測試在 Node 跑）。
 */
import type { FontValue } from '@/core/fonts';
import {
  DECO_TYPES,
  type DesignFontKey,
  findDesign,
  PLACEMENTS,
  TIME_IDS,
  type TimeId,
  VARIANT_KINDS,
} from './presets';
import { S } from './strings';

export const TOOL_ID = 'foreground-frame';
/** 畫布高＝1080 單位 */
export const BASE_H = 1080;

/* ---------- 型別 ---------- */

/** 顏色參照：四色之一，或固定色碼（#rrggbb） */
export type ColorRef = string;
export type PaletteKey = 'frame1' | 'frame2' | 'accent' | 'text';
export const PALETTE_KEYS: readonly PaletteKey[] = ['frame1', 'frame2', 'accent', 'text'];

export interface Margin {
  t: number;
  r: number;
  b: number;
  l: number;
}

export type CornerType = 'square' | 'round' | 'chamfer' | 'scoop' | 'notch';
export interface Corner {
  type: CornerType;
  size: number;
}

export interface Opening {
  shape: 'rect' | 'ellipse';
  margin: Margin;
  linkMargin: boolean;
  /** 左上、右上、右下、左下 */
  corners: Corner[];
  linkCorners: boolean;
  outerRadius: number;
}

export type FillMode = 'linear' | 'radial' | 'solid' | 'none';
export type OrnamentType = 'none' | 'bracket' | 'diamond' | 'star' | 'flourish' | 'dots';

export interface LineSetting {
  on: boolean;
  width: number;
  gap: number;
  double: boolean;
  color: ColorRef;
}

export interface FrameSetting {
  fill: FillMode;
  angle: number;
  opacity: number;
  grain: number;
  innerLine: LineSetting;
  outerLine: LineSetting;
  shadow: { on: boolean; size: number; opacity: number; color: ColorRef };
  ornament: { type: OrnamentType; size: number; gap: number; width: number; color: ColorRef };
}

export interface Palette {
  frame1: string;
  frame2: string;
  accent: string;
  text: string;
}

export type DecoType =
  | 'ivy'
  | 'flowers'
  | 'thorns'
  | 'sakura'
  | 'grass'
  | 'stars'
  | 'cobweb'
  | 'chain'
  | 'gears'
  | 'circuit'
  | 'snowcap'
  | 'drips';

export type Placement =
  | 'all'
  | 'top'
  | 'bottom'
  | 'topbottom'
  | 'sides'
  | 'corners'
  | 'topcorners'
  | 'bottomcorners';

export interface Decoration {
  id: string;
  type: DecoType;
  on: boolean;
  /** 圖樣編號（同編號同設定畫出相同的圖） */
  seed: number;
  /** 不溢出到窗內 */
  clipFrame: boolean;
  /** 不顯示的差分（id → true） */
  hideIn: Record<string, boolean>;
  placement: Placement;
  size: number;
  density: number;
  coverage: number;
  offset: number;
  color: ColorRef;
  color2: ColorRef;
}

export type EffectId =
  | 'none'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'petals'
  | 'leaves'
  | 'sparkle'
  | 'dust'
  | 'vignette'
  | 'alert'
  | 'glitch'
  | 'scanlines'
  | 'sepia';

export type IconId =
  | 'none'
  | 'sunrise'
  | 'sun'
  | 'sunset'
  | 'moon'
  | 'star'
  | 'cloud'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'bolt'
  | 'flower'
  | 'leaf'
  | 'heart'
  | 'search'
  | 'swords'
  | 'alert'
  | 'eye'
  | 'skull'
  | 'clock'
  | 'book'
  | 'custom';

export interface VariantItem {
  id: string;
  /** 要匯出 */
  on: boolean;
  name: string;
  sub: string;
  icon: IconId;
  /** 自訂圖示（資產 id） */
  iconAsset: string | null;
  /** 這個差分有自己的顏色 */
  useColors: boolean;
  frame1: string;
  frame2: string;
  accent: string;
  text: string;
  tint: string;
  tintAlpha: number;
  effect: EffectId;
  effectAmount: number;
}

export type VariantKind = 'time' | 'weather' | 'season' | 'scene' | 'sanity' | 'chapter' | 'custom';
export type LabelStyle = 'badge' | 'tabs' | 'dial' | 'label' | 'none';
export type LabelPos = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br' | 'free';

export interface LabelSetting {
  style: LabelStyle;
  pos: LabelPos;
  /** 自由位置：標籤中心在畫布寬、高的比例 */
  x: number;
  y: number;
  scale: number;
  bgAlpha: number;
  showSub: boolean;
  font: FontValue;
}

export interface Variants {
  enabled: boolean;
  kind: VariantKind;
  items: VariantItem[];
  label: LabelSetting;
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'lighter';
export const BLEND_MODES: readonly BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'lighter',
];

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** 圖層中心在畫布寬、高的比例 */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blend: BlendMode;
  flip: boolean;
  order: 'front' | 'back';
  clip: 'none' | 'frame' | 'window';
  hideIn: Record<string, boolean>;
}

export type ImageFit = 'free' | 'stretch' | 'cover' | 'tile';

export interface ImageLayer extends LayerBase {
  kind: 'image';
  /** 資產 id */
  asset: string;
  fit: ImageFit;
  /** 'none' 或顏色參照 */
  recolor: string;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  font: FontValue;
  size: number;
  bold: boolean;
  vertical: boolean;
  spacing: number;
  align: 'left' | 'center' | 'right';
  color: ColorRef;
  strokeWidth: number;
  strokeColor: ColorRef;
  shadow: number;
}

export type Layer = ImageLayer | TextLayer;

export interface FrameState {
  /** 最後套用的範本（時段配色用） */
  design: string;
  size: { w: number; h: number };
  opening: Opening;
  frame: FrameSetting;
  palette: Palette;
  decorations: Decoration[];
  variants: Variants;
  layers: Layer[];
  fileBase: string;
}

/* ---------- 小工具 ---------- */

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const isHex = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* ---------- 顏色（時段配色） ---------- */

export function hexToRgb(hex: string): [number, number, number] {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** 兩色線性混合（t＝0 為 a） */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

/** 亮度（不做 gamma 轉換的加權平均，0～1） */
export function lumaOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 沒有範本專用配色時，各時段的色調（往哪個顏色混、框與強調色混多少、覆蓋色與強度） */
export const TIME_LOOKS: Readonly<
  Record<TimeId, { toward: string; frame: number; accent: number; tint: readonly [string, number] }>
> = {
  morning: { toward: '#ffc38a', frame: 0.22, accent: 0.15, tint: ['#ffc98a', 0.06] },
  day: { toward: '#ffffff', frame: 0, accent: 0, tint: ['#ffffff', 0] },
  evening: { toward: '#b4462e', frame: 0.45, accent: 0.3, tint: ['#ff7a33', 0.12] },
  night: { toward: '#101634', frame: 0.68, accent: 0.2, tint: ['#10205a', 0.28] },
};

/** 自動換成近黑／近白的文字色 */
export const DARK_TEXT = '#1b1b1f';
export const LIGHT_TEXT = '#f3f1ea';

function samePalette(a: readonly string[], p: Palette): boolean {
  const mine = [p.frame1, p.frame2, p.accent, p.text];
  return a.every((c, i) => String(c).toLowerCase() === String(mine[i]).toLowerCase());
}

export interface TimeColors extends Palette {
  tint: string;
  tintAlpha: number;
}

/**
 * 時間帶各時段的顏色（F65）：範本附有時段配色、而且整體配色沒被改過時用範本的；
 * 否則把整體配色往該時段的色調混合，文字色與框的平均亮度差不到 0.35 時換成近黑或近白。
 */
export function timePalette(state: Pick<FrameState, 'design' | 'palette'>, id: string): TimeColors {
  const design = findDesign(state.design);
  const pal = state.palette;
  const table = design?.times && samePalette(design.palette, pal) ? design.times : null;
  const row = table?.[id as TimeId];
  if (row) {
    return {
      frame1: row[0],
      frame2: row[1],
      accent: row[2],
      text: row[3],
      tint: row[4],
      tintAlpha: row[5],
    };
  }
  const look = TIME_LOOKS[id as TimeId] ?? TIME_LOOKS.day;
  const frame1 = mixHex(pal.frame1, look.toward, look.frame);
  const frame2 = mixHex(pal.frame2, look.toward, look.frame);
  const bg = lumaOf(mixHex(frame1, frame2, 0.5));
  const text =
    Math.abs(bg - lumaOf(pal.text)) < 0.35 ? (bg > 0.5 ? DARK_TEXT : LIGHT_TEXT) : pal.text;
  return {
    frame1,
    frame2,
    accent: mixHex(pal.accent, look.toward, look.accent),
    text,
    tint: look.tint[0],
    tintAlpha: look.tint[1],
  };
}

/* ---------- 字型 ---------- */

/** 範本的字型組代號 → 預設的繁中網頁字型（規格第 7 節裁定：預設繁中字型） */
export const DESIGN_FONTS: Readonly<Record<DesignFontKey, FontValue>> = {
  gothic: { source: 'google', family: 'Noto Sans TC', weight: 700 },
  mincho: { source: 'google', family: 'Noto Serif TC', weight: 700 },
};

export const DEFAULT_LABEL_FONT: FontValue = DESIGN_FONTS.gothic;
export const DEFAULT_TEXT_FONT: FontValue = DESIGN_FONTS.mincho;

function normalizeFont(v: unknown, fallback: FontValue): FontValue {
  if (!v || typeof v !== 'object') return { ...fallback };
  const o = v as Partial<FontValue>;
  const source =
    o.source === 'google' || o.source === 'local' || o.source === 'upload'
      ? o.source
      : fallback.source;
  const family = typeof o.family === 'string' ? o.family.replace(/["\\]/g, '') : fallback.family;
  const weight = typeof o.weight === 'number' && Number.isFinite(o.weight) ? o.weight : 400;
  return { source, family, weight };
}

/* ---------- 差分 ---------- */

export function variantItem(fields: Partial<VariantItem>): VariantItem {
  return {
    id: newId('v'),
    on: true,
    name: S.variant.defaultName,
    sub: '',
    icon: 'none',
    iconAsset: null,
    useColors: false,
    frame1: '#f2f8fc',
    frame2: '#c3dff1',
    accent: '#3a8fcb',
    text: '#274760',
    tint: '#000000',
    tintAlpha: 0,
    effect: 'none',
    effectAmount: 0.5,
    ...fields,
  };
}

/** 某個種類的內建差分清單（F56）；時間帶的顏色依 timePalette 推導 */
export function variantItems(
  kind: VariantKind,
  state: Pick<FrameState, 'design' | 'palette'>,
): VariantItem[] {
  const list = VARIANT_KINDS[kind] ?? VARIANT_KINDS.custom;
  return list.map((p) => {
    const item = variantItem({
      id: p.id,
      name: S.variantNames[p.id] ?? p.id,
      sub: p.sub,
      icon: p.icon,
      on: p.on,
      ...state.palette,
      effect: p.effect ?? 'none',
      effectAmount: p.amount ?? 0.5,
    });
    if (kind === 'time') Object.assign(item, timePalette(state, p.id), { useColors: true });
    if (p.colors) {
      Object.assign(item, {
        useColors: true,
        frame1: p.colors[0],
        frame2: p.colors[1],
        accent: p.colors[2],
        text: p.colors[3],
      });
    }
    if (p.tint) Object.assign(item, { tint: p.tint[0], tintAlpha: p.tint[1] });
    return item;
  });
}

/** 目前編輯中的差分：指定的 id → 第一個要匯出的 → 第一個 */
export function currentItem(state: FrameState, id: string | null | undefined): VariantItem | null {
  const items = state.variants.items;
  return items.find((i) => i.id === id) ?? items.find((i) => i.on) ?? items[0] ?? null;
}

/** 要匯出的差分 */
export const exportedItems = (state: FrameState): VariantItem[] =>
  state.variants.items.filter((i) => i.on);

/** F14：目前改的是哪一組顏色（差分有自己的顏色時是那個差分） */
export function colorsTarget(
  state: FrameState,
  current: VariantItem | null,
): 'palette' | 'variant' {
  return state.variants.enabled && current?.useColors ? 'variant' : 'palette';
}

/* ---------- 裝飾與圖層 ---------- */

export function newDecoration(type: DecoType, overrides: Partial<Decoration> = {}): Decoration {
  const { type: _t, id: _i, ...extra } = overrides;
  return {
    id: newId('D'),
    type,
    on: true,
    seed: 1,
    clipFrame: false,
    hideIn: {},
    ...clone(DECO_TYPES[type].defaults),
    ...extra,
  };
}

function baseLayer(name: string): Omit<LayerBase, 'id'> & { id: string } {
  return {
    id: newId('L'),
    name,
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    blend: 'source-over',
    flip: false,
    order: 'front',
    clip: 'none',
    hideIn: {},
  };
}

export function imageLayer(asset: string, name?: string): ImageLayer {
  return {
    ...baseLayer(name || S.layer.defaultImageName),
    kind: 'image',
    asset,
    fit: 'free',
    recolor: 'none',
  };
}

export function textLayer(): TextLayer {
  return {
    ...baseLayer(S.layer.defaultTextName),
    kind: 'text',
    y: 0.88,
    text: S.layer.defaultText,
    font: { ...DEFAULT_TEXT_FONT },
    size: 44,
    bold: true,
    vertical: false,
    spacing: 0.1,
    align: 'center',
    color: 'text',
    strokeWidth: 0,
    strokeColor: '#000000',
    shadow: 0,
  };
}

/**
 * F30：新增圖片時的擺放。比例與畫布相差不到 0.02、寬至少為輸出寬的一半 → 拉伸鋪滿（判斷為整張框素材）；
 * 否則縮到不超過畫布高與寬的 40%（不放大，倍率取兩位小數，至少 0.02）。
 */
export function autoPlaceImage(
  img: { width: number; height: number },
  size: { w: number; h: number },
): { fit: 'stretch' } | { fit: 'free'; scale: number } {
  const VW = (BASE_H * size.w) / size.h;
  if (Math.abs(img.width / img.height - VW / BASE_H) < 0.02 && img.width >= size.w * 0.5)
    return { fit: 'stretch' };
  const s = Math.min(1, (BASE_H * 0.4) / img.height, (VW * 0.4) / img.width);
  return { fit: 'free', scale: Math.max(0.02, Math.round(s * 100) / 100) };
}

/* ---------- 範本 ---------- */

/**
 * 套用範本（F02）：窗、框、四色、整個裝飾清單換成範本的；差分標籤的樣式、位置、字型、背景濃度也換掉
 * （背景濃度先回到 92% 再套範本的值）。保留輸出尺寸、圖層、差分清單、檔名。
 * 差分種類是時間帶時，內建四個時段的顏色依新範本重新推導。直接修改傳入的物件（可以是 Immer 的草稿）。
 */
export function applyDesign(state: FrameState, id: string): boolean {
  const d = findDesign(id);
  if (!d) return false;
  state.design = d.id;
  state.opening = clone(d.opening);
  state.frame = clone(d.frame);
  const [frame1, frame2, accent, text] = d.palette;
  state.palette = { frame1, frame2, accent, text };
  state.decorations = d.decorations.map((x) => newDecoration(x.type, clone(x)));
  Object.assign(state.variants.label, {
    style: d.indicator.style,
    pos: d.indicator.pos,
    font: { ...DESIGN_FONTS[d.indicator.font] },
    bgAlpha: d.indicator.bgAlpha ?? 0.92,
  });
  if (state.variants.kind === 'time') {
    for (const item of state.variants.items) {
      if ((TIME_IDS as readonly string[]).includes(item.id))
        Object.assign(item, timePalette(state, item.id));
    }
  }
  return true;
}

export const DEFAULT_DESIGN = 'simple';

export function defaultState(): FrameState {
  const state: FrameState = {
    design: DEFAULT_DESIGN,
    size: { w: 1920, h: 1080 },
    opening: null as unknown as Opening,
    frame: null as unknown as FrameSetting,
    palette: null as unknown as Palette,
    decorations: [],
    variants: {
      enabled: false,
      kind: 'time',
      items: [],
      label: {
        style: 'badge',
        pos: 'tl',
        x: 0.1,
        y: 0.1,
        scale: 1,
        bgAlpha: 0.92,
        showSub: true,
        font: { ...DEFAULT_LABEL_FONT },
      },
    },
    layers: [],
    fileBase: S.export.defaultBase,
  };
  applyDesign(state, DEFAULT_DESIGN);
  state.variants.items = variantItems('time', state);
  return state;
}

/* ---------- 讀回（專案檔、自動存檔）時的整理（F86） ---------- */

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

/** 以 base 為範本補齊缺的欄位：型別不符時用 base 的值；陣列與 null 欄位照讀入的值 */
function mergeDefaults<T>(base: T, loaded: unknown): T {
  if (base === null) return (loaded === undefined ? null : loaded) as T;
  if (Array.isArray(base) || typeof base !== 'object') {
    if (loaded === undefined || typeof loaded !== typeof base) return base;
    if (typeof base === 'number' && !Number.isFinite(loaded as number)) return base;
    return loaded as T;
  }
  if (!isPlain(loaded)) return base;
  const out: Plain = {};
  for (const key of Object.keys(base as Plain))
    out[key] = mergeDefaults((base as Plain)[key], loaded[key]);
  return out as T;
}

const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function hideMap(v: unknown): Record<string, boolean> {
  if (!isPlain(v)) return {};
  return Object.fromEntries(
    Object.entries(v)
      .filter(([, x]) => x === true)
      .map(([k]): [string, boolean] => [k, true]),
  );
}

/**
 * 讀入的設定整理成完整的設定：缺少的欄位以預設值補齊；認不得的裝飾種類、圖層種類略過；
 * 差分清單空的時候用預設清單；沒有任何要匯出的差分時把第一個設為要匯出；認不得的差分種類當成「自由」。
 */
export function normalizeState(input: unknown): FrameState {
  const loaded: Plain = isPlain(input) ? input : {};
  const base = defaultState();
  const state = mergeDefaults(
    { ...base, decorations: [], layers: [], variants: { ...base.variants, items: [] } },
    loaded,
  ) as FrameState;

  /* 窗的四角 */
  const corner = base.opening.corners[0];
  const lo = isPlain(loaded.opening) ? loaded.opening : {};
  const cornerList = Array.isArray(lo.corners) ? lo.corners : base.opening.corners;
  state.opening.corners = [0, 1, 2, 3].map((i) => mergeDefaults(corner, cornerList[i]));
  for (const c of state.opening.corners)
    if (!['square', 'round', 'chamfer', 'scoop', 'notch'].includes(c.type)) c.type = 'round';

  /* 輸出尺寸 */
  state.size = {
    w: Math.round(clampNum(state.size.w, 64, 4096)),
    h: Math.round(clampNum(state.size.h, 64, 4096)),
  };

  /* 差分 */
  const lv = isPlain(loaded.variants) ? loaded.variants : {};
  const template = variantItem({ id: '' });
  const itemList = Array.isArray(lv.items)
    ? lv.items.filter((i): i is Plain => isPlain(i) && typeof i.id === 'string' && !!i.id)
    : [];
  state.variants.items = itemList.length
    ? itemList.map((i) => ({ ...mergeDefaults(template, i), id: i.id as string }))
    : base.variants.items;
  const seen = new Set<string>();
  state.variants.items = state.variants.items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  if (!state.variants.items.some((i) => i.on)) state.variants.items[0].on = true;
  if (!(state.variants.kind in VARIANT_KINDS)) state.variants.kind = 'custom';
  for (const i of state.variants.items) {
    i.name = String(i.name).slice(0, 20);
    i.sub = String(i.sub).slice(0, 30);
  }
  const ll = isPlain(lv.label) ? lv.label : {};
  state.variants.label.font = normalizeFont(ll.font, DEFAULT_LABEL_FONT);

  /* 裝飾 */
  const decoList = Array.isArray(loaded.decorations) ? loaded.decorations : [];
  state.decorations = decoList
    .filter((d): d is Plain => isPlain(d) && typeof d.type === 'string' && d.type in DECO_TYPES)
    .map((d) => {
      const out = mergeDefaults(newDecoration(d.type as DecoType), d);
      out.hideIn = hideMap(d.hideIn);
      if (typeof d.id === 'string' && d.id) out.id = d.id;
      if (!PLACEMENTS.includes(out.placement)) out.placement = 'all';
      return out;
    });

  /* 圖層 */
  const layerList = Array.isArray(loaded.layers) ? loaded.layers : [];
  state.layers = layerList
    .filter(
      (l): l is Plain =>
        isPlain(l) &&
        ((l.kind === 'image' && typeof l.asset === 'string' && !!l.asset) || l.kind === 'text'),
    )
    .map((l) => {
      const out =
        l.kind === 'image'
          ? mergeDefaults(imageLayer(l.asset as string), l)
          : mergeDefaults(textLayer(), l);
      out.hideIn = hideMap(l.hideIn);
      if (typeof l.id === 'string' && l.id) out.id = l.id;
      if (out.kind === 'text') out.font = normalizeFont(l.font, DEFAULT_TEXT_FONT);
      return out;
    });
  return state;
}

/* ---------- 用到的資產 ---------- */

/** 設定裡用到的圖片資產（圖片圖層、自訂圖示） */
export function stateAssetIds(state: FrameState): string[] {
  const ids = new Set<string>();
  for (const l of state.layers) if (l.kind === 'image') ids.add(l.asset);
  for (const i of state.variants.items) if (i.iconAsset) ids.add(i.iconAsset);
  return [...ids];
}

/** 用到的上傳字型（文字圖層、差分標籤） */
export function stateUploadFonts(state: FrameState): string[] {
  const fams = new Set<string>();
  const add = (f: FontValue) => {
    if (f.source === 'upload' && f.family) fams.add(f.family);
  };
  for (const l of state.layers) if (l.kind === 'text') add(l.font);
  add(state.variants.label.font);
  return [...fams];
}
