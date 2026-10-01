/**
 * 匿名拼貼信：排版規則與文字輸出（純資料，不依賴 DOM，方便單元測試）。
 *
 * 規格 docs/refactor/specs/collage-letter.md：
 * - 每個字是一張歪斜的彩色紙片：字型、字級、配色、角度、紙片留白、四角內縮、間隔都隨機（F17～F25、3.2）。
 * - 版面幾何只看最大字級與行數（F29、3.1）；逐字換行、半形空白不產生紙片（F26～F28）；對齊（F30）。
 * - HTML（3.7）與 Roll20 格式文字（3.8）由同一份排版產生；字元一律跳脫（主控裁定）。
 * 量字寬由呼叫端提供（瀏覽器用 canvas 量；測試用假的量法）。
 */
import { escapeHtml } from '@/core/html';
import type { Random } from '@/core/timeline';
import { splitGraphemes } from '@/core/typeset';

export type Align = 'left' | 'center' | 'right';

/* ---------- 規格的數值 ---------- */

/** 左右與上方留白（px） */
export const MARGIN = 40;
/** 字級範圍的預設值（空白、0、非數字時） */
export const SIZE_DEFAULT = { min: 45, max: 70 } as const;
/** 圖片寬度的預設值 */
export const WIDTH_DEFAULT = 800;
/** Roll20 字級範圍的預設值 */
export const ROLL20_DEFAULT = { min: 16, max: 24 } as const;
/** 數值欄的合理範圍（主控裁定：限制範圍；規格 5. 建議字級 8～200、寬度 100～4000） */
export const SIZE_LIMIT = { min: 8, max: 200 } as const;
export const WIDTH_LIMIT = { min: 100, max: 4000 } as const;
export const ROLL20_LIMIT = { min: 8, max: 200 } as const;
/** Roll20 字級欄的微調範圍（直接打字可以超出，但仍在 ROLL20_LIMIT 內） */
export const ROLL20_SPIN = { min: { min: 10, max: 40 }, max: { min: 10, max: 50 } } as const;
/** 畫布的邊長上限：超過時只畫得到的部分（瀏覽器的畫布有尺寸上限） */
export const MAX_CANVAS_SIDE = 16000;
/** 畫布的總像素上限（約 160 MB 的 RGBA；超過時裁掉下面的部分） */
export const MAX_CANVAS_PIXELS = 40_000_000;

/** 旋轉角度 −18°～＋18°（整數度） */
export const ROTATE_MAX = 18;
/** 紙片寬＝字寬＋20～30 px */
export const PAD_X = { min: 20, max: 30 } as const;
/** 紙片高＝字級＋15～30 px */
export const PAD_Y = { min: 15, max: 30 } as const;
/** 四角內縮：半寬／半高的 0～20% */
export const INSET_MAX = 0.2;
/** 同一行相鄰紙片的間隔 2～8 px */
export const GAP = { min: 2, max: 8 } as const;
/** 半形空白寬＝最大字級 × 0.4 */
export const SPACE_RATIO = 0.4;
/** 行距＝最大字級 × 1.3（取整數部分：45 → 58） */
export const LINE_RATIO = 1.3;
/** 字寬量不到時以字級的 0.8 倍計 */
export const FALLBACK_WIDTH_RATIO = 0.8;
/** 紙片投影（畫布）：往右下 (3, 4)、模糊 6、40% 黑 */
export const PIECE_SHADOW = { x: 3, y: 4, blur: 6, color: 'rgba(0, 0, 0, 0.4)' } as const;

/** JPG 的紙張底色（約 R 244、G 235、B 216） */
export const PAPER_COLOR = '#f4ebd8';
/** 紙張上的斑點：約 4% 黑、1～3 px 見方、數量約 寬 × 高 ÷ 150 */
export const SPECK_COLOR = 'rgba(0, 0, 0, 0.04)';
export const SPECK_AREA_PER_DOT = 150;
export const SPECK_SIZE = { min: 1, max: 3 } as const;

/** Roll20 讀者電腦上通常有的基本字型 */
export const ROLL20_BASIC_FONTS = ['Batang', 'Dotum', 'Gungsuh'] as const;
/** Roll20 每個角的圓角 2～12 px */
export const ROLL20_RADIUS = { min: 2, max: 12 } as const;

/** 下載檔名的固定前綴（主控裁定：保留） */
export const FILE_PREFIX = 'calling_card_';

/* ---------- 型別 ---------- */

/** 紙片用的字型；generic＝系統的無襯線字型（所有字型都沒勾時） */
export interface PieceFont {
  family: string;
  weight: number;
  generic?: boolean;
}

export const SYSTEM_SANS: PieceFont = { family: 'sans-serif', weight: 400, generic: true };

export interface Palette {
  /** 紙片底色 */
  bg: string;
  /** 字色 */
  fg: string;
}

export const FALLBACK_PALETTE: Palette = { bg: '#ffffff', fg: '#000000' };

/** 四角內縮比例（相對半寬／半高，0～0.2）：左上 x、y，右上 x、y，右下 x、y，左下 x、y */
export type Insets = readonly [number, number, number, number, number, number, number, number];

export interface Piece {
  kind: 'piece';
  /** 這張紙片上的字（一個字素） */
  ch: string;
  font: PieceFont;
  /** 字級（px，整數） */
  size: number;
  bg: string;
  fg: string;
  /** 旋轉（整數度，−18～18） */
  rotate: number;
  /** 量到的字寬（量不到時字級 × 0.8） */
  textWidth: number;
  /** 紙片寬、高 */
  width: number;
  height: number;
  insets: Insets;
  /** Roll20 的四個角圓角（左上、右上、右下、左下） */
  radii: readonly [number, number, number, number];
  /** 這張紙片之後的間隔 */
  gap: number;
  /** 紙片中心（畫布座標） */
  x: number;
  y: number;
}

export interface Space {
  kind: 'space';
  width: number;
  /** 左緣（畫布座標） */
  x: number;
}

export type LayoutItem = Piece | Space;

export interface Line {
  /** 這一行的中線 y */
  mid: number;
  /** 行的左緣 x（對齊後） */
  left: number;
  /** 行寬：所有紙片寬、間隔、空白寬的總和（含最後一張之後的間隔） */
  width: number;
  items: LayoutItem[];
}

export interface CollageLayout {
  /** 最小、最大字級（對調後） */
  a: number;
  b: number;
  align: Align;
  autoWidth: boolean;
  /** 圖片寬（整數） */
  width: number;
  /** 圖片高（b 是奇數時有 0.5） */
  height: number;
  /** 實際畫布尺寸（高取整數部分；邊長不超過 MAX_CANVAS_SIDE、總像素不超過 MAX_CANVAS_PIXELS） */
  canvasWidth: number;
  canvasHeight: number;
  /** 圖片超過畫布上限、有一部分畫不出來 */
  clipped: boolean;
  lineHeight: number;
  firstMid: number;
  lines: Line[];
  /** 排版用的文字（內容是空字串時是提示文字） */
  text: string;
  pieceCount: number;
}

export interface LayoutInput {
  text: string;
  /** 內容是空字串時改用的提示文字（F04） */
  emptyText: string;
  a: number;
  b: number;
  /** 寬度設定（px） */
  width: number;
  autoWidth: boolean;
  align: Align;
  /** 可用的字型（已處理「全部未勾選」：見 activeFonts） */
  fonts: readonly PieceFont[];
  /** 可用的配色（已處理「全部未勾選」：見 activePalettes） */
  palettes: readonly Palette[];
}

/** 量字寬：某個字在某字型、字級下的前進寬度 */
export type MeasureFn = (ch: string, font: PieceFont, size: number) => number;

/* ---------- 數值欄 ---------- */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 數值欄的解讀（F05、F06、F37）：只讀開頭的整數部分（45.9 → 45；科學記號 1e2 → 1，主控裁定 7.1）；
 * 空白、0、非數字時用預設值；給了 limit 時夾在範圍內（主控裁定：限制在合理範圍）。
 */
export function parseIntField(
  raw: string,
  fallback: number,
  limit?: { min: number; max: number },
): number {
  const s = String(raw ?? '').trim();
  if (s === '') return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n === 0) return fallback;
  return limit ? clamp(n, limit.min, limit.max) : n;
}

/** 字級範圍：最小大於最大時對調使用（欄位上的數字不變） */
export function resolveSizeRange(minRaw: string, maxRaw: string): { a: number; b: number } {
  const lo = parseIntField(minRaw, SIZE_DEFAULT.min, SIZE_LIMIT);
  const hi = parseIntField(maxRaw, SIZE_DEFAULT.max, SIZE_LIMIT);
  return lo <= hi ? { a: lo, b: hi } : { a: hi, b: lo };
}

export function resolveWidth(raw: string): number {
  return parseIntField(raw, WIDTH_DEFAULT, WIDTH_LIMIT);
}

/** Roll20 字級範圍：**不**對調（最小大於最大時大字反而變小） */
export function resolveRoll20Range(minRaw: string, maxRaw: string): { min: number; max: number } {
  return {
    min: parseIntField(minRaw, ROLL20_DEFAULT.min, ROLL20_LIMIT),
    max: parseIntField(maxRaw, ROLL20_DEFAULT.max, ROLL20_LIMIT),
  };
}

/* ---------- 清單 ---------- */

/** 勾選的配色；全部未勾選時用清單的第一組（F12） */
export function activePalettes(
  items: readonly { a: string; b: string; enabled: boolean }[],
): Palette[] {
  const on = items.filter((i) => i.enabled);
  const list = on.length ? on : items.slice(0, 1);
  return list.length ? list.map((i) => ({ bg: i.a, fg: i.b })) : [FALLBACK_PALETTE];
}

/** 勾選的字型；全部未勾選時一律用系統的無襯線字型（F15） */
export function activeFonts(
  items: readonly { font: { family: string; weight: number }; enabled: boolean }[],
): PieceFont[] {
  const on = items.filter((i) => i.enabled);
  return on.length
    ? on.map((i) => ({ family: i.font.family, weight: i.font.weight }))
    : [SYSTEM_SANS];
}

/** 排版用的文字：換行統一成 \n；空字串時改用提示文字（只有空白字元時照常排版） */
export function layoutText(text: string, emptyText: string): string {
  const t = String(text ?? '').replace(/\r\n?/g, '\n');
  return t === '' ? emptyText : t;
}

/* ---------- 排版 ---------- */

/** 行距：最大字級 × 1.3 取整數部分（無條件捨去；b＝70 時 91、b＝45 時 58） */
export const lineHeightOf = (b: number): number => Math.floor(b * LINE_RATIO);
/** 第 1 行中線：上留白 ＋ 最大字級的一半 */
export const firstMidOf = (b: number): number => MARGIN + b / 2;
/** 圖片高：第 1 行中線 ＋ 行數 × 行距 */
export const imageHeightOf = (b: number, lines: number): number =>
  firstMidOf(b) + lines * lineHeightOf(b);

function makePiece(
  ch: string,
  input: LayoutInput,
  rng: Random,
  measure: MeasureFn,
): Omit<Piece, 'x' | 'y'> {
  const font = rng.pick(input.fonts);
  const size = rng.int(input.a, input.b);
  const palette = rng.pick(input.palettes);
  const rotate = rng.int(-ROTATE_MAX, ROTATE_MAX);
  const measured = measure(ch, font, size);
  const textWidth =
    Number.isFinite(measured) && measured > 0 ? measured : size * FALLBACK_WIDTH_RATIO;
  const width = textWidth + rng.int(PAD_X.min, PAD_X.max);
  const height = size + rng.int(PAD_Y.min, PAD_Y.max);
  const insets = Array.from({ length: 8 }, () => rng.range(0, INSET_MAX)) as unknown as Insets;
  const radii = [0, 0, 0, 0].map(() => rng.int(ROLL20_RADIUS.min, ROLL20_RADIUS.max)) as [
    number,
    number,
    number,
    number,
  ];
  const gap = rng.int(GAP.min, GAP.max);
  return {
    kind: 'piece',
    ch,
    font,
    size,
    bg: palette.bg,
    fg: palette.fg,
    rotate,
    textWidth,
    width,
    height,
    insets,
    radii,
    gap,
  };
}

type RawItem = { item: Omit<Piece, 'x' | 'y'> | Omit<Space, 'x'>; rel: number };

/** 一個項目在行上佔的寬度（紙片含之後的間隔） */
const advanceOf = (it: RawItem['item']) => (it.kind === 'piece' ? it.width + it.gap : it.width);

/**
 * 產生一份拼貼排版。每次產生都要給新的亂數（新的種子）；同一個種子、同樣的量法得到同樣的排版。
 */
export function layoutCollage(input: LayoutInput, rng: Random, measure: MeasureFn): CollageLayout {
  const { a, b } = input;
  const text = layoutText(input.text, input.emptyText);
  const fonts = input.fonts.length ? input.fonts : [SYSTEM_SANS];
  const palettes = input.palettes.length ? input.palettes : [FALLBACK_PALETTE];
  const src: LayoutInput = { ...input, fonts, palettes };
  const avail = input.autoWidth ? Number.POSITIVE_INFINITY : input.width - 2 * MARGIN;
  const spaceWidth = b * SPACE_RATIO;

  const rows: { items: RawItem[]; width: number }[] = [];
  for (const manual of text.split('\n')) {
    let row = { items: [] as RawItem[], width: 0 };
    rows.push(row);
    for (const ch of splitGraphemes(manual)) {
      const item: RawItem['item'] =
        ch === ' ' ? { kind: 'space', width: spaceWidth } : makePiece(ch, src, rng, measure);
      /*
       * 逐字換行（F28、主控裁定 7.1）：目前行寬＋這張紙片（或空白）的寬超過可用寬度、且這一行已經有東西時換到下一行。
       * 判斷時不算這張紙片之後的間隔；累加行寬時仍加上間隔。
       */
      if (row.items.length > 0 && row.width + item.width > avail) {
        row = { items: [], width: 0 };
        rows.push(row);
      }
      row.items.push({ item, rel: row.width });
      row.width += advanceOf(item);
    }
  }

  const lineHeight = lineHeightOf(b);
  const firstMid = firstMidOf(b);
  const height = firstMid + rows.length * lineHeight;
  const maxRow = rows.reduce((m, r) => Math.max(m, r.width), 0);
  const width = input.autoWidth ? Math.ceil(maxRow + 2 * MARGIN) : input.width;

  let pieceCount = 0;
  const lines: Line[] = rows.map((row, k) => {
    const mid = firstMid + k * lineHeight;
    let left = MARGIN;
    if (input.align === 'center') left = (width - row.width) / 2;
    else if (input.align === 'right') left = width - MARGIN - row.width;
    left = Math.max(MARGIN, left);
    const items: LayoutItem[] = row.items.map(({ item, rel }) => {
      if (item.kind === 'space') return { ...item, x: left + rel };
      pieceCount++;
      return { ...item, x: left + rel + item.width / 2, y: mid };
    });
    return { mid, left, width: row.width, items };
  });

  const canvasWidth = Math.max(1, Math.min(MAX_CANVAS_SIDE, width));
  const maxHeight = Math.min(MAX_CANVAS_SIDE, Math.floor(MAX_CANVAS_PIXELS / canvasWidth));
  const canvasHeight = Math.max(1, Math.min(maxHeight, Math.floor(height)));
  return {
    a,
    b,
    align: input.align,
    autoWidth: input.autoWidth,
    width,
    height,
    canvasWidth,
    canvasHeight,
    clipped: canvasWidth < width || canvasHeight < Math.floor(height),
    lineHeight,
    firstMid,
    lines,
    text,
    pieceCount,
  };
}

/** 紙片四個角相對於中心的座標（左上、右上、右下、左下） */
export function pieceCorners(p: Pick<Piece, 'width' | 'height' | 'insets'>): [number, number][] {
  const hw = p.width / 2;
  const hh = p.height / 2;
  const [tlx, tly, trx, tr_y, brx, bry, blx, bly] = p.insets;
  return [
    [-hw + tlx * hw, -hh + tly * hh],
    [hw - trx * hw, -hh + tr_y * hh],
    [hw - brx * hw, hh - bry * hh],
    [-hw + blx * hw, hh - bly * hh],
  ];
}

/* ---------- HTML（3.7） ---------- */

/** HTML 的容器底色 */
export const HTML_BACKGROUND = '#2a2a2a';
/** HTML 的字級＝紙片字級 × 0.55 取整數部分（無條件捨去：49 → 26） */
export const HTML_SIZE_RATIO = 0.55;

/** CSS 字型名稱：去掉會弄壞樣式或 HTML 屬性的字元 */
export function cleanFamily(family: string): string {
  return family
    .replace(/["'\\<>;{}()[\]&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** HTML 內層的字級（px） */
export const htmlFontSize = (size: number): number => Math.floor(size * HTML_SIZE_RATIO);

const pct = (v: number) => `${v.toFixed(1)}%`;

/** 與畫布相同的四角內縮，換成以紙片框為 100% 的多邊形（一位小數） */
export function clipPolygon(insets: Insets): string {
  const [tlx, tly, trx, tr_y, brx, bry, blx, bly] = insets.map((v) => v * 50);
  return [
    `${pct(tlx)} ${pct(tly)}`,
    `${pct(100 - trx)} ${pct(tr_y)}`,
    `${pct(100 - brx)} ${pct(100 - bry)}`,
    `${pct(blx)} ${pct(100 - bly)}`,
  ].join(', ');
}

function htmlFontFamily(font: PieceFont): string {
  if (font.generic) return 'sans-serif';
  const name = cleanFamily(font.family);
  return name ? `'${name}', sans-serif` : 'sans-serif';
}

export function pieceHtml(p: Piece): string {
  const outer = [
    'display: inline-block',
    `transform: rotate(${p.rotate}deg)`,
    'filter: drop-shadow(2px 3px 2px rgba(0, 0, 0, 0.5))',
    'margin: 2px 4px',
  ].join('; ');
  const inner = [
    'display: inline-block',
    `font-family: ${htmlFontFamily(p.font)}`,
    `font-size: ${htmlFontSize(p.size)}px`,
    `background: ${p.bg}`,
    `color: ${p.fg}`,
    `clip-path: polygon(${clipPolygon(p.insets)})`,
    'padding: 6px 12px',
    'font-weight: 900',
    'text-shadow: none',
    'line-height: 1',
  ].join('; ');
  return `<span style="${outer};"><span style="${inner};">${escapeHtml(p.ch)}</span></span>`;
}

/**
 * 給「可以貼 HTML 的網站」的文字（F34）。對齊方式取複製當下的值（不是產生時的值）。
 * 每個半形空白輸出兩個不換行空白；每一行（含空行、最後一行）結束輸出換行標籤＋換行字元。
 */
export function toHtml(layout: Pick<CollageLayout, 'lines'>, align: Align): string {
  const container = [
    `text-align: ${align}`,
    'line-height: 2.5',
    'padding: 20px',
    `background: ${HTML_BACKGROUND}`,
    'border-radius: 10px',
  ].join('; ');
  let out = `<div style="${container};">\n`;
  for (const line of layout.lines) {
    for (const it of line.items) out += it.kind === 'space' ? '&nbsp;&nbsp;' : pieceHtml(it);
    out += '<br>\n';
  }
  return `${out}\n</div>`;
}

/* ---------- Roll20 格式文字（3.8） ---------- */

/** Roll20 連結語法裡會弄壞結構的半形字元 → 全形（主控裁定：跳脫） */
const ROLL20_ESCAPES: Record<string, string> = {
  '[': '［',
  ']': '］',
  '(': '（',
  ')': '）',
  '"': '＂',
};

export function roll20Text(ch: string): string {
  return ch.replace(/[[\]()"]/g, (c) => ROLL20_ESCAPES[c]);
}

/** 紙片字級在字級範圍中的位置，等比對應到 Roll20 的範圍（取整數部分；a＝b 時一律最小） */
export function roll20Size(size: number, a: number, b: number, min: number, max: number): number {
  if (a === b) return min;
  return Math.trunc(min + ((size - a) / (b - a)) * (max - min));
}

export interface Roll20Options {
  /** 改用基本字型（每次複製每個字都從 Batang／Dotum／Gungsuh 隨機挑） */
  basic: boolean;
  min: number;
  max: number;
}

function roll20Family(font: PieceFont, basic: boolean, rng: Random): string {
  if (basic) return `${rng.pick(ROLL20_BASIC_FONTS)}, sans-serif`;
  if (font.generic) return 'sans-serif';
  const name = cleanFamily(font.family);
  return name ? `${name}, sans-serif` : 'sans-serif';
}

export function pieceRoll20(
  p: Piece,
  range: Pick<CollageLayout, 'a' | 'b'>,
  options: Roll20Options,
  rng: Random,
): string {
  const style = [
    'text-decoration: none',
    'display: inline-block',
    `font-family: ${roll20Family(p.font, options.basic, rng)}`,
    `font-size: ${roll20Size(p.size, range.a, range.b, options.min, options.max)}px`,
    'line-height: 1.2',
    `background-color: ${p.bg}`,
    `color: ${p.fg}`,
    'padding: 5px',
    `border-radius: ${p.radii.map((r) => `${r}px`).join(' ')}`,
    'margin: 2px',
    'font-weight: bold',
    'box-shadow: 2px 3px 5px #333333',
  ].join('; ');
  return `[${roll20Text(p.ch)}](#" style="${style};")`;
}

/**
 * Roll20 聊天的格式化文字（F35）：每個字一段「[字](#" style="…")」，沒有旋轉與裁切（Roll20 不支援）；
 * 每個半形空白輸出兩個半形空白；每一行（含最後一行）結束輸出換行字元。
 */
export function toRoll20(
  layout: Pick<CollageLayout, 'lines' | 'a' | 'b'>,
  options: Roll20Options,
  rng: Random,
): string {
  let out = '';
  for (const line of layout.lines) {
    for (const it of line.items)
      out += it.kind === 'space' ? '  ' : pieceRoll20(it, layout, options, rng);
    out += '\n';
  }
  return out;
}

/* ---------- 其他 ---------- */

/** 下載檔名：固定前綴＋毫秒時間戳（例：calling_card_1790873129562.png） */
export function exportFileName(ext: 'png' | 'jpg', now: number = Date.now()): string {
  return `${FILE_PREFIX}${Math.trunc(now)}.${ext}`;
}

/** 紙張斑點的數量（約 寬 × 高 ÷ 150） */
export const speckCount = (width: number, height: number): number =>
  Math.round((width * height) / SPECK_AREA_PER_DOT);

/** 種子範圍 0～2³¹−1 */
export const MAX_SEED = 0x7fffffff;

export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1));
}

/** 網址參數 ?seed=<整數>（只給測試用，介面上沒有入口）；不合法時 null */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n <= MAX_SEED ? n : null;
}
