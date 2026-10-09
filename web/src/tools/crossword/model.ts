/**
 * 資料模型（規格 3.8）：設定、盤面、預設值與讀回時的整理。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import type { PlacedWord, Puzzle } from './generate';

export const TOOL_ID = 'crossword';
/** 自動儲存與專案檔的資料版本 */
export const DATA_VERSION = 1;

/** 答案的來源：從文字擷取（原作）／自己列答案（新版） */
export type SourceMode = 'text' | 'list';
/** 版面：盤面在左、提示在右／盤面在上、提示在下 */
export type SheetLayout = 'row' | 'col';
/** 字型用在哪裡 */
export type FontRole = 'title' | 'grid' | 'clues';

export interface GenerationStats {
  /** 這次用的來源 */
  mode: SourceMode;
  /** 候選單字數（文字）或有效的答案數（清單） */
  found: number;
  /** 目標單字數（文字）或答案數（清單） */
  target: number;
  /** 排不進去的答案（清單） */
  unplaced: string[];
  /** 產生時的答案來源與設定（inputKey；之後改了就提醒重新產生） */
  key: string;
}

export interface CrosswordData {
  mode: SourceMode;
  /** 從文字擷取：文字來源（可以是 TXT、HTML、JSON、Markdown 的內容） */
  text: string;
  /** 最後讀進來的檔名（顯示用；空白＝沒有） */
  fileName: string;
  /** 自己列答案：一行一個「答案：提示」 */
  list: string;
  /** 單字數（目標）5～100 */
  wordCount: number;
  /** 出現次數的比重 0～100（%） */
  freqWeight: number;
  /** 句子長度的比重 0～100（%） */
  lenWeight: number;
  title: string;
  /** 空格（沒有字的格子）的顏色 */
  emptyColor: string;
  /** 空格透明（格子改成各自有框線） */
  emptyTransparent: boolean;
  fonts: Record<FontRole, FontValue>;
  layout: SheetLayout;
  puzzle: Puzzle | null;
  stats: GenerationStats | null;
}

export const WORD_COUNT = { min: 5, max: 100, def: 50 } as const;
export const WEIGHT = { min: 0, max: 100, def: 50 } as const;
export const DEFAULT_TITLE = '填字遊戲';
export const DEFAULT_EMPTY_COLOR = '#334155';
/** 自動儲存的文字上限（字）；更長的文字不存進瀏覽器（專案檔照樣有），免得佔滿整個網站共用的空間 */
export const AUTOSAVE_TEXT_LIMIT = 300_000;

export const FONT_ROLES: readonly FontRole[] = ['title', 'grid', 'clues'];

export function defaultFonts(): Record<FontRole, FontValue> {
  return { title: { ...DEFAULT_FONT }, grid: { ...DEFAULT_FONT }, clues: { ...DEFAULT_FONT } };
}

/* ---------- 讀回時的整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const num = (v: unknown, def: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
const HEX = /^#[0-9a-f]{6}$/i;

function cleanFont(v: unknown): FontValue {
  if (!isObj(v)) return { ...DEFAULT_FONT };
  const source = v.source === 'google' || v.source === 'local' || v.source === 'upload';
  const family = typeof v.family === 'string' && v.family.trim() ? v.family : null;
  if (!source || !family) return { ...DEFAULT_FONT };
  return {
    source: v.source as FontValue['source'],
    family,
    weight: num(v.weight, DEFAULT_FONT.weight, 100, 900),
  };
}

function cleanWord(v: unknown, width: number, height: number): PlacedWord | null {
  if (!isObj(v)) return null;
  const answer = typeof v.answer === 'string' ? v.answer : '';
  const len = Array.from(answer).length;
  const dir = v.dir === 'across' || v.dir === 'down' ? v.dir : null;
  const x = v.x;
  const y = v.y;
  const n = v.num;
  if (len < 1 || !dir || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
  if (dir === 'across' ? x + len > width || y >= height : y + len > height || x >= width)
    return null;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  return { answer, hint: str(v.hint, ''), x, y, dir, num: n };
}

/** 盤面：尺寸合理、每個詞都在盤面裡、交叉的格子字相同；不合理時當作沒有盤面 */
export function cleanPuzzle(v: unknown): Puzzle | null {
  if (!isObj(v) || !Array.isArray(v.words)) return null;
  const width = v.width;
  const height = v.height;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  if (width > 1000 || height > 1000) return null;
  const words: PlacedWord[] = [];
  for (const raw of v.words) {
    const w = cleanWord(raw, width, height);
    if (!w) return null;
    words.push(w);
  }
  if (!words.length) return null;
  const cells = new Map<string, string>();
  for (const w of words) {
    const cs = Array.from(w.answer);
    for (let i = 0; i < cs.length; i++) {
      const k = w.dir === 'across' ? `${w.x + i},${w.y}` : `${w.x},${w.y + i}`;
      const have = cells.get(k);
      if (have !== undefined && have !== cs[i]) return null;
      cells.set(k, cs[i]);
    }
  }
  return { width, height, words };
}

function cleanStats(v: unknown): GenerationStats | null {
  if (!isObj(v)) return null;
  const mode = v.mode === 'list' ? 'list' : v.mode === 'text' ? 'text' : null;
  if (!mode) return null;
  return {
    mode,
    found: num(v.found, 0, 0, 1e9),
    target: num(v.target, 0, 0, 1e9),
    unplaced: Array.isArray(v.unplaced)
      ? v.unplaced.filter((s): s is string => typeof s === 'string')
      : [],
    key: str(v.key, ''),
  };
}

/** 讀回（自動儲存、專案檔）：缺的、壞掉的欄位用預設值；不是物件時回傳 null */
export function sanitizeData(raw: unknown, base: CrosswordData): CrosswordData | null {
  if (!isObj(raw)) return null;
  const fonts = isObj(raw.fonts) ? raw.fonts : {};
  return {
    mode: raw.mode === 'list' ? 'list' : 'text',
    text: str(raw.text, base.text),
    fileName: str(raw.fileName, ''),
    list: str(raw.list, base.list),
    wordCount: num(raw.wordCount, WORD_COUNT.def, WORD_COUNT.min, WORD_COUNT.max),
    freqWeight: num(raw.freqWeight, WEIGHT.def, WEIGHT.min, WEIGHT.max),
    lenWeight: num(raw.lenWeight, WEIGHT.def, WEIGHT.min, WEIGHT.max),
    title: str(raw.title, base.title),
    emptyColor:
      typeof raw.emptyColor === 'string' && HEX.test(raw.emptyColor)
        ? raw.emptyColor.toLowerCase()
        : DEFAULT_EMPTY_COLOR,
    emptyTransparent: raw.emptyTransparent === true,
    fonts: {
      title: cleanFont(fonts.title),
      grid: cleanFont(fonts.grid),
      clues: cleanFont(fonts.clues),
    },
    layout: raw.layout === 'col' ? 'col' : 'row',
    puzzle: 'puzzle' in raw ? cleanPuzzle(raw.puzzle) : base.puzzle,
    stats: 'stats' in raw ? cleanStats(raw.stats) : base.stats,
  };
}

/** FNV-1a（32 位元）：比對答案來源有沒有改過用 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 影響盤面的輸入（來源與設定）的摘要 */
export function inputKey(
  d: Pick<CrosswordData, 'mode' | 'text' | 'list' | 'wordCount' | 'freqWeight' | 'lenWeight'>,
): string {
  return d.mode === 'list'
    ? `list:${hash(d.list)}`
    : `text:${hash(d.text)}:${d.wordCount}:${d.freqWeight}:${d.lenWeight}`;
}

/** 檔名用的標題（空白時「填字遊戲」） */
export const titleOrDefault = (title: string): string => title.trim() || DEFAULT_TITLE;
