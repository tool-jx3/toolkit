/**
 * 鎖定畫面訊息產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/lock-screen.md）：
 * 狀態與預設值、整理存檔、時間與日期的寫法、通知卡片的排列與動畫、GIF 的影格表、完整構圖的手機位置。
 *
 * 座標：手機畫面以「畫面單位」計（寬 390、高 845，輸出 1080 × 2340 時 × 1080／390）；完整構圖以輸出 px 計（1200 × 1200）。
 */
import {
  clampPlacement,
  DEFAULT_PLACEMENT,
  type FramePlacement,
  normalizePlacement,
} from '@/core/image';
import { breakText } from '@/core/typeset';

/* ---------- 尺寸 ---------- */

/** 手機畫面（畫面單位） */
export const SCREEN_W = 390;
export const SCREEN_H = 845;
/** 手機畫面 PNG（＝預覽畫布）的大小：9：19.5 */
export const SCREEN_OUT = { width: 1080, height: 2340 } as const;
/** 完整構圖（正方形）的大小 */
export const FULL_OUT = 1200;
/** 手機畫面 GIF 的寬度（高 ＝ 寬 × 13／6） */
export const GIF_WIDTHS = [540, 720, 1080] as const;
export type GifWidth = (typeof GIF_WIDTHS)[number];
export const screenHeightFor = (width: number): number => Math.round((width * 13) / 6);

/* ---------- 範圍 ---------- */

export const MESSAGE_MAX = 4;
export const SENDER_MAX = 60;
export const BODY_MAX = 500;
export const RECEIVED_MAX = 40;
export const APP_NAME_MAX = 16;
export const BODY_LINES = 4;
export const DIM_RANGE = { min: 0, max: 80 } as const;
export const OPACITY_RANGE = { min: 0, max: 100 } as const;
export const BLUR_RANGE = { min: 0, max: 40 } as const;
export const INTERVAL_RANGE = { min: 0.7, max: 2.5, step: 0.1 } as const;
export const LENGTH_RANGE = { min: 0, max: 100 } as const;
/** 裁切的縮放上限（以蓋滿為 1） */
export const ZOOM_MAX = 4;

/* ---------- 狀態 ---------- */

/** 資產庫裡的一張圖（原檔） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Photo {
  image: ImageRef | null;
  /** 圖片在框裡的位置（蓋滿為 1；core/image 的 FramePlacement） */
  place: FramePlacement;
  /** 變暗（%） */
  dim: number;
}

export interface Message {
  id: string;
  sender: string;
  body: string;
  /** 收到時間（空白＝「現在」） */
  received: string;
}

export type GradientDirection = 'right' | 'left' | 'bottom' | 'top';
export const GRADIENT_DIRECTIONS: readonly GradientDirection[] = ['right', 'left', 'bottom', 'top'];

export type PhoneSide = 'left' | 'center' | 'right';
export const PHONE_SIDES: readonly PhoneSide[] = ['left', 'center', 'right'];

export interface Outer extends Photo {
  gradient: { on: boolean; color: string; direction: GradientDirection; length: number };
  /** 手機在構圖裡的位置（新版加的，原作固定靠右） */
  side: PhoneSide;
}

export interface LockScreenState {
  /** HH:MM */
  time: string;
  /** YYYY-MM-DD */
  date: string;
  showStatus: boolean;
  wallpaper: Photo;
  /** 通知上的 App 名稱（新版加的） */
  appName: string;
  /** 卡片不透明度（%） */
  opacity: number;
  /** 卡片背景模糊（畫面單位 px） */
  blur: number;
  /** 訊息間隔（秒） */
  interval: number;
  /** 依收到的順序（第一則最早；畫面上新的在上面） */
  messages: Message[];
  outer: Outer;
}

export const DEFAULT_TIME = '23:47';
export const DEFAULT_DATE = '2026-10-31';
export const DEFAULT_APP_NAME = '訊息';
export const DEFAULT_GRADIENT_COLOR = '#000000';

export const initialMessages = (): Message[] => [
  { id: 'm1', sender: '未知號碼', body: '你還記得那棟洋館嗎？', received: '' },
  { id: 'm2', sender: '未知號碼', body: '今晚十二點，一個人來。別告訴任何人。', received: '' },
];

export const initialState = (): LockScreenState => ({
  time: DEFAULT_TIME,
  date: DEFAULT_DATE,
  showStatus: true,
  wallpaper: { image: null, place: { ...DEFAULT_PLACEMENT }, dim: 12 },
  appName: DEFAULT_APP_NAME,
  opacity: 72,
  blur: 16,
  interval: 1.2,
  messages: initialMessages(),
  outer: {
    image: null,
    place: { ...DEFAULT_PLACEMENT },
    dim: 0,
    gradient: { on: true, color: DEFAULT_GRADIENT_COLOR, direction: 'right', length: 70 },
    side: 'right',
  },
});

/* ---------- 文字欄 ---------- */

/** 字串截到 n 個字（以字元計，emoji 算一個） */
export const clipChars = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/**
 * 時間的寫法（F16）：只取數字的前 4 個；1～2 位數＝幾點整，3～4 位數＝最後兩位是分。
 * 小時超過 23、分超過 59 時回傳 null。例：「9」→ 09:00、「930」→ 09:30、「23:5」→ 02:35、「2400」→ null。
 */
export function normalizeClock(value: unknown): string | null {
  const digits = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .slice(0, 4);
  if (!digits) return null;
  const hours = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, -2));
  const minutes = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * 打字時整理時間欄（F16）：只留數字（最多 4 個），超過 2 個時在最後兩個前面加「:」。
 * 回傳整理後的文字與游標位置（游標前有幾個數字照舊，跨過「:」時往後一格）。
 */
export function typeClock(value: string, caret: number): { text: string; caret: number } {
  const before = value.slice(0, caret).replace(/[^0-9]/g, '').length;
  const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
  const split = digits.length - 2;
  const text = digits.length > 2 ? `${digits.slice(0, split)}:${digits.slice(split)}` : digits;
  const pos = Math.min(text.length, before + (digits.length > 2 && before > split ? 1 : 0));
  return { text, caret: pos };
}

/** 收到時間離開欄位時（F22）：寫成「3～4 個數字」或「時:分」而且合理時，整理成 HH:MM；其他照原樣 */
export function tidyReceived(value: string): string {
  const v = value.trim();
  if (/^([0-9]{3,4}|[0-9]{1,2}:[0-9]{2})$/.test(v)) return normalizeClock(v) ?? value;
  return value;
}

/** 通知上的收到時間（空白＝現在） */
export const receivedLabel = (m: Pick<Message, 'received'>): string => m.received.trim() || '現在';

const WEEKDAYS = '日一二三四五六';

/** 日期 → 「10月31日 星期六」（不是合法的日期時回傳空字串；F17） */
export function dateLabel(value: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return '';
  return `${mo}月${d}日 星期${WEEKDAYS[date.getUTCDay()]}`;
}

/* ---------- 通知卡片 ---------- */

/** 卡片（畫面單位）：左 10、寬 370、圓角 14；標頭 33 高；高度 70 ＋ 每行 18 */
export const CARD = {
  x: 10,
  width: 370,
  radius: 14,
  header: 33,
  gap: 8,
  textX: 13,
  textWidth: 338,
  lineHeight: 18,
  baseHeight: 70,
} as const;

export const cardHeight = (lines: number): number =>
  CARD.baseHeight + Math.max(1, lines) * CARD.lineHeight;

/** 最上面那張卡片的 y：卡片疊起來的底部最多到 800，最高不超過 230 */
export function stackTop(heights: readonly number[]): number {
  const total = heights.reduce((s, h) => s + h, 0);
  return Math.min(230, 800 - total - Math.max(0, heights.length - 1) * CARD.gap);
}

/** 文字寬度（px，和畫布的 measureText 同單位） */
export type Measure = (text: string) => number;

/** 放不下時從後面去掉字、加上「…」 */
export function ellipsize(text: string, width: number, measure: Measure): string {
  if (measure(text) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && measure(`${chars.join('')}…`) > width) chars.pop();
  return `${chars.join('')}…`;
}

/**
 * 內容斷行（F23）：保留原本的換行、依寬度自動換行（行首、行尾禁則；英文單字不從中間斷），最多 4 行；
 * 超過時第 4 行的最後加「…」。空白的內容算一行。
 */
export function wrapBody(
  text: string,
  measure: Measure,
  width: number = CARD.textWidth,
  max: number = BODY_LINES,
): { lines: string[]; clipped: boolean } {
  const cache = new Map<string, number>();
  const unit = (ch: string) => {
    let w = cache.get(ch);
    if (w === undefined) {
      w = measure(ch);
      cache.set(ch, w);
    }
    return w;
  };
  const all = breakText(text, { limit: width, unit, segment: 'grapheme' }).map((l) => l.join(''));
  if (!all.length) all.push('');
  if (all.length <= max) return { lines: all, clipped: false };
  const lines = all.slice(0, max);
  lines[max - 1] = ellipsize(`${lines[max - 1]}…`, width - 1, measure);
  return { lines, clipped: true };
}

/* ---------- 動畫 ---------- */

/** 第一則在 0.5 秒出現；每則的彈出動畫 0.6 秒 */
export const FIRST_AT = 0.5;
export const POP_SECONDS = 0.6;
/** 新卡片從上方 34 畫面單位落下 */
export const DROP = 34;

/** 彈簧曲線（F35）：1 − e^(−7p)·cos(8p)，p ≥ 1 時是 1 */
export const spring = (p: number): number => (p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(8 * p));

/** 預覽動畫的長度：最後一則彈完 */
export const animationDuration = (count: number, interval: number): number =>
  FIRST_AT + Math.max(0, count - 1) * interval + POP_SECONDS;

/** 一張卡片在某個時間的位置：index（第幾則）、y、不透明度、縮放 */
export interface CardDraw {
  index: number;
  y: number;
  alpha: number;
  scale: number;
}

/**
 * 某個時間（秒；Infinity＝全部出現的靜態畫面）畫哪些卡片、畫在哪裡（由下往上畫的順序）：
 * 最新的一則從上方 34 落下、不透明度 p × 4、縮放 0.96 → 1；舊的卡片被往下推（推的距離＝新卡片高 ＋ 8，跟著彈簧）。
 */
export function cardDraws(heights: readonly number[], t: number, interval: number): CardDraw[] {
  const n = heights.length;
  if (!n) return [];
  const top = stackTop(heights);
  const still = !Number.isFinite(t);
  const index = still ? n - 1 : Math.min(n - 1, Math.floor((t - FIRST_AT) / interval));
  if (index < 0) return [];
  const elapsed = still ? POP_SECONDS : Math.max(0, t - FIRST_AT - index * interval);
  /* 加一點點：0.05 × 12 這類浮點數的和剛好差一點到 0.6 時也算彈完（和靜態畫面一樣） */
  const p = Math.min(1, elapsed / POP_SECONDS + 1e-9);
  const e = spring(p);
  const out: CardDraw[] = [];
  let y = top + (heights[index] + CARD.gap) * e;
  for (let i = index - 1; i >= 0; i--) {
    out.push({ index: i, y, alpha: 1, scale: 1 });
    y += heights[i] + CARD.gap;
  }
  out.push({
    index,
    y: top - DROP * (1 - e),
    alpha: Math.min(1, p * 4),
    scale: 0.96 + 0.04 * e,
  });
  return out;
}

/** GIF 的一格：畫哪個時間、顯示多久（毫秒） */
export interface GifFrame {
  t: number;
  ms: number;
}

/**
 * GIF 的影格表（F44）：第 0 格（還沒有訊息）停 0.5 秒；每則訊息 12 格、每格 0.05 秒（動畫的 0.05～0.6 秒），
 * 每則的最後一格停到下一則開始（間隔 − 0.55 秒）；最後一則的最後一格停 1.8 秒。
 */
export function gifFrames(count: number, interval: number): GifFrame[] {
  const out: GifFrame[] = [{ t: 0, ms: 500 }];
  for (let i = 0; i < count; i++) {
    const start = FIRST_AT + i * interval;
    for (let j = 1; j <= 12; j++) {
      const last = j === 12;
      out.push({
        t: start + j * 0.05,
        ms: !last ? 50 : i === count - 1 ? 1800 : Math.round((interval - 0.55) * 1000),
      });
    }
  }
  return out;
}

/* ---------- 完整構圖 ---------- */

/**
 * 手機在 1200 × 1200 構圖裡的位置（輸出 px）：機身高 1056（88%）、上下置中；靠右時右邊留 66、靠左對稱、置中在正中央。
 * 機身＝畫面 1080 × 2340 加上四邊 26 的邊框（機身單位），畫面圓角 118、機身圓角 144。
 */
export const PHONE = {
  bezel: 26,
  screenRadius: 118,
  bodyRadius: 144,
  bodyHeight: 1056,
  margin: 66,
} as const;

export interface PhoneBox {
  /** 機身單位 → 輸出 px */
  k: number;
  body: { x: number; y: number; width: number; height: number };
  screen: { x: number; y: number; width: number; height: number; radius: number };
}

export function phoneBox(side: PhoneSide): PhoneBox {
  const bw = SCREEN_OUT.width + PHONE.bezel * 2;
  const bh = SCREEN_OUT.height + PHONE.bezel * 2;
  const k = PHONE.bodyHeight / bh;
  const width = bw * k;
  const height = bh * k;
  const cx =
    side === 'center'
      ? FULL_OUT / 2
      : side === 'right'
        ? FULL_OUT - PHONE.margin - width / 2
        : PHONE.margin + width / 2;
  const x = cx - width / 2;
  const y = (FULL_OUT - height) / 2;
  return {
    k,
    body: { x, y, width, height },
    screen: {
      x: x + PHONE.bezel * k,
      y: y + PHONE.bezel * k,
      width: SCREEN_OUT.width * k,
      height: SCREEN_OUT.height * k,
      radius: PHONE.screenRadius * k,
    },
  };
}

/** 外框漸層的起訖（輸出 px）：從 (x0, y0) 透明到 (x1, y1) 不透明；長度是構圖邊長的百分比 */
export function gradientLine(
  direction: GradientDirection,
  length: number,
  size: number = FULL_OUT,
): [number, number, number, number] {
  const l = (size * length) / 100;
  switch (direction) {
    case 'right':
      return [size - l, 0, size, 0];
    case 'left':
      return [l, 0, 0, 0];
    case 'bottom':
      return [0, size - l, 0, size];
    case 'top':
      return [0, l, 0, 0];
  }
}

/* ---------- 檔名 ---------- */

export type ExportTarget = 'screen' | 'full';
export type ExportFormat = 'png' | 'gif';

const pad = (n: number) => String(n).padStart(2, '0');

/** lockscreen-screen-20261009-234700.png */
export function exportFileName(target: ExportTarget, ext: ExportFormat, now: Date): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `lockscreen-${target}-${stamp}.${ext}`;
}

/* ---------- 整理存檔 ---------- */

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const normalizeColor = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;

function normalizeImage(v: unknown): ImageRef | null {
  const o = obj(v);
  if (typeof o.id !== 'string' || !o.id) return null;
  const width = num(o.width, 0, 0, 1e6);
  const height = num(o.height, 0, 0, 1e6);
  if (!(width > 0 && height > 0)) return null;
  return { id: o.id, name: str(o.name).slice(0, 255), width, height };
}

function normalizePhoto(
  v: unknown,
  fallback: Photo,
  frame: { width: number; height: number },
): Photo {
  const o = obj(v);
  const image = normalizeImage(o.image);
  const raw = normalizePlacement(o.place, { minZoom: 1, maxZoom: ZOOM_MAX, limit: 10 });
  return {
    image,
    /* 位移夾回「照片蓋滿」的範圍（存檔被改壞時也不會露出底色） */
    place: image ? clampPlacement(image, frame, raw, ZOOM_MAX) : raw,
    dim: Math.round(num(o.dim, fallback.dim, DIM_RANGE.min, DIM_RANGE.max)),
  };
}

/** 一則訊息的 id：m1、m2…（沒用過的最小號碼之後） */
export function nextMessageId(list: readonly Pick<Message, 'id'>[]): string {
  let n = 0;
  for (const m of list) {
    const k = /^m(\d+)$/.exec(m.id);
    if (k) n = Math.max(n, Number(k[1]));
  }
  return `m${n + 1}`;
}

/** 存檔、專案檔讀回來的資料整理成合法的狀態（不認得的換成預設、數值夾在範圍內） */
export function normalizeState(raw: unknown): LockScreenState {
  const d = initialState();
  const o = obj(raw);
  const msgs = Array.isArray(o.messages) ? o.messages.slice(0, MESSAGE_MAX) : [];
  const messages: Message[] = [];
  for (const m of msgs) {
    const x = obj(m);
    let id = typeof x.id === 'string' && /^m\d+$/.test(x.id) ? x.id : '';
    if (!id || messages.some((y) => y.id === id)) id = nextMessageId(messages);
    messages.push({
      id,
      sender: clipChars(str(x.sender), SENDER_MAX),
      body: clipChars(str(x.body), BODY_MAX),
      received: clipChars(str(x.received), RECEIVED_MAX),
    });
  }
  const oo = obj(o.outer);
  const g = obj(oo.gradient);
  const wall = normalizePhoto(o.wallpaper, d.wallpaper, SCREEN_OUT);
  const outerPhoto = normalizePhoto(oo, d.outer, { width: FULL_OUT, height: FULL_OUT });
  return {
    time: normalizeClock(o.time) ?? d.time,
    date: dateLabel(o.date) ? (o.date as string) : d.date,
    showStatus: o.showStatus !== false,
    wallpaper: wall,
    appName: typeof o.appName === 'string' ? clipChars(o.appName, APP_NAME_MAX) : d.appName,
    opacity: Math.round(num(o.opacity, d.opacity, OPACITY_RANGE.min, OPACITY_RANGE.max)),
    blur: Math.round(num(o.blur, d.blur, BLUR_RANGE.min, BLUR_RANGE.max)),
    interval:
      Math.round(num(o.interval, d.interval, INTERVAL_RANGE.min, INTERVAL_RANGE.max) * 10) / 10,
    messages: messages.length ? messages : d.messages,
    outer: {
      ...outerPhoto,
      gradient: {
        on: g.on !== false,
        color: normalizeColor(g.color, d.outer.gradient.color),
        direction: GRADIENT_DIRECTIONS.includes(g.direction as GradientDirection)
          ? (g.direction as GradientDirection)
          : d.outer.gradient.direction,
        length: Math.round(
          num(g.length, d.outer.gradient.length, LENGTH_RANGE.min, LENGTH_RANGE.max),
        ),
      },
      side: PHONE_SIDES.includes(oo.side as PhoneSide) ? (oo.side as PhoneSide) : d.outer.side,
    },
  };
}

/** 一份狀態用到的圖（資產 id） */
export const stateAssetIds = (s: LockScreenState): string[] => [
  ...(s.wallpaper.image ? [s.wallpaper.image.id] : []),
  ...(s.outer.image ? [s.outer.image.id] : []),
];
