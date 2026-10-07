/**
 * 立繪去背工具的設定、圖片清單與輸出規則（純資料，不依賴 React）。
 */
import type { ModelSpec } from '@/core/models';
import type { OnnxBackendChoice } from '@/core/onnx/types';

export const TOOL_ID = 'bg-remover';
export const PROJECT_VERSION = 1;

/**
 * 模型：SkyTNT/anime-segmentation 的 isnetis.onnx（Apache-2.0），固定 Hugging Face 的 revision。
 * 大小與 SHA-256 照 revision 493cb60 的檔案（下載後逐位元組驗證）。
 */
export const ANIME_SEG_MODEL: ModelSpec = {
  id: 'skytnt-anime-seg-isnetis',
  url: 'https://huggingface.co/skytnt/anime-seg/resolve/493cb60893f47441b26ec4fb9a306bce9e342982/isnetis.onnx',
  bytes: 176_069_933,
  sha256: 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99',
  name: 'anime-seg（isnetis.onnx）',
  source: 'Hugging Face 上 SkyTNT 的 anime-seg',
  license: 'Apache-2.0',
  homepage: 'https://huggingface.co/skytnt/anime-seg',
};

/** 測試入口：e2e 以 addInitScript 設定 `window.__bgRemoverModel` 換成小的假模型（同樣的輸入輸出名稱與形狀） */
export function modelSpec(): ModelSpec {
  const override = (globalThis as { __bgRemoverModel?: ModelSpec }).__bgRemoverModel;
  return override && typeof override.url === 'string' ? override : ANIME_SEG_MODEL;
}

export type Mode = 'ai' | 'color';
export type OutContent = 'cutout' | 'mask' | 'compare';
export type OutBackground = 'transparent' | 'white' | 'color';
export type OutFormat = 'png' | 'webp' | 'jpg';
export type OutScope = 'current' | 'all';
export type BrushTool = 'move' | 'erase' | 'restore' | 'fill-erase' | 'fill-restore';
/** 點一下選同色範圍的工具（同色擦掉、同色補回） */
export const isFillTool = (t: BrushTool): t is 'fill-erase' | 'fill-restore' =>
  t === 'fill-erase' || t === 'fill-restore';
export type ViewMode = 'result' | 'original' | 'mask';

/** 存起來的一筆筆刷（欄位名稱縮短，存檔小一點）：m 擦掉／補回、s 直徑、h 硬度、p 點（小數一位） */
export interface PaintStroke {
  m: 'e' | 'r';
  s: number;
  h: number;
  p: number[];
}

/**
 * 同色擦掉／補回的一次（規格 F61）：m 'fe' 同色擦掉、'fr' 同色補回；x、y 點的位置（像素，整數）；
 * t 容許度（0～100）；c 只選相連的。重播時依當下的遮罩重新算範圍（core/image 的 colorRegion）。
 */
export interface FillStroke {
  m: 'fe' | 'fr';
  x: number;
  y: number;
  t: number;
  c: boolean;
}

/** 修邊的一步（依序重播） */
export type StoredStroke = PaintStroke | FillStroke;

export const isFillStroke = (s: StoredStroke): s is FillStroke => s.m === 'fe' || s.m === 'fr';

export interface ImageItem {
  /** 清單裡的 id（同一張圖放兩次是兩個項目） */
  id: string;
  /** 原檔名 */
  name: string;
  /** 原圖在資產庫的 id */
  asset: string;
  width: number;
  height: number;
  /** 筆刷（依序） */
  strokes: StoredStroke[];
}

export interface Settings {
  mode: Mode;
  /** AI 的運算方式 */
  backend: OnnxBackendChoice;
  /** 純色：背景色自動偵測（每張各自偵測） */
  keyAuto: boolean;
  /** 純色：指定的背景色 */
  keyColor: string;
  /** 純色：容許度 0～100 */
  tolerance: number;
  /** 純色：柔邊 0～50 */
  softness: number;
  /** 純色：只去掉和圖邊相連的背景 */
  connected: boolean;
  /** 純色：去色邊 */
  despill: boolean;
  /** 收縮（負）／擴張（正），px */
  grow: number;
  /** 羽化，px */
  feather: number;
  /** 輸出 */
  content: OutContent;
  background: OutBackground;
  bgColor: string;
  format: OutFormat;
  scope: OutScope;
  trim: boolean;
  trimPad: number;
  images: ImageItem[];
}

export const RANGE = {
  tolerance: { min: 0, max: 100, step: 1, default: 12 },
  softness: { min: 0, max: 50, step: 1, default: 8 },
  grow: { min: -20, max: 20, step: 1, default: 0 },
  feather: { min: 0, max: 20, step: 0.5, default: 0 },
  trimPad: { min: 0, max: 200, step: 1, default: 0 },
  brushSize: { min: 1, max: 500, step: 1, default: 40 },
  brushHardness: { min: 0, max: 100, step: 1, default: 80 },
  fillTolerance: { min: 0, max: 100, step: 1, default: 12 },
} as const;

export function defaultSettings(): Settings {
  return {
    mode: 'ai',
    backend: 'auto',
    keyAuto: true,
    keyColor: '#ffffff',
    tolerance: RANGE.tolerance.default,
    softness: RANGE.softness.default,
    connected: true,
    despill: true,
    grow: RANGE.grow.default,
    feather: RANGE.feather.default,
    content: 'cutout',
    background: 'transparent',
    bgColor: '#ffffff',
    format: 'png',
    scope: 'current',
    trim: false,
    trimPad: RANGE.trimPad.default,
    images: [],
  };
}

const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;

function normalizeStroke(raw: unknown): StoredStroke | null {
  const f = raw as Partial<FillStroke> | null;
  if (f && typeof f === 'object' && (f.m === 'fe' || f.m === 'fr')) {
    if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) return null;
    return {
      m: f.m,
      x: Math.max(0, Math.round(f.x as number)),
      y: Math.max(0, Math.round(f.y as number)),
      t: clampNum(
        f.t,
        RANGE.fillTolerance.min,
        RANGE.fillTolerance.max,
        RANGE.fillTolerance.default,
      ),
      c: f.c !== false,
    };
  }
  const s = raw as Partial<PaintStroke> | null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.p)) return null;
  const p = s.p.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (p.length < 2) return null;
  return {
    m: s.m === 'r' ? 'r' : 'e',
    s: clampNum(s.s, RANGE.brushSize.min, RANGE.brushSize.max, RANGE.brushSize.default),
    h: clampNum(s.h, 0, 100, RANGE.brushHardness.default),
    p: p.length % 2 ? p.slice(0, -1) : p,
  };
}

function normalizeImage(raw: unknown): ImageItem | null {
  const it = raw as Partial<ImageItem> | null;
  if (!it || typeof it !== 'object') return null;
  if (typeof it.id !== 'string' || typeof it.asset !== 'string') return null;
  const w = Math.round(Number(it.width));
  const h = Math.round(Number(it.height));
  if (!(w > 0 && h > 0)) return null;
  return {
    id: it.id,
    name: typeof it.name === 'string' && it.name ? it.name : 'image.png',
    asset: it.asset,
    width: w,
    height: h,
    strokes: Array.isArray(it.strokes)
      ? it.strokes.map(normalizeStroke).filter((s): s is StoredStroke => !!s)
      : [],
  };
}

/** 存檔、專案檔讀回時修正：範圍外的值夾回範圍、不認得的值換成預設、壞掉的圖片項目拿掉 */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const seen = new Set<string>();
  const images = (Array.isArray(r.images) ? r.images : [])
    .map(normalizeImage)
    .filter((it): it is ImageItem => {
      if (!it || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  return {
    mode: oneOf(r.mode, ['ai', 'color'] as const, d.mode),
    backend: oneOf(r.backend, ['auto', 'webgpu', 'wasm'] as const, d.backend),
    keyAuto: typeof r.keyAuto === 'boolean' ? r.keyAuto : d.keyAuto,
    keyColor: hex(r.keyColor, d.keyColor),
    tolerance: clampNum(r.tolerance, RANGE.tolerance.min, RANGE.tolerance.max, d.tolerance),
    softness: clampNum(r.softness, RANGE.softness.min, RANGE.softness.max, d.softness),
    connected: typeof r.connected === 'boolean' ? r.connected : d.connected,
    despill: typeof r.despill === 'boolean' ? r.despill : d.despill,
    grow: Math.round(clampNum(r.grow, RANGE.grow.min, RANGE.grow.max, d.grow)),
    feather: clampNum(r.feather, RANGE.feather.min, RANGE.feather.max, d.feather),
    content: oneOf(r.content, ['cutout', 'mask', 'compare'] as const, d.content),
    background: oneOf(r.background, ['transparent', 'white', 'color'] as const, d.background),
    bgColor: hex(r.bgColor, d.bgColor),
    format: oneOf(r.format, ['png', 'webp', 'jpg'] as const, d.format),
    scope: oneOf(r.scope, ['current', 'all'] as const, d.scope),
    trim: typeof r.trim === 'boolean' ? r.trim : d.trim,
    trimPad: Math.round(clampNum(r.trimPad, RANGE.trimPad.min, RANGE.trimPad.max, d.trimPad)),
    images,
  };
}

/** 筆刷點存檔時取到小數一位 */
export const roundPoint = (v: number) => Math.round(v * 10) / 10;

/* ---------- 檔名 ---------- */

const EXT: Record<OutFormat, string> = { png: 'png', webp: 'webp', jpg: 'jpg' };
const SUFFIX: Record<OutContent, string> = { cutout: '_去背', mask: '_遮罩', compare: '_比較' };

/** 輸出檔名：原檔名（去掉副檔名）＋「_去背／_遮罩／_比較」＋副檔名 */
export function outputName(name: string, content: OutContent, format: OutFormat): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).trim() || 'image';
  return `${base}${SUFFIX[content]}.${EXT[format]}`;
}

/** 匯出的實際背景：JPG 沒有透明，透明時改成白色 */
export function effectiveBackground(
  s: Pick<Settings, 'background' | 'format' | 'content'>,
): OutBackground {
  if (s.content !== 'cutout') return 'transparent';
  return s.format === 'jpg' && s.background === 'transparent' ? 'white' : s.background;
}
