/**
 * 排行榜產生器的資料與規則（純函式，Node 可測；規格 docs/refactor/specs/rank-chart.md）：
 * - 設定（主題文字、排名者照片與卡片擺放、角色名單、規則、外觀）與整理（normalizeConfig）；
 * - 盲選排行的遊戲：開始時把整個名單洗牌、取前 K 位當出場順序；一次揭曉一位、放進一個空的名次後就不能再改；
 * - 標題的組法、出場順序、沒出場的角色。
 */

/* ---------- 範圍與預設 ---------- */

export const MAX_POOL = 120;
export const MAX_RANKS = 20;
export const CANVAS_W = 1080;
export const CARD_SIZE_MIN = 0.2;
export const CARD_SIZE_MAX = 0.9;
export const CARD_SIZE_DEFAULT = 0.58;
/** 文字欄的上限（字元數，emoji 算一個字） */
export const LIMITS = { name: 30, intro: 40, subject: 80, question: 100, character: 50 } as const;
export const SPIN_CHOICES = [1000, 1800, 2800, 4000] as const;
export type SpinMs = (typeof SPIN_CHOICES)[number];
/** 確定之後自動抽下一位的等待時間 */
export const AUTO_NEXT_MS = 800;
/** 照片原圖的長邊上限（放進角色、排名者照片時縮小） */
export const PHOTO_MAX_SIDE = 1500;
export const PORTRAIT_MAX_SIDE = 1800;
/** 角色照片裁切後的大小 */
export const THUMB_SIZE = 512;
/** 照片檔的上限 */
export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const PHOTO_MAX_PIXELS = 64_000_000;
/** 匯出圖片的像素上限 */
export const EXPORT_MAX_PIXELS = 65_000_000;

export type FormatId = '4:5' | '9:16' | '1:1';
export const FORMAT_IDS: readonly FormatId[] = ['4:5', '9:16', '1:1'];
export const FORMAT_HEIGHT: Record<FormatId, number> = { '4:5': 1350, '9:16': 1920, '1:1': 1080 };

export const THEME_KEYS = [
  'bg',
  'paper',
  'ink',
  'muted',
  'line',
  'accent',
  'accentSoft',
  'soft',
  'photo',
  'tag',
  'tagInk',
] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeColors = Record<ThemeKey, string>;
export type ThemeId = 'cream' | 'lilac' | 'midnight' | 'custom';
export const THEME_IDS: readonly ThemeId[] = ['cream', 'lilac', 'midnight', 'custom'];

/** 三套內建配色（原作 MIT，沿用色值） */
export const THEMES: Record<Exclude<ThemeId, 'custom'>, ThemeColors> = {
  cream: {
    bg: '#fbf7ef',
    ink: '#32332e',
    muted: '#8a8d7e',
    line: '#e3e3d6',
    paper: '#ffffff',
    soft: '#eeefe5',
    accent: '#df5670',
    accentSoft: '#fbe8e9',
    photo: '#e4e8d5',
    tag: '#e6edc9',
    tagInk: '#667343',
  },
  lilac: {
    bg: '#f3effa',
    ink: '#373044',
    muted: '#9689a8',
    line: '#ddd5e9',
    paper: '#fffcff',
    soft: '#eae3f3',
    accent: '#8e63c0',
    accentSoft: '#e9dcf5',
    photo: '#ddd4ef',
    tag: '#e7d9f6',
    tagInk: '#765397',
  },
  midnight: {
    bg: '#1c252b',
    ink: '#f0f2e8',
    muted: '#90a099',
    line: '#3d4b4d',
    paper: '#29363c',
    soft: '#334247',
    accent: '#c4e98c',
    accentSoft: '#3e513e',
    photo: '#34464a',
    tag: '#3e513e',
    tagInk: '#c6e690',
  },
};

export interface Crop {
  /** 放大 1～4（1＝短邊剛好） */
  zoom: number;
  /** 左右、上下的位置 −1～1（相對於可移動的範圍；0＝置中） */
  x: number;
  y: number;
}

export interface PhotoRef {
  /** 資產 id（core/assets） */
  id: string;
  width: number;
  height: number;
}

export interface RankCharacter {
  id: string;
  name: string;
  /** 原圖（長邊最多 1500）；沒有照片時 null（畫成灰色的名字卡） */
  photo: PhotoRef | null;
  /** 裁切後的 512 × 512 正方形（資產 id） */
  thumb: string | null;
  crop: Crop;
}

export interface Portrait {
  photo: PhotoRef | null;
  fit: 'cover' | 'contain';
  /** 放大 1～3 */
  zoom: number;
  /** −1～1（相對於超出的部分） */
  x: number;
  y: number;
}

export interface Overlay {
  /** 卡片的橫向、縱向位置 0～1（有排名者照片時才用） */
  x: number;
  y: number;
  /** 卡片大小（右欄寬度的比例 0.2～0.9） */
  size: number;
}

export interface Config {
  name: string;
  intro: string;
  subject: string;
  question: string;
  slots: number;
  spinMs: SpinMs;
  confirmRank: boolean;
  autoNext: boolean;
  reducedMotion: boolean;
  format: FormatId;
  theme: ThemeId;
  customTheme: ThemeColors;
  portrait: Portrait;
  overlay: Overlay;
  characters: RankCharacter[];
}

export const DEFAULT_OVERLAY: Overlay = { x: 0.5, y: 0.06, size: CARD_SIZE_DEFAULT };
export const DEFAULT_CROP: Crop = { zoom: 1, x: 0, y: 0 };
export const emptyPortrait = (): Portrait => ({ photo: null, fit: 'cover', zoom: 1, x: 0, y: 0 });

/** 範例名單（自己挑的台灣常見名字，10 位） */
export const DEMO_NAMES = [
  '承恩',
  '語晴',
  '宥廷',
  '子芸',
  '品睿',
  '詠晴',
  '柏宇',
  '芯妤',
  '睿哲',
  '心悅',
] as const;

/* ---------- 小工具 ---------- */

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** 數字就夾在範圍內，不是數字時用 def */
export const finite = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? clamp(n, min, max) : def;
};

/** 以字元（code point）計的長度與截斷 */
export const chars = (s: string): string[] => Array.from(s);
export const charLength = (s: string): number => chars(s).length;
export const limitChars = (s: string, max: number): string => chars(s).slice(0, max).join('');

/** 存檔裡的文字：去頭尾空白、截到 max 字；不是字串時用 def */
export const trimText = (v: unknown, max: number, def = ''): string =>
  typeof v === 'string' ? limitChars(v.trim(), max) : def;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

const HEX6 = /^#[0-9a-f]{6}$/i;

/** 32 位元的亂數來源（預設 crypto.getRandomValues；測試可以換掉） */
export type Rng = () => number;
export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
};

/** 0～n−1 的均勻亂數（拒絕取樣，沒有偏差） */
export function randomInt(n: number, rng: Rng = cryptoRng): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('randomInt');
  const max = 0x100000000;
  const limit = max - (max % n);
  let v: number;
  do v = rng() >>> 0;
  while (v >= limit);
  return v % n;
}

/** Fisher–Yates 洗牌（從最後一張往前換） */
export function shuffled<T>(values: readonly T[], rng: Rng = cryptoRng): T[] {
  const a = values.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 新角色的 id */
export function newCharacterId(rng: Rng = cryptoRng): string {
  return `c_${(rng() >>> 0).toString(36)}_${(rng() >>> 0).toString(36)}`;
}

export function createCharacter(name: string, id = newCharacterId()): RankCharacter {
  return { id, name, photo: null, thumb: null, crop: { ...DEFAULT_CROP } };
}

export const demoCharacters = (): RankCharacter[] => DEMO_NAMES.map((n) => createCharacter(n));

/** 第一次開啟的設定 */
export function defaultConfig(reducedMotion = false): Config {
  return {
    name: '小明',
    intro: '的盲選排行',
    subject: '○○○○ 登場角色',
    question: '能交往嗎？',
    slots: 6,
    spinMs: 1800,
    confirmRank: true,
    autoNext: false,
    reducedMotion,
    format: '4:5',
    theme: 'cream',
    customTheme: { ...THEMES.cream },
    portrait: emptyPortrait(),
    overlay: { ...DEFAULT_OVERLAY },
    characters: demoCharacters(),
  };
}

/** 目前的配色 */
export const themeColors = (c: Pick<Config, 'theme' | 'customTheme'>): ThemeColors =>
  c.theme === 'custom' ? c.customTheme : THEMES[c.theme];

export const canvasHeight = (c: Pick<Config, 'format'>): number => FORMAT_HEIGHT[c.format];

/* ---------- 標題 ---------- */

const ASCII_WORD = /[A-Za-z0-9]/;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * 接兩段文字：英數字接英數字、英數字接中日韓文字時中間加一個半形空白（例「Kim 的盲選排行」「Kim presents」），
 * 中文接中文、或接標點時直接相連（「小明的盲選排行」）。後一段以空白開頭時一律隔一個空白（使用者自己決定）。
 */
export function joinWords(a: string, b: string): string {
  if (!a) return b.trim();
  if (!b.trim()) return a;
  if (/^\s/.test(b)) return `${a} ${b.trim()}`;
  const l = chars(a).at(-1) ?? '';
  const r = chars(b)[0] ?? '';
  const lw = ASCII_WORD.test(l);
  const rw = ASCII_WORD.test(r);
  const space = (lw && rw) || (lw && CJK.test(r)) || (rw && CJK.test(l));
  return space ? `${a} ${b}` : `${a}${b}`;
}

export interface TitleParts {
  first: string;
  second: string;
  third: string;
}

/** 圖上的三行標題：排名者＋連接文字、主題、最後的問題（空白時省略第三行） */
export function titleParts(c: Pick<Config, 'name' | 'intro' | 'subject' | 'question'>): TitleParts {
  const name = c.name.trim() || '我';
  const subject = c.subject.trim() || '角色';
  return { first: joinWords(name, c.intro), second: subject, third: c.question.trim() };
}

/* ---------- 整理存檔 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function normalizePhoto(v: unknown): PhotoRef | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const width = Math.round(finite(v.width, 0, 0, 100000));
  const height = Math.round(finite(v.height, 0, 0, 100000));
  if (width < 1 || height < 1) return null;
  return { id: v.id, width, height };
}

export function normalizeCrop(v: unknown): Crop {
  const o = isObj(v) ? v : {};
  return { zoom: finite(o.zoom, 1, 1, 4), x: finite(o.x, 0, -1, 1), y: finite(o.y, 0, -1, 1) };
}

function normalizeCharacter(v: unknown, used: Set<string>): RankCharacter | null {
  if (!isObj(v)) return null;
  let id = typeof v.id === 'string' && ID_RE.test(v.id) ? v.id : newCharacterId();
  while (used.has(id)) id = newCharacterId();
  used.add(id);
  const photo = normalizePhoto(v.photo);
  const thumb = photo && typeof v.thumb === 'string' && v.thumb ? v.thumb : null;
  return {
    id,
    name: trimText(v.name, LIMITS.character),
    photo,
    thumb,
    crop: normalizeCrop(v.crop),
  };
}

function normalizeTheme(v: unknown): ThemeColors {
  const o = isObj(v) ? v : {};
  const out = { ...THEMES.cream };
  for (const k of THEME_KEYS) {
    const c = o[k];
    if (typeof c === 'string' && HEX6.test(c)) out[k] = c.toLowerCase();
  }
  return out;
}

/**
 * 整理設定（自動儲存、專案檔讀入時）：文字截到上限（不去掉頭尾空白，打字中的空白保留）、數值夾範圍、
 * 選項不認得時用預設、角色 id 重複時重編、照片缺尺寸時當作沒有照片。
 */
export function normalizeConfig(v: unknown, reducedMotion = false): Config {
  const d = defaultConfig(reducedMotion);
  if (!isObj(v)) return d;
  const text = (k: 'name' | 'intro' | 'subject' | 'question') =>
    typeof v[k] === 'string' ? limitChars(v[k] as string, LIMITS[k]) : d[k];
  const bool = (k: 'confirmRank' | 'autoNext' | 'reducedMotion') =>
    typeof v[k] === 'boolean' ? (v[k] as boolean) : d[k];
  const portrait = isObj(v.portrait) ? v.portrait : {};
  const overlay = isObj(v.overlay) ? v.overlay : {};
  const used = new Set<string>();
  const characters = Array.isArray(v.characters)
    ? v.characters
        .slice(0, MAX_POOL)
        .map((c) => normalizeCharacter(c, used))
        .filter((c): c is RankCharacter => !!c)
    : d.characters;
  return {
    name: text('name'),
    intro: text('intro'),
    subject: text('subject'),
    question: text('question'),
    slots: Math.round(finite(v.slots, d.slots, 1, MAX_RANKS)),
    spinMs: (SPIN_CHOICES as readonly number[]).includes(v.spinMs as number)
      ? (v.spinMs as SpinMs)
      : d.spinMs,
    confirmRank: bool('confirmRank'),
    autoNext: bool('autoNext'),
    reducedMotion: bool('reducedMotion'),
    format: FORMAT_IDS.includes(v.format as FormatId) ? (v.format as FormatId) : d.format,
    theme: THEME_IDS.includes(v.theme as ThemeId) ? (v.theme as ThemeId) : d.theme,
    customTheme: normalizeTheme(v.customTheme),
    portrait: {
      photo: normalizePhoto(portrait.photo),
      fit: portrait.fit === 'contain' ? 'contain' : 'cover',
      zoom: finite(portrait.zoom, 1, 1, 3),
      x: finite(portrait.x, 0, -1, 1),
      y: finite(portrait.y, 0, -1, 1),
    },
    overlay: {
      x: finite(overlay.x, DEFAULT_OVERLAY.x, 0, 1),
      y: finite(overlay.y, DEFAULT_OVERLAY.y, 0, 1),
      size: finite(overlay.size, CARD_SIZE_DEFAULT, CARD_SIZE_MIN, CARD_SIZE_MAX),
    },
    characters,
  };
}

/** 設定用到的圖片（自動儲存、專案檔、清掉沒用到的圖） */
export function configAssetIds(c: Config): string[] {
  const out = new Set<string>();
  if (c.portrait.photo) out.add(c.portrait.photo.id);
  for (const ch of c.characters) {
    if (ch.photo) out.add(ch.photo.id);
    if (ch.thumb) out.add(ch.thumb);
  }
  return [...out];
}

/* ---------- 名單的小規則 ---------- */

/** 「一次輸入名稱」：一行一位，去頭尾空白、截到 50 字、略過空行 */
export const parseNames = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((s) => trimText(s, LIMITS.character))
    .filter(Boolean);

/** 檔名當角色名稱：去掉副檔名、去頭尾空白、截到 50 字（空白時 fallback） */
export const nameFromFile = (fileName: string, fallback: string): string =>
  trimText(fileName.replace(/\.[^.]+$/, ''), LIMITS.character) || fallback;

/** 開始前的檢查；有問題時回傳原因與要切到的分頁 */
export type StartProblem =
  | { kind: 'name'; tab: 'topic' }
  | { kind: 'subject'; tab: 'topic' }
  | { kind: 'empty'; tab: 'pool' }
  | { kind: 'unnamed'; tab: 'pool'; id: string }
  | { kind: 'slots'; tab: 'rules' };

export function startProblem(c: Config): StartProblem | null {
  if (!c.name.trim()) return { kind: 'name', tab: 'topic' };
  if (!c.subject.trim()) return { kind: 'subject', tab: 'topic' };
  if (!c.characters.length) return { kind: 'empty', tab: 'pool' };
  const unnamed = c.characters.find((ch) => !ch.name.trim());
  if (unnamed) return { kind: 'unnamed', tab: 'pool', id: unnamed.id };
  if (c.slots > c.characters.length) return { kind: 'slots', tab: 'rules' };
  return null;
}

/* ---------- 遊戲 ---------- */

export type Phase = 'between' | 'spinning' | 'revealed' | 'complete';

export interface RankEntry {
  id: string;
  /** 第幾個出場（1 起） */
  drawIndex: number;
}

export interface Run {
  /** 出場順序（開始時就決定好，K 位） */
  deck: string[];
  /** 每個名次放的角色（null＝還空著） */
  ranks: (RankEntry | null)[];
  /** 已經確定了幾位（＝目前揭曉的是 deck[turn]） */
  turn: number;
  phase: Phase;
  /** 選了但還沒確定的名次（0 起） */
  pending: number | null;
  startedAt: string;
  finishedAt: string | null;
  /** 最後確定的角色 */
  lastId: string | null;
}

/** 開始：整個名單洗牌、取前 K 位（同一位不會出場兩次） */
export function startRun(c: Config, rng: Rng = cryptoRng, now = new Date()): Run {
  const deck = shuffled(
    c.characters.map((ch) => ch.id),
    rng,
  ).slice(0, c.slots);
  return {
    deck,
    ranks: Array.from({ length: deck.length }, () => null),
    turn: 0,
    phase: 'between',
    pending: null,
    startedAt: now.toISOString(),
    finishedAt: null,
    lastId: null,
  };
}

export const filledCount = (run: Run | null): number =>
  run ? run.ranks.filter(Boolean).length : 0;

/** 抽選動畫裡輪流出現的角色：名單裡還沒放進名次的所有角色（包括不會出場的） */
export function spinPool(c: Config, run: Run): RankCharacter[] {
  const assigned = new Set(run.ranks.filter((r): r is RankEntry => !!r).map((r) => r.id));
  return c.characters.filter((ch) => !assigned.has(ch.id));
}

/** 抽選動畫下一次換圖的間隔（毫秒；t＝經過的比例 0～1，越後面越慢） */
export const spinInterval = (t: number): number => 70 + 160 * t * t;

/** 從 between 開始抽下一位（還有下一位時） */
export function beginSpin(run: Run): Run | null {
  if (run.phase !== 'between' || run.turn >= run.deck.length) return null;
  return { ...run, phase: 'spinning', pending: null };
}

export const revealSpin = (run: Run): Run =>
  run.phase === 'spinning' ? { ...run, phase: 'revealed' } : run;

export type ChooseResult =
  | { kind: 'ignored' }
  | { kind: 'filled' }
  | { kind: 'pending'; run: Run }
  | { kind: 'commit'; run: Run };

/** 選名次：已經有人的名次不能選；要再確認時先標成「待確定」，不然直接確定 */
export function chooseRank(
  run: Run,
  index: number,
  confirm: boolean,
  now = new Date(),
): ChooseResult {
  if (run.phase !== 'revealed') return { kind: 'ignored' };
  if (!Number.isInteger(index) || index < 0 || index >= run.ranks.length)
    return { kind: 'ignored' };
  if (run.ranks[index]) return { kind: 'filled' };
  const next = { ...run, pending: index };
  if (confirm) return { kind: 'pending', run: next };
  const done = commitRank(next, now);
  return done ? { kind: 'commit', run: done } : { kind: 'ignored' };
}

/** 確定：唯一會寫進名次的地方；已經有人的名次不會被改 */
export function commitRank(run: Run, now = new Date()): Run | null {
  if (run.phase !== 'revealed' || run.pending === null) return null;
  const index = run.pending;
  if (run.ranks[index]) return null;
  const id = run.deck[run.turn];
  const ranks = run.ranks.slice();
  ranks[index] = { id, drawIndex: run.turn + 1 };
  const turn = run.turn + 1;
  const complete = turn === run.deck.length;
  return {
    ...run,
    ranks,
    turn,
    lastId: id,
    pending: null,
    phase: complete ? 'complete' : 'between',
    finishedAt: complete ? now.toISOString() : run.finishedAt,
  };
}

export class RunError extends Error {}

/**
 * 整理存下來的遊戲（重新整理後接著玩）：出場順序、名次、進度要互相吻合，否則丟出 RunError。
 * 抽選中重新整理時直接揭曉（出場順序開始時就決定好了，不能重抽）。
 */
export function sanitizeRun(raw: unknown, c: Config): Run | null {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) throw new RunError('run');
  const valid = new Set(c.characters.map((ch) => ch.id));
  const k = c.slots;
  const deck = raw.deck;
  if (
    !Array.isArray(deck) ||
    deck.length !== k ||
    new Set(deck).size !== k ||
    deck.some((id) => typeof id !== 'string' || !valid.has(id))
  )
    throw new RunError('deck');
  const turn = raw.turn;
  if (
    !Array.isArray(raw.ranks) ||
    raw.ranks.length !== k ||
    typeof turn !== 'number' ||
    !Number.isInteger(turn) ||
    turn < 0 ||
    turn > k
  )
    throw new RunError('ranks');
  const ranked = new Set<string>();
  const ranks = raw.ranks.map((e): RankEntry | null => {
    if (e === null) return null;
    if (
      !isObj(e) ||
      typeof e.drawIndex !== 'number' ||
      !Number.isInteger(e.drawIndex) ||
      e.drawIndex < 1 ||
      e.drawIndex > turn ||
      deck[e.drawIndex - 1] !== e.id ||
      ranked.has(e.id as string)
    )
      throw new RunError('entry');
    ranked.add(e.id as string);
    return { id: e.id as string, drawIndex: e.drawIndex };
  });
  if (ranked.size !== turn || deck.slice(0, turn).some((id) => !ranked.has(id)))
    throw new RunError('progress');
  const phase: Phase =
    turn === k ? 'complete' : raw.phase === 'spinning' ? 'revealed' : (raw.phase as Phase);
  if (!['complete', 'revealed', 'between'].includes(phase)) throw new RunError('phase');
  const p = raw.pending;
  const pending =
    phase === 'revealed' &&
    typeof p === 'number' &&
    Number.isInteger(p) &&
    p >= 0 &&
    p < k &&
    !ranks[p]
      ? p
      : null;
  return {
    deck: deck.slice() as string[],
    ranks,
    turn,
    phase,
    pending,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
    lastId: turn > 0 ? (deck[turn - 1] as string) : null,
  };
}

export const characterById = (c: Config, id: string | null | undefined): RankCharacter | null =>
  (id && c.characters.find((ch) => ch.id === id)) || null;

/** 已經出場的角色（依出場順序；抽選中的候選與還沒出場的不算） */
export function appearanceOrder(c: Config, run: Run | null): RankCharacter[] {
  if (!run) return [];
  const n = run.turn + (run.phase === 'revealed' ? 1 : 0);
  return run.deck
    .slice(0, n)
    .map((id) => characterById(c, id))
    .filter((ch): ch is RankCharacter => !!ch);
}

/** 完成後：這次沒有出場的角色（名單的順序） */
export function missingCharacters(c: Config, run: Run | null): RankCharacter[] {
  if (run?.phase !== 'complete') return [];
  const appeared = new Set(run.deck);
  return c.characters.filter((ch) => !appeared.has(ch.id));
}

/** 卡片上顯示的角色 id：抽選中＝輪流的候選、揭曉＝這一位、完成＝第 1 名、之間＝剛確定的那位 */
export function displayCharId(run: Run | null, spinId: string | null): string | null {
  if (!run) return null;
  if (run.phase === 'spinning') return spinId;
  if (run.phase === 'revealed') return run.deck[run.turn] ?? null;
  if (run.phase === 'complete') return run.ranks[0]?.id ?? null;
  return run.lastId;
}

/* ---------- 照片的幾何 ---------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 正方形裁切（原作的放大＋位置）→ 原圖上的範圍：邊長＝短邊 ÷ 放大；
 * 位置 −1 靠右（下）、+1 靠左（上）（拖曳往右＝照片往右、看到左邊）。
 */
export function cropRect(img: { width: number; height: number }, crop: Crop): Rect {
  const side = Math.min(img.width, img.height) / clamp(crop.zoom, 1, 4);
  return {
    x: ((1 - clamp(crop.x, -1, 1)) / 2) * (img.width - side),
    y: ((1 - clamp(crop.y, -1, 1)) / 2) * (img.height - side),
    width: side,
    height: side,
  };
}

/** 原圖上的正方形範圍 → 放大＋位置（cropRect 的反函式；範圍不是正方形時取較短的邊） */
export function rectToCrop(img: { width: number; height: number }, r: Rect): Crop {
  const short = Math.min(img.width, img.height);
  const side = clamp(Math.min(r.width, r.height), short / 4, short);
  const zoom = clamp(short / side, 1, 4);
  const pos = (start: number, extent: number) => {
    const room = extent - side;
    return room > 1e-6 ? clamp(1 - (2 * start) / room, -1, 1) : 0;
  };
  return { zoom, x: pos(r.x, img.width), y: pos(r.y, img.height) };
}

/** 排名者照片在右欄裡的位置與大小（填滿或完整顯示 × 放大；位置相對於超出的部分） */
export function portraitRect(
  panel: Rect,
  img: { width: number; height: number },
  p: Pick<Portrait, 'fit' | 'zoom' | 'x' | 'y'>,
): Rect {
  const pick = p.fit === 'contain' ? Math.min : Math.max;
  const base = pick(panel.width / img.width, panel.height / img.height) * p.zoom;
  const dw = img.width * base;
  const dh = img.height * base;
  const ox = Math.abs((dw - panel.width) / 2);
  const oy = Math.abs((dh - panel.height) / 2);
  return {
    x: panel.x + (panel.width - dw) / 2 + p.x * ox,
    y: panel.y + (panel.height - dh) / 2 + p.y * oy,
    width: dw,
    height: dh,
  };
}

/** 長邊縮到 max 以內的大小 */
export function fitLongSide(w: number, h: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/* ---------- 檔名 ---------- */

/** 檔名的一段：拿掉不能用的字元換成「_」、去頭尾空白、最多 55 字（空白時 fallback） */
export function fileNamePart(s: string, fallback = 'rank-chart'): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名不能有控制字元
  const out = limitChars(s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim(), 55);
  return out || fallback;
}
