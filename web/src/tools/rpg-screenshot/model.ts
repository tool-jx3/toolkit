/**
 * RPG 截圖產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/rpg-screenshot.md）：
 * 狀態與預設值、整理存檔、畫面大小、背景圖的位置、台詞的分頁與顏色標記、動畫的時間與 GIF 的影格表、檔名。
 */
import { coverCrop, RETRO_TONES, type Rect, type RetroTone } from '@/core/image';
import { THEME_IDS, type ThemeId } from './themes';

/* ---------- 畫面 ---------- */

export type Ratio = '4:3' | '16:9' | '1:1' | '9:16';
export const RATIOS: readonly Ratio[] = ['4:3', '16:9', '1:1', '9:16'];

export interface Size {
  width: number;
  height: number;
}

/** 畫面大小（同原作；u＝寬 ÷ 816） */
export const RATIO_SIZE: Record<Ratio, Size> = {
  '4:3': { width: 816, height: 624 },
  '16:9': { width: 1024, height: 576 },
  '1:1': { width: 720, height: 720 },
  '9:16': { width: 576, height: 1024 },
};
export const BASE_WIDTH = 816;
export const screenSize = (ratio: Ratio): Size => RATIO_SIZE[ratio];

/* ---------- 選項 ---------- */

export type NameStyle = 'pill' | 'tab' | 'window' | 'inline';
export const NAME_STYLES: readonly NameStyle[] = ['pill', 'tab', 'window', 'inline'];
export type TextFx = 'none' | 'shadow' | 'outline';
export const TEXT_FXS: readonly TextFx[] = ['none', 'shadow', 'outline'];
export type WinPos = 'bottom' | 'middle' | 'top';
export const WIN_POSITIONS: readonly WinPos[] = ['bottom', 'middle', 'top'];
export type FaceSide = 'left' | 'right';
export const FACE_SIDES: readonly FaceSide[] = ['left', 'right'];
export type PopupPos = 'tr' | 'tc' | 'center';
export const POPUP_POSITIONS: readonly PopupPos[] = ['tr', 'tc', 'center'];
export type PopupWhen = 'after' | 'with';
export const POPUP_WHENS: readonly PopupWhen[] = ['after', 'with'];
export type FontId = 'cubic11' | 'fusion10' | 'mono';
export const FONT_IDS: readonly FontId[] = ['cubic11', 'fusion10', 'mono'];
export { RETRO_TONES, type RetroTone };

/** 範圍（同原作） */
export const RANGES = {
  zoom: { min: 1, max: 4 },
  pixelSize: { min: 1, max: 20 },
  levels: { min: 2, max: 32 },
  brightness: { min: -50, max: 50 },
  contrast: { min: -50, max: 60 },
  saturation: { min: -100, max: 100 },
  boxOpacity: { min: 30, max: 100 },
  fontSize: { min: 14, max: 48 },
  typeSpeed: { min: 10, max: 160, step: 5 },
  pitch: { min: 160, max: 1200, step: 20 },
} as const;

/** 文字欄的上限（防呆；原作沒有上限） */
export const LIMITS = {
  dialogue: 4000,
  speaker: 40,
  list: 400,
  location: 40,
} as const;
/** 選項、演出文字最多幾行 */
export const LIST_MAX = 4;

/** 滾輪一格的倍率 */
export const WHEEL_ZOOM = 1.12;
/** 鍵盤移動背景圖（畫面 px）、Shift 時 */
export const KEY_STEP = 16;
export const KEY_STEP_BIG = 64;

/* ---------- 狀態 ---------- */

/** 資產庫裡的一張圖（原檔） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

/** 背景圖的位置：放大倍率（1～4）、看到的範圍中心相對於「剛好蓋滿」時的位移（原圖 px） */
export interface BgView {
  zoom: number;
  x: number;
  y: number;
}
export const DEFAULT_VIEW: Readonly<BgView> = Object.freeze({ zoom: 1, x: 0, y: 0 });

export interface RpgState {
  /* 圖片 */
  bg: ImageRef | null;
  view: BgView;
  ratio: Ratio;
  pixelSize: number;
  levels: number;
  dither: boolean;
  tone: RetroTone;
  brightness: number;
  contrast: number;
  saturation: number;
  scanline: boolean;
  vignette: boolean;
  /* 台詞 */
  dialogue: string;
  speaker: string;
  /** 名字顏色：null＝跟著視窗主題 */
  nameColor: string | null;
  face: ImageRef | null;
  faceSide: FaceSide;
  choices: string;
  popups: string;
  popupPos: PopupPos;
  popupWhen: PopupWhen;
  popupAll: boolean;
  location: string;
  /* 樣式 */
  theme: ThemeId;
  showWindow: boolean;
  winPos: WinPos;
  boxOpacity: number;
  showArrow: boolean;
  font: FontId;
  fontSize: number;
  nameStyle: NameStyle;
  textFx: TextFx;
  /* 打字機 */
  typeSpeed: number;
}

/** 新版的範例（自己寫；清空就和原作的預設相同） */
export const SAMPLE_SPEAKER = '旅店老闆';
export const SAMPLE_DIALOGUE =
  '歡迎光臨「[黃]白鹿亭[/]」！\n外頭的雨已經下了三天，今晚要住下來嗎？\n---\n@\n（樓上傳來[紅]指甲刮過木板[/]的聲音……）';
/** 名字顏色的初始值（關掉「跟著主題」時；同原作的預設色） */
export const DEFAULT_NAME_COLOR = '#ffcb47';

export const initialState = (): RpgState => ({
  bg: null,
  view: { ...DEFAULT_VIEW },
  ratio: '4:3',
  pixelSize: 6,
  levels: 8,
  dither: true,
  tone: 'none',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  scanline: true,
  vignette: true,
  dialogue: SAMPLE_DIALOGUE,
  speaker: SAMPLE_SPEAKER,
  nameColor: null,
  face: null,
  faceSide: 'left',
  choices: '',
  popups: '',
  popupPos: 'tr',
  popupWhen: 'after',
  popupAll: false,
  location: '',
  theme: 'galge',
  showWindow: true,
  winPos: 'bottom',
  boxOpacity: 86,
  showArrow: true,
  font: 'cubic11',
  fontSize: 26,
  nameStyle: 'pill',
  textFx: 'outline',
  typeSpeed: 45,
});

/* ---------- 台詞 ---------- */

export interface Page {
  /** 這一頁的名字（去掉頭尾空白；空的＝不顯示） */
  speaker: string;
  text: string;
}

const PAGE_BREAKS = new Set(['---', '－－－']);
const isSpeakerLine = (line: string) => /^[@＠]/.test(line.trim());

/** 台詞 → 頁：一行只有「---」換頁；頁的第一行「@名字」換說話者（只寫「@」不顯示名字） */
export function parsePages(dialogue: string, speaker: string): Page[] {
  const out: Page[] = [];
  let cur: string[] = [];
  const flush = () => {
    let sp = speaker;
    if (cur.length && isSpeakerLine(cur[0])) {
      sp = cur[0].trim().slice(1).trim();
      cur = cur.slice(1);
    }
    out.push({ speaker: sp.trim(), text: cur.join('\n') });
    cur = [];
  };
  for (const line of dialogue.replace(/\r\n?/g, '\n').split('\n')) {
    if (PAGE_BREAKS.has(line.trim())) flush();
    else cur.push(line);
  }
  flush();
  return out;
}

/** 游標在第幾頁（游標前面有幾行「---」） */
export function pageAtCaret(dialogue: string, caret: number): number {
  const before = dialogue.slice(0, caret).replace(/\r\n?/g, '\n').split('\n').slice(0, -1);
  return before.filter((l) => PAGE_BREAKS.has(l.trim())).length;
}

/** 顏色標記的名稱與色值（色值同原作） */
export const COLOR_NAMES: readonly { names: readonly string[]; color: string }[] = [
  { names: ['紅', '紅色'], color: '#ff5a5a' },
  { names: ['橙', '橘', '橙色', '橘色'], color: '#ff9f43' },
  { names: ['黃', '黃色'], color: '#ffd43b' },
  { names: ['綠', '綠色'], color: '#51cf66' },
  { names: ['藍', '藍色'], color: '#4dabf7' },
  { names: ['青', '青色', '天藍'], color: '#74e0ff' },
  { names: ['紫', '紫色'], color: '#b197fc' },
  { names: ['粉', '粉紅', '粉色'], color: '#ff8cc6' },
  { names: ['灰', '灰色'], color: '#9aa0a6' },
  { names: ['白', '白色'], color: '#ffffff' },
  { names: ['黑', '黑色'], color: '#111111' },
];
const COLOR_BY_NAME = new Map(COLOR_NAMES.flatMap((c) => c.names.map((n) => [n, c.color])));
/** 「強調」＝主題的名字顏色 */
export const ACCENT_TAG = '強調';

export interface Token {
  ch: string;
  /** 標記的顏色（null＝預設色） */
  color: string | null;
}

/** 標記：「[」或「［」開頭、「]」或「］」結尾；裡面是「/」、色碼或名稱（名稱不認得時照原樣當成字） */
const TAG = /[[［](\/|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|[^\]］[［\s#]{1,4})[\]］]/y;

/** 文字 → 一個一個字（以 code point 計；顏色標記不算字；認不得的標記照原樣當成字） */
export function tokenize(text: string, accent: string): Token[] {
  const out: Token[] = [];
  let color: string | null = null;
  for (let i = 0; i < text.length; ) {
    const c0 = text[i];
    if (c0 === '[' || c0 === '［') {
      TAG.lastIndex = i;
      const m = TAG.exec(text);
      if (m) {
        const t = m[1];
        const value =
          t === '/'
            ? null
            : t[0] === '#'
              ? t
              : t === ACCENT_TAG
                ? accent
                : (COLOR_BY_NAME.get(t) ?? undefined);
        if (value !== undefined) {
          color = value;
          i += m[0].length;
          continue;
        }
      }
    }
    const ch = String.fromCodePoint(text.codePointAt(i) as number);
    out.push({ ch, color });
    i += ch.length;
  }
  return out;
}

/** 一頁的字數（換行不算；空白算） */
export const tokenCount = (tokens: readonly Token[]): number =>
  tokens.reduce((n, t) => (t.ch === '\n' ? n : n + 1), 0);

/** 選項、演出文字：一行一個、去掉頭尾空白、拿掉空行、最多 4 個 */
export const listLines = (text: string): string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, LIST_MAX);

/** 欄位裡的非空行數（超過 4 行時提醒） */
export const listLineCount = (text: string): number =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((s) => s.trim()).length;

/* ---------- 背景圖的位置 ---------- */

/** 看到的範圍（原圖 px；左上角夾在原圖裡） */
export function viewCrop(img: Size, out: Size, v: BgView): Rect {
  const b = coverCrop(img, out.width, out.height);
  const cw = b.width / v.zoom;
  const ch = b.height / v.zoom;
  let cx = b.x + (b.width - cw) / 2 + v.x;
  let cy = b.y + (b.height - ch) / 2 + v.y;
  cx = Math.max(0, Math.min(img.width - cw, cx));
  cy = Math.max(0, Math.min(img.height - ch, cy));
  return { x: cx, y: cy, width: cw, height: ch };
}

const clampZoom = (z: number) =>
  Math.max(RANGES.zoom.min, Math.min(RANGES.zoom.max, Number.isFinite(z) ? z : 1));

/** 位置夾回範圍（位移換成實際看到的範圍對應的位移） */
export function clampView(img: Size, out: Size, v: BgView): BgView {
  const zoom = clampZoom(v.zoom);
  const c = viewCrop(img, out, { zoom, x: v.x, y: v.y });
  const b = coverCrop(img, out.width, out.height);
  return {
    zoom,
    x: c.x - (b.x + (b.width - c.width) / 2),
    y: c.y - (b.y + (b.height - c.height) / 2),
  };
}

/** 移動：畫面上的 dx、dy（畫面 px）換成原圖 px（圖跟著移動），夾回範圍 */
export function panView(img: Size, out: Size, from: BgView, dx: number, dy: number): BgView {
  const c = viewCrop(img, out, from);
  return clampView(img, out, {
    zoom: from.zoom,
    x: from.x - dx * (c.width / out.width),
    y: from.y - dy * (c.height / out.height),
  });
}

/** 縮放到某個倍率（以看到的範圍的中心；位移不變） */
export const zoomView = (from: BgView, zoom: number): BgView => ({
  zoom: clampZoom(zoom),
  x: from.x,
  y: from.y,
});

/* ---------- 動畫的時間（毫秒） ---------- */

export const NAME_IN = 520;
export const LOC_IN = 1000;
export const POP_IN = 760;
export const POP_STAGGER = 280;
export const POP_SHINE = 700;
/** 改了設定之後重播開場動畫前的等待 */
export const REPLAY_DELAY = 350;

/** 演出文字全部做完的時間 */
export const popTotal = (n: number): number =>
  n ? POP_IN + POP_STAGGER * (n - 1) + POP_SHINE + 150 : 0;

export const clamp01 = (e: number): number => Math.max(0, Math.min(1, e));
/** 緩出（三次方） */
export const easeOut = (e: number): number => 1 - (1 - clamp01(e)) ** 3;
/** 略為過頭再回來（back-out，c1＝1.9） */
export function easeBack(e: number): number {
  const x = clamp01(e);
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/**
 * 一格的時間狀態：reveal＝打出幾個字（Infinity＝全部）；name、loc、pop＝名字、地點、演出文字的動畫經過的毫秒
 * （Infinity＝動畫已結束；pop −1＝還沒開始）；blinkOn＝閃爍的亮格（匯出用）。
 */
export interface FrameClocks {
  reveal: number;
  name: number;
  loc: number;
  pop: number;
  blinkOn: boolean;
}

/** 全部顯示（PNG、停留格） */
export const FULL_CLOCKS: Readonly<FrameClocks> = Object.freeze({
  reveal: Number.POSITIVE_INFINITY,
  name: Number.POSITIVE_INFINITY,
  loc: Number.POSITIVE_INFINITY,
  pop: Number.POSITIVE_INFINITY,
  blinkOn: true,
});

/** 預覽播放中：開始播放後 elapsed 毫秒 */
export function playClocks(
  elapsed: number,
  total: number,
  typeSpeed: number,
  when: PopupWhen,
): FrameClocks {
  const typeEnd = total * typeSpeed;
  return {
    reveal: Math.min(total, Math.floor(elapsed / typeSpeed)),
    name: elapsed,
    loc: elapsed,
    pop: when === 'with' ? elapsed : elapsed >= typeEnd ? elapsed - typeEnd : -1,
    blinkOn: true,
  };
}

/* ---------- GIF 的影格表（規格 3.10） ---------- */

export interface PageInfo {
  /** 字數 */
  total: number;
  hasName: boolean;
  /** 這一頁的演出文字幾則 */
  popups: number;
}

export interface TableFrame {
  page: number;
  clocks: FrameClocks;
  /** 毫秒 */
  delay: number;
}

export interface FrameTableOptions {
  light: boolean;
  typeSpeed: number;
  popupWhen: PopupWhen;
  /** 有地點標示 */
  location: boolean;
}

const INF = Number.POSITIVE_INFINITY;

/** 依原作的做法排出每一格：開場、打字、收尾、停留、閃爍 */
export function frameTable(
  pages: readonly PageInfo[],
  list: readonly number[],
  o: FrameTableOptions,
): TableFrame[] {
  const FR = o.light ? 100 : 60;
  const TYPE_MAX = o.light ? 18 : 60;
  const sp = o.typeSpeed;
  const out: TableFrame[] = [];
  list.forEach((pi, idx) => {
    const pg = pages[pi];
    const total = pg.total;
    const stepChars = Math.max(1, Math.ceil(total / TYPE_MAX));
    const delay = Math.max(30, sp * stepChars);
    const pops = pg.popups;
    const withText = o.popupWhen === 'with';
    const hasLoc = idx === 0 && o.location;
    const lead = hasLoc || pg.hasName ? 360 : 0;
    const push = (clocks: FrameClocks, ms: number) => out.push({ page: pi, clocks, delay: ms });
    for (let t = 0; t < lead; t += FR)
      push({ reveal: 0, name: t, loc: hasLoc ? t : INF, pop: -1, blinkOn: true }, FR);
    for (let k = 0; k <= total; k += stepChars) {
      const tt = k * sp;
      push(
        {
          reveal: k,
          name: lead + tt,
          loc: hasLoc ? lead + tt : INF,
          pop: withText ? tt : -1,
          blinkOn: true,
        },
        delay,
      );
    }
    const typeEnd = total * sp;
    const popStart = withText ? typeEnd : 0;
    const popEnd = pops ? popTotal(pops) : popStart;
    const locLeft = hasLoc ? Math.max(0, LOC_IN - (lead + typeEnd)) : 0;
    const nameLeft = Math.max(0, NAME_IN - (lead + typeEnd));
    const tail = Math.max(popEnd - popStart, locLeft, nameLeft);
    for (let t = 0; t <= tail; t += FR)
      push(
        {
          reveal: total,
          name: lead + typeEnd + t,
          loc: hasLoc ? lead + typeEnd + t : INF,
          pop: pops ? popStart + t : INF,
          blinkOn: true,
        },
        FR,
      );
    push({ ...FULL_CLOCKS }, 700);
    const blinks = o.light ? 1 : idx === list.length - 1 ? 3 : 1;
    for (let b = 0; b < blinks; b++) {
      push({ ...FULL_CLOCKS, blinkOn: false }, 300);
      push({ ...FULL_CLOCKS }, 450);
    }
  });
  return out;
}

/** 頁的資訊（字數、有沒有名字、演出文字幾則） */
export function pageInfos(s: RpgState, accent: string): PageInfo[] {
  const pages = parsePages(s.dialogue, s.speaker);
  const pops = listLines(s.popups).length;
  return pages.map((p, i) => ({
    total: tokenCount(tokenize(p.text, accent)),
    hasName: p.speaker !== '',
    popups: s.popupAll || i === pages.length - 1 ? pops : 0,
  }));
}

/* ---------- 匯出 ---------- */

export type ExportFormat = 'png' | 'gif' | 'gif-light' | 'apng' | 'webp';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'gif', 'gif-light', 'apng', 'webp'];
export const isAnimated = (f: ExportFormat): boolean => f !== 'png';

/** PNG 的倍率 1～3；動畫最多 2 */
export const SCALES: readonly number[] = [1, 2, 3];
export const ANIM_MAX_SCALE = 2;
/** 輕量 GIF 的寬上限 */
export const LIGHT_MAX_WIDTH = 560;

/** 動畫的倍率（輕量：寬最多 560、不放大；其他：PNG 倍率，最多 2） */
export function animScale(width: number, scale: number, light: boolean): number {
  return light ? Math.min(1, LIGHT_MAX_WIDTH / width) : Math.min(scale || 1, ANIM_MAX_SCALE);
}

export function outputSize(ratio: Ratio, format: ExportFormat, scale: number): Size {
  const sz = screenSize(ratio);
  const s =
    format === 'png'
      ? Math.max(1, Math.min(3, Math.round(scale) || 1))
      : animScale(sz.width, scale, format === 'gif-light');
  return { width: Math.round(sz.width * s), height: Math.round(sz.height * s) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 年月日-時分秒（本地時間） */
export function stamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

const SUFFIX: Record<ExportFormat, string> = {
  png: '.png',
  gif: '.gif',
  'gif-light': '-light.gif',
  apng: '-anim.png',
  webp: '.webp',
};
export const exportFileName = (format: ExportFormat, d: Date): string =>
  `rpg-screenshot-${stamp(d)}${SUFFIX[format]}`;

/* ---------- 整理存檔 ---------- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const int = (v: unknown, d: number, min: number, max: number): number =>
  Math.round(num(v, d, min, max));
const stepped = (v: unknown, d: number, r: { min: number; max: number; step: number }) =>
  r.min + Math.round((int(v, d, r.min, r.max) - r.min) / r.step) * r.step;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;
const str = (v: unknown, d: string, max: number): string =>
  typeof v === 'string' ? Array.from(v).slice(0, max).join('') : d;
const HEX = /^#[0-9a-f]{6}$/;

function normalizeImage(v: unknown): ImageRef | null {
  const o = obj(v);
  if (typeof o.id !== 'string' || !o.id) return null;
  const width = num(o.width, 0, 0, 1e6);
  const height = num(o.height, 0, 0, 1e6);
  if (!(width > 0 && height > 0)) return null;
  return { id: o.id, name: str(o.name, '', 255), width, height };
}

/** 存檔、專案檔讀回來的資料整理成合法的狀態 */
export function normalizeState(raw: unknown): RpgState {
  const d = initialState();
  const o = obj(raw);
  const bg = normalizeImage(o.bg);
  const vo = obj(o.view);
  const nameColor =
    typeof o.nameColor === 'string' && HEX.test(o.nameColor.toLowerCase())
      ? o.nameColor.toLowerCase()
      : null;
  return {
    bg,
    view: bg
      ? {
          zoom: num(vo.zoom, 1, RANGES.zoom.min, RANGES.zoom.max),
          x: num(vo.x, 0, -1e6, 1e6),
          y: num(vo.y, 0, -1e6, 1e6),
        }
      : { ...DEFAULT_VIEW },
    ratio: oneOf(o.ratio, RATIOS, d.ratio),
    pixelSize: int(o.pixelSize, d.pixelSize, RANGES.pixelSize.min, RANGES.pixelSize.max),
    levels: int(o.levels, d.levels, RANGES.levels.min, RANGES.levels.max),
    dither: bool(o.dither, d.dither),
    tone: oneOf(o.tone, RETRO_TONES, d.tone),
    brightness: int(o.brightness, d.brightness, RANGES.brightness.min, RANGES.brightness.max),
    contrast: int(o.contrast, d.contrast, RANGES.contrast.min, RANGES.contrast.max),
    saturation: int(o.saturation, d.saturation, RANGES.saturation.min, RANGES.saturation.max),
    scanline: bool(o.scanline, d.scanline),
    vignette: bool(o.vignette, d.vignette),
    dialogue: str(o.dialogue, d.dialogue, LIMITS.dialogue),
    speaker: str(o.speaker, d.speaker, LIMITS.speaker),
    nameColor: 'nameColor' in o ? nameColor : d.nameColor,
    face: normalizeImage(o.face),
    faceSide: oneOf(o.faceSide, FACE_SIDES, d.faceSide),
    choices: str(o.choices, d.choices, LIMITS.list),
    popups: str(o.popups, d.popups, LIMITS.list),
    popupPos: oneOf(o.popupPos, POPUP_POSITIONS, d.popupPos),
    popupWhen: oneOf(o.popupWhen, POPUP_WHENS, d.popupWhen),
    popupAll: bool(o.popupAll, d.popupAll),
    location: str(o.location, d.location, LIMITS.location),
    theme: oneOf(o.theme, THEME_IDS, d.theme),
    showWindow: bool(o.showWindow, d.showWindow),
    winPos: oneOf(o.winPos, WIN_POSITIONS, d.winPos),
    boxOpacity: int(o.boxOpacity, d.boxOpacity, RANGES.boxOpacity.min, RANGES.boxOpacity.max),
    showArrow: bool(o.showArrow, d.showArrow),
    font: oneOf(o.font, FONT_IDS, d.font),
    fontSize: int(o.fontSize, d.fontSize, RANGES.fontSize.min, RANGES.fontSize.max),
    nameStyle: oneOf(o.nameStyle, NAME_STYLES, d.nameStyle),
    textFx: oneOf(o.textFx, TEXT_FXS, d.textFx),
    typeSpeed: stepped(o.typeSpeed, d.typeSpeed, RANGES.typeSpeed),
  };
}

/** 一份狀態用到的圖（資產 id） */
export const stateAssetIds = (s: RpgState): string[] =>
  [s.bg?.id, s.face?.id].filter((x): x is string => !!x);

/** 音高對齊每格 */
export const normalizePitch = (v: unknown, d = 520): number => stepped(v, d, RANGES.pitch);
