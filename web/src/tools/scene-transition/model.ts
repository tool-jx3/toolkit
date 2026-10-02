/**
 * 設定的規則（純函式）：
 * - 選取效果時哪些設定換成效果的值、哪些保留（規格 4.5）；
 * - 存檔讀回時的修正（規格 F65、F66）；
 * - 依效果與設定顯示哪些形狀設定（規格 F22）；
 * - 設定 → core/transition 的到達先後圖參數；
 * - 檔名（規格 3.8）。
 */
import { safeFileName } from '@/core/files';
import {
  type ArrivalParams,
  type CellOrder,
  type ClockKind,
  type FigureKind,
  type GridCell,
  shapeParams,
  type TransitionShape,
  type WaveForm,
} from '@/core/transition';
import { DEFAULT_EFFECT, effectById, isEffectId, sampleCaption } from './effects';
import { FONT_IDS } from './fonts';
import {
  BASE_CAPTION,
  BASE_LOOK,
  type Caption,
  CURVE_IDS,
  clampCount,
  DIRECTIONS,
  defaultFontSize,
  FPS_OPTIONS,
  type Look,
  MODES,
  normalizeOption,
  ORDERS,
  RANGES,
  type Settings,
  SIZE_IDS,
  sizeOf,
  snap,
  TEXT_POSITIONS,
} from './settings';

/** 效果的初始設定（形狀選項換成該形狀的值、數量夾在範圍內、方塊最多 60） */
export function effectLook(id: string): Look {
  const e = effectById(id);
  const look: Look = { ...BASE_LOOK, ...e.look };
  look.option = normalizeOption(e.shape, look.option);
  look.count = clampCount(e.shape, look.count);
  look.blockSize = Math.min(60, look.blockSize);
  return look;
}

/**
 * 選取效果（規格 4.5）。prev 為 null 表示第一次（開頁、存檔無效時）。
 * - 換成效果的值：所有外觀、形狀、時間、進階設定（效果沒指定的用 BASE_LOOK）。
 * - 保留：輸出尺寸、每秒格數、格式。
 * - 循環播放：保留；但新效果或前一個效果要求循環（心跳）時改成新效果的要求。
 * - 字幕：字幕（去掉頭尾空白）等於前一個效果的範例字幕時，換成新效果的範例字幕與字幕樣式；否則字幕與樣式都保留。
 */
export function applyEffect(prev: Settings | null, id: string): Settings {
  const e = effectById(id);
  const look = effectLook(e.id);
  const size = prev?.size ?? '1280x720';
  const keepText = !!prev && prev.caption.trim() !== sampleCaption(prev.effect);
  const resetLoop = !prev || !!e.loop || !!effectById(prev.effect).loop;
  const caption: Caption = keepText
    ? {
        caption: prev.caption,
        textColor: prev.textColor,
        fontSize: prev.fontSize,
        font: prev.font,
        fontName: prev.fontName,
        textPos: prev.textPos,
        outline: prev.outline,
      }
    : {
        ...BASE_CAPTION,
        ...e.caption,
        fontName: prev?.fontName ?? '',
        fontSize: defaultFontSize(sizeOf(size).height),
      };
  return {
    effect: e.id,
    ...look,
    ...caption,
    size,
    fps: prev?.fps ?? 24,
    format: prev?.format ?? 'webp',
    loop: resetLoop ? !!e.loop : prev.loop,
  };
}

/** 沒有存檔時：E01、1280 × 720、每秒 24 格、WebP（規格 4.6） */
export const DEFAULT_SETTINGS: Settings = applyEffect(null, DEFAULT_EFFECT);

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const oneOf = <T>(list: readonly T[], v: unknown): T =>
  list.includes(v as T) ? (v as T) : list[0];

/**
 * 存檔讀回時的修正：效果編號不認得或格式不對時用預設；其餘每個欄位個別檢查——
 * 選單的值不在選項裡時改成第一個選項，數值夾在範圍內並對齊間隔，缺的或壞掉的換成效果的初始設定。
 */
export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  if (!isEffectId(r.effect)) return { ...DEFAULT_SETTINGS };
  const shape = effectById(r.effect).shape;
  const base = applyEffect(null, r.effect);
  const num = (key: keyof typeof RANGES, k: keyof Settings = key as keyof Settings) => {
    const v = r[k];
    return typeof v === 'number' && Number.isFinite(v) ? snap(v, RANGES[key]) : (base[k] as number);
  };
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : base[k]);
  const color = (k: keyof Settings) => (isColor(r[k]) ? (r[k] as string).toLowerCase() : base[k]);
  const str = (k: keyof Settings) => (typeof r[k] === 'string' ? (r[k] as string) : base[k]);
  const count = typeof r.count === 'number' ? clampCount(shape, r.count) : base.count;
  return {
    effect: r.effect,
    mode: oneOf(MODES, r.mode),
    color: color('color') as string,
    glow: bool('glow') as boolean,
    glowColor: color('glowColor') as string,
    strobe: num('strobe'),
    color2: color('color2') as string,
    softness: num('softness'),
    option: normalizeOption(shape, typeof r.option === 'string' ? r.option : ''),
    order: oneOf(ORDERS, r.order),
    direction: oneOf(DIRECTIONS, r.direction),
    axis: oneOf(['vertical', 'horizontal'] as const, r.axis),
    count,
    strength: num('strength'),
    blockSize: num('blockSize'),
    ellipse: bool('ellipse') as boolean,
    centerX: num('center', 'centerX'),
    centerY: num('center', 'centerY'),
    bandWidth: num('bandWidth'),
    seed: num('seed'),
    duration: num('duration'),
    hold: num('hold'),
    curve: oneOf(CURVE_IDS, r.curve),
    reach: num('reach'),
    reverseOrder: bool('reverseOrder') as boolean,
    reversePlay: bool('reversePlay') as boolean,
    caption: str('caption') as string,
    textColor: color('textColor') as string,
    fontSize: num('fontSize'),
    font: oneOf(FONT_IDS, r.font),
    fontName: str('fontName') as string,
    textPos: oneOf(TEXT_POSITIONS, r.textPos),
    outline: bool('outline') as boolean,
    size: oneOf(SIZE_IDS, r.size),
    fps: oneOf(FPS_OPTIONS, r.fps),
    loop: bool('loop') as boolean,
    format: oneOf(['webp', 'apng'] as const, r.format),
  };
}

/* ---------- 形狀設定 ---------- */

/** 設定 → 到達先後圖的參數。scale：預覽時方塊大小的縮放比例（480 ÷ 輸出寬，四捨五入、至少 1 px） */
export function arrivalParams(s: Settings, shape: TransitionShape, scale = 1): ArrivalParams {
  const p: ArrivalParams = {
    direction: s.direction,
    axis: s.axis,
    count: clampCount(shape, s.count),
    strength: s.strength,
    blockSize: Math.max(1, Math.round(s.blockSize * scale)),
    ellipse: s.ellipse,
    center: [s.centerX, s.centerY],
    seed: s.seed,
    order: s.order as CellOrder,
  };
  const option = normalizeOption(shape, s.option);
  if (shape === 'figure') p.figure = option as FigureKind;
  else if (shape === 'clock') p.clock = option as ClockKind;
  else if (shape === 'wave') p.wave = option as WaveForm;
  else if (shape === 'grid') p.cell = option as GridCell;
  else if (shape === 'ink') p.spread = option as 'direction' | 'center';
  return p;
}

/** 依效果出現的設定（規格 F22；名稱對照附件「會出現的形狀設定」） */
export type ShapeField =
  | 'glowColor'
  | 'color2'
  | 'option'
  | 'order'
  | 'direction'
  | 'axis'
  | 'count'
  | 'strength'
  | 'blockSize'
  | 'ellipse'
  | 'center'
  | 'bandWidth'
  | 'seed';

const PARAM_FIELD: Partial<Record<keyof ArrivalParams, ShapeField>> = {
  direction: 'direction',
  axis: 'axis',
  count: 'count',
  strength: 'strength',
  blockSize: 'blockSize',
  ellipse: 'ellipse',
  center: 'center',
  seed: 'seed',
  order: 'order',
  wave: 'option',
  figure: 'option',
  clock: 'option',
  cell: 'option',
  spread: 'option',
};

/**
 * 目前會出現哪些設定：發光顏色（邊緣發光開啟時）、第二顏色（雙色閃換 ≥ 2 次；1 次沒有作用，主控裁定隱藏）、
 * 帶寬（轉場方式為掃過）、以及形狀用到的參數（出現順序、形狀選項改變時跟著變）。
 */
export function visibleFields(s: Settings): Set<ShapeField> {
  const shape = effectById(s.effect).shape;
  const out = new Set<ShapeField>();
  if (s.glow) out.add('glowColor');
  if (s.strobe >= 2) out.add('color2');
  for (const k of shapeParams(shape, arrivalParams(s, shape))) {
    const f = PARAM_FIELD[k];
    if (f) out.add(f);
  }
  if (s.mode === 'sweep') out.add('bandWidth');
  return out;
}

/* ---------- 檔名 ---------- */

export const REVERSE_SUFFIX = '（倒著播放）';

/** 檔名：效果名稱＋（倒著播放時）後綴＋副檔名；Windows 不能用的字元由 safeFileName 拿掉 */
export function exportFileName(s: Pick<Settings, 'effect' | 'reversePlay'>, ext: string): string {
  const base = safeFileName(effectById(s.effect).name, { fallback: '場景轉換' });
  return `${base}${s.reversePlay ? REVERSE_SUFFIX : ''}.${ext}`;
}

/** 換花紋：1～9999 之間、與目前不同的隨機整數 */
export function nextSeed(current: number, random: () => number = Math.random): number {
  for (;;) {
    const n = 1 + Math.floor(random() * 9999);
    if (n !== current) return n;
  }
}
