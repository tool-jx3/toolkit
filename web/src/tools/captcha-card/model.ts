/**
 * 驗證題梗圖產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/captcha-card.md）：
 * 狀態與預設值、整理存檔、主題色的文字顏色、格子的操作（放圖、勾選、全選、打亂、交換、清空）、檔名。
 *
 * 格子固定存 16 格（4 × 4）；3 × 3 時只用前 9 格，後面 7 格的內容留著，切回 4 × 4 時照原位置出現。
 */
import {
  clampPlacement,
  DEFAULT_PLACEMENT,
  type FramePlacement,
  normalizePlacement,
} from '@/core/image';
import { createRandom } from '@/core/timeline';

/* ---------- 範圍 ---------- */

export const GRID_SLOTS = 16;
export const COLS = [3, 4] as const;
export type Cols = (typeof COLS)[number];

export const LIMITS = {
  prompt: 40,
  keyword: 24,
  note: 60,
  verify: 10,
  check: 16,
  errorText: 40,
  popTitle: 24,
  popMessage: 90,
  popButton: 10,
} as const;

/** 圖片在格子、代表圖裡的縮放上限（蓋滿＝1） */
export const ZOOM_MAX = 4;
/** 放進資產庫時的長邊上限（格子在 3 倍的 PNG 裡最大約 370 px，代表圖約 234 px） */
export const IMAGE_MAX_SIDE = 1200;

/* ---------- 主題色 ---------- */

/** 主題色的色票（本站自己挑的 6 色；預設第一個） */
export const THEME_SWATCHES = [
  '#5b8def',
  '#f39ac0',
  '#ee6a5f',
  '#f1b240',
  '#4dbb86',
  '#9a86ee',
] as const;
export const DEFAULT_THEME = THEME_SWATCHES[0];

const HEX = /^#[0-9a-f]{6}$/i;

/** sRGB 的相對亮度（0～1） */
export function luminance(hex: string): number {
  const v = HEX.test(hex) ? hex : DEFAULT_THEME;
  const ch = [1, 3, 5].map((i) => Number.parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** 主題色上的文字顏色：很亮的主題色（亮度 > 0.62）用深色字，其他用白字（粉彩色也是白字） */
export const themeTextColor = (hex: string): string =>
  luminance(hex) > 0.62 ? '#212530' : '#ffffff';

/* ---------- 圖片 ---------- */

/** 程式畫的範例圖（不是照片） */
export const SAMPLE_KEYS = [
  'seeker-hat',
  'seeker-lens',
  'seeker-lamp',
  'seeker-scarf',
  'book',
  'eye',
  'die',
  'key',
  'moon',
  'candle',
] as const;
export type SampleKey = (typeof SAMPLE_KEYS)[number];
export const isSampleKey = (v: unknown): v is SampleKey =>
  typeof v === 'string' && (SAMPLE_KEYS as readonly string[]).includes(v);

/** 範例圖的大小（正方形，px） */
export const SAMPLE_SIZE = 400;

/** 資產庫裡的一張圖（原檔名、寬高） */
export interface AssetImage {
  kind: 'asset';
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface SampleImage {
  kind: 'sample';
  key: SampleKey;
}

export type CardImage = AssetImage | SampleImage;

export const imageSize = (img: CardImage): { width: number; height: number } =>
  img.kind === 'sample'
    ? { width: SAMPLE_SIZE, height: SAMPLE_SIZE }
    : { width: img.width, height: img.height };

export interface Cell {
  image: CardImage | null;
  /** 圖片在格子裡的位置（蓋滿＝1；core/image 的 FramePlacement） */
  place: FramePlacement;
  /** 勾選（只有放了圖片的格子有意義） */
  selected: boolean;
}

/* ---------- 動畫 ---------- */

export const ENDINGS = ['pass', 'fail', 'error', 'popup'] as const;
export type Ending = (typeof ENDINGS)[number];

export const POP_ICONS = ['error', 'warn', 'info', 'ok'] as const;
export type PopIcon = (typeof POP_ICONS)[number];

export const ORDERS = ['seq', 'random'] as const;
export type ClickOrder = (typeof ORDERS)[number];

export const SPEEDS = ['slow', 'normal', 'fast'] as const;
export type Speed = (typeof SPEEDS)[number];
/** 速度：停留時間乘上的倍數（游標移動的格數也跟著變） */
export const SPEED_FACTOR: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.65 };

/* ---------- 狀態 ---------- */

export interface CaptchaState {
  /** 主題色（#rrggbb） */
  theme: string;
  /** 題目文字（色帶第一行） */
  prompt: string;
  /** 關鍵字（色帶的大字） */
  keyword: string;
  /** 補充說明（色帶最後一行） */
  note: string;
  /** 驗證按鈕的文字 */
  verify: string;
  avatar: { image: CardImage | null; place: FramePlacement };
  cols: Cols;
  /** 底部操作列 */
  showFoot: boolean;
  /** 一律 16 格 */
  cells: Cell[];
  ending: Ending;
  /** 結尾「錯誤文字」的內容 */
  errorText: string;
  popup: { icon: PopIcon; title: string; message: string; button: string };
  /** 結尾「通過／失敗」的勾選框文字 */
  checkLabel: string;
  /** 動畫裡的滑鼠游標 */
  cursor: boolean;
  order: ClickOrder;
  /** 隨機順序的種子（「換一個順序」加 1） */
  orderSeed: number;
  speed: Speed;
}

export const DEFAULT_TEXT = {
  prompt: '請選出所有包含以下內容的圖片',
  keyword: '探索者',
  note: '如果沒有，請點左下角的重新整理。',
  verify: '驗證',
  checkLabel: '我不是機器人',
  errorText: '還有符合的圖片沒選到，請再試一次。',
  popTitle: '驗證失敗',
  popMessage: '偵測到不尋常的操作。請稍後再試一次，或請 KP 幫你確認 SAN 值。',
  popButton: '確定',
} as const;

const emptyCell = (): Cell => ({ image: null, place: { ...DEFAULT_PLACEMENT }, selected: false });

/** 範例的 3 × 3（打勾的是四個探索者） */
const SAMPLE_GRID: readonly [SampleKey, boolean][] = [
  ['seeker-hat', true],
  ['book', false],
  ['seeker-lens', true],
  ['eye', false],
  ['seeker-lamp', true],
  ['die', false],
  ['key', false],
  ['moon', false],
  ['seeker-scarf', true],
];

export function initialCells(): Cell[] {
  return Array.from({ length: GRID_SLOTS }, (_, i) => {
    const s = SAMPLE_GRID[i];
    return s
      ? { image: { kind: 'sample', key: s[0] }, place: { ...DEFAULT_PLACEMENT }, selected: s[1] }
      : emptyCell();
  });
}

export const initialState = (): CaptchaState => ({
  theme: DEFAULT_THEME,
  prompt: DEFAULT_TEXT.prompt,
  keyword: DEFAULT_TEXT.keyword,
  note: DEFAULT_TEXT.note,
  verify: DEFAULT_TEXT.verify,
  avatar: { image: { kind: 'sample', key: 'seeker-hat' }, place: { ...DEFAULT_PLACEMENT } },
  cols: 3,
  showFoot: true,
  cells: initialCells(),
  ending: 'pass',
  errorText: DEFAULT_TEXT.errorText,
  popup: {
    icon: 'error',
    title: DEFAULT_TEXT.popTitle,
    message: DEFAULT_TEXT.popMessage,
    button: DEFAULT_TEXT.popButton,
  },
  checkLabel: DEFAULT_TEXT.checkLabel,
  cursor: true,
  order: 'seq',
  orderSeed: 1,
  speed: 'normal',
});

/* ---------- 文字 ---------- */

/** 字串截到 n 個字（以字元計，emoji 算一個） */
export const clipChars = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/** 單行文字：換行與 Tab 換成空白，再截到上限 */
export const oneLine = (s: string, n: number): string => clipChars(s.replace(/[\r\n\t]+/g, ' '), n);

/* ---------- 整理存檔 ---------- */

const str = (v: unknown, fallback: string, max: number, multiline = false): string =>
  typeof v === 'string' ? (multiline ? clipChars(v, max) : oneLine(v, max)) : fallback;
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function normalizeImage(raw: unknown): CardImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'sample') return isSampleKey(o.key) ? { kind: 'sample', key: o.key } : null;
  if (o.kind === 'asset' && typeof o.id === 'string' && o.id) {
    const width = Number(o.width);
    const height = Number(o.height);
    if (!(width > 0 && height > 0)) return null;
    return {
      kind: 'asset',
      id: o.id,
      name: typeof o.name === 'string' ? o.name.slice(0, 200) : '',
      width: Math.round(width),
      height: Math.round(height),
    };
  }
  return null;
}

/** 位置：縮放夾在 1～4，位移夾回圖片蓋滿格子（正方形）的範圍 */
export function normalizePlace(raw: unknown, image: CardImage | null): FramePlacement {
  const p = normalizePlacement(raw, { minZoom: 1, maxZoom: ZOOM_MAX, limit: 4 });
  if (!image) return { ...DEFAULT_PLACEMENT };
  return clampPlacement(imageSize(image), { width: 1, height: 1 }, p, ZOOM_MAX);
}

function normalizeCell(raw: unknown): Cell {
  if (!raw || typeof raw !== 'object') return emptyCell();
  const o = raw as Record<string, unknown>;
  const image = normalizeImage(o.image);
  if (!image) return emptyCell();
  return { image, place: normalizePlace(o.place, image), selected: bool(o.selected, false) };
}

/** 開頁、讀專案檔時整理：缺的補預設、不認得的換成預設、文字截到上限、格子補滿 16 格 */
export function normalizeState(raw: unknown): CaptchaState {
  const d = initialState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const theme = typeof o.theme === 'string' && HEX.test(o.theme) ? o.theme.toLowerCase() : d.theme;
  const av = (o.avatar && typeof o.avatar === 'object' ? o.avatar : {}) as Record<string, unknown>;
  const avatarImage = 'avatar' in o ? normalizeImage(av.image) : d.avatar.image;
  const cells = Array.isArray(o.cells)
    ? Array.from({ length: GRID_SLOTS }, (_, i) => normalizeCell((o.cells as unknown[])[i]))
    : d.cells;
  const pop = (o.popup && typeof o.popup === 'object' ? o.popup : {}) as Record<string, unknown>;
  const seed = Number(o.orderSeed);
  return {
    theme,
    prompt: str(o.prompt, d.prompt, LIMITS.prompt),
    keyword: str(o.keyword, d.keyword, LIMITS.keyword),
    note: str(o.note, d.note, LIMITS.note),
    verify: str(o.verify, d.verify, LIMITS.verify),
    avatar: { image: avatarImage, place: normalizePlace(av.place, avatarImage) },
    cols: o.cols === 4 ? 4 : o.cols === 3 ? 3 : d.cols,
    showFoot: bool(o.showFoot, d.showFoot),
    cells,
    ending: pick(o.ending, ENDINGS, d.ending),
    errorText: str(o.errorText, d.errorText, LIMITS.errorText),
    popup: {
      icon: pick(pop.icon, POP_ICONS, d.popup.icon),
      title: str(pop.title, d.popup.title, LIMITS.popTitle),
      message: str(pop.message, d.popup.message, LIMITS.popMessage, true),
      button: str(pop.button, d.popup.button, LIMITS.popButton),
    },
    checkLabel: str(o.checkLabel, d.checkLabel, LIMITS.check),
    cursor: bool(o.cursor, d.cursor),
    order: pick(o.order, ORDERS, d.order),
    orderSeed: Number.isFinite(seed) ? Math.round(Math.abs(seed)) % 1_000_000 : d.orderSeed,
    speed: pick(o.speed, SPEEDS, d.speed),
  };
}

/** 狀態用到的資產 id（代表圖＋16 格） */
export function stateAssetIds(d: Pick<CaptchaState, 'avatar' | 'cells'>): string[] {
  const out: string[] = [];
  if (d.avatar.image?.kind === 'asset') out.push(d.avatar.image.id);
  for (const c of d.cells) if (c.image?.kind === 'asset') out.push(c.image.id);
  return out;
}

/* ---------- 格子 ---------- */

/** 看得到的格數 */
export const visibleCount = (cols: Cols): number => cols * cols;

/** 看得到的格子（前 cols² 格） */
export const visibleCells = (d: Pick<CaptchaState, 'cols' | 'cells'>): Cell[] =>
  d.cells.slice(0, visibleCount(d.cols));

/** 統計：看得到的格子裡有圖的格數、勾選的格數 */
export function gridCounts(d: Pick<CaptchaState, 'cols' | 'cells'>): {
  filled: number;
  selected: number;
  total: number;
} {
  const v = visibleCells(d);
  return {
    filled: v.filter((c) => c.image).length,
    selected: v.filter((c) => c.image && c.selected).length,
    total: v.length,
  };
}

/** 勾選的格子（格子的位置，依格子順序） */
export const selectedIndices = (d: Pick<CaptchaState, 'cols' | 'cells'>): number[] =>
  visibleCells(d)
    .map((c, i) => (c.image && c.selected ? i : -1))
    .filter((i) => i >= 0);

/**
 * 依序放圖（規格 7.1 的裁定）：
 * - 給了 start（點選、拖放、貼上指著的那一格）：第一張放那一格（有圖也換掉），其他從那一格**往後**依序放進看得到的空格子，
 *   後面沒有空格時再從第一格往後找（到 start 之前為止）；
 * - 沒有 start：從第一格依序放進空格子。
 * 回傳每張圖放在哪一格，與沒有位置的張數。
 */
export function planFill(
  d: Pick<CaptchaState, 'cols' | 'cells'>,
  count: number,
  start: number | null = null,
): { slots: number[]; dropped: number } {
  const n = visibleCount(d.cols);
  const slots: number[] = [];
  const from = start !== null && start >= 0 && start < n ? start : null;
  if (from !== null && count > 0) slots.push(from);
  const first = from === null ? 0 : from + 1;
  for (let k = 0; k < n && slots.length < count; k++) {
    const i = (first + k) % n;
    if (i === from) continue;
    if (!d.cells[i].image) slots.push(i);
  }
  return { slots, dropped: Math.max(0, count - slots.length) };
}

/** 全選／全不選：看得到的有圖格子裡還有沒勾的就全部勾，否則全部取消（null：沒有圖） */
export function selectAllTarget(d: Pick<CaptchaState, 'cols' | 'cells'>): boolean | null {
  const filled = visibleCells(d).filter((c) => c.image);
  if (!filled.length) return null;
  return filled.some((c) => !c.selected);
}

/** 打亂看得到的格子（含空格）的順序；random 給 0～1 的亂數 */
export function shuffledOrder(n: number, random: () => number = Math.random): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** 方向鍵換位置：從 index 往 dir 移一格（在邊上時 null） */
export function neighborIndex(
  index: number,
  cols: Cols,
  dir: 'left' | 'right' | 'up' | 'down',
): number | null {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const [nr, nc] =
    dir === 'left'
      ? [r, c - 1]
      : dir === 'right'
        ? [r, c + 1]
        : dir === 'up'
          ? [r - 1, c]
          : [r + 1, c];
  if (nr < 0 || nc < 0 || nr >= cols || nc >= cols) return null;
  return nr * cols + nc;
}

/* ---------- 動畫的點選順序 ---------- */

/**
 * 動畫裡點格子的順序（格子的位置）：依序＝格子順序；隨機＝依種子打亂（同一個種子每次相同；
 * 兩格以上打亂後剛好是原順序時，第一格移到最後，看得出是隨機）。
 */
export function clickOrder(
  d: Pick<CaptchaState, 'cols' | 'cells' | 'order' | 'orderSeed'>,
): number[] {
  const sel = selectedIndices(d);
  if (d.order !== 'random' || sel.length < 2) return sel;
  const rnd = createRandom(`captcha-order|${d.orderSeed}`);
  const perm = shuffledOrder(sel.length, () => rnd.next());
  const out = perm.map((k) => sel[k]);
  if (out.every((v, i) => v === sel[i])) out.push(out.shift() as number);
  return out;
}

/* ---------- 檔名 ---------- */

/** 匯出的檔名主體：captcha-<關鍵字>（空白換成底線；沒有關鍵字時 captcha） */
export function exportBaseName(keyword: string): string {
  const k = keyword.trim().replace(/\s+/g, '_');
  return k ? `captcha-${k}` : 'captcha';
}
