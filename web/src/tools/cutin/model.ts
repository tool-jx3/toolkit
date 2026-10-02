/**
 * 切入素材產生器的設定模型（純邏輯，不依賴 React／DOM，單元測試用）：
 * - 設定的型別與預設值、字型清單、尺寸按鈕、文字動態的預設幅度；
 * - 套用範本、恢復範本外觀、「已修改」判定；
 * - 用途切換與「手動改過」、依用途自動調整（規格 F09、3.8）；
 * - 選文字樣式／配色／特效時的連動（背景重設、挖空自動換底、特效預設參數）；
 * - 字數、建議字數、檔名（規格 3.12）。
 */
import {
  EXPORT_TARGETS,
  type ExportTarget,
  nextShrinkStep,
  TARGET_IDS,
  type TargetId,
} from '@/ccfolia';
import { defineFontChoices, type FontChoice, pickFontChoice } from '@/core/fonts';
import { LOOP_FX_DEFAULTS, LOOP_FX_KINDS, LOOP_FX_PARAMS, type LoopFxKind } from '@/core/fxlayers';
import { countGraphemes } from '@/core/typeset';
import { PALETTE_IDS, type PaletteId, STYLE_IDS, type StyleId } from './looks';

export const TOOL_ID = 'cutin';

/* ---------- 字型（規格 3.4） ---------- */

export interface CutinFontData {
  /** 外框粗細倍率（字畫細的加粗、字畫粗的減細） */
  outline: number;
  /** 建議字數 */
  maxChars: number;
  styleClass: 'sans' | 'serif';
}

/** 11 套字型：繁中黑、明、楷＋兩套特色字型，日文粗黑體、圓體、衝擊感標題、手寫感標題、粗明體、點陣 */
export const FONTS: readonly FontChoice<CutinFontData>[] = defineFontChoices<CutinFontData>([
  {
    id: 'noto-sans-tc',
    family: 'Noto Sans TC',
    weight: 900,
    label: '思源黑體（特粗）',
    data: { outline: 1, maxChars: 20, styleClass: 'sans' },
  },
  {
    id: 'noto-serif-tc',
    family: 'Noto Serif TC',
    weight: 900,
    label: '思源宋體（特粗）',
    data: { outline: 1.25, maxChars: 16, styleClass: 'serif' },
  },
  {
    id: 'wenkai',
    family: 'LXGW WenKai TC',
    weight: 700,
    label: '霞鶩文楷（楷書）',
    data: { outline: 1.3, maxChars: 14, styleClass: 'serif' },
  },
  {
    id: 'chocolate',
    family: 'Chocolate Classical Sans',
    weight: 400,
    label: '朱古力黑體',
    data: { outline: 1.2, maxChars: 14, styleClass: 'sans' },
  },
  {
    id: 'cactus',
    family: 'Cactus Classical Serif',
    weight: 400,
    label: '仙人掌明體',
    data: { outline: 1.3, maxChars: 14, styleClass: 'serif' },
  },
  {
    id: 'noto-sans-jp',
    family: 'Noto Sans JP',
    weight: 900,
    label: '日文粗黑體（Noto Sans JP）',
    data: { outline: 1, maxChars: 20, styleClass: 'sans' },
  },
  {
    id: 'mplus-rounded',
    family: 'M PLUS Rounded 1c',
    weight: 800,
    label: '圓體（M PLUS Rounded 1c）',
    data: { outline: 1, maxChars: 20, styleClass: 'sans' },
  },
  {
    id: 'reggae',
    family: 'Reggae One',
    weight: 400,
    label: '衝擊標題（Reggae One）',
    data: { outline: 0.85, maxChars: 12, styleClass: 'sans' },
  },
  {
    id: 'rocknroll',
    family: 'RocknRoll One',
    weight: 400,
    label: '手寫感標題（RocknRoll One）',
    data: { outline: 1.1, maxChars: 16, styleClass: 'sans' },
  },
  {
    id: 'shippori',
    family: 'Shippori Mincho B1',
    weight: 800,
    label: '粗明體（Shippori Mincho B1）',
    data: { outline: 1.25, maxChars: 16, styleClass: 'serif' },
  },
  {
    id: 'dotgothic',
    family: 'DotGothic16',
    weight: 400,
    label: '點陣（DotGothic16）',
    data: { outline: 1.4, maxChars: 12, styleClass: 'sans' },
  },
]);

export const FONT_IDS: readonly string[] = FONTS.map((f) => f.id);

export const fontOf = (id: string): FontChoice<CutinFontData> => pickFontChoice(FONTS, id);

/* ---------- 型別 ---------- */

export type BackgroundKind = 'transparent' | 'solid' | 'rainbow' | 'palette';
export const BACKGROUND_KINDS: readonly BackgroundKind[] = [
  'transparent',
  'solid',
  'rainbow',
  'palette',
];

export type FxChoice = 'none' | LoopFxKind;
export const FX_CHOICES: readonly FxChoice[] = ['none', ...LOOP_FX_KINDS];

export type MotionKind = 'none' | 'pulse' | 'bounce' | 'jitter' | 'rotate' | 'wave';
export const MOTION_KINDS: readonly MotionKind[] = [
  'none',
  'pulse',
  'bounce',
  'jitter',
  'rotate',
  'wave',
];

/** 文字動態的預設幅度（規格 F24） */
export const MOTION_DEFAULTS: Record<MotionKind, number> = {
  none: 0,
  pulse: 0.05,
  bounce: 0.04,
  jitter: 0.02,
  rotate: 1,
  wave: 0.08,
};

export type CutinFormat = 'apng' | 'gif' | 'png';
export const FORMATS: readonly CutinFormat[] = ['apng', 'gif', 'png'];

/** 特效的細調參數（目前特效的；數值、開關、顏色或 'rainbow'） */
export type FxParams = Record<string, number | boolean | string>;

/** 尺寸、格數、fps、格式、GIF 底色是否被使用者手動改過（沒改過的才跟著用途換） */
export interface Touched {
  size: boolean;
  frames: boolean;
  fps: boolean;
  format: boolean;
  gifMatte: boolean;
}

export interface CutinSettings {
  text: string;
  target: TargetId;
  font: string;
  style: StyleId;
  palette: PaletteId;
  /** 文字顏色（進階，F16）：所有填色層換成這個單色；null＝照配色 */
  textColor: string | null;
  /** 外框顏色（進階，F17）：所有外框層換成這個單色；null＝照配色 */
  outlineColor: string | null;
  /** 背景（F18）；palette＝配色的填色（挖空時自動換上） */
  background: BackgroundKind;
  bgColor: string;
  /** 排版微調（F19～F21） */
  textScale: number;
  leading: number;
  tracking: number;
  fx: FxChoice;
  fxParams: FxParams;
  motion: MotionKind;
  motionAmount: number;
  seed: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  /** 內容縮放（F33，0.4～1） */
  contentScale: number;
  /** 色數（F34，0＝無損） */
  colors: number;
  format: CutinFormat;
  /** GIF 底色（null＝不合成） */
  gifMatte: string | null;
  touched: Touched;
  /** 目前範本；null＝自訂（從分享連結或專案檔開啟） */
  templateId: string | null;
  /** 套用範本（或恢復範本外觀）時的外觀；和目前不同就是「已修改」 */
  baseline: string | null;
}

/* ---------- 範圍 ---------- */

export const LIMITS = {
  size: { min: 64, max: 1600, step: 8 },
  frames: { min: 2, max: 60 },
  fps: { min: 5, max: 30 },
  contentScale: { min: 0.4, max: 1, step: 0.02 },
  colors: { min: 0, max: 256, step: 16 },
  seed: { min: 1, max: 99_999 },
  textScale: { min: 0.5, max: 1.2, step: 0.01 },
  leading: { min: 1, max: 1.4, step: 0.01 },
  tracking: { min: -0.1, max: 0.3, step: 0.005 },
  motion: { min: 0, max: 0.2, step: 0.005 },
  rotate: { min: 1, max: 3, step: 1 },
} as const;

export const DEFAULT_BG_COLOR = '#16161d';
export const DEFAULT_SEED = 12_345;

/* ---------- 尺寸按鈕（F28） ---------- */

export interface SizePreset {
  id: 'square' | 'large' | 'wide' | 'light';
  width: number;
  height: number;
  frames: number;
  fps: number;
  contentScale: number;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'square', width: 480, height: 480, frames: 15, fps: 20, contentScale: 1 },
  { id: 'large', width: 600, height: 600, frames: 18, fps: 20, contentScale: 0.72 },
  { id: 'wide', width: 800, height: 450, frames: 15, fps: 20, contentScale: 1 },
  { id: 'light', width: 320, height: 320, frames: 10, fps: 15, contentScale: 1 },
];

/** 按下尺寸按鈕：同時設定尺寸、格數、fps、內容縮放（算手動改過） */
export function applySizePreset(s: CutinSettings, p: SizePreset): CutinSettings {
  return {
    ...s,
    width: p.width,
    height: p.height,
    frames: p.frames,
    fps: p.fps,
    contentScale: p.contentScale,
    touched: { ...s.touched, size: true, frames: true, fps: true },
  };
}

/* ---------- 依用途自動調整（F09、規格 3.8） ---------- */

export interface TargetTuning {
  /** 外框厚度倍率 */
  outline: number;
  /** 放射速度線數量倍率（＝實際顯示大小 ÷ 480） */
  lines: number;
  /** 文字動態幅度倍率（旋轉圈數不縮減） */
  motion: number;
}

export const TARGET_TUNING: Record<TargetId, TargetTuning> = {
  'ccfolia-cutin': { outline: 1, lines: 1, motion: 1 },
  'discord-sticker': { outline: 1.4, lines: 160 / 480, motion: 0.73 },
  'discord-attachment': { outline: 1.1, lines: 400 / 480, motion: 0.93 },
};

export const NO_TUNING: TargetTuning = { outline: 1, lines: 1, motion: 1 };

/** 放射速度線的實際條數：乘上倍率四捨五入，至少 8 條（原本就少於 8 條時不增加） */
export function tunedLineCount(count: number, tuning: TargetTuning): number {
  if (tuning.lines === 1) return count;
  return Math.max(Math.min(8, count), Math.round(count * tuning.lines));
}

/** 實際的動態幅度（旋轉是圈數，照設定） */
export function tunedMotionAmount(
  motion: MotionKind,
  amount: number,
  tuning: TargetTuning,
): number {
  return motion === 'rotate' ? amount : amount * tuning.motion;
}

/* ---------- 特效參數 ---------- */

/** 特效的預設參數（F22：選了換成該特效的預設參數） */
export function fxDefaults(fx: FxChoice): FxParams {
  if (fx === 'none') return {};
  return { ...(LOOP_FX_DEFAULTS[fx] as unknown as FxParams) };
}

/** 整理特效參數：只留這個特效有的欄位，數值夾在範圍內 */
export function sanitizeFxParams(fx: FxChoice, raw: unknown): FxParams {
  if (fx === 'none') return {};
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = fxDefaults(fx);
  for (const p of LOOP_FX_PARAMS[fx]) {
    const v = src[p.key];
    if (v === undefined) continue;
    if (p.kind === 'boolean') {
      if (typeof v === 'boolean') out[p.key] = v;
    } else if (p.kind === 'color') {
      if (typeof v !== 'string') continue;
      const c = v.trim().toLowerCase();
      if (c === 'rainbow' && fx === 'speedLines') out[p.key] = 'rainbow';
      else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) out[p.key] = c;
    } else {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      const x = Math.min(p.max ?? n, Math.max(p.min ?? n, n));
      out[p.key] = p.kind === 'int' ? Math.round(x) : x;
    }
  }
  return out;
}

/* ---------- 範本 ---------- */

export type TemplateCategory = 'coc' | 'general' | 'style';

export interface CutinTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  /** 範例文字 */
  text: string;
  font: string;
  style: StyleId;
  palette: PaletteId;
  /** 背景（不給：透明；挖空時自動用配色的填色） */
  background?: BackgroundKind;
  bgColor?: string;
  fx: FxChoice;
  /** 特效參數（只寫和預設不同的） */
  fxParams?: FxParams;
  motion: MotionKind;
  /** 動態幅度（不給：該動態的預設） */
  motionAmount?: number;
}

/** 外觀（「已修改」的比較對象）：字型、樣式、配色、背景、特效、動態、排版微調、種子 */
export function appearanceKey(s: CutinSettings): string {
  const params = Object.keys(s.fxParams)
    .sort()
    .map((k) => [k, s.fxParams[k]]);
  return JSON.stringify([
    s.font,
    s.style,
    s.palette,
    s.textColor,
    s.outlineColor,
    s.background,
    s.background === 'solid' ? s.bgColor : null,
    s.fx,
    params,
    s.motion,
    s.motion === 'none' ? 0 : s.motionAmount,
    s.textScale,
    s.leading,
    s.tracking,
    s.seed,
  ]);
}

/** 目前外觀和範本（套用或恢復時）不同 */
export function isModified(s: CutinSettings): boolean {
  return s.templateId !== null && s.baseline !== null && s.baseline !== appearanceKey(s);
}

/** 背景的預設：配色的背景（都是透明）；挖空時換成配色的填色 */
export const defaultBackground = (style: StyleId): BackgroundKind =>
  style === 'knockout' ? 'palette' : 'transparent';

/** 範本的外觀（字型、樣式、配色、背景、特效、動態）蓋到設定上 */
function lookFromTemplate(s: CutinSettings, t: CutinTemplate): CutinSettings {
  const background =
    t.background === undefined || (t.background === 'transparent' && t.style === 'knockout')
      ? defaultBackground(t.style)
      : t.background;
  return {
    ...s,
    font: t.font,
    style: t.style,
    palette: t.palette,
    textColor: null,
    outlineColor: null,
    background,
    bgColor: t.bgColor ?? s.bgColor,
    fx: t.fx,
    fxParams: sanitizeFxParams(t.fx, { ...fxDefaults(t.fx), ...(t.fxParams ?? {}) }),
    motion: t.motion,
    motionAmount: t.motionAmount ?? MOTION_DEFAULTS[t.motion],
  };
}

/**
 * 套用範本（F04）：換掉文字、字型、樣式、配色、背景、特效、動態；保留尺寸、格數、fps、種子、內容縮放、色數、
 * 排版微調。尺寸、格數、fps、格式、GIF 底色沒有手動改過的，改成目前用途的預設。
 */
export function applyTemplate(s: CutinSettings, t: CutinTemplate): CutinSettings {
  const next = applyTargetDefaults({ ...lookFromTemplate(s, t), text: t.text, templateId: t.id });
  return { ...next, baseline: appearanceKey(next) };
}

/** 恢復範本外觀（F07）：保留目前的文字、尺寸、格數、fps、種子、排版微調；「已修改」消失 */
export function restoreTemplateLook(s: CutinSettings, t: CutinTemplate): CutinSettings {
  const next = lookFromTemplate(s, t);
  return { ...next, templateId: t.id, baseline: appearanceKey(next) };
}

/* ---------- 用途 ---------- */

/**
 * 依目前用途補上預設值：固定尺寸一律強制；尺寸、格數、fps、格式、GIF 底色只有沒手動改過的才換；
 * 格式不在用途的可用格式內時，不論改過與否都換成第一個。
 */
export function applyTargetDefaults(s: CutinSettings): CutinSettings {
  const t: ExportTarget = EXPORT_TARGETS[s.target];
  const next = { ...s };
  if (t.fixedSize) {
    next.width = t.fixedSize.width;
    next.height = t.fixedSize.height;
  } else if (!s.touched.size) {
    next.width = t.defaultSize.width;
    next.height = t.defaultSize.height;
  }
  if (!s.touched.frames) next.frames = t.defaultFrames;
  if (!s.touched.fps) next.fps = t.defaultFps;
  if (!s.touched.format || !t.formats.includes(s.format)) next.format = t.formats[0];
  if (!s.touched.gifMatte) next.gifMatte = t.gifMatte;
  return next;
}

/** 切換用途（F08） */
export function switchTarget(s: CutinSettings, target: TargetId): CutinSettings {
  return applyTargetDefaults({ ...s, target });
}

export const isTargetId = (v: unknown): v is TargetId => TARGET_IDS.includes(v as TargetId);

/* ---------- 外觀的連動 ---------- */

/** 選文字樣式（F13）：只換加工，配色保留；背景改回配色的預設（挖空時換成配色的填色） */
export function selectStyle(s: CutinSettings, style: StyleId): CutinSettings {
  return { ...s, style, background: defaultBackground(style) };
}

/** 選配色（F14）：換掉所有加工層的顏色（文字、外框顏色的覆寫也還原）；背景同上 */
export function selectPalette(s: CutinSettings, palette: PaletteId): CutinSettings {
  return {
    ...s,
    palette,
    textColor: null,
    outlineColor: null,
    background: defaultBackground(s.style),
  };
}

/** 選特效（F22）：換成該特效的預設參數 */
export function selectFx(s: CutinSettings, fx: FxChoice): CutinSettings {
  return { ...s, fx, fxParams: fxDefaults(fx) };
}

/** 選文字動態（F23）：換到新種類時幅度改成該種類的預設；再選同一種不變 */
export function selectMotion(s: CutinSettings, motion: MotionKind): CutinSettings {
  if (motion === s.motion) return s;
  return { ...s, motion, motionAmount: MOTION_DEFAULTS[motion] };
}

/** 搭配警告（F15） */
export function lookWarnings(s: CutinSettings): ('dark-style' | 'knockout-transparent')[] {
  const out: ('dark-style' | 'knockout-transparent')[] = [];
  if ((s.style === 'neon' || s.style === 'glitch') && s.background === 'transparent')
    out.push('dark-style');
  if (s.style === 'knockout' && s.background === 'transparent') out.push('knockout-transparent');
  return out;
}

/* ---------- 字數（F11） ---------- */

/** 字數：所有行相加、不含換行（以字素計，表情符號算 1） */
export function charCount(text: string): number {
  return countGraphemes(text.replace(/\r\n?/g, '\n').replace(/\n/g, ''));
}

/** 建議字數：用途建議與字型建議兩者較小的那個 */
export function suggestedCharCount(s: Pick<CutinSettings, 'target' | 'font'>): number {
  return Math.min(EXPORT_TARGETS[s.target].suggestedChars, fontOf(s.font).data.maxChars);
}

export const isBlankText = (text: string): boolean => text.trim() === '';

/* ---------- 自動縮小檔案（F46、規格 3.11） ---------- */

/**
 * 自動縮小的下一步：色數（APNG、PNG；無損先改 256）→ 影格數（> 10 時減 3）→ 放射速度線（> 16 時 × 0.7）→
 * 尺寸（不是固定尺寸、短邊 > 240 時 × 0.8）。回傳改好的設定與這次降了什麼；已無可再降時 null。
 */
export function shrinkOnce(
  s: CutinSettings,
  format: CutinFormat,
): { next: CutinSettings; description: string } | null {
  const step = nextShrinkStep(EXPORT_TARGETS[s.target], {
    format,
    colors: s.colors,
    frames: s.frames,
    width: s.width,
    height: s.height,
    lines: s.fx === 'speedLines' ? Number(s.fxParams.count ?? 48) : null,
  });
  if (!step) return null;
  const p = step.patch;
  return {
    description: step.description,
    next: {
      ...s,
      ...(p.colors !== undefined ? { colors: p.colors } : {}),
      ...(p.frames !== undefined ? { frames: p.frames } : {}),
      ...(p.width !== undefined && p.height !== undefined
        ? { width: p.width, height: p.height }
        : {}),
      ...(p.lines != null ? { fxParams: { ...s.fxParams, count: p.lines } } : {}),
    },
  };
}

/* ---------- 影格時間與檔名 ---------- */

/** APNG 每格延遲（毫秒，四捨五入） */
export const apngDelayMs = (fps: number): number => Math.round(1000 / fps);

/** 一個循環的秒數（格數 ÷ fps） */
export const loopSeconds = (s: Pick<CutinSettings, 'frames' | 'fps'>): number => s.frames / s.fps;

/**
 * 檔名主體（規格 3.12）：各行文字以底線相連＋「_寬x高」；文字全空時用 cutin。
 * 特殊字元交給共用的檔名清理（core/files 的 safeFileName）。
 */
export function fileBaseName(s: Pick<CutinSettings, 'text' | 'width' | 'height'>): string {
  const text = s.text.replace(/\r\n?/g, '\n');
  const head = isBlankText(text) ? 'cutin' : text.split('\n').join('_');
  return `${head}_${s.width}x${s.height}`;
}

export const FORMAT_EXT: Record<CutinFormat, string> = { apng: 'png', gif: 'gif', png: 'png' };

/** 寬 × 高 × 格數的上限（分享連結還原時用） */
export const PIXEL_LIMIT = 40_000_000;

/** 樣式與配色的 id 清單（給分享連結與存檔檢查） */
export { PALETTE_IDS, STYLE_IDS };
