/**
 * 錄影帶畫面產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/vhs-frame.md）：
 * 狀態與預設值、整理存檔、畫面與動畫的大小、照片的位置（拖曳、縮放、夾回範圍）、字幕與逐字打出、時間碼、GIF 的影格、檔名。
 *
 * 座標：照片的位置以「畫面」計（寬 1280；4:3 高 960、16:9 高 720），和輸出的大小無關。
 */

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
/** GIF 的色數（同原作） */
export const GIF_COLORS = 64;
/** 第 f 格的 t（與原作同一個算式：f × 0.09） */
export const gifFrameTime = (f: number): number => f * GIF_STEP;
/** 預覽「GIF 動畫」的時間 → 第幾格 */
export const gifFrameAt = (time: number): number =>
  Math.max(0, Math.min(GIF_FRAMES - 1, Math.floor(time / GIF_STEP + 1e-6)));

/* ---------- 範圍 ---------- */

export const CAPTION_MAX = 80;
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

export type TimecodeMode = 'tape' | 'clock' | 'off';
export const TIMECODE_MODES: readonly TimecodeMode[] = ['tape', 'clock', 'off'];

export interface Timecode {
  mode: TimecodeMode;
  /** 播放時間的起點（秒） */
  tape: number;
  /** 日期時間的起點（YYYY-MM-DD HH:MM:SS） */
  clock: string;
}

export interface VhsState {
  photo: ImageRef | null;
  view: PhotoView;
  /** 字幕（只用前兩行） */
  caption: string;
  /** 左上文字（空白＝不顯示） */
  osd: string;
  osdFont: OsdFont;
  timecode: Timecode;
  /** 磨損度 0～100 */
  wear: number;
  aspect: Aspect;
}

export const DEFAULT_OSD = '▶ PLAY';
export const DEFAULT_TAPE_START = 14;
export const DEFAULT_CLOCK_START = '2026-10-31 03:14:15';
export const DEFAULT_WEAR = 55;

export const initialState = (): VhsState => ({
  photo: null,
  view: { ...DEFAULT_VIEW },
  caption: '',
  osd: DEFAULT_OSD,
  osdFont: 'mono',
  timecode: { mode: 'tape', tape: DEFAULT_TAPE_START, clock: DEFAULT_CLOCK_START },
  wear: DEFAULT_WEAR,
  aspect: '4:3',
});

/** 左上文字的常用按鈕 */
export const OSD_PRESETS: readonly string[] = ['▶ PLAY', 'PAUSE', 'REC ●', 'CAM 01'];

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

/** 畫面上的字幕：前兩行、去掉頭尾空白、拿掉空行 */
export function captionLines(text: string): string[] {
  return text
    .split(/\r?\n|\r/)
    .slice(0, 2)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 字幕欄有第 3 行以後的字（不會畫出來，提醒用） */
export const captionHasExtra = (text: string): boolean =>
  text
    .split(/\r?\n|\r/)
    .slice(2)
    .some((s) => s.trim() !== '');

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
  return formatTape(Math.floor(tc.tape + t));
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

/** 某個時間的文字；給 gifFrame 時字幕逐字打出（F46） */
export function frameText(s: VhsState, t: number, gifFrame?: number): FrameText {
  const full = captionLines(s.caption);
  const total = full.reduce((n, l) => n + charCount(l), 0);
  const chars = gifFrame === undefined ? null : gifChars(gifFrame, total);
  return {
    caption: chars === null ? full : typedLines(full, chars),
    captionFull: full,
    osd: s.osd.trim() || null,
    timecode: timecodeText(s.timecode, t),
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
  const tapeStart =
    typeof tc.tape === 'number' && Number.isFinite(tc.tape)
      ? Math.max(0, Math.min(TAPE_START_MAX, Math.floor(tc.tape)))
      : d.timecode.tape;
  return {
    photo,
    view: photo ? clampView(photo, screenSize(aspect), rawView) : { ...DEFAULT_VIEW },
    caption: clipChars(str(o.caption), CAPTION_MAX),
    osd: typeof o.osd === 'string' ? tidyOsd(o.osd) : d.osd,
    osdFont: OSD_FONTS.includes(o.osdFont as OsdFont) ? (o.osdFont as OsdFont) : d.osdFont,
    timecode: {
      mode: TIMECODE_MODES.includes(tc.mode as TimecodeMode)
        ? (tc.mode as TimecodeMode)
        : d.timecode.mode,
      tape: tapeStart,
      clock: parseClockStart(str(tc.clock)) ?? d.timecode.clock,
    },
    wear: Math.round(num(o.wear, d.wear, WEAR_RANGE.min, WEAR_RANGE.max)),
    aspect,
  };
}

/** 一份狀態用到的圖（資產 id） */
export const stateAssetIds = (s: VhsState): string[] => (s.photo ? [s.photo.id] : []);
