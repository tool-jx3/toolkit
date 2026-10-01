/**
 * 打字機動畫產生器的設定：四個模式（打字、故障、片尾名單、卡拉 OK）各自一整組，加上 WebP 的匯出設定。
 * 預設值與數值範圍照規格第 1、2 節（範圍是主控裁定採用的建議值）。範例文字是本工具自己寫的。
 */

export type Mode = 'typing' | 'glitch' | 'credits' | 'karaoke';
export const MODES: readonly Mode[] = ['typing', 'glitch', 'credits', 'karaoke'];

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

/** 字型：12 套 Google 字型（以字型名稱存）或「custom」（電腦已安裝的字型，名稱在 customFont） */
export const FONT_FAMILIES = [
  'Noto Sans KR',
  'Noto Serif KR',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Jua',
  'Do Hyeon',
  'Black Han Sans',
  'Noto Sans TC',
  'Noto Serif TC',
  'LXGW WenKai TC',
  'Chocolate Classical Sans',
  'Cactus Classical Serif',
] as const;
export const CUSTOM_FONT = 'custom';
export const DEFAULT_FONT = 'Noto Sans TC';

/** 四個模式都有的設定 */
export interface BaseSettings {
  text: string;
  font: string;
  customFont: string;
  /** 字級 px */
  size: number;
  /** 行距（字級的倍數） */
  leading: number;
  bold: boolean;
  align: HAlign;
  bgOn: boolean;
  bgColor: string;
  /** 外框粗細 px（0＝不畫） */
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  fps: number;
  width: number;
  height: number;
  /** APNG 減色（256 色） */
  quantize: boolean;
}

/** 打字／故障／卡拉 OK 共通 */
export interface StyledSettings extends BaseSettings {
  /** 水平縮放 % */
  scaleX: number;
  /** 字距 px */
  tracking: number;
  italic: boolean;
  valign: VAlign;
  /** 最後停留時間（毫秒） */
  holdMs: number;
}

/** 打字與故障共通（填色、外框色、底線、刪除線、書寫方向） */
export interface TextModeSettings extends StyledSettings {
  fill: string;
  strokeColor: string;
  underline: boolean;
  strike: boolean;
  vertical: boolean;
}

export type FadeKind = 'none' | 'whole' | 'each';
export type ShapeKind = 'none' | 'circle' | 'square' | 'triangle';

export interface TypingSettings extends TextModeSettings {
  direction: 'forward' | 'reverse';
  fade: FadeKind;
  fadeMs: number;
  shape: ShapeKind;
  shapeSize: number;
  /** 每格旋轉角度（度，正數順時針） */
  rotate: number;
  soundMode: 'each' | 'skip';
}

export interface GlitchCharsets {
  latin: boolean;
  kana: boolean;
  hangul: boolean;
  shapes: boolean;
}

export interface GlitchSettings extends TextModeSettings {
  charsets: GlitchCharsets;
  /** 每個字閃過幾格亂碼 */
  intensity: number;
  /** 同時亂碼、依序還原 */
  together: boolean;
}

export interface CreditsSettings extends BaseSettings {
  fill: string;
  strokeColor: string;
  /** 總長（秒） */
  duration: number;
  /** 以空白行分成多個檔案 */
  split: boolean;
  /** 靜音音檔延長（秒） */
  silenceExtra: number;
}

export type KaraokeShow = 'all' | 'reveal' | 'current' | 'rotate' | 'page';

export interface KaraokeSettings extends StyledSettings {
  /** 總時間（秒） */
  duration: number;
  /** 前奏等待（秒） */
  intro: number;
  alloc: 'chars' | 'equal';
  beforeFill: string;
  beforeStroke: string;
  afterFill: string;
  afterStroke: string;
  direction: 'ltr' | 'rtl';
  softness: number;
  glowOn: boolean;
  glowColor: string;
  glowWidth: number;
  show: KaraokeShow;
  /** 固定 n 行的 n */
  rows: number;
  /** 輪替淡化（秒） */
  swapFade: number;
}

export interface WebpSettings {
  lossless: boolean;
  quality: number;
}

export interface TwData {
  typing: TypingSettings;
  glitch: GlitchSettings;
  credits: CreditsSettings;
  karaoke: KaraokeSettings;
  webp: WebpSettings;
}

export type ModeSettings = TwData[Mode];

/* ---------- 範例文字（本工具自己寫的） ---------- */

export const SAMPLE_TEXT: Record<Mode, string> = {
  typing: '歡迎來到\n迷霧森林的入口。',
  glitch: 'SYSTEM ERROR\n理智值：歸零',
  credits: [
    '— 本次冒險 —',
    '霧港的燈塔',
    '',
    '主持人',
    '阿星',
    '',
    '玩家',
    '小海　阿凜　白楓',
    '',
    '感謝各位的參與',
  ].join('\n'),
  karaoke: ['月色落在旅店窗邊 | 2', '我們翻開新的冒險', '骰子滾過木頭桌面', '故事從這裡蔓延'].join(
    '\n',
  ),
};

/* ---------- 預設值（規格第 1 節） ---------- */

const base = {
  font: DEFAULT_FONT,
  customFont: '',
  align: 'center' as HAlign,
  bgOn: false,
  bgColor: '#000000',
  quantize: true,
};

export const DEFAULT_TYPING: TypingSettings = {
  ...base,
  text: SAMPLE_TEXT.typing,
  size: 48,
  scaleX: 100,
  tracking: 0,
  leading: 1.2,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  vertical: false,
  valign: 'middle',
  fill: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 4,
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowX: 2,
  shadowY: 2,
  fps: 12,
  holdMs: 2000,
  width: 600,
  height: 300,
  direction: 'forward',
  fade: 'none',
  fadeMs: 1000,
  shape: 'none',
  shapeSize: 100,
  rotate: 0,
  soundMode: 'each',
};

export const DEFAULT_GLITCH: GlitchSettings = {
  ...base,
  text: SAMPLE_TEXT.glitch,
  size: 48,
  scaleX: 100,
  tracking: 0,
  leading: 1.2,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  vertical: false,
  valign: 'middle',
  fill: '#ff0033',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: '#ff0033',
  shadowBlur: 8,
  shadowX: 0,
  shadowY: 0,
  fps: 15,
  holdMs: 2000,
  width: 600,
  height: 300,
  charsets: { latin: true, kana: true, hangul: true, shapes: true },
  intensity: 3,
  together: false,
};

export const DEFAULT_CREDITS: CreditsSettings = {
  ...base,
  text: SAMPLE_TEXT.credits,
  size: 32,
  leading: 1.5,
  bold: false,
  fill: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowX: 2,
  shadowY: 2,
  fps: 12,
  width: 720,
  height: 400,
  duration: 20,
  split: false,
  silenceExtra: 0,
};

export const DEFAULT_KARAOKE: KaraokeSettings = {
  ...base,
  text: SAMPLE_TEXT.karaoke,
  size: 48,
  scaleX: 100,
  tracking: 0,
  leading: 1.5,
  bold: true,
  italic: false,
  valign: 'middle',
  strokeWidth: 6,
  shadowColor: '#000000',
  shadowBlur: 6,
  shadowX: 2,
  shadowY: 2,
  fps: 20,
  holdMs: 1500,
  width: 720,
  height: 300,
  duration: 8,
  intro: 0.5,
  alloc: 'chars',
  beforeFill: '#ffffff',
  beforeStroke: '#333333',
  afterFill: '#ffe66d',
  afterStroke: '#ff2e63',
  direction: 'ltr',
  softness: 14,
  glowOn: true,
  glowColor: '#ffffff',
  glowWidth: 26,
  show: 'all',
  rows: 2,
  swapFade: 0.25,
};

export const DEFAULT_DATA: TwData = {
  typing: DEFAULT_TYPING,
  glitch: DEFAULT_GLITCH,
  credits: DEFAULT_CREDITS,
  karaoke: DEFAULT_KARAOKE,
  webp: { lossless: true, quality: 92 },
};

/* ---------- 數值範圍（規格第 2 節，主控裁定採用） ---------- */

export interface Range {
  min: number;
  max: number;
  step: number;
  /** 小數位數 */
  precision?: number;
}

export const RANGES = {
  size: { min: 8, max: 400, step: 1 },
  scaleX: { min: 10, max: 400, step: 1 },
  tracking: { min: -50, max: 200, step: 1, precision: 1 },
  leading: { min: 0.5, max: 5, step: 0.1, precision: 2 },
  strokeWidth: { min: 0, max: 50, step: 1, precision: 1 },
  shadowBlur: { min: 0, max: 100, step: 1, precision: 1 },
  offset: { min: -200, max: 200, step: 1, precision: 1 },
  fps: { min: 1, max: 60, step: 1 },
  holdMs: { min: 0, max: 60000, step: 100 },
  fadeMs: { min: 0, max: 10000, step: 100 },
  canvas: { min: 16, max: 4096, step: 1 },
  shapeSize: { min: 10, max: 2000, step: 1 },
  rotate: { min: -360, max: 360, step: 0.5, precision: 2 },
  intensity: { min: 0, max: 30, step: 1 },
  duration: { min: 0.5, max: 600, step: 0.1, precision: 2 },
  intro: { min: 0, max: 60, step: 0.1, precision: 2 },
  softness: { min: 0, max: 200, step: 1 },
  glowWidth: { min: 0, max: 200, step: 1 },
  rows: { min: 1, max: 20, step: 1 },
  swapFade: { min: 0, max: 5, step: 0.05, precision: 2 },
  quality: { min: 1, max: 100, step: 1 },
  silenceExtra: { min: 0, max: 600, step: 0.1, precision: 2 },
} satisfies Record<string, Range>;

/* ---------- 卡拉 OK 配色預設（本工具自己設計；第一組＝預設顏色） ---------- */

export interface KaraokePalette {
  id: string;
  beforeFill: string;
  beforeStroke: string;
  afterFill: string;
  afterStroke: string;
}

export const KARAOKE_PALETTES: readonly KaraokePalette[] = [
  {
    id: 'classic',
    beforeFill: '#ffffff',
    beforeStroke: '#333333',
    afterFill: '#ffe66d',
    afterStroke: '#ff2e63',
  },
  {
    id: 'ocean',
    beforeFill: '#e8f4ff',
    beforeStroke: '#16324f',
    afterFill: '#5ce1e6',
    afterStroke: '#0b4f8a',
  },
  {
    id: 'sakura',
    beforeFill: '#fff6fa',
    beforeStroke: '#5a2a3d',
    afterFill: '#ff9cc2',
    afterStroke: '#b0124f',
  },
  {
    id: 'forest',
    beforeFill: '#f3f7e9',
    beforeStroke: '#2b3a1f',
    afterFill: '#b6f36b',
    afterStroke: '#2f6b1a',
  },
];

/* ---------- 讀入專案檔：補預設值、夾到範圍 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const HEX = /^#[0-9a-f]{6}$/i;

function pickNumber(v: unknown, fallback: number, r?: Range): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return r ? Math.min(r.max, Math.max(r.min, n)) : n;
}

/** 依預設值的形狀逐欄位檢查：型別不對就用預設值，數字夾到範圍內 */
function normalizeAgainst<T extends object>(
  def: T,
  raw: unknown,
  ranges: Partial<Record<keyof T, Range>>,
): T {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, unknown> = {};
  for (const [k, dv] of Object.entries(def)) {
    const v = src[k];
    const r = (ranges as Record<string, Range | undefined>)[k];
    if (typeof dv === 'number') out[k] = pickNumber(v, dv, r);
    else if (typeof dv === 'boolean') out[k] = typeof v === 'boolean' ? v : dv;
    else if (typeof dv === 'string') {
      if (typeof v !== 'string') out[k] = dv;
      else if (HEX.test(dv)) out[k] = HEX.test(v) ? v.toLowerCase() : dv;
      else out[k] = v;
    } else if (isObj(dv)) out[k] = normalizeAgainst(dv, v, {});
    else out[k] = dv;
  }
  return out as T;
}

const COMMON_RANGES = {
  size: RANGES.size,
  leading: RANGES.leading,
  strokeWidth: RANGES.strokeWidth,
  shadowBlur: RANGES.shadowBlur,
  shadowX: RANGES.offset,
  shadowY: RANGES.offset,
  fps: RANGES.fps,
  width: RANGES.canvas,
  height: RANGES.canvas,
  scaleX: RANGES.scaleX,
  tracking: RANGES.tracking,
  holdMs: RANGES.holdMs,
};

const oneOf = <T extends string>(v: string, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;

function fixCommon<T extends BaseSettings>(s: T): T {
  s.font =
    s.font === CUSTOM_FONT || (FONT_FAMILIES as readonly string[]).includes(s.font)
      ? s.font
      : DEFAULT_FONT;
  s.align = oneOf(s.align, ['left', 'center', 'right'], 'center');
  s.fps = Math.round(s.fps);
  s.width = Math.round(s.width);
  s.height = Math.round(s.height);
  const v = (s as unknown as Partial<StyledSettings>).valign;
  if (v !== undefined)
    (s as unknown as StyledSettings).valign = oneOf(v, ['top', 'middle', 'bottom'], 'middle');
  return s;
}

/** 專案檔的資料 → 完整、合法的設定；不是物件時回傳 null */
export function normalizeData(raw: unknown): TwData | null {
  if (!isObj(raw)) return null;
  const typing = fixCommon(
    normalizeAgainst(DEFAULT_TYPING, raw.typing, {
      ...COMMON_RANGES,
      fadeMs: RANGES.fadeMs,
      shapeSize: RANGES.shapeSize,
      rotate: RANGES.rotate,
    }),
  );
  typing.direction = oneOf(typing.direction, ['forward', 'reverse'], 'forward');
  typing.fade = oneOf(typing.fade, ['none', 'whole', 'each'], 'none');
  typing.shape = oneOf(typing.shape, ['none', 'circle', 'square', 'triangle'], 'none');
  typing.soundMode = oneOf(typing.soundMode, ['each', 'skip'], 'each');
  const glitch = fixCommon(
    normalizeAgainst(DEFAULT_GLITCH, raw.glitch, {
      ...COMMON_RANGES,
      intensity: RANGES.intensity,
    }),
  );
  glitch.intensity = Math.round(glitch.intensity);
  const credits = fixCommon(
    normalizeAgainst(DEFAULT_CREDITS, raw.credits, {
      ...COMMON_RANGES,
      duration: RANGES.duration,
      silenceExtra: RANGES.silenceExtra,
    }),
  );
  const karaoke = fixCommon(
    normalizeAgainst(DEFAULT_KARAOKE, raw.karaoke, {
      ...COMMON_RANGES,
      duration: RANGES.duration,
      intro: RANGES.intro,
      softness: RANGES.softness,
      glowWidth: RANGES.glowWidth,
      rows: RANGES.rows,
      swapFade: RANGES.swapFade,
    }),
  );
  karaoke.alloc = oneOf(karaoke.alloc, ['chars', 'equal'], 'chars');
  karaoke.direction = oneOf(karaoke.direction, ['ltr', 'rtl'], 'ltr');
  karaoke.show = oneOf(karaoke.show, ['all', 'reveal', 'current', 'rotate', 'page'], 'all');
  karaoke.rows = Math.round(karaoke.rows);
  const webp = normalizeAgainst(DEFAULT_DATA.webp, raw.webp, { quality: RANGES.quality });
  return { typing, glitch, credits, karaoke, webp };
}
