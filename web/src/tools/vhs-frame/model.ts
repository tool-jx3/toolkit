/**
 * 錄影帶畫面產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/vhs-frame.md）：
 * 狀態與預設值、整理存檔（含第 1 版的搬移）、畫面與動畫的大小、照片的位置（拖曳、縮放、夾回範圍）、字幕的場景與逐字打出、
 * 時間碼與頻道、日期戳記、動畫的影格（長度、場景、開場、收尾）、檔名。
 * 2026-11-10 的映像管、數位攝影、NTSC 訊號、Screen Loop 的設定在 look.ts。
 *
 * 座標：照片的位置以「畫面」計（寬 1280；4:3 高 960、16:9 高 720），和輸出的大小無關。
 */

import {
  type Crt,
  type Digital,
  defaultLook2611,
  type Loop,
  type Ntsc,
  normalizeLook2611,
} from './look';

/* ---------- 尺寸 ---------- */

export type Aspect = '4:3' | '16:9';
export const ASPECTS: readonly Aspect[] = ['4:3', '16:9'];

export interface Size {
  width: number;
  height: number;
}

/** 畫面的寬（拖曳、方向鍵的距離以這個寬計） */
export const SCREEN_W = 1280;

/** 畫面（PNG、預覽「錄影帶」）的大小 */
export const screenSize = (aspect: Aspect): Size => ({
  width: SCREEN_W,
  height: aspect === '16:9' ? 720 : 960,
});

/** 寬 → 高（4:3 取 3/4、16:9 取 9/16，四捨五入） */
export const heightFor = (width: number, aspect: Aspect): number =>
  Math.round((width * (aspect === '16:9' ? 9 : 3)) / (aspect === '16:9' ? 16 : 4));

/** 單場的掃描線一行一條（2026-11-12）的行數：數位攝影擷取的高（依比例）÷ 2，無條件進位 */
export const fieldScanRows = (s: { digital: { width: number }; aspect: Aspect }): number =>
  Math.ceil(heightFor(s.digital.width, s.aspect) / 2);

/** 動畫的大小：小（原作 360 × 270）、中、大 */
export const ANIM_SIZES: Record<Aspect, readonly Size[]> = {
  '4:3': [
    { width: 360, height: 270 },
    { width: 480, height: 360 },
    { width: 640, height: 480 },
  ],
  '16:9': [
    { width: 480, height: 270 },
    { width: 640, height: 360 },
    { width: 854, height: 480 },
  ],
};
export type AnimSizeIndex = 0 | 1 | 2;
export const animSize = (aspect: Aspect, index: number): Size =>
  ANIM_SIZES[aspect][Math.max(0, Math.min(2, Math.round(index) || 0))];

/** 照片層的合成寬度：動畫至少 720（同原作的預覽），PNG 與預覽「錄影帶」是 1280 */
export const ANIM_MASTER_MIN = 720;
export const masterWidthFor = (outputWidth: number): number =>
  outputWidth >= SCREEN_W ? SCREEN_W : Math.max(ANIM_MASTER_MIN, outputWidth);

/** PNG 的寬（2026-11-05：小、標準〔原作〕、大）；照片層以 PNG 的寬合成 */
export const PNG_WIDTHS: readonly number[] = [640, SCREEN_W, 1920];
export const DEFAULT_PNG_SIZE = 1;
export const pngSize = (aspect: Aspect, index: number): Size => {
  const width = PNG_WIDTHS[Math.max(0, Math.min(2, Math.round(index) || 0))] ?? SCREEN_W;
  return { width, height: heightFor(width, aspect) };
};

/* ---------- 時間 ---------- */

/** 預覽「錄影帶」的一輪（58 秒時追蹤條與亮帶都不在畫面上，接回 0 秒看不出跳動） */
export const TAPE_LOOP = 58;
/** 預覽「錄影帶」每秒幾格（同原作的預覽，約 24 格） */
export const TAPE_FPS = 24;
/** 預覽「錄影帶」的時間 → 這一格的 t（每 1/24 秒一格，0～58 秒） */
export function tapeFrameTime(time: number): number {
  const k = Math.floor(Math.max(0, time) * TAPE_FPS + 1e-6);
  return Math.min(k, TAPE_LOOP * TAPE_FPS - 1) / TAPE_FPS;
}

/** 動畫：24 格、每格 90 ms（GIF 9/100 秒） */
export const GIF_FRAMES = 24;
export const GIF_STEP = 0.09;
export const GIF_DELAY_CS = 9;
export const GIF_DURATION = GIF_FRAMES * GIF_STEP;
/** GIF 的色數（預設同原作 64；2026-11-05 可以選 128、256） */
export const GIF_COLORS = 64;
export const GIF_COLOR_OPTIONS: readonly number[] = [64, 128, 256];
/** 第 f 格的 t（與原作同一個算式：f × 0.09） */
export const gifFrameTime = (f: number): number => f * GIF_STEP;
/** 預覽「GIF 動畫」的時間 → 第幾格（total＝動畫的格數） */
export const gifFrameAt = (time: number, total: number = GIF_FRAMES): number =>
  Math.max(0, Math.min(total - 1, Math.floor(time / GIF_STEP + 1e-6)));

/* ---------- 範圍 ---------- */

/** 字幕欄的字數上限（2026-11-05 從 80 改成 400：可以寫好幾個場景） */
export const CAPTION_MAX = 400;
/** 場景最多幾個（之後的不用）；每個場景最多幾行 */
export const SCENE_MAX = 10;
export const SCENE_LINES = 2;
export const OSD_MAX = 14;
export const WEAR_RANGE = { min: 0, max: 100 } as const;
/** 照片的縮放上限（蓋滿＝1） */
export const ZOOM_MAX = 8;
/** 滾輪：倍率 × e^(−0.0016 × 滾動量 px) */
export const WHEEL_ZOOM = 0.0016;
/** 方向鍵移動的距離（畫面 px）、Shift 時 */
export const KEY_STEP = 30;
export const KEY_STEP_BIG = 90;
/** ＋／－ 的倍率 */
export const KEY_ZOOM = 1.15;

/* ---------- 狀態 ---------- */

/** 資產庫裡的一張圖（原檔） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 照片的位置：縮放（蓋滿畫面＝1）、照片中心相對畫面中心的位移（畫面寬、高為 1） */
export interface PhotoView {
  zoom: number;
  x: number;
  y: number;
}

export const DEFAULT_VIEW: Readonly<PhotoView> = Object.freeze({ zoom: 1, x: 0, y: 0 });

export type OsdFont = 'mono' | 'pixel';
export const OSD_FONTS: readonly OsdFont[] = ['mono', 'pixel'];

/** 右上：播放時間、日期時間、頻道（2026-11-05）、不顯示 */
export type TimecodeMode = 'tape' | 'clock' | 'channel' | 'off';
export const TIMECODE_MODES: readonly TimecodeMode[] = ['tape', 'clock', 'channel', 'off'];

export interface Timecode {
  mode: TimecodeMode;
  /** 播放時間的起點（秒） */
  tape: number;
  /** 日期時間的起點（YYYY-MM-DD HH:MM:SS） */
  clock: string;
}

/* ---------- 2026-11-05 跟進原作加的設定（預設都是加入之前的畫法） ---------- */

/** 字幕的樣子：白字黑邊（原本的）、黃字黑邊、黑底白字 */
export type CaptionLook = 'outline' | 'yellow' | 'box';
export const CAPTION_LOOKS: readonly CaptionLook[] = ['outline', 'yellow', 'box'];
/** 字幕的字型：黑體（原本的）、明體 */
export type CaptionFont = 'sans' | 'serif';
export const CAPTION_FONTS: readonly CaptionFont[] = ['sans', 'serif'];
export type CaptionPosition = 'bottom' | 'top';
export const CAPTION_POSITIONS: readonly CaptionPosition[] = ['bottom', 'top'];

export interface CaptionStyle {
  look: CaptionLook;
  font: CaptionFont;
  /** 字級（%，100＝原本的大小） */
  size: number;
  position: CaptionPosition;
}
export const CAPTION_SIZE_RANGE = { min: 70, max: 140 } as const;

/** 攝影機的日期戳記 */
export type StampFormat = 'en' | 'num';
export const STAMP_FORMATS: readonly StampFormat[] = ['en', 'num'];
export type StampColor = 'orange' | 'white';
export const STAMP_COLORS: readonly StampColor[] = ['orange', 'white'];
export type StampSide = 'left' | 'right';
export const STAMP_SIDES: readonly StampSide[] = ['left', 'right'];

export interface Stamp {
  on: boolean;
  /** 「YYYY-MM-DD HH:MM」或「YYYY-MM-DD」（不顯示時間） */
  value: string;
  format: StampFormat;
  color: StampColor;
  side: StampSide;
}

/** 照片的色調 */
export type Tone = 'vhs' | 'warm' | 'cool' | 'faded' | 'mono' | 'night';
export const TONES: readonly Tone[] = ['vhs', 'warm', 'cool', 'faded', 'mono', 'night'];

export interface Picture {
  tone: Tone;
  /** 亮度、飽和度（%，100＝不調整） */
  brightness: number;
  saturation: number;
  /** 映像管的弧面：中間伸長的千分比（28＝2.8%，原本的） */
  curve: number;
  /** 暗角的深淺（%，72＝原本的） */
  vignette: number;
  /** 圓角（四角透明） */
  corners: boolean;
}
export const BRIGHTNESS_RANGE = { min: 70, max: 130 } as const;
export const SATURATION_RANGE = { min: 30, max: 170 } as const;
export const CURVE_RANGE = { min: 0, max: 60 } as const;
export const VIGNETTE_RANGE = { min: 0, max: 100 } as const;

/** 各種效果的開關（閃爍是新的，預設關） */
export type EffectKey =
  | 'chroma'
  | 'tear'
  | 'dropout'
  | 'tracking'
  | 'noise'
  | 'scan'
  | 'hum'
  | 'flicker';
export const EFFECT_KEYS: readonly EffectKey[] = [
  'chroma',
  'tear',
  'dropout',
  'tracking',
  'noise',
  'scan',
  'hum',
  'flicker',
];
export type Effects = Record<EffectKey, boolean>;

/** 動畫（GIF、APNG、WebP）的演出 */
export interface Anim {
  /** 長度（ANIM_LENGTHS 的第幾個；1＝24 格，原本的） */
  length: number;
  /** 字幕逐字打出 */
  typing: boolean;
  /** 開場：轉台（雜訊 → 畫面上下捲動 → 收訊） */
  intro: boolean;
  /** 收尾：映像管關機（壓扁成一條線 → 一個亮點 → 黑） */
  outro: boolean;
}

export interface VhsState {
  photo: ImageRef | null;
  view: PhotoView;
  /** 照片左右反轉（2026-11-05） */
  flip: boolean;
  /** 字幕：空白行分成好幾個場景，每個場景用前兩行（2026-11-05；之前只用整欄的前兩行） */
  caption: string;
  /** 預覽「錄影帶」與 PNG 用第幾個場景（0 起；超過場景數時用最後一個） */
  scene: number;
  captionStyle: CaptionStyle;
  /** 左上文字（空白＝不顯示） */
  osd: string;
  osdFont: OsdFont;
  /** 左上文字的動態：「●」閃爍、「PAUSE」時畫面下方有暫停的雜訊帶、沒有追蹤條 */
  osdMotion: boolean;
  timecode: Timecode;
  /** 頻道（右上顯示「CH 03」、開場的轉台用） */
  channel: string;
  stamp: Stamp;
  /** 磨損度 0～100 */
  wear: number;
  aspect: Aspect;
  picture: Picture;
  effects: Effects;
  anim: Anim;
  /* ---- 2026-11-10（look.ts；預設全關） ---- */
  /** 映像管：螢光粉遮罩、光暈 */
  crt: Crt;
  /** 數位攝影（類比效果之前的一段） */
  digital: Digital;
  /** NTSC 訊號（ntsc-rs） */
  ntsc: Ntsc;
  /** Screen Loop（攝影機拍電視的畫面隧道） */
  loop: Loop;
}

export const DEFAULT_OSD = '▶ PLAY';
export const DEFAULT_TAPE_START = 14;
export const DEFAULT_CLOCK_START = '2026-10-31 03:14:15';
export const DEFAULT_WEAR = 55;
export const DEFAULT_CHANNEL = '03';
export const DEFAULT_STAMP = '1999-08-14 16:20';

export const defaultCaptionStyle = (): CaptionStyle => ({
  look: 'outline',
  font: 'sans',
  size: 100,
  position: 'bottom',
});
export const defaultStamp = (): Stamp => ({
  on: false,
  value: DEFAULT_STAMP,
  format: 'en',
  color: 'orange',
  side: 'right',
});
export const defaultPicture = (): Picture => ({
  tone: 'vhs',
  brightness: 100,
  saturation: 100,
  curve: 28,
  vignette: 72,
  corners: true,
});
export const defaultEffects = (): Effects => ({
  chroma: true,
  tear: true,
  dropout: true,
  tracking: true,
  noise: true,
  scan: true,
  hum: true,
  flicker: false,
});
export const defaultAnim = (): Anim => ({ length: 1, typing: true, intro: false, outro: false });

export const initialState = (): VhsState => ({
  photo: null,
  view: { ...DEFAULT_VIEW },
  flip: false,
  caption: '',
  scene: 0,
  captionStyle: defaultCaptionStyle(),
  osd: DEFAULT_OSD,
  osdFont: 'mono',
  osdMotion: false,
  timecode: { mode: 'tape', tape: DEFAULT_TAPE_START, clock: DEFAULT_CLOCK_START },
  channel: DEFAULT_CHANNEL,
  stamp: defaultStamp(),
  wear: DEFAULT_WEAR,
  aspect: '4:3',
  picture: defaultPicture(),
  effects: defaultEffects(),
  anim: defaultAnim(),
  ...defaultLook2611(),
});

/** 左上文字的常用按鈕（2026-11-05 加了倒帶、快轉、停止） */
export const OSD_PRESETS: readonly string[] = [
  '▶ PLAY',
  'PAUSE',
  'REC ●',
  'CAM 01',
  '◀◀ REW',
  '▶▶ FF',
  '■ STOP',
];

/** 左上文字裡有沒有「PAUSE」（或「暫停」）：開了動態時畫暫停的雜訊帶 */
export const osdPaused = (osd: string | null): boolean => !!osd && /PAUSE|暫停/i.test(osd);

/* ---------- 文字欄 ---------- */

/** 字串截到 n 個字（以字元計，emoji 算一個） */
export const clipChars = (s: string, n: number): string => Array.from(s).slice(0, n).join('');
/** 字數（以字元計） */
export const charCount = (s: string): number => Array.from(s).length;

/** 左上文字：單行（換行換成空白）、最多 14 字 */
export const tidyOsd = (s: string): string => clipChars(s.replace(/\r?\n|\r/g, ' '), OSD_MAX);

/** 磨損度的描述：0～11、12～31、32～57、58～85、86～100 → 0～4 */
const WEAR_STEPS = [12, 32, 58, 86];
export function wearLevel(v: number): number {
  const i = WEAR_STEPS.findIndex((max) => v < max);
  return i < 0 ? WEAR_STEPS.length : i;
}

/* ---------- 字幕 ---------- */

/**
 * 第 1 版（2026-11-05 之前）的字幕：整欄的前兩行、去掉頭尾空白、拿掉空行。
 * 現在只用在搬移舊的存檔（migrateV1）；畫面上的字幕見 captionScenes。
 */
export function captionLines(text: string): string[] {
  return text
    .split(/\r?\n|\r/)
    .slice(0, 2)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 字幕欄 → 場景（還沒截掉）：空白行（只有空白的行）分開，連續的空白行算一個；每行去掉頭尾空白 */
function rawScenes(text: string): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (!line) {
      cur = null;
      continue;
    }
    if (!cur) {
      cur = [];
      out.push(cur);
    }
    cur.push(line);
  }
  return out;
}

/** 畫面上的字幕：場景（最多 10 個），每個場景用前兩行 */
export const captionScenes = (text: string): string[][] =>
  rawScenes(text)
    .slice(0, SCENE_MAX)
    .map((lines) => lines.slice(0, SCENE_LINES));

/** 字幕欄有不會畫出來的字（提醒用）：某個場景超過兩行、場景超過 10 個 */
export function captionExtra(text: string): { lines: boolean; scenes: boolean } {
  const all = rawScenes(text);
  return {
    lines: all.slice(0, SCENE_MAX).some((l) => l.length > SCENE_LINES),
    scenes: all.length > SCENE_MAX,
  };
}

export const captionHasExtra = (text: string): boolean => {
  const e = captionExtra(text);
  return e.lines || e.scenes;
};

/** 預覽「錄影帶」與 PNG 的字幕：選的場景（超過場景數時用最後一個） */
export function tapeScene(s: Pick<VhsState, 'caption' | 'scene'>): string[] {
  const scenes = captionScenes(s.caption);
  if (!scenes.length) return [];
  return scenes[Math.max(0, Math.min(scenes.length - 1, Math.round(s.scene) || 0))];
}

/** 逐字打出：從第 1 行開始取前 chars 個字（以字元計），取完的行之後不畫 */
export function typedLines(lines: readonly string[], chars: number): string[] {
  let left = chars;
  const out: string[] = [];
  for (const ln of lines) {
    if (left <= 0) break;
    const cs = Array.from(ln);
    out.push(cs.slice(0, left).join(''));
    left -= cs.length;
  }
  return out.filter((s) => s.length > 0);
}

/** GIF 第 f 格打出幾個字（total＝字幕的字數；0 時 null＝不打字） */
export function gifChars(f: number, total: number): number | null {
  if (!total) return null;
  return Math.max(0, Math.min(total, Math.round(((f - 3) / 14) * total)));
}

/* ---------- 時間碼 ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');
const nfkc = (s: string) => s.normalize('NFKC').trim();

/** 播放時間的起點上限（99:59:59） */
export const TAPE_START_MAX = 99 * 3600 + 59 * 60 + 59;

/** 秒 → 「時:分:秒」（時不補零） */
export function formatTape(seconds: number): string {
  const T = Math.max(0, Math.floor(seconds));
  return `${Math.floor(T / 3600)}:${pad2(Math.floor(T / 60) % 60)}:${pad2(T % 60)}`;
}

/**
 * 播放時間的起點：「秒」「分:秒」「時:分:秒」（全形也可以）；不合法時 null。
 * 有冒號時最後一段（秒）0～59；三段時中間（分）0～59、時 0～99；總共最多 99:59:59。
 */
export function parseTapeStart(text: string): number | null {
  const s = nfkc(text);
  if (!/^\d{1,6}(:\d{1,2}){0,2}$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  let total: number;
  if (parts.length === 1) total = parts[0];
  else if (parts.length === 2) {
    if (parts[1] > 59) return null;
    total = parts[0] * 60 + parts[1];
  } else {
    if (parts[1] > 59 || parts[2] > 59 || parts[0] > 99) return null;
    total = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return total <= TAPE_START_MAX ? total : null;
}

/** 日期時間（不考慮時區）：年月日時分秒 */
interface ClockParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function clockParts(text: string): ClockParts | null {
  const m =
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:(?:\s+|T)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(
      nfkc(text),
    );
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi, s] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (y < 1000 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return { y, mo, d, h, mi, s };
}

const formatClockParts = (p: ClockParts): string =>
  `${String(p.y).padStart(4, '0')}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;

/** 日期時間的起點 → 「YYYY-MM-DD HH:MM:SS」；不合法時 null */
export function parseClockStart(text: string): string | null {
  const p = clockParts(text);
  return p ? formatClockParts(p) : null;
}

/** 日期時間的起點加上幾秒（照實際的曆法進位） */
export function addClockSeconds(start: string, seconds: number): string {
  const p = clockParts(start) ?? (clockParts(DEFAULT_CLOCK_START) as ClockParts);
  const date = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s));
  date.setUTCSeconds(date.getUTCSeconds() + Math.floor(seconds));
  return formatClockParts({
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
  });
}

/**
 * 畫面上的時間碼（null＝不顯示）。
 * 播放時間：T＝⌊起點 ＋ t⌋（與原作同一個算式：14 ＋ t）；日期時間：起點 ＋ ⌊t⌋ 秒。
 */
export function timecodeText(tc: Timecode, t: number): string | null {
  if (tc.mode === 'off') return null;
  if (tc.mode === 'clock') return addClockSeconds(tc.clock, t);
  if (tc.mode === 'channel') return null;
  return formatTape(Math.floor(tc.tape + t));
}

/* ---------- 頻道（2026-11-05） ---------- */

export const CHANNEL_MAX = 4;
/** 頻道欄：英數字（轉大寫，全形也可以）、最多 4 個字 */
export const tidyChannel = (s: string): string =>
  Array.from(s.normalize('NFKC').toUpperCase())
    .filter((ch) => (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'Z'))
    .slice(0, CHANNEL_MAX)
    .join('');

/** 畫面上的頻道：數字 →「CH 03」；英文（例：AV）照寫；空白 →「CH --」 */
export function channelText(ch: string): string {
  if (!ch) return 'CH --';
  return /^\d+$/.test(ch) ? `CH ${ch}` : ch;
}

/** 右上的文字：時間碼或頻道（null＝不顯示） */
export function counterText(s: Pick<VhsState, 'timecode' | 'channel'>, t: number): string | null {
  return s.timecode.mode === 'channel' ? channelText(s.channel) : timecodeText(s.timecode, t);
}

/**
 * 開場轉台時顯示的頻道（step 0～2）：1～99 的數字從前兩台轉過來（03 → CH 01、CH 02、CH 03；01 → CH 98、CH 99、CH 01），
 * 位數照使用者寫的（至少 1 位）；其他（英文、0、100 以上）一直是那個頻道。
 */
export function introChannel(ch: string, step: number): string {
  if (/^\d+$/.test(ch)) {
    const n = Number(ch);
    if (n >= 1 && n <= 99) {
      const v = ((((n - 1 - (2 - step)) % 99) + 99) % 99) + 1;
      return `CH ${String(v).padStart(ch.length, '0')}`;
    }
  }
  return channelText(ch);
}

/* ---------- 日期戳記（2026-11-05） ---------- */

interface StampParts {
  y: number;
  mo: number;
  d: number;
  /** 沒寫時間時 null */
  h: number | null;
  mi: number | null;
}

function stampParts(text: string): StampParts | null {
  const m =
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:(?:\s+|T)(\d{1,2}):(\d{1,2})(?::\d{1,2})?)?$/.exec(
      nfkc(text),
    );
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] === undefined ? null : Number(m[4]);
  const mi = m[5] === undefined ? null : Number(m[5]);
  if (y < 1000 || (h !== null && h > 23) || (mi !== null && mi > 59)) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return { y, mo, d, h, mi };
}

/**
 * 日期戳記：「年-月-日 時:分」或「年-月-日」（「/」「.」也可以當日期的分隔、秒可以寫但不用、全形也可以；日期要真的存在）
 * → 「YYYY-MM-DD HH:MM」「YYYY-MM-DD」；不合法時 null。
 */
export function parseStamp(text: string): string | null {
  const p = stampParts(text);
  if (!p) return null;
  const date = `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
  return p.h === null || p.mi === null ? date : `${date} ${pad2(p.h)}:${pad2(p.mi)}`;
}

const MONTHS = [
  'JAN.',
  'FEB.',
  'MAR.',
  'APR.',
  'MAY',
  'JUN.',
  'JUL.',
  'AUG.',
  'SEP.',
  'OCT.',
  'NOV.',
  'DEC.',
];

/**
 * 日期戳記的文字（上面一行時間、下面一行日期；沒寫時間時只有日期）：
 * 英文「PM 4:20」「AUG. 14 1999」；數字「16:20」「1999.08.14」。
 */
export function stampLines(value: string, format: StampFormat): string[] {
  const p = stampParts(value) ?? (stampParts(DEFAULT_STAMP) as StampParts);
  const out: string[] = [];
  if (p.h !== null && p.mi !== null)
    out.push(
      format === 'en'
        ? `${p.h < 12 ? 'AM' : 'PM'} ${p.h % 12 || 12}:${pad2(p.mi)}`
        : `${pad2(p.h)}:${pad2(p.mi)}`,
    );
  out.push(
    format === 'en' ? `${MONTHS[p.mo - 1]} ${p.d} ${p.y}` : `${p.y}.${pad2(p.mo)}.${pad2(p.d)}`,
  );
  return out;
}

/* ---------- 一格的文字 ---------- */

export interface FrameText {
  /** 這一格要畫的字幕（逐字打出時是打到的部分） */
  caption: string[];
  /** 完整的字幕（決定字級） */
  captionFull: string[];
  /** 左上文字（去掉頭尾空白；空的＝null） */
  osd: string | null;
  timecode: string | null;
}

/**
 * 某個時間的文字：預覽「錄影帶」與 PNG 用選的場景；給 gifFrame 時是動畫的第幾格（場景依序換、逐字打出，F46、F61；
 * 開場的那幾格沒有字幕、左上文字與右上）。
 */
export function frameText(s: VhsState, t: number, gifFrame?: number): FrameText {
  if (gifFrame === undefined) {
    const full = tapeScene(s);
    return {
      caption: full,
      captionFull: full,
      osd: s.osd.trim() || null,
      timecode: counterText(s, t),
    };
  }
  return animText(s, animFrameInfo(s, animPlan(s), gifFrame), t);
}

/** 動畫的一格的文字 */
export function animText(s: VhsState, info: AnimFrameInfo, t: number): FrameText {
  return {
    caption: info.caption,
    captionFull: info.captionFull,
    osd: info.intro ? null : s.osd.trim() || null,
    timecode: info.intro ? null : counterText(s, t),
  };
}

/* ---------- 動畫的影格（2026-11-05：長度、場景、開場、收尾） ---------- */

/** 動畫的長度（格數；每格 0.09 秒）：約 1.2、2.2（原本的 24 格）、3.5、5 秒 */
export const ANIM_LENGTHS: readonly number[] = [13, GIF_FRAMES, 39, 56];
/** 開場（轉台）、收尾（關機）的格數 */
export const INTRO_FRAMES = 18;
export const OUTRO_FRAMES = 8;
/** 有兩個以上的場景時，每個場景至少幾格 */
export const SCENE_MIN_FRAMES = 16;
/** 逐字打出：每個場景的第 3 格之後開始，打完要那個場景的 14/24（24 格的場景＝原本的 round((f − 3) ÷ 14 × N)） */
const TYPE_DELAY = 3;
const TYPE_SPAN = 14;

export interface AnimPlan {
  scenes: string[][];
  /** 開場、場景（全部）、收尾的格數 */
  intro: number;
  main: number;
  outro: number;
  total: number;
  /** 每個場景幾格（可以有小數） */
  per: number;
}

export const animLengthFrames = (index: number): number =>
  ANIM_LENGTHS[Math.max(0, Math.min(ANIM_LENGTHS.length - 1, Math.round(index) || 0))];

/**
 * 動畫的安排：開場 → 場景（平均分；兩個以上的場景時每個至少 16 格）→ 收尾。
 * 沒有開場、收尾、只有一個場景、長度 24 格時＝原本的 24 格。
 */
export function animPlan(s: Pick<VhsState, 'caption' | 'anim'>): AnimPlan {
  const scenes = captionScenes(s.caption);
  const n = Math.max(1, scenes.length);
  const len = animLengthFrames(s.anim.length);
  const main = n > 1 ? Math.max(len, n * SCENE_MIN_FRAMES) : len;
  const intro = s.anim.intro ? INTRO_FRAMES : 0;
  const outro = s.anim.outro ? OUTRO_FRAMES : 0;
  return { scenes, intro, main, outro, total: intro + main + outro, per: main / n };
}

/** 開場（轉台）的一格（q＝0～1，第幾格 ÷ 開場的格數） */
export interface IntroFrame {
  /** 滿畫面的雪花雜訊（0～1） */
  snow: number;
  /** 畫面往下捲（畫面高的倍數；0＝不捲）、左右抖（0～1） */
  roll: number;
  rollJitter: number;
  /** 收到訊號的那一下變亮（0～0.26） */
  flash: number;
  /** 收訊格（0～1，8 格亮幾格） */
  tune: number;
  /** 頻道字的不透明度 */
  channelAlpha: number;
  channel: string;
}

/**
 * 開場的時間表（q＝0～1；數值照原作）：每一項從 from 開始、經過 span 完成。
 * 雪花滿到 0.38、0.75 時消失；捲動在 0.3～0.86 從 1.4 個畫面高慢下來停住；0.78 起閃一下（最亮 0.26）；
 * 收訊格到 0.72 全亮；頻道字 0.8 起淡到 15%；頻道每 0.42 ÷ 3 轉一台、共 3 台。
 */
const INTRO_TIMING = {
  snow: { from: 0.38, span: 0.37, until: 0.75 },
  roll: { from: 0.3, span: 0.56, until: 0.86, turns: 1.4 },
  flash: { from: 0.78, span: 0.22, peak: 0.26 },
  tune: { span: 0.72 },
  fade: { from: 0.8, span: 0.2, depth: 0.85 },
  dial: { span: 0.42, stops: 3 },
} as const;

/** 進度 q 在 [from, from ＋ span] 裡的比例（不夾範圍） */
const within = (q: number, from: number, span: number) => (q - from) / span;
/** 平滑的 S 形（3u² − 2u³）與三次的慢出 */
const sCurve = (u: number) => u * u * (3 - 2 * u);
const slowOut = (u: number) => 1 - (1 - u) ** 3;

export function introFrame(q: number, channel: string): IntroFrame {
  const T = INTRO_TIMING;
  /* 捲動：還在捲的時候，剩下的量＝1 − 慢出的進度 */
  const rolling = q >= T.roll.from && q < T.roll.until;
  const left = rolling ? 1 - slowOut(within(q, T.roll.from, T.roll.span)) : 0;
  let snow = 0;
  if (q < T.snow.from) snow = 1;
  else if (q < T.snow.until) snow = 1 - sCurve(within(q, T.snow.from, T.snow.span));
  const dialStep = Math.min(T.dial.stops - 1, Math.floor((q / T.dial.span) * T.dial.stops));
  return {
    snow,
    roll: left * T.roll.turns,
    rollJitter: left,
    flash:
      q >= T.flash.from
        ? Math.sin(within(q, T.flash.from, T.flash.span) * Math.PI) * T.flash.peak
        : 0,
    tune: Math.min(1, q / T.tune.span),
    channelAlpha: q < T.fade.from ? 1 : 1 - within(q, T.fade.from, T.fade.span) * T.fade.depth,
    channel: introChannel(channel, dialStep),
  };
}

export interface AnimFrameInfo {
  /** 第幾個場景 */
  scene: number;
  caption: string[];
  captionFull: string[];
  /** 開場的一格（不是開場時 null） */
  intro: IntroFrame | null;
  /** 收尾：關機進行到哪裡（0～1；不是收尾時 null） */
  off: number | null;
}

/** 動畫的第 f 格：開場、第幾個場景（逐字打出到第幾個字）、收尾 */
export function animFrameInfo(
  s: Pick<VhsState, 'caption' | 'anim' | 'channel'>,
  plan: AnimPlan,
  f: number,
): AnimFrameInfo {
  if (f < plan.intro)
    return {
      scene: 0,
      caption: [],
      captionFull: [],
      intro: introFrame(f / plan.intro, s.channel),
      off: null,
    };
  const count = Math.max(1, plan.scenes.length);
  /* 場景部分的第幾格（收尾的那幾格停在最後一格）→ 第幾個場景、場景裡的第幾格 */
  const pos = Math.min(f - plan.intro, plan.main - 1);
  const scene = Math.min(count - 1, Math.floor(pos / plan.per));
  const inScene = pos - scene * plan.per;
  const full = plan.scenes[scene] ?? [];
  const letters = full.reduce((k, l) => k + charCount(l), 0);
  const afterMain = f - plan.intro - plan.main;
  const off = afterMain >= 0 ? (afterMain + 1) / plan.outro : null;
  let shown: number | null = null;
  if (s.anim.typing && letters && off === null) {
    const typeFrames = (plan.per * TYPE_SPAN) / GIF_FRAMES;
    shown = Math.round(((inScene - TYPE_DELAY) / typeFrames) * letters);
    shown = Math.max(0, Math.min(letters, shown));
  }
  return {
    scene,
    caption: shown === null ? full : typedLines(full, shown),
    captionFull: full,
    intro: null,
    off,
  };
}

/* ---------- 照片的位置 ---------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 蓋滿畫面的縮放（畫面 px ÷ 照片 px） */
export const coverScale = (img: Size, box: Size): number =>
  Math.max(box.width / img.width, box.height / img.height);

/** 縮放的下限：整張照片放得進畫面（以蓋滿為 1；比例和畫面相同時是 1） */
export const minZoom = (img: Size, box: Size): number =>
  Math.min(box.width / img.width, box.height / img.height) / coverScale(img, box);

/** 照片在畫面上的範圍（畫面 px） */
export function viewRect(img: Size, box: Size, v: PhotoView): Rect {
  const s = coverScale(img, box) * v.zoom;
  const width = img.width * s;
  const height = img.height * s;
  return {
    x: box.width / 2 + v.x * box.width - width / 2,
    y: box.height / 2 + v.y * box.height - height / 2,
    width,
    height,
  };
}

/** 畫面上的範圍 → 位置 */
function viewOfRect(img: Size, box: Size, r: Rect): PhotoView {
  const s = r.width / img.width;
  return {
    zoom: s / coverScale(img, box),
    x: (r.x + r.width / 2 - box.width / 2) / box.width,
    y: (r.y + r.height / 2 - box.height / 2) / box.height,
  };
}

const finite = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * 夾回範圍（F10）：縮放在「整張放入」～8 倍；照片比畫面大的那一邊不露出黑底，比畫面小的那一邊置中。
 */
export function clampView(img: Size, box: Size, v: PhotoView): PhotoView {
  const lo = minZoom(img, box);
  const zoom = Math.min(ZOOM_MAX, Math.max(lo, finite(v.zoom, 1)));
  const r = viewRect(img, box, { zoom, x: finite(v.x, 0), y: finite(v.y, 0) });
  const axis = (pos: number, size: number, len: number) =>
    size >= len - 1e-9 ? Math.min(0, Math.max(len - size, pos)) : (len - size) / 2;
  const x = axis(r.x, r.width, box.width);
  const y = axis(r.y, r.height, box.height);
  const out = viewOfRect(img, box, { ...r, x, y });
  return { zoom, x: out.x, y: out.y };
}

/** 從某個位置移動（畫面 px），再夾回範圍 */
export function panView(img: Size, box: Size, from: PhotoView, dx: number, dy: number): PhotoView {
  return clampView(img, box, {
    zoom: from.zoom,
    x: from.x + dx / box.width,
    y: from.y + dy / box.height,
  });
}

/** 以畫面上的一點（畫面 px）為中心縮放 factor 倍：那一點下的照片位置不動（同原作），再夾回範圍 */
export function zoomViewAt(
  img: Size,
  box: Size,
  v: PhotoView,
  px: number,
  py: number,
  factor: number,
): PhotoView {
  const r = viewRect(img, box, v);
  const s0 = r.width / img.width;
  const ix = (px - r.x) / s0;
  const iy = (py - r.y) / s0;
  const lo = minZoom(img, box);
  const zoom = Math.min(ZOOM_MAX, Math.max(lo, v.zoom * factor));
  const s1 = coverScale(img, box) * zoom;
  const next = viewOfRect(img, box, {
    x: px - ix * s1,
    y: py - iy * s1,
    width: img.width * s1,
    height: img.height * s1,
  });
  return clampView(img, box, next);
}

/** 縮放到指定的倍率（以畫面中心） */
export const zoomViewTo = (img: Size, box: Size, v: PhotoView, zoom: number): PhotoView =>
  zoomViewAt(img, box, v, box.width / 2, box.height / 2, zoom / (v.zoom || 1));

/** 滾輪的滾動量（px）：以行、頁計的換成 px */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/* ---------- 檔名 ---------- */

export type ExportFormat = 'png' | 'gif' | 'apng' | 'webp';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'gif', 'apng', 'webp'];

/** 檔名的主體：照片檔名去掉最後一個副檔名；沒有照片（或檔名是空的）時 screen */
export function fileBase(photoName: string | null | undefined): string {
  const name = (photoName ?? '').replace(/\.[^.]+$/, '');
  return name || 'screen';
}

const SUFFIX: Record<ExportFormat, string> = {
  png: '-vhs.png',
  gif: '-vhs.gif',
  apng: '-vhs-anim.png',
  webp: '-vhs.webp',
};

export const exportFileName = (photoName: string | null | undefined, format: ExportFormat) =>
  `${fileBase(photoName)}${SUFFIX[format]}`;

/* ---------- 整理存檔 ---------- */

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function normalizeImage(v: unknown): ImageRef | null {
  const o = obj(v);
  if (typeof o.id !== 'string' || !o.id) return null;
  const width = num(o.width, 0, 0, 1e6);
  const height = num(o.height, 0, 0, 1e6);
  if (!(width > 0 && height > 0)) return null;
  return { id: o.id, name: str(o.name).slice(0, 255), width, height };
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const int = (v: unknown, fallback: number, min: number, max: number): number =>
  Math.round(num(v, fallback, min, max));

/**
 * 第 1 版（2026-11-05 之前）的存檔、專案檔：字幕只用整欄的前兩行。照新的規則（場景）畫出來不一樣的
 * （前兩行裡有空白行、或空白行之後還有字），改寫成以前畫出來的那兩行，畫面和以前相同；其他照舊。
 */
export function migrateV1(raw: unknown): unknown {
  const o = obj(raw);
  if (typeof o.caption !== 'string') return raw;
  const old = captionLines(o.caption);
  const scenes = captionScenes(o.caption);
  const same = old.length
    ? scenes.length === 1 &&
      scenes[0].length === old.length &&
      scenes[0].every((l, i) => l === old[i])
    : scenes.length === 0;
  return same ? raw : { ...o, caption: old.join('\n') };
}

/** 存檔、專案檔讀回來的資料整理成合法的狀態（不認得的換成預設、數值夾在範圍內） */
export function normalizeState(raw: unknown): VhsState {
  const d = initialState();
  const o = obj(raw);
  const aspect = ASPECTS.includes(o.aspect as Aspect) ? (o.aspect as Aspect) : d.aspect;
  const photo = normalizeImage(o.photo);
  const vo = obj(o.view);
  const rawView: PhotoView = {
    zoom: num(vo.zoom, 1, 0.001, ZOOM_MAX),
    x: num(vo.x, 0, -10, 10),
    y: num(vo.y, 0, -10, 10),
  };
  const tc = obj(o.timecode);
  /* 起點：0～99:59:59 的數字（小數捨去）；其他（負數、太大、不是數字）用預設 0:00:14 */
  const tapeStart =
    typeof tc.tape === 'number' &&
    Number.isFinite(tc.tape) &&
    tc.tape >= 0 &&
    tc.tape < TAPE_START_MAX + 1
      ? Math.floor(tc.tape)
      : d.timecode.tape;
  const cs = obj(o.captionStyle);
  const st = obj(o.stamp);
  const pic = obj(o.picture);
  const fx = obj(o.effects);
  const an = obj(o.anim);
  const effects = defaultEffects();
  for (const k of EFFECT_KEYS) effects[k] = bool(fx[k], effects[k]);
  return {
    photo,
    view: photo ? clampView(photo, screenSize(aspect), rawView) : { ...DEFAULT_VIEW },
    flip: o.flip === true,
    caption: clipChars(str(o.caption), CAPTION_MAX),
    scene: int(o.scene, 0, 0, SCENE_MAX - 1),
    captionStyle: {
      look: pick(cs.look, CAPTION_LOOKS, d.captionStyle.look),
      font: pick(cs.font, CAPTION_FONTS, d.captionStyle.font),
      size: int(cs.size, d.captionStyle.size, CAPTION_SIZE_RANGE.min, CAPTION_SIZE_RANGE.max),
      position: pick(cs.position, CAPTION_POSITIONS, d.captionStyle.position),
    },
    osd: typeof o.osd === 'string' ? tidyOsd(o.osd) : d.osd,
    osdFont: OSD_FONTS.includes(o.osdFont as OsdFont) ? (o.osdFont as OsdFont) : d.osdFont,
    osdMotion: o.osdMotion === true,
    timecode: {
      mode: TIMECODE_MODES.includes(tc.mode as TimecodeMode)
        ? (tc.mode as TimecodeMode)
        : d.timecode.mode,
      tape: tapeStart,
      clock: parseClockStart(str(tc.clock)) ?? d.timecode.clock,
    },
    channel: typeof o.channel === 'string' ? tidyChannel(o.channel) : d.channel,
    stamp: {
      on: st.on === true,
      value: parseStamp(str(st.value)) ?? d.stamp.value,
      format: pick(st.format, STAMP_FORMATS, d.stamp.format),
      color: pick(st.color, STAMP_COLORS, d.stamp.color),
      side: pick(st.side, STAMP_SIDES, d.stamp.side),
    },
    wear: Math.round(num(o.wear, d.wear, WEAR_RANGE.min, WEAR_RANGE.max)),
    aspect,
    picture: {
      tone: pick(pic.tone, TONES, d.picture.tone),
      brightness: int(pic.brightness, 100, BRIGHTNESS_RANGE.min, BRIGHTNESS_RANGE.max),
      saturation: int(pic.saturation, 100, SATURATION_RANGE.min, SATURATION_RANGE.max),
      curve: int(pic.curve, d.picture.curve, CURVE_RANGE.min, CURVE_RANGE.max),
      vignette: int(pic.vignette, d.picture.vignette, VIGNETTE_RANGE.min, VIGNETTE_RANGE.max),
      corners: bool(pic.corners, true),
    },
    effects,
    anim: {
      length: int(an.length, d.anim.length, 0, ANIM_LENGTHS.length - 1),
      typing: bool(an.typing, true),
      intro: an.intro === true,
      outro: an.outro === true,
    },
    ...normalizeLook2611(o),
  };
}

/** 一份狀態用到的圖（資產 id） */
export const stateAssetIds = (s: VhsState): string[] => (s.photo ? [s.photo.id] : []);
