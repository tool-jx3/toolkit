/**
 * 預設設定、存檔／專案檔的整理，以及分享連結（規格 F61、F62、3.13）。
 * 網址與存檔都是任何人都能改的輸入：讀回時一律整理（數值夾在範圍內、未知代號換成第一個）。
 */
import { TARGET_IDS } from '@/ccfolia';
import { readShareHash, type Schema, sh } from '@/core/share';
import { PALETTE_IDS, STYLE_IDS } from './looks';
import {
  applyTemplate,
  BACKGROUND_KINDS,
  type CutinSettings,
  DEFAULT_BG_COLOR,
  DEFAULT_SEED,
  FONT_IDS,
  FORMATS,
  FX_CHOICES,
  MOTION_KINDS,
  PIXEL_LIMIT,
  sanitizeFxParams,
} from './model';
import { TEMPLATES } from './templates';

/** 套用範本前的基本值（用途 CCFOLIA、480 × 480、15 格、20 fps、256 色、種子 12,345） */
const BASE: CutinSettings = {
  text: '',
  target: 'ccfolia-cutin',
  font: FONT_IDS[0],
  style: 'double',
  palette: 'rainbow-gold',
  textColor: null,
  outlineColor: null,
  background: 'transparent',
  bgColor: DEFAULT_BG_COLOR,
  textScale: 1,
  leading: 1.1,
  tracking: 0.02,
  fx: 'none',
  fxParams: {},
  motion: 'none',
  motionAmount: 0,
  seed: DEFAULT_SEED,
  width: 480,
  height: 480,
  frames: 15,
  fps: 20,
  contentScale: 1,
  colors: 256,
  format: 'apng',
  gifMatte: null,
  touched: { size: false, frames: false, fps: false, format: false, gifMatte: false },
  templateId: null,
  baseline: null,
};

/** 預設＝第一個範本套用後的樣子 */
export const DEFAULT_SETTINGS: CutinSettings = applyTemplate(BASE, TEMPLATES[0]);

/* ---------- 範圍檢查 ---------- */

/** 分享連結還原時的範圍（規格 3.13） */
const SHARE_RANGE = {
  size: { min: 64, max: 1600 },
  frames: { min: 2, max: 60 },
  fps: { min: 5, max: 30 },
  seed: { min: 1, max: 99_999 },
  contentScale: { min: 0.4, max: 1 },
  textScale: { min: 0.3, max: 1.5 },
  leading: { min: 0.8, max: 2 },
  tracking: { min: -0.3, max: 0.5 },
  motion: { min: 0, max: 3 },
  colors: { min: 0, max: 256 },
} as const;

/** 文字：最多 8 行、每行 100 字 */
export const TEXT_LIMIT = { lines: 8, perLine: 100 } as const;

const n = (r: { min: number; max: number }, def: number, int = false) =>
  sh.number({ min: r.min, max: r.max, default: def, int });

/** 分享內容（短鍵名，網址比較短） */
const shareSchema = sh.object({
  x: sh.string({ default: '', maxLines: TEXT_LIMIT.lines }),
  u: sh.oneOf(TARGET_IDS),
  f: sh.oneOf(FONT_IDS),
  st: sh.oneOf(STYLE_IDS),
  pl: sh.oneOf(PALETTE_IDS),
  tc: sh.nullable(sh.color('#ffffff')),
  oc: sh.nullable(sh.color('#000000')),
  bg: sh.oneOf(BACKGROUND_KINDS, 'transparent'),
  bc: sh.color(DEFAULT_BG_COLOR),
  ts: n(SHARE_RANGE.textScale, 1),
  ld: n(SHARE_RANGE.leading, 1.1),
  tr: n(SHARE_RANGE.tracking, 0.02),
  fx: sh.oneOf(FX_CHOICES),
  fp: { fallback: {}, parse: (v: unknown) => v } as Schema<unknown>,
  mo: sh.oneOf(MOTION_KINDS),
  ma: n(SHARE_RANGE.motion, 0),
  sd: n(SHARE_RANGE.seed, DEFAULT_SEED, true),
  w: n(SHARE_RANGE.size, 480, true),
  h: n(SHARE_RANGE.size, 480, true),
  fr: n(SHARE_RANGE.frames, 15, true),
  fps: n(SHARE_RANGE.fps, 20, true),
  cs: n(SHARE_RANGE.contentScale, 1),
  co: n(SHARE_RANGE.colors, 256, true),
  fm: sh.oneOf(FORMATS),
  gm: sh.nullable(sh.color('#313338')),
});

type ShareData = ReturnType<typeof shareSchema.parse>;

/** 每行最多 100 字（碼位） */
function limitText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .slice(0, TEXT_LIMIT.lines)
    .map((l) => Array.from(l).slice(0, TEXT_LIMIT.perLine).join(''))
    .join('\n');
}

/** 寬 × 高 × 格數不超過約 4,000 萬像素 */
function limitFrames(width: number, height: number, frames: number): number {
  const max = Math.floor(PIXEL_LIMIT / Math.max(1, width * height));
  return Math.max(2, Math.min(frames, max));
}

function toShare(s: CutinSettings): ShareData {
  return {
    x: s.text,
    u: s.target,
    f: s.font,
    st: s.style,
    pl: s.palette,
    tc: s.textColor,
    oc: s.outlineColor,
    bg: s.background,
    bc: s.bgColor,
    ts: s.textScale,
    ld: s.leading,
    tr: s.tracking,
    fx: s.fx,
    fp: s.fxParams,
    mo: s.motion,
    ma: s.motionAmount,
    sd: s.seed,
    w: s.width,
    h: s.height,
    fr: s.frames,
    fps: s.fps,
    cs: s.contentScale,
    co: s.colors,
    fm: s.format,
    gm: s.gifMatte,
  };
}

/** 整理過的分享內容 → 設定（範本＝自訂；尺寸、格數、fps、格式、GIF 底色都算手動改過） */
function fromShare(d: ShareData, { limitPixels = true } = {}): CutinSettings {
  const motionAmount =
    d.mo === 'rotate'
      ? Math.min(3, Math.max(1, Math.round(d.ma)))
      : Math.min(SHARE_RANGE.motion.max, d.ma);
  return {
    text: limitText(d.x),
    target: d.u,
    font: d.f,
    style: d.st,
    palette: d.pl,
    textColor: d.tc,
    outlineColor: d.oc,
    background: d.bg,
    bgColor: d.bc,
    textScale: d.ts,
    leading: d.ld,
    tracking: d.tr,
    fx: d.fx,
    fxParams: sanitizeFxParams(d.fx, d.fp),
    motion: d.mo,
    motionAmount: d.mo === 'none' ? 0 : motionAmount,
    seed: d.sd,
    width: d.w,
    height: d.h,
    frames: limitPixels ? limitFrames(d.w, d.h, d.fr) : d.fr,
    fps: d.fps,
    contentScale: d.cs,
    colors: d.co,
    format: d.fm,
    gifMatte: d.gm,
    touched: { size: true, frames: true, fps: true, format: true, gifMatte: true },
    templateId: null,
    baseline: null,
  };
}

export const SHARE_VERSION = 1;
export const SHARE_MAX_LENGTH = 8000;

/** 設定 → 分享用的資料（放進網址 # 後面） */
export const shareData = (s: CutinSettings): ShareData => toShare(s);

/** 網址的 # → 設定（沒有、損壞、版本不符、過長時 null） */
export function settingsFromHash(hash: string): CutinSettings | null {
  const raw = readShareHash(hash, { version: SHARE_VERSION, maxLength: SHARE_MAX_LENGTH });
  if (raw === null || typeof raw !== 'object') return null;
  return fromShare(shareSchema.parse(raw));
}

/* ---------- 存檔、專案檔 ---------- */

/**
 * 存檔或專案檔的內容 → 合法的設定。結構和分享連結一樣整理，另外保留範本、基準外觀與「手動改過」。
 */
export function normalizeSettings(raw: unknown): CutinSettings {
  const src = raw && typeof raw === 'object' ? (raw as Partial<CutinSettings>) : {};
  const merged = { ...DEFAULT_SETTINGS, ...src };
  /* 自己的存檔不套像素上限（介面上允許、只在檢查清單警告） */
  const base = fromShare(shareSchema.parse(toShare(merged as CutinSettings)), {
    limitPixels: false,
  });
  const t = src.touched && typeof src.touched === 'object' ? src.touched : DEFAULT_SETTINGS.touched;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const templateId =
    typeof src.templateId === 'string' && TEMPLATES.some((x) => x.id === src.templateId)
      ? src.templateId
      : src.templateId === null
        ? null
        : DEFAULT_SETTINGS.templateId;
  return {
    ...base,
    touched: {
      size: bool(t.size, false),
      frames: bool(t.frames, false),
      fps: bool(t.fps, false),
      format: bool(t.format, false),
      gifMatte: bool(t.gifMatte, false),
    },
    templateId,
    baseline: !templateId
      ? null
      : typeof src.baseline === 'string'
        ? src.baseline
        : src.templateId === undefined
          ? DEFAULT_SETTINGS.baseline
          : null,
  };
}
